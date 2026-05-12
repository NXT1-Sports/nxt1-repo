/**
 * @fileoverview Gemini Files API Service
 * @module @nxt1/backend/modules/agent/llm
 *
 * Uploads video/media files to the Gemini Files API and performs direct
 * Gemini analysis — bypassing the OpenRouter-proxied `video_url` fetch path
 * that fails for Firebase GCS signed URLs (CORS restrictions, IP allowlisting,
 * short-lived tokens).
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
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import { logger } from '../../../utils/logger.js';
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
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** How long to wait for Gemini Files API to finish processing an upload (ms). */
const FILE_ACTIVE_POLL_INTERVAL_MS = 2_000;
const FILE_ACTIVE_TIMEOUT_MS = 60_000;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeminiUploadResult {
  /** The stable `file_uri` to pass into Gemini generateContent. */
  readonly fileUri: string;
  /** The detected/resolved MIME type. */
  readonly mimeType: string;
  /** Original source URL that was uploaded. */
  readonly sourceUrl: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class GeminiFilesService {
  private readonly fileManager: GoogleAIFileManager;
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env['GEMINI_API_KEY'];
    if (!key) {
      throw new Error(
        'GeminiFilesService requires GEMINI_API_KEY. ' +
          'Get one at https://aistudio.google.com/apikey and add it to your environment as GEMINI_API_KEY.'
      );
    }
    this.fileManager = new GoogleAIFileManager(key);
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
   * Full analysis workflow: download from Firebase/GCS → upload to Gemini Files API
   * → call Gemini directly (NOT via OpenRouter) → return `LLMCompletionResult`.
   *
   * This is the primary entry point for `AnalyzeVideoTool` when analyzing
   * Firebase/GCS-hosted videos. It bypasses OpenRouter entirely because
   * OpenRouter cannot proxy Gemini Files API file references.
   */
  async analyzeVideoFromUrl(
    sourceUrl: string,
    prompt: string,
    maxOutputTokens = 8192
  ): Promise<LLMCompletionResult> {
    const startMs = Date.now();

    const { fileUri, mimeType } = await this.uploadFromUrl(sourceUrl);

    logger.info('[GeminiFilesService] Calling Gemini directly with Files API reference', {
      sourceUrl,
      fileUri,
      mimeType,
      model: GEMINI_VIDEO_MODEL,
    });

    const model = this.genAI.getGenerativeModel({
      model: GEMINI_VIDEO_MODEL,
      systemInstruction: VIDEO_ANALYSIS_SYSTEM_PROMPT,
      generationConfig: {
        maxOutputTokens,
        temperature: 0.3,
      },
    });

    const result = await model.generateContent([
      { fileData: { mimeType, fileUri } },
      { text: prompt },
    ]);

    const response = result.response;
    const content = response.text();
    const usageMeta = response.usageMetadata;
    const latencyMs = Date.now() - startMs;

    logger.info('[GeminiFilesService] Video analysis complete', {
      sourceUrl,
      model: GEMINI_VIDEO_MODEL,
      latencyMs,
      inputTokens: usageMeta?.promptTokenCount ?? 0,
      outputTokens: usageMeta?.candidatesTokenCount ?? 0,
    });

    const inputTokens = usageMeta?.promptTokenCount ?? 0;
    const outputTokens = usageMeta?.candidatesTokenCount ?? 0;
    const costUsd =
      inputTokens * GEMINI_2_5_FLASH_INPUT_COST_PER_TOKEN +
      outputTokens * GEMINI_2_5_FLASH_OUTPUT_COST_PER_TOKEN;

    logger.info('[GeminiFilesService] Computed video analysis cost', {
      sourceUrl,
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
