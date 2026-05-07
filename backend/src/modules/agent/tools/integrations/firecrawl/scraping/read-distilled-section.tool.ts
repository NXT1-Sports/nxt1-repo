/**
 * @fileoverview Read Distilled Section Tool
 * @module @nxt1/backend/modules/agent/tools/integrations/firecrawl/scraping
 *
 * Agent X tool that reads a single section from a previously scraped and
 * distilled athlete profile. The agent calls `scrape_and_index_profile` first
 * to get the index, then calls this tool for each available section.
 *
 * This keeps the agent's context window clean — it only sees one focused
 * chunk of data at a time (e.g., just the season stats, or just the identity).
 */

import { BaseTool, type ToolResult } from '../../../base.tool.js';
import { getCachedScrapeResult } from './scrape-and-index-profile.tool.js';
import type { DistilledSectionKey } from './distillers/index.js';
import { z } from 'zod';

export class ReadDistilledSectionTool extends BaseTool {
  readonly name = 'read_distilled_section';

  readonly description =
    'Reads a specific section from a previously scraped athlete profile. ' +
    'You MUST call `scrape_and_index_profile` first to scrape and cache the data. ' +
    'Then call this tool with the URL and section name to get the detailed data.\n\n' +
    'Available sections: identity, academics, sportInfo, team, coach, metrics, ' +
    'seasonStats, schedule, recruiting, awards.\n\n' +
    'After reading a section, call the appropriate write tool:\n' +
    '- identity + academics + sportInfo + team + coach → write_core_identity\n' +
    '- awards → write_awards (root Awards collection — NOT write_core_identity)\n' +
    '- metrics → write_combine_metrics\n' +
    '- seasonStats → write_season_stats\n' +
    '- schedule → write_calendar_events\n' +
    '- recruiting → write_recruiting_activity';

  readonly parameters = z.object({
    url: z.string().trim().min(1),
    section: z.enum([
      'identity',
      'academics',
      'sportInfo',
      'team',
      'coach',
      'metrics',
      'seasonStats',
      'schedule',
      'recruiting',
      'awards',
    ]),
  });

  readonly isMutation = false;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const url = input['url'];
    const section = input['section'];

    if (typeof url !== 'string' || url.trim().length === 0) {
      return { success: false, error: 'Parameter "url" is required.' };
    }
    if (typeof section !== 'string' || section.trim().length === 0) {
      return { success: false, error: 'Parameter "section" is required.' };
    }

    const cached = getCachedScrapeResult(url.trim());
    if (!cached) {
      return {
        success: false,
        error:
          `No cached data found for URL "${url}". ` +
          'You must call `scrape_and_index_profile` first to scrape and cache the data.',
      };
    }

    const sectionKey = section.trim() as DistilledSectionKey;
    const { profile } = cached;

    const sectionMap: Record<DistilledSectionKey, unknown> = {
      identity: profile.identity,
      academics: profile.academics,
      sportInfo: profile.sportInfo,
      team: profile.team,
      coach: profile.coach,
      metrics: profile.metrics,
      seasonStats: profile.seasonStats,
      schedule: profile.schedule,
      videos: profile.videos,
      recruiting: profile.recruiting,
      awards: profile.awards,
      playbooks: profile.playbooks,
    };

    const data = sectionMap[sectionKey];

    if (data === undefined || data === null) {
      return {
        success: false,
        error: `Section "${section}" is not available for this profile. Check the index from scrape_and_index_profile.`,
      };
    }

    return {
      success: true,
      data: {
        platform: profile.platform,
        section: sectionKey,
        content: data,
      },
    };
  }
}
