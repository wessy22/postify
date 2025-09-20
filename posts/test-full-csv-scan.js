const fs = require('fs');
const path = require('path');

// קריאת קובץ CSV ובדיקת המבנה הבסיסי
function readGroupsFromCSV(csvPath) {
  try {
    console.log(`📖 קורא קבוצות מקובץ CSV: ${csvPath}`);
    
    if (!fs.existsSync(csvPath)) {
      throw new Error(`קובץ CSV לא נמצא: ${csvPath}`);
    }

    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);
    
    const groups = lines.map(url => {
      if (!url.startsWith('http')) {
        url = 'https://www.facebook.com/groups/' + url;
      }
      
      const urlParts = url.split('/');
      const groupId = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
      
      return {
        name: '',
        url: url,
        groupId: groupId
      };
    });

    console.log(`✅ נקראו ${groups.length} קבוצות מהקובץ CSV`);
    
    return groups;
  } catch (error) {
    console.error(`❌ שגיאה בקריאת קובץ CSV: ${error.message}`);
    return [];
  }
}

// בדיקת קובץ instance-name
function checkInstanceName() {
  const instanceNameFile = path.join(__dirname, 'instance-name.txt');
  if (fs.existsSync(instanceNameFile)) {
    const instanceName = fs.readFileSync(instanceNameFile, 'utf8').trim();
    console.log(`✅ נמצא instance name: ${instanceName}`);
    return instanceName;
  } else {
    console.log(`⚠️ לא נמצא instance-name.txt, משתמש ב-'postify' כברירת מחדל`);
    return 'postify';
  }
}

// בדיקת קובץ config
function checkConfig() {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log(`✅ נמצא config.json`);
      console.log(`   Chrome path: ${config.chromePath || 'לא הוגדר'}`);
      console.log(`   User data dir: ${config.userDataDir || 'לא הוגדר'}`);
      return config;
    } catch (e) {
      console.error(`❌ שגיאה בקריאת config.json: ${e.message}`);
      return null;
    }
  } else {
    console.log(`❌ לא נמצא config.json`);
    return null;
  }
}

// סימולציה של סריקת קבוצות (בלי דפדפן אמיתי)
function simulateGroupScanning(groups, instanceName) {
  console.log(`\n🎯 מתחיל סימולציה של סריקת ${groups.length} קבוצות`);
  
  const scannedGroups = groups.map((group, index) => {
    const simulatedGroup = {
      ...group,
      name: `קבוצה ${index + 1} - דוגמה`,
      members: `${Math.floor(Math.random() * 10000) + 100} חברים`,
      image: Math.random() > 0.5 ? `https://example.com/image${index + 1}.jpg` : null
    };
    
    console.log(`✅ [${index + 1}/${groups.length}] סורק: ${simulatedGroup.name} | ${simulatedGroup.members}`);
    return simulatedGroup;
  });
  
  // יצירת קבצי JSON
  console.log('\n💾 יוצר קבצי JSON...');
  
  // קובץ RAW
  const rawJson = JSON.stringify(scannedGroups, null, 2);
  fs.writeFileSync('groups-details-csv-raw.json', rawJson);
  console.log('✅ נשמר: groups-details-csv-raw.json');
  
  // קובץ נקי לפי instance
  const instanceFilePath = `groups-csv-${instanceName}.json`;
  fs.writeFileSync(instanceFilePath, rawJson);
  console.log(`✅ נשמר: ${instanceFilePath}`);
  
  // קובץ נוסף
  fs.writeFileSync('groups-postify-csv.json', rawJson);
  console.log('✅ נשמר: groups-postify-csv.json');
  
  return scannedGroups;
}

// הרצת הבדיקה
console.log('🚀 בודק את הקוד החדש לסריקת קבוצות מ-CSV\n');

const csvPath = path.join(__dirname, 'groups-list.csv');
const instanceName = checkInstanceName();
const config = checkConfig();
const groups = readGroupsFromCSV(csvPath);

if (groups.length > 0) {
  const scannedGroups = simulateGroupScanning(groups, instanceName);
  
  console.log('\n📊 סיכום הסריקה המדומה:');
  console.log(`✅ סה"כ קבוצות שנסרקו: ${scannedGroups.length}`);
  console.log(`📁 קבצי JSON שנוצרו:`);
  console.log(`   - groups-details-csv-raw.json`);
  console.log(`   - groups-csv-${instanceName}.json`);
  console.log(`   - groups-postify-csv.json`);
  
  console.log('\n🔍 דוגמה לתוצאה:');
  console.log(JSON.stringify(scannedGroups[0], null, 2));
  
} else {
  console.log('❌ לא נמצאו קבוצות לסריקה');
}

console.log('\n✅ בדיקה הושלמה!');