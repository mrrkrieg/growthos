import fs from 'node:fs';
import { LOG_FILE, ensureAppDirs } from './config.js';

function nowIso(): string {
  return new Date().toISOString();
}

export function logLine(message: string): void {
  ensureAppDirs();
  fs.appendFileSync(LOG_FILE, `[${nowIso()}] ${message}\n`, 'utf8');
}

export function readLogs(lines = 100): string {
  ensureAppDirs();
  if (!fs.existsSync(LOG_FILE)) {
    return '';
  }
  const all = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
  return all.slice(-lines).join('\n');
}
