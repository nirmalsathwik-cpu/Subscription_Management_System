# API as implemented (server.js)

Bare JSON, no envelope. Prices are plain numbers in major units (899.1), dates are `YYYY-MM-DD`.
The API sends no currency; the UI reads `VITE_CURRENCY` (default INR).
List endpoints take `?limit` (max 200, default 50), `?offset`, `?status`, and return `X-Total-Count`.
The UI currently loads `limit=200` and counts client-side.

| Used by the UI | Notes |
|---|---|
| `GET /plans` | `id, name, price, cycle (monthly|yearly)` |
| `GET /customers` | `id, name, email` |
| `GET /subscriptions` | `id, customer_id, plan_id, start_date, discount_pct, cycles_billed, next_billing_date, status (active|paused|closed)` + joined `customer_name, plan_name, price, cycle` |
| `GET /invoices` | `id, subscription_id, period_start, amount, status (pending|paid|overdue), due_date, paid_at` + joined `customer_name, plan_name` |
| `GET /invoices/:id/payments` | `id, invoice_id, amount, method, status (success|failed), note, paid_on` |
| `GET /dashboard-stats` | `mrr, active_subscriptions, collected_this_month, overdue_amount, overdue_invoices, today` |
| `POST /run-billing` | `{ created }`, button on Invoices |
| `PATCH /subscriptions/:id/status` | Pause / Resume / Close on Subscriptions |
| `POST /advance-date` | `{ days }`, "Demo date" control in the sidebar |

Not used by the UI yet: `POST /plans`, `POST /customers`, `POST /subscriptions` (create forms), and
`POST /payment-webhook`, which needs `x-webhook-secret` and so belongs to the payment gateway, not the browser.

Mocks in `public/mock/` are snapshots of real responses, captured by `scripts/snapshot-mocks.mjs`.
