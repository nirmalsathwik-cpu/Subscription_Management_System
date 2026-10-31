CREATE TABLE IF NOT EXISTS plans (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     name TEXT NOT NULL,
                                     price REAL NOT NULL CHECK(price > 0),
                                     cycle TEXT NOT NULL CHECK(cycle IN ('monthly','yearly'))
);
CREATE TABLE IF NOT EXISTS customers (
                                         id INTEGER PRIMARY KEY AUTOINCREMENT,
                                         name TEXT NOT NULL,
                                         email TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS subscriptions (
                                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                                             customer_id INTEGER NOT NULL REFERENCES customers(id),
                                             plan_id INTEGER NOT NULL REFERENCES plans(id),
                                             start_date TEXT NOT NULL,
                                             discount_pct REAL NOT NULL DEFAULT 0 CHECK(discount_pct BETWEEN 0 AND 100),
                                             cycles_billed INTEGER NOT NULL DEFAULT 0,
                                             next_billing_date TEXT NOT NULL,
                                             status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','closed'))
);
CREATE TABLE IF NOT EXISTS invoices (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
                                        period_start TEXT NOT NULL,
                                        amount REAL NOT NULL,
                                        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','overdue','void')),
                                        due_date TEXT NOT NULL,
                                        paid_at TEXT,
                                        UNIQUE(subscription_id, period_start)
);
CREATE TABLE IF NOT EXISTS payments (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        invoice_id INTEGER NOT NULL REFERENCES invoices(id),
                                        amount REAL NOT NULL,
                                        method TEXT,
                                        status TEXT NOT NULL CHECK(status IN ('success','failed')),
                                        note TEXT,
                                        paid_on TEXT NOT NULL,
                                        gateway_ref TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY, value TEXT);

CREATE INDEX IF NOT EXISTS idx_subs_billing ON subscriptions(status, next_billing_date);
CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_inv_status_due ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_inv_paid ON invoices(paid_at);
CREATE INDEX IF NOT EXISTS idx_pay_invoice ON payments(invoice_id);