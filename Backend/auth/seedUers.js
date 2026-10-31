const bcrypt = require('bcryptjs');

const SAMPLE_USERS = [
    { username: 'admin', email: 'admin@ledgerline.test', password: 'Admin@12345', role: 'admin' },
    { username: 'employee', email: 'employee@ledgerline.test', password: 'Employee@12345', role: 'staff' },
];

module.exports = function seedSampleUsers(db) {
    if (process.env.NODE_ENV === 'production' || process.env.SEED_SAMPLE_USERS === 'false') return false;
    const existing = db.prepare("SELECT COUNT(*) c FROM users WHERE role IN ('admin','staff')").get().c;
    if (existing > 0) return false;
    const insert = db.prepare('INSERT INTO users (email, username, password_hash, role) VALUES (?,?,?,?)');
    db.transaction(() => {
        for (const u of SAMPLE_USERS) insert.run(u.email, u.username, bcrypt.hashSync(u.password, 10), u.role);
    })();
    return true;
};
module.exports.SAMPLE_USERS = SAMPLE_USERS;