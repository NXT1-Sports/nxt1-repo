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
    expect(agent.getAvailableTools()).not.toContain('firecrawl_agent_research');
  });

  it('teaches the data coordinator when to map deep pages and when to publish', () => {
    const agent = new DataCoordinatorAgent();
    const prompt = agent.getSystemPrompt(context);

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
      'When the user asks to add/upload/save attached videos to an athlete profile'
    );
    expect(prompt).toContain('Do NOT call `stage_media` first for an already-attached video');
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
    expect(agent.getAvailableTools()).toContain('ffmpeg_generate_thumbnail');
    expect(agent.getAvailableTools()).toContain('recommend_learning_videos');
    expect(agent.getAvailableTools()).toContain('get_video_details');
    expect(agent.getAvailableTools()).toContain('call_apify_actor');
    expect(agent.getAvailableTools()).toContain('stage_media');
    expect(agent.getAvailableTools()).toContain('list_film_reviews');
    expect(agent.getAvailableTools()).toContain('get_film_review');
    expect(agent.getAvailableTools()).toContain('save_film_review');
    expect(agent.getAvailableTools()).toContain('update_film_review');
    expect(agent.getAvailableTools()).toContain('add_film_review_annotation');
    expect(agent.getAvailableTools()).toContain('import_video');
    expect(agent.getAvailableTools()).toContain('clip_video');
    expect(agent.getAvailableTools()).toContain('enable_download');
    expect(agent.getAvailableTools()).toContain('write_athlete_videos');
  });

  it('guides still-frame image grounding before video for drawn film-review context', () => {
    const agent = new PerformanceCoordinatorAgent();
    const prompt = agent.getSystemPrompt(context);

    expect(prompt).toContain('Drawn-context requests are image-first');
    expect(prompt).toContain(
      'call `ffmpeg_generate_thumbnail` on the clip/video URL BEFORE any video analysis'
    );
    expect(prompt).toContain('Then call `analyze_image` on the returned `imageUrl`');
    expect(prompt).toContain('find the user-drawn light-green annotation stroke/circle first');
    expect(prompt).toContain('do NOT go straight to `analyze_video`');
    expect(prompt).toContain('marked-frame timestamp/currentTimeSec');
    expect(prompt).toContain('otherwise use the midpoint of the play window');
    expect(prompt).not.toContain(
      'pass `cropBounds` from the video-frame normalized annotation bounds'
    );
    expect(prompt).toContain('A generated FFmpeg thumbnail is a raw video frame');
    expect(prompt).toContain(
      'Use the resolved sport context from the thread/request for every image prompt'
    );
    expect(prompt).toContain('Never inject a sport that is not explicitly resolved in context');
    expect(prompt).toContain(
      'Never claim a jersey color, number, position, or identity unless it is visible inside the marked bounds'
    );
    expect(prompt).toContain('video-frame normalized bounds');
  });

  it('exposes college database and workspace tooling to recruiting coordinator', () => {
    const agent = new RecruitingCoordinatorAgent();
    const tools = agent.getAvailableTools();

    expect(tools).toContain('search_colleges');
    expect(tools).toContain('search_college_coaches');
    expect(tools).toContain('recommend_learning_videos');
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
    expect(agent.getAvailableTools()).toContain('get_analytics_summary');
    expect(agent.getAvailableTools()).toContain('generate_chart_visualization');
    expect(agent.getAvailableTools()).toContain('create_play_diagram');
    expect(agent.getAvailableTools()).toContain('save_gameplan');
    expect(agent.getAvailableTools()).toContain('write_callsheet');
    expect(agent.getAvailableTools()).toContain('list_callsheets');
    expect(agent.getAvailableTools()).toContain('get_callsheet');
    expect(agent.getAvailableTools()).toContain('list_practice_scripts');
    expect(agent.getAvailableTools()).toContain('get_practice_script');
    expect(agent.getAvailableTools()).toContain('write_practice_script');
    expect(agent.getAvailableTools()).toContain('update_practice_script');
    expect(agent.getAvailableTools()).toContain('delete_practice_script');
    expect(agent.getAvailableTools()).toContain('generate_practice_script');
    expect(agent.getAvailableTools()).toContain('list_film_reviews');
    expect(agent.getAvailableTools()).toContain('get_film_review');
    expect(agent.getAvailableTools()).toContain('save_film_review');
    expect(agent.getAvailableTools()).toContain('update_film_review');
    expect(agent.getAvailableTools()).toContain('delete_film_review');
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
    expect(prompt).toContain('save_gameplan');
    expect(prompt).toContain('write_callsheet');
    expect(prompt).toContain('write_practice_script');
    expect(prompt).toContain('generate_practice_script');
    expect(prompt).toContain('list_practice_scripts');
    expect(prompt).toContain(
      'persist the script first with `write_practice_script`, then optionally generate a PDF or document export'
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

    expect(strategyTools).toContain('open_live_view');
    expect(strategyTools).toContain('capture_live_view_screenshot');
    expect(strategyTools).toContain('extract_live_view_media');
    // extract_live_view_playlist is currently DISABLED
    expect(strategyTools).toContain('analyze_video');
    expect(strategyTools).toContain('stage_media');
    expect(strategyTools).toContain('save_film_review');
    expect(strategyTools).toContain('update_film_review');
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
    expect(routerTools).not.toContain('save_gameplan');
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
