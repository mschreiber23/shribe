const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gym.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS workout_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    UNIQUE(date)
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
    id INTEGER PRIMARY KEY CHECK (id = 1),
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

// Ensure single profile row always exists
db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();

module.exports = db;
