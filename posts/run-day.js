const fs = require('fs');
const { sendErrorMail, sendMail } = require("./mailer");

// ================================================================
// RUNDAY - מערכת תזמון פוסטים משודרגת עם מניעת כפילויות תאריכים
// ================================================================
// השדרוגים החדשים:
// 1. מניעת כפילויות תאריכים בין כל סוגי הפוסטים (שבועי, חודשי, חד-פעמי)
// 2. תמיכה במבנה פוסטים ישן וחדש (נורמליזציה של תאריכים)
// 3. וולידציה אוטומטית בעת טעינת פוסטים והעברה לstatus paused במקרה של כפילות
// 4. בדיקות מדויקות של התנגשות תאריכים לפי סוג התזמון
// 5. לוגים מפורטים לאיתור בעיות ומעקב אחרי בחירת פוסטים
// ================================================================

// === פונקציות למניעת כפילויות תאריכים (לוגיקה חדשה) ===

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  
  // אם כבר בפורמט YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // אם בפורמט d/m/Y
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (y && m && d) {
      return `${y.padStart(4,'0')}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
  }
  
  return null;
}

// פונקציה מדויקת לבדיקת התנגשות תאריכים
function isDateConflicted(targetDate, allPosts, excludePostId, currentScheduleType) {
  console.log('🔍 בודק התנגשות עבור תאריך:', targetDate, 'פוסט נוכחי:', excludePostId, 'סוג:', currentScheduleType);
  
  const normalizedTarget = normalizeDate(targetDate);
  if (!normalizedTarget) {
    console.log('❌ תאריך לא תקין');
    return false;
  }
  
  const targetDateObj = new Date(normalizedTarget);
  const targetDay = targetDateObj.getDay(); // יום בשבוע (0-6)
  const targetDayOfMonth = targetDateObj.getDate(); // יום בחודש (1-31)
  
  console.log('📅 מנותח תאריך:', normalizedTarget, 'יום בשבוע:', targetDay, 'יום בחודש:', targetDayOfMonth);
  
  // בדיקה מול כל הפוסטים הקיימים
  for (const post of allPosts) {
    if ((post.id && post.id == excludePostId) || (post.filename && post.filename === excludePostId) || post.status !== 'scheduled') {
      continue; // דלג על הפוסט הנוכחי או לא מתוזמנים
    }
    
    console.log(`🔍 בודק פוסט ${post.id || post.filename} (${post.schedule_type}):`, post.title || 'ללא שם');
    
    // בדיקה מול פוסט חד-פעמי
    if (post.schedule_type === 'one-time' && post.one_time_date) {
      const postDate = normalizeDate(post.one_time_date);
      if (postDate === normalizedTarget) {
        console.log(`⚠️ התנגשות עם פוסט חד-פעמי ${post.id || post.filename} בתאריך ${postDate}`);
        return true;
      }
    }
    
    // בדיקה מול פוסט חודשי
    if (post.schedule_type === 'monthly' && post.monthly_date) {
      const postDate = normalizeDate(post.monthly_date);
      if (postDate) {
        const postDayOfMonth = new Date(postDate).getDate();
        
        // התנגשות אם זה אותו יום בחודש
        if (postDayOfMonth === targetDayOfMonth) {
          console.log(`⚠️ התנגשות עם פוסט חודשי ${post.id || post.filename} - יום ${postDayOfMonth} בחודש`);
          return true;
        }
      }
    }
    
    // בדיקה מול פוסט שבועי
    if (post.schedule_type === 'weekly' && post.days_of_week) {
      const daysOfWeek = post.days_of_week.split(',').filter(Boolean).map(d => parseInt(d));
      
      // בדוק אם התאריך נופל באחד מהימים השבועיים
      if (daysOfWeek.includes(targetDay)) {
        // בדוק אם התאריך נמצא בטווח התזמון השבועי
        const currentDate = new Date();
        const startDate = post.start_date ? new Date(normalizeDate(post.start_date)) : currentDate;
        const endDate = post.end_date ? new Date(normalizeDate(post.end_date)) : new Date(currentDate.getTime() + 365 * 24 * 60 * 60 * 1000);
        
        if (targetDateObj >= startDate && targetDateObj <= endDate) {
          console.log(`⚠️ התנגשות עם פוסט שבועי ${post.id || post.filename} - יום ${targetDay} בשבוע`);
          return true;
        }
      }
    }
  }
  
  console.log('✅ אין התנגשות - תאריך זמין');
  return false;
}

// פונקציה לבדיקה אם פוסט מתוזמן להיום (עם תמיכה במבנה ישן וחדש)
function isScheduledPost(post, today = new Date()) {
  if (post.status !== "scheduled") return false;
  
  const todayStr = today.toISOString().slice(0, 10);
  
  // תזמון חד-פעמי
  if (post.schedule_type === "one-time") {
    const normalizedDate = normalizeDate(post.one_time_date);
    return normalizedDate === todayStr;
  }
  
  // תזמון שבועי
  if (post.schedule_type === "weekly") {
    const days = (post.days_of_week || "").split(",").map(Number).filter(n => !isNaN(n));
    const todayDay = today.getDay();
    
    if (!days.includes(todayDay)) return false;
    
    // בדוק אם היום בטווח התזמון השבועי
    const startDate = post.start_date ? new Date(normalizeDate(post.start_date)) : new Date('2000-01-01');
    const endDate = post.end_date ? new Date(normalizeDate(post.end_date)) : new Date('2099-12-31');
    
    return today >= startDate && today <= endDate;
  }
  
  // תזמון חודשי
  if (post.schedule_type === "monthly") {
    const targetDate = new Date(normalizeDate(post.monthly_date));
    if (isNaN(targetDate.getTime())) return false;
    
    const targetDay = targetDate.getDate();
    const currentDay = today.getDate();
    
    // בדיקה אם התאריך מתאים לחודש הנוכחי
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    if (targetDay > lastDayOfMonth) {
      // אם התאריך גדול מהחודש הנוכחי, פרסם ביום האחרון של החודש
      return currentDay === lastDayOfMonth;
    }
    
    return currentDay === targetDay;
  }
  
  return false;
}

// פונקציה לבדיקה אם פוסט פעיל
function isActivePost(post) {
  return post.status === "active";
}

// פונקציה לבחירת פוסטים ליום - פוסט אחד בלבד עם עדיפות למתוזמנים
function selectPostsForDay(allPosts, today = new Date()) {
  const todayStr = today.toISOString().slice(0, 10);
  
  console.log(`📅 בוחר פוסט ליום ${todayStr}`);
  console.log(`📊 סך הכל פוסטים זמינים: ${allPosts.length}`);
  
  // סינון פוסטים מתוזמנים להיום
  const scheduledPosts = allPosts.filter(post => {
    const isScheduled = isScheduledPost(post, today);
    if (isScheduled) {
      console.log(`✅ פוסט מתוזמן נמצא: ${post.filename} (${post.schedule_type})`);
    }
    return isScheduled;
  });
  
  // בדיקת כפילויות בין פוסטים מתוזמנים
  const validScheduledPosts = [];
  for (const post of scheduledPosts) {
    let hasConflict = false;
    
    // בדוק התנגשות מול פוסטים שכבר נבחרו
    for (const selectedPost of validScheduledPosts) {
      if (isDateConflicted(todayStr, [selectedPost], post.filename || post.id, post.schedule_type)) {
        console.log(`⚠️ פוסט ${post.filename} מתנגש עם פוסט ${selectedPost.filename} - מדלג`);
        hasConflict = true;
        break;
      }
    }
    
    if (!hasConflict) {
      validScheduledPosts.push(post);
    }
  }
  
  console.log(`📊 פוסטים מתוזמנים תקינים: ${validScheduledPosts.length}`);
  
  // סינון פוסטים פעילים
  const activePosts = allPosts.filter(post => isActivePost(post));
  console.log(`📊 פוסטים פעילים זמינים: ${activePosts.length}`);
  
  const selectedPosts = [];
  
  // לוגיקה פשוטה: פוסט אחד בלבד ביום עם עדיפות למתוזמנים
  console.log(`📋 מדיניות: פרסום פוסט אחד בלבד ביום`);
  
  if (validScheduledPosts.length > 0) {
    // יש פוסט מתוזמן - פרסם את הראשון (עדיפות ראשונה)
    selectedPosts.push(validScheduledPosts[0]);
    console.log(`⏰ נבחר פוסט מתוזמן: ${validScheduledPosts[0].filename}`);
    if (validScheduledPosts.length > 1) {
      console.log(`📋 מתעלם מ-${validScheduledPosts.length - 1} פוסטים מתוזמנים נוספים (פוסט אחד בלבד ביום)`);
    }
  } else if (activePosts.length > 0) {
    // אין פוסט מתוזמן - פרסם פוסט פעיל הכי ישן
    const sortedActivePosts = activePosts.sort((a, b) => {
      const lastA = new Date(a.lastPublished || '2000-01-01');
      const lastB = new Date(b.lastPublished || '2000-01-01');
      return lastA - lastB; // הכי ישן קודם
    });
    selectedPosts.push(sortedActivePosts[0]);
    console.log(`🔄 נבחר פוסט פעיל (הכי ישן): ${sortedActivePosts[0].filename}`);
  }
  
  console.log(`📋 פוסט נבחר סופי: ${selectedPosts.map(p => `${p.filename} (${p.status})`).join(', ')}`);
  console.log(`📊 סה"כ פוסטים להיום: ${selectedPosts.length}`);
  return selectedPosts;
}

// פונקציה לבדיקה אם פוסט מסתיים היום (עם תמיכה במבנה ישן וחדש)
function isPostEndingToday(post, today = new Date()) {
  if (post.status !== "scheduled") return false;
  
  const todayStr = today.toISOString().slice(0, 10);
  
  // פוסט חד-פעמי מסתיים אחרי הפרסום
  if (post.schedule_type === "one-time") {
    const normalizedDate = normalizeDate(post.one_time_date);
    return normalizedDate === todayStr;
  }
  
  // פוסט עם מגבלת פעמים
  if (post.max_repeats && post.publishCount >= post.max_repeats - 1) {
    return isScheduledPost(post, today);
  }
  
  // פוסט עם תאריך סיום
  if (post.end_date) {
    const normalizedEndDate = normalizeDate(post.end_date);
    return normalizedEndDate === todayStr;
  }
  
  return false;
}

// פונקציה מעודכנת לבדיקת פוסטים מתאימים להיום - עם הגבלת 2 פוסטים
function isTodayScheduled(post, today = new Date()) {
  // הפונקציה הזו נשארת לתאימות לאחור, אבל נשתמש ב-selectPostsForDay במקום
  if (post.status === "paused" || post.status === "finished") return false;
  
  return isScheduledPost(post, today) || isActivePost(post);
}

// פונקציה להסבר קוד יציאה
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

// === פונקציות נוספות מהקוד הישן ===

// פונקציה לבדיקת עצירה לפי שעה (עם הגנות)
function shouldStopByHour() {
  try {
    const israelTime = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' });
    const hour = new Date(israelTime).getHours();
    console.log("🕒 Time in Israel:", hour);
    return hour >= 23;
  } catch (e) {
    console.log("⚠️ שגיאה בבדיקת שעה:", e.message);
    return false; // במקרה של שגיאה, ממשיכים
  }
}

// פונקציה מתקדמת לupdateHeartbeat (עם הגנות)
function updateHeartbeat({ group, postFile, status, index }) {
  const path = require("path"); // הוספת path לפונקציה
  const info = {
    datetime: new Date().toISOString(),
    lastGroup: group || 'unknown',
    postFile: postFile || 'unknown',
    status: status || 'unknown',   // למשל: 'before', 'after', 'error', 'timeout', 'success', וכו
    groupIndex: index || 0
  };
  
  // ניסיון כתיבה למספר מקומות אפשריים
  const possiblePaths = [
    'C:/postify/alive.txt',
    path.join(__dirname, 'alive.txt'),
    path.join(process.cwd(), 'alive.txt')
  ];
  
  for (const filePath of possiblePaths) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(info, null, 2));
      return; // הצליח - יוצאים
    } catch (e) {
      // ממשיכים לניסיון הבא
    }
  }
  
  // אם כל הנסיונות נכשלו, רק לוג ללא עצירת התהליך
  console.log("⚠️ לא ניתן לכתוב heartbeat לאף מקום - ממשיכים בלי heartbeat");
}

(async () => {
  try {
    const path = require("path");
    const { spawn, exec } = require("child_process");
    const logToSheet = require("./log-to-sheets");
    const config = require("./config.json");

    let instanceName;
    let POSTS_FOLDER;
    let instanceTries = 0;
    while (instanceTries < 2) {
      try {
        instanceName = fs.readFileSync("C:\\postify\\posts\\instance-name.txt", "utf-8").trim();
        POSTS_FOLDER = `C:\\postify\\user data\\${instanceName}\\posts`;
        break;
      } catch (e) {
        instanceTries++;
        console.error("❌ שגיאה בקריאת instance-name.txt:", e.message);
        await sendErrorMail("❌ שגיאה בקריאת instance-name.txt", e.message);
        if (instanceTries < 2) {
          console.log("🔁 מנסה שוב לקרוא את instance-name.txt בעוד 10 שניות...");
          await new Promise(r => setTimeout(r, 10000));
        } else {
          console.log("⏭️ מדלג ליום הבא (או סיום)...");
          return;
        }
      }
    }
    const LOG_FILE = path.join(__dirname, config.logFile);
    const STATE_POST_FILE = path.join(__dirname, "state-post.json");
    const CURRENT_GROUP_NAME_FILE = path.join(__dirname, config.currentGroupFile);
    const LAST_POST_FILE = path.join(__dirname, "last-post.txt"); // ← חדש

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

    // לוגיקת ארגומנטים והתחלה מהקוד הישן
    const args = process.argv.slice(2);
    const skipDelay = args.includes("--now");
    const fileArgIndex = args.indexOf("--file");
    const skipHeartbeat = args.includes("--no-heartbeat"); // אופציה חדשה

    // מייל התחלת פרסום מהקוד הישן
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

    // בדיקה אם היום שבת, חג או יום זיכרון
    if (day === 6 || jewishHolidaysAndMemorials.includes(todayStr)) {
      log("🛑 שבת, חג או יום זיכרון — אין פרסום היום.");
      process.exit(0);
    }

    async function countdown(seconds) {
      for (let i = seconds; i > 0; i--) {
        process.stdout.write(`⏳ ${i}s remaining...\r`);
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log();
    }

    // ============ לולאת פרסום חדשה עם resume, heartbeat וללא דוח יומי ============
    async function runPostsForToday(postsToday, isSpecificPost = false) {
      if (postsToday.length === 0) {
        log("✅ אין פוסטים מתאימים להיום.");
        await logToSheet("Day finished", "Success", "", "אין פוסטים מתאימים להיום");
        return;
      }

      let startPost = 0;
      let startGroup = 0;
      if (fs.existsSync(STATE_POST_FILE)) {
        try {
          const state = JSON.parse(fs.readFileSync(STATE_POST_FILE, "utf-8"));
          if (state.date === todayStr) {
            startPost = state.postIndex || 0;
            startGroup = state.groupIndex || 0;
            log(`🔁 ממשיך מהריצה הקודמת: פוסט ${startPost + 1}/${postsToday.length}, קבוצה ${startGroup + 1}`);
          }
        } catch (e) {
          log("⚠️ לא ניתן לקרוא את קובץ ה־state-post. מתחיל מההתחלה.");
        }
      }

      for (let pi = startPost; pi < postsToday.length; pi++) {
        const post = postsToday[pi];
        
        // בדיקת עצירה לפי שעה בכל פוסט
        if (shouldStopByHour()) {
          log("🛑 עצירה בגלל שעה מאוחרת (אחרי 23:00). ממשיך מחר.");
          await logToSheet("Day stopped", "Stopped", "", "השעה מאוחרת, ממשיך מחר");
          await sendErrorMail("🛑 עצירה בגלל שעה מאוחרת", "הפרסום נעצר בגלל שעה מאוחרת. ימשיך מחר.");
          updateHeartbeat({ group: "stopped-by-hour", postFile: post.filename, status: 'stopped', index: pi });
          return;
        }
        
        for (let gi = (pi === startPost ? startGroup : 0); gi < post.groups.length; gi++) {
          const groupUrl = post.groups[gi];

          log(`📢 posting to group(${gi + 1}/${post.groups.length}): ${groupUrl}`);
          await logToSheet("Publishing to group", "Started", groupUrl, `Group ${gi + 1}/${post.groups.length}`);

          // לפני ניסיון פרסום
          updateHeartbeat({
            group: groupUrl,
            postFile: post.filename,
            status: 'before',
            index: gi
          });

          let retryCount = 0;
          let success = false;

          while (retryCount < 2 && !success) {
            await new Promise((resolve) => {
              // --- Heartbeat (ניטור) - בטוח ---
              try {
                const heartbeatInfo = {
                  datetime: new Date().toISOString(),
                  postIndex: pi,
                  groupIndex: gi,
                  postFile: post.filename,
                  groupUrl
                };
                
                // ניסיון כתיבה למספר מקומות
                const possiblePaths = [
                  'C:/postify/alive.txt',
                  path.join(__dirname, 'alive.txt'),
                  path.join(process.cwd(), 'alive.txt')
                ];
                
                for (const filePath of possiblePaths) {
                  try {
                    fs.writeFileSync(filePath, JSON.stringify(heartbeatInfo));
                    break; // הצליח - עוצרים
                  } catch (e) {
                    // ממשיכים לניסיון הבא
                  }
                }
              } catch (e) {
                // אם heartbeat נכשל, ממשיכים בלי לעצור את התהליך
                console.log("⚠️ לא ניתן לכתוב heartbeat:", e.message);
              }

              const child = spawn("node", ["post.js", groupUrl, post.filename], { stdio: "inherit" });

              // --- Timeout ---
              const TIMEOUT = 13 * 60 * 1000;
              let timeoutId = setTimeout(() => {
                log(`⏰ Timeout! post.js לקח יותר מ־13 דקות. סוגר תהליך וממשיך...`);
                child.kill("SIGKILL");
                sendErrorMail("⏰ Timeout - קבוצה נתקעה", `הקבוצה ${groupUrl} נתקעה ליותר מ־13 דקות ונעצרה אוטומטית.`);
              }, TIMEOUT);

              // --- עדכון state ---
              fs.writeFileSync(STATE_POST_FILE, JSON.stringify({
                date: todayStr, postIndex: pi, groupIndex: gi
              }), "utf-8");

              child.on("exit", async (code) => {
                clearTimeout(timeoutId);
                const now = new Date();
                const groupTime = now.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
                
                // קריאת שם הקבוצה
                let groupName;
                try {
                  groupName = fs.readFileSync(CURRENT_GROUP_NAME_FILE, "utf-8").trim();
                } catch (e) {
                  groupName = groupUrl;
                  await sendErrorMail("⚠️ שגיאה בקריאת שם הקבוצה", `לא ניתן לקרוא את שם הקבוצה: ${e.message}`);
                }
                
                if (code === 0) {
                  success = true;
                  log(`✅ פורסם בהצלחה בקבוצה: ${groupName}`);
                  try {
                    await logToSheet("Publishing finished", "Success", groupName, groupTime);
                  } catch (e) {
                    log("⚠️ שגיאה ברישום לגוגל שיט: " + e.message);
                    await sendErrorMail("⚠️ שגיאה ברישום לגוגל שיט", `לא ניתן לרשום את התוצאה לגוגל שיט: ${e.message}`);
                  }
                } else {
                  const reason = explainExitCode(code);
                  log(`❌ שגיאה בפרסום לקבוצה ${groupName}: ${reason}`);
                  const msg = `❌ הפרסום לקבוצה ${groupName} נכשל.\n\n📄 סיבה אפשרית: ${reason}`;
                  await sendErrorMail("❌ שגיאה בפרסום לקבוצה", `קובץ: ${post.filename}\nקבוצה: ${groupName}\n${reason}`);
                  try {
                    await logToSheet("Publishing finished", "Failed", groupName, groupTime);
                  } catch (e) {
                    log("⚠️ שגיאה ברישום לגוגל שיט: " + e.message);
                    await sendErrorMail("⚠️ שגיאה ברישום לגוגל שיט", `לא ניתן לרשום את התוצאה לגוגל שיט: ${e.message}`);
                  }
                  if (retryCount < 1) {
                    log("🔁 מנסה שוב לפרסם לקבוצה...");
                  } else {
                    log("❌ מעבר לקבוצה הבאה אחרי כישלון");
                  }
                }

                // --- השהייה רנדומלית מה-config (רק אם לא שולח --now) ---
                if (!skipDelay) {
                  const delaySec = config.minDelaySec + Math.floor(Math.random() * (config.maxDelaySec - config.minDelaySec + 1));
                  const minutes = Math.floor(delaySec / 60);
                  const seconds = delaySec % 60;
                  log(`⏱ ממתין ${minutes} דקות ו־${seconds} שניות לפני הקבוצה הבאה...`);
                  await countdown(delaySec);
                } else {
                  log(`⚡ דילוג על השהייה (--now)`);
                }

                resolve();
              });
              
              // הוספת טיפול בשגיאות תהליך
              child.on("error", async (error) => {
                clearTimeout(timeoutId);
                log(`❌ שגיאה בהרצת post.js: ${error.message}`);
                await sendErrorMail("❌ שגיאה בהרצת post.js", `שגיאה בפרסום לקבוצה ${groupUrl}: ${error.message}`);

                // עדכון heartbeat בשגיאה
                updateHeartbeat({ group: groupUrl, postFile: post.filename, status: 'error', index: gi });

                if (retryCount < 1) {
                  log("🔁 מנסה שוב לפרסם לקבוצה...");
                } else {
                  log("⏭️ מדלג לקבוצה הבאה...");
                }
                resolve();
              });
            });
            retryCount++;
          }
        }
        // עדכון אחרי שכל הקבוצות פורסמו
        post.lastPublished = new Date().toISOString().slice(0,10);
        post.publishCount = (post.publishCount || 0) + 1;
        
        // שמירת הפוסט האחרון שפורסם
        try {
          fs.writeFileSync(LAST_POST_FILE, post.filename);
        } catch (e) {
          log("⚠️ שגיאה בשמירת הפוסט האחרון: " + e.message);
        }
        
        // בדיקה אם הפוסט צריך להסתיים
        let finished = false;
        if (post.schedule_type === "one-time") {
          finished = true;
        } else if (post.max_repeats && post.publishCount >= post.max_repeats) {
          finished = true;
        } else if (post.end_date) {
          const normalizedEndDate = normalizeDate(post.end_date);
          const todayNormalized = new Date().toISOString().slice(0,10);
          if (normalizedEndDate && normalizedEndDate <= todayNormalized) {
            finished = true;
          }
        }
        
        if (finished) {
          post.status = "finished";
          log(`✅ פוסט ${post.filename} הסתיים והועבר לסטטוס finished`);
        }
        
        fs.writeFileSync(path.join(POSTS_FOLDER, post.filename), JSON.stringify(post, null, 2), "utf-8");
        
        // עדכון heartbeat אחרי סיום פוסט
        updateHeartbeat({
          group: 'post-completed',
          postFile: post.filename,
          status: 'completed',
          index: pi
        });
      }
      log("✅ כל הפוסטים להיום פורסמו.");

      // מחיקת סטייט כי סיימנו בהצלחה
      if (fs.existsSync(STATE_POST_FILE)) fs.unlinkSync(STATE_POST_FILE);
      
      // עדכון heartbeat סיום
      updateHeartbeat({ group: "all-finished", postFile: "completed", status: 'finished', index: -1 });

      // סיום יום: log-cost, מייל סגירה, כיבוי (רק אם לא פוסט ספציפי)
      if (!isSpecificPost) {
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
                  log(" כיבוי השרת עכשיו...");
                  exec("shutdown /s /f /t 0", (shutdownError) => {
                    if (shutdownError) {
                      log("❌ שגיאה בכיבוי: " + shutdownError.message);
                    }
                  });
                }, 10000); // 10 שניות המתנה לפני כיבוי
              });
            }, 60000);
          });
        }, 4 * 60000);
      } else {
        log("📁 פוסט ספציפי הושלם - השרת ממשיך לפעול");
      }
    }

    // === פונקציה לוולידציה של פוסטים ומניעת כפילויות ===
    function validateAndFilterPosts(allPosts) {
      console.log('🔍 מתחיל וולידציה של פוסטים...');
      
      const validPosts = [];
      const scheduledPosts = allPosts.filter(p => p.status === 'scheduled');
      const nonScheduledPosts = allPosts.filter(p => p.status !== 'scheduled');
      const pausedDueToDuplicates = [];
      
      // הוסף קודם פוסטים לא מתוזמנים (לא נבדקים לכפילויות)
      validPosts.push(...nonScheduledPosts);
      
      // בדוק פוסטים מתוזמנים לכפילויות
      for (const post of scheduledPosts) {
        let hasConflict = false;
        let conflictDetails = [];
        
        // בדוק כל סוג תזמון
        if (post.schedule_type === 'one-time' && post.one_time_date) {
          const conflictingPosts = validPosts.filter(validPost => 
            validPost.status === 'scheduled' &&
            isDateConflicted(post.one_time_date, [validPost], post.filename, post.schedule_type)
          );
          if (conflictingPosts.length > 0) {
            hasConflict = true;
            conflictDetails.push(`תאריך חד-פעמי ${post.one_time_date} מתנגש עם: ${conflictingPosts.map(p => p.filename).join(', ')}`);
          }
        } else if (post.schedule_type === 'weekly' && post.days_of_week) {
          // בדוק כל יום בשבוע של הפוסט השבועי
          const daysOfWeek = post.days_of_week.split(',').filter(Boolean).map(d => parseInt(d));
          for (const dayOfWeek of daysOfWeek) {
            // יצירת תאריך דמה עבור היום בשבוע
            const today = new Date();
            const diffDays = dayOfWeek - today.getDay();
            const targetDate = new Date(today.getTime() + diffDays * 24 * 60 * 60 * 1000);
            const targetDateStr = targetDate.toISOString().slice(0, 10);
            
            const conflictingPosts = validPosts.filter(validPost => 
              validPost.status === 'scheduled' &&
              isDateConflicted(targetDateStr, [validPost], post.filename, post.schedule_type)
            );
            if (conflictingPosts.length > 0) {
              hasConflict = true;
              const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
              conflictDetails.push(`יום ${dayNames[dayOfWeek]} שבועי מתנגש עם: ${conflictingPosts.map(p => p.filename).join(', ')}`);
              break;
            }
          }
        } else if (post.schedule_type === 'monthly' && post.monthly_date) {
          const conflictingPosts = validPosts.filter(validPost => 
            validPost.status === 'scheduled' &&
            isDateConflicted(post.monthly_date, [validPost], post.filename, post.schedule_type)
          );
          if (conflictingPosts.length > 0) {
            hasConflict = true;
            const dayOfMonth = new Date(normalizeDate(post.monthly_date)).getDate();
            conflictDetails.push(`יום ${dayOfMonth} בחודש מתנגש עם: ${conflictingPosts.map(p => p.filename).join(', ')}`);
          }
        }
        
        if (hasConflict) {
          console.log(`⚠️ פוסט ${post.filename} יש בו כפילות תאריכים - מועבר לסטטוס paused`);
          post.status = 'paused';
          pausedDueToDuplicates.push({
            filename: post.filename,
            title: post.title || 'ללא שם',
            originalScheduleType: post.schedule_type,
            conflicts: conflictDetails
          });
          
          // שמירת הפוסט עם הסטטוס החדש
          try {
            fs.writeFileSync(path.join(POSTS_FOLDER, post.filename), JSON.stringify(post, null, 2), "utf-8");
          } catch (e) {
            console.log(`❌ שגיאה בשמירת פוסט ${post.filename}:`, e.message);
          }
        }
        
        validPosts.push(post);
      }
      
      // שליחת מייל על כפילויות שזוהו (אם יש)
      if (pausedDueToDuplicates.length > 0) {
        const emailContent = [
          `🚨 זוהו כפילויות תאריכים ב-${pausedDueToDuplicates.length} פוסטים`,
          "",
          "הפוסטים הבאים הועברו לסטטוס 'paused' אוטומטית:",
          "",
          ...pausedDueToDuplicates.map(item => [
            `📋 קובץ: ${item.filename}`,
            `📝 כותרת: ${item.title}`,
            `⏰ סוג תזמון: ${item.originalScheduleType}`,
            `⚠️ כפילויות:`,
            ...item.conflicts.map(c => `   • ${c}`),
            ""
          ].join("\n")),
          "אנא בדוק ותקן את התזמונים בממשק הניהול.",
          "",
          "מערכת RUNDAY"
        ].join("\n");
        
        // שליחת מייל (אסינכרוני - לא נעצור בגלל שגיאת מייל)
        sendErrorMail("🚨 זוהו כפילויות תאריכים בפוסטים", emailContent)
          .catch(e => console.log("❌ שגיאה בשליחת מייל כפילויות:", e.message));
      }
      
      console.log(`✅ וולידציה הושלמה: ${validPosts.length} פוסטים סך הכל`);
      if (pausedDueToDuplicates.length > 0) {
        console.log(`⚠️ ${pausedDueToDuplicates.length} פוסטים הועברו ל-paused בגלל כפילויות`);
      }
      
      return { validPosts, pausedDueToDuplicates };
    }

    // === טעינת הפוסטים וסינון לפי היום עם הגבלת 2 פוסטים ===
    
    // טיפול בפרמטר --file (פוסט ספציפי)
    let specificPostFile = null;
    if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
      specificPostFile = args[fileArgIndex + 1];
      log(`📁 מצב פוסט ספציפי: ${specificPostFile}`);
    }
    
    // טעינת קבצי פוסטים עם retry logic
    let allFiles;
    let postsFolderTries = 0;
    let lastPostsFolderError = null;
    let triedCreateInstance = false;
    while (postsFolderTries < 2) {
      try {
        allFiles = fs.readdirSync(POSTS_FOLDER);
        break;
      } catch (e) {
        postsFolderTries++;
        lastPostsFolderError = e;
        log("❌ שגיאה בקריאת תיקיית הפוסטים: " + e.message);
        await sendErrorMail("❌ שגיאה בקריאת תיקיית הפוסטים", e.message);
        if (postsFolderTries === 2 && !triedCreateInstance) {
          triedCreateInstance = true;
          log("🔁 מנסה להריץ create-instance name.bat ולחכות 20 שניות...");
          const { execSync } = require("child_process");
          try {
            execSync('start /b "" "C:\\postify\\posts\\create-instance name.bat"', { stdio: "ignore" });
          } catch (err) {
            log("❌ שגיאה בהרצת create-instance name.bat: " + err.message);
          }
          await new Promise(r => setTimeout(r, 20000));
          // ננסה שוב לקרוא את שם ה-instance
          try {
            instanceName = fs.readFileSync("C:\\postify\\posts\\instance-name.txt", "utf-8").trim();
            // עדכון נתיב תיקיית הפוסטים
            POSTS_FOLDER = `C:\\postify\\user data\\${instanceName}\\posts`;
          } catch (err) {
            log("❌ עדיין לא מצליח לקרוא את instance-name.txt: " + err.message);
          }
          // ננסה שוב לקרוא את תיקיית הפוסטים
          try {
            allFiles = fs.readdirSync(POSTS_FOLDER);
            break;
          } catch (err) {
            lastPostsFolderError = err;
            // נשלח הודעת שגיאה עם ה-IP
            let ip = "לא ידוע";
            try {
              const { networkInterfaces } = require("os");
              const nets = networkInterfaces();
              for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                  if (net.family === 'IPv4' && !net.internal) {
                    ip = net.address;
                    break;
                  }
                }
              }
            } catch (ipErr) {}
            await sendErrorMail(
              "❌ סיום אוטומטי – תיקיית פוסטים לא קיימת",
              `המערכת ניסתה פעמיים ולא הצליחה לגשת לתיקיית הפוסטים.\n\nשגיאה אחרונה:\n${lastPostsFolderError ? lastPostsFolderError.message : ""}\n\nIP: ${ip}`
            );
            log("💤 הסקריפט ייסגר בעוד 10 שניות...");
            await new Promise(r => setTimeout(r, 10000));
            process.exit(1);
          }
        } else if (postsFolderTries < 2) {
          log("🔁 מנסה שוב לקרוא את תיקיית הפוסטים בעוד 10 שניות...");
          await new Promise(r => setTimeout(r, 10000));
        }
      }
    }
    
    const postFiles = allFiles
      .filter(f => /^post\d+\.json$/.test(f))
      .filter(f => specificPostFile ? f === specificPostFile : true); // סינון לפוסט ספציפי אם הוגדר
    
    if (postFiles.length === 0) {
      if (specificPostFile) {
        log(`❌ הפוסט ${specificPostFile} לא נמצא!`);
        await sendErrorMail("❌ פוסט לא נמצא", `הפוסט ${specificPostFile} לא נמצא בתיקייה.`);
        return;
      }
      log(`❌ לא נמצאו קבצי postX.json בתיקייה.`);
      await sendErrorMail("❌ לא נמצאו פוסטים", "לא נמצא אף פוסט מסוג postX.json בתיקייה.");
      log("⏭️ מדלג ליום הבא (או סיום)...");
      updateHeartbeat({ group: "no-posts", postFile: null, status: 'error', index: -1 });
      return;
    }
    
    const allPosts = [];
    const today = new Date();
    
    // טעינת כל הפוסטים עם retry logic
    for (const fname of postFiles) {
      let retryCount = 0;
      let postLoaded = false;
      
      while (retryCount < 3 && !postLoaded) {
        try {
          const post = JSON.parse(fs.readFileSync(path.join(POSTS_FOLDER, fname), "utf-8"));
          allPosts.push({ ...post, filename: fname });
          postLoaded = true;
        } catch (e) {
          retryCount++;
          log(`❌ שגיאה בטעינת פוסט ${fname} (ניסיון ${retryCount}/3): ${e.message}`);
          if (retryCount < 3) {
            await new Promise(r => setTimeout(r, 1000)); // המתנה של שנייה לפני ניסיון נוסף
          } else {
            await sendErrorMail("❌ שגיאה בטעינת פוסט", `לא ניתן לטעון את הפוסט ${fname} אחרי 3 ניסיונות: ${e.message}`);
          }
        }
      }
    }
    
    log(`📊 נטענו ${allPosts.length} פוסטים`);
    
    // וולידציה ומניעת כפילויות (רק אם לא מפרסמים פוסט ספציפי)
    let validatedPosts, pausedDueToDuplicates;
    if (specificPostFile) {
      // פוסט ספציפי - ללא וולידציה
      validatedPosts = allPosts;
      pausedDueToDuplicates = [];
      log(`📁 מצב פוסט ספציפי - מדלג על וולידציה`);
    } else {
      // מצב רגיל - עם וולידציה מלאה
      const validation = validateAndFilterPosts(allPosts);
      validatedPosts = validation.validPosts;
      pausedDueToDuplicates = validation.pausedDueToDuplicates;
    }
    
    // בחירת פוסטים להיום עם הגבלת 2 פוסטים ועדיפות למתוזמנים
    let postsToday;
    if (specificPostFile) {
      // מצב פוסט ספציפי - לא מפעילים וולידציה או בחירה, פשוט מפרסמים את הפוסט
      postsToday = validatedPosts.filter(p => p.filename === specificPostFile);
      if (postsToday.length === 0) {
        log(`❌ הפוסט ${specificPostFile} לא זמין (ייתכן שהוא paused או finished)`);
        return;
      }
      log(`📁 מפרסם פוסט ספציפי: ${specificPostFile}`);
    } else {
      // מצב רגיל - בחירה חכמה של פוסטים
      postsToday = selectPostsForDay(validatedPosts, today);
    }
    
    // דוח יומי - הוספת לוג על פוסטים שמסתיימים היום
    if (!specificPostFile) {
      const endingPosts = validatedPosts.filter(post => isPostEndingToday(post, today));
      if (endingPosts.length > 0) {
        log(`📋 פוסטים שמסתיימים היום: ${endingPosts.map(p => p.filename).join(', ')}`);
      }
      
      // דוח על פוסטים שהועברו לpaused בגלל כפילויות
      if (pausedDueToDuplicates.length > 0) {
        log(`⚠️ פוסטים שהועברו ל-paused בגלל כפילויות: ${pausedDueToDuplicates.map(p => p.filename).join(', ')}`);
      }
      
      log(`📋 פוסטים נבחרים להיום: ${postsToday.map(p => `${p.filename} (${p.status})`).join(', ')}`);
      log(`📊 סך הכל: ${postsToday.length} פוסטים`);
      
      if (!specificPostFile) {
        const scheduledCount = postsToday.filter(p => p.status === 'scheduled').length;
        const activeCount = postsToday.filter(p => p.status === 'active').length;
        const totalAvailable = validatedPosts.filter(p => p.status === 'scheduled' || p.status === 'active').length;
        log(`📊 פילוח: ${scheduledCount} מתוזמנים, ${activeCount} פעילים`);
        log(`🔢 סה"כ פוסטים זמינים (פעילים + מתוזמנים): ${totalAvailable}`);
        log(`📋 מדיניות: פרסום פוסט אחד בלבד ביום עם עדיפות למתוזמנים`);
      }
    } else {
      log(`📁 מפרסם פוסט ספציפי: ${specificPostFile} (${postsToday[0]?.status || 'לא ידוע'})`);
    }
    
    // --- רישום פוסטים נבחרים לשיטס ---
    if (postsToday.length > 0) {
      const selectedPostsInfo = postsToday.map(p => `${p.filename} (${p.status})`).join(', ');
      try {
        await logToSheet("Daily Posts Selected", "Info", "", `פוסטים נבחרים: ${selectedPostsInfo}`);
        log(`📊 נרשם לשיטס: פוסטים נבחרים - ${selectedPostsInfo}`);
      } catch (e) {
        log(`⚠️ שגיאה ברישום פוסטים נבחרים לשיטס: ${e.message}`);
      }
    }

    // --- הפעלת הלולאה החדשה ---
    await runPostsForToday(postsToday, !!specificPostFile);

  } catch (err) {
    console.error("❌ שגיאה באוטומציה:", err);
    try {
      await sendErrorMail("❌ שגיאה באוטומציה", [
        `🛑 התרחשה שגיאה בסקריפט: ${__filename}`,
        "",
        `❗ שגיאה: ${err.message}`,
        "",
        err.stack,
      ].join("\n"));
    } catch (mailError) {
      console.error("❌ שגיאה נוספת בשליחת מייל שגיאה:", mailError.message);
    }
    console.log("⏭️ ממשיך הלאה...");
    return;
  }
})();
