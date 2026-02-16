import { Command } from 'commander';
import { installAll } from '../core/install.js';
import { assertNoRepoSecrets } from '../core/security.js';

export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Install bundled workflows, agent files, migrations, and cron jobs')
    .option('--with-dispatcher-cron', 'Install dispatcher cron every 10 minutes')
    .action((opts: { withDispatcherCron?: boolean }) => {
      assertNoRepoSecrets(process.cwd());
      const result = installAll({ withDispatcherCron: opts.withDispatcherCron });
      console.log(`Installed workflows: ${result.workflows}`);
      console.log(`Installed agents: ${result.agents}`);
      console.log(result.cron);
    });
}
