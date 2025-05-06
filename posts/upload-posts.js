const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const profilePath = 'C:\\Users\\test\\AppData\\Local\\Google\\Chrome\\User Data';
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const postsDir = 'C:\\postify\\downloaded-posts';
const postTargetUrl = 'https://www.facebook.com/profile.php?id=61575614817569'; // שנה ליעד המתאים (קבוצה/דף)

const delay = (ms) => new Promise(res => setTimeout(res, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: chromePath,
    userDataDir: profilePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--window-size=1280,800",
      "--profile-directory=Default"
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const folders = fs.readdirSync(postsDir).filter(f => f.startsWith("post"));
  folders.sort();

  for (const folder of folders) {
    const fullPath = path.join(postsDir, folder);
    const postPath = path.join(fullPath, "post.json");

    if (!fs.existsSync(postPath)) continue;

    const post = JSON.parse(fs.readFileSync(postPath, 'utf8'));
    const imagePaths = post.images.map(img => path.join(fullPath, img));

    console.log(`📢 Posting: ${post.text.substring(0, 50)}...`);

    await page.goto(postTargetUrl, { waitUntil: 'networkidle2' });

    const buttons = await page.$$('div[role="button"]');
    let composerOpened = false;
    for (let btn of buttons) {
      const text = await page.evaluate(el => el.innerText, btn).catch(() => '');
      if (text.includes("מה בא לך לשתף?") || text.includes("Write something")) {
        await btn.click();
        composerOpened = true;
        break;
      }
    }
    if (!composerOpened) {
      console.log("❌ Composer button not found.");
      continue;
    }

    await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { timeout: 10000 });
    const textbox = await page.$('div[role="dialog"] div[role="textbox"]');
    await textbox.click();
    await delay(500);
    await textbox.type(post.text, { delay: 20 });

    for (const imagePath of imagePaths) {
      console.log(`🖼 Copying image to clipboard: ${imagePath}`);
      try {
        execSync(`powershell -ExecutionPolicy Bypass -File "C:\\postify\\posts\\copy-image.ps1" -imagePath "${imagePath}"`);
        await delay(1000);
        await textbox.click();
        await page.keyboard.down('Control');
        await page.keyboard.press('v');
        await page.keyboard.up('Control');
        await delay(5000);
      } catch (err) {
        console.warn(`⚠️ Image copy failed: ${err.message}`);
      }
    }

    const publishBtns = await page.$$('div[role="dialog"] [role="button"]');
    for (let btn of publishBtns) {
      const text = await page.evaluate(el => el.innerText.trim(), btn).catch(() => '');
      if (text === "פרסמי" || text === "Publish") {
        await btn.click();
        break;
      }
    }

    console.log(`✅ Posted: ${folder}`);
    await delay(5000); // השהייה בין פוסטים
  }

  console.log("🎉 All posts uploaded.");
  await browser.close();
})();
