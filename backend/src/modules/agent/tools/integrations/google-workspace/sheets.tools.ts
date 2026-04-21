/**
 * @fileoverview Google Sheets First-Class Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/integrations/google-workspace
 *
 * Seven Sheets tools matching google-workspace-mcp v1.27.0:
 * sheets_create_spreadsheet, sheets_read_range, sheets_write_range,
 * sheets_append_rows, sheets_clear_range, sheets_add_sheet, sheets_delete_sheet.
 */

import type { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
import { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';

// ─── sheets_create_spreadsheet ──────────────────────────────────────────────

export class SheetsCreateSpreadsheetTool extends GoogleWorkspaceBaseTool {
  readonly name = 'sheets_create_spreadsheet';
  readonly mcpToolName = 'sheets_create_spreadsheet' as const;
  readonly description = 'Create a new Google Spreadsheet with a specified title.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title of the new spreadsheet.' },
    },
    required: ['title'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── sheets_read_range ──────────────────────────────────────────────────────

export class SheetsReadRangeTool extends GoogleWorkspaceBaseTool {
  readonly name = 'sheets_read_range';
  readonly mcpToolName = 'sheets_read_range' as const;
  readonly description = 'Read values from a Google Spreadsheet range (e.g. Sheet1!A1:D10).';
  readonly isMutation = false;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The Google Spreadsheet ID.' },
      range: { type: 'string', description: "A1 notation range, e.g. 'Sheet1!A1:D10'." },
    },
    required: ['spreadsheet_id', 'range'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── sheets_write_range ─────────────────────────────────────────────────────

export class SheetsWriteRangeTool extends GoogleWorkspaceBaseTool {
  readonly name = 'sheets_write_range';
  readonly mcpToolName = 'sheets_write_range' as const;
  readonly description = 'Write values to a Google Spreadsheet range, overwriting existing data.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The Google Spreadsheet ID.' },
      range: { type: 'string', description: 'A1 notation range to write to.' },
      values: {
        type: 'array',
        items: { type: 'array', items: {} },
        description: '2D array of values (rows x columns).',
      },
      value_input_option: {
        type: 'string',
        enum: ['RAW', 'USER_ENTERED'],
        description: "How to interpret values. Default: 'RAW'.",
      },
    },
    required: ['spreadsheet_id', 'range', 'values'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── sheets_append_rows ─────────────────────────────────────────────────────

export class SheetsAppendRowsTool extends GoogleWorkspaceBaseTool {
  readonly name = 'sheets_append_rows';
  readonly mcpToolName = 'sheets_append_rows' as const;
  readonly description = 'Append rows to the end of data in a Google Spreadsheet range.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The Google Spreadsheet ID.' },
      range: {
        type: 'string',
        description: "A1 notation range identifying the table, e.g. 'Sheet1!A1'.",
      },
      values: {
        type: 'array',
        items: { type: 'array', items: {} },
        description: '2D array of row values to append.',
      },
      value_input_option: {
        type: 'string',
        enum: ['RAW', 'USER_ENTERED'],
        description: "How to interpret values. Default: 'RAW'.",
      },
    },
    required: ['spreadsheet_id', 'range', 'values'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── sheets_clear_range ─────────────────────────────────────────────────────

export class SheetsClearRangeTool extends GoogleWorkspaceBaseTool {
  readonly name = 'sheets_clear_range';
  readonly mcpToolName = 'sheets_clear_range' as const;
  readonly description = 'Clear all values in a Google Spreadsheet range.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The Google Spreadsheet ID.' },
      range: { type: 'string', description: 'A1 notation range to clear.' },
    },
    required: ['spreadsheet_id', 'range'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── sheets_add_sheet ───────────────────────────────────────────────────────

export class SheetsAddSheetTool extends GoogleWorkspaceBaseTool {
  readonly name = 'sheets_add_sheet';
  readonly mcpToolName = 'sheets_add_sheet' as const;
  readonly description = 'Add a new sheet (tab) to an existing Google Spreadsheet.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The Google Spreadsheet ID.' },
      title: { type: 'string', description: 'Title of the new sheet tab.' },
    },
    required: ['spreadsheet_id', 'title'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── sheets_delete_sheet ────────────────────────────────────────────────────

export class SheetsDeleteSheetTool extends GoogleWorkspaceBaseTool {
  readonly name = 'sheets_delete_sheet';
  readonly mcpToolName = 'sheets_delete_sheet' as const;
  readonly description = 'Delete a sheet (tab) from a Google Spreadsheet by its numeric sheet ID.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      spreadsheet_id: { type: 'string', description: 'The Google Spreadsheet ID.' },
      sheet_id: {
        type: 'number',
        description: 'Numeric sheet ID of the tab to delete (not the sheet name).',
      },
    },
    required: ['spreadsheet_id', 'sheet_id'],
    additionalProperties: false,
  } as const;

  constructor(sessionService: GoogleWorkspaceMcpSessionService) {
    super(sessionService);
  }
}

// ─── Backwards-compat aliases ────────────────────────────────────────────────
/** @deprecated Use SheetsReadRangeTool */
export const ReadSheetValuesTool = SheetsReadRangeTool;
/** @deprecated Use SheetsCreateSpreadsheetTool */
export const CreateSpreadsheetTool = SheetsCreateSpreadsheetTool;
/** @deprecated Use SheetsWriteRangeTool */
export const ModifySheetValuesTool = SheetsWriteRangeTool;
/** @deprecated Use SheetsAppendRowsTool */
export const AppendTableRowsTool = SheetsAppendRowsTool;
/** @deprecated Use SheetsAddSheetTool */
export const CreateSheetTabTool = SheetsAddSheetTool;

// Removed tools — stub with helpful error
function makeRemovedSheetTool(
  oldName: string,
  replacement: string
): new (s: GoogleWorkspaceMcpSessionService) => GoogleWorkspaceBaseTool {
  return class extends GoogleWorkspaceBaseTool {
    readonly name = oldName;
    readonly mcpToolName = 'sheets_read_range' as const;
    readonly description = `[REMOVED] ${oldName} use ${replacement} instead.`;
    readonly isMutation = false;
    readonly category = 'data' as const;
    readonly parameters = { type: 'object' as const, properties: {} };
    override async execute(): Promise<{ success: false; error: string }> {
      return {
        success: false,
        error: `"${oldName}" has been removed. Use "${replacement}" instead.`,
      };
    }
  };
}

export const ListSpreadsheetsTool = makeRemovedSheetTool('list_spreadsheets', 'drive_search_files');
export const GetSpreadsheetInfoTool = makeRemovedSheetTool(
  'get_spreadsheet_info',
  'sheets_read_range'
);
export const FormatSheetRangeTool = makeRemovedSheetTool(
  'format_sheet_range',
  'sheets_write_range'
);
