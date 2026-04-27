import type { AgentIdentifier } from '@nxt1/core';

type CoordinatorAgentId = Exclude<AgentIdentifier, 'router'>;

type ToolPattern = string;

function composeToolPatterns(
  ...groups: ReadonlyArray<readonly ToolPattern[]>
): readonly ToolPattern[] {
  const seen = new Set<ToolPattern>();
  const merged: ToolPattern[] = [];

  for (const group of groups) {
    for (const pattern of group) {
      if (seen.has(pattern)) continue;
      seen.add(pattern);
      merged.push(pattern);
    }
  }

  return merged;
}

const AGENT_TOOL_POLICY: Readonly<Record<CoordinatorAgentId, readonly ToolPattern[]>> = {
  admin_coordinator: [],

  brand_coordinator: composeToolPatterns([
    'generate_graphic',
    'get_college_logos',
    'get_conference_logos',
    'write_timeline_post',
    'analyze_video',
    'import_video',
    'clip_video',
    'generate_thumbnail',
    'get_video_details',
    'generate_captions',
    'create_signed_url',
    'enable_download',
    'manage_watermark',
    'delete_video',
    'runway_generate_video',
    'runway_edit_video',
    'runway_upscale_video',
    'runway_check_task',
  ]),

  data_coordinator: composeToolPatterns([
    'scrape_and_index_profile',
    'read_distilled_section',
    'dispatch_extraction',
    'write_core_identity',
    'write_awards',
    'write_combine_metrics',
    'write_rankings',
    'write_season_stats',
    'write_recruiting_activity',
    'write_calendar_events',
    'write_schedule',
    'write_team_stats',
    'write_team_news',
    'write_team_post',
    'write_timeline_post',
    'write_roster_entries',
    'write_athlete_videos',
    'write_connected_source',
    'scrape_twitter',
    'scrape_instagram',
    'search_memory',
    'save_memory',
    'search_apify_actors',
    'get_apify_actor_details',
    'call_apify_actor',
    'get_apify_actor_output',
  ]),

  performance_coordinator: composeToolPatterns([
    'scrape_and_index_profile',
    'read_distilled_section',
    'write_season_stats',
    'write_combine_metrics',
    'analyze_video',
    'get_video_details',
  ]),

  recruiting_coordinator: composeToolPatterns([
    'search_colleges',
    'search_college_coaches',
    'send_email',
    'gmail_*',
    'query_gmail_*',
    'create_gmail_*',
    'calendar_get_*',
    'create_calendar_*',
    'delete_calendar_*',
    'drive_*',
    'docs_*',
    'sheets_*',
    'get_presentation',
    'get_slides',
    'create_presentation',
    'create_slide',
    'add_text_to_slide',
    'add_formatted_text_to_slide',
    'add_bulleted_list_to_slide',
    'add_table_to_slide',
    'add_slide_notes',
    'duplicate_slide',
    'delete_slide',
    'create_presentation_from_markdown',
  ]),

  strategy_coordinator: composeToolPatterns([
    'get_analytics_summary',
    'list_recurring_tasks',
    'cancel_recurring_task',
    'get_video_details',
    'clip_video',
    'generate_thumbnail',
    'generate_captions',
    'enable_download',
    'manage_watermark',
    'import_video',
    'write_athlete_videos',
    'gmail_*',
    'query_gmail_*',
    'create_gmail_*',
    'calendar_get_*',
    'create_calendar_*',
    'delete_calendar_*',
    'drive_*',
    'docs_*',
    'sheets_*',
    'get_presentation',
    'get_slides',
    'create_presentation',
    'create_slide',
    'add_text_to_slide',
    'add_formatted_text_to_slide',
    'add_bulleted_list_to_slide',
    'add_table_to_slide',
    'add_slide_notes',
    'duplicate_slide',
    'delete_slide',
    'create_presentation_from_markdown',
  ]),
};

function matchesPattern(toolName: string, pattern: ToolPattern): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return toolName.startsWith(prefix);
  }
  return toolName === pattern;
}

export function isToolAllowedByPatterns(
  toolName: string,
  allowedToolPatterns: readonly ToolPattern[]
): boolean {
  return allowedToolPatterns.some((pattern) => matchesPattern(toolName, pattern));
}

export function getAgentToolPolicy(agentId: AgentIdentifier): readonly ToolPattern[] {
  if (agentId === 'router') return [];
  return AGENT_TOOL_POLICY[agentId];
}

export function getAllAgentToolPolicies(): Readonly<
  Record<CoordinatorAgentId, readonly ToolPattern[]>
> {
  return AGENT_TOOL_POLICY;
}
