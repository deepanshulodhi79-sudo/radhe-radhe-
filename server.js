// ✅ server.js — Multi Gmail Sender (Render Ready)

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: true,
}));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Hardcoded login (optional)
const HARD_USERNAME = "Yatendra Rajput";
const HARD_PASSWORD = "Yattu@882";

// Login route
app.get("/", (req, res) => {
  if (req.session.user) {
    res.redirect("/launcher");
  } else {
    res.render("login");
  }
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    res.redirect("/launcher");
  } else {
    res.send("Invalid login details!");
  }
});

app.get("/launcher", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.render("launcher");
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ✅ MAIN SEND ROUTE (multi Gmail sender)
app.post("/send", async (req, res) => {
  try {
    const { fromName, fromEmail, fromPassword, toEmail, subject, message } = req.body;

    if (!fromEmail || !fromPassword)
      return res.status(400).json({ error: "Missing Gmail or App Password" });

    // Dynamic transporter per sender
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: fromEmail,
        pass: fromPassword,
      },
    });

    const mailOptions = {
      from: `${fromName} <${fromEmail}>`,
      to: toEmail,
      subject: subject || "No Subject",
      text: message,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Mail sent from ${fromEmail} → ${toEmail}`);
    res.json({ success: true });

  } catch (err) {
    console.error("❌ Mail send failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
