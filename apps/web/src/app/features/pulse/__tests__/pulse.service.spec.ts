/**
 * @fileoverview NewsService Unit Tests
 * @module @nxt1/web/features/pulse
 *
 * Unit tests for the shared NewsService (packages/ui).
 * Covers: loadFeed, loadMore, refresh, setCategory, selectArticle, shareArticle.
 *
 * Pattern: TestBed with all dependencies mocked. No HTTP calls.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { PLATFORM_ID } from '@angular/core';
import { NewsService, NEWS_API_ADAPTER, type INewsApiAdapter } from '@nxt1/ui/news';
import { HapticsService } from '@nxt1/ui/services/haptics';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import type { NewsArticle, NewsPagination } from '@nxt1/core';

// ============================================
// MOCK FACTORIES
// ============================================

const createLoggerChild = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(),
  setContext: vi.fn(),
  clearContext: vi.fn(),
  flush: vi.fn(),
});

const createLoggerMock = () => ({
  child: vi.fn().mockReturnValue(createLoggerChild()),
});

const createHapticsMock = () => ({
  impact: vi.fn().mockResolvedValue(undefined),
  notification: vi.fn().mockResolvedValue(undefined),
  selection: vi.fn().mockResolvedValue(undefined),
});

const createToastMock = () => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
});

const createBreadcrumbMock = () => ({
  trackStateChange: vi.fn().mockResolvedValue(undefined),
  trackUserAction: vi.fn().mockResolvedValue(undefined),
  trackNavigation: vi.fn(),
  trackFormSubmit: vi.fn(),
  trackHttpRequest: vi.fn(),
  trackAuth: vi.fn(),
});

const createAnalyticsMock = () => ({
  trackEvent: vi.fn(),
  setUserId: vi.fn(),
  setUserProperties: vi.fn(),
  logEvent: vi.fn(),
});

const createApiMock = (): INewsApiAdapter => ({
  getFeed: vi.fn().mockResolvedValue({
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false },
  }),
});

// ============================================
// TEST DATA
// ============================================

const MOCK_ARTICLE: NewsArticle = {
  id: 'art-1',
  slug: 'test-article',
  title: 'Test Article Title',
  excerpt: 'A short test excerpt',
  content: '<p>Full article content</p>',
  source: 'ESPN',
  sourceUrl: 'https://espn.com/article/1',
  faviconUrl: 'https://espn.com/favicon.ico',
  imageUrl: 'https://espn.com/image.jpg',
  sport: 'basketball_mens',
  state: 'Texas',
  author: 'John Doe',
  publishedAt: '2026-03-01T10:00:00.000Z',
  createdAt: '2026-03-01T09:55:00.000Z',
  viewCount: 42,
};

const MOCK_ARTICLE_2: NewsArticle = {
  id: 'art-2',
  slug: 'second-article',
  title: 'Second Article',
  excerpt: 'Another test excerpt',
  content: '<p>Second article content</p>',
  source: 'Rivals',
  sourceUrl: 'https://rivals.com/article/2',
  sport: 'football',
  state: 'Ohio',
  publishedAt: '2026-03-01T08:00:00.000Z',
  createdAt: '2026-03-01T07:55:00.000Z',
};

const MOCK_PAGINATION: NewsPagination = {
  page: 1,
  limit: 20,
  total: 2,
  totalPages: 1,
  hasMore: false,
};

const MOCK_PAGINATION_WITH_MORE: NewsPagination = {
  page: 1,
  limit: 20,
  total: 25,
  totalPages: 2,
  hasMore: true,
};

const MOCK_FEED_RESPONSE = {
  data: [MOCK_ARTICLE, MOCK_ARTICLE_2],
  pagination: MOCK_PAGINATION,
};

const MOCK_FEED_PAGE_2 = {
  data: [{ ...MOCK_ARTICLE, id: 'art-3', title: 'Page 2 Article' }],
  pagination: { page: 2, limit: 20, total: 25, totalPages: 2, hasMore: false } as NewsPagination,
};

// ============================================
// TEST SUITE
// ============================================

describe('NewsService', () => {
  let service: NewsService;
  let apiMock: ReturnType<typeof createApiMock>;
  let hapticsMock: ReturnType<typeof createHapticsMock>;
  let toastMock: ReturnType<typeof createToastMock>;
  let loggerMock: ReturnType<typeof createLoggerMock>;
  let breadcrumbMock: ReturnType<typeof createBreadcrumbMock>;
  let analyticsMock: ReturnType<typeof createAnalyticsMock>;

  beforeAll(() => {
    try {
      getTestBed().initTestEnvironment(
        BrowserDynamicTestingModule,
        platformBrowserDynamicTesting()
      );
    } catch (error) {
      const message = String(error);
      if (!message.includes('Cannot set base providers because it has already been called')) {
        throw error;
      }
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();

    apiMock = createApiMock();
    hapticsMock = createHapticsMock();
    toastMock = createToastMock();
    loggerMock = createLoggerMock();
    breadcrumbMock = createBreadcrumbMock();
    analyticsMock = createAnalyticsMock();

    TestBed.configureTestingModule({
      providers: [
        NewsService,
        { provide: NEWS_API_ADAPTER, useValue: apiMock },
        { provide: HapticsService, useValue: hapticsMock },
        { provide: NxtToastService, useValue: toastMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(NewsService);
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe('initial state', () => {
    it('should start with empty articles', () => {
      expect(service.articles()).toEqual([]);
    });

    it('should start with default category', () => {
      expect(service.activeCategory()).toBe('for-you');
    });

    it('should not be loading', () => {
      expect(service.isLoading()).toBe(false);
    });

    it('should have no error', () => {
      expect(service.error()).toBeNull();
    });

    it('should have no selected article', () => {
      expect(service.selectedArticle()).toBeNull();
    });

    it('should report isEmpty when not loading', () => {
      expect(service.isEmpty()).toBe(true);
    });

    it('should not have more pages', () => {
      expect(service.hasMore()).toBe(false);
    });
  });

  // ===========================================================================
  // loadFeed()
  // ===========================================================================

  describe('loadFeed()', () => {
    it('should load articles from API', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('for-you');

      expect(apiMock.getFeed).toHaveBeenCalledWith('for-you', 1, 20);
      expect(service.articles()).toEqual(MOCK_FEED_RESPONSE.data);
      expect(service.isLoading()).toBe(false);
    });

    it('should set active category', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('pro');

      expect(service.activeCategory()).toBe('pro');
    });

    it('should update pagination from response', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('for-you');

      expect(service.pagination()).toEqual(MOCK_PAGINATION);
      expect(service.hasMore()).toBe(false);
    });

    it('should set error on API failure', async () => {
      vi.mocked(apiMock.getFeed).mockRejectedValue(new Error('Network error'));

      await service.loadFeed('for-you');

      expect(service.error()).toBe('Network error');
      expect(service.isLoading()).toBe(false);
    });

    it('should clear articles before loading', async () => {
      // Pre-populate
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('for-you');
      expect(service.articles().length).toBe(2);

      // Reload — articles should be empty during load
      let articlesWhileLoading: NewsArticle[] = [];
      vi.mocked(apiMock.getFeed).mockImplementation(async () => {
        articlesWhileLoading = service.articles();
        return MOCK_FEED_RESPONSE;
      });

      await service.loadFeed('pro');
      expect(articlesWhileLoading).toEqual([]);
    });

    it('should track analytics event on success', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('for-you');

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        'news_feed_viewed',
        expect.objectContaining({ news_category: 'for-you', count: 2 })
      );
    });

    it('should track analytics error event on failure', async () => {
      vi.mocked(apiMock.getFeed).mockRejectedValue(new Error('Fail'));

      await service.loadFeed('for-you');

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        'news_error_feed_load',
        expect.objectContaining({ news_category: 'for-you' })
      );
    });

    it('should track breadcrumb on loading and loaded', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('for-you');

      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith(
        'news:loading',
        expect.objectContaining({ category: 'for-you' })
      );
      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith(
        'news:loaded',
        expect.objectContaining({ category: 'for-you', count: 2 })
      );
    });

    it('should log info on success', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);
      const childLogger = loggerMock.child.mock.results[0]?.value ?? createLoggerChild();

      await service.loadFeed('for-you');

      expect(childLogger.info).toHaveBeenCalledWith(
        'Loading news feed',
        expect.objectContaining({ category: 'for-you' })
      );
    });
  });

  // ===========================================================================
  // setCategory()
  // ===========================================================================

  describe('setCategory()', () => {
    it('should change category and reload feed', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.setCategory('pro');

      expect(service.activeCategory()).toBe('pro');
      expect(apiMock.getFeed).toHaveBeenCalledWith('pro', 1, 20);
    });

    it('should skip reload if category unchanged', async () => {
      await service.setCategory('for-you');

      expect(apiMock.getFeed).not.toHaveBeenCalled();
    });

    it('should track category change event', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.setCategory('pro');

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        'news_category_changed',
        expect.objectContaining({ news_category: 'pro' })
      );
    });
  });

  // ===========================================================================
  // loadMore()
  // ===========================================================================

  describe('loadMore()', () => {
    it('should append articles to existing list', async () => {
      // First load with hasMore
      vi.mocked(apiMock.getFeed).mockResolvedValueOnce({
        data: [MOCK_ARTICLE, MOCK_ARTICLE_2],
        pagination: MOCK_PAGINATION_WITH_MORE,
      });
      await service.loadFeed('for-you');
      expect(service.articles().length).toBe(2);

      // Load more
      vi.mocked(apiMock.getFeed).mockResolvedValueOnce(MOCK_FEED_PAGE_2);
      await service.loadMore();

      expect(service.articles().length).toBe(3);
      expect(apiMock.getFeed).toHaveBeenCalledTimes(2);
    });

    it('should not load more when no more pages', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE); // hasMore: false
      await service.loadFeed('for-you');

      await service.loadMore();

      expect(apiMock.getFeed).toHaveBeenCalledTimes(1); // Only initial load
    });

    it('should not load more when already loading more', async () => {
      // First load with hasMore
      vi.mocked(apiMock.getFeed).mockResolvedValueOnce({
        data: [MOCK_ARTICLE],
        pagination: MOCK_PAGINATION_WITH_MORE,
      });
      await service.loadFeed('for-you');

      // Start loadMore but don't await
      vi.mocked(apiMock.getFeed).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(MOCK_FEED_PAGE_2), 100))
      );
      const first = service.loadMore();
      const second = service.loadMore(); // Should bail immediately

      await Promise.all([first, second]);
      // Only 1 additional call (the initial load + 1 loadMore, not 2)
      expect(apiMock.getFeed).toHaveBeenCalledTimes(2);
    });

    it('should show toast on load more failure', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValueOnce({
        data: [MOCK_ARTICLE],
        pagination: MOCK_PAGINATION_WITH_MORE,
      });
      await service.loadFeed('for-you');

      vi.mocked(apiMock.getFeed).mockRejectedValueOnce(new Error('Load more failed'));
      await service.loadMore();

      expect(toastMock.error).toHaveBeenCalledWith('Load more failed');
    });

    it('should trigger haptic feedback on success', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValueOnce({
        data: [MOCK_ARTICLE],
        pagination: MOCK_PAGINATION_WITH_MORE,
      });
      await service.loadFeed('for-you');

      vi.mocked(apiMock.getFeed).mockResolvedValueOnce(MOCK_FEED_PAGE_2);
      await service.loadMore();

      expect(hapticsMock.impact).toHaveBeenCalledWith('light');
    });

    it('should track load more analytics', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValueOnce({
        data: [MOCK_ARTICLE],
        pagination: MOCK_PAGINATION_WITH_MORE,
      });
      await service.loadFeed('for-you');

      vi.mocked(apiMock.getFeed).mockResolvedValueOnce(MOCK_FEED_PAGE_2);
      await service.loadMore();

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        'news_load_more',
        expect.objectContaining({ page: 2 })
      );
    });
  });

  // ===========================================================================
  // refresh()
  // ===========================================================================

  describe('refresh()', () => {
    it('should reload feed and show success toast', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.refresh();

      expect(apiMock.getFeed).toHaveBeenCalled();
      expect(toastMock.success).toHaveBeenCalledWith('Feed updated');
      expect(hapticsMock.notification).toHaveBeenCalledWith('success');
    });

    it('should still complete when loadFeed encounters an error', async () => {
      // loadFeed catches its own errors internally, so refresh()
      // always reaches the success path (notification + toast).
      vi.mocked(apiMock.getFeed).mockRejectedValue(new Error('Refresh failed'));

      await service.refresh();

      // loadFeed handled the error; refresh still completes its try block
      expect(hapticsMock.notification).toHaveBeenCalledWith('success');
      expect(service.error()).toBe('Refresh failed');
    });

    it('should track refresh event', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.refresh();

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith('news_feed_refreshed');
    });

    it('should reset isRefreshing after completion', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.refresh();

      expect(service.isRefreshing()).toBe(false);
    });
  });

  // ===========================================================================
  // selectArticle()
  // ===========================================================================

  describe('selectArticle()', () => {
    it('should set selected article', async () => {
      await service.selectArticle(MOCK_ARTICLE);

      expect(service.selectedArticle()).toEqual(MOCK_ARTICLE);
    });

    it('should clear selected article when null', async () => {
      await service.selectArticle(MOCK_ARTICLE);
      await service.selectArticle(null);

      expect(service.selectedArticle()).toBeNull();
    });

    it('should track article viewed event', async () => {
      await service.selectArticle(MOCK_ARTICLE);

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        'news_article_viewed',
        expect.objectContaining({
          articleId: 'art-1',
          sport: 'basketball_mens',
          source: 'ESPN',
        })
      );
    });

    it('should trigger haptic feedback', async () => {
      await service.selectArticle(MOCK_ARTICLE);

      expect(hapticsMock.impact).toHaveBeenCalledWith('light');
    });

    it('should not track analytics when clearing selection', async () => {
      await service.selectArticle(null);

      expect(analyticsMock.trackEvent).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // clearSelectedArticle()
  // ===========================================================================

  describe('clearSelectedArticle()', () => {
    it('should clear selected article synchronously', async () => {
      await service.selectArticle(MOCK_ARTICLE);
      expect(service.selectedArticle()).toEqual(MOCK_ARTICLE);

      service.clearSelectedArticle();

      expect(service.selectedArticle()).toBeNull();
    });
  });

  // ===========================================================================
  // applyFilters() / clearFilters()
  // ===========================================================================

  describe('applyFilters()', () => {
    it('should set filters and reload feed', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.applyFilters({ sport: 'basketball_mens', state: 'Texas' });

      expect(service.filters()).toEqual({ sport: 'basketball_mens', state: 'Texas' });
      expect(apiMock.getFeed).toHaveBeenCalled();
    });
  });

  describe('clearFilters()', () => {
    it('should clear filters and reload feed', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.applyFilters({ sport: 'football' });

      await service.clearFilters();

      expect(service.filters()).toEqual({});
      expect(apiMock.getFeed).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Computed signals
  // ===========================================================================

  describe('computed signals', () => {
    it('isEmpty should be false when loading', async () => {
      let isEmptyWhileLoading = true;
      vi.mocked(apiMock.getFeed).mockImplementation(async () => {
        isEmptyWhileLoading = service.isEmpty();
        return { data: [], pagination: MOCK_PAGINATION };
      });

      await service.loadFeed('for-you');

      // isEmpty = articles.length === 0 && !isLoading, so false while loading
      expect(isEmptyWhileLoading).toBe(false);
    });

    it('isEmpty should be true when articles empty and not loading', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue({
        data: [],
        pagination: MOCK_PAGINATION,
      });

      await service.loadFeed('for-you');

      expect(service.isEmpty()).toBe(true);
    });

    it('hasMore should reflect pagination', async () => {
      vi.mocked(apiMock.getFeed).mockResolvedValue({
        data: [MOCK_ARTICLE],
        pagination: MOCK_PAGINATION_WITH_MORE,
      });

      await service.loadFeed('for-you');

      expect(service.hasMore()).toBe(true);
    });
  });
});
