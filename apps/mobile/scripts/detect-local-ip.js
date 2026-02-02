#!/usr/bin/env node
/**
 * @fileoverview Auto-detect local IP address for mobile development
 *
 * This script automatically detects your machine's local IP address
 * and injects it into environment.ts for local development.
 *
 * Usage:
 * - node scripts/detect-local-ip.js
 * - Automatically runs before dev builds
 */

const { networkInterfaces } = require('os');
const fs = require('fs');
const path = require('path');

/**
 * Get the local IP address of the machine
 * Prioritizes WiFi/Ethernet interfaces
 */
function getLocalIpAddress() {
  const nets = networkInterfaces();

  // Priority order for network interfaces
  const interfacePriority = ['en0', 'eth0', 'wlan0', 'Wi-Fi', 'Ethernet'];

  // Try prioritized interfaces first
  for (const interfaceName of interfacePriority) {
    if (nets[interfaceName]) {
      for (const net of nets[interfaceName]) {
        // Skip internal and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }

  // Fallback: search all interfaces
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }

  // Last resort: return localhost
  return 'localhost';
}

/**
 * Inject detected IP into environment.ts file
 */
function injectIpIntoEnvironment(ipAddress) {
  const envFilePath = path.join(__dirname, '..', 'src', 'environments', 'environment.ts');

  if (!fs.existsSync(envFilePath)) {
    console.error('❌ Error: environment.ts not found!');
    process.exit(1);
  }

  let content = fs.readFileSync(envFilePath, 'utf8');

  // Replace the DETECTED_LOCAL_IP constant value
  const regex = /const DETECTED_LOCAL_IP = ['"].*?['"];/;
  const replacement = `const DETECTED_LOCAL_IP = '${ipAddress}';`;

  if (!regex.test(content)) {
    console.error('❌ Error: Could not find DETECTED_LOCAL_IP constant in environment.ts');
    process.exit(1);
  }

  content = content.replace(regex, replacement);

  fs.writeFileSync(envFilePath, content, 'utf8');

  return envFilePath;
}

// Main execution
function main() {
  console.log('🔍 Detecting local IP address for development...\n');

  const ipAddress = getLocalIpAddress();

  console.log(`✅ Detected IP: ${ipAddress}`);

  if (ipAddress === 'localhost') {
    console.log('⚠️  Warning: Could not detect network IP. Using localhost.');
    console.log('   This will only work with emulator/simulator, not physical devices.\n');
  } else {
    console.log('✅ This IP will work with physical devices on the same network.\n');
  }

  const filePath = injectIpIntoEnvironment(ipAddress);
  console.log(`📝 Updated: ${path.relative(process.cwd(), filePath)}`);

  console.log(`\n🎯 Development backend URL: http://${ipAddress}:3000/api/v1/staging`);
  console.log('\n✅ Ready for local development!');
  console.log('   To use staging domain instead, run: npm run dev:staging\n');
}

main();
