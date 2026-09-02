/**
 * @fileoverview Delete Google Drive File Tool — Direct REST Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/google-drive
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { deleteDriveFile } from '../../../../../services/platform/connected-drive.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const DeleteDriveFileInputSchema = z.object({
  file_id: z.string().trim().min(1).describe('The Google Drive file or folder ID to delete.'),
});

export class DeleteDriveFileTool extends BaseTool {
  readonly name = 'delete_drive_file';
  readonly description =
    "Delete a file or folder from the user's connected Google Drive account by its file ID. " +
    'Requires that Google is connected in Settings -> Connected Accounts.';

  readonly parameters = DeleteDriveFileInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'data' as const;
  readonly entityGroup = 'system_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteDriveFileInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const { file_id } = parsed.data;

    context.emitStage?.('submitting_job', {
      source: 'google_drive',
      phase: 'delete_file',
      fileId: file_id,
      icon: 'document',
    });

    try {
      const result = await deleteDriveFile(context.userId, file_id, context.environment);

      logger.info('[DeleteDriveFileTool] File deleted', {
        userId: context.userId,
        fileId: file_id,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete Google Drive file.';
      logger.error('[DeleteDriveFileTool] Delete failed', {
        userId: context.userId,
        fileId: file_id,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
