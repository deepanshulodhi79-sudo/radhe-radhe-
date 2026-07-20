const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const { Resend } = require('resend');
const path       = require('path');
require('dotenv').config();

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8 
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (req.session?.loggedIn) return next();
  res.redirect('/');
}

// 1. Pages Routes
app.get('/', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/launcher');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/launcher', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// 2. Auth Routes
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASS || 'admin123';

  if (username === validUser && password === validPass) {
    req.session.loggedIn = true;
    if (req.headers['content-type'] === 'application/json') {
      return res.json({ success: true });
    }
    return res.redirect('/launcher');
  }

  if (req.headers['content-type'] === 'application/json') {
    return res.json({ success: false, message: 'Invalid credentials' });
  }
  res.redirect('/?error=invalid');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// 3. Email Sending API Route (YEH RAHA WOH ROUTE)
app.post('/api/send-email', requireLogin, async (req, res) => {
  const { senderName, gmailId, replyToEmail, subject, messageBody, to, apiKey } = req.body;

  if (!to || !messageBody) {
    return res.status(400).json({ success: false, message: 'Missing "to" or "messageBody" fields' });
  }

  const keyToUse = apiKey || process.env.RESEND_API_KEY || 're_TQbJGbXz_5pWRgdxukArrVu3iLTXKGkxs';
  const resend = new Resend(keyToUse.trim());

  // Direct Reply address setup
  const myReplyAddress = replyToEmail || gmailId;

  try {
    const emailPayload = {
      from: 'onboarding@resend.dev',
      to: [to.trim()],
      subject: subject || 'Quick Update',
      text: messageBody
    };

    if (myReplyAddress) {
      emailPayload.reply_to = myReplyAddress.trim();
    }

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error(`❌ Resend Error:`, error);
      return res.status(400).json({ success: false, message: error.message });
    }

    console.log(`✅ Mail sent successfully to ${to}, ID:`, data.id);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`❌ Server Exception:`, err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Fast Mailer running on port ${PORT}`));
