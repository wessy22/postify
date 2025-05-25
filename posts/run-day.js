const { sendErrorMail, sendMail } = require("./mailer");

(async () => {
  try {
    const fs = require("fs");
    const path = require("path");
    const { spawn, exec } = require("child_process");
    const logToSheet = require("./log-to-sheets");
    const config = require("./config.json");

    const instanceName = fs.readFileSync("C:\\postify\\posts\\instance-name.txt", "utf-8").trim();
    const POSTS_FOLDER = `C:\\postify\\user data\\${instanceName}\\posts`;
    const LOG_FILE = path.join(__dirname, config.logFile);
    const STATE_FILE = path.join(__dirname, config.stateFile);
    const CURRENT_GROUP_NAME_FILE = path.join(__dirname, config.currentGroupFile);
    const day = new Date().getDay();

    function shouldStopByHour() {
      const israelTime = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
      const hour = new Date(israelTime).getHours();
      console.log("🕒 שעה לפי ישראל:", hour);
      return hour >= 23;
    }

    const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    const log = (text) => {
      const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).replace(" ", "T");
      const line = `[${timestamp}] ${text}`;
      console.log(text);
      logStream.write(line + "\n");
    };

    async function countdown(seconds) {
      for (let i = seconds; i > 0; i--) {
        process.stdout.write(`⏳ ${i}s remaining...\r`);
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log();
    }

    async function runPostFromIndex(index, groups, postFile, results) {
      if (index >= groups.length) {
        log("✅ כל הקבוצות פורסמו!");
        await logToSheet("Day finished", "Success", "", "כל הקבוצות פורסמו");

        if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);

        const reportLines = results.map(r => `${r.status} ${r.name} – ${r.time}`);
        const summary = reportLines.join("\n");

        try {
          await sendMail("📋 דוח יומי – פרסום בפייסבוק", summary);
          log("📧 דוח יומי נשלח.");
          fs.mkdirSync(config.reportsDir, { recursive: true });
          fs.writeFileSync(`${config.reportsDir}/report-${new Date().toISOString().slice(0,10)}.txt`, summary);
        } catch (e) {
          log("❌ שגיאה בשליחת הדוח: " + e.message);
          await sendErrorMail("❌ שגיאה בשליחת דוח יומי", e.message);
        }

        log("🕒 סיום פרסום – כיבוי בעוד 5 דקות...");

        setTimeout(() => {
          log("📝 מריץ log-cost.bat לפני כיבוי...");
          exec("start /b C:\\postify\\posts\\log-cost.bat", (error) => {
            if (error) {
              log("❌ שגיאה בהרצת log-cost.bat: " + error.message);
            } else {
              log("✅ log-cost.bat הורץ בהצלחה.");
            }

            setTimeout(() => {
              log("📧 שולח מייל סגירה...");
              exec("node C:\\postify\\posts\\send-shutdown-mail.js", (mailError) => {
                if (mailError) {
                  log("❌ שגיאה בשליחת מייל סגירה: " + mailError.message);
                } else {
                  log("✅ מייל סגירה נשלח בהצלחה.");
                }

                setTimeout(() => {
                  log("💤 כיבוי השרת עכשיו...");
                  exec("shutdown /s /f /t 0", (shutdownError) => {
                    if (shutdownError) {
                      log("❌ שגיאה בכיבוי: " + shutdownError.message);
                    }
                  });
                }, 30000);
              });
            }, 60000);
          });
        }, 4 * 60000);
        return;
      }

      if (shouldStopByHour()) {
        log("🌙 עצירה — השעה מאוחרת. ממשיך מחר.");
        await logToSheet("Day stopped", "Stopped", "", "השעה מאוחרת, ממשיך מחר");
        return;
      }

      const groupUrl = groups[index];
      log(`📢 posting to group(${index + 1}/${groups.length}): ${groupUrl}`);
      await logToSheet("Publishing to group", "Started", groupUrl, `קבוצה ${index + 1}/${groups.length}`);

      fs.writeFileSync(STATE_FILE, JSON.stringify({ file: postFile, index }), "utf-8");

      const child = spawn("node", ["post.js", groupUrl, postFile], { stdio: "inherit" });

      child.on("error", async (error) => {
        log(`❌ שגיאה בהרצת post.js: ${error.message}`);
        await sendErrorMail("❌ שגיאה בהרצת post.js", `שגיאה בפרסום לקבוצה ${groupUrl}: ${error.message}`);
      });

      child.on("exit", async (code) => {
        const now = new Date();
        const time = now.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
        const statusText = code === 0 ? "✅" : "❌";

        let groupName;
        try {
          groupName = fs.readFileSync(CURRENT_GROUP_NAME_FILE, "utf-8").trim();
        } catch (e) {
          groupName = groupUrl;
          await sendErrorMail("⚠️ שגיאה בקריאת שם הקבוצה", `לא ניתן לקרוא את שם הקבוצה: ${e.message}`);
        }

        log(`${statusText} ${groupName} – ${time}`);
        results.push({ name: groupName, status: statusText, time });

        try {
          await logToSheet("Publishing finished", code === 0 ? "Success" : "Failed", groupName, time);
        } catch (e) {
          log("⚠️ שגיאה ברישום לגוגל שיט: " + e.message);
          await sendErrorMail("⚠️ שגיאה ברישום לגוגל שיט", `לא ניתן לרשום את התוצאה לגוגל שיט: ${e.message}`);
        }

        function explainExitCode(code) {
          if (code === 0) return "בוצע בהצלחה.";
        
          const hex = "0x" + code.toString(16).toUpperCase();
        
          const map = {
            1: "בעיה כללית – ייתכן שהסקריפט סיים עם שגיאה.",
            3221225477: "שגיאת גישה לזיכרון (Access Violation) – ייתכן שקרס תהליך פנימי.",
            3221225781: "חסרה ספריה או מודול. ודא שכל הקבצים קיימים.",
            3221226505: "שגיאה קשה (Buffer Overrun / Stack Error) – כנראה קריסת Node או שגיאת סינטקס.",
          };
        
          const reason = map[code] || `שגיאה כללית או לא מזוהה (קוד: ${code}, hex: ${hex})`;
          return reason + ` (קוד: ${code}, hex: ${hex})`;
        }
          if (code !== 0) {
            const reason = explainExitCode(code);
            const msg = `❌ הפרסום לקבוצה ${groupName} נכשל.\n\n📄 סיבה אפשרית: ${reason}`;
            await sendErrorMail("❌ שגיאה בפרסום לקבוצה", msg);
          
        }
        
        const delaySec = config.minDelaySec + Math.floor(Math.random() * (config.maxDelaySec - config.minDelaySec + 1));
        const minutes = Math.floor(delaySec / 60);
        const seconds = delaySec % 60;
        log(`⏱ Waiting ${minutes} minutes and ${seconds} seconds before the next group...`);
        await countdown(delaySec);

        runPostFromIndex(index + 1, groups, postFile, results);
      });
    }

    async function main() {
      const args = process.argv.slice(2);
      const skipDelay = args.includes("--now");

      if (day === 6) {
        log("🛑 שבת — אין פרסום היום.");
        process.exit(0);
      }

      try {
        const now = new Date();
        const dateStr = now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
        const timeStr = now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });
        await sendMail(
          "הפרסום היומי שלך התחיל ✨",
          `בוקר טוב 😊\n\nהפרסום שלך בקבוצות פייסבוק התחיל\n\nתאריך פרסום: ${dateStr}\n\nשעת התחלה: ${timeStr}\n\nשיהיה לכם יום נפלא!\n\nPostify`,
          `<div dir="rtl" style="text-align:right;font-family:Arial,sans-serif;">
            בוקר טוב 😊<br><br>
            הפרסום שלך בקבוצות פייסבוק התחיל<br><br>
            <b>תאריך פרסום:</b> ${dateStr}<br>
            <b>שעת התחלה:</b> ${timeStr}<br><br>
            שיהיה לכם יום נפלא!<br>
            <b>Postify</b>
          </div>`
        );
        log("📧 נשלח מייל ללקוח על תחילת הפרסום.");
      } catch (e) {
        log("❌ שגיאה בשליחת מייל תחילת פרסום: " + e.message);
        await sendErrorMail("❌ שגיאה בשליחת מייל תחילת פרסום", e.message);
      }

      const allFiles = fs.readdirSync(POSTS_FOLDER);
      const postFiles = allFiles.filter(f => /^post\d+\.json$/.test(f));
      const postCount = postFiles.length;

      if (postCount === 0) {
        log("❌ לא נמצאו קבצי postX.json בתיקייה.");
        await sendErrorMail("❌ לא נמצאו פוסטים", "לא נמצא אף פוסט מסוג postX.json בתיקייה.");
        process.exit(1);
      }


// בדיקה אם יש שימוש ב־--file <filename>
const fileArgIndex = args.indexOf("--file");
let postFile;

if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
  postFile = args[fileArgIndex + 1];
  log(`📂 הופעל עם קובץ מותאם: ${postFile}`);
} else {
  const postIndex = (day % postFiles.length) + 1;
  postFile = `post${postIndex}.json`;
  log(`📅 היום יום ${["ראשון","שני","שלישי","רביעי","חמישי","שישי"][day]} — נבחר: ${postFile}`);
}


const postPath = path.join(POSTS_FOLDER, postFile); // ← קודם נגדיר את הנתיב
await logToSheet("Day started", "Info", "", `פוסט נבחר: ${postFile}`);

const postData = JSON.parse(fs.readFileSync(postPath, "utf-8")); // ← ורק אז נקרא אותו
const groups = postData.groups;

      const results = [];

      let startIndex = 0;
      if (fs.existsSync(STATE_FILE)) {
        try {
          const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
          if (state.file === postFile && state.index < groups.length) {
            startIndex = state.index;
            log(`🔁Continuing from the last group ${startIndex + 1}/${groups.length}`);
          }
        } catch (e) {
          log("⚠️ לא ניתן לקרוא את קובץ ה־state. מתחיל מההתחלה.");
          await sendErrorMail("⚠️ שגיאה בקריאת קובץ state", `לא ניתן לקרוא את קובץ ה־state: ${e.message}`);
        }
      }

      const initialDelay = skipDelay ? 0 : Math.floor(Math.random() * config.initialDelayMaxSec);

if (!skipDelay) {
  const delayMin = Math.floor(initialDelay / 60);
  const delaySec = initialDelay % 60;
  log(`⏳ Starting random delay of ${delayMin} minutes and ${delaySec} seconds...`);
  await countdown(initialDelay);
} else {
  log("⏩ מופעל עם --now – מדלג על ההשהיה הראשונית");
}

      await runPostFromIndex(startIndex, groups, postFile, results);
    }

    await main();
  } catch (err) {
    console.error("❌ שגיאה באוטומציה:", err);

    const message = [
      `🛑 התרחשה שגיאה בסקריפט: ${__filename}`,
      "",
      `❗ שגיאה: ${err.message}`,
      "",
      err.stack,
    ].join("\n");

    await sendErrorMail("❌ שגיאה באוטומציה", message);
    process.exit(1);
  }
})();
