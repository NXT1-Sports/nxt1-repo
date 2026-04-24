/**
 * @fileoverview Runway Generate Video Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Submits a text-to-video or image-to-video generation task to Runway via the
 * MCP bridge.  Returns a task ID that can be polled with RunwayCheckTaskTool.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type {
  RunwayMcpBridgeService,
  RunwayGenerateVideoOptions,
  RunwayTextToVideoOptions,
} from '../integrations/runway/runway-mcp-bridge.service.js';
import { z } from 'zod';

const IMAGE_TO_VIDEO_MODELS = ['gen4_turbo', 'gen4.5', 'veo3.1'] as const;
const TEXT_TO_VIDEO_MODELS = ['gen3a_turbo', 'gen4.5', 'veo3', 'veo3.1', 'veo3.1_fast'] as const;

export class RunwayGenerateVideoTool extends BaseTool {
  readonly name = 'runway_generate_video';
  readonly description =
    'Generate a video from a text prompt, with or without a reference image, using Runway. ' +
    'If promptImage is provided, this uses image-to-video models. If promptImage is omitted, this uses text-to-video models including VEO. ' +
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

      const promptImage = (input['promptImage'] as string) || undefined;
      const rawModel = input['model'] as string | undefined;
      const ratio = ((input['ratio'] as string) || '1280:720') as
        | RunwayGenerateVideoOptions['ratio']
        | RunwayTextToVideoOptions['ratio'];
      const seed = input['seed'] != null ? (input['seed'] as number) : undefined;
      const audio = (input['audio'] as boolean) ?? false;
      const watermark = (input['watermark'] as boolean) ?? false;

      context?.emitStage?.('submitting_job', {
        icon: 'media',
        phase: 'runway_generate_video',
        hasPromptImage: !!promptImage,
        ratio,
      });

      let result: Record<string, unknown>;

      if (promptImage) {
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

        result = (await this.bridge.generateVideo({
          promptText: promptText.trim(),
          promptImage,
          model: model as RunwayGenerateVideoOptions['model'],
          duration,
          ratio: ratio as RunwayGenerateVideoOptions['ratio'],
          seed,
          watermark,
        })) as Record<string, unknown>;
      } else {
        const model = rawModel || 'veo3.1';
        if (!TEXT_TO_VIDEO_MODELS.includes(model as (typeof TEXT_TO_VIDEO_MODELS)[number])) {
          return {
            success: false,
            error: `Model "${model}" is not supported for text-to-video. Use one of: ${TEXT_TO_VIDEO_MODELS.join(', ')}.`,
          };
        }

        const defaultDuration = model.startsWith('veo') ? 8 : 5;
        const duration = ((input['duration'] as number) ||
          defaultDuration) as RunwayTextToVideoOptions['duration'];

        result = (await this.bridge.textToVideo({
          promptText: promptText.trim(),
          model: model as RunwayTextToVideoOptions['model'],
          duration,
          ratio: ratio as RunwayTextToVideoOptions['ratio'],
          audio,
        })) as Record<string, unknown>;
      }

      return {
        success: true,
        data: {
          taskId: result['id'] ?? result['uuid'],
          status: (result['status'] as string) ?? 'PENDING',
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
