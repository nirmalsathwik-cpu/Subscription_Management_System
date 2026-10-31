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
CREATE TABLE IF NOT EXISTS taxes (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     name TEXT NOT NULL UNIQUE,
                                     rate REAL NOT NULL CHECK(rate >= 0 AND rate <= 100)   -- percent
    );
CREATE TABLE IF NOT EXISTS products (
                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                        name TEXT NOT NULL,
                                        type TEXT,
                                        sales_price REAL NOT NULL,
                                        cost_price REAL,
                                        notes TEXT,
                                        tax_id INTEGER REFERENCES taxes(id)
    );
CREATE TABLE IF NOT EXISTS product_variants (
                                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                product_id INTEGER NOT NULL REFERENCES products(id),
    attribute TEXT NOT NULL,        -- 'Brand'
    value TEXT NOT NULL,            -- 'Odoo'
    extra_price REAL NOT NULL DEFAULT 0   -- 560
    );
CREATE TABLE IF NOT EXISTS subscription_lines (
                                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price REAL NOT NULL,
    tax_id INTEGER REFERENCES taxes(id)
    );
CREATE TABLE IF NOT EXISTS discount_rules (
                                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                                              name TEXT NOT NULL,
                                              type TEXT NOT NULL CHECK(type IN ('percent','fixed')),
    value REAL NOT NULL CHECK(value > 0),
    min_purchase REAL,
    min_quantity INTEGER,
    start_date TEXT,
    end_date TEXT,
    usage_limit INTEGER,
    times_used INTEGER NOT NULL DEFAULT 0,
    product_id INTEGER REFERENCES products(id),       -- NULL = whole subscription
    subscription_id INTEGER REFERENCES subscriptions(id)  -- NULL = any subscription
    );
CREATE TABLE IF NOT EXISTS invoice_lines (
                                             id INTEGER PRIMARY KEY AUTOINCREMENT,
                                             invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    product_id INTEGER,
    description TEXT,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    discount REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL
    );

-- ---- Tax and discount rules (payments/pricing side) ----
CREATE TABLE IF NOT EXISTS taxes (
                                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                                     name TEXT NOT NULL UNIQUE,
                                     rate REAL NOT NULL CHECK(rate >= 0 AND rate <= 100)
);
CREATE TABLE IF NOT EXISTS discount_rules (
                                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                                              name TEXT NOT NULL,
                                              type TEXT NOT NULL CHECK(type IN ('percent','fixed')),
                                              value REAL NOT NULL CHECK(value > 0),
                                              min_purchase REAL CHECK(min_purchase IS NULL OR min_purchase >= 0),
                                              min_quantity INTEGER CHECK(min_quantity IS NULL OR min_quantity >= 1),
                                              start_date TEXT,
                                              end_date TEXT,
                                              usage_limit INTEGER CHECK(usage_limit IS NULL OR usage_limit >= 1),
                                              times_used INTEGER NOT NULL DEFAULT 0,
                                              product_id INTEGER,
                                              subscription_id INTEGER REFERENCES subscriptions(id)
);
CREATE INDEX IF NOT EXISTS idx_disc_dates ON discount_rules(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_subs_billing ON subscriptions(status, next_billing_date);
CREATE INDEX IF NOT EXISTS idx_subs_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_inv_status_due ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_inv_paid ON invoices(paid_at);
CREATE INDEX IF NOT EXISTS idx_pay_invoice ON payments(invoice_id);


