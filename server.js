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

// Human-like Variable Delay (3 to 6 seconds random jitter)
function getRandomDelay() {
  const ms = Math.floor(Math.random() * 3000) + 3000; // 3000ms - 6000ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 📩 High-Deliverability Batch Endpoint
app.post('/api/send-batch', async (req, res) => {
  try {
    const { senderName, gmailId, appPassword, subject, messageBody, recipients } = req.body;

    if (!gmailId || !appPassword || !recipients || recipients.length === 0) {
      return res.status(400).json({ success: false, message: "Required fields missing" });
    }

    const cleanEmail = gmailId.trim();
    const cleanPassword = appPassword.replace(/\s+/g, '');
    const cleanSender = senderName ? senderName.trim() : '';

    // Standard Gmail SMTP Transport
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
      return res.status(401).json({ success: false, message: "App Password incorrect or Blocked by Google" });
    }

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < recipients.length; i++) {
      const toEmail = recipients[i].trim();

      const plainTextContent = messageBody || "";
      const formattedHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #222222; line-height: 1.6;">
          <p>${(messageBody || "").replace(/\n/g, '<br>')}</p>
          <br>
          <p style="font-size: 11px; color: #777777;">
            If you wish to stop receiving updates, reply with 'Unsubscribe'.
          </p>
        </div>
      `;

      // Optimized Mail Options for Maximum Compliance
      const mailOptions = {
        from: cleanSender ? `"${cleanSender}" <${cleanEmail}>` : cleanEmail,
        to: toEmail,
        replyTo: cleanEmail,
        subject: subject || "Notification Update",
        text: plainTextContent, // Plain Text Fallback
        html: formattedHtml,    // Formatted Version
        headers: {
          'List-Unsubscribe': `<mailto:${cleanEmail}?subject=Unsubscribe>`,
          'Precedence': 'bulk'
        }
      };

      try {
        await transporter.sendMail(mailOptions);
        ok++;
        console.log(`[${i + 1}/${recipients.length}] ✅ Delivered to → ${toEmail}`);
      } catch (err) {
        fail++;
        console.error(`[${i + 1}/${recipients.length}] ❌ Failed for ${toEmail}:`, err.message);
      }

      // Variable Natural Delay between emails
      if (i < recipients.length - 1) {
        const delayTime = Math.floor(Math.random() * 3000) + 3000;
        console.log(`[Queue] Waiting ${(delayTime/1000).toFixed(1)}s before next mail...`);
        await getRandomDelay();
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
  console.log(`🚀 High-Deliverability Mailer active on http://localhost:${PORT}`);
});
