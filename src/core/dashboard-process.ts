import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DASHBOARD_STATE_PATH, LOG_DIR, ensureAppDirs } from './config.js';
import { getConfig } from './app-config.js';

export interface DashboardState {
  pid: number;
  port: number;
  startedAt: string;
}

function readState(): DashboardState | null {
  if (!fs.existsSync(DASHBOARD_STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(DASHBOARD_STATE_PATH, 'utf8')) as DashboardState;
  } catch {
    return null;
  }
}

function writeState(state: DashboardState): void {
  ensureAppDirs();
  fs.writeFileSync(DASHBOARD_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function isRunningPid(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function dashboardStatus(): { running: boolean; state: DashboardState | null } {
  const state = readState();
  if (!state) return { running: false, state: null };
  if (!isRunningPid(state.pid)) {
    fs.rmSync(DASHBOARD_STATE_PATH, { force: true });
    return { running: false, state: null };
  }
  return { running: true, state };
}

export function startDashboard(portOverride?: number): DashboardState {
  ensureAppDirs();
  const status = dashboardStatus();
  if (status.running && status.state) {
    return status.state;
  }

  const cfg = getConfig();
  const port = portOverride ?? cfg.dashboard.port;
  const entry = path.resolve(process.cwd(), 'dist/dashboard/server.js');
  if (!fs.existsSync(entry)) {
    throw new Error('Dashboard server build not found. Run: npm run build:server');
  }
  const out = fs.openSync(path.join(LOG_DIR, 'dashboard.out.log'), 'a');
  const err = fs.openSync(path.join(LOG_DIR, 'dashboard.err.log'), 'a');

  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: ['ignore', out, err],
    env: {
      ...process.env,
      GROWTHCLAW_DASHBOARD_PORT: String(port)
    }
  });
  child.unref();

  const state: DashboardState = {
    pid: child.pid ?? -1,
    port,
    startedAt: new Date().toISOString()
  };
  writeState(state);
  return state;
}

export function stopDashboard(): { stopped: boolean; message: string } {
  const status = dashboardStatus();
  if (!status.running || !status.state) {
    return { stopped: false, message: 'Dashboard is not running.' };
  }
  try {
    process.kill(status.state.pid, 'SIGTERM');
  } catch {
    return { stopped: false, message: `Failed to stop dashboard process ${status.state.pid}.` };
  }
  fs.rmSync(DASHBOARD_STATE_PATH, { force: true });
  return { stopped: true, message: `Stopped dashboard process ${status.state.pid}.` };
}
