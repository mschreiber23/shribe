const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'gymtrack-dev-secret-change-in-production';
const TOKEN_EXPIRY = '30d';

function makeToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function ensureProfile(userId, name) {
  const existing = db.prepare('SELECT id FROM profile WHERE user_id = ?').get(userId);
  if (!existing) {
    const displayName = name || 'Athlete';
    const username = displayName.toLowerCase().replace(/\s+/g, '') || 'athlete';
    db.prepare('INSERT INTO profile (user_id, name, username) VALUES (?, ?, ?)').run(userId, displayName, username);
  }
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.toLowerCase().trim(), hash);
  const userId = result.lastInsertRowid;

  ensureProfile(userId, name || email.split('@')[0]);

  const token = makeToken(userId);
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(userId);
  res.status(201).json({ token, user });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  ensureProfile(user.id, null);

  const token = makeToken(user.id);
  res.json({ token, user: { id: user.id, email: user.email, created_at: user.created_at } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

module.exports = router;
