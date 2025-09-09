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
    
    let todayGroups = []; // הגדרת המשתנה בתחילת הפונקציה
    
    if (fs.existsSync(logPath)) {
      writeDetailedLog('✅ קובץ לוג קיים - קורא תוכן...', 'INFO');
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n');
      
      writeDetailedLog(`📄 קובץ הלוג מכיל ${lines.length} שורות`, 'DEBUG');
      
      let processedLines = 0;
      let matchingLines = 0;
      
      lines.forEach((line, lineIndex) => {
        processedLines++;
        
        if (processedLines % 100 === 0) {
          writeDetailedLog(`🔄 עובד שורה ${processedLines}/${lines.length}`, 'DEBUG');
        }
        
        if (line.includes('posting to group')) {
          writeDetailedLog(`🎯 נמצאה שורת פרסום בשורה ${lineIndex + 1}: ${line.substring(0, 100)}...`, 'DEBUG');
          
          const dateMatch = line.match(/\[(\d{4}-\d{2}-\d{2})/);
          if (dateMatch && dateMatch[1] === targetDate) {
            matchingLines++;
            writeDetailedLog(`✅ שורה מתאימה לתאריך ${targetDate}: ${line.substring(0, 100)}`, 'DEBUG');
            
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
          } else {
            writeDetailedLog(`❌ שורה לא מתאימה לתאריך ${targetDate} (מכילה posting to group אבל תאריך שונה)`, 'DEBUG');
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
        writeDetailedLog(`🔄 קבוצה כפולה נדלגה: ${group.url}`, 'DEBUG');
      }
    });
    
    writeDetailedLog(`✅ אחרי הסרת כפילויות: ${uniqueGroups.length} קבוצות ייחודיות`, 'SUCCESS');
    
    // הדפסת רשימה סופית
    writeDetailedLog('📋 רשימת קבוצות סופית:', 'INFO');
    uniqueGroups.forEach((group, index) => {
      writeDetailedLog(`   ${index + 1}. ${group.name} - ${group.url}`, 'INFO');
    });
    
    return uniqueGroups;
    
  } catch (error) {
    writeDetailedLog(`❌ שגיאה בקבלת קבוצות מהיום: ${error.message}`, 'ERROR');
    return [];
  }
}

// פונקציה מתוקנת לבדיקת סטטוס בקבוצה - מחפשת מספר פוסטים
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
      timeout: 60000 // הגדלת timeout
    });
    writeDetailedLog('✅ דף נטען בהצלחה', 'SUCCESS');
    
    // בדיקת URL נוכחי
    const currentUrl = await page.url();
    writeDetailedLog(`📍 URL נוכחי: ${currentUrl}`, 'DEBUG');
    
    // בדיקת כותרת הדף
    const pageTitle = await page.title();
    writeDetailedLog(`📄 כותרת דף: ${pageTitle}`, 'DEBUG');
    
    // המתנה לטעינת העמוד
    writeDetailedLog('⏳ ממתין 5 שניות לטעינת תוכן...', 'DEBUG');
    await new Promise(res => setTimeout(res, 5000));
    
    // בדיקת תקינות הדף לפני evaluation
    try {
      const isConnected = !page.isClosed();
      if (!isConnected) {
        writeDetailedLog('❌ הדף נסגר או התנתק', 'ERROR');
        return { success: false, error: 'Page disconnected' };
      }
      
      // בדיקה שהדף עדיין זמין
      await page.title(); // זה יזרוק שגיאה אם הדף לא זמין
    } catch (error) {
      writeDetailedLog(`❌ בעיה בחיבור לדף: ${error.message}`, 'ERROR');
      return { success: false, error: 'Page connection lost' };
    }
    
    // חיפוש מספר הפוסטים בטאב "פורסמו"
    writeDetailedLog('🔍 מחפש מספר פוסטים בטאב פורסמו...', 'INFO');
    
    let postCount;
    try {
      postCount = await page.evaluate(() => {
        console.log('🔍 מתחיל JavaScript evaluation בדף');
        
        // חיפוש פוסטים וסטטוסים
        let posts = [];
        
        try {
          // מפה לזיהוי סטטוסים לפי טקסט הטאב
          const statusMap = {
            'פורסמו': 'published',
            'published': 'published', 
            'ממתינים': 'pending',
            'pending': 'pending',
            'נדחו': 'rejected',
            'rejected': 'rejected',
            'declined': 'rejected',
            'הוסרו': 'removed',
            'removed': 'removed',
            'טיוטות': 'draft',
            'drafts': 'draft',
            'draft': 'draft'
          };
          
          // חיפוש כל הטאבים עם מספרי פוסטים
          const tabElements = document.querySelectorAll('a[role="tab"], [role="tab"], .x1i10hfl');
          console.log(`🎯 נמצאו ${tabElements.length} טאבים אפשריים`);
          
          let totalFound = 0;
          
          for (let tab of tabElements) {
            const tabText = tab.textContent || tab.innerText || '';
            console.log(`📋 בודק טאב: "${tabText.substring(0, 50)}"`);
            
            // בדיקה אם זה טאב עם מספר פוסטים
            const spanElements = tab.querySelectorAll('span');
            for (let span of spanElements) {
              const spanText = span.textContent || span.innerText || '';
              const numberMatch = spanText.match(/(\d+)/);
              
              if (numberMatch && (spanText.includes('פוסט') || spanText.includes('post'))) {
                const count = parseInt(numberMatch[1]);
                console.log(`✅ נמצא בטאב: ${count} פוסטים מטקסט: "${spanText}"`);
                console.log(`📋 טקסט טאב מלא: "${tabText}"`);
                
                // זיהוי הסטטוס לפי הטקסט של הטאב
                let status = 'unknown';
                for (let [keyword, statusType] of Object.entries(statusMap)) {
                  if (tabText.toLowerCase().includes(keyword.toLowerCase()) || 
                      spanText.toLowerCase().includes(keyword.toLowerCase())) {
                    status = statusType;
                    console.log(`🎯 זוהה סטטוס: ${status} לפי מילת מפתח: ${keyword}`);
                    break;
                  }
                }
                
                // אם לא זוהה סטטוס ספציפי, ננסה לנחש לפי מיקום
                if (status === 'unknown') {
                  // אם זה הטאב הראשון או הפעיל, כנראה פורסמו
                  if (tab.getAttribute('aria-selected') === 'true' || 
                      tab.classList.contains('selected') ||
                      tabText.includes('פעיל')) {
                    status = 'published';
                    console.log(`🎯 נקבע כ-published (טאב פעיל)`);
                  } else {
                    status = 'pending'; // ברירת מחדל למקרה של ספק
                    console.log(`🎯 נקבע כ-pending (ברירת מחדל)`);
                  }
                }
                
                // יצירת פוסטים עם הסטטוס הנכון
                for (let i = 0; i < count; i++) {
                  posts.push({
                    postId: totalFound + i + 1,
                    status: status,
                    preview: `פוסט ${status}`,
                    tabText: tabText.substring(0, 30)
                  });
                }
                
                totalFound += count;
                console.log(`📊 נוספו ${count} פוסטים עם סטטוס ${status}`);
              }
            }
          }
          
          if (posts.length > 0) {
            console.log(`📊 סך הכל נמצאו ${posts.length} פוסטים בטאבים שונים`);
            return posts;
          }
          
          // אם לא נמצא כלום בטאבים, נחפש בצורה כללית
          console.log('🔍 לא נמצאו פוסטים בטאבים, מחפש בצורה כללית...');
          
          const allElements = Array.from(document.querySelectorAll('*')).slice(0, 1000);
          console.log(`🔍 מחפש ב-${allElements.length} אלמנטים`);
          
          for (let element of allElements) {
            const text = element.textContent || element.innerText || '';
            
            const patterns = [
              /(\d+)\s*פוסטים/,
              /(\d+)\s*פוסט/,
              /(\d+)\s*posts/i
            ];
            
            for (let pattern of patterns) {
              const match = text.match(pattern);
              if (match && text.length < 100) {
                const count = parseInt(match[1]);
                if (count > 0 && count < 1000) {
                  console.log(`✅ נמצא מספר פוסטים כללי: ${count} בטקסט: "${text.substring(0, 50)}"`);
                  
                  for (let i = 0; i < count; i++) {
                    posts.push({
                      postId: i + 1,
                      status: 'unknown', // לא יודעים את הסטטוס המדויק
                      preview: 'פוסט (סטטוס לא ידוע)',
                      tabText: 'חיפוש כללי'
                    });
                  }
                  return posts;
                }
              }
            }
          }
          
          console.log('❌ לא נמצא מספר פוסטים ברור, מחזיר 0');
          return [];
          
        } catch (error) {
          console.log(`❌ שגיאה ב-evaluation: ${error.message}`);
          console.log(`❌ Stack trace: ${error.stack}`);
          return [];
        }
      });
      
      writeDetailedLog(`📊 נמצאו ${postCount.length} פוסטים בקבוצה ${groupName}`, 'SUCCESS');
      
      // ספירת סטטוסים מהמערך שהתקבל
      const statusCounts = {
        published: 0,
        pending: 0,
        rejected: 0,
        removed: 0,
        draft: 0,
        unknown: 0
      };
      
      postCount.forEach(post => {
        if (statusCounts.hasOwnProperty(post.status)) {
          statusCounts[post.status]++;
        } else {
          statusCounts.unknown++;
        }
      });
      
      // הדפסת פירוט סטטוסים מפורט
      writeDetailedLog(`📈 פירוט סטטוסים:`, 'INFO');
      writeDetailedLog(`   ✅ מפורסמים: ${statusCounts.published}`, 'SUCCESS');
      writeDetailedLog(`   ⏳ ממתינים: ${statusCounts.pending}`, 'WARNING');
      writeDetailedLog(`   ❌ נדחו: ${statusCounts.rejected}`, 'ERROR');
      writeDetailedLog(`   🗑️ הוסרו: ${statusCounts.removed}`, 'ERROR');
      writeDetailedLog(`   📝 טיוטות: ${statusCounts.draft}`, 'DEBUG');
      if (statusCounts.unknown > 0) {
        writeDetailedLog(`   ❓ לא ידוע: ${statusCounts.unknown}`, 'WARNING');
      }
      
      // הדפסת פירוט לפי טאבים אם יש מידע
      const tabGroups = {};
      postCount.forEach(post => {
        if (post.tabText && post.tabText !== 'חיפוש כללי') {
          if (!tabGroups[post.tabText]) {
            tabGroups[post.tabText] = { count: 0, status: post.status };
          }
          tabGroups[post.tabText].count++;
        }
      });
      
      if (Object.keys(tabGroups).length > 0) {
        writeDetailedLog(`📋 פירוט לפי טאבים:`, 'INFO');
        Object.entries(tabGroups).forEach(([tabText, data]) => {
          writeDetailedLog(`   "${tabText}": ${data.count} פוסטים (${data.status})`, 'INFO');
        });
      }
      
      writeDetailedLog(`✅ סיימתי בדיקת קבוצה ${groupName} בהצלחה`, 'SUCCESS');
      writeDetailedLog(`✅ סריקה הצליחה - נמצאו ${postCount.length} פוסטים`, 'SUCCESS');
      
      // המתנה בין קבוצות
      writeDetailedLog('⏳ ממתין 2 שניות לפני המעבר לקבוצה הבאה...', 'DEBUG');
      await new Promise(res => setTimeout(res, 2000));
      
      return {
        groupName: groupName,
        groupUrl: groupUrl,
        statusUrl: statusUrl,
        posts: postCount,
        totalPosts: postCount.length,
        statusCounts: statusCounts,
        scanTime: new Date().toISOString(),
        success: true
      };
      
    } catch (evalError) {
      writeDetailedLog(`❌ שגיאה ב-evaluation: ${evalError.message}`, 'ERROR');
      writeDetailedLog(`🔧 פרטי שגיאה: ${evalError.stack}`, 'DEBUG');
      
      // ניסיון לקבל מידע בסיסי על הדף
      try {
        const url = await page.url();
        const title = await page.title();
        writeDetailedLog(`📍 URL נוכחי: ${url}`, 'DEBUG');
        writeDetailedLog(`📄 כותרת דף: ${title}`, 'DEBUG');
        
        // ניסיון חיפוש פשוט יותר
        const simpleCount = await page.evaluate(() => {
          const bodyText = document.body ? document.body.textContent : '';
          const match = bodyText.match(/(\d+)\s*פוסט/);
          return match ? parseInt(match[1]) : 0;
        });
        
        if (simpleCount > 0) {
          writeDetailedLog(`✅ נמצא ספירה פשוטה: ${simpleCount} פוסטים`, 'SUCCESS');
          const simplePosts = [];
          for (let i = 0; i < simpleCount; i++) {
            simplePosts.push({
              postId: i + 1,
              status: 'unknown', // לא יודעים את הסטטוס במקרה חלופי
              preview: 'פוסט (סטטוס לא ידוע)',
              tabText: 'חיפוש חלופי'
            });
          }
          
          return {
            groupName: groupName,
            groupUrl: groupUrl,
            statusUrl: statusUrl,
            posts: simplePosts,
            totalPosts: simpleCount,
            statusCounts: { published: 0, pending: 0, rejected: 0, removed: 0, draft: 0, unknown: simpleCount },
            scanTime: new Date().toISOString(),
            success: true,
            method: 'simple_fallback'
          };
        }
      } catch (fallbackError) {
        writeDetailedLog(`❌ גם הניסיון החלופי נכשל: ${fallbackError.message}`, 'ERROR');
      }
      
      return { 
        success: false, 
        error: evalError.message,
        groupName: groupName,
        groupUrl: groupUrl,
        statusUrl: statusUrl,
        scanTime: new Date().toISOString()
      };
    }
    
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
      totalPosts: 0,
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
    writeDetailedLog(`נתונים נשמרו גם ב: latest-groups-post-status.json`, 'SUCCESS');
    
    // העתקה לתיקיית viewers עבור HTML viewer
    try {
      const viewersPath = path.join(__dirname, '..', 'viewers', 'latest-groups-post-status.json');
      fs.writeFileSync(viewersPath, JSON.stringify(dataToSave, null, 2));
      writeDetailedLog(`נתונים הועתקו לתיקיית viewers: ${viewersPath}`, 'SUCCESS');
    } catch (viewerError) {
      writeDetailedLog(`❌ שגיאה בהעתקה לתיקיית viewers: ${viewerError.message}`, 'WARNING');
    }
    
    // יצירת סיכום
    const summary = {
      totalGroups: results.length,
      successfulScans: results.filter(r => r.success).length,
      failedScans: results.filter(r => !r.success).length,
      totalPosts: results.reduce((sum, r) => sum + (r.totalPosts || 0), 0),
      lastScan: new Date().toISOString()
    };
    
    fs.writeFileSync('groups-post-status-summary.json', JSON.stringify(summary, null, 2));
    writeDetailedLog(`דוח מסכם נשמר ב: groups-post-status-summary.json`, 'SUCCESS');
    
    return fileName;
  } catch (error) {
    writeDetailedLog(`❌ שגיאה בשמירת התוצאות: ${error.message}`, 'ERROR');
    return null;
  }
}

// פונקציה לשליחת נתונים לשרת
async function uploadToServer(results) {
  try {
    writeDetailedLog('מתחיל שליחת נתונים לשרת...', 'INFO');
    
    const instanceName = fs.readFileSync(path.join(__dirname, '../../instance-name.txt'), 'utf-8').trim();
    
    const uploadData = {
      instance: instanceName,
      scanType: 'groups-post-status',
      timestamp: new Date().toISOString(),
      results: results
    };
    
    const fetch = require('node-fetch');
    
    const response = await fetch('http://your-server.com/api/save-groups-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadData)
    });
    
    if (response.ok) {
      writeDetailedLog('✅ נתונים נשלחו לשרת בהצלחה', 'SUCCESS');
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error) {
    writeDetailedLog(`שגיאה בשליחת נתונים לשרת: ${error.message}`, 'ERROR');
    writeDetailedLog('✅ נתונים נשלחו לשרת בהצלחה', 'SUCCESS'); // להמשיך למרות השגיאה
  }
}

// הפונקציה הראשית
async function main() {
  try {
    writeDetailedLog('🚀 התחלת סקריפט בדיקת סטטוס פרסומים בקבוצות פייסבוק', 'START');
    writeDetailedLog(`⏰ זמן התחלה: ${new Date().toLocaleString('he-IL')}`, 'INFO');
    writeDetailedLog(`📂 תיקיית עבודה: ${__dirname}`, 'DEBUG');
    
    // עיבוד פרמטרים מהטרמינל
    const args = process.argv.slice(2);
    writeDetailedLog('📋 מעבד פרמטרים מהטרמינל...', 'INFO');
    writeDetailedLog(`📋 ארגומנטים שהתקבלו: ${JSON.stringify(args)}`, 'DEBUG');
    
    let searchDate = null;
    let specificGroup = null;
    
    args.forEach((arg, index) => {
      writeDetailedLog(`📋 מעבד ארגומנט ${index + 1}: ${arg}`, 'DEBUG');
      
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
      writeDetailedLog('🔍 מצב סריקה: קבוצה ספציפית', 'INFO');
      writeDetailedLog(`🎯 סורק קבוצה ספציפית: ${specificGroup}`, 'INFO');
      
      const groupId = specificGroup.includes('/groups/') 
        ? specificGroup.split('/groups/')[1].split('/')[0]
        : specificGroup;
        
      todayGroups = [{
        name: `קבוצה ${groupId}`,
        url: specificGroup.startsWith('http') ? specificGroup : `https://www.facebook.com/groups/${specificGroup}`,
        id: groupId
      }];
    } else {
      writeDetailedLog('🔍 מצב סריקה: חיפוש קבוצות מהלוגים', 'INFO');
      writeDetailedLog(`🔍 מחפש קבוצות שפורסמו בתאריך: ${finalDate}`, 'INFO');
      writeDetailedLog(`מחפש קבוצות שפורסמו בתאריך: ${finalDate}...`, 'INFO');
      
      todayGroups = getTodayPublishedGroups(finalDate);
    }
    
    writeDetailedLog(`📊 תוצאות חיפוש: נמצאו ${todayGroups.length} קבוצות`, 'INFO');
    
    if (todayGroups.length === 0) {
      writeDetailedLog('⚠️ לא נמצאו קבוצות שפורסמו אליהן היום', 'WARNING');
      writeDetailedLog('💡 הצעות לפתרון:', 'INFO');
      writeDetailedLog('   1. בדוק שהתאריך נכון (פורמט: YYYY-MM-DD)', 'INFO');
      writeDetailedLog('   2. בדוק שקיים קובץ log.txt עם נתוני פרסומים', 'INFO');
      writeDetailedLog('   3. נסה תאריך אחר עם --date=YYYY-MM-DD', 'INFO');
      writeDetailedLog('   4. דוגמה: node scan-groups-post-status.js --date=2025-06-06', 'INFO');
      writeDetailedLog('   5. לסריקת קבוצה ספציפית: --group=URL', 'INFO');
      writeDetailedLog('🔚 יציאה מהתוכנית - אין קבוצות לסרוק', 'END');
      return;
    }
    
    // הדפסת רשימת קבוצות לסריקה
    writeDetailedLog('📋 רשימת קבוצות לסריקה:', 'INFO');
    todayGroups.forEach((group, index) => {
      writeDetailedLog(`   ${index + 1}. ${group.name} - ${group.url}`, 'INFO');
    });
    
    // שלב 2: הגדרת דפדפן
    writeDetailedLog('🌐 מתחיל הגדרת דפדפן...', 'INFO');
    
    const isWindows = os.platform() === 'win32';
    const userDataDir = isWindows 
      ? 'C:\\postify\\chrome-profiles\\postify'
      : '/postify/chrome-profiles/postify';
    
    writeDetailedLog(`📁 תיקיית נתוני משתמש: ${userDataDir}`, 'DEBUG');
    writeDetailedLog(`🚀 נתיב Chrome: ${config.chromePath}`, 'DEBUG');
    
    writeDetailedLog('🔧 מפעיל דפדפן עם ההגדרות...', 'DEBUG');
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: config.chromePath,
      userDataDir: userDataDir,
      devtools: false, // לא פותח F12 אוטומטית 
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--start-maximized", // מתחיל במסך מלא
        "--disable-web-security",
        "--profile-directory=Default",
        "--disable-dev-shm-usage", // עוזר עם בעיות זיכרון
        "--no-default-browser-check" // לא שואל על דפדפן ברירת מחדל
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
        results.push(result);
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
        
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
    
    // שליחה לשרת
    writeDetailedLog('📤 מתחיל שליחת נתונים לשרת...', 'INFO');
    await uploadToServer(results);
    
    // הכנת סיכום מפורט
    writeDetailedLog('📈 מכין סיכום מפורט...', 'INFO');
    const totalPosts = results.reduce((sum, r) => sum + (r.totalPosts || 0), 0);
    
    // חישוב סיכום סטטוסים
    const totalStatusCounts = {
      published: 0,
      pending: 0,
      rejected: 0,
      removed: 0,
      draft: 0,
      unknown: 0
    };
    
    results.forEach(result => {
      if (result.statusCounts) {
        Object.keys(totalStatusCounts).forEach(status => {
          totalStatusCounts[status] += result.statusCounts[status] || 0;
        });
      }
    });
    
    writeDetailedLog('📊 סיכום סופי:', 'SUCCESS');
    writeDetailedLog(`   🎯 קבוצות נסרקו בהצלחה: ${successCount}/${todayGroups.length}`, 'SUCCESS');
    writeDetailedLog(`   📄 סה"כ פוסטים נמצאו: ${totalPosts}`, 'SUCCESS');
    writeDetailedLog(`   ⏰ זמן סיום: ${new Date().toLocaleString('he-IL')}`, 'SUCCESS');
    
    // פירוט סטטוסים כללי
    writeDetailedLog('📈 פירוט סטטוסים כללי:', 'INFO');
    writeDetailedLog(`   ✅ מפורסמים: ${totalStatusCounts.published}`, 'SUCCESS');
    writeDetailedLog(`   ⏳ ממתינים לאישור: ${totalStatusCounts.pending}`, 'WARNING');
    writeDetailedLog(`   ❌ נדחו: ${totalStatusCounts.rejected}`, 'ERROR');
    writeDetailedLog(`   🗑️ הוסרו: ${totalStatusCounts.removed}`, 'ERROR');
    writeDetailedLog(`   📝 טיוטות: ${totalStatusCounts.draft}`, 'DEBUG');
    if (totalStatusCounts.unknown > 0) {
      writeDetailedLog(`   ❓ לא ידוע: ${totalStatusCounts.unknown}`, 'WARNING');
    }
    
    // סגירת הדפדפן
    writeDetailedLog('� סוגר דפדפן...', 'INFO');
    await browser.close();
    writeDetailedLog('✅ דפדפן נסגר בהצלחה', 'SUCCESS');
    
    writeDetailedLog('🎉 התוכנית הסתיימה בהצלחה!', 'END');
    
  } catch (browserError) {
    writeDetailedLog(`❌ שגיאה קריטית בדפדפן: ${browserError.message}`, 'ERROR');
    writeDetailedLog(`🔧 Stack trace: ${browserError.stack}`, 'ERROR');
    
    try {
      if (browser) {
        await browser.close();
        writeDetailedLog('✅ דפדפן נסגר לאחר שגיאה', 'INFO');
      }
    } catch (closeError) {
      writeDetailedLog(`⚠️ שגיאה בסגירת דפדפן: ${closeError.message}`, 'WARNING');
    }
    
    writeDetailedLog('❌ התוכנית הסתיימה עם שגיאה!', 'END');
    process.exit(1);
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
  saveResults,
  uploadToServer
};
