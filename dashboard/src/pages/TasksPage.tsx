import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api';
import type { TaskCard, TaskStatus } from '../types';

const STATUSES: TaskStatus[] = ['backlog', 'needs-approval', 'approved', 'running', 'eval', 'revise', 'blocked', 'done'];

export function TasksPage() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const navigate = useNavigate();

  const q = searchParams.get('q') || '';

  async function load() {
    const data = await apiGet<{ tasks: TaskCard[] }>(`/api/tasks${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setTasks(data.tasks);
  }

  useEffect(() => {
    load().catch((e) => alert(e.message));
  }, [q]);

  const byStatus = useMemo(() => {
    const map: Record<string, TaskCard[]> = {};
    for (const s of STATUSES) map[s] = [];
    for (const t of tasks) {
      if (!map[t.status]) map[t.status] = [];
      map[t.status].push(t);
    }
    return map;
  }, [tasks]);

  async function onDrop(toStatus: TaskStatus) {
    if (!dragTaskId) return;
    try {
      await apiPost(`/api/tasks/${dragTaskId}/move`, { toStatus });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDragTaskId(null);
    }
  }

  return (
    <div>
      <h2>Tasks Pipeline</h2>
      <div className="kanban">
        {STATUSES.map((status) => (
          <div
            key={status}
            className="col"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(status)}
          >
            <h3>{status}</h3>
            {byStatus[status].map((task) => (
              <div
                key={task.id}
                className="task-card"
                draggable
                onDragStart={() => setDragTaskId(task.id)}
                onClick={() => navigate(`/tasks/${task.id}`)}
              >
                <div><strong>{task.title}</strong></div>
                <div style={{ marginTop: 6 }}>
                  <span className="badge">{task.priority}</span>
                  <span className="badge">{task.channel}</span>
                  <span className="badge">{task.owner}</span>
                </div>
                <div className="kv">Updated {new Date(task.updated_at).toLocaleString()}</div>
                {typeof task.eval_score === 'number' ? <div className="kv">Eval: {task.eval_score}</div> : null}
                {task.blocked_reason ? <div className="kv" style={{ color: '#8b2f2f' }}>{task.blocked_reason}</div> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
