const nodemailer = require("nodemailer");
const os = require("os");
const https = require("https");
const config = require("./email-config");

const now = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });
const hostname = os.hostname();

function getProviderInfo(callback) {
  https.get("https://ipinfo.io/json", (res) => {
    let data = "";
    res.on("data", chunk => data += chunk);
    res.on("end", () => {
      const info = JSON.parse(data);
      callback(null, {
        ip: info.ip,
        org: info.org || "Unknown provider"
      });
    });
  }).on("error", (err) => {
    callback(err);
  });
}

getProviderInfo((err, info) => {
  const providerText = err
    ? "ספק: לא ידוע (שגיאה בשליפת IP)"
    : `IP חיצוני: ${info.ip}\nספק: ${info.org}`;

  const message = `
שרת סיים בהצלחה ✅

🕒 תאריך ושעה: ${now}
🖥️ שם שרת: ${hostname}
${providerText}
`;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "support@postify.co.il",
      pass: "mwib fxwi ncwc vwzd", // ← הסיסמה שלך כאן
    },
  });

  const mailOptions = {
    from: '"Postify Server" <support@postify.co.il>',
    to: config.to,
    subject: `השרת ${hostname} נסגר בהצלחה`,
    text: message,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.error("שגיאה בשליחת מייל:", error);
    }
    console.log("הודעת מייל נשלחה:", info.response);
  });
});
