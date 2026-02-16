import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api';

export function CronPage() {
  const [data, setData] = useState<any>(null);

  async function load() {
    const payload = await apiGet('/api/cron/status');
    setData(payload);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, []);

  if (!data) return <div>Loading cron status...</div>;

  return (
    <div>
      <h2>Cron</h2>
      <div className="card" style={{ marginBottom: 10 }}>
        <div><strong>Schedule:</strong> {data.schedule.join(' / ')} local</div>
        <div><strong>Timezone:</strong> {data.timezone}</div>
        <div><strong>Next runs:</strong></div>
        {data.nextRuns.map((r: string) => <div className="kv" key={r}>{new Date(r).toLocaleString()}</div>)}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button onClick={async () => { await apiPost('/api/cron/run-now'); await load(); }}>Run now</button>
        <button onClick={async () => { await apiPost('/api/cron/reinstall'); await load(); }}>Reinstall cron</button>
      </div>

      <div className="card">
        <h3>Last outcomes</h3>
        <table className="table">
          <thead><tr><th>ID</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>
            {data.lastRuns.map((r: any) => <tr key={r.id}><td>{r.id}</td><td>{r.status}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>)}
          </tbody>
        </table>
        <h4>Common failure reasons</h4>
        {data.commonFailureReasons.length ? data.commonFailureReasons.map((f: string) => <div key={f} className="kv">{f}</div>) : <div className="kv">No failures in recent history.</div>}
      </div>
    </div>
  );
}
