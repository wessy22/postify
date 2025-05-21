const https = require("https");

function getInstanceName(callback) {
  const options = {
    hostname: 'metadata.google.internal',
    path: '/computeMetadata/v1/instance/name',
    headers: { 'Metadata-Flavor': 'Google' }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      callback(null, data.trim());
    });
  });

  req.on('error', (err) => {
    callback(err);
  });

  req.end();
}

getInstanceName((err, name) => {
  if (err) {
    console.error("❌ שגיאה בגישה ל-metadata:", err.message);
  } else {
    console.log("🖥️ שם השרת מה-Metadata:", name);
  }
});
