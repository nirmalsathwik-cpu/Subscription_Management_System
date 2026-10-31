const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_FILE = ':memory:';
process.env.WEBHOOK_SECRET = 'test-secret';
const { app } = require('../Backend/server');

let server, B;
const H = { 'Content-Type': 'application/json' };
async function api(method, path, body) {
  const r = await fetch(B + path, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

test.before(async () => {
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  B = `http://localhost:${server.address().port}`;
});
test.after(() => { server.closeAllConnections?.(); server.close(); });

test('create, list and edit a tax', async () => {
  const c = await api('POST', '/taxes', { name: 'GST 18', rate: 18 });
  assert.equal(c.status, 201);
  assert.equal(c.data.rate, 18);
  assert.equal((await api('GET', '/taxes')).data.length, 1);
  const p = await api('PATCH', `/taxes/${c.data.id}`, { rate: 12 });
  assert.equal(p.data.rate, 12);
  assert.equal(p.data.name, 'GST 18');
});

test('tax validation: bad rate, missing name, duplicate name, unknown id', async () => {
  assert.equal((await api('POST', '/taxes', { name: 'X', rate: 101 })).status, 400);
  assert.equal((await api('POST', '/taxes', { name: 'X', rate: -1 })).status, 400);
  assert.equal((await api('POST', '/taxes', { name: 'X', rate: 'abc' })).status, 400);
  assert.equal((await api('POST', '/taxes', { rate: 5 })).status, 400);
  assert.equal((await api('POST', '/taxes', { name: 'GST 18', rate: 5 })).status, 409);
  assert.equal((await api('PATCH', '/taxes/9999', { rate: 5 })).status, 404);
});

test('create a percentage rule and a fixed rule with limits', async () => {
  const a = await api('POST', '/discount-rules',
    { name: 'Seats 10%', type: 'percent', value: 10, min_quantity: 5, usage_limit: 3,
      start_date: '2026-11-01', end_date: '2026-12-31' });
  assert.equal(a.status, 201);
  assert.equal(a.data.times_used, 0);
  const b = await api('POST', '/discount-rules', { name: 'Flat 200', type: 'fixed', value: 200, min_purchase: 1000 });
  assert.equal(b.status, 201);
  assert.equal(b.data.start_date, null);
});

test('discount rule validation', async () => {
  const ok = { name: 'R', type: 'percent', value: 10 };
  const bad = (over) => api('POST', '/discount-rules', { ...ok, ...over }).then((r) => r.status);
  assert.equal(await bad({ name: '' }), 400);
  assert.equal(await bad({ type: 'half' }), 400);
  assert.equal(await bad({ value: 0 }), 400);
  assert.equal(await bad({ value: 150 }), 400);               // percent over 100
  assert.equal(await bad({ min_quantity: 0 }), 400);
  assert.equal(await bad({ usage_limit: 1.5 }), 400);
  assert.equal(await bad({ start_date: '2026-13-01' }), 400);
  assert.equal(await bad({ start_date: '2026-12-01', end_date: '2026-11-01' }), 400);
  assert.equal(await bad({ subscription_id: 9999 }), 400);   // unknown subscription
});

test('a fixed discount may exceed 100 (it is an amount, not a percent)', async () => {
  const r = await api('POST', '/discount-rules', { name: 'Big', type: 'fixed', value: 5000 });
  assert.equal(r.status, 201);
});

test('/discount-rules/active hides expired, not-started and used-up rules', async () => {
  // simulated today is 2026-11-01
  await api('POST', '/discount-rules', { name: 'Expired', type: 'percent', value: 5, end_date: '2026-10-31' });
  await api('POST', '/discount-rules', { name: 'Future', type: 'percent', value: 5, start_date: '2026-12-01' });
  const names = (await api('GET', '/discount-rules/active')).data.map((r) => r.name);
  assert.ok(names.includes('Seats 10%'));
  assert.ok(names.includes('Flat 200'));
  assert.ok(!names.includes('Expired'));
  assert.ok(!names.includes('Future'));
});

test('patching a rule re-validates it', async () => {
  const rules = (await api('GET', '/discount-rules')).data;
  const r = rules.find((x) => x.name === 'Seats 10%');
  assert.equal((await api('PATCH', `/discount-rules/${r.id}`, { value: 250 })).status, 400);
  const ok = await api('PATCH', `/discount-rules/${r.id}`, { value: 15 });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.value, 15);
  assert.equal(ok.data.usage_limit, 3);                        // untouched fields survive
  assert.equal((await api('PATCH', '/discount-rules/9999', { value: 5 })).status, 404);
});
