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

// 🛡️ BACKGROUND WORKER ENGINE
async function runBackgroundEmailWorker(cleanEmail, cleanPassword, mailDetails, recipientList) {
  const { senderName, subject, message } = mailDetails;
  
  console.log(`[Queue Engine] Started processing ${recipientList.length} emails in background...`);

  // Direct Gmail Transporter
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: cleanEmail,
      pass: cleanPassword
    }
  });

  // Verify Transporter Auth First
  try {
    await transporter.verify();
    console.log("✅ Credentials verified successfully! Sending emails...");
  } catch (authError) {
    console.error("❌ Authentication Failed! Invalid Email or App Password:", authError.message);
    return;
  }

  for (let i = 0; i < recipientList.length; i++) {
    const toEmail = recipientList[i];
    const textContent = message || "Hello, please review the requested details.";

    const mailOptions = {
      from: senderName ? `"${senderName}" <${cleanEmail}>` : cleanEmail,
      to: toEmail,
      subject: subject || "Notification Update",
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

  console.log(`[Queue Engine] 🏁 Background task completed.`);
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
    // Spaces remove
    const cleanPassword = password.replace(/\s+/g, '');

    // Instant Fast Response to UI
    res.json({
      success: true,
      message: `⚡ Processing ${recipientList.length} email(s) in background...`
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
