const fs = require("fs");
const path = require("path");
const os = require("os");

const hostname = os.hostname();
const userFolder = path.join(__dirname, "users", hostname);

const structure = [
  "posts",
  "images",
  "temp",
  "reports",
  "config"
];

const filesToCreate = [
  { name: "log.txt", content: "" },
  { name: "state.json", content: "{}" },
  { name: "current-group.txt", content: "" },
  { name: "config/email-config.js", content: `module.exports = {\n  user: "",\n  pass: "",\n  to: "",\n  errorTo: ""\n};\n` }
];

(async () => {
  try {
    console.log(`📁 יצירת תיקיית משתמש: ${userFolder}`);
    fs.mkdirSync(userFolder, { recursive: true });

    for (const folder of structure) {
      const fullPath = path.join(userFolder, folder);
      fs.mkdirSync(fullPath, { recursive: true });
    }

    for (const file of filesToCreate) {
      const filePath = path.join(userFolder, file.name);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, file.content, "utf-8");
        console.log(`📄 נוצר: ${file.name}`);
      }
    }

    console.log("✅ תיקיית המשתמש מוכנה!");
  } catch (err) {
    console.error("❌ שגיאה ביצירת תיקיות:", err.message);
  }
})();
