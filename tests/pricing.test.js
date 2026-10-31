const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateInvoice } = require('../Backend/pricing');

const line = (over = {}) => ({ product_id: 1, quantity: 1, unit_price: 1000, tax_rate: 18, ...over });
const D = '2026-11-01';

test('no discount: tax is added on top', () => {
    const r = calculateInvoice({ lines: [line()], date: D });
    assert.equal(r.subtotal, 1000);
    assert.equal(r.tax_total, 180);
    assert.equal(r.total, 1180);
});

test('percentage discount reduces the amount BEFORE tax', () => {
    const r = calculateInvoice({
        lines: [line()], date: D,
        rules: [{ id: 1, type: 'percent', value: 10 }],
    });
    assert.equal(r.discount_total, 100);
    assert.equal(r.tax_total, 162); // 18% of 900
    assert.equal(r.total, 1062);
    assert.deepEqual(r.applied_rule_ids, [1]);
});

test('fixed discount is capped at the amount it applies to', () => {
    const r = calculateInvoice({
        lines: [line({ unit_price: 50 })], date: D,
        rules: [{ id: 1, type: 'fixed', value: 500 }],
    });
    assert.equal(r.discount_total, 50);
    assert.equal(r.total, 0);
});

test('min quantity and min purchase must be met', () => {
    const rules = [{ id: 1, type: 'percent', value: 10, min_quantity: 5 }];
    assert.deepEqual(calculateInvoice({ lines: [line({ quantity: 4 })], rules, date: D }).applied_rule_ids, []);
    assert.deepEqual(calculateInvoice({ lines: [line({ quantity: 5 })], rules, date: D }).applied_rule_ids, [1]);
    const r2 = [{ id: 2, type: 'fixed', value: 100, min_purchase: 2000 }];
    assert.deepEqual(calculateInvoice({ lines: [line()], rules: r2, date: D }).applied_rule_ids, []);
});

test('rule is ignored before start, after end, and once the usage limit is reached', () => {
    const base = { id: 1, type: 'percent', value: 10 };
    const run = (rule) => calculateInvoice({ lines: [line()], rules: [{ ...base, ...rule }], date: D }).applied_rule_ids;
    assert.deepEqual(run({ start_date: '2026-12-01' }), []);
    assert.deepEqual(run({ end_date: '2026-10-31' }), []);
    assert.deepEqual(run({ end_date: '2026-11-01' }), [1]);     // end date is inclusive
    assert.deepEqual(run({ usage_limit: 3, times_used: 3 }), []);
    assert.deepEqual(run({ usage_limit: 3, times_used: 2 }), [1]);
});

test('product-scoped rule only touches matching lines', () => {
    const r = calculateInvoice({
        lines: [line({ product_id: 1 }), line({ product_id: 2 })], date: D,
        rules: [{ id: 1, type: 'percent', value: 50, product_id: 2 }],
    });
    assert.equal(r.lines[0].discount, 0);
    assert.equal(r.lines[1].discount, 500);
});

test('whole-subscription fixed discount is split across lines and adds up exactly', () => {
    const r = calculateInvoice({
        lines: [line({ unit_price: 100 }), line({ unit_price: 100 }), line({ unit_price: 100 })], date: D,
        rules: [{ id: 1, type: 'fixed', value: 10 }],
    });
    assert.equal(r.discount_total, 10);
    assert.equal(r.subtotal - r.discount_total, 290);
});

test('two rules stack, each on what is left', () => {
    const r = calculateInvoice({
        lines: [line({ tax_rate: 0 })], date: D,
        rules: [{ id: 1, type: 'percent', value: 10 }, { id: 2, type: 'percent', value: 10 }],
    });
    assert.equal(r.total, 810); // 1000 -> 900 -> 810
});