import { describe, expect, it, vi } from 'vitest';

import { LearningVideoRecommendationService } from '../learning-video-recommendation.service.js';

describe('LearningVideoRecommendationService', () => {
  it('curates direct public video links and deduplicates repeated results', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Quarterback Footwork Drill Progression',
            url: 'https://www.youtube.com/watch?v=qb-footwork-1',
            content: 'Quarterback footwork mechanics and movement drill video.',
            score: 0.92,
          },
          {
            title: 'Quarterback Footwork Drill Progression',
            url: 'https://www.youtube.com/watch?v=qb-footwork-1',
            content: 'Duplicate listing for the same quarterback drill.',
            score: 0.88,
          },
        ],
      }),
    });

    const service = new LearningVideoRecommendationService({
      fetchImpl: fetchImpl as typeof fetch,
      apiKey: 'tavily-test',
    });

    const result = await service.recommend({
      goal: 'improve quarterback footwork',
      sport: 'football',
      position: 'quarterback',
      recommendationType: 'skill_improvement',
      maxResults: 3,
    });

    expect(fetchImpl).toHaveBeenCalled();
    expect(result.recommendations).toHaveLength(1);
    expect(result.recommendations[0]).toEqual(
      expect.objectContaining({
        title: 'Quarterback Footwork Drill Progression',
        url: 'https://www.youtube.com/watch?v=qb-footwork-1',
        platform: 'youtube',
        suggestedNextStep: 'analyze_video',
      })
    );
    expect(result.rejectedCandidateCounts['non_video_candidate'] ?? 0).toBeGreaterThanOrEqual(0);
  });

  it('expands embedded videos from generic pages when scrape fallback finds video embeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'QB Footwork Video Library',
            url: 'https://example.com/qb-footwork-video-library',
            content: 'A curated library of quarterback footwork training videos.',
            score: 0.81,
          },
        ],
      }),
    });

    const scraper = {
      scrape: vi.fn().mockResolvedValue({
        url: 'https://example.com/qb-footwork-video-library',
        title: 'QB Footwork Video Library',
        markdownContent: 'embedded video page',
        contentLength: 20,
        provider: 'fetch-fallback',
        scrapedInMs: 12,
        pageData: {
          title: 'QB Footwork Video Library',
          description: 'embedded video page',
          openGraph: {},
          twitterCard: {},
          ldJson: [],
          nextData: null,
          nuxtData: null,
          embeddedData: {},
          images: [],
          links: [],
          videos: [
            {
              src: 'https://www.youtube.com/embed/qb-embed-22',
              provider: 'youtube',
              videoId: 'qb-embed-22',
            },
          ],
          colors: [],
          faviconUrl: null,
          hasRichData: true,
        },
      }),
    };

    const service = new LearningVideoRecommendationService({
      fetchImpl: fetchImpl as typeof fetch,
      scraper,
      apiKey: 'tavily-test',
    });

    const result = await service.recommend({
      goal: 'quarterback footwork',
      sport: 'football',
      position: 'quarterback',
      recommendationType: 'drills',
      includeGenericVideoPages: true,
    });

    expect(scraper.scrape).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/qb-footwork-video-library' })
    );
    expect(result.recommendations).toContainEqual(
      expect.objectContaining({
        url: 'https://www.youtube.com/watch?v=qb-embed-22',
        platform: 'youtube',
      })
    );
  });

  it('filters blocked social results that are not directly usable learning videos', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            title: 'Quarterback drill thread',
            url: 'https://x.com/qbcoach/status/12345',
            content: 'Thread about quarterback footwork.',
            score: 0.7,
          },
          {
            title: 'Quarterback Footwork Breakdown',
            url: 'https://www.youtube.com/watch?v=qb-footwork-2',
            content: 'Film breakdown and quarterback footwork coaching.',
            score: 0.91,
          },
        ],
      }),
    });

    const service = new LearningVideoRecommendationService({
      fetchImpl: fetchImpl as typeof fetch,
      apiKey: 'tavily-test',
    });

    const result = await service.recommend({
      goal: 'quarterback footwork',
      sport: 'football',
      position: 'quarterback',
      maxResults: 2,
    });

    expect(result.recommendations).toHaveLength(1);
    expect(result.rejectedCandidateCounts['blocked_social']).toBe(1);
  });
});
