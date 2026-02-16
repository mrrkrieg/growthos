import { useEffect, useState } from 'react';
import { apiGet } from '../api';

interface StrategyRow {
  id: number;
  created_at: string;
  summary_md: string;
  kpis_json: string;
  assumptions_json: string;
  constraints_json: string;
}

export function StrategyPage() {
  const [current, setCurrent] = useState<StrategyRow | null>(null);
  const [history, setHistory] = useState<StrategyRow[]>([]);
  const [detail, setDetail] = useState<any | null>(null);

  async function load() {
    const c = await apiGet<StrategyRow>('/api/strategy/current').catch(() => null);
    const h = await apiGet<{ items: StrategyRow[] }>('/api/strategy/history');
    setCurrent(c);
    setHistory(h.items);
    if (c) {
      const d = await apiGet<any>(`/api/strategy/${c.id}`);
      setDetail(d);
    }
  }

  useEffect(() => { load().catch((e) => alert(e.message)); }, []);

  return (
    <div>
      <h2>Strategy</h2>
      {current ? (
        <div className="card" style={{ marginBottom: 10 }}>
          <h3>Current Strategy #{current.id}</h3>
          <pre>{current.summary_md}</pre>
          <div className="kv">KPIs: {current.kpis_json}</div>
          <div className="kv">Constraints: {current.constraints_json}</div>
        </div>
      ) : <div className="card">No strategy available.</div>}

      {detail ? (
        <div className="card" style={{ marginBottom: 10 }}>
          <h3>Changes from previous strategy</h3>
          <pre>{JSON.stringify(detail.changes, null, 2)}</pre>
        </div>
      ) : null}

      <div className="card">
        <h3>History</h3>
        <table className="table">
          <thead><tr><th>ID</th><th>Created</th><th>Summary</th></tr></thead>
          <tbody>
            {history.map((s) => <tr key={s.id}><td>{s.id}</td><td>{new Date(s.created_at).toLocaleString()}</td><td>{s.summary_md.slice(0, 140)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
