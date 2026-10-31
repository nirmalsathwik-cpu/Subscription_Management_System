import { useEffect, useState } from 'react';
import { load, onInvalidate, send } from './api';

// useData('plans','subscriptions?limit=200') -> { loading, error, data: { plans: [...], subscriptions: [...] } }
// Keys are the path up to "?" with "/" kept as-is, e.g. data['dashboard-stats'].
export function useData(...paths) {
  const [state, setState] = useState({ loading: true, error: null, data: {} });
  const [tick, setTick] = useState(0);
  const key = paths.join('|');
  useEffect(() => onInvalidate(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    let live = true;
    Promise.all(paths.map(load))
      .then((r) => live && setState({ loading: false, error: null, data: Object.fromEntries(paths.map((p, i) => [p.split('?')[0], r[i]])) }))
      .catch((error) => live && setState({ loading: false, error, data: {} }));
    return () => {
      live = false;
    };
  }, [key, tick]);
  return state;
}

// Runs a write, shows its error, disables the button while busy.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (...args) => {
    setBusy(true);
    setError(null);
    try {
      return await send(...args);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error };
}

export const Loading = () => <p className="muted" role="status">Loading…</p>;
export const ErrorBox = ({ error }) => <p className="error" role="alert">{error.message}</p>;

export function Page({ title, note, actions, children }) {
  return (
    <section>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {note && <p className="muted">{note}</p>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

const TONE = { active: 'ok', paid: 'ok', pending: 'info', paused: 'warn', overdue: 'danger', failed: 'danger', success: 'ok', closed: 'mute' };
export const Status = ({ value }) => <span className={`chip chip-${TONE[value] || 'mute'}`}>{value}</span>;

export function Tabs({ options, value, onChange, counts }) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button key={o} role="tab" aria-selected={value === o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>
          {o === 'all' ? 'All' : o} <span className="count">{counts[o] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

export const countBy = (list, key = 'status') =>
  list.reduce((a, x) => ({ ...a, [x[key]]: (a[x[key]] || 0) + 1, all: a.all + 1 }), { all: 0 });
