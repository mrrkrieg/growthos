# GrowthClaw

**GrowthClaw** is an open-source marketing operating system that runs alongside [OpenClaw](https://github.com/openclaw/openclaw). It turns high-level marketing goals into a structured task pipeline: context intake, strategy, human approval, execution, and strict evaluation—so your agent-driven marketing stays on strategy and under control.

---

## What is GrowthClaw?

GrowthClaw gives you:

- **Structured marketing workflows** — YAML-defined flows for intake, planning, execution, and strategy evolution, with clear inputs and outputs.
- **Agent roles with guardrails** — Dedicated roles (context analyzer, strategy planner, task planner, executor, evaluator, PM) with rubrics and eval gates so outputs are consistent and reviewable.
- **Human-in-the-loop** — Every batch of tasks goes through an approval step before execution; you see what will run and can approve or reject.
- **Persistent pipeline** — Tasks live in SQLite with statuses (backlog → needs-approval → approved → running → eval → done/revise/blocked). History, comments, and artifacts are kept.
- **Local dashboard** — Web UI for Kanban, approvals, strategy, runs, cron, and logs. Same rules as the CLI; no surprise behavior.
- **Strategy evolution on a schedule** — A cron loop (default 3×/day) reviews context and outcomes and proposes only justified new tasks, keeping the backlog aligned with reality.

You run GrowthClaw locally. When OpenClaw is available, it can drive or complement these workflows; otherwise GrowthClaw can use system cron and its own execution path.

---

## Who is it for?

- Teams using **OpenClaw** (or similar agents) for marketing and want a **repeatable process** instead of ad-hoc prompts.
- People who want **approval gates** and **eval checks** before anything goes live.
- Anyone who wants a **single place** (dashboard + CLI) to see tasks, strategy, and run history.

---

## Key features

| Feature | Description |
|--------|-------------|
| **Deterministic workflows** | Intake, plan, execute, and evolve strategy via YAML workflows with fixed steps and outputs. |
| **Marketing agent roles** | Context, strategy planner, task planner, executor, evaluator, PM—each with a rubric in `resources/agents/`. |
| **Task pipeline** | SQLite-backed tasks with statuses, dependencies, priority, acceptance criteria, and events. |
| **Approval gate** | Tasks move to `needs-approval`; you approve (CLI or dashboard) before they can run. |
| **Eval gate** | After execution, an evaluator scores and verdicts (PASS/REVISE/ESCALATE); PM rules decide the next status. |
| **Strategy evolution** | Cron job (e.g. 09:00, 13:00, 17:00) suggests new tasks based on context and outcomes; you approve via the same flow. |
| **Local dashboard** | Tasks Kanban, task detail, approvals, strategy, runs, cron, logs, settings—all via the same backend rules as CLI. |
| **Safe defaults** | Draft-only publishing, retry caps, and optional basic auth for the dashboard. |

---

## Requirements

- **Node.js** `>=20` (enforced in `package.json`)
- **OpenClaw** installed and running if you want full agent runtime integration
- **crontab** available on your system for the strategy-evolution and optional dispatcher cron (or use OpenClaw’s cron when configured)

GrowthClaw can use OpenClaw’s cron integration when available; otherwise it installs system cron entries that invoke its workflows.

---

## Installation

### Option 1: Installer script (after you host this repo)

```bash
curl -fsSL https://raw.githubusercontent.com/<org>/growthclaw/main/scripts/install.sh | bash
```

### Option 2: From an OpenClaw prompt

```text
tell OpenClaw agent: install github.com/<org>/growthclaw
```

### Option 3: Local clone

```bash
git clone https://github.com/<org>/growthclaw.git
cd growthclaw
npm install
npm run build
npm link
growthclaw install --with-dispatcher-cron
```

After install, workflows and agent rubrics are copied into `~/.growthclaw/`, the database is created, and (unless you use OpenClaw cron) system cron is set for strategy-evolution and optionally the dispatcher.

---

## Quick start

1. **Install and bootstrap**

   ```bash
   growthclaw install
   ```

2. **Run intake and plan** (e.g. for a company/website)

   ```bash
   growthclaw workflow run intake-and-plan "Set up GrowthClaw for Acme Corp"
   ```

   This produces context, strategy, and a first batch of tasks, and writes `APPROVAL_REQUEST.md` in the current directory.

3. **Review and approve tasks**

   ```bash
   growthclaw tasks list --status needs-approval
   growthclaw tasks approve --all
   ```

   Or use the dashboard (see below).

4. **Start the dashboard**

   ```bash
   growthclaw dashboard
   ```

   Open **http://127.0.0.1:3333** for the web UI (Kanban, approvals, strategy, runs, cron, logs).

5. **Run the dispatcher** (picks one approved task and runs it)

   Either let the optional dispatcher cron do it, or:

   ```bash
   growthclaw workflow run dispatcher
   ```

   Then run `execute-task` for a specific task, or trigger it from the dashboard.

---

## How it works

### The marketing loop

1. **Context intake** — Website content and intake answers are turned into a structured business/marketing state model.
2. **Initial strategy** — A 30-day strategy (summary, KPIs, constraints, “what not to do”) is created from that context.
3. **Task backlog** — The task planner produces a prioritized list of tasks (with acceptance criteria, tools, risk level).
4. **Human approval** — Tasks sit in `needs-approval` until you approve them (CLI or dashboard).
5. **Task execution** — Approved tasks are run by the executor; artifacts are written under `~/.growthclaw/tasks/<task-id>/`.
6. **Eval gate** — The evaluator scores the work and returns PASS, REVISE, or ESCALATE; PM rules move the task to `done`, `revise`, or `blocked`.
7. **Strategy evolution** — On a schedule (default 3×/day), GrowthClaw reviews context and outcomes and proposes new tasks when justified; again you approve before they run.

Nothing goes “live” without going through this pipeline; draft-only and approval gates are the default.

### Task pipeline statuses

| Status | Meaning |
|--------|--------|
| `backlog` | Created, not yet ready for approval |
| `needs-approval` | Ready for human review |
| `approved` | Execution allowed |
| `running` | Executor is producing artifacts |
| `eval` | Awaiting evaluator verdict |
| `revise` | Evaluator requested specific changes |
| `blocked` | Human input or external blocker |
| `done` | Complete and accepted |
| `archived` | Parked or retired |

---

## Workflows

### `intake-and-plan`

- **Inputs:** Setup prompt / website URL or context.
- **Writes:** `company_context`, `strategy_versions`, `tasks`, `task_events` in the DB; generates `APPROVAL_REQUEST.md` in the project directory.
- **Use when:** You’re onboarding a new company or refreshing context and strategy.

### `execute-task`

- **Inputs:** An approved task id.
- **Writes:** Task artifacts in `~/.growthclaw/tasks/<task-id>/`, status transitions, eval fields, task events.
- **Outputs:** Evaluator verdict and transition to `done`, `revise`, or `blocked`.

### `strategy-evolution`

- **Inputs:** Latest context, strategy, tasks, and outcomes.
- **Writes:** New proposed tasks (when needed), approval summary updates; updates `APPROVAL_REQUEST.md`.
- **Use when:** Run on a schedule (cron) or manually to keep the backlog aligned with current goals.

### `dispatcher`

- Picks the next eligible approved task (by priority and dependencies) and runs `execute-task` for it. Used by the optional every-10-min cron or manually.

---

## Dashboard

Start, stop, or check the dashboard:

```bash
growthclaw dashboard
growthclaw dashboard stop
growthclaw dashboard status
```

Then open **http://127.0.0.1:3333**.

**Screens:**

- **Tasks** — Kanban view and task detail (artifacts, eval, PM reasons, history).
- **Approvals** — Pending strategy/task approvals; approve or reject.
- **Strategy** — Current and past strategy versions.
- **Runs** — Workflow run history and logs.
- **Cron** — Next run times, reinstall, run-now.
- **Logs** — Recent GrowthClaw logs.
- **Settings** — Config (e.g. dashboard port, safe mode, limits).

All actions go through the same backend and PM rules as the CLI.

---

## OpenClaw skill

GrowthClaw ships an **OpenClaw skill** in `openclaw-skill/`. It gives the OpenClaw agent tools to list and approve tasks, run workflows, view strategy and approvals, and trigger the dispatcher—all via the GrowthClaw dashboard API.

**Install:** Copy the `openclaw-skill/` directory into OpenClaw’s skills directory, or point OpenClaw at this path (e.g. from a GrowthClaw repo clone). See [openclaw-skill/README.md](openclaw-skill/README.md) for details.

**Prerequisite:** The GrowthClaw dashboard must be running so the API is available (default `http://127.0.0.1:3333`). If the dashboard runs elsewhere, set `GROWTHCLAW_API_URL` in the environment OpenClaw uses when invoking the skill.

---

## Cron schedule

By default, strategy evolution runs at **09:00**, **13:00**, and **17:00** (local time). The optional **dispatcher** cron runs every 10 minutes when installed with `--with-dispatcher-cron`.

Manual run:

```bash
growthclaw workflow run strategy-evolution
```

You can reinstall or change cron from the dashboard or by re-running `growthclaw install` with the desired options.

---

## Configuration

- **Config file:** `~/.growthclaw/config.json`
- **Runtime root:** Overridable with `GROWTHCLAW_HOME` (future versions).

**Example config keys:**

- `dashboard.port` — Dashboard port (default 3333).
- `safeMode.draftOnly` — Enforce draft-only publishing.
- `safeMode.allowForceMoves` — Allow force-moving task statuses.
- `limits.maxRetries` — Max revise attempts per task.
- `cron.strategyEvolution.times` — Times for strategy-evolution (e.g. `["09:00","13:00","17:00"]`).
- `integrations.*` — Placeholders for OpenClaw and other integrations.

---

## Security

- **Draft-first** — No live publishing by default.
- **Approval gate** — Human approval before execution.
- **Retry caps** — Limit revise loops per task.
- **PM rules** — Status transitions are rule-based; no bypass unless force is explicitly allowed.
- **Secrets** — Not committed; use environment variables.
- **Dashboard** — Binds to `127.0.0.1`; optional basic auth:
  - `GROWTHCLAW_DASHBOARD_BASIC_AUTH=1`
  - `GROWTHCLAW_DASHBOARD_USER=<user>`
  - `GROWTHCLAW_DASHBOARD_PASS=<pass>`

Logs and artifacts are sanitized in the dashboard to reduce secret leakage.

---

## Building your own workflows

Workflows live under `resources/workflows/` as YAML. Minimal example:

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

Keep eval/verdict gates explicit and route transitions through PM rules. Agent rubrics are in `resources/agents/*.md`.

---

## Command reference

| Command | Description |
|--------|-------------|
| `growthclaw install` | Install workflows, agents, DB, and cron |
| `growthclaw workflow list` | List installed workflows |
| `growthclaw workflow install <id>` | Install a bundled workflow by id |
| `growthclaw workflow run <id> "<task>"` | Run a workflow with optional task/payload |
| `growthclaw tasks list [--status ...]` | List tasks (optional status filter) |
| `growthclaw tasks view <task-id>` | Show task detail |
| `growthclaw tasks approve <task-id>` | Approve one task |
| `growthclaw tasks approve --all` | Approve all eligible tasks |
| `growthclaw tasks edit <task-id> [--patch '...']` | Edit task (e.g. priority) |
| `growthclaw tasks move <task-id> <status> [--force]` | Move task to status |
| `growthclaw tasks comment <task-id> "<text>"` | Add comment to task |
| `growthclaw strategy current` | Show current strategy |
| `growthclaw strategy history` | List strategy versions |
| `growthclaw logs [<lines>]` | Show recent logs |
| `growthclaw dashboard` | Start dashboard |
| `growthclaw dashboard stop` | Stop dashboard |
| `growthclaw dashboard status` | Show dashboard status |

---

## Contributing

- Add or change workflows in `resources/workflows/*.yml`.
- Add or adjust agent rubrics in `resources/agents/*.md`.
- Extend the API in `src/dashboard/server.ts`.
- Extend the UI in `dashboard/src/pages/*`.

Run checks:

```bash
npm run typecheck
npm run build
```

---

## License

MIT. See [LICENSE](LICENSE).
