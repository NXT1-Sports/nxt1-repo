import { describe, it, expect } from 'vitest';
import type { AgentSessionContext } from '@nxt1/core';
import { DataCoordinatorAgent } from '../data-coordinator.agent.js';
import { AdminCoordinatorAgent } from '../admin-coordinator.agent.js';
import { BrandCoordinatorAgent } from '../brand-coordinator.agent.js';
import { PerformanceCoordinatorAgent } from '../performance-coordinator.agent.js';
import { RecruitingCoordinatorAgent } from '../recruiting-coordinator.agent.js';
import { StrategyCoordinatorAgent } from '../strategy-coordinator.agent.js';
import { isToolAllowedByPatterns } from '../tool-policy.js';

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
    const agents = [
      new DataCoordinatorAgent(),
      new BrandCoordinatorAgent(),
      new PerformanceCoordinatorAgent(),
      new RecruitingCoordinatorAgent(),
      new StrategyCoordinatorAgent(),
    ];

    for (const agent of agents) {
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
      expect(tools).not.toContain('write_intel');
      expect(tools).not.toContain('update_intel');
      expect(tools).not.toContain('firecrawl_search_web');
      expect(tools).not.toContain('firecrawl_agent_research');
      expect(tools).not.toContain('map_website');
      expect(tools).not.toContain('extract_web_data');
      expect(tools).not.toContain('open_live_view');
      expect(tools).not.toContain('navigate_live_view');
      expect(tools).not.toContain('interact_with_live_view');
      expect(tools).not.toContain('read_live_view');
      expect(tools).not.toContain('close_live_view');
    }

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
    expect(agent.getAvailableTools()).not.toContain('query_nxt1_data');
    expect(agent.getAvailableTools()).not.toContain('list_nxt1_data_views');
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
  });

  it('exposes college database and workspace tooling to recruiting coordinator', () => {
    const agent = new RecruitingCoordinatorAgent();
    const tools = agent.getAvailableTools();

    expect(tools).toContain('search_colleges');
    expect(tools).toContain('search_college_coaches');
    expect(tools).not.toContain('run_google_workspace_tool');
    expect(isToolAllowedByPatterns('query_gmail_emails', tools)).toBe(true);
  });

  it('keeps strategy coordinator explicit and non-empty', () => {
    const agent = new StrategyCoordinatorAgent();

    expect(agent.getAvailableTools().length).toBeGreaterThan(0);
    expect(agent.getAvailableTools()).toContain('get_analytics_summary');
    expect(agent.getAvailableTools()).not.toContain('write_intel');
    expect(agent.getAvailableTools()).not.toContain('firecrawl_agent_research');
    expect(agent.getAvailableTools()).not.toContain('schedule_recurring_task');
    expect(agent.getAvailableTools()).toContain('list_recurring_tasks');
    expect(agent.getAvailableTools()).toContain('cancel_recurring_task');
  });
});
