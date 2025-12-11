// server.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Hardcoded Login
const HARD_USERNAME = "!@#$%^&*())(*&^%$#@!@#$%^&*";
const HARD_PASSWORD = "!@#$%^&*())(*&^%$#@!@#$%^&*";

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'bulk-mailer-secret',
  resave: false,
  saveUninitialized: true
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session.user) return next();
  return res.redirect('/');
}

// Routes
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

// Delay helper
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Batch sender
async function sendBatch(transporter, mails, batchSize = 5) {
  const results = [];
  for (let i = 0; i < mails.length; i += batchSize) {
    const batch = mails.slice(i, i + batchSize);

    const settled = await Promise.allSettled(
      batch.map(mail => transporter.sendMail(mail))
    );

    results.push(...settled);

    await delay(300); // safe cooldown
  }
  return results;
}

// Main SEND endpoint (Inbox-friendly)
app.post('/send', requireAuth, async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, message: "Email, password & recipients required" });
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(r => r);

    if (recipientList.length === 0) {
      return res.json({ success: false, message: "No valid recipients" });
    }

    // 🔥 Sendinblue SMTP (Inbox safe)
    const transporter = nodemailer.createTransport({
      host: "smtp-relay.sendinblue.com",
      port: 587,
      secure: false,
      auth: {
        user: email,     // SAME email used in Sendinblue verified sender
        pass: password   // SMTP key from Sendinblue
      }
    });

    // mail builder (NO FOOTER = NO SPAM)
    const mails = recipientList.map(r => ({
      from: `"${senderName || 'Sender'}" <${email}>`,
      to: r,
      subject: subject || "No Subject",
      text: message || ""
    }));

    // Send
    await sendBatch(transporter, mails, 5);

    return res.json({ success: true, message: `✅ Mail sent to ${recipientList.length} recipients` });

  } catch (err) {
    console.error("Send error:", err);
    return res.json({ success: false, message: err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
