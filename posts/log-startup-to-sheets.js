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

const spreadsheetPath = path.join(__dirname, 'spreadsheet-startup.json');

const hebrewMonths = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

async function ensureSpreadsheetExists(instanceName) {
  if (fs.existsSync(spreadsheetPath)) return;

  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  const title = `StartUp-Log-${instanceName}`;
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

  fs.writeFileSync(spreadsheetPath, JSON.stringify({ id: spreadsheetId }, null, 2));
  console.log(`🆔 Spreadsheet created: ${spreadsheetId}`);
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

async function logStartupEvent(hostname) {
  await ensureSpreadsheetExists(hostname);

  const authClient = await auth.getClient();
  const spreadsheetMeta = require('./spreadsheet-startup.json');
  const spreadsheetId = spreadsheetMeta.id;

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
