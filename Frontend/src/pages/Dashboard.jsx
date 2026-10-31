import { useData, Loading, ErrorBox, Page } from '../ui.jsx';
import { money, date, net, addDays } from '../format.js';

const Kpi = ({ label, value, sub, tone }) => (
  <div className={`kpi ${tone || ''}`}>
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}</div>
    {sub && <div className="muted small">{sub}</div>}
  </div>
);

export default function Dashboard() {
  const { loading, error, data } = useData('dashboard-stats', 'subscriptions?limit=200', 'invoices?limit=200');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const s = data['dashboard-stats'];
  const horizon = addDays(s.today, 30);
  const upcoming = data.subscriptions
    .filter((x) => x.status === 'active' && x.next_billing_date <= horizon)
    .sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date));
  const overdue = data.invoices.filter((i) => i.status === 'overdue');
  return (
    <Page title="Dashboard" note={`Subscription revenue as of ${date(s.today)}`}>
      <div className="kpis">
        <Kpi label="MRR" value={money(s.mrr)} sub="Active subscriptions, after discounts" />
        <Kpi label="Active subscriptions" value={s.active_subscriptions} />
        <Kpi label="Collected this month" value={money(s.collected_this_month)} />
        <Kpi label="Overdue" value={money(s.overdue_amount)} sub={`${s.overdue_invoices} invoice${s.overdue_invoices === 1 ? '' : 's'}`} tone={s.overdue_invoices ? 'bad' : ''} />
      </div>
      <div className="grid-2">
        <div className="panel">
          <h2>Overdue invoices</h2>
          {overdue.length === 0 ? <p className="muted">Nothing overdue.</p> : (
            <table>
              <thead><tr><th>Customer</th><th>Plan</th><th>Due</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {overdue.map((i) => (
                  <tr key={i.id}><td>{i.customer_name}</td><td>{i.plan_name}</td><td>{date(i.due_date)}</td><td className="num">{money(i.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="panel">
          <h2>Next billing, within 30 days</h2>
          {upcoming.length === 0 ? <p className="muted">Nothing scheduled.</p> : (
            <table>
              <thead><tr><th>Customer</th><th>Plan</th><th>Date</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {upcoming.map((x) => (
                  <tr key={x.id}>
                    <td>{x.customer_name}</td><td>{x.plan_name}</td>
                    <td>{date(x.next_billing_date)}{x.next_billing_date <= s.today && <span className="muted"> (due)</span>}</td>
                    <td className="num">{money(net(x.price, x.discount_pct))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Page>
  );
}
