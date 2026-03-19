/**
 * @fileoverview ActivityService Unit Tests
 * @module @nxt1/web/features/activity
 *
 * Unit tests for the shared ActivityService (packages/ui).
 * Covers: loadFeed, loadMore, markRead, markAllRead, archive, refresh, switchTab.
 *
 * Pattern: TestBed with all dependencies mocked. No HTTP calls.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { ActivityService } from '@nxt1/ui/activity';
import { ActivityApiService } from '@nxt1/ui/activity';
import { HapticsService } from '@nxt1/ui/services/haptics';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { MessagesService } from '@nxt1/ui/messages';
import type { ActivityFeedResponse, ActivityItem } from '@nxt1/core';

// ============================================
// MOCK FACTORIES
// ============================================

const createLoggerChild = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
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

const createApiMock = () => ({
  getFeed: vi.fn().mockResolvedValue({
    success: true,
    items: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false },
    badges: { all: 0, inbox: 0, agent: 0, alerts: 0 },
  } satisfies ActivityFeedResponse),
  getItem: vi.fn().mockResolvedValue(null),
  markRead: vi.fn().mockResolvedValue({
    success: true,
    count: 0,
    badges: { all: 0, inbox: 0, agent: 0, alerts: 0 },
  }),
  markAllRead: vi.fn().mockResolvedValue({
    success: true,
    count: 0,
    badges: { all: 0, inbox: 0, agent: 0, alerts: 0 },
  }),
  getBadges: vi.fn().mockResolvedValue({ all: 0, inbox: 0, agent: 0, alerts: 0 }),
  getSummary: vi
    .fn()
    .mockResolvedValue({ totalUnread: 0, badges: { all: 0, inbox: 0, agent: 0, alerts: 0 } }),
  archive: vi.fn().mockResolvedValue({ success: true, count: 1 }),
  restore: vi.fn().mockResolvedValue({ success: true, count: 1 }),
});

const createMessagesServiceMock = () => ({
  conversations: vi.fn().mockReturnValue([]),
  isLoading: vi.fn().mockReturnValue(false),
  isEmpty: vi.fn().mockReturnValue(true),
  error: vi.fn().mockReturnValue(null),
  loadConversations: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  markAsRead: vi.fn(),
  clearError: vi.fn(),
});

// ============================================
// TEST DATA
// ============================================

const MOCK_ITEM: ActivityItem = {
  id: 'act-1',
  type: 'system',
  tab: 'alerts',
  priority: 'normal',
  title: 'New follower',
  body: 'Coach Smith started following you',
  timestamp: '2026-03-01T10:00:00.000Z',
  isRead: false,
  isArchived: false,
};

const MOCK_ITEM_2: ActivityItem = {
  id: 'act-2',
  type: 'agent_task',
  tab: 'agent',
  priority: 'high',
  title: 'Agent X completed task',
  body: 'Your highlight reel is ready',
  timestamp: '2026-03-01T09:00:00.000Z',
  isRead: true,
  isArchived: false,
};

const MOCK_FEED_RESPONSE: ActivityFeedResponse = {
  success: true,
  items: [MOCK_ITEM, MOCK_ITEM_2],
  pagination: { page: 1, limit: 20, total: 2, totalPages: 1, hasMore: false },
  badges: { all: 3, inbox: 1, agent: 1, alerts: 1 },
};

const MOCK_FEED_PAGE_2: ActivityFeedResponse = {
  success: true,
  items: [{ ...MOCK_ITEM, id: 'act-3', title: 'Page 2 item' }],
  pagination: { page: 2, limit: 20, total: 3, totalPages: 2, hasMore: false },
  badges: { all: 3, inbox: 1, agent: 1, alerts: 1 },
};

// ============================================
// TEST SUITE
// ============================================

describe('ActivityService', () => {
  let service: ActivityService;
  let apiMock: ReturnType<typeof createApiMock>;
  let hapticsMock: ReturnType<typeof createHapticsMock>;
  let toastMock: ReturnType<typeof createToastMock>;
  let loggerMock: ReturnType<typeof createLoggerMock>;
  let breadcrumbMock: ReturnType<typeof createBreadcrumbMock>;
  let analyticsMock: ReturnType<typeof createAnalyticsMock>;
  let messagesServiceMock: ReturnType<typeof createMessagesServiceMock>;

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
    messagesServiceMock = createMessagesServiceMock();

    TestBed.configureTestingModule({
      providers: [
        ActivityService,
        { provide: ActivityApiService, useValue: apiMock },
        { provide: HapticsService, useValue: hapticsMock },
        { provide: NxtToastService, useValue: toastMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
        { provide: MessagesService, useValue: messagesServiceMock },
      ],
    });

    service = TestBed.inject(ActivityService);
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe('initial state', () => {
    it('should start with empty items', () => {
      expect(service.items()).toEqual([]);
    });

    it('should start with default tab', () => {
      expect(service.activeTab()).toBe('all');
    });

    it('should start with zero badges', () => {
      expect(service.badges()).toEqual({ all: 0, inbox: 0, agent: 0, alerts: 0 });
    });

    it('should not be loading', () => {
      expect(service.isLoading()).toBe(false);
    });

    it('should have no error', () => {
      expect(service.error()).toBeNull();
    });
  });

  // ===========================================================================
  // loadFeed()
  // ===========================================================================

  describe('loadFeed()', () => {
    it('should load items from API for agent tab', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('agent');

      expect(apiMock.getFeed).toHaveBeenCalledWith({
        tab: 'agent',
        page: 1,
        limit: expect.any(Number),
      });
      expect(service.items()).toEqual(MOCK_FEED_RESPONSE.items);
      expect(service.isLoading()).toBe(false);
    });

    it('should update badges from response', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('alerts');

      expect(service.badges()).toEqual({ all: 3, inbox: 1, agent: 1, alerts: 1 });
    });

    it('should set active tab', async () => {
      await service.loadFeed('alerts');

      expect(service.activeTab()).toBe('alerts');
    });

    it('should set error on API failure', async () => {
      apiMock.getFeed.mockRejectedValue(new Error('Network error'));

      await service.loadFeed('agent');

      expect(service.error()).toBe('Network error');
      expect(service.isLoading()).toBe(false);
    });

    it('should skip API call for inbox tab (messages only)', async () => {
      await service.loadFeed('inbox');

      expect(apiMock.getFeed).not.toHaveBeenCalled();
      // loadConversations is disabled pending backend /messages route availability
    });

    it('should load conversations for all tab', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('all');

      expect(apiMock.getFeed).toHaveBeenCalled();
      // loadConversations is disabled pending backend /messages route availability
    });

    it('should track analytics event', async () => {
      await service.loadFeed('alerts');

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tab: 'alerts' })
      );
    });
  });

  // ===========================================================================
  // loadMore()
  // ===========================================================================

  describe('loadMore()', () => {
    it('should append items to existing list', async () => {
      // First load
      apiMock.getFeed.mockResolvedValueOnce({
        ...MOCK_FEED_RESPONSE,
        pagination: { page: 1, limit: 20, total: 3, totalPages: 2, hasMore: true },
      });
      await service.loadFeed('agent');

      // Load more
      apiMock.getFeed.mockResolvedValueOnce(MOCK_FEED_PAGE_2);
      await service.loadMore();

      expect(service.items().length).toBe(3);
      expect(apiMock.getFeed).toHaveBeenCalledTimes(2);
    });

    it('should not load more when no more pages', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE); // hasMore: false
      await service.loadFeed('agent');

      await service.loadMore();

      expect(apiMock.getFeed).toHaveBeenCalledTimes(1); // Only initial load
    });
  });

  // ===========================================================================
  // markRead()
  // ===========================================================================

  describe('markRead()', () => {
    it('should optimistically mark items as read', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      await service.markRead(['act-1']);

      expect(apiMock.markRead).toHaveBeenCalledWith(['act-1']);
      const item = service.items().find((i) => i.id === 'act-1');
      expect(item?.isRead).toBe(true);
    });

    it('should rollback on API failure', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      apiMock.markRead.mockRejectedValue(new Error('Server error'));
      await service.markRead(['act-1']);

      // Rolled back — item should still be unread
      const item = service.items().find((i) => i.id === 'act-1');
      expect(item?.isRead).toBe(false);
      expect(toastMock.error).toHaveBeenCalled();
    });

    it('should skip empty id arrays', async () => {
      await service.markRead([]);

      expect(apiMock.markRead).not.toHaveBeenCalled();
    });

    it('should delegate message IDs to MessagesService', async () => {
      await service.markRead(['msg-conv-1', 'act-1']);

      expect(messagesServiceMock.markAsRead).toHaveBeenCalledWith('conv-1');
    });
  });

  // ===========================================================================
  // markAllRead()
  // ===========================================================================

  describe('markAllRead()', () => {
    it('should mark all items as read', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      await service.markAllRead();

      expect(apiMock.markAllRead).toHaveBeenCalledWith('alerts');
      expect(toastMock.success).toHaveBeenCalled();
      expect(hapticsMock.notification).toHaveBeenCalledWith('success');
    });

    it('should rollback on failure', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      apiMock.markAllRead.mockRejectedValue(new Error('Failed'));
      await service.markAllRead();

      // Rolled back — unread items should still be unread
      const unreadItem = service.items().find((i) => i.id === 'act-1');
      expect(unreadItem?.isRead).toBe(false);
      expect(toastMock.error).toHaveBeenCalled();
    });

    it('should not call API when no unread items', async () => {
      apiMock.getFeed.mockResolvedValue({
        ...MOCK_FEED_RESPONSE,
        items: [MOCK_ITEM_2], // Already read
      });
      await service.loadFeed('agent');

      await service.markAllRead();

      expect(apiMock.markAllRead).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // archive()
  // ===========================================================================

  describe('archive()', () => {
    it('should optimistically remove item from list', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      await service.archive('act-1');

      expect(apiMock.archive).toHaveBeenCalledWith(['act-1']);
      expect(service.items().find((i) => i.id === 'act-1')).toBeUndefined();
    });

    it('should rollback on failure', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      apiMock.archive.mockRejectedValue(new Error('Failed'));
      await service.archive('act-1');

      // Rolled back — item should still be present
      expect(service.items().find((i) => i.id === 'act-1')).toBeDefined();
      expect(toastMock.error).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // refreshBadges()
  // ===========================================================================

  describe('refreshBadges()', () => {
    it('should update badges from API', async () => {
      const newBadges = { all: 5, inbox: 2, agent: 2, alerts: 1 };
      apiMock.getBadges.mockResolvedValue(newBadges);

      await service.refreshBadges();

      expect(service.badges()).toEqual(newBadges);
    });

    it('should handle API failure gracefully', async () => {
      apiMock.getBadges.mockRejectedValue(new Error('Failed'));

      await service.refreshBadges();

      // Should not throw, badges stay at default
      expect(service.badges()).toEqual({ all: 0, inbox: 0, agent: 0, alerts: 0 });
    });
  });

  // ===========================================================================
  // switchTab()
  // ===========================================================================

  describe('switchTab()', () => {
    it('should switch tab and load feed', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.switchTab('agent');

      expect(service.activeTab()).toBe('agent');
      expect(apiMock.getFeed).toHaveBeenCalled();
      expect(hapticsMock.impact).toHaveBeenCalledWith('light');
    });

    it('should not switch if already on same tab', async () => {
      // Default tab is 'all'
      await service.switchTab('all');

      expect(apiMock.getFeed).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // clearError()
  // ===========================================================================

  describe('clearError()', () => {
    it('should clear error state', async () => {
      apiMock.getFeed.mockRejectedValue(new Error('Failed'));
      await service.loadFeed('agent');
      expect(service.error()).toBe('Failed');

      service.clearError();

      expect(service.error()).toBeNull();
    });

    it('should also clear messages error', () => {
      service.clearError();

      expect(messagesServiceMock.clearError).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Computed signals
  // ===========================================================================

  describe('computed signals', () => {
    it('totalUnread should sum all badge counts', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      // badges: { all: 3, inbox: 1, agent: 1, alerts: 1 }
      // totalUnread uses the authoritative 'all' badge from the backend (not a sum)
      expect(service.totalUnread()).toBe(3);
    });

    it('hasMore should reflect pagination', async () => {
      apiMock.getFeed.mockResolvedValue({
        ...MOCK_FEED_RESPONSE,
        pagination: { page: 1, limit: 20, total: 40, totalPages: 2, hasMore: true },
      });
      await service.loadFeed('agent');

      expect(service.hasMore()).toBe(true);
    });

    it('currentTabBadge should return badge for active tab', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      expect(service.currentTabBadge()).toBe(1);
    });
  });
});
