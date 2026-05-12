/**
 * @fileoverview Deploy mobile OTA bundle to Cloudflare R2 + Firestore manifest.
 *
 * Self-hosted Live Update pipeline. Zips the prebuilt Angular bundle from
 * `apps/mobile/www/browser`, uploads it to **Cloudflare R2** (free egress —
 * critical at scale), and writes the matching manifest doc to Firestore.
 * The mobile `LiveUpdateService` picks up the manifest on the next cold start.
 *
 * Why R2 and not Firebase Storage?
 *   Firebase Storage charges $0.12/GB egress. With 100k MAU and 5MB bundles
 *   that's ~$50–500/month. Cloudflare R2 has zero egress fees forever, so
 *   bandwidth costs stay flat as we scale. Storage cost is negligible
 *   (~$0.015/GB/month).
 *
 * Usage:
 *   # Build the bundle first (one of these matching the channel):
 *   #   cd apps/mobile && npm run build           # production
 *   #   cd apps/mobile && npm run build:staging   # staging
 *
 *   # Then from /backend:
 *   tsx scripts/deploy-mobile-bundle.ts \
 *     --channel production \
 *     --platform ios \
 *     --version 1.4.2 \
 *     --min-native 1.0.0 \
 *     --rollout 100 \
 *     --notes "Fix Agent X chat scroll on iPad"
 *
 * Required env (loaded from .env):
 *   # Firebase Admin (for manifest writes — already configured)
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *
 *   # Cloudflare R2 (production)
 *   CLOUDFLARE_ACCOUNT_ID                Cloudflare account ID
 *   R2_ACCESS_KEY_ID             R2 API token access key
 *   R2_SECRET_ACCESS_KEY         R2 API token secret
 *   R2_BUCKET                    Bucket name (e.g. nxt1-app-bundles)
 *   R2_PUBLIC_BASE_URL           Public download base URL — either a custom
 *                                domain (https://bundles.nxt1sports.com) or
 *                                the bucket's r2.dev URL.
 *
 *   # Cloudflare R2 (staging — same vars with STAGING_ prefix)
 *   STAGING_CLOUDFLARE_ACCOUNT_ID, STAGING_R2_ACCESS_KEY_ID,
 *   STAGING_R2_SECRET_ACCESS_KEY, STAGING_R2_BUCKET,
 *   STAGING_R2_PUBLIC_BASE_URL
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { db } from '../src/utils/firebase.js';
import {
  LIVE_UPDATE_PATHS,
  type LiveUpdateChannel,
  type LiveUpdateManifest,
  type LiveUpdatePlatform,
} from '@nxt1/core/live-update';

interface CliArgs {
  channel: LiveUpdateChannel;
  platform: LiveUpdatePlatform;
  version: string;
  minNative: string;
  rollout: number;
  enabled: boolean;
  notes: string | undefined;
  bundleDir: string;
  dryRun: boolean;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);

  const channel = (get('channel') ?? 'staging') as LiveUpdateChannel;
  if (channel !== 'production' && channel !== 'staging') {
    throw new Error(`--channel must be 'production' or 'staging' (got: ${channel})`);
  }

  const platform = get('platform') as LiveUpdatePlatform | undefined;
  if (platform !== 'ios' && platform !== 'android') {
    throw new Error(`--platform must be 'ios' or 'android' (got: ${platform ?? 'missing'})`);
  }

  const version = get('version');
  if (!version) throw new Error('--version is required (e.g. --version 1.4.2)');

  const minNative = get('min-native') ?? version;
  const rollout = Number(get('rollout') ?? '100');
  if (!Number.isFinite(rollout) || rollout < 0 || rollout > 100) {
    throw new Error('--rollout must be 0–100');
  }

  const here = fileURLToPath(import.meta.url);
  const repoRoot = resolve(here, '../../..');
  const defaultBundleDir = join(repoRoot, 'apps', 'mobile', 'www', 'browser');
  const bundleDir = get('bundle-dir') ?? defaultBundleDir;

  return {
    channel,
    platform,
    version,
    minNative,
    rollout,
    enabled: !has('disabled'),
    notes: get('notes'),
    bundleDir,
    dryRun: has('dry-run'),
  };
}

function loadR2Config(channel: LiveUpdateChannel): R2Config {
  // Production deploys MUST use production R2 credentials. Staging may use a
  // separate bucket so test bundles never leak to real users.
  const prefix = channel === 'staging' ? 'STAGING_' : '';
  const required = (name: string): string => {
    const value = process.env[`${prefix}${name}`];
    if (!value) {
      throw new Error(
        `Missing required env var: ${prefix}${name}\n` +
          `See deploy-mobile-bundle.ts header for the full list.`
      );
    }
    return value;
  };
  return {
    accountId: required('CLOUDFLARE_ACCOUNT_ID'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET'),
    publicBaseUrl: required('R2_PUBLIC_BASE_URL').replace(/\/$/, ''),
  };
}

function createR2Client(config: R2Config): S3Client {
  // R2 is fully S3-compatible. Endpoint format is fixed by Cloudflare.
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function zipDirectory(srcDir: string, outputZip: string): void {
  // Use system `zip` for cross-tooling consistency (matches what CI runners ship).
  // -r recursive, -q quiet, -X strip extra file attributes for reproducible builds.
  execFileSync('zip', ['-rqX', outputZip, '.'], {
    cwd: srcDir,
    stdio: 'inherit',
  });
}

function sha256OfFile(filePath: string): string {
  const buffer = readFileSync(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function main(): Promise<void> {
  const args = parseArgs();

  console.log('═══════════════════════════════════════════════════');
  console.log('  NXT1 Mobile OTA Bundle Deploy (Cloudflare R2)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Channel:        ${args.channel}`);
  console.log(`  Platform:       ${args.platform}`);
  console.log(`  Version:        ${args.version}`);
  console.log(`  Min native:     ${args.minNative}`);
  console.log(`  Rollout:        ${args.rollout}%`);
  console.log(`  Enabled:        ${args.enabled}`);
  console.log(`  Bundle source:  ${args.bundleDir}`);
  console.log(`  Mode:           ${args.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('───────────────────────────────────────────────────');

  if (!existsSync(args.bundleDir)) {
    throw new Error(
      `Bundle directory not found: ${args.bundleDir}\n` +
        `Run \`cd apps/mobile && npm run build\` (or build:staging) first.`
    );
  }
  // Sanity: index.html must exist in the bundle root.
  if (!existsSync(join(args.bundleDir, 'index.html'))) {
    throw new Error(
      `Bundle directory does not contain index.html: ${args.bundleDir}\n` +
        `Did the Angular build complete successfully?`
    );
  }

  const r2Config = args.dryRun ? null : loadR2Config(args.channel);

  const tmpDir = mkdtempSync(join(tmpdir(), 'nxt1-ota-'));
  const zipPath = join(tmpDir, `bundle-${args.platform}-${args.version}.zip`);

  try {
    console.log('▸ Zipping bundle…');
    zipDirectory(args.bundleDir, zipPath);
    const size = statSync(zipPath).size;
    const hash = sha256OfFile(zipPath);
    console.log(`  size: ${(size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  sha256: ${hash}`);

    const objectKey = LIVE_UPDATE_PATHS.storagePath(args.channel, args.platform, args.version);
    const docId = LIVE_UPDATE_PATHS.manifestDocId(args.platform, args.channel);

    if (args.dryRun || !r2Config) {
      console.log('▸ [dry-run] Would upload to R2 key:', objectKey);
      console.log('▸ [dry-run] Would write manifest at:', `AppUpdates/${docId}`);
      return;
    }

    console.log(`▸ Uploading to R2: ${r2Config.bucket}/${objectKey}`);
    const r2 = createR2Client(r2Config);
    const body = readFileSync(zipPath);
    await r2.send(
      new PutObjectCommand({
        Bucket: r2Config.bucket,
        Key: objectKey,
        Body: body,
        ContentType: 'application/zip',
        // Bundles are content-addressed by version — safe to cache forever.
        CacheControl: 'public, max-age=31536000, immutable',
        ContentLength: size,
        ChecksumSHA256: Buffer.from(hash, 'hex').toString('base64'),
        Metadata: {
          version: args.version,
          channel: args.channel,
          platform: args.platform,
          sha256: hash,
        },
      })
    );

    const bundleUrl = `${r2Config.publicBaseUrl}/${objectKey}`;
    console.log(`  → ${bundleUrl}`);

    console.log('▸ Writing manifest:', `AppUpdates/${docId}`);
    const manifest: LiveUpdateManifest = {
      platform: args.platform,
      channel: args.channel,
      version: args.version,
      bundleUrl,
      bundleHash: hash,
      bundleSize: size,
      minNativeVersion: args.minNative,
      publishedAt: new Date().toISOString(),
      enabled: args.enabled,
      rolloutPercentage: args.rollout,
      ...(args.notes ? { releaseNotes: args.notes } : {}),
      ...(process.env['GITHUB_SHA'] ? { gitSha: process.env['GITHUB_SHA'] } : {}),
    };
    await db.collection(LIVE_UPDATE_PATHS.COLLECTION).doc(docId).set(manifest);

    console.log('───────────────────────────────────────────────────');
    console.log('  ✅ Deploy complete');
    console.log(`  Clients on ${args.platform}/${args.channel} will pick this up`);
    console.log(`  on next cold start (or app resume after kill).`);
    console.log('═══════════════════════════════════════════════════');
  } finally {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Deploy failed:', err);
  process.exit(1);
});
