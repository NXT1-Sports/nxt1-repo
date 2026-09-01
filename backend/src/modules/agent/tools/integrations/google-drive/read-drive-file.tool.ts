/**
 * @fileoverview Read Google Drive File Tool — Direct REST Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/google-drive
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getDriveFileContent } from '../../../../../services/platform/connected-drive.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const ReadDriveFileInputSchema = z.object({
  file_id: z.string().trim().min(1).describe('The Google Drive file ID to read content from.'),
});

export class ReadDriveFileTool extends BaseTool {
  readonly name = 'read_drive_file';
  readonly description =
    "Read the content of a file from the user's connected Google Drive account by its file ID. " +
    'Supports text files, Google Docs (exported as text), Google Sheets (exported as CSV), and binary files. ' +
    'Requires that Google is connected in Settings -> Connected Accounts.';

  readonly parameters = ReadDriveFileInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'data' as const;
  readonly entityGroup = 'system_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ReadDriveFileInputSchema.safeParse(input);
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

    context.emitStage?.('fetching_data', {
      source: 'google_drive',
      phase: 'read_file',
      fileId: file_id,
      icon: 'document',
    });

    try {
      const result = await getDriveFileContent(context.userId, file_id, context.environment);

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read Google Drive file.';
      logger.error('[ReadDriveFileTool] Read failed', {
        userId: context.userId,
        fileId: file_id,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
