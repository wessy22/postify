const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_USER_DATA_PATH = path.join(
  os.homedir(),
  'AppData',
  'Local',
  'Google',
  'Chrome',
  'User Data'
);

const getEmailFromPreferences = (profilePath) => {
  try {
    const prefPath = path.join(profilePath, 'Preferences');
    if (!fs.existsSync(prefPath)) return null;

    const data = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
    const email =
      data.account_info?.[0]?.email ||
      data.profile?.gaia_info?.email ||
      data.profile?.user_name ||
      null;

    return email;
  } catch (err) {
    return null;
  }
};

const main = () => {
  const profiles = fs.readdirSync(CHROME_USER_DATA_PATH).filter((dir) =>
    dir === 'Default' || dir.startsWith('Profile')
  );

  console.log(`🔍 Found ${profiles.length} Chrome profiles:\n`);

  profiles.forEach((profileDir) => {
    const fullPath = path.join(CHROME_USER_DATA_PATH, profileDir);
    const email = getEmailFromPreferences(fullPath);

    if (email) {
      console.log(`📌 ${profileDir}: ${email}`);
    } else {
      console.log(`📌 ${profileDir}: (No email found)`);
    }
  });
};

main();