import { useEffect, useState } from 'react';
import { apiGet } from '../api';

export function RunsPage() {
  const [runs, setRuns] = useState<Array<{ id: number; workflow_id: string; created_at: string; status: string }>>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);

  async function load() {
    const data = await apiGet<{ runs: Array<{ id: number; workflow_id: string; created_at: string; status: string }> }>('/api/runs');
    setRuns(data.runs);
  }

  useEffect(() => { load().catch((e) => alert(e.message)); }, []);

  useEffect(() => {
    if (!selected) return;
    apiGet(`/api/runs/${selected}`).then(setDetail).catch((e) => alert(e.message));
  }, [selected]);

  return (
    <div>
      <h2>Runs</h2>
      <div className="grid2">
        <div className="card">
          <table className="table">
            <thead><tr><th>ID</th><th>Workflow</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} onClick={() => setSelected(r.id)} style={{ cursor: 'pointer' }}>
                  <td>{r.id}</td><td>{r.workflow_id}</td><td>{r.status}</td><td>{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {!selected || !detail ? <div>Select a run.</div> : (
            <>
              <h3>Run #{selected}</h3>
              <pre>{JSON.stringify(detail.run, null, 2)}</pre>
              <h4>Steps</h4>
              <pre>{JSON.stringify(detail.steps, null, 2)}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
