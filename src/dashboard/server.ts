import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { AGENTS_DIR, APP_DIR, DB_PATH, LOG_FILE, TASKS_DIR, WORKFLOWS_DIR, ensureAppDirs } from '../core/config.js';
import { getConfig, nextRunTimes, updateConfig } from '../core/app-config.js';
import { addTaskEvent, db, getTask, listTasks, runMigrations, updateTaskStatus } from '../core/db.js';
import { runWorkflow, listInstalledWorkflows } from '../core/workflows.js';
import { decideTransition } from '../core/pm.js';
import { reinstallCronJobs } from '../core/install.js';
import { readLogs } from '../core/logger.js';
import { sanitizeOutput } from '../core/security.js';
import type { Task, TaskPriority } from '../core/types.js';

const STATUSES = new Set(['backlog', 'needs-approval', 'approved', 'running', 'eval', 'revise', 'blocked', 'done', 'archived']);

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function dependenciesState(task: Task): { done: boolean; blocked: boolean; waitingOn: string[] } {
  const ids = parseJson<string[]>(task.depends_on_json, []);
  if (!ids.length) return { done: true, blocked: false, waitingOn: [] };
  let done = true;
  let blocked = false;
  const waitingOn: string[] = [];

  for (const id of ids) {
    const dep = getTask(id);
    if (!dep || dep.status !== 'done') {
      done = false;
      waitingOn.push(id);
    }
    if (dep?.status === 'blocked') {
      blocked = true;
    }
  }

  return { done, blocked, waitingOn };
}

function latestMoveReason(taskId: string): string | null {
  const row = db()
    .prepare("SELECT payload_json FROM task_events WHERE task_id = ? AND event_type = 'moved' ORDER BY id DESC LIMIT 1")
    .get(taskId) as { payload_json: string } | undefined;
  if (!row) return null;
  const payload = parseJson<Record<string, unknown>>(row.payload_json, {});
  return typeof payload.reason === 'string' ? payload.reason : null;
}

function taskListQuery(params: { status?: string; priority?: string; channel?: string; q?: string }): Task[] {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (params.status) {
    clauses.push('status = ?');
    values.push(params.status);
  }
  if (params.priority) {
    clauses.push('priority = ?');
    values.push(params.priority);
  }
  if (params.channel) {
    clauses.push('channel = ?');
    values.push(params.channel);
  }
  if (params.q) {
    clauses.push('(title LIKE ? OR description LIKE ?)');
    values.push(`%${params.q}%`, `%${params.q}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db()
    .prepare(`SELECT * FROM tasks ${where} ORDER BY CASE priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END, updated_at DESC`)
    .all(...values) as Task[];
}

function readArtifactPreview(filepath: string): string {
  if (!filepath.startsWith(TASKS_DIR) && !filepath.startsWith(process.cwd())) {
    return '[artifact path outside allowed directories]';
  }
  if (!fs.existsSync(filepath)) {
    return '[missing artifact file]';
  }
  const stat = fs.statSync(filepath);
  if (stat.size > 200_000) {
    return '[artifact too large for inline preview]';
  }
  const text = fs.readFileSync(filepath, 'utf8');
  return sanitizeOutput(text);
}

function requireBasicAuthIfEnabled(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const enabled = process.env.GROWTHCLAW_DASHBOARD_BASIC_AUTH === '1';
  if (!enabled) {
    next();
    return;
  }

  const expectedUser = process.env.GROWTHCLAW_DASHBOARD_USER || 'admin';
  const expectedPass = process.env.GROWTHCLAW_DASHBOARD_PASS || 'change-me';
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="GrowthClaw Dashboard"');
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');
  if (user !== expectedUser || pass !== expectedPass) {
    res.status(403).json({ error: 'Invalid credentials' });
    return;
  }
  next();
}

function workflowSteps(workflowId: string): Array<{ id: string; agent?: string; optional?: boolean }> {
  const candidates = [
    path.join(WORKFLOWS_DIR, `${workflowId}.yml`),
    path.join(WORKFLOWS_DIR, `${workflowId}.yaml`)
  ];
  const src = candidates.find((p) => fs.existsSync(p));
  if (!src) return [];
  const raw = fs.readFileSync(src, 'utf8');
  const steps: Array<{ id: string; agent?: string; optional?: boolean }> = [];
  for (const line of raw.split('\n')) {
    const idMatch = line.match(/^\s*-\s+id:\s+(.+)$/);
    if (idMatch) {
      steps.push({ id: idMatch[1].trim() });
    }
    const agentMatch = line.match(/^\s+agent:\s+(.+)$/);
    if (agentMatch && steps.length) {
      steps[steps.length - 1].agent = agentMatch[1].trim();
    }
    const optionalMatch = line.match(/^\s+optional:\s+true$/);
    if (optionalMatch && steps.length) {
      steps[steps.length - 1].optional = true;
    }
  }
  return steps;
}

function strategyProposalSummary(strategyVersionId: number): {
  strategyVersionId: number;
  strategySummary: string;
  tasks: Task[];
  approvalRequest: string | null;
} {
  const strategy = db().prepare('SELECT id, summary_md FROM strategy_versions WHERE id = ?').get(strategyVersionId) as
    | { id: number; summary_md: string }
    | undefined;
  const tasks = db()
    .prepare("SELECT * FROM tasks WHERE strategy_id = ? AND status = 'needs-approval' ORDER BY created_at DESC")
    .all(strategyVersionId) as Task[];

  const approvalPath = path.resolve(process.cwd(), 'APPROVAL_REQUEST.md');
  const approvalRequest = fs.existsSync(approvalPath) ? sanitizeOutput(fs.readFileSync(approvalPath, 'utf8')) : null;

  return {
    strategyVersionId,
    strategySummary: strategy?.summary_md ?? '',
    tasks,
    approvalRequest
  };
}

function startServer(): void {
  ensureAppDirs();
  runMigrations();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(requireBasicAuthIfEnabled);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '0.1.0', dbPath: DB_PATH });
  });

  app.get('/api/config', (_req, res) => {
    const cfg = getConfig();
    res.json({
      dashboard: cfg.dashboard,
      safeMode: cfg.safeMode,
      limits: cfg.limits,
      cron: cfg.cron,
      integrations: cfg.integrations,
      appDir: APP_DIR,
      workflowsDir: WORKFLOWS_DIR,
      agentsDir: AGENTS_DIR
    });
  });

  app.post('/api/config', (req, res) => {
    const patch = req.body as Record<string, unknown>;
    const merged = updateConfig(patch);
    res.json(merged);
  });

  app.get('/api/overview', (_req, res) => {
    const rows = listTasks();
    const counts: Record<string, number> = {};
    for (const t of rows) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }

    const blocked = rows.filter((t) => t.status === 'blocked').slice(0, 5).map((t) => ({
      id: t.id,
      title: t.title,
      reason: latestMoveReason(t.id)
    }));

    const strategy = db().prepare('SELECT id, created_at, summary_md FROM strategy_versions ORDER BY created_at DESC LIMIT 1').get() as
      | { id: number; created_at: string; summary_md: string }
      | undefined;

    const runs = db().prepare('SELECT id, workflow_id, created_at, status FROM runs ORDER BY id DESC LIMIT 5').all();
    const cfg = getConfig();
    const nextRuns = nextRunTimes(cfg.cron.strategyEvolution.times, 3);
    const lastStrategyRun = db()
      .prepare("SELECT id, created_at, status, metadata_json FROM runs WHERE workflow_id = 'strategy-evolution' ORDER BY id DESC LIMIT 1")
      .get();

    res.json({ counts, blocked, strategy, runs, strategyEvolution: { lastRun: lastStrategyRun, nextRuns } });
  });

  app.get('/api/tasks', (req, res) => {
    const tasks = taskListQuery({
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      channel: req.query.channel as string | undefined,
      q: req.query.q as string | undefined
    }).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      channel: t.channel,
      owner: t.owner,
      updated_at: t.updated_at,
      eval_score: t.eval_score,
      eval_verdict: t.eval_verdict,
      blocked_reason: t.status === 'blocked' ? latestMoveReason(t.id) : null
    }));
    res.json({ tasks });
  });

  app.get('/api/tasks/:id', (req, res) => {
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    const artifacts = parseJson<string[]>(task.artifacts_json, []).map((artifactPath) => ({
      path: artifactPath,
      preview: readArtifactPreview(artifactPath)
    }));

    const eventRows = db()
      .prepare('SELECT id, created_at, event_type, payload_json FROM task_events WHERE task_id = ? ORDER BY id DESC')
      .all(task.id) as Array<{ id: number; created_at: string; event_type: string; payload_json: string }>;

    const events = eventRows.map((e) => ({
        ...e,
        payload: parseJson<Record<string, unknown>>(e.payload_json, {})
      }));

    const pmReason = events.find((e: { event_type: string; payload: Record<string, unknown> }) => e.event_type === 'moved');
    res.json({
      task,
      artifacts,
      eval_feedback: parseJson<Record<string, unknown>>(task.last_eval_feedback_md, {}),
      history: events,
      pm_reason: pmReason?.payload ?? null
    });
  });

  app.post('/api/tasks/:id/approve', (req, res) => {
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const decision = decideTransition({ task, humanApproved: true });
    if (decision.to_status !== 'approved') {
      res.status(400).json({ error: decision.reason, decision });
      return;
    }
    updateTaskStatus(task.id, 'approved');
    addTaskEvent(task.id, 'moved', {
      from_status: task.status,
      to_status: 'approved',
      reason: decision.reason,
      rules_hit: ['needs-approval->approved']
    });
    addTaskEvent(task.id, 'approved', { via: 'dashboard' });
    res.json({ ok: true, taskId: task.id, status: 'approved' });
  });

  app.post('/api/tasks/approve-bulk', (req, res) => {
    const taskIds = Array.isArray(req.body?.taskIds) ? (req.body.taskIds as string[]) : [];
    const ids = taskIds.length
      ? taskIds
      : (db().prepare("SELECT id FROM tasks WHERE status = 'needs-approval'").all() as Array<{ id: string }>).map((x) => x.id);

    const result: Array<{ taskId: string; ok: boolean; reason?: string }> = [];
    for (const id of ids) {
      const task = getTask(id);
      if (!task) {
        result.push({ taskId: id, ok: false, reason: 'Task not found' });
        continue;
      }
      const decision = decideTransition({ task, humanApproved: true });
      if (decision.to_status !== 'approved') {
        result.push({ taskId: id, ok: false, reason: decision.reason });
        continue;
      }
      updateTaskStatus(id, 'approved');
      addTaskEvent(id, 'moved', {
        from_status: task.status,
        to_status: 'approved',
        reason: decision.reason,
        rules_hit: ['needs-approval->approved']
      });
      addTaskEvent(id, 'approved', { via: 'dashboard-bulk' });
      result.push({ taskId: id, ok: true });
    }

    res.json({ ok: true, result });
  });

  app.post('/api/tasks/:id/move', (req, res) => {
    const toStatus = String(req.body?.toStatus || '');
    const force = Boolean(req.body?.force);
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    if (!STATUSES.has(toStatus)) {
      res.status(400).json({ error: `Invalid status: ${toStatus}` });
      return;
    }

    const cfg = getConfig();
    if (force && !cfg.safeMode.allowForceMoves) {
      res.status(403).json({ error: 'Force moves are disabled by config.' });
      return;
    }

    const deps = dependenciesState(task);
    const decision = decideTransition({
      task,
      dependenciesDone: deps.done,
      dependenciesBlocked: deps.blocked,
      hasRequiredChanges: Boolean(task.last_eval_feedback_md),
      humanApproved: toStatus === 'approved',
      maxRetries: cfg.limits.maxRetries
    });

    if (!force && decision.to_status !== toStatus) {
      res.status(400).json({ error: `Blocked by PM rule. Allowed transition: ${decision.to_status}`, decision });
      return;
    }

    updateTaskStatus(task.id, toStatus as Task['status']);
    addTaskEvent(task.id, 'moved', {
      from_status: task.status,
      to_status: toStatus,
      reason: force ? 'Forced move via dashboard.' : decision.reason,
      rules_hit: [force ? 'force' : `${task.status}->${toStatus}`]
    });
    res.json({ ok: true, taskId: task.id, toStatus, force });
  });

  app.post('/api/tasks/:id/comment', (req, res) => {
    const text = String(req.body?.text || '').trim();
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    if (!text) {
      res.status(400).json({ error: 'Comment text is required.' });
      return;
    }
    addTaskEvent(task.id, 'comment', { text, via: 'dashboard' });
    res.json({ ok: true });
  });

  app.post('/api/tasks/:id/run', (req, res) => {
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const deps = dependenciesState(task);
    const decision = decideTransition({ task, dependenciesDone: deps.done, dependenciesBlocked: deps.blocked });
    if (task.status !== 'running' && decision.to_status !== 'running') {
      res.status(400).json({ error: decision.reason, waitingOn: deps.waitingOn });
      return;
    }

    const result = runWorkflow('execute-task', task.id);
    res.json({ ok: true, result });
  });

  app.post('/api/tasks/dispatch-next', (_req, res) => {
    const result = runWorkflow('dispatcher');
    res.json({ ok: true, result });
  });

  app.get('/api/approvals', (_req, res) => {
    const groups = db()
      .prepare(
        `SELECT strategy_id, COUNT(*) AS task_count
         FROM tasks
         WHERE status = 'needs-approval' AND strategy_id IS NOT NULL
         GROUP BY strategy_id
         ORDER BY strategy_id DESC`
      )
      .all() as Array<{ strategy_id: number; task_count: number }>;

    const approvalPath = path.resolve(process.cwd(), 'APPROVAL_REQUEST.md');
    const approvalRequest = fs.existsSync(approvalPath) ? sanitizeOutput(fs.readFileSync(approvalPath, 'utf8')) : null;

    const payload = groups.map((g) => {
      const strategy = db().prepare('SELECT summary_md, created_at FROM strategy_versions WHERE id = ?').get(g.strategy_id) as
        | { summary_md: string; created_at: string }
        | undefined;
      const tasks = db()
        .prepare('SELECT id, title, acceptance_criteria_md, risk_level, description FROM tasks WHERE strategy_id = ? AND status = ?')
        .all(g.strategy_id, 'needs-approval');
      return {
        strategyVersionId: g.strategy_id,
        createdAt: strategy?.created_at,
        strategySummary: strategy?.summary_md ?? '',
        taskCount: g.task_count,
        tasks,
        approvalRequest
      };
    });

    res.json({ approvals: payload });
  });

  app.get('/api/approvals/:strategyVersionId', (req, res) => {
    const strategyVersionId = Number(req.params.strategyVersionId);
    res.json(strategyProposalSummary(strategyVersionId));
  });

  app.post('/api/approvals/:strategyVersionId/approve', (req, res) => {
    const strategyVersionId = Number(req.params.strategyVersionId);
    const taskIds = (db()
      .prepare("SELECT id FROM tasks WHERE strategy_id = ? AND status = 'needs-approval'")
      .all(strategyVersionId) as Array<{ id: string }>).map((x) => x.id);
    const result: Array<{ taskId: string; ok: boolean; reason?: string }> = [];

    for (const taskId of taskIds) {
      const task = getTask(taskId);
      if (!task) continue;
      const decision = decideTransition({ task, humanApproved: true });
      if (decision.to_status !== 'approved') {
        result.push({ taskId, ok: false, reason: decision.reason });
        continue;
      }
      updateTaskStatus(taskId, 'approved');
      addTaskEvent(task.id, 'moved', {
        from_status: task.status,
        to_status: 'approved',
        reason: decision.reason,
        rules_hit: ['needs-approval->approved']
      });
      addTaskEvent(task.id, 'approved', { via: 'approval-set', strategyVersionId });
      result.push({ taskId, ok: true });
    }

    res.json({ ok: true, result });
  });

  app.post('/api/approvals/:strategyVersionId/reject', (req, res) => {
    const strategyVersionId = Number(req.params.strategyVersionId);
    const reason = String(req.body?.reason || 'Rejected from approvals screen.');
    const taskIds = Array.isArray(req.body?.taskIds)
      ? (req.body.taskIds as string[])
      : (db()
          .prepare("SELECT id FROM tasks WHERE strategy_id = ? AND status = 'needs-approval'")
          .all(strategyVersionId) as Array<{ id: string }>).map((x) => x.id);

    for (const id of taskIds) {
      const task = getTask(id);
      if (!task) continue;
      updateTaskStatus(id, 'backlog');
      addTaskEvent(id, 'moved', {
        from_status: task.status,
        to_status: 'backlog',
        reason,
        rules_hit: ['approval-reject']
      });
      addTaskEvent(id, 'comment', { text: `Approval rejected: ${reason}`, via: 'dashboard' });
    }

    res.json({ ok: true, taskIds });
  });

  app.get('/api/strategy/current', (_req, res) => {
    const row = db().prepare('SELECT * FROM strategy_versions ORDER BY created_at DESC LIMIT 1').get();
    if (!row) {
      res.status(404).json({ error: 'No strategy found' });
      return;
    }
    res.json(row);
  });

  app.get('/api/strategy/history', (_req, res) => {
    const rows = db().prepare('SELECT * FROM strategy_versions ORDER BY created_at DESC').all();
    res.json({ items: rows });
  });

  app.get('/api/strategy/:id', (req, res) => {
    const strategyId = Number(req.params.id);
    const row = db().prepare('SELECT * FROM strategy_versions WHERE id = ?').get(strategyId) as
      | {
          id: number;
          created_at: string;
          summary_md: string;
          assumptions_json: string;
          constraints_json: string;
          kpis_json: string;
        }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Strategy not found' });
      return;
    }
    const tasks = db().prepare('SELECT * FROM tasks WHERE strategy_id = ? ORDER BY created_at DESC').all(strategyId);
    const prev = db().prepare('SELECT id FROM strategy_versions WHERE id < ? ORDER BY id DESC LIMIT 1').get(strategyId) as
      | { id: number }
      | undefined;

    let changes = { added: [] as unknown[], reprioritized: [] as unknown[], archived: [] as unknown[] };
    if (prev) {
      const prevTasks = db().prepare('SELECT id, priority, status FROM tasks WHERE strategy_id = ?').all(prev.id) as Array<{
        id: string;
        priority: TaskPriority;
        status: string;
      }>;
      const prevMap = new Map(prevTasks.map((t) => [t.id, t]));

      const currTasks = tasks as Array<{ id: string; priority: TaskPriority; status: string }>;
      changes = {
        added: currTasks.filter((t) => !prevMap.has(t.id)),
        reprioritized: currTasks.filter((t) => prevMap.has(t.id) && prevMap.get(t.id)?.priority !== t.priority),
        archived: currTasks.filter((t) => t.status === 'archived')
      };
    }

    res.json({ strategy: row, tasks, changes });
  });

  app.post('/api/strategy/run-evolution', (_req, res) => {
    const result = runWorkflow('strategy-evolution');
    res.json({ ok: true, result });
  });

  app.get('/api/workflows', (_req, res) => {
    res.json({ workflows: listInstalledWorkflows() });
  });

  app.get('/api/runs', (_req, res) => {
    const rows = db().prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 200').all();
    res.json({ runs: rows });
  });

  app.get('/api/runs/:id', (req, res) => {
    const runId = Number(req.params.id);
    const row = db().prepare('SELECT * FROM runs WHERE id = ?').get(runId) as
      | { id: number; workflow_id: string; created_at: string; status: string; metadata_json: string }
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    const steps = workflowSteps(row.workflow_id);
    res.json({
      run: {
        ...row,
        metadata: parseJson<Record<string, unknown>>(row.metadata_json, {})
      },
      steps
    });
  });

  app.get('/api/runs/:id/logs', (req, res) => {
    const runId = Number(req.params.id);
    const lines = sanitizeOutput(readLogs(400))
      .split('\n')
      .filter((line) => line.includes(`run=${runId}`));
    res.json({ runId, lines });
  });

  app.get('/api/cron/status', (_req, res) => {
    const cfg = getConfig();
    const nextRuns = nextRunTimes(cfg.cron.strategyEvolution.times, 6);
    const lastRuns = db()
      .prepare("SELECT id, created_at, status, metadata_json FROM runs WHERE workflow_id = 'strategy-evolution' ORDER BY id DESC LIMIT 20")
      .all() as Array<{ id: number; created_at: string; status: string; metadata_json: string }>;

    const last10 = lastRuns.slice(0, 10).map((r) => ({ ...r, metadata: parseJson<Record<string, unknown>>(r.metadata_json, {}) }));
    const failures = lastRuns
      .filter((r) => r.status === 'failed')
      .map((r) => parseJson<Record<string, unknown>>(r.metadata_json, {}).error)
      .filter(Boolean);

    res.json({
      schedule: cfg.cron.strategyEvolution.times,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      nextRuns,
      lastRuns: last10,
      commonFailureReasons: [...new Set(failures)].slice(0, 5)
    });
  });

  app.post('/api/cron/reinstall', (req, res) => {
    const withDispatcherCron = Boolean(req.body?.withDispatcherCron);
    const result = reinstallCronJobs(withDispatcherCron);
    res.json({ ok: result.installed, message: result.details });
  });

  app.post('/api/cron/run-now', (_req, res) => {
    const result = runWorkflow('strategy-evolution');
    res.json({ ok: true, result });
  });

  app.get('/api/logs', (req, res) => {
    const lines = Number(req.query.lines ?? '200');
    const logs = sanitizeOutput(readLogs(Number.isFinite(lines) ? lines : 200));
    res.json({ logs });
  });

  const staticDir = path.resolve(process.cwd(), 'dashboard/dist');
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res.type('text/plain').send(
        'GrowthClaw dashboard UI is not built. Run: npm run build:web and restart dashboard. API is available under /api.'
      );
    });
  }

  const port = Number(process.env.GROWTHCLAW_DASHBOARD_PORT || getConfig().dashboard.port || 3333);
  app.listen(port, '127.0.0.1', () => {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] dashboard_server listening port=${port}\n`, 'utf8');
  });
}

startServer();
