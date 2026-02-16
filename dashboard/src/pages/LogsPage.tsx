import { useEffect, useState } from 'react';
import { apiGet } from '../api';

export function LogsPage() {
  const [logs, setLogs] = useState('');

  async function load() {
    const payload = await apiGet<{ logs: string }>('/api/logs?lines=300');
    setLogs(payload.logs);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, []);

  return (
    <div>
      <h2>Logs</h2>
      <button onClick={() => load().catch((e) => alert(e.message))}>Refresh</button>
      <pre>{logs || 'No logs yet.'}</pre>
    </div>
  );
}
