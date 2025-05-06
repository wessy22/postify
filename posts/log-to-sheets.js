const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const keys = require('./credentials.json');
const getInstanceName = require('./get-instance-name');
const os = require('os');

const sheets = google.sheets('v4');

const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
);

// Load or create spreadsheet per instance
let instanceName = '';
let spreadsheetPath = '';
let spreadsheetId = '';

async function ensureSpreadsheetExists() {
  if (!instanceName) {
    try {
      instanceName = await getInstanceName();
    } catch (e) {
      // אם לא ניתן לקבל את שם השרת מ-Google Cloud, נשתמש בשם המחשב המקומי
      instanceName = os.hostname();
      console.log(`ℹ️ Using local computer name: ${instanceName}`);
    }
  }
  
  spreadsheetPath = path.join(__dirname, `spreadsheet-logtosheet.json`);
  if (fs.existsSync(spreadsheetPath)) {
    spreadsheetId = require(spreadsheetPath).id;
    return;
  }

  const authClient = await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });

  const title = `LogToSheet-${instanceName}`;
  const spreadsheet = await sheets.spreadsheets.create({
    resource: {
      properties: { title },
    },
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

async function getOrCreateSheet(sheetName, spreadsheetId) {
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
            },
          },
        },
      ],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:E1`,
    valueInputOption: 'RAW',
    resource: {
      values: [['Timestamp', 'Action', 'Status', 'Group', 'Notes']],
    },
    auth,
  });
}

async function logToSheet(action, status, group = '', notes = '') {
  await auth.authorize();
  await ensureSpreadsheetExists();

  const now = new Date();
  const timestamp = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const dateSheetName = now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }).replace(/\//g, '-');

  await getOrCreateSheet(dateSheetName, spreadsheetId);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${dateSheetName}!A:E`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [[timestamp, action, status, group, notes]],
    },
    auth,
  });

  console.log(`✅ Log written to sheet: ${dateSheetName}`);
}

module.exports = logToSheet;
