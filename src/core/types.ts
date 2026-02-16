export type TaskStatus =
  | 'backlog'
  | 'needs-approval'
  | 'approved'
  | 'running'
  | 'eval'
  | 'revise'
  | 'blocked'
  | 'done'
  | 'archived';

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type RiskLevel = 'low' | 'medium' | 'high';

export type EvalVerdict = 'PASS' | 'REVISE' | 'ESCALATE';

export interface Task {
  id: string;
  created_at: string;
  updated_at: string;
  strategy_id: number | null;
  title: string;
  description: string;
  channel: string;
  priority: TaskPriority;
  status: TaskStatus;
  owner: string;
  acceptance_criteria_md: string;
  tools_required_json: string;
  risk_level: RiskLevel;
  depends_on_json: string;
  artifacts_json: string;
  eval_score: number | null;
  eval_verdict: EvalVerdict | null;
  retry_count: number;
  last_eval_feedback_md: string | null;
}

export interface PMTransitionInput {
  task: Task;
  latestExecutorStatus?: 'COMPLETED' | 'BLOCKED';
  evaluatorVerdict?: EvalVerdict;
  humanApproved?: boolean;
  dependenciesDone?: boolean;
  dependenciesBlocked?: boolean;
  hasRequiredChanges?: boolean;
  maxRetries?: number;
}
