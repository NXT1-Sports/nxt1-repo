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
      expect(tools).not.toContain('query_nxt1_data');
      expect(tools).not.toContain('scan_timeline_posts');
      expect(tools).not.toContain('firecrawl_search_web');
      expect(tools).not.toContain('firecrawl_agent_research');
      expect(tools).not.toContain('map_website');
      expect(tools).not.toContain('extract_web_data');
      expect(tools).not.toContain('open_live_view');
      expect(tools).not.toContain('navigate_live_view');
      expect(tools).not.toContain('interact_with_live_view');
      expect(tools).not.toContain('read_live_view');
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
      'Use `write_timeline_post` ONLY when the user explicitly wants content published'
    );
  });

  it('exposes timeline posting to the brand coordinator with explicit publish rules', () => {
    const agent = new BrandCoordinatorAgent();
    const prompt = agent.getSystemPrompt(context);

    expect(agent.getAvailableTools()).toContain('write_timeline_post');
    expect(agent.getAvailableTools()).toContain('clip_video');
    expect(agent.getAvailableTools()).toContain('runway_generate_video');
    expect(prompt).toContain('call write_timeline_post after the asset is generated');
    expect(prompt).toContain('Do NOT publish automatically unless the user clearly asked');
  });

  it('exposes Intel persistence to the performance coordinator', () => {
    const agent = new PerformanceCoordinatorAgent();

    expect(agent.getAvailableTools()).not.toContain('write_intel');
    expect(agent.getAvailableTools()).toContain('analyze_video');
    expect(agent.getAvailableTools()).toContain('get_video_details');
    expect(agent.getAvailableTools()).toContain('call_apify_actor');
    expect(agent.getAvailableTools()).not.toContain('stage_media');
    expect(agent.getAvailableTools()).toContain('import_video');
    expect(agent.getAvailableTools()).toContain('enable_download');
  });

  it('exposes college database and workspace tooling to recruiting coordinator', () => {
    const agent = new RecruitingCoordinatorAgent();
    const tools = agent.getAvailableTools();

    expect(tools).toContain('search_colleges');
    expect(tools).toContain('search_college_coaches');
    expect(tools).not.toContain('run_google_workspace_tool');
    expect(isToolAllowedByPatterns('query_gmail_emails', tools)).toBe(true);
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
    expect(agent.getAvailableTools()).toContain('analyze_video');
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
    expect(prompt).toContain('extract_live_view_media');
    expect(prompt).toContain('extract_live_view_playlist');
    expect(prompt).toContain('skipMediaPersistence: true');
    // import_video reserved for persistent editing
    expect(prompt).toContain('import_video');
    expect(prompt).toContain('batch up to 5');
  });

  it('exposes live-view extraction tools in the effective runtime policy for film coordinators', () => {
    const performanceTools = getEffectiveAgentToolPolicy('performance_coordinator');
    const strategyTools = getEffectiveAgentToolPolicy('strategy_coordinator');

    expect(performanceTools).toContain('open_live_view');
    expect(performanceTools).toContain('extract_live_view_media');
    expect(performanceTools).toContain('extract_live_view_playlist');
    expect(performanceTools).toContain('analyze_video');
    expect(performanceTools).not.toContain('stage_media');

    expect(strategyTools).toContain('open_live_view');
    expect(strategyTools).toContain('extract_live_view_media');
    expect(strategyTools).toContain('extract_live_view_playlist');
    expect(strategyTools).toContain('analyze_video');
    expect(strategyTools).toContain('stage_media');
  });

  it('exposes Microsoft 365 system wrappers in effective policy for all coordinators', () => {
    for (const agentId of COORDINATOR_AGENT_IDS) {
      const tools = getEffectiveAgentToolPolicy(agentId);
      expect(tools).toContain('list_microsoft_365_tools');
      expect(tools).toContain('run_microsoft_365_tool');
    }
  });

  it('allows direct Google Workspace tool families for the router policy', () => {
    const routerTools = getEffectiveAgentToolPolicy('router');

    expect(routerTools).toContain('search_colleges');
    expect(routerTools).toContain('search_college_coaches');
    expect(isToolAllowedByPatterns('send_email', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('batch_send_email', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('query_gmail_emails', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('gmail_send_email', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('calendar_get_events', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('drive_search_files', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('docs_create_document', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('sheets_create_spreadsheet', routerTools)).toBe(true);
    expect(isToolAllowedByPatterns('create_presentation_from_markdown', routerTools)).toBe(true);
  });

  it('supports wildcard matching beyond simple prefix-only patterns', () => {
    expect(isToolAllowedByPatterns('run_google_workspace_tool', ['*google_workspace*'])).toBe(true);
    expect(isToolAllowedByPatterns('calendar_get_events', ['*get_*'])).toBe(true);
    expect(isToolAllowedByPatterns('drive_upload_file', ['*upload*'])).toBe(true);
    expect(isToolAllowedByPatterns('analyze_video', ['*upload*'])).toBe(false);
  });

  it('enforces ask-user decision matrix language across coordinator prompts', () => {
    const prompts = [
      new DataCoordinatorAgent().getSystemPrompt(context),
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
    }
  });
});
