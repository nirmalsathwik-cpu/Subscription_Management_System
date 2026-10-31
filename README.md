
# Subscription Management System

“5,000 subscriptions and 32,000 invoices, every page under half a second.”


**Ledgerline**: one platform to run plans, subscriptions and recurring billing in one place.

It replaces the spreadsheet-and-memory way of running a subscription business (renewals nobody remembers, invoices typed by hand, payments matched by scrolling bank statements) with a system that creates invoices automatically, records payments against them, and shows live revenue numbers.

The scenario it is built for is *Brightloop Software*, a company that sells software on monthly and yearly plans.

---

## Contents

- [Features](#features)
- [Roles and permissions](#roles-and-permissions)
- [Sample accounts](#sample-accounts)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Running the tests](#running-the-tests)
- [How billing works](#how-billing-works)
- [Demo walkthrough](#demo-walkthrough)
- [API reference](#api-reference)
- [Troubleshooting](#troubleshooting)
- [Known limitations and roadmap](#known-limitations-and-roadmap)

---

## Features

### Accounts and access
- **One login page for two categories.** Choose *Admin* or *Employee*, then enter a login ID and password.
- **Login ID can be a username or an email address.**
- **Clear errors.** Wrong credentials, the wrong account category, and too many attempts each show a readable message on the form. The server gives one generic message for a wrong ID or a wrong password, so nobody can discover which IDs exist.
- **Password rules:** more than 8 characters, with an uppercase letter, a lowercase letter and a special character. Passwords are stored only as bcrypt hashes.
- **Brute-force protection.** After 5 failed attempts for the same login ID from the same address, further attempts are refused for 15 minutes.
- **Token-based sessions.** Signed tokens (JWT) that expire after 8 hours by default.
- **Role-based access** on every API route (see [Roles and permissions](#roles-and-permissions)).
- **Forgot-password flow** with single-use, one-hour reset links (the link is printed in the server log until email delivery is configured).

### Plans
- Admins create plans with a name, price and billing cycle (monthly or yearly).
- Every employee can view plans and see how many active subscriptions each has.

### Customers
- Employees and admins add and search customers (the **Users** page).
- Email addresses are unique and validated.
- Each customer row shows active subscriptions and overdue money.

### Subscriptions
- Link a customer to a plan with a start date and an optional discount percentage.
- **Lifecycle:** active, paused, closed.
  - *Pause* stops billing and leaves existing invoices alone. Resuming skips the cycles that fell inside the pause, so nothing is back-billed.
  - *Close* is final and voids all unpaid invoices. Paid invoices stay as history.
- The price is never copied onto the subscription. It is read from the plan.

### Automatic invoicing
- **One button (`Run billing`) creates every invoice that is due.** Nobody types an invoice by hand.
- **Nothing is billed twice.** A database rule allows only one invoice per subscription per period.
- **Nothing is skipped.** If billing did not run for a while, it catches up on every missed cycle.
- Month-end dates are handled correctly (a subscription that starts on the 31st bills on the last day of shorter months, then returns to the 31st).
- Invoices move through **pending, paid, overdue** and can be **voided**.

### Payments
- A payment-gateway callback (`/payment-webhook`) records each attempt with its method, amount, date and note.
- **Exact-amount rule:** partial or over-payments are rejected and logged as failed attempts.
- **Safe retries:** a repeated callback with the same `gateway_ref` is acknowledged but not processed twice.
- Void and already-paid invoices cannot be paid.
- The callback is protected by a shared secret header, not by a user login.

### Dashboard
Live numbers for the finance team:
- **MRR** (monthly recurring revenue, active subscriptions only, after discounts; yearly plans count as one twelfth)
- **Active subscriptions**
- **Collected this month**
- **Overdue amount** and the number of overdue invoices
- Lists of overdue invoices and of billing due in the next 30 days

### Pricing rules (admin)
- **Taxes:** admins create and edit named tax rates.
- **Discount rules:** fixed or percentage, with a minimum purchase or quantity, start and end dates, a usage limit, and a scope (a product or a whole subscription).
- The pricing calculation itself (discounts shared across lines, tax on the discounted amount, rounding) is implemented and unit-tested. See [Known limitations](#known-limitations-and-roadmap) for what is not yet connected to billing.

### Demo tools
- A **demo clock** in the sidebar moves "today" forward by 1, 7 or 30 days, so you can show billing, overdue invoices and renewals without waiting a month.

---

## Roles and permissions

| Capability | Employee | Admin |
|---|:-:|:-:|
| Sign in through the login page | Yes | Yes |
| View dashboard, customers, plans, subscriptions, invoices | Yes | Yes |
| Add and search customers (Users page) | Yes | Yes |
| Create subscriptions; pause, resume or close them | Yes | Yes |
| Run billing, view payment attempts, void an invoice | Yes | Yes |
| **Add new plans** | No | **Yes** |
| Manage tax rates and discount rules | No | Yes |
| Create staff accounts (API: `POST /users/staff`) | No | Yes |

*Admin has all employee privileges, plus the admin-only items.* A request that is not allowed returns `403`; a request without a valid login returns `401`.

---

## Sample accounts

These accounts are created automatically the first time the backend starts with an empty database.
They are defined in [`Backend/auth/seedUsers.js`](Backend/auth/seedUsers.js).

| Sign in as | Login ID | Email (also accepted as login ID) | Password |
|---|---|---|---|
| **Admin** | `admin` | `admin@ledgerline.test` | `Admin@12345` |
| **Employee** | `employee` | `employee@ledgerline.test` | `Employee@12345` |

On the login page, pick the matching **Admin** or **Employee** option first. Choosing the wrong one shows a message telling you which type the account is.

> **Security:** these accounts are for local demos only. Before any real use, set `SEED_SAMPLE_USERS=false` (or `NODE_ENV=production`) so they are never created, and create real accounts instead.

To change them, edit `SAMPLE_USERS` in `seedUsers.js`, delete `Backend/billing.db`, and restart. The seeder only runs when the database has no admin or staff accounts yet.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 4 |
| Database | SQLite through `better-sqlite3` (file: `Backend/billing.db`) |
| Authentication | `bcryptjs` for password hashing, `jsonwebtoken` for sessions |
| Frontend | React 18, React Router 6, Vite 5, plain CSS (light and dark mode) |
| Tests | Node's built-in test runner (`node:test`) |

---

## Project structure

```
Subscription_Management_System/
├── Backend/
│   ├── server.js              # API, billing, payments, dashboard
│   ├── schema.sql             # every table and index
│   ├── pricing.js             # tax and discount calculation (pure functions)
│   ├── auth/
│   │   ├── middleware.js      # token check and role check
│   │   ├── passwords.js       # password rules and hashing
│   │   ├── loginLimiter.js    # failed-attempt lockout
│   │   └── seedUsers.js       # sample admin and employee accounts
│   ├── routes/
│   │   ├── auth.js            # login, sign-up, password reset, staff creation
│   │   └── pricingAdmin.js    # tax and discount-rule endpoints
│   └── scripts/benchmark.js   # load-test script
├── Frontend/
│   ├── src/
│   │   ├── pages/             # Login, Dashboard, Users, Plans, Subscriptions, Invoices
│   │   ├── api.js             # API client and token handling
│   │   ├── auth.jsx           # login state shared across the app
│   │   └── ui.jsx, format.js, styles.css
│   ├── public/mock/           # saved API responses for offline UI work
│   └── CONTRACT.md            # which endpoints the UI uses
└── tests/                     # backend tests
```

---

## Getting started

### Prerequisites
- **Node.js 20 or newer** (developed on Node 24) and npm
- Git

### 1. Get the code
```bash
git clone https://github.com/nirmalsathwik-cpu/Subscription_Management_System.git
cd Subscription_Management_System
```

### 2. Start the backend (port 3000)
```bash
cd Backend
npm install
npm start
```
You should see `API running on http://localhost:3000`. The database file and the sample data are created on first start.

### 3. Start the frontend (port 5173)
Open a **second terminal**:
```bash
cd Frontend
npm install
npm run dev
```
Open **http://localhost:5173** and sign in with a [sample account](#sample-accounts).

> Use `localhost` in the browser, not `127.0.0.1`. The UI talks to `localhost:3000`, and mixing the two names can make the browser block requests.
>
> Opening `http://localhost:3000` directly in a browser shows `{"error":"login required"}`. That is expected: port 3000 is the API, and the login page lives on port 5173.

### Reset the demo data
Stop the backend, delete `Backend/billing.db`, and start it again.

PowerShell: `Remove-Item Backend\billing.db`  |  macOS/Linux: `rm Backend/billing.db`

---

## Configuration

### Backend (environment variables)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port the API listens on |
| `DB_FILE` | `billing.db` | SQLite database file |
| `JWT_SECRET` | `dev-jwt-secret` | Signs login tokens. **Required when `NODE_ENV=production`** |
| `TOKEN_TTL` | `8h` | How long a login lasts |
| `WEBHOOK_SECRET` | `dev-secret` | Shared secret the payment gateway sends in `x-webhook-secret` |
| `FRONTEND_URL` | `http://localhost:5173` | Base URL used in password-reset links |
| `SEED_SAMPLE_USERS` | (on) | Set to `false` to skip creating the sample accounts |
| `NODE_ENV` | (unset) | `production` disables the sample accounts and requires `JWT_SECRET` |

Setting variables:
- PowerShell: `$env:JWT_SECRET="a-long-random-string"; npm start`
- macOS/Linux: `JWT_SECRET=a-long-random-string npm start`

### Frontend (`Frontend/.env.example`, copy to `.env.local`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` | Where the API is |
| `VITE_CURRENCY` | `INR` | Currency used to format amounts (the API sends plain numbers) |
| `VITE_DATA_SOURCE` | `api` | `mock` uses the saved files in `public/mock` (read-only, no login) |

---

## Running the tests

From the repository root:

```bash
node --test "tests/*.test.js"
```

---

## How billing works

1. **Run billing** looks for active subscriptions whose *next billing date* has arrived.
2. For each one it creates an invoice for that period: the plan price, less the subscription's discount percentage. The invoice is due 7 days after the period starts.
3. It then moves the subscription's next billing date forward by one cycle, always measured from the original start date.
4. Running it again immediately creates nothing new.
5. When "today" passes an invoice's due date, a pending invoice becomes **overdue** automatically.
6. A payment callback for the exact invoice amount marks the invoice **paid**.

Rules worth knowing:
- **Pause** leaves invoices alone. **Close** voids unpaid invoices. Void invoices never count as owed.
- Plans are priced per subscription at billing time, so a plan price change applies from the next invoice. Invoices already created keep their amount.
- MRR counts **active** subscriptions only, so paused and closed ones leave it.

---

## Demo walkthrough

With a fresh database, "today" in the demo clock is **1 Nov 2026**.

1. **Sign in** as the admin (`admin` / `Admin@12345`, Admin option). You land on the dashboard: MRR 3,562.70, 5 active subscriptions, nothing collected, nothing overdue.
2. Open **Invoices** and click **Run billing**. It creates 4 invoices. Asha's October invoice (499) is already past due, so it shows as overdue, and the dashboard's overdue figure becomes 499.
3. Click **Run billing** again. Nothing is created (nothing is billed twice).
4. Open **Subscriptions** and pause one. Its invoices stay; MRR drops by its monthly value.
5. Click **+30d** in the sidebar, then **Run billing** again to see the next cycle's invoices appear.
6. Open **Plans** as the admin and add a plan. Sign out, sign in as the **Employee**, and notice the *Add a plan* form is gone.
7. As the employee, open **Users** and add a customer.

---

## API reference

All routes need `Authorization: Bearer <token>` unless marked *public*. Responses are plain JSON; prices are numbers; dates are `YYYY-MM-DD`. List routes accept `?limit` (max 200), `?offset` and `?status`, and return the total in the `X-Total-Count` header.

| Method and path | Who | What it does |
|---|---|---|
| `POST /auth/login` | public | Body `{ loginId, password, role: "admin" or "employee" }`. Returns `{ token, user }` |
| `POST /auth/signup` | public | Create a customer account |
| `POST /auth/forgot-password` | public | Request a reset link (always answers the same) |
| `POST /auth/reset-password` | public | Set a new password with a reset token |
| `GET /auth/me` | any login | The signed-in user |
| `POST /users/staff` | admin | Create an employee account |
| `GET /plans` | staff | List plans |
| `POST /plans` | admin | Add a plan `{ name, price, cycle }` |
| `GET /customers`, `POST /customers` | staff | List or add customers |
| `GET /subscriptions`, `POST /subscriptions` | staff | List or create subscriptions |
| `PATCH /subscriptions/:id/status` | staff | `{ status: "active" or "paused" or "closed" }` |
| `GET /invoices`, `GET /invoices/:id` | staff | Invoices, with payment attempts on the detail |
| `GET /invoices/:id/payments` | staff | Payment attempts for an invoice |
| `POST /invoices/:id/void` | staff | Void an unpaid invoice |
| `POST /run-billing` | staff | Create every due invoice; returns `{ created }` |
| `POST /advance-date` | staff | Move the demo date `{ days }` |
| `GET /dashboard-stats` | staff | MRR, active count, collected, overdue, today |
| `POST /payment-webhook` | gateway | Needs header `x-webhook-secret`. Body `{ invoice_id, amount, status: "success" or "failed", method?, note?, gateway_ref? }` |
| `GET/POST/PATCH /taxes` | admin | Tax rates |
| `GET/POST/PATCH /discount-rules`, `GET /discount-rules/active` | admin | Discount rules |

Error shape: `{ "error": "message" }` with status 400 (invalid input), 401 (not signed in), 403 (not allowed), 404 (not found), 409 (conflict, such as an already-paid invoice) or 429 (too many login attempts).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'express'` (or any package) | Run `npm install` inside the folder you are starting (`Backend` or `Frontend`) |
| `{"error":"login required"}` at `localhost:3000` | Expected. Use the app at `localhost:5173` |
| "Invalid login ID or password." with the sample accounts | The database may already hold other accounts. Delete `Backend/billing.db` and restart |
| "Cannot reach the server" on the login page | The backend is not running, or you opened the UI at `127.0.0.1` instead of `localhost` |
| `Failed to load PostCSS config` when starting the frontend | A stray `postcss.config.*` in a parent folder. Add `css: { postcss: {} }` inside `defineConfig({ ... })` in `Frontend/vite.config.js` |
| Port already in use | Stop the other process, or set `PORT` (backend) and pass `--port` to Vite |
| `git pull` refuses because of local changes | `git stash`, then `git pull --rebase`, then `git stash drop` |

---

## Known limitations and roadmap

Honest status, so nobody is surprised:

- **Tax and discount rules are not yet applied to invoices.** Billing currently charges plan price less the subscription's flat discount. The rule screens and the tested calculation in `pricing.js` exist; connecting them to `Run billing`, and storing invoice lines, is the next major step.
- **Products, variants, subscription lines and quotation templates** from the original brief are not built yet. Their tables exist in the schema.
- **The "Users" page manages customers.** There is no screen yet for creating employee login accounts (the API route `POST /users/staff` exists and is admin-only).
- **The demo clock is not admin-only yet.** Any signed-in staff member can move the date.
- **No customer portal** yet; customer accounts can sign up but cannot use the staff screens.
- **Reset links are printed to the server log** instead of being emailed.
- **The invoice workflow is pending, paid, overdue, void.** The brief's Draft and Confirmed steps, and sending or printing an invoice, are not built.
- **Only monthly and yearly plans.** Daily and weekly cycles, minimum quantities and availability dates are not built.
- **Tests:** `payments.test.js` and `pricing-admin.test.js` were written before login was required and need a sign-in step added. The load-test script in `Backend/scripts` needs the same.
- **Repository hygiene:** `Backend/node_modules` is committed to Git even though it is in `.gitignore`. Remove it from tracking with `git rm -r --cached Backend/node_modules`.
- **Sessions are kept in the browser's session storage.** Fine for local use; consider an httpOnly cookie before real deployment.

---

## Contributing

1. Create a branch for your change.
2. Keep tests passing and add tests for new rules.
3. Update `Frontend/CONTRACT.md` when an endpoint the UI uses changes.
4. Open a pull request describing what changed and why.
