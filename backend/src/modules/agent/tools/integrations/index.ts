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

// ── MCP-Bridged Apify Tools (2026 architecture) ──────────────────────────
export { SearchApifyActorsTool } from './search-apify-actors.tool.js';
export { GetApifyActorDetailsTool } from './get-apify-actor-details.tool.js';
export { CallApifyActorTool } from './call-apify-actor.tool.js';
export { GetApifyActorOutputTool } from './get-apify-actor-output.tool.js';

// ── Legacy Apify Direct-API Tools (backup — do not remove) ──────────────
export { ScrapeTwitterTool } from './scrape-twitter.tool.js';
export { ScrapeInstagramTool } from './scrape-instagram.tool.js';
export { ApifyService } from './apify.service.js';

// ── Other Integration Tools ─────────────────────────────────────────────
export { WebSearchTool } from './web-search.tool.js';
export { SendEmailTool } from './send-email.tool.js';

// ── Shared Services ─────────────────────────────────────────────────────
export { ScraperMediaService } from './scraper-media.service.js';
