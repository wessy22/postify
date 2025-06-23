const puppeteer = require("puppeteer-core");
const os = require("os");
const config = require("./config.json");
const fetch = require("node-fetch"); // 👈 שורה מתוקנת
const fs = require("fs");
const path = require("path");

(async () => {
  const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf8').trim();
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

  await page.goto("https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added", { waitUntil: "networkidle2", timeout: 0 });

  // גלילה עד הסוף
  let lastHeight = 0;
  let sameHeightCount = 0;

  while (sameHeightCount < 2) {
    const height = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return document.body.scrollHeight;
    });

    if (height === lastHeight) {
      sameHeightCount++;
      await new Promise(resolve => setTimeout(resolve, 20000)); // המתן 20 שניות
    } else {
      sameHeightCount = 0;
      lastHeight = height;
      await new Promise(resolve => setTimeout(resolve, 1200)); // המתן בין גלילות
    }
  }

  const groups = await page.evaluate(() => {
    const main = document.querySelector('div[role="main"]');
    if (!main) return [];
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

  const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ instance: instanceName, groups })
  });
  const res = await response.json();

  console.log("✅ Result from server:", res);

  fs.writeFileSync(
    path.join(__dirname, `groups-${instanceName}.json`),
    JSON.stringify(groups, null, 2)
  );

  await browser.close();
})();
