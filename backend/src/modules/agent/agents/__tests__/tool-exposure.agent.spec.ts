import { describe, it, expect } from 'vitest';
import type { AgentSessionContext } from '@nxt1/core';
import { DataCoordinatorAgent } from '../data-coordinator.agent.js';
import { AdminCoordinatorAgent } from '../admin-coordinator.agent.js';
import { BrandCoordinatorAgent } from '../brand-coordinator.agent.js';
import { PerformanceCoordinatorAgent } from '../performance-coordinator.agent.js';
import { RecruitingCoordinatorAgent } from '../recruiting-coordinator.agent.js';
import { StrategyCoordinatorAgent } from '../strategy-coordinator.agent.js';
import { getEffectiveAgentToolPolicy, isToolAllowedByPatterns } from '../tool-policy.js';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';

function createMockContext(): AgentSessionContext {
  const now = new Date().toISOString();
  return {
    sessionId: 'test-session-001',
    userId: 'user-123',
    conversationHistory: [],
    createdAt: now,
    lastActiveAt: now,
  };
}

describe('Agent tool exposure regressions', () => {
  const context = createMockContext();

  it('keeps system-auto-included core/research tools out of per-coordinator policy', () => {
    const nonDataAgents = [
      new BrandCoordinatorAgent(),
      new PerformanceCoordinatorAgent(),
      new RecruitingCoordinatorAgent(),
      new StrategyCoordinatorAgent(),
    ];

    for (const agent of nonDataAgents) {
      const tools = agent.getAvailableTools();
      expect(tools).not.toContain('ask_user');
      expect(tools).not.toContain('search_web');
      expect(tools).not.toContain('scrape_webpage');
      expect(tools).not.toContain('list_google_workspace_tools');
      expect(tools).not.toContain('run_google_workspace_tool');
      expect(tools).not.toContain('schedule_recurring_task');
      expect(tools).not.toContain('search_nxt1_platform');
      expect(tools).not.toContain('query_nxt1_platform_data');
      expect(tools).not.toContain('list_nxt1_data_views');
      expect(tools).not.toContain('scan_timeline_posts');
      expect(tools).not.toContain('firecrawl_search_web');
      expect(tools).not.toContain('firecrawl_agent_research');
      expect(tools).not.toContain('map_website');
      expect(tools).not.toContain('extract_web_data');
      expect(tools).not.toContain('open_live_view');
      expect(tools).not.toContain('navigate_live_view');
      expect(tools).not.toContain('interact_with_live_view');
      expect(tools).not.toContain('read_live_view');
      expect(tools).not.toContain('capture_live_view_screenshot');
      expect(tools).not.toContain('extract_live_view_media');
      expect(tools).not.toContain('close_live_view');
    }

    const dataTools = new DataCoordinatorAgent().getAvailableTools();
    expect(dataTools).toContain('query_nxt1_data');
    expect(dataTools).toContain('list_nxt1_data_views');
    expect(dataTools).not.toContain('search_nxt1_platform');
    expect(dataTools).not.toContain('query_nxt1_platform_data');
    expect(dataTools).not.toContain('scan_timeline_posts');

    // Admin coordinator should now be policy-empty and rely entirely on system tools.
    expect(new AdminCoordinatorAgent().getAvailableTools()).toEqual([]);
  });

  it('keeps live-view capabilities out of per-coordinator policy after global system promotion', () => {
    const agents = [
      new DataCoordinatorAgent(),
      new BrandCoordinatorAgent(),
      new PerformanceCoordinatorAgent(),
      new RecruitingCoordinatorAgent(),
      new StrategyCoordinatorAgent(),
      new AdminCoordinatorAgent(),
    ];

    for (const agent of agents) {
      const tools = agent.getAvailableTools();
      expect(tools).not.toContain('open_live_view');
      expect(tools).not.toContain('navigate_live_view');
      expect(tools).not.toContain('interact_with_live_view');
      expect(tools).not.toContain('read_live_view');
      expect(tools).not.toContain('capture_live_view_screenshot');
      expect(tools).not.toContain('extract_live_view_media');
      expect(tools).not.toContain('close_live_view');
    }
  });

  it('exposes mapping and timeline posting tools to the data coordinator', () => {
    const agent = new DataCoordinatorAgent();

    expect(agent.getAvailableTools()).not.toContain('map_website');
    expect(agent.getAvailableTools()).toContain('list_firecrawl_monitors');
    expect(agent.getAvailableTools()).toContain('get_firecrawl_monitor');
    expect(agent.getAvailableTools()).toContain('write_firecrawl_monitor');
    expect(agent.getAvailableTools()).toContain('update_firecrawl_monitor');
    expect(agent.getAvailableTools()).toContain('delete_firecrawl_monitor');
    expect(agent.getAvailableTools()).toContain('get_firecrawl_monitor_check');
    expect(agent.getAvailableTools()).toContain('write_timeline_post');
    expect(agent.getAvailableTools()).toContain('write_team_post');
    expect(agent.getAvailableTools()).toContain('write_team_stats');
    expect(agent.getAvailableTools()).toContain('write_schedule');
    expect(agent.getAvailableTools()).toContain('write_rankings');
    expect(agent.getAvailableTools()).not.toContain('search_nxt1_platform');
    expect(agent.getAvailableTools()).not.toContain('query_nxt1_platform_data');
    expect(agent.getAvailableTools()).toContain('query_nxt1_data');
    expect(agent.getAvailableTools()).toContain('list_nxt1_data_views');
    expect(agent.getAvailableTools()).toContain('generate_chart_visualization');
    expect(agent.getAvailableTools()).toContain('render_pdf_pages');
    expect(agent.getAvailableTools()).not.toContain('firecrawl_agent_research');
  });

  it('teaches the data coordinator when to map deep pages and when to publish', () => {
    const agent = new DataCoordinatorAgent();
    const prompt = agent.getSystemPrompt(context);

    expect(prompt).toContain('Own linked-account monitoring workflows for connected sources');
    expect(prompt).toContain('present outcomes in clean product language');
    expect(prompt).toContain('### Step 0: Map Deep Pages When Needed');
    expect(prompt).toContain('call `map_website` FIRST');
    expect(prompt).toContain('`write_rankings`');
    expect(prompt).toContain('`write_team_stats`');
    expect(prompt).toContain('`write_team_post`');
    expect(prompt).toContain(
      'Use `write_timeline_post` ONLY for NXT1 user timeline/profile feed posts'
    );
    expect(prompt).toContain(
      'External social publishing is not wired yet. Do NOT use `write_timeline_post`'
    );
    expect(prompt).toContain(
      'If the user only uploads or attaches an image or video without explicitly asking to save it'
    );
    expect(prompt).toContain('First ask what they want to do with the file');
    expect(prompt).toContain(
      'Only when the user explicitly asks to add/upload/save attached videos to an athlete profile'
    );
    expect(prompt).toContain(
      'Only when the user explicitly asks to add/upload/save attached photos or images to an athlete profile'
    );
    expect(prompt).toContain('Do NOT call `stage_media` first for an already-attached video');
    expect(prompt).toContain('First call `analyze_image` with the attached image URL(s)');
    expect(prompt).toContain('source: "agent_x_upload"');
    expect(prompt).toContain('No timeline fallback for profile videos');
  });

  it('keeps brand coordinator focused on media generation and not direct publishing', () => {
    const agent = new BrandCoordinatorAgent();
    const prompt = agent.getSystemPrompt(context);

    expect(agent.getAvailableTools()).not.toContain('write_timeline_post');
    expect(agent.getAvailableTools()).not.toContain('update_timeline_post');
    expect(agent.getAvailableTools()).not.toContain('delete_timeline_post');
    expect(agent.getAvailableTools()).toContain('clip_video');
    expect(agent.getAvailableTools()).toContain('runway_generate_video');
    expect(prompt).toContain('Publishing is not part of the Brand Coordinator toolchain.');
    expect(prompt).toContain('Do not call timeline/team publishing tools from Brand.');
    expect(prompt).toContain('direct publishing to external networks such as Instagram');
    expect(prompt).toContain('Never say it was posted externally.');
    expect(prompt).toContain('## Internal Asset Fallback — MANDATORY Pre-Step');
    expect(prompt).toContain('query_nxt1_data');
    expect(prompt).toContain('user_profile_snapshot');
    expect(prompt).toContain('team_profile_snapshot');
    expect(prompt).toContain('organization_profile_snapshot');
    expect(prompt).toContain('resolvedBrandContext.organizationProfileSnapshot');
    expect(prompt).toContain('team_roster_members');
    expect(prompt).toContain('organization_roster_members');
    expect(prompt).toContain('profileImgs');
    expect(prompt).toContain('profile.profileImgs');
    expect(prompt).toContain('galleryImages');
    expect(prompt).toContain('analyze_image');
    expect(prompt).toContain('user_timeline_feed');
    expect(prompt).toContain('team_timeline_feed');
  });

  it('exposes Intel persistence to the performance coordinator', () => {
    const agent = new PerformanceCoordinatorAgent();

    expect(agent.getAvailableTools()).not.toContain('write_intel');
    expect(agent.getAvailableTools()).toContain('analyze_video');
    expect(agent.getAvailableTools()).toContain('analyze_image');
    expect(agent.getAvailableTools()).toContain('render_pdf_pages');
    expect(agent.getAvailableTools()).toContain('ffmpeg_burn_annotation');
    expect(agent.getAvailableTools()).toContain('ffmpeg_generate_thumbnail');
    expect(agent.getAvailableTools()).toContain('recommend_learning_videos');
    expect(agent.getAvailableTools()).toContain('get_video_details');
    expect(agent.getAvailableTools()).toContain('call_apify_actor');
    expect(agent.getAvailableTools()).toContain('stage_media');
    expect(agent.getAvailableTools()).toContain('list_film_reviews');
    expect(agent.getAvailableTools()).toContain('list_film_review_sources');
    expect(agent.getAvailableTools()).toContain('get_film_review_source_breakdown');
    expect(agent.getAvailableTools()).toContain('update_film_review_source_breakdown');
    expect(agent.getAvailableTools()).toContain('delete_film_review_source_breakdown');
    expect(agent.getAvailableTools()).toContain('get_film_review');
    expect(agent.getAvailableTools()).toContain('save_film_review');
    expect(agent.getAvailableTools()).toContain('update_film_review');
    expect(agent.getAvailableTools()).toContain('add_film_review_source');
    expect(agent.getAvailableTools()).toContain('update_film_review_source');
    expect(agent.getAvailableTools()).toContain('delete_film_review_source');
    expect(agent.getAvailableTools()).toContain('extract_film_review_clips');
    expect(agent.getAvailableTools()).toContain('extract_film_review_clips');
    expect(agent.getAvailableTools()).not.toContain('list_film_review_playlists');
    expect(agent.getAvailableTools()).not.toContain('move_film_review_to_playlist');
    expect(agent.getAvailableTools()).not.toContain('create_film_review_playlist');
    expect(agent.getAvailableTools()).not.toContain('update_film_review_playlist');
    expect(agent.getAvailableTools()).not.toContain('delete_film_review_playlist');
    expect(agent.getAvailableTools()).toContain('add_film_review_annotation');
    expect(agent.getAvailableTools()).toContain('import_video');
    expect(agent.getAvailableTools()).toContain('clip_video');
    expect(agent.getAvailableTools()).toContain('enable_download');
    expect(agent.getAvailableTools()).toContain('write_athlete_videos');
  });

  it('guides annotation burn before video for drawn film-review context', () => {
    const agent = new PerformanceCoordinatorAgent();
    const prompt = agent.getSystemPrompt(context);

    expect(prompt).toContain('Drawn-context requests are annotation-burn-first');
    expect(prompt).toContain('Call `ffmpeg_burn_annotation` before any video analysis.');
    expect(prompt).toContain('then call `analyze_video` on the annotated clip');
    expect(prompt).toContain('selected-context annotation geometry is the source of truth');
    expect(prompt).toContain('`annotation.bounds`, and `annotation.points`');
    expect(prompt).toContain('Do NOT start with `analyze_image` for drawn-context film review');
    expect(prompt).toContain('Do NOT revert to the old `analyze_image` + `analyze_video` chain');
    expect(prompt).toContain('shared film-review tag schema for that sport');
    expect(prompt).toContain('Do not invent football-only keys like `odk`, `down`, or `distance`');
    expect(prompt).toContain('returned `sportTagSchemaKey` and `sportTagSchema`');
  });

  it('exposes college database and workspace tooling to recruiting coordinator', () => {
    const agent = new RecruitingCoordinatorAgent();
    const tools = agent.getAvailableTools();

    expect(tools).toContain('search_colleges');
    expect(tools).toContain('search_college_coaches');
    expect(tools).toContain('recommend_learning_videos');
    expect(tools).toContain('render_pdf_pages');
    expect(tools).not.toContain('run_google_workspace_tool');
    expect(isToolAllowedByPatterns('query_gmail_emails', tools)).toBe(false);
  });

  it('teaches recruiting coordinator to use database-first research before web fallback', () => {
    const agent = new RecruitingCoordinatorAgent();
    const prompt = agent.getSystemPrompt(context);

    expect(prompt).toContain('## Database-First Research Policy (CRITICAL)');
    expect(prompt).toContain('search_colleges');
    expect(prompt).toContain('search_college_coaches');
    expect(prompt).toContain('search_web` only');
  });

  it('keeps strategy coordinator explicit and non-empty', () => {
    const agent = new StrategyCoordinatorAgent();

    expect(agent.getAvailableTools().length).toBeGreaterThan(0);
    expect(agent.getAvailableTools()).toContain('list_team_file_folders');
    expect(agent.getAvailableTools()).toContain('create_team_file_folder');
    expect(agent.getAvailableTools()).toContain('update_team_file_folder');
    expect(agent.getAvailableTools()).toContain('delete_team_file_folder');
    expect(agent.getAvailableTools()).toContain('move_universal_file_to_folder');
    expect(agent.getAvailableTools()).toContain('get_analytics_summary');
    expect(agent.getAvailableTools()).toContain('generate_chart_visualization');
    expect(agent.getAvailableTools()).toContain('render_pdf_pages');
    expect(agent.getAvailableTools()).toContain('create_play_diagram');
    expect(agent.getAvailableTools()).toContain('create_universal_team_document');
    expect(agent.getAvailableTools()).toContain('list_universal_team_documents');
    expect(agent.getAvailableTools()).toContain('get_universal_team_document');
    expect(agent.getAvailableTools()).toContain('update_universal_team_document');
    expect(agent.getAvailableTools()).toContain('delete_universal_team_document');
    expect(agent.getAvailableTools()).toContain('generate_practice_script');
    expect(agent.getAvailableTools()).toContain('list_film_reviews');
    expect(agent.getAvailableTools()).toContain('get_film_review');
    expect(agent.getAvailableTools()).toContain('save_film_review');
    expect(agent.getAvailableTools()).toContain('update_film_review');
    expect(agent.getAvailableTools()).toContain('delete_film_review');
    expect(agent.getAvailableTools()).not.toContain('list_film_review_playlists');
    expect(agent.getAvailableTools()).not.toContain('move_film_review_to_playlist');
    expect(agent.getAvailableTools()).not.toContain('create_film_review_playlist');
    expect(agent.getAvailableTools()).not.toContain('update_film_review_playlist');
    expect(agent.getAvailableTools()).not.toContain('delete_film_review_playlist');
    expect(agent.getAvailableTools()).toContain('refresh_film_review_ai');
    expect(agent.getAvailableTools()).toContain('analyze_video');
    expect(agent.getAvailableTools()).toContain('recommend_learning_videos');
    expect(agent.getAvailableTools()).not.toContain('write_intel');
    expect(agent.getAvailableTools()).not.toContain('firecrawl_agent_research');
    expect(agent.getAvailableTools()).not.toContain('schedule_recurring_task');
    expect(agent.getAvailableTools()).toContain('list_recurring_tasks');
    expect(agent.getAvailableTools()).toContain('cancel_recurring_task');
    expect(agent.getAvailableTools()).toContain('call_apify_actor');
    expect(agent.getAvailableTools()).toContain('get_apify_actor_details');
    expect(agent.getAvailableTools()).toContain('stage_media');
    expect(agent.getAvailableTools()).toContain('import_video');
    expect(agent.getAvailableTools()).toContain('enable_download');
  });

  it('teaches strategy coordinator to use real film analysis for video requests', () => {
    const agent = new StrategyCoordinatorAgent();
    const prompt = agent.getSystemPrompt(context);

    // Priority ladder covers all key paths
    expect(prompt).toContain('analyze_video');
    expect(prompt).toContain('recommend_learning_videos');
    expect(prompt).toContain('proactively include 3-5 recommended videos');
    expect(prompt).toContain('create_universal_team_document');
    expect(prompt).toContain('update_universal_team_document');
    expect(prompt).toContain('delete_universal_team_document');
    expect(prompt).toContain('generate_practice_script');
    expect(prompt).toContain('Team file library organization is part of your domain');
    expect(prompt).toContain('list_team_file_folders');
    expect(prompt).toContain('move_universal_file_to_folder');
    expect(prompt).toContain('do NOT say this belongs to a platform administrator');
    expect(prompt).toContain('list_universal_team_documents');
    expect(prompt).toContain('The film-review playlist system is retired for this workflow');
    expect(prompt).toContain('`list_universal_team_documents` is inspection-only');
    expect(prompt).toContain(
      'Never use `delete_playbook`, `delete_universal_team_document`, or film-review delete tools as a shortcut for folder cleanup'
    );
    expect(prompt).toContain(
      'Do not move any document until the target Team File folders have actually been created successfully'
    );
    expect(prompt).toContain(
      'persist it first with `create_universal_team_document` using `fileType: "practice_script"`, then optionally generate a PDF or document export'
    );
    expect(prompt).toContain('A PDF or document export is optional follow-on delivery');
    expect(prompt).toContain('save_film_review');
    expect(prompt).toContain('update_film_review');
    expect(prompt).toContain('extract_live_view_media');
    // extract_live_view_playlist is currently DISABLED
    expect(prompt).toContain('Firecrawl can scroll virtualized Hudl rows');
    expect(prompt).toContain('skipMediaPersistence: true');
    // import_video reserved for persistent editing
    expect(prompt).toContain('import_video');
    expect(prompt).toContain('timeRange');
    expect(prompt).toContain('batch up to 5');
    expect(prompt).toContain(
      'never claim the film-review breakdown table was updated unless you actually call `update_film_review_source_breakdown` or `update_film_review` with explicit `timeline` rows'
    );
    expect(prompt).toContain('update_film_review_source_breakdown');
    expect(prompt).toContain('delete_film_review_source_breakdown');
    expect(prompt).toContain('shared film-review tag schema for that sport');
    expect(prompt).toContain('Do not invent football-only keys like `odk`, `down`, or `distance`');
    expect(prompt).toContain('returned `sportTagSchemaKey` and `sportTagSchema`');
  });

  it('exposes live-view extraction tools in the effective runtime policy for film coordinators', () => {
    const performanceTools = getEffectiveAgentToolPolicy('performance_coordinator');
    const strategyTools = getEffectiveAgentToolPolicy('strategy_coordinator');

    expect(performanceTools).toContain('open_live_view');
    expect(performanceTools).toContain('capture_live_view_screenshot');
    expect(performanceTools).toContain('extract_live_view_media');
    // extract_live_view_playlist is currently DISABLED
    expect(performanceTools).toContain('analyze_video');
    expect(performanceTools).toContain('stage_media');
    expect(performanceTools).toContain('save_film_review');
    expect(performanceTools).toContain('update_film_review');
    expect(performanceTools).toContain('update_film_review_source_breakdown');
    expect(performanceTools).toContain('delete_film_review_source_breakdown');

    expect(strategyTools).toContain('open_live_view');
    expect(strategyTools).toContain('capture_live_view_screenshot');
    expect(strategyTools).toContain('extract_live_view_media');
    // extract_live_view_playlist is currently DISABLED
    expect(strategyTools).toContain('analyze_video');
    expect(strategyTools).toContain('stage_media');
    expect(strategyTools).toContain('save_film_review');
    expect(strategyTools).toContain('update_film_review');
    expect(strategyTools).toContain('update_film_review_source_breakdown');
    expect(strategyTools).toContain('delete_film_review_source_breakdown');
  });

  it('exposes Microsoft 365 system wrappers in effective policy for all coordinators', () => {
    for (const agentId of COORDINATOR_AGENT_IDS) {
      const tools = getEffectiveAgentToolPolicy(agentId);
      expect(tools).toContain('list_microsoft_365_tools');
      expect(tools).toContain('run_microsoft_365_tool');
    }
  });

  it('exposes shared persistence tools in effective policy for all coordinators', () => {
    for (const agentId of COORDINATOR_AGENT_IDS) {
      const tools = getEffectiveAgentToolPolicy(agentId);
      expect(tools).toContain('track_analytics_event');
      expect(tools).toContain('get_analytics_summary');
      expect(tools).toContain('save_memory');
      expect(tools).toContain('recommend_learning_videos');
    }
  });

  it('keeps Google Workspace limited to email sending for the router policy', () => {
    const routerTools = getEffectiveAgentToolPolicy('router');

    expect(routerTools).toContain('search_colleges');
    expect(routerTools).toContain('search_college_coaches');
    expect(routerTools).not.toContain('open_live_view');
    expect(routerTools).not.toContain('create_universal_team_document');
    expect(routerTools).not.toContain('write_playbooks');
    expect(routerTools).not.toContain('create_play_diagram');
    expect(isToolAllowedByPatterns('send_email', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('batch_send_email', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('send_email_via_nxt1', routerTools)).toBe(false);
    expect(isToolAllowedByPatterns('batch_send_email_via_nxt1', routerTools)).toBe(false);
    expect(isToolAllowedByPatterns('gmail_send_email', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('query_gmail_emails', routerTools)).toBe(false);
    expect(isToolAllowedByPatterns('calendar_get_events', routerTools)).toBe(false);
    expect(isToolAllowedByPatterns('drive_search_files', routerTools)).toBe(false);
    expect(isToolAllowedByPatterns('docs_create_document', routerTools)).toBe(false);
    expect(isToolAllowedByPatterns('sheets_create_spreadsheet', routerTools)).toBe(false);
    expect(isToolAllowedByPatterns('create_presentation_from_markdown', routerTools)).toBe(false);
  });

  it('supports wildcard matching beyond simple prefix-only patterns', () => {
    expect(isToolAllowedByPatterns('run_google_workspace_tool', ['*google_workspace*'])).toBe(true);
    expect(isToolAllowedByPatterns('calendar_get_events', ['*get_*'])).toBe(true);
    expect(isToolAllowedByPatterns('drive_upload_file', ['*upload*'])).toBe(true);
    expect(isToolAllowedByPatterns('analyze_video', ['*upload*'])).toBe(false);
  });

  it('enforces ask-user decision matrix language across coordinator prompts', () => {
    const dataCoordinatorPrompt = new DataCoordinatorAgent().getSystemPrompt(context);
    expect(dataCoordinatorPrompt).toContain('query_nxt1_platform_data');
    expect(dataCoordinatorPrompt).toContain('search_nxt1_platform');
    expect(dataCoordinatorPrompt).not.toContain('query_platform_data');
    expect(dataCoordinatorPrompt).not.toContain('search_platform_registry');

    const prompts = [
      dataCoordinatorPrompt,
      new BrandCoordinatorAgent().getSystemPrompt(context),
      new PerformanceCoordinatorAgent().getSystemPrompt(context),
      new RecruitingCoordinatorAgent().getSystemPrompt(context),
      new StrategyCoordinatorAgent().getSystemPrompt(context),
      new AdminCoordinatorAgent().getSystemPrompt(context),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain('## Ask User Decision Matrix (CRITICAL)');
      expect(prompt).toContain('Call `ask_user` when required fields are missing');
      expect(prompt).toContain(
        'Do NOT call `ask_user` for data already present in task context, prior tool results, or deterministic lookups.'
      );
      expect(prompt).toContain('For low-risk read/processing steps, proceed without asking');
      expect(prompt).toContain('## Shared Persistence Contract (CRITICAL)');
      expect(prompt).toContain('call `save_memory` immediately');
      expect(prompt).toContain('call `track_analytics_event` before your final reply');
      expect(prompt).toContain('retrieve it with `get_analytics_summary` instead of guessing');
    }
  });
});
