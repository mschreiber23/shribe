const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gym.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    section TEXT NOT NULL DEFAULT 'Workout',
    order_index INTEGER NOT NULL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS schedule_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
    notes TEXT,
    UNIQUE(date, plan_id)
  );

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_entry_id INTEGER REFERENCES schedule_entries(id) ON DELETE SET NULL,
    plan_id INTEGER NOT NULL REFERENCES workout_plans(id),
    date TEXT NOT NULL,
    notes TEXT,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS set_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    set_number INTEGER NOT NULL,
    reps INTEGER,
    weight REAL,
    unit TEXT NOT NULL DEFAULT 'lbs',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Athlete',
    username TEXT NOT NULL DEFAULT 'me',
    bio TEXT,
    avatar_color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrations for existing databases
const exCols = db.prepare("PRAGMA table_info(exercises)").all();
if (exCols.length > 0 && !exCols.find(c => c.name === 'section')) {
  db.exec("ALTER TABLE exercises ADD COLUMN section TEXT NOT NULL DEFAULT 'Workout'");
}

const planCols = db.prepare("PRAGMA table_info(workout_plans)").all();
if (planCols.length > 0 && !planCols.find(c => c.name === 'user_id')) {
  db.exec("ALTER TABLE workout_plans ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
}

const profileCols = db.prepare("PRAGMA table_info(profile)").all();
if (profileCols.length > 0 && !profileCols.find(c => c.name === 'avatar_url')) {
  db.exec("ALTER TABLE profile ADD COLUMN avatar_url TEXT");
}

const planCols2 = db.prepare("PRAGMA table_info(workout_plans)").all();
if (planCols2.length > 0 && !planCols2.find(c => c.name === 'sort_order')) {
  db.exec("ALTER TABLE workout_plans ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  // Initialize sort_order from existing row order
  db.exec("UPDATE workout_plans SET sort_order = id");
}

// Fix old schedule_entries UNIQUE constraint (date only → date+plan_id)
// SQLite can't drop constraints, so we check if a duplicate would fail gracefully

module.exports = db;
