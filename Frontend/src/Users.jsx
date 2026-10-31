import { useState } from 'react';
import { useData, useAction, Loading, ErrorBox, Page } from '../ui.jsx';
import { money } from '../format.js';

export default function Users() {
    const { loading, error, data } = useData('customers', 'subscriptions?limit=200', 'invoices?limit=200');
    const [q, setQ] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [added, setAdded] = useState('');
    const add = useAction();
    if (loading) return <Loading />;
    if (error) return <ErrorBox error={error} />;

    async function submit(e) {
        e.preventDefault();
        setAdded('');
        const made = await add.run('customers', { name: name.trim(), email: email.trim() || undefined });
        if (made) {
            setName('');
            setEmail('');
            setAdded(`Added ${made.name}.`);
        }
    }

    const subsOf = (id) => data.subscriptions.filter((s) => s.customer_id === id);
    const owed = (id) => {
        const mine = new Set(subsOf(id).map((s) => s.id));
        return data.invoices.filter((i) => mine.has(i.subscription_id) && i.status === 'overdue').reduce((a, i) => a + i.amount, 0);
    };
    const needle = q.trim().toLowerCase();
    const rows = data.customers.filter((c) => !needle || `${c.name} ${c.email || ''}`.toLowerCase().includes(needle));
    return (
        <Page title="Users">
            <form className="panel add-form" onSubmit={submit}>
                <h2>Add a user</h2>
                <div className="form-row">
                    <label>Name
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="off" />
                    </label>
                    <label>Email <span className="muted small">(optional)</span>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="off" />
                    </label>
                    <button type="submit" className="primary" disabled={add.busy || !name.trim()}>{add.busy ? 'Adding…' : 'Add user'}</button>
                </div>
                {add.error && <p className="error" role="alert">{add.error.message}</p>}
                {added && <p className="notice" role="status">{added}</p>}
            </form>

            <div className="toolbar">
                <span className="muted">{rows.length} of {data.customers.length}</span>
                <input type="search" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
            </div>
            <table>
                <thead><tr><th>User</th><th>Email</th><th className="num">Active subs</th><th className="num">Overdue</th></tr></thead>
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
                {rows.length === 0 && <tr><td colSpan="4" className="muted">No users match.</td></tr>}
                </tbody>
            </table>
        </Page>
    );
}