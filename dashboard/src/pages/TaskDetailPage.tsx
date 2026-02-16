import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api';

interface TaskDetailPayload {
  task: Record<string, any>;
  artifacts: Array<{ path: string; preview: string }>;
  eval_feedback: Record<string, any>;
  history: Array<{ id: number; created_at: string; event_type: string; payload: Record<string, any> }>;
  pm_reason: Record<string, any> | null;
}

export function TaskDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<TaskDetailPayload | null>(null);
  const [tab, setTab] = useState<'summary' | 'artifacts' | 'eval' | 'history' | 'actions'>('summary');
  const [comment, setComment] = useState('');

  async function load() {
    if (!id) return;
    const payload = await apiGet<TaskDetailPayload>(`/api/tasks/${id}`);
    setData(payload);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, [id]);

  if (!id) return <div>Missing task id</div>;
  if (!data) return <div>Loading task...</div>;

  return (
    <div>
      <h2>{data.task.title}</h2>
      <div className="kv">{data.task.id} • {data.task.status} • {data.task.priority}</div>
      <div className="tabs">
        <button className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Summary</button>
        <button className={tab === 'artifacts' ? 'active' : ''} onClick={() => setTab('artifacts')}>Artifacts</button>
        <button className={tab === 'eval' ? 'active' : ''} onClick={() => setTab('eval')}>Eval</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>History</button>
        <button className={tab === 'actions' ? 'active' : ''} onClick={() => setTab('actions')}>Actions</button>
      </div>

      {tab === 'summary' && (
        <div className="card">
          <p><strong>Objective</strong><br />{data.task.description}</p>
          <p><strong>Acceptance Criteria</strong><br />{data.task.acceptance_criteria_md}</p>
          <p><strong>Dependencies</strong><br />{data.task.depends_on_json}</p>
          <p><strong>Tools Required</strong><br />{data.task.tools_required_json}</p>
          <p><strong>PM Reason</strong><br />{data.pm_reason ? JSON.stringify(data.pm_reason, null, 2) : 'No PM move reason yet.'}</p>
        </div>
      )}

      {tab === 'artifacts' && (
        <div>
          {data.artifacts.length === 0 ? <div className="card">No artifacts.</div> : data.artifacts.map((a) => (
            <div key={a.path} className="card" style={{ marginBottom: 10 }}>
              <strong>{a.path}</strong>
              <pre>{a.preview}</pre>
            </div>
          ))}
        </div>
      )}

      {tab === 'eval' && (
        <div className="card">
          <div><strong>Verdict:</strong> {data.task.eval_verdict || '-'}</div>
          <div><strong>Score:</strong> {data.task.eval_score ?? '-'}</div>
          <pre>{JSON.stringify(data.eval_feedback, null, 2)}</pre>
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          {data.history.map((h) => (
            <div key={h.id} style={{ marginBottom: 10 }}>
              <div><strong>{h.event_type}</strong> at {new Date(h.created_at).toLocaleString()}</div>
              <pre>{JSON.stringify(h.payload, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}

      {tab === 'actions' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={async () => { await apiPost(`/api/tasks/${id}/approve`); await load(); }}>Approve</button>
            <button onClick={async () => { await apiPost(`/api/tasks/${id}/run`); await load(); }}>Run task</button>
            <button onClick={async () => {
              const toStatus = prompt('Move to status:');
              if (!toStatus) return;
              await apiPost(`/api/tasks/${id}/move`, { toStatus });
              await load();
            }}>Move status</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add comment" style={{ flex: 1, padding: 8 }} />
            <button onClick={async () => {
              await apiPost(`/api/tasks/${id}/comment`, { text: comment });
              setComment('');
              await load();
            }}>Add comment</button>
          </div>
        </div>
      )}
    </div>
  );
}
