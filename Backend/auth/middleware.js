const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';
if (!process.env.JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set when NODE_ENV=production');
    console.warn('WARNING: JWT_SECRET not set, using insecure default "dev-jwt-secret"');
}
const TOKEN_TTL = process.env.TOKEN_TTL || '8h';

module.exports = function makeAuth(db) {
    const signToken = (user) => jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });

    function requireAuth(req, res, next) {
        const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
        if (!m) return res.status(401).json({ error: 'login required' });
        let payload;
        try {
            payload = jwt.verify(m[1], JWT_SECRET, { algorithms: ['HS256'] });
        } catch (e) {
            return res.status(401).json({ error: 'invalid or expired token' });
        }
        const user = db.prepare('SELECT id, email, username, role, customer_id FROM users WHERE id=?').get(payload.sub);
        if (!user) return res.status(401).json({ error: 'account no longer exists' });
        req.user = user;
        next();
    }

    const allowRoles = (...roles) => (req, res, next) =>
        roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'not allowed for your role' });

    const requireRole = (...roles) => [requireAuth, allowRoles(...roles)];

    return { signToken, requireAuth, allowRoles, requireRole };
};