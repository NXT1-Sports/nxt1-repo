export { GoogleWorkspaceMcpBridgeService } from './google-workspace-mcp-bridge.service.js';
export { GoogleWorkspaceDiscoveryBridgeService } from './google-workspace-discovery-bridge.service.js';
export { GoogleWorkspaceTokenManagerService } from './google-workspace-token-manager.service.js';
export type { GoogleWorkspaceAccessCredentials } from './google-workspace-token-manager.service.js';
export { GoogleWorkspaceMcpSessionService } from './google-workspace-mcp-session.service.js';
export { GoogleWorkspaceToolCatalogService } from './google-workspace-tool-catalog.service.js';
export { GoogleWorkspaceBaseTool } from './google-workspace-base.tool.js';
export { DynamicGoogleWorkspaceTool } from './dynamic-google-workspace.tool.js';
export { ListGoogleWorkspaceToolsTool } from './list-google-workspace-tools.tool.js';
export { RunGoogleWorkspaceToolTool } from './run-google-workspace-tool.tool.js';
export {
  GOOGLE_WORKSPACE_ALLOWED_TOOL_NAMES,
  GOOGLE_WORKSPACE_TOOL_METADATA,
  type GoogleWorkspaceAllowedToolName,
  type GoogleWorkspaceDiscoveredToolDefinition,
  type GoogleWorkspaceOAuthTokenDocument,
} from './shared.js';

// ── First-class Gmail tools ─────────────────────────────────────────────────
export {
  QueryGmailEmailsTool,
  GmailGetMessageDetailsTool,
  GmailSendEmailTool,
  CreateGmailDraftTool,
  GmailReplyToEmailTool,
  // compat aliases
  SearchGmailMessagesTool,
  GetGmailMessageContentTool,
  GetGmailMessagesContentBatchTool,
  GetGmailThreadContentTool,
  SendGmailMessageTool,
} from './gmail.tools.js';

// ── First-class Calendar tools ──────────────────────────────────────────────
export {
  GetCalendarEventsTool,
  GetCalendarEventDetailsTool,
  CreateCalendarEventTool,
  DeleteCalendarEventTool,
  // compat aliases
  ListCalendarsTool,
  ManageCalendarEventTool,
} from './calendar.tools.js';

// ── First-class Drive tools ─────────────────────────────────────────────────
export {
  DriveSearchFilesTool,
  DriveReadFileContentTool,
  DriveUploadFileTool,
  DriveCreateFolderTool,
  DriveDeleteFileTool,
  DriveListSharedDrivesTool,
  // compat stubs
  SearchDriveFilesTool,
  GetDriveFileContentTool,
  CreateDriveFolderTool,
  GetDriveFileDownloadUrlTool,
  ListDriveItemsTool,
  GetDriveShareableLinkTool,
  CreateDriveFileTool,
  ImportToGoogleDocTool,
  UpdateDriveFileTool,
} from './drive.tools.js';

// ── First-class Docs tools ──────────────────────────────────────────────────
export {
  DocsCreateDocumentTool,
  DocsGetDocumentMetadataTool,
  DocsGetContentAsMarkdownTool,
  DocsAppendTextTool,
  DocsPrependTextTool,
  DocsInsertTextTool,
  DocsBatchUpdateTool,
  DocsInsertImageTool,
  // compat aliases
  GetDocContentTool,
  GetDocAsMarkdownTool,
  CreateDocTool,
  ModifyDocTextTool,
  SearchDocsTool,
  ExportDocToPdfTool,
} from './docs.tools.js';

// ── First-class Sheets tools ────────────────────────────────────────────────
export {
  SheetsCreateSpreadsheetTool,
  SheetsReadRangeTool,
  SheetsWriteRangeTool,
  SheetsAppendRowsTool,
  SheetsClearRangeTool,
  SheetsAddSheetTool,
  SheetsDeleteSheetTool,
  // compat aliases
  ReadSheetValuesTool,
  CreateSpreadsheetTool,
  ModifySheetValuesTool,
  AppendTableRowsTool,
  CreateSheetTabTool,
  ListSpreadsheetsTool,
  GetSpreadsheetInfoTool,
  FormatSheetRangeTool,
} from './sheets.tools.js';

// ── First-class Slides tools ────────────────────────────────────────────────
export {
  GetPresentationTool,
  GetSlidesTool,
  CreatePresentationTool,
  CreateSlideTool,
  AddTextToSlideTool,
  AddFormattedTextToSlideTool,
  AddBulletedListToSlideTool,
  AddTableToSlideTool,
  AddSlideNotesTool,
  DuplicateSlideTool,
  DeleteSlideTool,
  CreatePresentationFromMarkdownTool,
  // compat aliases
  GetSlidPageTool,
  GetPageThumbnailTool,
  BatchUpdatePresentationTool,
} from './slides.tools.js';
