import type { ToolExecutionContext } from '../../base.tool.js';
import { logger } from '../../../../../utils/logger.js';
import type { FfmpegMcpBridgeService } from './ffmpeg-mcp-bridge.service.js';

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
    return thumbnailUrl;
  } catch (error) {
    logger.warn(`[${params.logScope}] Failed to generate video thumbnail`, {
      error: error instanceof Error ? error.message : String(error),
      videoUrl: summarizeMediaUrlForLog(videoUrl),
      userId: params.context?.userId,
      threadId: params.context?.threadId,
      operationId: params.context?.operationId,
    });
    if (params.required) {
      throw error;
    }
    return null;
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
