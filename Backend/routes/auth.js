// Sign-up, login, password reset and staff creation.
// Registered from server.js:  require('./routes/auth')(app, db, auth);
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { passwordProblems, hashPassword, verifyPassword, normalizeEmail, isValidEmail, normalizeLoginId, isValidUsername } = require('../auth/passwords');
const makeLoginLimiter = require('../auth/loginLimiter');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const RESET_MINUTES = 60;
// Compared against when the email is unknown, so "no such user" takes as long as "wrong password"
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 10);

const ROLE_FOR = { admin: 'admin', employee: 'staff' };
const LOGIN_TYPE_OF = { admin: 'Admin', staff: 'Employee' };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); // Express 4 doesn't catch async errors
const isConstraint = (e) => String(e.code).startsWith('SQLITE_CONSTRAINT');

module.exports = function registerAuth(app, db, { signToken, requireRole, requireAuth }) {
    const getUser = (id) => db.prepare('SELECT id, email, username, role, customer_id FROM users WHERE id=?').get(id);
    const limiter = makeLoginLimiter();
    const findByLoginId = (id) =>
        db.prepare(id.includes('@') ? 'SELECT * FROM users WHERE email=?' : 'SELECT * FROM users WHERE username=?').get(id);

    function badPassword(res, password) {
        const problems = passwordProblems(password);
        if (!problems.length) return false;
        res.status(400).json({ error: 'password does not meet the rules', problems });
        return true;
    }

    // ----- Customer sign-up -----
    app.post('/auth/signup', wrap(async (req, res) => {
        const name = String(req.body.name || '').trim();
        const email = normalizeEmail(req.body.email);
        const { password } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });
        if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid email' });
        if (badPassword(res, password)) return;

        const taken = db.prepare('SELECT 1 FROM users WHERE email=?').get(email)
            || db.prepare('SELECT 1 FROM customers WHERE email=?').get(email);
        if (taken) return res.status(409).json({ error: 'an account with this email already exists' });

        const hash = await hashPassword(password);
        try {
            const userId = db.transaction(() => {
                const cid = db.prepare('INSERT INTO customers (name, email) VALUES (?,?)').run(name, email).lastInsertRowid;
                return db.prepare('INSERT INTO users (email, password_hash, role, customer_id) VALUES (?,?,?,?)')
                    .run(email, hash, 'customer', cid).lastInsertRowid;
            })();
            const user = getUser(userId);
            res.status(201).json({ token: signToken(user), user });
        } catch (e) {
            if (isConstraint(e)) return res.status(409).json({ error: 'an account with this email already exists' });
            throw e;
        }
    }));

    // ----- Login -----
    app.post('/auth/login', wrap(async (req, res) => {
        const body = req.body || {};
        const loginId = normalizeLoginId(body.loginId !== undefined ? body.loginId : body.email);
        const choice = body.role === undefined || body.role === null ? null : String(body.role);
        if (choice !== null && !ROLE_FOR[choice])
            return res.status(400).json({ error: 'choose Admin or Employee login' });

        const wait = limiter.retryAfter(loginId, req.ip);
        if (wait) {
            res.set('Retry-After', String(wait));
            return res.status(429).json({ error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` });
        }

        const row = findByLoginId(loginId);
        const ok = await verifyPassword(body.password, row ? row.password_hash : DUMMY_HASH);
        if (!row || !ok) {
            limiter.fail(loginId, req.ip);
            return res.status(401).json({ error: 'Invalid login ID or password.' });
        }
        limiter.succeed(loginId, req.ip);

        if (choice !== null && row.role !== ROLE_FOR[choice]) {
            const mine = LOGIN_TYPE_OF[row.role];
            return res.status(403).json({
                error: mine
                    ? `These credentials belong to an ${mine} account. Select "${mine}" to sign in.`
                    : 'This account cannot sign in here.',
            });
        }
        const user = getUser(row.id);
        res.json({ token: signToken(user), user });
    }));

    app.get('/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

    // ----- Forgot password: always answers the same, so emails can't be probed -----
    app.post('/auth/forgot-password', (req, res) => {
        const email = normalizeEmail(req.body.email);
        const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            const now = new Date();
            const expires = new Date(now.getTime() + RESET_MINUTES * 60000).toISOString();
            db.transaction(() => {
                db.prepare('UPDATE password_resets SET used_at=? WHERE user_id=? AND used_at IS NULL')
                    .run(now.toISOString(), user.id); // older links stop working
                db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)')
                    .run(user.id, sha256(token), expires);
            })();
            // TODO: replace this log with a real email (nodemailer) once SMTP details exist
            console.log(`[password reset] ${email}: ${FRONTEND_URL}/reset-password?token=${token}`);
        }
        res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
    });

    // ----- Reset password -----
    app.post('/auth/reset-password', wrap(async (req, res) => {
        const row = db.prepare('SELECT * FROM password_resets WHERE token_hash=?').get(sha256(String(req.body.token || '')));
        if (!row || row.used_at || row.expires_at < new Date().toISOString())
            return res.status(400).json({ error: 'reset link is invalid or has expired' });
        if (badPassword(res, req.body.password)) return; // token is not used up, they can retry
        const hash = await hashPassword(req.body.password);
        db.transaction(() => {
            db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, row.user_id);
            db.prepare('UPDATE password_resets SET used_at=? WHERE id=?').run(new Date().toISOString(), row.id);
        })();
        res.json({ ok: true });
    }));

    // ----- Admin adds a staff member -----
    app.post('/users/staff', requireRole('admin'), wrap(async (req, res) => {
        const email = normalizeEmail(req.body.email);
        if (!isValidEmail(email)) return res.status(400).json({ error: 'invalid email' });
        const username = req.body.username ? normalizeLoginId(req.body.username) : null;
        if (username && !isValidUsername(username))
            return res.status(400).json({ error: 'username must be 3-32 characters: letters, digits, . _ -' });
// ...
        db.prepare('INSERT INTO users (email, username, password_hash, role) VALUES (?,?,?,?)')
            .run(email, username, hash, 'staff').lastInsertRowid;
        if (badPassword(res, req.body.password)) return;
        const hash = await hashPassword(req.body.password);
        try {
            const id = db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?,?,?)')
                .run(email, hash, 'staff').lastInsertRowid;
            res.status(201).json({ user: getUser(id) });
        } catch (e) {
            if (isConstraint(e)) return res.status(409).json({ error: 'an account with this email already exists' });
            throw e;
        }
    }));
};