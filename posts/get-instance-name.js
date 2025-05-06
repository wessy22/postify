const https = require('https');
const os = require('os');

function getInstanceName() {
  return new Promise((resolve, reject) => {
    console.log('🔍 Checking if running on Google Cloud...');
    
    // First check if we can reach the metadata server
    const checkOptions = {
      hostname: '169.254.169.254',
      path: '/computeMetadata/v1/',
      headers: { 'Metadata-Flavor': 'Google' },
      rejectUnauthorized: false,
      timeout: 1000 // Quick timeout for the check
    };

    const checkReq = https.get(checkOptions, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Running on Google Cloud, getting instance name...');
        // We're on Google Cloud, get the instance name
        const options = {
          hostname: '169.254.169.254',
          path: '/computeMetadata/v1/instance/name',
          headers: { 'Metadata-Flavor': 'Google' },
          rejectUnauthorized: false
        };

        const req = https.get(options, (res) => {
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
              reject(new Error('No instance name found in metadata.'));
            }
          });
        });

        req.on('error', (err) => {
          console.log('❌ Request error:', err.message);
          reject(new Error('Failed to get instance name from metadata: ' + err.message));
        });

        req.setTimeout(5000, () => {
          console.log('⏰ Request timed out');
          req.destroy();
          reject(new Error('Timeout getting instance name from metadata.'));
        });
      } else {
        console.log('❌ Not running on Google Cloud');
        reject(new Error('Not running on Google Cloud'));
      }
    });

    checkReq.on('error', (err) => {
      console.log('❌ Not running on Google Cloud:', err.message);
      reject(new Error('Not running on Google Cloud'));
    });

    checkReq.setTimeout(1000, () => {
      console.log('⏰ Check timed out - not running on Google Cloud');
      checkReq.destroy();
      reject(new Error('Not running on Google Cloud'));
    });
  });
}

module.exports = getInstanceName; 