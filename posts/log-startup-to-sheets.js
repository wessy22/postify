const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
<<<<<<< HEAD
const os = require('os');
const ip = require('ip');
=======
const ip = require('ip');
const getInstanceName = require('./get-instance-name');
>>>>>>> latest_branch

const sheets = google.sheets('v4');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
  ],
});

<<<<<<< HEAD
const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf-8').trim();
=======
>>>>>>> latest_branch
const spreadsheetPath = path.join(__dirname, 'spreadsheet-startup.json');

const hebrewMonths = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

<<<<<<< HEAD
async function ensureSpreadsheetExists() {
=======
async function ensureSpreadsheetExists(instanceName) {
>>>>>>> latest_branch
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

<<<<<<< HEAD
  // ✅ שתף את הקובץ עם עצמך כדי שיופיע בדרייב
=======
  // שתף את הקובץ עם עצמך כדי שיופיע בדרייב
>>>>>>> latest_branch
  await drive.permissions.create({
    fileId: spreadsheetId,
    resource: {
      role: 'writer',
      type: 'user',
<<<<<<< HEAD
      emailAddress: 'support@postify.co.il', // ← שנה למייל שלך אם צריך
=======
      emailAddress: 'support@postify.co.il',
>>>>>>> latest_branch
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

<<<<<<< HEAD
async function logStartupEvent() {
  await ensureSpreadsheetExists();
=======
async function logStartupEvent(hostname) {
  await ensureSpreadsheetExists(hostname);
>>>>>>> latest_branch

  const authClient = await auth.getClient();
  const spreadsheetMeta = require('./spreadsheet-startup.json');
  const spreadsheetId = spreadsheetMeta.id;

  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }).replace(',', '');
  const monthSheet = `${hebrewMonths[new Date().getMonth()]} ${String(new Date().getFullYear()).slice(-2)}`;

  await getOrCreateSheet(monthSheet, spreadsheetId);

<<<<<<< HEAD
  const hostname = os.hostname();
=======
>>>>>>> latest_branch
  const ipAddr = ip.address();
  const org = "Postify";

  const values = [[now, hostname, "StartUp", ipAddr, org]];
<<<<<<< HEAD

=======
>>>>>>> latest_branch
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

<<<<<<< HEAD
logStartupEvent().catch(err => {
  console.error("❌ Error logging startup:", err.message);
=======
// הריצה הראשית
getInstanceName().then(serverName => {
  if (!serverName) throw new Error('לא ניתן לקבל את שם השרת מה-metadata של Google Cloud.');
  console.log(`🖥️ Server name: ${serverName}`);
  logStartupEvent(serverName).catch(err => {
    console.error("❌ Error logging startup:", err.message);
  });
}).catch(err => {
  console.error('❌ שגיאה בשליפת שם השרת:', err.message);
>>>>>>> latest_branch
});
