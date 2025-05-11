const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const keys = require('./credentials.json');
const getInstanceName = require('./get-instance-name');

const sheets = google.sheets('v4');

const auth = new google.auth.JWT(
  keys.client_email,
  null,
  keys.private_key,
  ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
);

// Load or create spreadsheet per instance
let instanceName = '';
const spreadsheetPath = path.join(__dirname, `spreadsheet-logtosheet.json`);
let spreadsheetId = '';

async function ensureSpreadsheetExists() {
  if (!instanceName) {
    try {
      instanceName = await getInstanceName();
      console.log(`🖥️ Got instance name: ${instanceName}`);
    } catch (e) {
      console.log('⚠️ Error getting instance name:', e.message);
      throw new Error('Must run on Google Cloud server to get instance name');
    }
  }

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
  if (existingSheet) {
    // בדוק אם יש כבר עיצוב מותנה
    const rules = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`${sheetName}!A:E`],
      fields: 'sheets.properties.sheetId,sheets.conditionalFormats',
      auth,
    });

    // אם אין עיצוב מותנה, נוסיף אותו
    if (!rules.data.sheets[0].conditionalFormats || rules.data.sheets[0].conditionalFormats.length === 0) {
      console.log('🎨 Adding conditional formatting rules...');
      const sheetId = existingSheet.properties.sheetId;
      console.log(`📊 Sheet ID: ${sheetId}`);
      
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
                      values: [{ userEnteredValue: 'Success' }]
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
                      values: [{ userEnteredValue: 'Error' }]
                    },
                    format: {
                      backgroundColor: { red: 1, green: 0, blue: 0 },
                      textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } }
                    }
                  }
                }
              }
            }
          ]
        }
      });
      console.log('✅ Conditional formatting rules added');
    }
    return;
  }

  // יצירת גיליון חדש
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

  const sheetId = (await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [sheetName],
    fields: 'sheets.properties.sheetId',
    auth,
  })).data.sheets[0].properties.sheetId;

  // הוספת כותרות
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:E1`,
    valueInputOption: 'RAW',
    resource: {
      values: [['Timestamp', 'Action', 'Status', 'Group', 'Notes']],
    },
    auth,
  });

  // הוספת עיצוב מותנה
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
                  values: [{ userEnteredValue: 'Success' }]
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
                  values: [{ userEnteredValue: 'Error' }]
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

  console.log('✅ Sheet created and initialized with conditional formatting');
}

async function ensureConditionalFormattingForAllSheets(spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    auth,
  });

  for (const sheet of meta.data.sheets) {
    const sheetId = sheet.properties.sheetId;
    const sheetTitle = sheet.properties.title;

    // בדוק אם יש כבר עיצוב מותנה
    const rules = await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [`${sheetTitle}!A:E`],
      fields: 'sheets.properties.sheetId,sheets.conditionalFormats',
      auth,
    });

    if (!rules.data.sheets[0].conditionalFormats || rules.data.sheets[0].conditionalFormats.length === 0) {
      console.log(`🎨 Adding conditional formatting rules to sheet: ${sheetTitle}`);
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
                      values: [{ userEnteredValue: 'Success' }]
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
                      values: [{ userEnteredValue: 'Error' }]
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

async function logToSheet(action, status, group = '', notes = '') {
  await auth.authorize();
  await ensureSpreadsheetExists();

  // ודא עיצוב מותנה לכל הגיליונות, גם אם לא נכתבה שורה חדשה
  await ensureConditionalFormattingForAllSheets(spreadsheetId);

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
