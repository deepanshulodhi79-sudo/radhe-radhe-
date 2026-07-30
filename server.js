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

// 📩 Matching API Endpoint with Frontend (/api/send-email)
app.post('/api/send-email', async (req, res) => {
  try {
    const { senderName, gmailId, appPassword, subject, messageBody, to } = req.body;

    // Validation Check
    if (!gmailId || !appPassword || !to) {
      return res.status(400).json({ 
        success: false, 
        message: "Gmail ID, App Password aur Recipient zaroori hain!" 
      });
    }

    const cleanEmail = gmailId.trim();
    // App password se saari extra spaces hatana
    const cleanPassword = appPassword.replace(/\s+/g, '');
    const cleanSender = senderName ? senderName.trim() : 'Sender';

    // Fast Gmail Transporter Setup
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: cleanEmail,
        pass: cleanPassword
      }
    });

    const textContent = messageBody || "";

    // Dynamic Anti-Spam Message-ID Header
    const uniqueHash = Math.random().toString(36).substring(2, 9);
    const dynamicMsgId = `<${Date.now()}.${uniqueHash}@gmail.com>`;

    const mailOptions = {
      from: `"${cleanSender}" <${cleanEmail}>`,
      to: to.trim(),
      subject: subject || "Update",
      text: textContent,
      // Simple Arial Font Body
      html: `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #111111; line-height: 1.5;">${textContent.replace(/\n/g, '<br>')}</div>`,
      headers: {
        'Message-ID': dynamicMsgId,
        'X-Priority': '3',
        'X-Mailer': 'FastMailer App'
      }
    };

    // Send Single Email
    await transporter.sendMail(mailOptions);
    console.log(`[Success] Email delivered to → ${to}`);

    return res.json({
      success: true,
      message: "Delivered successfully"
    });

  } catch (err) {
    console.error(`[Error] Failed for ${req.body.to}:`, err.message);
    
    // Detailed Error Response for Frontend
    return res.status(500).json({ 
      success: false, 
      message: err.message || "Failed to send email" 
    });
  }
});

// Logout endpoint for UI
app.post('/logout', (req, res) => {
  res.json({ success: true, message: "Logged out" });
});

app.listen(PORT, () => {
  console.log(`🚀 FastMailer Server running on http://localhost:${PORT}`);
});
