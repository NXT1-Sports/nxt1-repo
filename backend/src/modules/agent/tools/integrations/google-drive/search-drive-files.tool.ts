/**
 * @fileoverview Search Google Drive Files Tool — Direct REST Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/google-drive
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { searchDriveFiles } from '../../../../../services/platform/connected-drive.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

const SearchDriveFilesInputSchema = z.object({
  query: z
    .string()
    .trim()
    .default('')
    .describe(
      'Search query string to search for file or folder names (leave empty to list recent files).'
    ),
  page_size: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .default(20)
    .describe('Maximum number of files to return (default 20, max 100).'),
  parent_folder_id: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional folder ID to scope the search within a specific folder.'),
});

export class SearchDriveFilesTool extends BaseTool {
  readonly name = 'search_drive_files';
  readonly description =
    "Search for files or folders in the user's connected Google Drive account. " +
    'Returns file IDs, names, MIME types, links, and modification dates. ' +
    'Requires that Google is connected in Settings -> Connected Accounts.';

  readonly parameters = SearchDriveFilesInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'data' as const;
  readonly entityGroup = 'system_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = SearchDriveFilesInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated user context is required.' };
    }

    const { query, page_size, parent_folder_id } = parsed.data;

    context.emitStage?.('fetching_data', {
      source: 'google_drive',
      phase: 'search_files',
      query,
      icon: 'document',
    });

    try {
      const result = await searchDriveFiles(
        context.userId,
        query,
        page_size,
        parent_folder_id,
        context.environment
      );

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to search Google Drive files.';
      logger.error('[SearchDriveFilesTool] Search failed', {
        userId: context.userId,
        query,
        error: message,
      });
      return { success: false, error: message };
    }
  }
}
