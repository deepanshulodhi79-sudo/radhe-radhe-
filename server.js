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

// Helper: Smart Anti-Spam Human Jitter Delay (2.5s to 4.5s)
function getHumanDelay() {
  const ms = Math.floor(Math.random() * 2000) + 2500;
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 🛡️ BACKGROUND ASYNC WORKER ENGINE (Zero UI Wait Time + Minimum Spam)
async function runBackgroundEmailWorker(transporter, mailDetails, recipientList) {
  const { senderName, cleanEmail, subject, message } = mailDetails;
  
  console.log(`[Queue Engine] Started processing ${recipientList.length} emails in background...`);

  for (let i = 0; i < recipientList.length; i++) {
    const toEmail = recipientList[i];
    const textContent = message || "Hello, please review the requested information.";

    // Anti-Spam Strategy: Dynamic Unique Thread ID & Native Headers
    const uniqueHash = Math.random().toString(36).substring(2, 9);
    const domainHost = cleanEmail.split('@')[1] || 'gmail.com';
    const dynamicMessageId = `<${Date.now()}.${uniqueHash}@${domainHost}>`;

    const mailOptions = {
      from: senderName ? `"${senderName}" <${cleanEmail}>` : cleanEmail,
      to: toEmail,
      subject: subject || "Important Notification Update",
      text: textContent,
      // Minimal Clean HTML structure to lower spam rating
      html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;">${textContent.replace(/\n/g, '<br>')}</div>`,
      headers: {
        'Message-ID': dynamicMessageId,
        'X-Mailer': 'AppleMail / macOS 14.5',
        'X-Priority': '3 (Normal)',
        'Importance': 'Normal'
      }
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[Worker] ✅ (${i + 1}/${recipientList.length}) Delivered to: ${toEmail}`);
    } catch (err) {
      console.error(`[Worker] ❌ (${i + 1}/${recipientList.length}) Failed to deliver to: ${toEmail} | Error: ${err.message}`);
    }

    // Human Gap Delay between consecutive emails (Bypasses Google Automation Detection)
    if (i < recipientList.length - 1) {
      await getHumanDelay();
    }
  }

  console.log(`[Queue Engine] 🏁 Completed background dispatch for all ${recipientList.length} emails!`);
  transporter.close();
}

// 📩 API Endpoint (Instant Async Response)
app.post('/send', (req, res) => {
  try {
    const { senderName, email, password, recipients, subject, message } = req.body;

    if (!email || !password || !recipients) {
      return res.json({ 
        success: false, 
        message: "❌ Email, Password aur Recipients bharna zaroori hai!" 
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

    // Setup High-Speed Transport Pool
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: cleanEmail,
        pass: cleanPassword
      },
      pool: true,
      maxConnections: 3
    });

    // ⚡ 1. INSTANT RESPONSE TO FRONTEND (UI Won't Freeze)
    res.json({
      success: true,
      message: `⚡ Dispatching ${recipientList.length} email(s) in background queue!`
    });

    // 🚀 2. ASYNC BACKGROUND EXECUTION (Minimum Spam Strategy)
    const mailDetails = {
      senderName: senderName ? senderName.trim() : '',
      cleanEmail,
      subject: subject ? subject.trim() : '',
      message: message ? message.trim() : ''
    };

    runBackgroundEmailWorker(transporter, mailDetails, recipientList);

  } catch (err) {
    return res.json({ success: false, message: `❌ Server Error: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Fast & Low-Spam Mailer running on http://localhost:${PORT}`);
});
