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
}): Promise<string | null> {
  const videoUrl = params.videoUrl?.trim();
  if (!videoUrl) return null;

  try {
    const thumbnailResult = await params.bridge.generateThumbnail(
      {
        inputPath: videoUrl,
        outputPath: buildThumbnailOutputPath(params.outputPath, params.fallbackBase),
        time: params.time ?? '0',
      },
      params.context
    );

    return thumbnailResult.outputUrl ?? thumbnailResult.output_path ?? null;
  } catch (error) {
    logger.warn(`[${params.logScope}] Failed to generate video thumbnail`, {
      error: error instanceof Error ? error.message : String(error),
      videoUrl,
      userId: params.context?.userId,
    });
    return null;
  }
}
