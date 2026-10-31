import { useState } from 'react';
import { useData, useAction, Loading, ErrorBox, Page } from '../ui.jsx';
import { useAuth } from '../auth.jsx';
import { money, cycleLabel } from '../format.js';

export default function Plans() {
  const { isAdmin } = useAuth();
  const { loading, error, data } = useData('plans', 'subscriptions?limit=200');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cycle, setCycle] = useState('monthly');
  const [added, setAdded] = useState('');
  const add = useAction();
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;

  async function submit(e) {
    e.preventDefault();
    setAdded('');
    const made = await add.run('plans', { name: name.trim(), price: Number(price), cycle });
    if (made) {
      setName('');
      setPrice('');
      setAdded(`Added the ${made.name} plan.`);
    }
  }

  const live = (id) => data.subscriptions.filter((s) => s.plan_id === id && s.status === 'active').length;
  return (
      <Page title="Plans" note={isAdmin ? undefined : 'Only an admin can add plans.'}>
        {isAdmin && (
            <form className="panel add-form" onSubmit={submit}>
              <h2>Add a plan</h2>
              <div className="form-row">
                <label>Plan name
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="off" />
                </label>
                <label>Price
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} required min="0.01" step="0.01" inputMode="decimal" />
                </label>
                <label>Billing
                  <select value={cycle} onChange={(e) => setCycle(e.target.value)}>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <button type="submit" className="primary" disabled={add.busy || !name.trim() || !(Number(price) > 0)}>{add.busy ? 'Adding…' : 'Add plan'}</button>
              </div>
              {add.error && <p className="error" role="alert">{add.error.message}</p>}
              {added && <p className="notice" role="status">{added}</p>}
            </form>
        )}
        <table>
          <thead><tr><th>Plan</th><th>Price</th><th>Billing</th><th className="num">Active subs</th></tr></thead>
          <tbody>
          {data.plans.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td>{money(p.price)} / {cycleLabel(p.cycle)}</td>
                <td style={{ textTransform: 'capitalize' }}>{p.cycle}</td>
                <td className="num">{live(p.id)}</td>
              </tr>
          ))}
          </tbody>
        </table>
      </Page>
  );
}