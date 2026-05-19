// server.js

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const path = require('path');
const validator = require('validator');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

const app = express();

const PORT = process.env.PORT || 8080;

// ================= LOGIN CONFIG =================

const ADMIN_USERNAME =
  process.env.ADMIN_USERNAME || 'admin';

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || 'admin123';

// ================= GLOBAL STATE =================

let mailLimits = {};

const sessionStore =
  new session.MemoryStore();

// ================= MULTER =================

const upload = multer({
  storage: multer.memoryStorage()
});

// ================= MIDDLEWARE =================

app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(bodyParser.json());

app.use(express.static(
  path.join(__dirname, 'public')
));

// Rate limit
app.use(rateLimit({

  windowMs: 15 * 60 * 1000,

  max: 100,

  message: {
    success: false,
    message: "Too many requests"
  }

}));

// Session
app.use(session({

  secret:
    process.env.SESSION_SECRET ||
    'super_secret_key',

  resave: false,

  saveUninitialized: false,

  store: sessionStore,

  cookie: {

    maxAge:
      60 * 60 * 1000,

    httpOnly: true,

    secure: false

  }

}));

// ================= HELPERS =================

function delay(ms) {

  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );

}

// Sequential sending
async function sendSequential(
  transporter,
  mails
) {

  for (const mail of mails) {

    await transporter.sendMail(mail);

    console.log(
      `✅ Sent to ${mail.to}`
    );

    // Human-like delay
    const randomDelay =
      Math.floor(
        Math.random() * 4000
      ) + 3000;

    await delay(randomDelay);

  }

}

// ================= AUTH =================

function requireAuth(
  req,
  res,
  next
) {

  if (req.session.user) {
    return next();
  }

  return res.redirect('/');

}

// ================= ROUTES =================

// Login page
app.get('/', (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      'public',
      'login.html'
    )
  );

});

// Login
app.post('/login', (req, res) => {

  const {
    username,
    password
  } = req.body;

  if (
    username === ADMIN_USERNAME &&
    password === ADMIN_PASSWORD
  ) {

    req.session.user = username;

    return res.json({
      success: true
    });

  }

  return res.json({
    success: false,
    message: "Invalid credentials"
  });

});

// Launcher page
app.get(
  '/launcher',
  requireAuth,
  (req, res) => {

    res.sendFile(
      path.join(
        __dirname,
        'public',
        'launcher.html'
      )
    );

  }
);

// Logout
app.post('/logout', (req, res) => {

  req.session.destroy(() => {

    res.clearCookie('connect.sid');

    return res.json({

      success: true,

      message: "Logged out"

    });

  });

});

// ================= SEND MAIL =================

app.post(
  '/send',
  requireAuth,
  upload.array('images'),
  async (req, res) => {

    try {

      console.log(req.body);

      const {

        senderName,

        email,

        password,

        recipients,

        subject,

        message

      } = req.body;

      // ================= VALIDATION =================

      if (
        !email ||
        !password ||
        !recipients
      ) {

        return res.json({

          success: false,

          message:
            "Email, password and recipients required"

        });

      }

      // Email validation
      if (!validator.isEmail(email)) {

        return res.json({

          success: false,

          message:
            "Invalid Gmail address"

        });

      }

      // Parse recipients
      const recipientList = recipients
        .split(/[\n,]+/)
        .map(r => r.trim())
        .filter(r =>
          validator.isEmail(r)
        );

      if (recipientList.length === 0) {

        return res.json({

          success: false,

          message:
            "No valid recipients found"

        });

      }

      // ================= RATE LIMIT =================

      const now = Date.now();

      if (

        !mailLimits[email] ||

        now -
        mailLimits[email].startTime >

        60 * 60 * 1000

      ) {

        mailLimits[email] = {

          count: 0,

          startTime: now

        };

      }

      const MAX_PER_HOUR = 20;

      if (

        mailLimits[email].count +
        recipientList.length >

        MAX_PER_HOUR

      ) {

        return res.json({

          success: false,

          message:
            `Hourly limit exceeded`

        });

      }

      // ================= SMTP =================

      const transporter =
        nodemailer.createTransport({

          host: "smtp.gmail.com",

          port: 465,

          secure: true,

          auth: {

            user: email,

            pass: password

          }

        });

      // Verify Gmail login
      await transporter.verify();

      // ================= ATTACHMENTS =================

      const attachments = [];

      if (req.files && req.files.length > 0) {

        req.files.forEach(file => {

          attachments.push({

            filename: file.originalname,

            content: file.buffer

          });

        });

      }

      // ================= CREATE MAILS =================

      const mails =
        recipientList.map(recipient => ({

          from:
            `"${senderName || 'Support'}" <${email}>`,

          to: recipient,

          subject:
            subject || "Quick Question",

          text:
            message || "",

          html: `
          <div style="
            font-family:Arial,sans-serif;
            font-size:15px;
            line-height:1.7;
            color:#222;
          ">

            ${message || ""}

          </div>
          `,

          attachments

        }));

      // ================= SEND =================

      await sendSequential(
        transporter,
        mails
      );

      mailLimits[email].count +=
        recipientList.length;

      return res.json({

        success: true,

        message:
          `✅ Sent ${recipientList.length} email(s)`

      });

    } catch (err) {

      console.error(err);

      return res.json({

        success: false,

        message: err.message

      });

    }

  }
);

// ================= START SERVER =================

app.listen(PORT, () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});
