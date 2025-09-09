const puppeteer = require("puppeteer-core");
const os = require("os");
const config = require("../../config.json");
const fs = require("fs");
const path = require("path");

// פונקציה ליצירת לוג מפורט
function writeDetailedLog(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${type}] ${message}\n`;
  
  try {
    fs.appendFileSync('groups-post-status-scan.log', logMessage);
  } catch (e) {
    console.error('שגיאה בכתיבת לוג:', e.message);
  }
  
  // גם לקונסול
  console.log(`[${type}] ${message}`);
}

// פונקציה לשליפת הקבוצות שפורסמו אליהן היום
function getTodayPublishedGroups(targetDate = null) {
  const searchDate = targetDate || new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  writeDetailedLog(`מחפש קבוצות שפורסמו בתאריך: ${searchDate}...`, 'INFO');
  
  const todayGroups = [];
  
  try {
    writeDetailedLog(`🔍 התחלת חיפוש קבוצות לתאריך: ${searchDate}`, 'DEBUG');
    
    const instanceName = fs.readFileSync(path.join(__dirname, '../../instance-name.txt'), 'utf-8').trim();
    writeDetailedLog(`📋 שם instance: ${instanceName}`, 'DEBUG');
    
    // חיפוש בקובץ הלוג הראשי
    const logPath = path.join(__dirname, '../../log.txt');
    writeDetailedLog(`📂 בודק אם קיים קובץ לוג: ${logPath}`, 'DEBUG');
    
    if (fs.existsSync(logPath)) {
      writeDetailedLog('✅ קובץ לוג קיים - קורא תוכן...', 'INFO');
      const logContent = fs.readFileSync(logPath, 'utf8');
      const logLines = logContent.split('\n');
      writeDetailedLog(`📄 קובץ הלוג מכיל ${logLines.length} שורות`, 'DEBUG');
      
      let processedLines = 0;
      let matchingLines = 0;
      
      logLines.forEach((line, index) => {
        processedLines++;
        
        // לוג כל 100 שורות
        if (processedLines % 100 === 0) {
          writeDetailedLog(`🔄 עובד שורה ${processedLines}/${logLines.length}`, 'DEBUG');
        }
        
        // חיפוש שורות של פרסום לקבוצות
        if (line.includes('posting to group')) {
          writeDetailedLog(`🎯 נמצאה שורת פרסום בשורה ${index + 1}: ${line.substring(0, 100)}...`, 'DEBUG');
          
          if (line.includes(searchDate)) {
            matchingLines++;
            writeDetailedLog(`✅ שורה מתאימה לתאריך ${searchDate}: ${line.trim()}`, 'DEBUG');
            
            const urlMatch = line.match(/https:\/\/www\.facebook\.com\/groups\/([^\/\s\?]+)/);
            if (urlMatch) {
              const groupUrl = urlMatch[0];
              const groupId = urlMatch[1];
              
              todayGroups.push({
                name: `קבוצה ${groupId}`,
                url: groupUrl,
                postFile: 'log-entry',
                postTitle: 'פרסום מהלוג',
                logLine: line.trim()
              });
              
              writeDetailedLog(`✅ נמצאה קבוצה בלוג: ${groupUrl}`, 'INFO');
            } else {
              writeDetailedLog(`⚠️ לא נמצא URL בשורה: ${line.trim()}`, 'WARNING');
            }
          } else {
            writeDetailedLog(`❌ שורה לא מתאימה לתאריך ${searchDate} (מכילה posting to group אבל תאריך שונה)`, 'DEBUG');
          }
        }
      });
      
      writeDetailedLog(`📊 סיכום סריקת לוג: ${processedLines} שורות נסרקו, ${matchingLines} שורות תואמות תאריך`, 'INFO');
      writeDetailedLog(`📊 נמצאו ${todayGroups.length} קבוצות כולל כפילויות`, 'INFO');
    } else {
      writeDetailedLog(`❌ קובץ לוג לא קיים בנתיב: ${logPath}`, 'ERROR');
    }
    
    // הסרת כפילויות
    writeDetailedLog(`🔄 מסיר כפילויות מ-${todayGroups.length} קבוצות...`, 'DEBUG');
    const uniqueGroups = [];
    const seenUrls = new Set();
    
    todayGroups.forEach((group, index) => {
      writeDetailedLog(`🔍 בודק קבוצה ${index + 1}: ${group.url}`, 'DEBUG');
      
      if (!seenUrls.has(group.url)) {
        seenUrls.add(group.url);
        uniqueGroups.push(group);
        writeDetailedLog(`✅ קבוצה חדשה נוספה: ${group.url}`, 'DEBUG');
      } else {
        writeDetailedLog(`⚠️ קבוצה כפולה דולגה: ${group.url}`, 'DEBUG');
      }
    });
    
    writeDetailedLog(`✅ אחרי הסרת כפילויות: ${uniqueGroups.length} קבוצות ייחודיות`, 'SUCCESS');
    writeDetailedLog(`📋 רשימת קבוצות סופית:`, 'INFO');
    uniqueGroups.forEach((group, index) => {
      writeDetailedLog(`   ${index + 1}. ${group.name} - ${group.url}`, 'INFO');
    });
    
    return uniqueGroups;
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה קריטית בחיפוש קבוצות: ${error.message}`, 'ERROR');
    writeDetailedLog(`🔧 Stack trace: ${error.stack}`, 'ERROR');
    return [];
  }
}

// פונקציה לבדיקת סטטוס פרסום בקבוצה
async function checkPostStatusInGroup(page, groupUrl, groupName) {
  writeDetailedLog(`🔍 מתחיל בדיקת סטטוס בקבוצה: ${groupName}`, 'INFO');
  writeDetailedLog(`🔗 URL קבוצה: ${groupUrl}`, 'DEBUG');
  
  try {
    writeDetailedLog(`🎯 מכין בדיקת סטטוס פרסום בקבוצה: ${groupName}`, 'INFO');
    
    // בניית URL עם my_posted_content
    const statusUrl = groupUrl.endsWith('/') 
      ? groupUrl + 'my_posted_content' 
      : groupUrl + '/my_posted_content';
    
    writeDetailedLog(`🌐 נכנס לכתובת: ${statusUrl}`, 'DEBUG');
    
    // מעבר לעמוד הקבוצה
    writeDetailedLog('⏳ טוען דף הקבוצה...', 'DEBUG');
    await page.goto(statusUrl, {
      waitUntil: "networkidle2", 
      timeout: 30000
    });
    writeDetailedLog('✅ דף נטען בהצלחה', 'SUCCESS');
    
    // המתנה לטעינת העמוד
    writeDetailedLog('⏳ ממתין 3 שניות לטעינת תוכן...', 'DEBUG');
    await new Promise(res => setTimeout(res, 3000));
    
    // גלילה קצרה כדי לטעון יותר תוכן
    writeDetailedLog('📜 מבצע גלילה לטעינת תוכן נוסף...', 'DEBUG');
    await page.evaluate(() => {
      window.scrollTo(0, window.innerHeight);
    });
    await new Promise(res => setTimeout(res, 2000));
    writeDetailedLog('✅ גלילה הושלמה', 'SUCCESS');
    
    // חיפוש אחר פוסטים מהיום
    writeDetailedLog('🔍 מתחיל חיפוש פוסטים בדף...', 'INFO');
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    
    writeDetailedLog(`📅 מחפש פוסטים מתאריכים: ${today}, ${yesterday}`, 'DEBUG');
    
    const statuses = await page.evaluate((todayDate, yesterdayDate) => {
      console.log('🔍 מתחיל JavaScript evaluation בדף');
      console.log(`📅 מחפש פוסטים מתאריכים: ${todayDate}, ${yesterdayDate}`);
      
      const results = [];
      
      // מחפש סלקטורים נוספים לפוסטים
      const postSelectors = [
        '[data-pagelet*="FeedUnit"]',
        '[role="article"]',
        '.userContentWrapper',
        '[data-testid="story-subtitle"]',
        '.story_body_container',
        '.fbUserContent',
        '.fbPhotoSnowbox'
      ];
      
      console.log(`🎯 בודק ${postSelectors.length} סלקטורים לפוסטים`);
      
      let posts = [];
      postSelectors.forEach((selector, index) => {
        console.log(`🔍 בודק selector ${index + 1}: ${selector}`);
        const foundPosts = document.querySelectorAll(selector);
        console.log(`   נמצאו ${foundPosts.length} אלמנטים`);
        
        foundPosts.forEach(post => {
          if (!posts.includes(post)) {
            posts.push(post);
          }
        });
      });
      
      console.log(`📊 סה"כ נמצאו ${posts.length} פוסטים אפשריים`);
      
      // אם לא נמצאו פוסטים, חפש באזורים כלליים יותר
      if (posts.length === 0) {
        console.log('⚠️ לא נמצאו פוסטים בסלקטורים רגילים - מחפש באזורים כלליים');
        posts = Array.from(document.querySelectorAll('div')).filter(div => {
          const text = div.textContent || '';
          return text.includes('פורסם') || text.includes('posted') || 
                 text.includes('בהמתנה') || text.includes('pending') ||
                 text.includes('נדחה') || text.includes('declined');
        });
        console.log(`📊 נמצאו ${posts.length} פוסטים באזורים כלליים`);
      }
      
      posts.forEach((post, index) => {
        console.log(`\n📋 מעבד פוסט ${index + 1}/${posts.length}`);
        
        try {
          const postText = post.textContent || '';
          console.log(`📄 טקסט פוסט (100 תווים ראשונים): ${postText.substring(0, 100)}...`);
          
          // חיפוש תאריך בפוסט - גישה מרחיבה יותר
          console.log(`🕒 מחפש תאריך בפוסט ${index + 1}`);
          let postDate = null;
          
          // חיפוש אלמנטי זמן
          const timeElements = post.querySelectorAll(
            'a[role="link"] time, .timestampContent, [data-testid="story-subtitle"] a, .timestamp, ' +
            '[data-utime], [data-testid="story-subtitle"], .story_body_container time, ' +
            'abbr[data-utime], span[data-utime]'
          );
          
          console.log(`   נמצאו ${timeElements.length} אלמנטי זמן`);
          
          timeElements.forEach((timeEl, timeIndex) => {
            const dateStr = timeEl.getAttribute('datetime') || 
                           timeEl.getAttribute('title') || 
                           timeEl.getAttribute('data-utime') ||
                           timeEl.textContent;
            
            console.log(`   אלמנט זמן ${timeIndex + 1}: ${dateStr}`);
            
            if (dateStr) {
              // בדיקת תאריך היום או אתמול
              if (dateStr.includes(todayDate) || postText.includes(todayDate)) {
                postDate = todayDate;
                console.log(`   ✅ זוהה תאריך היום: ${todayDate}`);
              } else if (dateStr.includes(yesterdayDate) || postText.includes(yesterdayDate)) {
                postDate = yesterdayDate;
                console.log(`   ✅ זוהה תאריך אתמול: ${yesterdayDate}`);
              } else if (dateStr.includes('היום') || dateStr.includes('today')) {
                postDate = todayDate;
                console.log(`   ✅ זוהה מילה "היום"`);
              } else if (dateStr.includes('אתמול') || dateStr.includes('yesterday')) {
                postDate = yesterdayDate;
                console.log(`   ✅ זוהה מילה "אתמול"`);
              }
            }
          });
          
          // אם לא נמצא תאריך באלמנטים, חפש בטקסט
          if (!postDate) {
            console.log(`   🔍 מחפש דפוסי זמן בטקסט של פוסט ${index + 1}`);
            const timePatterns = [
              /(\d{1,2}:\d{2})/,  // זמן בפורמט שעה:דקה
              /(לפני \d+ שעות?)/, // "לפני X שעות"
              /(לפני כמה שעות)/, // "לפני כמה שעות"
              /(הרגע|זה עתה)/, // "הרגע", "זה עתה"
            ];
            
            for (const pattern of timePatterns) {
              if (pattern.test(postText)) {
                postDate = todayDate; // אם יש זמן מהיום, זה כנראה מהיום
                console.log(`   ✅ זוהה דפוס זמן: ${pattern}`);
                break;
              }
            }
          }
          
          // בדיקה אם זה פוסט מהיום או אתמול
          if (postDate === todayDate || postDate === yesterdayDate) {
            console.log(`✅ פוסט ${index + 1} רלוונטי לתאריכים - מזהה סטטוס...`);
            
            // זיהוי סטטוס מתקדם יותר
            let status = 'לא ידוע';
            console.log(`🔍 מזהה סטטוס עבור פוסט ${index + 1}`);
            const lowerText = postText.toLowerCase();
            console.log(`   🔍 טקסט להמרה לאותיות קטנות (100 תווים): ${lowerText.substring(0, 100)}...`);
            
            // בדיקות סטטוס מפורטות יותר
            if (lowerText.includes('הפוסט שלך בהמתנה') || 
                lowerText.includes('pending review') ||
                lowerText.includes('ממתין לאישור') ||
                lowerText.includes('awaiting approval') ||
                post.querySelector('[data-testid*="pending"]')) {
              status = 'בהמתנה לאישור';
              console.log(`   ✅ זוהה סטטוס: ${status}`);
            } else if (lowerText.includes('הפוסט שלך נדחה') || 
                      lowerText.includes('declined') || 
                      lowerText.includes('rejected') ||
                      lowerText.includes('לא אושר') ||
                      post.querySelector('[data-testid*="declined"]')) {
              status = 'נדחה';
              console.log(`   ✅ זוהה סטטוס: ${status}`);
            } else if (lowerText.includes('הפוסט הוסר') || 
                      lowerText.includes('removed') ||
                      lowerText.includes('נמחק') ||
                      post.querySelector('[data-testid*="removed"]')) {
              status = 'הוסר';
              console.log(`   ✅ זוהה סטטוס: ${status}`);
            } else if (post.querySelector('[data-testid="post_timestamp"]') || 
                      post.querySelector('.timestamp') ||
                      post.querySelector('[data-utime]') ||
                      lowerText.includes('פורסם') ||
                      lowerText.includes('published')) {
              status = 'פורסם בהצלחה';
              console.log(`   ✅ זוהה סטטוס: ${status}`);
            } else if (lowerText.includes('שגיאה') || lowerText.includes('error')) {
              status = 'שגיאה בפרסום';
              console.log(`   ✅ זוהה סטטוס: ${status}`);
            } else {
              console.log(`   ⚠️ לא זוהה סטטוס ברור - נשאר: ${status}`);
            }
            
            // שליפת תוכן הפוסט מכמה מקורות אפשריים
            console.log(`   📄 מחפש תוכן פוסט...`);
            let content = 'לא נמצא תוכן';
            const contentSelectors = [
              '[data-testid="post_message"]', 
              '.userContent', 
              '.text_exposed_root',
              '.story_body_container',
              '.fbUserContent',
              '.text_exposed_show'
            ];
            
            console.log(`   🎯 בודק ${contentSelectors.length} סלקטורים לתוכן`);
            for (const selector of contentSelectors) {
              const contentEl = post.querySelector(selector);
              if (contentEl && contentEl.textContent.trim()) {
                content = contentEl.textContent.trim().substring(0, 150) + '...';
                console.log(`   ✅ נמצא תוכן עם selector: ${selector}`);
                break;
              }
            }
            
            // אם עדיין לא נמצא תוכן, קח מהטקסט הכללי
            if (content === 'לא נמצא תוכן' && postText.length > 50) {
              console.log(`   🔍 מנסה למצוא תוכן מהטקסט הכללי`);
              // נסה למצוא תוכן שנראה כמו פוסט (לא כמו UI elements)
              const lines = postText.split('\n').filter(line => 
                line.length > 10 && 
                !line.includes('לייק') && 
                !line.includes('תגובה') && 
                !line.includes('שתף')
              );
              if (lines.length > 0) {
                content = lines[0].substring(0, 150) + '...';
                console.log(`   ✅ נמצא תוכן מטקסט כללי: ${content.substring(0, 50)}...`);
              }
            }
            
            console.log(`✅ הוספת פוסט ${index + 1} לתוצאות:`, {
              status: status,
              content: content.substring(0, 50) + '...',
              date: postDate
            });
            
            results.push({
              status: status,
              content: content,
              date: postDate,
              index: index,
              rawText: postText.substring(0, 200) // לדיבוג
            });
          } else {
            console.log(`❌ פוסט ${index + 1} לא רלוונטי לתאריכים (תאריך: ${postDate})`);
          }
        } catch (e) {
          console.log(`❌ שגיאה בעיבוד פוסט ${index + 1}:`, e.message);
        }
      });
      
      console.log(`📊 סיכום: נמצאו ${results.length} פוסטים רלוונטיים מתוך ${posts.length} פוסטים שנבדקו`);
      return results;
    }, today, yesterday);
    
    writeDetailedLog(`📊 תוצאות JavaScript evaluation: נמצאו ${statuses.length} פוסטים רלוונטיים בקבוצה ${groupName}`, 'INFO');
    
    // הדפסת תוצאות מפורטות
    if (statuses.length > 0) {
      writeDetailedLog('📋 פירוט פוסטים שנמצאו:', 'INFO');
      statuses.forEach((post, index) => {
        writeDetailedLog(`   ${index + 1}. סטטוס: ${post.status} | תאריך: ${post.date} | תוכן: ${post.content.substring(0, 50)}...`, 'INFO');
      });
    } else {
      writeDetailedLog('⚠️ לא נמצאו פוסטים רלוונטיים בקבוצה זו', 'WARNING');
    }
    
    writeDetailedLog(`✅ סיימתי בדיקת קבוצה ${groupName} בהצלחה`, 'SUCCESS');
    
    return {
      groupName: groupName,
      groupUrl: groupUrl,
      statusUrl: statusUrl,
      posts: statuses,
      scanTime: new Date().toISOString(),
      success: true
    };
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה קריטית בבדיקת סטטוס בקבוצה ${groupName}: ${error.message}`, 'ERROR');
    writeDetailedLog(`🔧 Stack trace: ${error.stack}`, 'ERROR');
    
    const errorStatusUrl = groupUrl.endsWith('/') 
      ? groupUrl + 'my_posted_content' 
      : groupUrl + '/my_posted_content';
      
    writeDetailedLog(`⚠️ מחזיר תוצאה ריקה עבור קבוצה ${groupName}`, 'WARNING');
    
    return {
      groupName: groupName,
      groupUrl: groupUrl,
      statusUrl: errorStatusUrl,
      posts: [],
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
    
    // שמירה מקומית
    fs.writeFileSync(fileName, JSON.stringify(dataToSave, null, 2));
    writeDetailedLog(`נתונים נשמרו ב: ${fileName}`, 'SUCCESS');
    
    // שמירה נוספת בשם קבוע לקריאה קלה
    fs.writeFileSync('latest-groups-post-status.json', JSON.stringify(dataToSave, null, 2));
    writeDetailedLog('נתונים נשמרו גם ב: latest-groups-post-status.json', 'SUCCESS');
    
    // יצירת דוח מסכם
    const summary = {
      scanDate: dataToSave.scanDate,
      totalGroups: dataToSave.totalGroups,
      summary: {
        published: 0,
        pending: 0,
        rejected: 0,
        removed: 0,
        unknown: 0
      }
    };
    
    results.forEach(group => {
      group.posts.forEach(post => {
        if (post.status.includes('בהצלחה') || post.status.includes('published')) {
          summary.summary.published++;
        } else if (post.status.includes('בהמתנה') || post.status.includes('pending')) {
          summary.summary.pending++;
        } else if (post.status.includes('נדחה') || post.status.includes('rejected') || post.status.includes('declined')) {
          summary.summary.rejected++;
        } else if (post.status.includes('הוסר') || post.status.includes('removed')) {
          summary.summary.removed++;
        } else {
          summary.summary.unknown++;
        }
      });
    });
    
    fs.writeFileSync('groups-post-status-summary.json', JSON.stringify(summary, null, 2));
    writeDetailedLog('דוח מסכם נשמר ב: groups-post-status-summary.json', 'SUCCESS');
    
    return fileName;
    
  } catch (error) {
    writeDetailedLog(`שגיאה בשמירת תוצאות: ${error.message}`, 'ERROR');
    return null;
  }
}

// פונקציה לשליחת התוצאות לשרת
async function uploadResults(data) {
  try {
    writeDetailedLog('מתחיל שליחת נתונים לשרת...', 'INFO');
    
    const instanceName = fs.readFileSync(path.join(__dirname, '../../instance-name.txt'), 'utf-8').trim();
    
    const uploadData = {
      instance: instanceName,
      scanType: 'groups-post-status',
      data: data
    };
    
    const fetch = require('node-fetch');
    const response = await fetch('https://postify.co.il/wp-content/postify-api/save-groups-status.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadData)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    writeDetailedLog(`נתונים נשלחו בהצלחה לשרת: ${result.message || 'OK'}`, 'SUCCESS');
    return true;
    
  } catch (error) {
    writeDetailedLog(`שגיאה בשליחת נתונים לשרת: ${error.message}`, 'ERROR');
    return false;
  }
}

// פונקציה ראשית
(async () => {
  writeDetailedLog('🚀 התחלת סקריפט בדיקת סטטוס פרסומים בקבוצות פייסבוק', 'START');
  writeDetailedLog(`⏰ זמן התחלה: ${new Date().toLocaleString('he-IL')}`, 'INFO');
  writeDetailedLog(`📂 תיקיית עבודה: ${__dirname}`, 'DEBUG');
  
  // עיבוד פרמטרי command line
  writeDetailedLog('📋 מעבד פרמטרים מהטרמינל...', 'INFO');
  const args = process.argv.slice(2);
  let targetDate = null;
  let specificGroupUrl = null;
  
  writeDetailedLog(`📋 ארגומנטים שהתקבלו: ${JSON.stringify(args)}`, 'DEBUG');
  
  args.forEach((arg, index) => {
    writeDetailedLog(`📋 מעבד ארגומנט ${index + 1}: ${arg}`, 'DEBUG');
    
    if (arg.startsWith('--date=')) {
      targetDate = arg.split('=')[1];
      writeDetailedLog(`📅 פרמטר תאריך זוהה: ${targetDate}`, 'INFO');
    } else if (arg.startsWith('--group=')) {
      specificGroupUrl = arg.split('=')[1];
      writeDetailedLog(`🎯 פרמטר קבוצה ספציפית זוהה: ${specificGroupUrl}`, 'INFO');
    } else {
      writeDetailedLog(`⚠️ ארגומנט לא מזוהה: ${arg}`, 'WARNING');
    }
  });
  
  // הגדרת תאריך סריקה סופי
  const searchDate = targetDate || new Date().toISOString().slice(0, 10);
  writeDetailedLog(`🎯 תאריך סריקה סופי: ${searchDate}`, 'INFO');
  
  try {
    let todayGroups = [];
    
    if (specificGroupUrl) {
      // סריקת קבוצה ספציפית
      writeDetailedLog('🎯 מצב סריקה: קבוצה ספציפית', 'INFO');
      todayGroups = [{
        name: 'קבוצה ספציפית',
        url: specificGroupUrl,
        postFile: 'manual',
        postTitle: 'בדיקה ידנית'
      }];
      writeDetailedLog(`🔗 מבצע סריקה לקבוצה ספציפית: ${specificGroupUrl}`, 'INFO');
    } else {
      // שלב 1: חיפוש קבוצות שפורסמו בתאריך המבוקש
      writeDetailedLog('🔍 מצב סריקה: חיפוש קבוצות מהלוגים', 'INFO');
      writeDetailedLog(`🔍 מחפש קבוצות שפורסמו בתאריך: ${searchDate}`, 'INFO');
      todayGroups = getTodayPublishedGroups(targetDate);
    }
    
    writeDetailedLog(`📊 תוצאות חיפוש: נמצאו ${todayGroups.length} קבוצות`, 'INFO');
    
    if (todayGroups.length === 0) {
      const dateMsg = targetDate ? `בתאריך ${targetDate}` : 'היום';
      writeDetailedLog(`⚠️ לא נמצאו קבוצות שפורסמו אליהן ${dateMsg}`, 'WARNING');
      writeDetailedLog('💡 הצעות לפתרון:', 'INFO');
      writeDetailedLog('   1. בדוק שהתאריך נכון (פורמט: YYYY-MM-DD)', 'INFO');
      writeDetailedLog('   2. בדוק שקיים קובץ log.txt עם נתוני פרסומים', 'INFO');
      writeDetailedLog('   3. נסה תאריך אחר עם --date=YYYY-MM-DD', 'INFO');
      writeDetailedLog('   4. דוגמה: node scan-groups-post-status.js --date=2025-06-06', 'INFO');
      writeDetailedLog('   5. לסריקת קבוצה ספציפית: --group=URL', 'INFO');
      
      writeDetailedLog('🔚 יציאה מהתוכנית - אין קבוצות לסרוק', 'END');
      process.exit(0);
    }
    
    writeDetailedLog('📋 רשימת קבוצות לסריקה:', 'INFO');
    todayGroups.forEach((group, index) => {
      writeDetailedLog(`   ${index + 1}. ${group.name} - ${group.url}`, 'INFO');
    });
    
    // שלב 2: הגדרת דפדפן
    writeDetailedLog('🌐 מתחיל הגדרת דפדפן...', 'INFO');
    
    try {
      const userDataDir = config.userDataDir.replace("user", os.userInfo().username);
      writeDetailedLog(`📁 תיקיית נתוני משתמש: ${userDataDir}`, 'DEBUG');
      writeDetailedLog(`🚀 נתיב Chrome: ${config.chromePath}`, 'DEBUG');
      
      writeDetailedLog('🔧 מפעיל דפדפן עם ההגדרות...', 'DEBUG');
      const browser = await puppeteer.launch({
        headless: false,
        executablePath: config.chromePath,
        userDataDir: userDataDir,
        devtools: true, // פותח F12 אוטומטית
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--start-maximized", // מתחיל במסך מלא
          "--disable-web-security",
          "--profile-directory=Default"
        ]
      });
      
      writeDetailedLog('✅ דפדפן נפתח בהצלחה', 'SUCCESS');
      
      writeDetailedLog('🔧 מגדיר עמוד דפדפן...', 'DEBUG');
      const pages = await browser.pages();
      const page = pages.length > 0 ? pages[0] : await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      writeDetailedLog('✅ עמוד דפדפן הוגדר בהצלחה', 'SUCCESS');
      
      // שלב 3: סריקת כל הקבוצות
      writeDetailedLog(`🎯 מתחיל לסרוק ${todayGroups.length} קבוצות...`, 'INFO');
      const results = [];
      let successCount = 0;
      let errorCount = 0;
      
      for (let i = 0; i < todayGroups.length; i++) {
        const group = todayGroups[i];
        writeDetailedLog(`\n📋 קבוצה ${i + 1}/${todayGroups.length}: ${group.name}`, 'INFO');
        writeDetailedLog(`🔗 URL: ${group.url}`, 'DEBUG');
        
        try {
          const result = await checkPostStatusInGroup(page, group.url, group.name);
          result.postFile = group.postFile;
          result.postTitle = group.postTitle;
          
          results.push(result);
          
          if (result.success) {
            successCount++;
            writeDetailedLog(`✅ סריקה הצליחה - נמצאו ${result.posts.length} פוסטים`, 'SUCCESS');
          } else {
            errorCount++;
            writeDetailedLog(`⚠️ סריקה נכשלה: ${result.error}`, 'WARNING');
          }
          
          // המתנה בין קבוצות
          if (i < todayGroups.length - 1) {
            writeDetailedLog('⏳ ממתין 2 שניות לפני המעבר לקבוצה הבאה...', 'DEBUG');
            await new Promise(res => setTimeout(res, 2000));
          }
          
        } catch (groupError) {
          writeDetailedLog(`❌ שגיאה בסריקת קבוצה ${group.name}: ${groupError.message}`, 'ERROR');
          errorCount++;
        }
      }
      
      writeDetailedLog(`\n📊 סיכום סריקה:`, 'INFO');
      writeDetailedLog(`   ✅ הצליחו: ${successCount}`, 'SUCCESS');
      writeDetailedLog(`   ❌ נכשלו: ${errorCount}`, 'ERROR');
      writeDetailedLog(`   📋 סה"כ: ${todayGroups.length}`, 'INFO');
      
      // שלב 4: שמירת תוצאות
      writeDetailedLog('💾 שומר תוצאות...', 'INFO');
      const savedFile = saveResults(results);
      
      if (savedFile) {
        writeDetailedLog(`✅ סריקה הושלמה בהצלחה! תוצאות נשמרו ב: ${savedFile}`, 'SUCCESS');
        
        // שליחת נתונים לשרת
        writeDetailedLog('📤 מתחיל שליחת נתונים לשרת...', 'INFO');
        const dataToUpload = {
          scanDate: new Date().toISOString(),
          totalGroups: results.length,
          successfulScans: results.filter(r => r.success).length,
          failedScans: results.filter(r => !r.success).length,
          results: results
        };
        
        try {
          await uploadResults(dataToUpload);
          writeDetailedLog('✅ נתונים נשלחו לשרת בהצלחה', 'SUCCESS');
        } catch (uploadError) {
          writeDetailedLog(`⚠️ שגיאה בשליחה לשרת: ${uploadError.message}`, 'WARNING');
        }
      } else {
        writeDetailedLog('❌ שגיאה בשמירת תוצאות', 'ERROR');
      }
      
      // שלב 5: הצגת סיכום מפורט
      writeDetailedLog('📈 מכין סיכום מפורט...', 'INFO');
      const successfulScans = results.filter(r => r.success).length;
      const totalPosts = results.reduce((sum, r) => sum + r.posts.length, 0);
      
      writeDetailedLog(`📊 סיכום סופי:`, 'SUCCESS');
      writeDetailedLog(`   🎯 קבוצות נסרקו בהצלחה: ${successfulScans}/${results.length}`, 'SUCCESS');
      writeDetailedLog(`   📄 סה"כ פוסטים נמצאו: ${totalPosts}`, 'SUCCESS');
      writeDetailedLog(`   ⏰ זמן סיום: ${new Date().toLocaleString('he-IL')}`, 'SUCCESS');
      
      // סגירת דפדפן
      writeDetailedLog('🔐 סוגר דפדפן...', 'INFO');
      await browser.close();
      writeDetailedLog('✅ דפדפן נסגר בהצלחה', 'SUCCESS');
      
      writeDetailedLog('🎉 התוכנית הסתיימה בהצלחה!', 'END');
      
    } catch (browserError) {
      writeDetailedLog(`❌ שגיאה בהגדרת/הפעלת דפדפן: ${browserError.message}`, 'ERROR');
      writeDetailedLog('🔚 התוכנית הסתיימה עקב שגיאת דפדפן', 'END');
      process.exit(1);
    }
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה קריטית בתוכנית: ${error.message}`, 'CRITICAL');
    writeDetailedLog(`🔧 Stack trace: ${error.stack}`, 'CRITICAL');
    
    if (typeof browser !== 'undefined' && browser) {
      try {
        await browser.close();
        writeDetailedLog('✅ דפדפן נסגר אחרי שגיאה', 'INFO');
      } catch (closeError) {
        writeDetailedLog(`❌ שגיאה גם בסגירת דפדפן: ${closeError.message}`, 'ERROR');
      }
    }
    
    writeDetailedLog('🔚 התוכנית הסתיימה עקב שגיאה קריטית', 'END');
    process.exit(1);
  }
})();
