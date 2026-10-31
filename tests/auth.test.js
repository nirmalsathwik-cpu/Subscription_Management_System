// Tests the auth routes on their own small app with an in-memory database,
// so they don't depend on the rest of server.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const backend = require('node:module').createRequire(path.join(__dirname, '../Backend/server.js'));

process.env.JWT_SECRET = 'test-jwt-secret';
const express = backend('express');
const Database = backend('better-sqlite3');

const db = new Database(':memory:');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '../Backend/schema.sql'), 'utf8'));

const app = express();
app.use(express.json());
const auth = require('../Backend/auth/middleware')(db);
require('../Backend/routes/auth')(app, db, auth);
// A route guarded by each role set, to test the guards themselves
app.get('/t/any', auth.requireAuth, (req, res) => res.json({ ok: true }));
app.get('/t/admin', auth.requireRole('admin'), (req, res) => res.json({ ok: true }));
app.get('/t/staff', auth.requireRole('admin', 'staff'), (req, res) => res.json({ ok: true }));

let server, B;
const GOOD = 'Abcdefg1!';
async function api(method, url, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch(B + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    let data = null;
    try { data = await r.json(); } catch {}
    return { status: r.status, data };
}
const signup = (email, password = GOOD, name = 'Test') => api('POST', '/auth/signup', { name, email, password });

// forgot-password prints the reset link; capture it instead of showing it
function captureResetToken(fn) {
    const orig = console.log;
    let token = null;
    console.log = (...a) => { const m = /token=([a-f0-9]+)/.exec(a.join(' ')); if (m) token = m[1]; };
    return fn().then((r) => { console.log = orig; return { r, token }; }, (e) => { console.log = orig; throw e; });
}

test.before(async () => { await new Promise((r) => { server = app.listen(0, r); }); B = `http://localhost:${server.address().port}`; });
test.after(() => { server.closeAllConnections?.(); server.close(); });

// ---------- sign-up ----------
test('signup creates a customer user, a linked customer record and returns a token', async () => {
    const r = await signup('Alice@Example.com', GOOD, 'Alice');
    assert.equal(r.status, 201);
    assert.ok(r.data.token);
    assert.equal(r.data.user.email, 'alice@example.com');
    assert.equal(r.data.user.role, 'customer');
    const cust = db.prepare('SELECT * FROM customers WHERE id=?').get(r.data.user.customer_id);
    assert.equal(cust.name, 'Alice');
    assert.equal(cust.email, 'alice@example.com');
});

test('password is stored hashed, never in plain text', () => {
    const row = db.prepare("SELECT password_hash FROM users WHERE email='alice@example.com'").get();
    assert.notEqual(row.password_hash, GOOD);
    assert.ok(!row.password_hash.includes(GOOD));
});

test('signup: one account per email, case-insensitive', async () => {
    assert.equal((await signup('ALICE@example.com')).status, 409);
    assert.equal((await signup('alice@example.com')).status, 409);
});

test('signup is refused when a customer record already has that email', async () => {
    db.prepare("INSERT INTO customers (name, email) VALUES ('Old','old@example.com')").run();
    assert.equal((await signup('old@example.com')).status, 409);
});

test('signup validation: name, email, password rules', async () => {
    assert.equal((await signup('x1@example.com', GOOD, '  ')).status, 400);
    assert.equal((await signup('not-an-email')).status, 400);
    assert.equal((await signup(undefined)).status, 400);
    const weak = await signup('x2@example.com', 'abc');
    assert.equal(weak.status, 400);
    assert.ok(Array.isArray(weak.data.problems) && weak.data.problems.length >= 3);
    assert.equal((await signup('x3@example.com', 'Abcdef1!')).status, 400); // exactly 8
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email LIKE 'x%@example.com'").get().n, 0);
});

test('a failed signup leaves no orphan customer row', () => {
    assert.equal(db.prepare("SELECT COUNT(*) n FROM customers WHERE email LIKE 'x%@example.com'").get().n, 0);
});

// ---------- login ----------
test('login works with any email casing and returns the same user', async () => {
    const r = await api('POST', '/auth/login', { email: ' ALICE@example.com ', password: GOOD });
    assert.equal(r.status, 200);
    assert.ok(r.data.token);
    assert.equal(r.data.user.role, 'customer');
});

test('wrong password and unknown email give the same 401 message', async () => {
    const wrong = await api('POST', '/auth/login', { email: 'alice@example.com', password: 'Wrong123!' });
    const none = await api('POST', '/auth/login', { email: 'nobody@example.com', password: GOOD });
    assert.equal(wrong.status, 401);
    assert.equal(none.status, 401);
    assert.deepEqual(wrong.data, none.data);
    assert.equal((await api('POST', '/auth/login', {})).status, 401);
});

test('login response never exposes the password hash', async () => {
    const r = await api('POST', '/auth/login', { email: 'alice@example.com', password: GOOD });
    assert.ok(!JSON.stringify(r.data).includes('password'));
});

// ---------- tokens and guards ----------
test('/auth/me needs a valid token', async () => {
    const { data } = await api('POST', '/auth/login', { email: 'alice@example.com', password: GOOD });
    const me = await api('GET', '/auth/me', undefined, data.token);
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, 'alice@example.com');
    assert.equal((await api('GET', '/auth/me')).status, 401);
    assert.equal((await api('GET', '/auth/me', undefined, 'garbage')).status, 401);
    assert.equal((await api('GET', '/auth/me', undefined, data.token.slice(0, -2) + 'xx')).status, 401); // tampered
});

test('a token signed with a different secret is rejected', async () => {
    const jwt = backend('jsonwebtoken');
    const forged = jwt.sign({ sub: 1 }, 'some-other-secret');
    assert.equal((await api('GET', '/auth/me', undefined, forged)).status, 401);
});

test('an expired token is rejected', async () => {
    const jwt = backend('jsonwebtoken');
    const expired = jwt.sign({ sub: 1 }, 'test-jwt-secret', { expiresIn: -10 });
    assert.equal((await api('GET', '/auth/me', undefined, expired)).status, 401);
});

test('requireRole: customer is blocked from staff and admin routes, admin and staff pass', async () => {
    const cust = (await signup('cust@example.com')).data.token;
    assert.equal((await api('GET', '/t/any', undefined, cust)).status, 200);
    assert.equal((await api('GET', '/t/staff', undefined, cust)).status, 403);
    assert.equal((await api('GET', '/t/admin', undefined, cust)).status, 403);
    assert.equal((await api('GET', '/t/admin')).status, 401);

    const hash = db.prepare("SELECT password_hash h FROM users WHERE email='cust@example.com'").get().h;
    db.prepare("INSERT INTO users (email, password_hash, role) VALUES ('adm@example.com',?,'admin'),('stf@example.com',?,'staff')").run(hash, hash);
    const adm = (await api('POST', '/auth/login', { email: 'adm@example.com', password: GOOD })).data.token;
    const stf = (await api('POST', '/auth/login', { email: 'stf@example.com', password: GOOD })).data.token;
    assert.equal((await api('GET', '/t/admin', undefined, adm)).status, 200);
    assert.equal((await api('GET', '/t/staff', undefined, adm)).status, 200);
    assert.equal((await api('GET', '/t/staff', undefined, stf)).status, 200);
    assert.equal((await api('GET', '/t/admin', undefined, stf)).status, 403);
});

test('role changes and deleted users take effect immediately, not at token expiry', async () => {
    const t = (await api('POST', '/auth/login', { email: 'stf@example.com', password: GOOD })).data.token;
    assert.equal((await api('GET', '/t/staff', undefined, t)).status, 200);
    db.prepare("UPDATE users SET role='customer' WHERE email='stf@example.com'").run();
    assert.equal((await api('GET', '/t/staff', undefined, t)).status, 403);
    db.prepare("DELETE FROM users WHERE email='stf@example.com'").run();
    assert.equal((await api('GET', '/auth/me', undefined, t)).status, 401);
});

// ---------- staff creation ----------
test('only an admin can add staff; the new staff member can log in with role staff', async () => {
    const cust = (await api('POST', '/auth/login', { email: 'cust@example.com', password: GOOD })).data.token;
    const adm = (await api('POST', '/auth/login', { email: 'adm@example.com', password: GOOD })).data.token;
    const body = { email: 'Newstaff@Example.com', password: GOOD };

    assert.equal((await api('POST', '/users/staff', body)).status, 401);
    assert.equal((await api('POST', '/users/staff', body, cust)).status, 403);

    const ok = await api('POST', '/users/staff', body, adm);
    assert.equal(ok.status, 201);
    assert.equal(ok.data.user.role, 'staff');
    assert.equal(ok.data.user.customer_id, null);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM customers WHERE email='newstaff@example.com'").get().n, 0);

    assert.equal((await api('POST', '/users/staff', body, adm)).status, 409);
    assert.equal((await api('POST', '/users/staff', { email: 'bad', password: GOOD }, adm)).status, 400);
    assert.equal((await api('POST', '/users/staff', { email: 'w@example.com', password: 'weak' }, adm)).status, 400);

    const login = await api('POST', '/auth/login', body);
    assert.equal(login.status, 200);
    assert.equal(login.data.user.role, 'staff');
});

test('there is no way to create an admin or choose a role through the API', async () => {
    const adm = (await api('POST', '/auth/login', { email: 'adm@example.com', password: GOOD })).data.token;
    const s = await api('POST', '/users/staff', { email: 'sneaky@example.com', password: GOOD, role: 'admin' }, adm);
    assert.equal(s.data.user.role, 'staff');
    const c = await api('POST', '/auth/signup', { name: 'S', email: 'sneaky2@example.com', password: GOOD, role: 'admin' });
    assert.equal(c.data.user.role, 'customer');
});

// ---------- forgot / reset password ----------
test('forgot-password answers identically for known and unknown emails', async () => {
    const known = await captureResetToken(() => api('POST', '/auth/forgot-password', { email: 'alice@example.com' }));
    const unknown = await captureResetToken(() => api('POST', '/auth/forgot-password', { email: 'ghost@example.com' }));
    assert.equal(known.r.status, 200);
    assert.deepEqual(known.r.data, unknown.r.data);
    assert.ok(known.token, 'a link is issued for a real account');
    assert.equal(unknown.token, null, 'and none for an unknown one');
    assert.equal((await api('POST', '/auth/forgot-password', {})).status, 200);
});

test('reset token is stored only as a hash', async () => {
    const { token } = await captureResetToken(() => api('POST', '/auth/forgot-password', { email: 'alice@example.com' }));
    const rows = db.prepare('SELECT token_hash FROM password_resets').all();
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.token_hash !== token));
});

test('full reset: weak password keeps the link alive, good one works once, old password stops working', async () => {
    const { token } = await captureResetToken(() => api('POST', '/auth/forgot-password', { email: 'alice@example.com' }));
    assert.equal((await api('POST', '/auth/reset-password', { token, password: 'weak' })).status, 400);
    assert.equal((await api('POST', '/auth/reset-password', { token, password: 'Newpass9#x' })).status, 200);
    assert.equal((await api('POST', '/auth/reset-password', { token, password: 'Another9#x' })).status, 400); // single use
    assert.equal((await api('POST', '/auth/login', { email: 'alice@example.com', password: GOOD })).status, 401);
    assert.equal((await api('POST', '/auth/login', { email: 'alice@example.com', password: 'Newpass9#x' })).status, 200);
});

test('reset: bad, missing and expired tokens are refused', async () => {
    assert.equal((await api('POST', '/auth/reset-password', { token: 'nope', password: 'Newpass9#x' })).status, 400);
    assert.equal((await api('POST', '/auth/reset-password', { password: 'Newpass9#x' })).status, 400);
    const { token } = await captureResetToken(() => api('POST', '/auth/forgot-password', { email: 'alice@example.com' }));
    db.prepare("UPDATE password_resets SET expires_at='2000-01-01T00:00:00.000Z' WHERE used_at IS NULL").run();
    assert.equal((await api('POST', '/auth/reset-password', { token, password: 'Newpass9#x' })).status, 400);
});

test('asking for a new link cancels the older one', async () => {
    const first = await captureResetToken(() => api('POST', '/auth/forgot-password', { email: 'alice@example.com' }));
    const second = await captureResetToken(() => api('POST', '/auth/forgot-password', { email: 'alice@example.com' }));
    assert.equal((await api('POST', '/auth/reset-password', { token: first.token, password: 'Newpass9#x' })).status, 400);
    assert.equal((await api('POST', '/auth/reset-password', { token: second.token, password: 'Newpass9#x' })).status, 200);
});