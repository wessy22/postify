// טוען את המודולים הנדרשים
const fs = require("fs");
const path = require("path");
const { spawn, exec } = require("child_process");
const { sendMail, sendErrorMail } = require("./mailer");
const logToSheet = require("./log-to-sheets"); // טעינת לוג לגוגל שיט
const config = require("./config.json");

// מגדיר את נתיב תיקיית הפוסטים
const POSTS_FOLDER = path.join(__dirname);
// מגדיר את נתיב קובץ הלוג
const LOG_FILE = path.join(__dirname, config.logFile);
// מגדיר את נתיב קובץ הסטייט
const STATE_FILE = path.join(__dirname, config.stateFile);
// מגדיר את נתיב קובץ הקבוצה הנוכחית
const CURRENT_GROUP_NAME_FILE = path.join(__dirname, config.currentGroupFile);
// מגדיר את היום של השבוע
const day = new Date().getDay();

// פונקציה המחזירה אמת אם השעה גדולה או שווה לשעה של כיבוי
function shouldStopByHour() {
  const hour = new Date().getHours();
  return hour >= config.shutdownHour;
}

const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
const log = (text) => {
  const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).replace(" ", "T");
  const line = `[${timestamp}] ${text}`;
  console.log(text);
  logStream.write(line + "\n");
};

if (day === 6) {
  log("🛑 שבת — אין פרסום היום.");
  process.exit(0);
}

const allFiles = fs.readdirSync(POSTS_FOLDER);
const postFiles = allFiles.filter(f => /^post\d+\.json$/.test(f));
const postCount = postFiles.length;

if (postCount === 0) {
  log("❌ לא נמצאו קבצי postX.json בתיקייה.");
  sendErrorMail("❌ לא נמצאו פוסטים", "לא נמצא אף פוסט מסוג postX.json בתיקייה.");
  process.exit(1);
}

const postIndex = (day % postCount) + 1;
const postFile = `post${postIndex}.json`;
const postPath = path.join(POSTS_FOLDER, postFile);

log(`📅 היום יום ${["ראשון","שני","שלישי","רביעי","חמישי","שישי"][day]} — נבחר: ${postFile}`);
logToSheet("Day started", "Info", "", `פוסט נבחר: ${postFile}`);

const postData = JSON.parse(fs.readFileSync(postPath, "utf-8"));
const groups = postData.groups;

const results = [];

let startIndex = 0;
if (fs.existsSync(STATE_FILE)) {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    if (state.file === postFile && state.index < groups.length) {
      startIndex = state.index;
      log(`🔁 ממשיך מהריצה הקודמת: קבוצה ${startIndex + 1}/${groups.length}`);
    }
  } catch (e) {
    log("⚠️ לא ניתן לקרוא את קובץ ה־state. מתחיל מההתחלה.");
    await sendErrorMail("⚠️ שגיאה בקריאת קובץ state", `לא ניתן לקרוא את קובץ ה־state: ${e.message}`);
  }
}

const countdown = async (seconds) => {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`⏳ ${i}s remaining...\r`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log();
};

async function runPostFromIndex(index) {
  if (index >= groups.length) {
    log("✅ כל הקבוצות פורסמו!");
    logToSheet("Day finished", "Success", "", "כל הקבוצות פורסמו");

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
            }, 30 * 1000); // 30 שניות לאחר שליחת המייל
          });
        }, 60 * 1000); // דקה לאחר ההרצה של log-cost
      });
    
    }, 4 * 60 * 1000); // תזמון ל־4 דקות, כדי להריץ את BAT בדקה ה־5    

    return;

  }

  if (shouldStopByHour()) {
    log("🌙 עצירה — השעה מאוחרת. ממשיך מחר.");
    logToSheet("Day stopped", "Stopped", "", "השעה מאוחרת, ממשיך מחר");
    return;
  }

  const groupUrl = groups[index];
  log(`📢 posting to group(${index + 1}/${groups.length}): ${groupUrl}`);
  logToSheet("Publishing to group", "Started", groupUrl, `קבוצה ${index + 1}/${groups.length}`);

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

    if (code !== 0) {
      await sendErrorMail("❌ שגיאה בפרסום לקבוצה", `הפרסום לקבוצה ${groupName} נכשל עם קוד ${code}`);
    }

    const delaySec = config.minDelaySec + Math.floor(Math.random() * (config.maxDelaySec - config.minDelaySec + 1));
    const minutes = Math.floor(delaySec / 60);
    const seconds = delaySec % 60;
    log(`⏱ Waiting ${minutes} minutes and ${seconds} seconds before the next group...`);
    await countdown(delaySec);

    runPostFromIndex(index + 1);
  });
}

// פונקציה ראשית שמבצעת השהיה רנדומלית לפני תחילת הפרסום
(async () => {
  const initialDelay = Math.floor(Math.random() * config.initialDelayMaxSec);
  const delayMin = Math.floor(initialDelay / 60);
  const delaySec = initialDelay % 60;

  log(`⏳ Starting random delay of ${delayMin} minutes and ${delaySec} seconds...`);
  await countdown(initialDelay);

  runPostFromIndex(startIndex);
})();

