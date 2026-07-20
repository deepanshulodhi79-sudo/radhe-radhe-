const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path       = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8 
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// Routes
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
    if (req.headers['content-type'] === 'application/json') {
      return res.json({ success: true });
    }
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

// Simple working Nodemailer Route
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Sabhi fields bharna zaroori hai!' });
  }

  // Passwords se extra spaces remove karna
  const cleanAppPass = appPassword.trim().replace(/\s+/g, '');
  const cleanGmail   = gmailId.trim();

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: cleanGmail,
      pass: cleanAppPass
    }
  });

  try {
    const cleanSender = senderName ? senderName.trim() : '';
    const fromHeader  = cleanSender ? `"${cleanSender}" <${cleanGmail}>` : cleanGmail;

    await transporter.sendMail({
      from: fromHeader,
      to: to.trim(),
      subject: subject ? subject.trim() : 'Important Notice',
      text: messageBody.trim(),
      replyTo: cleanGmail
    });

    console.log(`✅ Mail successfully sent to ${to}`);
    res.json({ success: true, message: 'Mail bhej di gayi hai!' });
  } catch (err) {
    console.error(`❌ Mail Failure Error:`, err.message);
    res.status(500).json({ success: false, message: `Error: ${err.message}` });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
