const express = require('express');
const router = express.Router();
const db = require('../db');

// GET profile
router.get('/', (req, res) => {
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get();

  // Attach lifetime stats
  const stats = db.prepare(`
    SELECT
      COUNT(DISTINCT ws.id) as total_workouts,
      COUNT(DISTINCT sl.id) as total_sets,
      COALESCE(SUM(sl.reps), 0) as total_reps,
      COALESCE(SUM(CASE WHEN sl.weight IS NOT NULL THEN sl.reps * sl.weight ELSE 0 END), 0) as total_volume
    FROM workout_sessions ws
    LEFT JOIN set_logs sl ON sl.session_id = ws.id
    WHERE ws.completed_at IS NOT NULL
  `).get();

  const streak = getStreak();

  res.json({ ...profile, stats, streak });
});

// PUT update profile
router.put('/', (req, res) => {
  const { name, username, bio, avatar_color } = req.body;
  const profile = db.prepare('SELECT * FROM profile WHERE id = 1').get();

  db.prepare('UPDATE profile SET name = ?, username = ?, bio = ?, avatar_color = ? WHERE id = 1')
    .run(name ?? profile.name, username ?? profile.username, bio ?? profile.bio, avatar_color ?? profile.avatar_color);

  const updated = db.prepare('SELECT * FROM profile WHERE id = 1').get();
  res.json(updated);
});

// GET feed - completed workout sessions as posts
router.get('/feed', (req, res) => {
  const { limit = 20, offset = 0 } = req.query;

  const sessions = db.prepare(`
    SELECT ws.id, ws.date, ws.completed_at, ws.notes, wp.name as plan_name
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    WHERE ws.completed_at IS NOT NULL
    ORDER BY ws.completed_at DESC
    LIMIT ? OFFSET ?
  `).all(Number(limit), Number(offset));

  const posts = sessions.map(session => {
    const sets = db.prepare(`
      SELECT sl.*, e.name as exercise_name, e.section as section
      FROM set_logs sl
      JOIN exercises e ON e.id = sl.exercise_id
      WHERE sl.session_id = ?
      ORDER BY e.section ASC, e.order_index ASC, sl.set_number ASC
    `).all(session.id);

    // Group sets by exercise preserving section order
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

    const sections = sectionOrder.map(sec => ({
      section: sec,
      exercises: Object.values(sectionMap[sec]),
    }));

    const totalSets = sets.length;
    const totalReps = sets.reduce((sum, s) => sum + (s.reps || 0), 0);
    const totalVolume = sets.reduce((sum, s) => sum + (s.weight && s.reps ? s.weight * s.reps : 0), 0);
    const exerciseCount = new Set(sets.map(s => s.exercise_id)).size;

    return {
      ...session,
      sections,
      stats: { total_sets: totalSets, total_reps: totalReps, total_volume: Math.round(totalVolume), exercise_count: exerciseCount },
    };
  });

  res.json(posts);
});

function getStreak() {
  const sessions = db.prepare(`
    SELECT DISTINCT date FROM workout_sessions
    WHERE completed_at IS NOT NULL
    ORDER BY date DESC
  `).all();

  if (!sessions.length) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  // Streak only counts if worked out today or yesterday
  if (sessions[0].date !== today && sessions[0].date !== yesterday) return 0;

  let streak = 1;
  for (let i = 1; i < sessions.length; i++) {
    const prev = new Date(sessions[i - 1].date);
    const curr = new Date(sessions[i].date);
    const diff = (prev - curr) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

module.exports = router;
