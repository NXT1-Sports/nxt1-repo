import type { ToolExecutionContext } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import type { FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';
import sharp from 'sharp';

export function buildThumbnailOutputPath(
  outputPath: string | undefined,
  fallbackBase: string
): string {
  const normalizedOutputPath = outputPath?.trim() || fallbackBase;
  const withExtension = /\.[^.]+$/u.test(normalizedOutputPath)
    ? normalizedOutputPath
    : `${normalizedOutputPath}.mp4`;

  return withExtension.replace(/\.[^.]+$/u, '-thumbnail.jpg');
}

export async function generateVideoThumbnail(params: {
  readonly bridge: Pick<FfmpegMcpBridgeService, 'generateThumbnail'>;
  readonly videoUrl: string | undefined;
  readonly outputPath?: string;
  readonly fallbackBase: string;
  readonly context?: ToolExecutionContext;
  readonly logScope: string;
  readonly time?: string;
  readonly required?: boolean;
}): Promise<string | null> {
  const videoUrl = params.videoUrl?.trim();
  if (!videoUrl) {
    if (params.required) {
      throw new Error('Thumbnail generation requires a finalized video URL.');
    }
    return null;
  }

  try {
    const thumbnailResult = await params.bridge.generateThumbnail(
      {
        inputPath: videoUrl,
        outputPath: buildThumbnailOutputPath(params.outputPath, params.fallbackBase),
        time: params.time ?? '0',
      },
      params.context
    );

    const thumbnailUrl = thumbnailResult.outputUrl ?? thumbnailResult.output_path ?? null;
    if (!thumbnailUrl && params.required) {
      throw new Error('Thumbnail generation completed without an output URL.');
    }
    if (params.required && !isHttpUrl(thumbnailUrl)) {
      throw new Error('Thumbnail generation completed without a finalized HTTP thumbnail URL.');
    }
    if (isHttpUrl(thumbnailUrl)) {
      await assertReadableImageThumbnail(thumbnailUrl, params.context?.signal);
    }
    return thumbnailUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[${params.logScope}] Failed to generate video thumbnail`, {
      error: message,
      videoUrl: summarizeMediaUrlForLog(videoUrl),
      userId: params.context?.userId,
      threadId: params.context?.threadId,
      operationId: params.context?.operationId,
    });
    if (params.required) {
      throw new Error(`Thumbnail generation failed: ${message}`, { cause: error });
    }
    return null;
  }
}

function isHttpUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

async function assertReadableImageThumbnail(
  thumbnailUrl: string,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(thumbnailUrl, { signal });
  if (!response.ok) {
    throw new Error(`Thumbnail URL is not readable (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error('Thumbnail URL returned an empty image.');
  }

  const metadata = await sharp(buffer).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Thumbnail image dimensions are unavailable.');
  }
}

function summarizeMediaUrlForLog(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.slice(0, 120)}`;
  } catch {
    return value.slice(0, 120);
  }
}
