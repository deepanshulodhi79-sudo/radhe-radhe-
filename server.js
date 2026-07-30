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

// Human Jitter Delay (2.5s - 4s) for Safe Anti-Spam Sending
function getHumanDelay() {
  const ms = Math.floor(Math.random() * 1500) + 2500;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🛡️ BACKGROUND WORKER ENGINE (Reliable & Low-Spam)
async function runBackgroundEmailWorker(cleanEmail, cleanPassword, mailDetails, recipientList) {
  const { senderName, subject, message } = mailDetails;
  
  console.log(`[Queue Engine] Started processing ${recipientList.length} emails in background...`);

  // Direct Transporter Setup (No pool conflicts)
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: cleanEmail,
      pass: cleanPassword
    }
  });

  for (let i = 0; i < recipientList.length; i++) {
    const toEmail = recipientList[i];
    const textContent = message || "Hello, please review the requested details.";

    // Dynamic Header generation to pass anti-spam filters
    const uniqueHash = Math.random().toString(36).substring(2, 9);
    const dynamicMessageId = `<${Date.now()}.${uniqueHash}@gmail.com>`;

    const mailOptions = {
      from: senderName ? `"${senderName}" <${cleanEmail}>` : cleanEmail,
      to: toEmail,
      subject: subject || "Important Notification Update",
      text: textContent,
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #111; line-height: 1.5;">${textContent.replace(/\n/g, '<br>')}</div>`,
      headers: {
        'Message-ID': dynamicMessageId,
        'X-Priority': '3'
      }
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[Worker] ✅ (${i + 1}/${recipientList.length}) Sent to: ${toEmail}`);
    } catch (err) {
      console.error(`[Worker] ❌ (${i + 1}/${recipientList.length}) Failed for: ${toEmail} | Error: ${err.message}`);
    }

    // Natural Delay Between Emails
    if (i < recipientList.length - 1) {
      await getHumanDelay();
    }
  }

  console.log(`[Queue Engine] 🏁 Background task completed for all emails.`);
}

// 📩 Send API Endpoint (Fast Response)
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
    // App password se space hatana
    const cleanPassword = password.replace(/\s+/g, '');

    // ⚡ 1. INSTANT FAST RESPONSE (Frontend UI Screen Fast)
    res.json({
      success: true,
      message: `⚡ Dispatching ${recipientList.length} email(s) in background queue!`
    });

    // 🚀 2. BACKGROUND WORKER PROCESS
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
  console.log(`🚀 Fixed Mailer active on http://localhost:${PORT}`);
});
