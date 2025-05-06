const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ip = require('ip');

const sheets = google.sheets('v4');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const hebrewMonths = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

async function logShutdownEvent() {
  const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf-8').trim();
  const spreadsheetMeta = require('./spreadsheet-startup.json');
  const spreadsheetId = spreadsheetMeta.id;

  const authClient = await auth.getClient();

  const now = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }).replace(',', '');
  const monthSheet = `${hebrewMonths[new Date().getMonth()]} ${String(new Date().getFullYear()).slice(-2)}`;
  const hostname = os.hostname();
  const ipAddr = ip.address();
  const org = "Postify";

  const values = [[now, hostname, "ShutDown", ipAddr, org]];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${monthSheet}!A:E`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values },
    auth: authClient,
  });

  console.log(`🛑 Shutdown logged in sheet "${monthSheet}"`);
}

logShutdownEvent().catch(err => {
  console.error("❌ Error logging shutdown:", err.message);
});
