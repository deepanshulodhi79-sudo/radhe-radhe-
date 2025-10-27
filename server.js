// server.js (updated)
// Requirements: npm i express express-session body-parser nodemailer dotenv googleapis
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 8080;

// 🔑 Hardcoded login (you can move this to env for safety)
const HARD_USERNAME = "Yatendra Rajput";
const HARD_PASSWORD = "Yattu@882";

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bulk-mailer-secret',
  resave: false,
  saveUninitialized: true
}));

// 🔒 Auth middleware
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.redirect('/');
}

// Routes (login/logout/pages)
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

// Helper: delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create transporter based on env
async function createTransporter() {
  const type = (process.env.TRANSPORTER_TYPE || 'sendgrid').toLowerCase();

  if (type === 'sendgrid' || type === 'smtp') {
    // Generic SMTP (SendGrid example)
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'apikey',
        pass: process.env.SMTP_PASS
      },
      pool: true,          // reuse connections
      maxConnections: 5
    });
  }

  if (type === 'gmail-oauth2') {
    // OAuth2 Gmail transporter
    const {
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI,
      GMAIL_REFRESH_TOKEN,
      GMAIL_USER
    } = process.env;

    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_USER) {
      throw new Error('Missing Gmail OAuth2 env variables (GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/USER).');
    }

    const oAuth2Client = new google.auth.OAuth2(
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
    );
    oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    async function getAccessToken() {
      const res = await oAuth2Client.getAccessToken();
      return res?.token || res;
    }

    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: GMAIL_USER,
        clientId: GMAIL_CLIENT_ID,
        clientSecret: GMAIL_CLIENT_SECRET,
        refreshToken: GMAIL_REFRESH_TOKEN,
        accessToken: await getAccessToken()
      },
      pool: true,
      maxConnections: 5
    });
  }

  if (type === 'gmail') {
    // Gmail with App Password (less recommended at scale)
    const GMAIL_EMAIL = process.env.GMAIL_EMAIL;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
    if (!GMAIL_EMAIL || !GMAIL_APP_PASSWORD) {
      throw new Error('Missing GMAIL_EMAIL or GMAIL_APP_PASSWORD environment variables.');
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

  throw new Error('Unsupported TRANSPORTER_TYPE: ' + type);
}

// send single mail with retry/backoff
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
      // exponential backoff
      await delay(backoff);
      backoff *= 2;
    }
  }
}

// Batch sending (controlled parallelism)
async function sendBatch(transporter, mails, batchSize = 50, parallelInBatch = 5, pauseMs = 2000, retryConfig = {}) {
  const results = [];
  for (let i = 0; i < mails.length; i += batchSize) {
    const batch = mails.slice(i, i + batchSize);

    // process batch in groups of `parallelInBatch` to control concurrency
    for (let j = 0; j < batch.length; j += parallelInBatch) {
      const group = batch.slice(j, j + parallelInBatch);
      const promises = group.map(mailOptions =>
        sendWithRetry(transporter, mailOptions, retryConfig.maxRetries || 3, retryConfig.initialBackoffMs || 1000)
      );
      const settled = await Promise.all(promises);
      results.push(...settled);
    }

    // pause between batches
    if (i + batchSize < mails.length) {
      await delay(pauseMs);
    }
  }
  return results;
}

// API: /send
app.post('/send', requireAuth, async (req, res) => {
  try {
    const {
      senderName,        // displayed name
      // optional: if using gmail-inline credentials (not recommended)
      email,             // only used if TRANSPORTER_TYPE === 'gmail'
      password,          // not used in recommended setups
      recipients,        // newline/comma separated
      subject,
      message
    } = req.body;

    if (!recipients) return res.json({ success: false, message: "Recipients required" });

    // parse recipients
    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(r => r);

    if (recipientList.length === 0) {
      return res.json({ success: false, message: "No valid recipients" });
    }

    // create transporter
    const transporter = await createTransporter();

    // prepare mail options array
    const fromEnv = process.env.FROM_EMAIL || (email ? `"${senderName || 'Sender'}" <${email}>` : null);
    if (!fromEnv) {
      return res.json({ success: false, message: "FROM email not configured. Set FROM_EMAIL in .env" });
    }

    // Controls from env
    const batchSize = Number(process.env.BATCH_SIZE || 50);
    const parallelInBatch = Number(process.env.PARALLEL_IN_BATCH || 5);
    const pauseMs = Number(process.env.PAUSE_MS_BETWEEN_BATCHES || 2000);
    const maxRetries = Number(process.env.MAX_RETRIES || 3);
    const initialBackoffMs = Number(process.env.INITIAL_BACKOFF_MS || 1000);

    // make individualized mail objects (simple personalization)
    const mails = recipientList.map((to, idx) => {
      // you can expand personalization here (e.g., name parsing)
      const personalizedSubject = subject ? subject.replace(/{{name}}/g, '') : "No Subject";
      const personalizedText = (message || "").replace(/{{name}}/g, '');
      const html = `<div>${(message || "").replace(/\n/g, '<br>')}</div><hr><p>If you don't want these emails, <a href="https://yourdomain.com/unsubscribe?email=${encodeURIComponent(to)}">unsubscribe</a></p>`;

      return {
        from: fromEnv,
        to,
        subject: personalizedSubject,
        text: personalizedText,
        html,
        headers: {
          'List-Unsubscribe': `<mailto:unsubscribe@yourdomain.com>, <https://yourdomain.com/unsubscribe>`
        }
      };
    });

    // send in batches
    const results = await sendBatch(transporter, mails, batchSize, parallelInBatch, pauseMs, {
      maxRetries, initialBackoffMs
    });

    // summarize
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);
    // optional: log failed details to file
    if (failed.length > 0) {
      console.error('Failed sends:', failed.map(f => f.error && f.error.message ? f.error.message : f));
    }

    // close transporter pool if available
    if (transporter && typeof transporter.close === 'function') transporter.close();

    return res.json({
      success: failed.length === 0,
      total: recipientList.length,
      sent: succeeded,
      failed: failed.length,
      failures: failed.slice(0, 10).map(f => (f.error && f.error.message) ? f.error.message : JSON.stringify(f)).join('; ')
    });

  catch (err) {
  console.error("Send error:", err);
  return res.json({
    success: false,
    message: err.message || JSON.stringify(err)
  });
}


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
