const puppeteer = require("puppeteer-core");
const os = require("os");
const config = require("./config.json");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");

let groupsToSave = [];
let groupsRawToSave = [];

// פונקציה ליצירת לוג מפורט
function writeDetailedLog(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type}] ${message}\n`;
  
  try {
    fs.appendFileSync('groups-scan.log', logMessage);
  } catch (e) {
    console.error('שגיאה בכתיבת לוג:', e.message);
  }
  
  // גם לקונסול
  console.log(`[${type}] ${message}`);
}
function cleanMembers(groups) {
  for (const g of groups) {
    if (g.members) {
      // שלוף רק את מה שבין שני תווי RTL (‏)
      const match = g.members.match(/\u200F([^\u200F]+)\u200F/);
      if (match) {
        g.members = match[1].trim();
      } else {
        g.members = g.members.replace(/חברים/g, '').replace(/members/gi, '').replace(/\s+/g, ' ').trim();
      }
    }
  }
}
async function saveGroupsOnExit(groupsRaw, groupsClean, instanceName = 'postify') {
  console.log(`🔄 saveGroupsOnExit נקראה עם ${groupsRaw ? groupsRaw.length : 0} קבוצות`);
  
  if (groupsRaw && groupsRaw.length > 0) {
    try {
      console.log('📝 שומר קבצים מקומיים...');
      // שמירה עם תיקון קישורים
      let rawJson = JSON.stringify(groupsRaw, null, 2).replace(/\\\//g, '/');
      fs.writeFileSync('groups-details-raw.json', rawJson);
      console.log('✅ נשמר groups-details-raw.json');

      const cleanCopy = JSON.parse(JSON.stringify(groupsRaw));
      cleanMembers(cleanCopy);
      const instanceGroupsPath = `groups-${instanceName}.json`;
      let cleanJson = JSON.stringify(cleanCopy, null, 2).replace(/\\\//g, '/');
      fs.writeFileSync(instanceGroupsPath, cleanJson);
      console.log(`✅ נשמר ${instanceGroupsPath}`);

      // שמירה נוספת בשם groups-postify.json - העתק מדויק
      fs.copyFileSync(instanceGroupsPath, 'groups-postify.json');
      console.log('✅ נשמר groups-postify.json');

      console.log(`📁 נשמרו groups-details-raw.json ו־${instanceGroupsPath} (on exit/error)`);

      // שליחת נתונים לשרת גם ביציאה
      console.log('🌐 מנסה לשלוח נתונים לשרת לפני יציאה...');
      try {
        const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instance: instanceName, groups: cleanCopy })
        });

        if (!response.ok) {
          console.error(`❌ שגיאה HTTP: ${response.status} ${response.statusText}`);
          return;
        }

        const res = await response.json();
        console.log("✅ נתונים נשלחו בהצלחה לשרת ביציאה:", res);
      } catch (uploadError) {
        console.error("❌ שגיאה בשליחת נתונים לשרת ביציאה:", uploadError.message);
      }
    } catch (error) {
      console.error('❌ שגיאה ב-saveGroupsOnExit:', error);
    }
  } else {
    console.log('⚠️ אין נתונים לשמירה ביציאה');
  }
}
process.on('uncaughtException', async (err) => {
  console.error('🚨 שגיאה לא מטופלת נתפסה:', err);
  try {
    console.log('🔍 מנסה לקרוא instance-name...');
    const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf8').trim();
    console.log(`📋 Instance name: ${instanceName}`);
    await saveGroupsOnExit(groupsRawToSave, groupsToSave, instanceName);
  } catch (e) {
    console.error('❌ שגיאה בקריאת instance-name, משתמש בברירת מחדל:', e.message);
    await saveGroupsOnExit(groupsRawToSave, groupsToSave, 'postify');
  }
  console.log('🛑 יוצא מהתהליך עקב שגיאה לא מטופלת');
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('⚠️ הופסק ע"י המשתמש (Ctrl+C)');
  try {
    console.log('🔍 מנסה לקרוא instance-name...');
    const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf8').trim();
    console.log(`📋 Instance name: ${instanceName}`);
    await saveGroupsOnExit(groupsRawToSave, groupsToSave, instanceName);
  } catch (e) {
    console.error('❌ שגיאה בקריאת instance-name, משתמש בברירת מחדל:', e.message);
    await saveGroupsOnExit(groupsRawToSave, groupsToSave, 'postify');
  }
  console.log('🛑 יוצא מהתהליך לפי בקשת המשתמש');
  process.exit(0);
});

async function scrollAndCollectGroups(page) {
  console.log('🔄 מתחיל גלילה ואיסוף קבוצות...');
  const delay = ms => new Promise(res => setTimeout(res, ms));
  
  let scrollAttempts = 0;
  const maxScrollAttempts = 1000; // הגדלה משמעותית ל-1000 ניסיונות (עבור עד 3000+ קבוצות)
  const allCollectedGroups = new Map(); // משתמש ב-Map כדי למנוע כפילויות
  let unchangedHeightCounter = 0;
  let unchangedGroupsCounter = 0;
  let previousHeight = 0;

  // פונקציה בטוחה להערכת JavaScript
  async function safeEvaluate(page, script) {
    try {
      return await page.evaluate(script);
    } catch (error) {
      if (error.message.includes('detached')) {
        console.warn('⚠️ הדף נותק, מנסה שוב בעוד 3 שניות...');
        await delay(3000);
        try {
          return await page.evaluate(script);
        } catch (retryError) {
          console.error('❌ שגיאה בניסיון שני:', retryError.message);
          return null;
        }
      }
      throw error;
    }
  }

  // קבלת גובה ראשוני
  try {
    previousHeight = await safeEvaluate(page, () => document.body.scrollHeight);
    if (previousHeight === null) {
      console.error('❌ לא הצלחתי לקבל את גובה הדף הראשוני');
      return [];
    }
    console.log(`📏 גובה ראשוני של הדף: ${previousHeight}px`);
  } catch (error) {
    console.error('❌ שגיאה בקבלת גובה הדף:', error.message);
    return [];
  }

  while (scrollAttempts < maxScrollAttempts) {
    try {
      // אסוף קבוצות מהמצב הנוכחי של הדף
      const currentGroups = await safeEvaluate(page, () => {
        const links = document.querySelectorAll('div[role="main"] a[href*="/groups/"][role="link"]');
        return Array.from(links).map(link => ({
          name: link.innerText.trim(),
          url: link.href
        })).filter(g => g.name && g.url && g.name !== "הצגת הקבוצה" && g.name !== "View Group");
      });

      if (currentGroups === null) {
        console.warn('⚠️ לא הצלחתי לאסוף קבוצות, מדלג על הניסיון הזה');
        scrollAttempts++;
        await delay(3000);
        continue;
      }

      const previousGroupsCount = allCollectedGroups.size;
      
      // הוסף קבוצות חדשות למפה
      let newGroupsCount = 0;
      for (const group of currentGroups) {
        if (!allCollectedGroups.has(group.url)) {
          allCollectedGroups.set(group.url, group);
          newGroupsCount++;
        }
      }

      console.log(`📊 ניסיון גלילה ${scrollAttempts + 1}/${maxScrollAttempts}: נמצאו ${currentGroups.length} קבוצות בדף, ${newGroupsCount} חדשות. סה"כ: ${allCollectedGroups.size}`);
      
      // הדפס עדכון כל 100 קבוצות (מתאים לכמויות גדולות)
      if (allCollectedGroups.size > 0 && allCollectedGroups.size % 100 === 0 && newGroupsCount > 0) {
        console.log(`\n🎯 ===== אבן דרך: נאספו ${allCollectedGroups.size} קבוצות! =====\n`);
      }
      
      // הדפס עדכון מיוחד כל 500 קבוצות
      if (allCollectedGroups.size > 0 && allCollectedGroups.size % 500 === 0 && newGroupsCount > 0) {
        console.log(`\n🌟 ===== 🚀 WOW! ${allCollectedGroups.size} קבוצות נאספו! 🚀 =====\n`);
      }

      // בדיקה אם לא נוספו קבוצות חדשות
      if (allCollectedGroups.size === previousGroupsCount) {
        unchangedGroupsCounter++;
        console.log(`⚠️ לא נוספו קבוצות חדשות (${unchangedGroupsCounter}/15)`);
      } else {
        unchangedGroupsCounter = 0; // איפוס המונה כי נוספו קבוצות
      }

      // גלול למטה
      const scrollResult = await safeEvaluate(page, async () => {
        // גלילה בשני שלבים - קודם לתחתית ואז קצת למעלה כדי לגרום לפייסבוק לטעון
        const oldScroll = window.scrollY;
        window.scrollTo(0, document.body.scrollHeight);
        
        // נסה גם לגלול את האלמנט הראשי
        const mainDiv = document.querySelector('div[role="main"]');
        if (mainDiv) {
          mainDiv.scrollTop = mainDiv.scrollHeight;
        }
        
        // כל 10 גלילות, עשה "bounce scroll" - גלול קצת למעלה ושוב למטה
        // זה עוזר לפייסבוק להבין שצריך לטעון עוד תוכן
        return document.body.scrollHeight;
      });

      if (scrollResult === null) {
        console.warn('⚠️ שגיאה בגלילה, מנסה שוב...');
        await delay(3000);
        scrollAttempts++;
        continue;
      }

      // כל 20 גלילות, עשה "bounce scroll" - גלול קצת למעלה ושוב למטה
      if (scrollAttempts > 0 && scrollAttempts % 20 === 0) {
        console.log('🔄 מבצע bounce scroll כדי לעורר טעינת תוכן...');
        await safeEvaluate(page, () => {
          window.scrollBy(0, -500); // גלול 500px למעלה
        });
        await delay(500);
        await safeEvaluate(page, () => {
          window.scrollTo(0, document.body.scrollHeight); // חזור לתחתית
        });
        await delay(1000);
      }

      await delay(4000); // המתנה ארוכה יותר לטעינת תוכן - 4 שניות
      
      const newHeight = await safeEvaluate(page, () => document.body.scrollHeight);
      if (newHeight === null) {
        console.warn('⚠️ לא הצלחתי לקבל גובה חדש, מנסה שוב...');
        await delay(3000);
        scrollAttempts++;
        continue;
      }

      scrollAttempts++;
      
      console.log(`📏 ניסיון גלילה ${scrollAttempts}: גובה ${newHeight}px (קודם: ${previousHeight}px)`);
      
      // בדיקה אם הדף לא גדל
      if (newHeight === previousHeight) {
        unchangedHeightCounter++;
        console.log(`⚠️ הדף לא גדל (${unchangedHeightCounter}/15)`);
      } else {
        unchangedHeightCounter = 0; // איפוס המונה כי הדף גדל
        previousHeight = newHeight;
      }

      // בדיקת תנאי עצירה: הדף לא גדל וגם לא נוספו קבוצות במשך 15 ניסיונות רצופים
      if (unchangedHeightCounter >= 15 && unchangedGroupsCounter >= 15) {
        console.log(`✅ עצירה: הדף לא גדל ולא נוספו קבוצות במשך 15 ניסיונות רצופים`);
        console.log(`📋 סיכום סופי: נאספו ${allCollectedGroups.size} קבוצות ייחודיות`);
        break;
      }

      // המתנה נוספת אם נגמרו הקבוצות אבל הדף עדיין גדל
      if (unchangedGroupsCounter >= 8 && unchangedHeightCounter < 8) {
        console.log(`⏳ המתנה נוספת - הדף עדיין גדל אבל אין קבוצות חדשות`);
        await delay(6000); // המתנה ארוכה יותר - 6 שניות
      }
      
    } catch (error) {
      console.error(`❌ שגיאה בניסיון גלילה ${scrollAttempts + 1}:`, error.message);
      await delay(3000);
      scrollAttempts++;
      
      if (error.message.includes('detached')) {
        console.warn('⚠️ הדף נותק במהלך הגלילה. מנסה להמשיך...');
        // נסה לרענן את הדף
        try {
          console.log('🔄 מנסה לרענן את הדף...');
          await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
          await delay(5000);
          previousHeight = await safeEvaluate(page, () => document.body.scrollHeight) || previousHeight;
          console.log('✅ הדף רוענן בהצלחה');
        } catch (reloadError) {
          console.error('❌ שגיאה בריענון הדף:', reloadError.message);
        }
      }
    }
  }
  
  if (scrollAttempts >= maxScrollAttempts) {
    console.log(`⚠️ הגעתי למקסימום ניסיונות גלילה (${maxScrollAttempts}), עוצר גלילה עם ${allCollectedGroups.size} קבוצות`);
  }

  // החזר רשימה של כל הקבוצות שנמצאו
  const finalGroups = Array.from(allCollectedGroups.values());
  console.log(`📋 סיכום סופי: נאספו ${finalGroups.length} קבוצות ייחודיות במהלך הגלילה`);
  return finalGroups;
}

(async () => {
  writeDetailedLog('מתחיל את סקריפט סריקת הקבוצות...', 'START');
  
  try {
    writeDetailedLog('קורא את שם ה-instance...', 'INFO');
    const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf8').trim();
    writeDetailedLog(`Instance name: ${instanceName}`, 'INFO');
    
    writeDetailedLog('קורא קובץ config...', 'INFO');
    const userDataDir = config.userDataDir.replace("user", os.userInfo().username);
    writeDetailedLog(`User data directory: ${userDataDir}`, 'INFO');

    writeDetailedLog('מפעיל דפדפן...', 'INFO');
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
    writeDetailedLog('דפדפן הופעל בהצלחה', 'SUCCESS');

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    console.log(`📄 משתמש בעמוד (${pages.length > 0 ? 'קיים' : 'חדש'})`);
    
    await page.setViewport({ width: 1920, height: 1080 });
    console.log('📐 הוגדר viewport: 1920x1080');
    
    // נסה למקסם את החלון (רק אם לא headless)
    if (!browser.process().spawnargs.includes('--headless')) {
      try {
        console.log('🖥️ מנסה למקסם את החלון...');
        const session = await page.target().createCDPSession();
        await session.send('Browser.setWindowBounds', {
          windowId: (await session.send('Browser.getWindowForTarget')).windowId,
          bounds: { windowState: 'maximized' }
        });
        console.log('✅ החלון מוקסם בהצלחה');
      } catch (e) {
        console.log('⚠️ לא הצלחתי למקסם את החלון:', e.message);
      }
    }

    writeDetailedLog('נוגע לעמוד הקבוצות בפייסבוק...', 'INFO');
    await page.goto("https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added", {
      waitUntil: "networkidle2", timeout: 0
    });
    writeDetailedLog('העמוד נטען בהצלחה', 'SUCCESS');

    // המתן 5 שניות לטעינה ראשונית
    console.log('⏱️ ממתין 5 שניות לטעינה ראשונית...');
    await new Promise(res => setTimeout(res, 5000));
    
    // שלב ראשון: גלול ואסוף את כל הקבוצות במהלך הגלילה
    const groupLinks = await scrollAndCollectGroups(page);
    console.log('⏱️ ממתין 3 שניות נוספות לוודא שהכול נטען...');
    await new Promise(res => setTimeout(res, 3000)); // לוודא שהכול נטען

    writeDetailedLog(`נמצאו ${groupLinks.length} קבוצות במהלך הגלילה`, 'INFO');

    let allGroups = [];
    let processedCount = 0;
    let successfulGroups = 0;
    let failedGroups = 0;

    console.log(`🎯 מתחיל סריקה של ${groupLinks.length} קבוצות שנמצאו`);
    writeDetailedLog(`התחלת סריקת ${groupLinks.length} קבוצות`, 'INFO');

    // שלב שני: סרוק את כל הקבוצות שנמצאו במהלך הגלילה
    for (let group of groupLinks) {
      try {
        processedCount++;
        console.log(`\n🔍 [${processedCount}/${groupLinks.length}] מעבד: ${group.name}`);
        console.log(`🔗 URL: ${group.url}`);
        writeDetailedLog(`מעבד קבוצה ${processedCount}/${groupLinks.length}: ${group.name}`, 'INFO');
        
        const selector = `div[role="main"] a[href='${group.url}'][role='link']`;
        const linkHandle = await page.$(selector);
        if (!linkHandle) {
          writeDetailedLog(`לא נמצא לינק לקבוצה: ${group.name}`, 'WARNING');
          failedGroups++;
          continue;
        }
        
        writeDetailedLog(`מרחף מעל הקבוצה: ${group.name}`, 'DEBUG');
        await linkHandle.hover();
        await new Promise(res => setTimeout(res, 2500)); // 2.5 שניות לכל קבוצה
        
        // שלוף נתונים מתוך כל הדף (לא רק מתוך dialog)
        try {
          writeDetailedLog(`מחלץ נתונים לקבוצה: ${group.name}`, 'DEBUG');
          const details = await page.evaluate(link => {
            // שליפת כל השורה שמכילה את מספר החברים (ולא רק את המספר)
            const allSpans = Array.from(document.querySelectorAll('span'));
            let members = null;
            // עדיפות ל"חברים בקבוצה", אם אין – כל "חברים"
            let span = allSpans.find(s => s.innerText && /חברים בקבוצה/.test(s.innerText));
            if (!span) {
              span = allSpans.find(s => s.innerText && /חברים/.test(s.innerText));
            }
            // אם לא נמצא בעברית, חפש באנגלית
            if (!span) {
              span = allSpans.find(s => s.innerText && /members in group/i.test(s.innerText));
            }
            if (!span) {
              span = allSpans.find(s => s.innerText && /members/i.test(s.innerText));
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
          
          writeDetailedLog(`נתונים שנמצאו: חברים="${details.members}" תמונה=${details.image ? 'יש' : 'אין'}`, 'DEBUG');
        } catch (e) {
          writeDetailedLog(`שגיאה בשליפת נתונים לקבוצה: ${group.name} - ${e.message}`, 'ERROR');
          failedGroups++;
        }
        
        // הוסף לרשימה רק אם יש נתונים
        if ((group.members || group.image) && group.name !== "הצגת הקבוצה" && group.name !== "View Group") {
          allGroups.push(group);
          successfulGroups++;
          writeDetailedLog(`${group.name} | ${group.members} (נוסף לרשימה)`, 'SUCCESS');
        } else {
          writeDetailedLog(`${group.name} | לא נוסף לרשימה (אין נתונים מתאימים)`, 'WARNING');
        }
        
        // שמירה מיידית לאחר כל קבוצה
        console.log(`💾 שומר נתונים מיידית (${allGroups.length} קבוצות עד כה)...`);
        groupsRawToSave = allGroups;
        let rawJson = JSON.stringify(groupsRawToSave, null, 2).replace(/\\\//g, '/');
        fs.writeFileSync('groups-details-raw.json', rawJson);
        const cleanCopy = JSON.parse(JSON.stringify(groupsRawToSave));
        cleanMembers(cleanCopy);
        const instanceGroupsPath = `groups-${instanceName}.json`;
        let cleanJson = JSON.stringify(cleanCopy, null, 2).replace(/\\\//g, '/');
        fs.writeFileSync(instanceGroupsPath, cleanJson);
        // שמירה נוספת בשם groups-postify.json - העתק מדויק
        fs.copyFileSync(instanceGroupsPath, 'groups-postify.json');
        console.log(`✅ שמירה מיידית הושלמה (${allGroups.length} קבוצות)`);
        
        // שליחה לשרת כל 10 קבוצות
        if (allGroups.length % 10 === 0) {
          console.log(`🌐 שולח עדכון ביניים לשרת (${allGroups.length} קבוצות)...`);
          try {
            const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ instance: instanceName, groups: cleanCopy })
            });
            
            if (response.ok) {
              const res = await response.json();
              console.log(`✅ עדכון ביניים נשלח בהצלחה: ${res.message || 'OK'}`);
            } else {
              console.warn(`⚠️ שגיאה בעדכון ביניים: ${response.status} ${response.statusText}`);
            }
          } catch (uploadError) {
            console.warn(`⚠️ שגיאה בשליחת עדכון ביניים: ${uploadError.message}`);
          }
        }
        
      } catch (e) {
        writeDetailedLog(`שגיאה כללית בסריקת קבוצה: ${group.name} - ${e.message}`, 'ERROR');
        failedGroups++;
      }
    }

    writeDetailedLog(`סיום עיבוד הקבוצות. סה"כ עובדו: ${processedCount}, הצליח: ${successfulGroups}, נכשל: ${failedGroups}`, 'INFO');
    
    // שמור רק קבוצות עם נתונים (מהאזור הראשי)
    const groups = allGroups.filter(g => (g.members || g.image) && g.name !== "הצגת הקבוצה" && g.name !== "View Group");
    console.log(`📋 קבוצות סופיות לשמירה: ${groups.length} מתוך ${allGroups.length} שנמצאו`);
    
    groupsRawToSave = groups;
    console.log('💾 שומר קבצים סופיים...');
    let rawJson = JSON.stringify(groupsRawToSave, null, 2).replace(/\\\//g, '/');
    fs.writeFileSync('groups-details-raw.json', rawJson);
    const cleanCopy = JSON.parse(JSON.stringify(groupsRawToSave));
    cleanMembers(cleanCopy);
    const finalInstanceGroupsPath = `groups-${instanceName}.json`;
    let cleanJson = JSON.stringify(cleanCopy, null, 2).replace(/\\\//g, '/');
    fs.writeFileSync(finalInstanceGroupsPath, cleanJson);
    // שמירה נוספת בשם groups-postify.json - העתק מדויק
    fs.copyFileSync(finalInstanceGroupsPath, 'groups-postify.json');
    console.log(`📁 נשמרו groups-details-raw.json ו־${finalInstanceGroupsPath}`);

    // שליחת הנתונים לאתר
    writeDetailedLog('מתחיל שליחת נתונים לשרת...', 'INFO');
    try {
      writeDetailedLog(`שולח ${cleanCopy.length} קבוצות לשרת...`, 'INFO');
      const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance: instanceName, groups: cleanCopy })
      });
      
      writeDetailedLog(`תגובת שרת: ${response.status} ${response.statusText}`, 'INFO');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const res = await response.json();
      writeDetailedLog(`Result from server: ${JSON.stringify(res)}`, 'SUCCESS');
      writeDetailedLog('שליחת נתונים לשרת הושלמה בהצלחה!', 'SUCCESS');
    } catch (uploadError) {
      writeDetailedLog(`שגיאה בשליחת נתונים לאתר: ${uploadError.message}`, 'ERROR');
      writeDetailedLog(`פרטי השגיאה: ${uploadError.stack}`, 'ERROR');
    }

    // --- בדיקת תקינות קובץ JSON ---
    console.log('🔍 בודק תקינות קובץ JSON...');
    const instanceGroupsPath = path.join(__dirname, `groups-${instanceName}.json`);
    
    function isGroupsFileEmpty(filePath) {
      try {
        console.log(`📖 קורא קובץ: ${filePath}`);
        const data = fs.readFileSync(filePath, 'utf8');
        const arr = JSON.parse(data);
        const isEmpty = !Array.isArray(arr) || arr.length === 0;
        console.log(`📊 תוכן הקובץ: ${Array.isArray(arr) ? arr.length : 'לא מערך'} רשומות, ריק: ${isEmpty}`);
        return isEmpty;
      } catch (e) {
        console.error(`❌ שגיאה בקריאת קובץ ${filePath}:`, e.message);
        return true;
      }
    }

    let rerun = false;
    if (isGroupsFileEmpty(instanceGroupsPath)) {
      if (!process.env.GROUPS_RERUN) {
        console.warn('⚠️ קובץ הקבוצות ריק – מריץ שוב את הסקריפט');
        // הרצה חוזרת עם משתנה סביבה כדי למנוע לולאה אינסופית
        const { spawnSync } = require('child_process');
        const result = spawnSync(process.argv[0], process.argv.slice(1), {
          env: { ...process.env, GROUPS_RERUN: '1' },
          stdio: 'inherit'
        });
        process.exit(result.status);
      } else {
        // ניסיון שני נכשל – שלח מייל שגיאה
        console.error('❌ ניסיון שני נכשל - שולח התראה למנהל');
        try {
          const fetch = require('node-fetch');
          await fetch('https://postify.co.il/wp-content/postify-api/send-error-mail.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subject: 'שגיאה בסקריפט סריקת קבוצות',
              message: `הקובץ groups-${instanceName}.json ריק גם לאחר ניסיון שני.\n\nזמן: ${new Date().toISOString()}\nשרת: ${os.hostname()}\nנתיב: ${instanceGroupsPath}`
            })
          });
          console.error('✅ התראה נשלחה למנהל');
        } catch (e) {
          console.error('❌ שגיאה בשליחת מייל התראה:', e.message);
        }
        process.exit(2);
      }
    } else {
      console.log('✅ קובץ הקבוצות תקין ומכיל נתונים');
    }

    // --- סיום תקין ---
    writeDetailedLog("הסקריפט הסתיים בהצלחה!", 'SUCCESS');
    writeDetailedLog('סוגר דפדפן...', 'INFO');
    await browser.close();
    writeDetailedLog('דפדפן נסגר בהצלחה', 'SUCCESS');
  } catch (err) {
    writeDetailedLog(`שגיאה קריטית בסקריפט הראשי: ${err.message}`, 'CRITICAL');
    writeDetailedLog(`פרטי השגיאה: ${err.stack}`, 'CRITICAL');
    
    writeDetailedLog('מנסה לשמור נתונים שנאספו עד כה...', 'INFO');
    await saveGroupsOnExit(groupsRawToSave, groupsToSave);
    
    if (!process.env.GROUPS_RERUN) {
      console.warn('⚠️ שגיאה קריטית – מריץ שוב את הסקריפט');
      const { spawnSync } = require('child_process');
      const result = spawnSync(process.argv[0], process.argv.slice(1), {
        env: { ...process.env, GROUPS_RERUN: '1' },
        stdio: 'inherit'
      });
      process.exit(result.status);
    } else {
      // ניסיון שני נכשל – שלח מייל שגיאה
      console.error('❌ ניסיון שני נכשל - שולח התראה למנהל');
      try {
        const fetch = require('node-fetch');
        await fetch('https://postify.co.il/wp-content/postify-api/send-error-mail.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: 'שגיאה קריטית בסקריפט סריקת קבוצות',
            message: `שגיאה: ${err && err.stack ? err.stack : err}\n\nזמן: ${new Date().toISOString()}\nשרת: ${os.hostname()}`
          })
        });
        console.error('✅ התראה נשלחה למנהל');
      } catch (e) {
        console.error('❌ שגיאה בשליחת מייל התראה:', e.message);
      }
      process.exit(3);
    }
  }
})();
