const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path       = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

const REQUIRED_ENV = ['SESSION_SECRET', 'ADMIN_USER', 'ADMIN_PASS'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

app.set('trust proxy', 1);

app.use(bodyParser.json({ limit: '200kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '200kb' }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// ---- Rate Limiter for Security ----
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function loginRateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now - entry.firstAttempt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return next();
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfterSec = Math.ceil((LOGIN_WINDOW_MS - (now - entry.firstAttempt)) / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({ success: false, message: 'Too many login attempts. Try again later.' });
  }

  entry.count++;
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    if (now - entry.firstAttempt > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
}, LOGIN_WINDOW_MS).unref();

app.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/login', loginRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return res.status(400).json({ success: false, message: 'Invalid credentials' });
  }
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false, message: 'Login failed' });
      req.session.loggedIn = true;
      return res.json({ success: true });
    });
    return;
  }
  res.status(401).json({ success: false, message: 'Invalid credentials' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- Gmail Optimized Email Router ----
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body || {};

  if (!gmailId || !appPassword || !to || !subject || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing fields on server' });
  }
  if (!EMAIL_RE.test(gmailId) || !EMAIL_RE.test(to)) {
    return res.status(400).json({ success: false, message: 'Invalid email address format' });
  }

  // Gmail SMTP with Pooling for maximum performance
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
      user: gmailId, 
      pass: appPassword 
    },
    pool: true, 
    maxConnections: 3, 
    maxMessages: 50
  });

  try {
    await transporter.sendMail({
      from: senderName ? `"${senderName}" <${gmailId}>` : gmailId,
      to,
      subject,
      text: messageBody
    });
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Send failed for ${to}:`, err.message);
    res.status(502).json({ success: false, message: err.message });
  } finally {
    transporter.close();
  }
});

app.listen(PORT, () => console.log(`🚀 Gmail Mailer ready on port ${PORT}`));
