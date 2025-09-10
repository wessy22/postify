const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const keys = require('./credentials.json');

const sheets = google.sheets('v4');

const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
);

const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf-8').trim();
const spreadsheetPath = path.join(__dirname, `spreadsheet-logtosheet.json`);
let spreadsheetId = '';
let conditionalFormattingChecked = false;
const validatedSheets = new Set();

async function ensureSpreadsheetExists() {
  if (fs.existsSync(spreadsheetPath)) {
    spreadsheetId = require(spreadsheetPath).id;
    return;
  }

  const authClient = await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });

  const title = `LogToSheet-${instanceName}`;
  const spreadsheet = await sheets.spreadsheets.create({
    resource: { properties: { title } },
    auth,
  });

  spreadsheetId = spreadsheet.data.spreadsheetId;

  await drive.permissions.create({
    fileId: spreadsheetId,
    resource: {
      role: 'writer',
      type: 'user',
      emailAddress: 'support@postify.co.il',
    },
    fields: 'id',
  });

  fs.writeFileSync(spreadsheetPath, JSON.stringify({ id: spreadsheetId }, null, 2));
  console.log(`🆕 Spreadsheet created: ${spreadsheetId}`);
}

async function getOrCreateSheet(sheetName) {
  if (validatedSheets.has(sheetName)) return;
  validatedSheets.add(sheetName);

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    auth,
  });

  const existingSheet = meta.data.sheets.find(s => s.properties.title === sheetName);
  if (existingSheet) return;

  await sheets.spreadsheets.batchUpdate({
  spreadsheetId,
  auth,
  requestBody: {
    requests: [
      {
        addSheet: {
          properties: {
            title: sheetName,
            index: 0 // מוסיף את הגיליון בתחילת הרשימה
          }
        }
      }
    ]
  }
});

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:G1`,
    valueInputOption: 'RAW',
    resource: {
      values: [['Timestamp', 'Action', 'Status', 'Group', 'Notes', 'Post Name', 'error log']],
    },
    auth,
  });

  console.log(`✅ Sheet created: ${sheetName}`);
}

async function ensureConditionalFormattingOnce() {
  if (conditionalFormattingChecked) return;
  conditionalFormattingChecked = true;

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    auth,
  });

  for (const sheet of meta.data.sheets) {
    const sheetId = sheet.properties.sheetId;
    const sheetTitle = sheet.properties.title;

    const rules = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`${sheetTitle}!A:E`],
      fields: 'sheets.properties.sheetId,sheets.conditionalFormats',
      auth,
    });

    if (!rules.data.sheets[0].conditionalFormats || rules.data.sheets[0].conditionalFormats.length === 0) {
      console.log(`🎨 Adding conditional formatting to ${sheetTitle}`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        auth,
        requestBody: {
          requests: [
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [{ sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 }],
                  booleanRule: {
                    condition: {
                      type: 'TEXT_EQ',
                      values: [{ userEnteredValue: 'Success' }]
                    },
                    format: {
                      backgroundColor: { red: 0.776, green: 0.937, blue: 0.808 },
                      textFormat: { foregroundColor: { red: 0, green: 0.38, blue: 0 } }
                    }
                  }
                }
              }
            },
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [{ sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 }],
                  booleanRule: {
                    condition: {
                      type: 'TEXT_EQ',
                      values: [{ userEnteredValue: 'Error' }]
                    },
                    format: {
                      backgroundColor: { red: 1, green: 0.78, blue: 0.808 },
                      textFormat: { foregroundColor: { red: 0.61, green: 0, blue: 0.024 } }
                    }
                  }
                }
              }
            }
          ]
        }
      });
    }
  }
}

// פונקציה לניקוי שמות קבוצות
function cleanGroupName(groupName) {
  if (!groupName) return groupName;
  
  let cleaned = groupName
    // הסרת "| Facebook" בסוף
    .replace(/\s*\|\s*Facebook\s*$/i, '')
    // הסרת "Facebook" בכל מקום
    .replace(/\s*Facebook\s*/gi, '')
    // הסרת סוגריים עם מספרים ופלוסים כמו (20+) או (5)
    .replace(/\(\d+\+?\)\s*/g, '')
    // הסרת pipe symbols מיותרים
    .replace(/\s*\|\s*/g, ' ')
    // הסרת רווחים מיותרים
    .replace(/\s+/g, ' ')
    // הסרת רווחים בהתחלה ובסוף
    .trim();
    
  return cleaned;
}

// פונקציה לוודא שקיימות כותרות לעמודות סטטוס 
async function ensureStatusHeaders(sheetName) {
  try {
    // קריאת השורה הראשונה (כותרות)
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:L1`,
      auth,
    });

    const headers = headerResponse.data.values ? headerResponse.data.values[0] || [] : [];
    let needsUpdate = false;

    // הכותרות הנדרשות
    const requiredHeaders = [
      'Timestamp',           // A
      'Action',             // B
      'Status',             // C
      'Group',              // D
      'Notes',              // E
      'Post Name',          // F
      'Error Log',          // G
      'Latest_Post_Status', // H
      'Published',          // I
      'Pending',            // J
      'Rejected',           // K
      'Removed'             // L
    ];

    // בדיקה והוספת כותרות חסרות
    while (headers.length < requiredHeaders.length) {
      const index = headers.length;
      headers.push(requiredHeaders[index]);
      needsUpdate = true;
    }

    // עדכון הכותרות אם צריך
    if (needsUpdate) {
      console.log(`📝 מעדכן כותרות עמודות ב-${sheetName}...`);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:L1`,
        valueInputOption: 'RAW',
        resource: {
          values: [headers],
        },
        auth,
      });
      console.log('✅ כותרות עמודות עודכנו');
    }

  } catch (error) {
    console.log(`⚠️ שגיאה בעדכון כותרות: ${error.message}`);
  }
}

// פונקציה משופרת עם תמיכה בעמודות סטטוס נוספות
async function logToSheet(action, status, group = '', notes = '', postName = '', errorLog = '', statusData = null, attempt = 1) {
  try {
    await auth.authorize();
    await ensureSpreadsheetExists();

    const now = new Date();
    const timestamp = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const dateSheetName = now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }).replace(/\//g, '-');

    await getOrCreateSheet(dateSheetName);
    await ensureConditionalFormattingOnce();

    // ניקוי שם הקבוצה לפני הכנסה לשיט (רק אם זה לא URL)
    console.log(`🔍 DEBUG logToSheet - Original group: "${group}"`);
    const cleanedGroup = (group && (group.includes('http://') || group.includes('https://'))) ? group : cleanGroupName(group);
    console.log(`🔍 DEBUG logToSheet - Cleaned group: "${cleanedGroup}"`);
    console.log(`🔍 DEBUG logToSheet - Is URL: ${group && (group.includes('http://') || group.includes('https://'))}`);

    // בניית השורה הבסיסית (A-G)
    let row = [timestamp, action, status, cleanedGroup, notes, postName];
    if (errorLog && errorLog.trim()) {
      row.push(errorLog);
    } else {
      row.push(''); // עמודה G ריקה
    }

    // הוספת עמודות סטטוס (H-L) אם נתונים סופקו
    if (statusData) {
      console.log('📊 מוסיף נתוני סטטוס לגיליון...');
      
      // וידוא שהכותרות הנוספות קיימות בגיליון
      await ensureStatusHeaders(dateSheetName);
      
      // הוספת נתוני הסטטוס לשורה
      row.push(statusData.latestPostStatus || ''); // עמודה H - Latest Post Status
      row.push(statusData.published || 0);         // עמודה I - Published
      row.push(statusData.pending || 0);           // עמודה J - Pending
      row.push(statusData.rejected || 0);          // עמודה K - Rejected
      row.push(statusData.removed || 0);           // עמודה L - Removed
      
      console.log('✅ נתוני סטטוס נוספו לשורה:', {
        latestStatus: statusData.latestPostStatus,
        published: statusData.published,
        pending: statusData.pending,
        rejected: statusData.rejected,
        removed: statusData.removed
      });
    }

    // קביעת הטווח לפי מספר העמודות
    const range = statusData ? `${dateSheetName}!A:L` : `${dateSheetName}!A:G`;
    
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: range,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [row],
      },
      auth,
    });

    console.log(`✅ Log written to sheet: ${dateSheetName} (${statusData ? 'with status data' : 'basic'})`);
  } catch (err) {
    if ((err.code === 503 || (err.response && err.response.status === 503)) && attempt <= 3) {
      const delay = 2000 * attempt; // 2s, 4s, 6s
      console.warn(`⚠️ Google Sheets API unavailable (503). Retrying in ${delay / 1000}s... (Attempt ${attempt})`);
      await new Promise(res => setTimeout(res, delay));
      return logToSheet(action, status, group, notes, postName, errorLog, statusData, attempt + 1);
    }
    console.error('❌ Failed to log to sheet:', err.message || err);
    // אפשר להוסיף כאן שליחת מייל אם תרצה
    return false;
  }
}

module.exports = logToSheet;
