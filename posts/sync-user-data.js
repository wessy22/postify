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

(async () => {
  try {
    console.log(`🌐 Fetching post data for ${hostname}...`);

    // מחיקה של כל התיקייה הקיימת לפני סנכרון
    if (fs.existsSync(userFolder)) {
      console.log("🧹 Cleaning user folder before sync...");
      deleteFolderRecursive(userFolder);
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