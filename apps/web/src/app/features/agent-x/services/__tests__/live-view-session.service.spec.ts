/**
 * @fileoverview LiveViewSessionService Unit Tests
 * @module @nxt1/web/features/agent-x
 *
 * Unit tests for the LiveViewSessionService (packages/ui/agent-x).
 * Covers: startSession, navigate, refresh, closeSession, adoptSession,
 * signal state management, analytics tracking, and error handling.
 *
 * Uses Injector.create + runInInjectionContext instead of TestBed to avoid
 * Angular's NgModule scanning of Ionic mock stubs. The Ionic mock is
 * necessary because NxtToastService → NxtPlatformService transitively
 * imports from @ionic/angular/standalone which uses unsupported ESM
 * directory imports in Node.js.
 */

import '@angular/compiler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub @ionic/angular/standalone before any @nxt1/ui module loads the FESM
// bundle. Must include ALL symbols used by transitive deps:
// - ToastController (NxtToastService)
// - Platform (NxtPlatformService, injected by toast + control-panel-state)
vi.mock('@ionic/angular/standalone', () => ({
  ToastController: class {
    async create() {
      return {
        present: async () => undefined,
        dismiss: async () => undefined,
        onDidDismiss: async () => ({}),
      };
    }
  },
  Platform: class {
    is() {
      return false;
    }
    async ready() {
      return 'dom';
    }
    width() {
      return 0;
    }
    height() {
      return 0;
    }
  },
}));

import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import type { LiveViewSession } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { LiveViewSessionService } from '../../../../../../../../packages/ui/src/agent-x/live-view-session.service';
import { AGENT_X_API_BASE_URL } from '../../../../../../../../packages/ui/src/agent-x/agent-x-job.service';
import { NxtToastService } from '../../../../../../../../packages/ui/src/services/toast';
import { NxtLoggingService } from '../../../../../../../../packages/ui/src/services/logging';
import { NxtBreadcrumbService } from '../../../../../../../../packages/ui/src/services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../../../../../../packages/ui/src/services/analytics/analytics-adapter.token';
import { PERFORMANCE_ADAPTER } from '../../../../../../../../packages/ui/src/services/performance';

// ============================================
// MOCK FACTORIES
// ============================================

const createLoggerChild = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const createLoggerMock = () => {
  const child = createLoggerChild();
  return {
    _child: child,
    child: vi.fn().mockReturnValue(child),
  };
};

const createToastMock = () => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
});

const createBreadcrumbMock = () => ({
  trackStateChange: vi.fn().mockResolvedValue(undefined),
  trackUserAction: vi.fn().mockResolvedValue(undefined),
});

const createTraceMock = () => ({
  putAttribute: vi.fn().mockResolvedValue(undefined),
  putMetric: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
});

const createPerformanceMock = () => ({
  startTrace: vi.fn().mockResolvedValue(createTraceMock()),
});

const createAnalyticsMock = () => ({
  trackEvent: vi.fn(),
  setUserProperties: vi.fn(),
});

// ============================================
// TEST DATA
// ============================================

const MOCK_SESSION: LiveViewSession = {
  sessionId: 'test-session-123',
  interactiveUrl: 'https://connect.firecrawl.dev/session/abc123',
  requestedUrl: 'https://www.hudl.com',
  resolvedUrl: 'https://www.hudl.com/',
  destinationTier: 'platform',
  platformKey: 'hudl_signin',
  domainLabel: 'hudl.com',
  authStatus: 'authenticated',
  capabilities: {
    canRefresh: true,
    canNavigate: true,
    hasAuthProfile: true,
  },
  createdAt: '2026-04-06T12:00:00.000Z',
  expiresAt: '2026-04-06T12:10:00.000Z',
};

const MOCK_EPHEMERAL_SESSION: LiveViewSession = {
  sessionId: 'test-session-456',
  interactiveUrl: 'https://connect.firecrawl.dev/session/def456',
  requestedUrl: 'https://www.example.com',
  resolvedUrl: 'https://www.example.com/',
  destinationTier: 'arbitrary',
  domainLabel: 'example.com',
  authStatus: 'ephemeral',
  capabilities: {
    canRefresh: true,
    canNavigate: true,
    hasAuthProfile: false,
  },
  createdAt: '2026-04-06T12:00:00.000Z',
  expiresAt: '2026-04-06T12:10:00.000Z',
};

// ============================================
// SERVICE FACTORY (bypasses TestBed NgModule scanning)
// ============================================

function createService() {
  const httpMock = { post: vi.fn() };
  const loggerMock = createLoggerMock();
  const toastMock = createToastMock();
  const analyticsMock = createAnalyticsMock();
  const _breadcrumbMock = createBreadcrumbMock();
  const performanceMock = createPerformanceMock();

  const injector = Injector.create({
    providers: [
      { provide: HttpClient, useValue: httpMock },
      { provide: AGENT_X_API_BASE_URL, useValue: '/api' },
      { provide: NxtToastService, useValue: toastMock },
      { provide: NxtLoggingService, useValue: loggerMock },
      { provide: NxtBreadcrumbService, useValue: _breadcrumbMock },
      { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
      { provide: PERFORMANCE_ADAPTER, useValue: performanceMock },
    ],
  });

  const service = runInInjectionContext(injector, () => new LiveViewSessionService());

  return {
    service,
    httpMock,
    loggerChild: loggerMock._child,
    toastMock,
    analyticsMock,
    breadcrumbMock: _breadcrumbMock,
    performanceMock,
  };
}

// ============================================
// TEST SUITE
// ============================================

describe('LiveViewSessionService', () => {
  let service: LiveViewSessionService;
  let httpMock: { post: ReturnType<typeof vi.fn> };
  let loggerChild: ReturnType<typeof createLoggerChild>;
  let toastMock: ReturnType<typeof createToastMock>;
  let analyticsMock: ReturnType<typeof createAnalyticsMock>;
  let performanceMock: ReturnType<typeof createPerformanceMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    const ctx = createService();
    service = ctx.service;
    httpMock = ctx.httpMock;
    loggerChild = ctx.loggerChild;
    toastMock = ctx.toastMock;
    analyticsMock = ctx.analyticsMock;
    performanceMock = ctx.performanceMock;
  });

  // ─── Initial State ────────────────────────────────────────────────

  describe('initial state', () => {
    it('should have no active session', () => {
      expect(service.activeSession()).toBeNull();
      expect(service.hasActiveSession()).toBe(false);
    });

    it('should not be loading', () => {
      expect(service.loading()).toBe(false);
    });

    it('should have no error', () => {
      expect(service.error()).toBeNull();
    });
  });

  // ─── startSession ─────────────────────────────────────────────────

  describe('startSession', () => {
    it('should start an authenticated session and update signals', async () => {
      httpMock.post.mockReturnValue(of({ success: true, data: MOCK_SESSION }));

      const result = await service.startSession('https://www.hudl.com', 'hudl_signin');

      expect(result).toEqual(MOCK_SESSION);
      expect(service.activeSession()).toEqual(MOCK_SESSION);
      expect(service.hasActiveSession()).toBe(true);
      expect(service.loading()).toBe(false);
      expect(service.error()).toBeNull();
    });

    it('should send correct HTTP request with platformKey', async () => {
      httpMock.post.mockReturnValue(of({ success: true, data: MOCK_SESSION }));

      await service.startSession('https://www.hudl.com', 'hudl_signin');

      expect(httpMock.post).toHaveBeenCalledWith('/api/agent-x/live-view/start', {
        url: 'https://www.hudl.com',
        platformKey: 'hudl_signin',
      });
    });

    it('should omit platformKey when not provided', async () => {
      httpMock.post.mockReturnValue(of({ success: true, data: MOCK_EPHEMERAL_SESSION }));

      await service.startSession('https://www.example.com');

      expect(httpMock.post).toHaveBeenCalledWith('/api/agent-x/live-view/start', {
        url: 'https://www.example.com',
      });
    });

    it('should track SESSION_STARTED analytics event', async () => {
      httpMock.post.mockReturnValue(of({ success: true, data: MOCK_SESSION }));

      await service.startSession('https://www.hudl.com');

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_SESSION_STARTED,
        expect.objectContaining({
          destination_tier: 'platform',
          auth_status: 'authenticated',
          platform_key: 'hudl_signin',
        })
      );
    });

    it('should track AUTH_REUSED for authenticated sessions', async () => {
      httpMock.post.mockReturnValue(of({ success: true, data: MOCK_SESSION }));

      await service.startSession('https://www.hudl.com');

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_AUTH_REUSED,
        expect.objectContaining({ platform_key: 'hudl_signin' })
      );
    });

    it('should track AUTH_EXPIRED and show warning toast for expired sessions', async () => {
      const expiredSession: LiveViewSession = {
        ...MOCK_SESSION,
        authStatus: 'expired',
      };
      httpMock.post.mockReturnValue(of({ success: true, data: expiredSession }));

      await service.startSession('https://www.hudl.com');

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_AUTH_EXPIRED,
        expect.objectContaining({ platform_key: 'hudl_signin' })
      );
      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('expired'));
    });

    it('should return null and set error on backend rejection', async () => {
      httpMock.post.mockReturnValue(of({ success: false, error: 'Rate limited' }));

      const result = await service.startSession('https://www.example.com');

      expect(result).toBeNull();
      expect(service.activeSession()).toBeNull();
      expect(service.error()).toBe('Rate limited');
      expect(service.loading()).toBe(false);
    });

    it('should return null and track SESSION_FAILED on HTTP error', async () => {
      httpMock.post.mockReturnValue(throwError(() => new Error('Network error')));

      const result = await service.startSession('https://www.example.com');

      expect(result).toBeNull();
      expect(service.error()).toBe('Network error');
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_SESSION_FAILED,
        expect.objectContaining({ url: 'https://www.example.com', error: 'Network error' })
      );
    });

    it('should start and stop a performance trace', async () => {
      const traceMock = createTraceMock();
      performanceMock.startTrace.mockResolvedValue(traceMock);
      httpMock.post.mockReturnValue(of({ success: true, data: MOCK_SESSION }));

      await service.startSession('https://www.hudl.com');

      expect(performanceMock.startTrace).toHaveBeenCalledWith('live_view_session_start');
      expect(traceMock.putAttribute).toHaveBeenCalledWith('success', 'true');
      expect(traceMock.stop).toHaveBeenCalled();
    });
  });

  // ─── navigate ─────────────────────────────────────────────────────

  describe('navigate', () => {
    beforeEach(async () => {
      httpMock.post.mockReturnValue(of({ success: true, data: MOCK_SESSION }));
      await service.startSession('https://www.hudl.com');
      vi.clearAllMocks();
    });

    it('should return false when no active session', async () => {
      // Close the session first
      httpMock.post.mockReturnValue(of({ success: true }));
      await service.closeSession();
      vi.clearAllMocks();

      const result = await service.navigate('https://www.hudl.com/video');
      expect(result).toBe(false);
    });

    it('should navigate and track analytics', async () => {
      httpMock.post.mockReturnValue(
        of({ success: true, data: { resolvedUrl: 'https://www.hudl.com/video' } })
      );

      const result = await service.navigate('https://www.hudl.com/video');

      expect(result).toBe(true);
      expect(httpMock.post).toHaveBeenCalledWith('/api/agent-x/live-view/navigate', {
        sessionId: MOCK_SESSION.sessionId,
        url: 'https://www.hudl.com/video',
      });
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_NAVIGATED,
        expect.objectContaining({ session_id: MOCK_SESSION.sessionId })
      );
    });

    it('should clear session on "not found" error', async () => {
      httpMock.post.mockReturnValue(throwError(() => new Error('Session not found')));

      await service.navigate('https://www.hudl.com/video');

      expect(service.activeSession()).toBeNull();
      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('expired'));
    });
  });

  // ─── refresh ──────────────────────────────────────────────────────

  describe('refresh', () => {
    it('should return false when no active session', async () => {
      const result = await service.refresh();
      expect(result).toBe(false);
    });

    it('should refresh and track analytics', async () => {
      httpMock.post.mockReturnValue(of({ success: true, data: MOCK_SESSION }));
      await service.startSession('https://www.hudl.com');
      vi.clearAllMocks();

      httpMock.post.mockReturnValue(of({ success: true }));
      const result = await service.refresh();

      expect(result).toBe(true);
      expect(httpMock.post).toHaveBeenCalledWith('/api/agent-x/live-view/refresh', {
        sessionId: MOCK_SESSION.sessionId,
      });
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_REFRESHED,
        expect.objectContaining({ session_id: MOCK_SESSION.sessionId })
      );
    });
  });

  // ─── closeSession ─────────────────────────────────────────────────

  describe('closeSession', () => {
    it('should no-op when no active session', async () => {
      await service.closeSession();
      expect(httpMock.post).not.toHaveBeenCalled();
    });

    it('should clear local state immediately (optimistic)', async () => {
      service.adoptSession(MOCK_SESSION);
      expect(service.hasActiveSession()).toBe(true);

      httpMock.post.mockReturnValue(of({ success: true }));
      await service.closeSession();

      expect(service.activeSession()).toBeNull();
      expect(service.hasActiveSession()).toBe(false);
    });

    it('should track SESSION_CLOSED analytics', async () => {
      service.adoptSession(MOCK_SESSION);
      httpMock.post.mockReturnValue(of({ success: true }));

      await service.closeSession();

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_SESSION_CLOSED,
        expect.objectContaining({
          session_id: MOCK_SESSION.sessionId,
          destination_tier: 'platform',
        })
      );
    });

    it('should handle close errors gracefully (best-effort)', async () => {
      service.adoptSession(MOCK_SESSION);
      httpMock.post.mockReturnValue(throwError(() => new Error('Network error')));

      await service.closeSession();

      expect(service.activeSession()).toBeNull();
      expect(loggerChild.warn).toHaveBeenCalled();
    });
  });

  // ─── adoptSession ─────────────────────────────────────────────────

  describe('adoptSession', () => {
    it('should set the active session from backend contract', () => {
      service.adoptSession(MOCK_SESSION);

      expect(service.activeSession()).toEqual(MOCK_SESSION);
      expect(service.hasActiveSession()).toBe(true);
      expect(service.error()).toBeNull();
    });

    it('should track AUTO_OPENED analytics', () => {
      service.adoptSession(MOCK_SESSION);

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_AUTO_OPENED,
        expect.objectContaining({
          session_id: MOCK_SESSION.sessionId,
          destination_tier: 'platform',
          platform_key: 'hudl_signin',
        })
      );
    });

    it('should handle session without platformKey', () => {
      service.adoptSession(MOCK_EPHEMERAL_SESSION);

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.LIVE_VIEW_AUTO_OPENED,
        expect.objectContaining({
          platform_key: 'none',
        })
      );
    });
  });

  // ─── Error Handling ───────────────────────────────────────────────

  describe('error handling', () => {
    it('should show warning toast for "Another session" errors', async () => {
      httpMock.post.mockReturnValue(
        of({ success: false, error: 'Another session is currently active' })
      );

      await service.startSession('https://www.example.com');

      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('Another session'));
    });

    it('should show warning toast for rate limit errors', async () => {
      httpMock.post.mockReturnValue(of({ success: false, error: 'Too many requests (429)' }));

      await service.startSession('https://www.example.com');

      expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('Too many'));
    });

    it('should show error toast for generic errors', async () => {
      httpMock.post.mockReturnValue(of({ success: false, error: 'Internal server error' }));

      await service.startSession('https://www.example.com');

      expect(toastMock.error).toHaveBeenCalledWith('Internal server error');
    });
  });
});
