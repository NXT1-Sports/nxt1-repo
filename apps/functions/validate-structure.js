#!/usr/bin/env node
/**
 * Validation Script - Check Functions structure before deployment
 * Ensures no basic errors before build
 */

const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'src');
const errors = [];
const warnings = [];
const success = [];

console.log('🔍 VALIDATING FIREBASE FUNCTIONS STRUCTURE\n');
console.log('='.repeat(60));

// 1. Check required folder structure
console.log('\n📁 Checking folder structure...');
const requiredFolders = ['auth', 'monitoring', 'notification', 'scheduled', 'user', 'util'];
const optionalFolders = [];

requiredFolders.forEach((folder) => {
  const folderPath = path.join(srcPath, folder);
  if (fs.existsSync(folderPath)) {
    success.push(`✅ Folder ${folder}/ exists`);
  } else {
    errors.push(`❌ Missing folder: ${folder}/`);
  }
});

optionalFolders.forEach((folder) => {
  const folderPath = path.join(srcPath, folder);
  if (fs.existsSync(folderPath)) {
    success.push(`✅ Folder ${folder}/ exists (optional)`);
  } else {
    warnings.push(`⚠️  Folder ${folder}/ not found (optional)`);
  }
});

// 2. Check index.ts file in each folder
console.log('\n📄 Checking index.ts exports...');
[...requiredFolders, ...optionalFolders].forEach((folder) => {
  const folderPath = path.join(srcPath, folder);
  if (!fs.existsSync(folderPath)) return;

  const indexPath = path.join(folderPath, 'index.ts');
  if (fs.existsSync(indexPath)) {
    const content = fs.readFileSync(indexPath, 'utf8');
    if (content.includes('export')) {
      success.push(`✅ ${folder}/index.ts has exports`);
    } else {
      warnings.push(`⚠️  ${folder}/index.ts has no exports`);
    }
  } else {
    errors.push(`❌ Missing file: ${folder}/index.ts`);
  }
});

// 3. Check src/index.ts (entry point)
console.log('\n🚪 Checking entry point...');
const mainIndexPath = path.join(srcPath, 'index.ts');
if (fs.existsSync(mainIndexPath)) {
  const content = fs.readFileSync(mainIndexPath, 'utf8');

  // Check admin init
  if (content.includes('admin.initializeApp()')) {
    success.push('✅ Firebase Admin is initialized');
  } else {
    errors.push('❌ Missing admin.initializeApp()');
  }

  // Check exports
  requiredFolders.forEach((folder) => {
    if (content.includes(`export * from './${folder}'`)) {
      success.push(`✅ Export module: ${folder}`);
    } else {
      warnings.push(`⚠️  Module not exported: ${folder}`);
    }
  });
} else {
  errors.push('❌ CRITICAL: Missing file src/index.ts');
}

// 4. Check package.json
console.log('\n📦 Checking package.json...');
const packageJsonPath = path.join(__dirname, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (pkg.main === 'lib/index.js') {
    success.push('✅ Main entry point: lib/index.js');
  } else {
    errors.push(`❌ Main must be "lib/index.js", current: ${pkg.main}`);
  }

  if (pkg.engines && pkg.engines.node) {
    success.push(`✅ Node version: ${pkg.engines.node}`);
  } else {
    warnings.push('⚠️  Node version not defined');
  }

  // Check dependencies
  const requiredDeps = ['firebase-admin', 'firebase-functions'];
  requiredDeps.forEach((dep) => {
    if (pkg.dependencies && pkg.dependencies[dep]) {
      success.push(`✅ Dependency: ${dep}`);
    } else {
      errors.push(`❌ Missing dependency: ${dep}`);
    }
  });
} else {
  errors.push('❌ CRITICAL: Missing package.json');
}

// 5. Check tsconfig.json
console.log('\n⚙️  Checking tsconfig.json...');
const tsconfigPath = path.join(__dirname, 'tsconfig.json');
if (fs.existsSync(tsconfigPath)) {
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));

  if (tsconfig.compilerOptions) {
    const opts = tsconfig.compilerOptions;

    if (opts.outDir === 'lib' || opts.outDir === './lib') {
      success.push('✅ Output directory: lib/');
    } else {
      errors.push(`❌ outDir must be "lib", current: ${opts.outDir}`);
    }

    if (opts.module === 'commonjs') {
      success.push('✅ Module format: commonjs');
    } else {
      warnings.push(`⚠️  Module should be "commonjs", current: ${opts.module}`);
    }
  }
} else {
  errors.push('❌ CRITICAL: Missing tsconfig.json');
}

// 6. Check firebase.json (at monorepo root)
console.log('\n🔥 Checking firebase.json...');
const firebaseJsonPath = path.join(__dirname, '..', '..', 'firebase.json');
if (fs.existsSync(firebaseJsonPath)) {
  const firebaseConfig = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));

  if (firebaseConfig.functions) {
    const funcsConfig = firebaseConfig.functions;

    if (funcsConfig.source === 'apps/functions' || funcsConfig.source === './apps/functions') {
      success.push('✅ Functions source: apps/functions');
    } else {
      errors.push(`❌ Incorrect functions source: ${funcsConfig.source}`);
    }

    if (funcsConfig.runtime) {
      success.push(`✅ Runtime: ${funcsConfig.runtime}`);
    }
  } else {
    errors.push('❌ Missing "functions" config in firebase.json');
  }
} else {
  warnings.push('⚠️  firebase.json not found at root');
}

// 7. Count function files
console.log('\n📊 Function statistics...');
let functionCount = 0;
function countFunctions(dir) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      countFunctions(filePath);
    } else if (file.endsWith('.ts') && !file.includes('index.ts') && !file.includes('.spec.ts')) {
      functionCount++;
    }
  });
}
countFunctions(srcPath);
success.push(`✅ Found ${functionCount} function files`);

// ============================================
// RESULTS
// ============================================
console.log('\n' + '='.repeat(60));
console.log('📊 VALIDATION RESULTS');
console.log('='.repeat(60));

if (success.length > 0) {
  console.log(`\n✅ SUCCESS (${success.length}):`);
  success.forEach((msg) => console.log(`   ${msg}`));
}

if (warnings.length > 0) {
  console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
  warnings.forEach((msg) => console.log(`   ${msg}`));
}

if (errors.length > 0) {
  console.log(`\n❌ ERRORS (${errors.length}):`);
  errors.forEach((msg) => console.log(`   ${msg}`));
  console.log('\n❌ ERRORS FOUND - DO NOT DEPLOY!');
  console.log('Fix the errors above before running: npm run deploy\n');
  process.exit(1);
} else {
  console.log('\n✅ ALL CHECKS PASSED - SAFE TO DEPLOY!');
  console.log('\nTo deploy:');
  console.log('  npm run build      # Build TypeScript');
  console.log('  npm run deploy     # Deploy to Firebase');
  console.log('\nOr test locally first:');
  console.log('  npm run serve      # Start emulator\n');
  process.exit(0);
}
