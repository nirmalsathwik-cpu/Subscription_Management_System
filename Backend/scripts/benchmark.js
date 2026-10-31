// Load test for the "every page under 2 seconds" rule.
// Usage (from Backend/):  node scripts/load-test.js [subscriptions]     default 5000
// Uses a throwaway database file and never touches billing.db.
const fs = require('fs');
const os = require('os');
const path = require('path');

const N = Number(process.argv[2]) || 5000;
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'load-')), 'load.db');
process.env.DB_FILE = dbFile;
process.env.WEBHOOK_SECRET = 'load-secret';

const Database = require('better-sqlite3');
const { app } = require('../server');   // creates schema and seed
const db = new Database(dbFile);

// ---- bulk data: N customers and subscriptions, spread over 2 years, plus payments ----
console.log(`Seeding ${N} subscriptions...`);
db.transaction(() => {
  const addC = db.prepare('INSERT INTO customers (name, email) VALUES (?,?)');
  const addS = db.prepare(`INSERT INTO subscriptions
    (customer_id, plan_id, start_date, discount_pct, cycles_billed, next_billing_date, status) VALUES (?,?,?,?,0,?,?)`);
  for (let i = 0; i < N; i++) {
    const c = addC.run('Load ' + i, `load${i}@example.com`).lastInsertRowid;
    const m = String(1 + (i % 12)).padStart(2, '0');
    const d = String(1 + (i % 28)).padStart(2, '0');
    const start = `${2025 + (i % 2)}-${m}-${d}`;
    const status = i % 10 === 0 ? 'paused' : i % 25 === 0 ? 'closed' : 'active';
    addS.run(c, 1 + (i % 3), start, i % 4 === 0 ? 10 : 0, start, status);
  }
})();

const server = app.listen(0, async () => {
  const B = `http://localhost:${server.address().port}`;
  const H = { 'Content-Type': 'application/json', 'x-webhook-secret': 'load-secret' };
  const results = [];

  async function timed(label, method, url, body) {
    const t = performance.now();
    const r = await fetch(B + url, { method, headers: H, body: body && JSON.stringify(body) });
    const text = await r.text();
    const ms = Math.round(performance.now() - t);
    results.push({ label, ms, status: r.status, kb: Math.round(text.length / 1024) });
    return JSON.parse(text);
  }

  await timed('POST /run-billing (all due)', 'POST', '/run-billing');
  // pay about 60% of the invoices straight in the database, then make some overdue
  db.exec(`UPDATE invoices SET status='paid', paid_at='2026-11-01' WHERE id % 5 < 3`);
  await timed('POST /advance-date 45', 'POST', '/advance-date', { days: 45 });

  await timed('GET /dashboard-stats', 'GET', '/dashboard-stats');
  await timed('GET /subscriptions?limit=200', 'GET', '/subscriptions?limit=200');
  await timed('GET /subscriptions?status=active', 'GET', '/subscriptions?status=active&limit=200');
  await timed('GET /subscriptions?offset=4000', 'GET', `/subscriptions?limit=50&offset=${Math.max(N - 1000, 0)}`);
  await timed('GET /invoices?limit=200', 'GET', '/invoices?limit=200');
  await timed('GET /invoices?status=overdue', 'GET', '/invoices?status=overdue&limit=200');
  await timed('GET /invoices?status=paid', 'GET', '/invoices?status=paid&limit=200');
  const inv = db.prepare(`SELECT id, amount FROM invoices WHERE status != 'paid' LIMIT 1`).get();
  await timed('POST /payment-webhook', 'POST', '/payment-webhook',
    { invoice_id: inv.id, amount: inv.amount, status: 'success' });
  await timed('GET /invoices/:id', 'GET', `/invoices/${inv.id}`);

  const count = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log(`\nRows: ${count('subscriptions')} subscriptions, ${count('invoices')} invoices\n`);
  console.log('ms     status  KB   request');
  let worst = 0;
  for (const r of results) {
    worst = Math.max(worst, r.ms);
    console.log(`${String(r.ms).padStart(5)}  ${r.status}    ${String(r.kb).padStart(4)}  ${r.label}${r.ms > 2000 ? '   <-- TOO SLOW' : ''}`);
  }
  console.log(`\nSlowest: ${worst} ms (limit 2000 ms)`);
  server.close();
  db.close();
  fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
  process.exit(worst > 2000 ? 1 : 0);
});
