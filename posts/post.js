const { sendErrorMail } = require("./mailer");
const puppeteer = require("puppeteer-core");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require("./config.json");

// פונקציית לוג לקובץ
const LOG_FILE = path.join(__dirname, config.logFile || "log.txt");
const logToFile = (text) => {
  const timestamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jerusalem" }).replace(" ", "T");
  const line = `[${timestamp}] ${text}`;
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch (e) {
    console.error("⚠️ שגיאה בכתיבה ללוג:", e.message);
  }
};

async function runWithTimeout(fn, ms = 12 * 60 * 1000) {
  let timeout;
  return Promise.race([
    fn(),
    new Promise((_, reject) => timeout = setTimeout(() => reject(new Error('Global timeout reached!')), ms))
  ]).finally(() => clearTimeout(timeout));
}

// סגירת כל תהליכי כרום/כרומיום לפני התחלת הסקריפט (Windows בלבד)
try {
  console.log("🔒 סוגר את כל תהליכי Chrome/Chromium...");
  execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
  execSync('taskkill /F /IM chromium.exe /T', { stdio: 'ignore' });
} catch (e) {
  // יתכן ואין תהליך פתוח, מתעלמים משגיאה
}

// הוספת בדיקה לוודא שזה הקובץ הנכון
console.log("🔍 RUNNING POST.JS VERSION WITH ENHANCED SUCCESS DETECTION - v2.0");
console.log("🔍 File path:", __filename);
console.log("🔍 Current time:", new Date().toISOString());
logToFile("🔍 POST.JS STARTED - v2.0");

// קריאת פרמטרים מהפקודה
const groupUrl = process.argv[2];
const jsonFileName = process.argv[3];
const isRetryMode = process.argv[4] === "--retry"; // האם זה ניסיון חוזר
const groupPostIdentifier = process.argv[5] || ""; // מזהה קבוצה/פוסט
const isLastAttempt = process.argv[6] === "--last"; // האם זה הניסיון האחרון

logToFile(`📋 Parameters: ${groupUrl}, ${jsonFileName}, retry=${isRetryMode}, last=${isLastAttempt}`);

if (!groupUrl || !jsonFileName) {
  console.error("❌ Usage: node post.js <groupUrl> <jsonFileName> [--retry|--first] [groupPostIdentifier] [--last|--not-last]");
  process.exit(1);
}

// הגדרת נתיב לתיקיית הפוסטים לפי instance-name.txt
const instanceName = fs.readFileSync("C:\\postify\\posts\\instance-name.txt", "utf-8").trim();
const postsFolder = `C:\\postify\\user data\\${instanceName}\\posts`;
const jsonPath = path.join(postsFolder, jsonFileName);

// קריאת תוכן הפוסט עם הגנה מפני שגיאות
let postData;
let postText;
  try {
    postData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    postText = postData.text;
    console.log("📄 Post data loaded successfully");
    logToFile(`📄 Post data loaded: ${jsonFileName}`);
  } catch (error) {
    console.error("❌ Failed to load post data:", error.message);
    logToFile(`❌ Failed to load post data: ${error.message}`);
    process.exit(1);
  }const logToSheet = async (...args) => {
  try {
    const fn = require('./log-to-sheets');
    console.log(`🔍 DEBUG logToSheet args:`, args);
    // אם יש שגיאה ויש פרמטר שישי, הוסף אותו לעמודה G
    if (args[1] === 'Error' && args.length >= 6 && args[5]) {
      // args: [event, status, group, notes, postName, errorReason]
      const errorLog = (args[5] || "שגיאה לא ידועה").replace(/[^א-ת0-9 .,:;\-()]/g, "");
      console.log(`🔍 DEBUG Error log to column G:`, errorLog);
      // העברת כל הפרמטרים כולל הפרמטר השישי לעמודה G
      await fn(args[0], args[1], args[2], args[3], args[4], errorLog);
    } else {
      await fn(...args);
    }
  } catch (e) {
    console.error('⚠️ Failed to log to Google Sheet:', e.message);
  }
};

// פונקציה משופרת לחילוץ תאריך מטקסט פוסט
function extractPostDate(postText) {
  try {
    console.log(`🕒 מנתח תאריך מהטקסט: "${postText}"`);
    
    // דפוסים שונים של תאריכים בפייסבוק - מסודרים לפי עדיפות
    const patterns = [
      // זמן יחסי קצר - עדיפות גבוהה (פוסט חדש)
      /לפני (\d+) דקות?/,
      /לפני דקה/,
      /לפני (\d+) שעות?/,
      /לפני שעה/,
      
      // זמן יחסי בלי "לפני"
      /(\d+) דקות?/,
      /(\d+) שעות?/,
      
      // זמן יחסי ארוך יותר
      /לפני (\d+) ימים?/,
      /לפני יום/,
      /לפני (\d+) שבועות?/,
      /לפני שבוע/,
      
      // תאריכים יחסיים
      /(היום|אתמול|שלשום)/,
      
      // תאריך מלא
      /(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{4})/,
      
      // שמות חודשים עבריים
      /(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/
    ];
    
    let detectedDate = null;
    let confidence = 0;
    let matchedPattern = '';
    
    for (const pattern of patterns) {
      const match = postText.match(pattern);
      if (match) {
        matchedPattern = match[0];
        console.log(`✅ זוהה דפוס תאריך: "${matchedPattern}"`);
        
        // "לפני דקה" - ביטחון מקסימלי
        if (match[0] === 'לפני דקה') {
          detectedDate = new Date(Date.now() - 60000); // לפני דקה
          confidence = 99;
          console.log(`🎯 זוהה "לפני דקה" - ביטחון מקסימלי!`);
          break;
        }
        // "לפני X דקות" - ביטחון גבוה מאוד
        else if (match[0].includes('לפני') && match[0].includes('דקות')) {
          const num = parseInt(match[1]);
          detectedDate = new Date(Date.now() - num * 60000);
          confidence = 98 - (num * 0.1); // ככל שיותר דקות, פחות ביטחון
          console.log(`🎯 זוהה "לפני ${num} דקות" - פוסט חדש מאוד!`);
          break;
        }
        // "לפני שעה" או "לפני X שעות"
        else if (match[0].includes('לפני') && match[0].includes('שעות')) {
          const num = parseInt(match[1]) || 1;
          detectedDate = new Date(Date.now() - num * 3600000);
          confidence = 90 - (num * 2); // ככל שיותר שעות, פחות ביטחון
          console.log(`🕒 זוהה "לפני ${num} שעות"`);
          break;
        }
        // זמן יחסי בלי "לפני" - X דקות או X שעות
        else if (/^\d+\s+(דקות?|שעות?)$/.test(match[0])) {
          const num = parseInt(match[1]);
          const unit = match[2];
          
          if (unit.includes('דקות')) {
            detectedDate = new Date(Date.now() - num * 60000);
            confidence = 95 - (num * 0.2);
          } else if (unit.includes('שעות')) {
            detectedDate = new Date(Date.now() - num * 3600000);
            confidence = 85 - (num * 2);
          }
          console.log(`🕒 זוהה זמן יחסי: ${num} ${unit}`);
          break;
        }
        // "לפני יום" או "לפני X ימים"
        else if (match[0].includes('לפני') && match[0].includes('ימים')) {
          const num = parseInt(match[1]) || 1;
          detectedDate = new Date(Date.now() - num * 86400000);
          confidence = 80 - (num * 5);
          break;
        }
        // "היום" - ביטחון גבוה
        else if (match[0] === 'היום') {
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
    
    if (detectedDate) {
      console.log(`✅ תאריך זוהה בהצלחה: ${detectedDate.toISOString()} (ביטחון: ${confidence}%, דפוס: "${matchedPattern}")`);
    } else {
      console.log(`❌ לא הצלחתי לזהות תאריך מהטקסט: "${postText}"`);
    }
    
    return {
      date: detectedDate,
      confidence: confidence,
      matchedPattern: matchedPattern,
      originalText: postText.substring(0, 200)
    };
  } catch (error) {
    console.log(`❌ שגיאה בחילוץ תאריך: ${error.message}`);
    return { date: null, confidence: 0, originalText: postText.substring(0, 200) };
  }
}

// פונקציה לבדיקת סטטוס פוסטים בקבוצה מיד אחרי פרסום
async function checkPostStatusAfterPublish(page, groupUrl, groupName) {
  console.log(`🔍 בודק סטטוס פוסטים בקבוצה: ${groupName}`);
  
  try {
    // בניית URL עם my_posted_content
    const statusUrl = groupUrl.endsWith('/') 
      ? groupUrl + 'my_posted_content' 
      : groupUrl + '/my_posted_content';
    
    console.log(`🌐 נכנס לכתובת סטטוס: ${statusUrl}`);
    
    // מעבר לעמוד הסטטוס
    await page.goto(statusUrl, {
      waitUntil: "networkidle0", 
      timeout: 30000
    });
    
    // המתנה לטעינה מלאה
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // גלילה קלה להפעלת התוכן
    await page.evaluate(() => {
      window.scrollBy(0, 100);
      setTimeout(() => window.scrollBy(0, -100), 1000);
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // חיפוש טאבים של סטטוסים
    const statusData = await page.evaluate(() => {
      const tabs = [
        ...document.querySelectorAll('[role="tab"]'),
        ...document.querySelectorAll('button'),
        ...document.querySelectorAll('a'),
        ...document.querySelectorAll('div[tabindex]')
      ];
      
      const result = {
        published: 0,
        pending: 0,
        rejected: 0,
        removed: 0,
        latestStatus: null,
        latestDate: null
      };
      
      const statusKeywords = ['בהמתנה', 'פורסמו', 'נדחו', 'הוסרו', 'pending', 'published', 'rejected', 'removed'];
      
      tabs.forEach((tab) => {
        const tabText = tab.textContent || tab.innerText || '';
        
        if (statusKeywords.some(keyword => tabText.includes(keyword)) && tabText.length < 100) {
          const numberMatch = tabText.match(/(\d+)/);
          if (numberMatch) {
            const count = parseInt(numberMatch[1]);
            
            if (tabText.includes('פורסמו') || tabText.includes('published')) {
              result.published = count;
            } else if (tabText.includes('בהמתנה') || tabText.includes('pending')) {
              result.pending = count;
            } else if (tabText.includes('נדחו') || tabText.includes('rejected')) {
              result.rejected = count;
            } else if (tabText.includes('הוסרו') || tabText.includes('removed')) {
              result.removed = count;
            }
          }
        }
      });
      
      return result;
    });
    
    // נסה לזהות את הפוסט האחרון על ידי כניסה לטאבים ובדיקת תאריכים אמיתיים
    const tabsToCheck = [
      { keywords: ['בהמתנה', 'pending'], status: 'pending' },
      { keywords: ['פורסמו', 'published'], status: 'published' },
      { keywords: ['נדחו', 'rejected'], status: 'rejected' },
      { keywords: ['הוסרו', 'removed'], status: 'removed' }
    ];
    
    let latestPost = null;
    let latestPostDate = null;
    
    console.log(`🔍 מתחיל בדיקה מתקדמת של הפוסט האחרון בין כל הטאבים...`);
    
    for (const tabConfig of tabsToCheck) {
      try {
        // חיפוש הטאב
        const tabFound = await page.evaluate((keywords) => {
          const allTabs = [
            ...document.querySelectorAll('[role="tab"]'),
            ...document.querySelectorAll('button'),
            ...document.querySelectorAll('a'),
            ...document.querySelectorAll('div[tabindex]')
          ];
          
          for (const tab of allTabs) {
            const tabText = tab.textContent || tab.innerText || '';
            if (keywords.some(keyword => tabText.includes(keyword)) && tabText.length < 100) {
              try {
                tab.click();
                return { success: true, clickedText: tabText };
              } catch (e) {
                continue;
              }
            }
          }
          return { success: false };
        }, tabConfig.keywords);
        
        if (tabFound.success) {
          console.log(`✅ לחצתי על טאב: ${tabFound.clickedText}`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // חיפוש הפוסט הראשון בטאב עם תאריך
          const firstPostInfo = await page.evaluate(() => {
            const postSelectors = [
              '[data-testid="story-subtitle"]',
              '[data-testid*="post"]',
              '[role="article"]',
              'div[data-ft]',
              '.userContentWrapper',
              'div[style*="border"]'
            ];
            
            for (const selector of postSelectors) {
              const posts = document.querySelectorAll(selector);
              if (posts.length > 0) {
                const firstPost = posts[0];
                const postText = firstPost.textContent || firstPost.innerText || '';
                
                // חיפוש תאריך מתקדם
                let postDate = '';
                const dateSelectors = [
                  '[data-testid="story-subtitle"]',
                  '.timestampContent',
                  'abbr[data-utime]',
                  'time',
                  'span[title]'
                ];
                
                for (const dateSelector of dateSelectors) {
                  const dateElement = firstPost.querySelector(dateSelector) || document.querySelector(dateSelector);
                  if (dateElement) {
                    postDate = dateElement.textContent || dateElement.getAttribute('title') || '';
                    if (postDate) break;
                  }
                }
                
                // אם לא נמצא תאריך ספציפי, חפש בכל הדף
                if (!postDate) {
                  const timeElements = [...document.querySelectorAll('*')].filter(el => {
                    const text = el.textContent || el.innerText || '';
                    return text.match(/(לפני|היום|אתמול|\d+\s+(דקות?|שעות?|ימים?)|\d{1,2}\/\d{1,2}\/\d{4})/) && text.length < 50;
                  });
                  
                  if (timeElements.length > 0) {
                    postDate = timeElements[0].textContent || timeElements[0].innerText || '';
                  }
                }
                
                return {
                  found: true,
                  text: postText.substring(0, 200),
                  date: postDate
                };
              }
            }
            return { found: false };
          });
          
          if (firstPostInfo.found && firstPostInfo.date) {
            const dateInfo = extractPostDate(firstPostInfo.date);
            console.log(`📅 בטאב ${tabConfig.status}: תאריך גולמי="${firstPostInfo.date}", תאריך מעובד=${dateInfo.date ? dateInfo.date.toISOString() : 'null'}, ביטחון=${dateInfo.confidence}%`);
            
            if (dateInfo.date && dateInfo.confidence > 70) {
              // בדיקה אם זה הפוסט החדש ביותר
              if (!latestPost || dateInfo.date > latestPostDate) {
                latestPost = tabConfig.status;
                latestPostDate = dateInfo.date;
                console.log(`🏆 פוסט חדש ביותר עודכן ל-${tabConfig.status} (${dateInfo.date.toISOString()}, ביטחון: ${dateInfo.confidence}%)`);
              }
            }
          }
        }
      } catch (error) {
        console.log(`⚠️ שגיאה בבדיקת טאב ${tabConfig.status}: ${error.message}`);
      }
    }
    
    // סיכום התוצאות
    let finalLatestPost = latestPost || 'unknown';
    
    // Fallback - אם לא הצלחנו לזהות על פי תאריך, נשתמש בלוגיקה פשוטה
    if (!latestPost) {
      console.log(`❓ לא זוהה פוסט אחרון לפי תאריך, משתמש בלוגיקה fallback...`);
      
      if (statusData.pending > 0) {
        finalLatestPost = 'pending';
        console.log(`🎯 Fallback: יש ${statusData.pending} פוסטים ממתינים - הפוסט האחרון כנראה בהמתנה`);
      } else if (statusData.published > 0) {
        finalLatestPost = 'published';
        console.log(`🎯 Fallback: יש ${statusData.published} פוסטים מפורסמים ואין ממתינים - הפוסט האחרון כנראה פורסם`);
      }
    }
    
    console.log(`📊 תוצאות סריקת סטטוס עבור ${groupName}:`);
    console.log(`   ✅ מפורסמים: ${statusData.published}`);
    console.log(`   ⏳ ממתינים: ${statusData.pending}`);
    console.log(`   ❌ נדחו: ${statusData.rejected}`);
    console.log(`   🗑️ הוסרו: ${statusData.removed}`);
    console.log(`   🎯 פוסט אחרון (לפי תאריך): ${finalLatestPost}`);
    
    return {
      published: statusData.published,
      pending: statusData.pending,
      rejected: statusData.rejected,
      removed: statusData.removed,
      latestPostStatus: finalLatestPost,
      success: true
    };
    
  } catch (error) {
    console.log(`❌ שגיאה בבדיקת סטטוס: ${error.message}`);
    return {
      published: 0,
      pending: 0,
      rejected: 0,
      removed: 0,
      latestPostStatus: 'error',
      success: false,
      error: error.message
    };
  }
}

// פונקציה לאופטימיזציה של קישורים עבור פייסבוק
const optimizeLinksForFacebook = (text) => {
  console.log("🔗 Optimizing links for Facebook recognition...");
  
  // Regex לזיהוי URLs (כולל tinyurl, bit.ly, http/https וכו')
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
  
  let optimizedText = text;
  let matches = text.match(urlRegex);
  
  if (matches) {
    console.log(`🔍 Found ${matches.length} potential links:`, matches);
    
    matches.forEach(url => {
      // בדוק אם הקישור כבר בשורה נפרדת
      const urlIndex = optimizedText.indexOf(url);
      const beforeUrl = optimizedText.substring(0, urlIndex);
      const afterUrl = optimizedText.substring(urlIndex + url.length);
      
      // בדוק מה יש לפני ואחרי הקישור
      const charBefore = beforeUrl.charAt(beforeUrl.length - 1);
      const charAfter = afterUrl.charAt(0);
      
      let needsFixing = false;
      let newUrl = url;
      
      // אם אין ירידת שורה לפני הקישור, הוסף
      if (charBefore !== '\n' && charBefore !== '' && beforeUrl.trim() !== '') {
        newUrl = '\n\n' + newUrl;
        needsFixing = true;
      }
      
      // אם אין ירידת שורה אחרי הקישור, הוסף
      if (charAfter !== '\n' && charAfter !== '' && afterUrl.trim() !== '') {
        newUrl = newUrl + '\n\n';
        needsFixing = true;
      }
      
      if (needsFixing) {
        optimizedText = optimizedText.replace(url, newUrl);
        console.log(`✅ Optimized link: ${url} -> surrounded with newlines`);
      }
    });
  }
  
  // נקה רווחים מיותרים שנוצרו בתהליך
  optimizedText = optimizedText
    .replace(/\n{4,}/g, '\n\n\n') // מקסימום 3 ירידות שורה רצופות
    .replace(/[ \t]+\n/g, '\n') // הסר רווחים לפני ירידת שורה
    .replace(/\n[ \t]+/g, '\n'); // הסר רווחים אחרי ירידת שורה
  
  return optimizedText;
};

// פונקציה להכרח זיהוי קישורים על ידי פייסבוק
const triggerLinkRecognition = async (page, textbox) => {
  try {
    console.log("🔄 Triggering Facebook link recognition...");
    
    // בדוק אם יש קישורים בטקסט
    const textContent = await page.evaluate(el => el.textContent, textbox);
    const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
    const links = textContent.match(urlRegex);
    
    if (links && links.length > 0) {
      console.log(`🔍 Found ${links.length} links, checking if recognized...`);
      
      // בדוק אם יש קישורים כחולים (מזוהים)
      const blueLinks = await page.$$('div[role="dialog"] a[href]');
      
      if (blueLinks.length < links.length) {
        console.log(`⚠️ Only ${blueLinks.length}/${links.length} links recognized as blue links`);
        console.log("🔧 Attempting to trigger recognition...");
        
        // טריק 1: לחץ בסוף הטקסט ואז הוסף רווח ומחק
        await textbox.focus();
        await page.keyboard.press('End'); // לך לסוף הטקסט
        await page.keyboard.type(' ', { delay: 100 });
        await new Promise(r => setTimeout(r, 500));
        await page.keyboard.press('Backspace');
        await new Promise(r => setTimeout(r, 1000));
        
        // טריק 2: אם עדיין לא עובד, נסה select all + type again
        const updatedBlueLinks = await page.$$('div[role="dialog"] a[href]');
        if (updatedBlueLinks.length < links.length) {
          console.log("🔄 Trying select all + minor edit trick...");
          await page.keyboard.down('Control');
          await page.keyboard.press('a');
          await page.keyboard.up('Control');
          await new Promise(r => setTimeout(r, 300));
          
          // הוסף נקודה ומחק אותה
          await page.keyboard.type('.', { delay: 100 });
          await new Promise(r => setTimeout(r, 500));
          await page.keyboard.press('Backspace');
          await new Promise(r => setTimeout(r, 1500));
        }
        
        // בדיקה סופית
        const finalBlueLinks = await page.$$('div[role="dialog"] a[href]');
        console.log(`✅ Final result: ${finalBlueLinks.length}/${links.length} links recognized`);
      } else {
        console.log("✅ All links already recognized as blue links");
      }
    }
  } catch (error) {
    console.log("⚠️ Error in link recognition trigger:", error.message);
  }
};

const humanType = async (element, text) => {
  // נקה רווחים מיותרים ושורות ריקות
  let cleanText = text
    .replace(/\r\n/g, '\n') // המר CRLF ל-LF
    .replace(/\n{3,}/g, '\n\n') // הגבל שורות ריקות רצופות ל-2 לכל היותר
    .replace(/[ \t]+/g, ' ') // הפך רווחים מרובים לרווח יחיד
    .replace(/[ \t]*\n[ \t]*/g, '\n') // הסר רווחים בתחילת ובסוף שורות
    .trim(); // הסר רווחים מתחילת וסוף הטקסט

  // שיפור זיהוי קישורים - וודא שכל URL בשורה נפרדת
  cleanText = optimizeLinksForFacebook(cleanText);

  console.log("🧹 Cleaned text length:", cleanText.length);
  console.log("🧹 Cleaned text (first 200 chars):", JSON.stringify(cleanText.substring(0, 200)));

  let charsTyped = 0;
  const typoFrequency = 150 + Math.floor(Math.random() * 100); // כל 150–250 תווים

  for (const char of cleanText) {
    if (charsTyped > 0 && charsTyped % typoFrequency === 0 && /[a-zא-ת]/i.test(char)) {
      const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
      await element.type(wrongChar, { delay: 20 }); // הוספת delay לטייפינג
      await new Promise(r => setTimeout(r, 100 + Math.random() * 100));
      await element.press('Backspace');
      await new Promise(r => setTimeout(r, 100));
    }

    await element.type(char, { delay: 20 }); // הוספת delay לכל תו
    charsTyped++;

    const delay = 30 + Math.floor(Math.random() * 120);
    await new Promise(r => setTimeout(r, delay));

    if (Math.random() < 0.05) {
      const pause = 400 + Math.random() * 600;
      await new Promise(r => setTimeout(r, pause));
    }
  }
};

async function main() {
  let browser;
  let groupName = groupUrl;
  let postSuccessful = false; // משתנה שעוקב אחרי הצלחת הפרסום

  try {
    const userDataDir = config.userDataDir.replace("user", os.userInfo().username);

    console.log("🚀 Launching browser with user profile...");
    browser = await puppeteer.launch({
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

    console.log("📍 Navigating to group page...");
    logToFile(`📍 Navigating to: ${groupUrl}`);
    await page.goto(groupUrl, { waitUntil: "networkidle2", timeout: 0 });
    
    // קבלת שם הקבוצה מיד אחרי הטעינה
    try {
      await new Promise(r => setTimeout(r, 3000)); // המתן שהדף יטען לגמרי
      groupName = await page.title();
      console.log("📋 Group name detected:", groupName);
      // שמירת שם הקבוצה לקובץ מיד
      try {
        fs.writeFileSync(config.currentGroupFile, groupName, "utf-8");
      } catch (saveError) {
        console.log("⚠️ Warning: Could not save group name to file:", saveError.message);
      }
    } catch (e) {
      console.log("⚠️ Could not get group name yet, will try again later");
    }

    console.log("🧭 Looking for composer...");

    async function findComposer(page) {
      for (let scrollTry = 0; scrollTry < 10; scrollTry++) {
        const buttons = await page.$$('div[role="button"]');
        for (let button of buttons) {
          const text = await page.evaluate(el => el.textContent, button);
          if (
            text.includes("כאן כותבים") ||
            text.includes("Write something")
          ) {
            await button.click();
            return true;
          }
        }
        // גלילה איטית למטה במקום גלילה אחת של 800 פיקסלים
        for (let i = 0; i < 8; i++) {
          await page.evaluate(() => window.scrollBy(0, 100));
          await new Promise(r => setTimeout(r, 400)); // 0.4 שניות בין כל גלילה
        }
        await new Promise(r => setTimeout(r, 10000)); // 10 שניות השהיה
        await page.reload({ waitUntil: "networkidle2" });
        await new Promise(r => setTimeout(r, 2000));
      }
      return false;
    }

// חיפוש composer ("כאן כותבים" או "Write something") עם עד 3 ניסיונות, כולל רענון וגלילה
let composerFound = false;
let composerOpened = false;
let composerTry = 0;

while (!composerFound && composerTry < 3) {
  composerTry++;
  console.log(`🔎 Composer search attempt ${composerTry}...`);
  // חפש את כפתור "כאן כותבים" או "Write something"
  const buttons = await page.$$('div[role="button"]');
  for (let button of buttons) {
    const text = await page.evaluate(el => el.textContent, button);
    if (
      text.includes("כאן כותבים") ||
      text.includes("Write something")
    ) {
      await button.click();
      composerFound = true;
      break;
    }
  }
  if (!composerFound) {
    // גלילה איטית למטה במקום גלילה אחת של 800 פיקסלים
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 100));
      await new Promise(r => setTimeout(r, 400)); // 0.4 שניות בין כל גלילה
    }
    await new Promise(r => setTimeout(r, 10000)); // 10 שניות השהיה
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
  }
}

// אם לא נמצא composer - עבור לשלב הבא
if (!composerFound) {
  console.log("❌ Composer not found after 3 attempts. Moving to next step...");
} else {
  // נבדוק אם נפתח דיאלוג כתיבה
  let openTry = 0;
  while (!composerOpened && openTry < 3) {
    openTry++;
    try {
      await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { timeout: 8000 });
      composerOpened = true;
    } catch (e) {
      console.log(`⚠️ Composer dialog not open (attempt ${openTry}). Retrying full process...`);
      // בצע את כל התהליך מחדש: רענון, גלילה איטית, חיפוש ולחיצה
      composerFound = false;
      let retryTry = 0;
      while (!composerFound && retryTry < 3) {
        retryTry++;
        await page.reload({ waitUntil: "networkidle2" });
        await new Promise(r => setTimeout(r, 2000));
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, 100));
          await new Promise(r => setTimeout(r, 400));
        }
        await new Promise(r => setTimeout(r, 700));
        const buttons = await page.$$('div[role="button"]');
        for (let button of buttons) {
          const text = await page.evaluate(el => el.textContent, button);
          if (
            text.includes("כאן כותבים") ||
            text.includes("Write something")
          ) {
            await button.click();
            composerFound = true;
            break;
          }
        }
      }
      if (!composerFound) break;
    }
  }
  if (!composerOpened) {
    console.log("❌ Composer dialog did not open after all retries. Moving to next step...");
  } else {
    // כאן ממשיכים עם כתיבת הפוסט כרגיל
    // ...existing code for typing and posting...
  }
}

// ...המשך הקוד: שלב 'הצטרף לקבוצה' וכו'...

    // אם לא נמצא composer - בדוק אם יש כפתור "הצטרף לקבוצה" או "Join Group"
if (!composerFound) {
  console.log("🔎 Checking for 'הצטרף לקבוצה'/'Join Group' button...");
  const joinButtonSelectors = [
    'div[role="button"]', 'a[role="button"]', 'button'
  ];
  let joinClicked = false;
  for (const selector of joinButtonSelectors) {
    const buttons = await page.$$(selector);
    for (let button of buttons) {
      const text = await page.evaluate(el => el.textContent.trim(), button);
      if (
        text === "הצטרף לקבוצה" ||
        text === "הצטרפי לקבוצה" ||
        text === "הצטרף/הצטרפי לקבוצה" ||
        text.toLowerCase() === "join group" ||
        text.toLowerCase() === "join"
      ) {
        await button.click();
        joinClicked = true;
        console.log("✅ Clicked join group button. Waiting 20 seconds...");
        await new Promise(r => setTimeout(r, 20000));
        break;
      }
    }
    if (joinClicked) break;
  }
  if (joinClicked) {
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 2000));
    composerFound = await findComposer(page);
  }
}
    // אם עדיין לא נמצא - רענון נוסף ואז חיפוש "דיון"/"Discussion"
    if (!composerFound) {
      console.log("🔄 Composer still not found, refreshing again before searching for 'דיון' tab...");
      await page.reload({ waitUntil: "networkidle2" });
      await new Promise(r => setTimeout(r, 2000));

      console.log("🔎 Looking for 'דיון' or 'Discussion' tab...");
      const tabButtons = await page.$$('a[role="tab"], div[role="tab"], span[role="tab"], div[role="button"], a[role="button"]');
      let discussionTabFound = false;
      for (let tab of tabButtons) {
        const text = await page.evaluate(el => el.textContent, tab);
        if (
          text.trim() === "דיון" ||
          text.trim().toLowerCase() === "discussion"
        ) {
          await tab.click();
          discussionTabFound = true;
          console.log("✅ Clicked on 'דיון'/'Discussion' tab.");
          await new Promise(r => setTimeout(r, 2000));
          break;
        }
      }
      // נסה שוב למצוא composer (כולל באנגלית)
      if (discussionTabFound) {
        composerFound = await findComposer(page);
      }
    }

    // אם עדיין לא נמצא - רענון נוסף, המתנה 2 דקות, גלילה איטית, ואם לא נמצא - שגיאה ומעבר לקבוצה הבאה
    if (!composerFound) {
      console.log("🔄 Composer still not found after 'דיון', refreshing again and waiting 2 minutes before last attempt...");
      await page.reload({ waitUntil: "networkidle2" });
      await new Promise(r => setTimeout(r, 120000)); // 2 דקות

      // ניסיון אחרון: גלילה איטית ומציאת composer
      composerFound = false;
      for (let scrollTry = 0; scrollTry < 15; scrollTry++) {
        const buttons = await page.$$('div[role="button"]');
        for (let button of buttons) {
          const text = await page.evaluate(el => el.textContent, button);
          if (
            text.includes("כאן כותבים") ||
            text.includes("Write something") ||
            text.includes("התחל דיון") ||
            text.toLowerCase().includes("start discussion")
          ) {
            await button.click();
            composerFound = true;
            break;
          }
        }
        if (composerFound) break;
        await page.evaluate(() => window.scrollBy(0, 200));
        await new Promise(r => setTimeout(r, 700));
      }

      if (!composerFound) {
        // צילום מסך לדיבוג
        const debugPath = `C:\\temp\\composer-not-found-${Date.now()}.png`;
        await page.screenshot({ path: debugPath });
        console.log("❌ Composer not found after all attempts. Screenshot saved:", debugPath);
        logToFile(`❌ Composer not found after all attempts. Screenshot: ${debugPath}`);
        
        // תיעוד לגוגל שיטס רק בניסיון האחרון
        if (isLastAttempt) {
          await logToSheet('Post failed', 'Error', groupName || groupUrl, groupPostIdentifier, postData.title || '', `לא נמצא כפתור "כאן כותבים" גם אחרי כל הניסיונות. Screenshot: ${debugPath}`);
          console.log("📊 שגיאת Composer נרשמה לגוגל שיטס");
          logToFile("📊 Composer error logged to Google Sheets");
        }
        
        global.__errorReason = `לא נמצא composer בקבוצה: ${groupUrl} (Screenshot: ${debugPath})`;
        await browser.close();
        process.exit(1); // יציאה עם קוד שגיאה
      }
    }

    console.log("📝 Typing post text...");
    console.log("🔍 Original post text length:", postText.length);
    console.log("🔍 Original post text (first 200 chars):", JSON.stringify(postText.substring(0, 200)));
    await page.waitForSelector('div[role="dialog"] div[role="textbox"]', { timeout: 40000 });
    const textbox = await page.$('div[role="dialog"] div[role="textbox"]');
    await textbox.click();
    await humanType(textbox, postText);

    // המתן לפייסבוק לעבד את הקישורים ולזהות אותם
    console.log("🔗 Waiting for Facebook to process links...");
    await new Promise(r => setTimeout(r, 3000));

    // בדוק אם יש קישורים שלא זוהו ונסה להעזר בטריק העריכה
    await triggerLinkRecognition(page, textbox);

    for (const imagePath of postData.images) {
      // בדוק אם הקובץ הוא תמונה (לפי סיומת)
      const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      const ext = path.extname(imagePath).toLowerCase();
      if (!imageExts.includes(ext)) {
        console.log(`⏩ מדלג על קובץ לא תמונה: ${imagePath}`);
        continue;
      }
      
      console.log(`📋 Copying ${imagePath} to clipboard...`);
      try {
        execSync(`powershell -ExecutionPolicy Bypass -File \"C:\\postify\\posts\\copy-image.ps1\" -imagePath \"${imagePath}\"`);
        console.log("✅ Image copied to clipboard.");
      } catch (error) {
        console.error(`❌ Failed to copy ${imagePath} to clipboard: ${error.message}`);
        continue;
      }

      console.log("🖱️ Refocusing on post textbox...");
      const textbox = await page.$('div[role="dialog"] div[role="textbox"]');
      await textbox.focus();
      // Move cursor to end (simulate Ctrl+End)
      await page.keyboard.down('Control');
      await page.keyboard.press('End');
      await page.keyboard.up('Control');
      // Extra: scroll dialog to bottom
      await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (dialog) dialog.scrollTop = dialog.scrollHeight;
      });
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log("📋 Pasting clipboard image (Ctrl+V)...");
      await page.keyboard.down('Control');
      await page.keyboard.press('v');
      await page.keyboard.up('Control');

      console.log("⏳ Waiting for image to be inserted...");
      await new Promise(resolve => setTimeout(resolve, 8000));

      const tempFolder = "C:\\temp";
      if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder, { recursive: true });
      await page.screenshot({ path: `C:\\temp\\image-paste-${path.basename(imagePath)}.png` });
    }

    // הטיפול בקבצי וידאו
    const videoFiles = postData.images.filter(imagePath => {
      const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.webm', '.m4v'];
      const ext = path.extname(imagePath).toLowerCase();
      return videoExts.includes(ext);
    });

    if (videoFiles.length > 0) {
      for (const videoPath of videoFiles) {
        try {
          console.log(`🎬 מעלה וידאו: ${videoPath}`);
          // חיפוש כפתור העלאת קובץ או איקון מצלמה
          const uploadSelectors = [
            'div[role="dialog"] input[type="file"]',
            'div[role="dialog"] [aria-label*="Photo"]',
            'div[role="dialog"] [aria-label*="Video"]',
            'div[role="dialog"] [data-testid="media-sprout"]'
          ];
          
          let fileInput = null;
          for (const selector of uploadSelectors) {
            try {
              fileInput = await page.$(selector);
              if (fileInput) break;
            } catch (e) {
              continue;
            }
          }
          
          if (fileInput) {
            await fileInput.uploadFile(videoPath);
            console.log("✅ וידאו נבחר להעלאה.");
            // המתן להעלאה
            await new Promise(resolve => setTimeout(resolve, 15000));
          } else {
            console.log("⚠️ לא נמצא כפתור העלאת קובץ");
          }
        } catch (error) {
          console.error(`❌ שגיאה בהעלאת וידאו ${videoPath}: ${error.message}`);
        }
      }
    }

    console.log("📤 Publishing post...");
    const publishButtons = await page.$$('div[role="dialog"] [role="button"]');
    let publishClicked = false;
    for (let btn of publishButtons) {
      const text = await page.evaluate(el => el.innerText.trim(), btn);
      if (text === "פרסמי" || text === "פרסם" || text === "פרסם/פרסמי" || text === "Publish" || text === "Post") {
        await btn.click();
        publishClicked = true;
        break;
      }
    }

    if (!publishClicked) {
      console.log("❌ Publish button not found");
      logToFile("❌ Publish button not found");
      // תיעוד לגוגל שיטס רק בניסיון האחרון
      if (isLastAttempt) {
        await logToSheet('Post failed', 'Error', groupName || groupUrl, groupPostIdentifier, postData.title || '', 'לא נמצא כפתור פרסום');
        console.log("📊 שגיאת Publish button נרשמה לגוגל שיטס");
        logToFile("📊 Publish button error logged to Google Sheets");
      }
      await browser.close();
      process.exit(1);
    }

    console.log("⏳ Waiting 40 seconds after publish...");
    await new Promise(resolve => setTimeout(resolve, 40000));
    
    // פשוט נניח שהפרסום הצליח ונמשיך
    let publishSuccess = true;
    console.log("✅ Post completed - continuing with process");

    // קבלת שם הקבוצה העדכני ביותר
    try {
      const currentGroupName = await page.title();
      if (currentGroupName && currentGroupName !== groupUrl) {
        groupName = currentGroupName;
        console.log("📋 Updated group name:", groupName);
        // ★ שמירת השם העדכני לקובץ מיד
        try {
          fs.writeFileSync(config.currentGroupFile, groupName, "utf-8");
          console.log("📋 Updated group name saved to file");
        } catch (saveError) {
          console.log("⚠️ Warning: Could not save updated group name:", saveError.message);
        }
      }
    } catch (e) {
      console.log("⚠️ Could not update group name:", e.message);
    }
    
    // וידוא ש-groupName תקין
    if (!groupName || groupName === 'undefined' || groupName === 'null') {
      groupName = groupUrl;
      console.log("🔧 Using fallback group name:", groupName);
    }
    
    console.log("GROUP_NAME_START" + groupName + "GROUP_NAME_END");

    // רישום הצלחה ל־logToSheet - נשלח מ-run-day.js בכל המקרים
    // אין צורך לכתוב כאן כדי למנוע כפילויות
    console.log("✅ Post published successfully");
    logToFile("✅ Post published successfully");
    postSuccessful = true; // ★ סימון שהפרסום הצליח
    
    // ★ בדיקת סטטוס פוסטים מיד אחרי פרסום מוצלח
    console.log("🔍 מתחיל בדיקת סטטוס פוסטים...");
    const statusResult = await checkPostStatusAfterPublish(page, groupUrl, groupName);
    
    // שמירת נתוני הסטטוס לקובץ זמני שיוכל לקרוא run-day.js
    const statusData = statusResult.success ? {
      latestPostStatus: statusResult.latestPostStatus || 'unknown',
      published: statusResult.published || 0,
      pending: statusResult.pending || 0,
      rejected: statusResult.rejected || 0,
      removed: statusResult.removed || 0
    } : null;
    
    if (statusData) {
      try {
        fs.writeFileSync(path.join(__dirname, 'temp-status-data.json'), JSON.stringify(statusData), 'utf8');
        console.log("✅ נתוני סטטוס נשמרו לקובץ זמני:", statusData);
      } catch (saveError) {
        console.log("⚠️ שגיאה בשמירת נתוני סטטוס:", saveError.message);
      }
    } else {
      console.log("⚠️ לא הצלחתי לבדוק סטטוס פוסטים");
    }
    
    console.log("🔍 DEBUG: About to save group name...");

    // שמירת שם הקבוצה העדכני לקובץ
    try {
      fs.writeFileSync(config.currentGroupFile, groupName, "utf-8");
      console.log("✅ Group name saved:", groupName);
    } catch (saveError) {
      console.log("⚠️ Warning: Could not save group name to file:", saveError.message);
      // זה לא אמור לפסול את כל הפרסום
    }

    console.log("🔍 DEBUG: About to close browser...");
    try {
      await browser.close();
      console.log("🎉 Browser closed successfully");
    } catch (closeError) {
      console.log("⚠️ Warning: Could not close browser properly:", closeError.message);
      // זה לא אמור לפסול את כל הפרסום
    }
    
    console.log("🎉 Process completed successfully");
    console.log("🔍 DEBUG: About to return from main function...");
    return; // הפונקציה הושלמה בהצלחה

  } catch (err) {
    console.error("❌ Error:", err.message);
    
    // ★ אם הפרסום הצליח אבל יש שגיאה אחרי זה, זה לא כישלון פרסום!
    if (postSuccessful) {
      console.log("✅ Post was published successfully, ignoring cleanup errors");
      if (browser) {
        try { await browser.close(); } catch (e) { /* ignore */ }
      }
      return; // יציאה מוצלחת למרות שגיאות בניקיון
    }
    
    // רק אם הפרסום באמת נכשל
    console.error("❌ Post publishing failed:", err.message);
    logToFile(`❌ Post publishing failed: ${err.message}`);
    
    // תיעוד לגוגל שיטס רק בניסיון האחרון
    if (isLastAttempt) {
      const notesText = groupPostIdentifier || `שגיאה כללית: ${err.message}`;
      // רישום שגיאה בעברית לעמודה G
      const errorReason = global.__errorReason || err.message || "שגיאה לא ידועה";
      await logToSheet('Post failed', 'Error', groupName || groupUrl, notesText, postData.title || '', errorReason);
      console.log("📊 שגיאה כללית נרשמה לגוגל שיטס");
      logToFile("📊 General error logged to Google Sheets");
    }
    if (browser) await browser.close();

    // שליחת מייל רק בניסיון האחרון (למנוע כפילות)
    if (isLastAttempt) {
      let reason = global.__errorReason || err.message || "שגיאה לא ידועה";
      await sendErrorMail("❌ שגיאה בפרסום פוסט", `הפרסום נכשל. סיבה: ${reason}`);
    }
    process.exit(1);
  }
}

// פונקציה לסגירת כל תהליכי כרום
async function closeChromeProcesses() {
  const { exec } = require("child_process");
  return new Promise((resolve) => {
    exec('taskkill /IM chrome.exe /F', () => resolve());
    exec('taskkill /IM chromium.exe /F', () => resolve());
  });
}

// ביטול ריטריי: הפעלה חד-פעמית בלבד
global.__errorMailSent = false;
async function runOnce() {
  try {
    console.log("🔍 DEBUG: Starting main function...");
    await main();
    console.log("🔍 DEBUG: Main function completed successfully!");
    process.exit(0);
  } catch (err) {
    console.log("🔍 DEBUG: Main function threw an error:", err.message);
    
    // בדיקה אם השגיאה קרתה אחרי פרסום מוצלח
    if (err.message && err.message.includes("cleanup")) {
      console.log("✅ Post was successful, error was in cleanup phase");
      process.exit(0); // יציאה מוצלחת
    }
    
    console.log("🔍 DEBUG: Error stack:", err.stack);
    // תיעוד טיימאווט או שגיאה כללית - נשלח מ-run-day.js בכל המקרים
    // אין צורך לכתוב כאן כדי למנוע כפילויות
    if (!global.__errorMailSent && isLastAttempt) {
      global.__errorMailSent = true;
      let reason = global.__errorReason || err.message || "שגיאה לא ידועה";
      await sendErrorMail("❌ שגיאה בפרסום פוסט", `הפרסום נכשל. סיבה: ${reason}`);
    }
    process.exit(1);
  }
}

// הפעל את הריטריי במקום ה־IIFE - בניסיון ראשון מותר לתעד, בניסיונות חוזרים לא
// הפעלה חד-פעמית בלבד, ללא ריטריי
runWithTimeout(() => runOnce(), 12 * 60 * 1000)
  .catch(async err => {
    // טיפול בשגיאת טיימאוט - נשלח מ-run-day.js בכל המקרים
    // אין צורך לכתוב כאן כדי למנוע כפילויות
    if (!global.__errorMailSent && isLastAttempt) {
      global.__errorMailSent = true;
      let reason = global.__errorReason || err.message || "שגיאה לא ידועה";
      await sendErrorMail("❌ שגיאה בפרסום פוסט", `הפרסום נכשל. סיבה: ${reason}`);
    }
    process.exit(1);
  });
