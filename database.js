const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./vpn_bot.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    telegram_id INTEGER UNIQUE,
    username TEXT,
    first_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    plan_type TEXT,
    price REAL,
    start_date DATETIME,
    end_date DATETIME,
    is_active INTEGER DEFAULT 1,
    vpn_config TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    amount REAL,
    plan_type TEXT,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);
});

module.exports = db;
