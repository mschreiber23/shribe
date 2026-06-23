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
    is_global INTEGER NOT NULL DEFAULT 0,
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
  -- Note: existing DBs with UNIQUE(date) only are migrated below

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
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

  CREATE TABLE IF NOT EXISTS activity_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🏃',
    metric_label TEXT,
    show_duration INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type_id INTEGER NOT NULL REFERENCES activity_types(id),
    date TEXT NOT NULL,
    duration_mins INTEGER,
    metric_value TEXT,
    notes TEXT,
    completed_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scheduled_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type_id INTEGER NOT NULL REFERENCES activity_types(id),
    date TEXT NOT NULL,
    notes TEXT,
    UNIQUE(user_id, date, activity_type_id)
  );

  CREATE TABLE IF NOT EXISTS recovery_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
  );

  CREATE TABLE IF NOT EXISTS follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(follower_id, following_id)
  );

  CREATE TABLE IF NOT EXISTS whoop_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    whoop_user_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plan_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    accepted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(plan_id, to_user_id)
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

// Migrate schedule_entries: old table had UNIQUE(date), new needs UNIQUE(date, plan_id)
try {
  const scheduleIndexes = db.prepare("PRAGMA index_list(schedule_entries)").all();
  const hasOldUniqueDate = scheduleIndexes.some(idx => {
    const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all();
    return idx.unique && cols.length === 1 && cols[0].name === 'date';
  });
  if (hasOldUniqueDate) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schedule_entries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
        notes TEXT,
        UNIQUE(date, plan_id)
      );
      INSERT OR IGNORE INTO schedule_entries_new SELECT * FROM schedule_entries;
      DROP TABLE schedule_entries;
      ALTER TABLE schedule_entries_new RENAME TO schedule_entries;
    `);
  }
} catch (e) { /* table may not exist yet */ }

const planCols2 = db.prepare("PRAGMA table_info(workout_plans)").all();
if (planCols2.length > 0 && !planCols2.find(c => c.name === 'sort_order')) {
  db.exec("ALTER TABLE workout_plans ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE workout_plans SET sort_order = id");
}
if (planCols2.length > 0 && !planCols2.find(c => c.name === 'is_global')) {
  db.exec("ALTER TABLE workout_plans ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0");
}

const sessionCols = db.prepare("PRAGMA table_info(workout_sessions)").all();
if (sessionCols.length > 0 && !sessionCols.find(c => c.name === 'user_id')) {
  db.exec("ALTER TABLE workout_sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE");
  // Backfill user_id from the plan's owner
  db.exec("UPDATE workout_sessions SET user_id = (SELECT user_id FROM workout_plans WHERE workout_plans.id = workout_sessions.plan_id)");
}

// Migrations for activity_types and activity_logs new columns
const atCols = db.prepare("PRAGMA table_info(activity_types)").all();
if (atCols.length > 0 && !atCols.find(c => c.name === 'metric_label')) {
  db.exec("ALTER TABLE activity_types ADD COLUMN metric_label TEXT");
  db.exec("UPDATE activity_types SET metric_label = 'Score' WHERE name = 'Golf Round' AND user_id IS NULL");
}
if (atCols.length > 0 && !atCols.find(c => c.name === 'show_duration')) {
  db.exec("ALTER TABLE activity_types ADD COLUMN show_duration INTEGER NOT NULL DEFAULT 1");
  db.exec("UPDATE activity_types SET show_duration = 0 WHERE name = 'Golf Round' AND user_id IS NULL");
}
const alCols = db.prepare("PRAGMA table_info(activity_logs)").all();
if (alCols.length > 0 && !alCols.find(c => c.name === 'metric_value')) {
  db.exec("ALTER TABLE activity_logs ADD COLUMN metric_value TEXT");
}

// Seed default global activity types
const existingTypes = db.prepare('SELECT COUNT(*) as count FROM activity_types WHERE user_id IS NULL').get();
if (existingTypes.count === 0) {
  const defaultActivities = [
    { name: 'Golf Round', emoji: '⛳', metric_label: 'Score', show_duration: 0, sort_order: 0 },
    { name: 'Golf Practice', emoji: '🏌️', metric_label: null, sort_order: 1 },
    { name: 'Tennis', emoji: '🎾', metric_label: null, sort_order: 2 },
    { name: 'Pickleball', emoji: '🏓', metric_label: null, sort_order: 3 },
    { name: 'Baseball Catch', emoji: '⚾', metric_label: null, sort_order: 4 },
    { name: 'Running', emoji: '🏃', metric_label: null, sort_order: 5 },
    { name: 'Cycling', emoji: '🚴', metric_label: null, sort_order: 6 },
    { name: 'Swimming', emoji: '🏊', metric_label: null, sort_order: 7 },
    { name: 'Yoga', emoji: '🧘', metric_label: null, sort_order: 8 },
    { name: 'Hiking', emoji: '🥾', metric_label: null, sort_order: 9 },
  ];
  const insertType = db.prepare('INSERT INTO activity_types (user_id, name, emoji, metric_label, show_duration, sort_order) VALUES (NULL, ?, ?, ?, ?, ?)');
  defaultActivities.forEach(a => insertType.run(a.name, a.emoji, a.metric_label, a.show_duration ?? 1, a.sort_order));
} else {
  // Backfill metric_label for existing Golf Round
  db.prepare("UPDATE activity_types SET metric_label = 'Score' WHERE name = 'Golf Round' AND metric_label IS NULL AND user_id IS NULL").run();
}

module.exports = db;
