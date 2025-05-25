const { BigQuery } = require('@google-cloud/bigquery');
const { google } = require('googleapis');
const path = require('path');
const fs = require("fs");

const spreadsheetPath = path.join(__dirname, "spreadsheet-cost.json");

if (!fs.existsSync(spreadsheetPath)) {
  console.log("📄 spreadsheet-cost.json not found — running create-cost-sheet.js...");
  require("child_process").execSync("node create-cost-sheet.js", { stdio: "inherit" });
}


const sheets = google.sheets('v4');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: [
    'https://www.googleapis.com/auth/bigquery.readonly',
    'https://www.googleapis.com/auth/spreadsheets'
  ],
});

const hebrewMonths = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
];

async function getOrCreateMonthSheet(sheetName, spreadsheetId) {
  const authClient = await auth.getClient();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    auth: authClient,
  });

  const exists = meta.data.sheets.some(s => s.properties.title === sheetName);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    auth: authClient,
    requestBody: {
      requests: [{
        addSheet: {
          properties: { title: sheetName },
        },
      }],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:C1`,
    valueInputOption: 'RAW',
    resource: {
      values: [['Date', 'Service', 'Cost (₪)']],
    },
    auth: authClient,
  });
}

async function logCostsToSheet(rows) {
  const authClient = await auth.getClient();
  const now = new Date();
  now.setDate(now.getDate() - 1); // אתמול
  const dateStr = now.toLocaleDateString('he-IL');
  const yearSuffix = String(now.getFullYear()).slice(-2);
  const monthSheet = `${hebrewMonths[now.getMonth()]} ${yearSuffix}`;
  const instanceName = fs.readFileSync(path.join(__dirname, 'instance-name.txt'), 'utf-8').trim();
  const spreadsheetMeta = require('./spreadsheet-cost.json');
  const spreadsheetId = spreadsheetMeta.id;


  await getOrCreateMonthSheet(monthSheet, spreadsheetId);

  const values = [["", "", ""]]; // ← שורת רווח לפני הטבלה
  values.push(...rows.map(row => [
    dateStr,
    row.service || 'Unknown',
    `${row.total_cost} ₪`
  ]));

  const total = rows.reduce((sum, row) => sum + Number(row.total_cost || 0), 0);
  values.push(['', 'Total', `${total.toFixed(2)} ₪`]);


  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${monthSheet}!A:C`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values },
    auth: authClient,
  });

  console.log(`✅ ${values.length} rows written to sheet "${monthSheet}"`);
}

async function logDailyCosts() {
  const bigquery = new BigQuery({
    keyFilename: path.join(__dirname, 'credentials.json'),
  });

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 1); // אתמול
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const query = `
    SELECT
      service.description AS service,
      ROUND(SUM(cost), 2) AS total_cost
    FROM
      \`sonorous-folio-399513.billing_data.gcp_billing_export_resource_v1_010DDA_2D9E42_2BA513\`
    WHERE
      usage_start_time >= TIMESTAMP('${start.toISOString()}')
      AND usage_start_time < TIMESTAMP('${end.toISOString()}')
    GROUP BY service
    ORDER BY total_cost DESC
  `;

  const [rows] = await bigquery.query({ query });

  if (rows.length === 0) {
    console.warn("⚠️ No cost data found for yesterday.");
  } else {
    await logCostsToSheet(rows);
  }
}

logDailyCosts().catch(err => {
  console.error("❌ Error fetching daily costs:", err.message);
});
