const fs = require('fs');
const path = require('path');

function readGroupsFromCSV(csvPath) {
  try {
    console.log('📖 קורא קבוצות מקובץ CSV:', csvPath);
    
    if (!fs.existsSync(csvPath)) {
      throw new Error('קובץ CSV לא נמצא: ' + csvPath);
    }

    const csvData = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line);
    
    const groups = lines.map((url, index) => {
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

    console.log('✅ נקראו', groups.length, 'קבוצות מהקובץ CSV');
    console.log('🔍 קבוצות שנקראו:');
    groups.forEach((group, index) => {
      console.log(`  ${index + 1}: ${group.url} (ID: ${group.groupId})`);
    });
    
    return groups;
  } catch (error) {
    console.error('❌ שגיאה בקריאת קובץ CSV:', error.message);
    return [];
  }
}

const csvPath = path.join(__dirname, 'groups-list.csv');
const groups = readGroupsFromCSV(csvPath);

console.log('\n📊 סיכום:');
console.log('מספר קבוצות שנקראו:', groups.length);
if (groups.length > 0) {
  console.log('דוגמה למבנה JSON שייווצר:');
  const exampleGroup = { 
    ...groups[0], 
    name: 'דוגמה לשם קבוצה',
    members: '1,234 חברים',
    image: 'https://example.com/image.jpg'
  };
  console.log(JSON.stringify(exampleGroup, null, 2));
}