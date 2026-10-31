import { useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const CATEGORIES = [
    ['employee', 'Employee', 'Manage users and billing'],
    ['admin', 'Admin', 'Everything employees can do, plus plans'],
];

export default function Login() {
    const { user, checking, notice, login } = useAuth();
    const location = useLocation();
    const [role, setRole] = useState('employee');
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const passwordRef = useRef(null);

    if (checking) return <p className="muted login-wait" role="status">Loading…</p>;
    if (user) return <Navigate to={location.state?.from?.pathname || '/dashboard'} replace />;

    async function submit(e) {
        e.preventDefault();
        if (busy) return;
        if (!loginId.trim() || !password) {
            setError('Enter both your login ID and password.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            await login(loginId.trim(), password, role);
        } catch (err) {
            setError(err instanceof TypeError ? 'Cannot reach the server. Check that the backend is running.' : err.message);
            setPassword('');
            passwordRef.current?.focus();
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="login-page">
            <form className="login-card" onSubmit={submit} noValidate>
                <div className="brand">Ledgerline</div>
                <h1>Sign in</h1>
                <p className="muted">Choose your account type, then enter your login ID and password.</p>

                {notice && <p className="notice" role="status">{notice}</p>}

                <fieldset className="seg" disabled={busy}>
                    <legend>Sign in as</legend>
                    {CATEGORIES.map(([value, label, hint]) => (
                        <label key={value} className={role === value ? 'on' : ''}>
                            <input type="radio" name="role" value={value} checked={role === value} onChange={() => { setRole(value); setError(''); }} />
                            <span className="seg-title">{label}</span>
                            <span className="seg-hint">{hint}</span>
                        </label>
                    ))}
                </fieldset>

                <label className="field" htmlFor="loginId">Login ID</label>
                <input
                    id="loginId" type="text" value={loginId} onChange={(e) => setLoginId(e.target.value)}
                    autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck="false" autoFocus
                    aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined}
                />

                <label className="field" htmlFor="password">Password</label>
                <div className="pw-wrap">
                    <input
                        id="password" ref={passwordRef} type={showPw ? 'text' : 'password'} value={password}
                        onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                        aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined}
                    />
                    <button type="button" className="link" onClick={() => setShowPw((s) => !s)} aria-pressed={showPw}>
                        {showPw ? 'Hide' : 'Show'}
                    </button>
                </div>

                {error && <p id="login-error" className="error" role="alert">{error}</p>}

                <button type="submit" className="primary login-submit" disabled={busy}>
                    {busy ? 'Signing in…' : `Sign in as ${role === 'admin' ? 'Admin' : 'Employee'}`}
                </button>
            </form>
        </main>
    );
}