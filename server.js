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

// Helper Delay
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 📩 Batch Send Endpoint (/api/send-batch)
app.post('/api/send-batch', async (req, res) => {
  try {
    const { senderName, gmailId, appPassword, subject, messageBody, recipients } = req.body;

    if (!gmailId || !appPassword || !recipients || recipients.length === 0) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const cleanEmail = gmailId.trim();
    const cleanPassword = appPassword.replace(/\s+/g, '');
    const cleanSender = senderName ? senderName.trim() : 'Sender';

    // High Speed Pooled Transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      auth: {
        user: cleanEmail,
        pass: cleanPassword
      }
    });

    // Verify Auth Connection
    try {
      await transporter.verify();
    } catch (authErr) {
      return res.status(401).json({ success: false, message: "Authentication failed. Check App Password." });
    }

    let ok = 0;
    let fail = 0;

    // Fast Parallel Async Batch Processing
    for (let i = 0; i < recipients.length; i++) {
      const toEmail = recipients[i];
      
      // Dynamic Headers to Bypass Spam Filter
      const uniqueHash = Math.random().toString(36).substring(2, 9);
      const dynamicMsgId = `<${Date.now()}.${uniqueHash}@gmail.com>`;

      const mailOptions = {
        from: `"${cleanSender}" <${cleanEmail}>`,
        to: toEmail,
        subject: subject || "Update Notice",
        text: messageBody || "",
        html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1a1a1a; line-height: 1.6;">${(messageBody || "").replace(/\n/g, '<br>')}</div>`,
        headers: {
          'Message-ID': dynamicMsgId,
          'X-Priority': '3',
          'X-Mailer': 'Enterprise System Mailer'
        }
      };

      try {
        await transporter.sendMail(mailOptions);
        ok++;
        console.log(`[${i + 1}/${recipients.length}] ✅ Sent to ${toEmail}`);
      } catch (err) {
        fail++;
        console.error(`[${i + 1}/${recipients.length}] ❌ Failed for ${toEmail}:`, err.message);
      }

      // Smart Natural Delay between sends (1.2s - 2.2s Jitter)
      if (i < recipients.length - 1) {
        const jitter = Math.floor(Math.random() * 1000) + 1200;
        await sleep(jitter);
      }
    }

    transporter.close();

    return res.json({
      success: true,
      delivered: ok,
      failed: fail,
      message: `Batch completed: ${ok} sent, ${fail} failed`
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/logout', (req, res) => {
  res.json({ success: true, message: "Logged out" });
});

app.listen(PORT, () => {
  console.log(`🚀 Fast Batch Mailer active on http://localhost:${PORT}`);
});
