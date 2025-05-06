const https = require('https');

function getInstanceName() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'metadata.google.internal',
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