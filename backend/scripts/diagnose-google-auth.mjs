#!/usr/bin/env node
/**
 * @fileoverview Diagnostic script for Google OAuth token fetch issues.
 *
 * Tests the production auth path used by DynamicExportTool and GcsJsonApi
 * to isolate Node 20 vs Node 22 "Premature close" failures.
 */

import { createHash, createSign } from 'node:crypto';
import jwt from 'jsonwebtoken';

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Information
// ─────────────────────────────────────────────────────────────────────────────

console.log('=== Google OAuth Token Diagnostic ===\n');

console.log('Runtime Information:');
console.log(`  Node version: ${process.version}`);
console.log(`  Node path: ${process.execPath}`);
console.log(`  Current directory: ${process.cwd()}`);
console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`  Module format: ESM (.mjs)`);
console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Credential Diagnostics
// ─────────────────────────────────────────────────────────────────────────────

console.log('Credential Diagnostics:');

const credentialSources = [
  { name: 'FIREBASE_PROJECT_ID', env: 'FIREBASE_PROJECT_ID', alt: 'GOOGLE_PROJECT_ID' },
  { name: 'FIREBASE_CLIENT_EMAIL', env: 'FIREBASE_CLIENT_EMAIL', alt: 'GOOGLE_CLIENT_EMAIL' },
  { name: 'FIREBASE_PRIVATE_KEY', env: 'FIREBASE_PRIVATE_KEY', alt: 'GOOGLE_PRIVATE_KEY' },
];

const credentialStatus = {};

for (const source of credentialSources) {
  const primary = process.env[source.env];
  const alt = process.env[source.alt];
  const value = primary || alt;

  const status = {
    present: !!value,
    source: primary ? source.env : (alt ? source.alt : 'missing'),
    length: value ? value.length : 0,
  };

  if (source.name.includes('PRIVATE_KEY') && value) {
    const normalized = value.replace(/\\n/g, '\n');
    status.hasEscapedNewlines = value.includes('\\n');
    status.hasRealNewlines = value.includes('\n');
    status.looksPem = normalized.includes('-----BEGIN PRIVATE KEY-----') &&
                      normalized.includes('-----END PRIVATE KEY-----');

    if (status.looksPem) {
      const keyContent = normalized.replace(/-----BEGIN PRIVATE KEY-----/g, '')
                                   .replace(/-----END PRIVATE KEY-----/g, '')
                                   .replace(/\s/g, '');
      status.sha256Prefix = createHash('sha256').update(keyContent).digest('hex').substring(0, 16);
    }
  }

  credentialStatus[source.name] = status;
  console.log(`  ${source.name}:`);
  console.log(`    Present: ${status.present}`);
  console.log(`    Source: ${status.source}`);
  console.log(`    Length: ${status.length}`);
  if (status.hasEscapedNewlines !== undefined) {
    console.log(`    Has escaped newlines: ${status.hasEscapedNewlines}`);
    console.log(`    Has real newlines: ${status.hasRealNewlines}`);
    console.log(`    Looks PEM: ${status.looksPem}`);
    if (status.sha256Prefix) {
      console.log(`    SHA-256 prefix: ${status.sha256Prefix}`);
    }
  }
}

const missingCredentials = Object.entries(credentialStatus)
  .filter(([_, status]) => !status.present)
  .map(([name]) => name);

if (missingCredentials.length > 0) {
  console.error(`\n❌ Missing required credentials: ${missingCredentials.join(', ')}`);
  console.error('Please ensure all Firebase service account credentials are set in the environment.');
  process.exit(1);
}

console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Versions
// ─────────────────────────────────────────────────────────────────────────────

console.log('Dependency Versions:');

const depPaths = {
  'jsonwebtoken': 'jsonwebtoken/package.json',
  'gaxios': 'gaxios/package.json',
  'google-auth-library': 'google-auth-library/package.json',
  'firebase-admin': 'firebase-admin/package.json',
  '@google-cloud/storage': '@google-cloud/storage/package.json',
};

for (const [name, path] of Object.entries(depPaths)) {
  try {
    const pkgUrl = new URL(path, import.meta.resolve(name + '/package.json')).href;
    const pkg = await import(pkgUrl, { assert: { type: 'json' } });
    console.log(`  ${name}: ${pkg.default.version}`);
  } catch (err) {
    console.log(`  ${name}: (not found or error: ${err.message})`);
  }
}

console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Token Fetch Implementation (from gcs-json-api.ts)
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const STORAGE_SCOPE_FULL_CONTROL = 'https://www.googleapis.com/auth/devstorage.full_control';

function resolveFirebaseServiceAccountCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL ?? process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? process.env.GOOGLE_PRIVATE_KEY)?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase service account credentials are not configured');
  }

  return { projectId, clientEmail, privateKey };
}

async function fetchGoogleAccessToken(scope) {
  const credentials = resolveFirebaseServiceAccountCredentials();

  const issuedAt = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: credentials.clientEmail,
      scope,
      aud: TOKEN_ENDPOINT,
      exp: issuedAt + 3600,
      iat: issuedAt,
    },
    credentials.privateKey,
    { algorithm: 'RS256' }
  );

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok || typeof body.access_token !== 'string') {
    const error = typeof body.error === 'string' ? body.error : `HTTP ${response.status}`;
    const description = typeof body.error_description === 'string' ? `: ${body.error_description}` : '';
    throw new Error(`Google token fetch failed: ${error}${description}`);
  }

  return body.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Execution
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeError(error) {
  const sanitized = {
    name: error?.name || 'UnknownError',
    message: error?.message || String(error),
    code: undefined,
    errno: undefined,
    type: undefined,
    cause: undefined,
  };

  if (error && typeof error === 'object') {
    if ('code' in error) sanitized.code = error.code;
    if ('errno' in error) sanitized.errno = error.errno;
    if ('type' in error) sanitized.type = error.type;

    if (error.cause) {
      sanitized.cause = sanitizeError(error.cause);
    }
  }

  return sanitized;
}

async function runTokenTest(mode, attemptNum) {
  const start = Date.now();
  try {
    const token = await fetchGoogleAccessToken(STORAGE_SCOPE_FULL_CONTROL);
    const durationMs = Date.now() - start;

    return {
      attempt: attemptNum,
      mode,
      durationMs,
      success: true,
      tokenPresent: true,
      tokenLength: token.length,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    const sanitized = sanitizeError(error);

    return {
      attempt: attemptNum,
      mode,
      durationMs,
      success: false,
      error: sanitized,
    };
  }
}

console.log('=== Test 1: Sequential Token Requests ===\n');

const sequentialResults = [];
for (let i = 1; i <= 5; i++) {
  console.log(`  Attempt ${i}/5 (sequential)...`);
  const result = await runTokenTest('sequential', i);
  sequentialResults.push(result);

  if (result.success) {
    console.log(`    ✓ Success in ${result.durationMs}ms (token length: ${result.tokenLength})`);
  } else {
    console.log(`    ✗ Failed in ${result.durationMs}ms`);
    console.log(`      Error: ${result.error.name} - ${result.error.message}`);
    if (result.error.code) console.log(`      Code: ${result.error.code}`);
    if (result.error.cause) console.log(`      Cause: ${JSON.stringify(result.error.cause)}`);
  }
}

console.log();

console.log('=== Test 2: Concurrent Token Requests ===\n');

console.log('  Launching 10 concurrent requests...');
const concurrentStart = Date.now();
const concurrentPromises = [];
for (let i = 1; i <= 10; i++) {
  concurrentPromises.push(runTokenTest('concurrent', i));
}

const concurrentResults = await Promise.all(concurrentPromises);
const concurrentDuration = Date.now() - concurrentStart;

console.log(`  All 10 requests completed in ${concurrentDuration}ms\n`);

const concurrentSuccesses = concurrentResults.filter(r => r.success);
const concurrentFailures = concurrentResults.filter(r => !r.success);

console.log(`  Successes: ${concurrentSuccesses.length}/10`);
console.log(`  Failures: ${concurrentFailures.length}/10`);

if (concurrentFailures.length > 0) {
  console.log('\n  Failed request details:');
  for (const result of concurrentFailures) {
    console.log(`    Attempt ${result.attempt}: ${result.error.name} - ${result.error.message}`);
    if (result.error.code) console.log(`      Code: ${result.error.code}`);
  }
}

console.log();

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('=== Summary ===\n');

const allResults = [...sequentialResults, ...concurrentResults];
const totalSuccesses = allResults.filter(r => r.success).length;
const totalFailures = allResults.filter(r => !r.success).length;

console.log(`Total requests: ${allResults.length}`);
console.log(`  Successes: ${totalSuccesses}`);
console.log(`  Failures: ${totalFailures}`);
console.log();

if (totalFailures > 0) {
  console.log('❌ Some token requests failed. This indicates a problem with the auth path.');
  console.log('\nFailure breakdown by mode:');
  const seqFailures = sequentialResults.filter(r => !r.success);
  const concFailures = concurrentResults.filter(r => !r.success);
  console.log(`  Sequential: ${seqFailures.length}/5 failures`);
  console.log(`  Concurrent: ${concFailures.length}/10 failures`);
  process.exit(1);
} else {
  console.log('✓ All token requests succeeded. The auth path appears healthy.');
  process.exit(0);
}
