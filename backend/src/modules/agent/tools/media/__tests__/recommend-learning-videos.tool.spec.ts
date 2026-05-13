import { describe, expect, it, vi } from 'vitest';

import type { ToolExecutionContext } from '../../base.tool.js';
import { RecommendLearningVideosTool } from '../recommend-learning-videos.tool.js';

describe('RecommendLearningVideosTool', () => {
  const recommend = vi.fn();
  const tool = new RecommendLearningVideosTool({ recommend } as never);

  const context: ToolExecutionContext = {
    userId: 'user-1',
    threadId: 'thread-1',
    environment: 'staging',
    emitStage: vi.fn(),
  };

  it('returns curated recommendations with markdown guidance', async () => {
    recommend.mockResolvedValue({
      normalizedIntent: {
        goal: 'improve quarterback footwork',
        sport: 'football',
        position: 'quarterback',
        audienceRole: null,
        level: 'high_school',
        recommendationType: 'skill_improvement',
        maxResults: 3,
        preferredPlatforms: ['youtube'],
        includeGenericVideoPages: true,
      },
      searchQueries: ['football quarterback improve quarterback footwork technique video YouTube'],
      rejectedCandidateCounts: {},
      recommendations: [
        {
          title: 'Quarterback Footwork Drill Progression',
          url: 'https://www.youtube.com/watch?v=qb-footwork-1',
          excerpt: 'Quarterback footwork mechanics and movement drill video.',
          platform: 'youtube',
          sourceType: 'direct_video',
          whyItFits: 'Matches football, quarterback context for improve quarterback footwork.',
          watchFor:
            'Watch for mechanics, footwork, sequencing, and the specific correction cues the coach repeats.',
          topicTags: ['football', 'quarterback', 'footwork'],
          confidence: 'high',
          suggestedNextStep: 'analyze_video',
          canAnalyzeDirectly: true,
        },
      ],
    });

    const result = await tool.execute(
      {
        goal: 'improve quarterback footwork',
        sport: 'football',
        position: 'quarterback',
        level: 'high_school',
      },
      context
    );

    expect(recommend).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: 'improve quarterback footwork',
        sport: 'football',
        position: 'quarterback',
      }),
      expect.objectContaining({ signal: undefined })
    );
    expect(result.success).toBe(true);
    expect(result.markdown).toContain('Recommended Videos To Study');
    expect(result.markdown).toContain('Quarterback Footwork Drill Progression');
  });

  it('rejects missing goal input', async () => {
    const result = await tool.execute({}, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain('goal');
  });
});
