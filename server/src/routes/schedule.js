const express = require('express');
const router = express.Router();
const db = require('../db');

// GET schedule entries for a date range.
// Returns scheduled entries PLUS any completed sessions not already in schedule_entries.
router.get('/', (req, res) => {
  const { start, end } = req.query;
  const dateClause = (alias) => {
    if (start && end) return `AND ${alias}.date BETWEEN ? AND ?`;
    if (start) return `AND ${alias}.date >= ?`;
    if (end) return `AND ${alias}.date <= ?`;
    return '';
  };
  const dateParams = start && end ? [start, end] : start ? [start] : end ? [end] : [];

  // Scheduled entries
  const scheduled = db.prepare(`
    SELECT se.id, se.date, se.plan_id, se.notes,
           wp.name as plan_name, wp.description as plan_description,
           COUNT(DISTINCT e.id) as exercise_count,
           MAX(CASE WHEN ws.completed_at IS NOT NULL AND ws.date = se.date THEN 1 ELSE 0 END) as is_completed
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    LEFT JOIN exercises e ON e.plan_id = wp.id
    LEFT JOIN workout_sessions ws ON ws.plan_id = se.plan_id AND ws.date = se.date AND ws.completed_at IS NOT NULL
    WHERE wp.user_id = ? ${dateClause('se')}
    GROUP BY se.id
  `).all(req.userId, ...dateParams);

  // Completed sessions not in schedule_entries for that date+plan
  const completed = db.prepare(`
    SELECT DISTINCT ws.plan_id, ws.date,
           wp.name as plan_name, wp.description as plan_description,
           COUNT(DISTINCT e.id) as exercise_count,
           1 as is_completed,
           NULL as id, NULL as notes
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    LEFT JOIN exercises e ON e.plan_id = wp.id
    WHERE ws.completed_at IS NOT NULL AND wp.user_id = ?
      ${dateClause('ws')}
      AND NOT EXISTS (
        SELECT 1 FROM schedule_entries se2
        WHERE se2.date = ws.date AND se2.plan_id = ws.plan_id
      )
    GROUP BY ws.plan_id, ws.date
  `).all(req.userId, ...dateParams);

  // Scheduled activities (pre-planned), marked completed if an activity_log exists for same date+type
  let saQuery = `
    SELECT sa.id, sa.date, NULL as plan_id, at.name as plan_name, NULL as plan_description,
           0 as exercise_count,
           CASE WHEN EXISTS (
             SELECT 1 FROM activity_logs al2
             WHERE al2.user_id = sa.user_id AND al2.date = sa.date AND al2.activity_type_id = sa.activity_type_id
           ) THEN 1 ELSE 0 END as is_completed,
           0 as is_recovery_day, 1 as is_activity,
           at.emoji, sa.activity_type_id,
           (SELECT al3.metric_value FROM activity_logs al3 WHERE al3.user_id = sa.user_id AND al3.date = sa.date AND al3.activity_type_id = sa.activity_type_id LIMIT 1) as metric_value,
           (SELECT at2.metric_label FROM activity_types at2 WHERE at2.id = sa.activity_type_id) as metric_label_val,
           (SELECT al3.location FROM activity_logs al3 WHERE al3.user_id = sa.user_id AND al3.date = sa.date AND al3.activity_type_id = sa.activity_type_id LIMIT 1) as location
    FROM scheduled_activities sa
    JOIN activity_types at ON at.id = sa.activity_type_id
    WHERE sa.user_id = ?
  `;
  const saParams = [req.userId];
  if (start && end) { saQuery += ' AND sa.date BETWEEN ? AND ?'; saParams.push(start, end); }
  else if (start) { saQuery += ' AND sa.date >= ?'; saParams.push(start); }
  else if (end) { saQuery += ' AND sa.date <= ?'; saParams.push(end); }
  const scheduledActivities = db.prepare(saQuery).all(...saParams);

  // Completed activity logs not already covered by scheduled_activities
  let alQuery = `
    SELECT al.id, al.date, NULL as plan_id, at.name as plan_name, NULL as plan_description,
           0 as exercise_count, 1 as is_completed, 0 as is_recovery_day, 1 as is_activity,
           at.emoji, al.activity_type_id, al.metric_value, at.metric_label as metric_label_val,
           al.location, al.duration_mins
    FROM activity_logs al
    JOIN activity_types at ON at.id = al.activity_type_id
    WHERE al.user_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM scheduled_activities sa2
        WHERE sa2.user_id = al.user_id AND sa2.date = al.date AND sa2.activity_type_id = al.activity_type_id
      )
  `;
  const alParams = [req.userId];
  if (start && end) { alQuery += ' AND al.date BETWEEN ? AND ?'; alParams.push(start, end); }
  else if (start) { alQuery += ' AND al.date >= ?'; alParams.push(start); }
  else if (end) { alQuery += ' AND al.date <= ?'; alParams.push(end); }
  const completedActivities = db.prepare(alQuery).all(...alParams);

  // Also include recovery days in the range
  let recoveryQuery = 'SELECT date, NULL as id, NULL as plan_id, NULL as plan_name, NULL as plan_description, 0 as exercise_count, 0 as is_completed, 1 as is_recovery_day FROM recovery_days WHERE user_id = ?';
  const recoveryParams = [req.userId];
  if (start && end) { recoveryQuery += ' AND date BETWEEN ? AND ?'; recoveryParams.push(start, end); }
  else if (start) { recoveryQuery += ' AND date >= ?'; recoveryParams.push(start); }
  else if (end) { recoveryQuery += ' AND date <= ?'; recoveryParams.push(end); }

  const recoveryDays = db.prepare(recoveryQuery).all(...recoveryParams);
  const all = [...scheduled, ...completed, ...scheduledActivities, ...completedActivities, ...recoveryDays].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  res.json(all);
});

// GET all schedule entries for a specific date (returns array, includes completed sessions)
router.get('/date/:date', (req, res) => {
  const date = req.params.date;

  const entries = db.prepare(`
    SELECT se.id, se.date, se.plan_id, se.notes, wp.name as plan_name, wp.description as plan_description
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.date = ? AND wp.user_id = ?
    ORDER BY se.id ASC
  `).all(date, req.userId);

  // Also include completed sessions not in schedule_entries
  const completedOnly = db.prepare(`
    SELECT DISTINCT ws.plan_id, wp.name as plan_name, wp.description as plan_description,
           NULL as id, ? as date, NULL as notes
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    WHERE ws.date = ? AND ws.completed_at IS NOT NULL AND wp.user_id = ?
      AND NOT EXISTS (SELECT 1 FROM schedule_entries se2 WHERE se2.date = ws.date AND se2.plan_id = ws.plan_id)
  `).all(date, date, req.userId);

  const allEntries = [...entries, ...completedOnly];

  const result = allEntries.map(entry => {
    const exercises = db.prepare(
      'SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index ASC'
    ).all(entry.plan_id);
    const session = db.prepare(
      'SELECT * FROM workout_sessions WHERE date = ? AND plan_id = ? ORDER BY id DESC LIMIT 1'
    ).get(date, entry.plan_id);
    return { ...entry, exercises, session: session || null };
  });

  res.json(result);
});

// POST schedule a non-workout activity on a date
router.post('/activity', (req, res) => {
  const { date, activity_type_id } = req.body;
  if (!date || !activity_type_id) return res.status(400).json({ error: 'date and activity_type_id are required' });
  db.prepare('INSERT OR IGNORE INTO scheduled_activities (user_id, activity_type_id, date) VALUES (?, ?, ?)').run(req.userId, activity_type_id, date);
  const entry = db.prepare('SELECT sa.*, at.name as type_name, at.emoji FROM scheduled_activities sa JOIN activity_types at ON at.id = sa.activity_type_id WHERE sa.user_id = ? AND sa.date = ? AND sa.activity_type_id = ?').get(req.userId, date, activity_type_id);
  res.status(201).json(entry);
});

// DELETE scheduled activity
router.delete('/activity/:id', (req, res) => {
  db.prepare('DELETE FROM scheduled_activities WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

// POST add a plan to a date (allows multiple per day)
router.post('/', (req, res) => {
  const { date, plan_id, notes } = req.body;
  if (!date || !plan_id) return res.status(400).json({ error: 'date and plan_id are required' });

  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(plan_id, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  // Upsert: if this exact date+plan combo exists, update notes; otherwise insert
  const existing = db.prepare(`
    SELECT se.id FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.date = ? AND se.plan_id = ? AND wp.user_id = ?
  `).get(date, plan_id, req.userId);

  if (existing) {
    db.prepare('UPDATE schedule_entries SET notes = ? WHERE id = ?').run(notes || null, existing.id);
  } else {
    db.prepare('INSERT INTO schedule_entries (date, plan_id, notes) VALUES (?, ?, ?)').run(date, plan_id, notes || null);
  }

  const entry = db.prepare(`
    SELECT se.*, wp.name as plan_name
    FROM schedule_entries se
    JOIN workout_plans wp ON wp.id = se.plan_id
    WHERE se.date = ? AND se.plan_id = ? AND wp.user_id = ?
  `).get(date, plan_id, req.userId);

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

// DELETE all schedule entries for a date
router.delete('/date/:date', (req, res) => {
  db.prepare(`
    DELETE FROM schedule_entries WHERE date = ? AND plan_id IN (
      SELECT id FROM workout_plans WHERE user_id = ?
    )
  `).run(req.params.date, req.userId);
  res.json({ success: true });
});

module.exports = router;
