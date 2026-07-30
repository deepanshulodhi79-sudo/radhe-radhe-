require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'launcher.html'));
});

// Human Jitter Delay (2.5s - 4s)
function getHumanDelay() {
  const ms = Math.floor(Math.random() * 1500) + 2500;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🛡️ RELIABLE SMTP WORKER ENGINE
async function runBackgroundEmailWorker(cleanEmail, cleanPassword, mailDetails, recipientList) {
  const { senderName, subject, message } = mailDetails;
  
  console.log(`[Queue Engine] Initializing SMTP connection for ${recipientList.length} email(s)...`);

  // Explicit STARTTLS Setup (Bypasses local ISP blocks)
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // TLS via STARTTLS
    auth: {
      user: cleanEmail,
      pass: cleanPassword
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Verify connection before looping
  try {
    await transporter.verify();
    console.log("✅ Connection Verified! Sending emails...");
  } catch (verifyErr) {
    console.error("❌ SMTP Verification Failed:", verifyErr.message);
    return;
  }

  for (let i = 0; i < recipientList.length; i++) {
    const toEmail = recipientList[i];
    const textContent = message || "Hello, please review the requested details.";

    const mailOptions = {
      from: senderName ? `"${senderName}" <${cleanEmail}>` : cleanEmail,
      to: toEmail,
      subject: subject || "Important Notification Update",
      text: textContent
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[Worker] ✅ (${i + 1}/${recipientList.length}) Sent to: ${toEmail}`);
    } catch (err) {
      console.error(`[Worker] ❌ (${i + 1}/${recipientList.length}) Failed for: ${toEmail} | Error: ${err.message}`);
    }

    if (i < recipientList.length - 1) {
      await getHumanDelay();
    }
  }

  console.log(`[Queue Engine] 🏁 Task completed.`);
}

app.post('/send', (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ 
        success: false, 
        message: "❌ Email, App Password aur Recipients zaroori hain!" 
      });
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(Boolean);

    if (recipientList.length === 0) {
      return res.json({ success: false, message: "❌ Recipient email list khali hai." });
    }

    const cleanEmail = email.trim();
    const cleanPassword = password.replace(/\s+/g, '');

    // Instant UI Response
    res.json({
      success: true,
      message: `⚡ Dispatching ${recipientList.length} email(s) in background...`
    });

    const mailDetails = {
      senderName: senderName ? senderName.trim() : '',
      subject: subject ? subject.trim() : '',
      message: message ? message.trim() : ''
    };

    runBackgroundEmailWorker(cleanEmail, cleanPassword, mailDetails, recipientList);

  } catch (err) {
    return res.json({ success: false, message: `❌ Server Error: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Mailer active on http://localhost:${PORT}`);
});
