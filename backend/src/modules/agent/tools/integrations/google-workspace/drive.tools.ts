/**
 * @fileoverview Google Drive First-Class Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * Six Drive tools matching google-workspace-mcp v1.27.0:
 * drive_search_files, drive_read_file_content, drive_upload_file,
 * drive_create_folder, drive_delete_file, drive_list_shared_drives.
 */

import type { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';
import { z } from 'zod';

const EmptyDriveInputSchema = z.object({}).strict();
const DriveSearchFilesInputSchema = z.object({
  query: z.string().trim().min(1),
  page_size: z.coerce.number().int().optional(),
  shared_drive_id: z.string().trim().min(1).optional(),
});
const DriveReadFileContentInputSchema = z.object({
  file_id: z.string().trim().min(1),
});
const DriveUploadFileInputSchema = z.object({
  filename: z.string().trim().min(1),
  content_base64: z.string().trim().min(1),
  parent_folder_id: z.string().trim().min(1).optional(),
  shared_drive_id: z.string().trim().min(1).optional(),
});
const DriveCreateFolderInputSchema = z.object({
  folder_name: z.string().trim().min(1),
  parent_folder_id: z.string().trim().min(1).optional(),
  shared_drive_id: z.string().trim().min(1).optional(),
});
const DriveDeleteFileInputSchema = z.object({
  file_id: z.string().trim().min(1),
});
const DriveListSharedDrivesInputSchema = z.object({
  page_size: z.coerce.number().int().optional(),
});

// ─── drive_search_files ─────────────────────────────────────────────────────

export class DriveSearchFilesTool extends GoogleWorkspaceBaseTool {
  readonly name = 'drive_search_files';
  readonly mcpToolName = 'drive_search_files' as const;
  readonly description =
    'Search for files in Google Drive with optional shared drive support. ' +
    'Returns file IDs, names, types, and links.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = DriveSearchFilesInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── drive_read_file_content ────────────────────────────────────────────────

export class DriveReadFileContentTool extends GoogleWorkspaceBaseTool {
  readonly name = 'drive_read_file_content';
  readonly mcpToolName = 'drive_read_file_content' as const;
  readonly description = 'Read the content of a file from Google Drive by its file ID.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = DriveReadFileContentInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── drive_upload_file ──────────────────────────────────────────────────────

export class DriveUploadFileTool extends GoogleWorkspaceBaseTool {
  readonly name = 'drive_upload_file';
  readonly mcpToolName = 'drive_upload_file' as const;
  readonly description =
    'Upload a file to Google Drive by providing its content directly as base64. ' +
    'Supports optional parent folder and shared drive placement.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = DriveUploadFileInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── drive_create_folder ────────────────────────────────────────────────────

export class DriveCreateFolderTool extends GoogleWorkspaceBaseTool {
  readonly name = 'drive_create_folder';
  readonly mcpToolName = 'drive_create_folder' as const;
  readonly description = 'Create a new folder in Google Drive, including within shared drives.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = DriveCreateFolderInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── drive_delete_file ──────────────────────────────────────────────────────

export class DriveDeleteFileTool extends GoogleWorkspaceBaseTool {
  readonly name = 'drive_delete_file';
  readonly mcpToolName = 'drive_delete_file' as const;
  readonly description = 'Delete a file from Google Drive using its file ID.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = DriveDeleteFileInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── drive_list_shared_drives ────────────────────────────────────────────────

export class DriveListSharedDrivesTool extends GoogleWorkspaceBaseTool {
  readonly name = 'drive_list_shared_drives';
  readonly mcpToolName = 'drive_list_shared_drives' as const;
  readonly description = 'List shared drives accessible by the user.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = DriveListSharedDrivesInputSchema;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── Backwards-compat aliases ────────────────────────────────────────────────
// The old tool class names are re-exported so bootstrap.ts doesn't break
// immediately. These can be cleaned up after bootstrap.ts is updated.
/** @deprecated Use DriveSearchFilesTool */
export const SearchDriveFilesTool = DriveSearchFilesTool;
/** @deprecated Use DriveReadFileContentTool */
export const GetDriveFileContentTool = DriveReadFileContentTool;
/** @deprecated Use DriveCreateFolderTool */
export const CreateDriveFolderTool = DriveCreateFolderTool;
/** @deprecated Use DriveDeleteFileTool */
export { DriveDeleteFileTool as DeleteDriveFileTool };

// These no longer exist on the MCP server — stub classes that log a warning and
// return a helpful error so existing registrations don't crash at boot.
function makeRemovedTool(
  oldName: string,
  replacement: string
): new (s: GoogleWorkspaceMcpSessionService) => GoogleWorkspaceBaseTool {
  const cls = class extends GoogleWorkspaceBaseTool {
    readonly name = oldName;
    // mcpToolName must be a valid allowed key; we use drive_search_files as a placeholder
    // but override execute() so this tool is never actually forwarded to MCP.
    readonly mcpToolName = 'drive_search_files' as const;
    readonly description = `[REMOVED] ${oldName} is no longer available. Use ${replacement} instead.`;
    readonly isMutation = false;
    readonly category = 'data' as const;
    readonly parameters = EmptyDriveInputSchema;

    override async execute(): Promise<{ success: false; error: string }> {
      return {
        success: false,
        error: `The tool "${oldName}" has been removed. Please use "${replacement}" instead.`,
      };
    }
  };
  return cls;
}

export const GetDriveFileDownloadUrlTool = makeRemovedTool(
  'get_drive_file_download_url',
  'drive_read_file_content'
);
export const ListDriveItemsTool = makeRemovedTool('list_drive_items', 'drive_search_files');
export const GetDriveShareableLinkTool = makeRemovedTool(
  'get_drive_shareable_link',
  'drive_search_files'
);
export const CreateDriveFileTool = makeRemovedTool('create_drive_file', 'drive_upload_file');
export const ImportToGoogleDocTool = makeRemovedTool('import_to_google_doc', 'drive_upload_file');
export const UpdateDriveFileTool = makeRemovedTool('update_drive_file', 'drive_search_files');
