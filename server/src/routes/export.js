const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();

function rows(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch (err) {
    console.error('export query failed:', err.message);
    return null;
  }
}

function one(sql, params = []) {
  try {
    return db.prepare(sql).get(...params);
  } catch {
    return null;
  }
}

function byIds(table, column, ids) {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const marks = chunk.map(() => '?').join(',');
    const part = rows(`SELECT * FROM ${table} WHERE ${column} IN (${marks})`, chunk);
    if (!part) continue;
    out.push(...part);
  }
  return out;
}

function mineOrLegacy(table, userId, orderBy) {
  const ordered = orderBy ? ` ORDER BY ${orderBy}` : '';
  return rows(`SELECT * FROM ${table} WHERE user_id = ? OR user_id IS NULL${ordered}`, [userId])
    || rows(`SELECT * FROM ${table}${ordered}`)
    || [];
}

router.get('/', (req, res) => {
  const userId = req.userId;
  const user = one('SELECT id, email, created_at FROM users WHERE id = ?', [userId]);
  const profile = one('SELECT * FROM profile WHERE user_id = ?', [userId]);
  const ownedPlans = mineOrLegacy('workout_plans', userId, 'id');
  const sessions = mineOrLegacy('workout_sessions', userId, 'date, id');
  const ownedIds = new Set(ownedPlans.map(plan => plan.id));
  const extraPlanIds = [...new Set(sessions.map(session => session.plan_id))].filter(id => !ownedIds.has(id));
  const extraPlans = byIds('workout_plans', 'id', extraPlanIds);
  const plans = [
    ...ownedPlans.map(plan => ({ ...plan, was_mine: plan.user_id == null || plan.user_id == userId ? 1 : 0 })),
    ...extraPlans.map(plan => ({ ...plan, was_mine: 0 })),
  ];
  const planIds = plans.map(plan => plan.id);
  const exercises = byIds('exercises', 'plan_id', planIds);
  const schedule = byIds('schedule_entries', 'plan_id', planIds);
  const sessionIds = sessions.map(session => session.id);
  const sets = byIds('set_logs', 'session_id', sessionIds);
  const activityLogs = mineOrLegacy('activity_logs', userId, 'date, id');
  const scheduledActivities = mineOrLegacy('scheduled_activities', userId);
  const recoveryDays = mineOrLegacy('recovery_days', userId);
  const typeIds = [...new Set([
    ...activityLogs.map(log => log.activity_type_id),
    ...scheduledActivities.map(item => item.activity_type_id),
  ])];
  const activityTypes = byIds('activity_types', 'id', typeIds);

  let avatar = null;
  const avatarsDir = path.join(__dirname, '../../data/avatars');
  if (fs.existsSync(avatarsDir)) {
    const file = fs.readdirSync(avatarsDir).find(name => name.startsWith(`user_${userId}`));
    if (file) {
      const full = path.join(avatarsDir, file);
      avatar = {
        filename: file,
        mime: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
        base64: fs.readFileSync(full).toString('base64'),
      };
    }
  }

  res.setHeader('Content-Disposition', 'attachment; filename="shribetrakr-backup.json"');
  res.json({
    version: 1,
    exported_at: new Date().toISOString(),
    user: user ? { email: user.email, created_at: user.created_at } : null,
    profile,
    avatar,
    plans,
    exercises,
    schedule,
    sessions,
    sets,
    activity_types: activityTypes,
    activity_logs: activityLogs,
    scheduled_activities: scheduledActivities,
    recovery_days: recoveryDays,
  });
});

module.exports = router;
