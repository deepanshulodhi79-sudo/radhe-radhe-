const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
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

// OAuth2 Direct Email Sending
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, clientId, clientSecret, refreshToken, subject, messageBody, to } = req.body;

  // Render environment variables ya direct payload support
  const CLIENT_ID     = clientId || process.env.CLIENT_ID;
  const CLIENT_SECRET = clientSecret || process.env.CLIENT_SECRET;
  const REFRESH_TOKEN = refreshToken || process.env.REFRESH_TOKEN;
  const SENDER_EMAIL  = gmailId || process.env.GMAIL_USER;

  if (!SENDER_EMAIL || !CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN || !to || !messageBody) {
    return res.status(400).json({ success: false, message: 'OAuth2 credentials or required fields are missing!' });
  }

  try {
    const OAuth2 = google.auth.OAuth2;
    const oauth2Client = new OAuth2(
      CLIENT_ID,
      CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({
      refresh_token: REFRESH_TOKEN
    });

    const accessToken = await oauth2Client.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: SENDER_EMAIL.trim(),
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token
      }
    });

    const cleanSender = senderName ? senderName.trim() : '';
    const fromHeader = cleanSender ? `"${cleanSender}" <${SENDER_EMAIL.trim()}>` : SENDER_EMAIL.trim();

    await transporter.sendMail({
      from: fromHeader,
      to: to.trim(),
      subject: subject || 'Notification',
      text: messageBody.trim(),
      replyTo: SENDER_EMAIL.trim()
    });

    console.log(`✅ Mail delivered to Primary Inbox of ${to}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ OAuth Send Error:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer running on port ${PORT}`));
