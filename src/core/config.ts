import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const APP_DIR = process.env.GROWTHCLAW_HOME || path.join(os.homedir(), '.growthclaw');
export const DB_PATH = path.join(APP_DIR, 'growthclaw.db');
export const CONFIG_PATH = path.join(APP_DIR, 'config.json');
export const LOG_DIR = path.join(APP_DIR, 'logs');
export const LOG_FILE = path.join(LOG_DIR, 'growthclaw.log');
export const WORKFLOWS_DIR = path.join(APP_DIR, 'workflows');
export const AGENTS_DIR = path.join(APP_DIR, 'agents');
export const TASKS_DIR = path.join(APP_DIR, 'tasks');
export const DASHBOARD_STATE_PATH = path.join(APP_DIR, 'dashboard-state.json');

export const BUNDLED_WORKFLOWS_DIR = path.resolve(process.cwd(), 'resources/workflows');
export const BUNDLED_AGENTS_DIR = path.resolve(process.cwd(), 'resources/agents');

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureAppDirs(): void {
  [APP_DIR, LOG_DIR, WORKFLOWS_DIR, AGENTS_DIR, TASKS_DIR].forEach(ensureDir);
}
