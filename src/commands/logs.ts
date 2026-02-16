import { Command } from 'commander';
import { readLogs } from '../core/logger.js';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs')
    .argument('[lines]', 'Number of lines', '100')
    .description('Show recent GrowthOS logs')
    .action((linesRaw: string) => {
      const lines = Number(linesRaw);
      if (Number.isNaN(lines) || lines <= 0) {
        throw new Error('lines must be a positive number');
      }
      const out = readLogs(lines);
      console.log(out || 'No logs yet.');
    });
}
