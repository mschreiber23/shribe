const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all activity types (global + user's custom)
router.get('/types', (req, res) => {
  const types = db.prepare(`
    SELECT * FROM activity_types
    WHERE user_id IS NULL OR user_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(req.userId);
  res.json(types);
});

// POST create custom activity type
router.post('/types', (req, res) => {
  const { name, emoji } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM activity_types WHERE user_id = ?').get(req.userId);
  const result = db.prepare('INSERT INTO activity_types (user_id, name, emoji, sort_order) VALUES (?, ?, ?, ?)').run(req.userId, name, emoji || '🏃', (maxOrder.max ?? 100) + 1);
  res.status(201).json(db.prepare('SELECT * FROM activity_types WHERE id = ?').get(result.lastInsertRowid));
});

// DELETE custom activity type (only user's own)
router.delete('/types/:id', (req, res) => {
  const type = db.prepare('SELECT * FROM activity_types WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!type) return res.status(404).json({ error: 'Activity type not found' });
  db.prepare('DELETE FROM activity_types WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET activity logs
router.get('/', (req, res) => {
  const { limit = 20, offset = 0, date } = req.query;
  let query = `
    SELECT al.*, at.name as type_name, at.emoji, at.metric_label
    FROM activity_logs al
    JOIN activity_types at ON at.id = al.activity_type_id
    WHERE al.user_id = ?
  `;
  const params = [req.userId];
  if (date) { query += ' AND al.date = ?'; params.push(date); }
  query += ' ORDER BY al.date DESC, al.id DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  res.json(db.prepare(query).all(...params));
});

// POST log an activity
router.post('/', (req, res) => {
  const { activity_type_id, date, duration_mins, metric_value, notes } = req.body;
  if (!activity_type_id || !date) return res.status(400).json({ error: 'activity_type_id and date are required' });

  const type = db.prepare('SELECT * FROM activity_types WHERE id = ? AND (user_id IS NULL OR user_id = ?)').get(activity_type_id, req.userId);
  if (!type) return res.status(404).json({ error: 'Activity type not found' });

  const result = db.prepare('INSERT INTO activity_logs (user_id, activity_type_id, date, duration_mins, metric_value, notes) VALUES (?, ?, ?, ?, ?, ?)').run(req.userId, activity_type_id, date, duration_mins || null, metric_value || null, notes || null);
  const log = db.prepare(`
    SELECT al.*, at.name as type_name, at.emoji, at.metric_label
    FROM activity_logs al JOIN activity_types at ON at.id = al.activity_type_id
    WHERE al.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(log);
});

// PUT update activity log
router.put('/:id', (req, res) => {
  const { duration_mins, notes } = req.body;
  const log = db.prepare('SELECT * FROM activity_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!log) return res.status(404).json({ error: 'Activity not found' });
  db.prepare('UPDATE activity_logs SET duration_mins = ?, notes = ? WHERE id = ?').run(duration_mins ?? log.duration_mins, notes ?? log.notes, req.params.id);
  const updated = db.prepare('SELECT al.*, at.name as type_name, at.emoji FROM activity_logs al JOIN activity_types at ON at.id = al.activity_type_id WHERE al.id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE activity log
router.delete('/:id', (req, res) => {
  const log = db.prepare('SELECT * FROM activity_logs WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!log) return res.status(404).json({ error: 'Activity not found' });
  db.prepare('DELETE FROM activity_logs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
