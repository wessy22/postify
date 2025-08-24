const fs = require("fs");
const path = require("path");
const https = require("https");

// ================================================================
// SYNC-USER-DATA - סנכרון פשוט של נתונים מהאתר לשרת
// ================================================================
// תפקידים:
// 1. מוריד את כל נתוני הפוסטים מהאתר (SQL)
// 2. שומר אותם כקבצי JSON בשרת המקומי
// 3. מוריד תמונות וקבצים נלווים
// 4. מנקה את התיקייה לפני הסנכרון (מחיקה מלאה ובנייה מחדש)
// 
// הקוד פשוט שולף את מה שה-API מחזיר מה-SQL - כולל publish_time
// אם publish_time לא מגיע, זה אומר שהוא לא נכלל ב-get-user-data.php
// ================================================================

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
    try {
      fs.readdirSync(folder).forEach(file => {
        const curPath = path.join(folder, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(folder);
    } catch (error) {
      console.log(`⚠️ Warning: Could not delete ${folder} - ${error.message}`);
      // ממשיכים למרות השגיאה
    }
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

(async () => {
  try {
    console.log(`🌐 Fetching post data for ${hostname}...`);

    // מחיקה של כל התיקייה הקיימת לפני סנכרון (עם טיפול בשגיאות)
    if (fs.existsSync(userFolder)) {
      console.log("🧹 Cleaning user folder before sync...");
      try {
        deleteFolderRecursive(userFolder);
        console.log("✅ User folder cleaned successfully");
      } catch (error) {
        console.log(`⚠️ Warning: Could not fully clean user folder - ${error.message}`);
        console.log("🔄 Continuing with sync anyway...");
      }
    }

    const res = await fetch(apiUrl);
    const posts = await res.json();

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
        if (isImage) {
          destName = `${i + 1}.jpg`;
        } else {
          // אם זה וידאו או קובץ אחר, שמור את הסיומת המקורית
          destName = `${i + 1}${ext}`;
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

    console.log("✅ Sync complete.");
    
  } catch (err) {
    console.error("❌ Sync failed:", err.message);
  }
})();