import { describe, expect, it } from 'vitest';
import { PerformanceCoordinatorAgent } from '../performance-coordinator.agent.js';
import { StrategyCoordinatorAgent } from '../strategy-coordinator.agent.js';

describe('coordinator skill bindings', () => {
  it('loads the video analysis skill for the performance coordinator', () => {
    const agent = new PerformanceCoordinatorAgent();

    expect(agent.getSkills()).toContain('video_analysis');
  });

  it('loads the video analysis skill for the strategy coordinator', () => {
    const agent = new StrategyCoordinatorAgent();

    expect(agent.getSkills()).toContain('video_analysis');
  });
});
