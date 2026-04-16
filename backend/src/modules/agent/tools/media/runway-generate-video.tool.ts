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

const IMAGE_TO_VIDEO_MODELS = ['gen4_turbo', 'gen4.5', 'veo3.1'] as const;
const TEXT_TO_VIDEO_MODELS = ['gen3a_turbo', 'gen4.5', 'veo3', 'veo3.1', 'veo3.1_fast'] as const;

export class RunwayGenerateVideoTool extends BaseTool {
  readonly name = 'runway_generate_video';
  readonly description =
    'Generate a video from a text prompt, with or without a reference image, using Runway. ' +
    'If promptImage is provided, this uses image-to-video models. If promptImage is omitted, this uses text-to-video models including VEO. ' +
    'Returns a task ID — use runway_check_task to poll for completion and retrieve the output URL.';

  readonly parameters = {
    type: 'object',
    properties: {
      promptText: {
        type: 'string',
        description:
          'Text description of the video to generate. Be specific about motion, camera angle, lighting, and subject.',
      },
      promptImage: {
        type: 'string',
        description:
          'Optional URL of a reference image to drive the generation (image-to-video mode).',
      },
      model: {
        type: 'string',
        enum: ['gen4_turbo', 'gen4.5', 'gen3a_turbo', 'veo3', 'veo3.1', 'veo3.1_fast'],
        description:
          'Runway model to use. Image-to-video supports gen4_turbo, gen4.5, veo3.1. Text-to-video supports gen3a_turbo, gen4.5, veo3, veo3.1, veo3.1_fast.',
      },
      duration: {
        type: 'number',
        enum: [4, 5, 6, 8, 10],
        description:
          'Video duration in seconds. Gen4 models use 5 or 10. VEO models use 4, 6, or 8.',
      },
      ratio: {
        type: 'string',
        enum: ['1280:720', '720:1280', '1104:832', '832:1104', '960:960', '1584:672'],
        description: 'Output aspect ratio (width:height). Defaults to 1280:720.',
      },
      seed: {
        type: 'number',
        description: 'Optional seed for reproducible results.',
      },
      audio: {
        type: 'boolean',
        description:
          'Text-to-video only. Enable audio generation when supported by the selected model.',
      },
      watermark: {
        type: 'boolean',
        description: 'Whether to include a Runway watermark. Defaults to false.',
      },
    },
    required: ['promptText'],
  } as const;

  override readonly allowedAgents = ['brand_media_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'media' as const;

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

      context?.onProgress?.('Submitting video generation to Runway…');

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
