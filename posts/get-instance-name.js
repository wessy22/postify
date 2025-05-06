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
          reject(new Error('No instance name found in metadata.'));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error('Failed to get instance name from metadata: ' + err.message));
    });

    // Set a timeout of 2 seconds
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('Timeout getting instance name from metadata.'));
    });
  });
}

module.exports = getInstanceName; 