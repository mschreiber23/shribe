const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all sessions (with summary)
router.get('/', (req, res) => {
  const { limit = 20, offset = 0, date } = req.query;
  let query = `
    SELECT ws.*, wp.name as plan_name,
           COUNT(DISTINCT sl.id) as total_sets
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    LEFT JOIN set_logs sl ON sl.session_id = ws.id
  `;
  const params = [];
  if (date) {
    query += ' WHERE ws.date = ?';
    params.push(date);
  }
  query += ' GROUP BY ws.id ORDER BY ws.date DESC, ws.id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const sessions = db.prepare(query).all(...params);
  res.json(sessions);
});

// GET single session with full set logs
router.get('/:id', (req, res) => {
  const session = db.prepare(`
    SELECT ws.*, wp.name as plan_name
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    WHERE ws.id = ?
  `).get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const exercises = db.prepare(
    'SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index ASC'
  ).all(session.plan_id);

  const sets = db.prepare(`
    SELECT sl.*, e.name as exercise_name
    FROM set_logs sl
    JOIN exercises e ON e.id = sl.exercise_id
    WHERE sl.session_id = ?
    ORDER BY sl.exercise_id ASC, sl.set_number ASC
  `).all(req.params.id);

  // Group sets by exercise
  const setsByExercise = {};
  for (const s of sets) {
    if (!setsByExercise[s.exercise_id]) {
      setsByExercise[s.exercise_id] = { exercise_id: s.exercise_id, exercise_name: s.exercise_name, sets: [] };
    }
    setsByExercise[s.exercise_id].sets.push(s);
  }

  res.json({ ...session, exercises, logged_exercises: Object.values(setsByExercise) });
});

// POST start/create a session
router.post('/', (req, res) => {
  const { plan_id, date, schedule_entry_id, notes } = req.body;
  if (!plan_id || !date) return res.status(400).json({ error: 'plan_id and date are required' });

  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const result = db.prepare(
    'INSERT INTO workout_sessions (plan_id, date, schedule_entry_id, notes) VALUES (?, ?, ?, ?)'
  ).run(plan_id, date, schedule_entry_id || null, notes || null);

  const session = db.prepare(`
    SELECT ws.*, wp.name as plan_name
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    WHERE ws.id = ?
  `).get(result.lastInsertRowid);

  const exercises = db.prepare(
    'SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index ASC'
  ).all(plan_id);

  res.status(201).json({ ...session, exercises, logged_exercises: [] });
});

// PUT update session (e.g. mark complete, add notes)
router.put('/:id', (req, res) => {
  const { notes, completed_at } = req.body;
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  db.prepare('UPDATE workout_sessions SET notes = ?, completed_at = ? WHERE id = ?')
    .run(notes ?? session.notes, completed_at ?? session.completed_at, req.params.id);

  const updated = db.prepare(`
    SELECT ws.*, wp.name as plan_name
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    WHERE ws.id = ?
  `).get(req.params.id);
  res.json(updated);
});

// DELETE session
router.delete('/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST log a set
router.post('/:id/sets', (req, res) => {
  const { exercise_id, set_number, reps, weight, unit, notes } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'exercise_id is required' });

  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Auto-determine set_number if not provided
  let setNum = set_number;
  if (setNum == null) {
    const last = db.prepare(
      'SELECT MAX(set_number) as max FROM set_logs WHERE session_id = ? AND exercise_id = ?'
    ).get(req.params.id, exercise_id);
    setNum = (last.max ?? 0) + 1;
  }

  const result = db.prepare(
    'INSERT INTO set_logs (session_id, exercise_id, set_number, reps, weight, unit, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, exercise_id, setNum, reps ?? null, weight ?? null, unit || 'lbs', notes || null);

  const setLog = db.prepare('SELECT * FROM set_logs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(setLog);
});

// PUT update a set log
router.put('/:sessionId/sets/:setId', (req, res) => {
  const { reps, weight, unit, notes } = req.body;
  const setLog = db.prepare('SELECT * FROM set_logs WHERE id = ? AND session_id = ?').get(req.params.setId, req.params.sessionId);
  if (!setLog) return res.status(404).json({ error: 'Set not found' });

  db.prepare('UPDATE set_logs SET reps = ?, weight = ?, unit = ?, notes = ? WHERE id = ?')
    .run(reps ?? setLog.reps, weight ?? setLog.weight, unit ?? setLog.unit, notes ?? setLog.notes, req.params.setId);

  const updated = db.prepare('SELECT * FROM set_logs WHERE id = ?').get(req.params.setId);
  res.json(updated);
});

// DELETE a set log
router.delete('/:sessionId/sets/:setId', (req, res) => {
  const setLog = db.prepare('SELECT * FROM set_logs WHERE id = ? AND session_id = ?').get(req.params.setId, req.params.sessionId);
  if (!setLog) return res.status(404).json({ error: 'Set not found' });
  db.prepare('DELETE FROM set_logs WHERE id = ?').run(req.params.setId);
  res.json({ success: true });
});

// GET sets for a specific exercise in a session
router.get('/:id/sets/:exerciseId', (req, res) => {
  const sets = db.prepare(
    'SELECT * FROM set_logs WHERE session_id = ? AND exercise_id = ? ORDER BY set_number ASC'
  ).all(req.params.id, req.params.exerciseId);
  res.json(sets);
});

module.exports = router;
