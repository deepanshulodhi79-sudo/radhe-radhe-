// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// 🔑 Hardcoded login
const HARD_USERNAME = "!@#$%^&*())(*&^%$#@!@#$%^&*";
const HARD_PASSWORD = "!@#$%^&*())(*&^%$#@!@#$%^&*";

// ================= GLOBAL STATE =================
const mailLimits = new Map();
let launcherLocked = false;

// Session store
const sessionStore = new session.MemoryStore();

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bulk-mailer-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    maxAge: 60 * 60 * 1000,
    httpOnly: true
  }
}));

// ================= FULL RESET =================
function fullServerReset() {
  console.log("🔁 FULL LAUNCHER RESET");

  launcherLocked = true;
  mailLimits.clear();

  sessionStore.clear(() => {
    console.log("🧹 All sessions cleared");
  });

  setTimeout(() => {
    launcherLocked = false;
    console.log("✅ Launcher unlocked for fresh login");
  }, 2000);
}

// ================= AUTH =================
function requireAuth(req, res, next) {
  if (launcherLocked) return res.redirect('/');
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

  if (launcherLocked) {
    return res.json({
      success: false,
      message: "⛔ Launcher reset ho raha hai, thodi der baad login karo"
    });
  }

  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;

    // ⏱️ Full reset after 1 hour
    setTimeout(fullServerReset, 60 * 60 * 1000);

    return res.json({ success: true });
  }

  return res.json({ success: false, message: "❌ Invalid credentials" });
});

// Launcher page
app.get('/launcher', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// ================= LOGOUT =================
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    return res.json({
      success: true,
      message: "✅ Logged out successfully"
    });
  });
});

// ================= HELPERS =================
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function sendBatch(transporter, mails, batchSize = 5) {
  for (let i = 0; i < mails.length; i += batchSize) {
    const batch = mails.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(m => transporter.sendMail(m)));
    await delay(300);
  }
}

// ================= SEND MAIL =================
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients) {
      return res.json({
        success: false,
        message: "Email, password and recipients required"
      });
    }

    const now = Date.now();

    // ⏱️ Hourly sender reset
    if (!mailLimits.has(email) || now - mailLimits.get(email).startTime > 3600000) {
      mailLimits.set(email, { count: 0, startTime: now });
    }

    const senderData = mailLimits.get(email);

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(Boolean);

    if (senderData.count + recipientList.length > 27) {
      return res.json({
        success: false,
        message: `❌ Max 27 mails/hour | Remaining: ${27 - senderData.count}`
      });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail", // modern shortcut
      auth: {
        user: email,
        pass: password
      }
    });

    const mails = recipientList.map(r => ({
      from: `"${senderName || 'Anonymous'}" <${email}>`,
      to: r,
      subject: subject || "Quick Note",
      text: message || ""
    }));

    await sendBatch(transporter, mails, 5);

    senderData.count += recipientList.length;

    return res.json({
      success: true,
      message: `✅ Sent ${recipientList.length} | Used ${senderData.count}/27`
    });

  } catch (err) {
    console.error(err);
    return res.json({ success: false, message: err.message });
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`🚀 Mail Launcher running on port ${PORT}`);
});
