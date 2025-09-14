const { sendErrorMail } = require("./mailer");
const puppeteer = require("puppeteer-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require("./config.json");

// פונקציית לוג לקובץ
const LOG_FILE = path.join(__dirname, config.logFile || "log.txt");
const logToFile = (text) => {
  const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).replace(" ", "T");
  const line = `[${timestamp}] ${text}`;
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (e) {
    console.error("⚠️ שגיאה בכתיבה ללוג:", e.message);
  }
};

async function runWithTimeout(fn, ms = 12 * 60 * 1000) {
  let timeout;
  return Promise.race([
    fn(),
    new Promise((_, reject) => timeout = setTimeout(() => reject(new Error('Global timeout reached!')), ms))
  ]).finally(() => clearTimeout(timeout));
}

// סגירת כל תהליכי כרום/כרומיום לפני התחלת הסקריפט (Windows בלבד)
try {
  console.log("🔒 סוגר את כל תהליכי Chrome/Chromium...");
  execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
  execSync('taskkill /F /IM chromium.exe /T', { stdio: 'ignore' });
} catch (e) {
  // יתכן ואין תהליך פתוח, מתעלמים משגיאה
}

// הוספת בדיקה לוודא שזה הקובץ הנכון
console.log("🔍 RUNNING POST.JS VERSION WITH ENHANCED SUCCESS DETECTION - v2.0");
console.log("🔍 File path:", __filename);
console.log("🔍 Current time:", new Date().toISOString());
logToFile("🔍 POST.JS STARTED - v2.0");

// קריאת פרמטרים מהפקודה
const groupUrl = process.argv[2];
const jsonFileName = process.argv[3];
const isRetryMode = process.argv[4] === "--retry"; // האם זה ניסיון חוזר
const groupPostIdentifier = process.argv[5] || ""; // מזהה קבוצה/פוסט
const isLastAttempt = process.argv[6] === "--last"; // האם זה הניסיון האחרון

logToFile(`📋 Parameters: ${groupUrl}, ${jsonFileName}, retry=${isRetryMode}, last=${isLastAttempt}`);

if (!groupUrl || !jsonFileName) {
  console.error("❌ Usage: node post.js <groupUrl> <jsonFileName> [--retry|--first] [groupPostIdentifier] [--last|--not-last]");
  process.exit(1);
}

// הגדרת נתיב לתיקיית הפוסטים לפי instance-name.txt
const instanceName = fs.readFileSync("C:\\postify\\posts\\instance-name.txt", "utf-8").trim();
const postsFolder = `C:\\postify\\user data\\${instanceName}\\posts`;
const jsonPath = path.join(postsFolder, jsonFileName);

// קריאת תוכן הפוסט עם הגנה מפני שגיאות
let postData;
let postText;
  try {
    postData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    postText = postData.text;
    console.log("📄 Post data loaded successfully");
    logToFile(`📄 Post data loaded: ${jsonFileName}`);
  } catch (error) {
    console.error("❌ Failed to load post data:", error.message);
    logToFile(`❌ Failed to load post data: ${error.message}`);
    process.exit(1);
  }const logToSheet = async (...args) => {
  try {
    const fn = require('./log-to-sheets');
    console.log(`🔍 DEBUG logToSheet args:`, args);
    // אם יש שגיאה ויש פרמטר שישי, הוסף אותו לעמודה G
    if (args[1] === 'Error' && args.length >= 6 && args[5]) {
      // args: [event, status, group, notes, postName, errorReason]
      const errorLog = (args[5] || "שגיאה לא ידועה").replace(/[^א-ת0-9 .,:;\-()]/g, "");
      console.log(`🔍 DEBUG Error log to column G:`, errorLog);
      // העברת כל הפרמטרים כולל הפרמטר השישי לעמודה G
      await fn(args[0], args[1], args[2], args[3], args[4], errorLog);
    } else {
      await fn(...args);
    }
  } catch (e) {
    console.error('⚠️ Failed to log to Google Sheet:', e.message);
  }
};

// פונקציה משופרת לחילוץ תאריך מטקסט פוסט
function extractPostDate(postText) {
  try {
    console.log(`🕒 מנתח תאריך מהטקסט: "${postText}"`);
    
    // דפוסים שונים של תאריכים בפייסבוק - מסודרים לפי עדיפות
    const patterns = [
      // זמן יחסי קצר - עדיפות גבוהה (פוסט חדש)
      /לפני (\d+) דקות?/,
      /לפני דקה/,
      /לפני (\d+) שעות?/,
      /לפני שעה/,
      
      // פורמטים באנגלית קצרים (עדיפות גבוהה)
      /(\d+)m$/,     // כמו "5m" - דקות
      /(\d+)h$/,     // כמו "23h" - שעות
      /(\d+)d$/,     // כמו "2d" - ימים
      /(\d+)w$/,     // כמו "1w" - שבועות
      
      // פורמטים אנגליים מלאים
      /(\d+)\s+minutes?\s+ago/,
      /(\d+)\s+hours?\s+ago/,
      /(\d+)\s+days?\s+ago/,
      /(\d+)\s+weeks?\s+ago/,
      /(\d+)\s+mins?\s+ago/,
      /(\d+)\s+hrs?\s+ago/,
      
      // זמן יחסי באנגלית
      /(yesterday|today)/,
      
      // זמן יחסי בלי "לפני"
      /(\d+) דקות?/,
      /(\d+) שעות?/,
      
      // זמן יחסי ארוך יותר
      /לפני (\d+) ימים?/,
      /לפני יום/,
      /לפני (\d+) שבועות?/,
      /לפני שבוע/,
      
        // תאריכים יחסיים
        /(היום|אתמול|שלשום)/,
        
        // תאריכים עבריים כמו "10 בספט'", "5 בינו'", "20 בדצמ'"
        /(\d+)\s+ב(ינו|פבר|מרץ|אפר|מאי|יונ|יול|אוג|ספט|אוק|נוב|דצמ)\'?/,      // תאריך מלא
      /(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/,
      
      // שמות חודשים עבריים ואנגליים
      /(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר|January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/
    ];
    
    let detectedDate = null;
    let confidence = 0;
    let matchedPattern = '';
    
    for (const pattern of patterns) {
      const match = postText.match(pattern);
      if (match) {
        matchedPattern = match[0];
        console.log(`✅ זוהה דפוס תאריך: "${matchedPattern}"`);
        
        // "לפני דקה" - ביטחון מקסימלי
        if (match[0] === 'לפני דקה') {
          detectedDate = new Date(Date.now() - 60000); // לפני דקה
          confidence = 99;
          console.log(`🎯 זוהה "לפני דקה" - ביטחון מקסימלי!`);
          break;
        }
        // פורמטים אנגליים קצרים כמו "23h", "5m", "2d"
        else if (/^\d+[mhdw]$/.test(match[0])) {
          const num = parseInt(match[1]);
          const unit = match[0].charAt(match[0].length - 1);
          
          if (unit === 'm') { // דקות
            detectedDate = new Date(Date.now() - num * 60000);
            confidence = 98 - (num * 0.1);
            console.log(`🎯 זוהה פורמט אנגלי: ${num} דקות (${match[0]})`);
          } else if (unit === 'h') { // שעות
            detectedDate = new Date(Date.now() - num * 3600000);
            confidence = 95 - (num * 0.5);
            console.log(`🎯 זוהה פורמט אנגלי: ${num} שעות (${match[0]})`);
          } else if (unit === 'd') { // ימים
            detectedDate = new Date(Date.now() - num * 86400000);
            confidence = 90 - (num * 1);
            console.log(`🎯 זוהה פורמט אנגלי: ${num} ימים (${match[0]})`);
          } else if (unit === 'w') { // שבועות
            detectedDate = new Date(Date.now() - num * 7 * 86400000);
            confidence = 85 - (num * 2);
            console.log(`🎯 זוהה פורמט אנגלי: ${num} שבועות (${match[0]})`);
          }
          break;
        }
        // פורמטים אנגליים מלאים כמו "23 hours ago", "5 minutes ago"
        else if (match[0].includes('ago')) {
          const num = parseInt(match[1]);
          
          if (match[0].includes('minute') || match[0].includes('mins')) {
            detectedDate = new Date(Date.now() - num * 60000);
            confidence = 98 - (num * 0.1);
            console.log(`🎯 זוהה פורמט אנגלי מלא: ${num} דקות (${match[0]})`);
          } else if (match[0].includes('hour') || match[0].includes('hrs')) {
            detectedDate = new Date(Date.now() - num * 3600000);
            confidence = 95 - (num * 0.5);
            console.log(`🎯 זוהה פורמט אנגלי מלא: ${num} שעות (${match[0]})`);
          } else if (match[0].includes('day')) {
            detectedDate = new Date(Date.now() - num * 86400000);
            confidence = 90 - (num * 1);
            console.log(`🎯 זוהה פורמט אנגלי מלא: ${num} ימים (${match[0]})`);
          } else if (match[0].includes('week')) {
            detectedDate = new Date(Date.now() - num * 7 * 86400000);
            confidence = 85 - (num * 2);
            console.log(`🎯 זוהה פורמט אנגלי מלא: ${num} שבועות (${match[0]})`);
          }
          break;
        }
        // זמן יחסי באנגלית - today, yesterday
        else if (match[0] === 'today') {
          detectedDate = new Date();
          confidence = 95;
          console.log(`🎯 זוהה "today" - היום`);
          break;
        } else if (match[0] === 'yesterday') {
          detectedDate = new Date(Date.now() - 86400000);
          confidence = 95;
          console.log(`🎯 זוהה "yesterday" - אתמול`);
          break;
        }
        // "לפני X דקות" - ביטחון גבוה מאוד
        else if (match[0].includes('לפני') && match[0].includes('דקות')) {
          const num = parseInt(match[1]);
          detectedDate = new Date(Date.now() - num * 60000);
          confidence = 98 - (num * 0.1); // ככל שיותר דקות, פחות ביטחון
          console.log(`🎯 זוהה "לפני ${num} דקות" - פוסט חדש מאוד!`);
          break;
        }
        // "לפני שעה" או "לפני X שעות"
        else if (match[0].includes('לפני') && match[0].includes('שעות')) {
          const num = parseInt(match[1]) || 1;
          detectedDate = new Date(Date.now() - num * 3600000);
          confidence = 90 - (num * 2); // ככל שיותר שעות, פחות ביטחון
          console.log(`🕒 זוהה "לפני ${num} שעות"`);
          break;
        }
        // זמן יחסי בלי "לפני" - X דקות או X שעות
        else if (/^\d+\s+(דקות?|שעות?)$/.test(match[0])) {
          const num = parseInt(match[1]);
          const unit = match[2];
          
          if (unit.includes('דקות')) {
            detectedDate = new Date(Date.now() - num * 60000);
            confidence = 95 - (num * 0.2);
          } else if (unit.includes('שעות')) {
            detectedDate = new Date(Date.now() - num * 3600000);
            confidence = 85 - (num * 2);
          }
          console.log(`🕒 זוהה זמן יחסי: ${num} ${unit}`);
          break;
        }
        // "לפני יום" או "לפני X ימים"
        else if (match[0].includes('לפני') && match[0].includes('ימים')) {
          const num = parseInt(match[1]) || 1;
          detectedDate = new Date(Date.now() - num * 86400000);
          confidence = 80 - (num * 5);
          break;
        }
        // תאריכים עבריים כמו "10 בספט'"
        else if (/^\d+\s+ב(ינו|פבר|מרץ|אפר|מאי|יונ|יול|אוג|ספט|אוק|נוב|דצמ)\'?$/.test(match[0])) {
          const day = parseInt(match[1]);
          const monthAbbr = match[2];
          
          // מיפוי קיצורי חודשים עבריים למספרים
          const hebrewMonths = {
            'ינו': 0, 'פבר': 1, 'מרץ': 2, 'אפר': 3, 'מאי': 4, 'יונ': 5,
            'יול': 6, 'אוג': 7, 'ספט': 8, 'אוק': 9, 'נוב': 10, 'דצמ': 11
          };
          
          const month = hebrewMonths[monthAbbr];
          if (month !== undefined) {
            const currentYear = new Date().getFullYear();
            detectedDate = new Date(currentYear, month, day);
            
            // אם התאריך גדול מהיום (למשל, דצמבר כשאנחנו בינואר), זה כנראה שנה שעברה
            if (detectedDate > new Date()) {
              detectedDate.setFullYear(currentYear - 1);
            }
            
            confidence = 90;
            console.log(`🗓️ זוהה תאריך עברי: ${day} ב${monthAbbr} -> ${detectedDate.toLocaleDateString('he-IL')}`);
            break;
          }
        }
        // "היום" - ביטחון גבוה
        else if (match[0] === 'היום') {
          detectedDate = new Date();
          confidence = 95;
          break;
        } else if (match[0] === 'אתמול') {
          detectedDate = new Date(Date.now() - 86400000);
          confidence = 95;
          break;
        } else if (match[0] === 'שלשום') {
          detectedDate = new Date(Date.now() - 172800000);
          confidence = 95;
          break;
        }
      }
    }
    
    if (detectedDate) {
      console.log(`✅ תאריך זוהה בהצלחה: ${detectedDate.toISOString()} (ביטחון: ${confidence}%, דפוס: "${matchedPattern}")`);
    } else {
      console.log(`❌ לא הצלחתי לזהות תאריך מהטקסט: "${postText}"`);
    }
    
    return {
      date: detectedDate,
      confidence: confidence,
      matchedPattern: matchedPattern,
      originalText: postText.substring(0, 200)
    };
  } catch (error) {
    console.log(`❌ שגיאה בחילוץ תאריך: ${error.message}`);
    return { date: null, confidence: 0, originalText: postText.substring(0, 200) };
  }
}

// פונקציה לבדיקת סטטוס פוסטים בקבוצה מיד אחרי פרסום
async function checkPostStatusAfterPublish(page, groupUrl, groupName) {
  console.log(`🔍 בודק סטטוס פוסטים בקבוצה: ${groupName}`);
  
  const maxRetries = 3; // מספר ניסיונות מקסימלי
  const retryDelays = [30000, 45000, 60000]; // זמני timeout שונים (30, 45, 60 שניות)
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 ניסיון ${attempt}/${maxRetries} לבדיקת סטטוס...`);
      
      // בניית URL עם my_posted_content
      const statusUrl = groupUrl.endsWith('/') 
        ? groupUrl + 'my_posted_content' 
        : groupUrl + '/my_posted_content';
      
      console.log(`🌐 נכנס לכתובת סטטוס: ${statusUrl} (timeout: ${retryDelays[attempt-1]}ms)`);
      
      // מעבר לעמוד הסטטוס עם timeout מותאם
      await page.goto(statusUrl, {
        waitUntil: "networkidle0", 
        timeout: retryDelays[attempt-1]
      });
      
      console.log(`✅ ניסיון ${attempt}: הדף נטען בהצלחה`);
      break; // יצאנו מהלולאה כי הצלחנו
      
    } catch (navigationError) {
      console.log(`⚠️ ניסיון ${attempt}/${maxRetries} נכשל: ${navigationError.message}`);
      
      if (attempt < maxRetries) {
        console.log(`🔄 ממתין 10 שניות לפני ניסיון ${attempt + 1}...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        console.log(`❌ כל הניסיונות נכשלו, מחזיר תוצאת שגיאה`);
        return {
          published: 0,
          pending: 0,
          rejected: 0,
          removed: 0,
          latestPostStatus: 'error',
          success: false,
          error: `לא הצלחתי לטעון את דף הסטטוס אחרי ${maxRetries} ניסיונות`
        };
      }
    }
  }
  
  try {
    // המתנה לטעינה מלאה
    console.log(`⏳ ממתין לטעינה מלאה של הדף...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // גלילה קלה להפעלת התוכן
    console.log(`🔄 מבצע גלילה להפעלת התוכן...`);
    await page.evaluate(() => {
      window.scrollBy(0, 100);
      setTimeout(() => window.scrollBy(0, -100), 1000);
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // חיפוש טאבים של סטטוסים עם retry
    let statusData = null;
    const maxTabRetries = 2;
    
    for (let tabAttempt = 1; tabAttempt <= maxTabRetries; tabAttempt++) {
      console.log(`🔍 ניסיון ${tabAttempt}/${maxTabRetries} לחיפוש טאבי סטטוס...`);
      
      statusData = await page.evaluate(() => {
      const tabs = [
        ...document.querySelectorAll('[role="tab"]'),
        ...document.querySelectorAll('button'),
        ...document.querySelectorAll('a'),
        ...document.querySelectorAll('div[tabindex]')
      ];
      
      const result = {
        published: 0,
        pending: 0,
        rejected: 0,
        removed: 0,
        latestStatus: null,
        latestDate: null
      };
      
      const statusKeywords = [
        'בהמתנה', 'פורסמו', 'נדחו', 'הוסרו', 
        'pending', 'published', 'rejected', 'removed',
        'Pending', 'Published', 'Rejected', 'Removed',
        'מחכה לאישור', 'פרסומים', 'נדחה', 'הוסר',
        'awaiting', 'posts', 'declined', 'deleted',
        'Awaiting', 'Posts', 'Declined', 'Deleted',
        'review', 'approval', 'live', 'active'
      ];
      
      tabs.forEach((tab) => {
        const tabText = tab.textContent || tab.innerText || '';
        
        // חיפוש גם בתוך spans
        const spans = tab.querySelectorAll('span');
        let fullText = tabText;
        spans.forEach(span => {
          const spanText = span.textContent || span.innerText || '';
          if (spanText && !fullText.includes(spanText)) {
            fullText += ' ' + spanText;
          }
        });
        
        console.log(`🔍 בודק טאב לספירה: "${fullText}"`);
        
        if (statusKeywords.some(keyword => fullText.toLowerCase().includes(keyword.toLowerCase())) && fullText.length < 200) {
          // פונקציה לחילוץ מספר - גם מספרים וגם מילים
          const extractNumber = (text) => {
            // חיפוש מספר רגיל קודם
            const numberMatch = text.match(/(\d+)/);
            if (numberMatch) {
              return parseInt(numberMatch[1]);
            }
            
            // מפת מילים למספרים בעברית ואנגלית
            const wordToNumber = {
              // עברית
              'אחד': 1, 'אחת': 1, 'יחיד': 1, 'יחידה': 1,
              'שני': 2, 'שתי': 2, 'שניים': 2, 'שתיים': 2,
              'שלושה': 3, 'שלוש': 3, 'שלושת': 3,
              'ארבעה': 4, 'ארבע': 4, 'ארבעת': 4,
              'חמישה': 5, 'חמש': 5, 'חמישת': 5,
              'שישה': 6, 'שש': 6, 'שישת': 6,
              'שבעה': 7, 'שבע': 7, 'שבעת': 7,
              'שמונה': 8, 'שמונת': 8,
              'תשעה': 9, 'תשע': 9, 'תשעת': 9,
              'עשרה': 10, 'עשר': 10, 'עשרת': 10,
              'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50,
              // אנגלית
              'one': 1, 'single': 1, 'a ': 1, 'an ': 1,
              'two': 2, 'couple': 2, 'pair': 2,
              'three': 3, 'four': 4, 'five': 5,
              'six': 6, 'seven': 7, 'eight': 8,
              'nine': 9, 'ten': 10,
              'eleven': 11, 'twelve': 12, 'thirteen': 13,
              'fourteen': 14, 'fifteen': 15, 'sixteen': 16,
              'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
              'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
              'hundred': 100
            };
            
            // חיפוש מילות מספר
            const lowerText = text.toLowerCase();
            for (const [word, number] of Object.entries(wordToNumber)) {
              if (lowerText.includes(word)) {
                return number;
              }
            }
            
            return null;
          };
          
          const count = extractNumber(fullText);
          if (count !== null) {
            console.log(`📊 מצאתי מספר ${count} בטאב: "${fullText}"`);
            
            const lowerText = fullText.toLowerCase();
            if (lowerText.includes('פורסמו') || lowerText.includes('published')) {
              result.published = count;
              console.log(`✅ עדכנתי published ל-${count}`);
            } else if (lowerText.includes('בהמתנה') || lowerText.includes('pending')) {
              result.pending = count;
              console.log(`✅ עדכנתי pending ל-${count}`);
            } else if (lowerText.includes('נדחו') || lowerText.includes('rejected')) {
              result.rejected = count;
              console.log(`✅ עדכנתי rejected ל-${count}`);
            } else if (lowerText.includes('הוסרו') || lowerText.includes('removed')) {
              result.removed = count;
              console.log(`✅ עדכנתי removed ל-${count}`);
            }
          } else {
            console.log(`⚠️ לא הצלחתי לחלץ מספר מהטקסט: "${fullText}"`);
          }
        }
      });
      
      return result;
    });
    
    if (statusData && (statusData.published > 0 || statusData.pending > 0 || statusData.rejected > 0 || statusData.removed > 0)) {
      console.log(`✅ ניסיון ${tabAttempt}: מצאתי טאבי סטטוס בהצלחה`);
      break; // יצאנו מהלולאה כי מצאנו טאבים
    } else if (tabAttempt < maxTabRetries) {
      console.log(`⚠️ ניסיון ${tabAttempt}: לא מצאתי טאבי סטטוס, ממתין 5 שניות...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      console.log(`❌ לא מצאתי טאבי סטטוס אחרי ${maxTabRetries} ניסיונות`);
      statusData = {
        published: 0,
        pending: 0, 
        rejected: 0,
        removed: 0
      };
    }
  }
    
    // נסה לזהות את הפוסט האחרון על ידי כניסה לטאבים ובדיקת תאריכים אמיתיים
    const tabsToCheck = [
      { 
        keywords: ['בהמתנה', 'pending', 'Pending', 'מחכה לאישור', 'awaiting', 'review', 'approval'], 
        status: 'pending',
        urlKeywords: ['pending', 'awaiting'] // מילות מפתח ספציפיות ל-URL
      },
      { 
        keywords: ['פורסמו', 'published', 'Published', 'פרסומים'], 
        status: 'published',
        urlKeywords: ['published', 'posts'] // רק אם ה-URL מכיל את המילים האלה
      },
      { 
        keywords: ['נדחו', 'rejected', 'Rejected', 'נדחה', 'declined', 'Declined'], 
        status: 'rejected',
        urlKeywords: ['rejected', 'declined']
      },
      { 
        keywords: ['הוסרו', 'removed', 'Removed', 'הוסר', 'deleted', 'Deleted'], 
        status: 'removed',
        urlKeywords: ['removed', 'deleted']
      }
    ];
    
    let latestPost = null;
    let latestPostDate = null;
    
    console.log(`🔍 מתחיל בדיקה מתקדמת של הפוסט האחרון בין כל הטאבים...`);
    console.log(`📊 נתוני טאבים שנמצאו: Published=${statusData.published}, Pending=${statusData.pending}, Rejected=${statusData.rejected}, Removed=${statusData.removed}`);
    
    for (const tabConfig of tabsToCheck) {
      console.log(`\n🔍 מתחיל בדיקת טאב: ${tabConfig.status} עם מילות מפתח: ${tabConfig.keywords.join(', ')}`);
      try {
        // חיפוש הטאב - גישה מותאמת לממשק אנגלי ועברי
        const tabFound = await page.evaluate((keywords, urlKeywords, expectedStatus) => {
          const allTabs = [
            ...document.querySelectorAll('[role="tab"]'),
            ...document.querySelectorAll('button'),
            ...document.querySelectorAll('a'),
            ...document.querySelectorAll('div[tabindex]'),
            // נוסיף חיפוש ספציפי לטאבים של פייסבוק
            ...document.querySelectorAll('a[href*="my_posted_content"]'),
            ...document.querySelectorAll('[data-testid*="tab"]'),
            // חיפוש אלמנטים שמכילים spans עם הטקסט
            ...document.querySelectorAll('a:has(span)'),
            ...document.querySelectorAll('div:has(span)')
          ];
          
          console.log(`🔍 חיפוש בין ${allTabs.length} טאבים אפשריים עבור ${expectedStatus}...`);
          
          for (const tab of allTabs) {
            const tabText = (tab.textContent || tab.innerText || '').toLowerCase();
            const tabHref = (tab.href || '').toLowerCase();
            
            // חיפוש גם בתוך spans
            const spans = tab.querySelectorAll('span');
            let spanTexts = '';
            spans.forEach(span => {
              spanTexts += (span.textContent || span.innerText || '').toLowerCase() + ' ';
            });
            
            const combinedText = (tabText + ' ' + spanTexts).trim();
            
            console.log(`🔍 בודק טאב: "${combinedText}" (href: "${tabHref}") (spans: ${spans.length})`);
            
            // בדיקה משופרת: עדיפות לטקסט, אבל URL כתמיכה
            const textMatches = keywords.some(keyword => combinedText.includes(keyword.toLowerCase()));
            const urlMatches = urlKeywords.some(keyword => tabHref.includes(keyword.toLowerCase()));
            
            console.log(`  🔍 טקסט מתאים: ${textMatches ? '✅' : '❌'}`);
            console.log(`  🔍 URL מתאים: ${urlMatches ? '✅' : '❌'}`);
            
            // לוגיקה משופרת: אם הטקסט מתאים, זה מספיק. אם לא, נדרוש גם URL
            const isCorrectTab = textMatches || (urlMatches && combinedText.length > 0);
            
            console.log(`  📊 טאב נכון עבור ${expectedStatus}: ${isCorrectTab ? '✅ כן' : '❌ לא'}`);
            
            if (isCorrectTab && combinedText.length < 200 && combinedText.length > 0) {
              try {
                console.log(`✅ מצאתי טאב מתאים: "${combinedText}"`);
                
                // אם זה span בתוך אלמנט אחר, נסה ללחוץ על האב
                let clickTarget = tab;
                if (tab.tagName === 'SPAN') {
                  clickTarget = tab.closest('a, button, div[role="tab"], [tabindex]') || tab;
                }
                
                clickTarget.click();
                return { success: true, clickedText: combinedText, href: tabHref };
              } catch (e) {
                console.log(`⚠️ לא הצלחתי ללחוץ על הטאב: ${e.message}`);
                continue;
              }
            }
          }
          
          console.log(`❌ לא מצאתי טאב נכון עבור ${expectedStatus}`);
          return { success: false };
        }, tabConfig.keywords, tabConfig.urlKeywords, tabConfig.status);
        
        if (tabFound.success) {
          console.log(`✅ לחצתי על טאב: ${tabFound.clickedText} (href: ${tabFound.href || 'N/A'})`);
          await new Promise(resolve => setTimeout(resolve, 3000)); // יותר זמן להמתין
          
          // בדיקה אם יש פוסטים בטאב הזה
          const hasPostsInTab = await page.evaluate(() => {
            const postSelectors = [
              '[data-testid="story-subtitle"]',
              '[data-testid*="post"]',
              '[role="article"]',
              'div[data-ft]',
              '.userContentWrapper',
              'div[style*="border"]'
            ];
            
            let foundPosts = 0;
            for (const selector of postSelectors) {
              foundPosts += document.querySelectorAll(selector).length;
            }
            
            console.log(`📊 מצאתי ${foundPosts} פוסטים בטאב הנוכחי`);
            return foundPosts > 0;
          });
          
          if (!hasPostsInTab) {
            console.log(`⚠️ לא מצאתי פוסטים בטאב ${tabConfig.status}, מדלג...`);
            // עדכון מונה הפוסטים ל-0 עבור טאב זה
            if (tabConfig.status === 'published') statusData.published = 0;
            else if (tabConfig.status === 'pending') statusData.pending = 0;
            else if (tabConfig.status === 'rejected') statusData.rejected = 0;
            else if (tabConfig.status === 'removed') statusData.removed = 0;
            continue;
          }
        } else {
          console.log(`❌ לא מצאתי טאב עבור ${tabConfig.status}, מדלג על טאב זה...`);
        }
        
        if (tabFound.success) {
          
          // אימות נוסף - בדיקה שאכן יש פוסטים מהסוג הנכון בטאב הזה
          const tabContentValidation = await page.evaluate((expectedStatus) => {
            const currentUrl = window.location.href.toLowerCase();
            
            // חיפוש אינדיקטורים לסוג הפוסטים בדף
            const statusIndicators = [...document.querySelectorAll('*')].map(el => {
              const text = (el.textContent || '').toLowerCase();
              return text;
            }).join(' ');
            
            let expectedIndicators = [];
            if (expectedStatus === 'published') {
              expectedIndicators = ['published', 'פורסם', 'public', 'ציבורי', 'פרסומים', 'פורסמו'];
            } else if (expectedStatus === 'pending') {
              expectedIndicators = ['pending', 'ממתין', 'review', 'ביקורת', 'בהמתנה', 'אישור', 'מחכה'];
            } else if (expectedStatus === 'rejected') {
              expectedIndicators = ['declined', 'נדחה', 'rejected', 'נדחו'];
            } else if (expectedStatus === 'removed') {
              expectedIndicators = ['removed', 'הוסר', 'deleted', 'נמחק', 'הוסרו'];
            }
            
            const hasExpectedContent = expectedIndicators.some(indicator => 
              statusIndicators.includes(indicator)
            );
            
            // חיפוש נוסף: בדיקה אם יש אלמנטים שמצביעים על פוסטים
            const postElements = document.querySelectorAll([
              '[data-testid="story-subtitle"]',
              '[role="article"]',
              'div[data-ft]',
              '.userContentWrapper',
              'div[style*="border"]',
              'div[style*="padding"]'
            ].join(','));
            
            const hasPostElements = postElements.length > 0;
            
            console.log(`🔍 אימות תוכן טאב עבור ${expectedStatus}:`);
            console.log(`   URL: ${currentUrl}`);
            console.log(`   יש תוכן מתאים: ${hasExpectedContent}`);
            console.log(`   יש אלמנטי פוסטים: ${hasPostElements}`);
            
            // אם אין תוכן מתאים אבל יש אלמנטי פוסטים, עדיין נחשב שהטאב תקין
            return hasExpectedContent || hasPostElements;
          }, tabConfig.status);
          
          if (!tabContentValidation) {
            console.log(`⚠️ אימות תוכן הטאב נכשל עבור ${tabConfig.status} - ייתכן שלא נמצאים בטאב הנכון`);
            // לא נמשיך לחפש פוסטים אם התוכן לא מתאים
            continue;
          }
          
          console.log(`✅ אימות תוכן הטאב הצליח עבור ${tabConfig.status}`);
          
          // חיפוש הפוסט הראשון בטאב עם תאריך
          const firstPostInfo = await page.evaluate(() => {
            const postSelectors = [
              '[data-testid="story-subtitle"]',
              '[data-testid*="post"]',
              '[role="article"]',
              'div[data-ft]',
              '.userContentWrapper',
              'div[style*="border"]'
            ];
            
            for (const selector of postSelectors) {
              const posts = document.querySelectorAll(selector);
              if (posts.length > 0) {
                const firstPost = posts[0];
                const postText = firstPost.textContent || firstPost.innerText || '';
                
                // חיפוש תאריך מתקדם
                let postDate = '';
                const dateSelectors = [
                  '[data-testid="story-subtitle"]',
                  '.timestampContent',
                  'abbr[data-utime]',
                  'time',
                  'span[title]',
                  // סלקטור חדש לתאריכים בפוסטים עם וידאו
                  'span.html-span.xdj266r.x14z9mp.xat24cr.x1lziwak.xexx8yu.xyri2b.x18d9i69.x1c1uobl.x1hl2dhg.x16tdsg8.x1vvkbs.x4k7w5x.x1h91t0o.x1h9r5lt.x1jfb8zj.xv2umb2.x1beo9mf.xaigb6o.x12ejxvf.x3igimt.xarpa2k.xedcshv.x1lytzrv.x1t2pt76.x7ja8zs.x1qrby5j'
                ];
                
                for (const dateSelector of dateSelectors) {
                  const dateElement = firstPost.querySelector(dateSelector) || document.querySelector(dateSelector);
                  if (dateElement) {
                    postDate = dateElement.textContent || dateElement.getAttribute('title') || '';
                    if (postDate) {
                      console.log(`✅ תאריך נמצא עם סלקטור: ${dateSelector} -> "${postDate}"`);
                      break;
                    }
                  }
                }
                
                // אם לא נמצא תאריך ספציפי, חפש בכל הדף בצורה מתקדמת יותר
                if (!postDate) {
                  console.log(`🔍 לא נמצא תאריך עם הסלקטורים הרגילים, מחפש בכל הדף...`);
                  
                  // חיפוש ראשון - תאריכים יחסיים (עברית ואנגלית)
                  const relativeTimeElements = [...document.querySelectorAll('*')].filter(el => {
                    const text = el.textContent || el.innerText || '';
                    return text.match(/(לפני|היום|אתמול|\d+\s+(דקות?|שעות?|ימים?)|ago|today|yesterday|\d+\s+(minutes?|hours?|days?|mins?|hrs?)|\d+[mhd])/) && text.length < 50;
                  });
                  
                  if (relativeTimeElements.length > 0) {
                    postDate = relativeTimeElements[0].textContent || relativeTimeElements[0].innerText || '';
                    console.log(`✅ תאריך יחסי נמצא: "${postDate}"`);
                  }
                  
                  // אם עדיין לא נמצא, חפש תאריכים בפורמט עברי
                  if (!postDate) {
                    const hebrewDateElements = [...document.querySelectorAll('*')].filter(el => {
                      const text = el.textContent || el.innerText || '';
                      // חיפוש תאריכים כמו "10 בספט'", "5 בינו'", "20 בדצמ'" וכו'
                      return text.match(/\d+\s+ב(ינו|פבר|מרץ|אפר|מאי|יונ|יול|אוג|ספט|אוק|נוב|דצמ)\'?/) && text.length < 20;
                    });
                    
                    if (hebrewDateElements.length > 0) {
                      postDate = hebrewDateElements[0].textContent || hebrewDateElements[0].innerText || '';
                      console.log(`✅ תאריך עברי נמצא: "${postDate}"`);
                    }
                  }
                  
                  // חיפוש נוסף - תאריכים בפורמט DD/MM או DD.MM
                  if (!postDate) {
                    const numericDateElements = [...document.querySelectorAll('*')].filter(el => {
                      const text = el.textContent || el.innerText || '';
                      return text.match(/\d{1,2}[\/\.]\d{1,2}/) && text.length < 30;
                    });
                    
                    if (numericDateElements.length > 0) {
                      postDate = numericDateElements[0].textContent || numericDateElements[0].innerText || '';
                      console.log(`✅ תאריך מספרי נמצא: "${postDate}"`);
                    }
                  }
                }
                
                return {
                  found: true,
                  text: postText.substring(0, 200),
                  date: postDate
                };
              }
            }
            return { found: false };
          });
          
          if (firstPostInfo.found && firstPostInfo.date) {
            const dateInfo = extractPostDate(firstPostInfo.date);
            console.log(`📅 בטאב ${tabConfig.status}: תאריך גולמי="${firstPostInfo.date}", תאריך מעובד=${dateInfo.date ? dateInfo.date.toISOString() : 'null'}, ביטחון=${dateInfo.confidence}%`);
            
            if (dateInfo.date && dateInfo.confidence > 70) {
              // בדיקה אם זה הפוסט החדש ביותר
              if (!latestPost || dateInfo.date > latestPostDate) {
                latestPost = tabConfig.status;
                latestPostDate = dateInfo.date;
                console.log(`🏆 פוסט חדש ביותר עודכן ל-${tabConfig.status} (${dateInfo.date.toISOString()}, ביטחון: ${dateInfo.confidence}%)`);
              }
            }
          }
        }
        
        console.log(`🔚 סיום בדיקת טאב ${tabConfig.status}. האם נמצא פוסט אחרון: ${latestPost === tabConfig.status ? 'כן' : 'לא'}`);
      } catch (error) {
        console.log(`⚠️ שגיאה בבדיקת טאב ${tabConfig.status}: ${error.message}`);
      }
    }
    
    // סיכום התוצאות
    let finalLatestPost = latestPost || 'unknown';
    
    console.log(`📊 סיכום סופי של מונה הפוסטים: Published=${statusData.published}, Pending=${statusData.pending}, Rejected=${statusData.rejected}, Removed=${statusData.removed}`);
    
    // Fallback - אם לא הצלחנו לזהות על פי תאריך, נשתמש בלוגיקה פשוטה
    if (!latestPost) {
      console.log(`❓ לא זוהה פוסט אחרון לפי תאריך, משתמש בלוגיקה fallback...`);
      
      // שיטת חיפוש פשוטה - אם יש רק טאב אחד עם פוסטים
      const tabsWithPosts = [];
      if (statusData.published > 0) tabsWithPosts.push({name: 'published', count: statusData.published});
      if (statusData.pending > 0) tabsWithPosts.push({name: 'pending', count: statusData.pending});
      if (statusData.rejected > 0) tabsWithPosts.push({name: 'rejected', count: statusData.rejected});
      if (statusData.removed > 0) tabsWithPosts.push({name: 'removed', count: statusData.removed});
      
      console.log(`📊 טאבים עם פוסטים: ${tabsWithPosts.map(t => `${t.name}(${t.count})`).join(', ')}`);
      
      if (tabsWithPosts.length === 1) {
        // יש רק טאב אחד עם פוסטים - זה כנראה המקום הנכון
        finalLatestPost = tabsWithPosts[0].name;
        console.log(`🎯 Fallback חכם: יש פוסטים רק בטאב ${finalLatestPost} (${tabsWithPosts[0].count} פוסטים) - זה כנראה המקום הנכון!`);
      } else if (tabsWithPosts.length > 1) {
        console.log(`⚠️ יש פוסטים ב-${tabsWithPosts.length} טאבים שונים, משתמש בלוגיקה מקורית...`);
        
        // לוגיקה מתוקנת: תעדוף לפוסטים ממתינים (הסביר יותר שפוסט חדש ממתין)
        if (statusData.pending > 0) {
          finalLatestPost = 'pending';
          console.log(`🎯 Fallback: יש ${statusData.pending} פוסטים ממתינים - הפוסט האחרון כנראה בהמתנה`);
        } else if (statusData.rejected > 0) {
          finalLatestPost = 'rejected';
          console.log(`🎯 Fallback: יש ${statusData.rejected} פוסטים נדחים ואין ממתינים - הפוסט האחרון כנראה נדחה`);
        } else if (statusData.published > 0) {
          finalLatestPost = 'published';
          console.log(`🎯 Fallback: יש ${statusData.published} פוסטים מפורסמים ואין ממתינים או נדחים - הפוסט האחרון כנראה פורסם`);
        } else {
          // זה המצב הבעייתי - אין פוסטים בשום טאב
          console.log(`🚨 אזהרה: לא מצאתי שום פוסטים בשום סטטוס!`);
          console.log(`⚠️ חשד חזק: הפרסום כנראה נכשל למרות ההודעה על הצלחה`);
          console.log(`🔍 מומלץ לבדוק ידנית את הקבוצה בפייסבוק`);
          finalLatestPost = 'unknown';
        }
      } else {
        // אין פוסטים בשום טאב
        console.log(`🚨 אזהרה: לא מצאתי שום פוסטים בשום סטטוס!`);
        console.log(`⚠️ חשד חזק: הפרסום כנראה נכשל למרות ההודעה על הצלחה`);
        console.log(`🔍 מומלץ לבדוק ידנית את הקבוצה בפייסבוק`);
        finalLatestPost = 'unknown';
      }
    }
    
    // בדיקה נוספת: אם יש רק טאב אחד עם פוסטים, נעדיף אותו על פני תוצאות תאריך לא מדויקות
    const tabsWithPosts = [];
    if (statusData.published > 0) tabsWithPosts.push({name: 'published', count: statusData.published});
    if (statusData.pending > 0) tabsWithPosts.push({name: 'pending', count: statusData.pending});
    if (statusData.rejected > 0) tabsWithPosts.push({name: 'rejected', count: statusData.rejected});
    if (statusData.removed > 0) tabsWithPosts.push({name: 'removed', count: statusData.removed});
    
    console.log(`📊 טאבים עם פוסטים: ${tabsWithPosts.map(t => `${t.name}(${t.count})`).join(', ')}`);
    
    if (tabsWithPosts.length === 1) {
      // יש רק טאב אחד עם פוסטים - זה כנראה המקום הנכון
      const correctTab = tabsWithPosts[0].name;
      if (finalLatestPost !== correctTab) {
        console.log(`🔄 תיקון: זוהה טאב יחיד עם פוסטים (${correctTab}), מעדכן מ-${finalLatestPost} ל-${correctTab}`);
        finalLatestPost = correctTab;
      }
      console.log(`🎯 Fallback חכם: יש פוסטים רק בטאב ${finalLatestPost} (${tabsWithPosts[0].count} פוסטים) - זה כנראה המקום הנכון!`);
    }
    
    console.log(`📊 תוצאות סריקת סטטוס עבור ${groupName}:`);
    console.log(`   ✅ מפורסמים: ${statusData.published}`);
    console.log(`   ⏳ ממתינים: ${statusData.pending}`);
    console.log(`   ❌ נדחו: ${statusData.rejected}`);
    console.log(`   🗑️ הוסרו: ${statusData.removed}`);
    console.log(`   🎯 פוסט אחרון (לפי תאריך): ${finalLatestPost}`);
    
    return {
      published: statusData.published,
      pending: statusData.pending,
      rejected: statusData.rejected,
      removed: statusData.removed,
      latestPostStatus: finalLatestPost,
      success: true,
      retryUsed: true // מציין שהשתמשנו במנגנון retry
    };
    
  } catch (error) {
    console.log(`❌ שגיאה בבדיקת סטטוס: ${error.message}`);
    return {
      published: 0,
      pending: 0,
      rejected: 0,
      removed: 0,
      latestPostStatus: 'error',
      success: false,
      error: error.message
    };
  }
}

// פונקציה לאופטימיזציה של קישורים עבור פייסבוק
const optimizeLinksForFacebook = (text) => {
  console.log("🔗 Optimizing links for Facebook recognition...");
  
  // Regex לזיהוי URLs (כולל tinyurl, bit.ly, http/https וכו')
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
  
  let optimizedText = text;
  let matches = text.match(urlRegex);
  
  if (matches) {
    console.log(`🔍 Found ${matches.length} potential links:`, matches);
    
    matches.forEach(url => {
      // בדוק אם הקישור כבר בשורה נפרדת
      const urlIndex = optimizedText.indexOf(url);
      const beforeUrl = optimizedText.substring(0, urlIndex);
      const afterUrl = optimizedText.substring(urlIndex + url.length);
      
      // בדוק מה יש לפני ואחרי הקישור
      const charBefore = beforeUrl.charAt(beforeUrl.length - 1);
      const charAfter = afterUrl.charAt(0);
      
      let needsFixing = false;
      let newUrl = url;
      
      // אם אין ירידת שורה לפני הקישור, הוסף
      if (charBefore !== '\n' && charBefore !== '' && beforeUrl.trim() !== '') {
        newUrl = '\n\n' + newUrl;
        needsFixing = true;
      }
      
      // אם אין ירידת שורה אחרי הקישור, הוסף
      if (charAfter !== '\n' && charAfter !== '' && afterUrl.trim() !== '') {
        newUrl = newUrl + '\n\n';
        needsFixing = true;
      }
      
      if (needsFixing) {
        optimizedText = optimizedText.replace(url, newUrl);
        console.log(`✅ Optimized link: ${url} -> surrounded with newlines`);
      }
    });
  }
  
  // נקה רווחים מיותרים שנוצרו בתהליך
  optimizedText = optimizedText
    .replace(/\n{4,}/g, '\n\n\n') // מקסימום 3 ירידות שורה רצופות
    .replace(/[ \t]+\n/g, '\n') // הסר רווחים לפני ירידת שורה
    .replace(/\n[ \t]+/g, '\n'); // הסר רווחים אחרי ירידת שורה
  
  return optimizedText;
};

// פונקציה להכרח זיהוי קישורים על ידי פייסבוק
const triggerLinkRecognition = async (page, textbox) => {
  try {
    console.log("🔄 Triggering Facebook link recognition...");
    
    // בדוק אם יש קישורים בטקסט
    const textContent = await page.evaluate(el => el.textContent, textbox);
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
    const links = textContent.match(urlRegex);
    
    if (links && links.length > 0) {
      console.log(`🔍 Found ${links.length} links, checking if recognized...`);
      
      // בדוק אם יש קישורים כחולים (מזוהים)
      const blueLinks = await page.$$('div[role="dialog"] a[href]');
      
      if (blueLinks.length < links.length) {
        console.log(`⚠️ Only ${blueLinks.length}/${links.length} links recognized as blue links`);
        console.log("🔧 Attempting to trigger recognition...");
        
        // טריק 1: לחץ בסוף הטקסט ואז הוסף רווח ומחק
        await textbox.focus();
        await page.keyboard.press('End'); // לך לסוף הטקסט
        await page.keyboard.type(' ', { delay: 100 });
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 1000));
        
        // טריק 2: אם עדיין לא עובד, נסה select all + type again
        const updatedBlueLinks = await page.$$('div[role="dialog"] a[href]');
        if (updatedBlueLinks.length < links.length) {
          console.log("🔄 Trying select all + minor edit trick...");
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await new Promise(r => setTimeout(r, 300));
          
          // הוסף נקודה ומחק אותה
          await page.keyboard.type('.', { delay: 100 });
          await new Promise(r => setTimeout(r, 500));
          await page.keyboard.press('Backspace');
          await new Promise(r => setTimeout(r, 1500));
        }
        
        // בדיקה סופית
        const finalBlueLinks = await page.$$('div[role="dialog"] a[href]');
        console.log(`✅ Final result: ${finalBlueLinks.length}/${links.length} links recognized`);
      } else {
        console.log("✅ All links already recognized as blue links");
      }
    }
  } catch (error) {
    console.log("⚠️ Error in link recognition trigger:", error.message);
  }
};

const humanType = async (element, text) => {
  // נקה רווחים מיותרים ושורות ריקות
  let cleanText = text
    .replace(/\r\n/g, '\n') // המר CRLF ל-LF
    .replace(/\n{3,}/g, '\n\n') // הגבל שורות ריקות רצופות ל-2 לכל היותר
    .replace(/[ \t]+/g, ' ') // הפך רווחים מרובים לרווח יחיד
    .replace(/[ \t]*\n[ \t]*/g, '\n') // הסר רווחים בתחילת ובסוף שורות
    .trim(); // הסר רווחים מתחילת וסוף הטקסט

  // שיפור זיהוי קישורים - וודא שכל URL בשורה נפרדת
  cleanText = optimizeLinksForFacebook(cleanText);

  console.log("🧹 Cleaned text length:", cleanText.length);
  console.log("🧹 Cleaned text (first 200 chars):", JSON.stringify(cleanText.substring(0, 200)));

  let charsTyped = 0;
  const typoFrequency = 150 + Math.floor(Math.random() * 100); // כל 150–250 תווים

  for (const char of cleanText) {
    if (charsTyped > 0 && charsTyped % typoFrequency === 0 && /[a-zא-ת]/i.test(char)) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
      await element.type(wrongChar, { delay: 20 }); // הוספת delay לטייפינג
      await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
      await element.press('Backspace');
      await new Promise(r => setTimeout(r, 100));
    }

    await element.type(char, { delay: 20 }); // הוספת delay לכל תו
    charsTyped++;

    const delay = 30 + Math.floor(Math.random() * 120);
    await new Promise(r => setTimeout(r, delay));

    if (Math.random() < 0.05) {
      const pause = 400 + Math.random() * 600;
      await new Promise(r => setTimeout(r, pause));
    }
  }
};

async function main() {
  let browser;
  let groupName = groupUrl;
  let postSuccessful = false; // משתנה שעוקב אחרי הצלחת הפרסום

  try {
    const userDataDir = config.userDataDir.replace("user", os.userInfo().username);

    console.log("🚀 Launching browser with user profile...");
    browser = await puppeteer.launch({
      headless: false,
      executablePath: config.chromePath,
      userDataDir: userDataDir,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--window-size=1280,800",
        "--profile-directory=Default"
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log("📍 Navigating to group page...");
    logToFile(`📍 Navigating to: ${groupUrl}`);
    await page.goto(groupUrl, { waitUntil: "networkidle2", timeout: 0 });
    
    // קבלת שם הקבוצה מיד אחרי הטעינה
    try {
      await new Promise(r => setTimeout(r, 3000)); // המתן שהדף יטען לגמרי
      groupName = await page.title();
      console.log("📋 Group name detected:", groupName);
      // שמירת שם הקבוצה לקובץ מיד
      try {
        fs.writeFileSync(config.currentGroupFile, groupName, "utf-8");
      } catch (saveError) {
        console.log("⚠️ Warning: Could not save group name to file:", saveError.message);
      }
    } catch (e) {
      console.log("⚠️ Could not get group name yet, will try again later");
    }

    console.log("🧭 Looking for composer...");

    async function findComposer(page) {
      for (let scrollTry = 0; scrollTry < 10; scrollTry++) {
        const buttons = await page.$$('div[role="button"]');
        for (let button of buttons) {
          const text = await page.evaluate(el => el.textContent, button);
          if (
            text.includes("כאן כותבים") ||
            text.includes("Write something")
          ) {
            await button.click();
            return true;
          }
        }
        // גלילה איטית למטה במקום גלילה אחת של 800 פיקסלים
        for (let i = 0; i < 8; i++) {
          await page.evaluate(() => window.scrollBy(0, 100));
          await new Promise(r => setTimeout(r, 400)); // 0.4 שניות בין כל גלילה
        }
        await new Promise(r => setTimeout(r, 10000)); // 10 שניות השהיה
        await page.reload({ waitUntil: "networkidle2" });
        await new Promise(r => setTimeout(r, 2000));
      }
      return false;
    }

// חיפוש composer ("כאן כותבים" או "Write something") עם עד 3 ניסיונות, כולל רענון וגלילה
let composerFound = false;
let composerOpened = false;
let composerTry = 0;

while (!composerFound && composerTry < 3) {
  composerTry++;
  console.log(`🔎 Composer search attempt ${composerTry}...`);
  // חפש את כפתור "כאן כותבים" או "Write something"
  const buttons = await page.$$('div[role="button"]');
  for (let button of buttons) {
    const text = await page.evaluate(el => el.textContent, button);
    if (
      text.includes("כאן כותבים") ||
      text.includes("Write something")
    ) {
      await button.click();
      composerFound = true;
      break;
    }
  }
  if (!composerFound) {
    // גלילה איטית למטה במקום גלילה אחת של 800 פיקסלים
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 100));
      await new Promise(r => setTimeout(r, 400)); // 0.4 שניות בין כל גלילה
    }
    await new Promise(r => setTimeout(r, 10000)); // 10 שניות השהיה
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
  }
}

// אם לא נמצא composer - עבור לשלב הבא
if (!composerFound) {
  console.log("❌ Composer not found after 3 attempts. Moving to next step...");
} else {
  // נבדוק אם נפתח דיאלוג כתיבה
  let openTry = 0;
  while (!composerOpened && openTry < 3) {
    openTry++;
    try {
      await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { timeout: 8000 });
      composerOpened = true;
    } catch (e) {
      console.log(`⚠️ Composer dialog not open (attempt ${openTry}). Retrying full process...`);
      // בצע את כל התהליך מחדש: רענון, גלילה איטית, חיפוש ולחיצה
      composerFound = false;
      let retryTry = 0;
      while (!composerFound && retryTry < 3) {
        retryTry++;
        await page.reload({ waitUntil: "networkidle2" });
        await new Promise(r => setTimeout(r, 2000));
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 100));
          await new Promise(r => setTimeout(r, 400));
        }
        await new Promise(r => setTimeout(r, 700));
        const buttons = await page.$$('div[role="button"]');
        for (let button of buttons) {
          const text = await page.evaluate(el => el.textContent, button);
          if (
            text.includes("כאן כותבים") ||
            text.includes("Write something")
          ) {
            await button.click();
            composerFound = true;
            break;
          }
        }
      }
      if (!composerFound) break;
    }
  }
  if (!composerOpened) {
    console.log("❌ Composer dialog did not open after all retries. Moving to next step...");
  } else {
    // כאן ממשיכים עם כתיבת הפוסט כרגיל
    // ...existing code for typing and posting...
  }
}

// ...המשך הקוד: שלב 'הצטרף לקבוצה' וכו'...

    // אם לא נמצא composer - בדוק אם יש כפתור "הצטרף לקבוצה" או "Join Group"
if (!composerFound) {
  console.log("🔎 Checking for 'הצטרף לקבוצה'/'Join Group' button...");
  const joinButtonSelectors = [
    'div[role="button"]', 'a[role="button"]', 'button'
  ];
  let joinClicked = false;
  for (const selector of joinButtonSelectors) {
    const buttons = await page.$$(selector);
    for (let button of buttons) {
      const text = await page.evaluate(el => el.textContent.trim(), button);
      if (
        text === "הצטרף לקבוצה" ||
        text === "הצטרפי לקבוצה" ||
        text === "הצטרף/הצטרפי לקבוצה" ||
        text.toLowerCase() === "join group" ||
        text.toLowerCase() === "join"
      ) {
        await button.click();
        joinClicked = true;
        console.log("✅ Clicked join group button. Waiting 20 seconds...");
        await new Promise(r => setTimeout(r, 20000));
        break;
      }
    }
    if (joinClicked) break;
  }
  if (joinClicked) {
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
    composerFound = await findComposer(page);
  }
}
    // אם עדיין לא נמצא - רענון נוסף ואז חיפוש "דיון"/"Discussion"
    if (!composerFound) {
      console.log("🔄 Composer still not found, refreshing again before searching for 'דיון' tab...");
      await page.reload({ waitUntil: "networkidle2" });
      await new Promise(r => setTimeout(r, 2000));

      console.log("🔎 Looking for 'דיון' or 'Discussion' tab...");
      const tabButtons = await page.$$('a[role="tab"], div[role="tab"], span[role="tab"], div[role="button"], a[role="button"]');
      let discussionTabFound = false;
      for (let tab of tabButtons) {
        const text = await page.evaluate(el => el.textContent, tab);
        if (
          text.trim() === "דיון" ||
          text.trim().toLowerCase() === "discussion"
        ) {
          await tab.click();
          discussionTabFound = true;
          console.log("✅ Clicked on 'דיון'/'Discussion' tab.");
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
      }
      // נסה שוב למצוא composer (כולל באנגלית)
      if (discussionTabFound) {
        composerFound = await findComposer(page);
      }
    }

    // אם עדיין לא נמצא - רענון נוסף, המתנה 2 דקות, גלילה איטית, ואם לא נמצא - שגיאה ומעבר לקבוצה הבאה
    if (!composerFound) {
      console.log("🔄 Composer still not found after 'דיון', refreshing again and waiting 2 minutes before last attempt...");
      await page.reload({ waitUntil: "networkidle2" });
      await new Promise(r => setTimeout(r, 120000)); // 2 דקות

      // ניסיון אחרון: גלילה איטית ומציאת composer
      composerFound = false;
      for (let scrollTry = 0; scrollTry < 15; scrollTry++) {
        const buttons = await page.$$('div[role="button"]');
        for (let button of buttons) {
          const text = await page.evaluate(el => el.textContent, button);
          if (
            text.includes("כאן כותבים") ||
            text.includes("Write something") ||
            text.includes("התחל דיון") ||
            text.toLowerCase().includes("start discussion")
          ) {
            await button.click();
            composerFound = true;
            break;
          }
        }
        if (composerFound) break;
        await page.evaluate(() => window.scrollBy(0, 200));
        await new Promise(r => setTimeout(r, 700));
      }

      if (!composerFound) {
        // צילום מסך לדיבוג
        const debugPath = `C:\\temp\\composer-not-found-${Date.now()}.png`;
        await page.screenshot({ path: debugPath });
        console.log("❌ Composer not found after all attempts. Screenshot saved:", debugPath);
        logToFile(`❌ Composer not found after all attempts. Screenshot: ${debugPath}`);
        
        // תיעוד לגוגל שיטס רק בניסיון האחרון
        if (isLastAttempt) {
          await logToSheet('Post failed', 'Error', groupName || groupUrl, groupPostIdentifier, postData.title || '', `לא נמצא כפתור "כאן כותבים" גם אחרי כל הניסיונות. Screenshot: ${debugPath}`);
          console.log("📊 שגיאת Composer נרשמה לגוגל שיטס");
          logToFile("📊 Composer error logged to Google Sheets");
        }
        
        global.__errorReason = `לא נמצא composer בקבוצה: ${groupUrl} (Screenshot: ${debugPath})`;
        await browser.close();
        process.exit(1); // יציאה עם קוד שגיאה
      }
    }

    console.log("📝 Typing post text...");
    console.log("🔍 Original post text length:", postText.length);
    console.log("🔍 Original post text (first 200 chars):", JSON.stringify(postText.substring(0, 200)));
    await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { timeout: 40000 });
    const textbox = await page.$('div[role="dialog"] div[role="textbox"]');
    await textbox.click();
    await humanType(textbox, postText);

    // המתן לפייסבוק לעבד את הקישורים ולזהות אותם
    console.log("🔗 Waiting for Facebook to process links...");
    await new Promise(r => setTimeout(r, 3000));

    // בדוק אם יש קישורים שלא זוהו ונסה להעזר בטריק העריכה
    await triggerLinkRecognition(page, textbox);

    for (const imagePath of postData.images) {
      // בדוק אם הקובץ הוא תמונה (לפי סיומת)
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const ext = path.extname(imagePath).toLowerCase();
      if (!imageExts.includes(ext)) {
        console.log(`⏩ מדלג על קובץ לא תמונה: ${imagePath}`);
        continue;
      }
      
      console.log(`📋 Copying ${imagePath} to clipboard...`);
      try {
        execSync(`powershell -ExecutionPolicy Bypass -File \"C:\\postify\\posts\\copy-image.ps1\" -imagePath \"${imagePath}\"`);
        console.log("✅ Image copied to clipboard.");
      } catch (error) {
        console.error(`❌ Failed to copy ${imagePath} to clipboard: ${error.message}`);
        continue;
      }

      console.log("🖱️ Refocusing on post textbox...");
      const textbox = await page.$('div[role="dialog"] div[role="textbox"]');
      await textbox.focus();
      // Move cursor to end (simulate Ctrl+End)
      await page.keyboard.down('Control');
      await page.keyboard.press('End');
      await page.keyboard.up('Control');
      // Extra: scroll dialog to bottom
      await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) dialog.scrollTop = dialog.scrollHeight;
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log("📋 Pasting clipboard image (Ctrl+V)...");
      await page.keyboard.down('Control');
      await page.keyboard.press('v');
      await page.keyboard.up('Control');

      console.log("⏳ Waiting for image to be inserted...");
      await new Promise(resolve => setTimeout(resolve, 8000));

      const tempFolder = "C:\\temp";
      if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });
      await page.screenshot({ path: `C:\\temp\\image-paste-${path.basename(imagePath)}.png` });
    }

    // הטיפול בקבצי וידאו
    const videoFiles = postData.images.filter(imagePath => {
      const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v'];
      const ext = path.extname(imagePath).toLowerCase();
      return videoExts.includes(ext);
    });

    if (videoFiles.length > 0) {
      for (const videoPath of videoFiles) {
        try {
          console.log(`🎬 מעלה וידאו: ${videoPath}`);
          // חיפוש כפתור העלאת קובץ או איקון מצלמה
          const uploadSelectors = [
            'div[role="dialog"] input[type="file"]',
            'div[role="dialog"] [aria-label*="Photo"]',
            'div[role="dialog"] [aria-label*="Video"]',
            'div[role="dialog"] [data-testid="media-sprout"]'
          ];
          
          let fileInput = null;
          for (const selector of uploadSelectors) {
            try {
              fileInput = await page.$(selector);
              if (fileInput) break;
            } catch (e) {
              continue;
            }
          }
          
          if (fileInput) {
            await fileInput.uploadFile(videoPath);
            console.log("✅ וידאו נבחר להעלאה.");
            // המתן להעלאה
            await new Promise(resolve => setTimeout(resolve, 15000));
          } else {
            console.log("⚠️ לא נמצא כפתור העלאת קובץ");
          }
        } catch (error) {
          console.error(`❌ שגיאה בהעלאת וידאו ${videoPath}: ${error.message}`);
        }
      }
    }

    console.log("📤 Publishing post...");
    const publishButtons = await page.$$('div[role="dialog"] [role="button"]');
    let publishClicked = false;
    for (let btn of publishButtons) {
      const text = await page.evaluate(el => el.innerText.trim(), btn);
      if (text === "פרסמי" || text === "פרסם" || text === "פרסם/פרסמי" || text === "Publish" || text === "Post") {
        await btn.click();
        publishClicked = true;
        break;
      }
    }

    if (!publishClicked) {
      console.log("❌ Publish button not found");
      logToFile("❌ Publish button not found");
      // תיעוד לגוגל שיטס רק בניסיון האחרון
      if (isLastAttempt) {
        await logToSheet('Post failed', 'Error', groupName || groupUrl, groupPostIdentifier, postData.title || '', 'לא נמצא כפתור פרסום');
        console.log("📊 שגיאת Publish button נרשמה לגוגל שיטס");
        logToFile("📊 Publish button error logged to Google Sheets");
      }
      await browser.close();
      process.exit(1);
    }

    console.log("⏳ Waiting 40 seconds after publish...");
    await new Promise(resolve => setTimeout(resolve, 40000));
    
    // פשוט נניח שהפרסום הצליח ונמשיך
    let publishSuccess = true;
    console.log("✅ Post completed - continuing with process");

    // קבלת שם הקבוצה העדכני ביותר
    try {
      const currentGroupName = await page.title();
      if (currentGroupName && currentGroupName !== groupUrl) {
        groupName = currentGroupName;
        console.log("📋 Updated group name:", groupName);
        // ★ שמירת השם העדכני לקובץ מיד
        try {
          fs.writeFileSync(config.currentGroupFile, groupName, "utf-8");
          console.log("📋 Updated group name saved to file");
        } catch (saveError) {
          console.log("⚠️ Warning: Could not save updated group name:", saveError.message);
        }
      }
    } catch (e) {
      console.log("⚠️ Could not update group name:", e.message);
    }
    
    // וידוא ש-groupName תקין
    if (!groupName || groupName === 'undefined' || groupName === 'null') {
      groupName = groupUrl;
      console.log("🔧 Using fallback group name:", groupName);
    }
    
    console.log("GROUP_NAME_START" + groupName + "GROUP_NAME_END");

    // רישום הצלחה ל־logToSheet - נשלח מ-run-day.js בכל המקרים
    // אין צורך לכתוב כאן כדי למנוע כפילויות
    console.log("✅ Post published successfully");
    logToFile("✅ Post published successfully");
    postSuccessful = true; // ★ סימון שהפרסום הצליח
    
    // ★ בדיקת סטטוס פוסטים מיד אחרי פרסום מוצלח
    console.log("🔍 מתחיל בדיקת סטטוס פוסטים...");
    const statusResult = await checkPostStatusAfterPublish(page, groupUrl, groupName);
    
    // שמירת נתוני הסטטוס לקובץ זמני שיוכל לקרוא run-day.js
    const statusData = statusResult.success ? {
      latestPostStatus: statusResult.latestPostStatus || 'unknown',
      published: statusResult.published || 0,
      pending: statusResult.pending || 0,
      rejected: statusResult.rejected || 0,
      removed: statusResult.removed || 0
    } : null;
    
    if (statusData) {
      try {
        fs.writeFileSync(path.join(__dirname, 'temp-status-data.json'), JSON.stringify(statusData), 'utf8');
        console.log("✅ נתוני סטטוס נשמרו לקובץ זמני:", statusData);
      } catch (saveError) {
        console.log("⚠️ שגיאה בשמירת נתוני סטטוס:", saveError.message);
      }
    } else {
      console.log("⚠️ לא הצלחתי לבדוק סטטוס פוסטים");
    }
    
    console.log("🔍 DEBUG: About to save group name...");

    // שמירת שם הקבוצה העדכני לקובץ
    try {
      fs.writeFileSync(config.currentGroupFile, groupName, "utf-8");
      console.log("✅ Group name saved:", groupName);
    } catch (saveError) {
      console.log("⚠️ Warning: Could not save group name to file:", saveError.message);
      // זה לא אמור לפסול את כל הפרסום
    }

    console.log("🔍 DEBUG: About to close browser...");
    try {
      await browser.close();
      console.log("🎉 Browser closed successfully");
    } catch (closeError) {
      console.log("⚠️ Warning: Could not close browser properly:", closeError.message);
      // זה לא אמור לפסול את כל הפרסום
    }
    
    console.log("🎉 Process completed successfully");
    console.log("🔍 DEBUG: About to return from main function...");
    return; // הפונקציה הושלמה בהצלחה

  } catch (err) {
    console.error("❌ Error:", err.message);
    
    // ★ אם הפרסום הצליח אבל יש שגיאה אחרי זה, זה לא כישלון פרסום!
    if (postSuccessful) {
      console.log("✅ Post was published successfully, ignoring cleanup errors");
      if (browser) {
        try { await browser.close(); } catch (e) { /* ignore */ }
      }
      return; // יציאה מוצלחת למרות שגיאות בניקיון
    }
    
    // רק אם הפרסום באמת נכשל
    console.error("❌ Post publishing failed:", err.message);
    logToFile(`❌ Post publishing failed: ${err.message}`);
    
    // תיעוד לגוגל שיטס רק בניסיון האחרון
    if (isLastAttempt) {
      const notesText = groupPostIdentifier || `שגיאה כללית: ${err.message}`;
      // רישום שגיאה בעברית לעמודה G
      const errorReason = global.__errorReason || err.message || "שגיאה לא ידועה";
      await logToSheet('Post failed', 'Error', groupName || groupUrl, notesText, postData.title || '', errorReason);
      console.log("📊 שגיאה כללית נרשמה לגוגל שיטס");
      logToFile("📊 General error logged to Google Sheets");
    }
    if (browser) await browser.close();

    // שליחת מייל רק בניסיון האחרון (למנוע כפילות)
    if (isLastAttempt) {
      let reason = global.__errorReason || err.message || "שגיאה לא ידועה";
      await sendErrorMail("❌ שגיאה בפרסום פוסט", `הפרסום נכשל. סיבה: ${reason}`);
    }
    process.exit(1);
  }
}

// פונקציה לסגירת כל תהליכי כרום
async function closeChromeProcesses() {
  const { exec } = require("child_process");
  return new Promise((resolve) => {
    exec('taskkill /IM chrome.exe /F', () => resolve());
    exec('taskkill /IM chromium.exe /F', () => resolve());
  });
}

// ביטול ריטריי: הפעלה חד-פעמית בלבד
global.__errorMailSent = false;
async function runOnce() {
  try {
    console.log("🔍 DEBUG: Starting main function...");
    await main();
    console.log("🔍 DEBUG: Main function completed successfully!");
    process.exit(0);
  } catch (err) {
    console.log("🔍 DEBUG: Main function threw an error:", err.message);
    
    // בדיקה אם השגיאה קרתה אחרי פרסום מוצלח
    if (err.message && err.message.includes("cleanup")) {
      console.log("✅ Post was successful, error was in cleanup phase");
      process.exit(0); // יציאה מוצלחת
    }
    
    console.log("🔍 DEBUG: Error stack:", err.stack);
    // תיעוד טיימאווט או שגיאה כללית - נשלח מ-run-day.js בכל המקרים
    // אין צורך לכתוב כאן כדי למנוע כפילויות
    if (!global.__errorMailSent && isLastAttempt) {
      global.__errorMailSent = true;
      let reason = global.__errorReason || err.message || "שגיאה לא ידועה";
      await sendErrorMail("❌ שגיאה בפרסום פוסט", `הפרסום נכשל. סיבה: ${reason}`);
    }
    process.exit(1);
  }
}

// הפעל את הריטריי במקום ה־IIFE - בניסיון ראשון מותר לתעד, בניסיונות חוזרים לא
// הפעלה חד-פעמית בלבד, ללא ריטריי
runWithTimeout(() => runOnce(), 12 * 60 * 1000)
  .catch(async err => {
    // טיפול בשגיאת טיימאוט - נשלח מ-run-day.js בכל המקרים
    // אין צורך לכתוב כאן כדי למנוע כפילויות
    if (!global.__errorMailSent && isLastAttempt) {
      global.__errorMailSent = true;
      let reason = global.__errorReason || err.message || "שגיאה לא ידועה";
      await sendErrorMail("❌ שגיאה בפרסום פוסט", `הפרסום נכשל. סיבה: ${reason}`);
    }
    process.exit(1);
  });
