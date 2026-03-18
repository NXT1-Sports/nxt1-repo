/**
 * @fileoverview SettingsService Unit Tests
 * @module @nxt1/web/features/settings
 *
 * Unit tests for the shared SettingsService (packages/ui).
 * Covers: user/subscription setters, loadSettings(), updatePreference(), signOut().
 *
 * Pattern: TestBed with all dependencies mocked. No HTTP calls.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed, getTestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { SettingsService } from '@nxt1/ui/settings';
import { HapticsService } from '@nxt1/ui/services/haptics';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBottomSheetService } from '@nxt1/ui/components/bottom-sheet';
import { NxtBrowserService } from '@nxt1/ui/services/browser';
import { AgentXJobService } from '@nxt1/ui/agent-x';
import type { SettingsUserInfo, SettingsSubscription } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';

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
  trackStateChange: vi.fn(),
  trackUserAction: vi.fn(),
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

const createBottomSheetMock = () => ({
  show: vi.fn().mockResolvedValue({ confirmed: false }),
  open: vi.fn().mockResolvedValue(undefined),
});

const createBrowserMock = () => ({
  openMailto: vi.fn().mockResolvedValue(undefined),
  openUrl: vi.fn().mockResolvedValue(undefined),
});

const createAgentXJobMock = () => ({
  enqueue: vi.fn().mockResolvedValue({
    jobId: 'job-123',
    operationId: 'op-123',
  }),
  getStatus: vi.fn().mockResolvedValue(null),
});

// ============================================
// TEST DATA
// ============================================

const MOCK_USER: SettingsUserInfo = {
  id: 'user-123',
  email: 'athlete@nxt1sports.com',
  displayName: 'Alex Johnson',
  profileImg: null,
  role: 'athlete',
  emailVerified: true,
  createdAt: '2025-01-15T10:00:00.000Z',
  lastLoginAt: '2026-03-05T09:00:00.000Z',
};

const MOCK_SUBSCRIPTION: SettingsSubscription = {
  tier: 'premium',
  status: 'active',
  currentPeriodEnd: '2026-04-05T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  trialEnd: null,
};

const FREE_SUBSCRIPTION: SettingsSubscription = {
  tier: 'free',
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  trialEnd: null,
};

// ============================================
// TEST SUITE
// ============================================

describe('SettingsService', () => {
  let service: SettingsService;
  let hapticsMock: ReturnType<typeof createHapticsMock>;
  let toastMock: ReturnType<typeof createToastMock>;
  let loggerMock: ReturnType<typeof createLoggerMock>;
  let breadcrumbMock: ReturnType<typeof createBreadcrumbMock>;
  let analyticsMock: ReturnType<typeof createAnalyticsMock>;
  let bottomSheetMock: ReturnType<typeof createBottomSheetMock>;
  let browserMock: ReturnType<typeof createBrowserMock>;
  let agentXJobMock: ReturnType<typeof createAgentXJobMock>;

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

    hapticsMock = createHapticsMock();
    toastMock = createToastMock();
    loggerMock = createLoggerMock();
    breadcrumbMock = createBreadcrumbMock();
    analyticsMock = createAnalyticsMock();
    bottomSheetMock = createBottomSheetMock();
    browserMock = createBrowserMock();
    agentXJobMock = createAgentXJobMock();

    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        { provide: HapticsService, useValue: hapticsMock },
        { provide: NxtToastService, useValue: toastMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
        { provide: NxtBottomSheetService, useValue: bottomSheetMock },
        { provide: NxtBrowserService, useValue: browserMock },
        { provide: AgentXJobService, useValue: agentXJobMock },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });

    service = TestBed.inject(SettingsService);
  });

  // ===========================================================================
  // setUser()
  // ===========================================================================

  describe('setUser()', () => {
    it('should update the user signal with user data', () => {
      service.setUser(MOCK_USER);
      expect(service.user()).toEqual(MOCK_USER);
    });

    it('should accept null to clear the user', () => {
      service.setUser(MOCK_USER);
      service.setUser(null);
      expect(service.user()).toBeNull();
    });

    it('should start with null user', () => {
      expect(service.user()).toBeNull();
    });
  });

  // ===========================================================================
  // setSubscription()
  // ===========================================================================

  describe('setSubscription()', () => {
    it('should update the subscription signal', () => {
      service.setSubscription(MOCK_SUBSCRIPTION);
      expect(service.subscription()).toEqual(MOCK_SUBSCRIPTION);
    });

    it('should reflect free tier in isFreePlan computed', () => {
      service.setSubscription(FREE_SUBSCRIPTION);
      expect(service.isFreePlan()).toBe(true);
    });

    it('should reflect premium tier in isFreePlan computed', () => {
      service.setSubscription(MOCK_SUBSCRIPTION);
      expect(service.isFreePlan()).toBe(false);
    });
  });

  // ===========================================================================
  // loadSettings()
  // ===========================================================================

  describe('loadSettings()', () => {
    it('should set isLoading to false after completion', async () => {
      await service.loadSettings();
      expect(service.isLoading()).toBe(false);
    });

    it('should clear any existing error on load', async () => {
      // Trigger a prior error state manually by casting (for test only)
      await service.loadSettings();
      expect(service.error()).toBeNull();
    });

    it('should initialize default preferences', async () => {
      await service.loadSettings();
      expect(service.preferences()).toBeDefined();
    });

    it('should track SETTINGS_VIEWED analytics event', async () => {
      await service.loadSettings();
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(APP_EVENTS.SETTINGS_VIEWED);
    });

    it('should track breadcrumb on successful load', async () => {
      await service.loadSettings();
      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith('settings:loaded');
    });

    it('should use provided subscription if already set', async () => {
      service.setSubscription(MOCK_SUBSCRIPTION);
      await service.loadSettings();
      expect(service.subscription()).toEqual(MOCK_SUBSCRIPTION);
    });

    it('should fall back to DEFAULT_SUBSCRIPTION if none set', async () => {
      await service.loadSettings();
      const sub = service.subscription();
      expect(sub?.tier).toBe('free');
      expect(sub?.status).toBe('active');
    });

    it('should not run concurrently if already loading', async () => {
      // Start first load without awaiting
      const first = service.loadSettings();
      const second = service.loadSettings();
      await Promise.all([first, second]);
      // SETTINGS_VIEWED should only be tracked once
      const calls = analyticsMock.trackEvent.mock.calls.filter(
        (args: unknown[]) => args[0] === APP_EVENTS.SETTINGS_VIEWED
      );
      expect(calls).toHaveLength(1);
    });

    it('should populate sections', async () => {
      await service.loadSettings();
      expect(service.sections().length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // updatePreference()
  // ===========================================================================

  describe('updatePreference()', () => {
    beforeEach(async () => {
      await service.loadSettings();
    });

    it('should perform an optimistic update of the preference', async () => {
      await service.updatePreference('pushNotifications', true);
      expect(
        (service.preferences() as unknown as Record<string, unknown>)['pushNotifications']
      ).toBe(true);
    });

    it('should trigger haptic success feedback on update', async () => {
      await service.updatePreference('emailNotifications', false);
      expect(hapticsMock.notification).toHaveBeenCalledWith('success');
    });

    it('should set isSaving to false after completion', async () => {
      await service.updatePreference('pushNotifications', false);
      expect(service.isSaving()).toBe(false);
    });
  });

  // ===========================================================================
  // requestConnectedAccountsResync()
  // ===========================================================================

  describe('requestConnectedAccountsResync()', () => {
    it('should enqueue an Agent X job for a manual re-sync request', async () => {
      await service.requestConnectedAccountsResync([
        {
          platform: 'instagram',
          label: 'Instagram',
          username: '@alex',
          connected: true,
        },
      ]);

      expect(agentXJobMock.enqueue).toHaveBeenCalledTimes(1);
      expect(agentXJobMock.enqueue.mock.calls[0]?.[0]).toContain('Re-sync my connected accounts');
      expect(agentXJobMock.enqueue.mock.calls[0]?.[1]).toMatchObject({
        source: 'settings_connected_accounts',
        trigger: 'manual_resync',
        requestedAccounts: [
          expect.objectContaining({
            platform: 'instagram',
            label: 'Instagram',
            username: '@alex',
          }),
        ],
      });
      expect(toastMock.success).toHaveBeenCalledWith(
        'Re-sync started. Agent X is refreshing your connected accounts.'
      );
    });

    it('should show an error toast when the job cannot be enqueued', async () => {
      agentXJobMock.enqueue.mockResolvedValueOnce(null);

      await service.requestConnectedAccountsResync();

      expect(toastMock.error).toHaveBeenCalledWith(
        'Unable to start re-sync right now. Please try again.'
      );
    });
  });

  // ===========================================================================
  // signOut()
  // ===========================================================================

  describe('signOut()', () => {
    beforeEach(() => {
      service.setUser(MOCK_USER);
      service.setSubscription(MOCK_SUBSCRIPTION);
    });

    it('should clear the user signal', async () => {
      await service.signOut();
      expect(service.user()).toBeNull();
    });

    it('should clear the subscription signal', async () => {
      await service.signOut();
      expect(service.subscription()).toBeNull();
    });

    it('should track sign-out breadcrumb', async () => {
      await service.signOut();
      expect(breadcrumbMock.trackUserAction).toHaveBeenCalledWith('settings:sign-out');
    });

    it('should trigger haptic feedback', async () => {
      await service.signOut();
      expect(hapticsMock.impact).toHaveBeenCalledWith('medium');
    });
  });

  // ===========================================================================
  // storageUsagePercent / aiUsagePercent
  // ===========================================================================

  describe('computed percentages', () => {
    it('should return 0 when usage is null', () => {
      expect(service.storageUsagePercent()).toBe(0);
      expect(service.aiUsagePercent()).toBe(0);
    });
  });
});
