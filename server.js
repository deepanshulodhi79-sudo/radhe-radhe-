require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 10000;

const HARD_USERNAME = "!@#$%^&*())(*&^%$#@!@#$%^&*";
const HARD_PASSWORD = "!@#$%^&*())(*&^%$#@!@#$%^&*";

let mailLimits = {};
let launcherLocked = false;

const sessionStore = new session.MemoryStore();
const upload = multer({ storage: multer.memoryStorage() });

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bulk-mailer-secret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 60 * 60 * 1000 }
}));

app.get("/health", (req, res) => res.send("Server Running ✅"));

function fullServerReset() {
  launcherLocked = true;
  mailLimits = {};
  sessionStore.clear(() => {});
  setTimeout(() => launcherLocked = false, 2000);
}

function requireAuth(req, res, next) {
  if (launcherLocked) return res.redirect('/');
  if (req.session.user) return next();
  return res.redirect('/');
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (launcherLocked) {
    return res.json({ success: false, message: "⛔ Reset ho raha hai" });
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
    res.json({ success: true, message: "Logged out" });
  });
});

// 🔥 SEND MAIL
app.post('/send', requireAuth, upload.array('images'), async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ success: false, message: "Required fields missing" });
    }

    const list = recipients.split(/[\n,]+/).map(r => r.trim()).filter(Boolean);

    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: email, pass: password }
    });

    const mails = list.map(r => {
      let mailOptions = {
        from: `"${senderName || 'Anonymous'}" <${email}>`,
        to: r,
        subject: subject || "Quick Note",
        text: message || ""
      };

      if (req.files && req.files.length > 0) {
        mailOptions.attachments = req.files.map(file => ({
          filename: file.originalname,
          content: file.buffer
        }));
      }

      return mailOptions;
    });

    for (let m of mails) {
      await transporter.sendMail(m);
    }

    res.json({ success: true, message: `✅ Sent ${list.length}` });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log("🚀 Running"));
