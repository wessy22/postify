const fs = require("fs");
const path = require("path");
const { sendErrorMail } = require("./mailer");

const LOG_FILE = path.join(__dirname, "log.txt");
const STATE_FILE = path.join(__dirname, "state.json");

function wasFileUpdatedRecently(filePath, maxMinutesAgo = 60) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  const now = new Date();
  const diffMs = now - stats.mtime;
  const diffMinutes = diffMs / 1000 / 60;
  return diffMinutes <= maxMinutesAgo;
}

(async () => {
  console.log("🕵️ Checking if run-day.js started...");

  const logRecent = wasFileUpdatedRecently(LOG_FILE, 60);
  const stateExists = fs.existsSync(STATE_FILE);

  if (logRecent || stateExists) {
    console.log("✅ run-day.js seems to be running or already ran.");
  } else {
    console.error("❌ run-day.js not detected. Sending alert...");
    await sendErrorMail(
      "🚨 Postify לא התחיל לרוץ",
      "השרת עלה, אך הסקריפט run-day.js לא התחיל תוך שעה. ייתכן שיש בעיה באתחול או שגיאת קוד.\n\nיש לבדוק את המערכת בדחיפות."
    );
  }
})();
