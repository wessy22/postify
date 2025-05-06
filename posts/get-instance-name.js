const https = require('https');
const os = require('os');

function getInstanceName() {
  return new Promise((resolve, reject) => {
    const options = {
      // This is a static IP address used by Google Cloud metadata service
      // It's a link-local address (169.254.0.0/16) that's guaranteed to be available
      // on all Google Cloud instances. This address never changes.
      hostname: '169.254.169.254',
      path: '/computeMetadata/v1/instance/name',
      headers: { 'Metadata-Flavor': 'Google' }
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const name = data.trim();
        if (name) {
          resolve(name);
        } else {
          console.log('⚠️ No instance name found in metadata, using local computer name');
          resolve(os.hostname());
        }
      });
    });

    req.on('error', (err) => {
      console.log('⚠️ Failed to get instance name from metadata, using local computer name:', err.message);
      resolve(os.hostname());
    });

    // Set a timeout of 2 seconds
    req.setTimeout(2000, () => {
      console.log('⚠️ Timeout getting instance name from metadata, using local computer name');
      req.destroy();
      resolve(os.hostname());
    });
  });
}

module.exports = getInstanceName; 