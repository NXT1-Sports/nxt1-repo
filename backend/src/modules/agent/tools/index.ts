/**
 * @fileoverview Tool System — Barrel Export
 * @module @nxt1/backend/modules/agent/tools
 */

export { BaseTool, type ToolResult } from './base.tool.js';
export { ToolRegistry } from './tool-registry.js';
export {
  FAVICON_REGISTRY,
  extractDomain,
  getFaviconUrl,
  getDisplayName,
  resolveUrlDisplay,
  formatUrlsList,
  compactizeMarkdownUrls,
  type UrlDisplayOptions,
} from './favicon-registry.js';
export { toMarkdownTable, createUrlLink } from './markdown-helpers.js';

// Scraping tools
export { ScraperService } from './integrations/firecrawl/scraping/index.js';

// Platform tools
export { SearchCollegesTool, SearchCollegeCoachesTool } from './platform/index.js';

// Integration tools
export { SendEmailTool } from './integrations/email/send-email.tool.js';
export { ScrapeTwitterTool } from './integrations/social/scrape-twitter.tool.js';
export { ApifyService } from './integrations/apify/apify.service.js';

// MCP-bridged Apify tools (2026 architecture)
export {
  BaseMcpClientService,
  ApifyMcpBridgeService,
  SearchApifyActorsTool,
  GetApifyActorDetailsTool,
  CallApifyActorTool,
  GetApifyActorOutputTool,
} from './integrations/index.js';

// Analytics tools

// System tools (cross-cutting infrastructure)
export { DelegateTaskTool, DynamicExportTool } from './system/index.js';

export * from './analytics/index.js';
export * from './assets/index.js';
export * from './intel/index.js';
export * from './memory/index.js';
export * from './platform/index.js';
export * from './support/index.js';
