// Password rules and hashing. No database, no Express: easy to test on its own.
const bcrypt = require('bcryptjs');

const COST = 10; // bcrypt work factor

// "more than eight characters, with an uppercase letter, a lowercase letter and a special character"
// Returns a list of problems; an empty list means the password is fine.
function passwordProblems(pw) {
    const p = typeof pw === 'string' ? pw : '';
    const problems = [];
    if (p.length <= 8) problems.push('must be more than 8 characters');
    if (!/[A-Z]/.test(p)) problems.push('must contain an uppercase letter');
    if (!/[a-z]/.test(p)) problems.push('must contain a lowercase letter');
    if (!/[^A-Za-z0-9\s]/.test(p)) problems.push('must contain a special character');
    if (p.length > 72) problems.push('must be at most 72 characters'); // bcrypt ignores anything past 72 bytes
    return problems;
}

const hashPassword = (pw) => bcrypt.hash(pw, COST);               // async, doesn't block the server
const verifyPassword = (pw, hash) => bcrypt.compare(String(pw || ''), hash);

// Emails are compared in lowercase so "A@x.com" and "a@x.com" are the same account
const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

const normalizeLoginId = (v) => String(v || '').trim().toLowerCase().slice(0, 254);
const isValidUsername = (u) => /^[a-z0-9._-]{3,32}$/.test(u);

module.exports = { passwordProblems, hashPassword, verifyPassword, normalizeEmail, isValidEmail, normalizeLoginId, isValidUsername };