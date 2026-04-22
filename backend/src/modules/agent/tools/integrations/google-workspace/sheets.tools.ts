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
import { z } from 'zod';

const EmptySheetsInputSchema = z.object({}).strict();
const SheetsCreateSpreadsheetInputSchema = z.object({ title: z.string().trim().min(1) });
const SheetsReadRangeInputSchema = z.object({
  spreadsheet_id: z.string().trim().min(1),
  range: z.string().trim().min(1),
});
const SheetsValuesSchema = z.array(z.array(z.unknown())).min(1);
const SheetsWriteRangeInputSchema = z.object({
  spreadsheet_id: z.string().trim().min(1),
  range: z.string().trim().min(1),
  values: SheetsValuesSchema,
  value_input_option: z.enum(['RAW', 'USER_ENTERED']).optional(),
});
const SheetsClearRangeInputSchema = z.object({
  spreadsheet_id: z.string().trim().min(1),
  range: z.string().trim().min(1),
});
const SheetsAddSheetInputSchema = z.object({
  spreadsheet_id: z.string().trim().min(1),
  title: z.string().trim().min(1),
});
const SheetsDeleteSheetInputSchema = z.object({
  spreadsheet_id: z.string().trim().min(1),
  sheet_id: z.coerce.number().int(),
});

// ─── sheets_create_spreadsheet ──────────────────────────────────────────────

export class SheetsCreateSpreadsheetTool extends GoogleWorkspaceBaseTool {
  readonly name = 'sheets_create_spreadsheet';
  readonly mcpToolName = 'sheets_create_spreadsheet' as const;
  readonly description = 'Create a new Google Spreadsheet with a specified title.';
  readonly isMutation = true;
  readonly category = 'data' as const;

  readonly parameters = SheetsCreateSpreadsheetInputSchema;

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

  readonly parameters = SheetsReadRangeInputSchema;

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

  readonly parameters = SheetsWriteRangeInputSchema;

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

  readonly parameters = SheetsWriteRangeInputSchema;

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

  readonly parameters = SheetsClearRangeInputSchema;

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

  readonly parameters = SheetsAddSheetInputSchema;

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

  readonly parameters = SheetsDeleteSheetInputSchema;

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
    readonly parameters = EmptySheetsInputSchema;
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
