import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
  articleFindOneAndUpdate: vi.fn(),
  articleUpdateOne: vi.fn(),
}));

vi.mock('../../core/cache.service.js', () => ({
  getCacheService: () => mocks.cache,
  generateCacheKey: (...parts: unknown[]) => parts.join(':'),
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../models/help-center/help-article.model.js', () => ({
  getHelpArticleModel: () => ({
    findOneAndUpdate: mocks.articleFindOneAndUpdate,
    updateOne: mocks.articleUpdateOne,
  }),
}));

vi.mock('../../../models/help-center/help-faq.model.js', () => ({
  getHelpFaqModel: () => ({}) as object,
}));

vi.mock('../../../models/help-center/article-feedback.model.js', () => ({
  getArticleFeedbackModel: () => ({}) as object,
}));

vi.mock('../../../models/help-center/support-ticket.model.js', () => ({
  getSupportTicketModel: () => ({}) as object,
}));

vi.mock('../../communications/platform-email.service.js', () => ({
  sendPlatformEmail: vi.fn(),
}));

import { getArticle } from '../help-center.service.js';

describe('helpCenterService.getArticle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cache.get.mockResolvedValue(null);
    mocks.cache.set.mockResolvedValue(undefined);
    mocks.cache.del.mockResolvedValue(undefined);
    mocks.articleFindOneAndUpdate.mockReset();
    mocks.articleUpdateOne.mockReset();
  });

  it('resolves legacy slugs to the canonical article', async () => {
    mocks.articleFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'article-1',
        slug: 'quick-tasks-reference-command-center',
        legacySlugs: ['agent-x-quick-tasks-reference'],
        title: 'Quick Tasks Reference: Role-Specific Commands on the Command Center',
        excerpt: 'Quick tasks',
        content: '<p>content</p>',
        type: 'article',
        category: 'agent-x',
        tags: [],
        targetUsers: ['all'],
        readingTimeMinutes: 1,
        publishedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        viewCount: 1,
        helpfulCount: 0,
        notHelpfulCount: 0,
        isPublished: true,
      }),
    });

    const article = await getArticle('agent-x-quick-tasks-reference');

    expect(mocks.articleFindOneAndUpdate).toHaveBeenCalledWith(
      {
        isPublished: true,
        $or: [
          { slug: 'agent-x-quick-tasks-reference' },
          { legacySlugs: 'agent-x-quick-tasks-reference' },
        ],
      },
      { $inc: { viewCount: 1 } },
      { returnDocument: 'after' }
    );
    expect(article).toMatchObject({
      id: 'article-1',
      slug: 'quick-tasks-reference-command-center',
      legacySlugs: ['agent-x-quick-tasks-reference'],
    });
    expect(mocks.cache.set).toHaveBeenCalled();
  });
});
