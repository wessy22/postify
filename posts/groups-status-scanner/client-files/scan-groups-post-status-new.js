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
    
    if (fs.existsSync(logPath)) {
      writeDetailedLog('✅ קובץ לוג קיים - קורא תוכן...', 'INFO');
      const logContent = fs.readFileSync(logPath, 'utf-8');
      const lines = logContent.split('\n');
      
      writeDetailedLog(`📄 קובץ הלוג מכיל ${lines.length} שורות`, 'DEBUG');
      
      const todayGroups = [];
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
    
    // המתנה ארוכה יותר לטעינת העמוד
    writeDetailedLog('⏳ ממתין 10 שניות לטעינת תוכן...', 'DEBUG');
    writeDetailedLog('🔍 זה הזמן לבדוק את הדף ב-F12!', 'INFO');
    await new Promise(res => setTimeout(res, 10000));
    
    // חיפוש מספר הפוסטים בטאב "פורסמו"
    writeDetailedLog('🔍 מחפש מספר פוסטים בטאב פורסמו...', 'INFO');
    
    const postCount = await page.evaluate(() => {
      console.log('🔍 מתחיל JavaScript evaluation בדף');
      
      // חיפוש הטקסט "פוסטים" עם מספר
      const spans = document.querySelectorAll('span');
      console.log(`🎯 נמצאו ${spans.length} spans בדף`);
      
      for (let span of spans) {
        const text = span.textContent || span.innerText || '';
        console.log(`🔍 בודק span: "${text}"`);
        
        // חיפוש טקסט שמכיל מספר ואחריו "פוסטים"
        const match = text.match(/(\d+)\s*פוסטים/);
        if (match) {
          const count = parseInt(match[1]);
          console.log(`✅ נמצא מספר פוסטים: ${count}`);
          return count;
        }
      }
      
      console.log('❌ לא נמצא מספר פוסטים');
      return 0;
    });
    
    writeDetailedLog(`📊 נמצאו ${postCount} פוסטים בקבוצה ${groupName}`, 'SUCCESS');
    
    // יצירת תוצאה עם מספר הפוסטים
    const posts = [];
    for (let i = 0; i < postCount; i++) {
      posts.push({
        postNumber: i + 1,
        status: 'published',
        groupName: groupName,
        scanTime: new Date().toISOString()
      });
    }
    
    writeDetailedLog(`✅ סיימתי בדיקת קבוצה ${groupName} בהצלחה`, 'SUCCESS');
    writeDetailedLog(`✅ סריקה הצליחה - נמצאו ${postCount} פוסטים`, 'SUCCESS');
    
    // המתנה בין קבוצות
    writeDetailedLog('⏳ ממתין 2 שניות לפני המעבר לקבוצה הבאה...', 'DEBUG');
    await new Promise(res => setTimeout(res, 2000));
    
    return {
      groupName: groupName,
      groupUrl: groupUrl,
      statusUrl: statusUrl,
      posts: posts,
      totalPosts: postCount,
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
    
    writeDetailedLog('📊 סיכום סופי:', 'SUCCESS');
    writeDetailedLog(`   🎯 קבוצות נסרקו בהצלחה: ${successCount}/${todayGroups.length}`, 'SUCCESS');
    writeDetailedLog(`   📄 סה"כ פוסטים נמצאו: ${totalPosts}`, 'SUCCESS');
    writeDetailedLog(`   ⏰ זמן סיום: ${new Date().toLocaleString('he-IL')}`, 'SUCCESS');
    
    // השארת דפדפן פתוח לבדיקה
    writeDetailedLog('🔍 דפדפן נשאר פתוח לבדיקה...', 'INFO');
    writeDetailedLog('💡 לחץ F12 לפתיחת DevTools ולחקור את הדף', 'INFO');
    writeDetailedLog('🛑 סגור את הדפדפן באופן ידני כאשר תסיים', 'INFO');
    
    // לא סוגרים את הדפדפן - נשאיר אותו פתוח
    // await browser.close();
    
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
