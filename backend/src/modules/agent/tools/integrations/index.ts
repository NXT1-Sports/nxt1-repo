/**
 * @fileoverview Integration Tools — Barrel Export
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Exports all third-party integration tools and their supporting services.
 * Legacy Apify direct-API tools (ScrapeTwitterTool, ScrapeInstagramTool) are
 * preserved alongside the new MCP-bridged tools.
 */

// ── MCP Foundation ────────────────────────────────────────────────────────
export {
  BaseMcpClientService,
  type McpToolCallResult,
  type McpExecuteOptions,
} from './base-mcp-client.service.js';
export { ApifyMcpBridgeService } from './apify-mcp-bridge.service.js';
export { FirecrawlMcpBridgeService } from './firecrawl-mcp-bridge.service.js';
export { RunwayMcpBridgeService } from './runway-mcp-bridge.service.js';
export { FirebaseMcpBridgeService } from './firebase-mcp-bridge.service.js';

// ── MCP-Bridged Apify Tools (2026 architecture) ──────────────────────────
export { SearchApifyActorsTool } from './search-apify-actors.tool.js';
export { GetApifyActorDetailsTool } from './get-apify-actor-details.tool.js';
export { CallApifyActorTool } from './call-apify-actor.tool.js';
export { GetApifyActorOutputTool } from './get-apify-actor-output.tool.js';

// ── MCP-Bridged Firecrawl Tools (2026 architecture) ─────────────────────
export { FirecrawlScrapeTool } from './firecrawl-scrape.tool.js';
export { FirecrawlSearchTool } from './firecrawl-search.tool.js';
export { FirecrawlMapTool } from './firecrawl-map.tool.js';
export { FirecrawlExtractTool } from './firecrawl-extract.tool.js';
export { ListNxt1DataViewsTool } from './list-user-firebase-views.tool.js';
export { QueryNxt1DataTool } from './query-user-firebase-data.tool.js';

// ── Legacy Apify Direct-API Tools (backup — do not remove) ──────────────
export { ScrapeTwitterTool } from './scrape-twitter.tool.js';
export { ScrapeInstagramTool } from './scrape-instagram.tool.js';
export { ApifyService } from './apify.service.js';

// ── MCP-Bridged Cloudflare Stream Tools (2026 architecture) ─────────────
export { CloudflareMcpBridgeService } from './cloudflare-mcp-bridge.service.js';
export {
  ImportVideoTool,
  ClipVideoTool,
  GenerateThumbnailTool,
  GetVideoDetailsTool,
  GenerateCaptionsTool,
  CreateSignedUrlTool,
  EnableDownloadTool,
  ManageWatermarkTool,
} from './cloudflare-stream/index.js';

// ── Other Integration Tools ─────────────────────────────────────────────
export { WebSearchTool } from './web-search.tool.js';
export { SendEmailTool } from './send-email.tool.js';

// ── Shared Services ─────────────────────────────────────────────────────
export { ScraperMediaService } from './scraper-media.service.js';
