/**
 * @fileoverview Runway Generate Video Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Submits an image-to-video generation task to Runway via the MCP bridge.
 * Returns a task ID that can be polled with RunwayCheckTaskTool.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type {
  RunwayMcpBridgeService,
  RunwayGenerateVideoOptions,
} from './runway-mcp-bridge.service.js';
import { extractRunwayTaskDetails } from './runway-task-result.util.js';
import { MediaTransportResolverService } from '../../media/media-transport-resolver.service.js';
import { z } from 'zod';

const IMAGE_TO_VIDEO_MODELS = ['gen4_turbo', 'gen4.5', 'veo3.1'] as const;
const RUNWAY_VIDEO_RATIOS = [
  '1280:720',
  '720:1280',
  '1104:832',
  '832:1104',
  '960:960',
  '1584:672',
] as const;

type RunwayVideoRatio = (typeof RUNWAY_VIDEO_RATIOS)[number];

function normalizeRunwayVideoRatio(value: unknown): RunwayVideoRatio {
  if (typeof value !== 'string') return '1280:720';

  const normalized = value.trim().toLowerCase().replace(/[×x]/g, ':').replace(/\s+/g, '');
  if ((RUNWAY_VIDEO_RATIOS as readonly string[]).includes(normalized)) {
    return normalized as RunwayVideoRatio;
  }

  if (
    ['16:9', '1920:1080', 'landscape', 'horizontal', 'wide', 'widescreen', 'hd', '1080p'].includes(
      normalized
    )
  ) {
    return '1280:720';
  }

  if (
    ['9:16', '1080:1920', 'portrait', 'vertical', 'reels', 'story', 'shorts'].includes(normalized)
  ) {
    return '720:1280';
  }

  if (['4:3', 'standard'].includes(normalized)) {
    return '1104:832';
  }

  if (['3:4'].includes(normalized)) {
    return '832:1104';
  }

  if (['1:1', 'square'].includes(normalized)) {
    return '960:960';
  }

  if (['21:9', 'ultrawide', 'cinematic'].includes(normalized)) {
    return '1584:672';
  }

  return '1280:720';
}

export class RunwayGenerateVideoTool extends BaseTool {
  readonly name = 'runway_generate_video';
  readonly description =
    'Animate a generated graphic, poster, title card, or still image into a short video using Runway image-to-video. ' +
    'promptImage is required; generate a graphic/image first, then pass its URL here. ' +
    'Returns a task ID — use runway_check_task to poll for completion and retrieve the output URL.';

  readonly parameters = z.object({
    promptText: z.string().trim().min(1),
    promptImage: z.string().trim().min(1).optional(),
    model: z
      .enum(['gen4_turbo', 'gen4.5', 'gen3a_turbo', 'veo3', 'veo3.1', 'veo3.1_fast'])
      .optional(),
    duration: z
      .union([z.literal(4), z.literal(5), z.literal(6), z.literal(8), z.literal(10)])
      .optional(),
    ratio: z
      .enum(['1280:720', '720:1280', '1104:832', '832:1104', '960:960', '1584:672'])
      .optional(),
    seed: z.number().int().optional(),
    audio: z.boolean().optional(),
    watermark: z.boolean().optional(),
  });

  override readonly allowedAgents = ['brand_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;

  private readonly mediaResolver = new MediaTransportResolverService();

  constructor(private readonly bridge: RunwayMcpBridgeService) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    try {
      const promptText = input['promptText'] as string;
      if (!promptText?.trim()) {
        return { success: false, error: 'promptText is required.' };
      }

      const rawPromptImage = (input['promptImage'] as string) || undefined;
      if (!rawPromptImage?.trim()) {
        return {
          success: false,
          error:
            'runway_generate_video requires promptImage. Generate a graphic, poster, title card, or still image first, then animate that image with Runway.',
        };
      }

      let promptImage = rawPromptImage;
      const resolved = await this.mediaResolver.resolveProcessingUrl({
        sourceUrl: rawPromptImage,
        fallbackToFirebaseStaging: true,
        stageMediaKind: 'image',
        executionContext: context,
      });
      promptImage = resolved.url;
      const rawModel = input['model'] as string | undefined;
      const ratio = normalizeRunwayVideoRatio(input['ratio']);
      const seed = input['seed'] != null ? (input['seed'] as number) : undefined;
      const watermark = (input['watermark'] as boolean) ?? false;

      context?.emitStage?.('submitting_job', {
        icon: 'media',
        phase: 'runway_generate_video',
        hasPromptImage: !!promptImage,
        ratio,
      });

      const model = rawModel || 'gen4_turbo';
      if (!IMAGE_TO_VIDEO_MODELS.includes(model as (typeof IMAGE_TO_VIDEO_MODELS)[number])) {
        return {
          success: false,
          error: `Model "${model}" is not supported for image-to-video. Use one of: ${IMAGE_TO_VIDEO_MODELS.join(', ')}.`,
        };
      }

      const defaultDuration = model === 'veo3.1' ? 8 : 5;
      const duration = ((input['duration'] as number) ||
        defaultDuration) as RunwayGenerateVideoOptions['duration'];

      const result = (await this.bridge.generateVideo({
        promptText: promptText.trim(),
        promptImage,
        model: model as RunwayGenerateVideoOptions['model'],
        duration,
        ratio,
        seed,
        watermark,
      })) as Record<string, unknown>;

      const taskDetails = extractRunwayTaskDetails(result);
      if (!taskDetails.taskId) {
        return {
          success: false,
          error: 'Runway accepted the video generation request but did not return a task ID.',
          data: {
            status: taskDetails.status,
            debugKeys: taskDetails.debugKeys,
          },
        };
      }

      return {
        success: true,
        data: {
          taskId: taskDetails.taskId,
          status: taskDetails.status,
          message:
            'Video generation task submitted. Use runway_check_task with the taskId to poll for completion.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video generation request failed';
      return { success: false, error: message };
    }
  }
}
