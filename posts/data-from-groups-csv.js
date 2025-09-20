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
    fs.appendFileSync('groups-scan-csv.log', logMessage);
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
      fs.writeFileSync('groups-details-csv-raw.json', rawJson);
      console.log('✅ נשמר groups-details-csv-raw.json');

      const cleanCopy = JSON.parse(JSON.stringify(groupsRaw));
      cleanMembers(cleanCopy);
      const instanceGroupsPath = `groups-csv-${instanceName}.json`;
      let cleanJson = JSON.stringify(cleanCopy, null, 2).replace(/\\\//g, '/');
      fs.writeFileSync(instanceGroupsPath, cleanJson);
      console.log(`✅ נשמר ${instanceGroupsPath}`);

      // שמירה נוספת בשם groups-postify-csv.json - העתק מדויק
      fs.copyFileSync(instanceGroupsPath, 'groups-postify-csv.json');
      console.log('✅ נשמר groups-postify-csv.json');

      console.log(`📁 נשמרו groups-details-csv-raw.json ו־${instanceGroupsPath} (on exit/error)`);

      // שליחת נתונים לשרת גם ביציאה
      console.log('🌐 מנסה לשלוח נתונים לשרת לפני יציאה...');
      try {
        const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instance: instanceName, groups: cleanCopy, source: 'csv' })
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

// פונקציה לקריאת קבוצות מקובץ CSV
function readGroupsFromCSV(csvPath) {
  try {
    console.log(`📖 קורא קבוצות מקובץ CSV: ${csvPath}`);
    writeDetailedLog(`קורא קבוצות מקובץ CSV: ${csvPath}`, 'INFO');
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`קובץ CSV לא נמצא: ${csvPath}`);
    }

    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);
    
    const groups = lines.map(url => {
      if (!url.startsWith('http')) {
        url = 'https://www.facebook.com/groups/' + url;
      }
      
      // חלץ שם קבוצה מהURL
      const urlParts = url.split('/');
      const groupId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
      
      return {
        name: '', // ימולא בזמן הסריקה
        url: url,
        groupId: groupId
      };
    });

    console.log(`✅ נקראו ${groups.length} קבוצות מהקובץ CSV`);
    writeDetailedLog(`נקראו ${groups.length} קבוצות מהקובץ CSV`, 'SUCCESS');
    
    return groups;
  } catch (error) {
    console.error(`❌ שגיאה בקריאת קובץ CSV: ${error.message}`);
    writeDetailedLog(`שגיאה בקריאת קובץ CSV: ${error.message}`, 'ERROR');
    return [];
  }
}

// פונקציה לסריקת קבוצה יחידה
async function scanSingleGroup(page, group, index, total) {
  try {
    console.log(`\n🔍 [${index + 1}/${total}] מעבד קבוצה: ${group.url}`);
    writeDetailedLog(`מעבד קבוצה ${index + 1}/${total}: ${group.url}`, 'INFO');
    
    // נווט לדף הקבוצה
    await page.goto(group.url, { waitUntil: "networkidle2", timeout: 30000 });
    
    // המתן לטעינת הדף
    await new Promise(res => setTimeout(res, 3000));
    
    // חלץ פרטי הקבוצה
    const groupDetails = await page.evaluate(() => {
      // חפש את שם הקבוצה
      let name = '';
      const titleSelectors = [
        'h1[data-testid="group-name"]',
        'h1',
        '[role="banner"] h1',
        '[data-pagelet="GroupInformation"] h1'
      ];
      
      for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.innerText && element.innerText.trim()) {
          name = element.innerText.trim();
          break;
        }
      }
      
      // חפש מספר חברים
      let members = '';
      const allSpans = Array.from(document.querySelectorAll('span, div, a'));
      
      // חפש תבניות שונות למספר החברים
      const memberPatterns = [
        /(\d+[\d,.]*)\s*חברים/i,
        /(\d+[\d,.]*)\s*members/i,
        /חברים\s*בקבוצה:\s*(\d+[\d,.]*)/i,
        /members\s*in\s*group:\s*(\d+[\d,.]*)/i
      ];
      
      for (const element of allSpans) {
        if (!element.innerText) continue;
        const text = element.innerText.trim();
        
        for (const pattern of memberPatterns) {
          const match = text.match(pattern);
          if (match) {
            members = match[0]; // השתמש בכל הטקסט שנמצא
            break;
          }
        }
        
        if (members) break;
      }
      
      // חפש תמונת קבוצה
      let image = null;
      const imageSelectors = [
        'image[href]',
        'img[src*="scontent"]',
        '[role="img"] image'
      ];
      
      for (const selector of imageSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          image = element.getAttribute('href') || element.getAttribute('src') || element.getAttribute('xlink:href');
          if (image && image.startsWith('http')) {
            break;
          }
        }
      }
      
      return { name, members, image };
    });
    
    // עדכן את פרטי הקבוצה
    group.name = groupDetails.name || `קבוצה ${index + 1}`;
    group.members = groupDetails.members || '';
    group.image = groupDetails.image || null;
    
    console.log(`✅ קבוצה נסרקה: ${group.name} | ${group.members}`);
    writeDetailedLog(`קבוצה נסרקה בהצלחה: ${group.name} | ${group.members}`, 'SUCCESS');
    
    return true;
    
  } catch (error) {
    console.error(`❌ שגיאה בסריקת קבוצה ${group.url}: ${error.message}`);
    writeDetailedLog(`שגיאה בסריקת קבוצה ${group.url}: ${error.message}`, 'ERROR');
    
    // מלא פרטים בסיסיים אם הסריקה נכשלה
    group.name = group.name || `קבוצה ${index + 1}`;
    group.members = '';
    group.image = null;
    
    return false;
  }
}

(async () => {
  writeDetailedLog('מתחיל את סקריפט סריקת הקבוצות מ-CSV...', 'START');
  
  try {
    writeDetailedLog('קורא את שם ה-instance...', 'INFO');
    const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf8').trim();
    writeDetailedLog(`Instance name: ${instanceName}`, 'INFO');
    
    // קרא קבוצות מקובץ CSV
    const csvPath = path.join(__dirname, 'groups-list.csv');
    const groupsFromCSV = readGroupsFromCSV(csvPath);
    
    if (groupsFromCSV.length === 0) {
      throw new Error('לא נמצאו קבוצות בקובץ CSV');
    }
    
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

    writeDetailedLog('נוגע לעמוד הראשי של פייסבוק...', 'INFO');
    await page.goto("https://www.facebook.com", {
      waitUntil: "networkidle2", timeout: 30000
    });
    writeDetailedLog('העמוד נטען בהצלחה', 'SUCCESS');

    // המתן 3 שניות לטעינה ראשונית
    console.log('⏱️ ממתין 3 שניות לטעינה ראשונית...');
    await new Promise(res => setTimeout(res, 3000));
    
    let allGroups = [];
    let processedCount = 0;
    let successfulGroups = 0;
    let failedGroups = 0;

    console.log(`🎯 מתחיל סריקה של ${groupsFromCSV.length} קבוצות מהקובץ CSV`);
    writeDetailedLog(`התחלת סריקת ${groupsFromCSV.length} קבוצות מ-CSV`, 'INFO');

    // סרוק כל קבוצה מהרשימה
    for (let i = 0; i < groupsFromCSV.length; i++) {
      const group = groupsFromCSV[i];
      processedCount++;
      
      const success = await scanSingleGroup(page, group, i, groupsFromCSV.length);
      
      if (success && group.name && group.name !== "הצגת הקבוצה" && group.name !== "View Group") {
        allGroups.push(group);
        successfulGroups++;
      } else {
        failedGroups++;
      }
      
      // שמירה מיידית לאחר כל קבוצה
      console.log(`💾 שומר נתונים מיידית (${allGroups.length} קבוצות עד כה)...`);
      groupsRawToSave = allGroups;
      let rawJson = JSON.stringify(groupsRawToSave, null, 2).replace(/\\\//g, '/');
      fs.writeFileSync('groups-details-csv-raw.json', rawJson);
      const cleanCopy = JSON.parse(JSON.stringify(groupsRawToSave));
      cleanMembers(cleanCopy);
      const instanceGroupsPath = `groups-csv-${instanceName}.json`;
      let cleanJson = JSON.stringify(cleanCopy, null, 2).replace(/\\\//g, '/');
      fs.writeFileSync(instanceGroupsPath, cleanJson);
      // שמירה נוספת בשם groups-postify-csv.json - העתק מדויק
      fs.copyFileSync(instanceGroupsPath, 'groups-postify-csv.json');
      console.log(`✅ שמירה מיידית הושלמה (${allGroups.length} קבוצות)`);
      
      // שליחה לשרת כל 5 קבוצות
      if (allGroups.length % 5 === 0 && allGroups.length > 0) {
        console.log(`🌐 שולח עדכון ביניים לשרת (${allGroups.length} קבוצות)...`);
        try {
          const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instance: instanceName, groups: cleanCopy, source: 'csv' })
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
      
      // המתנה בין קבוצות כדי לא לעמוס על השרת
      if (i < groupsFromCSV.length - 1) {
        console.log('⏱️ ממתין 2 שניות לפני הקבוצה הבאה...');
        await new Promise(res => setTimeout(res, 2000));
      }
    }

    writeDetailedLog(`סיום עיבוד הקבוצות. סה"כ עובדו: ${processedCount}, הצליח: ${successfulGroups}, נכשל: ${failedGroups}`, 'INFO');
    
    // שמור רק קבוצות עם נתונים
    const groups = allGroups.filter(g => g.name && g.name !== "הצגת הקבוצה" && g.name !== "View Group");
    console.log(`📋 קבוצות סופיות לשמירה: ${groups.length} מתוך ${allGroups.length} שנמצאו`);
    
    groupsRawToSave = groups;
    console.log('💾 שומר קבצים סופיים...');
    let rawJson = JSON.stringify(groupsRawToSave, null, 2).replace(/\\\//g, '/');
    fs.writeFileSync('groups-details-csv-raw.json', rawJson);
    const cleanCopy = JSON.parse(JSON.stringify(groupsRawToSave));
    cleanMembers(cleanCopy);
    const finalInstanceGroupsPath = `groups-csv-${instanceName}.json`;
    let cleanJson = JSON.stringify(cleanCopy, null, 2).replace(/\\\//g, '/');
    fs.writeFileSync(finalInstanceGroupsPath, cleanJson);
    // שמירה נוספת בשם groups-postify-csv.json - העתק מדויק
    fs.copyFileSync(finalInstanceGroupsPath, 'groups-postify-csv.json');
    console.log(`📁 נשמרו groups-details-csv-raw.json ו־${finalInstanceGroupsPath}`);

    // שליחת הנתונים הסופיים לאתר
    writeDetailedLog('מתחיל שליחת נתונים לשרת...', 'INFO');
    try {
      writeDetailedLog(`שולח ${cleanCopy.length} קבוצות לשרת...`, 'INFO');
      const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instance: instanceName, groups: cleanCopy, source: 'csv' })
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
    const instanceGroupsPath = path.join(__dirname, `groups-csv-${instanceName}.json`);
    
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

    if (isGroupsFileEmpty(instanceGroupsPath)) {
      console.error('❌ קובץ הקבוצות ריק - יתכן ויש בעיה בסריקה');
      writeDetailedLog('קובץ הקבוצות ריק - יתכן ויש בעיה בסריקה', 'ERROR');
      // שלח מייל שגיאה
      try {
        await fetch('https://postify.co.il/wp-content/postify-api/send-error-mail.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: 'שגיאה בסקריפט סריקת קבוצות מ-CSV',
            message: `הקובץ groups-csv-${instanceName}.json ריק.\n\nזמן: ${new Date().toISOString()}\nשרת: ${os.hostname()}\nנתיב: ${instanceGroupsPath}\nמקור: CSV`
          })
        });
        console.error('✅ התראה נשלחה למנהל');
      } catch (e) {
        console.error('❌ שגיאה בשליחת מייל התראה:', e.message);
      }
      process.exit(2);
    } else {
      console.log('✅ קובץ הקבוצות תקין ומכיל נתונים');
    }

    // --- סיום תקין ---
    writeDetailedLog("הסקריפט הסתיים בהצלחה!", 'SUCCESS');
    console.log(`\n🎉 סיכום סריקת הקבוצות מ-CSV:`);
    console.log(`📊 סה"כ קבוצות בקובץ CSV: ${groupsFromCSV.length}`);
    console.log(`✅ קבוצות שנסרקו בהצלחה: ${successfulGroups}`);
    console.log(`❌ קבוצות שנכשלו: ${failedGroups}`);
    console.log(`📁 קבצים שנוצרו:`);
    console.log(`   - groups-details-csv-raw.json`);
    console.log(`   - groups-csv-${instanceName}.json`);
    console.log(`   - groups-postify-csv.json`);
    
    writeDetailedLog('סוגר דפדפן...', 'INFO');
    await browser.close();
    writeDetailedLog('דפדפן נסגר בהצלחה', 'SUCCESS');
  } catch (err) {
    writeDetailedLog(`שגיאה קריטית בסקריפט הראשי: ${err.message}`, 'CRITICAL');
    writeDetailedLog(`פרטי השגיאה: ${err.stack}`, 'CRITICAL');
    
    writeDetailedLog('מנסה לשמור נתונים שנאספו עד כה...', 'INFO');
    await saveGroupsOnExit(groupsRawToSave, groupsToSave);
    
    // שלח מייל שגיאה
    console.error('❌ שגיאה קריטית - שולח התראה למנהל');
    try {
      await fetch('https://postify.co.il/wp-content/postify-api/send-error-mail.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'שגיאה קריטית בסקריפט סריקת קבוצות מ-CSV',
          message: `שגיאה: ${err && err.stack ? err.stack : err}\n\nזמן: ${new Date().toISOString()}\nשרת: ${os.hostname()}\nמקור: CSV`
        })
      });
      console.error('✅ התראה נשלחה למנהל');
    } catch (e) {
      console.error('❌ שגיאה בשליחת מייל התראה:', e.message);
    }
    process.exit(3);
  }
})();