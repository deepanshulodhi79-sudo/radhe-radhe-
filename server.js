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

// ================= GLOBAL STATE =================
let mailLimits = {};          // per sender hourly limit
let launcherLocked = false;

// Session store
const sessionStore = new session.MemoryStore();

// ================= MIDDLEWARE =================
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session (1 hour)
app.use(session({
  secret: 'bulk-mailer-secret',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
  cookie: { maxAge: 60 * 60 * 1000 }
}));

// ================= RESET =================
function fullServerReset() {
  console.log("🔁 FULL LAUNCHER RESET");
  launcherLocked = true;
  mailLimits = {};

  sessionStore.clear(() => {
    console.log("🧹 Sessions cleared");
  });

  setTimeout(() => {
    launcherLocked = false;
    console.log("✅ Launcher unlocked");
  }, 2000);
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
    return res.json({ success: false, message: "⛔ Reset in progress" });
  }

  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    setTimeout(fullServerReset, 60 * 60 * 1000);
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
    res.json({ success: true });
  });
});

// ================= HELPERS =================
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Python-style slow sender (NO parallel sending)
async function sendSlow(transporter, mail) {
  await transporter.sendMail(mail);

  // 45–120 sec random delay
  const wait = Math.floor(Math.random() * (120000 - 45000 + 1) + 45000);
  console.log(`⏳ Waiting ${Math.floor(wait / 1000)} sec`);
  await delay(wait);
}

// ================= SEND MAIL =================
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, message: "Missing fields" });
    }

    const now = Date.now();
    const MAX_PER_HOUR = 15; // SAFE LIMIT

    if (!mailLimits[email] || now - mailLimits[email].startTime > 60 * 60 * 1000) {
      mailLimits[email] = { count: 0, startTime: now };
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(Boolean);

    if (mailLimits[email].count + recipientList.length > MAX_PER_HOUR) {
      return res.json({
        success: false,
        message: `❌ Max ${MAX_PER_HOUR}/hour allowed`
      });
    }

    // ⚠️ SMTP CONFIG
    // 👉 Gmail (testing only)
    // 👉 Zoho recommended for production
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",   // 🔁 change to smtp.zoho.in
      port: 465,                // Zoho: 587
      secure: true,             // Zoho: false
      auth: {
        user: email,
        pass: password          // Gmail App Password / Zoho App Password
      }
    });

    for (const r of recipientList) {
      const mail = {
        from: `"${senderName || 'Anonymous'}" <${email}>`,
        to: r,
        subject: subject || "",   // ✅ ONLY USER-PROVIDED SUBJECT
        text: message || ""
      };

      await sendSlow(transporter, mail);
      mailLimits[email].count++;
    }

    return res.json({
      success: true,
      message: `✅ Sent ${recipientList.length} | Used ${mailLimits[email].count}/${MAX_PER_HOUR}`
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
