/**
 * @fileoverview Gemini Files API Service
 * @module @nxt1/backend/modules/agent/llm
 *
 * Uploads video/media files to the Gemini Files API and performs direct
 * Gemini analysis — bypassing the OpenRouter-proxied `video_url` fetch path.
 *
 * ## Why this exists
 * When Agent X analyzes a Firebase/GCS-hosted video (especially `.mov`) via
 * OpenRouter, Gemini tries to **fetch the URL itself** from Google infrastructure.
 * Firebase Storage signed URLs are bound by IP, Origin, and short TTLs — Gemini
 * cannot fetch them, producing:
 *   `INVALID_ARGUMENT: Cannot fetch content from the provided URL`
 *
 * The correct fix: **upload the file to Gemini Files API first** (using our
 * backend's privileged `fetch` to stream the bytes), receive a stable
 * `file_uri`, then call the Gemini API **directly** (not via OpenRouter) with
 * that `file_uri`. No FFmpeg needed for MOV — `video/quicktime` is natively
 * supported.
 *
 * ## File lifecycle
 * Files uploaded via the Gemini Files API are automatically deleted after 48 h.
 *
 * ## Environment variables required
 * - `GEMINI_API_KEY` — Google AI Studio API key.
 *   Get it at: https://aistudio.google.com/apikey
 *   Add to your `.env` / App Hosting secrets as `GEMINI_API_KEY`.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAICacheManager, GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { createHash } from 'node:crypto';
import { logger } from '../../../utils/logger.js';
import { getCacheService } from '../../../services/core/cache.service.js';
import type { LLMCompletionResult } from './llm.types.js';

// ─── MIME type map ───────────────────────────────────────────────────────────

const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mpeg: 'video/mpeg',
  mpg: 'video/mpg',
  avi: 'video/avi',
  webm: 'video/webm',
  wmv: 'video/wmv',
  '3gpp': 'video/3gpp',
  m4v: 'video/mp4',
  flv: 'video/x-flv',
};

/** Gemini model used for video analysis (matches the video_analysis tier). */
const GEMINI_VIDEO_MODEL = 'gemini-2.5-flash';

/**
 * Gemini 2.5 Flash wholesale pricing (USD per token).
 * Source: https://ai.google.dev/pricing — Gemini 2.5 Flash standard tier.
 * Prompts under 128k tokens: $0.15 / 1M input, $0.60 / 1M output.
 * We use these rates for all video analyses; the 3× platform margin in
 * calculateChargeAmount() absorbs any variation from longer-context pricing.
 */
const GEMINI_2_5_FLASH_INPUT_COST_PER_TOKEN = 0.15 / 1_000_000; // $0.00000015
const GEMINI_2_5_FLASH_OUTPUT_COST_PER_TOKEN = 0.6 / 1_000_000; // $0.00000060

/** System prompt for video analysis — same as OpenRouter path. */
const VIDEO_ANALYSIS_SYSTEM_PROMPT =
  'You are an elite sports video analyst and coaching assistant. ' +
  'Analyze the provided video(s) with expert-level detail. ' +
  'Focus on actionable coaching insights, specific plays/timestamps when possible, ' +
  'schematic tendencies, player technique evaluation, and strategic recommendations. ' +
  'Structure your analysis with clear sections and be thorough.';

/** Fallback when extension is unknown. */
const DEFAULT_VIDEO_MIME = 'video/mp4';
const DEFAULT_MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_FILE_ACTIVE_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_CONTEXT_CACHE_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_CONTEXT_CACHE_META_TTL_SECONDS = 7 * 60 * 60;

function parsePositiveIntEnv(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn('[GeminiFilesService] Invalid env override; using fallback', {
      envName,
      raw,
      fallback,
    });
    return fallback;
  }
  return Math.floor(parsed);
}

const MAX_UPLOAD_BYTES = parsePositiveIntEnv(
  'AGENT_X_GEMINI_MAX_UPLOAD_BYTES',
  DEFAULT_MAX_UPLOAD_BYTES
);
const CONTEXT_CACHE_ENABLED =
  (process.env['AGENT_X_GEMINI_CONTEXT_CACHE_ENABLED'] ?? 'true').trim().toLowerCase() !== 'false';
const CONTEXT_CACHE_TTL_SECONDS = parsePositiveIntEnv(
  'AGENT_X_GEMINI_CONTEXT_CACHE_TTL_SECONDS',
  DEFAULT_CONTEXT_CACHE_TTL_SECONDS
);
const CONTEXT_CACHE_META_TTL_SECONDS = parsePositiveIntEnv(
  'AGENT_X_GEMINI_CONTEXT_CACHE_META_TTL_SECONDS',
  DEFAULT_CONTEXT_CACHE_META_TTL_SECONDS
);

/** How long to wait for Gemini Files API to finish processing an upload (ms). */
const FILE_ACTIVE_POLL_INTERVAL_MS = 2_000;
const FILE_ACTIVE_TIMEOUT_MS = parsePositiveIntEnv(
  'AGENT_X_GEMINI_FILE_ACTIVE_TIMEOUT_MS',
  DEFAULT_FILE_ACTIVE_TIMEOUT_MS
);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeminiUploadResult {
  /** The stable `file_uri` to pass into Gemini generateContent. */
  readonly fileUri: string;
  /** The detected/resolved MIME type. */
  readonly mimeType: string;
  /** Original source URL that was uploaded. */
  readonly sourceUrl: string;
}

export interface GeminiVideoAnalysisOptions {
  readonly userId?: string;
  readonly threadId?: string;
  readonly operationId?: string;
  readonly enableContextCache?: boolean;
}

interface GeminiContextCacheMetadata {
  readonly cacheName: string;
  readonly cacheKey: string;
  readonly model: string;
  readonly userId: string;
  readonly threadId?: string;
  readonly sourceUrlDigest: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly lastUsedAt?: string;
  readonly hitCount: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class GeminiFilesService {
  private readonly fileManager: GoogleAIFileManager;
  private readonly cacheManager: GoogleAICacheManager;
  private readonly genAI: GoogleGenerativeAI;
  private contextCacheRuntimeDisabled = false;
  private contextCacheDisableReason: string | null = null;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error(
        'GeminiFilesService requires GEMINI_API_KEY. ' +
          'Get one at https://aistudio.google.com/apikey and add it to your environment as GEMINI_API_KEY.'
      );
    }
    this.fileManager = new GoogleAIFileManager(key);
    this.cacheManager = new GoogleAICacheManager(key);
    this.genAI = new GoogleGenerativeAI(key);
  }

  /**
   * Returns `true` if the service can be instantiated (env var is set).
   * Use this for optional wiring in bootstrap.
   */
  static isConfigured(): boolean {
    return Boolean(process.env['GEMINI_API_KEY']);
  }

  /**
   * Full analysis workflow: download URL → upload to Gemini Files API
   * → call Gemini directly (NOT via OpenRouter) → return `LLMCompletionResult`.
   *
   * This is the primary entry point for `AnalyzeVideoTool` when analyzing a
   * single direct video URL. It bypasses OpenRouter entirely because OpenRouter
   * cannot proxy Gemini Files API file references.
   */
  async analyzeVideoFromUrl(
    sourceUrl: string,
    prompt: string,
    maxOutputTokens = 8192,
    options?: GeminiVideoAnalysisOptions
  ): Promise<LLMCompletionResult> {
    return this.analyzeVideosFromUrls([sourceUrl], prompt, maxOutputTokens, options);
  }

  /**
   * Full analysis workflow for one or more direct video URLs. Each URL is
   * downloaded by the backend, uploaded to Gemini Files API, then referenced in
   * a single Gemini request so batched video analysis stays in one model call.
   */
  async analyzeVideosFromUrls(
    sourceUrls: readonly string[],
    prompt: string,
    maxOutputTokens = 8192,
    options?: GeminiVideoAnalysisOptions
  ): Promise<LLMCompletionResult> {
    if (sourceUrls.length === 0) {
      throw new Error('Gemini Files API video analysis requires at least one source URL.');
    }

    const startMs = Date.now();
    const cacheKey = this.buildContextCacheKey(sourceUrls, options);

    if (this.shouldUseContextCache(options) && cacheKey) {
      const cachedAnalysis = await this.tryAnalyzeWithContextCache(
        cacheKey,
        sourceUrls,
        prompt,
        maxOutputTokens,
        startMs,
        options
      );
      if (cachedAnalysis) {
        return cachedAnalysis;
      }
    }

    const uploads: GeminiUploadResult[] = [];
    for (const sourceUrl of sourceUrls) {
      uploads.push(await this.uploadFromUrl(sourceUrl));
    }

    logger.info('[GeminiFilesService] Calling Gemini directly with Files API references', {
      sourceUrls,
      files: uploads.map((upload) => ({
        fileUri: upload.fileUri,
        mimeType: upload.mimeType,
      })),
      model: GEMINI_VIDEO_MODEL,
    });

    const maybeCachedContent =
      this.shouldUseContextCache(options) && cacheKey
        ? await this.tryCreateContextCache(cacheKey, uploads, options)
        : null;

    const result = maybeCachedContent
      ? await this.genAI
          .getGenerativeModelFromCachedContent(maybeCachedContent, {
            generationConfig: {
              maxOutputTokens,
              temperature: 0.3,
            },
          })
          .generateContent([{ text: prompt }])
      : await this.genAI
          .getGenerativeModel({
            model: GEMINI_VIDEO_MODEL,
            systemInstruction: VIDEO_ANALYSIS_SYSTEM_PROMPT,
            generationConfig: {
              maxOutputTokens,
              temperature: 0.3,
            },
          })
          .generateContent([
            ...uploads.map((upload) => ({
              fileData: { mimeType: upload.mimeType, fileUri: upload.fileUri },
            })),
            { text: prompt },
          ]);

    const response = result.response;
    const content = response.text();
    const usageMeta = response.usageMetadata;
    const latencyMs = Date.now() - startMs;

    logger.info('[GeminiFilesService] Video analysis complete', {
      sourceUrls,
      model: GEMINI_VIDEO_MODEL,
      latencyMs,
      inputTokens: usageMeta?.promptTokenCount ?? 0,
      outputTokens: usageMeta?.candidatesTokenCount ?? 0,
      contextCacheHit: false,
      contextCacheCreated: Boolean(maybeCachedContent),
    });

    const inputTokens = usageMeta?.promptTokenCount ?? 0;
    const outputTokens = usageMeta?.candidatesTokenCount ?? 0;
    const costUsd =
      inputTokens * GEMINI_2_5_FLASH_INPUT_COST_PER_TOKEN +
      outputTokens * GEMINI_2_5_FLASH_OUTPUT_COST_PER_TOKEN;

    logger.info('[GeminiFilesService] Computed video analysis cost', {
      sourceUrls,
      model: GEMINI_VIDEO_MODEL,
      inputTokens,
      outputTokens,
      costUsd,
    });

    return {
      content: content || null,
      toolCalls: [],
      model: GEMINI_VIDEO_MODEL,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: usageMeta?.totalTokenCount ?? 0,
      },
      latencyMs,
      costUsd,
      finishReason: response.candidates?.[0]?.finishReason ?? 'STOP',
    };
  }

  private shouldUseContextCache(options?: GeminiVideoAnalysisOptions): boolean {
    if (!CONTEXT_CACHE_ENABLED) return false;
    if (this.contextCacheRuntimeDisabled) return false;
    if (options?.enableContextCache === false) return false;
    return Boolean(options?.userId);
  }

  private disableContextCacheRuntime(reason: string): void {
    if (this.contextCacheRuntimeDisabled) return;
    this.contextCacheRuntimeDisabled = true;
    this.contextCacheDisableReason = reason;
    logger.warn('[GeminiFilesService] Context cache disabled for current process runtime', {
      reason,
      model: GEMINI_VIDEO_MODEL,
    });
  }

  private isTooSmallForContextCacheError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = message.toLowerCase();
    return (
      normalized.includes('cached content is too small') ||
      (normalized.includes('400') && normalized.includes('min_total_token_count'))
    );
  }

  private isNonRecoverableContextCacheError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    const normalized = message.toLowerCase();

    return (
      normalized.includes('totalcachedcontentstoragetokenspermodelfreetier') ||
      (normalized.includes('limit exceeded') && normalized.includes('cachedcontent')) ||
      normalized.includes('limit=0') ||
      normalized.includes('403') ||
      normalized.includes('permission denied')
    );
  }

  private buildContextCacheKey(
    sourceUrls: readonly string[],
    options?: GeminiVideoAnalysisOptions
  ): string | null {
    if (!options?.userId) return null;

    const digest = this.computeSourceUrlDigest(sourceUrls);
    const scopeMaterial = JSON.stringify({
      model: GEMINI_VIDEO_MODEL,
      userId: options.userId,
      threadId: options.threadId ?? '',
      sourceDigest: digest,
    });
    const hash = createHash('sha256').update(scopeMaterial).digest('hex').slice(0, 32);
    return `agent:gemini:video-context-cache:${hash}`;
  }

  private computeSourceUrlDigest(sourceUrls: readonly string[]): string {
    const canonical = sourceUrls
      .map((url) => this.normalizeSourceUrlForCache(url))
      .sort((a, b) => a.localeCompare(b));
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private normalizeSourceUrlForCache(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      const [base] = url.split('?');
      return base ?? url;
    }
  }

  private async tryAnalyzeWithContextCache(
    cacheKey: string,
    sourceUrls: readonly string[],
    prompt: string,
    maxOutputTokens: number,
    startMs: number,
    options?: GeminiVideoAnalysisOptions
  ): Promise<LLMCompletionResult | null> {
    const metadata = await this.getContextCacheMetadata(cacheKey);
    if (!metadata?.cacheName) return null;

    try {
      const cachedContent = await this.cacheManager.get(metadata.cacheName);
      const model = this.genAI.getGenerativeModelFromCachedContent(cachedContent, {
        generationConfig: {
          maxOutputTokens,
          temperature: 0.3,
        },
      });
      const result = await model.generateContent([{ text: prompt }]);
      const response = result.response;
      const usageMeta = response.usageMetadata;
      const latencyMs = Date.now() - startMs;

      await this.setContextCacheMetadata(cacheKey, {
        ...metadata,
        hitCount: metadata.hitCount + 1,
        lastUsedAt: new Date().toISOString(),
      });

      const inputTokens = usageMeta?.promptTokenCount ?? 0;
      const outputTokens = usageMeta?.candidatesTokenCount ?? 0;
      const costUsd =
        inputTokens * GEMINI_2_5_FLASH_INPUT_COST_PER_TOKEN +
        outputTokens * GEMINI_2_5_FLASH_OUTPUT_COST_PER_TOKEN;

      logger.info('[GeminiFilesService] Video analysis complete via context cache', {
        sourceUrls,
        model: GEMINI_VIDEO_MODEL,
        latencyMs,
        inputTokens,
        outputTokens,
        contextCacheHit: true,
        cacheKey,
        cacheName: metadata.cacheName,
        operationId: options?.operationId,
      });

      return {
        content: response.text() || null,
        toolCalls: [],
        model: GEMINI_VIDEO_MODEL,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: usageMeta?.totalTokenCount ?? 0,
        },
        latencyMs,
        costUsd,
        finishReason: response.candidates?.[0]?.finishReason ?? 'STOP',
      };
    } catch (err) {
      logger.warn(
        '[GeminiFilesService] Context cache lookup failed; falling back to direct upload',
        {
          cacheKey,
          cacheName: metadata.cacheName,
          error: err instanceof Error ? err.message : String(err),
        }
      );
      if (this.isNonRecoverableContextCacheError(err)) {
        this.disableContextCacheRuntime(err instanceof Error ? err.message : String(err));
      }
      await this.deleteContextCacheMetadata(cacheKey);
      return null;
    }
  }

  private async tryCreateContextCache(
    cacheKey: string,
    uploads: readonly GeminiUploadResult[],
    options?: GeminiVideoAnalysisOptions
  ): Promise<import('@google/generative-ai').CachedContent | null> {
    if (!options?.userId || uploads.length === 0) return null;

    try {
      const cachedContent = await this.cacheManager.create({
        model: `models/${GEMINI_VIDEO_MODEL}`,
        systemInstruction: VIDEO_ANALYSIS_SYSTEM_PROMPT,
        ttlSeconds: CONTEXT_CACHE_TTL_SECONDS,
        displayName: `nxt1-video-cache-${Date.now()}`,
        contents: [
          {
            role: 'user',
            parts: uploads.map((upload) => ({
              fileData: {
                mimeType: upload.mimeType,
                fileUri: upload.fileUri,
              },
            })),
          },
        ],
      });

      if (!cachedContent.name) {
        logger.warn(
          '[GeminiFilesService] Created context cache without cache name; skipping metadata write'
        );
        return null;
      }

      await this.setContextCacheMetadata(cacheKey, {
        cacheKey,
        cacheName: cachedContent.name,
        model: GEMINI_VIDEO_MODEL,
        userId: options.userId,
        threadId: options.threadId,
        sourceUrlDigest: this.computeSourceUrlDigest(uploads.map((u) => u.sourceUrl)),
        createdAt: new Date().toISOString(),
        expiresAt: cachedContent.expireTime,
        hitCount: 0,
      });

      logger.info('[GeminiFilesService] Context cache created for video analysis', {
        cacheKey,
        cacheName: cachedContent.name,
        userId: options.userId,
        threadId: options.threadId,
        ttlSeconds: CONTEXT_CACHE_TTL_SECONDS,
      });

      return cachedContent;
    } catch (err) {
      if (this.isTooSmallForContextCacheError(err)) {
        logger.debug(
          '[GeminiFilesService] Skipping context cache — content below minimum token threshold',
          { cacheKey, error: err instanceof Error ? err.message : String(err) }
        );
        return null;
      }
      if (this.isNonRecoverableContextCacheError(err)) {
        this.disableContextCacheRuntime(err instanceof Error ? err.message : String(err));
      }
      logger.warn('[GeminiFilesService] Failed to create context cache; continuing without cache', {
        cacheKey,
        error: err instanceof Error ? err.message : String(err),
        contextCacheRuntimeDisabled: this.contextCacheRuntimeDisabled,
        disableReason: this.contextCacheDisableReason,
      });
      return null;
    }
  }

  private async getContextCacheMetadata(
    cacheKey: string
  ): Promise<GeminiContextCacheMetadata | null> {
    try {
      const cache = getCacheService();
      const value = await cache.get<GeminiContextCacheMetadata>(cacheKey);
      return value ?? null;
    } catch {
      return null;
    }
  }

  private async setContextCacheMetadata(
    cacheKey: string,
    metadata: GeminiContextCacheMetadata
  ): Promise<void> {
    try {
      const cache = getCacheService();
      await cache.set(cacheKey, metadata, { ttl: CONTEXT_CACHE_META_TTL_SECONDS });
    } catch (err) {
      logger.warn('[GeminiFilesService] Failed to persist context cache metadata', {
        cacheKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async deleteContextCacheMetadata(cacheKey: string): Promise<void> {
    try {
      const cache = getCacheService();
      await cache.del(cacheKey);
    } catch {
      // Best effort cleanup.
    }
  }

  /**
   * Downloads a video from `sourceUrl` and uploads the bytes to the Gemini
   * Files API. Returns a `GeminiUploadResult` with the stable `fileUri`.
   *
   * Use `analyzeVideoFromUrl` for the full analysis workflow.
   */
  async uploadFromUrl(sourceUrl: string): Promise<GeminiUploadResult> {
    const mimeType = this.mimeTypeFromUrl(sourceUrl);

    logger.info('[GeminiFilesService] Downloading video for Files API upload', {
      sourceUrl,
      mimeType,
    });

    // ── Download ────────────────────────────────────────────────────────────
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download video from ${sourceUrl}: HTTP ${response.status} ${response.statusText}`
      );
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > 0 && contentLength > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Video file is too large for Gemini Files API upload (${(contentLength / 1024 / 1024).toFixed(1)} MB > ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit).`
      );
    }

    const videoBuffer = Buffer.from(await response.arrayBuffer());

    if (videoBuffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Video file is too large for Gemini Files API upload (${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB > ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit).`
      );
    }

    logger.info('[GeminiFilesService] Uploading to Gemini Files API', {
      sourceUrl,
      mimeType,
      sizeBytes: videoBuffer.byteLength,
    });

    // ── Upload to Gemini Files API ───────────────────────────────────────────
    const uploadResponse = await this.fileManager.uploadFile(videoBuffer, {
      mimeType,
      displayName: `nxt1-video-${Date.now()}`,
    });

    let fileUri = uploadResponse.file.uri;

    // ── Wait for ACTIVE state ────────────────────────────────────────────────
    // Gemini Files API may require time to process the upload before it can
    // be referenced in generateContent calls. Poll until ACTIVE.
    if (uploadResponse.file.state !== FileState.ACTIVE) {
      fileUri = await this.waitForActive(uploadResponse.file.name, sourceUrl);
    }

    logger.info('[GeminiFilesService] Upload complete and file ACTIVE', {
      sourceUrl,
      fileUri,
      mimeType,
      sizeBytes: videoBuffer.byteLength,
    });

    return {
      fileUri,
      mimeType,
      sourceUrl,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async waitForActive(fileName: string, sourceUrl: string): Promise<string> {
    const deadline = Date.now() + FILE_ACTIVE_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, FILE_ACTIVE_POLL_INTERVAL_MS));

      const fileInfo = await this.fileManager.getFile(fileName);

      if (fileInfo.state === FileState.ACTIVE) {
        return fileInfo.uri;
      }

      if (fileInfo.state === FileState.FAILED) {
        throw new Error(
          `Gemini Files API processing failed for video from ${sourceUrl}: ${
            (fileInfo as { error?: { message?: string } }).error?.message ?? 'unknown error'
          }`
        );
      }

      logger.debug('[GeminiFilesService] Waiting for file ACTIVE state', {
        fileName,
        state: fileInfo.state,
      });
    }

    throw new Error(
      `Gemini Files API processing timed out after ${FILE_ACTIVE_TIMEOUT_MS / 1000}s for video from ${sourceUrl}.`
    );
  }

  private mimeTypeFromUrl(url: string): string {
    // Strip query string before matching extension
    const pathname = url.split('?')[0] ?? url;
    const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
    return EXTENSION_TO_MIME[ext] ?? DEFAULT_VIDEO_MIME;
  }
}
