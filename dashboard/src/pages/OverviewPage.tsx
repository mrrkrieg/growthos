import { useEffect, useState } from 'react';
import { apiGet } from '../api';

interface OverviewPayload {
  counts: Record<string, number>;
  blocked: Array<{ id: string; title: string; reason: string | null }>;
  strategy?: { id: number; created_at: string; summary_md: string };
  runs: Array<{ id: number; workflow_id: string; created_at: string; status: string }>;
  strategyEvolution: { lastRun: unknown; nextRuns: string[] };
}

export function OverviewPage() {
  const [data, setData] = useState<OverviewPayload | null>(null);

  useEffect(() => {
    apiGet<OverviewPayload>('/api/overview').then(setData).catch((e) => alert(e.message));
  }, []);

  if (!data) return <div>Loading overview...</div>;

  return (
    <div>
      <h2>Overview</h2>
      <div className="grid2">
        <div className="card">
          <h3>Task counts by status</h3>
          {Object.entries(data.counts).map(([k, v]) => (
            <div key={k} className="kv">{k}: {v}</div>
          ))}
        </div>
        <div className="card">
          <h3>Strategy evolution cadence</h3>
          <div className="kv">Next runs:</div>
          {data.strategyEvolution.nextRuns.map((r) => <div key={r} className="kv">{new Date(r).toLocaleString()}</div>)}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 10 }}>
        <div className="card">
          <h3>What is blocked</h3>
          {data.blocked.length === 0 ? <div className="kv">Nothing blocked.</div> : data.blocked.map((b) => (
            <div key={b.id} style={{ marginBottom: 8 }}>
              <div><strong>{b.id}</strong> {b.title}</div>
              <div className="kv">{b.reason || 'No reason available.'}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Latest strategy</h3>
          {data.strategy ? <pre>{data.strategy.summary_md}</pre> : <div className="kv">No strategy yet.</div>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <h3>Latest runs</h3>
        <table className="table">
          <thead><tr><th>ID</th><th>Workflow</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>
            {data.runs.map((r) => (
              <tr key={r.id}><td>{r.id}</td><td>{r.workflow_id}</td><td>{r.status}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
