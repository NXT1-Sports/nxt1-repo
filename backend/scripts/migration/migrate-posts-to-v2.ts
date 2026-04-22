#!/usr/bin/env npx tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Posts-Only Migration  (nxt-1-de054 → nxt-1-v2 / nxt-1-staging-v2)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * For every legacy post in  Users/{uid}/Posts/{postId}:
 *
 *  • IMAGE posts
 *    – Each image in mediaUrls / profileImg / thumbnailUrl that still points
 *      to the legacy bucket is copied to the target bucket at
 *      Profiles/FeedImages/{userId}/{filename}
 *    – The copied file is made publicly accessible (no token required).
 *    – The post document is written to target Posts/{postId} with URLs rewritten
 *      to the new public path.
 *
 *  • VIDEO posts  (type === 'video' | 'highlight', or mediaUrl contains .m3u8)
 *    – All files under HLS/{postId}/ in the legacy bucket are made public so
 *      Cloudflare can fetch the manifest + all segments via relative URLs.
 *    – A Cloudflare Stream "copy from URL" job is submitted using the public
 *      master.m3u8 URL.
 *    – The script polls until the video is ready (or records it as pending if
 *      CF hasn't finished within the polling window).
 *    – The post document is written with full CF fields:
 *        cloudflareVideoId, cloudflareStatus, readyToStream,
 *        mediaUrl (iframe), videoUrl (HLS), thumbnailUrl, playback {}
 *    – The legacy thumbnailUrl (PostThumbnails/{postId}.jpg) is also copied to
 *      the target bucket and made public.
 *
 * Usage:
 *   npx tsx backend/scripts/migration/migrate-posts-to-v2.ts --dry-run
 *   npx tsx backend/scripts/migration/migrate-posts-to-v2.ts --target=production
 *   npx tsx backend/scripts/migration/migrate-posts-to-v2.ts --uid=<userId>   # single user
 *   npx tsx backend/scripts/migration/migrate-posts-to-v2.ts --limit=20 --verbose
 *
 * Flags:
 *   --dry-run           Log everything but write nothing
 *   --target=           staging (default) | production
 *   --uid=<userId>      Process posts for one user only
 *   --limit=N           Stop after N posts processed
 *   --concurrency=N     Parallel CF submissions (default: 5)
 *   --poll-timeout=N    Seconds to wait for CF to become ready (default: 120)
 *   --verbose           Print per-file detail
 *   --legacy-sa=        Override legacy SA path
 *
 * Required env vars (backend/.env):
 *   CLOUDFLARE_API_TOKEN
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_STREAM_CUSTOMER_CODE   (e.g. "abc123ef")
 *   LEGACY_FIREBASE_STORAGE_BUCKET    (default: nxt-1-de054.appspot.com)
 *   FIREBASE_STORAGE_BUCKET           (production target bucket)
 *   STAGING_FIREBASE_STORAGE_BUCKET   (staging target bucket)
 *   FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY  (production)
 *   STAGING_FIREBASE_PROJECT_ID / ...  (staging)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { config } from 'dotenv';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../.env') });

import { initializeApp, cert, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { Bucket } from '@google-cloud/storage';

// ─── CLI ─────────────────────────────────────────────────────────────────────

const _args = process.argv.slice(2);
const isDryRun = _args.includes('--dry-run');
const isVerbose = _args.includes('--verbose');
const target = (_args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'staging') as
  | 'staging'
  | 'production';
const singleUid = _args.find((a) => a.startsWith('--uid='))?.split('=')[1] ?? null;
const LIMIT = Number(_args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0');
const CONCURRENCY = Number(_args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '5');
const POLL_TIMEOUT_S = Number(
  _args.find((a) => a.startsWith('--poll-timeout='))?.split('=')[1] ?? '120'
);
const legacySaOverride = _args.find((a) => a.startsWith('--legacy-sa='))?.split('=')[1];

// ─── Constants ────────────────────────────────────────────────────────────────

const LEGACY_BUCKET_NAME =
  process.env['LEGACY_FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-de054.appspot.com';

const TARGET_BUCKET_NAME =
  target === 'production'
    ? (process.env['FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-v2.firebasestorage.app')
    : (process.env['STAGING_FIREBASE_STORAGE_BUCKET'] ?? 'nxt-1-staging-v2.firebasestorage.app');

const CF_API = 'https://api.cloudflare.com/client/v4';
const CF_TOKEN = process.env['CLOUDFLARE_API_TOKEN'] ?? '';
const CF_ACCOUNT = process.env['CLOUDFLARE_ACCOUNT_ID'] ?? '';
const CF_CUSTOMER = process.env['CLOUDFLARE_STREAM_CUSTOMER_CODE'] ?? '';

const PAGE_SIZE = 200;
const POSTS_COLLECTION = 'Posts';
const USERS_COLLECTION = 'Users';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  postsProcessed: number;
  imagesProcessed: number;
  imageFilesCopied: number;
  videosCfSubmitted: number;
  videosCfReady: number;
  videosCfPending: number;
  errors: number;
  skipped: number;
}

interface CfStreamResult {
  uid: string;
  status: string;
  readyToStream: boolean;
  thumbnailUrl: string | null;
  playback: {
    hlsUrl: string | null;
    dashUrl: string | null;
    iframeUrl: string | null;
  };
  durationSeconds: number | null;
}

// ─── Firebase Init ────────────────────────────────────────────────────────────

function initLegacy() {
  try {
    return getApp('posts-legacy');
  } catch {
    /* not yet */
  }
  const saPath =
    legacySaOverride ??
    resolve(
      __dirname,
      '../../../../nxt1-backend/assets/nxt-1-de054-firebase-adminsdk-w01w0-2bab8ae108.json'
    );
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  return initializeApp({ credential: cert(sa), storageBucket: LEGACY_BUCKET_NAME }, 'posts-legacy');
}

function initTarget() {
  try {
    return getApp('posts-target');
  } catch {
    /* not yet */
  }
  const pid =
    target === 'production'
      ? (process.env['PRODUCTION_FIREBASE_PROJECT_ID'] ?? process.env['FIREBASE_PROJECT_ID'])
      : process.env['STAGING_FIREBASE_PROJECT_ID'];
  const email =
    target === 'production'
      ? (process.env['PRODUCTION_FIREBASE_CLIENT_EMAIL'] ?? process.env['FIREBASE_CLIENT_EMAIL'])
      : process.env['STAGING_FIREBASE_CLIENT_EMAIL'];
  const key = (
    target === 'production'
      ? (process.env['PRODUCTION_FIREBASE_PRIVATE_KEY'] ?? process.env['FIREBASE_PRIVATE_KEY'])
      : process.env['STAGING_FIREBASE_PRIVATE_KEY']
  )?.replace(/\\n/g, '\n');

  if (pid && email && key) {
    return initializeApp(
      {
        credential: cert({ projectId: pid, clientEmail: email, privateKey: key }),
        storageBucket: TARGET_BUCKET_NAME,
      },
      'posts-target'
    );
  }

  // Fallback SA file
  const saPath = resolve(__dirname, '../../assets/nxt-1-v2-firebase-adminsdk.json');
  const sa = JSON.parse(readFileSync(saPath, 'utf-8'));
  return initializeApp({ credential: cert(sa), storageBucket: TARGET_BUCKET_NAME }, 'posts-target');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'object' && v !== null && 'toDate' in v) {
    try {
      return (v as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return undefined;
    }
  }
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  return undefined;
}

function clean(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s || undefined;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

/**
 * Extract the path component (after /o/) from a Firebase Storage URL,
 * or the path after the bucket name from a GCS URL.
 */
function extractGcsPath(url: string | unknown): string | null {
  if (!url || typeof url !== 'string') return null;
  // Firebase Storage URL
  const fbm = url.match(/\/o\/([^?#]+)/);
  if (fbm) {
    try {
      return decodeURIComponent(fbm[1]);
    } catch {
      return null;
    }
  }
  // GCS URL: https://storage.googleapis.com/{bucket}/{path}[?...]
  const gcsm = url.match(/^https:\/\/storage\.googleapis\.com\/[^/]+\/([^?#]+)/);
  if (gcsm) return decodeURIComponent(gcsm[1]);
  return null;
}

function isLegacyUrl(url: string): boolean {
  return url.includes(LEGACY_BUCKET_NAME);
}

function isTargetUrl(url: string): boolean {
  return url.includes(TARGET_BUCKET_NAME);
}

/**
 * Build a public GCS URL for a file in the target bucket.
 */
function publicUrl(bucketName: string, path: string): string {
  return `https://storage.googleapis.com/${bucketName}/${path}`;
}

/**
 * Build the new image path in the target bucket.
 * Legacy images may be at:
 *   HighLightImages/{filename}
 *   posts/{rest}
 *   PostThumbnails/{postId}.jpg
 * All land at Profiles/FeedImages/{userId}/{filename}
 */
function buildTargetImagePath(legacyPath: string, userId: string): string {
  const file = basename(legacyPath);
  return `Profiles/FeedImages/${userId}/${file}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Cloudflare Stream Helpers ────────────────────────────────────────────────

function cfHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${CF_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Parse an HLS playlist and return the list of segment filenames in order.
 * Only returns .ts / .ts? lines (ignores comments and sub-playlist refs).
 */
function parseSegments(playlistText: string): string[] {
  return playlistText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

/**
 * Pick the highest-bandwidth quality playlist URL from a master.m3u8.
 * Returns the absolute URL of the quality playlist.
 */
function pickBestQualityPlaylistUrl(masterText: string, masterBaseUrl: string): string | null {
  // Lines that follow #EXT-X-STREAM-INF are the playlist paths
  const lines = masterText.split('\n').map((l) => l.trim());
  let bestBandwidth = -1;
  let bestPath: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
      const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      const path = lines[i + 1];
      if (path && !path.startsWith('#') && bw > bestBandwidth) {
        bestBandwidth = bw;
        bestPath = path;
      }
    }
  }

  if (!bestPath) return null;
  // Resolve relative path
  const base = masterBaseUrl.endsWith('/') ? masterBaseUrl : masterBaseUrl + '/';
  return bestPath.startsWith('http') ? bestPath : base + bestPath;
}

/**
 * Download all MPEG-TS segments from the HLS playlist and return a
 * concatenated Buffer. MPEG-TS segments can be safely concatenated byte-by-byte.
 */
async function downloadHlsSegments(qualityPlaylistUrl: string): Promise<Buffer | null> {
  // Fetch the quality playlist
  let playlistText: string;
  try {
    const resp = await fetch(qualityPlaylistUrl);
    if (!resp.ok) {
      console.error(`    ❌ Failed to fetch playlist ${qualityPlaylistUrl}: HTTP ${resp.status}`);
      return null;
    }
    playlistText = await resp.text();
  } catch (err) {
    console.error(`    ❌ Playlist fetch error: ${err instanceof Error ? err.message : err}`);
    return null;
  }

  const segments = parseSegments(playlistText);
  if (segments.length === 0) {
    console.error(`    ❌ No segments found in playlist`);
    return null;
  }

  // Base URL for segment resolution
  const baseUrl = qualityPlaylistUrl.substring(0, qualityPlaylistUrl.lastIndexOf('/') + 1);

  const chunks: Buffer[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segUrl = segments[i].startsWith('http') ? segments[i] : baseUrl + segments[i];
    if (isVerbose) {
      process.stdout.write(`\r      Downloading segment ${i + 1}/${segments.length}…`.padEnd(60));
    }
    try {
      const r = await fetch(segUrl);
      if (!r.ok) {
        console.error(`\n    ❌ Segment ${i} HTTP ${r.status}: ${segUrl}`);
        return null;
      }
      chunks.push(Buffer.from(await r.arrayBuffer()));
    } catch (err) {
      console.error(
        `\n    ❌ Segment ${i} fetch error: ${err instanceof Error ? err.message : err}`
      );
      return null;
    }
  }
  if (isVerbose) process.stdout.write('\n');

  return Buffer.concat(chunks);
}

const TUS_CHUNK_SIZE = 50 * 1024 * 1024; // 50 MB per PATCH

/**
 * Upload a video Buffer to Cloudflare Stream via TUS resumable upload protocol.
 * Returns the CF video UID, or null on failure.
 */
async function uploadBufferToCfTus(
  videoBuffer: Buffer,
  meta: { name: string; userId: string }
): Promise<string | null> {
  const totalBytes = videoBuffer.length;

  // Step 1: Create the TUS upload session
  const createResp = await fetch(`${CF_API}/accounts/${CF_ACCOUNT}/stream?direct_user=true`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_TOKEN}`,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(totalBytes),
      'Upload-Metadata': [
        `name ${Buffer.from(meta.name).toString('base64')}`,
        `nxt1_user_id ${Buffer.from(meta.userId).toString('base64')}`,
        `uploadProvider ${Buffer.from('legacy-migration').toString('base64')}`,
      ].join(','),
      'Upload-Creator': meta.userId,
    },
  });

  if (!createResp.ok) {
    let detail = `HTTP ${createResp.status}`;
    try {
      const body = (await createResp.json()) as { errors?: Array<{ message?: string }> };
      detail = body.errors?.[0]?.message ?? detail;
    } catch {
      /* ignore */
    }
    console.error(`    ❌ CF TUS create failed: ${detail}`);
    return null;
  }

  const uploadUrl = createResp.headers.get('Location');
  const videoId = createResp.headers.get('Stream-Media-Id');

  if (!uploadUrl) {
    console.error(`    ❌ CF TUS create returned no Location header`);
    return null;
  }

  // Step 2: PATCH data in chunks
  let offset = 0;
  while (offset < totalBytes) {
    const end = Math.min(offset + TUS_CHUNK_SIZE, totalBytes);
    const chunk = videoBuffer.subarray(offset, end);

    if (isVerbose) {
      process.stdout.write(
        `\r      Uploading to CF: ${Math.round((offset / totalBytes) * 100)}% (${Math.round(end / 1024 / 1024)}MB/${Math.round(totalBytes / 1024 / 1024)}MB)…`.padEnd(
          70
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
      console.error(`    ❌ CF TUS PATCH failed at offset ${offset}: HTTP ${patchResp.status}`);
      return null;
    }

    offset = end;
  }

  if (isVerbose) process.stdout.write('\n');

  // Extract video ID from Location header or Stream-Media-Id
  const finalId = videoId ?? uploadUrl.match(/[0-9a-f]{32}/)?.[0] ?? null;

  return finalId;
}

/**
 * Download HLS segments from legacy GCS and upload to Cloudflare Stream via TUS.
 * Returns the CF video UID, or null on failure.
 */
async function submitToCfStream(
  masterM3u8Url: string,
  meta: { name: string; userId: string }
): Promise<string | null> {
  // 1. Fetch master manifest
  let masterText: string;
  try {
    const resp = await fetch(masterM3u8Url);
    if (!resp.ok) {
      console.error(`    ❌ master.m3u8 fetch failed: HTTP ${resp.status}`);
      return null;
    }
    masterText = await resp.text();
  } catch (err) {
    console.error(`    ❌ master.m3u8 fetch error: ${err instanceof Error ? err.message : err}`);
    return null;
  }

  // 2. Pick best quality playlist
  const masterBase = masterM3u8Url.substring(0, masterM3u8Url.lastIndexOf('/') + 1);
  const qualityUrl = pickBestQualityPlaylistUrl(masterText, masterBase);
  if (!qualityUrl) {
    console.error(`    ❌ No quality playlist found in master.m3u8`);
    return null;
  }

  if (isVerbose) console.log(`      Quality: ${qualityUrl.split('/').slice(-2).join('/')}`);

  // 3. Download and concatenate all segments
  const videoBuffer = await downloadHlsSegments(qualityUrl);
  if (!videoBuffer) return null;

  if (isVerbose) {
    console.log(`      Video size: ${Math.round(videoBuffer.length / 1024 / 1024)}MB`);
  }

  // 4. Upload to CF Stream via TUS
  return uploadBufferToCfTus(videoBuffer, meta);
}

/**
 * Poll Cloudflare Stream until readyToStream or timeout.
 */
async function pollCfStream(videoId: string): Promise<CfStreamResult | null> {
  const url = `${CF_API}/accounts/${CF_ACCOUNT}/stream/${videoId}`;
  const startMs = Date.now();
  const timeoutMs = POLL_TIMEOUT_S * 1000;
  let delay = 3000;

  while (Date.now() - startMs < timeoutMs) {
    try {
      const resp = await fetch(url, { headers: cfHeaders() });
      const data = (await resp.json()) as {
        success: boolean;
        result?: {
          uid?: string;
          status?: { state?: string };
          readyToStream?: boolean;
          thumbnail?: string;
          playback?: {
            hls?: string;
            dash?: string;
          };
          duration?: number;
        };
      };

      if (!resp.ok || !data.success || !data.result) {
        await sleep(delay);
        delay = Math.min(delay * 1.5, 15000);
        continue;
      }

      const r = data.result;
      const ready = r.readyToStream === true;
      const state = r.status?.state ?? 'queued';

      if (isVerbose) {
        process.stdout.write(
          `\r      CF ${videoId}: ${state} (${Math.round((Date.now() - startMs) / 1000)}s)`
        );
      }

      const customerCode = CF_CUSTOMER;
      const iframeUrl = customerCode
        ? `https://${customerCode}.cloudflarestream.com/${videoId}/iframe`
        : null;
      const hlsUrl = customerCode
        ? `https://${customerCode}.cloudflarestream.com/${videoId}/manifest/video.m3u8`
        : (r.playback?.hls ?? null);
      const dashUrl = customerCode
        ? `https://${customerCode}.cloudflarestream.com/${videoId}/manifest/video.mpd`
        : (r.playback?.dash ?? null);
      const thumbnailUrl = customerCode
        ? `https://${customerCode}.cloudflarestream.com/${videoId}/thumbnails/thumbnail.jpg`
        : (r.thumbnail ?? null);

      if (ready || state === 'ready') {
        if (isVerbose) console.log('');
        return {
          uid: videoId,
          status: 'ready',
          readyToStream: true,
          thumbnailUrl,
          playback: { hlsUrl, dashUrl, iframeUrl },
          durationSeconds: typeof r.duration === 'number' ? r.duration : null,
        };
      }

      // Still processing
      await sleep(delay);
      delay = Math.min(delay * 1.3, 15000);
    } catch (err) {
      if (isVerbose) console.log('');
      console.error(`    ⚠ CF poll error: ${err instanceof Error ? err.message : err}`);
      await sleep(5000);
    }
  }

  if (isVerbose) console.log('');
  // Timed out — return partial info so we can still write the CF video ID
  const customerCode = CF_CUSTOMER;
  return {
    uid: videoId,
    status: 'inprogress',
    readyToStream: false,
    thumbnailUrl: customerCode
      ? `https://${customerCode}.cloudflarestream.com/${videoId}/thumbnails/thumbnail.jpg`
      : null,
    playback: {
      hlsUrl: customerCode
        ? `https://${customerCode}.cloudflarestream.com/${videoId}/manifest/video.m3u8`
        : null,
      dashUrl: customerCode
        ? `https://${customerCode}.cloudflarestream.com/${videoId}/manifest/video.mpd`
        : null,
      iframeUrl: customerCode
        ? `https://${customerCode}.cloudflarestream.com/${videoId}/iframe`
        : null,
    },
    durationSeconds: null,
  };
}

// ─── Image Copy ───────────────────────────────────────────────────────────────

/**
 * Copy a single file from the legacy bucket to the target bucket.
 * - Source is read via the legacy app credentials.
 * - Destination is written via the target app credentials.
 * - The destination file is made publicly accessible.
 * Returns the new public URL, or null on failure.
 */
async function copyImageToTarget(
  legacyBucket: Bucket,
  targetBucket: Bucket,
  legacyPath: string,
  targetPath: string,
  stats: Stats
): Promise<string | null> {
  if (isDryRun) {
    if (isVerbose) console.log(`      [DRY] copy ${legacyPath} → ${targetPath}`);
    stats.imageFilesCopied++;
    return publicUrl(TARGET_BUCKET_NAME, targetPath);
  }

  try {
    const [exists] = await targetBucket.file(targetPath).exists();
    if (exists) {
      if (isVerbose) console.log(`      ⏭  already exists: ${targetPath}`);
      return publicUrl(TARGET_BUCKET_NAME, targetPath);
    }

    // Download from legacy then upload to target (cross-project copy)
    const [fileBuffer] = await legacyBucket.file(legacyPath).download();

    const targetFile = targetBucket.file(targetPath);
    await targetFile.save(fileBuffer, {
      metadata: { cacheControl: 'public, max-age=31536000' },
      public: true, // makes it publicly accessible immediately
    });

    stats.imageFilesCopied++;
    if (isVerbose) console.log(`      ✅ copied: ${legacyPath} → ${targetPath}`);
    return publicUrl(TARGET_BUCKET_NAME, targetPath);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('404') || msg.includes('No such object')) {
      if (isVerbose) console.log(`      ⚠ not in legacy: ${legacyPath}`);
    } else {
      console.error(`      ❌ copy error ${legacyPath}: ${msg}`);
      stats.errors++;
    }
    return null;
  }
}

// ─── HLS Public-Access Helper ─────────────────────────────────────────────────

/**
 * Make every file under HLS/{postId}/ in the legacy bucket publicly accessible
 * so that Cloudflare can resolve relative segment URLs from the master.m3u8.
 * Returns the public URL of the master manifest, or null if not found.
 */
async function makeHlsPublicAndGetUrl(
  legacyBucket: Bucket,
  postId: string
): Promise<string | null> {
  const prefix = `HLS/${postId}/`;

  if (isDryRun) {
    if (isVerbose) console.log(`      [DRY] makePublic HLS/${postId}/ → public master.m3u8`);
    return `https://storage.googleapis.com/${LEGACY_BUCKET_NAME}/${prefix}master.m3u8`;
  }

  try {
    const [files] = await legacyBucket.getFiles({ prefix });
    if (files.length === 0) {
      if (isVerbose) console.log(`      ⚠ No HLS files found for ${postId}`);
      return null;
    }

    // Make all files public in parallel (segments + manifests)
    await Promise.all(files.map((f) => f.makePublic()));

    if (isVerbose) {
      console.log(`      ✅ made ${files.length} HLS files public for ${postId}`);
    }

    // Verify master.m3u8 exists
    const hasMaster = files.some((f) => f.name === `${prefix}master.m3u8`);
    if (!hasMaster) {
      // Some posts use a single-quality m3u8 without a master
      const firstM3u8 = files.find((f) => f.name.endsWith('.m3u8'));
      if (firstM3u8) {
        return `https://storage.googleapis.com/${LEGACY_BUCKET_NAME}/${firstM3u8.name}`;
      }
      return null;
    }

    return `https://storage.googleapis.com/${LEGACY_BUCKET_NAME}/${prefix}master.m3u8`;
  } catch (err) {
    console.error(
      `      ❌ makePublic HLS error for ${postId}: ${err instanceof Error ? err.message : err}`
    );
    return null;
  }
}

// ─── Post Processing ──────────────────────────────────────────────────────────

/**
 * Parse the postId embedded in a legacy HLS mediaUrl.
 * e.g. "https://storage.googleapis.com/.../HLS/P24hD5tx7.../master.m3u8?..."
 * → "P24hD5tx7..."
 */
function extractHlsPostId(mediaUrl: string | undefined): string | null {
  if (!mediaUrl) return null;
  const m = mediaUrl.match(/\/HLS\/([^/?#]+)\//);
  return m ? m[1] : null;
}

/**
 * Decide whether this post is a video post that needs Cloudflare migration.
 */
function isVideoPost(p: Record<string, unknown>): boolean {
  const type = clean(p['type'])?.toLowerCase();
  if (type === 'video' || type === 'highlight') return true;
  const mediaUrl = clean(p['mediaUrl'] ?? p['videoUrl']);
  if (!mediaUrl) return false;
  if (mediaUrl.includes('.m3u8') || mediaUrl.includes('HLS/')) return true;
  if (mediaUrl.includes('.mp4')) return true;
  return false;
}

/** Returns true if the mediaUrl points to an MP4 file (not HLS). */
function isMp4Url(url: string | undefined): boolean {
  if (!url) return false;
  // Strip query string before checking extension
  const path = url.split('?')[0].toLowerCase();
  return path.endsWith('.mp4');
}

/**
 * Download an MP4 from a URL (signed GCS URL is fine) into a Buffer.
 * Returns null on failure.
 */
async function downloadMp4Buffer(mp4Url: string): Promise<Buffer | null> {
  try {
    if (isVerbose) console.log(`      Downloading MP4…`);
    const resp = await fetch(mp4Url);
    if (!resp.ok) {
      console.error(`    ❌ MP4 download failed: HTTP ${resp.status}`);
      return null;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (isVerbose) console.log(`      MP4 size: ${Math.round(buf.length / 1024 / 1024)}MB`);
    return buf;
  } catch (err) {
    console.error(`    ❌ MP4 download error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Process a single post document.
 * Returns the v3 payload to write (or null to skip).
 */
async function processPost(
  uid: string,
  postId: string,
  p: Record<string, unknown>,
  legacyBucket: Bucket,
  targetBucket: Bucket,
  stats: Stats
): Promise<Record<string, unknown> | null> {
  const now = new Date().toISOString();

  // ── Base fields (always set) ────────────────────────────────────────────
  const v3: Record<string, unknown> = {
    id: postId,
    // Author
    authorId: uid,
    userId: uid,
    authorName:
      clean(p['authorName'] ?? p['userName']) ||
      [clean(p['firstName']), clean(p['lastName'])].filter(Boolean).join(' ') ||
      'Unknown',
    userName: clean(p['userName'] ?? p['authorName']) || undefined,
    firstName: clean(p['firstName']) || undefined,
    lastName: clean(p['lastName']) || undefined,
    userUnicode: clean(p['userUnicode']) || undefined,
    // Content
    title: clean(p['title']) || undefined,
    content: clean(p['description'] ?? p['content'] ?? p['text'] ?? p['body']) || '',
    type: clean(p['type']) || 'video',
    tags: Array.isArray(p['tags']) ? p['tags'] : [],
    attachedProfileData: Array.isArray(p['attachedProfileData'])
      ? p['attachedProfileData']
      : undefined,
    // Sport
    sport:
      clean(p['sport'])?.toLowerCase() ||
      clean(p['primarySport'] as string)?.toLowerCase() ||
      undefined,
    primarySport: clean(p['primarySport'] as string)?.toLowerCase() || undefined,
    secondarySport: clean(p['secondarySport'] as string) || undefined,
    // Engagement
    likes: num(p['likes']),
    comments: num(p['comments']),
    shares: num(p['shares']),
    reposts: num(p['reposts']),
    views: typeof p['views'] === 'number' ? p['views'] : undefined,
    videoViews: typeof p['videoViews'] === 'number' ? p['videoViews'] : undefined,
    stats: { shares: num(p['shares']), views: num(p['views'] ?? p['videoViews']) },
    // State
    visibility: p['isPublic'] === false ? 'private' : clean(p['visibility']) || 'public',
    isPublic: p['isPublic'] !== false,
    isVisible: p['isVisible'] !== false,
    pinned: p['isPinned'] === true || p['pinned'] === true,
    isPinned: p['isPinned'] === true || p['pinned'] === true,
    status: clean(p['status']) || undefined,
    // Repost
    isRepost: p['isRepost'] === true,
    originalPostId: clean(p['originalPostId']) || undefined,
    repostedAt: toISO(p['repostedAt']) || undefined,
    reposterId: clean(p['reposterId']) || undefined,
    reposterName: clean(p['reposterName']) || undefined,
    reposterUsername: clean(p['reposterUsername']) || undefined,
    // Content review
    contentReviewStatus: clean(p['contentReviewStatus']) || undefined,
    contentReviewStartedAt: toISO(p['contentReviewStartedAt']) || undefined,
    contentReviewCompletedAt: toISO(p['contentReviewCompletedAt']) || undefined,
    // Timestamps
    createdAt: toISO(p['createdAt']) || now,
    updatedAt: toISO(p['updatedAt']) || now,
    // Migration metadata
    _legacyId: postId,
    _migratedAt: now,
    _migratedFrom: `nxt-1-de054/Users/${uid}/Posts`,
    _schemaVersion: 3,
  };

  // ── Reposter profile image ─────────────────────────────────────────────
  const reposterImgRaw = clean(p['reposterProfileImg']);
  if (reposterImgRaw && isLegacyUrl(reposterImgRaw)) {
    const legacyPath = extractGcsPath(reposterImgRaw);
    if (legacyPath) {
      const targetPath = buildTargetImagePath(legacyPath, uid);
      const newUrl = await copyImageToTarget(
        legacyBucket,
        targetBucket,
        legacyPath,
        targetPath,
        stats
      );
      v3['reposterProfileImg'] = newUrl ?? reposterImgRaw;
    }
  } else {
    v3['reposterProfileImg'] = reposterImgRaw || undefined;
  }

  // ── Author profile image ───────────────────────────────────────────────
  const authorImgRaw = clean(p['authorProfileImg'] ?? p['profileImg']);
  if (authorImgRaw && isLegacyUrl(authorImgRaw)) {
    const legacyPath = extractGcsPath(authorImgRaw);
    if (legacyPath) {
      const targetPath = buildTargetImagePath(legacyPath, uid);
      const newUrl = await copyImageToTarget(
        legacyBucket,
        targetBucket,
        legacyPath,
        targetPath,
        stats
      );
      v3['authorProfileImg'] = newUrl ?? authorImgRaw;
      v3['profileImg'] = v3['authorProfileImg'];
    }
  } else {
    v3['authorProfileImg'] = authorImgRaw || undefined;
    v3['profileImg'] = authorImgRaw || undefined;
  }

  // ── VIDEO POST ──────────────────────────────────────────────────────────
  if (isVideoPost(p)) {
    const mediaUrlRaw = clean(p['mediaUrl'] ?? p['videoUrl']);
    const thumbnailRaw = clean(p['thumbnailUrl']);

    // -- Determine legacy postId in HLS storage
    const hlsPostId =
      extractHlsPostId(mediaUrlRaw) ||
      extractHlsPostId(clean(p['originalPostId']) ? `HLS/${clean(p['originalPostId'])}/` : '') ||
      (clean(p['originalPostId']) ?? postId);

    // -- Copy thumbnail to new bucket
    let newThumbnailUrl: string | null = null;
    if (thumbnailRaw && isLegacyUrl(thumbnailRaw)) {
      const thumbPath = extractGcsPath(thumbnailRaw);
      if (thumbPath) {
        // PostThumbnails/{postId}.jpg → Profiles/FeedImages/{userId}/thumbnail_{postId}.jpg
        const thumbFilename = basename(thumbPath);
        const targetThumbPath = `Profiles/FeedImages/${uid}/thumbnail_${thumbFilename}`;
        newThumbnailUrl = await copyImageToTarget(
          legacyBucket,
          targetBucket,
          thumbPath,
          targetThumbPath,
          stats
        );
      }
    }

    // -- Submit to Cloudflare Stream
    if (CF_TOKEN && CF_ACCOUNT) {
      let cfId: string | null = null;

      if (isMp4Url(mediaUrlRaw)) {
        // ── MP4: download directly and TUS-upload ──────────────────────
        if (isVerbose) console.log(`    📹 Video: MP4 detected, downloading…`);
        const mp4Buf = await (isDryRun
          ? Promise.resolve(Buffer.alloc(0))
          : downloadMp4Buffer(mediaUrlRaw!));
        if (mp4Buf && (isDryRun || mp4Buf.length > 0)) {
          cfId = isDryRun
            ? `dry-run-mp4-${postId}`
            : await uploadBufferToCfTus(mp4Buf, {
                name: clean(p['title']) || `Legacy post ${postId}`,
                userId: uid,
              });
        }
      } else {
        // ── HLS (m3u8): make public → download segments → TUS-upload ──
        if (isVerbose) console.log(`    📹 Video: making HLS/${hlsPostId}/ public…`);
        const publicM3u8 = await makeHlsPublicAndGetUrl(legacyBucket, hlsPostId);
        if (publicM3u8) {
          if (isVerbose) console.log(`    🚀 Submitting to CF Stream: ${publicM3u8}`);
          cfId = isDryRun
            ? `dry-run-${hlsPostId}`
            : await submitToCfStream(publicM3u8, {
                name: clean(p['title']) || `Legacy post ${postId}`,
                userId: uid,
              });
        }
      }

      if (cfId) {
        const cfResult = isDryRun
          ? ({
              uid: cfId,
              status: 'dry-run',
              readyToStream: false,
              thumbnailUrl: newThumbnailUrl,
              playback: { hlsUrl: null, dashUrl: null, iframeUrl: null },
              durationSeconds: null,
            } as CfStreamResult)
          : await pollCfStream(cfId);

        if (cfResult) {
          const finalThumbnail = newThumbnailUrl ?? cfResult.thumbnailUrl;
          Object.assign(v3, {
            cloudflareVideoId: cfResult.uid,
            cloudflareStatus: cfResult.status,
            readyToStream: cfResult.readyToStream,
            uploadProvider: 'legacy-migration',
            mediaUrl: cfResult.playback.iframeUrl ?? mediaUrlRaw,
            videoUrl: cfResult.playback.hlsUrl ?? mediaUrlRaw,
            url: cfResult.playback.iframeUrl ?? mediaUrlRaw,
            thumbnailUrl: finalThumbnail,
            poster: finalThumbnail,
            playback: {
              iframeUrl: cfResult.playback.iframeUrl,
              hlsUrl: cfResult.playback.hlsUrl,
              dashUrl: cfResult.playback.dashUrl,
            },
            duration: cfResult.durationSeconds,
            mediaUrls: [],
          });
          if (cfResult.readyToStream) {
            stats.videosCfReady++;
          } else {
            stats.videosCfPending++;
          }
          stats.videosCfSubmitted++;
        } else {
          // poll failed — write CF ID but mark pending
          Object.assign(v3, {
            cloudflareVideoId: cfId,
            mediaUrl: mediaUrlRaw,
            videoUrl: mediaUrlRaw,
            thumbnailUrl: newThumbnailUrl ?? thumbnailRaw,
            mediaUrls: [],
            _cfMigrationPending: true,
          });
          stats.videosCfPending++;
          stats.videosCfSubmitted++;
        }
      } else {
        // No cfId — upload failed or no source found
        Object.assign(v3, {
          mediaUrl: mediaUrlRaw,
          videoUrl: mediaUrlRaw,
          thumbnailUrl: newThumbnailUrl ?? thumbnailRaw,
          mediaUrls: [],
          _cfMigrationFailed: true,
        });
        stats.errors++;
      }
    } else {
      // CF not configured — keep legacy URLs, mark for later
      Object.assign(v3, {
        mediaUrl: mediaUrlRaw,
        videoUrl: mediaUrlRaw,
        thumbnailUrl: newThumbnailUrl ?? thumbnailRaw,
        mediaUrls: [],
        _cfMigrationPending: true,
      });
    }

    stats.imagesProcessed++;
  } else {
    // ── IMAGE / TEXT POST ────────────────────────────────────────────────
    const rawMediaUrls: string[] = Array.isArray(p['mediaUrls'])
      ? (p['mediaUrls'] as string[])
      : clean(p['mediaUrl'])
        ? [clean(p['mediaUrl']) as string]
        : [];

    const newMediaUrls: string[] = [];
    for (const rawUrl of rawMediaUrls) {
      if (!rawUrl) continue;
      if (isLegacyUrl(rawUrl)) {
        const legacyPath = extractGcsPath(rawUrl);
        if (legacyPath) {
          const targetPath = buildTargetImagePath(legacyPath, uid);
          const newUrl = await copyImageToTarget(
            legacyBucket,
            targetBucket,
            legacyPath,
            targetPath,
            stats
          );
          newMediaUrls.push(newUrl ?? rawUrl);
        } else {
          newMediaUrls.push(rawUrl);
        }
      } else if (isTargetUrl(rawUrl)) {
        newMediaUrls.push(rawUrl); // already migrated
      } else {
        newMediaUrls.push(rawUrl);
      }
    }

    // Thumbnail
    const thumbnailRaw = clean(p['thumbnailUrl']);
    let newThumbnailUrl: string | null = null;
    if (thumbnailRaw && isLegacyUrl(thumbnailRaw)) {
      const legacyPath = extractGcsPath(thumbnailRaw);
      if (legacyPath) {
        const targetPath = buildTargetImagePath(legacyPath, uid);
        newThumbnailUrl = await copyImageToTarget(
          legacyBucket,
          targetBucket,
          legacyPath,
          targetPath,
          stats
        );
      }
    }

    v3['mediaUrls'] = newMediaUrls;
    v3['thumbnailUrl'] = newThumbnailUrl ?? thumbnailRaw;
    stats.imagesProcessed++;
  }

  // Strip undefined
  for (const key of Object.keys(v3)) {
    if (v3[key] === undefined) delete v3[key];
  }

  return v3;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startMs = Date.now();

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  Posts Migration (legacy → V3 + Cloudflare Stream)');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Target        : ${target}  (${TARGET_BUCKET_NAME})`);
  console.log(`  Legacy bucket : ${LEGACY_BUCKET_NAME}`);
  console.log(`  Dry run       : ${isDryRun}`);
  console.log(`  CF configured : ${Boolean(CF_TOKEN && CF_ACCOUNT)}`);
  if (singleUid) console.log(`  Single UID    : ${singleUid}`);
  if (LIMIT > 0) console.log(`  Post limit    : ${LIMIT}`);

  if (!CF_TOKEN || !CF_ACCOUNT) {
    console.warn('  ⚠  CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set.');
    console.warn('     Video posts will keep legacy URLs and be flagged _cfMigrationPending=true.');
    console.warn('     Set CF env vars and re-run to migrate videos.\n');
  }

  const legacyApp = initLegacy();
  const targetApp = initTarget();

  const legacyDb = getFirestore(legacyApp);
  const targetDb = getFirestore(targetApp);
  legacyDb.settings({ ignoreUndefinedProperties: true });
  targetDb.settings({ ignoreUndefinedProperties: true });

  const legacyBucket = getStorage(legacyApp).bucket(LEGACY_BUCKET_NAME);
  const targetBucket = getStorage(targetApp).bucket(TARGET_BUCKET_NAME);

  const stats: Stats = {
    postsProcessed: 0,
    imagesProcessed: 0,
    imageFilesCopied: 0,
    videosCfSubmitted: 0,
    videosCfReady: 0,
    videosCfPending: 0,
    errors: 0,
    skipped: 0,
  };

  const pendingVideos: Array<{ postId: string; uid: string }> = [];

  // ── Iterate top-level Posts collection in legacy ─────────────────────────
  // Legacy stores posts in a top-level Posts collection with a userId field.
  let postCursor: FirebaseFirestore.DocumentSnapshot | undefined;
  let pageNum = 0;

  console.log('  Scanning legacy top-level Posts collection…\n');

  while (true) {
    if (LIMIT > 0 && stats.postsProcessed >= LIMIT) break;

    let q: FirebaseFirestore.Query = legacyDb
      .collection(POSTS_COLLECTION)
      .orderBy('__name__', 'asc')
      .limit(PAGE_SIZE);

    if (singleUid) {
      q = legacyDb
        .collection(POSTS_COLLECTION)
        .where('userId', '==', singleUid)
        .orderBy('__name__', 'asc')
        .limit(PAGE_SIZE);
    }

    if (postCursor) q = q.startAfter(postCursor);

    const postsSnap = await q.get();
    if (postsSnap.empty) break;
    pageNum++;

    // Process posts SEQUENTIALLY — write to Firestore immediately after each one
    for (const postDoc of postsSnap.docs) {
      if (LIMIT > 0 && stats.postsProcessed >= LIMIT) break;

      const postId = postDoc.id;
      const p = postDoc.data() as Record<string, unknown>;
      const uid = (p['userId'] ?? p['authorId'] ?? '') as string;

      process.stdout.write(
        `\r  [${stats.postsProcessed}] ${uid.slice(0, 8)}…/${postId.slice(0, 12)}…`.padEnd(70)
      );

      try {
        const v3Post = await processPost(uid, postId, p, legacyBucket, targetBucket, stats);
        if (!v3Post) {
          stats.skipped++;
          continue;
        }

        if (!isDryRun) {
          const ref = targetDb.collection(POSTS_COLLECTION).doc(postId);
          await ref.set(v3Post, { merge: false });
        }

        stats.postsProcessed++;

        if (v3Post['cloudflareVideoId'] && !v3Post['readyToStream']) {
          pendingVideos.push({ postId, uid });
        }
      } catch (err) {
        stats.errors++;
        console.error(`\n  ❌ ${uid}/${postId}: ${err instanceof Error ? err.message : err}`);
      }
    }

    postCursor = postsSnap.docs[postsSnap.docs.length - 1];
    if (postsSnap.docs.length < PAGE_SIZE) break;
  }

  process.stdout.write('\n');

  // ── Save pending video list so operator can re-check later ────────────
  if (pendingVideos.length > 0) {
    const reportPath = resolve(__dirname, `../../reports/cf-pending-${Date.now()}.json`);
    try {
      writeFileSync(reportPath, JSON.stringify(pendingVideos, null, 2));
      console.log(`\n  📋 Pending CF videos written to: ${reportPath}`);
    } catch {
      /* reports dir may not exist — print inline */
      console.log('\n  ⚠  Pending CF videos (not yet ready):');
      console.log(JSON.stringify(pendingVideos, null, 2));
    }
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  POSTS MIGRATION COMPLETE');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Posts written        : ${stats.postsProcessed}`);
  console.log(`  Skipped              : ${stats.skipped}`);
  console.log(`  Image files copied   : ${stats.imageFilesCopied}`);
  console.log(`  Videos → CF (total)  : ${stats.videosCfSubmitted}`);
  console.log(`    ✅ CF ready        : ${stats.videosCfReady}`);
  console.log(`    ⏳ CF pending      : ${stats.videosCfPending}`);
  console.log(`  Errors               : ${stats.errors}`);
  console.log(`  Time                 : ${elapsed}s`);
  console.log('');

  if (stats.errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
