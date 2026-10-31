import { Fragment, useState } from 'react';
import { useData, useAction, Loading, ErrorBox, Page, Status, Tabs, countBy } from '../ui.jsx';
import { money, date } from '../format.js';
import { load } from '../api.js';
import { useEffect } from 'react';

function Payments({ id }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    load(`invoices/${id}/payments`).then((r) => live && setRows(r)).catch((e) => live && setErr(e));
    return () => { live = false; };
  }, [id]);
  if (err) return <ErrorBox error={err} />;
  if (!rows) return <Loading />;
  if (rows.length === 0) return <p className="muted small">No payment attempts recorded.</p>;
  return (
    <table className="inner">
      <thead><tr><th>Date</th><th>Method</th><th>Result</th><th>Note</th><th className="num">Amount</th></tr></thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}><td>{date(p.paid_on)}</td><td>{p.method || '–'}</td><td><Status value={p.status} /></td><td>{p.note || '–'}</td><td className="num">{money(p.amount)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Invoices() {
  const { loading, error, data } = useData('invoices?limit=200');
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [result, setResult] = useState(null);
  const bill = useAction();
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const list = data.invoices;
  const rows = list.filter((v) => filter === 'all' || v.status === filter);
  const runBilling = async () => {
    const r = await bill.run('run-billing');
    if (r) setResult(r.created);
  };
  return (
    <Page
      title="Invoices"
      actions={<button className="primary" disabled={bill.busy} onClick={runBilling}>{bill.busy ? 'Running…' : 'Run billing'}</button>}
    >
      {bill.error && <p className="error" role="alert">{bill.error.message}</p>}
      {result !== null && !bill.error && (
        <p className="notice" role="status">{result === 0 ? 'Nothing was due. No invoices created.' : `Created ${result} invoice${result === 1 ? '' : 's'}.`}</p>
      )}
      <div className="toolbar">
        <Tabs options={['all', 'pending', 'overdue', 'paid']} value={filter} onChange={setFilter} counts={countBy(list)} />
      </div>
      <table>
        <thead><tr><th>Invoice</th><th>Customer</th><th>Plan</th><th>Period start</th><th>Due</th><th>Status</th><th className="num">Amount</th><th>Paid on</th></tr></thead>
        <tbody>
          {rows.map((v) => {
            const open = openId === v.id;
            return (
              <Fragment key={v.id}>
                <tr className="clickable" onClick={() => setOpenId(open ? null : v.id)}>
                  <td><button className="link" aria-expanded={open}>#{v.id}</button></td>
                  <td>{v.customer_name}</td><td>{v.plan_name}</td>
                  <td>{date(v.period_start)}</td><td>{date(v.due_date)}</td>
                  <td><Status value={v.status} /></td>
                  <td className="num">{money(v.amount)}</td><td>{date(v.paid_at)}</td>
                </tr>
                {open && (
                  <tr className="detail"><td colSpan="8"><strong className="small">Payment attempts</strong><Payments id={v.id} /></td></tr>
                )}
              </Fragment>
            );
          })}
          {rows.length === 0 && <tr><td colSpan="8" className="muted">No invoices in this state.</td></tr>}
        </tbody>
      </table>
    </Page>
  );
}
