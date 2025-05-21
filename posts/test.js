
const puppeteer = require('puppeteer-core');
const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const { execSync } = require('child_process');
const fs = require("fs");
const path = require("path");
const humanType = async (element, text) => {
  for (const char of text) {
    await element.type(char);
    const delay = 30 + Math.floor(Math.random() * 120); // 30–150ms
    await new Promise(r => setTimeout(r, delay));

    // עצירה קטנה רנדומלית לפעמים
    if (Math.random() < 0.05) {
      const pause = 400 + Math.random() * 600; // 400–1000ms
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
  try {
    console.log("🚀 Launching browser with user profile...");
    browser = await puppeteer.launch({
      headless: false,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      userDataDir: "C:\\postify\\chrome-profile",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1280,800"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log("📍 Navigating to group page...");
    await page.goto(groupUrl, { waitUntil: "networkidle2", timeout: 0 });

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
    await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { timeout: 20000 });
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
        execSync(`powershell -ExecutionPolicy Bypass -File "C:\\postify\\posts\\copy-image.ps1" -imagePath "${imagePath}"`);
        console.log("✅ Image copied to clipboard.");
      } catch (error) {
        console.error(`❌ Failed to copy ${imagePath} to clipboard: ${error.message}`);
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

      await page.screenshot({ path: `C:\\temp\\image-paste-${path.basename(imagePath)}.png` });
    }


    console.log("📤 Publishing post...");
    const publishButtons = await page.$$('div[role="dialog"] [role="button"]');
    for (let btn of publishButtons) {
      const text = await page.evaluate(el => el.innerText.trim(), btn);
      if (text === "פרסמי" || text === "Publish") {
        await btn.click();
        break;
      }
    }

    console.log("✅ Post published.");
    await new Promise(resolve => setTimeout(resolve, 20000));
    await browser.close();

  } catch (err) {
    console.error("❌ Error:", err.message);
    if (browser) await browser.close();
  }
})();
