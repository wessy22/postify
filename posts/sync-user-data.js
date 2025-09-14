const fs = require("fs");
const path = require("path");
const https = require("https");

// 🧠 קרא את שם השרת מתוך הקובץ instance-name.txt
const instanceNameFile = path.join(__dirname, "instance-name.txt");
if (!fs.existsSync(instanceNameFile)) {
  console.error("❌ Missing instance-name.txt");
  process.exit(1);
}
const hostname = fs.readFileSync(instanceNameFile, "utf-8").trim();

// הגדרת התיקייה של הלקוח
const userFolder = path.join("C:", "postify", "user data", hostname);
const apiUrl = `https://postify.co.il/wp-content/postify-api/get-user-data.php?hostname=${hostname}`;

// מערכת לוגים
let logMessages = [];
const logFile = path.join(userFolder, "sync-log.txt");

function logMessage(level, message) {
  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
  const logEntry = `[${timestamp}] ${level}: ${message}`;
  logMessages.push(logEntry);
  console.log(`${level === 'ERROR' ? '❌' : level === 'WARN' ? '⚠️' : 'ℹ️'} ${message}`);
}

function saveLogToFile() {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const logContent = logMessages.join('\n') + '\n';
    fs.writeFileSync(logFile, logContent, 'utf-8');
    console.log(`📋 לוג נשמר ב: ${logFile}`);
  } catch (error) {
    console.error(`❌ שגיאה בשמירת לוג: ${error.message}`);
  }
}

function deleteFolderRecursive(folder) {
  if (fs.existsSync(folder)) {
    fs.readdirSync(folder).forEach(file => {
      const curPath = path.join(folder, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folder);
  }
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, response => {
      if (response.statusCode !== 200) {
        fs.unlink(dest, () => {});
        const error = new Error(`Failed to download image: ${url} – Status ${response.statusCode}`);
        logMessage('ERROR', `הורדת קובץ נכשלה: ${url} - סטטוס ${response.statusCode}`);
        return reject(error);
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        logMessage('INFO', `הורדת קובץ הושלמה: ${path.basename(dest)}`);
        resolve();
      });
    }).on("error", err => {
      fs.unlink(dest, () => {});
      logMessage('ERROR', `שגיאת רשת בהורדת קובץ: ${url} - ${err.message}`);
      reject(err);
    });
  });
}

// ========== פונקציה ליצירת daily-settings.json ==========
function createDailySettingsFile(userSettings, userFolder) {
  try {
    const settingsData = {
      MAX_POSTS_PER_DAY: parseInt(userSettings.max_posts_per_day) || 5,
      MAX_PUBLICATIONS_PER_DAY: parseInt(userSettings.max_publications_per_day) || 15,
      DELAY_BETWEEN_POSTS_MINUTES: parseInt(userSettings.delay_between_posts_minutes) || 10,
      ENABLE_SMART_DISTRIBUTION: userSettings.enable_smart_distribution === "1" || userSettings.enable_smart_distribution === 1,
      ENABLE_SABBATH_SHUTDOWN: userSettings.enable_sabbath_shutdown === "1" || userSettings.enable_sabbath_shutdown === 1,
      SABBATH_SHUTDOWN_HOURS_BEFORE: 1,
      description: `הגדרות יומיות למערכת הפרסום - משתמש: ${hostname}`,
      last_updated: new Date().toISOString(),
      synced_from_website: true,
      hostname: hostname
    };

    // יצירת הקובץ בתיקיית המשתמש
    const settingsPath = path.join(userFolder, "daily-settings.json");
    fs.writeFileSync(settingsPath, JSON.stringify(settingsData, null, 2), "utf-8");
    
    console.log(`✅ יצר קובץ הגדרות: ${settingsPath}`);
    console.log(`📊 הגדרות המשתמש:
      📝 פוסטים ביום: ${settingsData.MAX_POSTS_PER_DAY}
      📢 פרסומים ביום: ${settingsData.MAX_PUBLICATIONS_PER_DAY}
      ⏱️ השהייה: ${settingsData.DELAY_BETWEEN_POSTS_MINUTES} דקות
      🧠 חלוקה חכמה: ${settingsData.ENABLE_SMART_DISTRIBUTION ? 'מופעלת' : 'כבויה'}
      🕯️ כיבוי לשבת: ${settingsData.ENABLE_SABBATH_SHUTDOWN ? 'מופעל' : 'כבוי'}`);
    
    return settingsPath;
  } catch (error) {
    console.error("❌ שגיאה ביצירת קובץ הגדרות:", error.message);
    return null;
  }
}

(async () => {
  try {
    logMessage('INFO', `התחלת סינכרון נתונים עבור ${hostname}`);
    console.log(`🌐 Fetching post data for ${hostname}...`);

    // מחיקה של כל התיקייה הקיימת לפני סנכרון
    if (fs.existsSync(userFolder)) {
      console.log("🧹 Cleaning user folder before sync...");
      logMessage('INFO', 'מנקה תיקיית משתמש לפני סינכרון');
      deleteFolderRecursive(userFolder);
    }

        // ========== שליפת נתונים משולבים (פוסטים + הגדרות) ==========
    logMessage('INFO', `שולף נתונים מ-API: ${apiUrl}`);
    const dataRes = await fetch(apiUrl);
    const data = await dataRes.json();
    
    let posts, userSettings;
    
    // בדיקה אם הקובץ מחזיר מבנה חדש (פוסטים + הגדרות) או מבנה ישן (רק פוסטים)
    if (data.posts && data.user_settings) {
        // מבנה חדש - יש הגדרות ופוסטים נפרדים
        posts = data.posts;
        userSettings = data.user_settings;
        logMessage('INFO', `נתונים התקבלו במבנה חדש: ${posts.length} פוסטים + הגדרות משתמש`);
        console.log(`📝 נמצאו ${posts.length} פוסטים למשתמש ${hostname}`);
        console.log(`⚙️ הגדרות משתמש נשלפו מ-API`);
    } else if (Array.isArray(data)) {
        // מבנה ישן - רק פוסטים
        posts = data;
        userSettings = null; // ברירת מחדל - ייצר הגדרות ברירת מחדל
        logMessage('INFO', `נתונים התקבלו במבנה ישן: ${posts.length} פוסטים בלבד`);
        console.log(`📝 נמצאו ${posts.length} פוסטים למשתמש ${hostname}`);
        console.log(`⚙️ הגדרות משתמש נשלפו מ-ברירת מחדל`);
    } else {
        logMessage('ERROR', 'תבנית לא מוכרת של נתונים מהשרת');
        throw new Error('תבנית לא מוכרת של נתונים מהשרת');
    }



    // ודא שהתיקייה קיימת לפני יצירת קובץ הגדרות
    fs.mkdirSync(userFolder, { recursive: true });
    logMessage('INFO', `תיקיית משתמש נוצרה: ${userFolder}`);
    
    // ========== יצירת קובץ הגדרות יומיות ==========
    console.log(`⚙️ יוצר קובץ daily-settings.json למשתמש...`);
    logMessage('INFO', 'יוצר קובץ הגדרות יומיות');
    const settingsPath = createDailySettingsFile(userSettings, userFolder);
    if (settingsPath) {
      console.log(`✅ קובץ הגדרות נוצר בהצלחה: ${settingsPath}`);
      logMessage('INFO', `קובץ הגדרות נוצר: ${settingsPath}`);
    } else {
      console.warn(`⚠️ בעיה ביצירת קובץ הגדרות`);
      logMessage('WARN', 'בעיה ביצירת קובץ הגדרות');
    }

    // ========== יצירת תיקיות ועיבוד פוסטים ========== 
    let totalPosts = posts.length;
    let totalImages = 0;
    let successfulImages = 0;
    let skippedImages = 0;
    
    logMessage('INFO', `מתחיל עיבוד ${totalPosts} פוסטים`);
    
    for (const post of posts) {
      try {
        logMessage('INFO', `מעבד פוסט: ${post.name} (${post.images.length} תמונות)`);
        
        const postPath = path.join(userFolder, "posts", `${post.name}.json`);
        fs.mkdirSync(path.dirname(postPath), { recursive: true });
        
        const postImageDir = path.join(userFolder, "images", post.name);
        fs.mkdirSync(postImageDir, { recursive: true });

        totalImages += post.images.length;

        for (let i = 0; i < post.images.length; i++) {
          try {
            let imageUrl = post.images[i];
            if (!imageUrl.startsWith("http")) {
              imageUrl = "https://postify.co.il/wp-content/postify-api/" + imageUrl.replace(/^\+|^\/+/, "");
            }

            // קבע סיומת מקורית
            let ext = path.extname(imageUrl).toLowerCase();
            // רשימת סיומות תמונה נפוצות
            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
            let isImage = imageExts.includes(ext);
            let destName;
            if (isImage && ext) {
              // שמור את הסיומת המקורית (כולל GIF)
              destName = `${i + 1}${ext}`;
            } else if (ext) {
              // קובץ לא תמונה אבל יש סיומת - שמור אותה
              destName = `${i + 1}${ext}`;
            } else {
              // אין סיומת בכלל - תן ברירת מחדל jpg
              destName = `${i + 1}.jpg`;
            }
            
            const imageDest = path.join(postImageDir, destName);
            
            if (!fs.existsSync(imageDest)) {
              console.log(`⬇️ Downloading: ${imageUrl}`);
              await downloadImage(imageUrl, imageDest);
              successfulImages++;
            } else {
              logMessage('INFO', `קובץ כבר קיים, דילוג: ${destName}`);
              successfulImages++;
            }
            post.images[i] = imageDest; // עדכון הנתיב המקומי
            
          } catch (imageError) {
            logMessage('WARN', `דילוג על תמונה בגלל שגיאה: ${imageError.message}`);
            // הסר את התמונה הבעייתית מהרשימה
            post.images.splice(i, 1);
            i--; // התאם את האינדקס
            skippedImages++;
            continue; // המשך עם התמונה הבאה
          }
        }

        // שמור את הפוסט (גם אם חלק מהתמונות נכשלו)
        fs.writeFileSync(postPath, JSON.stringify(post, null, 2), "utf-8");
        logMessage('INFO', `פוסט ${post.name} נשמר בהצלחה`);
        
      } catch (postError) {
        logMessage('ERROR', `שגיאה בעיבוד פוסט ${post.name}: ${postError.message}`);
        // המשך עם הפוסט הבא
        continue;
      }
    }

    // סיכום התהליך
    logMessage('INFO', `סינכרון הושלם בהצלחה`);
    logMessage('INFO', `פוסטים: ${totalPosts} סונכרנו`);
    logMessage('INFO', `תמונות: ${successfulImages}/${totalImages} הורדו בהצלחה`);
    if (skippedImages > 0) {
      logMessage('WARN', `${skippedImages} תמונות דולגו בגלל שגיאות`);
    }

    console.log(`\n🎉 Sync complete for ${hostname}!`);
    console.log(`📁 נתונים נשמרו ב: ${userFolder}`);
    console.log(`📊 ${totalPosts} פוסטים סונכרנו`);
    console.log(`🖼️ תמונות: ${successfulImages}/${totalImages} הורדו, ${skippedImages} דולגו`);
    console.log(`⚙️ הגדרות יומיות מוכנות לשימוש`);
    
    // שמירת לוג לקובץ
    saveLogToFile();
    
  } catch (err) {
    logMessage('ERROR', `כשלון כללי בסינכרון: ${err.message}`);
    console.error("❌ Sync failed:", err.message);
    saveLogToFile(); // שמור לוג גם במקרה של שגיאה כללית
  }
})();