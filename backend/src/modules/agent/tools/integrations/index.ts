/**
 * @fileoverview Integration Tools — Barrel Export
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Exports all third-party integration tools and their supporting services,
 * grouped by provider/domain.
 *
 * Directory:
 *   apify/             — Apify actor platform (MCP bridge + direct-API tools)
 *   firecrawl/         — Firecrawl web scraping (MCP bridge + tools)
 *   firebase-mcp/      — Firebase read-only MCP bridge + tools
 *   cloudflare-stream/ — Cloudflare Stream video tools
 *   runway/            — Runway ML video/image generation
 *   social/            — Twitter/Instagram scrapers + media service
 *   web/               — Tavily web search
 *   email/             — Email sending (Gmail + Microsoft)
 */

// ── MCP Foundation (shared base) ─────────────────────────────────────────
export {
  BaseMcpClientService,
  type McpToolDefinition,
  type McpToolCallResult,
  type McpExecuteOptions,
} from './base-mcp-client.service.js';

// ── Apify — Actor platform ────────────────────────────────────────────────
export { ApifyMcpBridgeService } from './apify/apify-mcp-bridge.service.js';
export { ApifyService } from './apify/apify.service.js';
export { SearchApifyActorsTool } from './apify/search-apify-actors.tool.js';
export { GetApifyActorDetailsTool } from './apify/get-apify-actor-details.tool.js';
export { CallApifyActorTool } from './apify/call-apify-actor.tool.js';
export { GetApifyActorOutputTool } from './apify/get-apify-actor-output.tool.js';

// ── Firecrawl — Web scraping ──────────────────────────────────────────────
export { FirecrawlMcpBridgeService } from './firecrawl/firecrawl-mcp-bridge.service.js';
export { FirecrawlScrapeTool } from './firecrawl/firecrawl-scrape.tool.js';
export { FirecrawlSearchTool } from './firecrawl/firecrawl-search.tool.js';
export { FirecrawlMapTool } from './firecrawl/firecrawl-map.tool.js';
export { FirecrawlExtractTool } from './firecrawl/firecrawl-extract.tool.js';
export { FirecrawlAgentTool } from './firecrawl/firecrawl-agent.tool.js';

// ── Firebase MCP — Read-only Firestore access ─────────────────────────────
export { FirebaseMcpBridgeService } from './firebase-mcp/firebase-mcp-bridge.service.js';
export { ListNxt1DataViewsTool } from './firebase-mcp/list-user-firebase-views.tool.js';
export { QueryNxt1DataTool } from './firebase-mcp/query-user-firebase-data.tool.js';

// ── Google Workspace MCP — User-scoped productivity actions ───────────────
export {
  GoogleWorkspaceMcpBridgeService,
  GoogleWorkspaceDiscoveryBridgeService,
  GoogleWorkspaceTokenManagerService,
  GoogleWorkspaceMcpSessionService,
  GoogleWorkspaceToolCatalogService,
  DynamicGoogleWorkspaceTool,
  ListGoogleWorkspaceToolsTool,
  RunGoogleWorkspaceToolTool,
  // First-class Gmail tools
  QueryGmailEmailsTool,
  GmailGetMessageDetailsTool,
  GmailSendEmailTool,
  CreateGmailDraftTool,
  GmailReplyToEmailTool,
  SearchGmailMessagesTool,
  GetGmailMessageContentTool,
  GetGmailMessagesContentBatchTool,
  GetGmailThreadContentTool,
  SendGmailMessageTool,
  // First-class Calendar tools
  GetCalendarEventsTool,
  GetCalendarEventDetailsTool,
  CreateCalendarEventTool,
  DeleteCalendarEventTool,
  ListCalendarsTool,
  ManageCalendarEventTool,
  // First-class Drive tools
  DriveSearchFilesTool,
  DriveReadFileContentTool,
  DriveUploadFileTool,
  DriveCreateFolderTool,
  DriveDeleteFileTool,
  DriveListSharedDrivesTool,
  SearchDriveFilesTool,
  GetDriveFileContentTool,
  GetDriveFileDownloadUrlTool,
  ListDriveItemsTool,
  GetDriveShareableLinkTool,
  CreateDriveFileTool,
  CreateDriveFolderTool,
  ImportToGoogleDocTool,
  UpdateDriveFileTool,
  // First-class Docs tools
  DocsCreateDocumentTool,
  DocsGetDocumentMetadataTool,
  DocsGetContentAsMarkdownTool,
  DocsAppendTextTool,
  DocsPrependTextTool,
  DocsInsertTextTool,
  DocsBatchUpdateTool,
  DocsInsertImageTool,
  GetDocContentTool,
  SearchDocsTool,
  GetDocAsMarkdownTool,
  ExportDocToPdfTool,
  CreateDocTool,
  ModifyDocTextTool,
  // First-class Sheets tools
  SheetsCreateSpreadsheetTool,
  SheetsReadRangeTool,
  SheetsWriteRangeTool,
  SheetsAppendRowsTool,
  SheetsClearRangeTool,
  SheetsAddSheetTool,
  SheetsDeleteSheetTool,
  ReadSheetValuesTool,
  ListSpreadsheetsTool,
  GetSpreadsheetInfoTool,
  ModifySheetValuesTool,
  CreateSpreadsheetTool,
  FormatSheetRangeTool,
  CreateSheetTabTool,
  AppendTableRowsTool,
  // First-class Slides tools
  GetPresentationTool,
  GetSlidesTool,
  CreateSlideTool,
  AddTextToSlideTool,
  AddFormattedTextToSlideTool,
  AddBulletedListToSlideTool,
  AddTableToSlideTool,
  AddSlideNotesTool,
  DuplicateSlideTool,
  DeleteSlideTool,
  CreatePresentationFromMarkdownTool,
  GetSlidPageTool,
  GetPageThumbnailTool,
  CreatePresentationTool,
  BatchUpdatePresentationTool,
} from './google-workspace/index.js';

// ── Cloudflare Stream — Video processing ─────────────────────────────────
export { CloudflareMcpBridgeService } from './cloudflare-stream/cloudflare-mcp-bridge.service.js';
export {
  ImportVideoTool,
  ClipVideoTool,
  GenerateThumbnailTool,
  GetVideoDetailsTool,
  GenerateCaptionsTool,
  CreateSignedUrlTool,
  EnableDownloadTool,
  ManageWatermarkTool,
  DeleteVideoTool,
} from './cloudflare-stream/index.js';

// ── Runway — AI video/image generation ───────────────────────────────────
export { RunwayMcpBridgeService } from './runway/runway-mcp-bridge.service.js';

// ── Social — Twitter/Instagram scrapers ──────────────────────────────────
export { ScraperMediaService } from './social/scraper-media.service.js';
export { ScrapeTwitterTool } from './social/scrape-twitter.tool.js';
export { ScrapeInstagramTool } from './social/scrape-instagram.tool.js';

// ── Web — Tavily search ───────────────────────────────────────────────────
export { WebSearchTool } from './web/web-search.tool.js';

// ── Email — Multi-provider sending ───────────────────────────────────────
export { SendEmailTool } from './email/send-email.tool.js';
