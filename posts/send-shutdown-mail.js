const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const https = require("https");
const config = require("./email-config");

// תאריך ושעה נוכחיים
const now = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

// שליפת שם השרת מתוך הקובץ
let hostname = "unknown-server";
try {
  hostname = fs.readFileSync(path.join(__dirname, "instance-name.txt"), "utf-8").trim();
} catch (e) {
  console.error("⚠️ לא נמצא קובץ instance-name.txt, משתמש בשם ברירת מחדל");
}

function getProviderInfo(callback) {
  const timeout = setTimeout(() => {
    callback(new Error("Timeout after 5 seconds"));
  }, 5000);

  const req = https.get("https://ipinfo.io/json", (res) => {
    clearTimeout(timeout);
    let data = "";
    res.on("data", chunk => data += chunk);
    res.on("end", () => {
      try {
        const info = JSON.parse(data);
        callback(null, {
          ip: info.ip,
          org: info.org || "Unknown provider"
        });
      } catch (e) {
        callback(e);
      }
    });
  }).on("error", (err) => {
    clearTimeout(timeout);
    callback(err);
  });

  req.setTimeout(5000, () => {
    req.destroy();
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
      pass: "mwib fxwi ncwc vwzd",
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
      return console.error("❌ שגיאה בשליחת מייל:", error);
    }
    console.log("📧 הודעת מייל נשלחה:", info.response);
  });
});
