import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import Plans from './pages/Plans.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import Invoices from './pages/Invoices.jsx';
import { useData, useAction, Loading } from './ui.jsx';
import { useAuth, roleLabel } from './auth.jsx';
import { date } from './format.js';

const NAV = [
    ['/dashboard', 'Dashboard'], ['/users', 'Users'], ['/plans', 'Plans'],
    ['/subscriptions', 'Subscriptions'], ['/invoices', 'Invoices'],
];

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

function RequireAuth({ children }) {
    const { user, checking } = useAuth();
    const location = useLocation();
    if (checking) return <Loading />;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    return children;
}

function SignedInAs() {
    const { user, logout } = useAuth();
    return (
        <div className="userbox">
            <div className="muted small">Signed in as</div>
            <strong className="userbox-name" title={user.email}>{user.username || user.email}</strong>
            <div><span className={`chip ${user.role === 'admin' ? 'chip-info' : 'chip-mute'}`}>{roleLabel(user.role)}</span></div>
            {import.meta.env.VITE_DATA_SOURCE !== 'mock' && <button type="button" className="signout" onClick={logout}>Sign out</button>}
        </div>
    );
}

function Shell() {
    return (
        <div className="shell">
            <nav className="side" aria-label="Main">
                <div className="brand">Ledgerline</div>
                {NAV.map(([to, label]) => (
                    <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'on' : '')}>{label}</NavLink>
                ))}
                <SignedInAs />
                <DemoClock />
            </nav>
            <main className="main">
                <Outlet />
            </main>
        </div>
    );
}

export default function App() {
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth><Shell /></RequireAuth>}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/users" element={<Users />} />
                <Route path="/customers" element={<Navigate to="/users" replace />} />
                <Route path="/plans" element={<Plans />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/invoices" element={<Invoices />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
    );
}