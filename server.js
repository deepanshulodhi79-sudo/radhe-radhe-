// ✅ server.js — HTML Version (No EJS Needed)
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Hardcoded login
const HARD_USERNAME = "Yatendra Rajput";
const HARD_PASSWORD = "Yattu@882";

// Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: true,
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/launcher");
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (username === HARD_USERNAME && password === HARD_PASSWORD) {
    req.session.user = username;
    return res.redirect("/launcher");
  }
  res.send("Invalid login details!");
});

app.get("/launcher", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "public", "launcher.html"));
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// ✅ SEND EMAIL
app.post("/send", async (req, res) => {
  try {
    const { fromName, fromEmail, fromPassword, toEmail, subject, message } = req.body;

    if (!fromEmail || !fromPassword)
      return res.status(400).send("Missing Gmail or App Password");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: fromEmail,
        pass: fromPassword,
      },
    });

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to: toEmail,
      subject: subject || "No Subject",
      text: message,
    });

    console.log(`✅ Mail sent from ${fromEmail} → ${toEmail}`);
    res.send("✅ Mail sent successfully!");

  } catch (err) {
    console.error("❌ Mail send failed:", err);
    res.status(500).send("Mail failed: " + err.message);
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
