
const express = require('express');
const bodyParser = require('body-parser');
const { InstancesClient } = require('@google-cloud/compute');
const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

const computeClient = new InstancesClient({
  keyFilename: './credentials.json'
});

const projectId = 'sonorous-folio-399513';
const zone = 'me-west1-b';
const snapshotName = 'instance-20250422-1-me-west1-b-20250503095444-j8548i4q';

app.post("/clone", async (req, res) => {
  const { serverName, postEmail } = req.body;

  const [response] = await computeClient.insert({
    project: projectId,
    zone,
    instanceResource: {
      name: serverName,
      machineType: `zones/${zone}/machineTypes/e2-medium`,
      disks: [{
        boot: true,
        autoDelete: true,
        initializeParams: {
          sourceSnapshot: `projects/${projectId}/global/snapshots/${snapshotName}`
        }
      }],
      networkInterfaces: [{
        network: "global/networks/default",
        accessConfigs: [{ type: "ONE_TO_ONE_NAT", name: "External NAT" }]
      }],
      metadata: {
        items: [{
          key: "startup-script",
          value: `
            cd /postify/posts
            sed -i "s/to: \".*\"/to: \"${postEmail}\"/" mailer.js
            rm -rf images/*
            rm -f post*.json
            shutdown -r +1
          `
        }]
      }
    }
  });

  res.send("✅ השרת החדש נוצר מתוך snapshot ויתחיל לפעול תוך דקות.");
});

app.listen(PORT, () => {
  console.log(`🚀 Server ready at http://localhost:${PORT}`);
});
