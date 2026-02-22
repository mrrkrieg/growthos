# GrowthClaw OpenClaw Skill

This skill exposes GrowthClaw to the OpenClaw agent. The agent can list and approve tasks, run workflows, view strategy and approvals, and trigger the dispatcher—all via HTTP calls to the GrowthClaw dashboard API.

## Prerequisites

- **GrowthClaw** installed and the dashboard running (or the API reachable at a known URL).
- Default dashboard URL: `http://127.0.0.1:3333`. Override with **`GROWTHCLAW_API_URL`** if your dashboard runs elsewhere (e.g. `http://localhost:3333` or a remote host).

## Installation

1. Copy this directory (`openclaw-skill/`) into OpenClaw’s skills directory, or point OpenClaw at this path (e.g. from a GrowthClaw repo clone).
2. Ensure the GrowthClaw dashboard is running: `growthclaw dashboard`.
3. If the dashboard is not on `http://127.0.0.1:3333`, set `GROWTHCLAW_API_URL` in the environment OpenClaw uses when invoking the skill (e.g. `export GROWTHCLAW_API_URL=http://127.0.0.1:3333`).

## Tools

Each tool is an HTTP request to `GROWTHCLAW_API_URL + path`. All responses are JSON.

| Tool | Description |
|------|-------------|
| `growthclaw_list_tasks` | List tasks; optional `status` query (e.g. `needs-approval`, `approved`, `done`). |
| `growthclaw_get_task` | Get one task by `taskId`. |
| `growthclaw_approve_tasks` | Approve one task (provide `taskId`) or all eligible tasks (omit `taskId`, call approve-bulk). |
| `growthclaw_run_workflow` | Run a workflow. `workflowId`: `intake-and-plan`, `execute-task`, `strategy-evolution`, or `dispatcher`. `taskArg` required for `execute-task` (task id), optional for `intake-and-plan` (e.g. website URL). |
| `growthclaw_get_approvals` | List pending approvals. |
| `growthclaw_approve_strategy` | Approve a strategy batch by `strategyVersionId`. |
| `growthclaw_get_strategy` | Get current strategy summary. |
| `growthclaw_dispatch_next` | Run the dispatcher (next approved task is executed). |
| `growthclaw_get_workflows` | List installed workflows. |

Tool definitions (method, path, parameters) are in `tools.json`. The manifest is in `skill.json`.
