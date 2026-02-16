CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS company_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  website_url TEXT NOT NULL,
  source_hash TEXT,
  raw_website_excerpt TEXT,
  intake_answers_json TEXT NOT NULL,
  state_model_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS strategy_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  context_id INTEGER NOT NULL,
  summary_md TEXT NOT NULL,
  assumptions_json TEXT NOT NULL,
  constraints_json TEXT NOT NULL,
  kpis_json TEXT NOT NULL,
  FOREIGN KEY (context_id) REFERENCES company_context(id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  strategy_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  channel TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  owner TEXT NOT NULL,
  acceptance_criteria_md TEXT NOT NULL,
  tools_required_json TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  depends_on_json TEXT NOT NULL,
  artifacts_json TEXT NOT NULL,
  eval_score INTEGER,
  eval_verdict TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_eval_feedback_md TEXT,
  FOREIGN KEY (strategy_id) REFERENCES strategy_versions(id)
);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id);
CREATE INDEX IF NOT EXISTS idx_runs_workflow_id ON runs(workflow_id);
