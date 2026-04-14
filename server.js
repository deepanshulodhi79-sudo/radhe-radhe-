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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    return res.json({ success: true });
  }

  res.json({ success: false });
});

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/");
}

app.get("/launcher", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// 🔥 SEND MAIL (INLINE IMAGE)
app.post("/send", requireAuth, upload.array("images"), async (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    const list = recipients.split(/[\n,]+/).map(r => r.trim()).filter(Boolean);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: email, pass: password }
    });

    const mails = list.map(r => {
      let mailOptions = {
        from: `"${senderName}" <${email}>`,
        to: r,
        subject: subject,
        html: message // 🔥 IMPORTANT (HTML mail)
      };

      if (req.files && req.files.length > 0) {
        mailOptions.attachments = req.files.map((file, i) => ({
          filename: file.originalname,
          content: file.buffer,
          cid: "img" + i
        }));
      }

      return mailOptions;
    });

    for (let m of mails) {
      await transporter.sendMail(m);
    }

    res.json({ success: true, message: "✅ Mail Sent Successfully" });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log("🚀 Server running"));
