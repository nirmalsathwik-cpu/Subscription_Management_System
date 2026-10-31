// Login-token helpers and route guards.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';
if (!process.env.JWT_SECRET)
    console.warn('WARNING: JWT_SECRET not set, using insecure default "dev-jwt-secret"');
const TOKEN_TTL = process.env.TOKEN_TTL || '8h';

module.exports = function makeAuth(db) {
    const signToken = (user) => jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });

    // Reads "Authorization: Bearer <token>", loads the user, puts it on req.user
    function requireAuth(req, res, next) {
        const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
        if (!m) return res.status(401).json({ error: 'login required' });
        let payload;
        try {
            payload = jwt.verify(m[1], JWT_SECRET, { algorithms: ['HS256'] });
        } catch (e) {
            return res.status(401).json({ error: 'invalid or expired token' });
        }
        // Loaded fresh each request, so a deleted user or changed role takes effect immediately
        const user = db.prepare('SELECT id, email, role, customer_id FROM users WHERE id=?').get(payload.sub);
        if (!user) return res.status(401).json({ error: 'account no longer exists' });
        req.user = user;
        next();
    }

    // Usage: app.post('/x', requireRole('admin', 'staff'), handler)
    const requireRole = (...roles) => [
        requireAuth,
        (req, res, next) =>
            roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'not allowed for your role' }),
    ];

    return { signToken, requireAuth, requireRole };
};