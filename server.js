// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// ================= LOGIN =================
const HARD_USERNAME = "!@#$%^&*())(*&^%$#@!@#$%^&*";
const HARD_PASSWORD = "!@#$%^&*())(*&^%$#@!@#$%^&*";

// ================= GLOBAL STATE =================
let launcherLocked = false;
let mailLimits = {}; // per sender hourly
let sendQueue = [];
let isProcessing = false;
let senderIndex = 0;

// Session store
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
  sendQueue = [];

  sessionStore.clear(() => {});
  setTimeout(() => { launcherLocked = false; }, 2000);
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
    return res.json({ success: false, message: "Reset in progress" });
  }

  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    setTimeout(fullServerReset, 60 * 60 * 1000);
    return res.json({ success: true });
  }

  return res.json({ success: false, message: "Invalid credentials" });
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

function getNextSender(senders) {
  const sender = senders[senderIndex];
  senderIndex = (senderIndex + 1) % senders.length;
  return sender;
}

// ================= BACKGROUND WORKER =================
async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (sendQueue.length > 0) {
    const job = sendQueue.shift();
    const { transporter, mail, senderEmail } = job;

    try {
      await transporter.sendMail(mail);

      // update hourly count
      mailLimits[senderEmail].count++;

      // 45–120 sec delay
      const wait = Math.floor(Math.random() * (120000 - 45000 + 1) + 45000);
      await delay(wait);

    } catch (err) {
      console.error("Send failed:", err.message);
    }
  }

  isProcessing = false;
}

// ================= SEND =================
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, subject, message, recipients } = req.body;

    if (!recipients) {
      return res.json({ success: false, message: "Recipients required" });
    }

    // 🔁 SENDER POOL (example – replace with your real IDs)
    const senders = [
      { email: "id1@yourdomain.in", pass: "APP_PASS_1" },
      { email: "id2@yourdomain.in", pass: "APP_PASS_2" }
    ];

    const MAX_PER_HOUR = 15;
    const now = Date.now();

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(Boolean);

    // prepare jobs
    for (const r of recipientList) {
      const sender = getNextSender(senders);

      if (!mailLimits[sender.email] || now - mailLimits[sender.email].startTime > 60 * 60 * 1000) {
        mailLimits[sender.email] = { count: 0, startTime: now };
      }

      if (mailLimits[sender.email].count >= MAX_PER_HOUR) {
        continue;
      }

      const transporter = nodemailer.createTransport({
        host: "smtp.zoho.in",
        port: 587,
        secure: false,
        auth: {
          user: sender.email,
          pass: sender.pass
        }
      });

      sendQueue.push({
        senderEmail: sender.email,
        transporter,
        mail: {
          from: `"${senderName || 'Anonymous'}" <${sender.email}>`,
          to: r,
          subject: subject || "",
          text: message || ""
        }
      });
    }

    // 🔥 start background worker
    processQueue();

    // 🔥 immediate response to UI
    return res.json({
      success: true,
      message: `🚀 ${recipientList.length} mails queued & sending in background`
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
