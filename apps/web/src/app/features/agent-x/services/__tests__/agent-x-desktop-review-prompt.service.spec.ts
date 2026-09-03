import '@angular/compiler';
import { Injector, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtOverlayService } from '@nxt1/ui/components/overlay';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { PerformanceService } from '../../../../core/services/infrastructure/performance.service';
import {
  __agentXDesktopReviewPromptServiceTestUtils,
  AgentXDesktopReviewPromptService,
} from '../agent-x-desktop-review-prompt.service';

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

const createOverlayMock = () => ({
  open: vi.fn(),
  isOpen: vi.fn().mockReturnValue(false),
});

const createAnalyticsMock = () => ({
  trackEvent: vi.fn(),
});

const createBreadcrumbMock = () => ({
  trackStateChange: vi.fn(),
  trackFormSubmit: vi.fn(),
});

const createPerformanceMock = () => ({
  trace: vi.fn(async (_name: string, fn: () => Promise<unknown>) => await fn()),
});

function createService() {
  const httpMock = { post: vi.fn() };
  const overlayMock = createOverlayMock();
  const analyticsMock = createAnalyticsMock();
  const breadcrumbMock = createBreadcrumbMock();
  const loggerMock = createLoggerMock();
  const performanceMock = createPerformanceMock();

  const platformMock = {
    isDesktop: vi.fn().mockReturnValue(true),
  };

  const injector = Injector.create({
    providers: [
      { provide: HttpClient, useValue: httpMock },
      { provide: NxtOverlayService, useValue: overlayMock },
      { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
      { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
      { provide: NxtLoggingService, useValue: loggerMock },
      { provide: NxtPlatformService, useValue: platformMock },
      { provide: PerformanceService, useValue: performanceMock },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });

  const service = runInInjectionContext(injector, () => new AgentXDesktopReviewPromptService());

  return {
    service,
    httpMock,
    overlayMock,
    analyticsMock,
    breadcrumbMock,
    loggerChild: loggerMock._child,
    performanceMock,
    platformMock,
  };
}

describe('AgentXDesktopReviewPromptService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    __agentXDesktopReviewPromptServiceTestUtils.resetSessionPromptState();
  });

  it('opens the desktop review prompt once for eligible desktop users', async () => {
    const { service, overlayMock, analyticsMock } = createService();
    let resolveClosed!: (value: { reason: 'close'; data: { action: 'dismissed' } }) => void;
    overlayMock.open.mockReturnValue({
      closed: new Promise((resolve) => {
        resolveClosed = resolve;
      }),
    });

    const promise = service.maybePrompt({ uid: 'user-1', hasCompletedOnboarding: true });
    await vi.advanceTimersByTimeAsync(1800);

    expect(overlayMock.open).toHaveBeenCalledTimes(1);
    expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
      APP_EVENTS.AGENT_X_DESKTOP_REVIEW_PROMPT_VIEWED,
      expect.objectContaining({ promptVersion: 'agent-x-desktop-review-v1' })
    );

    resolveClosed({ reason: 'close', data: { action: 'dismissed' } });
    await promise;
  });

  it('does not open on non-desktop platforms', async () => {
    const { service, overlayMock, platformMock } = createService();
    platformMock.isDesktop.mockReturnValue(false);

    await service.maybePrompt({ uid: 'user-1', hasCompletedOnboarding: true });

    expect(overlayMock.open).not.toHaveBeenCalled();
  });

  it('submits the review through the backend callback provided to the overlay component', async () => {
    const { service, overlayMock, httpMock, analyticsMock, breadcrumbMock, performanceMock } =
      createService();
    let resolveClosed!: (value: { reason: 'close'; data: { action: 'submitted' } }) => void;
    let submitReview!: (rating: number, reviewText: string) => Promise<void>;

    httpMock.post.mockReturnValue(of({ success: true, data: { delivered: true } }));
    overlayMock.open.mockImplementation(
      (config: { inputs: { submitReview: typeof submitReview } }) => {
        submitReview = config.inputs.submitReview;
        return {
          closed: new Promise((resolve) => {
            resolveClosed = resolve;
          }),
        };
      }
    );

    const promptPromise = service.maybePrompt({ uid: 'user-2', hasCompletedOnboarding: true });
    await vi.advanceTimersByTimeAsync(1800);

    await submitReview(
      5,
      'Agent X should make it easier to resume previous work without restating context.'
    );
    resolveClosed({ reason: 'close', data: { action: 'submitted' } });
    await promptPromise;

    expect(httpMock.post).toHaveBeenCalledWith(
      expect.stringContaining('/agent-x/reviews'),
      expect.objectContaining({
        rating: 5,
        surface: 'desktop_web',
        promptVersion: 'agent-x-desktop-review-v1',
      })
    );
    expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
      APP_EVENTS.AGENT_X_DESKTOP_REVIEW_PROMPT_SUBMITTED,
      expect.objectContaining({ rating: 5, textLength: expect.any(Number) })
    );
    expect(breadcrumbMock.trackFormSubmit).toHaveBeenCalled();
    expect(performanceMock.trace).toHaveBeenCalled();
  });

  it('submits when only a rating is provided', async () => {
    const { service, overlayMock, httpMock } = createService();
    let resolveClosed!: (value: { reason: 'close'; data: { action: 'submitted' } }) => void;
    let submitReview!: (rating: number, reviewText: string) => Promise<void>;

    httpMock.post.mockReturnValue(of({ success: true, data: { delivered: true } }));
    overlayMock.open.mockImplementation(
      (config: { inputs: { submitReview: typeof submitReview } }) => {
        submitReview = config.inputs.submitReview;
        return {
          closed: new Promise((resolve) => {
            resolveClosed = resolve;
          }),
        };
      }
    );

    const promptPromise = service.maybePrompt({ uid: 'user-4', hasCompletedOnboarding: true });
    await vi.advanceTimersByTimeAsync(1800);

    await submitReview(3, '');
    resolveClosed({ reason: 'close', data: { action: 'submitted' } });
    await promptPromise;

    expect(httpMock.post).toHaveBeenCalledWith(
      expect.stringContaining('/agent-x/reviews'),
      expect.objectContaining({ rating: 3, reviewText: '' })
    );
  });

  it('rethrows a backend failure from submitReview', async () => {
    const { service, overlayMock, httpMock } = createService();
    let submitReview!: (rating: number, reviewText: string) => Promise<void>;

    httpMock.post.mockReturnValue(
      of({ success: false, error: 'Review could not be delivered right now' })
    );
    overlayMock.open.mockImplementation(
      (config: { inputs: { submitReview: typeof submitReview } }) => {
        submitReview = config.inputs.submitReview;
        return {
          closed: Promise.resolve({ reason: 'close', data: { action: 'dismissed' } }),
        };
      }
    );

    const promptPromise = service.maybePrompt({ uid: 'user-3', hasCompletedOnboarding: true });
    await vi.advanceTimersByTimeAsync(1800);

    await expect(
      submitReview(2, 'Agent X needs a cleaner way to navigate recent operations and outcomes.')
    ).rejects.toThrow('Review could not be delivered right now');

    await promptPromise;
  });
});
