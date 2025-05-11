const { google } = require('googleapis');
const path = require('path');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive'],
});

async function deleteSheet() {
  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  const spreadsheetId = '14tqG-AIJ8bN06J2KltETkawKOkdXjxSIKz9VwaB3ymI'; // ← מזהה הקובץ שלך

  await drive.files.delete({
    fileId: spreadsheetId,
    auth: authClient,
  });

  console.log('🗑️ Spreadsheet deleted.');
}

deleteSheet().catch(err => {
  console.error("❌ Error deleting spreadsheet:", err.message);
});
