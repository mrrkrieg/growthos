import type { PMTransitionInput, TaskStatus } from './types.js';

export interface PMDecision {
  task_id: string;
  from_status: TaskStatus;
  to_status: TaskStatus;
  actions: Array<{ type: 'comment' | 'notify' | 'enqueue_workflow' | 'update_fields'; payload: Record<string, unknown> }>;
  reason: string;
}

export function decideTransition(input: PMTransitionInput): PMDecision {
  const t = input.task;
  const maxRetries = input.maxRetries ?? 2;
  const from = t.status;
  let to: TaskStatus = from;
  let reason = 'No valid transition available under deterministic PM rules.';
  const actions: PMDecision['actions'] = [];

  if (from === 'backlog') {
    const hasRequiredFields =
      Boolean(t.title?.trim()) &&
      Boolean(t.description?.trim()) &&
      Boolean(t.acceptance_criteria_md?.trim()) &&
      Boolean(t.tools_required_json?.trim()) &&
      Boolean(t.risk_level?.trim());
    if (hasRequiredFields) {
      to = 'needs-approval';
      reason = 'Task has all required planning fields and can move to human approval queue.';
    } else {
      reason = 'Task is missing required planning fields for needs-approval transition.';
    }
  }

  if (from === 'needs-approval') {
    if (input.humanApproved) {
      to = 'approved';
      reason = 'Task was explicitly approved by human reviewer.';
    } else {
      reason = 'Task requires explicit human approval flag before execution.';
    }
  }

  if (from === 'approved') {
    if (input.dependenciesBlocked) {
      reason = 'Dependency is blocked; approved task cannot start.';
    } else if (input.dependenciesDone === false) {
      reason = 'Dependencies are not done; approved task cannot start.';
    } else {
      to = 'running';
      reason = 'Task is approved and dependency conditions are satisfied.';
      actions.push({ type: 'enqueue_workflow', payload: { workflow_id: 'execute-task', task_id: t.id } });
    }
  }

  if (from === 'running') {
    if (input.latestExecutorStatus === 'COMPLETED') {
      to = 'eval';
      reason = 'Executor completed artifacts; task now enters evaluation.';
      actions.push({ type: 'enqueue_workflow', payload: { workflow_id: 'task-eval', task_id: t.id } });
    } else if (input.latestExecutorStatus === 'BLOCKED') {
      to = 'blocked';
      reason = 'Executor reported blocker requiring human/external input.';
      actions.push({ type: 'notify', payload: { channel: 'human', message: `Task ${t.id} blocked by executor.` } });
    } else {
      reason = 'Running task has no executor status update.';
    }
  }

  if (from === 'eval') {
    if (input.evaluatorVerdict === 'PASS') {
      to = 'done';
      reason = 'Task evaluator returned PASS.';
    } else if (input.evaluatorVerdict === 'REVISE') {
      if (t.retry_count < maxRetries) {
        to = 'revise';
        reason = 'Task evaluator requested revisions within retry budget.';
        actions.push({ type: 'update_fields', payload: { retry_count: t.retry_count + 1 } });
      } else {
        to = 'blocked';
        reason = `Retry budget exhausted (${maxRetries}).`;
        actions.push({ type: 'notify', payload: { channel: 'human', message: `Task ${t.id} exceeded retry limit.` } });
      }
    } else if (input.evaluatorVerdict === 'ESCALATE') {
      to = 'blocked';
      reason = 'Task evaluator escalated due to risk, direction mismatch, or missing critical info.';
      actions.push({ type: 'notify', payload: { channel: 'human', message: `Task ${t.id} escalated by evaluator.` } });
    }
  }

  if (from === 'revise') {
    if (!input.hasRequiredChanges) {
      reason = 'Revision task has no required_changes attached yet.';
    } else if (input.dependenciesBlocked || input.dependenciesDone === false) {
      reason = 'Dependencies not satisfied for revise -> running transition.';
    } else {
      to = 'running';
      reason = 'Revision task has required changes and can re-enter execution.';
      actions.push({ type: 'enqueue_workflow', payload: { workflow_id: 'execute-task', task_id: t.id } });
    }
  }

  return {
    task_id: t.id,
    from_status: from,
    to_status: to,
    actions,
    reason
  };
}
