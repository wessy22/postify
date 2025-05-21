const { google } = require('googleapis');
const path = require('path');
const keys = require('./credentials.json');

const sheets = google.sheets('v4');
const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
);

async function ensureConditionalFormattingForAllSheets(spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    auth,
  });

  for (const sheet of meta.data.sheets) {
    const sheetId = sheet.properties.sheetId;
    const sheetTitle = sheet.properties.title;
    console.log(`בודק גיליון: ${sheetTitle}`);

    // בדוק אם יש כבר עיצוב מותנה
    const rules = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`${sheetTitle}!A:E`],
      fields: 'sheets.properties.sheetId,sheets.conditionalFormats',
      auth,
    });

    if (!rules.data.sheets[0].conditionalFormats || rules.data.sheets[0].conditionalFormats.length === 0) {
      console.log(`🎨 מוסיף עיצוב מותנה לגיליון: ${sheetTitle}`);
      try {
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
        console.log(`✅ עיצוב מותנה נוסף לגיליון: ${sheetTitle}`);
      } catch (err) {
        console.error(`❌ שגיאה בהוספת עיצוב מותנה לגיליון ${sheetTitle}:`, err.message);
      }
    } else {
      console.log(`ℹ️ גיליון "${sheetTitle}" כבר כולל עיצוב מותנה`);
    }
  }
}

async function main() {
  await auth.authorize();
  const drive = google.drive({ version: 'v3', auth });

  // חפש את כל הקבצים שמתחילים ב-LogToSheet-
  const response = await drive.files.list({
    q: "name contains 'LogToSheet-' and mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 100,
  });

  if (!response.data.files.length) {
    console.log('לא נמצאו קבצים מתאימים בדרייב.');
    return;
  }

  for (const file of response.data.files) {
    console.log(`\n-----------------------------\nמטפל בקובץ: ${file.name} (${file.id})`);
    try {
      await ensureConditionalFormattingForAllSheets(file.id);
    } catch (err) {
      console.error(`❌ שגיאה בקובץ ${file.name}:`, err.message);
    }
  }
  console.log('\n✔️ סיום');
}

main();