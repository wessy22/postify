const puppeteer = require("puppeteer-core");
const os = require("os");
const config = require("../../config.json");
const fs = require("fs");
const path = require("path");

// פונקציה ליצירת לוג מפורט
function writeDetailedLog(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type}] ${message}\n`;
  console.log(`[${type}] ${message}`);
  
  try {
    fs.appendFileSync('detailed_scan.log', logMessage);
  } catch (err) {
    console.log('⚠️ שגיאה בכתיבה ללוג:', err.message);
  }
}

// פונקציה לקבלת קבוצות שפורסמו אליהן היום
function getTodayPublishedGroups(searchDate = null) {
  try {
    const targetDate = searchDate || new Date().toISOString().slice(0, 10);
    writeDetailedLog(`🔍 התחלת חיפוש קבוצות לתאריך: ${targetDate}`, 'DEBUG');
    
    const instanceName = fs.readFileSync(path.join(__dirname, '../../instance-name.txt'), 'utf-8').trim();
    writeDetailedLog(`📋 שם instance: ${instanceName}`, 'DEBUG');
    
    // חיפוש בקובץ הלוג הראשי
    const logPath = path.join(__dirname, '../../log.txt');
    writeDetailedLog(`📂 בודק אם קיים קובץ לוג: ${logPath}`, 'DEBUG');
    
    let todayGroups = [];
    
    if (fs.existsSync(logPath)) {
      writeDetailedLog('✅ קובץ לוג קיים - קורא תוכן...', 'INFO');
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n');
      
      writeDetailedLog(`📄 קובץ הלוג מכיל ${lines.length} שורות`, 'DEBUG');
      
      lines.forEach((line, lineIndex) => {
        if (line.includes('posting to group')) {
          const dateMatch = line.match(/\[(\d{4}-\d{2}-\d{2})/);
          if (dateMatch && dateMatch[1] === targetDate) {
            const urlMatch = line.match(/https:\/\/www\.facebook\.com\/groups\/([^\/\s]+)/);
            if (urlMatch) {
              const groupUrl = urlMatch[0];
              const groupId = urlMatch[1];
              
              writeDetailedLog(`✅ נמצאה קבוצה בלוג: ${groupUrl}`, 'INFO');
              
              todayGroups.push({
                name: `קבוצה ${groupId}`,
                url: groupUrl,
                id: groupId
              });
            }
          }
        }
      });
    } else {
      writeDetailedLog(`❌ קובץ לוג לא קיים בנתיב: ${logPath}`, 'ERROR');
    }
    
    // הסרת כפילויות
    const uniqueGroups = [];
    const seenUrls = new Set();
    
    todayGroups.forEach((group) => {
      if (!seenUrls.has(group.url)) {
        seenUrls.add(group.url);
        uniqueGroups.push(group);
      }
    });
    
    writeDetailedLog(`✅ אחרי הסרת כפילויות: ${uniqueGroups.length} קבוצות ייחודיות`, 'SUCCESS');
    
    return uniqueGroups;
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה בקבלת קבוצות מהיום: ${error.message}`, 'ERROR');
    return [];
  }
}

// פונקציה משופרת לבדיקת סטטוס בקבוצה עם אבחון מלא
async function checkPostStatusInGroup(page, groupUrl, groupName) {
  writeDetailedLog(`🔍 מתחיל בדיקת סטטוס בקבוצה: ${groupName}`, 'INFO');
  
  try {
    // בניית URL עם my_posted_content
    const statusUrl = groupUrl.endsWith('/') 
      ? groupUrl + 'my_posted_content' 
      : groupUrl + '/my_posted_content';
    
    writeDetailedLog(`🌐 נכנס לכתובת: ${statusUrl}`, 'DEBUG');
    
    // מעבר לעמוד הקבוצה
    await page.goto(statusUrl, {
      waitUntil: "networkidle0", 
      timeout: 45000
    });
    
    // בדיקת URL אחרי הניווט
    const currentUrl = await page.url();
    writeDetailedLog(`📍 URL נוכחי אחרי ניווט: ${currentUrl}`, 'DEBUG');
    
    // בדיקה אם נכנסנו לעמוד התחברות
    if (currentUrl.includes('login') || currentUrl.includes('checkpoint')) {
      writeDetailedLog('❌ נדרשת התחברות לפייסבוק', 'ERROR');
      return {
        groupName: groupName,
        groupUrl: groupUrl,
        posts: [],
        totalPosts: 0,
        statusCounts: { published: 0, pending: 0, rejected: 0, removed: 0, unknown: 0 },
        scanTime: new Date().toISOString(),
        success: false,
        error: 'נדרשת התחברות לפייסבוק'
      };
    }
    
    // הגדלת גודל החלון לוודא שהתפריט הצדדי מוצג
    await page.setViewport({ width: 1920, height: 1080 });
    
    // המתנה לטעינה מלאה
    writeDetailedLog('⏳ ממתין לטעינה מלאה...', 'DEBUG');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // ניסיון לגלול מעט כדי להפעיל טעינת התוכן
    writeDetailedLog('🔄 מבצע גלילה קלה להפעלת התוכן...', 'DEBUG');
    await page.evaluate(() => {
      window.scrollBy(0, 100);
      setTimeout(() => window.scrollBy(0, -100), 1000);
    });
    
    // המתנה נוספת אחרי הגלילה
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // ניסיון ללחוץ על כפתור או אזור שעשוי להפעיל את התפריט הצדדי
    writeDetailedLog('🔘 מנסה להפעיל את התפריט הצדדי...', 'DEBUG');
    try {
      // ניסיון למצוא ולהקליק על אלמנטים שעשויים להפעיל את התפריט
      await page.evaluate(() => {
        // חיפוש כפתורים או אלמנטים שעשויים להפעיל את התפריט
        const possibleTriggers = [
          ...document.querySelectorAll('[role="button"]'),
          ...document.querySelectorAll('div[data-testid]'),
          ...document.querySelectorAll('.x1i10hfl')
        ];
        
        // ניסיון להקליק על אלמנטים שעשויים להכיל טקסט רלוונטי
        possibleTriggers.forEach(element => {
          const text = element.textContent || element.innerText || '';
          if (text.includes('פוסט') || text.includes('בהמתנה') || text.includes('פורסמו')) {
            try {
              element.click();
              console.log(`נלחץ על אלמנט: "${text.substring(0, 50)}"`);
            } catch (e) {
              // התעלם משגיאות קליק
            }
          }
        });
      });
    } catch (clickError) {
      writeDetailedLog(`⚠️ שגיאה בניסיון הפעלת התפריט: ${clickError.message}`, 'WARNING');
    }
    
    // המתנה אחרונה לאחר הניסיונות להפעיל את התפריט
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // אבחון מלא של הדף
    const diagnostics = await page.evaluate(() => {
      const result = {
        pageTitle: document.title,
        bodyText: document.body ? document.body.textContent.substring(0, 500) : 'אין body',
        allTabs: [],
        allNumbers: [],
        errorMessages: [],
        sideMenuElements: [], // חדש: אלמנטים של התפריט הצדדי
        allButtonsWithText: [] // חדש: כל הכפתורים עם טקסט
      };
      
      try {
        console.log('🔍 מתחיל אבחון מלא של הדף...');
        
        // חיפוש אלמנטים של התפריט הצדדי
        const sideMenuSelectors = [
          'nav[role="navigation"]',
          '[data-testid*="left"]', 
          '[data-testid*="side"]',
          '[data-testid*="nav"]',
          '.x1n2onr6', // סלקטור נפוץ של פייסבוק לתפריטים
          '.x78zum5'  // סלקטור נוסף
        ];
        
        sideMenuSelectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              result.sideMenuElements.push({
                selector: selector,
                count: elements.length,
                visible: elements[0].offsetParent !== null,
                text: elements[0].textContent ? elements[0].textContent.substring(0, 200) : ''
              });
            }
          } catch (e) {
            // התעלם משגיאות
          }
        });
        
        // חיפוש כל הכפתורים עם טקסט שעשוי להיות רלוונטי
        const allButtons = document.querySelectorAll('button, [role="button"], div[tabindex], a');
        allButtons.forEach((btn, index) => {
          if (index < 20) { // רק 20 הראשונים כדי לא לעמוס
            const text = btn.textContent || btn.innerText || '';
            const isVisible = btn.offsetParent !== null;
            
            if (text.length > 0 && text.length < 100) {
              result.allButtonsWithText.push({
                index: index,
                text: text,
                visible: isVisible,
                tagName: btn.tagName
              });
            }
          }
        });
        
        // חיפוש כל הטאבים (הקוד הקיים)
        const tabs = Array.from(document.querySelectorAll('[role="tab"], a[role="tab"], .x1i10hfl[role="tab"]'));
        console.log(`🔍 נמצאו ${tabs.length} טאבים`);
        
        tabs.forEach((tab, index) => {
          const tabText = tab.textContent || tab.innerText || '';
          
          result.allTabs.push({
            index: index,
            text: tabText.substring(0, 100),
            isSelected: tab.getAttribute('aria-selected') === 'true',
            hasNumber: /\d+/.test(tabText),
            visible: tab.offsetParent !== null
          });
          
          console.log(`טאב ${index}: "${tabText.substring(0, 50)}" (נראה: ${tab.offsetParent !== null})`);
        });
        
        // חיפוש כל המספרים בדף
        const bodyText = document.body ? document.body.textContent : '';
        const numberMatches = bodyText.match(/\d+\s*(?:פוסט|post|Posted|פורסם)/gi);
        if (numberMatches) {
          result.allNumbers = numberMatches.slice(0, 10);
        }
        
        // חיפוש אלמנטים שמכילים את הטקסטים הרלוונטיים
        const relevantTexts = ['בהמתנה', 'פורסמו', 'נדחו', 'הוסרו'];
        relevantTexts.forEach(text => {
          const elements = Array.from(document.querySelectorAll('*')).filter(el => {
            const elText = el.textContent || el.innerText || '';
            return elText.trim() === text && el.children.length === 0; // רק אלמנטים ללא ילדים
          });
          
          if (elements.length > 0) {
            result.sideMenuElements.push({
              selector: `טקסט: ${text}`,
              count: elements.length,
              visible: elements[0].offsetParent !== null,
              text: text
            });
          }
        });
        
      } catch (error) {
        result.errorMessages.push(`שגיאה באבחון: ${error.message}`);
      }
      
      return result;
    });
    
    // הדפסת תוצאות אבחון
    writeDetailedLog(`📄 כותרת דף: ${diagnostics.pageTitle}`, 'DEBUG');
    writeDetailedLog(`📝 תחילת טקסט הדף: ${diagnostics.bodyText.substring(0, 200)}...`, 'DEBUG');
    writeDetailedLog(`🔍 נמצאו ${diagnostics.allTabs.length} טאבים`, 'DEBUG');
    
    // אבחון התפריט הצדדי
    writeDetailedLog(`📋 אבחון התפריט הצדדי:`, 'DEBUG');
    diagnostics.sideMenuElements.forEach((menu, index) => {
      writeDetailedLog(`   ${index + 1}. ${menu.selector}: ${menu.count} אלמנטים (נראה: ${menu.visible})`, 'DEBUG');
      if (menu.text.length > 0) {
        writeDetailedLog(`      טקסט: "${menu.text.substring(0, 100)}"`, 'DEBUG');
      }
    });
    
    // הדפסת כפתורים רלוונטיים
    writeDetailedLog(`🔘 כפתורים עם טקסט (${diagnostics.allButtonsWithText.length}):`, 'DEBUG');
    diagnostics.allButtonsWithText.forEach((btn, index) => {
      if (btn.text.includes('פוסט') || btn.text.includes('בהמתנה') || btn.text.includes('פורסמו') || btn.text.includes('נדחו')) {
        writeDetailedLog(`   ${index + 1}. "${btn.text}" (נראה: ${btn.visible}, ${btn.tagName})`, 'DEBUG');
      }
    });
    
    diagnostics.allTabs.forEach((tab, index) => {
      if (tab.hasNumber || tab.isSelected) {
        writeDetailedLog(`   טאב ${index}: "${tab.text}" (נבחר: ${tab.isSelected}, יש מספר: ${tab.hasNumber}, נראה: ${tab.visible})`, 'DEBUG');
      }
    });
    
    if (diagnostics.allNumbers.length > 0) {
      writeDetailedLog(`🔢 מספרים שנמצאו: ${diagnostics.allNumbers.join(', ')}`, 'DEBUG');
    }
    
    if (diagnostics.errorMessages.length > 0) {
      writeDetailedLog(`⚠️ הודעות שגיאה: ${diagnostics.errorMessages.join(', ')}`, 'WARNING');
    }
    
    // עכשיו ננסה למצוא פוסטים בהתבסס על האבחון
    const result = await page.evaluate(() => {
      let allPosts = [];
      
      try {
        console.log('🔍 מחפש סטטוסים עם הסלקטורים המדויקים של פייסבוק...');
        
        // מפת סטטוסים עברית לאנגלית
        const statusMap = {
          'בהמתנה': 'pending',
          'פורסמו': 'published', 
          'נדחו': 'rejected',
          'הוסרו': 'removed'
        };
        
        // פונקציה לזיהוי מספרים עבריים וספרות
        function extractNumber(text) {
          // קודם חיפוש ספרות רגילות
          const digitMatch = text.match(/(\d+)/);
          if (digitMatch) {
            return parseInt(digitMatch[1]);
          }
          
          // מפת מספרים עבריים
          const hebrewNumbers = {
            'אחד': 1, 'שני': 2, 'שלושה': 3, 'ארבעה': 4, 'חמישה': 5,
            'שישה': 6, 'שבעה': 7, 'שמונה': 8, 'תשעה': 9, 'עשרה': 10,
            'אחד עשר': 11, 'שנים עשר': 12, 'שלושה עשר': 13, 'ארבעה עשר': 14, 'חמישה עשר': 15,
            'שישה עשר': 16, 'שבעה עשר': 17, 'שמונה עשר': 18, 'תשעה עשר': 19, 'עשרים': 20,
            'עשרים ואחד': 21, 'עשרים ושני': 22, 'עשרים ושלושה': 23, 'עשרים וארבעה': 24, 'עשרים וחמישה': 25,
            'שלושים': 30, 'ארבעים': 40, 'חמישים': 50
          };
          
          // חיפוש מספרים עבריים בטקסט
          for (const [hebrewNum, value] of Object.entries(hebrewNumbers)) {
            if (text.includes(hebrewNum)) {
              console.log(`✅ זוהה מספר עברי: "${hebrewNum}" = ${value}`);
              return value;
            }
          }
          
          return null;
        }
        
        // חיפוש כל הכפתורים שמכילים טקסט עם סטטוס ומספר פוסטים
        const allButtons = document.querySelectorAll('button, [role="button"], div[tabindex], a');
        console.log(`נמצאו ${allButtons.length} כפתורים וקישורים`);
        
        allButtons.forEach((btn, index) => {
          const btnText = btn.textContent || btn.innerText || '';
          
          // בדיקה אם הכפתור מכיל גם סטטוס וגם מספר פוסטים
          if (btnText.includes('פוסט') && btnText.length < 200) {
            console.log(`בודק כפתור ${index}: "${btnText}"`);
            
            // חיפוש סטטוס במילות המפתח
            let foundStatus = 'unknown';
            for (const [hebrewStatus, englishStatus] of Object.entries(statusMap)) {
              if (btnText.includes(hebrewStatus)) {
                foundStatus = englishStatus;
                console.log(`✅ זוהה סטטוס: ${foundStatus} מטקסט: "${hebrewStatus}"`);
                break;
              }
            }
            
            // חילוץ המספר מהטקסט - גם ספרות וגם מילים עבריות
            let count = null;
            
            // ניסיון ראשון: חיפוש ספרות עם המילה "פוסט"
            const numberMatch = btnText.match(/(\d+)\s*פוסט/);
            if (numberMatch) {
              count = parseInt(numberMatch[1]);
              console.log(`✅ נמצאו ${count} פוסטים (ספרות) עם סטטוס ${foundStatus}`);
            } else {
              // ניסיון שני: חיפוש מספרים עבריים עם "פוסטים"
              count = extractNumber(btnText);
              if (count && btnText.includes('פוסט')) {
                console.log(`✅ נמצאו ${count} פוסטים (מילים עבריות) עם סטטוס ${foundStatus}`);
              } else if (foundStatus !== 'unknown') {
                // ניסיון שלישי: חיפוש כל מספר (ספרות או עברית) אם יש סטטוס
                count = extractNumber(btnText);
                if (count && count > 0 && count < 1000) {
                  console.log(`✅ נמצאו ${count} פוסטים (ללא המילה "פוסט") עם סטטוס ${foundStatus}`);
                } else {
                  count = null;
                }
              }
            }
            
            // הוספת הפוסטים למערך אם נמצא מספר
            if (count && count > 0) {
              for (let j = 0; j < count; j++) {
                allPosts.push({
                  postId: allPosts.length + 1,
                  status: foundStatus,
                  tabSource: btnText.substring(0, 100)
                });
              }
            }
          }
        });
        
        // אם עדיין לא מצאנו כלום, ננסה חיפוש נוסף במיוחד לכפתורים שמכילים רק מספרים
        if (allPosts.length === 0) {
          console.log('🔍 לא נמצאו פוסטים בחיפוש הראשון, מנסה חיפוש מורחב...');
          
          // חיפוש כל הספאנים עם מספרים
          const numberSpans = document.querySelectorAll('span');
          numberSpans.forEach((span, index) => {
            const spanText = span.textContent || span.innerText || '';
            
            // חיפוש דפוסים של מספרים עם "פוסטים" - גם ספרות וגם מילים עבריות
            if (spanText.includes('פוסט')) {
              console.log(`נמצא ספאן עם פוסטים: "${spanText}"`);
              
              let count = extractNumber(spanText);
              if (count) {
                // ניסיון למצוא סטטוס בסביבה הקרובה
                let nearbyStatus = 'unknown';
                
                // חיפוש באלמנט הקרוב או באב
                let currentElement = span;
                for (let i = 0; i < 5; i++) {
                  if (currentElement.parentElement) {
                    currentElement = currentElement.parentElement;
                    const parentText = currentElement.textContent || '';
                    
                    for (const [hebrewStatus, englishStatus] of Object.entries(statusMap)) {
                      if (parentText.includes(hebrewStatus)) {
                        nearbyStatus = englishStatus;
                        console.log(`✅ זוהה סטטוס ${nearbyStatus} באב: "${hebrewStatus}"`);
                        break;
                      }
                    }
                    
                    if (nearbyStatus !== 'unknown') break;
                  }
                }
                
                console.log(`✅ נמצאו ${count} פוסטים עם סטטוס ${nearbyStatus} בחיפוש מורחב`);
                
                for (let j = 0; j < count; j++) {
                  allPosts.push({
                    postId: allPosts.length + 1,
                    status: nearbyStatus,
                    tabSource: `חיפוש מורחב - ${spanText}`
                  });
                }
              }
            }
          });
        }
        
      } catch (error) {
        console.log(`❌ שגיאה בחיפוש פוסטים: ${error.message}`);
      }
      
      console.log(`📊 סה"כ נמצאו ${allPosts.length} פוסטים`);
      return allPosts;
    });
    
    // עיבוד התוצאות
    const statusCounts = {
      published: result.filter(p => p.status === 'published').length,
      pending: result.filter(p => p.status === 'pending').length,
      rejected: result.filter(p => p.status === 'rejected').length,
      removed: result.filter(p => p.status === 'removed').length,
      unknown: result.filter(p => p.status === 'unknown').length
    };
    
    writeDetailedLog(`📊 נמצאו סה"כ ${result.length} פוסטים:`, 'SUCCESS');
    writeDetailedLog(`   ✅ מפורסמים: ${statusCounts.published}`, 'SUCCESS');
    writeDetailedLog(`   ⏳ ממתינים: ${statusCounts.pending}`, 'WARNING');
    writeDetailedLog(`   ❌ נדחו: ${statusCounts.rejected}`, 'ERROR');
    writeDetailedLog(`   🗑️ הוסרו: ${statusCounts.removed}`, 'ERROR');
    if (statusCounts.unknown > 0) {
      writeDetailedLog(`   ❓ לא ידוע: ${statusCounts.unknown}`, 'WARNING');
    }
    
    return {
      groupName: groupName,
      groupUrl: groupUrl,
      statusUrl: statusUrl,
      posts: result,
      totalPosts: result.length,
      statusCounts: statusCounts,
      scanTime: new Date().toISOString(),
      success: true,
      diagnostics: diagnostics
    };
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה בבדיקת קבוצה ${groupName}: ${error.message}`, 'ERROR');
    
    return {
      groupName: groupName,
      groupUrl: groupUrl,
      posts: [],
      totalPosts: 0,
      statusCounts: { published: 0, pending: 0, rejected: 0, removed: 0, unknown: 0 },
      scanTime: new Date().toISOString(),
      success: false,
      error: error.message
    };
  }
}

// פונקציה לשמירת התוצאות
function saveResults(results) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `groups-post-status-${timestamp.slice(0, 10)}.json`;
    
    const dataToSave = {
      scanDate: new Date().toISOString(),
      totalGroups: results.length,
      successfulScans: results.filter(r => r.success).length,
      failedScans: results.filter(r => !r.success).length,
      results: results
    };
    
    fs.writeFileSync(fileName, JSON.stringify(dataToSave, null, 2));
    writeDetailedLog(`נתונים נשמרו ב: ${fileName}`, 'SUCCESS');
    
    fs.writeFileSync('latest-groups-post-status.json', JSON.stringify(dataToSave, null, 2));
    writeDetailedLog(`נתונים נשמרו גם ב: latest-groups-post-status.json`, 'SUCCESS');
    
    return fileName;
  } catch (error) {
    writeDetailedLog(`❌ שגיאה בשמירת התוצאות: ${error.message}`, 'ERROR');
    return null;
  }
}

// הפונקציה הראשית
async function main() {
  let browser;
  
  try {
    writeDetailedLog('🚀 התחלת סקריפט בדיקת סטטוס פרסומים בקבוצות פייסבוק (גרסה פשוטה)', 'START');
    writeDetailedLog(`⏰ זמן התחלה: ${new Date().toLocaleString('he-IL')}`, 'INFO');
    
    // עיבוד פרמטרים מהטרמינל
    const args = process.argv.slice(2);
    let searchDate = null;
    let specificGroup = null;
    
    args.forEach((arg) => {
      if (arg.startsWith('--date=')) {
        searchDate = arg.split('=')[1];
        writeDetailedLog(`📅 פרמטר תאריך זוהה: ${searchDate}`, 'INFO');
      } else if (arg.startsWith('--group=')) {
        specificGroup = arg.split('=')[1];
        writeDetailedLog(`🎯 פרמטר קבוצה ספציפית זוהה: ${specificGroup}`, 'INFO');
      }
    });
    
    // קביעת תאריך סריקה
    const finalDate = searchDate || new Date().toISOString().slice(0, 10);
    writeDetailedLog(`🎯 תאריך סריקה סופי: ${finalDate}`, 'INFO');
    
    let todayGroups = [];
    
    if (specificGroup) {
      const groupId = specificGroup.includes('/groups/') 
        ? specificGroup.split('/groups/')[1].split('/')[0]
        : specificGroup;
        
      todayGroups = [{
        name: `קבוצה ${groupId}`,
        url: specificGroup.startsWith('http') ? specificGroup : `https://www.facebook.com/groups/${specificGroup}`,
        id: groupId
      }];
    } else {
      todayGroups = getTodayPublishedGroups(finalDate);
    }
    
    writeDetailedLog(`📊 תוצאות חיפוש: נמצאו ${todayGroups.length} קבוצות`, 'INFO');
    
    if (todayGroups.length === 0) {
      writeDetailedLog('⚠️ לא נמצאו קבוצות שפורסמו אליהן היום', 'WARNING');
      writeDetailedLog('💡 נסה תאריך אחר עם --date=YYYY-MM-DD או קבוצה ספציפית עם --group=URL', 'INFO');
      return;
    }
    
    // הדפסת רשימת קבוצות לסריקה
    writeDetailedLog('📋 רשימת קבוצות לסריקה:', 'INFO');
    todayGroups.forEach((group, index) => {
      writeDetailedLog(`   ${index + 1}. ${group.name} - ${group.url}`, 'INFO');
    });
    
    // הגדרת דפדפן
    writeDetailedLog('🌐 מתחיל הגדרת דפדפן...', 'INFO');
    
    const isWindows = os.platform() === 'win32';
    const userDataDir = isWindows 
      ? 'C:\\postify\\chrome-profiles\\postify'
      : '/postify/chrome-profiles/postify';
    
    writeDetailedLog(`📁 תיקיית נתוני משתמש: ${userDataDir}`, 'DEBUG');
    writeDetailedLog(`🚀 נתיב Chrome: ${config.chromePath}`, 'DEBUG');
    
    browser = await puppeteer.launch({
      headless: false,
      executablePath: config.chromePath,
      userDataDir: userDataDir,
      devtools: false,
      defaultViewport: { width: 1920, height: 1080 },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--start-maximized",
        "--window-size=1920,1080",
        "--disable-web-security",
        "--profile-directory=Default",
        "--disable-dev-shm-usage",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--disable-infobars"
      ]
    });
    
    writeDetailedLog('✅ דפדפן נפתח בהצלחה', 'SUCCESS');
    
    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    writeDetailedLog('✅ עמוד דפדפן הוגדר בהצלחה', 'SUCCESS');
    writeDetailedLog('⏸️ הדפדפן פתוח - בדוק שאתה רואה אותו כמו שצריך לפני המשך הסריקה', 'INFO');
    
    // המתנה של 5 שניות לבדיקה ויזואלית
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // סריקת כל הקבוצות
    writeDetailedLog(`🎯 מתחיל לסרוק ${todayGroups.length} קבוצות...`, 'INFO');
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < todayGroups.length; i++) {
      const group = todayGroups[i];
      writeDetailedLog(`\n📋 קבוצה ${i + 1}/${todayGroups.length}: ${group.name}`, 'INFO');
      
      try {
        const result = await checkPostStatusInGroup(page, group.url, group.name);
        results.push(result);
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
        
        // המתנה בין קבוצות
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        writeDetailedLog(`❌ שגיאה בסריקת קבוצה ${group.name}: ${error.message}`, 'ERROR');
        errorCount++;
        
        results.push({
          groupName: group.name,
          groupUrl: group.url,
          posts: [],
          totalPosts: 0,
          scanTime: new Date().toISOString(),
          success: false,
          error: error.message
        });
      }
    }
    
    // סיכום תוצאות
    writeDetailedLog(`\n📊 סיכום סריקה:`, 'INFO');
    writeDetailedLog(`   ✅ הצליחו: ${successCount}`, 'SUCCESS');
    writeDetailedLog(`   ❌ נכשלו: ${errorCount}`, 'ERROR');
    writeDetailedLog(`   📋 סה"כ: ${todayGroups.length}`, 'INFO');
    
    // שמירת תוצאות
    writeDetailedLog('💾 שומר תוצאות...', 'INFO');
    const savedFile = saveResults(results);
    
    if (savedFile) {
      writeDetailedLog(`✅ סריקה הושלמה בהצלחה! תוצאות נשמרו ב: ${savedFile}`, 'SUCCESS');
    }
    
    // הכנת סיכום מפורט
    const totalPosts = results.reduce((sum, r) => sum + (r.totalPosts || 0), 0);
    
    writeDetailedLog('📊 סיכום סופי:', 'SUCCESS');
    writeDetailedLog(`   🎯 קבוצות נסרקו בהצלחה: ${successCount}/${todayGroups.length}`, 'SUCCESS');
    writeDetailedLog(`   📄 סה"כ פוסטים נמצאו: ${totalPosts}`, 'SUCCESS');
    writeDetailedLog(`   ⏰ זמן סיום: ${new Date().toLocaleString('he-IL')}`, 'SUCCESS');
    
    writeDetailedLog('🎉 התוכנית הסתיימה בהצלחה!', 'END');
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה קריטית: ${error.message}`, 'ERROR');
    writeDetailedLog(`🔧 Stack trace: ${error.stack}`, 'ERROR');
  } finally {
    if (browser) {
      try {
        await browser.close();
        writeDetailedLog('✅ דפדפן נסגר בהצלחה', 'SUCCESS');
      } catch (closeError) {
        writeDetailedLog(`⚠️ שגיאה בסגירת דפדפן: ${closeError.message}`, 'WARNING');
      }
    }
  }
}

// הרצת התוכנית
if (require.main === module) {
  main().catch(error => {
    writeDetailedLog(`❌ שגיאה לא צפויה: ${error.message}`, 'ERROR');
    process.exit(1);
  });
}

module.exports = {
  getTodayPublishedGroups,
  checkPostStatusInGroup,
  saveResults
};
