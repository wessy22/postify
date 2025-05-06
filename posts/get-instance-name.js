const http = require('http');
const os = require('os');

function getInstanceName() {
  return new Promise((resolve, reject) => {
    console.log('🔍 Checking if running on Google Cloud...');
    
    // First check if we can reach the metadata server
    const checkOptions = {
      hostname: '169.254.169.254',
      path: '/computeMetadata/v1/',
      headers: { 'Metadata-Flavor': 'Google' },
      timeout: 1000 // Quick timeout for the check
    };

    const checkReq = http.get(checkOptions, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Running on Google Cloud, getting instance name...');
        // We're on Google Cloud, get the instance name
        const options = {
          hostname: '169.254.169.254',
          path: '/computeMetadata/v1/instance/name',
          headers: { 'Metadata-Flavor': 'Google' }
        };

        const req = http.get(options, (res) => {
          console.log(`📥 Response status: ${res.statusCode}`);
          let data = '';
          res.on('data', chunk => {
            data += chunk;
            console.log('📦 Received data chunk');
          });
          res.on('end', () => {
            const name = data.trim();
            console.log(`📝 Received data: "${name}"`);
            if (name) {
              console.log('✅ Successfully got instance name');
              resolve(name);
            } else {
              console.log('❌ No instance name found in response');
              // אם לא מצאנו שם בשרת, נשתמש בשם המחשב המקומי
              const localName = os.hostname();
              console.log(`ℹ️ Using local computer name: ${localName}`);
              resolve(localName);
            }
          });
        });

        req.on('error', (err) => {
          console.log('❌ Request error:', err.message);
          // אם יש שגיאה בקבלת שם השרת, נשתמש בשם המחשב המקומי
          const localName = os.hostname();
          console.log(`ℹ️ Using local computer name: ${localName}`);
          resolve(localName);
        });

        req.setTimeout(5000, () => {
          console.log('⏰ Request timed out');
          req.destroy();
          // אם יש timeout בקבלת שם השרת, נשתמש בשם המחשב המקומי
          const localName = os.hostname();
          console.log(`ℹ️ Using local computer name: ${localName}`);
          resolve(localName);
        });
      } else {
        console.log('❌ Not running on Google Cloud');
        // אם אנחנו לא על Google Cloud, נשתמש בשם המחשב המקומי
        const localName = os.hostname();
        console.log(`ℹ️ Using local computer name: ${localName}`);
        resolve(localName);
      }
    });

    checkReq.on('error', (err) => {
      console.log('❌ Not running on Google Cloud:', err.message);
      // אם יש שגיאה בחיבור לשרת ה-metadata, נשתמש בשם המחשב המקומי
      const localName = os.hostname();
      console.log(`ℹ️ Using local computer name: ${localName}`);
      resolve(localName);
    });

    checkReq.setTimeout(1000, () => {
      console.log('⏰ Check timed out - not running on Google Cloud');
      checkReq.destroy();
      // אם יש timeout בחיבור לשרת ה-metadata, נשתמש בשם המחשב המקומי
      const localName = os.hostname();
      console.log(`ℹ️ Using local computer name: ${localName}`);
      resolve(localName);
    });
  });
}

// אם הקובץ מופעל ישירות (לא מיובא)
if (require.main === module) {
  getInstanceName()
    .then(name => {
      console.log('Instance name:', name);
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = getInstanceName; 