const express = require('express');
const router = express.Router();
const db = require('../db');

// GET check if a date is a recovery day
router.get('/:date', (req, res) => {
  const row = db.prepare('SELECT * FROM recovery_days WHERE user_id = ? AND date = ?').get(req.userId, req.params.date);
  res.json(row || null);
});

// POST log a recovery day
router.post('/', (req, res) => {
  const { date, notes } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required' });

  db.prepare('INSERT OR REPLACE INTO recovery_days (user_id, date, notes) VALUES (?, ?, ?)').run(req.userId, date, notes || null);
  const row = db.prepare('SELECT * FROM recovery_days WHERE user_id = ? AND date = ?').get(req.userId, date);
  res.status(201).json(row);
});

// DELETE remove a recovery day
router.delete('/:date', (req, res) => {
  db.prepare('DELETE FROM recovery_days WHERE user_id = ? AND date = ?').run(req.userId, req.params.date);
  res.json({ success: true });
});

// GET recent recovery days for feed/history
router.get('/', (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const rows = db.prepare('SELECT * FROM recovery_days WHERE user_id = ? ORDER BY date DESC LIMIT ? OFFSET ?').all(req.userId, Number(limit), Number(offset));
  res.json(rows);
});

module.exports = router;
