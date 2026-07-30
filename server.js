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

// Helper Delay Function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 📦 PRO FEATURE: Background Mail Worker Function
async function processEmailQueue(accounts, recipientList, subject, message, senderName) {
  console.log(`🚀 Queue started for ${recipientList.length} emails...`);

  // Transporters pool create karna
  const transporters = accounts.map(acc => {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: acc.email.trim(),
        pass: acc.password.replace(/\s+/g, '')
      }
    });
  });

  for (let i = 0; i < recipientList.length; i++) {
    const toEmail = recipientList[i];
    
    // Account Rotation (Round-Robin Selection)
    const accIndex = i % accounts.length;
    const currentAcc = accounts[accIndex];
    const currentTransporter = transporters[accIndex];

    const mailOptions = {
      from: senderName ? `"${senderName}" <${currentAcc.email}>` : currentAcc.email,
      to: toEmail,
      subject: subject || "Important Business Notice",
      text: message || "Hello, please review the requested details.",
      // Headers for corporate email clients
      headers: {
        'X-Mailer': 'Enterprise Mailer v2.0',
        'X-Priority': '3'
      }
    };

    try {
      await currentTransporter.sendMail(mailOptions);
      console.log(`✅ [${i + 1}/${recipientList.length}] Sent to ${toEmail} via Account: ${currentAcc.email}`);
    } catch (err) {
      console.error(`❌ [${i + 1}/${recipientList.length}] Failed for ${toEmail} using ${currentAcc.email}:`, err.message);
    }

    // Safe Gap between sends (Accounts divide hone se speed fast rehti hai)
    if (i < recipientList.length - 1) {
      await delay(2000); 
    }
  }

  console.log('🏁 All emails in queue processed!');
}

// 📩 Send API Endpoint
app.post('/send', (req, res) => {
  try {
    const { senderName, accounts, recipients, subject, message } = req.body;

    /*
      Expected JSON Body format for Pro Level:
      {
        "senderName": "My Company",
        "accounts": [
           {"email": "sender1@gmail.com", "password": "app-pass-1"},
           {"email": "sender2@gmail.com", "password": "app-pass-2"}
        ],
        "recipients": "client1@gmail.com, client2@gmail.com",
        "subject": "Project Update",
        "message": "Hello Client..."
      }
    */

    // Backward compatibility for single account
    let smtpAccounts = accounts;
    if (!smtpAccounts && req.body.email && req.body.password) {
      smtpAccounts = [{ email: req.body.email, password: req.body.password }];
    }

    if (!smtpAccounts || smtpAccounts.length === 0 || !recipients) {
      return res.json({ success: false, message: "❌ Account credentials aur Recipients zaroori hain!" });
    }

    const recipientList = recipients
      .split(/[\n,]+/)
      .map(r => r.trim())
      .filter(Boolean);

    if (recipientList.length === 0) {
      return res.json({ success: false, message: "❌ Recipients list khali hai!" });
    }

    // Immediately respond to user (UI won't freeze or lag)
    res.json({
      success: true,
      message: `⚡ Dispatching ${recipientList.length} email(s) across ${smtpAccounts.length} sender account(s) in background!`
    });

    // Run queue in non-blocking background process
    processEmailQueue(smtpAccounts, recipientList, subject, message, senderName);

  } catch (err) {
    return res.json({ success: false, message: `❌ Server Error: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Pro Enterprise Mailer running on http://localhost:${PORT}`);
});
