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

// Helper: Generates tiny variations so Google can't detect duplicate spam content
function randomizeContent(text) {
  if (!text) return "";
  // Adds non-visible zero-width spaces randomly to bypass text hash filters
  const invisibleChars = ['\u200B', '\u200C', '\u200D'];
  const randomChar = () => invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
  return text.split(' ').map(word => word + (Math.random() > 0.5 ? randomChar() : '')).join(' ');
}

// 📩 High-Inbox Batch Endpoint
app.post('/api/send-batch', async (req, res) => {
  try {
    const { senderName, gmailId, appPassword, subject, messageBody, recipients } = req.body;

    if (!gmailId || !appPassword || !recipients || recipients.length === 0) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const cleanEmail = gmailId.trim();
    const cleanPassword = appPassword.replace(/\s+/g, '');
    const cleanSender = senderName ? senderName.trim() : 'Sender';

    // Anti-Spam Pooled Transporter using SSL Port 465
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // TLS/SSL Security
      pool: true,
      maxConnections: 1, // Single connection looks more natural
      maxMessages: 100,
      auth: {
        user: cleanEmail,
        pass: cleanPassword
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    try {
      await transporter.verify();
    } catch (authErr) {
      return res.status(401).json({ success: false, message: "App Password incorrect or Blocked by Google" });
    }

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < recipients.length; i++) {
      const toEmail = recipients[i].trim();

      // Dynamic Security Headers for 100% Legit Classification
      const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
      const dynamicMsgId = `<${uniqueId}.${Date.now()}@gmail.com>`;
      
      // Dynamic unique body content
      const variedBody = randomizeContent(messageBody);

      const mailOptions = {
        from: `"${cleanSender}" <${cleanEmail}>`,
        to: toEmail,
        replyTo: cleanEmail,
        subject: subject || "Notification Update",
        text: messageBody,
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; font-size: 15px; color: #222222; line-height: 1.6; max-width: 600px;">
            ${variedBody.replace(/\n/g, '<br>')}
            <br><br>
            <hr style="border:none; border-top:1px solid #eeeeee; margin-top:20px;">
            <p style="font-size: 11px; color: #888888;">Ref ID: #${uniqueId}</p>
          </div>
        `,
        headers: {
          'Message-ID': dynamicMsgId,
          'X-Mailer': 'Microsoft Outlook 16.0', // Spoofs standard trusted mail client
          'X-Priority': '3 (Normal)',
          'Importance': 'Normal',
          'Precedence': 'bulk'
        }
      };

      try {
        await transporter.sendMail(mailOptions);
        ok++;
        console.log(`[${i + 1}/${recipients.length}] ✅ Delivered to Inbox → ${toEmail}`);
      } catch (err) {
        fail++;
        console.error(`[${i + 1}/${recipients.length}] ❌ Failed for ${toEmail}:`, err.message);
      }

      // ⏱️ Crucial Delay: 2.5s to 4.5s random jitter between sends
      if (i < recipients.length - 1) {
        const randomDelay = Math.floor(Math.random() * 2000) + 2500;
        await sleep(randomDelay);
      }
    }

    transporter.close();

    return res.json({
      success: true,
      delivered: ok,
      failed: fail,
      message: `Batch Finished: ${ok} delivered, ${fail} failed`
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/logout', (req, res) => {
  res.json({ success: true, message: "Logged out" });
});

app.listen(PORT, () => {
  console.log(`🚀 Anti-Spam Mailer running on http://localhost:${PORT}`);
});
