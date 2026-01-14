// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// 🔑 Hardcoded login
const HARD_USERNAME = "!@#$%^&*())(*&^%$#@!@#$%^&*";
const HARD_PASSWORD = "!@#$%^&*())(*&^%$#@!@#$%^&*";

// ================= GLOBAL =================
let mailLimits = {};
let launcherLocked = false;
const sessionStore = new session.MemoryStore();

// ================= MIDDLEWARE =================
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'bulk-mailer-secret',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: { maxAge: 60 * 60 * 1000 }
}));

// ================= RESET =================
function fullServerReset() {
  launcherLocked = true;
  mailLimits = {};
  sessionStore.clear(() => {});
  setTimeout(() => launcherLocked = false, 2000);
}

// ================= AUTH =================
function requireAuth(req, res, next) {
  if (launcherLocked) return res.redirect('/');
  if (req.session.user) return next();
  return res.redirect('/');
}

// ================= ROUTES =================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (launcherLocked) {
    return res.json({ success: false, message: "⛔ Resetting, wait..." });
  }

  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    setTimeout(fullServerReset, 60 * 60 * 1000);
    return res.json({ success: true });
  }

  res.json({ success: false, message: "❌ Invalid credentials" });
});

app.get('/launcher', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true, message: "✅ Logged out" });
  });
});

// ================= HELPERS =================
const delay = ms => new Promise(r => setTimeout(r, ms));

async function sendBatch(transporter, mails) {
  for (const mail of mails) {
    await transporter.sendMail(mail);
    await delay(1200); // 👈 VERY IMPORTANT (human gap)
  }
}

function safeSubject(subject) {
  if (!subject) return "Quick question";
  if (/^re:/i.test(subject)) return subject;
  return subject;
}

// ================= SEND =================
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, message: "Required fields missing" });
    }

    // ⏳ Per session guard
    if (!req.session.lastSend) req.session.lastSend = 0;
    if (Date.now() - req.session.lastSend < 5000) {
      return res.json({ success: false, message: "⏳ Please wait a few seconds" });
    }
    req.session.lastSend = Date.now();

    const now = Date.now();
    if (!mailLimits[email] || now - mailLimits[email].startTime > 60 * 60 * 1000) {
      mailLimits[email] = { count: 0, startTime: now };
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(Boolean);

    // 🔒 SAFE LIMIT (very important)
    if (mailLimits[email].count + recipientList.length > 20) {
      return res.json({
        success: false,
        message: `❌ Limit 20 mails/hour | Remaining ${20 - mailLimits[email].count}`
      });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password }
    });

    const safeName =
      senderName && senderName.length > 2
        ? senderName
        : email.split('@')[0];

    const mails = recipientList.map(to => ({
      from: `"${safeName}" <${email}>`,
      to,
      subject: safeSubject(subject),
      text: message || "Hello",
      headers: {
        "X-Mailer": "Gmail",
        "X-Priority": "3",
        "List-Unsubscribe": "<mailto:noreply@gmail.com>" // subtle trust signal
      }
    }));

    await sendBatch(transporter, mails);
    mailLimits[email].count += recipientList.length;

    res.json({
      success: true,
      message: `✅ Sent ${recipientList.length} | Used ${mailLimits[email].count}/20`
    });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 Mail Launcher running on ${PORT}`);
});
