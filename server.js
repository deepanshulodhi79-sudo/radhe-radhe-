const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path       = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

// 1. Render / Cloud Hosts Ke Liye Important (Reverse Proxy Support)
app.set('trust proxy', 1);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production', // Render HTTPS ke sath kaam karega
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8 
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

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
  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASS || 'admin123';

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;

    // Agar Frontend Fetch/Axios request bhej raha hai toh JSON bhejo
    if (req.headers['content-type'] === 'application/json') {
      return res.json({ success: true });
    }
    // Agar Normal HTML Form Submit ho raha hai toh Direct Redirect karo
    return res.redirect('/launcher');
  }

  if (req.headers['content-type'] === 'application/json') {
    return res.json({ success: false, message: 'Invalid credentials' });
  }
  res.redirect('/?error=invalid');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Basic Email Validation
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  if (!isValidEmail(to) || !isValidEmail(gmailId)) {
    return res.status(400).json({ success: false, message: 'Invalid email address format' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailId, pass: appPassword }
  });

  try {
    const fromHeader = senderName ? `"${senderName}" <${gmailId}>` : `"${gmailId}" <${gmailId}>`;

    await transporter.sendMail({
      from: fromHeader,
      to,
      subject: subject || '(No Subject)',
      text: messageBody,
      replyTo: gmailId,
      headers: {
        'X-Mailer': 'Node-Mailer-App'
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(`❌ ${to}:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
