const { sendErrorMail } = require("./mailer");
const puppeteer = require("puppeteer-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require("./config.json");

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

// קריאת פרמטרים מהפקודה
const groupUrl = process.argv[2];
const jsonFileName = process.argv[3];

if (!groupUrl || !jsonFileName) {
  console.error("❌ Usage: node post.js <groupUrl> <jsonFileName>");
  process.exit(1);
}

// הגדרת נתיב לתיקיית הפוסטים לפי instance-name.txt
const instanceName = fs.readFileSync("C:\\postify\\posts\\instance-name.txt", "utf-8").trim();
const postsFolder = `C:\\postify\\user data\\${instanceName}\\posts`;
const jsonPath = path.join(postsFolder, jsonFileName);

// קריאת תוכן הפוסט
const postData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const postText = postData.text;

const logToSheet = async (...args) => {
  try {
    const fn = require('./log-to-sheets');
    await fn(...args);
  } catch (e) {
    console.error('⚠️ Failed to log to Google Sheet:', e.message);
  }
};

const humanType = async (element, text) => {
  let charsTyped = 0;
  const typoFrequency = 150 + Math.floor(Math.random() * 100); // כל 150–250 תווים

  for (const char of text) {
    if (charsTyped > 0 && charsTyped % typoFrequency === 0 && /[a-zא-ת]/i.test(char)) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
      await element.type(wrongChar);
      await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
      await element.press('Backspace');
      await new Promise(r => setTimeout(r, 100));
    }

    await element.type(char);
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
    await page.goto(groupUrl, { waitUntil: "networkidle2", timeout: 0 });
    await logToSheet('Post started', 'Info', groupUrl, 'Navigated to group page');

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
            text.includes("Write something")
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
        await logToSheet('Composer not found', 'Error', groupUrl, `לא נמצא כפתור "כאן כותבים" גם אחרי רענון, המתנה וגלילה. Screenshot: ${debugPath}`);
        await sendErrorMail("❌ Composer not found", `לא נמצא composer בקבוצה: ${groupUrl}\nScreenshot: ${debugPath}`);
        await browser.close();
        return; // עובר לקבוצה הבאה (אם יש לולאה), לא זורק שגיאה
      }
    }

    console.log("📝 Typing post text...");
    await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { timeout: 40000 });
    const textbox = await page.$('div[role="dialog"] div[role="textbox"]');
    await textbox.click();
    await humanType(textbox, postText);

    for (const imagePath of postData.images) {
      console.log(`📋 Copying ${imagePath} to clipboard...`);
      try {
        execSync(`powershell -ExecutionPolicy Bypass -File \"C:\\postify\\posts\\copy-image.ps1\" -imagePath \"${imagePath}\"`);
        console.log("✅ Image copied to clipboard.");
      } catch (error) {
        console.error(`❌ Failed to copy ${imagePath} to clipboard: ${error.message}`);
        await logToSheet('Image copy failed', 'Error', groupUrl, imagePath);
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

    console.log("📤 Publishing post...");
    const publishButtons = await page.$$('div[role="dialog"] [role="button"]');
    for (let btn of publishButtons) {
      const text = await page.evaluate(el => el.innerText.trim(), btn);
      if (text === "פרסמי" || text === "פרסם" || text === "פרסם/פרסמי" || text === "Publish" || text === "Post") {
        await btn.click();
        break;
      }
    }

    console.log("⏳ Waiting 90 seconds after publish...");
    await new Promise(resolve => setTimeout(resolve, 90000));
    groupName = await page.title();
    console.log("GROUP_NAME_START" + groupName + "GROUP_NAME_END");

    // רישום ל־logToSheet
    fs.writeFileSync(config.currentGroupFile, groupName, "utf-8");
    console.log("✅ Group name saved:", groupName);

    await browser.close();

  } catch (err) {
    console.error("❌ Error:", err.message);
    await logToSheet('Post failed', 'Error', groupName, err.message);
    if (browser) await browser.close();

    const message = [
      `🛑 התרחשה שגיאה בסקריפט: ${__filename}`,
      "",
      `❗ שגיאה: ${err.message}`,
      "",
      err.stack,
    ].join("\n");

    await sendErrorMail("❌ שגיאה באוטומציה", message);
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

// פונקציית ריטריי
async function runWithRetry(maxRetries = 3) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await main();
      return process.exit(0); // הצלחה
    } catch (err) {
      if (err.message && err.message.includes("net::ERR_ABORTED")) {
        attempt++;
        console.error(`❌ net::ERR_ABORTED – ניסיון ${attempt}/${maxRetries}`);
        await closeChromeProcesses();
        if (attempt >= maxRetries) {
          await sendErrorMail("❌ שגיאה net::ERR_ABORTED", `נכשל 3 פעמים בקבוצה: ${groupUrl}`);
          return process.exit(1);
        }
        await new Promise(r => setTimeout(r, 5000)); // המתן 5 שניות בין ניסיונות
      } else {
        // שגיאה אחרת – שלח מייל ויציאה
        const message = [
          `🛑 התרחשה שגיאה בסקריפט: ${__filename}`,
          "",
          `❗ שגיאה: ${err.message}`,
          "",
          err.stack,
        ].join("\n");
        await sendErrorMail("❌ שגיאה באוטומציה", message);
        return process.exit(1);
      }
    }
  }
}

// הפעל את הריטריי במקום ה־IIFE
runWithTimeout(runWithRetry, 12 * 60 * 1000)
  .catch(err => {
    sendErrorMail("פוסט נתקע", `Timeout - עברו 12 דקות בפוסט: ${groupUrl}\n${err.message}`);
    process.exit(1);
  });
