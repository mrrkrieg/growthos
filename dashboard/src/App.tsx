import { useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { apiPost } from './api';
import { OverviewPage } from './pages/OverviewPage';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailPage } from './pages/TaskDetailPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { StrategyPage } from './pages/StrategyPage';
import { RunsPage } from './pages/RunsPage';
import { CronPage } from './pages/CronPage';
import { LogsPage } from './pages/LogsPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  return (
    <div className="layout">
      <aside className="nav">
        <h1><Link to="/">GrowthClaw</Link></h1>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Overview</NavLink>
        <NavLink to="/tasks" className={({ isActive }) => (isActive ? 'active' : '')}>Tasks</NavLink>
        <NavLink to="/approvals" className={({ isActive }) => (isActive ? 'active' : '')}>Approvals</NavLink>
        <NavLink to="/strategy" className={({ isActive }) => (isActive ? 'active' : '')}>Strategy</NavLink>
        <NavLink to="/runs" className={({ isActive }) => (isActive ? 'active' : '')}>Runs</NavLink>
        <NavLink to="/cron" className={({ isActive }) => (isActive ? 'active' : '')}>Cron</NavLink>
        <NavLink to="/logs" className={({ isActive }) => (isActive ? 'active' : '')}>Logs</NavLink>
        <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>Settings</NavLink>
      </aside>

      <main className="main">
        <div className="topbar">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                navigate(`/tasks?q=${encodeURIComponent(search)}`);
              }
            }}
            placeholder="Search tasks"
          />
          <button onClick={async () => { await apiPost('/api/strategy/run-evolution'); alert('Strategy evolution triggered.'); }}>
            Run strategy evolution now
          </button>
          <button onClick={async () => { await apiPost('/api/tasks/dispatch-next'); alert('Dispatcher executed.'); }}>
            Start next task
          </button>
        </div>

        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:id" element={<TaskDetailPage />} />
          <Route path="/approvals" element={<ApprovalsPage />} />
          <Route path="/strategy" element={<StrategyPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/cron" element={<CronPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
