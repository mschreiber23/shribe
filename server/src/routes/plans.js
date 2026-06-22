const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const upload = multer({ storage: multer.memoryStorage() });

// GET all plans — user's own plans + global plans from anyone
router.get('/', (req, res) => {
  const plans = db.prepare(`
    SELECT wp.*,
           COUNT(DISTINCT e.id) as exercise_count,
           COUNT(DISTINCT CASE WHEN ws.completed_at IS NOT NULL AND ws.user_id = ? THEN ws.id END) as completed_count,
           CASE WHEN wp.user_id = ? THEN 1 ELSE 0 END as is_mine
    FROM workout_plans wp
    LEFT JOIN exercises e ON e.plan_id = wp.id
    LEFT JOIN workout_sessions ws ON ws.plan_id = wp.id
    WHERE wp.user_id = ? OR wp.is_global = 1
    GROUP BY wp.id
    ORDER BY wp.is_global ASC, wp.sort_order ASC, wp.id ASC
  `).all(req.userId, req.userId, req.userId);
  res.json(plans);
});

// GET single plan with exercises
router.get('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND (user_id = ? OR is_global = 1)').get(req.params.id, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const exercises = db.prepare('SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index ASC, id ASC').all(req.params.id);
  res.json({ ...plan, exercises });
});

// POST create plan
router.post('/', (req, res) => {
  const { name, description, exercises } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const insert = db.transaction(() => {
    const plan = db.prepare('INSERT INTO workout_plans (user_id, name, description) VALUES (?, ?, ?)').run(req.userId, name, description || null);
    if (exercises && exercises.length > 0) {
      const insertEx = db.prepare('INSERT INTO exercises (plan_id, name, section, order_index, notes) VALUES (?, ?, ?, ?, ?)');
      exercises.forEach((ex, i) => insertEx.run(plan.lastInsertRowid, ex.name, ex.section || 'Workout', ex.order_index ?? i, ex.notes || null));
    }
    return plan.lastInsertRowid;
  });

  const id = insert();
  const created = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(id);
  const exs = db.prepare('SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index').all(id);
  res.status(201).json({ ...created, exercises: exs });
});

// PUT update plan
router.put('/:id', (req, res) => {
  const { name, description } = req.body;
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found or not yours to edit' });

  db.prepare('UPDATE workout_plans SET name = ?, description = ? WHERE id = ?')
    .run(name ?? plan.name, description ?? plan.description, req.params.id);

  const updated = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(req.params.id);
  const exercises = db.prepare('SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index').all(req.params.id);
  res.json({ ...updated, exercises });
});

// PUT toggle global status (only plan owner can do this)
router.put('/:id/global', (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found or not yours to edit' });
  const newVal = plan.is_global ? 0 : 1;
  db.prepare('UPDATE workout_plans SET is_global = ? WHERE id = ?').run(newVal, req.params.id);
  res.json({ is_global: newVal });
});

// PUT reorder plans
router.put('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
  const update = db.prepare('UPDATE workout_plans SET sort_order = ? WHERE id = ? AND user_id = ?');
  const reorder = db.transaction(() => ids.forEach((id, i) => update.run(i, id, req.userId)));
  reorder();
  res.json({ success: true });
});

// DELETE plan
router.delete('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found or not yours to delete' });
  db.prepare('DELETE FROM workout_plans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST add exercise (owner only)
router.post('/:id/exercises', (req, res) => {
  const { name, section, order_index, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Exercise name is required' });
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found or not yours to edit' });
  const maxOrder = db.prepare('SELECT MAX(order_index) as max FROM exercises WHERE plan_id = ?').get(req.params.id);
  const idx = order_index ?? (maxOrder.max !== null ? maxOrder.max + 1 : 0);
  const result = db.prepare('INSERT INTO exercises (plan_id, name, section, order_index, notes) VALUES (?, ?, ?, ?, ?)').run(req.params.id, name, section || 'Workout', idx, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid));
});

// PUT update exercise (owner only)
router.put('/:planId/exercises/:exId', (req, res) => {
  const { name, section, order_index, notes } = req.body;
  const plan = db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.planId, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found or not yours to edit' });
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ? AND plan_id = ?').get(req.params.exId, req.params.planId);
  if (!ex) return res.status(404).json({ error: 'Exercise not found' });
  db.prepare('UPDATE exercises SET name = ?, section = ?, order_index = ?, notes = ? WHERE id = ?')
    .run(name ?? ex.name, section ?? ex.section, order_index ?? ex.order_index, notes ?? ex.notes, req.params.exId);
  res.json(db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.exId));
});

// DELETE exercise (owner only)
router.delete('/:planId/exercises/:exId', (req, res) => {
  const plan = db.prepare('SELECT id FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.planId, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found or not yours to edit' });
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ? AND plan_id = ?').get(req.params.exId, req.params.planId);
  if (!ex) return res.status(404).json({ error: 'Exercise not found' });
  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.exId);
  res.json({ success: true });
});

// POST import from CSV
router.post('/import/csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const records = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
    const planMap = {};
    for (const row of records) {
      const planName = row.plan_name || row['Plan Name'] || row['Plan'];
      const exerciseName = row.exercise_name || row['Exercise Name'] || row['Exercise'];
      if (!planName || !exerciseName) continue;
      if (!planMap[planName]) planMap[planName] = { description: row.plan_description || '', exercises: [] };
      planMap[planName].exercises.push({ name: exerciseName, section: row.section || 'Workout', notes: row.notes || null });
    }
    const created = [];
    db.transaction(() => {
      for (const [planName, data] of Object.entries(planMap)) {
        const plan = db.prepare('INSERT INTO workout_plans (user_id, name, description) VALUES (?, ?, ?)').run(req.userId, planName, data.description || null);
        const insertEx = db.prepare('INSERT INTO exercises (plan_id, name, section, order_index, notes) VALUES (?, ?, ?, ?, ?)');
        data.exercises.forEach((ex, i) => insertEx.run(plan.lastInsertRowid, ex.name, ex.section, i, ex.notes));
        created.push({ id: plan.lastInsertRowid, name: planName, exercise_count: data.exercises.length });
      }
    })();
    res.status(201).json({ imported: created.length, plans: created });
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
  }
});

module.exports = router;
