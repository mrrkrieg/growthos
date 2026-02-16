import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api';

interface ApprovalSet {
  strategyVersionId: number;
  createdAt: string;
  strategySummary: string;
  taskCount: number;
  tasks: Array<{ id: string; title: string; acceptance_criteria_md: string; risk_level: string; description: string }>;
  approvalRequest: string | null;
}

export function ApprovalsPage() {
  const [items, setItems] = useState<ApprovalSet[]>([]);

  async function load() {
    const data = await apiGet<{ approvals: ApprovalSet[] }>('/api/approvals');
    setItems(data.approvals);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, []);

  return (
    <div>
      <h2>Approvals</h2>
      {items.length === 0 ? <div className="card">No pending approval sets.</div> : items.map((item) => (
        <div className="card" key={item.strategyVersionId} style={{ marginBottom: 10 }}>
          <h3>Strategy #{item.strategyVersionId}</h3>
          <div className="kv">Created: {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</div>
          <pre>{item.strategySummary}</pre>
          <table className="table">
            <thead><tr><th>Task</th><th>Acceptance</th><th>Risk</th></tr></thead>
            <tbody>
              {item.tasks.map((t) => (
                <tr key={t.id}><td>{t.title}</td><td>{t.acceptance_criteria_md}</td><td>{t.risk_level}</td></tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={async () => { await apiPost(`/api/approvals/${item.strategyVersionId}/approve`); await load(); }}>Approve all</button>
            <button className="danger" onClick={async () => {
              const reason = prompt('Reject reason:', 'Not aligned with current priorities');
              if (!reason) return;
              await apiPost(`/api/approvals/${item.strategyVersionId}/reject`, { reason });
              await load();
            }}>Reject</button>
          </div>
        </div>
      ))}
    </div>
  );
}
