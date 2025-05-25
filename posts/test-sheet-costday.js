
const { google } = require('googleapis');
const path = require('path');

const sheets = google.sheets('v4');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function testWriteToCostDay() {
  const authClient = await auth.getClient();

  const spreadsheetId = '1cJBH_L-LbZREjrO7ggRxl5tVKix6AglvJxF0bWeycWQ';
  const sheetName = 'COST DAY';

  const now = new Date();
  const row = [
    now.toLocaleDateString('he-IL'),
    'Test Service',
    '123.45 ₪'
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:C`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [row],
      },
      auth: authClient,
    });
    console.log("✅ Successfully wrote test row to COST DAY");
  } catch (err) {
    console.error("❌ Error writing to COST DAY:", err.message);
  }
}

testWriteToCostDay();
