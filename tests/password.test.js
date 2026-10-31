const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordProblems, hashPassword, verifyPassword, normalizeEmail, isValidEmail } = require('../Backend/auth/passwords');

test('a password meeting every rule has no problems', () => {
    assert.deepEqual(passwordProblems('Abcdefg1!'), []);
});

test('exactly 8 characters is too short ("more than eight")', () => {
    assert.deepEqual(passwordProblems('Abcdef1!'), ['must be more than 8 characters']);
});

test('each missing character class is reported on its own', () => {
    assert.deepEqual(passwordProblems('abcdefgh1!'), ['must contain an uppercase letter']);
    assert.deepEqual(passwordProblems('ABCDEFGH1!'), ['must contain a lowercase letter']);
    assert.deepEqual(passwordProblems('Abcdefghi1'), ['must contain a special character']);
});

test('spaces and digits do not count as special characters', () => {
    assert.ok(passwordProblems('Abcdefgh 1').includes('must contain a special character'));
});

test('empty, missing and non-string passwords are rejected', () => {
    assert.equal(passwordProblems('').length, 4);
    assert.ok(passwordProblems(undefined).length > 0);
    assert.ok(passwordProblems(12345678901).length > 0);
});

test('over 72 characters is rejected (bcrypt would silently ignore the rest)', () => {
    assert.ok(passwordProblems('Aa!' + 'x'.repeat(70)).includes('must be at most 72 characters'));
    assert.deepEqual(passwordProblems('Aa!' + 'x'.repeat(69)), []);
});

test('hash verifies the right password only, and is salted', async () => {
    const h1 = await hashPassword('Abcdefg1!');
    const h2 = await hashPassword('Abcdefg1!');
    assert.notEqual(h1, 'Abcdefg1!');
    assert.notEqual(h1, h2);
    assert.equal(await verifyPassword('Abcdefg1!', h1), true);
    assert.equal(await verifyPassword('abcdefg1!', h1), false);
    assert.equal(await verifyPassword(undefined, h1), false);
});

test('emails are trimmed and lowercased; bad shapes are rejected', () => {
    assert.equal(normalizeEmail('  Bob@Example.COM '), 'bob@example.com');
    assert.equal(normalizeEmail(undefined), '');
    assert.equal(isValidEmail('a@b.co'), true);
    for (const bad of ['', 'a', 'a@b', 'a b@c.com', '@c.com', 'a@.com'])
        assert.equal(isValidEmail(bad), false, bad);
});