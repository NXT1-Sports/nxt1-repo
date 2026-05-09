/**
 * @fileoverview Media Acquisition Middleware — Mandatory routing enforcement
 * @module @nxt1/backend/modules/agent/tools/media
 *
 * This middleware is called at the top of every media-acquisition tool's
 * execute() method. It classifies the incoming URL and rejects the call with
 * a precise corrective tool call syntax if the tool being invoked does not
 * match the canonical strategy for that URL type.
 *
 * Design principles:
 * - Reject + redirect (not silent auto-routing) so the LLM's reasoning chain
 *   stays coherent and observable in logs.
 * - Rejection messages include EXACT corrective call syntax so the LLM can
 *   correct in exactly 1 additional iteration.
 * - Only 1 extra iteration cost on mismatch — negligible vs MAX_ITERATIONS=20.
 * - Tools that don't handle a URL parameter are not checked (opt-in via
 *   the urlParamKey parameter).
 *
 * Usage (inside a media-acquisition tool's execute()):
 *   const block = checkMediaAcquisitionRouting('scrape_webpage', url);
 *   if (block) return block;
 */

import { UrlClassifierService, type AcquisitionStrategy } from './url-classifier.service.js';
import type { ToolResult } from '../base.tool.js';

// Shared classifier instance (singleton — pure stateless service)
const classifier = new UrlClassifierService();

/**
 * Tool names that have defined allowed strategies.
 * Any tool in this set will be checked against the classifier.
 */
export type MediaAcquisitionToolName =
  | 'scrape_webpage'
  | 'extract_web_data'
  | 'scrape_twitter'
  | 'scrape_instagram'
  | 'analyze_video'
  | 'stage_media'
  | 'extract_page_images'
  | 'extract_hudl_video';

/** Strategies permitted for each media-acquisition tool. */
const ALLOWED_STRATEGIES: Readonly<
  Record<MediaAcquisitionToolName, readonly AcquisitionStrategy[]>
> = {
  scrape_webpage: ['firecrawl_scrape'],
  extract_web_data: ['firecrawl_scrape'],
  scrape_twitter: ['scrape_twitter_single_tweet', 'scrape_twitter_profile'],
  scrape_instagram: ['scrape_instagram'],
  analyze_video: ['analyze_video_direct'],
  stage_media: ['stage_direct_video', 'stage_direct_image', 'stage_direct_stream'],
  extract_page_images: ['firecrawl_scrape'],
  extract_hudl_video: ['extract_hudl_video'],
};

/**
 * Check if the given tool is being used with the correct URL type.
 *
 * @param toolName  — The `BaseTool.name` of the calling tool.
 * @param url       — The URL being processed (any string value).
 * @returns A blocking ToolResult if the strategy mismatches, or `null` to proceed.
 *
 * @example
 * // Inside FirecrawlScrapeTool.execute():
 * const block = checkMediaAcquisitionRouting('scrape_webpage', url);
 * if (block) return block;
 */
export function checkMediaAcquisitionRouting(
  toolName: MediaAcquisitionToolName,
  url: string
): ToolResult | null {
  const classification = classifier.classify(url);
  const allowed = ALLOWED_STRATEGIES[toolName];

  if (!allowed) return null; // unknown tool — no enforcement

  if (allowed.includes(classification.strategy)) return null; // correct tool, proceed

  const message = buildRejectionMessage(toolName, url, classification.correctiveExample);

  return {
    success: false,
    error: message,
  };
}

/**
 * Enforce that a URL is specifically a Twitter/X single-tweet permalink.
 *
 * Used by scrape_twitter(mode=single_tweet) to prevent profile/search URLs from
 * being treated as single tweet extraction requests.
 */
export function checkTwitterSingleTweetIntent(url: string): ToolResult | null {
  const classification = classifier.classify(url);
  if (classification.strategy === 'scrape_twitter_single_tweet') return null;

  return {
    success: false,
    error:
      `Routing mismatch: URL is not a Twitter/X single tweet permalink. ` +
      `Use: ${classification.correctiveExample}`,
  };
}

/**
 * Check if a URL is a blocked social domain.
 * Used by scrape_webpage and extract_web_data to hard-block social domains
 * before even attempting a Firecrawl call.
 *
 * @returns A blocking ToolResult if blocked, or `null` to proceed.
 */
export function checkSocialDomainBlock(url: string): ToolResult | null {
  if (!classifier.isSocialBlocked(url)) return null;

  const classification = classifier.classify(url);

  return {
    success: false,
    error:
      `Routing mismatch: scrape_webpage cannot be used for ${new URL(url).hostname}. ` +
      `Use: ${classification.correctiveExample}`,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildRejectionMessage(toolName: string, url: string, correctiveExample: string): string {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url.slice(0, 60);
  }

  return (
    `Routing mismatch: "${toolName}" is not the correct tool for ${hostname}. ` +
    `Use: ${correctiveExample}`
  );
}
