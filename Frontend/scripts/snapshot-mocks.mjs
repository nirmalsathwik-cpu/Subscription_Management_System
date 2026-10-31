// Captures public/mock/*.json from a LIVE copy of the API, so mocks always match real responses.
// Usage: API=http://localhost:3055 SECRET=mock node scripts/snapshot-mocks.mjs   (use a scratch DB!)
import { writeFileSync, mkdirSync } from 'node:fs';
const API = process.env.API || 'http://localhost:3000';
const SECRET = process.env.SECRET || 'dev-secret';
const OUT = new URL('../public/mock/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const get = async (p) => (await fetch(API + p)).json();
const post = (p, body, headers = {}, method = 'POST') =>
  fetch(API + p, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const save = (name, data) => writeFileSync(OUT + name + '.json', JSON.stringify(data, null, 2) + '\n');

// Put the scratch DB into an interesting state: bill everything due, one paid, one failed attempt, one paused.
await post('/run-billing', {});
const pending = (await get('/invoices?limit=200')).filter((i) => i.status !== 'paid');
const hook = (i, status, extra) =>
  post('/payment-webhook', { invoice_id: i.id, amount: i.amount, status, ...extra }, { 'x-webhook-secret': SECRET });
if (pending[0]) await hook(pending[0], 'failed', { method: 'card', note: 'insufficient funds' });
if (pending[1]) await hook(pending[1], 'success', { method: 'card' });
await post('/subscriptions/5/status', { status: 'paused' }, {}, 'PATCH');

const invoices = await get('/invoices?limit=200');
save('plans', await get('/plans'));
save('customers', await get('/customers'));
save('subscriptions', await get('/subscriptions?limit=200'));
save('invoices', invoices);
save('dashboard-stats', await get('/dashboard-stats'));
for (const i of invoices) save(`invoices-${i.id}-payments`, await get(`/invoices/${i.id}/payments`));
console.log('snapshot written:', invoices.length, 'invoices');
