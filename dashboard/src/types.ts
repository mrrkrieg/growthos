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

export interface TaskCard {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  channel: string;
  owner: string;
  updated_at: string;
  eval_score?: number | null;
  eval_verdict?: string | null;
  blocked_reason?: string | null;
}
