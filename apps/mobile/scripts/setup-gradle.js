#!/usr/bin/env node
/**
 * Cross-platform Gradle Setup Script
 * Ensures gradle.properties is configured correctly for the current OS
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const gradlePropertiesPath = path.join(__dirname, '..', 'android', 'gradle.properties');

console.log('🔧 Checking gradle.properties for platform compatibility...');

// Read current gradle.properties
let content = fs.readFileSync(gradlePropertiesPath, 'utf8');

// Check if there's a hardcoded org.gradle.java.home path
const javaHomeRegex = /^org\.gradle\.java\.home=.*$/m;
const match = content.match(javaHomeRegex);

if (match) {
  const currentPath = match[0];
  const isMacPath = currentPath.includes('/usr/local') || currentPath.includes('/opt/homebrew');
  const isWindowsPath = currentPath.includes('C:\\') || currentPath.includes('Program Files');

  const platform = os.platform();

  if (platform === 'darwin' && isWindowsPath) {
    console.warn('⚠️  Warning: Windows Java path detected on macOS');
    console.log('   Commenting out to let Gradle auto-detect Java');
    content = content.replace(javaHomeRegex, '# $&\n# ⬆️ Auto-commented - let Gradle detect Java');
  } else if (platform === 'win32' && isMacPath) {
    console.warn('⚠️  Warning: macOS Java path detected on Windows');
    console.log('   Commenting out to let Gradle auto-detect Java');
    content = content.replace(javaHomeRegex, '# $&\n# ⬆️ Auto-commented - let Gradle detect Java');
  } else {
    console.log('✅ gradle.properties is already configured correctly');
    process.exit(0);
  }

  // Write updated content
  fs.writeFileSync(gradlePropertiesPath, content, 'utf8');
  console.log('✅ Fixed gradle.properties for', platform === 'win32' ? 'Windows' : 'macOS');
} else {
  console.log('✅ No hardcoded Java path found - Gradle will auto-detect');
}
