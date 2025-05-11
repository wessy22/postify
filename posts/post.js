const { sendErrorMail } = require("./mailer");

(async () => {
  try {
    const puppeteer = require('puppeteer-core');
const { execSync } = require('child_process');
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require("./config.json");
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
    // סימולציה של שגיאה עם תיקון
    if (charsTyped > 0 && charsTyped % typoFrequency === 0 && /[a-zא-ת]/i.test(char)) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
      await element.type(wrongChar);
      await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
      await element.press('Backspace');
      await new Promise(r => setTimeout(r, 100));
    }

    await element.type(char);
    charsTyped++;

    // השהיה רגילה בין תווים
    const delay = 30 + Math.floor(Math.random() * 120);
    await new Promise(r => setTimeout(r, delay));

    // השהיה אקראית כאילו המשתמש עוצר רגע
    if (Math.random() < 0.05) {
      const pause = 400 + Math.random() * 600;
      await new Promise(r => setTimeout(r, pause));
    }
  }
};


const groupUrl = process.argv[2];
const jsonPath = process.argv[3];

if (!groupUrl || !jsonPath) {
  console.error("❌ Usage: node post.js <groupUrl> <jsonPath>");
  process.exit(1);
}

const postData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const postText = postData.text;

(async () => {
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
    const buttons = await page.$$('div[role="button"]');
    for (let button of buttons) {
      const text = await page.evaluate(el => el.textContent, button);
      if (text.includes("כאן כותבים") || text.includes("Write something")) {
        await button.click();
        break;
      }
    }

    console.log("📝 Typing post text...");
    await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { timeout: 40000 });
    const textbox = await page.$('div[role="dialog"] div[role="textbox"]');
    await textbox.click();
    await humanType(textbox, postText);

    console.log("🟢 Clicking 'תמונה או סרטון' button...");
    const uploadButtonSelector = 'div[role="dialog"] div[aria-label="תמונה או סרטון"][role="button"]';
    await page.waitForSelector(uploadButtonSelector, { timeout: 10000 });
    const uploadButton = await page.$(uploadButtonSelector);
    await uploadButton.click();
    await new Promise(resolve => setTimeout(resolve, 1500));

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
      await textbox.click();
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
      if (text === "פרסמי" || text === "פרסם" || text === "Publish") {
        await btn.click();
        break;
      }
    }

    console.log("⏳ Waiting 90 seconds after publish...");
    await new Promise(resolve => setTimeout(resolve, 90000));
    groupName = await page.title();
    console.log("GROUP_NAME_START" + groupName + "GROUP_NAME_END");
    groupName = groupName.replace(" | postify", "").trim();
    fs.writeFileSync(config.currentGroupFile, groupName, "utf-8");
    console.log("✅ Group name saved:", groupName);

    await logToSheet('Post published', 'Success', groupName, 'Text + Images');
    await browser.close();

  } catch (err) {
    console.error("❌ Error:", err.message);
    await logToSheet('Post failed', 'Error', groupName, err.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();


  } catch (err) {
    console.error("❌ שגיאה באוטומציה:", err);

    const message = [
      `🛑 התרחשה שגיאה בסקריפט: ${__filename}`,
      "",
      `❗ שגיאה: ${err.message}`,
      "",
      err.stack,
    ].join("\n");

    await sendErrorMail("❌ שגיאה באוטומציה", message);

    process.exit(1); // עצור את הריצה
  }
})();