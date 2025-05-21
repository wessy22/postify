const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
});

async function createCostLogSheet() {
  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });
  const sheets = google.sheets({ version: 'v4', auth: authClient });

  const instanceNamePath = path.join(__dirname, 'instance-name.txt');
  if (!fs.existsSync(instanceNamePath)) {
    console.error("❌ instance-name.txt not found.");
    process.exit(1);
  }

  const instanceName = fs.readFileSync(instanceNamePath, 'utf-8').trim();
  const sheetTitle = `Cost-Log-${instanceName}`;

  const sheetRes = await sheets.spreadsheets.create({
    resource: {
      properties: { title: sheetTitle }
    },
    auth: authClient,
  });

  const spreadsheetId = sheetRes.data.spreadsheetId;
  console.log(`✅ Created sheet: ${sheetTitle}`);
  console.log(`🆔 Spreadsheet ID: ${spreadsheetId}`);

  const serviceEmail = 'postify-logger@sonorous-folio-399513.iam.gserviceaccount.com';
  await drive.permissions.create({
    fileId: spreadsheetId,
    resource: {
      role: 'writer',
      type: 'user',
      emailAddress: 'support@postify.co.il',
      transferOwnership: true
    },
    fields: 'id',
  });

  fs.writeFileSync(path.join(__dirname, 'spreadsheet-cost.json'), JSON.stringify({ id: spreadsheetId }, null, 2));
  console.log('📄 spreadsheet-cost.json saved.');
}

createCostLogSheet().catch(err => {
  console.error("❌ Error creating cost log sheet:", err.message);
});
