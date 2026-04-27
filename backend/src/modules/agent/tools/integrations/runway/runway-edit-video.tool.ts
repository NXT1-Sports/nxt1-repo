/**
 * @fileoverview Runway Edit Video Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Submits a video-to-video editing task to Runway via the MCP bridge.
 * Accepts a source image/frame and a text prompt describing the desired edit.
 * Returns a task ID that can be polled with RunwayCheckTaskTool.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type {
  RunwayMcpBridgeService,
  RunwayEditVideoOptions,
} from './runway-mcp-bridge.service.js';
import { z } from 'zod';

export class RunwayEditVideoTool extends BaseTool {
  readonly name = 'runway_edit_video';
  readonly description =
    'Edit or transform a video using Runway Gen-4 video-to-video. Provide a source image/frame URL ' +
    'and a text prompt describing the desired transformation. Returns a task ID — use runway_check_task to poll.';

  readonly parameters = z.object({
    promptText: z.string().trim().min(1),
    promptImage: z.string().trim().min(1).optional(),
    video: z.string().trim().min(1),
    model: z.string().trim().min(1).optional(),
    duration: z.union([z.literal(5), z.literal(10)]).optional(),
    ratio: z.enum(['1280:720', '720:1280', '1280:768', '768:1280']).optional(),
    seed: z.number().int().optional(),
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

      context?.emitStage?.('submitting_job', {
        icon: 'media',
        phase: 'runway_edit_video',
        model,
        ratio,
        duration,
      });

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
