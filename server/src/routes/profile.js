const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const AVATARS_DIR = path.join(__dirname, '../../data/avatars');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: AVATARS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `user_${req.userId}${ext}`);
  },
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

function ensureProfile(userId) {
  const existing = db.prepare('SELECT * FROM profile WHERE user_id = ?').get(userId);
  if (!existing) {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const name = user?.email?.split('@')[0] || 'Athlete';
    db.prepare('INSERT INTO profile (user_id, name, username) VALUES (?, ?, ?)').run(userId, name, name.toLowerCase());
    return db.prepare('SELECT * FROM profile WHERE user_id = ?').get(userId);
  }
  return existing;
}

// GET profile
router.get('/', (req, res) => {
  const profile = ensureProfile(req.userId);

  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT ws.id) as total_workouts,
      COUNT(DISTINCT sl.id) as total_sets,
      COALESCE(SUM(sl.reps), 0) as total_reps,
      COALESCE(SUM(CASE WHEN sl.weight IS NOT NULL THEN sl.reps * sl.weight ELSE 0 END), 0) as total_volume
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    LEFT JOIN set_logs sl ON sl.session_id = ws.id
    WHERE ws.completed_at IS NOT NULL AND ws.user_id = ?
  `).get(req.userId);

  res.json({ ...profile, stats, streak: getStreak(req.userId) });
});

// PUT update profile
router.put('/', (req, res) => {
  const { name, username, bio, avatar_color } = req.body;
  ensureProfile(req.userId);
  const profile = db.prepare('SELECT * FROM profile WHERE user_id = ?').get(req.userId);

  db.prepare('UPDATE profile SET name = ?, username = ?, bio = ?, avatar_color = ? WHERE user_id = ?')
    .run(name ?? profile.name, username ?? profile.username, bio ?? profile.bio, avatar_color ?? profile.avatar_color, req.userId);

  res.json(db.prepare('SELECT * FROM profile WHERE user_id = ?').get(req.userId));
});

// POST upload avatar photo
router.post('/avatar', uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  const avatarUrl = `/api/profile/avatar/${req.userId}`;
  db.prepare('UPDATE profile SET avatar_url = ? WHERE user_id = ?').run(avatarUrl, req.userId);
  res.json({ avatar_url: avatarUrl });
});

// GET serve avatar image
router.get('/avatar/:userId', (req, res) => {
  const files = fs.readdirSync(AVATARS_DIR).filter(f => f.startsWith(`user_${req.params.userId}`));
  if (!files.length) return res.status(404).json({ error: 'No avatar' });
  res.sendFile(path.join(AVATARS_DIR, files[0]));
});

// DELETE avatar
router.delete('/avatar', (req, res) => {
  db.prepare('UPDATE profile SET avatar_url = NULL WHERE user_id = ?').run(req.userId);
  const files = fs.readdirSync(AVATARS_DIR).filter(f => f.startsWith(`user_${req.userId}`));
  files.forEach(f => fs.unlinkSync(path.join(AVATARS_DIR, f)));
  res.json({ success: true });
});

// GET feed
router.get('/feed', (req, res) => {
  const { limit = 20, offset = 0 } = req.query;

  const sessions = db.prepare(`
    SELECT ws.id, ws.date, ws.completed_at, ws.notes, wp.name as plan_name
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    WHERE ws.completed_at IS NOT NULL AND ws.user_id = ?
    ORDER BY ws.completed_at DESC
    LIMIT ? OFFSET ?
  `).all(req.userId, Number(limit), Number(offset));

  const posts = sessions.map(session => {
    const sets = db.prepare(`
      SELECT sl.*, e.name as exercise_name, e.section as section, e.order_index
      FROM set_logs sl
      JOIN exercises e ON e.id = sl.exercise_id
      WHERE sl.session_id = ?
      ORDER BY e.order_index ASC, sl.set_number ASC
    `).all(session.id);

    const sectionOrder = [];
    const sectionMap = {};
    for (const s of sets) {
      const sec = s.section || 'Workout';
      if (!sectionMap[sec]) { sectionMap[sec] = {}; sectionOrder.push(sec); }
      if (!sectionMap[sec][s.exercise_id]) {
        sectionMap[sec][s.exercise_id] = { exercise_id: s.exercise_id, exercise_name: s.exercise_name, sets: [] };
      }
      sectionMap[sec][s.exercise_id].sets.push({ set_number: s.set_number, reps: s.reps, weight: s.weight, unit: s.unit });
    }

    const sections = sectionOrder.map(sec => ({ section: sec, exercises: Object.values(sectionMap[sec]) }));
    const totalSets = sets.length;
    const totalReps = sets.reduce((s, r) => s + (r.reps || 0), 0);
    const totalVolume = sets.reduce((s, r) => s + (r.weight && r.reps ? r.weight * r.reps : 0), 0);

    return {
      ...session,
      sections,
      stats: { total_sets: totalSets, total_reps: totalReps, total_volume: Math.round(totalVolume), exercise_count: new Set(sets.map(s => s.exercise_id)).size },
    };
  });

  res.json(posts);
});

function getStreak(userId) {
  const sessions = db.prepare(`
    SELECT DISTINCT ws.date FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    WHERE ws.completed_at IS NOT NULL AND ws.user_id = ?
    ORDER BY ws.date DESC
  `).all(userId);

  if (!sessions.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (sessions[0].date !== today && sessions[0].date !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < sessions.length; i++) {
    const diff = (new Date(sessions[i - 1].date) - new Date(sessions[i].date)) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

module.exports = router;
