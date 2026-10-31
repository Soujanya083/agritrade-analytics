// server.js - application setup only. Models live in models/, shared code in
// lib/, and each group of endpoints in routes/ (this file used to be ~1000 lines).
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const { isProduction, buildCorsOptions } = require('./security');
const { generalLimiter } = require('./lib/limiters');

const app = express();

// Behind Render/Heroku-style proxies every request arrives from the proxy's
// IP. Without this, express-rate-limit sees ONE client for the whole world,
// so the 20-attempt login limit and 300-request limit were shared by ALL
// users. TRUST_PROXY = number of proxy hops (default: 1 when deployed).
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? (isProduction() ? 1 : 0)));

app.use(helmet());
const corsOptions = buildCorsOptions();
// Local development with no allow-list: reflect the origin AND allow credentials so the
// refresh cookie works between localhost:3000 and :5000. Never done in production: there
// CORS_ORIGINS must be set, otherwise cookie sessions are simply unavailable (fail closed).
if (!isProduction() && corsOptions.origin === true) corsOptions.credentials = true;
app.use(cors(corsOptions));
// Photos are validated to <= 400 KB (see services/imageValidation.js), so
// 1 MB is ample; the old 10 MB limit let one request bloat the database.
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

// Connects at require-time on purpose: tests set MONGO_URI before requiring this file.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/agribid';
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB Connection Error:', err));

app.use(require('./routes/health'));
app.use(require('./routes/auth'));
app.use(require('./routes/session'));
app.use(require('./routes/crops'));
app.use(require('./routes/bids'));
app.use(require('./routes/transactions'));
app.use(require('./routes/notifications'));

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
if (require.main === module) {
  app.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));
}

module.exports = app;
