/**
 * @fileoverview Runway Edit Video Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Submits a video-to-video editing task to Runway via the MCP bridge.
 * Accepts a source image/frame and a text prompt describing the desired edit.
 * Returns a task ID that can be polled with RunwayCheckTaskTool.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type {
  RunwayMcpBridgeService,
  RunwayEditVideoOptions,
} from '../integrations/runway-mcp-bridge.service.js';

export class RunwayEditVideoTool extends BaseTool {
  readonly name = 'runway_edit_video';
  readonly description =
    'Edit or transform a video using Runway Gen-4 video-to-video. Provide a source image/frame URL ' +
    'and a text prompt describing the desired transformation. Returns a task ID — use runway_check_task to poll.';

  readonly parameters = {
    type: 'object',
    properties: {
      promptText: {
        type: 'string',
        description: 'Text description of the desired video edit or transformation.',
      },
      promptImage: {
        type: 'string',
        description: 'URL of a reference image to guide the edit (optional).',
      },
      video: {
        type: 'string',
        description: 'URL of the source video to edit.',
      },
      model: {
        type: 'string',
        description: 'Runway model to use. Defaults to gen4.',
      },
      duration: {
        type: 'number',
        enum: [5, 10],
        description: 'Output video duration in seconds. Defaults to 5.',
      },
      ratio: {
        type: 'string',
        enum: ['1280:720', '720:1280', '1280:768', '768:1280'],
        description: 'Output aspect ratio (width:height). Defaults to 1280:720.',
      },
      seed: {
        type: 'number',
        description: 'Optional seed for reproducible results.',
      },
      watermark: {
        type: 'boolean',
        description: 'Whether to include a Runway watermark. Defaults to false.',
      },
    },
    required: ['promptText', 'video'],
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
      const promptImage = input['promptImage'] as string | undefined;
      const video = input['video'] as string;

      if (!promptText?.trim()) {
        return { success: false, error: 'promptText is required.' };
      }
      if (!video?.trim()) {
        return { success: false, error: 'video (source video URL) is required.' };
      }

      const model = (input['model'] as string) || 'gen4';
      const duration = ((input['duration'] as number) || 5) as RunwayEditVideoOptions['duration'];
      const ratio = (input['ratio'] as string) || '1280:720';
      const seed = input['seed'] != null ? (input['seed'] as number) : undefined;
      const watermark = (input['watermark'] as boolean) ?? false;

      context?.onProgress?.('Submitting video edit to Runway…');

      const result = (await this.bridge.editVideo({
        video: video.trim(),
        promptText: promptText.trim(),
        promptImage: promptImage?.trim(),
        model,
        duration,
        ratio,
        seed,
        watermark,
      })) as Record<string, unknown>;

      return {
        success: true,
        data: {
          taskId: result['id'] ?? result['uuid'],
          status: (result['status'] as string) ?? 'PENDING',
          message:
            'Video edit task submitted. Use runway_check_task with the taskId to poll for completion.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video edit request failed';
      return { success: false, error: message };
    }
  }
}
