import { Command } from 'commander';
import { installWorkflowBundle, listInstalledWorkflows, runWorkflow } from '../core/workflows.js';
import { assertNoRepoSecrets } from '../core/security.js';

export function registerWorkflowCommands(program: Command): void {
  const workflow = program.command('workflow').description('Manage workflows');

  workflow
    .command('list')
    .description('List installed workflows')
    .action(() => {
      const rows = listInstalledWorkflows();
      if (!rows.length) {
        console.log('No workflows installed. Run: growthclaw install');
        return;
      }
      for (const row of rows) {
        console.log(`${row.id}\t${row.trigger}\t${row.name}`);
      }
    });

  workflow
    .command('install')
    .argument('<id>', 'Workflow id')
    .description('Install a bundled workflow by id')
    .action((id: string) => {
      const out = installWorkflowBundle(id);
      console.log(`Installed workflow to ${out}`);
    });

  workflow
    .command('run')
    .argument('<id>', 'Workflow id')
    .argument('[task]', 'Task payload or task id')
    .description('Run a workflow')
    .action((id: string, task?: string) => {
      assertNoRepoSecrets(process.cwd());
      const result = runWorkflow(id, task);
      console.log(JSON.stringify(result, null, 2));
    });
}
