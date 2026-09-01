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
 *   microsoft-365/     — Microsoft 365 productivity MCP tools
 *   ffmpeg-mcp/        — FFmpeg video processing MCP tools
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
export { FirecrawlMcpBridgeService } from './firecrawl/mcp/firecrawl-mcp-bridge.service.js';
export { FirecrawlScrapeTool } from './firecrawl/mcp/firecrawl-scrape.tool.js';
export { FirecrawlSearchTool } from './firecrawl/mcp/firecrawl-search.tool.js';
export { FirecrawlMapTool } from './firecrawl/mcp/firecrawl-map.tool.js';
export { FirecrawlExtractTool } from './firecrawl/mcp/firecrawl-extract.tool.js';
export { FirecrawlAgentTool } from './firecrawl/mcp/firecrawl-agent.tool.js';
export { FirecrawlImagesTool } from './firecrawl/mcp/firecrawl-images.tool.js';

// ── Firebase MCP — Read-only Firestore access ─────────────────────────────
export {
  FirebaseMcpBridgeService,
  EnvironmentAwareFirebaseMcpBridgeService,
  type FirebaseMcpBridge,
} from './firebase-mcp/firebase-mcp-bridge.service.js';
export { ListNxt1DataViewsTool } from './firebase-mcp/list-user-firebase-views.tool.js';
export { QueryNxt1DataTool } from './firebase-mcp/query-user-firebase-data.tool.js';
export { MutateNxt1DataTool } from './firebase-mcp/mutate-nxt1-data.tool.js';

// ── Microsoft 365 MCP — User-scoped productivity actions ─────────────────
export {
  Microsoft365McpBridgeService,
  Microsoft365TokenManagerService,
  Microsoft365McpSessionService,
  ListMicrosoft365ToolsTool,
  RunMicrosoft365ToolTool,
  type MicrosoftOAuthTokenDocument,
  type Microsoft365DiscoveredToolDefinition,
  filterMicrosoft365ToolDefinitions,
  extractMicrosoft365Payload,
  extractMicrosoft365ErrorMessage,
  truncateMicrosoft365Payload,
  resolveMicrosoft365ToolMetadata,
} from './microsoft-365/index.js';

// ── Google Drive — User-scoped file storage actions ───────────────────────
export {
  CreateDriveFolderTool,
  UploadDriveFileTool,
  SearchDriveFilesTool,
  ReadDriveFileTool,
  DeleteDriveFileTool,
} from './google-drive/index.js';

// ── FFmpeg MCP — Video processing operations ───────────────────────────
export { FfmpegMcpBridgeService } from './ffmpeg-mcp/ffmpeg-mcp-bridge.service.js';
export {
  FfmpegTrimVideoTool,
  FfmpegMergeVideosTool,
  FfmpegResizeVideoTool,
  FfmpegBurnAnnotationTool,
  FfmpegAddTextOverlayTool,
  FfmpegBurnSubtitlesTool,
  FfmpegGenerateThumbnailTool,
  FfmpegConvertVideoTool,
  FfmpegCompressVideoTool,
} from './ffmpeg-mcp/index.js';

// ── Chart MCP — Data visualization operations ──────────────────────────
export { ChartMcpBridgeService } from './chart-mcp/chart-mcp-bridge.service.js';
export { GenerateChartVisualizationTool } from './chart-mcp/index.js';

// ── Play diagram generation ───────────────────────────────────────────────
export { PlayDiagramService, CreatePlayDiagramTool } from './play-diagram/index.js';
export {
  BoardDiagramService,
  CreateBoardDiagramTool,
  UpdateBoardDiagramTool,
  DeleteBoardDiagramTool,
} from './board-diagram/index.js';

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
export {
  RunwayGenerateVideoTool,
  RunwayEditVideoTool,
  RunwayUpscaleVideoTool,
  RunwayCheckTaskTool,
} from './runway/index.js';

// ── Social — Twitter/Instagram scrapers ──────────────────────────────────
export { ScraperMediaService } from './social/scraper-media.service.js';
export { ScrapeTwitterTool } from './social/scrape-twitter.tool.js';
export { ScrapeInstagramTool } from './social/scrape-instagram.tool.js';

// ── Web — Tavily search ───────────────────────────────────────────────────
export { WebSearchTool } from './web/web-search.tool.js';

// ── Email — Multi-provider sending ───────────────────────────────────────
export { SendEmailTool } from './email/send-email.tool.js';

// ── Support — Ticketing and escalation ───────────────────────────────────
export { CreateSupportTicketTool } from '../support/create-support-ticket.tool.js';
