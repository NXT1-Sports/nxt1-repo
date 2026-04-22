#!/usr/bin/env npx tsx
/**
 * Patch posts with _cfMigrationPending=true to have correct Cloudflare Stream URLs.
 *
 * For REPOST posts  → look up originalPostId in target Posts and copy CF fields.
 * For ORIGINAL posts → download HLS segments from legacy GCS, TUS-upload to CF.
 *
 * Usage:
 *   npx tsx backend/scripts/migration/patch-pending-videos.ts [--target=production|staging] [--dry-run] [--verbose]
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');
const target = (args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'staging') as
  | 'staging'
  | 'production';
const POLL_TIMEOUT_S = Number(
  args.find((a) => a.startsWith('--poll-timeout='))?.split('=')[1] ?? '180'
);

// ─── Firebase / CF constants ──────────────────────────────────────────────────

const CF_API = 'https://api.cloudflare.com/client/v4';
const CF_TOKEN = process.env['CLOUDFLARE_API_TOKEN'] ?? '';
const CF_ACCOUNT = process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '';
const CF_CUSTOMER = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'] ?? '';

const LEGACY_BUCKET_NAME =
  process.env['LEGACY_FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-de054.appspot.com';

const TARGET_BUCKET_NAME =
  target === 'production'
    ? (process.env['FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-v2.firebasestorage.app')
    : (process.env['STAGING_FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-staging-v2.firebasestorage.app');

// ─── Init: Legacy app ─────────────────────────────────────────────────────────

let legacySaJson: Record<string, string>;
try {
  const saPath = resolve(
    __dirname,
    '../../../../nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json'
  );
  const { createRequire } = await import('module');
  const req = createRequire(import.meta.url);
  legacySaJson = req(saPath);
} catch {
  console.error('❌ Cannot load legacy SA key. Adjust path.');
  process.exit(1);
}

const legacyApp = initializeApp(
  {
    credential: cert(legacySaJson as Parameters<typeof cert>[0]),
    storageBucket: LEGACY_BUCKET_NAME,
  },
  'legacy-patch'
);
const legacyBucket = getStorage(legacyApp).bucket();

// ─── Init: Target app ─────────────────────────────────────────────────────────

const targetApp = initializeApp(
  {
    credential: cert({
      projectId:
        target === 'production'
          ? (process.env['PRODUCTION_FIREBASE_PROJECT_ID'] ?? '')
          : (process.env['STAGING_FIREBASE_PROJECT_ID'] ?? ''),
      clientEmail:
        target === 'production'
          ? (process.env['PRODUCTION_FIREBASE_CLIENT_EMAIL'] ?? '')
          : (process.env['STAGING_FIREBASE_CLIENT_EMAIL'] ?? ''),
      privateKey: (target === 'production'
        ? (process.env['PRODUCTION_FIREBASE_PRIVATE_KEY'] ?? '')
        : (process.env['STAGING_FIREBASE_PRIVATE_KEY'] ?? '')
      ).replace(/\\n/g, '\n'),
    }),
    storageBucket: TARGET_BUCKET_NAME,
  },
  'target-patch'
);
const targetDb = getFirestore(targetApp);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cfHeaders() {
  return {
    Authorization: `Bearer ${CF_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Build public GCS URL for an HLS file */
function gcsPublicUrl(bucket: string, path: string) {
  return `https://storage.googleapis.com/${bucket}/${encodeURIComponent(path).replace(/%2F/g, '/')}`;
}

/** Parse HLS playlist and return segment filenames (non-comment lines) */
function parseSegments(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/** Pick highest-bandwidth quality playlist path from a master.m3u8 */
function pickBestQualityUrl(masterText: string, masterBaseUrl: string): string | null {
  const lines = masterText.split('\n').map((l) => l.trim());
  let bestBw = -1;
  let bestPath: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const bw = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] ?? '0', 10);
      const path = lines[i + 1];
      if (path && !path.startsWith('#') && bw > bestBw) {
        bestBw = bw;
        bestPath = path;
      }
    }
  }
  if (!bestPath) return null;
  const base = masterBaseUrl.endsWith('/') ? masterBaseUrl : masterBaseUrl + '/';
  return bestPath.startsWith('http') ? bestPath : base + bestPath;
}

/** Make all files under HLS/{postId}/ public and return the master.m3u8 public URL */
async function makeHlsPublicAndGetMasterUrl(postId: string): Promise<string | null> {
  const prefix = `HLS/${postId}/`;
  const [files] = await legacyBucket.getFiles({ prefix });
  if (files.length === 0) {
    console.error(`  ❌ No HLS files for ${postId}`);
    return null;
  }
  await Promise.all(files.map((f) => f.makePublic()));
  console.log(`  ✅ Made ${files.length} files public for ${postId}`);
  return gcsPublicUrl(LEGACY_BUCKET_NAME, `${prefix}master.m3u8`);
}

/** Download all .ts segments from an HLS playlist and concatenate them */
async function downloadHlsToBuffer(qualityPlaylistUrl: string): Promise<Buffer | null> {
  const playlistResp = await fetch(qualityPlaylistUrl);
  if (!playlistResp.ok) {
    console.error(`  ❌ Playlist fetch failed: HTTP ${playlistResp.status}`);
    return null;
  }
  const playlistText = await playlistResp.text();
  const segments = parseSegments(playlistText);
  if (segments.length === 0) {
    console.error(`  ❌ No segments in playlist`);
    return null;
  }
  const base = qualityPlaylistUrl.substring(0, qualityPlaylistUrl.lastIndexOf('/') + 1);
  const chunks: Buffer[] = [];
  for (let i = 0; i < segments.length; i++) {
    const url = segments[i].startsWith('http') ? segments[i] : base + segments[i];
    if (isVerbose) process.stdout.write(`\r    Segment ${i + 1}/${segments.length}…`.padEnd(50));
    const r = await fetch(url);
    if (!r.ok) {
      console.error(`\n  ❌ Segment ${i} HTTP ${r.status}`);
      return null;
    }
    chunks.push(Buffer.from(await r.arrayBuffer()));
  }
  if (isVerbose) process.stdout.write('\n');
  return Buffer.concat(chunks);
}

const TUS_CHUNK = 50 * 1024 * 1024; // 50 MB

/** Upload a video Buffer to CF Stream via TUS. Returns CF video UID or null. */
async function tusUpload(
  buf: Buffer,
  meta: { name: string; userId: string }
): Promise<string | null> {
  const total = buf.length;
  const createResp = await fetch(`${CF_API}/accounts/${CF_ACCOUNT}/stream?direct_user=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(total),
      'Upload-Metadata': [
        `name ${Buffer.from(meta.name).toString('base64')}`,
        `nxt1_user_id ${Buffer.from(meta.userId).toString('base64')}`,
        `uploadProvider ${Buffer.from('legacy-migration-patch').toString('base64')}`,
      ].join(','),
      'Upload-Creator': meta.userId,
    },
  });

  if (!createResp.ok) {
    let msg = `HTTP ${createResp.status}`;
    try {
      const j = (await createResp.json()) as { errors?: Array<{ message?: string }> };
      msg = j.errors?.[0]?.message ?? msg;
    } catch {
      /* ignore */
    }
    console.error(`  ❌ CF TUS create failed: ${msg}`);
    return null;
  }

  const uploadUrl = createResp.headers.get('Location');
  const videoId = createResp.headers.get('Stream-Media-Id');
  if (!uploadUrl) {
    console.error(`  ❌ No Location header from CF TUS`);
    return null;
  }

  let offset = 0;
  while (offset < total) {
    const end = Math.min(offset + TUS_CHUNK, total);
    const chunk = buf.subarray(offset, end);
    if (isVerbose) {
      process.stdout.write(
        `\r    CF upload: ${Math.round((offset / total) * 100)}% (${Math.round(end / 1024 / 1024)}/${Math.round(total / 1024 / 1024)} MB)…`.padEnd(
          60
        )
      );
    }
    const patchResp = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        'Tus-Resumable': '1.0.0',
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
        'Content-Length': String(chunk.length),
      },
      body: chunk,
    });
    if (!patchResp.ok) {
      process.stdout.write('\n');
      console.error(`  ❌ CF PATCH failed at offset ${offset}: HTTP ${patchResp.status}`);
      return null;
    }
    offset = end;
  }
  if (isVerbose) process.stdout.write('\n');
  return videoId ?? uploadUrl.match(/[0-9a-f]{32}/)?.[0] ?? null;
}

/** Poll CF until ready or timeout. Returns CF fields or null. */
async function pollCf(videoId: string) {
  const timeout = POLL_TIMEOUT_S * 1000;
  const start = Date.now();
  let delay = 3000;
  while (Date.now() - start < timeout) {
    const r = await fetch(`${CF_API}/accounts/${CF_ACCOUNT}/stream/${videoId}`, {
      headers: cfHeaders(),
    });
    const data = (await r.json()) as {
      success: boolean;
      result?: {
        uid?: string;
        status?: { state?: string };
        readyToStream?: boolean;
        duration?: number;
      };
    };
    if (r.ok && data.success && data.result) {
      const res = data.result;
      const state = res.status?.state ?? 'queued';
      if (isVerbose)
        process.stdout.write(
          `\r    CF ${videoId}: ${state} (${Math.round((Date.now() - start) / 1000)}s)`.padEnd(60)
        );
      if (res.readyToStream || state === 'ready') {
        if (isVerbose) process.stdout.write('\n');
        return {
          uid: videoId,
          status: 'ready' as const,
          readyToStream: true,
          duration: res.duration ?? null,
          iframeUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${videoId}/iframe`,
          hlsUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${videoId}/manifest/video.m3u8`,
          dashUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${videoId}/manifest/video.mpd`,
          thumbnailUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${videoId}/thumbnails/thumbnail.jpg`,
        };
      }
    }
    await sleep(delay);
    delay = Math.min(delay * 1.5, 15000);
  }
  if (isVerbose) process.stdout.write('\n');
  console.warn(`  ⚠️  Poll timeout for ${videoId}`);
  return null;
}

/** Upload HLS from legacy GCS to CF Stream. Returns CF result or null. */
async function uploadHlsToCf(postId: string, meta: { name: string; userId: string }) {
  const masterUrl = await makeHlsPublicAndGetMasterUrl(postId);
  if (!masterUrl) return null;

  const masterResp = await fetch(masterUrl);
  if (!masterResp.ok) {
    console.error(`  ❌ master.m3u8 HTTP ${masterResp.status}`);
    return null;
  }
  const masterText = await masterResp.text();
  const masterBase = masterUrl.substring(0, masterUrl.lastIndexOf('/') + 1);
  const qualityUrl = pickBestQualityUrl(masterText, masterBase);
  if (!qualityUrl) {
    console.error(`  ❌ No quality playlist in master.m3u8`);
    return null;
  }
  if (isVerbose) console.log(`    Quality: ${qualityUrl.split('/').slice(-2).join('/')}`);

  const buf = await downloadHlsToBuffer(qualityUrl);
  if (!buf) return null;
  if (isVerbose) console.log(`    Buffer: ${Math.round(buf.length / 1024 / 1024)} MB`);

  const cfId = isDryRun ? `dry-run-${postId}` : await tusUpload(buf, meta);
  if (!cfId) return null;

  const result = isDryRun
    ? {
        uid: cfId,
        status: 'ready' as const,
        readyToStream: false,
        duration: null,
        iframeUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/iframe`,
        hlsUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/manifest/video.m3u8`,
        dashUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/manifest/video.mpd`,
        thumbnailUrl: null,
      }
    : await pollCf(cfId);

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`  Patch: _cfMigrationPending posts → Cloudflare URLs`);
console.log(`${'═'.repeat(60)}`);
console.log(`  Target : ${target}  (${TARGET_BUCKET_NAME})`);
console.log(`  Dry run: ${isDryRun}`);
console.log(`  CF     : ${CF_TOKEN ? '✅' : '❌ missing token'}`);
console.log(`${'═'.repeat(60)}\n`);

// 1. Query all pending posts from target Firestore
const pendingSnap = await targetDb
  .collection('Posts')
  .where('_cfMigrationPending', '==', true)
  .get();

if (pendingSnap.empty) {
  console.log('✅ No posts with _cfMigrationPending=true found. Nothing to do.');
  process.exit(0);
}

console.log(`Found ${pendingSnap.size} pending post(s):\n`);

let fixed = 0;
let failed = 0;

for (const doc of pendingSnap.docs) {
  const d = doc.data() as Record<string, unknown>;
  const postId = doc.id;
  const userId = (d['userId'] ?? d['authorId'] ?? '') as string;
  const isRepost = d['isRepost'] === true;
  const originalPostId = (d['originalPostId'] ?? '') as string;

  console.log(`─── ${postId}  [${isRepost ? 'REPOST' : 'ORIGINAL'}]`);
  if (isVerbose) {
    console.log(`    userId: ${userId}`);
    console.log(`    title : ${d['title'] ?? ''}`);
  }

  try {
    let cfFields: Record<string, unknown> | null = null;

    if (isRepost && originalPostId) {
      // ── REPOST: copy CF data from the original post ────────────────────
      console.log(`    Looking up original post: ${originalPostId}`);
      const origDoc = await targetDb.collection('Posts').doc(originalPostId).get();
      if (!origDoc.exists) {
        console.error(`    ❌ Original post not found in target DB`);
        failed++;
        continue;
      }
      const orig = origDoc.data() as Record<string, unknown>;
      if (!orig['cloudflareVideoId']) {
        console.error(`    ❌ Original post has no cloudflareVideoId yet`);
        failed++;
        continue;
      }
      const cfId = orig['cloudflareVideoId'] as string;
      console.log(`    ✅ Copying CF ID: ${cfId}`);
      cfFields = {
        cloudflareVideoId: cfId,
        cloudflareStatus: 'ready',
        readyToStream: true,
        uploadProvider: 'legacy-migration',
        mediaUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/manifest/video.m3u8`,
        videoUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/manifest/video.m3u8`,
        url: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/iframe`,
        playback: {
          iframeUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/iframe`,
          hlsUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/manifest/video.m3u8`,
          dashUrl: `https://${CF_CUSTOMER}.cloudflarestream.com/${cfId}/manifest/video.mpd`,
        },
        duration: orig['duration'] ?? null,
      };
    } else {
      // ── ORIGINAL VIDEO: upload HLS to CF ──────────────────────────────
      const hlsPostId = postId; // HLS folder name = postId for originals
      console.log(`    Uploading HLS/${hlsPostId}/ to CF Stream…`);
      const result = await uploadHlsToCf(hlsPostId, {
        name: ((d['title'] ?? `Legacy post ${postId}`) as string).substring(0, 100),
        userId,
      });
      if (!result) {
        console.error(`    ❌ CF upload failed`);
        failed++;
        continue;
      }
      console.log(`    ✅ CF ID: ${result.uid}  status: ${result.status}`);
      cfFields = {
        cloudflareVideoId: result.uid,
        cloudflareStatus: result.status,
        readyToStream: result.readyToStream,
        uploadProvider: 'legacy-migration',
        mediaUrl: result.hlsUrl,
        videoUrl: result.hlsUrl,
        url: result.iframeUrl,
        playback: {
          iframeUrl: result.iframeUrl,
          hlsUrl: result.hlsUrl,
          dashUrl: result.dashUrl,
        },
        duration: result.duration,
      };
    }

    // Merge CF fields, remove pending flag and legacy-only fields
    const update: Record<string, unknown> = {
      ...cfFields,
      _cfMigrationPending: FieldValue.delete(),
      // Remove legacy GCS signed URL remnants
      sport: FieldValue.delete(),
    };

    if (!isDryRun) {
      await targetDb.collection('Posts').doc(postId).update(update);
      console.log(`    💾 Updated in Firestore`);
    } else {
      console.log(`    [DRY RUN] Would update:`, JSON.stringify(cfFields, null, 2));
    }

    fixed++;
  } catch (err) {
    console.error(`    ❌ Error: ${err instanceof Error ? err.message : err}`);
    failed++;
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`  DONE`);
console.log(`${'═'.repeat(60)}`);
console.log(`  Fixed  : ${fixed}`);
console.log(`  Failed : ${failed}`);
console.log('');

process.exit(failed > 0 ? 1 : 0);
