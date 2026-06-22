const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const upload = multer({ storage: multer.memoryStorage() });

// GET all plans
router.get('/', (req, res) => {
  const plans = db.prepare(`
    SELECT wp.*, COUNT(e.id) as exercise_count
    FROM workout_plans wp
    LEFT JOIN exercises e ON e.plan_id = wp.id
    GROUP BY wp.id
    ORDER BY wp.created_at DESC
  `).all();
  res.json(plans);
});

// GET single plan with exercises
router.get('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const exercises = db.prepare(
    'SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index ASC, id ASC'
  ).all(req.params.id);

  res.json({ ...plan, exercises });
});

// POST create plan
router.post('/', (req, res) => {
  const { name, description, exercises } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const insert = db.transaction(() => {
    const plan = db.prepare(
      'INSERT INTO workout_plans (name, description) VALUES (?, ?)'
    ).run(name, description || null);

    if (exercises && exercises.length > 0) {
      const insertEx = db.prepare(
        'INSERT INTO exercises (plan_id, name, section, order_index, notes) VALUES (?, ?, ?, ?, ?)'
      );
      exercises.forEach((ex, i) => {
        insertEx.run(plan.lastInsertRowid, ex.name, ex.section || 'Workout', ex.order_index ?? i, ex.notes || null);
      });
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
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  db.prepare('UPDATE workout_plans SET name = ?, description = ? WHERE id = ?')
    .run(name ?? plan.name, description ?? plan.description, req.params.id);

  const updated = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(req.params.id);
  const exercises = db.prepare('SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index').all(req.params.id);
  res.json({ ...updated, exercises });
});

// DELETE plan
router.delete('/:id', (req, res) => {
  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  db.prepare('DELETE FROM workout_plans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST add exercise to plan
router.post('/:id/exercises', (req, res) => {
  const { name, section, order_index, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Exercise name is required' });

  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const maxOrder = db.prepare('SELECT MAX(order_index) as max FROM exercises WHERE plan_id = ?').get(req.params.id);
  const idx = order_index ?? (maxOrder.max !== null ? maxOrder.max + 1 : 0);

  const result = db.prepare(
    'INSERT INTO exercises (plan_id, name, section, order_index, notes) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.id, name, section || 'Workout', idx, notes || null);

  const exercise = db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(exercise);
});

// PUT update exercise
router.put('/:planId/exercises/:exId', (req, res) => {
  const { name, section, order_index, notes } = req.body;
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ? AND plan_id = ?').get(req.params.exId, req.params.planId);
  if (!ex) return res.status(404).json({ error: 'Exercise not found' });

  db.prepare('UPDATE exercises SET name = ?, section = ?, order_index = ?, notes = ? WHERE id = ?')
    .run(name ?? ex.name, section ?? ex.section, order_index ?? ex.order_index, notes ?? ex.notes, req.params.exId);

  const updated = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.exId);
  res.json(updated);
});

// DELETE exercise
router.delete('/:planId/exercises/:exId', (req, res) => {
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ? AND plan_id = ?').get(req.params.exId, req.params.planId);
  if (!ex) return res.status(404).json({ error: 'Exercise not found' });
  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.exId);
  res.json({ success: true });
});

// POST import from CSV
router.post('/import/csv', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const content = req.file.buffer.toString('utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Expected columns: plan_name, exercise_name, section (optional), notes (optional)
    // Group by plan_name
    const planMap = {};
    for (const row of records) {
      const planName = row.plan_name || row['Plan Name'] || row['Plan'];
      const exerciseName = row.exercise_name || row['Exercise Name'] || row['Exercise'];
      if (!planName || !exerciseName) continue;

      if (!planMap[planName]) planMap[planName] = { description: row.plan_description || row['Plan Description'] || '', exercises: [] };
      planMap[planName].exercises.push({
        name: exerciseName,
        section: row.section || row['Section'] || 'Workout',
        notes: row.notes || row['Notes'] || null,
      });
    }

    const created = [];
    const insertAll = db.transaction(() => {
      for (const [planName, data] of Object.entries(planMap)) {
        const plan = db.prepare(
          'INSERT INTO workout_plans (name, description) VALUES (?, ?)'
        ).run(planName, data.description || null);

        const insertEx = db.prepare(
          'INSERT INTO exercises (plan_id, name, section, order_index, notes) VALUES (?, ?, ?, ?, ?)'
        );
        data.exercises.forEach((ex, i) => {
          insertEx.run(plan.lastInsertRowid, ex.name, ex.section || 'Workout', i, ex.notes);
        });

        created.push({
          id: plan.lastInsertRowid,
          name: planName,
          exercise_count: data.exercises.length,
        });
      }
    });

    insertAll();
    res.status(201).json({ imported: created.length, plans: created });
  } catch (err) {
    res.status(400).json({ error: 'Failed to parse CSV: ' + err.message });
  }
});

module.exports = router;
