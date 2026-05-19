// server.js

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const validator = require('validator');
const rateLimit = require('express-rate-limit');

const app = express();

const PORT = process.env.PORT || 8080;

// ================= CONFIG =================

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ================= GLOBAL STATE =================

let mailLimits = {};

const sessionStore = new session.MemoryStore();

// ================= MIDDLEWARE =================

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

// Rate limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: "Too many requests"
  }
}));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_key',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 60 * 60 * 1000,
    httpOnly: true,
    secure: false
  }
}));

// ================= HELPERS =================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendSequential(transporter, mails) {

  for (const mail of mails) {

    await transporter.sendMail(mail);

    console.log(`✅ Sent to ${mail.to}`);

    // Human-like delay
    const randomDelay =
      Math.floor(Math.random() * 4000) + 3000;

    await delay(randomDelay);
  }
}

// ================= AUTH =================

function requireAuth(req, res, next) {

  if (req.session.user) {
    return next();
  }

  return res.redirect('/');
}

// ================= ROUTES =================

// Login page
app.get('/', (req, res) => {

  res.sendFile(
    path.join(__dirname, 'public', 'login.html')
  );

});

// Login
app.post('/login', (req, res) => {

  const { username, password } = req.body;

  if (
    username === ADMIN_USERNAME &&
    password === ADMIN_PASSWORD
  ) {

    req.session.user = username;

    return res.json({
      success: true
    });

  }

  return res.json({
    success: false,
    message: "Invalid credentials"
  });

});

// Launcher page
app.get('/launcher', requireAuth, (req, res) => {

  res.sendFile(
    path.join(__dirname, 'public', 'launcher.html')
  );

});

// Logout
app.post('/logout', (req, res) => {

  req.session.destroy(() => {

    res.clearCookie('connect.sid');

    return res.json({
      success: true,
      message: "Logged out"
    });

  });

});

// ================= SEND MAIL =================

app.post('/send', requireAuth, async (req, res) => {

  try {

    const {
      senderName,
      recipients,
      subject,
      message
    } = req.body;

    // Validate recipients
    if (!recipients) {

      return res.json({
        success: false,
        message: "Recipients required"
      });

    }

    // Parse recipients
    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(r => validator.isEmail(r));

    if (recipientList.length === 0) {

      return res.json({
        success: false,
        message: "No valid recipients found"
      });

    }

    // ================= RATE LIMIT =================

    const smtpUser = process.env.SMTP_USER;

    const now = Date.now();

    if (
      !mailLimits[smtpUser] ||
      now - mailLimits[smtpUser].startTime >
      60 * 60 * 1000
    ) {

      mailLimits[smtpUser] = {
        count: 0,
        startTime: now
      };

    }

    const MAX_PER_HOUR = 25;

    if (
      mailLimits[smtpUser].count +
      recipientList.length >
      MAX_PER_HOUR
    ) {

      return res.json({
        success: false,
        message:
          `Hourly limit exceeded. Remaining: ${
            MAX_PER_HOUR -
            mailLimits[smtpUser].count
          }`
      });

    }

    // ================= SMTP =================

    const transporter = nodemailer.createTransport({

      host: process.env.SMTP_HOST,

      port: Number(process.env.SMTP_PORT),

      secure: false,

      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }

    });

    // Verify SMTP
    await transporter.verify();

    // ================= CREATE MAILS =================

    const mails = recipientList.map(recipient => ({

      from:
        `"${senderName || 'Support'}" <${process.env.SMTP_USER}>`,

      to: recipient,

      subject: subject || 'Update',

      text: message || '',

      html: `
      <div style="font-family:Arial,sans-serif;padding:20px;line-height:1.6">

        <h2>
          ${subject || 'Update'}
        </h2>

        <p>
          ${message || ''}
        </p>

        <hr>

        <small style="color:gray">
          You received this email because you subscribed to updates.
        </small>

      </div>
      `,

      headers: {
        "List-Unsubscribe":
          "<mailto:unsubscribe@yourdomain.com>"
      }

    }));

    // ================= SEND =================

    await sendSequential(transporter, mails);

    mailLimits[smtpUser].count += recipientList.length;

    return res.json({
      success: true,
      message:
        `✅ Sent ${recipientList.length} email(s)`
    });

  } catch (err) {

    console.error(err);

    return res.json({
      success: false,
      message: err.message
    });

  }

});

// ================= START SERVER =================

app.listen(PORT, () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});
