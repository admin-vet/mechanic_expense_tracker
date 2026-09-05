const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    make TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    vin TEXT NOT NULL DEFAULT '',
    info TEXT NOT NULL DEFAULT '',
    hour_start TEXT NOT NULL DEFAULT '',
    hour_end TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS equipment_filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT '',
    part_number TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS service_intervals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    interval_hours TEXT NOT NULL DEFAULT '',
    last_hours TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    date TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL DEFAULT '',
    saved_at TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    part TEXT NOT NULL DEFAULT '',
    qty TEXT NOT NULL DEFAULT '',
    unit_cost TEXT NOT NULL DEFAULT '',
    total_cost TEXT NOT NULL DEFAULT '',
    vendor TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL DEFAULT '',
    equipment_id INTEGER REFERENCES equipment(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
`);

const DEFAULT_CATEGORIES = [
  ['Car / Truck', 'oklch(60% 0.19 260)'],
  ['Combine', 'oklch(60% 0.19 29)'],
  ['Tractor', 'oklch(60% 0.19 140)'],
  ['Construction Equipment', 'oklch(60% 0.19 80)'],
  ['Telehandler', 'oklch(60% 0.19 320)'],
  ['Other', 'oklch(60% 0.19 200)'],
];

function seed() {
  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const insert = db.prepare('INSERT INTO categories (name, color, sort_order) VALUES (?, ?, ?)');
    DEFAULT_CATEGORIES.forEach(([name, color], i) => insert.run(name, color, i));
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)')
      .run('admin', hash, new Date().toISOString());
    // eslint-disable-next-line no-console
    console.log('Created default admin account — username: admin / password: admin123 (change this after first login).');
  }
}

seed();

module.exports = db;
