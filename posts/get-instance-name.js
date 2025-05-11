const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

function getInstanceName() {
  return new Promise((resolve) => {
    console.log('🔍 Checking if running on Google Cloud...');

    const checkOptions = {
      hostname: '169.254.169.254',
      path: '/computeMetadata/v1/',
      headers: { 'Metadata-Flavor': 'Google' },
      timeout: 1000
    };

    const checkReq = http.get(checkOptions, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Running on Google Cloud, getting instance name...');
        const options = {
          hostname: '169.254.169.254',
          path: '/computeMetadata/v1/instance/name',
          headers: { 'Metadata-Flavor': 'Google' }
        };

        const req = http.get(options, (res) => {
          let data = '';
          res.on('data', chunk => {
            data += chunk;
            console.log('📦 Received data chunk');
          });
          res.on('end', () => {
            const name = data.trim();
            if (name) {
              console.log(`📝 Received data: "${name}"`);
              console.log('✅ Successfully got instance name');
              resolve(name);
            } else {
              const fallback = os.hostname();
              console.log('❌ No instance name found, using local:', fallback);
              resolve(fallback);
            }
          });
        });

        req.on('error', () => {
          const fallback = os.hostname();
          console.log('❌ Request error, using local:', fallback);
          resolve(fallback);
        });

        req.setTimeout(5000, () => {
          req.destroy();
          const fallback = os.hostname();
          console.log('⏰ Request timed out, using local:', fallback);
          resolve(fallback);
        });
      } else {
        const fallback = os.hostname();
        console.log('❌ Not on Google Cloud, using local:', fallback);
        resolve(fallback);
      }
    });

    checkReq.on('error', () => {
      const fallback = os.hostname();
      console.log('❌ Not on Google Cloud (connection error), using local:', fallback);
      resolve(fallback);
    });

    checkReq.setTimeout(1000, () => {
      checkReq.destroy();
      const fallback = os.hostname();
      console.log('⏰ Check timed out, using local:', fallback);
      resolve(fallback);
    });
  });
}

// אם הקובץ מופעל ישירות
if (require.main === module) {
  getInstanceName()
    .then(name => {
      console.log('Instance name:', name);
      const filePath = path.join(__dirname, 'instance-name.txt');
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('🗑️ Deleted old instance-name.txt');
        }
        fs.writeFileSync(filePath, name.trim(), 'utf-8');
        console.log(`📝 Created instance-name.txt with value: ${name}`);
      } catch (e) {
        console.error('❌ Failed to write instance-name.txt:', e.message);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = getInstanceName;
