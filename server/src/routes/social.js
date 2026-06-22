const express = require('express');
const router = express.Router();
const db = require('../db');

// Search users by name or username
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 1) return res.json([]);

  const term = `%${q.trim()}%`;
  const users = db.prepare(`
    SELECT u.id, p.name, p.username, p.avatar_color, p.avatar_url,
           EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) as is_following
    FROM users u
    JOIN profile p ON p.user_id = u.id
    WHERE u.id != ? AND (p.name LIKE ? OR p.username LIKE ?)
    LIMIT 20
  `).all(req.userId, req.userId, term, term);

  res.json(users);
});

// GET public profile of another user
router.get('/users/:userId', (req, res) => {
  const targetId = req.params.userId;
  const profile = db.prepare(`
    SELECT u.id, p.name, p.username, p.bio, p.avatar_color, p.avatar_url,
           (SELECT COUNT(*) FROM follows WHERE following_id = u.id) as follower_count,
           (SELECT COUNT(*) FROM follows WHERE follower_id = u.id) as following_count,
           (SELECT COUNT(*) FROM workout_sessions ws
            WHERE ws.completed_at IS NOT NULL AND ws.user_id = u.id) as total_workouts,
           EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) as is_following
    FROM users u
    JOIN profile p ON p.user_id = u.id
    WHERE u.id = ?
  `).get(req.userId, targetId);

  if (!profile) return res.status(404).json({ error: 'User not found' });

  // Recent completed workouts (public feed)
  const recentWorkouts = db.prepare(`
    SELECT ws.date, wp.name as plan_name, COUNT(sl.id) as total_sets
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.id = ws.plan_id
    LEFT JOIN set_logs sl ON sl.session_id = ws.id
    WHERE ws.completed_at IS NOT NULL AND ws.user_id = ?
    GROUP BY ws.id
    ORDER BY ws.completed_at DESC
    LIMIT 5
  `).all(targetId);

  res.json({ ...profile, recent_workouts: recentWorkouts });
});

// GET my followers
router.get('/followers', (req, res) => {
  const followers = db.prepare(`
    SELECT u.id, p.name, p.username, p.avatar_color, p.avatar_url,
           EXISTS(SELECT 1 FROM follows WHERE follower_id = ? AND following_id = u.id) as is_following
    FROM follows f
    JOIN users u ON u.id = f.follower_id
    JOIN profile p ON p.user_id = u.id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
  `).all(req.userId, req.userId);
  res.json(followers);
});

// GET who I'm following
router.get('/following', (req, res) => {
  const following = db.prepare(`
    SELECT u.id, p.name, p.username, p.avatar_color, p.avatar_url
    FROM follows f
    JOIN users u ON u.id = f.following_id
    JOIN profile p ON p.user_id = u.id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(req.userId);
  res.json(following);
});

// POST follow a user
router.post('/follow/:userId', (req, res) => {
  if (Number(req.params.userId) === req.userId) return res.status(400).json({ error: "Can't follow yourself" });
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.userId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.userId, req.params.userId);
  res.json({ success: true, following: true });
});

// DELETE unfollow a user
router.delete('/follow/:userId', (req, res) => {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.userId, req.params.userId);
  res.json({ success: true, following: false });
});

// POST share a plan with another user
router.post('/share/:planId', (req, res) => {
  const { to_user_id, message } = req.body;
  if (!to_user_id) return res.status(400).json({ error: 'to_user_id is required' });

  const plan = db.prepare('SELECT * FROM workout_plans WHERE id = ? AND user_id = ?').get(req.params.planId, req.userId);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(to_user_id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  db.prepare('INSERT OR REPLACE INTO plan_shares (plan_id, from_user_id, to_user_id, message, accepted) VALUES (?, ?, ?, ?, 0)')
    .run(req.params.planId, req.userId, to_user_id, message || null);

  res.json({ success: true });
});

// GET my inbox (plans shared with me)
router.get('/inbox', (req, res) => {
  const shares = db.prepare(`
    SELECT ps.id, ps.plan_id, ps.message, ps.accepted, ps.created_at,
           wp.name as plan_name, wp.description as plan_description,
           COUNT(e.id) as exercise_count,
           p.name as from_name, p.username as from_username,
           p.avatar_color as from_avatar_color, p.avatar_url as from_avatar_url,
           ps.from_user_id
    FROM plan_shares ps
    JOIN workout_plans wp ON wp.id = ps.plan_id
    LEFT JOIN exercises e ON e.plan_id = wp.id
    JOIN profile p ON p.user_id = ps.from_user_id
    WHERE ps.to_user_id = ?
    GROUP BY ps.id
    ORDER BY ps.created_at DESC
  `).all(req.userId);
  res.json(shares);
});

// GET count of unread inbox items
router.get('/inbox/unread', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM plan_shares WHERE to_user_id = ? AND accepted = 0').get(req.userId);
  res.json(count);
});

// POST accept a shared plan (copies it to your plans)
router.post('/inbox/:shareId/accept', (req, res) => {
  const share = db.prepare(`
    SELECT ps.*, wp.name as plan_name, wp.description
    FROM plan_shares ps JOIN workout_plans wp ON wp.id = ps.plan_id
    WHERE ps.id = ? AND ps.to_user_id = ?
  `).get(req.params.shareId, req.userId);
  if (!share) return res.status(404).json({ error: 'Share not found' });

  // Copy plan + exercises to the recipient's account
  const copy = db.transaction(() => {
    const newPlan = db.prepare(
      'INSERT INTO workout_plans (user_id, name, description) VALUES (?, ?, ?)'
    ).run(req.userId, share.plan_name, share.description || null);

    const exercises = db.prepare('SELECT * FROM exercises WHERE plan_id = ? ORDER BY order_index').all(share.plan_id);
    const insertEx = db.prepare('INSERT INTO exercises (plan_id, name, section, order_index, notes) VALUES (?, ?, ?, ?, ?)');
    exercises.forEach(ex => insertEx.run(newPlan.lastInsertRowid, ex.name, ex.section, ex.order_index, ex.notes));

    db.prepare('UPDATE plan_shares SET accepted = 1 WHERE id = ?').run(req.params.shareId);
    return newPlan.lastInsertRowid;
  });

  const newPlanId = copy();
  const newPlan = db.prepare('SELECT * FROM workout_plans WHERE id = ?').get(newPlanId);
  res.json({ success: true, plan: newPlan });
});

// DELETE dismiss/decline a share
router.delete('/inbox/:shareId', (req, res) => {
  db.prepare('DELETE FROM plan_shares WHERE id = ? AND to_user_id = ?').run(req.params.shareId, req.userId);
  res.json({ success: true });
});

module.exports = router;
