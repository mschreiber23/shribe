const express = require('express');
const router = express.Router();
const db = require('../db');

// GET schedule entries for a date range
// Query params: start, end (YYYY-MM-DD)
router.get('/', (req, res) => {
  const { start, end } = req.query;
  let query = `
    SELECT se.*, wp.name as plan_name, wp.description as plan_description,
           COUNT(DISTINCT e.id) as exercise_count
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    LEFT JOIN exercises e ON e.plan_id = wp.id
  `;
  const params = [];

  if (start && end) {
    query += ' WHERE se.date BETWEEN ? AND ?';
    params.push(start, end);
  } else if (start) {
    query += ' WHERE se.date >= ?';
    params.push(start);
  } else if (end) {
    query += ' WHERE se.date <= ?';
    params.push(end);
  }

  query += ' GROUP BY se.id ORDER BY se.date ASC';
  const entries = db.prepare(query).all(...params);
  res.json(entries);
});

// GET single schedule entry
router.get('/:id', (req, res) => {
  const entry = db.prepare(`
    SELECT se.*, wp.name as plan_name
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.id = ?
  `).get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Schedule entry not found' });
  res.json(entry);
});

// GET schedule by date
router.get('/date/:date', (req, res) => {
  const entry = db.prepare(`
    SELECT se.*, wp.name as plan_name, wp.description as plan_description
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.date = ?
  `).get(req.params.date);

  if (!entry) return res.json(null);

  const exercises = db.prepare(
    'SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index ASC'
  ).all(entry.plan_id);

  const session = db.prepare(
    'SELECT * FROM workout_sessions WHERE date = ? AND plan_id = ? ORDER BY id DESC LIMIT 1'
  ).get(req.params.date, entry.plan_id);

  res.json({ ...entry, exercises, session: session || null });
});

// POST create schedule entry
router.post('/', (req, res) => {
  const { date, plan_id, notes } = req.body;
  if (!date || !plan_id) return res.status(400).json({ error: 'date and plan_id are required' });

  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  // Upsert - if date already has an entry, update it
  const existing = db.prepare('SELECT * FROM schedule_entries WHERE date = ?').get(date);
  if (existing) {
    db.prepare('UPDATE schedule_entries SET plan_id = ?, notes = ? WHERE date = ?')
      .run(plan_id, notes || null, date);
  } else {
    db.prepare('INSERT INTO schedule_entries (date, plan_id, notes) VALUES (?, ?, ?)')
      .run(date, plan_id, notes || null);
  }

  const entry = db.prepare(`
    SELECT se.*, wp.name as plan_name
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.date = ?
  `).get(date);

  res.status(201).json(entry);
});

// DELETE schedule entry
router.delete('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM schedule_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Schedule entry not found' });
  db.prepare('DELETE FROM schedule_entries WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// DELETE by date
router.delete('/date/:date', (req, res) => {
  db.prepare('DELETE FROM schedule_entries WHERE date = ?').run(req.params.date);
  res.json({ success: true });
});

module.exports = router;
