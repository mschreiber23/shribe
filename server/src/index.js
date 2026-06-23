require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const requireAuth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Public auth routes (no token required)
app.use('/api/auth', require('./routes/auth'));

// Public avatar serving (image tags can't send auth headers)
app.get('/api/profile/avatar/:userId', (req, res) => {
  const avatarsDir = path.join(__dirname, '../data/avatars');
  if (!fs.existsSync(avatarsDir)) return res.status(404).end();
  const files = fs.readdirSync(avatarsDir).filter(f => f.startsWith(`user_${req.params.userId}`));
  if (!files.length) return res.status(404).end();
  res.sendFile(path.join(avatarsDir, files[0]));
});

// All routes below require a valid JWT
app.use('/api/plans/import/image', requireAuth, require('./routes/imageImport'));
app.use('/api/plans', requireAuth, require('./routes/plans'));
app.use('/api/schedule', requireAuth, require('./routes/schedule'));
app.use('/api/sessions', requireAuth, require('./routes/sessions'));
app.use('/api/profile', requireAuth, require('./routes/profile'));
app.use('/api/social', requireAuth, require('./routes/social'));
app.use('/api/whoop', require('./routes/whoop')); // has mixed auth (callback is public)

// Serve built client in production
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Gym tracker server running on port ${PORT}`);
});
