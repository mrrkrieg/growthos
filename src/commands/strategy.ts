import { Command } from 'commander';
import { db } from '../core/db.js';

export function registerStrategyCommands(program: Command): void {
  const strategy = program.command('strategy').description('View strategy versions');

  strategy
    .command('current')
    .description('Show current strategy')
    .action(() => {
      const row = db().prepare('SELECT * FROM strategy_versions ORDER BY created_at DESC LIMIT 1').get() as
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
        console.log('No strategy found. Run intake-and-plan first.');
        return;
      }

      console.log(`# Strategy ${row.id} (${row.created_at})`);
      console.log('');
      console.log(row.summary_md);
      console.log('');
      console.log(`KPIs: ${row.kpis_json}`);
      console.log(`Assumptions: ${row.assumptions_json}`);
      console.log(`Constraints: ${row.constraints_json}`);
    });

  strategy
    .command('history')
    .description('Show strategy version history')
    .action(() => {
      const rows = db()
        .prepare('SELECT id, created_at, substr(summary_md, 1, 120) AS summary FROM strategy_versions ORDER BY created_at DESC')
        .all() as Array<{ id: number; created_at: string; summary: string }>;
      if (!rows.length) {
        console.log('No strategy history found.');
        return;
      }
      for (const r of rows) {
        console.log(`${r.id}\t${r.created_at}\t${r.summary}`);
      }
    });
}
