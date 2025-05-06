const { google } = require("googleapis");
const https = require("https");
const keys = require("../postify-clone/credentials.json"); // קובץ שירות מגוגל

const now = new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" });

// התחברות לשירות Sheets
const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = "1o8AOOy6LBr6yBwb1tDhXLriOFkqle0hV2VH4V1Ykor0";
const SHEET_NAME = "Log";

// פונקציה לשליפת שם ה־instance
function getInstanceName(callback) {
  const options = {
    hostname: 'metadata.google.internal',
    path: '/computeMetadata/v1/instance/name',
    headers: { 'Metadata-Flavor': 'Google' }
  };

  https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => callback(null, data.trim()));
  }).on('error', err => callback(err));
}

// פונקציה לשליפת IP ו־ISP
function getProviderInfo(callback) {
  https.get("https://ipinfo.io/json", (res) => {
    let data = "";
    res.on("data", chunk => data += chunk);
    res.on("end", () => {
      const info = JSON.parse(data);
      callback(null, {
        ip: info.ip,
        org: info.org || "Unknown provider"
      });
    });
  }).on("error", (err) => {
    callback(err);
  });
}

// הריצה הראשית
getInstanceName((errName, instanceName) => {
  const hostname = errName ? "UNKNOWN" : instanceName;

  getProviderInfo(async (errInfo, info) => {
    const ip = errInfo ? "N/A" : info.ip;
    const org = errInfo ? "N/A" : info.org;

    const values = [[now, hostname, "StartUp", ip, org]];

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:E`,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values,
        },
      });

      console.log("✅ נתוני האתחול נשלחו ל־Google Sheets");
    } catch (err) {
      console.error("❌ שגיאה בשליחה ל־Sheets:", err.message);
    }
  });
});
