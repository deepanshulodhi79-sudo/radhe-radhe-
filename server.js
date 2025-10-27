// server.js (Render-ready)
// Install before deploy: 
// npm i express express-session body-parser nodemailer dotenv googleapis

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 8080;

// 🔑 Hardcoded login (for testing)
const HARD_USERNAME = "Yatendra Rajput";
const HARD_PASSWORD = "Yattu@882";

// ---------- Middleware ----------
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bulk-mailer-secret',
  resave: false,
  saveUninitialized: true
}));

// ---------- Auth Middleware ----------
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.redirect('/');
}

// ---------- Routes ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    return res.json({ success: true });
  }
  return res.json({ success: false, message: "❌ Invalid credentials" });
});

app.get('/launcher', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    return res.json({ success: true });
  });
});

// ---------- Utility ----------
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Transporter Factory ----------
async function createTransporter() {
  const type = (process.env.TRANSPORTER_TYPE || 'gmail').toLowerCase();

  // 🌐 SMTP / SendGrid
  if (type === 'smtp' || type === 'sendgrid') {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'apikey',
        pass: process.env.SMTP_PASS
      },
      pool: true,
      maxConnections: 5
    });
  }

  // 🔐 Gmail OAuth2
  if (type === 'gmail-oauth2') {
    const {
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REFRESH_TOKEN,
      GMAIL_USER
    } = process.env;

    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_USER) {
      throw new Error("Missing Gmail OAuth2 credentials");
    }

    const oAuth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );
    oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    const accessToken = await oAuth2Client.getAccessToken();

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: GMAIL_USER,
        clientId: GMAIL_CLIENT_ID,
        clientSecret: GMAIL_CLIENT_SECRET,
        refreshToken: GMAIL_REFRESH_TOKEN,
        accessToken: accessToken.token
      },
      pool: true,
      maxConnections: 5
    });
  }

  // 📧 Gmail (App Password)
  if (type === 'gmail') {
    const GMAIL_EMAIL = process.env.GMAIL_EMAIL;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
    if (!GMAIL_EMAIL || !GMAIL_APP_PASSWORD) {
      throw new Error('Missing GMAIL_EMAIL or GMAIL_APP_PASSWORD.');
    }

    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: GMAIL_EMAIL, pass: GMAIL_APP_PASSWORD },
      pool: true,
      maxConnections: 5
    });
  }

  throw new Error(`Unsupported TRANSPORTER_TYPE: ${type}`);
}

// ---------- Send Helpers ----------
async function sendWithRetry(transporter, mailOptions, maxRetries = 3, initialBackoff = 1000) {
  let attempt = 0;
  let backoff = initialBackoff;

  while (attempt <= maxRetries) {
    try {
      const info = await transporter.sendMail(mailOptions);
      return { success: true, info };
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        return { success: false, error: err };
      }
      await delay(backoff);
      backoff *= 2;
    }
  }
}

async function sendBatch(transporter, mails, batchSize = 50, parallelInBatch = 5, pauseMs = 2000, retryConfig = {}) {
  const results = [];

  for (let i = 0; i < mails.length; i += batchSize) {
    const batch = mails.slice(i, i + batchSize);

    for (let j = 0; j < batch.length; j += parallelInBatch) {
      const group = batch.slice(j, j + parallelInBatch);
      const promises = group.map(mailOptions =>
        sendWithRetry(transporter, mailOptions, retryConfig.maxRetries || 3, retryConfig.initialBackoffMs || 1000)
      );
      const settled = await Promise.all(promises);
      results.push(...settled);
    }

    if (i + batchSize < mails.length) await delay(pauseMs);
  }

  return results;
}

// ---------- /send API ----------
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!recipients) {
      return res.json({ success: false, message: "Recipients required" });
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(r => r);

    if (recipientList.length === 0) {
      return res.json({ success: false, message: "No valid recipients" });
    }

    const transporter = await createTransporter();

    const fromEnv = process.env.FROM_EMAIL || `"${senderName || 'Sender'}" <${email || process.env.GMAIL_EMAIL}>`;

    const mails = recipientList.map(to => ({
      from: fromEnv,
      to,
      subject: subject || "No Subject",
      text: message || "",
      html: `<div>${(message || "").replace(/\n/g, '<br>')}</div>`,
      headers: {
        'List-Unsubscribe': `<mailto:unsubscribe@yourdomain.com>, <https://yourdomain.com/unsubscribe>`
      }
    }));

    const results = await sendBatch(transporter, mails);

    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);

    if (transporter && transporter.close) transporter.close();

    return res.json({
      success: failed.length === 0,
      total: recipientList.length,
      sent: succeeded,
      failed: failed.length,
      failures: failed.map(f => f.error?.message || 'Unknown error').slice(0, 5)
    });
  } catch (err) {
    console.error("Send error:", err);
    return res.json({ success: false, message: err.message });
  }
});

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
