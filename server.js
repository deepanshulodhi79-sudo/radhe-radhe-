import express from 'express';
import session from 'express-session';
import nodemailer from 'nodemailer';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

declare module 'express-session' {
  interface SessionData {
    loggedIn?: boolean;
  }
}

dotenv.config();

const app = express();
const PORT = 3000;

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fast-mailer-secret-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

// Middleware to check authentication
function requireLogin(req: any, res: any, next: any) {
  if (req.session?.loggedIn) return next();
  res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });
}

// Authentication status
app.get('/api/auth/status', (req, res) => {
  res.json({ loggedIn: Boolean(req.session?.loggedIn) });
});

// Login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASS || 'admin123';

  if (username === validUser && password === validPass) {
    if (req.session) {
      req.session.loggedIn = true;
    }
    return res.json({ success: true, message: 'Login successful' });
  }

  return res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Logout route
app.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

// Email sending route with enhanced headers & deliverability best practices
app.post('/api/send-email', requireLogin, async (req, res) => {
  const {
    senderName,
    gmailId,
    appPassword,
    subject,
    messageBody,
    htmlBody,
    to,
    replyTo,
    smtpHost,
    smtpPort,
    smtpSecure,
  } = req.body;

  if (!gmailId || !appPassword || !to || (!messageBody && !htmlBody)) {
    return res.status(400).json({
      success: false,
      message: 'Required fields missing (Sender Email, App Password, Recipient, Body)',
    });
  }

  const cleanGmail = String(gmailId).trim();
  const cleanAppPass = String(appPassword).trim().replace(/\s+/g, '');
  const cleanTo = String(to).trim();
  const cleanReplyTo = replyTo ? String(replyTo).trim() : cleanGmail;

  // Custom SMTP vs Standard Gmail SMTP fallback
  const isCustomSmtp = Boolean(smtpHost);
  const host = isCustomSmtp ? String(smtpHost).trim() : 'smtp.gmail.com';
  const port = smtpPort ? Number(smtpPort) : (smtpSecure ? 465 : 587);
  const secure = smtpSecure !== undefined ? Boolean(smtpSecure) : port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: cleanGmail,
      pass: cleanAppPass,
    },
    tls: {
      rejectUnauthorized: false, // Prevents self-signed cert blocking in proxy setups
    },
  });

  try {
    const cleanSender = senderName ? String(senderName).trim() : '';
    // Recommended From Header standard: "Name" <email>
    const fromHeader = cleanSender ? `"${cleanSender}" <${cleanGmail}>` : cleanGmail;

    // Build standard multi-part message (both text and HTML boost deliverability scores)
    const textContent = messageBody || (htmlBody ? htmlBody.replace(/<[^>]+>/g, '') : '');
    const htmlContent = htmlBody || (messageBody ? `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; font-size: 15px;">${messageBody.replace(/\n/g, '<br>')}</div>` : '');

    const mailOptions: nodemailer.SendMailOptions = {
      from: fromHeader,
      to: cleanTo,
      replyTo: cleanReplyTo,
      subject: subject ? String(subject).trim() : 'No Subject',
      text: textContent,
      html: htmlContent,
      headers: {
        'X-Mailer': 'FastMailer Pro/2.0',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk',
      },
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Mail sent successfully to ${cleanTo}. MessageId: ${info.messageId}`);

    res.json({
      success: true,
      messageId: info.messageId,
      accepted: info.accepted,
      response: info.response,
    });
  } catch (err: any) {
    console.error(`❌ Mail Error:`, err?.message || err);
    res.status(500).json({
      success: false,
      message: err?.message || 'Failed to send email. Check credentials and App Password.',
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Fast Mailer running on http://localhost:${PORT}`);
  });
}

startServer();
