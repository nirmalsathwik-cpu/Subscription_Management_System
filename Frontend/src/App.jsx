import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import Plans from './pages/Plans.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import Invoices from './pages/Invoices.jsx';
import { useData, useAction } from './ui.jsx';
import { date } from './format.js';

const NAV = [
  ['/dashboard', 'Dashboard'], ['/customers', 'Customers'], ['/plans', 'Plans'],
  ['/subscriptions', 'Subscriptions'], ['/invoices', 'Invoices'],
];

// The backend runs on a movable demo clock; this makes it visible and adjustable.
function DemoClock() {
  const { data } = useData('dashboard-stats');
  const { run, busy, error } = useAction();
  const today = data['dashboard-stats']?.today;
  return (
    <div className="clock">
      <div className="muted small">Demo date</div>
      <strong>{today ? date(today) : '…'}</strong>
      <div className="clock-btns">
        {[1, 7, 30].map((d) => (
          <button key={d} disabled={busy} onClick={() => run('advance-date', { days: d })}>+{d}d</button>
        ))}
      </div>
      {error && <div className="error small">{error.message}</div>}
    </div>
  );
}

export default function App() {
  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand">Ledgerline</div>
        {NAV.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'on' : '')}>{label}</NavLink>
        ))}
        <DemoClock />
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/subscriptions" element={<Subscriptions />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}
