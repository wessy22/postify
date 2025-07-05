const puppeteer = require("puppeteer-core");
const os = require("os");
const config = require("./config.json");
const fs = require("fs");
const path = require("path");

let groupsToSave = [];
let groupsRawToSave = [];
function cleanMembers(groups) {
  for (const g of groups) {
    if (g.members) {
      // שלוף רק את מה שבין שני תווי RTL (‏)
      const match = g.members.match(/\u200F([^\u200F]+)\u200F/);
      if (match) {
        g.members = match[1].trim();
      } else {
        g.members = g.members.replace(/חברים/g, '').replace(/\s+/g, ' ').trim();
      }
    }
  }
}
function saveGroupsOnExit(groupsRaw, groupsClean) {
  if (groupsRaw && groupsRaw.length > 0) {
    fs.writeFileSync('groups-details-raw.json', JSON.stringify(groupsRaw, null, 2));
    const cleanCopy = JSON.parse(JSON.stringify(groupsRaw));
    cleanMembers(cleanCopy);
    fs.writeFileSync('groups-details.json', JSON.stringify(cleanCopy, null, 2));
    console.log('📁 נשמרו groups-details-raw.json ו־groups-details.json (on exit/error)');
  }
}
process.on('uncaughtException', err => {
  console.error('שגיאה לא מטופלת:', err);
  saveGroupsOnExit(groupsRawToSave, groupsToSave);
  process.exit(1);
});
process.on('SIGINT', () => {
  console.log('הופסק ע"י המשתמש (Ctrl+C)');
  saveGroupsOnExit(groupsRawToSave, groupsToSave);
  process.exit(0);
});

async function scrollToBottom(page) {
  const delay = ms => new Promise(res => setTimeout(res, ms));
  let previousHeight = await page.evaluate('document.body.scrollHeight');

  while (true) {
    await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
    await delay(1500); // תן לדף לטעון עוד תכנים
    const newHeight = await page.evaluate('document.body.scrollHeight');
    if (newHeight === previousHeight) break; // אין עוד מה לטעון
    previousHeight = newHeight;
  }

  console.log("✅ סיום גלילה – כל הקבוצות נטענו");
}

(async () => {
  try {
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
        "--profile-directory=Default",
        "--start-maximized"
      ]
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    // נסה למקסם את החלון (רק אם לא headless)
    if (!browser.process().spawnargs.includes('--headless')) {
      try {
        const session = await page.target().createCDPSession();
        await session.send('Browser.setWindowBounds', {
          windowId: (await session.send('Browser.getWindowForTarget')).windowId,
          bounds: { windowState: 'maximized' }
        });
      } catch (e) {
        // התעלם משגיאות מקסום
      }
    }

    await page.goto("https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added", {
      waitUntil: "networkidle2", timeout: 0
    });

    // המתן 5 שניות לטעינה ראשונית
    await new Promise(res => setTimeout(res, 5000));
    
    // שלב ראשון: גלול עד הסוף של הדף
    await scrollToBottom(page);
    await new Promise(res => setTimeout(res, 3000)); // לוודא שהכול נטען

    // שלב שני: אסוף את כל הקבוצות לאחר הגלילה המלאה (רק מהאזור הראשי)
    const groupLinks = await page.$$eval('div[role="main"] a[href*="/groups/"][role="link"]', links => {
      return links.map(link => ({
        name: link.innerText.trim(),
        url: link.href
      })).filter(g => g.name && g.url && g.name !== "הצגת הקבוצה");
    });

    console.log(`🔍 נמצאו ${groupLinks.length} קבוצות אחרי טעינה מלאה`);

    let allGroups = [];

    // שלב שלישי: סרוק את כל הקבוצות (רק מהאזור הראשי)
    for (let group of groupLinks) {
      try {
        const selector = `div[role="main"] a[href='${group.url}'][role='link']`;
        const linkHandle = await page.$(selector);
        if (!linkHandle) {
          console.log(`❌ לא נמצא לינק לקבוצה: ${group.name}`);
          continue;
        }
        
        await linkHandle.hover();
        await new Promise(res => setTimeout(res, 2500)); // 2.5 שניות לכל קבוצה
        
        // שלוף נתונים מתוך כל הדף (לא רק מתוך dialog)
        try {
          const details = await page.evaluate(link => {
            // שליפת כל השורה שמכילה את מספר החברים (ולא רק את המספר)
            const allSpans = Array.from(document.querySelectorAll('span'));
            let members = null;
            // עדיפות ל"חברים בקבוצה", אם אין – כל "חברים"
            let span = allSpans.find(s => s.innerText && /חברים בקבוצה/.test(s.innerText));
            if (!span) {
              span = allSpans.find(s => s.innerText && /חברים/.test(s.innerText));
            }
            if (span) {
              members = span.innerText.trim();
            }
            // שליפת תמונה מתוך svg image של הלינק
            const imageTag = link.querySelector("svg image");
            const image = imageTag?.getAttribute("xlink:href") || imageTag?.getAttribute("href") || null;
            return { members, image };
          }, linkHandle);
          
          group.members = details.members;
          group.image = details.image;
        } catch (e) {
          console.warn(`⚠️ שגיאה בשליפת נתונים לקבוצה: ${group.name}`);
        }
        
        // הוסף לרשימה רק אם יש נתונים
        if ((group.members || group.image) && group.name !== "הצגת הקבוצה") {
          allGroups.push(group);
          console.log(`✅ ${group.name} | ${group.members}`);
        }
        
        // שמירה מיידית לאחר כל קבוצה
        groupsRawToSave = allGroups;
        fs.writeFileSync('groups-details-raw.json', JSON.stringify(groupsRawToSave, null, 2));
        const cleanCopy = JSON.parse(JSON.stringify(groupsRawToSave));
        cleanMembers(cleanCopy);
        fs.writeFileSync('groups-details.json', JSON.stringify(cleanCopy, null, 2));
      } catch (e) {
        console.warn(`⚠️ שגיאה כללית בסריקת קבוצה: ${group.name}`);
      }
    }

    // שמור רק קבוצות עם נתונים (מהאזור הראשי)
    const groups = allGroups.filter(g => (g.members || g.image) && g.name !== "הצגת הקבוצה");
    groupsRawToSave = groups;
    fs.writeFileSync('groups-details-raw.json', JSON.stringify(groupsRawToSave, null, 2));
    const cleanCopy = JSON.parse(JSON.stringify(groupsRawToSave));
    cleanMembers(cleanCopy);
    fs.writeFileSync(`groups-details.json`, JSON.stringify(cleanCopy, null, 2));
    console.log("📁 נשמרו groups-details-raw.json ו־groups-details.json");

    // --- שמירה בפורמט מלא ושליחה לשרת ---
    const instanceGroupsPath = path.join(__dirname, `groups-${instanceName}.json`);
    fs.writeFileSync(instanceGroupsPath, JSON.stringify(groups, null, 2));
    console.log(`📁 נשמר קובץ ${instanceGroupsPath}`);

    try {
      const fetch = require('node-fetch');
      const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance: instanceName, groups })
      });
      const res = await response.json();
      console.log("✅ Result from server:", res);
    } catch (e) {
      console.warn('⚠️ שגיאה בשליחת הקבוצות לשרת:', e);
    }

    await browser.close();
  } catch (err) {
    console.error('שגיאה קריטית:', err);
    saveGroupsOnExit(groupsRawToSave, groupsToSave);
    process.exit(1);
  }
})();
