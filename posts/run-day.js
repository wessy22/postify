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
    const day = new Date().getDay();
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // חגי ישראל + ימי זיכרון 2024-2035
    const jewishHolidaysAndMemorials = [
      // 2024
      "2024-04-22","2024-04-23","2024-04-28","2024-05-06","2024-05-13","2024-06-12","2024-10-02","2024-10-03","2024-10-11","2024-10-16","2024-10-23",
      // 2025
      "2025-04-13","2025-04-14","2025-04-19","2025-04-24","2025-05-01","2025-06-02","2025-10-03","2025-10-04","2025-10-12","2025-10-17","2025-10-24",
      // 2026
      "2026-04-02","2026-04-03","2026-04-08","2026-04-14","2026-04-21","2026-05-22","2026-09-22","2026-09-23","2026-10-01","2026-10-06","2026-10-13",
      // 2027
      "2027-03-22","2027-03-23","2027-03-28","2027-04-30","2027-05-06","2027-05-11","2027-09-11","2027-09-12","2027-09-20","2027-09-25","2027-10-02",
      // 2028
      "2028-04-10","2028-04-11","2028-04-16","2028-04-19","2028-04-26","2028-06-01","2028-09-30","2028-10-01","2028-10-09","2028-10-14","2028-10-21",
      // 2029
      "2029-03-30","2029-03-31","2029-04-05","2029-04-12","2029-04-18","2029-05-21","2029-09-19","2029-09-20","2029-09-28","2029-10-03","2029-10-10",
      // 2030
      "2030-04-18","2030-04-19","2030-04-24","2030-05-02","2030-05-08","2030-06-10","2030-10-08","2030-10-09","2030-10-17","2030-10-22","2030-10-29",
      // 2031
      "2031-04-07","2031-04-08","2031-04-13","2031-04-23","2031-04-29","2031-05-30","2031-09-27","2031-09-28","2031-10-06","2031-10-11","2031-10-18",
      // 2032
      "2032-03-26","2032-03-27","2032-04-01","2032-04-19","2032-04-25","2032-05-18","2032-09-15","2032-09-16","2032-09-24","2032-09-29","2032-10-06",
      // 2033
      "2033-04-14","2033-04-15","2033-04-20","2033-04-28","2033-05-04","2033-06-07","2033-10-04","2033-10-05","2033-10-13","2033-10-18","2033-10-25",
      // 2034
      "2034-04-04","2034-04-05","2034-04-10","2034-04-17","2034-04-23","2034-05-28","2034-09-24","2034-09-25","2034-10-03","2034-10-08","2034-10-15",
      // 2035
      "2035-03-24","2035-03-25","2035-03-30","2035-04-09","2035-04-15","2035-05-17","2035-09-13","2035-09-14","2035-09-22","2035-09-27","2035-10-04"
    ];

    // בדיקה אם היום שבת, חג או יום זיכרון
    if (day === 6 || jewishHolidaysAndMemorials.includes(todayStr)) {
      log("🛑 שבת, חג או יום זיכרון — אין פרסום היום.");
      process.exit(0);
    }

    const STATE_POST_FILE = path.join(__dirname, "state-post.json"); // ← שם חדש
    const CURRENT_GROUP_NAME_FILE = path.join(__dirname, config.currentGroupFile);

    function shouldStopByHour() {
      const israelTime = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
      const hour = new Date(israelTime).getHours();
      console.log("🕒 Time in Israel :", hour);
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

        if (fs.existsSync(STATE_POST_FILE)) fs.unlinkSync(STATE_POST_FILE);

        /*
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
        */

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

      fs.writeFileSync(STATE_POST_FILE, JSON.stringify({ file: postFile, index }), "utf-8");

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
        log("📧 Email sent - advertising started");
      } catch (e) {
        log("❌ שגיאה בשליחת מייל תחילת פרסום: " + e.message);
        await sendErrorMail("❌ שגיאה בשליחת מייל תחילת פרסום", e.message);
      }

      // --- לוגיקה חדשה: מעבר לפי קבצים קיימים בלבד ---
      const allFiles = fs.readdirSync(POSTS_FOLDER);
      const postFiles = allFiles
        .filter(f => /^post\d+\.json$/.test(f))
        .map(f => ({
          name: f,
          num: parseInt(f.match(/^post(\d+)\.json$/)[1], 10)
        }))
        .sort((a, b) => a.num - b.num);

      if (postFiles.length === 0) {
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
        // קרא את ה־state כדי לדעת איזה פוסט היה האחרון
        let lastPostNum = null;
        if (fs.existsSync(STATE_POST_FILE)) {
          try {
            const state = JSON.parse(fs.readFileSync(STATE_POST_FILE, "utf-8"));
            const match = state.file && state.file.match(/^post(\d+)\.json$/);
            if (match) lastPostNum = parseInt(match[1], 10);
          } catch (e) {
            log("⚠️ לא ניתן לקרוא את קובץ ה־state-post. מתחיל מההתחלה.");
            await sendErrorMail("⚠️ שגיאה בקריאת קובץ state-post", `לא ניתן לקרוא את קובץ ה־state-post: ${e.message}`);
          }
        }
        // מצא את הפוסט הבא ברשימה
        let nextPost;
        if (lastPostNum === null) {
          nextPost = postFiles[0];
        } else {
          nextPost = postFiles.find(f => f.num > lastPostNum);
          if (!nextPost) {
            // אם רוצים לחזור להתחלה:
            nextPost = postFiles[0];
            // אם לא רוצים – אפשר לעצור כאן:
            // log("🛑 כל הפוסטים פורסמו. אין פוסט נוסף.");
            // process.exit(0);
          }
        }
        postFile = nextPost.name;
        log(`📅 Today is: ${postFile}`);
      }

      const postPath = path.join(POSTS_FOLDER, postFile);
      await logToSheet("Day started", "Info", "", `פוסט נבחר: ${postFile}`);

      const postData = JSON.parse(fs.readFileSync(postPath, "utf-8"));
      const groups = postData.groups;

      const results = [];

      let startIndex = 0;
      if (fs.existsSync(STATE_POST_FILE)) {
        try {
          const state = JSON.parse(fs.readFileSync(STATE_POST_FILE, "utf-8"));
          if (state.file === postFile && state.index < groups.length) {
            startIndex = state.index;
            log(`🔁Continuing from the last group ${startIndex + 1}/${groups.length}`);
          }
        } catch (e) {
          log("⚠️ לא ניתן לקרוא את קובץ ה־state-post. מתחיל מההתחלה.");
          await sendErrorMail("⚠️ שגיאה בקריאת קובץ state-post", `לא ניתן לקרוא את קובץ ה־state-post: ${e.message}`);
        }
      }

      const initialDelay = skipDelay ? 0 : Math.floor(Math.random() * config.initialDelayMaxSec);

      if (!skipDelay) {
        const delayMin = Math.floor(initialDelay / 60);
        const delaySec = initialDelay % 60;
        log(`⏳ Starting random delay of ${delayMin} minutes and ${delaySec} seconds...`);
        await countdown(initialDelay);
      } else {
        log("⏩ Enabled with --now – skips the initial delay");
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
