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

function readPlistValue(plistPath, key) {
  if (!fs.existsSync(plistPath)) return null;

  const content = fs.readFileSync(plistPath, 'utf8');
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(
    new RegExp(`<key>${escapedKey}<\\/key>\\s*<string>([^<]+)<\\/string>`)
  );
  return match?.[1] ?? null;
}

function updateIosGoogleUrlScheme(infoPlistPath, reversedClientId, activeFirebaseEnv) {
  if (!fs.existsSync(infoPlistPath)) {
    log(`⚠️  iOS Info.plist not found at ${infoPlistPath}`, colors.yellow);
    return false;
  }

  if (!reversedClientId) {
    log(`❌ Missing REVERSED_CLIENT_ID for ${activeFirebaseEnv}`, colors.red);
    return false;
  }

  const googleUrlType = [
    '\t\t<dict>',
    '\t\t\t<key>CFBundleURLSchemes</key>',
    '\t\t\t<array>',
    `\t\t\t\t<string>${reversedClientId}</string>`,
    '\t\t\t</array>',
    '\t\t\t<key>CFBundleURLName</key>',
    '\t\t\t<string>Google Sign-In</string>',
    '\t\t</dict>',
  ].join('\n');

  const googleUrlTypePattern =
    /\t\t<dict>\n\t\t\t<key>CFBundleURLSchemes<\/key>\n\t\t\t<array>[\s\S]*?\n\t\t\t<\/array>\n\t\t\t<key>CFBundleURLName<\/key>\n\t\t\t<string>Google Sign-In<\/string>\n\t\t<\/dict>/;

  const content = fs.readFileSync(infoPlistPath, 'utf8');
  if (!googleUrlTypePattern.test(content)) {
    log(`❌ Could not locate Google Sign-In URL type in ${infoPlistPath}`, colors.red);
    return false;
  }

  const nextContent = content.replace(googleUrlTypePattern, googleUrlType);
  fs.writeFileSync(infoPlistPath, nextContent);
  log(
    `✅ Info.plist: Google Sign-In URL scheme = ${reversedClientId} (${activeFirebaseEnv})`,
    colors.green
  );
  return true;
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

let iOSCopied = false;
if (fs.existsSync(iOSSource)) {
  iOSTargets.forEach((target) => {
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.copyFileSync(iOSSource, target);
  });
  iOSCopied = true;
  log(`✅ iOS: Switched to ${firebaseEnv}`, colors.green);
} else {
  log(`⚠️  iOS: ${firebaseEnv} config not found`, colors.yellow);
}

const iOSInfoPlistPath = path.join(projectRoot, 'ios', 'App', 'App', 'Info.plist');
const reversedClientId = readPlistValue(iOSSource, 'REVERSED_CLIENT_ID');
const iOSUrlSchemeValid = updateIosGoogleUrlScheme(iOSInfoPlistPath, reversedClientId, firebaseEnv);

// Switch Android configuration
const androidSource = path.join(configDir, firebaseEnv, 'android', 'google-services.json');
const androidTarget = path.join(projectRoot, 'android', 'app', 'google-services.json');

let androidCopied = false;
if (fs.existsSync(androidSource)) {
  const targetDir = path.dirname(androidTarget);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  fs.copyFileSync(androidSource, androidTarget);
  androidCopied = true;
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

// ─── Auto-correct appId in capacitor.config.ts ────────────────────────────────
// The appId must always contain the exact expected string literals.
// If someone accidentally commits wrong appId values, this restores them.
const capacitorTsPath = path.join(projectRoot, 'capacitor.config.ts');
let appIdFixed = true;
if (fs.existsSync(capacitorTsPath)) {
  try {
    let capTs = fs.readFileSync(capacitorTsPath, 'utf8');
    const expectedAppIdLine = `appId: platform === 'android' ? '${expectedAndroidBundleId}' : '${expectedIosBundleId}'`;
    // Match the appId line regardless of what values are currently there
    const appIdPattern = /appId:\s*platform\s*===\s*'android'\s*\?\s*'[^']*'\s*:\s*'[^']*'/;
    if (appIdPattern.test(capTs)) {
      const current = capTs.match(appIdPattern)[0];
      if (current !== expectedAppIdLine) {
        capTs = capTs.replace(appIdPattern, expectedAppIdLine);
        fs.writeFileSync(capacitorTsPath, capTs);
        log(`🔧 capacitor.config.ts: appId restored to correct values`, colors.yellow);
        log(`   Android: ${expectedAndroidBundleId}`, colors.yellow);
        log(`   iOS:     ${expectedIosBundleId}`, colors.yellow);
      } else {
        log(`✅ capacitor.config.ts: appId values are correct`, colors.green);
      }
    } else {
      log(
        `⚠️  capacitor.config.ts: appId pattern not recognised — skipping auto-correct`,
        colors.yellow
      );
    }
  } catch (err) {
    log(`❌ Failed to verify/fix appId in capacitor.config.ts: ${err.message}`, colors.red);
    appIdFixed = false;
  }
}

// Verify configurations
const iOSValid = verifyBundleId(iOSTargets[0], expectedIosBundleId, 'ios');
const androidValid = verifyBundleId(androidTarget, expectedAndroidBundleId, 'android');
const configValid =
  iOSCopied && androidCopied && iOSValid && androidValid && iOSUrlSchemeValid && appIdFixed;

if (configValid) {
  log(`🎉 Environment: ${firebaseEnv} (IOS Bundle ID: ${expectedIosBundleId})`, colors.green);
  log(
    `🎉 Environment: ${firebaseEnv} Android (Bundle ID: ${expectedAndroidBundleId})`,
    colors.green
  );
} else {
  if (!iOSCopied) log(`❌ iOS Firebase config was not copied for ${firebaseEnv}`, colors.red);
  if (!androidCopied)
    log(`❌ Android Firebase config was not copied for ${firebaseEnv}`, colors.red);
  if (!iOSValid) log(`❌ iOS Bundle ID mismatch in ${firebaseEnv}`, colors.red);
  if (!androidValid) log(`❌ Android Package Name mismatch in ${firebaseEnv}`, colors.red);
  if (!iOSUrlSchemeValid) log(`❌ iOS Google URL scheme mismatch in ${firebaseEnv}`, colors.red);
  if (!appIdFixed) log(`❌ capacitor.config.ts appId could not be verified`, colors.red);
  process.exit(1);
}

log(`🚀 Ready for ${buildEnv} build!`, colors.bright);

// ─── Environment-specific native config ───────────────────────────────────────
// Determines whether this is a production build to configure:
//   • capacitor.config.json  → android.webContentsDebuggingEnabled
//   • App.entitlements       → aps-environment (iOS push notifications)
const isProduction = firebaseEnv === 'production';

// 1. Update capacitor config — android.webContentsDebuggingEnabled
// Supports both capacitor.config.json (legacy) and capacitor.config.ts (current)
const capacitorConfigJsonPath = path.join(projectRoot, 'capacitor.config.json');
const capacitorConfigTsPath = path.join(projectRoot, 'capacitor.config.ts');
const capacitorConfigPath = fs.existsSync(capacitorConfigJsonPath)
  ? capacitorConfigJsonPath
  : fs.existsSync(capacitorConfigTsPath)
    ? capacitorConfigTsPath
    : null;

if (capacitorConfigPath) {
  try {
    const capacitorConfig = fs.readFileSync(capacitorConfigPath, 'utf8');
    // Match both JSON ("key": value) and TypeScript (key: value) syntax
    const debuggingFlagPattern = /("?webContentsDebuggingEnabled"?\s*:\s*)(true|false)/;
    if (!debuggingFlagPattern.test(capacitorConfig)) {
      throw new Error('webContentsDebuggingEnabled was not found');
    }

    const nextCapacitorConfig = capacitorConfig.replace(debuggingFlagPattern, `$1${!isProduction}`);

    if (nextCapacitorConfig !== capacitorConfig) {
      fs.writeFileSync(capacitorConfigPath, nextCapacitorConfig);
    }

    const configFileName = path.basename(capacitorConfigPath);
    log(
      `✅ ${configFileName}: webContentsDebuggingEnabled = ${!isProduction} (${firebaseEnv})`,
      isProduction ? colors.green : colors.yellow
    );
  } catch (err) {
    log(`❌ Failed to update capacitor config: ${err.message}`, colors.red);
    process.exit(1);
  }
} else {
  log(`⚠️  Neither capacitor.config.json nor capacitor.config.ts found`, colors.yellow);
  process.exit(1);
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
