/**
 * @fileoverview Create Google Drive Folder Tool — Direct REST Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/google-drive
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { createDriveFolder } from '../../../../../services/platform/connected-drive.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const CreateDriveFolderInputSchema = z.object({
  folder_name: z
    .string()
    .trim()
    .min(1)
    .describe('Name of the new folder to create in Google Drive.'),
  parent_folder_id: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional Google Drive ID of the parent folder to create this folder inside.'),
});

export class CreateDriveFolderTool extends BaseTool {
  readonly name = 'create_drive_folder';
  readonly description =
    "Create a new folder in the user's connected Google Drive account. " +
    'Requires that Google is connected in Settings -> Connected Accounts.';

  readonly parameters = CreateDriveFolderInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'data' as const;
  readonly entityGroup = 'system_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CreateDriveFolderInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const { folder_name, parent_folder_id } = parsed.data;

    context.emitStage?.('submitting_job', {
      source: 'google_drive',
      phase: 'create_folder',
      folderName: folder_name,
      icon: 'document',
    });

    try {
      const result = await createDriveFolder(
        context.userId,
        folder_name,
        parent_folder_id,
        context.environment
      );

      logger.info('[CreateDriveFolderTool] Folder created', {
        userId: context.userId,
        folderName: folder_name,
        folderId: result.id,
      });

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create Google Drive folder.';
      logger.error('[CreateDriveFolderTool] Failed to create folder', {
        userId: context.userId,
        folderName: folder_name,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
