import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { AGENTS_DIR, TASKS_DIR, WORKFLOWS_DIR, ensureAppDirs } from './config.js';
import { addTaskEvent, createRun, db, finishRun, getTask, listTasks, makeTaskId, updateTask, updateTaskStatus } from './db.js';
import { logLine } from './logger.js';
import { decideTransition } from './pm.js';
import { getConfig } from './app-config.js';
import type { EvalVerdict, Task, TaskPriority, TaskStatus } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function priorityRank(priority: TaskPriority): number {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[priority];
}

function dependenciesState(task: Task): { done: boolean; blocked: boolean } {
  const ids = JSON.parse(task.depends_on_json || '[]') as string[];
  if (!ids.length) return { done: true, blocked: false };
  let done = true;
  let blocked = false;
  for (const id of ids) {
    const dep = getTask(id);
    if (!dep || dep.status !== 'done') done = false;
    if (dep?.status === 'blocked') blocked = true;
  }
  return { done, blocked };
}

function toNeedsApprovalIfReady(task: Task): void {
  const decision = decideTransition({ task });
  if (decision.to_status !== task.status) {
    updateTaskStatus(task.id, decision.to_status);
    addTaskEvent(task.id, 'moved', {
      from_status: task.status,
      to_status: decision.to_status,
      reason: decision.reason,
      rules_hit: ['backlog->needs-approval']
    });
  }
}

function writeApprovalRequest(): string {
  const strategy = db().prepare('SELECT * FROM strategy_versions ORDER BY created_at DESC LIMIT 1').get() as
    | {
        id: number;
        summary_md: string;
      }
    | undefined;

  const tasks = db()
    .prepare(
      `SELECT id, title, acceptance_criteria_md, risk_level, status
       FROM tasks
       WHERE status IN ('needs-approval', 'backlog')
       ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, created_at DESC`
    )
    .all() as Array<{
    id: string;
    title: string;
    acceptance_criteria_md: string;
    risk_level: string;
    status: TaskStatus;
  }>;

  const lines: string[] = [];
  lines.push('# APPROVAL REQUEST');
  lines.push('');
  lines.push('## Strategy Summary');
  lines.push('');
  lines.push(strategy?.summary_md ?? 'No strategy version found yet.');
  lines.push('');
  lines.push('## Proposed Tasks');
  lines.push('');
  if (!tasks.length) {
    lines.push('- No tasks currently waiting for approval.');
  } else {
    for (const t of tasks) {
      lines.push(`- [${t.id}] ${t.title}`);
      lines.push(`  - Acceptance Criteria: ${t.acceptance_criteria_md}`);
      lines.push(`  - Risk: ${t.risk_level}`);
      lines.push(`  - Current Status: ${t.status}`);
    }
  }
  lines.push('');
  lines.push('## Execution Policy');
  lines.push('');
  lines.push('- Default mode is draft/PR only. No live publishing by default.');
  lines.push('- Paid ads write actions remain disabled unless explicitly configured.');
  lines.push('');
  lines.push('## Approve Tasks');
  lines.push('');
  lines.push('- Approve all: `growthclaw tasks approve --all`');
  lines.push('- Approve one: `growthclaw tasks approve <task-id>`');

  const outputPath = path.resolve(process.cwd(), 'APPROVAL_REQUEST.md');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}

function insertTask(input: {
  strategyId: number | null;
  title: string;
  description: string;
  channel: string;
  priority: TaskPriority;
  acceptance: string;
  tools: string[];
  risk: 'low' | 'medium' | 'high';
  dependsOn?: string[];
  owner?: string;
  status?: TaskStatus;
}): string {
  const id = makeTaskId();
  const created = nowIso();
  db()
    .prepare(
      `INSERT INTO tasks(
      id, created_at, updated_at, strategy_id, title, description, channel, priority,
      status, owner, acceptance_criteria_md, tools_required_json, risk_level, depends_on_json,
      artifacts_json, retry_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      id,
      created,
      created,
      input.strategyId,
      input.title,
      input.description,
      input.channel,
      input.priority,
      input.status ?? 'backlog',
      input.owner ?? 'executor',
      input.acceptance,
      JSON.stringify(input.tools),
      input.risk,
      JSON.stringify(input.dependsOn ?? []),
      JSON.stringify([])
    );

  addTaskEvent(id, 'created', { title: input.title, priority: input.priority });
  return id;
}

function runIntakeAndPlan(taskArg?: string): Record<string, unknown> {
  const websiteUrl = taskArg?.trim() || 'unknown';
  const intakeAnswers = {
    goals: 'unknown',
    budget: 'unknown',
    channels: [],
    constraints: []
  };

  const stateModel = {
    company_summary: 'unknown',
    product: 'unknown',
    icp: 'unknown',
    pricing_model: 'unknown',
    stage: 'unknown',
    primary_goal: 'unknown',
    current_channels: [],
    existing_assets: [],
    current_bottlenecks: ['insufficient context to identify bottlenecks'],
    constraints: {
      compliance: [],
      brand_tone: 'unknown',
      budget: 'unknown'
    },
    unknowns: ['company_summary', 'product', 'icp', 'pricing_model', 'stage', 'primary_goal']
  };

  const contextRes = db()
    .prepare(
      'INSERT INTO company_context(created_at, website_url, source_hash, raw_website_excerpt, intake_answers_json, state_model_json) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(nowIso(), websiteUrl, null, '', JSON.stringify(intakeAnswers), JSON.stringify(stateModel));
  const contextId = Number(contextRes.lastInsertRowid);

  const strategySummary = `Primary strategy: establish an execution baseline with measurable experiments tied to validated bottlenecks.\n\nWhat not to do: do not launch channels that are unsupported by context data.`;
  const strategyRes = db()
    .prepare(
      'INSERT INTO strategy_versions(created_at, context_id, summary_md, assumptions_json, constraints_json, kpis_json) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(
      nowIso(),
      contextId,
      strategySummary,
      JSON.stringify([
        'Business context is incomplete and must be progressively refined.',
        'Draft-first execution policy is mandatory in v0.1.'
      ]),
      JSON.stringify(['No live publishing by default', 'No paid API writes unless explicitly configured']),
      JSON.stringify([
        'Tasks completed per week',
        'Eval pass rate >= 80%',
        'Time from approval to done'
      ])
    );
  const strategyId = Number(strategyRes.lastInsertRowid);

  const taskIds = [
    insertTask({
      strategyId,
      title: 'Create baseline ICP messaging brief',
      description: 'Draft a concise ICP and value proposition brief based on known context and explicit unknowns.',
      channel: 'content',
      priority: 'P0',
      acceptance: 'Includes ICP, pain points, promise, and unknowns section; saved as markdown draft.',
      tools: ['files'],
      risk: 'low'
    }),
    insertTask({
      strategyId,
      title: 'Set up KPI instrumentation checklist',
      description: 'Create a checklist to instrument the 3 strategy KPIs with clear owners and data sources.',
      channel: 'analytics',
      priority: 'P1',
      acceptance: 'Checklist defines KPI, source, update cadence, and owner for each metric.',
      tools: ['files', 'web'],
      risk: 'low'
    }),
    insertTask({
      strategyId,
      title: 'Draft first lifecycle email experiment',
      description: 'Prepare a draft onboarding or activation email with a single focused CTA.',
      channel: 'lifecycle',
      priority: 'P1',
      acceptance: 'Email draft includes subject, body, CTA, and a hypothesis note tied to a KPI.',
      tools: ['files'],
      risk: 'medium'
    })
  ];

  const tasks = taskIds.map((id) => getTask(id)).filter(Boolean) as Task[];
  for (const t of tasks) {
    toNeedsApprovalIfReady(t);
  }

  const approvalFile = writeApprovalRequest();
  return { context_id: contextId, strategy_id: strategyId, task_ids: taskIds, approval_file: approvalFile };
}

function runExecuteTask(taskArg?: string): Record<string, unknown> {
  const config = getConfig();
  if (!taskArg?.trim()) {
    throw new Error('execute-task requires a task id argument');
  }

  const taskId = taskArg.trim();
  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const deps = dependenciesState(task);
  const toRunning = decideTransition({ task, dependenciesDone: deps.done, dependenciesBlocked: deps.blocked });
  if (toRunning.to_status !== 'running' && task.status !== 'running') {
    throw new Error(`Task cannot start from status ${task.status}: ${toRunning.reason}`);
  }

  if (task.status !== 'running') {
    updateTaskStatus(task.id, 'running');
    addTaskEvent(task.id, 'moved', {
      from_status: task.status,
      to_status: 'running',
      reason: toRunning.reason,
      rules_hit: ['approved->running']
    });
  }
  addTaskEvent(task.id, 'started', { workflow: 'execute-task' });

  const taskDir = path.join(TASKS_DIR, task.id);
  fs.mkdirSync(taskDir, { recursive: true });
  const artifactPath = path.join(taskDir, 'OUTPUT.md');
  fs.writeFileSync(
    artifactPath,
    `# ${task.title}\n\n## Task Description\n${task.description}\n\n## Deliverable (Draft)\nThis draft artifact was produced by the executor workflow in GrowthClaw v0.1.\n\n## Acceptance Criteria\n${task.acceptance_criteria_md}\n`,
    'utf8'
  );

  updateTask(task.id, { artifacts_json: JSON.stringify([artifactPath]) });
  addTaskEvent(task.id, 'artifact_written', { path: artifactPath });

  const toEval = decideTransition({ task: { ...task, status: 'running' } as Task, latestExecutorStatus: 'COMPLETED' });
  updateTaskStatus(task.id, toEval.to_status);
  addTaskEvent(task.id, 'moved', {
    from_status: 'running',
    to_status: toEval.to_status,
    reason: toEval.reason,
    rules_hit: ['running->eval']
  });

  const evaluator = evaluateTask(task.id);
  const current = getTask(task.id);
  if (!current) throw new Error(`Task disappeared during evaluation: ${task.id}`);

  const afterEval = decideTransition({ task: current, evaluatorVerdict: evaluator.verdict, maxRetries: config.limits.maxRetries });
  if (afterEval.actions.some((a) => a.type === 'update_fields')) {
    const action = afterEval.actions.find((a) => a.type === 'update_fields');
    if (action) {
      updateTask(task.id, action.payload);
    }
  }
  if (afterEval.to_status !== current.status) {
    updateTaskStatus(task.id, afterEval.to_status);
    addTaskEvent(task.id, 'moved', {
      from_status: current.status,
      to_status: afterEval.to_status,
      reason: afterEval.reason,
      rules_hit: [`eval->${afterEval.to_status}`]
    });
  }

  addTaskEvent(task.id, afterEval.to_status === 'done' ? 'done' : afterEval.to_status === 'revise' ? 'eval_revise' : 'blocked', {
    evaluator_verdict: evaluator.verdict,
    score: evaluator.overall_score
  });

  return {
    task_id: task.id,
    artifact: artifactPath,
    eval: evaluator,
    final_status: afterEval.to_status
  };
}

function evaluateTask(taskId: string): {
  overall_score: number;
  dimension_scores: Record<string, number>;
  verdict: EvalVerdict;
  feedback: Record<string, unknown>;
} {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found for eval: ${taskId}`);

  const artifacts = JSON.parse(task.artifacts_json || '[]') as string[];
  const hasArtifacts = artifacts.length > 0;

  const dimensionScores = {
    acceptance: hasArtifacts ? 8 : 3,
    icp: 7,
    clarity: hasArtifacts ? 8 : 4,
    cta: 7,
    voice: 7,
    risk: 4
  };

  const overall = Math.round(
    ((dimensionScores.acceptance + dimensionScores.icp + dimensionScores.clarity + dimensionScores.cta + dimensionScores.voice) * 2 +
      (10 - dimensionScores.risk) * 2) *
      (100 / 120)
  );

  let verdict: EvalVerdict = 'REVISE';
  if (overall >= 80 && dimensionScores.acceptance >= 8 && dimensionScores.risk <= 6) {
    verdict = 'PASS';
  }
  if (!hasArtifacts) {
    verdict = 'ESCALATE';
  }

  const feedback = {
    what_is_good: hasArtifacts ? ['Artifact exists and maps to task scope.'] : [],
    what_is_wrong: hasArtifacts ? [] : ['No artifacts were produced.'],
    required_changes: hasArtifacts
      ? []
      : [
          {
            artifact: 'N/A',
            change: 'Produce at least one artifact that satisfies all acceptance criteria.',
            success_check: 'Task artifacts list contains concrete files and evaluator acceptance >= 8.'
          }
        ]
  };

  updateTask(task.id, {
    eval_score: overall,
    eval_verdict: verdict,
    last_eval_feedback_md: JSON.stringify(feedback)
  });

  return {
    overall_score: overall,
    dimension_scores: dimensionScores,
    verdict,
    feedback
  };
}

function runStrategyEvolution(): Record<string, unknown> {
  const activeTasks = db()
    .prepare("SELECT * FROM tasks WHERE status IN ('backlog','needs-approval','approved','running','eval','revise')")
    .all() as Task[];

  const latestStrategy = db().prepare('SELECT id FROM strategy_versions ORDER BY created_at DESC LIMIT 1').get() as
    | { id: number }
    | undefined;

  const additions: string[] = [];
  if (activeTasks.length < 3 && latestStrategy) {
    const existingTitles = new Set(listTasks().map((t) => t.title.toLowerCase()));
    const candidates: Array<{ title: string; description: string; channel: string; priority: TaskPriority; acceptance: string }> = [
      {
        title: 'Audit top funnel drop-off points',
        description: 'Document drop-off points in the primary user funnel and propose 2 fixes.',
        channel: 'analytics',
        priority: 'P1',
        acceptance: 'Includes funnel stages, drop-off estimates, and two actionable remediation ideas.'
      },
      {
        title: 'Draft SEO landing page outline for core ICP pain point',
        description: 'Create SEO page outline aligned to one ICP pain point and one KPI.',
        channel: 'seo',
        priority: 'P2',
        acceptance: 'Outline includes target keyword intent, H1-H3 structure, and CTA.'
      },
      {
        title: 'Create content repurposing matrix for 30 days',
        description: 'Define how to repurpose one core asset into 5 channel-specific derivatives.',
        channel: 'content',
        priority: 'P2',
        acceptance: 'Matrix maps source asset, derivative format, channel, and KPI tie-in.'
      }
    ];

    for (const c of candidates.slice(0, 3)) {
      if (existingTitles.has(c.title.toLowerCase())) continue;
      const id = insertTask({
        strategyId: latestStrategy.id,
        title: c.title,
        description: c.description,
        channel: c.channel,
        priority: c.priority,
        acceptance: c.acceptance,
        tools: ['files', 'web'],
        risk: 'low'
      });
      const task = getTask(id);
      if (task) {
        toNeedsApprovalIfReady(task);
      }
      additions.push(id);
      if (additions.length >= 3) break;
    }
  }

  const approvalFile = writeApprovalRequest();
  return { added_task_ids: additions, approval_file: approvalFile };
}

export function listInstalledWorkflows(): Array<{ id: string; name: string; trigger: string }> {
  ensureAppDirs();
  const entries = fs.existsSync(WORKFLOWS_DIR)
    ? fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    : [];
  return entries.map((file) => {
    const full = path.join(WORKFLOWS_DIR, file);
    const parsed = yaml.load(fs.readFileSync(full, 'utf8')) as Record<string, unknown>;
    return {
      id: String(parsed.id ?? path.basename(file, path.extname(file))),
      name: String(parsed.name ?? file),
      trigger: String(parsed.trigger ?? 'manual')
    };
  });
}

export function runWorkflow(workflowId: string, taskArg?: string): Record<string, unknown> {
  const runId = createRun(workflowId, { taskArg });
  logLine(`workflow_start run=${runId} workflow=${workflowId} task=${taskArg ?? ''}`);
  try {
    let result: Record<string, unknown>;
    if (workflowId === 'intake-and-plan') {
      result = runIntakeAndPlan(taskArg);
    } else if (workflowId === 'execute-task') {
      result = runExecuteTask(taskArg);
    } else if (workflowId === 'strategy-evolution') {
      result = runStrategyEvolution();
    } else if (workflowId === 'dispatcher') {
      result = runDispatcher();
    } else {
      throw new Error(`Unknown workflow id: ${workflowId}`);
    }
    finishRun(runId, 'success', result);
    logLine(`workflow_success run=${runId} workflow=${workflowId}`);
    return { run_id: runId, ...result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishRun(runId, 'failed', { error: message });
    logLine(`workflow_failed run=${runId} workflow=${workflowId} error=${message}`);
    throw err;
  }
}

export function runDispatcher(): Record<string, unknown> {
  const approved = listTasks('approved').sort((a, b) => {
    const p = priorityRank(a.priority as TaskPriority) - priorityRank(b.priority as TaskPriority);
    if (p !== 0) return p;
    return a.created_at.localeCompare(b.created_at);
  });

  for (const task of approved) {
    const deps = dependenciesState(task);
    if (!deps.done || deps.blocked) continue;
    const result = runExecuteTask(task.id);
    return { dispatched_task_id: task.id, execution: result };
  }

  return { dispatched_task_id: null, reason: 'No eligible approved tasks found.' };
}

export function installWorkflowBundle(workflowId: string): string {
  const srcCandidates = [
    path.resolve(process.cwd(), `resources/workflows/${workflowId}.yml`),
    path.resolve(process.cwd(), `resources/workflows/${workflowId}.yaml`)
  ];
  const src = srcCandidates.find((p) => fs.existsSync(p));
  if (!src) {
    throw new Error(`Bundled workflow not found: ${workflowId}`);
  }
  const dst = path.join(WORKFLOWS_DIR, path.basename(src));
  fs.copyFileSync(src, dst);
  return dst;
}

export function installAgentBundle(agentId: string): string {
  const src = path.resolve(process.cwd(), `resources/agents/${agentId}.md`);
  if (!fs.existsSync(src)) {
    throw new Error(`Bundled agent file not found: ${agentId}`);
  }
  const dst = path.join(AGENTS_DIR, `${agentId}.md`);
  fs.copyFileSync(src, dst);
  return dst;
}
