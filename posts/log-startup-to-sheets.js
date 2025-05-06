const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const ip = require('ip');
const getInstanceName = require('./get-instance-name');
const os = require('os');

const sheets = google.sheets('v4');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ],
});

const hebrewMonths = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

async function findOrCreateSpreadsheet(instanceName) {
  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });
  
  // חיפוש הגיליון לפי שם
  const title = `StartUp-Log-${instanceName}`;
  const response = await drive.files.list({
    q: `name='${title}' and mimeType='application/vnd.google-apps.spreadsheet'`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files.length > 0) {
    const spreadsheetId = response.data.files[0].id;
    console.log(`📄 Found existing spreadsheet: ${spreadsheetId}`);
    return spreadsheetId;
  }

  // אם לא נמצא, יוצר גיליון חדש
  const spreadsheet = await sheets.spreadsheets.create({
    resource: {
      properties: { title },
    },
    auth: authClient,
  });

  const spreadsheetId = spreadsheet.data.spreadsheetId;

  // שתף את הקובץ עם עצמך כדי שיופיע בדרייב
  await drive.permissions.create({
    fileId: spreadsheetId,
    resource: {
      role: 'writer',
      type: 'user',
      emailAddress: 'support@postify.co.il',
    },
    fields: 'id',
  });

  console.log(`🆔 Created new spreadsheet: ${spreadsheetId}`);
  return spreadsheetId;
}

async function getOrCreateSheet(sheetName, spreadsheetId) {
  const authClient = await auth.getClient();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, auth: authClient });

  const exists = meta.data.sheets.some(s => s.properties.title === sheetName);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    auth: authClient,
    requestBody: {
      requests: [{ addSheet: { properties: { title: sheetName } } }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:E1`,
    valueInputOption: 'RAW',
    resource: {
      values: [['Timestamp', 'Hostname', 'Action', 'IP', 'Org']],
    },
    auth: authClient,
  });
}

async function ensureConditionalFormattingForAllSheets(spreadsheetId, authClient) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    auth: authClient,
  });

  for (const sheet of meta.data.sheets) {
    const sheetId = sheet.properties.sheetId;
    const sheetTitle = sheet.properties.title;

    // בדוק אם יש כבר עיצוב מותנה
    const rules = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`${sheetTitle}!A:E`],
      fields: 'sheets.properties.sheetId,sheets.conditionalFormats',
      auth: authClient,
    });

    if (!rules.data.sheets[0].conditionalFormats || rules.data.sheets[0].conditionalFormats.length === 0) {
      console.log(`🎨 Adding conditional formatting rules to sheet: ${sheetTitle}`);
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        auth: authClient,
        requestBody: {
          requests: [
            {
              addConditionalFormatRule: {
                rule: {
                  ranges: [{ sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 2, endColumnIndex: 3 }],
                  booleanRule: {
                    condition: {
                      type: 'TEXT_EQ',
                      values: [{ userEnteredValue: 'StartUp' }]
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
                      values: [{ userEnteredValue: 'ShutDown' }]
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
      console.log(`✅ Conditional formatting rules added to sheet: ${sheetTitle}`);
    }
  }
}

async function logStartupEvent(hostname) {
  const spreadsheetId = await findOrCreateSpreadsheet(hostname);
  const authClient = await auth.getClient();

  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }).replace(',', '');
  const monthSheet = `${hebrewMonths[new Date().getMonth()]} ${String(new Date().getFullYear()).slice(-2)}`;

  await getOrCreateSheet(monthSheet, spreadsheetId);

  const ipAddr = ip.address();
  const org = "Postify";

  const values = [[now, hostname, "StartUp", ipAddr, org]];
  console.log("📤 שולח:", values);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${monthSheet}!A:E`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values },
    auth: authClient,
  });

  // הוסף עיצוב מותנה לכל הגיליונות
  await ensureConditionalFormattingForAllSheets(spreadsheetId, authClient);

  console.log(`✅ Startup logged in sheet "${monthSheet}"`);
}

// הריצה הראשית
(async () => {
  let serverName;
  try {
    serverName = await getInstanceName();
    console.log(`🖥️ Server name from Google Cloud: ${serverName}`);
  } catch (e) {
    // אם לא ניתן לקבל את שם השרת מ-Google Cloud, נשתמש בשם המחשב המקומי
    serverName = os.hostname();
    console.log(`ℹ️ Using local computer name: ${serverName}`);
  }

  try {
    await logStartupEvent(serverName);
  } catch (err) {
    console.error("❌ Error logging startup:", err.message);
  }
})();
