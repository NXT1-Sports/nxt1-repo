/**
 * @fileoverview Scrape & Index Profile Tool
 * @module @nxt1/backend/modules/agent/tools/scraping
 *
 * Agent X tool that fetches a sports page, runs AI-powered extraction to parse
 * athlete data, and returns a lightweight INDEX/MANIFEST to the agent instead
 * of raw data. The full distilled data is cached in-memory so the agent can
 * fetch individual sections via `read_distilled_section`.
 *
 * This solves the #1 problem: LLMs can't process 200kb of page content
 * without losing focus. Instead, the agent sees:
 *   "Found: identity, 3 seasons of stats, 14 schedule events, 2 recruiting offers"
 * ...and then selectively reads each section individually.
 *
 * All extraction is powered by the Universal AI Distiller — there are no
 * platform-specific TypeScript parsers. This agentic approach handles any
 * sports site (MaxPreps, Hudl, 247Sports, Perfect Game, and 50+ others).
 */

import { BaseTool, type ToolResult } from '../base.tool.js';
import { ScraperService } from './scraper.service.js';
import { buildProfileIndex, distillWithAI } from './distillers/index.js';
import type { DistilledProfile } from './distillers/index.js';
import { OpenRouterService } from '../../llm/openrouter.service.js';
import { logger } from '../../../../utils/logger.js';

// ─── Stats Sub-Page Detection ───────────────────────────────────────────────

/**
 * Regex patterns that match stats sub-page links in scraped markdown.
 * These links point to the full game-by-game stats table on platforms like
 * MaxPreps, which renders stats on a separate page from the main profile.
 *
 * Captures the relative or absolute URL from markdown link syntax: [text](url)
 */
const STATS_LINK_PATTERNS: readonly RegExp[] = [
  // MaxPreps: [Ryder's Full Stats](/ca/folsom/.../football/stats/?careerid=...)
  /\[(?:[^[\]]*(?:Full\s+Stats|Career\s+Stats|All\s+Stats|View\s+Stats)[^[\]]*)\]\(([^)]+)\)/i,
  // MaxPreps stats URL pattern (may appear in text without explicit "Full Stats" label)
  /\[(?:[^[\]]*Stats[^[\]]*)\]\((\/[^)]*\/(?:football|basketball|baseball|soccer|volleyball|softball|lacrosse|hockey|wrestling|swimming|track|tennis|golf)\/stats\/[^)]*)\)/i,
  // Hudl: stats or highlights sub-page
  /\[(?:[^[\]]*Stats[^[\]]*)\]\((https?:\/\/[^)]*hudl\.com[^)]*\/stats[^)]*)\)/i,
];

// ─── In-Memory Cache ────────────────────────────────────────────────────────

/**
 * Cache distilled profiles by URL so `read_distilled_section` can access them
 * without re-fetching. TTL = 10 minutes (scrape jobs rarely exceed this).
 */
const cache = new Map<
  string,
  {
    profile: DistilledProfile;
    markdownContent: string;
    rawStructuredData: Record<string, unknown> | null;
    expiry: number;
  }
>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const cacheCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [url, entry] of cache.entries()) {
    if (now > entry.expiry) {
      cache.delete(url);
    }
  }
}, 60 * 1000);

cacheCleanupTimer.unref?.();

export function getCachedScrapeResult(url: string) {
  const entry = cache.get(url);
  if (!entry || Date.now() > entry.expiry) {
    cache.delete(url);
    return null;
  }
  return entry;
}

/** Exposed for testing. */
export function clearScrapeCache(): void {
  cache.clear();
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class ScrapeAndIndexProfileTool extends BaseTool {
  readonly name = 'scrape_and_index_profile';

  readonly description =
    'Scrapes an athlete profile page (MaxPreps, Hudl, 247Sports, Perfect Game, etc.) and returns a ' +
    'lightweight INDEX of what data was found — NOT the raw data itself. ' +
    'Uses AI-powered extraction to parse any sports platform. ' +
    'The index tells you which sections are available (identity, stats, schedule, recruiting, etc.) ' +
    'and their counts. Use `read_distilled_section` to fetch each section individually. ' +
    'This prevents context overflow from massive JSON payloads.\n\n' +
    'If AI extraction fails or finds no usable data, falls back to returning raw markdown + ' +
    'structured data. In fallback mode, use the markdown content to extract fields manually.\n\n' +
    'ALWAYS call this tool first before any write tools. Then use `read_distilled_section` to ' +
    'read each section, and call the appropriate write tool for that section.';

  readonly parameters = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full URL of the athlete profile to scrape.',
      },
    },
    required: ['url'],
  } as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  private readonly scraper: ScraperService;
  private readonly llm: OpenRouterService | null;

  constructor(scraper?: ScraperService, llm?: OpenRouterService) {
    super();
    this.scraper = scraper ?? new ScraperService();
    this.llm = llm ?? null;
  }

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input['url'];

    if (typeof url !== 'string' || url.trim().length === 0) {
      return {
        success: false,
        error: 'Parameter "url" is required and must be a non-empty string.',
      };
    }

    const cleanUrl = url.trim();

    try {
      // ── Step 1: Scrape the page ─────────────────────────────────────
      const result = await this.scraper.scrape({ url: cleanUrl });

      // ── Step 1b: Detect & fetch stats sub-page if available ─────────
      // Many platforms (MaxPreps, etc.) have the full game-by-game stats
      // table on a separate sub-page linked from the main profile.
      // We detect these links and append the stats table content so the
      // AI distiller has the complete dataset.
      let combinedMarkdown = result.markdownContent;
      const statsUrls = this.detectStatsPageUrls(result.markdownContent, cleanUrl);

      if (statsUrls.length > 0) {
        logger.info('[ScrapeAndIndex] Detected stats sub-pages, fetching', {
          count: statsUrls.length,
          urls: statsUrls,
        });
        for (const statsUrl of statsUrls) {
          try {
            const statsResult = await this.scraper.scrape({ url: statsUrl });
            if (statsResult.markdownContent && statsResult.markdownContent.length > 200) {
              combinedMarkdown +=
                '\n\n═══ STATS PAGE DATA (from ' +
                statsUrl +
                ') ═══\n\n' +
                statsResult.markdownContent;
            }
          } catch (err) {
            // Non-fatal — continue with other stats pages
            logger.warn('[ScrapeAndIndex] Stats sub-page fetch failed', {
              statsUrl,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        if (combinedMarkdown.length > result.markdownContent.length) {
          logger.info('[ScrapeAndIndex] Stats sub-pages appended', {
            mainLength: result.markdownContent.length,
            combinedLength: combinedMarkdown.length,
            pagesAppended: statsUrls.length,
          });
        }
      }

      // ── Step 2: AI Distillation (primary extraction path) ──────────
      if (this.llm) {
        const distilled = await distillWithAI(
          cleanUrl,
          combinedMarkdown,
          this.llm,
          result.pageData?.videos
        );

        if (distilled) {
          cache.set(cleanUrl, {
            profile: distilled,
            markdownContent: combinedMarkdown,
            rawStructuredData: null,
            expiry: Date.now() + CACHE_TTL_MS,
          });

          const index = buildProfileIndex(distilled);

          return {
            success: true,
            data: {
              mode: 'distilled',
              platform: index.platform,
              url: cleanUrl,
              faviconUrl: result.pageData?.faviconUrl ?? null,
              index: index.summary,
              availableSections: index.availableSections,
              instructions:
                'Use `read_distilled_section` with the URL and a section name to fetch detailed data for each section. ' +
                'Then call the appropriate write tool for each section: ' +
                'write_core_identity, write_season_stats, write_combine_metrics, ' +
                'write_recruiting_activity, write_calendar_events, write_athlete_videos.',
            },
          };
        }
      }

      // ── Step 3: Raw fallback — AI distillation failed or unavailable ─
      // Return truncated markdown so the agent can do its own extraction
      cache.set(cleanUrl, {
        profile: { platform: 'unknown', profileUrl: cleanUrl },
        markdownContent: combinedMarkdown,
        rawStructuredData: null,
        expiry: Date.now() + CACHE_TTL_MS,
      });

      return {
        success: true,
        data: {
          mode: 'raw',
          platform: 'unknown',
          url: cleanUrl,
          title: result.title,
          faviconUrl: result.pageData?.faviconUrl ?? null,
          markdownContent: combinedMarkdown.slice(0, 15_000),
          instructions:
            'AI extraction could not process this URL. ' +
            'Analyze the markdown content above to extract athlete data. ' +
            'Use `update_athlete_profile` to write the extracted fields.',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scraping failed';
      return { success: false, error: message };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  /**
   * Detect ALL stats sub-page URLs from the scraped markdown.
   * Returns deduplicated list. Skips if the current URL is already a stats page.
   * Caps at 4 unique URLs to avoid excessive scraping.
   */
  private detectStatsPageUrls(markdown: string, currentUrl: string): string[] {
    // Don't recurse if we're already on a stats page
    if (/\/stats\/?(\?|$)/i.test(currentUrl)) return [];

    const found = new Set<string>();

    for (const pattern of STATS_LINK_PATTERNS) {
      // Use global regex to find ALL matches, not just the first
      const globalPattern = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
      );
      let match: RegExpExecArray | null;
      while ((match = globalPattern.exec(markdown)) !== null) {
        const href = match[1]?.trim();
        if (!href) continue;
        try {
          const resolved = new URL(href, currentUrl).href;
          // Avoid duplicates and self-links
          if (resolved !== currentUrl) {
            found.add(resolved);
          }
        } catch {
          continue;
        }
      }
    }

    // Cap at 4 stats pages to avoid excessive scraping
    return Array.from(found).slice(0, 4);
  }
}
