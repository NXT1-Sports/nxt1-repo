import { describe, it, expect } from 'vitest';
import type { AgentSessionContext } from '@nxt1/core';
import { DataCoordinatorAgent } from '../data-coordinator.agent.js';
import { BrandCoordinatorAgent } from '../brand-coordinator.agent.js';
import { PerformanceCoordinatorAgent } from '../performance-coordinator.agent.js';

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

  it('exposes mapping and timeline posting tools to the data coordinator', () => {
    const agent = new DataCoordinatorAgent();

    expect(agent.getAvailableTools()).toContain('map_website');
    expect(agent.getAvailableTools()).toContain('write_timeline_post');
    expect(agent.getAvailableTools()).toContain('write_team_post');
    expect(agent.getAvailableTools()).toContain('write_team_stats');
    expect(agent.getAvailableTools()).toContain('write_schedule');
    expect(agent.getAvailableTools()).toContain('write_rankings');
    expect(agent.getAvailableTools()).toContain('search_nxt1_platform');
    expect(agent.getAvailableTools()).toContain('query_nxt1_platform_data');
    expect(agent.getAvailableTools()).toContain('query_nxt1_data');
    expect(agent.getAvailableTools()).toContain('list_nxt1_data_views');
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
    expect(prompt).toContain('call write_timeline_post after the asset is generated');
    expect(prompt).toContain('Do NOT publish automatically unless the user clearly asked');
  });

  it('exposes Intel persistence to the performance coordinator', () => {
    const agent = new PerformanceCoordinatorAgent();

    expect(agent.getAvailableTools()).toContain('write_intel');
  });
});
