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

// ================= ENV CONFIG =================

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// ================= GLOBAL STATE =================

let mailLimits = {};

const sessionStore = new session.MemoryStore();

// ================= MIDDLEWARE =================

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter
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
  secret: process.env.SESSION_SECRET || 'change_this_secret',
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
  if (req.session.user) return next();

  return res.redirect('/');
}

// ================= ROUTES =================

// Login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
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

// Launcher
app.get('/launcher', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
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
      email,
      password,
      recipients,
      subject,
      message
    } = req.body;

    // Validation
    if (!email || !password || !recipients) {

      return res.json({
        success: false,
        message: "Email, password and recipients required"
      });

    }

    // Sender validation
    if (!validator.isEmail(email)) {

      return res.json({
        success: false,
        message: "Invalid sender email"
      });

    }

    // Recipient validation
    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(r => validator.isEmail(r));

    if (recipientList.length === 0) {

      return res.json({
        success: false,
        message: "No valid recipients"
      });

    }

    // ================= RATE LIMIT =================

    const now = Date.now();

    if (
      !mailLimits[email] ||
      now - mailLimits[email].startTime >
      60 * 60 * 1000
    ) {

      mailLimits[email] = {
        count: 0,
        startTime: now
      };

    }

    // Safe daily-ish limit
    const MAX_PER_HOUR = 25;

    if (
      mailLimits[email].count +
      recipientList.length >
      MAX_PER_HOUR
    ) {

      return res.json({
        success: false,
        message:
          `Hourly limit exceeded. Remaining: ${
            MAX_PER_HOUR - mailLimits[email].count
          }`
      });

    }

    // ================= SMTP =================

    const transporter = nodemailer.createTransport({

      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,

      secure: false,

      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }

    });

    // Verify SMTP
    await transporter.verify();

    // ================= MAILS =================

    const mails = recipientList.map(recipient => ({

      from: `"${senderName || 'Support'}" <${email}>`,

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
          You received this email because you subscribed
          to updates from us.
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

    mailLimits[email].count += recipientList.length;

    return res.json({
      success: true,
      message:
        `Sent ${recipientList.length} emails successfully`
    });

  } catch (err) {

    console.error(err);

    return res.json({
      success: false,
      message: err.message
    });

  }

});

// ================= START =================

app.listen(PORT, () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});
