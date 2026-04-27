// auto-switch-firebase-env.js
// Automatically switches Firebase configurations based on Angular environment
// Called during build process - no manual intervention needed

const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Get build environment from command line argument
const buildEnv = process.argv[2] || 'development';

// Map Angular environments to Firebase environments
const firebaseEnvMap = {
  development: 'staging', // npm run build:dev → staging Firebase
  staging: 'staging', // npm run build:staging → staging Firebase
  production: 'production', // npm run build → production Firebase
};

const firebaseEnv = firebaseEnvMap[buildEnv];

if (!firebaseEnv) {
  log(`❌ Unknown build environment: ${buildEnv}`, colors.red);
  process.exit(1);
}

const projectRoot = path.dirname(__dirname); // Go up from scripts/ to mobile/
const configDir = path.join(projectRoot, 'firebase-configs');

log(`🔄 Auto-switching Mobile Firebase to: ${firebaseEnv} (Angular: ${buildEnv})`, colors.blue);

// Switch iOS configuration
const iOSSource = path.join(configDir, firebaseEnv, 'ios', 'GoogleService-Info.plist');
const iOSTargets = [
  path.join(projectRoot, 'ios', 'App', 'App', 'GoogleService-Info.plist'),
  path.join(projectRoot, 'ios', 'App', 'GoogleService-Info.plist'),
];

if (fs.existsSync(iOSSource)) {
  iOSTargets.forEach((target) => {
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(iOSSource, target);
  });
  log(`✅ iOS: Switched to ${firebaseEnv}`, colors.green);
} else {
  log(`⚠️  iOS: ${firebaseEnv} config not found`, colors.yellow);
}

// Switch Android configuration
const androidSource = path.join(configDir, firebaseEnv, 'android', 'google-services.json');
const androidTarget = path.join(projectRoot, 'android', 'app', 'google-services.json');

if (fs.existsSync(androidSource)) {
  const targetDir = path.dirname(androidTarget);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.copyFileSync(androidSource, androidTarget);
  log(`✅ Android: Switched to ${firebaseEnv}`, colors.green);
} else {
  log(`⚠️  Android: ${firebaseEnv} config not found`, colors.yellow);
}

// Verify bundle/package ID consistency
function verifyBundleId(configPath, expectedId, platform) {
  if (!fs.existsSync(configPath)) return false;

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    if (platform === 'ios') {
      return content.includes(`<string>${expectedId}</string>`);
    } else {
      return content.includes(`"package_name": "${expectedId}"`);
    }
  } catch (error) {
    return false;
  }
}

const expectedIosBundleId = 'com.nxt1sports.nxt1';
const expectedAndroidBundleId = 'com.nxt1sports.app.twa';

// Verify configurations
const iOSValid = verifyBundleId(iOSTargets[0], expectedIosBundleId, 'ios');
const androidValid = verifyBundleId(androidTarget, expectedAndroidBundleId, 'android');

if (iOSValid && androidValid) {
  log(`🎉 Environment: ${firebaseEnv} (IOS Bundle ID: ${expectedIosBundleId})`, colors.green);
  log(
    `🎉 Environment: ${firebaseEnv} Android (Bundle ID: ${expectedAndroidBundleId})`,
    colors.green
  );
} else {
  if (!iOSValid) log(`❌ iOS Bundle ID mismatch in ${firebaseEnv}`, colors.red);
  if (!androidValid) log(`❌ Android Package Name mismatch in ${firebaseEnv}`, colors.red);
}

log(`🚀 Ready for ${buildEnv} build!`, colors.bright);

// ─── Environment-specific native config ───────────────────────────────────────
// Determines whether this is a production build to configure:
//   • capacitor.config.json  → android.webContentsDebuggingEnabled
//   • App.entitlements       → aps-environment (iOS push notifications)
const isProduction = firebaseEnv === 'production';

// 1. Update capacitor.config.json — android.webContentsDebuggingEnabled
const capacitorConfigPath = path.join(projectRoot, 'capacitor.config.json');
if (fs.existsSync(capacitorConfigPath)) {
  try {
    const capConfig = JSON.parse(fs.readFileSync(capacitorConfigPath, 'utf8'));
    if (!capConfig.android) capConfig.android = {};
    capConfig.android.webContentsDebuggingEnabled = !isProduction;
    fs.writeFileSync(capacitorConfigPath, JSON.stringify(capConfig, null, 2) + '\n');
    log(
      `✅ capacitor.config.json: webContentsDebuggingEnabled = ${!isProduction} (${firebaseEnv})`,
      isProduction ? colors.green : colors.yellow
    );
  } catch (err) {
    log(`❌ Failed to update capacitor.config.json: ${err.message}`, colors.red);
  }
} else {
  log(`⚠️  capacitor.config.json not found`, colors.yellow);
}

// 2. Update App.entitlements — aps-environment
const entitlementsPath = path.join(projectRoot, 'ios', 'App', 'App', 'App.entitlements');
if (fs.existsSync(entitlementsPath)) {
  try {
    let entitlements = fs.readFileSync(entitlementsPath, 'utf8');
    const apsEnv = isProduction ? 'production' : 'development';
    // Replace the value after the aps-environment key
    entitlements = entitlements.replace(
      /(<key>aps-environment<\/key>\s*<string>)(development|production)(<\/string>)/,
      `$1${apsEnv}$3`
    );
    fs.writeFileSync(entitlementsPath, entitlements);
    log(
      `✅ App.entitlements: aps-environment = ${apsEnv} (${firebaseEnv})`,
      isProduction ? colors.green : colors.yellow
    );
  } catch (err) {
    log(`❌ Failed to update App.entitlements: ${err.message}`, colors.red);
  }
} else {
  log(`⚠️  App.entitlements not found at ${entitlementsPath}`, colors.yellow);
}
