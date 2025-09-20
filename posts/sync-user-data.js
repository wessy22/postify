const fs = require("fs");
const path = require("path");
const https = require("https");
const { sendMail, sendErrorMail } = require("./mailer");

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
    // נסה למצוא מייל לקוח מההגדרות
    let clientEmail = null;
    if (userSettings && userSettings.email) {
      clientEmail = userSettings.email;
    } else if (userSettings && userSettings.user_email) {
      clientEmail = userSettings.user_email;
    } else if (userSettings && userSettings.client_email) {
      clientEmail = userSettings.client_email;
    }

    const settingsData = {
      MAX_POSTS_PER_DAY: parseInt(userSettings?.max_posts_per_day) || 5,
      MAX_PUBLICATIONS_PER_DAY: parseInt(userSettings?.max_publications_per_day) || 15,
      DELAY_BETWEEN_POSTS_MINUTES: parseInt(userSettings?.delay_between_posts_minutes) || 10,
      ENABLE_SMART_DISTRIBUTION: userSettings?.enable_smart_distribution === "1" || userSettings?.enable_smart_distribution === 1,
      ENABLE_SABBATH_SHUTDOWN: userSettings?.enable_sabbath_shutdown === "1" || userSettings?.enable_sabbath_shutdown === 1,
      SABBATH_SHUTDOWN_HOURS_BEFORE: 1,
      CLIENT_EMAIL: clientEmail, // 📧 מייל הלקוח מהשרת
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
      🕯️ כיבוי לשבת: ${settingsData.ENABLE_SABBATH_SHUTDOWN ? 'מופעל' : 'כבוי'}
      📧 מייל לקוח: ${settingsData.CLIENT_EMAIL || 'לא הוגדר'}`);
    
    return settingsPath;
  } catch (error) {
    console.error("❌ שגיאה ביצירת קובץ הגדרות:", error.message);
    return null;
  }
}

// ========== פונקציונלי בדיקה האם כבר נשלח מייל היום ==========
function getTodayString() {
  return new Date().toISOString().split('T')[0]; // פורמט: YYYY-MM-DD
}

function getEmailCacheFilePath(userFolder) {
  return path.join(userFolder, "email-cache.json");
}

function loadEmailCache(userFolder) {
  const cacheFile = getEmailCacheFilePath(userFolder);
  try {
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return data;
    }
  } catch (error) {
    logMessage('WARN', `שגיאה בקריאת קובץ cache: ${error.message}`);
  }
  return { lastEmailDate: null, lastFailedPosts: [] };
}

function saveEmailCache(userFolder, failedPosts) {
  const cacheFile = getEmailCacheFilePath(userFolder);
  const cacheData = {
    lastEmailDate: getTodayString(),
    lastFailedPosts: failedPosts.map(post => ({
      name: post.name,
      title: post.title,
      failedImages: post.failedImages,
      originalImageCount: post.originalImageCount
    })),
    timestamp: new Date().toISOString()
  };
  
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
    logMessage('INFO', `נתוני cache נשמרו: ${cacheFile}`);
  } catch (error) {
    logMessage('ERROR', `שגיאה בשמירת cache: ${error.message}`);
  }
}

function areFailureListsEqual(list1, list2) {
  if (list1.length !== list2.length) return false;
  
  // מיין לפי name כדי להשוות בצורה עקבית
  const sorted1 = [...list1].sort((a, b) => a.name.localeCompare(b.name));
  const sorted2 = [...list2].sort((a, b) => a.name.localeCompare(b.name));
  
  for (let i = 0; i < sorted1.length; i++) {
    if (sorted1[i].name !== sorted2[i].name ||
        sorted1[i].failedImages !== sorted2[i].failedImages ||
        sorted1[i].originalImageCount !== sorted2[i].originalImageCount) {
      return false;
    }
  }
  return true;
}

// ========== פונקציה לשליחת מייל ללקוח על כשלונות ==========
async function sendClientFailureNotification(postsWithFailures, hostname, userSettings, userFolder) {
  if (postsWithFailures.length === 0) return;

  // בדיקה האם כבר נשלח מייל היום על אותן בעיות
  const emailCache = loadEmailCache(userFolder);
  const today = getTodayString();
  
  if (emailCache.lastEmailDate === today && 
      areFailureListsEqual(postsWithFailures, emailCache.lastFailedPosts)) {
    logMessage('INFO', 'מייל זהה כבר נשלח היום - מדלג על שליחה נוספת');
    console.log('📧 מייל זהה כבר נשלח היום - מדלג על שליחה נוספת');
    return;
  }

  // נסה למצוא מייל לקוח מההגדרות
  let clientEmail = null;
  if (userSettings && userSettings.email) {
    clientEmail = userSettings.email;
  } else if (userSettings && userSettings.user_email) {
    clientEmail = userSettings.user_email;
  } else if (userSettings && userSettings.client_email) {
    clientEmail = userSettings.client_email;
  }

  if (!clientEmail) {
    logMessage('WARN', 'לא נמצא מייל לקוח בהגדרות - המייל יישלח למייל ברירת המחדל');
    console.log('⚠️ לא נמצא מייל לקוח - המייל יישלח למייל ברירת המחדל');
  } else {
    logMessage('INFO', `מייל לקוח נמצא: ${clientEmail}`);
    console.log(`📧 שולח מייל התראה ללקוח: ${clientEmail}`);
  }

  const subject = `⚠️ שגיאות בסינכרון פוסטים - ${hostname}`;
  
  // יצירת רשימה של הפוסטים הבעייתיים
  const postsList = postsWithFailures.map(post => {
    const mediaType = post.originalImageCount > 0 && post.originalImageCount <= 3 ? 'תמונות' : 'קבצי מדיה';
    return `• **${post.title}**: ${post.failedImages} ${mediaType} נכשלו מתוך ${post.originalImageCount}`;
  }).join('\n');
  
  const totalFailedFiles = postsWithFailures.reduce((sum, post) => sum + post.failedImages, 0);
  
  const textMessage = `
שלום,

זוהו שגיאות בסינכרון נתוני הפוסטים שלך מהאתר.

🔍 פרטי השגיאות:
${postsList}

📊 סיכום:
• ${postsWithFailures.length} פוסטים מושפעים
• ${totalFailedFiles} קבצי מדיה נכשלו בסך הכל

🔧 מה לעשות?
1. היכנס לעמוד הפוסטים באתר: https://postify.co.il/wp-admin/edit.php?post_type=post
2. מצא את הפוסטים הבעייתיים המפורטים למעלה
3. המלצה: מחק את כל התמונות/וידאו מהפוסטים הבעייתיים
4. העלה מחדש את התמונות/וידאו (ודא שהקבצים תקינים)
5. הרץ שוב סינכרון נתונים

⚠️ חשוב: הפוסטים עדיין מפורסמים באתר, רק חלק מהתמונות/וידאו לא הורדו למערכת הפרסום האוטומטית.

בברכה,
צוות Postify
  `.trim();

  const htmlMessage = `
<div dir="rtl" style="text-align:right;font-family:Arial,sans-serif;">
  <div style="background-color:#fff3e0;border:2px solid:#ff9800;border-radius:8px;padding:20px;">
    <h2 style="color:#e65100;margin-top:0;">⚠️ שגיאות בסינכרון פוסטים</h2>
    
    <div style="background-color:#e8f5e8;padding:10px;border-radius:5px;margin:10px 0;">
      <b>🖥️ שרת:</b> <span style="background-color:#4CAF50;color:white;padding:2px 8px;border-radius:3px;">${hostname}</span>
    </div>
    
    <div style="background-color:#ffffff;padding:15px;border-radius:5px;margin:15px 0;">
      <h3 style="color:#e65100;">🔍 פרטי השגיאות:</h3>
      <ul style="line-height:1.8;">
        ${postsWithFailures.map(post => 
          `<li><b>${post.title}</b>: ${post.failedImages} קבצי מדיה נכשלו מתוך ${post.originalImageCount}</li>`
        ).join('')}
      </ul>
    </div>
    
    <div style="background-color:#e3f2fd;padding:15px;border-radius:5px;margin:15px 0;">
      <b>📊 סיכום:</b><br>
      • ${postsWithFailures.length} פוסטים מושפעים<br>
      • ${totalFailedFiles} קבצי מדיה נכשלו בסך הכל
    </div>
    
    <div style="background-color:#ffcdd2;padding:15px;border-radius:5px;margin:15px 0;">
      <b>🔧 מה לעשות:</b><br>
      1. היכנס לעמוד הפוסטים באתר: <a href="https://postify.co.il/wp-admin/edit.php?post_type=post" target="_blank">לחץ כאן</a><br>
      2. מצא את הפוסטים הבעייתיים המפורטים למעלה<br>
      3. <b>המלצה:</b> מחק את כל התמונות/וידאו מהפוסטים הבעייתיים<br>
      4. העלה מחדש את התמונות/וידאו (ודא שהקבצים תקינים)<br>
      5. הרץ שוב סינכרון נתונים
    </div>
    
    <div style="background-color:#fff3e0;padding:10px;border-radius:5px;margin:10px 0;font-size:14px;">
      <b>💡 הערה:</b> הפוסטים עדיין מפורסמים באתר, רק חלק מהתמונות/וידאו לא הורדו למערכת הפרסום האוטומטית.
    </div>
    
    <div style="text-align:center;margin-top:20px;">
      <b>בברכה, צוות Postify</b>
    </div>
  </div>
</div>
  `.trim();

  try {
    // 🚧 זמנית: שליחת מיילים רק למנהל המערכת
    // שליחה למנהל המערכת בלבד
    await sendMail(subject, textMessage, htmlMessage);
    
    // שמירת המידע על המייל שנשלח ב-cache
    saveEmailCache(userFolder, postsWithFailures);
    
    if (clientEmail) {
      logMessage('INFO', `מייל התראה נשלח למנהל המערכת (שליחה ללקוח ${clientEmail} מושבתת זמנית) עבור ${postsWithFailures.length} פוסטים בעייתיים`);
      console.log(`📧 מייל התראה נשלח למנהל המערכת (שליחה ללקוח ${clientEmail} מושבתת זמנית) על ${postsWithFailures.length} פוסטים בעייתיים`);
    } else {
      logMessage('INFO', `מייל התראה נשלח למנהל המערכת עבור ${postsWithFailures.length} פוסטים בעייתיים`);
      console.log(`📧 מייל התראה נשלח למנהל המערכת על ${postsWithFailures.length} פוסטים בעייתיים`);
    }
  } catch (error) {
    logMessage('ERROR', `שגיאה בשליחת מייל ללקוח: ${error.message}`);
    console.error(`❌ שגיאה בשליחת מייל ללקוח: ${error.message}`);
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
    let postsWithFailures = []; // פוסטים שיש להם כשלונות בתמונות
    
    logMessage('INFO', `מתחיל עיבוד ${totalPosts} פוסטים`);
    
    for (const post of posts) {
      let postFailedImages = 0; // מונה תמונות שנכשלו לפוסט הנוכחי
      let postOriginalImageCount = post.images.length; // מספר התמונות המקורי
      
      try {
        logMessage('INFO', `מעבד פוסט: ${post.title || post.post_title || post.name} (${post.images.length} תמונות)`);
        
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
            logMessage('WARN', `דילוג על תמונה בפוסט ${post.title || post.post_title || post.name}: ${imageError.message}`);
            // הסר את התמונה הבעייתית מהרשימה
            post.images.splice(i, 1);
            i--; // התאם את האינדקס
            skippedImages++;
            postFailedImages++; // ספור כשלון לפוסט זה
            continue; // המשך עם התמונה הבאה
          }
        }

        // אם יש כשלונות בפוסט זה, הוסף לרשימת הפוסטים עם בעיות
        if (postFailedImages > 0) {
          postsWithFailures.push({
            name: post.name,
            title: post.title || post.post_title || post.name, // כותרת הפוסט או שם הקובץ כברירת מחדל
            failedImages: postFailedImages,
            originalImageCount: postOriginalImageCount,
            successfulImages: postOriginalImageCount - postFailedImages
          });
          logMessage('WARN', `פוסט ${post.title || post.post_title || post.name}: ${postFailedImages} תמונות נכשלו מתוך ${postOriginalImageCount}`);
        }

        // שמור את הפוסט (גם אם חלק מהתמונות נכשלו)
        fs.writeFileSync(postPath, JSON.stringify(post, null, 2), "utf-8");
        logMessage('INFO', `פוסט ${post.title || post.post_title || post.name} נשמר בהצלחה`);
        
      } catch (postError) {
        logMessage('ERROR', `שגיאה בעיבוד פוסט ${post.title || post.post_title || post.name}: ${postError.message}`);
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

    // שליחת מייל ללקוח אם יש כשלונות
    if (postsWithFailures.length > 0) {
      console.log(`📧 נמצאו כשלונות ב-${postsWithFailures.length} פוסטים - בודק אם צריך לשלוח מייל התראה...`);
      await sendClientFailureNotification(postsWithFailures, hostname, userSettings, userFolder);
    } else {
      console.log(`✅ כל הפוסטים סונכרנו בהצלחה מלאה - אין צורך במייל התראה`);
    }

    console.log(`\n🎉 Sync complete for ${hostname}!`);
    console.log(`📁 נתונים נשמרו ב: ${userFolder}`);
    console.log(`📊 ${totalPosts} פוסטים סונכרנו`);
    console.log(`🖼️ תמונות: ${successfulImages}/${totalImages} הורדו, ${skippedImages} דולגו`);
    if (postsWithFailures.length > 0) {
      console.log(`⚠️ ${postsWithFailures.length} פוסטים עם בעיות - נשלח מייל ללקוח`);
    }
    console.log(`⚙️ הגדרות יומיות מוכנות לשימוש`);
    
    // שמירת לוג לקובץ
    saveLogToFile();
    
  } catch (err) {
    logMessage('ERROR', `כשלון כללי בסינכרון: ${err.message}`);
    console.error("❌ Sync failed:", err.message);
    saveLogToFile(); // שמור לוג גם במקרה של שגיאה כללית
  }
})();