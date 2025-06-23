const { sendErrorMail, sendMail } = require("./mailer");

(async () => {
  try {
    const fs = require("fs");
    const path = require("path");
    const { spawn, exec } = require("child_process");
    const logToSheet = require("./log-to-sheets");
    const config = require("./config.json");

    let instanceName;
    try {
      instanceName = fs.readFileSync("C:\\postify\\posts\\instance-name.txt", "utf-8").trim();
    } catch (e) {
      console.error("❌ שגיאה בקריאת instance-name.txt:", e.message);
      process.exit(1);
    }
    const POSTS_FOLDER = `C:\\postify\\user data\\${instanceName}\\posts`;
    const LOG_FILE = path.join(__dirname, config.logFile);

    const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    const log = (text) => {
      const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).replace(" ", "T");
      const line = `[${timestamp}] ${text}`;
      console.log(text);
      logStream.write(line + "\n");
    };

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

    function shouldStopByHour() {
      const israelTime = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
      const hour = new Date(israelTime).getHours();
      console.log("🕒 Time in Israel :", hour);
      return hour >= 23;
    }

    async function countdown(seconds) {
      for (let i = seconds; i > 0; i--) {
        process.stdout.write(`⏳ ${i}s remaining...\r`);
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log();
    }

    async function runPostToGroup(groupUrl, postFile, groupIndex, groups, results) {
      log(`📢 posting to group(${groupIndex + 1}/${groups.length}): ${groupUrl}`);
      await logToSheet("Publishing to group", "Started", groupUrl, `Group ${groupIndex + 1}/${groups.length}`);

      const child = spawn("node", ["post.js", groupUrl, postFile], { stdio: "inherit" });

      // קובע timeout לקבוצה (למשל 13 דקות)
      const TIMEOUT = 13 * 60 * 1000;
      let timeoutId = setTimeout(() => {
        log(`⏰ Timeout! post.js לקח יותר מ־13 דקות. סוגר תהליך וממשיך...`);
        child.kill("SIGKILL");
        sendErrorMail("⏰ Timeout - קבוצה נתקעה", `הקבוצה ${groupUrl} נתקעה ליותר מ־13 דקות ונעצרה אוטומטית.`);
      }, TIMEOUT);

      return new Promise((resolve) => {
        child.on("error", async (error) => {
          clearTimeout(timeoutId);
          log(`❌ שגיאה בהרצת post.js: ${error.message}`);
          await sendErrorMail("❌ שגיאה בהרצת post.js", `שגיאה בפרסום לקבוצה ${groupUrl}: ${error.message}`);
          resolve(false);
        });

        child.on("exit", async (code) => {
          clearTimeout(timeoutId);
          const now = new Date();
          const time = now.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
          const statusText = code === 0 ? "✅" : "❌";

          let groupName;
          try {
            groupName = fs.readFileSync("C:\\postify\\posts\\current-group.txt", "utf-8").trim();
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

          if (code !== 0) {
            const reason = code === 0 ? "בוצע בהצלחה." : `שגיאה כללית או לא מזוהה (קוד: ${code})`;
            const msg = `❌ הפרסום לקבוצה ${groupName} נכשל.\n\n📄 סיבה אפשרית: ${reason}`;
            await sendErrorMail("❌ שגיאה בפרסום לקבוצה", msg);
          }
          resolve(true);
        });
      });
    }

    async function main() {
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

      let allFiles;
      try {
        allFiles = fs.readdirSync(POSTS_FOLDER);
      } catch (e) {
        log("❌ שגיאה בקריאת תיקיית הפוסטים: " + e.message);
        await sendErrorMail("❌ שגיאה בקריאת תיקיית הפוסטים", e.message);
        process.exit(1);
      }
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

      // לולאה על כל קבצי הפוסטים
      for (const postFileObj of postFiles) {
        const postFile = postFileObj.name;
        let postData;
        try {
          postData = JSON.parse(fs.readFileSync(path.join(POSTS_FOLDER, postFile), "utf-8"));
        } catch (e) {
          log("❌ שגיאה בקריאת קובץ הפוסט: " + e.message);
          await sendErrorMail("❌ שגיאה בקריאת קובץ הפוסט", e.message);
          continue;
        }
        const groups = postData.groups;
        const results = [];
        log(`🚩 מתחיל פוסט: ${postFile} (${groups.length} קבוצות)`);

        for (let i = 0; i < groups.length; i++) {
          if (shouldStopByHour()) {
            log("🌙 עצירה — השעה מאוחרת. ממשיך מחר.");
            await logToSheet("Day stopped", "Stopped", "", "השעה מאוחרת, ממשיך מחר");
            return;
          }
          await runPostToGroup(groups[i], postFile, i, groups, results);

          // דיליי רנדומלי בין 0 ל-5 דקות (0-300 שניות), רק אם יש עוד קבוצה
          if (i < groups.length - 1) {
            const delaySec = Math.floor(Math.random() * 301);
            const minutes = Math.floor(delaySec / 60);
            const seconds = delaySec % 60;
            log(`⏱ Waiting ${minutes} minutes and ${seconds} seconds before the next group...`);
            await countdown(delaySec);
          }
        }
        log(`✅ סיום פוסט: ${postFile}`);
      }
      log("🎉 כל הפוסטים פורסמו!");
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
