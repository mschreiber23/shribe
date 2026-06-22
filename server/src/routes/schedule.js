const express = require('express');
const router = express.Router();
const db = require('../db');

// GET schedule entries for a date range (only plans owned by this user)
router.get('/', (req, res) => {
  const { start, end } = req.query;
  let query = `
    SELECT se.*, wp.name as plan_name, wp.description as plan_description,
           COUNT(DISTINCT e.id) as exercise_count
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    LEFT JOIN exercises e ON e.plan_id = wp.id
    WHERE wp.user_id = ?
  `;
  const params = [req.userId];

  if (start && end) { query += ' AND se.date BETWEEN ? AND ?'; params.push(start, end); }
  else if (start) { query += ' AND se.date >= ?'; params.push(start); }
  else if (end) { query += ' AND se.date <= ?'; params.push(end); }

  query += ' GROUP BY se.id ORDER BY se.date ASC';
  res.json(db.prepare(query).all(...params));
});

// GET schedule by date
router.get('/date/:date', (req, res) => {
  const entry = db.prepare(`
    SELECT se.*, wp.name as plan_name, wp.description as plan_description
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.date = ? AND wp.user_id = ?
  `).get(req.params.date, req.userId);

  if (!entry) return res.json(null);

  const exercises = db.prepare(
    'SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index ASC'
  ).all(entry.plan_id);

  const session = db.prepare(
    'SELECT * FROM workout_sessions WHERE date = ? AND plan_id = ? ORDER BY id DESC LIMIT 1'
  ).get(req.params.date, entry.plan_id);

  res.json({ ...entry, exercises, session: session || null });
});

// POST create/update schedule entry
router.post('/', (req, res) => {
  const { date, plan_id, notes } = req.body;
  if (!date || !plan_id) return res.status(400).json({ error: 'date and plan_id are required' });

  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(plan_id, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  // Remove any existing entry for this date (for this user)
  db.prepare(`
    DELETE FROM schedule_entries WHERE date = ? AND plan_id IN (
      SELECT id FROM workout_plans WHERE user_id = ?
    )
  `).run(date, req.userId);

  db.prepare('INSERT INTO schedule_entries (date, plan_id, notes) VALUES (?, ?, ?)')
    .run(date, plan_id, notes || null);

  const entry = db.prepare(`
    SELECT se.*, wp.name as plan_name
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.date = ? AND wp.user_id = ?
  `).get(date, req.userId);

  res.status(201).json(entry);
});

// DELETE schedule entry by id
router.delete('/:id', (req, res) => {
  const entry = db.prepare(`
    SELECT se.id FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.id = ? AND wp.user_id = ?
  `).get(req.params.id, req.userId);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM schedule_entries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// DELETE schedule by date
router.delete('/date/:date', (req, res) => {
  db.prepare(`
    DELETE FROM schedule_entries WHERE date = ? AND plan_id IN (
      SELECT id FROM workout_plans WHERE user_id = ?
    )
  `).run(req.params.date, req.userId);
  res.json({ success: true });
});

module.exports = router;
