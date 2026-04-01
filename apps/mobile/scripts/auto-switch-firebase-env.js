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
