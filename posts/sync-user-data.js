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
        return reject(new Error(`Failed to download image: ${url} – Status ${response.statusCode}`));
      }
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", err => {
      fs.unlink(dest, () => {});
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
    console.log(`🌐 Fetching post data for ${hostname}...`);

    // מחיקה של כל התיקייה הקיימת לפני סנכרון
    if (fs.existsSync(userFolder)) {
      console.log("🧹 Cleaning user folder before sync...");
      deleteFolderRecursive(userFolder);
    }

    // ========== שליפת נתונים משולבים (פוסטים + הגדרות) ==========
    const dataRes = await fetch(apiUrl);
    const data = await dataRes.json();
    
    let posts, userSettings;
    
    // בדיקה אם הקובץ מחזיר מבנה חדש (פוסטים + הגדרות) או מבנה ישן (רק פוסטים)
    if (data.posts && data.user_settings) {
        // מבנה חדש - יש הגדרות ופוסטים נפרדים
        posts = data.posts;
        userSettings = data.user_settings;
        console.log(`📝 נמצאו ${posts.length} פוסטים למשתמש ${hostname}`);
        console.log(`⚙️ הגדרות משתמש נשלפו מ-${userSettings.source === 'database' ? 'מסד הנתונים' : 'ברירת מחדל'}`);
    } else if (Array.isArray(data)) {
        // מבנה ישן - רק פוסטים, השתמש בהגדרות ברירת מחדל
        posts = data;
        console.log(`📝 נמצאו ${posts.length} פוסטים למשתמש ${hostname}`);
        console.log(`⚠️ לא נמצאו הגדרות במסד הנתונים, משתמש בברירת מחדל`);
        userSettings = {
            max_posts_per_day: 5,
            max_publications_per_day: 15,
            delay_between_posts_minutes: 30,
            enable_smart_distribution: 1,
            enable_sabbath_shutdown: 1,
            source: 'default'
        };
    } else {
        throw new Error('תבנית לא מוכרת של נתונים מהשרת');
    }



    // ודא שהתיקייה קיימת לפני יצירת קובץ הגדרות
    fs.mkdirSync(userFolder, { recursive: true });
    // ========== יצירת קובץ הגדרות יומיות ==========
    console.log(`⚙️ יוצר קובץ daily-settings.json למשתמש...`);
    const settingsPath = createDailySettingsFile(userSettings, userFolder);
    if (settingsPath) {
      console.log(`✅ קובץ הגדרות נוצר בהצלחה: ${settingsPath}`);
    } else {
      console.warn(`⚠️ בעיה ביצירת קובץ הגדרות`);
    }

    // ========== יצירת תיקיות ועיבוד פוסטים ========== 
    for (const post of posts) {
      const postPath = path.join(userFolder, "posts", `${post.name}.json`);
      fs.mkdirSync(path.dirname(postPath), { recursive: true });
      fs.writeFileSync(postPath, JSON.stringify(post, null, 2), "utf-8");

      const postImageDir = path.join(userFolder, "images", post.name);
      fs.mkdirSync(postImageDir, { recursive: true });

      for (let i = 0; i < post.images.length; i++) {
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
        }
        post.images[i] = imageDest; // עדכון הנתיב המקומי
      }

      fs.writeFileSync(postPath, JSON.stringify(post, null, 2), "utf-8");
    }

    console.log(`\n🎉 Sync complete for ${hostname}!`);
    console.log(`📁 נתונים נשמרו ב: ${userFolder}`);
    console.log(`📊 ${posts.length} פוסטים סונכרנו`);
    console.log(`⚙️ הגדרות יומיות מוכנות לשימוש`);
    
  } catch (err) {
    console.error("❌ Sync failed:", err.message);
  }
})();