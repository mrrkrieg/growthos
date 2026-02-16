import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { addTaskEvent, db, getTask, listTasks, updateTask, updateTaskStatus } from '../core/db.js';
import { decideTransition } from '../core/pm.js';
import type { Task, TaskStatus } from '../core/types.js';

const STATUS_VALUES: TaskStatus[] = [
  'backlog',
  'needs-approval',
  'approved',
  'running',
  'eval',
  'revise',
  'blocked',
  'done',
  'archived'
];

function parseStatus(status?: string): TaskStatus | undefined {
  if (!status) return undefined;
  if (!STATUS_VALUES.includes(status as TaskStatus)) {
    throw new Error(`Invalid status: ${status}`);
  }
  return status as TaskStatus;
}

function printTask(task: Task): void {
  console.log(`id: ${task.id}`);
  console.log(`status: ${task.status}`);
  console.log(`priority: ${task.priority}`);
  console.log(`title: ${task.title}`);
  console.log(`channel: ${task.channel}`);
  console.log(`risk: ${task.risk_level}`);
  console.log(`owner: ${task.owner}`);
  console.log(`retry_count: ${task.retry_count}`);
  console.log(`description: ${task.description}`);
  console.log(`acceptance_criteria: ${task.acceptance_criteria_md}`);
  console.log(`tools_required: ${task.tools_required_json}`);
  console.log(`depends_on: ${task.depends_on_json}`);
  console.log(`artifacts: ${task.artifacts_json}`);
  console.log(`eval_score: ${task.eval_score ?? ''}`);
  console.log(`eval_verdict: ${task.eval_verdict ?? ''}`);
  console.log(`last_eval_feedback: ${task.last_eval_feedback_md ?? ''}`);
}

function openEditorWithJson(initial: unknown): Record<string, unknown> {
  const tmp = path.join(os.tmpdir(), `growthclaw-task-edit-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify(initial, null, 2), 'utf8');
  const editor = process.env.EDITOR || 'vi';
  const res = spawnSync(editor, [tmp], { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`Editor exited with status ${res.status}`);
  }
  const raw = fs.readFileSync(tmp, 'utf8');
  fs.unlinkSync(tmp);
  return JSON.parse(raw) as Record<string, unknown>;
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

export function registerTaskCommands(program: Command): void {
  const tasks = program.command('tasks').description('Manage pipeline tasks');

  tasks
    .command('list')
    .option('--status <status>', 'Filter by status')
    .action((opts: { status?: string }) => {
      const status = parseStatus(opts.status);
      const rows = listTasks(status);
      for (const t of rows) {
        console.log(`${t.id}\t${t.status}\t${t.priority}\t${t.title}`);
      }
      if (!rows.length) {
        console.log('No tasks found.');
      }
    });

  tasks
    .command('view')
    .argument('<task-id>', 'Task id')
    .action((taskId: string) => {
      const task = getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      printTask(task);

      const events = db()
        .prepare('SELECT created_at, event_type, payload_json FROM task_events WHERE task_id = ? ORDER BY id DESC LIMIT 20')
        .all(taskId) as Array<{ created_at: string; event_type: string; payload_json: string }>;
      if (events.length) {
        console.log('\nRecent events:');
        for (const e of events) {
          console.log(`- ${e.created_at} ${e.event_type} ${e.payload_json}`);
        }
      }
    });

  tasks
    .command('approve')
    .argument('[task-id]', 'Task id')
    .option('--all', 'Approve all tasks in needs-approval')
    .action((taskId: string | undefined, opts: { all?: boolean }) => {
      if (!taskId && !opts.all) {
        throw new Error('Provide <task-id> or --all');
      }

      const ids = opts.all
        ? (db().prepare("SELECT id FROM tasks WHERE status = 'needs-approval'").all() as Array<{ id: string }>).map((r) => r.id)
        : [taskId as string];

      for (const id of ids) {
        const task = getTask(id);
        if (!task) continue;
        const decision = decideTransition({ task, humanApproved: true });
        if (decision.to_status !== 'approved') {
          console.log(`[${id}] no transition: ${decision.reason}`);
          continue;
        }
        updateTaskStatus(id, 'approved');
        addTaskEvent(id, 'moved', {
          from_status: task.status,
          to_status: 'approved',
          reason: decision.reason,
          rules_hit: ['needs-approval->approved']
        });
        addTaskEvent(id, 'approved', { via: 'cli' });
        console.log(`[${id}] approved`);
      }
    });

  tasks
    .command('edit')
    .argument('<task-id>', 'Task id')
    .option('--patch <json>', 'Partial update JSON object')
    .action((taskId: string, opts: { patch?: string }) => {
      const task = getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);

      let patch: Record<string, unknown>;
      if (opts.patch) {
        patch = JSON.parse(opts.patch) as Record<string, unknown>;
      } else {
        patch = openEditorWithJson({
          title: task.title,
          description: task.description,
          priority: task.priority,
          channel: task.channel,
          acceptance_criteria_md: task.acceptance_criteria_md,
          tools_required_json: task.tools_required_json,
          risk_level: task.risk_level,
          depends_on_json: task.depends_on_json,
          owner: task.owner
        });
      }

      updateTask(taskId, patch);
      addTaskEvent(taskId, 'comment', { message: 'Task updated via edit command.' });
      console.log(`Updated task ${taskId}`);
    });

  tasks
    .command('move')
    .argument('<task-id>', 'Task id')
    .argument('<status>', 'Target status')
    .option('--force', 'Bypass PM transition guard')
    .action((taskId: string, statusRaw: string, opts: { force?: boolean }) => {
      const target = parseStatus(statusRaw);
      if (!target) throw new Error(`Invalid target status: ${statusRaw}`);
      const task = getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);

      if (!opts.force) {
        const deps = dependenciesState(task);
        const decision = decideTransition({
          task,
          dependenciesDone: deps.done,
          dependenciesBlocked: deps.blocked,
          hasRequiredChanges: Boolean(task.last_eval_feedback_md),
          humanApproved: target === 'approved'
        });
        if (decision.to_status !== target) {
          throw new Error(`Guarded move denied. Allowed transition: ${decision.to_status}. Reason: ${decision.reason}`);
        }
      }

      updateTaskStatus(taskId, target);
      addTaskEvent(taskId, 'moved', {
        from_status: task.status,
        to_status: target,
        reason: opts.force ? 'Forced move via CLI option.' : 'Guarded move approved by PM transition check.',
        rules_hit: [opts.force ? 'force' : `${task.status}->${target}`]
      });
      console.log(`Moved ${taskId} -> ${target}`);
    });

  tasks
    .command('comment')
    .argument('<task-id>', 'Task id')
    .argument('<text>', 'Comment text')
    .action((taskId: string, text: string) => {
      const task = getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);
      addTaskEvent(taskId, 'comment', { text });
      console.log(`Added comment to ${taskId}`);
    });
}
