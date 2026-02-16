# GrowthOS

Marketing execution workflows for OpenClaw, with eval gates and a task pipeline.

## What You Get

- Deterministic workflows (YAML) for intake, execution, and strategy evolution
- Marketing agent roles (context, planner, executor, evaluator, PM)
- Persistent task pipeline in SQLite
- Strategy evolution cron loop (3x/day)
- Local dashboard for approvals, pipeline operations, and run visibility

## Requirements

- Node.js `>=20` (enforced in `package.json`)
- OpenClaw installed/running for full agent runtime integration
- Local shell with `crontab` available (for system cron fallback)

GrowthOS uses OpenClaw cron integration when available; otherwise it installs system cron jobs with schedule + payload bindings that call GrowthOS workflows.

## Install

Installer script (after hosting this repo):

```bash
curl -fsSL https://raw.githubusercontent.com/<org>/growthos/main/scripts/install.sh | bash
```

Alternative from OpenClaw prompt:

```text
tell OpenClaw agent: install github.com/<org>/growthos
```

Local clone install:

```bash
npm install
npm run build
npm link
growthos install --with-dispatcher-cron
```

## Quickstart

```bash
growthos install
growthos workflow run intake-and-plan "Set up GrowthOS for <company>"
growthos tasks list --status needs-approval
growthos tasks approve --all
growthos dashboard
```

Then open `http://127.0.0.1:3333`.

## How It Works

Loop:

1. Context intake from website + answers
2. Initial strategy creation
3. Task backlog generation
4. Human approval gate
5. Task execution
6. Per-task strict eval gate
7. PM transition decision

`strategy-evolution` runs 3x/day and proposes only justified additions.

## Task Pipeline Statuses

- `backlog`: created, not yet ready for approval
- `needs-approval`: ready for human review
- `approved`: execution allowed
- `running`: executor currently producing artifacts
- `eval`: awaiting evaluator verdict
- `revise`: evaluator requested specific changes
- `blocked`: human input/external blocker/escalation required
- `done`: complete and accepted
- `archived`: optional parked/retired state

## Workflows Shipped

### `intake-and-plan`

- Inputs: setup prompt / website context
- Writes: `company_context`, `strategy_versions`, `tasks`, `task_events`
- Outputs: `APPROVAL_REQUEST.md`

### `execute-task`

- Inputs: approved task id
- Writes: task artifacts in `~/.growthos/tasks/<task-id>/`, task status transitions, eval fields, task events
- Outputs: evaluator verdict and transition to `done` / `revise` / `blocked`

### `strategy-evolution`

- Inputs: latest context + strategy + tasks + outcomes
- Writes: new proposal tasks (when needed), approval summary updates
- Outputs: updated `APPROVAL_REQUEST.md`

## Dashboard

Start/stop/status commands:

```bash
growthos dashboard
growthos dashboard stop
growthos dashboard status
```

Key screens:

- Tasks Kanban
- Task detail (artifacts, eval, PM reasons, history)
- Approvals
- Strategy
- Runs
- Cron
- Logs
- Settings

All UI actions call guarded GrowthOS backend endpoints using the same PM transition rules as CLI.

## Cron Schedule

Default strategy evolution schedule (local time):

- `09:00`
- `13:00`
- `17:00`

Manual trigger:

```bash
growthos workflow run strategy-evolution
```

Reinstall cron from dashboard or CLI install command.

## Configuration

Config file:

- `~/.growthos/config.json`

Supported keys:

- `dashboard.port`
- `safeMode.draftOnly`
- `safeMode.allowForceMoves`
- `limits.maxRetries`
- `cron.strategyEvolution.times`
- `integrations.*` placeholders

You can also relocate runtime root with `GROWTHOS_HOME` in future versions (planned).

## Security Model

- Draft-only publishing defaults enabled
- Human approval gate before execution
- Retry caps for revise loops
- PM guarded transitions (no bypass unless force is explicitly allowed)
- Secrets are never committed to repo; use environment variables
- Dashboard sanitizes logs/artifacts to avoid secret leakage
- Optional dashboard basic auth via `GROWTHOS_DASHBOARD_BASIC_AUTH=1`

## Build Your Own Workflows

Minimal workflow example:

```yaml
id: custom-workflow
name: Custom Workflow
trigger: manual
runtime: openclaw
steps:
  - id: plan
    agent: strategy_planner
    tools: [files]
  - id: execute
    agent: executor
    tools: [files, web]
  - id: evaluate
    agent: task_eval
    tools: [files]
```

Keep eval/verdict gates explicit and route transitions through PM rules.

## Commands

```bash
growthos install
growthos workflow list
growthos workflow install <id>
growthos workflow run <id> "<task>"
growthos tasks list [--status ...]
growthos tasks view <task-id>
growthos tasks approve <task-id>
growthos tasks approve --all
growthos tasks edit <task-id> [--patch '{"priority":"P0"}']
growthos tasks move <task-id> <status> [--force]
growthos tasks comment <task-id> "<text>"
growthos strategy current
growthos strategy history
growthos logs [<lines>]
growthos dashboard
growthos dashboard stop
growthos dashboard status
```

## Contributing

- Add workflows in `resources/workflows/*.yml`
- Add/adjust agent rubrics in `resources/agents/*.md`
- Extend API in `src/dashboard/server.ts`
- Extend UI in `dashboard/src/pages/*`
- Run checks:

```bash
npm run typecheck
npm run build
```
