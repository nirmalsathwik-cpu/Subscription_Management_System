const test = require('node:test');
const assert = require('node:assert/strict');

// Must be set BEFORE requiring server.js: in-memory DB, known secret
process.env.DB_FILE = ':memory:';
process.env.WEBHOOK_SECRET = 'test-secret';
const { app } = require('../Backend/server');

let server, B;
const JSON_H = { 'Content-Type': 'application/json' };
const HOOK_H = { ...JSON_H, 'x-webhook-secret': 'test-secret' };

async function api(method, path, body, headers = JSON_H) {
    const r = await fetch(B + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await r.json(); } catch {}
    return { status: r.status, data };
}

const pay = (inv, over = {}) =>
    api('POST', '/payment-webhook',
        { invoice_id: inv.id, amount: inv.amount, status: 'success', ...over }, HOOK_H);

async function unpaid() {
    const { data } = await api('GET', '/invoices');
    return data.filter((i) => i.status === 'pending' || i.status === 'overdue');
}

test.before(async () => {
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    B = `http://localhost:${server.address().port}`;
    await api('POST', '/run-billing'); // creates the invoices we will pay
});

test.after(() => {
    server.closeAllConnections?.();
    server.close();
});

test('bad secret gives 401', async () => {
    const [i] = await unpaid();
    const r = await api('POST', '/payment-webhook',
        { invoice_id: i.id, amount: i.amount, status: 'success' });
    assert.equal(r.status, 401);
});

test('unknown invoice gives 404', async () => {
    const r = await api('POST', '/payment-webhook',
        { invoice_id: 9999, amount: 1, status: 'success' }, HOOK_H);
    assert.equal(r.status, 404);
});

test('invalid amount values give 400', async () => {
    const [i] = await unpaid();
    for (const bad of [undefined, null, -5, 0, 'abc']) {
        assert.equal((await pay(i, { amount: bad })).status, 400, `amount=${bad}`);
    }
});

test('amount mismatch is logged and does not pay', async () => {
    const [i] = await unpaid();
    assert.equal((await pay(i, { amount: i.amount + 1 })).status, 400);
    const hist = (await api('GET', `/invoices/${i.id}/payments`)).data;
    assert.ok(hist.some((p) => (p.note || '').includes('amount mismatch')));
    assert.notEqual((await api('GET', `/invoices/${i.id}`)).data.status, 'paid');
});

test('success updates dashboard, duplicate gives 409', async () => {
    const [i] = await unpaid();
    const before = (await api('GET', '/dashboard-stats')).data.collected_this_month;
    assert.equal((await pay(i)).status, 200);
    const after = (await api('GET', '/dashboard-stats')).data.collected_this_month;
    assert.equal(Math.round((after - before) * 100), Math.round(i.amount * 100));
    assert.equal((await pay(i)).status, 409);
});

test('gateway_ref makes retries idempotent', async () => {
    const [i] = await unpaid();
    const first = await pay(i, { gateway_ref: 'ref-1' });
    assert.equal(first.status, 200);
    assert.equal(first.data.duplicate, undefined);
    const retry = await pay(i, { gateway_ref: 'ref-1' });
    assert.equal(retry.status, 200);
    assert.equal(retry.data.duplicate, true);
    assert.equal((await api('GET', `/invoices/${i.id}/payments`)).data.length, 1);
});

test('void blocks payment and does not raise overdue total', async () => {
    const [i] = await unpaid();
    const before = (await api('GET', '/dashboard-stats')).data.overdue_amount;
    assert.equal((await api('POST', `/invoices/${i.id}/void`)).status, 200);
    assert.equal((await pay(i)).status, 409);
    const after = (await api('GET', '/dashboard-stats')).data.overdue_amount;
    assert.ok(after <= before);
});

test('cannot void a paid invoice', async () => {
    const all = (await api('GET', '/invoices')).data;
    const paid = all.find((x) => x.status === 'paid');
    assert.equal((await api('POST', `/invoices/${paid.id}/void`)).status, 409);
});

test('payments list gives 404 for unknown invoice', async () => {
    assert.equal((await api('GET', '/invoices/9999/payments')).status, 404);
});

test('closing a subscription voids its unpaid invoices', async () => {
    // Own customer and subscription, so this test does not depend on the other tests
    const today = (await api('GET', '/dashboard-stats')).data.today;
    const cust = (await api('POST', '/customers', { name: 'Close Test', email: 'close.test@example.com' })).data;
    const sub = (await api('POST', '/subscriptions',
        { customer_id: cust.id, plan_id: 1, start_date: today })).data;
    await api('POST', '/run-billing');

    const all = (await api('GET', '/invoices?limit=200')).data;
    const inv = all.find((x) => x.subscription_id === sub.id);
    assert.ok(inv, 'billing should create an invoice for the new subscription');
    assert.notEqual(inv.status, 'paid');

    const r = await api('PATCH', `/subscriptions/${sub.id}/status`, { status: 'closed' });
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'closed');

    assert.equal((await api('GET', `/invoices/${inv.id}`)).data.status, 'void');
    assert.equal((await pay(inv)).status, 409); // a void invoice cannot be paid
});

test('closing a subscription never voids a paid invoice', async () => {
    const today = (await api('GET', '/dashboard-stats')).data.today;
    const cust = (await api('POST', '/customers', { name: 'Paid Test', email: 'paid.test@example.com' })).data;
    const sub = (await api('POST', '/subscriptions',
        { customer_id: cust.id, plan_id: 1, start_date: today })).data;
    await api('POST', '/run-billing');

    const inv = (await api('GET', '/invoices?limit=200')).data.find((x) => x.subscription_id === sub.id);
    assert.equal((await pay(inv)).status, 200);

    assert.equal((await api('PATCH', `/subscriptions/${sub.id}/status`, { status: 'closed' })).status, 200);
    assert.equal((await api('GET', `/invoices/${inv.id}`)).data.status, 'paid');
});