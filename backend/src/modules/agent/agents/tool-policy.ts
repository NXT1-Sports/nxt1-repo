import type { AgentIdentifier } from '@nxt1/core';
import { isToolDisabled } from '../config/agent-app-config.js';

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
  'get_analytics_summary',
  'search_memory',
  'search_memories',
  'save_memory',
  'get_recent_sync_summaries',
  'delete_memory',
  'dynamic_export',
  'render_html_pdf',
  'execute_python_code',
  'recommend_learning_videos',
  'ask_user',
  'search_web',
  'scrape_webpage',
  'open_live_view',
  'navigate_live_view',
  'interact_with_live_view',
  'read_live_view',
  'capture_live_view_screenshot',
  'extract_live_view_media',
  // 'extract_live_view_playlist', // DISABLED: Not yet stable
  'close_live_view',
  'schedule_recurring_task',
  'update_recurring_task',
  'list_recurring_tasks',
  'list_microsoft_365_tools',
  'run_microsoft_365_tool',
  'list_google_workspace_tools',
  'run_google_workspace_tool',
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
  // Media routing utilities — available to all agents
  'classify_media_url',
  'extract_page_images',
  'extract_hudl_video',
]);

/**
 * Explicit tool policy for the Primary Agent (wire id: 'router').
 * This is the single source of truth for what the Primary is allowed to expose
 * to the model and execute at runtime. It mirrors PRIMARY_FAST_PATH_TOOLS in
 * primary.agent.ts — that constant now derives directly from this policy.
 *
 * System-category tools (delegate_to_coordinator, create_plan,
 * execute_saved_plan, plan_and_execute, whoami_capabilities, delegate_task)
 * bypass policy checks in BaseAgent and are always available regardless of
 * this list.
 */
const ROUTER_TOOL_POLICY: readonly ToolPattern[] = [
  'create_universal_team_document',
  'list_universal_team_documents',
  'get_universal_team_document',
  'update_universal_team_document',
  'delete_universal_team_document',
  // Lazy context (Tier B)
  'get_user_profile',
  'get_active_threads',
  'get_other_thread_history',
  'get_recent_sync_summaries',
  'search_memory',
  'search_memories',
  'save_memory',
  // Read-only data lookup — Primary calls these directly for factual questions
  // to avoid hallucination. Delegating a simple lookup to a coordinator adds
  // latency without value.
  'search_nxt1_platform',
  'query_nxt1_platform_data',
  'list_nxt1_data_views',
  'query_nxt1_data',
  'execute_sandbox_script',
  'execute_python_code',
  'search_colleges',
  'search_college_coaches',
  'list_firecrawl_monitors',
  'get_firecrawl_monitor',
  'get_firecrawl_monitor_check',
  'read_live_view',
  'capture_live_view_screenshot',
  'close_live_view',
  'parse_document',
  'enrich_document_notes',
  'render_pdf_pages',
  'analyze_image',
  'recommend_learning_videos',
  'get_analytics_summary',
  'generate_chart_visualization',
  'list_team_file_folders',
  'create_team_file_folder',
  'update_team_file_folder',
  'delete_team_file_folder',
  'move_universal_file_to_folder',
  'dynamic_export',
  'render_html_pdf',
  'track_analytics_event',
  'scan_timeline_posts',
  'list_recurring_tasks',
  'send_email',
  'batch_send_email',
  // Google Workspace is limited to email workflows for now; broader Docs/
  // Sheets/Slides/Drive actions are intentionally not exposed.
  'gmail_send_email',
  'list_microsoft_365_tools',
  'run_microsoft_365_tool',
];

const UNIVERSAL_TEAM_DOCUMENT_TOOL_POLICY: readonly ToolPattern[] = [
  'create_universal_team_document',
  'list_universal_team_documents',
  'get_universal_team_document',
  'update_universal_team_document',
  'delete_universal_team_document',
];

const TEAM_FILE_FOLDER_TOOL_POLICY: readonly ToolPattern[] = [
  'list_team_file_folders',
  'create_team_file_folder',
  'update_team_file_folder',
  'delete_team_file_folder',
  'move_universal_file_to_folder',
];

const INTERNAL_ONLY_TOOL_POLICY: readonly string[] = [
  'delegate_to_coordinator',
  'create_plan',
  'execute_saved_plan',
  'get_active_threads',
  'get_other_thread_history',
  'get_user_profile',
  'plan_and_execute',
  'whoami_capabilities',
];

const AGENT_TOOL_POLICY: Readonly<Record<CoordinatorAgentId, readonly ToolPattern[]>> = {
  admin_coordinator: ['render_html_pdf', 'execute_python_code'],

  brand_coordinator: composeToolPatterns(
    UNIVERSAL_TEAM_DOCUMENT_TOOL_POLICY,
    TEAM_FILE_FOLDER_TOOL_POLICY,
    [
      'render_html_pdf',
      'parse_document',
      'render_pdf_pages',
      'generate_graphic',
      'stage_media',
      'get_college_logos',
      'get_conference_logos',
      'analyze_image',
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
      // Social media video acquisition (tweets, posts with embedded video)
      'scrape_twitter',
      'scrape_instagram',
      'query_nxt1_data',
      // Apify — for platforms where scrape_twitter is insufficient or for IG video
      'search_apify_actors',
      'get_apify_actor_details',
      'call_apify_actor',
      'get_apify_actor_output',
      'runway_generate_video',
      'runway_upscale_video',
      'runway_check_task',
      'ffmpeg_trim_video',
      'ffmpeg_merge_videos',
      'ffmpeg_resize_video',
      'ffmpeg_burn_annotation',
      'ffmpeg_add_text_overlay',
      'ffmpeg_burn_subtitles',
      'ffmpeg_generate_thumbnail',
      'ffmpeg_convert_video',
      'ffmpeg_compress_video',
    ]
  ),

  data_coordinator: composeToolPatterns(
    UNIVERSAL_TEAM_DOCUMENT_TOOL_POLICY,
    TEAM_FILE_FOLDER_TOOL_POLICY,
    [
      'render_html_pdf',
      'parse_document',
      'enrich_document_notes',
      'render_pdf_pages',
      'get_analytics_summary',
      'scrape_and_index_profile',
      'read_distilled_section',
      'dispatch_extraction',
      'list_firecrawl_monitors',
      'get_firecrawl_monitor',
      'write_firecrawl_monitor',
      'update_firecrawl_monitor',
      'delete_firecrawl_monitor',
      'get_firecrawl_monitor_check',
      'list_nxt1_data_views',
      'query_nxt1_data',
      'mutate_nxt1_data',
      'execute_sandbox_script',
      'execute_python_code',
      'write_core_identity',
      'update_core_identity',
      'delete_core_identity',
      'write_awards',
      'write_combine_metrics',
      'write_rankings',
      'write_season_stats',
      'write_recruiting_activity',
      'write_calendar_events',
      'write_schedule',
      'write_team_stats',
      'write_team_post',
      'update_team_post',
      'delete_team_post',
      'write_timeline_post',
      'update_timeline_post',
      'delete_timeline_post',
      'write_roster_entries',
      'write_athlete_videos',
      'update_athlete_videos',
      'delete_athlete_videos',
      'write_athlete_images',
      'write_intel',
      'update_intel',
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
      'analyze_video',
      'analyze_image',
      'generate_chart_visualization',
      'ffmpeg_trim_video',
      'ffmpeg_generate_thumbnail',
    ]
  ),

  performance_coordinator: composeToolPatterns(
    UNIVERSAL_TEAM_DOCUMENT_TOOL_POLICY,
    TEAM_FILE_FOLDER_TOOL_POLICY,
    [
      'render_html_pdf',
      'parse_document',
      'render_pdf_pages',
      'scrape_and_index_profile',
      'read_distilled_section',
      'write_season_stats',
      'mutate_nxt1_data',
      'write_combine_metrics',
      'write_schedule',
      'stage_media',
      'analyze_video',
      'execute_sandbox_script',
      'execute_python_code',
      'generate_chart_visualization',
      'analyze_film_review_sources',
      'analyze_film_review_source_breakdowns',
      'list_film_reviews',
      'list_film_review_sources',
      'get_film_review_source_breakdown',
      'search_film_review_breakdown_rows',
      'patch_film_review_source_breakdowns',
      'update_film_review_source_breakdown',
      'delete_film_review_source_breakdown',
      'get_film_review',
      'save_film_review',
      'update_film_review',
      'delete_film_review',
      'add_film_review_source',
      'update_film_review_source',
      'delete_film_review_source',
      'extract_film_review_clips',
      'add_film_review_annotation',
      'delete_film_review_annotation',
      'refresh_film_review_ai',
      'recommend_learning_videos',
      'analyze_image',
      'clip_video',
      'get_video_details',
      'search_apify_actors',
      'get_apify_actor_details',
      'call_apify_actor',
      'get_apify_actor_output',
      'import_video',
      'enable_download',
      'write_athlete_videos',
      'ffmpeg_trim_video',
      'ffmpeg_merge_videos',
      'ffmpeg_resize_video',
      'ffmpeg_burn_annotation',
      'ffmpeg_generate_thumbnail',
      'ffmpeg_convert_video',
      'ffmpeg_compress_video',
      'ffmpeg_burn_subtitles',
      'write_athlete_images',
    ]
  ),

  recruiting_coordinator: composeToolPatterns(
    UNIVERSAL_TEAM_DOCUMENT_TOOL_POLICY,
    TEAM_FILE_FOLDER_TOOL_POLICY,
    [
      'render_html_pdf',
      'execute_python_code',
      'parse_document',
      'render_pdf_pages',
      'analyze_image',
      'search_colleges',
      'search_college_coaches',
      'recommend_learning_videos',
      'stage_media',
      'write_recruiting_activity',
      'send_email',
      'gmail_send_email',
    ]
  ),

  strategy_coordinator: composeToolPatterns(
    UNIVERSAL_TEAM_DOCUMENT_TOOL_POLICY,
    TEAM_FILE_FOLDER_TOOL_POLICY,
    [
      'render_html_pdf',
      'parse_document',
      'enrich_document_notes',
      'render_pdf_pages',
      'get_analytics_summary',
      'generate_chart_visualization',
      'execute_sandbox_script',
      'execute_python_code',
      'create_play_diagram',
      'create_board_diagram',
      'update_board_diagram',
      'delete_board_diagram',
      'list_film_reviews',
      'list_film_review_sources',
      'get_film_review_source_breakdown',
      'search_film_review_breakdown_rows',
      'patch_film_review_source_breakdowns',
      'update_film_review_source_breakdown',
      'delete_film_review_source_breakdown',
      'get_film_review',
      'save_film_review',
      'update_film_review',
      'delete_film_review',
      'add_film_review_source',
      'update_film_review_source',
      'delete_film_review_source',
      'extract_film_review_clips',
      'add_film_review_annotation',
      'delete_film_review_annotation',
      'refresh_film_review_ai',
      'list_recurring_tasks',
      'update_recurring_task',
      'cancel_recurring_task',
      'list_microsoft_365_tools',
      'run_microsoft_365_tool',
      'analyze_video',
      'recommend_learning_videos',
      'analyze_image',
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
      'write_athlete_images',
      'ffmpeg_trim_video',
      'ffmpeg_merge_videos',
      'ffmpeg_resize_video',
      'ffmpeg_burn_annotation',
      'ffmpeg_add_text_overlay',
      'ffmpeg_burn_subtitles',
      'ffmpeg_generate_thumbnail',
      'ffmpeg_convert_video',
      'ffmpeg_compress_video',
      'gmail_send_email',
    ]
  ),
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

function filterDisabledToolPatterns(patterns: readonly ToolPattern[]): readonly ToolPattern[] {
  return patterns.filter((pattern) => pattern.includes('*') || !isToolDisabled(pattern));
}

export function getAgentToolPolicy(agentId: AgentIdentifier): readonly ToolPattern[] {
  if (agentId === 'router') return filterDisabledToolPatterns(ROUTER_TOOL_POLICY);
  return filterDisabledToolPatterns(AGENT_TOOL_POLICY[agentId]);
}

export function getEffectiveAgentToolPolicy(agentId: AgentIdentifier): readonly ToolPattern[] {
  if (agentId === 'router') return filterDisabledToolPatterns(ROUTER_TOOL_POLICY);
  return filterDisabledToolPatterns(
    composeToolPatterns(GLOBAL_SYSTEM_TOOL_POLICY, AGENT_TOOL_POLICY[agentId])
  );
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
