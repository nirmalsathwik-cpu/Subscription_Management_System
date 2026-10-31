const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const fs = require('fs');
const path = require('path');
app.use(cors());
app.use(express.json());
app.use(express.static(require('path').join(__dirname, 'public')));

const db = new Database(process.env.DB_FILE || 'billing.db');
db.pragma('foreign_keys = ON');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-secret';
if (!process.env.WEBHOOK_SECRET)
    console.warn('WARNING: WEBHOOK_SECRET not set, using insecure default "dev-secret"');

// ---------- 1. TABLES ----------
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

// ---------- HELPERS ----------
const today = () => db.prepare("SELECT value FROM app_state WHERE key='today'").get().value;
const round2 = (n) => Math.round(n * 100) / 100;

function isValidDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}
function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
// Start date + n cycles, always measured from the ORIGINAL start date and
// clamped to the last day of the month (Jan 31 + 1 month = Feb 28/29, and
// the following month goes back to Mar 31 instead of drifting).
function nthBillingDate(startStr, n, cycle) {
    const [y, m, d] = startStr.split('-').map(Number);
    const monthsToAdd = cycle === 'yearly' ? n * 12 : n;
    const total = (m - 1) + monthsToAdd;
    const ty = y + Math.floor(total / 12);
    const tm = total % 12; // 0-based
    const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    return new Date(Date.UTC(ty, tm, Math.min(d, lastDay))).toISOString().slice(0, 10);
}
function markOverdue() {
    db.prepare("UPDATE invoices SET status='overdue' WHERE status='pending' AND due_date < ?").run(today());
}
function paging(req) {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    return { limit, offset };
}
const safeEqual = (a, b) => {
    const x = Buffer.from(String(a || ''));
    const y = Buffer.from(String(b || ''));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function logPayment(invoiceId, amount, method, status, note, ref) {
    db.prepare(
        'INSERT INTO payments (invoice_id, amount, method, status, note, paid_on, gateway_ref) VALUES (?,?,?,?,?,?,?)'
    ).run(invoiceId, amount, method || null, status, note || null, today(), ref || null);
}

// Your partner calls this when closing a subscription
function voidUnpaidInvoices(subscriptionId) {
    return db
        .prepare("UPDATE invoices SET status='void' WHERE subscription_id=? AND status IN ('pending','overdue')")
        .run(subscriptionId).changes;
}

// ---------- 2. SEED DATA (runs only once) ----------
if (db.prepare('SELECT COUNT(*) c FROM plans').get().c === 0) {
    db.transaction(() => {
        db.prepare("INSERT INTO app_state VALUES ('today', '2026-11-01')").run();

        const addPlan = db.prepare('INSERT INTO plans (name, price, cycle) VALUES (?,?,?)');
        addPlan.run('Basic', 499, 'monthly');
        addPlan.run('Pro', 999, 'monthly');
        addPlan.run('Enterprise', 9999, 'yearly');

        const addCust = db.prepare('INSERT INTO customers (name, email) VALUES (?,?)');
        ['Asha', 'Ravi', 'Meera', 'John', 'Priya'].forEach((n) =>
            addCust.run(n, n.toLowerCase() + '@example.com')
        );

        const addSub = db.prepare(
            'INSERT INTO subscriptions (customer_id, plan_id, start_date, discount_pct, cycles_billed, next_billing_date) VALUES (?,?,?,?,?,?)'
        );
        const addInv = db.prepare(
            "INSERT INTO invoices (subscription_id, period_start, amount, status, due_date, paid_at) VALUES (?,?,?,'paid',?,?)"
        );
        // Missed two cycles: Oct and Nov invoices are both created on the first run (Oct will be overdue)
        addSub.run(1, 1, '2026-10-01', 0, 0, '2026-10-01');
        // Starts today: first invoice due today
        addSub.run(2, 2, '2026-11-01', 10, 0, '2026-11-01');
        // Already billed for Oct (paid), next cycle later
        addSub.run(3, 2, '2026-10-15', 0, 1, '2026-11-15');
        addInv.run(3, '2026-10-15', 999, '2026-10-22', '2026-10-16');
        // Yearly: billed Nov 2025 (paid), renewal due today
        addSub.run(4, 3, '2025-11-01', 20, 1, '2026-11-01');
        addInv.run(4, '2025-11-01', 7999.2, '2025-11-08', '2025-11-03');
        // Already billed for Oct (paid), next cycle later
        addSub.run(5, 1, '2026-10-20', 0, 1, '2026-11-20');
        addInv.run(5, '2026-10-20', 499, '2026-10-27', '2026-10-21');
    })();
}

// ---------- 3. ENDPOINTS ----------

// Plans
app.get('/plans', (req, res) => {
    res.json(db.prepare('SELECT * FROM plans').all());
});
app.post('/plans', (req, res) => {
    const { name, price, cycle } = req.body;
    if (!name || !(price > 0) || !['monthly', 'yearly'].includes(cycle))
        return res.status(400).json({ error: 'name, price (>0) and cycle (monthly/yearly) required' });
    const r = db.prepare('INSERT INTO plans (name, price, cycle) VALUES (?,?,?)').run(name, price, cycle);
    res.status(201).json(db.prepare('SELECT * FROM plans WHERE id=?').get(r.lastInsertRowid));
});

// Customers
app.get('/customers', (req, res) => {
    res.json(db.prepare('SELECT * FROM customers').all());
});
app.post('/customers', (req, res) => {
    const { name, email } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return res.status(400).json({ error: 'invalid email' });
    try {
        const r = db.prepare('INSERT INTO customers (name, email) VALUES (?,?)').run(name, email || null);
        res.status(201).json(db.prepare('SELECT * FROM customers WHERE id=?').get(r.lastInsertRowid));
    } catch (e) {
        if (String(e.code).startsWith('SQLITE_CONSTRAINT'))
            return res.status(409).json({ error: 'email already belongs to another customer' });
        throw e;
    }
});

// Subscriptions (paginated, optional ?status=active|paused|closed)
app.get('/subscriptions', (req, res) => {
    const { limit, offset } = paging(req);
    const status = ['active', 'paused', 'closed'].includes(req.query.status) ? req.query.status : null;
    const where = status ? 'WHERE s.status = ?' : '';
    const args = status ? [status] : [];
    const total = db.prepare(`SELECT COUNT(*) c FROM subscriptions s ${where}`).get(...args).c;
    res.set('X-Total-Count', String(total));
    res.json(
        db.prepare(`
            SELECT s.*, c.name AS customer_name, p.name AS plan_name, p.price, p.cycle
            FROM subscriptions s
                     JOIN customers c ON c.id = s.customer_id
                     JOIN plans p ON p.id = s.plan_id
                ${where}
            ORDER BY s.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset)
    );
});
app.post('/subscriptions', (req, res) => {
    const { customer_id, plan_id, start_date } = req.body;
    const discount = req.body.discount_pct === undefined ? 0 : Number(req.body.discount_pct);
    if (!customer_id || !plan_id || !start_date)
        return res.status(400).json({ error: 'customer_id, plan_id, start_date required' });
    if (!isValidDate(start_date))
        return res.status(400).json({ error: 'start_date must be a valid YYYY-MM-DD date' });
    if (!Number.isFinite(discount) || discount < 0 || discount > 100)
        return res.status(400).json({ error: 'discount_pct must be between 0 and 100' });
    if (!db.prepare('SELECT 1 FROM customers WHERE id=?').get(customer_id))
        return res.status(404).json({ error: 'customer not found' });
    if (!db.prepare('SELECT 1 FROM plans WHERE id=?').get(plan_id))
        return res.status(404).json({ error: 'plan not found' });

    const r = db
        .prepare(
            'INSERT INTO subscriptions (customer_id, plan_id, start_date, discount_pct, next_billing_date) VALUES (?,?,?,?,?)'
        )
        .run(customer_id, plan_id, start_date, discount, start_date);
    res.status(201).json(db.prepare('SELECT * FROM subscriptions WHERE id=?').get(r.lastInsertRowid));
});

// Lifecycle: active <-> paused, and closing (final)
app.patch('/subscriptions/:id/status', (req, res) => {
    const { status } = req.body;
    if (!['active', 'paused', 'closed'].includes(status))
        return res.status(400).json({ error: 'status must be active, paused or closed' });

    const sub = db
        .prepare('SELECT s.*, p.cycle FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.id=?')
        .get(req.params.id);
    if (!sub) return res.status(404).json({ error: 'subscription not found' });
    if (sub.status === 'closed') return res.status(409).json({ error: 'subscription is closed' });

    db.transaction(() => {
        if (status === 'active' && sub.status === 'paused') {
            // Resuming: skip the cycles that fell inside the pause so they are not back-billed
            let n = sub.cycles_billed;
            let next = sub.next_billing_date;
            while (next <= today()) {
                n += 1;
                next = nthBillingDate(sub.start_date, n, sub.cycle);
            }
            db.prepare('UPDATE subscriptions SET cycles_billed=?, next_billing_date=? WHERE id=?').run(n, next, sub.id);
        }
        db.prepare('UPDATE subscriptions SET status=? WHERE id=?').run(status, sub.id);
        if (status === 'closed') voidUnpaidInvoices(sub.id);
    })();
    res.json(db.prepare('SELECT * FROM subscriptions WHERE id=?').get(sub.id));
});

// Invoices (paginated, optional ?status=pending|paid|overdue|void)
app.get('/invoices', (req, res) => {
    markOverdue();
    const { limit, offset } = paging(req);
    const status = ['pending', 'paid', 'overdue', 'void'].includes(req.query.status) ? req.query.status : null;
    const where = status ? 'WHERE i.status = ?' : '';
    const args = status ? [status] : [];
    const total = db.prepare(`SELECT COUNT(*) c FROM invoices i ${where}`).get(...args).c;
    res.set('X-Total-Count', String(total));
    res.json(
        db.prepare(`
            SELECT i.*, c.name AS customer_name, p.name AS plan_name
            FROM invoices i
                     JOIN subscriptions s ON s.id = i.subscription_id
                     JOIN customers c ON c.id = s.customer_id
                     JOIN plans p ON p.id = s.plan_id
                ${where}
            ORDER BY i.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset)
    );
});

app.get('/invoices/:id', (req, res) => {
    markOverdue();
    const inv = db.prepare(`
        SELECT i.*, c.name AS customer_name, p.name AS plan_name
        FROM invoices i
                 JOIN subscriptions s ON s.id = i.subscription_id
                 JOIN customers c ON c.id = s.customer_id
                 JOIN plans p ON p.id = s.plan_id
        WHERE i.id = ?`).get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'invoice not found' });
    inv.payments = db.prepare('SELECT * FROM payments WHERE invoice_id=? ORDER BY id DESC').all(inv.id);
    res.json(inv);
});

app.get('/invoices/:id/payments', (req, res) => {
    if (!db.prepare('SELECT 1 FROM invoices WHERE id=?').get(req.params.id))
        return res.status(404).json({ error: 'invoice not found' });
    res.json(db.prepare('SELECT * FROM payments WHERE invoice_id=? ORDER BY id DESC').all(req.params.id));
});

app.post('/invoices/:id/void', (req, res) => {
    const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id);
    if (!inv) return res.status(404).json({ error: 'invoice not found' });
    if (inv.status === 'paid') return res.status(409).json({ error: 'cannot void a paid invoice' });
    db.prepare("UPDATE invoices SET status='void' WHERE id=?").run(inv.id);
    res.json({ ok: true, status: 'void' });
});

// Run billing: create invoices for every active subscription that is due.
// Catches up on missed cycles, so nothing is skipped and nothing is billed twice.
app.post('/run-billing', (req, res) => {
    const now = today();
    const due = db
        .prepare(`
            SELECT s.*, p.price, p.cycle FROM subscriptions s
                                                  JOIN plans p ON p.id = s.plan_id
            WHERE s.status='active' AND s.next_billing_date <= ?`)
        .all(now);

    let created = 0;
    const insert = db.prepare(
        'INSERT OR IGNORE INTO invoices (subscription_id, period_start, amount, due_date) VALUES (?,?,?,?)'
    );
    const advance = db.prepare('UPDATE subscriptions SET cycles_billed=?, next_billing_date=? WHERE id=?');

    db.transaction(() => {
        for (const s of due) {
            const amount = round2(s.price * (1 - s.discount_pct / 100));
            let n = s.cycles_billed;
            let periodStart = s.next_billing_date;
            while (periodStart <= now) {
                created += insert.run(s.id, periodStart, amount, addDays(periodStart, 7)).changes;
                n += 1;
                periodStart = nthBillingDate(s.start_date, n, s.cycle);
            }
            advance.run(n, periodStart, s.id);
        }
    })();

    markOverdue();
    res.json({ created });
});

// Move the demo "today" forward
app.post('/advance-date', (req, res) => {
    const days = Number(req.body.days);
    if (!Number.isInteger(days) || days === 0) return res.status(400).json({ error: 'days (non-zero integer) required' });
    const newToday = addDays(today(), days);
    db.prepare("UPDATE app_state SET value=? WHERE key='today'").run(newToday);
    markOverdue();
    res.json({ today: newToday });
});

// Payment webhook (shaped like a real gateway callback).
// Requires header: x-webhook-secret: <WEBHOOK_SECRET>
// Body: { invoice_id, amount, status: 'success'|'failed', method?, note? }
app.post('/payment-webhook', (req, res) => {
    if (!safeEqual(req.get('x-webhook-secret'), WEBHOOK_SECRET))
        return res.status(401).json({ error: 'invalid webhook secret' });

    const { invoice_id, amount, status, method, note, gateway_ref } = req.body;
    if (!['success', 'failed'].includes(status))
        return res.status(400).json({ error: "status must be 'success' or 'failed'" });

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0)
        return res.status(400).json({ error: 'amount must be a positive number' });

    // Idempotency: a retried webhook with the same gateway_ref is acknowledged, not re-processed
    if (gateway_ref) {
        const prev = db.prepare('SELECT status FROM payments WHERE gateway_ref=?').get(String(gateway_ref));
        if (prev) return res.json({ ok: true, duplicate: true, recorded: prev.status });
    }

    const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(invoice_id);
    if (!inv) return res.status(404).json({ error: 'unknown invoice' });
    if (inv.status === 'paid') return res.status(409).json({ error: 'already paid' });
    if (inv.status === 'void') return res.status(409).json({ error: 'invoice is void' });

    // Rule: exact amount only (no partial or over-payments)
    if (round2(amt) !== round2(inv.amount)) {
        logPayment(inv.id, round2(amt), method, 'failed', `rejected: amount mismatch (expected ${round2(inv.amount)})`, null);
        return res.status(400).json({ error: 'amount mismatch' });
    }

    db.transaction(() => {
        logPayment(inv.id, round2(amt), method, status, note, gateway_ref);
        if (status === 'success')
            db.prepare("UPDATE invoices SET status='paid', paid_at=? WHERE id=?").run(today(), inv.id);
    })();

    res.json({ ok: true, recorded: status });
});

// Dashboard numbers
app.get('/dashboard-stats', (req, res) => {
    markOverdue();
    const monthStart = today().slice(0, 7) + '-01';
    const monthEnd = addDays(nthBillingDate(monthStart, 1, 'monthly'), -1);
    const mrr = db
        .prepare(`
            SELECT COALESCE(SUM(p.price * (1 - s.discount_pct / 100.0) /
                                CASE p.cycle WHEN 'yearly' THEN 12 ELSE 1 END), 0) AS v
            FROM subscriptions s JOIN plans p ON p.id = s.plan_id
            WHERE s.status='active'`)
        .get().v;
    const active = db.prepare("SELECT COUNT(*) c FROM subscriptions WHERE status='active'").get().c;
    const collected = db
        .prepare("SELECT COALESCE(SUM(amount),0) v FROM invoices WHERE status='paid' AND paid_at BETWEEN ? AND ?")
        .get(monthStart, monthEnd).v;
    const overdue = db
        .prepare("SELECT COALESCE(SUM(amount),0) v, COUNT(*) c FROM invoices WHERE status='overdue'")
        .get();
    res.json({
        mrr: round2(mrr),
        active_subscriptions: active,
        collected_this_month: round2(collected),
        overdue_amount: round2(overdue.v),
        overdue_invoices: overdue.c,
        today: today(),
    });
});

require('./routes/pricingAdmin')(app, db);

// ---------- ERROR HANDLING ----------


app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid JSON body' });
    if (String(err.code || '').startsWith('SQLITE_CONSTRAINT'))
        return res.status(400).json({ error: 'constraint failed: ' + err.message });
    console.error(err);
    res.status(500).json({ error: 'internal error' });
});

if (require.main === module) {
    app.listen(process.env.PORT || 3000, () =>
        console.log('API running on http://localhost:' + (process.env.PORT || 3000))
    );
}
module.exports = { app, nthBillingDate };