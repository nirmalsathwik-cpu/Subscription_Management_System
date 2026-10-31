// Admin endpoints for tax rules and discount rules.
// Registered from server.js with one line:  require('./routes/pricingAdmin')(app, db);
// TODO (auth step): protect every route here with the admin-only check.

const isDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
};
const optNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

module.exports = function registerPricingAdmin(app, db) {
  // ---------- Taxes ----------
  app.get('/taxes', (req, res) => res.json(db.prepare('SELECT * FROM taxes ORDER BY id').all()));

  app.post('/taxes', (req, res) => {
    const { name } = req.body;
    const rate = Number(req.body.rate);
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
    if (!Number.isFinite(rate) || rate < 0 || rate > 100)
      return res.status(400).json({ error: 'rate must be between 0 and 100 (percent)' });
    try {
      const r = db.prepare('INSERT INTO taxes (name, rate) VALUES (?,?)').run(String(name).trim(), rate);
      res.status(201).json(db.prepare('SELECT * FROM taxes WHERE id=?').get(r.lastInsertRowid));
    } catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT'))
        return res.status(409).json({ error: 'a tax with that name already exists' });
      throw e;
    }
  });

  app.patch('/taxes/:id', (req, res) => {
    const tax = db.prepare('SELECT * FROM taxes WHERE id=?').get(req.params.id);
    if (!tax) return res.status(404).json({ error: 'tax not found' });
    const name = req.body.name === undefined ? tax.name : String(req.body.name).trim();
    const rate = req.body.rate === undefined ? tax.rate : Number(req.body.rate);
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!Number.isFinite(rate) || rate < 0 || rate > 100)
      return res.status(400).json({ error: 'rate must be between 0 and 100 (percent)' });
    try {
      db.prepare('UPDATE taxes SET name=?, rate=? WHERE id=?').run(name, rate, tax.id);
    } catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT'))
        return res.status(409).json({ error: 'a tax with that name already exists' });
      throw e;
    }
    res.json(db.prepare('SELECT * FROM taxes WHERE id=?').get(tax.id));
  });

  // ---------- Discount rules ----------
  function readRule(body) {
    const rule = {
      name: body.name && String(body.name).trim(),
      type: body.type,
      value: Number(body.value),
      min_purchase: optNum(body.min_purchase),
      min_quantity: optNum(body.min_quantity),
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      usage_limit: optNum(body.usage_limit),
      product_id: optNum(body.product_id),
      subscription_id: optNum(body.subscription_id),
    };
    if (!rule.name) return { error: 'name required' };
    if (!['percent', 'fixed'].includes(rule.type)) return { error: "type must be 'percent' or 'fixed'" };
    if (!Number.isFinite(rule.value) || rule.value <= 0) return { error: 'value must be greater than 0' };
    if (rule.type === 'percent' && rule.value > 100) return { error: 'a percentage cannot exceed 100' };
    if (rule.min_purchase !== null && !(rule.min_purchase >= 0)) return { error: 'min_purchase must be 0 or more' };
    if (rule.min_quantity !== null && !(Number.isInteger(rule.min_quantity) && rule.min_quantity >= 1))
      return { error: 'min_quantity must be a whole number, 1 or more' };
    if (rule.usage_limit !== null && !(Number.isInteger(rule.usage_limit) && rule.usage_limit >= 1))
      return { error: 'usage_limit must be a whole number, 1 or more' };
    if (rule.start_date && !isDate(rule.start_date)) return { error: 'start_date must be YYYY-MM-DD' };
    if (rule.end_date && !isDate(rule.end_date)) return { error: 'end_date must be YYYY-MM-DD' };
    if (rule.start_date && rule.end_date && rule.end_date < rule.start_date)
      return { error: 'end_date cannot be before start_date' };
    if (rule.subscription_id !== null &&
        !db.prepare('SELECT 1 FROM subscriptions WHERE id=?').get(rule.subscription_id))
      return { error: 'subscription not found' };
    return { rule };
  }

  app.get('/discount-rules', (req, res) =>
    res.json(db.prepare('SELECT * FROM discount_rules ORDER BY id DESC').all()));

  app.post('/discount-rules', (req, res) => {
    const { rule, error } = readRule(req.body);
    if (error) return res.status(400).json({ error });
    const r = db.prepare(`
      INSERT INTO discount_rules
        (name, type, value, min_purchase, min_quantity, start_date, end_date, usage_limit, product_id, subscription_id)
      VALUES (@name,@type,@value,@min_purchase,@min_quantity,@start_date,@end_date,@usage_limit,@product_id,@subscription_id)
    `).run(rule);
    res.status(201).json(db.prepare('SELECT * FROM discount_rules WHERE id=?').get(r.lastInsertRowid));
  });

  app.patch('/discount-rules/:id', (req, res) => {
    const cur = db.prepare('SELECT * FROM discount_rules WHERE id=?').get(req.params.id);
    if (!cur) return res.status(404).json({ error: 'discount rule not found' });
    const { rule, error } = readRule({ ...cur, ...req.body });
    if (error) return res.status(400).json({ error });
    db.prepare(`
      UPDATE discount_rules SET name=@name, type=@type, value=@value, min_purchase=@min_purchase,
        min_quantity=@min_quantity, start_date=@start_date, end_date=@end_date, usage_limit=@usage_limit,
        product_id=@product_id, subscription_id=@subscription_id WHERE id=@id
    `).run({ ...rule, id: cur.id });
    res.json(db.prepare('SELECT * FROM discount_rules WHERE id=?').get(cur.id));
  });

  // Rules that are usable today (in their date window and with uses left): what billing will pick up
  app.get('/discount-rules/active', (req, res) => {
    const today = db.prepare("SELECT value FROM app_state WHERE key='today'").get().value;
    res.json(db.prepare(`
      SELECT * FROM discount_rules
      WHERE (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
        AND (usage_limit IS NULL OR times_used < usage_limit)
      ORDER BY id`).all(today, today));
  });
};
