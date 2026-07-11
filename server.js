const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path       = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 1000 * 60 * 60 * 8 }
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
    return res.json({ success: true });
  }
  res.json({ success: false, message: 'Invalid username or password' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  // "to" ab single email, array, ya comma/newline separated string — sab chalega
  let recipients = Array.isArray(to)
    ? to
    : String(to).split(/[,\n]/).map(x => x.trim()).filter(Boolean);

  if (recipients.length === 0)
    return res.status(400).json({ success: false, message: 'No valid recipients' });

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailId, pass: appPassword }
  });

  const BATCH_SIZE = 5;
  const results = { sent: [], failed: [] };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const jitter = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    // batch ke andar bhi thoda-thoda gap (random) — ek sath 5 mails jaana bot jaisa lagta h Gmail ko
    for (const recipient of batch) {
      try {
        const info = await transporter.sendMail({
          from: senderName ? `"${senderName}" <${gmailId}>` : `"${gmailId}" <${gmailId}>`,
          to: recipient,
          subject,
          text: messageBody,
          messageId: `<${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com>`,
          headers: { 'X-Priority': '3' }
          // HTML nahi — plain text = personal email = Primary inbox
          // Koi bulk/newsletter headers nahi
        });
        results.sent.push(recipient);
        console.log(`✅ Sent: ${recipient}`);
      } catch (err) {
        results.failed.push({ to: recipient, error: err.message });
        console.error(`❌ ${recipient}:`, err.message);
      }

      const isLastInRecipients = recipient === recipients[recipients.length - 1];
      if (!isLastInRecipients) await sleep(jitter(150, 400)); // random gap, robotic fixed-interval nahi
    }
  }

  res.json({
    success: results.failed.length === 0,
    totalSent: results.sent.length,
    totalFailed: results.failed.length,
    results
  });
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer on port ${PORT}`));
