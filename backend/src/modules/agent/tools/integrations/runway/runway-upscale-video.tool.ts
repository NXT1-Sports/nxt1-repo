/**
 * @fileoverview Runway Upscale Video Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Submits a video upscale task to Runway via the MCP bridge.
 * Takes an existing video URL and upscales its resolution.
 * Returns a task ID that can be polled with RunwayCheckTaskTool.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { RunwayMcpBridgeService } from './runway-mcp-bridge.service.js';
import { extractRunwayTaskDetails } from './runway-task-result.util.js';
import { z } from 'zod';

export class RunwayUpscaleVideoTool extends BaseTool {
  readonly name = 'runway_upscale_video';
  readonly description =
    'Upscale a video to higher resolution using Runway. Provide the URL of the existing video. ' +
    'Returns a task ID — use runway_check_task to poll for completion and retrieve the upscaled output.';

  readonly parameters = z.object({
    promptImage: z.string().trim().min(1),
    model: z.string().trim().min(1).optional(),
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
      const promptImage = input['promptImage'] as string;
      if (!promptImage?.trim()) {
        return { success: false, error: 'promptImage (video URL to upscale) is required.' };
      }

      const model = (input['model'] as string) || 'gen4';

      context?.emitStage?.('submitting_job', {
        icon: 'media',
        phase: 'runway_upscale_video',
        model,
      });

      const result = (await this.bridge.upscaleVideo({
        video: promptImage.trim(),
        model,
      })) as Record<string, unknown>;

      const taskDetails = extractRunwayTaskDetails(result);
      if (!taskDetails.taskId) {
        return {
          success: false,
          error: 'Runway accepted the video upscale request but did not return a task ID.',
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
            'Video upscale task submitted. Use runway_check_task with the taskId to poll for completion.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Video upscale request failed';
      return { success: false, error: message };
    }
  }
}
