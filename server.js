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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 📩 Clean & Direct Inbox Batch Endpoint
app.post('/api/send-batch', async (req, res) => {
  try {
    const { senderName, gmailId, appPassword, subject, messageBody, recipients } = req.body;

    if (!gmailId || !appPassword || !recipients || recipients.length === 0) {
      return res.status(400).json({ success: false, message: "Required fields missing" });
    }

    const cleanEmail = gmailId.trim();
    const cleanPassword = appPassword.replace(/\s+/g, '');
    const cleanSender = senderName ? senderName.trim() : '';

    // Simple & Clean Gmail SMTP Transport
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: cleanEmail,
        pass: cleanPassword
      }
    });

    try {
      await transporter.verify();
    } catch (authErr) {
      return res.status(401).json({ success: false, message: "App Password galat hai ya Google ne block kiya hai." });
    }

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < recipients.length; i++) {
      const toEmail = recipients[i].trim();

      // Clean Mail Options (Purely Organic, No Ref IDs, No Junk)
      const mailOptions = {
        from: cleanSender ? `"${cleanSender}" <${cleanEmail}>` : cleanEmail,
        to: toEmail,
        subject: subject || "",
        text: messageBody || "",
        html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #000000; line-height: 1.5;">${(messageBody || "").replace(/\n/g, '<br>')}</div>`
      };

      try {
        await transporter.sendMail(mailOptions);
        ok++;
        console.log(`[${i + 1}/${recipients.length}] ✅ Sent to → ${toEmail}`);
      } catch (err) {
        fail++;
        console.error(`[${i + 1}/${recipients.length}] ❌ Failed for ${toEmail}:`, err.message);
      }

      // 2 Seconds Gap between mails so Gmail rate-limit trigger na ho
      if (i < recipients.length - 1) {
        await sleep(2000);
      }
    }

    return res.json({
      success: true,
      delivered: ok,
      failed: fail,
      message: `Batch complete: ${ok} delivered, ${fail} failed`
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/logout', (req, res) => {
  res.json({ success: true, message: "Logged out" });
});

app.listen(PORT, () => {
  console.log(`🚀 Clean Mailer Server active on http://localhost:${PORT}`);
});
