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
import { ACTIVITY_FIREBASE_CONTEXT } from '@nxt1/ui/activity';
import { HapticsService } from '@nxt1/ui/services/haptics';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { PERFORMANCE_ADAPTER } from '@nxt1/ui/services/performance';
import { MessagesService } from '@nxt1/ui/messages';
import { FIRESTORE_ADAPTER } from '@nxt1/ui/agent-x/tokens';
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

const createPerformanceMock = () => {
  const mockTrace = {
    putAttribute: vi.fn().mockResolvedValue(undefined),
    putMetric: vi.fn().mockResolvedValue(undefined),
    incrementMetric: vi.fn().mockResolvedValue(undefined),
    removeAttribute: vi.fn().mockResolvedValue(undefined),
    getAttribute: vi.fn(),
    getAttributes: vi.fn().mockReturnValue({}),
    stop: vi.fn().mockResolvedValue(undefined),
    name: 'mock_trace',
    startTime: Date.now(),
    state: 'running' as const,
  };
  return {
    startTrace: vi.fn().mockResolvedValue(mockTrace),
    startTraceWithConfig: vi.fn().mockResolvedValue(mockTrace),
    stopTrace: vi.fn().mockResolvedValue(undefined),
    startHttpMetric: vi.fn(),
    startScreenTrace: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    isEnabled: vi.fn().mockReturnValue(true),
    setEnabled: vi.fn().mockResolvedValue(undefined),
  };
};

const createApiMock = () => ({
  getFeed: vi.fn().mockResolvedValue({
    success: true,
    items: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasMore: false },
    badges: { alerts: 0 },
  } satisfies ActivityFeedResponse),
  getItem: vi.fn().mockResolvedValue(null),
  markRead: vi.fn().mockResolvedValue({
    success: true,
    count: 0,
    badges: { alerts: 0 },
  }),
  markAllRead: vi.fn().mockResolvedValue({
    success: true,
    count: 0,
    badges: { alerts: 0 },
  }),
  getBadges: vi.fn().mockResolvedValue({ alerts: 0 }),
  getSummary: vi.fn().mockResolvedValue({ totalUnread: 0, badges: { alerts: 0 } }),
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

const createFirestoreAdapterMock = () => ({
  onSnapshot: vi.fn(),
  getDocs: vi.fn(),
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
  tab: 'alerts',
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
  badges: { alerts: 1 },
};

const MOCK_FEED_PAGE_2: ActivityFeedResponse = {
  success: true,
  items: [{ ...MOCK_ITEM, id: 'act-3', title: 'Page 2 item' }],
  pagination: { page: 2, limit: 20, total: 3, totalPages: 2, hasMore: false },
  badges: { alerts: 1 },
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
  let performanceMock: ReturnType<typeof createPerformanceMock>;
  let messagesServiceMock: ReturnType<typeof createMessagesServiceMock>;
  let firestoreAdapterMock: ReturnType<typeof createFirestoreAdapterMock>;
  let firestoreUnsubscribeMock: ReturnType<typeof vi.fn>;
  let emitFirestoreSnapshot: (docs: ReadonlyArray<Record<string, unknown>>) => void;
  let emitFirestoreError: (error: unknown) => void;
  let firebaseContextState: {
    currentUserId: string | null;
    projectId: string | null;
    authReady: boolean | null;
  };

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
    performanceMock = createPerformanceMock();
    messagesServiceMock = createMessagesServiceMock();
    firestoreAdapterMock = createFirestoreAdapterMock();
    firestoreUnsubscribeMock = vi.fn();
    emitFirestoreSnapshot = () => undefined;
    emitFirestoreError = () => undefined;
    firebaseContextState = {
      currentUserId: 'user-123',
      projectId: 'nxt-1-v2',
      authReady: true,
    };
    firestoreAdapterMock.onSnapshot.mockImplementation(
      (
        _path: string,
        _orderByField: string,
        onNext: (docs: ReadonlyArray<Record<string, unknown>>) => void,
        onError?: (error: unknown) => void
      ) => {
        emitFirestoreSnapshot = onNext;
        emitFirestoreError = onError ?? (() => undefined);
        return firestoreUnsubscribeMock;
      }
    );

    TestBed.configureTestingModule({
      providers: [
        ActivityService,
        { provide: ActivityApiService, useValue: apiMock },
        { provide: HapticsService, useValue: hapticsMock },
        { provide: NxtToastService, useValue: toastMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
        { provide: PERFORMANCE_ADAPTER, useValue: performanceMock },
        { provide: MessagesService, useValue: messagesServiceMock },
        { provide: FIRESTORE_ADAPTER, useValue: firestoreAdapterMock },
        {
          provide: ACTIVITY_FIREBASE_CONTEXT,
          useValue: {
            getCurrentUserId: () => firebaseContextState.currentUserId,
            getProjectId: () => firebaseContextState.projectId,
            isAuthReady: () => firebaseContextState.authReady,
          },
        },
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
      expect(service.activeTab()).toBe('alerts');
    });

    it('should start with zero badges', () => {
      expect(service.badges()).toEqual({ alerts: 0 });
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
    it('should load items from API for alerts tab', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('alerts');

      expect(apiMock.getFeed).toHaveBeenCalledWith({
        tab: 'alerts',
        page: 1,
        limit: expect.any(Number),
      });
      expect(service.items()).toEqual(MOCK_FEED_RESPONSE.items);
      expect(service.isLoading()).toBe(false);
    });

    it('should update badges from response', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('alerts');

      expect(service.badges()).toEqual({ alerts: 1 });
    });

    it('should set active tab', async () => {
      await service.loadFeed('alerts');

      expect(service.activeTab()).toBe('alerts');
    });

    it('should handle API failure gracefully (inner catch swallows)', async () => {
      apiMock.getFeed.mockRejectedValue(new Error('Network error'));

      await service.loadFeed('alerts');

      // Inner try/catch swallows API errors and falls back to empty items
      expect(service.error()).toBeNull();
      expect(service.items()).toEqual([]);
      expect(service.isLoading()).toBe(false);
    });

    it('should call API for alerts tab', async () => {
      await service.loadFeed('alerts');

      expect(apiMock.getFeed).toHaveBeenCalledWith(expect.objectContaining({ tab: 'alerts' }));
    });

    it('should load feed for alerts tab', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.loadFeed('alerts');

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
      await service.loadFeed('alerts');

      // Load more
      apiMock.getFeed.mockResolvedValueOnce(MOCK_FEED_PAGE_2);
      await service.loadMore();

      expect(service.items().length).toBe(3);
      expect(apiMock.getFeed).toHaveBeenCalledTimes(2);
    });

    it('should not load more when no more pages', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE); // hasMore: false
      await service.loadFeed('alerts');

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

    it('should pass all IDs to API without delegation', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      await service.markRead(['act-1']);

      expect(apiMock.markRead).toHaveBeenCalledWith(['act-1']);
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
      await service.loadFeed('alerts');

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
      const newBadges = { alerts: 1 };
      apiMock.getBadges.mockResolvedValue(newBadges);

      await service.refreshBadges();

      expect(service.badges()).toEqual(newBadges);
    });

    it('should handle API failure gracefully', async () => {
      apiMock.getBadges.mockRejectedValue(new Error('Failed'));

      await service.refreshBadges();

      // Should not throw, badges stay at default
      expect(service.badges()).toEqual({ alerts: 0 });
    });
  });

  // ===========================================================================
  // Real-time Firestore listener
  // ===========================================================================

  describe('startRealtimeForUser()', () => {
    it('should subscribe to the signed-in user activity collection with a bounded query', () => {
      service.startRealtimeForUser('user-123');

      expect(firestoreAdapterMock.onSnapshot).toHaveBeenCalledWith(
        'Users/user-123/activity',
        'timestamp',
        expect.any(Function),
        expect.any(Function),
        { direction: 'desc', limit: 25 }
      );
    });

    it('should merge initial live docs without inflating unread badges', () => {
      service.startRealtimeForUser('user-123');

      emitFirestoreSnapshot([
        {
          __id: 'welcome-activity',
          type: 'agent_task',
          tab: 'alerts',
          priority: 'high',
          title: 'Your welcome graphic is ready',
          body: 'Agent X finished your launch card.',
          timestamp: '2026-05-18T12:00:00.000Z',
          isRead: false,
          isArchived: false,
          mediaUrl: 'https://example.com/welcome.png',
          mediaType: 'image',
        },
      ]);

      expect(service.items()[0]).toMatchObject({
        id: 'welcome-activity',
        type: 'agent_task',
        title: 'Your welcome graphic is ready',
        mediaUrl: 'https://example.com/welcome.png',
      });
      expect(service.badges()).toEqual({ alerts: 0 });
    });

    it('should prepend later live docs and increment unread count immediately', () => {
      service.startRealtimeForUser('user-123');

      emitFirestoreSnapshot([
        {
          __id: 'old-activity',
          type: 'system',
          tab: 'alerts',
          priority: 'normal',
          title: 'Existing activity',
          timestamp: '2026-05-18T11:00:00.000Z',
          isRead: true,
          isArchived: false,
        },
      ]);

      emitFirestoreSnapshot([
        {
          __id: 'new-activity',
          type: 'agent_task',
          tab: 'alerts',
          priority: 'high',
          title: 'New Agent X result',
          timestamp: '2026-05-18T12:00:00.000Z',
          isRead: false,
          isArchived: false,
        },
        {
          __id: 'old-activity',
          type: 'system',
          tab: 'alerts',
          priority: 'normal',
          title: 'Existing activity',
          timestamp: '2026-05-18T11:00:00.000Z',
          isRead: true,
          isArchived: false,
        },
      ]);

      expect(service.items().map((item) => item.id)).toEqual(['new-activity', 'old-activity']);
      expect(service.badges()).toEqual({ alerts: 1 });
    });

    it('should reuse an existing listener for the same user and unsubscribe when the user changes', () => {
      service.startRealtimeForUser('user-123');
      service.startRealtimeForUser('user-123');

      firebaseContextState.currentUserId = 'user-456';
      firebaseContextState.authReady = true;
      service.startRealtimeForUser('user-456');

      expect(firestoreAdapterMock.onSnapshot).toHaveBeenCalledTimes(2);
      expect(firestoreUnsubscribeMock).toHaveBeenCalledTimes(1);
    });

    it('should stop and avoid re-subscribing when permission error happens after logout', () => {
      service.startRealtimeForUser('user-123');

      firebaseContextState.currentUserId = null;
      firebaseContextState.authReady = false;
      emitFirestoreError(new Error('Missing or insufficient permissions.'));

      service.startRealtimeForUser('user-123');

      expect(firestoreUnsubscribeMock).toHaveBeenCalledTimes(1);
      expect(firestoreAdapterMock.onSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // switchTab()
  // ===========================================================================

  describe('switchTab()', () => {
    it('should stay on alerts tab (only tab available)', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);

      await service.switchTab('alerts');

      expect(service.activeTab()).toBe('alerts');
    });

    it('should not switch if already on same tab', async () => {
      // Default tab is 'alerts'
      await service.switchTab('alerts');

      expect(apiMock.getFeed).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // clearError()
  // ===========================================================================

  describe('clearError()', () => {
    it('should clear error state', () => {
      // Manually verify clearError resets the error signal
      service.clearError();

      expect(service.error()).toBeNull();
    });
  });

  // ===========================================================================
  // Computed signals
  // ===========================================================================

  describe('computed signals', () => {
    it('totalUnread should return alerts badge count', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      // badges: { alerts: 1 }
      // totalUnread reads the 'alerts' key from badges
      expect(service.totalUnread()).toBe(1);
    });

    it('hasMore should reflect pagination', async () => {
      apiMock.getFeed.mockResolvedValue({
        ...MOCK_FEED_RESPONSE,
        pagination: { page: 1, limit: 20, total: 40, totalPages: 2, hasMore: true },
      });
      await service.loadFeed('alerts');

      expect(service.hasMore()).toBe(true);
    });

    it('currentTabBadge should return badge for active tab', async () => {
      apiMock.getFeed.mockResolvedValue(MOCK_FEED_RESPONSE);
      await service.loadFeed('alerts');

      expect(service.currentTabBadge()).toBe(1);
    });
  });
});
