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

// ─── drive_search_files ─────────────────────────────────────────────────────

export class DriveSearchFilesTool extends GoogleWorkspaceBaseTool {
  readonly name = 'drive_search_files';
  readonly mcpToolName = 'drive_search_files' as const;
  readonly description =
    'Search for files in Google Drive with optional shared drive support. ' +
    'Returns file IDs, names, types, and links.';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Drive search query string. Supports operators like: ' +
          "name contains 'report', mimeType='application/pdf', " +
          "modifiedTime > '2025-01-01'.",
      },
      page_size: {
        type: 'number',
        description: 'Maximum files to return (default: 10).',
      },
      shared_drive_id: {
        type: 'string',
        description: 'Shared drive ID to scope the search to a specific shared drive.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      file_id: {
        type: 'string',
        description: 'The Google Drive file ID.',
      },
    },
    required: ['file_id'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      filename: {
        type: 'string',
        description: 'Name for the uploaded file (including extension, e.g. "report.pdf").',
      },
      content_base64: {
        type: 'string',
        description: 'File content encoded as base64.',
      },
      parent_folder_id: {
        type: 'string',
        description: 'Parent folder ID. Defaults to My Drive root.',
      },
      shared_drive_id: {
        type: 'string',
        description: 'Optional shared drive ID for shared drive placement.',
      },
    },
    required: ['filename', 'content_base64'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      folder_name: {
        type: 'string',
        description: 'Name for the new folder.',
      },
      parent_folder_id: {
        type: 'string',
        description: 'Parent folder ID. Defaults to My Drive top level.',
      },
      shared_drive_id: {
        type: 'string',
        description: 'Optional shared drive ID.',
      },
    },
    required: ['folder_name'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      file_id: {
        type: 'string',
        description: 'The Drive file ID to delete.',
      },
    },
    required: ['file_id'],
    additionalProperties: false,
  } as const;

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

  readonly parameters = {
    type: 'object',
    properties: {
      page_size: {
        type: 'number',
        description: 'Maximum shared drives to return.',
      },
    },
    additionalProperties: false,
  } as const;

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
    readonly parameters = { type: 'object' as const, properties: {} };

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
