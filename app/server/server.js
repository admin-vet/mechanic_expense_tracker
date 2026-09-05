const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { buildState, getEquipment } = require('./state');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
}));

function currentUser(req) {
  if (!req.session.userId) return null;
  const row = db.prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!row) return null;
  return { id: row.id, username: row.username, isAdmin: !!row.is_admin };
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  next();
}

// ---- Auth -------------------------------------------------------------

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get((username || '').trim());
  if (!row || !bcrypt.compareSync(password || '', row.password_hash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  req.session.userId = row.id;
  res.json({ id: row.id, username: row.username, isAdmin: !!row.is_admin });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in.' });
  res.json(user);
});

app.use('/api', (req, res, next) => {
  if (req.path === '/login' || req.path === '/logout' || req.path === '/me') return next();
  requireAuth(req, res, next);
});

// ---- Full state ---------------------------------------------------------

app.get('/api/state', (req, res) => {
  res.json(buildState(req.user));
});

// ---- Users (admin) ------------------------------------------------------

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, isAdmin } = req.body || {};
  const name = (username || '').trim();
  if (!name || !password) return res.status(400).json({ error: 'Username and password are required.' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(name);
  if (exists) return res.status(409).json({ error: 'That username is already taken.' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?)')
    .run(name, hash, isAdmin ? 1 : 0, new Date().toISOString());
  res.json({ ok: true });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { password, isAdmin } = req.body || {};
  if (typeof isAdmin === 'boolean') {
    if (!isAdmin && id === req.user.id) return res.status(400).json({ error: "You can't remove your own admin access." });
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, id);
  }
  if (password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), id);
  }
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't delete your own account." });
  const adminCount = db.prepare('SELECT COUNT(*) AS c FROM users WHERE is_admin = 1').get().c;
  const target = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id);
  if (target && target.is_admin && adminCount <= 1) return res.status(400).json({ error: 'At least one admin account must remain.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---- Categories (admin) ---------------------------------------------------

app.post('/api/categories', requireAdmin, (req, res) => {
  const { name, color } = req.body || {};
  const trimmed = (name || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'Name is required.' });
  const exists = db.prepare('SELECT id FROM categories WHERE name = ?').get(trimmed);
  if (exists) return res.status(409).json({ error: 'That category already exists.' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories').get().m;
  db.prepare('INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)').run(trimmed, color || 'oklch(60% 0.19 0)', maxOrder + 1);
  res.json({ ok: true });
});

app.put('/api/categories/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const { name, color } = req.body || {};
  const trimmed = (name || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'Name is required.' });
  const dupe = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(trimmed, id);
  if (dupe) return res.status(409).json({ error: 'That category already exists.' });
  db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ?').run(trimmed, color, id);
  res.json({ ok: true });
});

// ---- Suppliers ------------------------------------------------------------

app.post('/api/suppliers', (req, res) => {
  const trimmed = ((req.body || {}).name || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'Name is required.' });
  const exists = db.prepare('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE').get(trimmed);
  if (exists) return res.json({ ok: true, id: exists.id });
  const info = db.prepare('INSERT INTO suppliers (name) VALUES (?)').run(trimmed);
  res.json({ ok: true, id: Number(info.lastInsertRowid) });
});

app.put('/api/suppliers/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const trimmed = ((req.body || {}).name || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'Name is required.' });
  const old = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ error: 'Not found.' });
  const dupe = db.prepare('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE AND id != ?').get(trimmed, id);
  if (dupe) return res.status(409).json({ error: 'That supplier already exists.' });
  db.prepare('UPDATE suppliers SET name = ? WHERE id = ?').run(trimmed, id);
  db.prepare('UPDATE line_items SET vendor = ? WHERE vendor = ?').run(trimmed, old.name);
  res.json({ ok: true });
});

app.delete('/api/suppliers/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Equipment --------------------------------------------------------

function saveFiltersAndServices(equipmentId, filters, services) {
  db.prepare('DELETE FROM equipment_filters WHERE equipment_id = ?').run(equipmentId);
  (filters || []).filter((f) => (f.type || '').trim() || (f.partNumber || '').trim()).forEach((f) => {
    db.prepare('INSERT INTO equipment_filters (equipment_id, type, part_number) VALUES (?, ?, ?)').run(equipmentId, f.type || '', f.partNumber || '');
  });
  db.prepare('DELETE FROM service_intervals WHERE equipment_id = ?').run(equipmentId);
  (services || []).filter((s) => (s.name || '').trim()).forEach((s) => {
    db.prepare('INSERT INTO service_intervals (equipment_id, name, interval_hours, last_hours) VALUES (?, ?, ?, ?)').run(equipmentId, s.name, s.interval || '', s.lastHours || '');
  });
}

function findCategoryId(name) {
  const row = db.prepare('SELECT id FROM categories WHERE name = ?').get(name || 'Other');
  return row ? row.id : null;
}

app.post('/api/equipment', requireAdmin, (req, res) => {
  const { name, category, make, model, vin, info, filters, services } = req.body || {};
  const trimmed = (name || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'Name is required.' });
  const exists = db.prepare('SELECT id FROM equipment WHERE name = ?').get(trimmed);
  if (exists) return res.status(409).json({ error: 'That equipment already exists.' });
  const info_ = db.prepare(`
    INSERT INTO equipment (name, category_id, make, model, vin, info, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(trimmed, findCategoryId(category), make || '', model || '', vin || '', info || '', new Date().toISOString());
  const id = Number(info_.lastInsertRowid);
  saveFiltersAndServices(id, filters, services);
  res.json({ ok: true, id });
});

app.put('/api/equipment/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, category, make, model, vin, info, filters, services } = req.body || {};
  const trimmed = (name || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'Name is required.' });
  const dupe = db.prepare('SELECT id FROM equipment WHERE name = ? AND id != ?').get(trimmed, id);
  if (dupe) return res.status(409).json({ error: 'That equipment already exists.' });
  db.prepare(`
    UPDATE equipment SET name = ?, category_id = ?, make = ?, model = ?, vin = ?, info = ? WHERE id = ?
  `).run(trimmed, findCategoryId(category), make || '', model || '', vin || '', info || '', id);
  saveFiltersAndServices(id, filters, services);
  res.json({ ok: true });
});

app.delete('/api/equipment/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM equipment WHERE id = ?').run(id);
  db.prepare('DELETE FROM invoices WHERE id NOT IN (SELECT DISTINCT invoice_id FROM line_items)').run();
  res.json({ ok: true });
});

app.put('/api/equipment/:id/hours', (req, res) => {
  const id = Number(req.params.id);
  const { start, end } = req.body || {};
  const row = db.prepare('SELECT hour_start, hour_end FROM equipment WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  db.prepare('UPDATE equipment SET hour_start = ?, hour_end = ? WHERE id = ?').run(
    start !== undefined ? start : row.hour_start,
    end !== undefined ? end : row.hour_end,
    id,
  );
  res.json({ ok: true });
});

app.post('/api/equipment/:id/service/:serviceId/log', (req, res) => {
  const equipmentId = Number(req.params.id);
  const serviceId = Number(req.params.serviceId);
  const eq = db.prepare('SELECT hour_end FROM equipment WHERE id = ?').get(equipmentId);
  const cur = parseFloat(eq && eq.hour_end);
  if (!eq || Number.isNaN(cur)) return res.status(400).json({ error: 'Set the current hour meter first.' });
  db.prepare('UPDATE service_intervals SET last_hours = ? WHERE id = ? AND equipment_id = ?').run(String(cur), serviceId, equipmentId);
  res.json({ ok: true });
});

// ---- Notes --------------------------------------------------------------

app.post('/api/equipment/:id/notes', (req, res) => {
  const equipmentId = Number(req.params.id);
  const { text, date } = req.body || {};
  const trimmed = (text || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'Note text is required.' });
  db.prepare('INSERT INTO notes (equipment_id, text, date, created_at) VALUES (?, ?, ?, ?)')
    .run(equipmentId, trimmed, date || '', new Date().toISOString());
  res.json({ ok: true });
});

app.delete('/api/notes/:id', (req, res) => {
  db.prepare('DELETE FROM notes WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Invoices / expenses --------------------------------------------------

function resolveEquipmentId(nameOrId) {
  if (!nameOrId) return null;
  if (typeof nameOrId === 'number') return nameOrId;
  const row = db.prepare('SELECT id FROM equipment WHERE name = ?').get(nameOrId);
  return row ? row.id : null;
}

app.post('/api/invoices', (req, res) => {
  const { fileName, lineItems } = req.body || {};
  const items = (lineItems || []).filter((it) => (it.part || '').trim() && (it.equipmentId || it.equipment));
  if (!items.length) return res.status(400).json({ error: 'At least one complete line item with an equipment assignment is required.' });
  const invInfo = db.prepare('INSERT INTO invoices (file_name, saved_at, created_by) VALUES (?, ?, ?)')
    .run(fileName || 'Manual entry', new Date().toISOString(), req.user.id);
  const invoiceId = Number(invInfo.lastInsertRowid);
  const insert = db.prepare(`
    INSERT INTO line_items (invoice_id, part, qty, unit_cost, total_cost, vendor, date, equipment_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  items.forEach((it) => {
    insert.run(invoiceId, it.part || '', it.qty || '', it.unitCost || '', it.totalCost || '', it.vendor || '', it.date || '',
      resolveEquipmentId(it.equipmentId || it.equipment), req.user.id);
  });
  res.json({ ok: true, id: invoiceId });
});

app.delete('/api/line-items/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT invoice_id FROM line_items WHERE id = ?').get(id);
  db.prepare('DELETE FROM line_items WHERE id = ?').run(id);
  if (row) {
    const remaining = db.prepare('SELECT COUNT(*) AS c FROM line_items WHERE invoice_id = ?').get(row.invoice_id).c;
    if (remaining === 0) db.prepare('DELETE FROM invoices WHERE id = ?').run(row.invoice_id);
  }
  res.json({ ok: true });
});

// ---- Start a new year (admin) ---------------------------------------------

app.post('/api/start-new-year', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM line_items').run();
  db.prepare('DELETE FROM invoices').run();
  res.json({ ok: true });
});

// ---- Export / backup --------------------------------------------------

app.get('/api/export', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="farm-fleet-backup-' + new Date().toISOString().slice(0, 10) + '.json"');
  res.json({ version: 1, exportedAt: new Date().toISOString(), ...buildState(req.user) });
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log('Farm Fleet Expenses running at http://localhost:' + PORT);
});
