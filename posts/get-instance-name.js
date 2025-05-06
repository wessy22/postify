const https = require('https');

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

    https.get(options, (res) => {
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
    }).on('error', (err) => {
      reject(new Error('Failed to get instance name from metadata: ' + err.message));
    });
  });
}

module.exports = getInstanceName; 