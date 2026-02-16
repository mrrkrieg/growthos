import { Command } from 'commander';
import { getConfig } from '../core/app-config.js';
import { dashboardStatus, startDashboard, stopDashboard } from '../core/dashboard-process.js';

export function registerDashboardCommand(program: Command): void {
  const dashboard = program.command('dashboard').description('Start/stop/status for local dashboard');

  dashboard
    .command('start')
    .option('--port <port>', 'Override dashboard port')
    .action((opts: { port?: string }) => {
      const state = startDashboard(opts.port ? Number(opts.port) : undefined);
      console.log(`Dashboard started on http://127.0.0.1:${state.port} (pid ${state.pid})`);
    });

  dashboard.command('stop').action(() => {
    const result = stopDashboard();
    console.log(result.message);
  });

  dashboard.command('status').action(() => {
    const status = dashboardStatus();
    if (!status.running || !status.state) {
      console.log('Dashboard is not running.');
      return;
    }
    console.log(`Dashboard running on http://127.0.0.1:${status.state.port} (pid ${status.state.pid})`);
  });

  dashboard.action(() => {
    const cfg = getConfig();
    const state = startDashboard(cfg.dashboard.port);
    console.log(`Dashboard started on http://127.0.0.1:${state.port} (pid ${state.pid})`);
  });
}
