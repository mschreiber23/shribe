require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/plans', require('./routes/plans'));
app.use('/api/plans/import/image', require('./routes/imageImport'));
app.use('/api/schedule', require('./routes/schedule'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/profile', require('./routes/profile'));

// Serve built client in production
const clientDist = path.join(__dirname, '../../client/dist');
const fs = require('fs');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*splat}', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Gym tracker server running on port ${PORT}`);
});
