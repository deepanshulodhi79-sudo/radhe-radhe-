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
