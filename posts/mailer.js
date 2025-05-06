const nodemailer = require("nodemailer");
const config = require("./email-config");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.user,
    pass: config.pass,
  },
});

const sendMail = (subject, text) => {
  return transporter.sendMail({
    from: `"Postify" <${config.user}>`,
    to: config.to,
    subject,
    text,
  });
};

const sendErrorMail = (subject, text) => {
  return transporter.sendMail({
    from: `"postify Error" <${config.user}>`,
    to: config.errorTo,
    subject,
    text,
  });
};

module.exports = { sendMail, sendErrorMail };
