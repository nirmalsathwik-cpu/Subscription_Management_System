import { useState } from 'react';
import { useData, Loading, ErrorBox, Page } from '../ui.jsx';
import { money } from '../format.js';

export default function Customers() {
  const { loading, error, data } = useData('customers', 'subscriptions?limit=200', 'invoices?limit=200');
  const [q, setQ] = useState('');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const subsOf = (id) => data.subscriptions.filter((s) => s.customer_id === id);
  const owed = (id) => {
    const mine = new Set(subsOf(id).map((s) => s.id));
    return data.invoices.filter((i) => mine.has(i.subscription_id) && i.status === 'overdue').reduce((a, i) => a + i.amount, 0);
  };
  const needle = q.trim().toLowerCase();
  const rows = data.customers.filter((c) => !needle || `${c.name} ${c.email || ''}`.toLowerCase().includes(needle));
  return (
    <Page title="Customers">
      <div className="toolbar">
        <span className="muted">{rows.length} of {data.customers.length}</span>
        <input type="search" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search customers" />
      </div>
      <table>
        <thead><tr><th>Customer</th><th>Email</th><th className="num">Active subs</th><th className="num">Overdue</th></tr></thead>
        <tbody>
          {rows.map((c) => {
            const o = owed(c.id);
            return (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.email || '–'}</td>
                <td className="num">{subsOf(c.id).filter((s) => s.status === 'active').length}</td>
                <td className="num">{o > 0 ? <span className="chip chip-danger">{money(o)}</span> : '–'}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan="4" className="muted">No customers match.</td></tr>}
        </tbody>
      </table>
    </Page>
  );
}
