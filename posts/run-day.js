const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { sendErrorMail, sendMail } = require("./mailer");

// קבוע לקובץ מצבי רוטציה
const ROTATION_STATE_FILE = path.join(__dirname, "rotation-states.json");

// ================================================================
// RUNDAY - מערכת תזמון פוסטים משודרגת עם מניעת כפילויות תאריכים
// ================================================================
// השדרוגים החדשים:
// 1. מניעת כפילויות תאריכים בין כל סוגי הפוסטים (שבועי, חודשי, חד-פעמי)
// 2. תמיכה במבנה פוסטים ישן וחדש (נורמליזציה של תאריכים)
// 3. וולידציה אוטומטית בעת טעינת פוסטים והעברה לstatus paused במקרה של כפילות
// 4. בדיקות מדויקות של התנגשות תאריכים לפי סוג התזמון
// 5. לוגים מפורטים לאיתור בעיות ומעקב אחרי בחירת פוסטים
// 6. ניהול מספר פוסטים ופרסומים ביום עם חלוקה חכמה
// ================================================================

// ========== הגדרות פרסום יומי ==========
// הגדרות נטענות מקובץ daily-settings.json מתיקיית המשתמש הספציפי
// ניתן לעדכן את ההגדרות בזמן אמת ללא הפסקת המערכת
let DAILY_SETTINGS = {};

// ========== מעקב כשלונות רצופים ==========
// מערכת עבור מעקב אחרי כשלונות ברצף לצורך שליחת התראות דחופות
let consecutiveFailures = [];

function getSettingsPath() {
    // קריאת שם השרת
    const instanceNameFile = './instance-name.txt';
    if (fs.existsSync(instanceNameFile)) {
        const hostname = fs.readFileSync(instanceNameFile, 'utf8').trim();
        const userSettingsPath = `C:/postify/user data/${hostname}/daily-settings.json`;
        
        // בדיקה אם קובץ ההגדרות קיים בתיקיית המשתמש
        if (fs.existsSync(userSettingsPath)) {
            console.log(`📁 משתמש בהגדרות מתיקיית המשתמש: ${hostname}`);
            return userSettingsPath;
        } else {
            console.log(`⚠️ קובץ הגדרות לא נמצא בתיקיית המשתמש: ${hostname}`);
            console.log(`💡 הצעה: הרץ את sync-user-data.js לסנכרון הגדרות מהאתר`);
        }
    }
    
    // ברירת מחדל - קובץ מקומי
    return './daily-settings.json';
}

function loadDailySettings() {
    try {
        const settingsPath = getSettingsPath();
        console.log(`📂 טוען הגדרות מ: ${settingsPath}`);
        
        const settingsData = fs.readFileSync(settingsPath, 'utf8');
        DAILY_SETTINGS = JSON.parse(settingsData);
        console.log('✅ הגדרות יומיות נטענו בהצלחה מקובץ JSON');
        
        // הצגת מידע על מקור ההגדרות
        if (DAILY_SETTINGS.hostname) {
            console.log(`👤 הגדרות משתמש: ${DAILY_SETTINGS.hostname}`);
        }
        if (DAILY_SETTINGS.synced_from_website) {
            console.log(`🌐 הגדרות סונכרנו מהאתר בתאריך: ${DAILY_SETTINGS.last_updated}`);
        }
        
        // וולידציה של הגדרות
        if (DAILY_SETTINGS.MAX_POSTS_PER_DAY < 1) {
            throw new Error("MAX_POSTS_PER_DAY חייב להיות לפחות 1");
        }
        if (DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY < 1) {
            throw new Error("MAX_PUBLICATIONS_PER_DAY חייב להיות לפחות 1");
        }
        if (DAILY_SETTINGS.MAX_POSTS_PER_DAY > 20) {
            console.warn("⚠️ אזהרה: מספר גבוה של פוסטים ביום (>20) עלול לגרום לעומס");
        }
        
    } catch (error) {
        console.log('⚠️ שגיאה בטעינת הגדרות:', error.message);
        console.log('📋 משתמש בהגדרות ברירת מחדל');
        console.log('💡 הצעה: בדוק שקובץ daily-settings.json קיים או הרץ sync-user-data.js');
        DAILY_SETTINGS = {
            MAX_POSTS_PER_DAY: 5,
            MAX_PUBLICATIONS_PER_DAY: 15,
            DELAY_BETWEEN_POSTS_MINUTES: 30,
            ENABLE_SMART_DISTRIBUTION: true,
            ENABLE_SABBATH_SHUTDOWN: true,
            SABBATH_SHUTDOWN_HOURS_BEFORE: 1
        };
    }
}

function updateDailySettings(newSettings) {
    try {
        const settingsPath = getSettingsPath();
        const updatedSettings = { 
            ...DAILY_SETTINGS, 
            ...newSettings, 
            last_updated: new Date().toISOString() 
        };
        fs.writeFileSync(settingsPath, JSON.stringify(updatedSettings, null, 2), 'utf8');
        DAILY_SETTINGS = updatedSettings;
        console.log('✅ הגדרות יומיות עודכנו בקובץ JSON:', Object.keys(newSettings));
        return true;
    } catch (error) {
        console.log('❌ שגיאה בעדכון הגדרות:', error.message);
        return false;
    }
}

function reloadSettings() {
    console.log('🔄 טוען מחדש הגדרות מקובץ JSON...');
    loadDailySettings();
}

// טעינה ראשונית של הגדרות
loadDailySettings();

console.log(`📊 הגדרות פרסום יומי (נטען מ-daily-settings.json):
  📝 מקסימום פוסטים ביום: ${DAILY_SETTINGS.MAX_POSTS_PER_DAY}
  📢 מקסימום פרסומים ביום: ${DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY}
  🧠 חלוקה חכמה: ${DAILY_SETTINGS.ENABLE_SMART_DISTRIBUTION ? 'מופעלת' : 'כבויה'}
  ⏱️ השהייה בין פוסטים: ${DAILY_SETTINGS.DELAY_BETWEEN_POSTS_MINUTES} דקות
  🕯️ כיבוי לשבת: ${DAILY_SETTINGS.ENABLE_SABBATH_SHUTDOWN ? 'מופעל' : 'כבוי'}`);

// איפוס מערכת כשלונות רצופים בתחילת כל הרצה
consecutiveFailures = [];
console.log("🔄 מערכת כשלונות רצופים אופסה לתחילת יום חדש");

// הוספת פונקציה לעדכון הגדרות דינמי
function updateMaxPosts(newMax) {
    return updateDailySettings({ MAX_POSTS_PER_DAY: newMax });
}

function updateMaxPublications(newMax) {
    return updateDailySettings({ MAX_PUBLICATIONS_PER_DAY: newMax });
}

function updateDelay(newDelay) {
    return updateDailySettings({ DELAY_BETWEEN_POSTS_MINUTES: newDelay });
}

// ========== מערכת מעקב כשלונות רצופים ==========

// פונקציה לרישום כשלון קבוצה
function recordGroupFailure(groupName, groupUrl, errorMessage) {
    // בדיקה אם הקבוצה כבר נרשמה בכשלונות הרצופים (לפי URL)
    const isAlreadyFailed = consecutiveFailures.some(f => f.groupUrl === groupUrl);
    
    if (!isAlreadyFailed) {
        const now = new Date();
        const failure = {
            groupName: groupName,
            groupUrl: groupUrl,
            timestamp: now.toISOString(),
            timeStr: now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' }),
            errorMessage: errorMessage
        };
        
        consecutiveFailures.push(failure);
        
        // שמירה על מקסימום 10 כשלונות אחרונים
        if (consecutiveFailures.length > 10) {
            consecutiveFailures.shift();
        }
        
        console.log(`❌ רישום כשלון קבוצה: ${groupName} (URL: ${groupUrl}) (סה"כ כשלונות רצופים: ${consecutiveFailures.length})`);
        
        // בדיקה אם יש 5 כשלונות רצופים של קבוצות שונות
        checkConsecutiveFailures();
    } else {
        console.log(`🔄 קבוצה ${groupName} כבר רשומה בכשלונות הרצופים - דילוג על רישום נוסף`);
    }
}

// פונקציה לאיפוס כשלונות (נקרא בהצלחה)
function resetConsecutiveFailures() {
    if (consecutiveFailures.length > 0) {
        console.log(`✅ איפוס כשלונות רצופים (היו ${consecutiveFailures.length} כשלונות)`);
        consecutiveFailures = [];
    }
}

// פונקציה לבדיקת כשלונות רצופים ושליחת התראה
function checkConsecutiveFailures() {
    console.log(`🔍 בדיקת כשלונות: ${consecutiveFailures.length} קבוצות שונות נכשלו ברצף`);
    
    if (consecutiveFailures.length >= 5) {
        console.log(`📋 קבוצות שנכשלו: ${consecutiveFailures.map(f => f.groupName).join(', ')}`);
        console.log("🚨 זוהו 5+ קבוצות שונות ברצף - שולח התראה!");
        
        // שלח את 5 הכשלונות הראשונים (כל אחד מקבוצה שונה)
        const firstFiveFailures = consecutiveFailures.slice(0, 5);
        sendUrgentFailureAlert(firstFiveFailures);
    } else {
        console.log("✅ לא מספיק קבוצות שונות לשליחת התראה");
    }
}

// פונקציה לשליחת התראה דחופה
async function sendUrgentFailureAlert(failures) {
    try {
        // הודעה דחופה לקונסול
        console.log("🚨🚨🚨 התראה דחופה - זוהו 5 כשלונות קבוצות שונות ברצף! 🚨🚨🚨");
        console.log("📧 שולח מייל התראה דחוף...");
        
        // קריאת hostname מקובץ instance-name.txt
        let hostname = "לא ידוע";
        try {
            const instanceNameFile = './instance-name.txt';
            if (fs.existsSync(instanceNameFile)) {
                hostname = fs.readFileSync(instanceNameFile, 'utf8').trim();
            }
        } catch (e) {
            console.log("⚠️ לא ניתן לקרוא hostname:", e.message);
        }
        
        const now = new Date();
        const alertTime = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
        
        const failureList = failures.map((f, index) => 
            `${index + 1}. ${f.groupName} (${f.timeStr}): ${f.errorMessage}`
        ).join('\n');
        
        const subject = `🚨 התראה דחופה - 5 כשלונות קבוצות ברצף! [${hostname}]`;
        
        const textMessage = `
🚨 התראה דחופה מ-Postify!

🖥️ שרת: ${hostname}
זוהו 5 כשלונות של קבוצות שונות ברצף:

${failureList}

⏰ זמן התראה: ${alertTime}

יש לבדוק מיידית את מצב החיבור לפייסבוק והגדרות הפרסום.

Postify - מערכת ניטור אוטומטית
        `.trim();
        
        const htmlMessage = `
<div dir="rtl" style="text-align:right;font-family:Arial,sans-serif;">
  <div style="background-color:#ffebee;border:2px solid #f44336;border-radius:8px;padding:20px;">
    <h2 style="color:#d32f2f;margin-top:0;">🚨 התראה דחופה מ-Postify!</h2>
    
    <div style="background-color:#e8f5e8;padding:10px;border-radius:5px;margin:10px 0;">
      <b>🖥️ שרת:</b> <span style="background-color:#4CAF50;color:white;padding:2px 8px;border-radius:3px;">${hostname}</span>
    </div>
    
    <div style="background-color:#ffffff;padding:15px;border-radius:5px;margin:15px 0;">
      <h3 style="color:#d32f2f;">זוהו 5 כשלונות של קבוצות שונות ברצף:</h3>
      <ol style="line-height:1.8;">
        ${failures.map(f => 
          `<li><b>${f.groupName}</b> (${f.timeStr}): ${f.errorMessage}</li>`
        ).join('')}
      </ol>
    </div>
    
    <div style="background-color:#fff3e0;padding:10px;border-radius:5px;margin:10px 0;">
      <b>⏰ זמן התראה:</b> ${alertTime}
    </div>
    
    <div style="background-color:#ffcdd2;padding:15px;border-radius:5px;margin:15px 0;">
      <b>🔧 פעולות מומלצות:</b><br>
      • בדוק חיבור לאינטרנט<br>
      • בדוק חיבור לפייסבוק<br>
      • בדוק הגדרות קבוצות<br>
      • בדוק לוגים למידע נוסף
    </div>
    
    <div style="text-align:center;margin-top:20px;">
      <b>Postify - מערכת ניטור אוטומטית</b>
    </div>
  </div>
</div>
        `.trim();
        
        await sendMail(subject, textMessage, htmlMessage);
        console.log("🚨 התראה דחופה נשלחה - 5 כשלונות קבוצות ברצף!");
        
    } catch (error) {
        console.log("❌ שגיאה בשליחת התראה דחופה:", error.message);
    }
}

// ========== פונקציות כיבוי מחשב לשבת ==========

// פונקציה לחישוב זמן כניסת השבת (קירוב - 18:00 בחורף, 19:00 בקיץ)
function getSabbathTime() {
  const now = new Date();
  const month = now.getMonth() + 1; // חודש 1-12
  
  // קירוב לזמני כניסת שבת בישראל (ללא חישוב מדויק של זמנים)
  // קיץ (אפריל-ספטמבר): 19:00, חורף (אוקטובר-מרץ): 18:00
  const sabbathHour = (month >= 4 && month <= 9) ? 19 : 18;
  
  const sabbathTime = new Date();
  sabbathTime.setHours(sabbathHour, 0, 0, 0); // כניסת שבת
  
  return sabbathTime;
}

// פונקציה לבדיקה אם צריך לכבות את המחשב לקראת שבת
function shouldShutdownForSabbath() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=ראשון, 5=שישי, 6=שבת
  
  // בדיקה רק ביום שישי
  if (dayOfWeek !== 5) {
    return { should: false, reason: "לא יום שישי" };
  }
  
  const sabbathTime = getSabbathTime();
  const oneHourBefore = new Date(sabbathTime.getTime() - 60 * 60 * 1000); // שעה לפני
  
  if (now >= oneHourBefore) {
    const minutesUntilSabbath = Math.round((sabbathTime.getTime() - now.getTime()) / (1000 * 60));
    return { 
      should: true, 
      reason: `שעה לפני כניסת שבת`,
      minutesUntil: minutesUntilSabbath,
      sabbathTime: sabbathTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    };
  }
  
  return { should: false, reason: "עדיין יותר משעה לכניסת שבת" };
}

// פונקציה לכיבוי המחשב
async function shutdownComputer(reason) {
  const { exec } = require('child_process');
  
  console.log(`🕯️ ${reason}`);
  console.log("💤 כיבוי המחשב לכבוד השבת...");
  
  try {
    // שליחת מייל הודעה על כיבוי לשבת
    await sendMail(
      "🕯️ כיבוי אוטומטי לכבוד השבת",
      `המערכת מבצעת כיבוי אוטומטי לכבוד השבת.\n\nסיבה: ${reason}\nזמן: ${new Date().toLocaleString('he-IL')}\n\nשבת שלום! 🕯️`
    );
    
    console.log("📧 נשלח מייל הודעה על כיבוי לשבת");
  } catch (e) {
    console.log("⚠️ לא ניתן לשלוח מייל הודעה: " + e.message);
  }
  
  // השהייה של 10 שניות לסיום תהליכים
  console.log("⏳ השהייה של 10 שניות לסיום תהליכים...");
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // כיבוי המחשב (Windows)
  exec('shutdown /s /t 0', (error) => {
    if (error) {
      console.log("❌ שגיאה בכיבוי המחשב: " + error.message);
    }
  });
}

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

// פונקציה לחישוב חלוקה חכמה של פרסומים בין פוסטים
function calculateSmartDistribution(selectedPosts, maxPublications) {
  console.log(`🧮 מחשב חלוקה חכמה של ${maxPublications} פרסומים בין ${selectedPosts.length} פוסטים`);
  
  const distribution = [];
  const totalGroups = selectedPosts.reduce((sum, post) => sum + (post.groups?.length || 0), 0);
  
  console.log(`📊 סך הכל קבוצות בפוסטים הנבחרים: ${totalGroups}`);
  
  if (totalGroups <= maxPublications) {
    // יש מספיק מקום לכל הקבוצות
    selectedPosts.forEach(post => {
      const groupsCount = post.groups?.length || 0;
      distribution.push({
        post: post,
        allowedGroups: groupsCount,
        originalGroups: groupsCount
      });
    });
    console.log(`✅ יש מספיק מקום לכל הקבוצות (${totalGroups}/${maxPublications})`);
  } else {
    // צריך לחלק בצורה חכמה
    const averagePerPost = Math.floor(maxPublications / selectedPosts.length);
    const remainder = maxPublications % selectedPosts.length;
    
    console.log(`📐 ממוצע לפוסט: ${averagePerPost}, עודף לחלוקה: ${remainder}`);
    
    let remainingPublications = maxPublications;
    let postsWithExtraSlots = remainder;
    
    // שלב ראשון: חלוקה בסיסית
    selectedPosts.forEach((post, index) => {
      const groupsCount = post.groups?.length || 0;
      let allowedGroups;
      
      if (groupsCount <= averagePerPost) {
        // הפוסט יש לו פחות קבוצות מהממוצע - לוקח הכל
        allowedGroups = groupsCount;
      } else {
        // הפוסט יש לו יותר מהממוצע - מקבל את הממוצע + אולי עוד אחד
        allowedGroups = averagePerPost;
        if (postsWithExtraSlots > 0) {
          allowedGroups += 1;
          postsWithExtraSlots--;
        }
      }
      
      distribution.push({
        post: post,
        allowedGroups: allowedGroups,
        originalGroups: groupsCount
      });
      
      remainingPublications -= allowedGroups;
      console.log(`📝 פוסט ${post.filename}: ${allowedGroups}/${groupsCount} קבוצות`);
    });
    
    // שלב שני: חלוקת עודפים אם יש
    if (remainingPublications > 0) {
      console.log(`📊 נותרו ${remainingPublications} פרסומים לחלוקה`);
      
      for (let i = 0; i < distribution.length && remainingPublications > 0; i++) {
        const item = distribution[i];
        if (item.allowedGroups < item.originalGroups) {
          const canAdd = Math.min(remainingPublications, item.originalGroups - item.allowedGroups);
          item.allowedGroups += canAdd;
          remainingPublications -= canAdd;
          console.log(`➕ פוסט ${item.post.filename}: הוסף ${canAdd} קבוצות (סה"כ: ${item.allowedGroups})`);
        }
      }
    }
  }
  
  const totalAllocated = distribution.reduce((sum, item) => sum + item.allowedGroups, 0);
  console.log(`✅ חלוקה סופית: ${totalAllocated}/${maxPublications} פרסומים מוקצים`);
  
  return distribution;
}

// פונקציה משופרת לבחירת פוסטים ליום עם תמיכה במספר פוסטים וחלוקה חכמה
function selectPostsForDay(allPosts, today = new Date()) {
  const todayStr = today.toISOString().slice(0, 10);
  
  console.log(`📅 בוחר פוסטים ליום ${todayStr}`);
  console.log(`📊 סך הכל פוסטים זמינים: ${allPosts.length}`);
  console.log(`🎯 מטרה: עד ${DAILY_SETTINGS.MAX_POSTS_PER_DAY} פוסטים, עד ${DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY} פרסומים`);
  
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
  
  // לוגיקה חדשה: בחירת מספר פוסטים לפי ההגדרה
  console.log(`📋 מדיניות חדשה: עד ${DAILY_SETTINGS.MAX_POSTS_PER_DAY} פוסטים ביום`);
  
  // שלב 1: הוספת פוסטים מתוזמנים (עדיפות ראשונה)
  const postsToAdd = Math.min(validScheduledPosts.length, DAILY_SETTINGS.MAX_POSTS_PER_DAY);
  for (let i = 0; i < postsToAdd; i++) {
    selectedPosts.push(validScheduledPosts[i]);
    console.log(`⏰ נבחר פוסט מתוזמן ${i + 1}: ${validScheduledPosts[i].filename}`);
  }
  
  // שלב 2: השלמה עם פוסטים פעילים אם נשארו מקומות
  const remainingSlots = DAILY_SETTINGS.MAX_POSTS_PER_DAY - selectedPosts.length;
  
  if (remainingSlots > 0 && activePosts.length > 0) {
    console.log(`📊 נשארו ${remainingSlots} מקומות לפוסטים פעילים`);
    
    // קריאת הפוסט האחרון שפורסם מהקובץ
    let lastPublishedPosts = [];
    try {
      const LAST_POSTS_FILE = require("path").join(__dirname, "last-posts.json");
      if (require("fs").existsSync(LAST_POSTS_FILE)) {
        const lastPostsData = JSON.parse(require("fs").readFileSync(LAST_POSTS_FILE, "utf-8"));
        lastPublishedPosts = lastPostsData.posts || [];
        console.log(`📋 פוסטים אחרונים שפורסמו: ${lastPublishedPosts.join(', ')}`);
      }
    } catch (e) {
      console.log(`⚠️ לא ניתן לקרוא את הפוסטים האחרונים: ${e.message}`);
    }
    
    // מיון הפוסטים הפעילים לפי שם הקובץ ליצירת סדר קבוע
    const sortedActivePosts = activePosts.sort((a, b) => {
      const numA = parseInt(a.filename.match(/post(\d+)\.json/)?.[1] || '0');
      const numB = parseInt(b.filename.match(/post(\d+)\.json/)?.[1] || '0');
      return numA - numB;
    });
    
    console.log(`📋 פוסטים פעילים ממוינים: ${sortedActivePosts.map(p => p.filename).join(', ')}`);
    
    // בחירת פוסטים לפי רוטציה חכמה
    let startIndex = 0;
    
    if (lastPublishedPosts.length > 0) {
      // מצא את הפוסט האחרון ברשימה הממוינת
      const lastPost = lastPublishedPosts[lastPublishedPosts.length - 1];
      const lastIndex = sortedActivePosts.findIndex(p => p.filename === lastPost);
      
      if (lastIndex !== -1) {
        startIndex = (lastIndex + 1) % sortedActivePosts.length;
        console.log(`🔄 רוטציה: הפוסט האחרון היה ${lastPost} (אינדקס ${lastIndex}), מתחיל מאינדקס ${startIndex}`);
      } else {
        console.log(`⚠️ הפוסט האחרון ${lastPost} לא נמצא ברשימה, מתחיל מהראשון`);
      }
    } else {
      console.log(`🆕 אין פוסטים אחרונים רשומים, מתחיל מהראשון`);
    }
    
    // בחירת פוסטים לפי הסדר
    for (let i = 0; i < remainingSlots; i++) {
      if (sortedActivePosts.length === 0) break;
      
      const currentIndex = (startIndex + i) % sortedActivePosts.length;
      const selectedPost = sortedActivePosts[currentIndex];
      
      // בדיקה שלא נבחר כבר פוסט זה
      if (!selectedPosts.find(p => p.filename === selectedPost.filename)) {
        selectedPosts.push(selectedPost);
        console.log(`🔄 נבחר פוסט פעיל ${i + 1}: ${selectedPost.filename} (אינדקס ${currentIndex})`);
      }
    }
    
  // אם יש פחות פוסטים ממה שרוצים - לא חוזרים על פוסטים קיימים, פשוט עוצרים בכמות שיש
  }
  
  console.log(`📋 פוסטים נבחרים סופיים: ${selectedPosts.map(p => `${p.filename} (${p.status}${p.duplicateRun ? ' - חזרה' : ''})`).join(', ')}`);
  console.log(`📊 סה"כ פוסטים להיום: ${selectedPosts.length}`);
  
  // חישוב חלוקה חכמה של פרסומים
  if (DAILY_SETTINGS.ENABLE_SMART_DISTRIBUTION && selectedPosts.length > 0) {
    const distribution = calculateSmartDistribution(selectedPosts, DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY);
    
    // עדכון הפוסטים עם החלוקה החכמה
    selectedPosts.forEach((post, index) => {
      const distItem = distribution[index];
      if (distItem && distItem.allowedGroups < post.groups.length) {
        // שימוש ברוטציה במקום slice רגיל
        post.limitedGroups = selectGroupsWithRotation(post, distItem.allowedGroups);
        post.originalGroupsCount = post.groups.length;
        post.limitedGroupsCount = distItem.allowedGroups;
        console.log(`📊 פוסט ${post.filename}: מוגבל ל-${distItem.allowedGroups} מתוך ${post.groups.length} קבוצות`);
        // הרוטציה כבר נשמרת בקובץ הנפרד, לא צריך לשמור כאן
      }
    });
  }
  
  return selectedPosts;
}

// פונקציה לניקוי שמות קבוצות לפני הכנסה לגוגל שיטס
function cleanGroupName(groupName) {
  if (!groupName) return groupName;
  
  let cleaned = groupName
    // הסרת "| Facebook" בסוף
    .replace(/\s*\|\s*Facebook\s*$/i, '')
    // הסרת "Facebook" בכל מקום
    .replace(/\s*Facebook\s*/gi, '')
    // הסרת סוגריים עם מספרים ופלוסים כמו (20+) או (5)
    .replace(/\(\d+\+?\)\s*/g, '')
    // הסרת pipe symbols מיותרים
    .replace(/\s*\|\s*/g, ' ')
    // הסרת רווחים מיותרים
    .replace(/\s+/g, ' ')
    // הסרת רווחים בהתחלה ובסוף
    .trim();
    
  // אם אחרי הניקוי לא נשאר כלום, החזר "אין שם קבוצה"
  if (!cleaned || cleaned === '') {
    return "אין שם קבוצה";
  }
    
  return cleaned;
}

// פונקציות לניהול מצב רוטציה
function loadRotationStates() {
  try {
    if (fs.existsSync(ROTATION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(ROTATION_STATE_FILE, "utf-8"));
    }
  } catch (e) {
    console.log(`⚠️ שגיאה בטעינת מצב רוטציה: ${e.message}`);
  }
  return {};
}

function saveRotationStates(states) {
  try {
    fs.writeFileSync(ROTATION_STATE_FILE, JSON.stringify(states, null, 2), "utf-8");
    console.log(`💾 מצבי רוטציה נשמרו ל-rotation-states.json`);
  } catch (e) {
    console.log(`⚠️ שגיאה בשמירת מצב רוטציה: ${e.message}`);
  }
}

// פונקציה לבחירת קבוצות עם מנגנון רוטציה
function selectGroupsWithRotation(post, targetCount) {
  // וידוא שיש מערך קבוצות
  if (!post.groups || post.groups.length === 0) {
    return [];
  }
  
  const totalGroups = post.groups.length;
  
  // אם צריך פחות או שווה לכמות הכוללת - אין צורך ברוטציה
  if (targetCount >= totalGroups) {
    return [...post.groups];
  }
  
  // טעינת מצבי רוטציה מהקובץ הנפרד
  const rotationStates = loadRotationStates();
  const postKey = post.filename;
  
  // קריאת מצב הרוטציה הקיים או יצירת חדש
  const rotationState = rotationStates[postKey] || { lastStartIndex: 0, usedCount: 0 };
  
  // חישוב נקודת התחלה חדשה (רוטציה)
  const newStartIndex = (rotationState.lastStartIndex + rotationState.usedCount) % totalGroups;
  
  // בחירת קבוצות החל מהנקודה החדשה
  const selectedGroups = [];
  for (let i = 0; i < targetCount; i++) {
    const index = (newStartIndex + i) % totalGroups;
    selectedGroups.push(post.groups[index]);
  }
  
  // עדכון מצב הרוטציה בקובץ הנפרד
  rotationStates[postKey] = {
    lastStartIndex: newStartIndex,
    usedCount: targetCount,
    lastUpdated: new Date().toISOString()
  };
  
  // שמירה לקובץ
  saveRotationStates(rotationStates);
  
  console.log(`🔄 רוטציה בפוסט ${post.filename}: התחלה מאינדקס ${newStartIndex}, נבחרו ${targetCount} קבוצות`);
  if (newStartIndex > 0) {
    console.log(`   ↳ דילוג על ${newStartIndex} קבוצות ראשונות להוגנות`);
  }
  
  return selectedGroups;
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
  // בדיקה אם יש פרמטר --force-late שעוקף את בדיקת השעה
  if (process.argv.includes('--force-late')) {
    console.log("🕒 Force late mode - ignoring hour check");
    return false;
  }
  
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

    // בדיקה אם רץ עם פרמטר --force-late
    if (process.argv.includes('--force-late')) {
      console.log("🌙 ⚠️  מצב פרסום מאוחר מופעל - עוקף את בדיקת השעה!");
      console.log("🕒 הפרסום ירוץ גם אחרי שעה 23:00");
    }

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
    const LAST_POST_FILE = path.join(__dirname, "last-post.txt"); // ← לתאימות לאחור
    const LAST_POSTS_FILE = path.join(__dirname, "last-posts.json"); // ← חדש למספר פוסטים

    const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
    const log = (text) => {
      const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).replace(" ", "T");
      const line = `[${timestamp}] ${text}`;
      console.log(text);
      logStream.write(line + "\n");
    };

    const day = new Date().getDay();
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // ========== בדיקת כיבוי לשבת ==========
    log("🕯️ בודק אם צריך לכבות מחשב לקראת שבת...");
    const sabbathCheck = shouldShutdownForSabbath();
    if (sabbathCheck.should) {
      log(`🕯️ זמן כיבוי לשבת! ${sabbathCheck.reason}`);
      log(`⏰ כניסת שבת ב-${sabbathCheck.sabbathTime} (עוד ${sabbathCheck.minutesUntil} דקות)`);
      await shutdownComputer(sabbathCheck.reason);
      return; // הקוד לא יגיע לכאן בגלל הכיבוי
    } else {
      log(`✅ ${sabbathCheck.reason}`);
    }

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

    // מייל התחלת פרסום מהקוד הישן - בוטל
    /*
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
      const timeStr = now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });
      
      // הוספת מידע על הגדרות הפרסום למייל
      const settingsInfo = `
📊 הגדרות פרסום יומי:
• מקסימום פוסטים: ${DAILY_SETTINGS.MAX_POSTS_PER_DAY}
• מקסימום פרסומים: ${DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY}
• חלוקה חכמה: ${DAILY_SETTINGS.ENABLE_SMART_DISTRIBUTION ? 'מופעלת' : 'כבויה'}
• השהייה בין פוסטים: ${DAILY_SETTINGS.DELAY_BETWEEN_POSTS_MINUTES} דקות
      `.trim();
      
      await sendMail(
        "הפרסום היומי שלך התחיל ✨",
        `בוקר טוב 😊\n\nהפרסום שלך בקבוצות פייסבוק התחיל\n\nתאריך פרסום: ${dateStr}\n\nשעת התחלה: ${timeStr}\n\n${settingsInfo}\n\nשיהיה לכם יום נפלא!\n\nPostify`,
        `<div dir="rtl" style="text-align:right;font-family:Arial,sans-serif;">
          בוקר טוב 😊<br><br>
          הפרסום שלך בקבוצות פייסבוק התחיל<br><br>
          <b>תאריך פרסום:</b> ${dateStr}<br>
          <b>שעת התחלה:</b> ${timeStr}<br><br>
          <div style="background-color:#f0f8ff;padding:10px;border-radius:5px;margin:10px 0;">
            <b>📊 הגדרות פרסום יומי:</b><br>
            • מקסימום פוסטים: <b>${DAILY_SETTINGS.MAX_POSTS_PER_DAY}</b><br>
            • מקסימום פרסומים: <b>${DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY}</b><br>
            • חלוקה חכמה: <b>${DAILY_SETTINGS.ENABLE_SMART_DISTRIBUTION ? 'מופעלת' : 'כבויה'}</b><br>
            • השהייה בין פוסטים: <b>${DAILY_SETTINGS.DELAY_BETWEEN_POSTS_MINUTES} דקות</b>
          </div>
          שיהיה לכם יום נפלא!<br>
          <b>Postify</b>
        </div>`
      );
      log("📧 Email sent - advertising started");
    } catch (e) {
      log("❌ שגיאה בשליחת מייל תחילת פרסום: " + e.message);
      await sendErrorMail("❌ שגיאה בשליחת מייל תחילת פרסום", e.message);
    }
    */

    // בדיקה אם היום שבת, חג או יום זיכרון
    if (DAILY_SETTINGS.ENABLE_SABBATH_SHUTDOWN) {
      // מצב רגיל: לא פועל בשבת וחגים
      if (day === 6 || jewishHolidaysAndMemorials.includes(todayStr)) {
        log("🛑 שבת, חג או יום זיכרון — אין פרסום היום.");
        process.exit(0);
      }
    } else {
      // מצב מבוטל הגבלת שבת: פועל כל השבוע כולל שבת, אך לא בחגים
      if (jewishHolidaysAndMemorials.includes(todayStr)) {
        log("🛑 חג או יום זיכרון — אין פרסום היום.");
        process.exit(0);
      }
      log("✅ הגבלת שבת מבוטלת: מפרסם כל השבוע כולל שבת (חוץ מחגים).");
    }

    async function countdown(seconds) {
      for (let i = seconds; i > 0; i--) {
        process.stdout.write(`⏳ ${i}s remaining...\r`);
        await new Promise(r => setTimeout(r, 1000));
      }
      console.log();
    }

    // פונקציה להשהייה בין פוסטים עם countdown מפורט
    async function delayBetweenPosts(postIndex, totalPosts) {
      if (DAILY_SETTINGS.DELAY_BETWEEN_POSTS_MINUTES <= 0) {
        log("⚡ אין השהייה בין פוסטים (מוגדר ל-0 דקות)");
        return;
      }
      
      if (postIndex < totalPosts - 1) { // לא להשהות אחרי הפוסט האחרון
        const delaySeconds = DAILY_SETTINGS.DELAY_BETWEEN_POSTS_MINUTES * 60;
        const minutes = Math.floor(delaySeconds / 60);
        const seconds = delaySeconds % 60;
        
        log(`⏱️ השהייה בין פוסטים: ${minutes} דקות ו-${seconds} שניות`);
        log(`📊 פוסט ${postIndex + 1}/${totalPosts} הושלם, ממתין לפני פוסט ${postIndex + 2}`);
        
        // עדכון heartbeat במהלך ההשהייה
        updateHeartbeat({
          group: 'delay-between-posts',
          postFile: `waiting-before-post-${postIndex + 2}`,
          status: 'waiting',
          index: postIndex,
          delayMinutes: DAILY_SETTINGS.DELAY_BETWEEN_POSTS_MINUTES
        });
        
        await countdown(delaySeconds);
        log(`✅ השהייה הושלמה, עובר לפוסט ${postIndex + 2}`);
      }
    }

    // ============ לולאת פרסום חדשה עם resume, heartbeat וללא דוח יומי ============
    async function runPostsForToday(postsToday, isSpecificPost = false) {
      if (postsToday.length === 0) {
        log("✅ אין פוסטים מתאימים להיום.");
        await logToSheet("Day finished", "Success", "", "אין פוסטים מתאימים להיום");
        // הוספת כיבוי אוטומטי
        log("🛑 אין פוסטים להיום - מבצע כיבוי אוטומטי של השרת...");
        const { exec } = require("child_process");
        setTimeout(() => {
          exec("shutdown /s /f /t 0", (shutdownError) => {
            if (shutdownError) {
              log("❌ שגיאה בכיבוי: " + shutdownError.message);
            }
          });
        }, 10000); // 10 שניות המתנה לפני כיבוי
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
        
        // הודעה על מערכת מעקב כשלונות רצופים
        if (pi === startPost) {
          log("🔍 מערכת מעקב כשלונות רצופים פעילה - התראה דחופה תישלח אחרי 5 כשלונות קבוצות שונות ברצף");
        }
        
        // בדיקת עצירה לפי שעה בכל פוסט
        if (shouldStopByHour()) {
          log("🛑 עצירה בגלל שעה מאוחרת (אחרי 23:00). ממשיך מחר.");
          await logToSheet("Day stopped", "Stopped", "", "השעה מאוחרת, ממשיך מחר");
          await sendErrorMail("🛑 עצירה בגלל שעה מאוחרת", "הפרסום נעצר בגלל שעה מאוחרת. ימשיך מחר.");
          updateHeartbeat({ group: "stopped-by-hour", postFile: post.filename, status: 'stopped', index: pi });
          return;
        }
        
        // קביעת רשימת הקבוצות לפרסום (מוגבלת או מלאה)
        const groupsToPublish = post.limitedGroups || post.groups;
        const isLimited = !!post.limitedGroups;
        
        if (isLimited) {
          log(`📊 פוסט ${post.filename}: מפרסם ב-${groupsToPublish.length} מתוך ${post.originalGroupsCount} קבוצות (הגבלה חכמה)`);
        } else {
          log(`📊 פוסט ${post.filename}: מפרסם בכל ${groupsToPublish.length} הקבוצות`);
        }
        
        for (let gi = (pi === startPost ? startGroup : 0); gi < groupsToPublish.length; gi++) {
          const groupUrl = groupsToPublish[gi];

          log(`📢 posting to group(${gi + 1}/${groupsToPublish.length}): ${groupUrl}`);
          await logToSheet("Publishing to group", "Started", groupUrl, `Group ${gi + 1}/${groupsToPublish.length} - Post ${pi + 1}/${postsToday.length}`, post.title || post.filename);

          // לפני ניסיון פרסום
          updateHeartbeat({
            group: groupUrl,
            postFile: post.filename,
            status: 'before',
            index: gi,
            postIndex: pi
          });

          let retryCount = 0;
          let success = false;

          while (retryCount < 1 && !success) {
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

              // העברת פרמטר retry כדי שpost.js לא יתעד בניסיונות ביניים
              const isRetry = retryCount > 0;
              const isLastAttempt = true; // תמיד הניסיון האחרון (1/1)
              const groupPostIdentifier = `Group ${gi + 1}/${groupsToPublish.length} - Post ${pi + 1}/${postsToday.length}`;
              const retryParam = "--first"; // תמיד הניסיון הראשון והאחרון
              const lastAttemptParam = "--last"; // תמיד הניסיון האחרון
              const child = spawn("node", ["post.js", groupUrl, post.filename, retryParam, groupPostIdentifier, lastAttemptParam], { stdio: "inherit" });

              // --- Timeout ---
              const TIMEOUT = 6 * 60 * 1000;
              let mailSent = false; // דגל למנוע שליחת מייל כפולה
              let timeoutId = setTimeout(async () => {
                log(`⏰ Timeout! post.js לקח יותר מ־6 דקות. סוגר תהליך וממשיך...`);
                child.kill("SIGKILL");
                
                // תיעוד timeout לגוגל שיטס (תמיד הניסיון הסופי)
                try {
                  const groupName = fs.readFileSync(CURRENT_GROUP_NAME_FILE, "utf-8").trim();
                  await logToSheet("Post failed", "Error", cleanGroupName(groupName), `Group ${gi + 1}/${groupsToPublish.length} - Post ${pi + 1}/${postsToday.length}`, post.title || post.filename, "הפרסום נתקע (timeout) ונעצר אוטומטית");
                  log("📊 Timeout נרשם לגוגל שיטס");
                } catch (e) {
                  log("⚠️ שגיאה ברישום timeout לגוגל שיט: " + e.message);
                }
                
                // מייל timeout בוטל - יש רישום לגוגל שיטס ומנגנון 5 שגיאות ברצף
              }, TIMEOUT);

              // --- עדכון state ---
              fs.writeFileSync(STATE_POST_FILE, JSON.stringify({
                date: todayStr, postIndex: pi, groupIndex: gi
              }), "utf-8");

              child.on("exit", async (code) => {
                clearTimeout(timeoutId);
                const now = new Date();
                const groupTime = now.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
                
                // המתן רגע קצר לוודא ששם הקבוצה נשמר
                await new Promise(r => setTimeout(r, 1000));
                
                // קריאת שם הקבוצה
                let groupName;
                try {
                  groupName = fs.readFileSync(CURRENT_GROUP_NAME_FILE, "utf-8").trim();
                  console.log(`🔍 Group name read from file: "${groupName}"`);
                  console.log(`🔍 Original group URL: "${groupUrl}"`);
                  
                  // בדיקה אם שם הקבוצה תקין (לא ריק ולא URL)
                  if (!groupName || groupName === groupUrl || groupName.startsWith('http')) {
                    console.log("⚠️ Group name seems invalid, using URL as fallback");
                    groupName = groupUrl;
                  }
                } catch (e) {
                  console.log(`❌ Failed to read group name file: ${e.message}`);
                  groupName = groupUrl;
                  await sendErrorMail("⚠️ שגיאה בקריאת שם הקבוצה", `לא ניתן לקרוא את שם הקבוצה: ${e.message}`);
                }
                
                if (code === 0) {
                  success = true;
                  log(`✅ פורסם בהצלחה בקבוצה: ${groupName}`);
                  
                  // איפוס כשלונות רצופים בהצלחה
                  resetConsecutiveFailures();
                  
                  // רישום הצלחה לגוגל שיטס תמיד (בלי קשר לניסיון)
                  try {
                    const notesText = `Group ${gi + 1}/${groupsToPublish.length} - Post ${pi + 1}/${postsToday.length}`;
                    
                    // בדיקה אם יש נתוני סטטוס מקובץ זמני
                    let statusData = null;
                    const tempStatusPath = path.join(__dirname, 'temp-status-data.json');
                    try {
                      if (fs.existsSync(tempStatusPath)) {
                        const statusText = fs.readFileSync(tempStatusPath, 'utf8');
                        statusData = JSON.parse(statusText);
                        // מחיקת הקובץ הזמני אחרי השימוש
                        fs.unlinkSync(tempStatusPath);
                        console.log("📊 מוסיף נתוני סטטוס לגיליון:", statusData);
                      }
                    } catch (statusError) {
                      console.log("⚠️ שגיאה בקריאת נתוני סטטוס:", statusError.message);
                    }
                    
                    await logToSheet('Publishing finished', 'Success', cleanGroupName(groupName), notesText, post.title || post.filename, '', statusData);
                    
                    log("📊 הצלחה נרשמה לגוגל שיטס" + (statusData ? " (עם נתוני סטטוס)" : ""));
                  } catch (e) {
                    log("⚠️ שגיאה ברישום הצלחה לגוגל שיט: " + e.message);
                  }
                  console.log("✅ Post completed successfully");
                } else {
                  // הפרסום נכשל - רושמים שגיאה עם הסבר בעברית
                  let errorReason = "שגיאה לא מזוהה";
                  
                  // במקרה שבו code הוא null - סימן לתהליך שנהרג או timeout
                  if (code === null) {
                    errorReason = "התהליך נהרג או נתקע (timeout/killed)";
                  } else {
                    switch (code) {
                      case 1:
                        errorReason = "לא נמצא כפתור כתיבה בקבוצה או שגיאה כללית בפרסום";
                        break;
                      case 2:
                        errorReason = "שגיאה בגישה לקבוצה או בטעינת הדף";
                        break;
                      case 3:
                        errorReason = "שגיאה בהעלאת תמונות או וידאו";
                        break;
                      case 124:
                        errorReason = "הפרסום נתקע (timeout) ונעצר אוטומטית";
                        break;
                      case 130:
                        errorReason = "התהליך הופסק ידנית (Ctrl+C)";
                        break;
                      case 137:
                        errorReason = "התהליך הושמד בכוח (killed)";
                        break;
                      default:
                        errorReason = `שגיאה כללית (קוד יציאה: ${code})`;
                    }
                  }
                  
                  log(`❌ שגיאה בפרסום לקבוצה ${groupName}: ${errorReason}`);
                  
                  // רישום כשלון קבוצה למערכת המעקב
                  recordGroupFailure(cleanGroupName(groupName), groupUrl, errorReason);
                  
                  log("❌ מעבר לקבוצה הבאה אחרי כישלון");
                  // תיעוד השגיאה לגוגל שיטס
                  try {
                    await logToSheet("Post failed", "Error", cleanGroupName(groupName), `Group ${gi + 1}/${groupsToPublish.length} - Post ${pi + 1}/${postsToday.length}`, post.title || post.filename, errorReason);
                    log("📊 שגיאה נרשמה לגוגל שיטס");
                  } catch (e) {
                    log("⚠️ שגיאה ברישום לגוגל שיט: " + e.message);
                    await sendErrorMail("⚠️ שגיאה ברישום לגוגל שיט", `לא ניתן לרשום את התוצאה לגוגל שיט: ${e.message}`);
                  }
                  // מייל שגיאה בוטל - יש רישום לגוגל שיטס ומנגנון 5 שגיאות ברצף
                }

                // העלאת הcounter לפני ההשהיה
                retryCount++;

                // --- השהייה רנדומלית מה-config (רק בין קבוצות) ---
                if (!skipDelay && success) { // רק אם הפרסום הצליח (ועוברים לקבוצה הבאה)
                  const delaySec = config.minDelaySec + Math.floor(Math.random() * (config.maxDelaySec - config.minDelaySec + 1));
                  const minutes = Math.floor(delaySec / 60);
                  const seconds = delaySec % 60;
                  log(`⏱ ממתין ${minutes} דקות ו־${seconds} שניות לפני הקבוצה הבאה...`);
                  await countdown(delaySec);
                } else if (skipDelay) {
                  log(`⚡ דילוג על השהייה (--now)`);
                } else if (!success) {
                  log(`⚡ דילוג על השהייה (כישלון)`);
                }

                resolve();
              });
              
              // הוספת טיפול בשגיאות תהליך
              child.on("error", async (error) => {
                clearTimeout(timeoutId);
                log(`❌ שגיאה בהרצת post.js: ${error.message}`);
                
                // עדכון heartbeat בשגיאה
                updateHeartbeat({ group: groupUrl, postFile: post.filename, status: 'error', index: gi });

                log("⏭️ מדלג לקבוצה הבאה אחרי שגיאת תהליך...");
                
                // תיעוד שגיאת תהליך לגוגל שיטס
                try {
                  const groupName = fs.readFileSync(CURRENT_GROUP_NAME_FILE, "utf-8").trim();
                  await logToSheet("Post failed", "Error", cleanGroupName(groupName), `Group ${gi + 1}/${groupsToPublish.length} - Post ${pi + 1}/${postsToday.length}`, post.title || post.filename, `שגיאה בהרצת post.js: ${error.message}`);
                  log("📊 שגיאת תהליך נרשמה לגוגל שיטס");
                } catch (e) {
                  log("⚠️ שגיאה ברישום שגיאת תהליך לגוגל שיט: " + e.message);
                }
                
                // מייל שגיאה בוטל - יש רישום לגוגל שיטס ומנגנון 5 שגיאות ברצף
                
                resolve();
              });
            });
          }
        }
        // עדכון אחרי שכל הקבוצות פורסמו
        post.lastPublished = new Date().toISOString().slice(0,10);
        post.publishCount = (post.publishCount || 0) + 1;
        
        fs.writeFileSync(path.join(POSTS_FOLDER, post.filename), JSON.stringify(post, null, 2), "utf-8");
        
        // עדכון heartbeat אחרי סיום פוסט
        updateHeartbeat({
          group: 'post-completed',
          postFile: post.filename,
          status: 'completed',
          index: pi
        });
        
        log(`✅ פוסט ${post.filename} הושלם (${pi + 1}/${postsToday.length})`);
        
        // השהייה בין פוסטים (רק אם זה לא הפוסט האחרון)
        await delayBetweenPosts(pi, postsToday.length);
      }
      
      // שמירת הפוסטים האחרונים שפורסמו (מעודכן למספר פוסטים)
      try {
        const LAST_POSTS_FILE = path.join(__dirname, "last-posts.json");
        
        // שמירת כל הפוסטים הפעילים שפורסמו (לרוטציה נכונה)
        const activePostsPublished = postsToday.filter(p => !p.duplicateRun && isActivePost(p)).map(p => p.filename);
        
        const publishedPostsData = {
          date: todayStr,
          posts: activePostsPublished, // רק פוסטים פעילים לרוטציה
          allPosts: postsToday.filter(p => !p.duplicateRun).map(p => p.filename), // כל הפוסטים לרישום
          totalPosts: postsToday.length,
          totalPublications: postsToday.reduce((sum, post) => {
            const groupsCount = post.limitedGroups ? post.limitedGroups.length : (post.groups?.length || 0);
            return sum + groupsCount;
          }, 0)
        };
        
        fs.writeFileSync(LAST_POSTS_FILE, JSON.stringify(publishedPostsData, null, 2));
        log(`📝 נשמרו פוסטים אחרונים לרוטציה: ${publishedPostsData.posts.join(', ')}`);
        log(`📋 כל הפוסטים שפורסמו: ${publishedPostsData.allPosts.join(', ')}`);
        log(`📊 סיכום: ${publishedPostsData.totalPosts} פוסטים, ${publishedPostsData.totalPublications} פרסומים`);
        
        // שמירה גם לקובץ הישן לתאימות לאחור
        const LAST_POST_FILE = path.join(__dirname, "last-post.txt");
        if (publishedPostsData.allPosts.length > 0) {
          fs.writeFileSync(LAST_POST_FILE, publishedPostsData.allPosts[publishedPostsData.allPosts.length - 1]);
        }
      } catch (e) {
        log("⚠️ שגיאה בשמירת הפוסטים האחרונים: " + e.message);
      }
      
      // בדיקה אם פוסטים צריכים להסתיים
      for (const post of postsToday) {
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
          fs.writeFileSync(path.join(POSTS_FOLDER, post.filename), JSON.stringify(post, null, 2), "utf-8");
        }
      }
      log("✅ כל הפוסטים להיום פורסמו.");

      // יצירת סיכום יומי מפורט
      const totalPublications = postsToday.reduce((sum, post) => {
        return sum + (post.limitedGroups ? post.limitedGroups.length : (post.groups?.length || 0));
      }, 0);
      
      const summaryReport = {
        date: todayStr,
        postsPublished: postsToday.length,
        totalPublications: totalPublications,
        scheduledPosts: postsToday.filter(p => p.status === 'scheduled').length,
        activePosts: postsToday.filter(p => p.status === 'active').length,
        duplicateRuns: postsToday.filter(p => p.duplicateRun).length,
        settings: {
          maxPostsPerDay: DAILY_SETTINGS.MAX_POSTS_PER_DAY,
          maxPublicationsPerDay: DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY,
          smartDistribution: DAILY_SETTINGS.ENABLE_SMART_DISTRIBUTION,
          delayBetweenPostsMinutes: DAILY_SETTINGS.DELAY_BETWEEN_POSTS_MINUTES
        }
      };
      
      log(`📊 סיכום יומי:
        📅 תאריך: ${summaryReport.date}
        📝 פוסטים שפורסמו: ${summaryReport.postsPublished}/${summaryReport.settings.maxPostsPerDay}
        📢 פרסומים כולל: ${summaryReport.totalPublications}/${summaryReport.settings.maxPublicationsPerDay}
        ⏰ מתוזמנים: ${summaryReport.scheduledPosts}
        🔄 פעילים: ${summaryReport.activePosts}
        🔁 חזרות: ${summaryReport.duplicateRuns}
        ⏱️ השהייה בין פוסטים: ${summaryReport.settings.delayBetweenPostsMinutes} דקות`);

      // מחיקת סטייט כי סיימנו בהצלחה
      if (fs.existsSync(STATE_POST_FILE)) fs.unlinkSync(STATE_POST_FILE);
      
      // עדכון heartbeat סיום
      updateHeartbeat({ group: "all-finished", postFile: "completed", status: 'finished', index: -1 });

      // סיום יום: log-cost, מייל סגירה, כיבוי (רק אם לא פוסט ספציפי)
      if (!isSpecificPost) {
        // שליחת מייל סיכום עם הנתונים החדשים - בוטל
        /*
        try {
          const now = new Date();
          const endTimeStr = now.toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem' });
          
          const summaryText = `
📊 סיכום הפרסום היומי:

📅 תאריך: ${summaryReport.date}
🕒 שעת סיום: ${endTimeStr}

📈 תוצאות:
• פוסטים שפורסמו: ${summaryReport.postsPublished}/${summaryReport.settings.maxPostsPerDay}
• סך פרסומים: ${summaryReport.totalPublications}/${summaryReport.settings.maxPublicationsPerDay}
• פוסטים מתוזמנים: ${summaryReport.scheduledPosts}
• פוסטים פעילים: ${summaryReport.activePosts}
${summaryReport.duplicateRuns > 0 ? `• חזרות על פוסטים: ${summaryReport.duplicateRuns}` : ''}

⚙️ הגדרות שהיו פעילות:
• מקס' פוסטים ביום: ${summaryReport.settings.maxPostsPerDay}
• מקס' פרסומים ביום: ${summaryReport.settings.maxPublicationsPerDay}
• חלוקה חכמה: ${summaryReport.settings.smartDistribution ? 'מופעלת' : 'כבויה'}
• השהייה בין פוסטים: ${summaryReport.settings.delayBetweenPostsMinutes} דקות

הפרסום הושלם בהצלחה! 🎉

Postify
          `.trim();
          
          const summaryHtml = `
<div dir="rtl" style="text-align:right;font-family:Arial,sans-serif;">
  <h2 style="color:#4CAF50;">📊 סיכום הפרסום היומי</h2>
  
  <div style="background-color:#f9f9f9;padding:15px;border-radius:8px;margin:10px 0;">
    <b>📅 תאריך:</b> ${summaryReport.date}<br>
    <b>🕒 שעת סיום:</b> ${endTimeStr}
  </div>
  
  <div style="background-color:#e8f5e8;padding:15px;border-radius:8px;margin:10px 0;">
    <h3 style="color:#2e7d32;">📈 תוצאות:</h3>
    • <b>פוסטים שפורסמו:</b> ${summaryReport.postsPublished}/${summaryReport.settings.maxPostsPerDay}<br>
    • <b>סך פרסומים:</b> ${summaryReport.totalPublications}/${summaryReport.settings.maxPublicationsPerDay}<br>
    • <b>פוסטים מתוזמנים:</b> ${summaryReport.scheduledPosts}<br>
    • <b>פוסטים פעילים:</b> ${summaryReport.activePosts}<br>
    ${summaryReport.duplicateRuns > 0 ? `• <b>חזרות על פוסטים:</b> ${summaryReport.duplicateRuns}<br>` : ''}
  </div>
  
  <div style="background-color:#fff3e0;padding:15px;border-radius:8px;margin:10px 0;">
    <h3 style="color:#f57c00;">⚙️ הגדרות שהיו פעילות:</h3>
    • <b>מקס' פוסטים ביום:</b> ${summaryReport.settings.maxPostsPerDay}<br>
    • <b>מקס' פרסומים ביום:</b> ${summaryReport.settings.maxPublicationsPerDay}<br>
    • <b>חלוקה חכמה:</b> ${summaryReport.settings.smartDistribution ? 'מופעלת' : 'כבויה'}<br>
    • <b>השהייה בין פוסטים:</b> ${summaryReport.settings.delayBetweenPostsMinutes} דקות
  </div>
  
  <div style="text-align:center;color:#4CAF50;font-size:18px;margin:20px 0;">
    <b>הפרסום הושלם בהצלחה! 🎉</b>
  </div>
  
  <div style="text-align:center;color:#666;font-size:14px;">
    <b>Postify</b>
  </div>
</div>
          `.trim();
          
          await sendMail(
            "הפרסום היומי הושלם בהצלחה ✅",
            summaryText,
            summaryHtml
          );
          log("📧 מייל סיכום יומי נשלח בהצלחה");
        } catch (mailError) {
          log("⚠️ שגיאה בשליחת מייל סיכום: " + mailError.message);
        }
        */
        
        // ========== בדיקה נוספת לכיבוי שבת אחרי הפרסום ==========
        log("🕯️ בודק שוב אם צריך לכבות מחשב לקראת שבת...");
        const finalSabbathCheck = shouldShutdownForSabbath();
        if (finalSabbathCheck.should) {
          log(`🕯️ זמן כיבוי לשבת אחרי הפרסום! ${finalSabbathCheck.reason}`);
          log(`⏰ כניסת שבת ב-${finalSabbathCheck.sabbathTime} (עוד ${finalSabbathCheck.minutesUntil} דקות)`);
          await shutdownComputer(`סיום פרסום - ${finalSabbathCheck.reason}`);
          return; // הקוד לא יגיע לכאן בגלל הכיבוי
        } else {
          log(`✅ אחרי פרסום: ${finalSabbathCheck.reason}`);
        }
        
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
                  log("🛑 כיבוי השרת עכשיו...");
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
      
      // בדוק אם יש פוסטים שכבר ב-paused בגלל כפילויות קודמות
      const alreadyPausedDueToDuplicates = allPosts.filter(p => 
        p.status === 'paused' && 
        p.schedule_type && 
        (p.schedule_type === 'weekly' || p.schedule_type === 'monthly' || p.schedule_type === 'one-time')
      );
      
      if (alreadyPausedDueToDuplicates.length > 0) {
        console.log(`ℹ️ נמצאו ${alreadyPausedDueToDuplicates.length} פוסטים שכבר ב-paused (ככל הנראה בגלל כפילויות קודמות)`);
        alreadyPausedDueToDuplicates.forEach(p => {
          console.log(`   - ${p.filename}: ${p.title || 'ללא שם'} (${p.schedule_type})`);
        });
      }
      
      // בדוק אם צריך למנוע כפילויות לפי מגבלת הפוסטים היומית
      const maxPostsPerDay = DAILY_SETTINGS.MAX_POSTS_PER_DAY || 1;
      const shouldPreventDuplicates = maxPostsPerDay === 1;
      
      console.log(`📊 מגבלת פוסטים יומית: ${maxPostsPerDay}`);
      console.log(`🚫 מניעת כפילויות: ${shouldPreventDuplicates ? 'מופעלת' : 'מושבתת'} (${shouldPreventDuplicates ? 'פוסט אחד ביום' : 'מספר פוסטים מותר'})`);
      
      // הוסף קודם פוסטים לא מתוזמנים (לא נבדקים לכפילויות)
      validPosts.push(...nonScheduledPosts);
      
      // בדוק פוסטים מתוזמנים לכפילויות - רק אם מוגדר פוסט אחד ביום
      if (shouldPreventDuplicates) {
        console.log('🔍 מבצע בדיקת כפילויות (מוגבל לפוסט אחד ביום)');
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
      } else {
        console.log('✅ מדלג על בדיקת כפילויות (מותרים מספר פוסטים ביום)');
        // אם לא צריך למנוע כפילויות, פשוט הוסף את כל הפוסטים המתוזמנים
        validPosts.push(...scheduledPosts);
      }
      
      // שליחת מייל על כפילויות שזוהו (אם יש) - רק אם הופעלה בדיקת כפילויות ונמצאו כפילויות
      if (shouldPreventDuplicates && pausedDueToDuplicates.length > 0) {
        console.log(`📧 נשלח מייל על ${pausedDueToDuplicates.length} פוסטים שעברו ל-paused עכשיו`);
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
      } else if (shouldPreventDuplicates) {
        console.log(`✅ לא נמצאו כפילויות חדשות לדיווח`);
      } else {
        console.log(`ℹ️ בדיקת כפילויות לא הופעלה (מותרים ${maxPostsPerDay} פוסטים ביום)`);
      }
      
      console.log(`✅ וולידציה הושלמה: ${validPosts.length} פוסטים סך הכל`);
      if (shouldPreventDuplicates && pausedDueToDuplicates.length > 0) {
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
        
        // אם הצלחנו לקרוא את התיקייה, ננקה קובץ מעקב ניסיונות restart
        const RESTART_COUNTER_FILE = "C:\\postify\\posts\\restart-counter.json";
        try {
          if (fs.existsSync(RESTART_COUNTER_FILE)) {
            fs.unlinkSync(RESTART_COUNTER_FILE);
            log("✅ קובץ מעקב restart נמחק - המערכת עובדת תקין");
          }
        } catch (e) {
          // לא חשוב אם נכשל - זה רק ניקוי
        }
        
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
            
            // מנגנון הגנה מתקדם עם מעקב ניסיונות
            const RESTART_COUNTER_FILE = "C:\\postify\\posts\\restart-counter.json";
            let restartCount = 0;
            
            // קריאת מספר ניסיונות קודמים
            try {
              if (fs.existsSync(RESTART_COUNTER_FILE)) {
                const restartData = JSON.parse(fs.readFileSync(RESTART_COUNTER_FILE, 'utf-8'));
                const now = new Date();
                const lastError = new Date(restartData.lastError);
                // אם השגיאה האחרונה הייתה לפני פחות מ-30 דקות, נמשיך את הספירה
                if (now - lastError < 30 * 60 * 1000) {
                  restartCount = restartData.count || 0;
                }
              }
            } catch (e) {
              log("⚠️ לא ניתן לקרוא קובץ מעקב ניסיונות: " + e.message);
            }
            
            restartCount++;
            
            // שמירת מספר הניסיונות
            try {
              fs.writeFileSync(RESTART_COUNTER_FILE, JSON.stringify({
                count: restartCount,
                lastError: new Date().toISOString(),
                error: lastPostsFolderError ? lastPostsFolderError.message : "Unknown"
              }));
            } catch (e) {
              log("⚠️ לא ניתן לשמור קובץ מעקב ניסיונות: " + e.message);
            }
            
            if (restartCount === 1) {
              // ניסיון ראשון - restart מיידי
              await sendErrorMail(
                "❌ שגיאה ראשונה – תיקיית פוסטים לא קיימת",
                `ניסיון 1/3: המערכת ניסתה פעמיים ולא הצליחה לגשת לתיקיית הפוסטים.\n\nשגיאה:\n${lastPostsFolderError ? lastPostsFolderError.message : ""}\n\nIP: ${ip}\n\nהמחשב יעשה restart בעוד 60 שניות...`
              );
              log("⚠️ ניסיון 1/3 - המחשב יעשה restart בעוד 60 שניות...");
              await new Promise(r => setTimeout(r, 60000));
            } else if (restartCount === 2) {
              // ניסיון שני - המתנה 5 דקות ואז restart
              await sendErrorMail(
                "🔥 שגיאה שנייה – תיקיית פוסטים לא קיימת",
                `ניסיון 2/3: בעיה חוזרת! המערכת כבר עשתה restart פעם אחת.\n\nשגיאה:\n${lastPostsFolderError ? lastPostsFolderError.message : ""}\n\nIP: ${ip}\n\nהמחשב יחכה 5 דקות ויעשה restart נוסף...`
              );
              log("� ניסיון 2/3 - המתנה 5 דקות לפני restart...");
              await new Promise(r => setTimeout(r, 5 * 60000)); // 5 דקות
            } else {
              // ניסיון שלישי - שגיאה חמורה וכיבוי
              await sendErrorMail(
                "🚨 שגיאה חמורה – כישלון קריטי במערכת",
                `ניסיון 3/3 - כישלון חמור!\n\nהמערכת נכשלה 3 פעמים ברציפות לגשת לתיקיית הפוסטים.\nזוהי בעיה קריטית שדורשת התערבות מנהל מערכת.\n\nשגיאה:\n${lastPostsFolderError ? lastPostsFolderError.message : ""}\n\nIP: ${ip}\n\nהמחשב יכבה עכשיו.\n\n=== פעולות מומלצות ===\n1. בדוק את תיקיית הפוסטים\n2. וודא שיש גישה לרשת\n3. בדוק את instance-name.txt\n4. הפעל מחדש ידנית`
              );
              log("🚨 ניסיון 3/3 - שגיאה חמורה! המחשב יכבה עכשיו...");
              
              // מחיקת קובץ המעקב לאיפוס
              try {
                fs.unlinkSync(RESTART_COUNTER_FILE);
              } catch (e) {}
              
              await new Promise(r => setTimeout(r, 10000)); // 10 שניות להודעות
              
              // כיבוי המחשב
              log("🛑 מכבה את המחשב...");
              const { exec } = require("child_process");
              exec("shutdown /s /f /t 0", (shutdownError) => {
                if (shutdownError) {
                  log("❌ שגיאה בכיבוי: " + shutdownError.message);
                  process.exit(1);
                }
              });
              return; // לא מגיעים לקוד הrestart
            }
            
            // restart המחשב (רק לניסיון 1 ו-2)
            log("🔄 מבצע restart למחשב...");
            const { exec } = require("child_process");
            exec("shutdown /r /f /t 0", (restartError) => {
              if (restartError) {
                log("❌ שגיאה ב-restart: " + restartError.message);
                process.exit(1);
              }
            });
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
    
    // בחירת פוסטים להיום עם הגבלת פוסטים ועדיפות למתוזמנים
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
    
    // דוח יומי מעודכן עם המידע החדש
    if (!specificPostFile) {
      const endingPosts = validatedPosts.filter(post => isPostEndingToday(post, today));
      if (endingPosts.length > 0) {
        log(`📋 פוסטים שמסתיימים היום: ${endingPosts.map(p => p.filename).join(', ')}`);
      }
      
      // דוח על פוסטים שהועברו לpaused בגלל כפילויות
      if (pausedDueToDuplicates.length > 0) {
        log(`⚠️ פוסטים שהועברו ל-paused בגלל כפילויות: ${pausedDueToDuplicates.map(p => p.filename).join(', ')}`);
      }
      
      // דוח מפורט על הפוסטים הנבחרים
      log(`📋 פוסטים נבחרים להיום: ${postsToday.map(p => {
        const groupsInfo = p.limitedGroups ? `${p.limitedGroups.length}/${p.originalGroupsCount}` : `${p.groups?.length || 0}`;
        return `${p.filename} (${p.status}, ${groupsInfo} קבוצות${p.duplicateRun ? ', חזרה' : ''})`;
      }).join(', ')}`);
      
      const totalGroups = postsToday.reduce((sum, post) => {
        return sum + (post.limitedGroups ? post.limitedGroups.length : (post.groups?.length || 0));
      }, 0);
      
      log(`📊 סה"כ פוסטים: ${postsToday.length}/${DAILY_SETTINGS.MAX_POSTS_PER_DAY}`);
      log(`📊 סה"כ פרסומים: ${totalGroups}/${DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY}`);
      
      const scheduledCount = postsToday.filter(p => p.status === 'scheduled').length;
      const activeCount = postsToday.filter(p => p.status === 'active').length;
      const duplicateCount = postsToday.filter(p => p.duplicateRun).length;
      
      log(`📊 פילוח: ${scheduledCount} מתוזמנים, ${activeCount} פעילים${duplicateCount > 0 ? `, ${duplicateCount} חזרות` : ''}`);
      
      const totalAvailable = validatedPosts.filter(p => p.status === 'scheduled' || p.status === 'active').length;
      log(`🔢 סה"כ פוסטים זמינים (פעילים + מתוזמנים): ${totalAvailable}`);
      log(`📋 מדיניות: עד ${DAILY_SETTINGS.MAX_POSTS_PER_DAY} פוסטים ועד ${DAILY_SETTINGS.MAX_PUBLICATIONS_PER_DAY} פרסומים ביום`);
    } else {
      log(`📁 מפרסם פוסט ספציפי: ${specificPostFile} (${postsToday[0]?.status || 'לא ידוע'})`);
    }
    
    // --- רישום פוסטים נבחרים לשיטס עם מידע מפורט ---
    if (postsToday.length > 0) {
      const totalPublications = postsToday.reduce((sum, post) => {
        return sum + (post.limitedGroups ? post.limitedGroups.length : (post.groups?.length || 0));
      }, 0);
      
      const selectedPostsInfo = postsToday.map(p => {
        const groupsInfo = p.limitedGroups ? `${p.limitedGroups.length}/${p.originalGroupsCount}` : `${p.groups?.length || 0}`;
        return `${p.filename}(${groupsInfo})`;
      }).join(', ');
      
      const detailsInfo = `${postsToday.length} פוסטים, ${totalPublications} פרסומים: ${selectedPostsInfo}`;
      
      try {
        await logToSheet("Daily Posts Selected", "Info", "", detailsInfo);
        log(`📊 נרשם לשיטס: ${detailsInfo}`);
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
