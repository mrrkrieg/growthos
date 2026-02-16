#!/usr/bin/env node
import { Command } from 'commander';
import { registerInstallCommand } from './commands/install.js';
import { registerWorkflowCommands } from './commands/workflow.js';
import { registerTaskCommands } from './commands/tasks.js';
import { registerStrategyCommands } from './commands/strategy.js';
import { registerLogsCommand } from './commands/logs.js';
import { registerDashboardCommand } from './commands/dashboard.js';
import { ensureAppDirs } from './core/config.js';
import { runMigrations } from './core/db.js';

const program = new Command();
program.name('growthos').description('GrowthOS CLI').version('0.1.0');

ensureAppDirs();
runMigrations();

registerInstallCommand(program);
registerWorkflowCommands(program);
registerTaskCommands(program);
registerStrategyCommands(program);
registerLogsCommand(program);
registerDashboardCommand(program);

program.parse();
