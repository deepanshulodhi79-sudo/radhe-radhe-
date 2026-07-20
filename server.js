const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 1. Session Security Updates
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-this-in-env',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Production me HTTPS ke sath true rakhein
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

// 2. Email Sending Rate Limiter (Spam Trigger aur Account Lockout se bachne ke liye)
const emailLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Max 10 emails per minute per session
  message: { success: false, message: 'Too many requests. Please slow down to prevent spam filters.' }
});

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

app.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Fallback defaults standard production me avoid karein
  const validUser = process.env.ADMIN_USER;
  const validPass = process.env.ADMIN_PASS;

  if (!validUser || !validPass) {
    return res.status(500).json({ success: false, message: 'Admin credentials not configured in environment.' });
  }

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Helper Function: Basic Email Validation
function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

app.post('/api/send-email', requireLogin, emailLimiter, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  if (!isValidEmail(to) || !isValidEmail(gmailId)) {
    return res.status(400).json({ success: false, message: 'Invalid email address format' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { 
      user: gmailId, 
      pass: appPassword 
    }
  });

  try {
    const fromAddress = senderName ? `"${senderName}" <${gmailId}>` : gmailId;

    await transporter.sendMail({
      from: fromAddress,
      to,
      subject: subject || '(No Subject)',
      text: messageBody,
      
      // Spam Score kam karne ke liye important headers:
      replyTo: gmailId,
      headers: {
        'X-Mailer': 'Node-Express-App',
        'Auto-Submitted': 'auto-generated' // Aggressive spam fiters ko clear indication dene ke liye
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Mail send failed to ${to}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
