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
    fs.appendFileSync('detailed_scan_advanced.log', logMessage);
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

// פונקציה לחילוץ תאריך מטקסט פוסט
function extractPostDate(postText) {
  try {
    // דפוסים שונים של תאריכים בפייסבוק
    const patterns = [
      // "לפני X דקות/שעות/ימים"
      /לפני (\d+) (דקות?|שעות?|ימים?|שבועות?)/,
      // "X דקות/שעות/ימים"
      /(\d+) (דקות?|שעות?|ימים?|שבועות?)/,
      // תאריך מלא DD/MM/YYYY או DD.MM.YYYY
      /(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/,
      // "היום", "אתמול", "שלשום"
      /(היום|אתמול|שלשום)/,
      // שמות חודשים עבריים
      /(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/
    ];
    
    let detectedDate = null;
    let confidence = 0;
    
    for (const pattern of patterns) {
      const match = postText.match(pattern);
      if (match) {
        writeDetailedLog(`🕒 זוהה דפוס תאריך: "${match[0]}" בטקסט: "${postText.substring(0, 100)}"`, 'DEBUG');
        
        if (match[0].includes('לפני') || /^\d+\s+(דקות?|שעות?)/.test(match[0])) {
          // זמן יחסי - ככל שהמספר קטן יותר, התאריך חדש יותר
          const num = parseInt(match[1]);
          const unit = match[2];
          
          if (unit.includes('דקות')) {
            detectedDate = new Date(Date.now() - num * 60000);
            confidence = 95;
          } else if (unit.includes('שעות')) {
            detectedDate = new Date(Date.now() - num * 3600000);
            confidence = 90;
          } else if (unit.includes('ימים')) {
            detectedDate = new Date(Date.now() - num * 86400000);
            confidence = 85;
          } else if (unit.includes('שבועות')) {
            detectedDate = new Date(Date.now() - num * 604800000);
            confidence = 80;
          }
          
          writeDetailedLog(`📅 זוהה תאריך יחסי: ${detectedDate.toISOString()} (ביטחון: ${confidence}%)`, 'INFO');
          break;
        } else if (match[0] === 'היום') {
          detectedDate = new Date();
          confidence = 95;
          break;
        } else if (match[0] === 'אתמול') {
          detectedDate = new Date(Date.now() - 86400000);
          confidence = 95;
          break;
        } else if (match[0] === 'שלשום') {
          detectedDate = new Date(Date.now() - 172800000);
          confidence = 95;
          break;
        }
      }
    }
    
    return {
      date: detectedDate,
      confidence: confidence,
      originalText: postText.substring(0, 200)
    };
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה בחילוץ תאריך: ${error.message}`, 'ERROR');
    return {
      date: null,
      confidence: 0,
      originalText: postText.substring(0, 200)
    };
  }
}

// פונקציה לכניסה לטאב ובדיקת הפוסט הראשון
async function checkTabFirstPost(page, tabText, statusType) {
  writeDetailedLog(`🎯 מתחיל בדיקת טאב "${tabText}" (${statusType})`, 'INFO');
  
  try {
    // חיפוש הטאב לפי הטקסט
    const tabFound = await page.evaluate((searchText, status) => {
      console.log(`מחפש טאב עם הטקסט: "${searchText}"`);
      
      // חיפוש כל הטאבים האפשריים
      const possibleTabs = [
        ...document.querySelectorAll('[role="tab"]'),
        ...document.querySelectorAll('a[role="tab"]'),
        ...document.querySelectorAll('button'),
        ...document.querySelectorAll('div[tabindex]'),
        ...document.querySelectorAll('a')
      ];
      
      console.log(`נמצאו ${possibleTabs.length} אלמנטים אפשריים`);
      
      for (let i = 0; i < possibleTabs.length; i++) {
        const tab = possibleTabs[i];
        const tabText = tab.textContent || tab.innerText || '';
        
        // בדיקה אם הטאב מכיל את הטקסט הרלוונטי
        if (tabText.includes(searchText) && tabText.length < 100) {
          console.log(`✅ נמצא טאב תואם: "${tabText}"`);
          
          try {
            // ניסיון ללחוץ על הטאב
            tab.click();
            console.log(`✅ לחצתי על הטאב: "${tabText}"`);
            return {
              success: true,
              clickedText: tabText,
              tabElement: tab.outerHTML.substring(0, 200)
            };
          } catch (clickError) {
            console.log(`❌ שגיאה בלחיצה על הטאב: ${clickError.message}`);
          }
        }
      }
      
      return {
        success: false,
        error: `לא נמצא טאב עם הטקסט: "${searchText}"`
      };
      
    }, tabText, statusType);
    
    if (!tabFound.success) {
      writeDetailedLog(`❌ לא הצלחתי למצוא טאב עם "${tabText}": ${tabFound.error}`, 'WARNING');
      return {
        status: statusType,
        tabText: tabText,
        firstPost: null,
        error: tabFound.error
      };
    }
    
    writeDetailedLog(`✅ לחצתי על טאב: "${tabFound.clickedText}"`, 'SUCCESS');
    
    // המתנה לטעינת התוכן
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // חיפוש הפוסט הראשון ברשימה
    const firstPostInfo = await page.evaluate(() => {
      console.log('🔍 מחפש את הפוסט הראשון ברשימה...');
      
      // סלקטורים אפשריים לפוסטים
      const postSelectors = [
        '[data-testid="story-subtitle"]', // תאריך הפוסט
        '[data-testid*="post"]',
        '[role="article"]',
        'div[data-ft]', // פוסטים ישנים
        '.userContentWrapper', // פוסטים ישנים
        'div[style*="border"]' // מאמרים או פוסטים
      ];
      
      let firstPostElement = null;
      let postText = '';
      let postDate = '';
      
      // חיפוש הפוסט הראשון
      for (const selector of postSelectors) {
        const posts = document.querySelectorAll(selector);
        console.log(`סלקטור "${selector}": נמצאו ${posts.length} אלמנטים`);
        
        if (posts.length > 0) {
          firstPostElement = posts[0];
          postText = firstPostElement.textContent || firstPostElement.innerText || '';
          
          // חיפוש תאריך בתוך הפוסט או בסביבתו
          const dateSelectors = [
            '[data-testid="story-subtitle"]',
            '.timestampContent',
            'abbr[data-utime]',
            'time',
            'span[title]'
          ];
          
          for (const dateSelector of dateSelectors) {
            const dateElement = firstPostElement.querySelector(dateSelector) || 
                               document.querySelector(dateSelector);
            if (dateElement) {
              postDate = dateElement.textContent || dateElement.getAttribute('title') || '';
              if (postDate) {
                console.log(`✅ נמצא תאריך: "${postDate}" עם סלקטור: ${dateSelector}`);
                break;
              }
            }
          }
          
          if (postText.length > 50) { // ודא שיש תוכן משמעותי
            console.log(`✅ נמצא פוסט ראשון עם ${postText.length} תווים`);
            break;
          }
        }
      }
      
      // אם לא מצאנו תאריך ספציפי, ננסה לחפש בכל הדף
      if (!postDate) {
        console.log('🔍 מחפש תאריך בכל הדף...');
        
        const allTimeElements = [
          ...document.querySelectorAll('*')
        ].filter(el => {
          const text = el.textContent || el.innerText || '';
          return text.match(/(לפני|היום|אתמול|\d+\s+(דקות?|שעות?|ימים?)|\d{1,2}\/\d{1,2}\/\d{4})/) &&
                 text.length < 50;
        });
        
        if (allTimeElements.length > 0) {
          // קח את הראשון שנמצא (כנראה החדש ביותר)
          postDate = allTimeElements[0].textContent || allTimeElements[0].innerText || '';
          console.log(`✅ נמצא תאריך גנרי: "${postDate}"`);
        }
      }
      
      return {
        found: firstPostElement !== null,
        text: postText.substring(0, 500),
        date: postDate,
        elementInfo: firstPostElement ? {
          tagName: firstPostElement.tagName,
          className: firstPostElement.className,
          dataTestId: firstPostElement.getAttribute('data-testid')
        } : null
      };
    });
    
    if (!firstPostInfo.found) {
      writeDetailedLog(`❌ לא נמצא פוסט ראשון בטאב "${tabText}"`, 'WARNING');
      return {
        status: statusType,
        tabText: tabText,
        firstPost: null,
        error: 'לא נמצא פוסט ראשון'
      };
    }
    
    writeDetailedLog(`✅ נמצא פוסט ראשון בטאב "${tabText}":`, 'SUCCESS');
    writeDetailedLog(`   📝 תוכן: "${firstPostInfo.text.substring(0, 100)}..."`, 'INFO');
    writeDetailedLog(`   🕒 תאריך גולמי: "${firstPostInfo.date}"`, 'INFO');
    
    // עיבוד התאריך
    const dateInfo = extractPostDate(firstPostInfo.date || firstPostInfo.text);
    
    return {
      status: statusType,
      tabText: tabText,
      firstPost: {
        text: firstPostInfo.text,
        rawDate: firstPostInfo.date,
        extractedDate: dateInfo.date,
        dateConfidence: dateInfo.confidence,
        elementInfo: firstPostInfo.elementInfo
      },
      success: true
    };
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה בבדיקת טאב "${tabText}": ${error.message}`, 'ERROR');
    return {
      status: statusType,
      tabText: tabText,
      firstPost: null,
      error: error.message
    };
  }
}

// פונקציה משופרת לבדיקת סטטוס בקבוצה עם בדיקת פוסטים אמיתית
async function checkPostStatusInGroup(page, groupUrl, groupName) {
  writeDetailedLog(`🔍 מתחיל בדיקת סטטוס מתקדמת בקבוצה: ${groupName}`, 'INFO');
  
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
        success: false,
        error: 'נדרשת התחברות לפייסבוק'
      };
    }
    
    // הגדלת גודל החלון לוודא שהתפריט הצדדי מוצג
    await page.setViewport({ width: 1920, height: 1080 });
    
    // המתנה לטעינה מלאה
    writeDetailedLog('⏳ ממתין לטעינה מלאה...', 'DEBUG');
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // גלילה קלה להפעלת התוכן
    await page.evaluate(() => {
      window.scrollBy(0, 100);
      setTimeout(() => window.scrollBy(0, -100), 1000);
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // קודם נקבל מבט כללי על הטאבים הקיימים
    const availableTabs = await page.evaluate(() => {
      const tabs = [
        ...document.querySelectorAll('[role="tab"]'),
        ...document.querySelectorAll('button'),
        ...document.querySelectorAll('a'),
        ...document.querySelectorAll('div[tabindex]')
      ];
      
      const tabsInfo = [];
      const statusKeywords = ['בהמתנה', 'פורסמו', 'נדחו', 'הוסרו', 'pending', 'published', 'rejected', 'removed'];
      
      tabs.forEach((tab, index) => {
        const tabText = tab.textContent || tab.innerText || '';
        
        // בדיקה אם הטאב מכיל מילת מפתח של סטטוס
        const hasStatusKeyword = statusKeywords.some(keyword => 
          tabText.includes(keyword)
        );
        
        // בדיקה אם יש מספר (מספר פוסטים)
        const hasNumber = /\d+/.test(tabText);
        
        if ((hasStatusKeyword || hasNumber) && tabText.length < 100 && tabText.length > 3) {
          tabsInfo.push({
            index: index,
            text: tabText,
            hasNumber: hasNumber,
            hasStatusKeyword: hasStatusKeyword,
            isVisible: tab.offsetParent !== null
          });
        }
      });
      
      return tabsInfo;
    });
    
    writeDetailedLog(`📋 נמצאו ${availableTabs.length} טאבים רלוונטיים:`, 'INFO');
    availableTabs.forEach((tab, index) => {
      writeDetailedLog(`   ${index + 1}. "${tab.text}" (מספר: ${tab.hasNumber}, סטטוס: ${tab.hasStatusKeyword}, נראה: ${tab.isVisible})`, 'DEBUG');
    });
    
    // עכשיו נבדוק טאבים ספציפיים לפי עדיפויות
    const tabsToCheck = [
      { keywords: ['פורסמו', 'published'], status: 'published', priority: 1 },
      { keywords: ['בהמתנה', 'pending'], status: 'pending', priority: 2 },
      { keywords: ['נדחו', 'rejected'], status: 'rejected', priority: 3 },
      { keywords: ['הוסרו', 'removed'], status: 'removed', priority: 4 }
    ];
    
    const checkedTabs = [];
    let latestPost = null;
    let latestPostDate = null;
    
    // בדיקת כל טאב
    for (const tabConfig of tabsToCheck) {
      // חיפוש טאב שמתאים לקונפיגורציה
      const matchingTab = availableTabs.find(tab => 
        tabConfig.keywords.some(keyword => tab.text.includes(keyword))
      );
      
      if (matchingTab) {
        writeDetailedLog(`🎯 בודק טאב: "${matchingTab.text}" (${tabConfig.status})`, 'INFO');
        
        const tabResult = await checkTabFirstPost(page, matchingTab.text, tabConfig.status);
        checkedTabs.push(tabResult);
        
        if (tabResult.success && tabResult.firstPost && tabResult.firstPost.extractedDate) {
          const postDate = tabResult.firstPost.extractedDate;
          
          writeDetailedLog(`📅 תאריך פוסט ב-${tabConfig.status}: ${postDate.toISOString()}`, 'INFO');
          
          // בדיקה אם זה הפוסט הכי חדש עד כה
          if (!latestPost || postDate > latestPostDate) {
            latestPost = tabResult;
            latestPostDate = postDate;
            writeDetailedLog(`🏆 פוסט חדש ביותר עודכן ל-${tabConfig.status}`, 'SUCCESS');
          }
        }
        
        // המתנה קצרה בין טאבים
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        writeDetailedLog(`❓ לא נמצא טאב עבור ${tabConfig.status}`, 'WARNING');
      }
    }
    
    // סיכום וחישוב סטטוסים
    const statusCounts = {};
    let totalPosts = 0;
    
    availableTabs.forEach(tab => {
      const numberMatch = tab.text.match(/(\d+)/);
      if (numberMatch) {
        const count = parseInt(numberMatch[1]);
        
        if (tab.text.includes('פורסמו') || tab.text.includes('published')) {
          statusCounts.published = count;
          totalPosts += count;
        } else if (tab.text.includes('בהמתנה') || tab.text.includes('pending')) {
          statusCounts.pending = count;
          totalPosts += count;
        } else if (tab.text.includes('נדחו') || tab.text.includes('rejected')) {
          statusCounts.rejected = count;
          totalPosts += count;
        } else if (tab.text.includes('הוסרו') || tab.text.includes('removed')) {
          statusCounts.removed = count;
          totalPosts += count;
        }
      }
    });
    
    // הכנת דוח מפורט
    const result = {
      groupName: groupName,
      groupUrl: groupUrl,
      statusUrl: statusUrl,
      totalPosts: totalPosts,
      statusCounts: {
        published: statusCounts.published || 0,
        pending: statusCounts.pending || 0,
        rejected: statusCounts.rejected || 0,
        removed: statusCounts.removed || 0
      },
      checkedTabs: checkedTabs,
      latestPost: latestPost ? {
        status: latestPost.status,
        date: latestPostDate,
        text: latestPost.firstPost.text.substring(0, 200),
        confidence: latestPost.firstPost.dateConfidence
      } : null,
      scanTime: new Date().toISOString(),
      success: true
    };
    
    // דיווח על התוצאות
    writeDetailedLog(`📊 סיכום קבוצה ${groupName}:`, 'SUCCESS');
    writeDetailedLog(`   📄 סה"כ פוסטים: ${totalPosts}`, 'INFO');
    writeDetailedLog(`   ✅ מפורסמים: ${result.statusCounts.published}`, 'INFO');
    writeDetailedLog(`   ⏳ ממתינים: ${result.statusCounts.pending}`, 'INFO');
    writeDetailedLog(`   ❌ נדחו: ${result.statusCounts.rejected}`, 'INFO');
    writeDetailedLog(`   🗑️ הוסרו: ${result.statusCounts.removed}`, 'INFO');
    
    if (latestPost) {
      const statusEmojis = {
        'published': '✅',
        'pending': '⏳',
        'rejected': '❌',
        'removed': '🗑️'
      };
      const statusNames = {
        'published': 'מפורסם',
        'pending': 'ממתין לאישור',
        'rejected': 'נדחה',
        'removed': 'הוסר'
      };
      
      writeDetailedLog(`🏆 הפוסט האחרון (${latestPostDate.toLocaleDateString('he-IL')}): ${statusEmojis[latestPost.status]} ${statusNames[latestPost.status]}`, 'SUCCESS');
      writeDetailedLog(`   📝 תוכן: "${latestPost.firstPost.text.substring(0, 100)}..."`, 'INFO');
      writeDetailedLog(`   🎯 רמת ודאות: ${latestPost.firstPost.dateConfidence}%`, 'INFO');
    } else {
      writeDetailedLog(`❓ לא הצלחתי לקבוע מה הפוסט האחרון`, 'WARNING');
    }
    
    return result;
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה בבדיקת קבוצה ${groupName}: ${error.message}`, 'ERROR');
    
    return {
      groupName: groupName,
      groupUrl: groupUrl,
      success: false,
      error: error.message,
      scanTime: new Date().toISOString()
    };
  }
}

// פונקציה לשמירת התוצאות
function saveResults(results) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `groups-post-status-advanced-${timestamp.slice(0, 10)}.json`;
    
    const dataToSave = {
      scanDate: new Date().toISOString(),
      totalGroups: results.length,
      successfulScans: results.filter(r => r.success).length,
      failedScans: results.filter(r => !r.success).length,
      results: results
    };
    
    fs.writeFileSync(fileName, JSON.stringify(dataToSave, null, 2));
    writeDetailedLog(`נתונים נשמרו ב: ${fileName}`, 'SUCCESS');
    
    fs.writeFileSync('latest-groups-post-status-advanced.json', JSON.stringify(dataToSave, null, 2));
    writeDetailedLog(`נתונים נשמרו גם ב: latest-groups-post-status-advanced.json`, 'SUCCESS');
    
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
    writeDetailedLog('🚀 התחלת סקריפט בדיקת סטטוס פרסומים מתקדם בקבוצות פייסבוק', 'START');
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
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        writeDetailedLog(`❌ שגיאה בסריקת קבוצה ${group.name}: ${error.message}`, 'ERROR');
        errorCount++;
        
        results.push({
          groupName: group.name,
          groupUrl: group.url,
          success: false,
          error: error.message,
          scanTime: new Date().toISOString()
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
    
    // סיכום מפורט של הפוסטים האחרונים
    writeDetailedLog('\n🏆 סיכום הפוסטים האחרונים בכל קבוצה:', 'SUCCESS');
    results.forEach((result, index) => {
      if (result.success && result.latestPost) {
        const statusEmojis = {
          'published': '✅',
          'pending': '⏳',
          'rejected': '❌',
          'removed': '🗑️'
        };
        
        writeDetailedLog(`   ${index + 1}. ${result.groupName}: ${statusEmojis[result.latestPost.status]} ${result.latestPost.status} (${result.latestPost.date.toLocaleDateString('he-IL')})`, 'SUCCESS');
      } else if (result.success) {
        writeDetailedLog(`   ${index + 1}. ${result.groupName}: ❓ לא זוהה פוסט אחרון`, 'WARNING');
      } else {
        writeDetailedLog(`   ${index + 1}. ${result.groupName}: ❌ שגיאה בסריקה`, 'ERROR');
      }
    });
    
    const totalPosts = results.reduce((sum, r) => sum + (r.totalPosts || 0), 0);
    
    writeDetailedLog('\n📊 סיכום סופי:', 'SUCCESS');
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
