const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const keys = require('./credentials.json');
const getInstanceName = require('./get-instance-name');
const os = require('os');

console.log('🔑 Loading credentials...');
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
  console.log('📊 Ensuring spreadsheet exists...');
  if (!instanceName) {
    try {
      console.log('🔍 Trying to get instance name...');
      instanceName = await getInstanceName();
      console.log(`🖥️ Got instance name: ${instanceName}`);
    } catch (e) {
      console.log('⚠️ Error getting instance name:', e.message);
      // אם לא ניתן לקבל את שם השרת מ-Google Cloud, נשתמש בשם קבוע
      instanceName = 'local';
      console.log(`ℹ️ Using fixed name: ${instanceName}`);
    }
  }
  
  spreadsheetPath = path.join(__dirname, `spreadsheet-logtosheet.json`);
  console.log(`📁 Checking for spreadsheet file at: ${spreadsheetPath}`);
  
  try {
    if (fs.existsSync(spreadsheetPath)) {
      console.log('📄 Found existing spreadsheet file');
      const fileContent = fs.readFileSync(spreadsheetPath, 'utf8');
      console.log('📄 File content:', fileContent);
      const data = JSON.parse(fileContent);
      spreadsheetId = data.id;
      console.log(`🆔 Using existing spreadsheet ID: ${spreadsheetId}`);
      return;
    }
  } catch (e) {
    console.error('❌ Error reading spreadsheet file:', e.message);
  }

  console.log('🔑 Authorizing...');
  try {
    const authClient = await auth.authorize();
    console.log('✅ Authorization successful');
    
    const drive = google.drive({ version: 'v3', auth });

    const title = `LogToSheet-${instanceName}`;
    console.log(`📝 Creating new spreadsheet: ${title}`);
    
    const spreadsheet = await sheets.spreadsheets.create({
      resource: {
        properties: { title },
      },
      auth,
    });

    spreadsheetId = spreadsheet.data.spreadsheetId;
    console.log(`🆔 Got new spreadsheet ID: ${spreadsheetId}`);

    console.log('👥 Sharing spreadsheet...');
    await drive.permissions.create({
      fileId: spreadsheetId,
      resource: {
        role: 'writer',
        type: 'user',
        emailAddress: 'support@postify.co.il',
      },
      fields: 'id',
    });
    console.log('✅ Sharing successful');

    fs.writeFileSync(spreadsheetPath, JSON.stringify({ id: spreadsheetId }, null, 2));
    console.log(`📄 Saved spreadsheet ID to file`);
  } catch (e) {
    console.error('❌ Error in spreadsheet operations:', e.message);
    throw e;
  }
}

async function getOrCreateSheet(sheetName, spreadsheetId) {
  console.log(`📊 Getting or creating sheet: ${sheetName}`);
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    auth,
  });

  const existingSheet = meta.data.sheets.find(s => s.properties.title === sheetName);
  if (existingSheet) {
    console.log('✅ Sheet already exists');
    return;
  }

  console.log('📝 Creating new sheet...');
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

  console.log('📝 Adding headers to sheet...');
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:E1`,
    valueInputOption: 'RAW',
    resource: {
      values: [['Timestamp', 'Action', 'Status', 'Group', 'Notes']],
    },
    auth,
  });
  console.log('✅ Sheet created and initialized');
}

async function logToSheet(action, status, group = '', notes = '') {
  console.log('📝 Starting logToSheet...');
  try {
    console.log('🔑 Authorizing...');
    await auth.authorize();
    console.log('✅ Authorization successful');
    
    console.log('📊 Ensuring spreadsheet exists...');
    await ensureSpreadsheetExists();
    console.log('✅ Spreadsheet check complete');

    const now = new Date();
    const timestamp = now.toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const dateSheetName = now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }).replace(/\//g, '-');
    console.log(`📅 Using sheet: ${dateSheetName}`);

    await getOrCreateSheet(dateSheetName, spreadsheetId);

    console.log('📤 Appending data to sheet...');
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
  } catch (error) {
    console.error('❌ Error in logToSheet:', error.message);
    throw error;
  }
}

module.exports = logToSheet;
