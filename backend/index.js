const express = require('express');
const cors = require('cors');
require('dotenv').config();

const analyzeRoute = require('./routes/analyze');
const chatRoute = require('./routes/chat');
const profileRoute = require('./routes/profile');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '100mb' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/analyze', analyzeRoute);
app.use('/api/chat', chatRoute);
app.use('/api/profile', profileRoute);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Mirror Me backend running on port ${PORT}`));
