import { useState } from 'react';
import { useData, useAction, Loading, ErrorBox, Page, Status, Tabs, countBy } from '../ui.jsx';
import { money, date, net, cycleLabel } from '../format.js';

export default function Subscriptions() {
  const { loading, error, data } = useData('subscriptions?limit=200');
  const [filter, setFilter] = useState('all');
  const act = useAction();
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const subs = data.subscriptions;
  const rows = subs.filter((s) => filter === 'all' || s.status === filter);
  const set = (id, status) => act.run(`subscriptions/${id}/status`, { status }, 'PATCH');
  const close = (s) => window.confirm(`Close ${s.customer_name}'s ${s.plan_name} subscription? This cannot be undone.`) && set(s.id, 'closed');
  return (
    <Page title="Subscriptions">
      {act.error && <p className="error" role="alert">{act.error.message}</p>}
      <div className="toolbar">
        <Tabs options={['all', 'active', 'paused', 'closed']} value={filter} onChange={setFilter} counts={countBy(subs)} />
      </div>
      <table>
        <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Started</th><th>Next billing</th><th className="num">Discount</th><th className="num">Price</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td><strong>{s.customer_name}</strong><div className="muted small">#{s.id}</div></td>
              <td>{s.plan_name}</td>
              <td><Status value={s.status} /></td>
              <td>{date(s.start_date)}</td>
              <td>{s.status === 'closed' ? '–' : s.status === 'paused' ? 'Paused' : date(s.next_billing_date)}</td>
              <td className="num">{s.discount_pct ? `${s.discount_pct}%` : '–'}</td>
              <td className="num">{money(net(s.price, s.discount_pct))} / {cycleLabel(s.cycle)}</td>
              <td className="row-actions">
                {s.status === 'active' && <button disabled={act.busy} onClick={() => set(s.id, 'paused')}>Pause</button>}
                {s.status === 'paused' && <button disabled={act.busy} onClick={() => set(s.id, 'active')}>Resume</button>}
                {s.status !== 'closed' && <button className="danger" disabled={act.busy} onClick={() => close(s)}>Close</button>}
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="8" className="muted">No subscriptions in this state.</td></tr>}
        </tbody>
      </table>
    </Page>
  );
}
