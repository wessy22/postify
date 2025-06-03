const puppeteer = require("puppeteer-core");
const os = require("os");
const config = require("./config.json");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');
const path = require('path');

(async () => {
  // קרא את שם ה-instance מהקובץ
  const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf8').trim();

  // 1. התחברות לדפדפן כרום עם הפרופיל שלך
  const userDataDir = config.userDataDir.replace("user", os.userInfo().username);
  const browser = await puppeteer.launch({
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

  // 2. כניסה לעמוד הקבוצות שלך בפייסבוק
  await page.goto("https://www.facebook.com/groups/joins/?nav_source=tab", { waitUntil: "networkidle2", timeout: 0 });

  // 3. גלול למטה לטעינת כל הקבוצות
  for (let i = 0; i < 12; i++) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await new Promise(r => setTimeout(r, 1200));
  }

  // 4. שלוף קבוצות מהמרכז בלבד (MAIN)
  const groups = await page.evaluate(() => {
    const main = document.querySelector('div[role="main"]');
    if (!main) return [];
    // סרוק רק בתוך main!
    const cards = Array.from(main.querySelectorAll('a[href*="/groups/"][role="link"]'));
    const out = [];
    cards.forEach(link => {
      const name = link.innerText.trim();
      const url = link.href;
      if (
        name &&
        url.includes("facebook.com/groups/") &&
        !out.find(g => g.url === url)
      ) {
        out.push({ name, url });
      }
    });
    return out;
  });

  const cleanGroups = groups.slice(0, 30);

  // 5. שלח את זה ל-API שלך (או כל מה שתרצה)
  const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance: instanceName, groups: cleanGroups })
  });
  const res = await response.json();

  console.log("✅ Result from server:", res);

  fs.writeFileSync(
    path.join(__dirname, `groups-${instanceName}.json`),
    JSON.stringify(cleanGroups, null, 2)
  );

  await browser.close();
})();
