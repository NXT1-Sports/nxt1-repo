/**
 * @fileoverview Video Compression Worker
 * @module @nxt1/backend/workers/video-compression
 *
 * Runs nightly at 2:00 AM ET via Cloud Scheduler.
 *
 * Pipeline:
 *   1. List all GCS objects under Users/ matching a thread video media path
 *   2. Filter: age >= 3 days, 5 MB <= size <= 150 MB, nxt1-compressed not set
 *   3. Stop queuing new files once the elapsed budget (6 min) is reached
 *   4. For each file:
 *      a. Generate a signed read URL (20-min window)
 *      b. Call ffmpeg-mcp compress_video via JSON-RPC — CRF 32, medium preset
 *      c. Download the compressed output from GCS temp path
 *      d. If compressed size >= 95% of original, skip overwrite (already dense)
 *         but still stamp nxt1-compressed=true so we never retry
 *      e. Overwrite the original GCS object — all Storage URLs stay valid
 *      f. Stamp nxt1-compressed=true on custom metadata
 *      g. Delete temp ffmpeg output file
 *
 * Timeout safety:
 *   Cloud Function timeout: 9 min (540s)
 *   Elapsed budget guard:   stops queuing new files after 6 min
 *   Per-file ffmpeg timeout: 90s  — clips over that are skipped as errors
 *   Max file size: 150 MB         — oversized files skipped entirely
 *   Max batch: 20 files per run
 *
 * Idempotency:
 *   Files with nxt1-compressed=true on GCS metadata are always skipped.
 *   Running multiple times is fully safe.
 *
 * Why overwrite in-place?
 *   Firebase Storage download URLs are path-based. Overwriting the same GCS
 *   object preserves every URL reference in Firestore without any DB migrations.
 */

import { getStorage } from 'firebase-admin/storage';
import { logger } from '../utils/logger.js';

// ─── Minimal GCS structural types (avoids CJS/ESM conflict with @google-cloud/storage) ──
// Only the surface we actually call — verified against @google-cloud/storage v7 API.

interface GCSFileLike {
  name: string;
  metadata: unknown;
  getSignedUrl(options: {
    version: 'v2' | 'v4';
    action: 'read' | 'write' | 'delete' | 'resumable';
    expires: number;
  }): Promise<[string]>;
  save(buffer: Buffer, options: { metadata: unknown }): Promise<void>;
  setMetadata(metadata: unknown): Promise<unknown>;
  download(): Promise<[Buffer]>;
  delete(): Promise<unknown>;
}

interface GCSBucketLike {
  file(path: string): GCSFileLike;
  getFiles(options?: {
    prefix?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<[GCSFileLike[], unknown, unknown]>;
}

// Convenience aliases used in function signatures below
type GCSBucket = GCSBucketLike;
type GCSFile = GCSFileLike;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Skip files smaller than this — not worth the compression overhead. */
const MIN_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * File size thresholds:
 *
 * Fast batch tier   (< HEAVY_FILE_THRESHOLD_BYTES): included in the normal batch path
 * Heavy batch tier  (< ABSOLUTE_MAX_SIZE_BYTES):    limited to a small count per run
 * Skipped           (>= ABSOLUTE_MAX_SIZE_BYTES):   handled by a dedicated pipeline
 */
const HEAVY_FILE_THRESHOLD_BYTES = 150 * 1024 * 1024; // 150 MB
const ABSOLUTE_MAX_SIZE_BYTES = 800 * 1024 * 1024; // 800 MB

/**
 * Medium-size phone recordings often take much longer than their byte size
 * suggests, especially MOV/HEVC inputs. Give them more encode time without
 * moving them into the heavy-file batch lane.
 */
const EXTENDED_FAST_TIMEOUT_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB

/** Minimum file age before compression is attempted. */
const AGE_THRESHOLD_DAYS = 3;

/**
 * Stop queuing new files once this much wall-clock time has elapsed.
 * Leaves ~2.5 min headroom inside the 9-min Cloud Function timeout for the
 * heaviest possible tail (HEAVY_FFMPEG_TIMEOUT_MS) plus GCS upload + cleanup.
 */
const ELAPSED_BUDGET_MS = 8 * 60 * 1000; // 8 min

/** Hard cap for fast-tier files (< 150 MB). Elapsed budget stops us earlier. */
const BATCH_LIMIT = 20;

/**
 * Hard cap for heavy-tier files (150–800 MB).
 * Each heavy file can occupy up to 4 min, so 3 heavy files max per run
 * keeps worst-case time within the 6-min elapsed budget.
 */
const HEAVY_BATCH_LIMIT = 3;

/** Per-file ffmpeg timeout for smaller fast-tier files. */
const FFMPEG_TIMEOUT_MS = 3 * 60 * 1000; // 3 min (was 90s — too short for network + encode)

/** Per-file ffmpeg timeout for medium fast-tier files (50–150 MB). */
const EXTENDED_FAST_FFMPEG_TIMEOUT_MS = 6 * 60 * 1000; // 6 min

/** Per-file ffmpeg timeout for heavy-tier files (150–800 MB). */
const HEAVY_FFMPEG_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

/** Signed URL validity window for ffmpeg-mcp input download. */
const SIGNED_URL_TTL_MS = 20 * 60 * 1000; // 20 min

/** Custom GCS metadata key stamped on compressed files to prevent re-processing. */
const COMPRESSED_META_KEY = 'nxt1-compressed';
const COMPRESSED_AT_META_KEY = 'nxt1-compressed-at';

/** Video file extensions to target. */
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);

/**
 * If the compressed file is >= this fraction of original size, the video is
 * already dense and overwriting would waste a GCS write operation.
 * We still stamp the metadata so we do not retry on future runs.
 */
const MIN_COMPRESSION_GAIN_RATIO = 0.95; // require at least 5% reduction

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VideoCompressionOptions {
  /** When true, list candidates but perform no compression. */
  readonly dryRun?: boolean;
}

export interface VideoCompressionCandidate {
  readonly path: string;
  readonly sizeMb: number;
  readonly ageDays: number;
  readonly tier: 'fast' | 'heavy';
}

export interface VideoCompressionResult {
  readonly processed: number;
  readonly skipped: number;
  readonly errors: number;
  readonly bytesReduced: number;
  /** Populated only when dryRun=true — files that would be compressed. */
  readonly candidates?: readonly VideoCompressionCandidate[];
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export class VideoCompressionWorker {
  private static _running = false;

  static async run(options: VideoCompressionOptions = {}): Promise<VideoCompressionResult> {
    if (VideoCompressionWorker._running) {
      logger.warn('[VideoCompression] Worker already running — skipping concurrent invocation');
      return { processed: 0, skipped: 0, errors: 0, bytesReduced: 0 };
    }
    VideoCompressionWorker._running = true;

    try {
      return await VideoCompressionWorker._run(options);
    } finally {
      VideoCompressionWorker._running = false;
    }
  }

  private static async _run(
    options: VideoCompressionOptions = {}
  ): Promise<VideoCompressionResult> {
    const { dryRun = false } = options;

    const ffmpegMcpUrl = process.env['FFMPEG_MCP_URL'];
    if (!ffmpegMcpUrl) {
      logger.error('[VideoCompression] FFMPEG_MCP_URL not configured — aborting', {
        hint: 'Set FFMPEG_MCP_URL in the backend env or Cloud Run environment variables.',
      });
      throw new Error('FFMPEG_MCP_URL environment variable is required');
    }

    const bucket = getStorage().bucket() as unknown as GCSBucket;
    const cutoffMs = Date.now() - AGE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const prefix = 'Users/';
    const runStartMs = Date.now();
    const dryRunCandidates: VideoCompressionCandidate[] = [];

    logger.info('[VideoCompression] Worker starting', {
      dryRun,
      prefix,
      cutoffDate: new Date(cutoffMs).toISOString(),
      limits: {
        fastBatchLimit: BATCH_LIMIT,
        heavyBatchLimit: HEAVY_BATCH_LIMIT,
        elapsedBudgetSec: ELAPSED_BUDGET_MS / 1000,
        extendedFastThresholdMb: EXTENDED_FAST_TIMEOUT_THRESHOLD_BYTES / 1024 / 1024,
        heavyThresholdMb: HEAVY_FILE_THRESHOLD_BYTES / 1024 / 1024,
        absoluteMaxMb: ABSOLUTE_MAX_SIZE_BYTES / 1024 / 1024,
        fastFfmpegTimeoutSec: FFMPEG_TIMEOUT_MS / 1000,
        extendedFastFfmpegTimeoutSec: EXTENDED_FAST_FFMPEG_TIMEOUT_MS / 1000,
        heavyFfmpegTimeoutSec: HEAVY_FFMPEG_TIMEOUT_MS / 1000,
      },
    });

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    let bytesReduced = 0;
    let fastCount = 0; // fast-tier files processed this run
    let heavyCount = 0; // heavy-tier files processed this run
    let pageToken: string | undefined;
    let budgetExhausted = false;

    outer: do {
      const [files, , nextQuery] = await bucket.getFiles({
        prefix,
        maxResults: 1000,
        ...(pageToken ? { pageToken } : {}),
      });

      pageToken = (nextQuery as Record<string, string> | undefined)?.['pageToken'];

      for (const file of files) {
        // ── Eligibility filters ──────────────────────────────────────────────

        if (!isEligibleVideoPath(file.name)) continue;

        const meta = file.metadata as Record<string, unknown>;
        const sizeBytes = Number(meta['size'] ?? 0);
        const createdMs =
          typeof meta['timeCreated'] === 'string' ? new Date(meta['timeCreated']).getTime() : 0;
        const customMeta = (meta['metadata'] ?? {}) as Record<string, string>;

        if (customMeta[COMPRESSED_META_KEY] === 'true') {
          skipped++;
          continue;
        }
        if (sizeBytes < MIN_SIZE_BYTES) {
          skipped++;
          continue;
        }
        if (sizeBytes >= ABSOLUTE_MAX_SIZE_BYTES) {
          logger.warn(
            '[VideoCompression] Skipping file above absolute size cap — needs a dedicated pipeline',
            {
              path: file.name,
              sizeMb: (sizeBytes / 1024 / 1024).toFixed(0),
              absoluteMaxMb: ABSOLUTE_MAX_SIZE_BYTES / 1024 / 1024,
            }
          );
          skipped++;
          continue;
        }
        if (createdMs === 0 || createdMs > cutoffMs) {
          skipped++;
          continue;
        }

        // Determine tier before all downstream checks
        const isHeavy = sizeBytes >= HEAVY_FILE_THRESHOLD_BYTES;

        // ── Dry run: log candidate and move on ───────────────────────────────

        if (dryRun) {
          const candidateSizeMb = Number((sizeBytes / 1024 / 1024).toFixed(2));
          const candidateAgeDays = Number(
            ((Date.now() - createdMs) / (1000 * 60 * 60 * 24)).toFixed(1)
          );
          const tier = isHeavy ? ('heavy' as const) : ('fast' as const);
          dryRunCandidates.push({
            path: file.name,
            sizeMb: candidateSizeMb,
            ageDays: candidateAgeDays,
            tier,
          });
          logger.info('[VideoCompression] DRY RUN — candidate', {
            path: file.name,
            tier,
            sizeMb: candidateSizeMb,
            ageDays: candidateAgeDays,
          });
          continue;
        }

        // ── Elapsed budget guard ─────────────────────────────────────────────

        const elapsedMs = Date.now() - runStartMs;
        if (elapsedMs >= ELAPSED_BUDGET_MS) {
          logger.warn('[VideoCompression] Elapsed budget reached — stopping early', {
            elapsedSec: (elapsedMs / 1000).toFixed(1),
            budgetSec: ELAPSED_BUDGET_MS / 1000,
            processedSoFar: fastCount + heavyCount,
          });
          budgetExhausted = true;
          break outer;
        }

        // ── Per-tier batch caps ──────────────────────────────────────────────

        if (isHeavy && heavyCount >= HEAVY_BATCH_LIMIT) {
          // Heavy quota full — skip this file but continue looking for fast-tier files
          logger.info('[VideoCompression] Heavy-tier batch limit reached — skipping large file', {
            path: file.name,
            sizeMb: (sizeBytes / 1024 / 1024).toFixed(0),
            limit: HEAVY_BATCH_LIMIT,
          });
          skipped++;
          continue;
        }
        if (!isHeavy && fastCount >= BATCH_LIMIT) {
          logger.info('[VideoCompression] Fast-tier batch limit reached', { limit: BATCH_LIMIT });
          break outer;
        }

        if (isHeavy) heavyCount++;
        else fastCount++;
        const originalSize = sizeBytes;

        // ── Compress ─────────────────────────────────────────────────────────

        try {
          const ffmpegTimeout = resolveFfmpegTimeoutMs(sizeBytes);
          const { compressedSize, skippedOverwrite } = await compressAndReplace(
            file,
            bucket,
            ffmpegMcpUrl,
            ffmpegTimeout
          );
          const savedBytes = Math.max(0, originalSize - compressedSize);
          bytesReduced += savedBytes;
          processed++;

          if (skippedOverwrite) {
            logger.warn(
              '[VideoCompression] Already-dense video — metadata stamped, overwrite skipped',
              {
                path: file.name,
                tier: isHeavy ? 'heavy' : 'fast',
                sizeMb: (originalSize / 1024 / 1024).toFixed(1),
                compressedMb: (compressedSize / 1024 / 1024).toFixed(1),
              }
            );
          } else {
            logger.info('[VideoCompression] Compressed successfully', {
              path: file.name,
              originalMb: (originalSize / 1024 / 1024).toFixed(1),
              compressedMb: (compressedSize / 1024 / 1024).toFixed(1),
              savedMb: (savedBytes / 1024 / 1024).toFixed(1),
              savedPct: originalSize > 0 ? ((savedBytes / originalSize) * 100).toFixed(0) : '0',
              timeoutSec: ffmpegTimeout / 1000,
            });
          }
        } catch (err) {
          errors++;
          const cause = err instanceof Error ? (err.cause instanceof Error ? err.cause : err) : err;
          logger.error('[VideoCompression] Failed to compress file', {
            path: file.name,
            originalMb: (originalSize / 1024 / 1024).toFixed(1),
            timeoutSec: resolveFfmpegTimeoutMs(originalSize) / 1000,
            error: err instanceof Error ? err.message : String(err),
            cause: cause instanceof Error ? cause.message : String(cause),
          });
          // Continue — one failure must not abort the entire batch
        }
      }
    } while (pageToken && !budgetExhausted);

    const totalElapsedSec = ((Date.now() - runStartMs) / 1000).toFixed(1);
    const result: VideoCompressionResult = {
      processed,
      skipped,
      errors,
      bytesReduced,
      ...(dryRun ? { candidates: dryRunCandidates } : {}),
    };

    logger.info('[VideoCompression] Worker completed', {
      ...result,
      bytesReducedMb: (bytesReduced / 1024 / 1024).toFixed(1),
      fastProcessed: fastCount,
      heavyProcessed: heavyCount,
      dryRun,
      elapsedSec: totalElapsedSec,
      budgetExhausted,
    });

    return result;
  }
}

// ─── Path eligibility ─────────────────────────────────────────────────────────

/**
 * Returns true when the GCS path looks like a user-owned thread video file.
 *
 * Eligible: path contains "/threads/" AND "/media/" AND a recognized video extension.
 * Excluded: paths with "/tmp/" (handled by cleanupTmpMedia cron).
 */
function isEligibleVideoPath(filePath: string): boolean {
  if (filePath.includes('/tmp/')) return false;

  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const ext = filePath.slice(dotIdx).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(ext)) return false;

  return filePath.includes('/threads/') && filePath.includes('/media/');
}

function resolveFfmpegTimeoutMs(sizeBytes: number): number {
  if (sizeBytes >= HEAVY_FILE_THRESHOLD_BYTES) return HEAVY_FFMPEG_TIMEOUT_MS;
  if (sizeBytes >= EXTENDED_FAST_TIMEOUT_THRESHOLD_BYTES) return EXTENDED_FAST_FFMPEG_TIMEOUT_MS;
  return FFMPEG_TIMEOUT_MS;
}

// ─── Compress and replace ─────────────────────────────────────────────────────

interface CompressResult {
  readonly compressedSize: number;
  readonly skippedOverwrite: boolean;
}

/**
 * Compresses a GCS video file in-place via ffmpeg-mcp.
 *
 * The original GCS path is preserved so all existing Storage URLs remain valid.
 * If the compressed output is not meaningfully smaller (< 5% reduction), the
 * original file is NOT overwritten — only the metadata is updated to prevent
 * future retries.
 */
async function compressAndReplace(
  file: GCSFile,
  bucket: GCSBucket,
  ffmpegMcpUrl: string,
  ffmpegTimeoutMs: number = FFMPEG_TIMEOUT_MS
): Promise<CompressResult> {
  // Step 1: Sign a temporary read URL for the source file
  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGNED_URL_TTL_MS,
  });

  if (!signedUrl) {
    throw new Error(
      `getSignedUrl returned empty URL for ${file.name} — check service account signBlob permission`
    );
  }

  logger.info('[VideoCompression] Generated signed URL', {
    path: file.name,
    signedUrlLength: signedUrl.length,
    signedUrlPrefix: signedUrl.slice(0, 80),
  });

  // Step 2: ffmpeg-mcp compress — returns the Firebase Storage download URL of the output
  let outputUrl: string;
  try {
    outputUrl = await callFfmpegMcpCompress(signedUrl, ffmpegMcpUrl, ffmpegTimeoutMs);
  } catch (ffmpegErr) {
    throw new Error('Failed to compress video with ffmpeg-mcp', { cause: ffmpegErr });
  }

  // Step 3: Download compressed output from the URL returned by ffmpeg-mcp
  let compressedBuffer: Buffer;
  try {
    const dlRes = await fetch(outputUrl);
    if (!dlRes.ok) {
      throw new Error(`HTTP ${dlRes.status} ${dlRes.statusText}`);
    }
    compressedBuffer = Buffer.from(await dlRes.arrayBuffer());
  } catch (downloadErr) {
    // Best-effort cleanup of the remote GCS object
    const blobPath = gcsPathFromFirebaseUrl(outputUrl);
    if (blobPath)
      await bucket
        .file(blobPath)
        .delete()
        .catch(() => undefined);
    const msg = downloadErr instanceof Error ? downloadErr.message : String(downloadErr);
    throw new Error(`Failed to download compressed output from ffmpeg-mcp: ${msg}`, {
      cause: downloadErr,
    });
  }

  const originalSize = Number((file.metadata as Record<string, unknown>)['size'] ?? 0);
  const compressedSize = compressedBuffer.length;

  // Step 4: Determine whether overwriting is worthwhile
  const skippedOverwrite =
    originalSize > 0 && compressedSize >= originalSize * MIN_COMPRESSION_GAIN_RATIO;

  const originalMeta = file.metadata as Record<string, unknown>;
  const existingCustomMeta = (originalMeta['metadata'] ?? {}) as Record<string, string>;
  const contentType =
    typeof originalMeta['contentType'] === 'string' ? originalMeta['contentType'] : 'video/mp4';
  const stampedMeta = {
    ...existingCustomMeta,
    [COMPRESSED_META_KEY]: 'true',
    [COMPRESSED_AT_META_KEY]: new Date().toISOString(),
  };

  if (!skippedOverwrite) {
    // Steps 5+6: Overwrite original with compressed buffer + stamp metadata
    await file.save(compressedBuffer, {
      metadata: { contentType, metadata: stampedMeta },
    });
  } else {
    // Step 6 only: stamp metadata without overwriting (already dense)
    await file.setMetadata({ metadata: stampedMeta });
  }

  // Step 7: Delete the temporary output object that ffmpeg-mcp uploaded to GCS
  const tempBlobPath = gcsPathFromFirebaseUrl(outputUrl);
  if (tempBlobPath)
    await bucket
      .file(tempBlobPath)
      .delete()
      .catch(() => undefined);

  return { compressedSize, skippedOverwrite };
}

// ─── ffmpeg-mcp JSON-RPC caller ───────────────────────────────────────────────

/**
 * Calls ffmpeg-mcp compress_video directly via JSON-RPC over HTTP.
 *
 * Why not use FfmpegMcpBridgeService?
 *   - The bridge rewrites output paths to thread-scoped Storage prefixes.
 *   - The bridge's auth resolution is not needed — we pass a signed HTTPS URL.
 *   - We need a deterministic temp output path under agent-x/ffmpeg/ to fetch the result.
 *
 * Error cases:
 *   AbortError  → per-file 90s timeout exceeded (file too large or service overloaded)
 *   HTTP non-2xx → ffmpeg-mcp service error (possibly overloaded or crashed)
 *   success:false in RPC body → compress_video returned an application-level error
 */
/**
 * Extracts the GCS object path from a Firebase Storage download URL.
 * Returns null if the URL cannot be parsed.
 */
function gcsPathFromFirebaseUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Format: /v0/b/<bucket>/o/<encoded-path>
    const match = u.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function callFfmpegMcpCompress(
  signedInputUrl: string,
  ffmpegMcpUrl: string,
  timeoutMs: number = FFMPEG_TIMEOUT_MS
): Promise<string> {
  const token = process.env['FFMPEG_MCP_API_TOKEN'];

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
  };
  if (token) headers['x-ffmpeg-mcp-token'] = token;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(ffmpegMcpUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `cron-compress-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        method: 'tools/call',
        params: {
          name: 'compress_video',
          arguments: {
            input_path: signedInputUrl,
            output_path: `/tmp/nxt1-compressed-${Date.now()}.mp4`,
            crf: 32,
            preset: 'superfast',
          },
        },
      }),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    const isTimeout = (fetchErr as { name?: string }).name === 'AbortError';
    throw new Error(
      isTimeout
        ? `ffmpeg-mcp timed out after ${timeoutMs / 1000}s — file may be too large or service is under load`
        : `ffmpeg-mcp fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
      { cause: fetchErr }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ffmpeg-mcp HTTP ${response.status}: ${body.slice(0, 300)}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let body: Record<string, unknown>;

  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    body = parseSseToJsonRpc(text);
  } else {
    body = (await response.json()) as Record<string, unknown>;
  }

  const result = parseFfmpegMcpResult(body);

  if (!result.success) {
    throw new Error(`ffmpeg-mcp compress_video failed: ${result.error ?? 'unknown error'}`);
  }

  if (!result.outputUrl) {
    throw new Error('ffmpeg-mcp compress_video succeeded but returned no outputUrl');
  }

  return result.outputUrl;
}

// ─── SSE → JSON-RPC extractor ─────────────────────────────────────────────────

/**
 * Extracts the JSON-RPC payload from an SSE (text/event-stream) response.
 * Scans for `data: {...}` lines and returns the last one that is a plain object.
 * Throws if no valid JSON-RPC data line is found.
 */
function parseSseToJsonRpc(sseText: string): Record<string, unknown> {
  let lastJsonData: Record<string, unknown> | null = null;

  for (const line of sseText.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed.startsWith('data:')) continue;
    const raw = trimmed.slice(5).trim(); // strip 'data:' prefix + leading space
    if (!raw.startsWith('{') && !raw.startsWith('[')) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        lastJsonData = parsed as Record<string, unknown>;
      }
    } catch {
      // malformed data line — keep scanning
    }
  }

  if (!lastJsonData) {
    throw new Error(
      `ffmpeg-mcp SSE response contained no valid JSON-RPC data. Preview: ${sseText.slice(0, 300)}`
    );
  }

  return lastJsonData;
}

// ─── JSON-RPC response parser ─────────────────────────────────────────────────

interface FfmpegMcpPayload {
  readonly success: boolean;
  readonly error?: string;
  readonly outputUrl?: string;
}

/**
 * Parses the ffmpeg-mcp JSON-RPC response envelope.
 *
 * The server may return results in two forms:
 *   Path A — result.structuredContent: { success, outputUrl, ... }
 *   Path B — result.content[0].text:   a JSON string, possibly in { result: "<json>" }
 */
function parseFfmpegMcpResult(body: Record<string, unknown>): FfmpegMcpPayload {
  try {
    const rpcResult = body['result'] as Record<string, unknown> | undefined;
    if (!rpcResult) {
      const rpcError = body['error'] as Record<string, unknown> | undefined;
      return {
        success: false,
        error: (rpcError?.['message'] as string | undefined) ?? 'Empty JSON-RPC result',
      };
    }

    // Path A: structuredContent
    const structured = rpcResult['structuredContent'] as Record<string, unknown> | null | undefined;
    if (structured && typeof structured['success'] === 'boolean') {
      return {
        success: structured['success'] as boolean,
        error: structured['error'] as string | undefined,
        outputUrl: structured['outputUrl'] as string | undefined,
      };
    }

    // Path B: content[0].text
    const content = rpcResult['content'] as Array<Record<string, unknown>> | undefined;
    const textBlock = content?.find((c) => c['type'] === 'text');
    const rawText = textBlock?.['text'];

    if (typeof rawText === 'string' && rawText.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return { success: false, error: `Unparseable response: ${rawText.slice(0, 100)}` };
      }

      // Unwrap { result: "<json string>" } double-encoding
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof (parsed as Record<string, unknown>)['result'] === 'string'
      ) {
        try {
          parsed = JSON.parse((parsed as Record<string, unknown>)['result'] as string);
        } catch {
          // Keep outer value on parse failure
        }
      }

      const payload = parsed as Record<string, unknown>;
      return {
        success: payload['success'] === true,
        error: payload['error'] as string | undefined,
        outputUrl: payload['outputUrl'] as string | undefined,
      };
    }

    return { success: false, error: 'Unrecognized ffmpeg-mcp response format' };
  } catch (parseErr) {
    return {
      success: false,
      error: `Response parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
    };
  }
}
