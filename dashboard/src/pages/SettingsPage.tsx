import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api';

export function SettingsPage() {
  const [cfg, setCfg] = useState<any>(null);

  async function load() {
    const data = await apiGet<any>('/api/config');
    setCfg(data);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, []);

  if (!cfg) return <div>Loading settings...</div>;

  return (
    <div>
      <h2>Settings</h2>
      <div className="card">
        <div style={{ marginBottom: 10 }}>
          <label>
            <input
              type="checkbox"
              checked={cfg.safeMode.draftOnly}
              onChange={async (e) => {
                const next = await apiPost('/api/config', { safeMode: { ...cfg.safeMode, draftOnly: e.target.checked } });
                setCfg(next);
              }}
            /> Draft-only publishing
          </label>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>
            <input
              type="checkbox"
              checked={cfg.safeMode.allowForceMoves}
              onChange={async (e) => {
                const next = await apiPost('/api/config', { safeMode: { ...cfg.safeMode, allowForceMoves: e.target.checked } });
                setCfg(next);
              }}
            /> Allow force moves
          </label>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Max retries: </label>
          <input
            type="number"
            min={0}
            max={5}
            value={cfg.limits.maxRetries}
            onChange={async (e) => {
              const value = Number(e.target.value);
              const next = await apiPost('/api/config', { limits: { maxRetries: value } });
              setCfg(next);
            }}
          />
        </div>

        <div><strong>Dashboard port:</strong> {cfg.dashboard.port}</div>
        <div><strong>Cron times:</strong> {cfg.cron.strategyEvolution.times.join(', ')}</div>
        <div><strong>Integrations (read-only v0.1):</strong> {JSON.stringify(cfg.integrations)}</div>
      </div>
    </div>
  );
}
