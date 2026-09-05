const db = require('./db');

function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all()
    .map((c) => ({ id: c.id, name: c.name, color: c.color }));
}

function getSuppliers() {
  return db.prepare('SELECT * FROM suppliers ORDER BY name COLLATE NOCASE').all()
    .map((s) => ({ id: s.id, name: s.name }));
}

function getEquipment() {
  const rows = db.prepare(`
    SELECT e.*, c.name AS category_name
    FROM equipment e LEFT JOIN categories c ON c.id = e.category_id
    ORDER BY e.name COLLATE NOCASE
  `).all();
  const filters = db.prepare('SELECT * FROM equipment_filters').all();
  const services = db.prepare('SELECT * FROM service_intervals').all();
  const notes = db.prepare('SELECT * FROM notes ORDER BY created_at').all();

  return rows.map((e) => ({
    id: e.id,
    name: e.name,
    categoryId: e.category_id,
    category: e.category_name || 'Other',
    make: e.make,
    model: e.model,
    vin: e.vin,
    info: e.info,
    hourStart: e.hour_start,
    hourEnd: e.hour_end,
    filters: filters.filter((f) => f.equipment_id === e.id).map((f) => ({ id: f.id, type: f.type, partNumber: f.part_number })),
    services: services.filter((s) => s.equipment_id === e.id).map((s) => ({ id: s.id, name: s.name, interval: s.interval_hours, lastHours: s.last_hours })),
    notes: notes.filter((n) => n.equipment_id === e.id).map((n) => ({ id: n.id, text: n.text, date: n.date })),
  }));
}

function getInvoices() {
  const invoices = db.prepare('SELECT * FROM invoices ORDER BY id').all();
  const lineItems = db.prepare(`
    SELECT li.*, e.name AS equipment_name, u.username AS created_by_name
    FROM line_items li
    LEFT JOIN equipment e ON e.id = li.equipment_id
    LEFT JOIN users u ON u.id = li.created_by
  `).all();
  return invoices.map((inv) => ({
    id: inv.id,
    fileName: inv.file_name,
    savedAt: inv.saved_at,
    lineItems: lineItems.filter((li) => li.invoice_id === inv.id).map((li) => ({
      id: li.id,
      part: li.part,
      qty: li.qty,
      unitCost: li.unit_cost,
      totalCost: li.total_cost,
      vendor: li.vendor,
      date: li.date,
      equipmentId: li.equipment_id,
      equipment: li.equipment_name || '',
      createdBy: li.created_by_name || '',
    })),
  }));
}

function getUsers() {
  return db.prepare('SELECT id, username, is_admin, created_at FROM users ORDER BY username COLLATE NOCASE').all()
    .map((u) => ({ id: u.id, username: u.username, isAdmin: !!u.is_admin, createdAt: u.created_at }));
}

function buildState(currentUser) {
  return {
    user: currentUser,
    categories: getCategories(),
    suppliers: getSuppliers(),
    equipment: getEquipment(),
    invoices: getInvoices(),
    users: currentUser.isAdmin ? getUsers() : undefined,
  };
}

module.exports = { getCategories, getSuppliers, getEquipment, getInvoices, getUsers, buildState };
