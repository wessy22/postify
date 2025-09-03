const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require("./email-config");

// דגל זמני להשבתת מיילים (בגלל מגבלת Gmail)
const DISABLE_EMAILS = false; // שנה ל-false כדי להפעיל מחדש

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.user,
    pass: config.pass,
  },
});

const sendMail = (subject, text, html) => {
  if (DISABLE_EMAILS) {
    console.log("📧 מייל הושבת זמנית:", subject);
    return Promise.resolve();
  }
  return transporter.sendMail({
    from: `"Postify" <${config.user}>`,
    to: config.to,
    subject,
    text,
    html,
  });
};

const sendErrorMail = (subject, text) => {
  if (DISABLE_EMAILS) {
    console.log("📧 מייל שגיאה הושבת זמנית:", subject);
    return Promise.resolve();
  }
  
  let hostname;
  try {
    hostname = fs.readFileSync(path.join(__dirname, "instance-name.txt"), "utf-8").trim();
  } catch {
    hostname = os.hostname(); // fallback
  }

  return transporter.sendMail({
    from: `"postify Error" <${config.user}>`,
    to: config.errorTo,
    subject: `❌ שגיאה משרת ${hostname} | ${subject}`,
    text,
  });
};

module.exports = { sendMail, sendErrorMail };
