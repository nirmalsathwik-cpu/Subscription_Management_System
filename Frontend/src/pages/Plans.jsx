import { useData, Loading, ErrorBox, Page } from '../ui.jsx';
import { money, cycleLabel } from '../format.js';

export default function Plans() {
  const { loading, error, data } = useData('plans', 'subscriptions?limit=200');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const live = (id) => data.subscriptions.filter((s) => s.plan_id === id && s.status === 'active').length;
  return (
    <Page title="Plans">
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
