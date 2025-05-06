const https = require('https');
const os = require('os');

function getInstanceName() {
  return new Promise((resolve, reject) => {
    console.log('🔍 Attempting to get instance name from Google Cloud Metadata...');
    const options = {
      // This is a static IP address used by Google Cloud metadata service
      // It's a link-local address (169.254.0.0/16) that's guaranteed to be available
      // on all Google Cloud instances. This address never changes.
      hostname: '169.254.169.254',
      path: '/computeMetadata/v1/instance/name',
      headers: { 'Metadata-Flavor': 'Google' },
      rejectUnauthorized: false // Allow self-signed certificates
    };

    console.log('📡 Making request to metadata service...');
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

    // Set a timeout of 5 seconds
    req.setTimeout(5000, () => {
      console.log('⏰ Request timed out');
      req.destroy();
      reject(new Error('Timeout getting instance name from metadata.'));
    });
  });
}

module.exports = getInstanceName; 