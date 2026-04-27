/**
 * @fileoverview Runway Check Task Tool
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * Polls a Runway task by ID.  When the task status is SUCCEEDED and an output
 * URL is present, the tool automatically persists the asset to Firebase Storage
 * (Runway asset URLs expire after 24 hours) and returns a permanent CDN URL.
 */

import { getStorage } from 'firebase-admin/storage';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { RunwayMcpBridgeService } from './runway-mcp-bridge.service.js';
import { z } from 'zod';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';

export class RunwayCheckTaskTool extends BaseTool {
  readonly name = 'runway_check_task';
  readonly description =
    'Check the status of a Runway generation task. When the task is complete, the output ' +
    'is automatically persisted to Firebase Storage and a permanent CDN URL is returned.';

  readonly parameters = z.object({
    taskId: z.string().trim().min(1),
  });

  override readonly allowedAgents = ['brand_coordinator'] as const;
  readonly isMutation = false;
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

      // If task is complete and we have an output URL, persist to Firebase Storage
      let persistentUrl: string | undefined;
      let storagePath: string | undefined;

      if (status === 'SUCCEEDED' && outputUrl) {
        context?.emitStage?.('uploading_assets', {
          icon: 'upload',
          taskId: taskId.trim(),
        });

        try {
          const response = await fetch(outputUrl);
          if (!response.ok) {
            throw new AgentEngineError(
              'RUNWAY_REQUEST_FAILED',
              `Failed to download Runway output: ${response.status}`
            );
          }

          const buffer = Buffer.from(await response.arrayBuffer());
          const contentType = response.headers.get('content-type') || 'video/mp4';
          const extension = contentType.includes('image') ? 'png' : 'mp4';
          const timestamp = Date.now();

          // Thread-scoped storage path — requires both userId and threadId
          if (!context?.userId || !context?.threadId) {
            throw new AgentEngineError(
              'AGENT_VALIDATION_FAILED',
              'Runway output cannot be saved — no userId/threadId in context'
            );
          }
          storagePath = `Users/${context.userId}/threads/${context.threadId}/media/${timestamp}-runway-${taskId}.${extension}`;

          const bucket = getStorage().bucket();
          const file = bucket.file(storagePath);
          await file.save(buffer, {
            contentType,
            metadata: {
              cacheControl: 'public, max-age=31536000, immutable',
            },
          });
          await file.makePublic();
          persistentUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        } catch {
          // Non-fatal — return the ephemeral URL with a warning
          persistentUrl = undefined;
        }
      }

      return {
        success: true,
        data: {
          taskId,
          status: status ?? 'UNKNOWN',
          progress: progress ?? null,
          outputUrl: persistentUrl ?? outputUrl ?? null,
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
