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

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { ScraperService } from './scraper.service.js';
import { buildProfileIndex, distillWithAI } from './distillers/index.js';
import type { DistilledProfile, DistilledTeam } from './distillers/index.js';
import type { PageStructuredData } from './page-data.types.js';
import { OpenRouterService } from '../../llm/openrouter.service.js';
import { logger } from '../../../../utils/logger.js';
import { getCacheService } from '../../../../services/core/cache.service.js';
import { createHash } from 'crypto';
import {
  createParallelBatchProgressOptions,
  parallelBatch,
} from '../../../agent/utils/parallel-batch.js';

// ─── Scrape Cooldown ────────────────────────────────────────────────────────

/**
 * Minimum interval between scrapes of the same URL (12 hours).
 * Prevents runaway costs from repeated automated scrapes of the same profile.
 *
 * The agent can bypass this with `force: true` for user-initiated manual refreshes.
 */
const SCRAPE_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours
const SCRAPE_COOLDOWN_PREFIX = 'scrape:cooldown:';

/** SHA-256 hash of the URL, truncated to 16 chars for compact cache keys. */
function urlCooldownKey(url: string): string {
  const hash = createHash('sha256').update(url.toLowerCase().trim()).digest('hex').slice(0, 16);
  return `${SCRAPE_COOLDOWN_PREFIX}${hash}`;
}

/**
 * Check if a URL was scraped recently (within cooldown window).
 * Returns the ISO timestamp of last scrape if still in cooldown, else null.
 */
async function checkScrapeCooldown(url: string): Promise<string | null> {
  try {
    const cache = getCacheService();
    const val = await cache.get<string>(urlCooldownKey(url));
    return val ?? null;
  } catch {
    return null; // If cache is unavailable, allow the scrape
  }
}

/** Record that a URL was just scraped (sets cooldown). */
async function setScrapeCooldown(url: string): Promise<void> {
  try {
    const cache = getCacheService();
    await cache.set(urlCooldownKey(url), new Date().toISOString(), {
      ttl: SCRAPE_COOLDOWN_MS / 1000, // Redis TTL in seconds
    });
  } catch {
    // Best-effort — don't block scraping if cache write fails
  }
}

// ─── Structured Data Enrichment ─────────────────────────────────────────────

/**
 * Merge structured HTML extraction data (colors, school address) into the
 * AI-distilled profile. The Firecrawl markdown the AI sees does not include
 * CSS hex values or embedded JSON blobs — pageData captures these reliably.
 *
 * Rules:
 * - Only fills MISSING fields; never overwrites values the AI already found.
 * - Colors come from pageData.colors[0/1] (extracted from __NEXT_DATA__ blobs).
 * - City/state/country fall back to identity fields, then to nextData fields.
 */
function enrichFromStructuredData(
  profile: DistilledProfile,
  pageData: PageStructuredData | null | undefined
): DistilledProfile {
  const colors = pageData?.colors ?? [];

  // Extract city/state from __NEXT_DATA__ for platforms like MaxPreps that
  // embed school address in their Next.js props tree.
  const ndCity = pageData?.nextData ? findStringInJson(pageData.nextData, ['city']) : undefined;
  const ndState = pageData?.nextData
    ? (findStringInJson(pageData.nextData, ['stateName']) ??
      findStringInJson(pageData.nextData, ['state']))
    : undefined;
  // Normalise abbreviated state e.g. "AL" → keep as-is (AI prompt asks for full names,
  // but 2-char abbreviations from nextData are still better than nothing).
  // identity.state is preferred if the AI already extracted a full name.
  const identityCity = profile.identity?.city;
  const identityState = profile.identity?.state;
  const identityCountry = profile.identity?.country;

  // Determine if we even need to touch the team object
  const teamNeedsEnrichment =
    !profile.team?.primaryColor ||
    !profile.team?.secondaryColor ||
    !profile.team?.city ||
    !profile.team?.state;

  if (!teamNeedsEnrichment) return profile;

  const enrichedTeam: DistilledTeam = {
    ...profile.team,
    // Colors: fill from pageData if the AI didn't extract them
    primaryColor: profile.team?.primaryColor ?? (colors[0] ? `#${colors[0]}` : undefined),
    secondaryColor: profile.team?.secondaryColor ?? (colors[1] ? `#${colors[1]}` : undefined),
    // Location: prefer AI identity extraction, then fall back to __NEXT_DATA__
    city: profile.team?.city ?? identityCity ?? ndCity,
    state: profile.team?.state ?? identityState ?? ndState,
    country:
      profile.team?.country ?? identityCountry ?? ((identityCity ?? ndCity) ? 'USA' : undefined),
  };

  // Strip undefined keys so we don't inject explicit undefined into Firestore
  const cleanTeam = Object.fromEntries(
    Object.entries(enrichedTeam).filter(([, v]) => v !== undefined)
  ) as DistilledTeam;

  return { ...profile, team: cleanTeam };
}

/**
 * Walk an unknown JSON value looking for the FIRST occurrence of any of the
 * given keys (case-sensitive) whose value is a non-empty string.
 * Max recursion depth: 6. Max array items scanned: 20.
 */
function findStringInJson(obj: unknown, keys: readonly string[], depth = 0): string | undefined {
  if (depth > 6 || obj === null || obj === undefined) return undefined;

  if (typeof obj === 'object' && !Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'string' && (record[key] as string).length > 0) {
        return record[key] as string;
      }
    }
    for (const value of Object.values(record)) {
      const found = findStringInJson(value, keys, depth + 1);
      if (found !== undefined) return found;
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 20)) {
      const found = findStringInJson(item, keys, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

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
    'Scrapes a sports profile page (athlete, team, or organization — MaxPreps, Hudl, 247Sports, Perfect Game, etc.) and returns a ' +
    'lightweight INDEX of what data was found — NOT the raw data itself. ' +
    'Uses AI-powered extraction to parse any sports platform. ' +
    'The index includes a `profileType` field ("athlete", "team", or "organization") and tells you ' +
    'which sections are available (identity, stats, schedule, recruiting, etc.) and their counts. ' +
    'Use `read_distilled_section` to fetch each section individually. ' +
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
        description:
          'The full URL of the sports profile page to scrape (athlete, team, or organization).',
      },
      force: {
        type: 'boolean',
        description:
          'Set to true to bypass the 12-hour scrape cooldown. Use only for user-initiated manual refreshes, not automated syncs.',
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

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const url = input['url'];

    if (typeof url !== 'string' || url.trim().length === 0) {
      return {
        success: false,
        error: 'Parameter "url" is required and must be a non-empty string.',
      };
    }

    const cleanUrl = url.trim();
    const force = input['force'] === true;

    // ── Cooldown check (cost control) ─────────────────────────────────
    if (!force) {
      const lastScrapedAt = await checkScrapeCooldown(cleanUrl);
      if (lastScrapedAt) {
        // Check if we have a cached distilled result to return
        const cached = getCachedScrapeResult(cleanUrl);
        if (cached) {
          const index = buildProfileIndex(cached.profile);
          return {
            success: true,
            data: {
              mode: 'distilled',
              profileType: index.profileType ?? 'athlete',
              platform: index.platform,
              url: cleanUrl,
              faviconUrl: null,
              index: index.summary,
              availableSections: index.availableSections,
              cooldown: true,
              lastScrapedAt,
              instructions:
                'This URL was scraped recently (within 12h cooldown). Returning cached index. ' +
                'Use `read_distilled_section` to access cached data. ' +
                'Pass `force: true` to bypass the cooldown for a manual refresh.',
            },
          };
        }

        logger.info(
          '[ScrapeAndIndex] URL in cooldown, no cached result available — allowing scrape',
          {
            url: cleanUrl,
            lastScrapedAt,
          }
        );
        // Fall through to scrape — cooldown exists but in-memory cache expired
      }
    }

    try {
      // ── Step 1: Scrape the main page ────────────────────────────────
      const hostname = new URL(cleanUrl).hostname;
      context?.emitStage?.('fetching_data', {
        source: 'scrape_and_index_profile',
        phase: 'main_page',
        hostname,
        url: cleanUrl,
        icon: 'search',
      });
      const result = await this.scraper.scrape({ url: cleanUrl, signal: context?.signal });

      // ── Step 1b: Detect & fetch stats sub-pages in parallel ─────────
      // Many platforms (MaxPreps, etc.) render the full game-by-game stats
      // table on a separate sub-page linked from the main profile.
      // We detect these links and fetch ALL of them concurrently via
      // parallelBatch so the AI distiller receives the complete dataset
      // without sequential round-trips adding to wall-clock time.
      let combinedMarkdown = result.markdownContent;
      const statsUrls = this.detectStatsPageUrls(result.markdownContent, cleanUrl);

      if (statsUrls.length > 0) {
        logger.info('[ScrapeAndIndex] Detected stats sub-pages, fetching in parallel', {
          count: statsUrls.length,
          urls: statsUrls,
        });
        context?.emitStage?.('fetching_data', {
          source: 'scrape_and_index_profile',
          phase: 'stats_subpages',
          hostname,
          total: statsUrls.length,
          icon: 'search',
        });

        const subPageResults = await parallelBatch(
          statsUrls,
          (statsUrl) => this.scraper.scrape({ url: statsUrl, signal: context?.signal }),
          createParallelBatchProgressOptions(
            (done, total) => {
              context?.emitStage?.('fetching_data', {
                source: 'scrape_and_index_profile',
                phase: 'stats_subpages',
                hostname,
                completed: done,
                total,
                icon: 'search',
              });
            },
            {
              concurrency: 4, // matches the caps in detectStatsPageUrls
              signal: context?.signal,
            }
          )
        );

        let pagesAppended = 0;
        for (const r of subPageResults) {
          if (r.status === 'fulfilled') {
            const { value: statsResult } = r;
            if (statsResult.markdownContent && statsResult.markdownContent.length > 200) {
              combinedMarkdown +=
                '\n\n═══ STATS PAGE DATA (from ' +
                statsUrls[r.index] +
                ') ═══\n\n' +
                statsResult.markdownContent;
              pagesAppended++;
            }
          } else {
            // Non-fatal — log and continue with the data we have
            logger.warn('[ScrapeAndIndex] Stats sub-page fetch failed', {
              statsUrl: statsUrls[r.index],
              error: r.reason.message,
            });
          }
        }

        if (pagesAppended > 0) {
          logger.info('[ScrapeAndIndex] Stats sub-pages appended', {
            mainLength: result.markdownContent.length,
            combinedLength: combinedMarkdown.length,
            pagesAppended,
          });
        }
      }

      // ── Step 2: AI Distillation (primary extraction path) ──────────
      if (this.llm) {
        context?.emitStage?.('submitting_job', {
          source: 'scrape_and_index_profile',
          phase: 'ai_extraction',
          characterCount: combinedMarkdown.length,
          icon: 'document',
        });
        const distilled = await distillWithAI(
          cleanUrl,
          combinedMarkdown,
          this.llm,
          result.pageData?.videos
        );

        if (distilled) {
          // Merge colors and location from structured HTML extraction into the
          // AI-distilled result. The markdown the AI sees doesn't include
          // CSS-based colors or JSON data blobs — pageData has these reliably.
          const enriched = enrichFromStructuredData(distilled, result.pageData);

          cache.set(cleanUrl, {
            profile: enriched,
            markdownContent: combinedMarkdown,
            rawStructuredData: null,
            expiry: Date.now() + CACHE_TTL_MS,
          });
          context?.emitStage?.('persisting_result', {
            source: 'scrape_and_index_profile',
            phase: 'cache_distilled_profile',
            mode: 'distilled',
            icon: 'database',
          });

          // Record cooldown so the same URL isn't re-scraped within 12h
          await setScrapeCooldown(cleanUrl);

          const index = buildProfileIndex(enriched);

          return {
            success: true,
            data: {
              mode: 'distilled',
              profileType: index.profileType ?? 'athlete',
              platform: index.platform,
              url: cleanUrl,
              faviconUrl: result.pageData?.faviconUrl ?? null,
              index: index.summary,
              availableSections: index.availableSections,
              instructions:
                'Use `read_distilled_section` with the URL and a section name to fetch detailed data for each section. ' +
                'Then call the appropriate write tool for each section: ' +
                'write_core_identity, write_season_stats, write_combine_metrics, write_rankings, ' +
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
      context?.emitStage?.('persisting_result', {
        source: 'scrape_and_index_profile',
        phase: 'cache_raw_profile',
        mode: 'raw',
        icon: 'database',
      });

      // Record cooldown even for raw fallback — the page was still fetched
      await setScrapeCooldown(cleanUrl);

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
            'Use the atomic write tools (write_core_identity, write_season_stats, ' +
            'write_combine_metrics, write_rankings, write_athlete_videos, write_recruiting_activity, ' +
            'write_calendar_events) to write the extracted fields.',
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
