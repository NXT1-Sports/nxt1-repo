import type { AgentIdentifier } from '@nxt1/core';

type CoordinatorAgentId = Exclude<AgentIdentifier, 'router'>;

type ToolPattern = string;

export interface ToolGovernancePolicy {
  readonly globalSystem: readonly ToolPattern[];
  readonly router: readonly ToolPattern[];
  readonly coordinatorSpecialized: Readonly<Record<CoordinatorAgentId, readonly ToolPattern[]>>;
  readonly internalOnly: readonly string[];
}

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

const GLOBAL_SYSTEM_TOOL_POLICY: readonly ToolPattern[] = composeToolPatterns([
  'send_email',
  'batch_send_email',
  'create_support_ticket',
  'delegate_task',
  'track_analytics_event',
  'search_memory',
  'search_memories',
  'get_recent_sync_summaries',
  'delete_memory',
  'dynamic_export',
  'ask_user',
  'search_web',
  'scrape_webpage',
  'open_live_view',
  'navigate_live_view',
  'interact_with_live_view',
  'read_live_view',
  'extract_live_view_media',
  'extract_live_view_playlist',
  'close_live_view',
  'schedule_recurring_task',
  'list_google_workspace_tools',
  'run_google_workspace_tool',
  'list_microsoft_365_tools',
  'run_microsoft_365_tool',
  'search_nxt1_platform',
  'query_nxt1_platform_data',
  'list_nxt1_data_views',
  'query_nxt1_data',
  'scan_timeline_posts',
  'write_intel',
  'update_intel',
  'firecrawl_search_web',
  'firecrawl_agent_research',
  'map_website',
  'extract_web_data',
]);

/**
 * Explicit tool policy for the Primary Agent (wire id: 'router').
 * This is the single source of truth for what the Primary is allowed to expose
 * to the model and execute at runtime. It mirrors PRIMARY_FAST_PATH_TOOLS in
 * primary.agent.ts — that constant now derives directly from this policy.
 *
 * System-category tools (delegate_to_coordinator, plan_and_execute,
 * whoami_capabilities, delegate_task) bypass policy checks in BaseAgent and
 * are always available regardless of this list.
 */
const ROUTER_TOOL_POLICY: readonly ToolPattern[] = [
  // Lazy context (Tier B)
  'get_user_profile',
  'get_active_threads',
  'get_other_thread_history',
  'get_recent_sync_summaries',
  'search_memory',
  'search_memories',
  // Read-only data lookup — Primary calls these directly for factual questions
  // to avoid hallucination. Delegating a simple lookup to a coordinator adds
  // latency without value.
  'search_nxt1_platform',
  'query_nxt1_platform_data',
  'list_nxt1_data_views',
  'query_nxt1_data',
  'search_colleges',
  'search_college_coaches',
  'search_web',
  'firecrawl_search_web',
  'scrape_webpage',
  'map_website',
  'extract_web_data',
  'open_live_view',
  'read_live_view',
  'close_live_view',
  'get_college_logos',
  'get_conference_logos',
  'get_analytics_summary',
  'scan_timeline_posts',
  'list_google_workspace_tools',
  'run_google_workspace_tool',
  'send_email',
  'batch_send_email',
  // Direct Google Workspace families (loosened to prevent false-negative
  // blocks when the model emits concrete tool names instead of wrappers).
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
  'list_microsoft_365_tools',
  'run_microsoft_365_tool',
];

const INTERNAL_ONLY_TOOL_POLICY: readonly string[] = [
  'delegate_to_coordinator',
  'get_active_threads',
  'get_other_thread_history',
  'get_user_profile',
  'plan_and_execute',
  'whoami_capabilities',
];

const AGENT_TOOL_POLICY: Readonly<Record<CoordinatorAgentId, readonly ToolPattern[]>> = {
  admin_coordinator: [],

  brand_coordinator: composeToolPatterns([
    'generate_graphic',
    'stage_media',
    'get_college_logos',
    'get_conference_logos',
    'write_timeline_post',
    'update_timeline_post',
    'delete_timeline_post',
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
    'ffmpeg_trim_video',
    'ffmpeg_merge_videos',
    'ffmpeg_resize_video',
    'ffmpeg_add_text_overlay',
    'ffmpeg_burn_subtitles',
    'ffmpeg_generate_thumbnail',
    'ffmpeg_convert_video',
    'ffmpeg_compress_video',
  ]),

  data_coordinator: composeToolPatterns([
    'scrape_and_index_profile',
    'read_distilled_section',
    'dispatch_extraction',
    'write_core_identity',
    'update_core_identity',
    'delete_core_identity',
    'write_awards',
    'update_awards',
    'delete_awards',
    'write_combine_metrics',
    'update_combine_metrics',
    'delete_combine_metrics',
    'write_rankings',
    'update_rankings',
    'delete_rankings',
    'write_season_stats',
    'update_season_stats',
    'delete_season_stats',
    'write_recruiting_activity',
    'update_recruiting_activity',
    'delete_recruiting_activity',
    'write_calendar_events',
    'update_calendar_events',
    'delete_calendar_events',
    'write_schedule',
    'update_schedule_event',
    'delete_schedule_event',
    'write_team_stats',
    'update_team_stats',
    'delete_team_stats',
    'write_team_news',
    'update_team_news',
    'delete_team_news',
    'write_team_post',
    'update_team_post',
    'delete_team_post',
    'write_timeline_post',
    'update_timeline_post',
    'delete_timeline_post',
    'write_roster_entries',
    'update_roster_entries',
    'delete_roster_entries',
    'write_athlete_videos',
    'update_athlete_videos',
    'delete_athlete_videos',
    'write_intel',
    'update_intel',
    'delete_intel',
    'write_connected_source',
    'update_connected_source',
    'delete_connected_source',
    'scrape_twitter',
    'scrape_instagram',
    'save_memory',
    'search_apify_actors',
    'get_apify_actor_details',
    'call_apify_actor',
    'get_apify_actor_output',
    'stage_media',
    'ffmpeg_trim_video',
    'ffmpeg_generate_thumbnail',
  ]),

  performance_coordinator: composeToolPatterns([
    'scrape_and_index_profile',
    'read_distilled_section',
    'write_season_stats',
    'update_season_stats',
    'delete_season_stats',
    'write_combine_metrics',
    'write_schedule',
    'update_schedule_event',
    'delete_schedule_event',
    'analyze_video',
    'get_video_details',
    'search_apify_actors',
    'get_apify_actor_details',
    'call_apify_actor',
    'get_apify_actor_output',
    'import_video',
    'enable_download',
    'ffmpeg_trim_video',
    'ffmpeg_merge_videos',
    'ffmpeg_resize_video',
    'ffmpeg_generate_thumbnail',
    'ffmpeg_convert_video',
    'ffmpeg_compress_video',
    'ffmpeg_burn_subtitles',
  ]),

  recruiting_coordinator: composeToolPatterns([
    'search_colleges',
    'search_college_coaches',
    'stage_media',
    'write_recruiting_activity',
    'update_recruiting_activity',
    'delete_recruiting_activity',
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
    'list_microsoft_365_tools',
    'run_microsoft_365_tool',
    'analyze_video',
    'get_video_details',
    'search_apify_actors',
    'get_apify_actor_details',
    'call_apify_actor',
    'get_apify_actor_output',
    'stage_media',
    'clip_video',
    'generate_thumbnail',
    'generate_captions',
    'enable_download',
    'manage_watermark',
    'import_video',
    'write_athlete_videos',
    'ffmpeg_trim_video',
    'ffmpeg_merge_videos',
    'ffmpeg_resize_video',
    'ffmpeg_add_text_overlay',
    'ffmpeg_burn_subtitles',
    'ffmpeg_generate_thumbnail',
    'ffmpeg_convert_video',
    'ffmpeg_compress_video',
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
  if (!pattern.includes('*')) {
    return toolName === pattern;
  }

  // Support glob-style wildcard matching anywhere in the pattern, not just
  // trailing prefix wildcards. This keeps existing prefix behavior intact but
  // also handles future naming variants without policy churn.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(toolName);
}

export function isToolAllowedByPatterns(
  toolName: string,
  allowedToolPatterns: readonly ToolPattern[]
): boolean {
  return allowedToolPatterns.some((pattern) => matchesPattern(toolName, pattern));
}

export function getAgentToolPolicy(agentId: AgentIdentifier): readonly ToolPattern[] {
  if (agentId === 'router') return ROUTER_TOOL_POLICY;
  return AGENT_TOOL_POLICY[agentId];
}

export function getEffectiveAgentToolPolicy(agentId: AgentIdentifier): readonly ToolPattern[] {
  if (agentId === 'router') return ROUTER_TOOL_POLICY;
  return composeToolPatterns(GLOBAL_SYSTEM_TOOL_POLICY, AGENT_TOOL_POLICY[agentId]);
}

/** Returns the explicit tool policy for the Primary Agent (wire id: 'router'). */
export function getRouterToolPolicy(): readonly ToolPattern[] {
  return ROUTER_TOOL_POLICY;
}

export function getAllAgentToolPolicies(): Readonly<
  Record<CoordinatorAgentId, readonly ToolPattern[]>
> {
  return AGENT_TOOL_POLICY;
}

export function getGlobalSystemToolPolicy(): readonly ToolPattern[] {
  return GLOBAL_SYSTEM_TOOL_POLICY;
}

export function getInternalOnlyToolPolicy(): readonly string[] {
  return INTERNAL_ONLY_TOOL_POLICY;
}

export function getToolGovernancePolicy(): ToolGovernancePolicy {
  return {
    globalSystem: GLOBAL_SYSTEM_TOOL_POLICY,
    router: ROUTER_TOOL_POLICY,
    coordinatorSpecialized: AGENT_TOOL_POLICY,
    internalOnly: INTERNAL_ONLY_TOOL_POLICY,
  };
}

export function isToolClassified(toolName: string): boolean {
  if (INTERNAL_ONLY_TOOL_POLICY.includes(toolName)) {
    return true;
  }

  if (isToolAllowedByPatterns(toolName, GLOBAL_SYSTEM_TOOL_POLICY)) {
    return true;
  }

  return Object.values(AGENT_TOOL_POLICY).some((patterns) =>
    isToolAllowedByPatterns(toolName, patterns)
  );
}

export function getAllGovernedToolPatterns(): readonly ToolPattern[] {
  return composeToolPatterns(GLOBAL_SYSTEM_TOOL_POLICY, ...Object.values(AGENT_TOOL_POLICY));
}
