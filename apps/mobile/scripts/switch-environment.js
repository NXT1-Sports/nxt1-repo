#!/usr/bin/env node

/**
 * Switch Mobile App Environment
 *
 * Manages Firebase configs and Capacitor configs for different environments
 * Usage: node scripts/switch-environment.js [staging|production]
 */

const fs = require('fs');
const path = require('path');

const ENVIRONMENTS = {
  staging: {
    name: 'staging',
    ios: {
      bundleId: 'com.nxt1.sports',
      configPath: 'firebase-configs/staging/ios/GoogleService-Info.plist',
      targetPath: 'ios/App/App/GoogleService-Info.plist',
    },
    android: {
      packageName: 'com.nxt1.sports',
      configPath: 'firebase-configs/staging/android/google-services.json',
      targetPath: 'android/app/google-services.json',
    },
    capacitorConfig: 'capacitor.config.staging.json',
    firebaseProject: 'nxt-1-staging',
  },
  production: {
    name: 'production',
    ios: {
      bundleId: 'com.nxt1sports.nxt1',
      configPath: 'firebase-configs/production/ios/GoogleService-Info.plist',
      targetPath: 'ios/App/App/GoogleService-Info.plist',
    },
    android: {
      packageName: 'com.nxt1sports.nxt1',
      configPath: 'firebase-configs/production/android/google-services.json',
      targetPath: 'android/app/google-services.json',
    },
    capacitorConfig: 'capacitor.config.prod.json',
    firebaseProject: 'nxt-1-de054',
  },
};

function copyFile(source, target) {
  const sourcePath = path.resolve(source);
  const targetPath = path.resolve(target);

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }

  fs.copyFileSync(sourcePath, targetPath);
  console.log(`✅ Copied: ${source} → ${target}`);
}

function switchEnvironment(envName) {
  const env = ENVIRONMENTS[envName];

  if (!env) {
    console.error(`❌ Invalid environment: ${envName}`);
    console.log(`Valid options: ${Object.keys(ENVIRONMENTS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n🔄 Switching to ${env.name.toUpperCase()} environment...\n`);

  try {
    // Copy iOS Firebase config
    console.log('📱 iOS Configuration:');
    copyFile(env.ios.configPath, env.ios.targetPath);
    console.log(`   Bundle ID: ${env.ios.bundleId}\n`);

    // Copy Android Firebase config
    console.log('🤖 Android Configuration:');
    copyFile(env.android.configPath, env.android.targetPath);
    console.log(`   Package: ${env.android.packageName}\n`);

    // Copy Capacitor config
    console.log('⚙️  Capacitor Configuration:');
    copyFile(env.capacitorConfig, 'capacitor.config.json');
    console.log(`   Config: ${env.capacitorConfig}\n`);

    console.log(`✨ Environment switched to ${env.name.toUpperCase()}`);
    console.log(`   Firebase Project: ${env.firebaseProject}`);
    console.log('\n📝 Next steps:');
    console.log('   1. Run: npx cap sync');
    console.log('   2. Rebuild your app');
    console.log(`   3. iOS: Select "${env.ios.bundleId}" in Xcode`);
    console.log(`   4. Android: Build with "${envName}Release" or "${envName}Debug" variant\n`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Main
const envArg = process.argv[2];

if (!envArg) {
  console.error('❌ Missing environment argument');
  console.log('\nUsage: node scripts/switch-environment.js [staging|production]');
  console.log('\nExamples:');
  console.log('  node scripts/switch-environment.js staging');
  console.log('  node scripts/switch-environment.js production');
  process.exit(1);
}

switchEnvironment(envArg);
