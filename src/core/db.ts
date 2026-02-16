import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH, ensureAppDirs } from './config.js';
import type { Task, TaskStatus } from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

let dbInstance: Database.Database | null = null;

export function db(): Database.Database {
  if (dbInstance) return dbInstance;
  ensureAppDirs();
  dbInstance = new Database(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  return dbInstance;
}

export function runMigrations(): void {
  const conn = db();
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const names = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const name of names) {
    const exists = conn
      .prepare('SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?')
      .get('table', 'schema_migrations');
    if (!exists) {
      const bootstrap = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
      conn.exec(bootstrap);
      conn
        .prepare('INSERT OR IGNORE INTO schema_migrations(name, applied_at) VALUES(?, ?)')
        .run(name, nowIso());
      continue;
    }

    const applied = conn.prepare('SELECT 1 FROM schema_migrations WHERE name = ?').get(name);
    if (applied) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, name), 'utf8');
    conn.exec(sql);
    conn.prepare('INSERT INTO schema_migrations(name, applied_at) VALUES(?, ?)').run(name, nowIso());
  }
}

export function createRun(workflowId: string, metadata: Record<string, unknown> = {}): number {
  const res = db()
    .prepare('INSERT INTO runs(workflow_id, created_at, status, metadata_json) VALUES(?, ?, ?, ?)')
    .run(workflowId, nowIso(), 'running', JSON.stringify(metadata));
  return Number(res.lastInsertRowid);
}

export function finishRun(id: number, status: string, metadata: Record<string, unknown> = {}): void {
  db()
    .prepare('UPDATE runs SET status = ?, metadata_json = ? WHERE id = ?')
    .run(status, JSON.stringify(metadata), id);
}

export function addTaskEvent(taskId: string, eventType: string, payload: Record<string, unknown> = {}): void {
  db()
    .prepare('INSERT INTO task_events(task_id, created_at, event_type, payload_json) VALUES(?, ?, ?, ?)')
    .run(taskId, nowIso(), eventType, JSON.stringify(payload));
}

export function getTask(taskId: string): Task | undefined {
  return db().prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Task | undefined;
}

export function listTasks(status?: TaskStatus): Task[] {
  if (status) {
    return db()
      .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY priority ASC, updated_at DESC')
      .all(status) as Task[];
  }
  return db().prepare('SELECT * FROM tasks ORDER BY updated_at DESC').all() as Task[];
}

export function updateTaskStatus(taskId: string, status: TaskStatus): void {
  db().prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), taskId);
}

export function updateTask(taskId: string, fields: Record<string, unknown>): void {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;

  const sets = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  db()
    .prepare(`UPDATE tasks SET ${sets}, updated_at = ? WHERE id = ?`)
    .run(...values, nowIso(), taskId);
}

export function makeTaskId(): string {
  return `tsk_${Math.random().toString(36).slice(2, 8)}`;
}
