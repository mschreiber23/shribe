const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();

function rows(sql, params = []) {
  try {
    return db.prepare(sql).all(...params);
  } catch {
    return [];
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
  const marks = ids.map(() => '?').join(',');
  return rows(`SELECT * FROM ${table} WHERE ${column} IN (${marks})`, ids);
}

router.get('/', (req, res) => {
  const userId = req.userId;
  const user = one('SELECT id, email, created_at FROM users WHERE id = ?', [userId]);
  const profile = one('SELECT * FROM profile WHERE user_id = ?', [userId]);
  const ownedPlans = rows('SELECT * FROM workout_plans WHERE user_id = ? ORDER BY sort_order, id', [userId]);
  const sessions = rows('SELECT * FROM workout_sessions WHERE user_id = ? ORDER BY date, id', [userId]);
  const ownedIds = new Set(ownedPlans.map(plan => plan.id));
  const extraPlanIds = [...new Set(sessions.map(session => session.plan_id))].filter(id => !ownedIds.has(id));
  const extraPlans = byIds('workout_plans', 'id', extraPlanIds);
  const plans = [
    ...ownedPlans.map(plan => ({ ...plan, was_mine: 1 })),
    ...extraPlans.map(plan => ({ ...plan, was_mine: 0 })),
  ];
  const planIds = plans.map(plan => plan.id);
  const exercises = byIds('exercises', 'plan_id', planIds);
  const schedule = byIds('schedule_entries', 'plan_id', planIds);
  const sessionIds = sessions.map(session => session.id);
  const sets = byIds('set_logs', 'session_id', sessionIds);
  const activityLogs = rows('SELECT * FROM activity_logs WHERE user_id = ? ORDER BY date, id', [userId]);
  const scheduledActivities = rows('SELECT * FROM scheduled_activities WHERE user_id = ?', [userId]);
  const recoveryDays = rows('SELECT * FROM recovery_days WHERE user_id = ?', [userId]);
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
