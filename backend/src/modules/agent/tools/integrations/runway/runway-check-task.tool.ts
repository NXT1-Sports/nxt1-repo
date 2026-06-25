/**
 * @fileoverview Runway Check Task Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Polls a Runway task by ID.  When the task status is SUCCEEDED and an output
 * URL is present, the tool automatically persists the asset to Firebase Storage
 * (Runway asset URLs expire after 24 hours) and returns a permanent CDN URL.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { RunwayMcpBridgeService } from './runway-mcp-bridge.service.js';
import { z } from 'zod';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';
import { MediaStagingService } from '../../media/media-staging.service.js';
import type { FfmpegMcpBridgeService } from '../ffmpeg-mcp/ffmpeg-mcp-bridge.service.js';
import { generateVideoThumbnail } from '../ffmpeg-mcp/ffmpeg-thumbnail-helper.js';
import { logger } from '../../../../../utils/logger.js';

export class RunwayCheckTaskTool extends BaseTool {
  readonly name = 'runway_check_task';
  readonly description =
    'Check the status of a Runway generation task. When the task is complete, the output ' +
    'is automatically saved to cloud storage and a permanent CDN URL is returned.';

  readonly parameters = z.object({
    taskId: z.string().trim().min(1),
  });

  override readonly allowedAgents = ['brand_coordinator'] as const;
  readonly isMutation = false;
  readonly category = 'media' as const;

  readonly entityGroup = 'user_tools' as const;
  private readonly mediaStaging = new MediaStagingService();

  constructor(
    private readonly bridge: RunwayMcpBridgeService,
    private readonly ffmpegBridge?: Pick<
      FfmpegMcpBridgeService,
      'convertVideo' | 'generateThumbnail'
    >
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    try {
      const taskId = input['taskId'] as string;
      if (!taskId?.trim()) {
        return { success: false, error: 'taskId is required.' };
      }

      context?.emitStage?.('checking_status', {
        icon: 'media',
        taskId: taskId.trim(),
      });

      const task = await this.bridge.getTask(taskId.trim());

      const status = (task as Record<string, unknown>)['status'] as string | undefined;
      const progress = (task as Record<string, unknown>)['progress'] as number | undefined;

      // Extract output URL — Runway returns it in output[0] or output.url
      let outputUrl: string | undefined;
      const output = (task as Record<string, unknown>)['output'] as unknown;
      if (Array.isArray(output) && output.length > 0) {
        outputUrl =
          typeof output[0] === 'string'
            ? output[0]
            : ((output[0] as Record<string, unknown>)?.['url'] as string | undefined);
      } else if (output && typeof output === 'object') {
        outputUrl = (output as Record<string, unknown>)['url'] as string | undefined;
      }

      // If task is complete and we have an output URL, persist to environment-scoped Firebase Storage.
      let persistentUrl: string | undefined;
      let storagePath: string | undefined;
      let thumbnailUrl: string | null = null;

      if (status === 'SUCCEEDED' && outputUrl) {
        context?.emitStage?.('uploading_assets', {
          icon: 'upload',
          taskId: taskId.trim(),
        });

        try {
          if (!context?.userId || !context?.threadId) {
            throw new AgentEngineError(
              'AGENT_VALIDATION_FAILED',
              'Runway output cannot be saved — no userId/threadId in context'
            );
          }

          if (this.ffmpegBridge) {
            context.emitStage?.('processing_media', {
              icon: 'media',
              phase: 'runway_output_normalization',
              taskId: taskId.trim(),
            });

            const normalized = await this.ffmpegBridge.convertVideo(
              {
                inputPath: outputUrl,
                outputPath: `runway-${taskId.trim()}.mp4`,
                preset: 'medium',
                crf: 23,
                addSilentAudio: true,
              },
              context
            );

            const normalizedUrl = normalized.outputUrl?.trim();
            if (!normalizedUrl) {
              throw new AgentEngineError(
                'AGENT_VALIDATION_FAILED',
                'Runway output normalization completed without an uploaded MP4 URL.'
              );
            }

            persistentUrl = normalizedUrl;
            storagePath =
              typeof normalized['storagePath'] === 'string' ? normalized['storagePath'] : undefined;
          } else {
            const staged = await this.mediaStaging.stageFromUrl({
              sourceUrl: outputUrl,
              staging: {
                userId: context.userId,
                threadId: context.threadId,
              },
              environment: context.environment,
              fileName: `runway-${taskId}`,
              mediaKind: 'auto',
              expiresInMinutes: 120,
            });

            persistentUrl = staged.signedUrl;
            storagePath = staged.storagePath;
          }
        } catch (error) {
          logger.error('[RunwayCheckTaskTool] Failed to normalize and persist Runway output', {
            taskId: taskId.trim(),
            outputUrlPresent: Boolean(outputUrl),
            error: error instanceof Error ? error.message : String(error),
            userId: context?.userId,
            threadId: context?.threadId,
          });
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Runway output normalization failed before upload.',
          };
        }

        if (this.ffmpegBridge) {
          thumbnailUrl = await generateVideoThumbnail({
            bridge: this.ffmpegBridge,
            videoUrl: persistentUrl ?? outputUrl,
            outputPath: `runway-${taskId.trim()}.mp4`,
            fallbackBase: `runway-${taskId.trim()}.mp4`,
            context,
            logScope: 'RunwayCheckTaskTool',
          });
        }
      }

      return {
        success: true,
        data: {
          taskId,
          status: status ?? 'UNKNOWN',
          progress: progress ?? null,
          outputUrl: persistentUrl ?? outputUrl ?? null,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          storagePath: storagePath ?? null,
          ephemeralUrl: persistentUrl ? outputUrl : null,
          persisted: !!persistentUrl,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check Runway task status';
      return { success: false, error: message };
    }
  }
}
