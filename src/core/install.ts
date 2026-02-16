import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import {
  AGENTS_DIR,
  BUNDLED_AGENTS_DIR,
  BUNDLED_WORKFLOWS_DIR,
  WORKFLOWS_DIR,
  ensureAppDirs
} from './config.js';
import { copyDirectory } from './files.js';
import { runMigrations } from './db.js';
import { logLine } from './logger.js';

export interface InstallOptions {
  withDispatcherCron?: boolean;
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function reinstallCronJobs(withDispatcherCron: boolean): { installed: boolean; details: string } {
  if (!commandExists('crontab')) {
    return { installed: false, details: 'crontab command not available; skipped cron setup.' };
  }

  const growthclawPath = commandExists('growthclaw') ? 'growthclaw' : `node ${path.resolve(process.cwd(), 'dist/cli.js')}`;
  const managedStart = '# BEGIN GROWTHCLAW';
  const managedEnd = '# END GROWTHCLAW';

  let current = '';
  try {
    current = execSync('crontab -l', { encoding: 'utf8' });
  } catch {
    current = '';
  }

  const cleaned = current
    .split('\n')
    .filter((line) => !line.includes(managedStart) && !line.includes(managedEnd) && !line.includes('growthclaw workflow run strategy-evolution') && !line.includes('growthclaw workflow run dispatcher'))
    .join('\n')
    .trim();

  const lines = [
    managedStart,
    `0 9,13,17 * * * cd ${process.cwd()} && ${growthclawPath} workflow run strategy-evolution >> ~/.growthclaw/logs/cron.log 2>&1`
  ];
  if (withDispatcherCron) {
    lines.push(`*/10 * * * * cd ${process.cwd()} && ${growthclawPath} workflow run dispatcher >> ~/.growthclaw/logs/cron.log 2>&1`);
  }
  lines.push(managedEnd);

  const newCrontab = `${cleaned}\n${lines.join('\n')}\n`;
  execSync('crontab -', { input: newCrontab, encoding: 'utf8' });
  return { installed: true, details: 'Installed cron jobs for strategy-evolution and optional dispatcher.' };
}

export function installAll(options: InstallOptions = {}): { cron: string; workflows: number; agents: number } {
  ensureAppDirs();
  runMigrations();

  copyDirectory(BUNDLED_WORKFLOWS_DIR, WORKFLOWS_DIR);
  copyDirectory(BUNDLED_AGENTS_DIR, AGENTS_DIR);

  const workflows = fs.existsSync(WORKFLOWS_DIR)
    ? fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml')).length
    : 0;
  const agents = fs.existsSync(AGENTS_DIR)
    ? fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')).length
    : 0;

  const cron = reinstallCronJobs(Boolean(options.withDispatcherCron));
  logLine(`install complete workflows=${workflows} agents=${agents} cron=${cron.installed}`);

  return {
    cron: cron.details,
    workflows,
    agents
  };
}
