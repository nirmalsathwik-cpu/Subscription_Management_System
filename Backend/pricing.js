// Pure pricing maths: no database, no Express. Billing and the invoice routes call these.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// A rule is usable on `date` if it is inside its date window and has uses left
function ruleIsLive(rule, date) {
    if (rule.start_date && date < rule.start_date) return false;
    if (rule.end_date && date > rule.end_date) return false;
    if (rule.usage_limit != null && (rule.times_used || 0) >= rule.usage_limit) return false;
    return true;
}

// lines: [{ product_id, quantity, unit_price, tax_rate }]   tax_rate is a percent, e.g. 18
// rules: [{ id, type: 'percent'|'fixed', value, min_purchase, min_quantity,
//           start_date, end_date, usage_limit, times_used, product_id (null = whole subscription) }]
// Returns lines with discount/net/tax/total, the invoice totals, and applied_rule_ids
// (the caller adds 1 to times_used for each id, in the same transaction as the invoice insert).
function calculateInvoice({ lines, rules = [], date }) {
    const out = lines.map((l) => {
        const gross = round2(l.quantity * l.unit_price);
        return { ...l, gross, discount: 0, net: gross };
    });
    const applied = [];

    for (const rule of [...rules].sort((a, b) => a.id - b.id)) {
        if (!ruleIsLive(rule, date)) continue;
        const targets = out.filter((l) => rule.product_id == null || l.product_id === rule.product_id);
        if (!targets.length) continue;

        const base = round2(targets.reduce((s, l) => s + l.net, 0));
        const qty = targets.reduce((s, l) => s + l.quantity, 0);
        if (rule.min_purchase != null && base < rule.min_purchase) continue;
        if (rule.min_quantity != null && qty < rule.min_quantity) continue;

        let total = rule.type === 'percent' ? round2((base * rule.value) / 100) : Math.min(rule.value, base);
        if (total <= 0) continue;

        // Share the discount across the target lines by their net value; the last line takes the rounding remainder
        let left = total;
        targets.forEach((l, i) => {
            const share = i === targets.length - 1 ? left : round2((total * l.net) / base);
            const d = Math.min(share, l.net);
            l.discount = round2(l.discount + d);
            l.net = round2(l.net - d);
            left = round2(left - d);
        });
        applied.push(rule.id);
    }

    for (const l of out) {
        l.tax = round2((l.net * (l.tax_rate || 0)) / 100);
        l.total = round2(l.net + l.tax);
    }
    const sum = (k) => round2(out.reduce((s, l) => s + l[k], 0));
    return {
        lines: out,
        subtotal: sum('gross'),
        discount_total: sum('discount'),
        tax_total: sum('tax'),
        total: sum('total'),
        applied_rule_ids: applied,
    };
}

module.exports = { calculateInvoice, round2 };