const express = require('express');
const bodyParser = require('body-parser');
const { InstancesClient } = require('@google-cloud/compute');
const { CloudSchedulerClient } = require('@google-cloud/scheduler');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const computeClient = new InstancesClient({ keyFilename: './credentials.json' });
const schedulerClient = new CloudSchedulerClient({ keyFilename: './credentials.json' });

const projectId = 'sonorous-folio-399513';
const location = 'us-central1';
const zone = 'me-west1-b';
const snapshotName = 'backup-postify-yehiad';

app.post("/clone", async (req, res) => {
  const { serverName } = req.body;

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
      }]
    }
  });

  const jobName = `start-${serverName}`;
  const parent = schedulerClient.locationPath(projectId, location);
  const instanceUrl = `https://compute.googleapis.com/compute/v1/projects/${projectId}/zones/${zone}/instances/${serverName}/start`;

  const job = {
    name: `${parent}/jobs/${jobName}`,
    schedule: '5 9 * * *',
    timeZone: 'Asia/Jerusalem',
    httpTarget: {
      uri: instanceUrl,
      httpMethod: 'POST',
      oauthToken: {
        serviceAccountEmail: 'YOUR_SERVICE_ACCOUNT@your-project.iam.gserviceaccount.com'
      }
    }
  };

  try {
    await schedulerClient.createJob({ parent, job });
    res.send(`✅ השרת '${serverName}' שוכפל ויופעל כל יום ב־9:05.`);
  } catch (err) {
    console.error("❌ Job Error:", err.message);
    res.send(`✅ השרת נוצר אך שגיאה ביצירת Job: ${err.message}`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 פתוח בכתובת http://localhost:${PORT}/clone.html`);
});
