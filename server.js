const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path       = require('path');
const crypto     = require('crypto');
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

// 1. Static Page Routes
app.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// 2. Login & Logout
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

// 3. Inbox Optimized Send Email Route
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

  if (!gmailId || !appPassword || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Required fields missing' });
  }

  const cleanAppPass = appPassword.trim().replace(/\s+/g, '');
  const cleanGmail   = gmailId.trim();

  // High Trust - Direct Port 465 SSL Connection
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL
    auth: {
      user: cleanGmail,
      pass: cleanAppPass
    },
    tls: {
      rejectUnauthorized: true
    }
  });

  try {
    const cleanSender = senderName ? senderName.trim() : '';
    const fromHeader  = cleanSender ? `"${cleanSender}" <${cleanGmail}>` : cleanGmail;

    // Unique Genuine Message-ID
    const domain = cleanGmail.split('@')[1] || 'gmail.com';
    const randomBytes = crypto.randomBytes(8).toString('hex');
    const customMessageId = `<${Date.now()}.${randomBytes}@${domain}>`;

    // Clean HTML Structure
    const cleanHtml = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
      </head>
      <body style="font-family: Arial, sans-serif; font-size: 14px; color: #000000; line-height: 1.5;">
          <div>${messageBody.replace(/\n/g, '<br>')}</div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: fromHeader,
      to: to.trim(),
      subject: subject ? subject.trim() : '',
      text: messageBody, // Plain text format (Essential for Inbox)
      html: cleanHtml,
      messageId: customMessageId,
      headers: {
        'X-Mailer': 'Microsoft Outlook 16.0',
        'X-Priority': '3',
        'X-MSMail-Priority': 'Normal',
        'Importance': 'Normal'
      }
    });

    console.log(`✅ Mail sent to ${to}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ Mail Error:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer running on port ${PORT}`));
