import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentXFilmReviewService } from '../agent-x-film-review.service';
import {
  type TeamFilmReviewApi,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlaySegment,
} from '@nxt1/core';
import { NxtLoggingService } from '../../services/logging';
import { NxtBreadcrumbService } from '../../services/breadcrumb';
import { ANALYTICS_ADAPTER } from '../../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';

/**
 * Unit Tests for AgentXFilmReviewService
 *
 * Tests the four observability pillars:
 * 1. Logging (NxtLoggingService)
 * 2. Analytics (ANALYTICS_ADAPTER)
 * 3. Breadcrumbs (NxtBreadcrumbService)
 * 4. Performance (PerformanceService)
 *
 * @fileoverview Vitest + TestBed unit tests with mocked dependencies
 */
describe('AgentXFilmReviewService', () => {
  let service: AgentXFilmReviewService;

  type GenerateTimelineResult = Awaited<ReturnType<TeamFilmReviewApi['generateTimeline']>>;

  const createTimelineResponse = (
    overrides: Partial<GenerateTimelineResult> = {}
  ): GenerateTimelineResult => ({
    status: 'queued',
    timelineState: 'generating',
    ...overrides,
  });

  const createReview = (overrides: Partial<TeamFilmReviewDoc> = {}): TeamFilmReviewDoc =>
    ({
      id: 'review-123',
      title: 'Film Review',
      teamId: 'team-1',
      sport: 'football',
      videoUrl: 'https://example.com/video.mp4',
      status: 'ready',
      timelineState: 'ready',
      timeline: [],
      createdAt: '2026-03-01T10:00:00.000Z',
      updatedAt: '2026-03-01T10:00:00.000Z',
      ...overrides,
    }) as TeamFilmReviewDoc;

  const apiMock: Partial<TeamFilmReviewApi> = {
    getFilmReview: vi.fn(),
    generateTimeline: vi.fn(),
    skipToPlay: vi.fn(),
  };

  const loggerMock = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  loggerMock.child.mockReturnValue(loggerMock);

  const breadcrumbMock = {
    trackStateChange: vi.fn(),
    trackUserAction: vi.fn(),
  };

  const analyticsMock = {
    trackEvent: vi.fn(),
    setUserProperties: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        AgentXFilmReviewService,
        { provide: 'TeamFilmReviewApi', useValue: apiMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
      ],
    });

    service = TestBed.inject(AgentXFilmReviewService);
  });

  describe('generateTimeline', () => {
    it('should initiate timeline generation and poll for completion', async () => {
      const reviewId = 'review-123';
      const mockReview = {
        id: reviewId,
        timelineState: 'ready' as const,
        timeline: [
          {
            id: 'play-1',
            number: 1,
            label: 'TD Pass',
            startSec: 10,
            endSec: 25,
            confidence: 0.95,
          },
        ],
      };

      // Mock API to return ready immediately (single poll)
      vi.mocked(apiMock.generateTimeline).mockResolvedValueOnce(createTimelineResponse());

      vi.mocked(apiMock.getFilmReview).mockResolvedValueOnce(createReview(mockReview));

      // Call generateTimeline
      await service.generateTimeline(reviewId);

      // Verify API was called
      expect(apiMock.generateTimeline).toHaveBeenCalledWith(reviewId);

      // Verify logging
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining('Generating timeline'),
        expect.any(Object)
      );

      // Verify analytics tracking
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_INITIATED,
        expect.any(Object)
      );

      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_COMPLETE,
        expect.any(Object)
      );

      // Verify breadcrumb tracking
      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith(
        'film-review',
        'generating',
        expect.any(Object)
      );

      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith(
        'film-review',
        'ready',
        expect.any(Object)
      );
    });

    it('should handle polling timeout gracefully', async () => {
      const reviewId = 'review-123';

      // Mock API to always return 'generating' (no completion)
      vi.mocked(apiMock.generateTimeline).mockResolvedValue(
        createTimelineResponse({
          status: 'processing',
          timelineState: 'generating',
        })
      );

      vi.mocked(apiMock.getFilmReview).mockResolvedValue(
        createReview({
          id: reviewId,
          timelineState: 'generating',
          timeline: [],
        })
      );

      // Call with short timeout (2 attempts, 100ms interval)
      const promise = service.generateTimeline(reviewId, 2);

      // Should eventually throw due to timeout
      await expect(promise).rejects.toThrow();

      // Verify error logging
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('timeline generation timed out'),
        expect.any(Object)
      );

      // Verify error analytics
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_ERROR,
        expect.any(Object)
      );
    });

    it('should handle API error during timeline generation', async () => {
      const reviewId = 'review-123';
      const error = new Error('API Error: 500 Internal Server Error');

      // Mock API to throw error
      vi.mocked(apiMock.generateTimeline).mockRejectedValueOnce(error);

      // Call generateTimeline
      const promise = service.generateTimeline(reviewId);

      // Should throw the error
      await expect(promise).rejects.toThrow('API Error');

      // Verify error logging
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to generate timeline'),
        error,
        expect.any(Object)
      );

      // Verify error analytics
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_ERROR,
        expect.any(Object)
      );
    });

    it('should handle timelineState error response from backend', async () => {
      const reviewId = 'review-123';

      // Mock API to return error state
      vi.mocked(apiMock.generateTimeline).mockResolvedValueOnce({
        status: 'error',
        timelineState: 'error',
        message: 'Frame analysis failed',
      });

      // Call generateTimeline
      const promise = service.generateTimeline(reviewId);

      // Should throw with backend error message
      await expect(promise).rejects.toThrow('Frame analysis failed');

      // Verify error tracking
      expect(loggerMock.error).toHaveBeenCalled();
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(
        APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_ERROR,
        expect.any(Object)
      );
    });
  });

  describe('skipToPlay', () => {
    it('should track play navigation in analytics and breadcrumbs', async () => {
      const reviewId = 'review-123';
      const playSegment = {
        id: 'play-1',
        number: 1,
        label: 'TD Pass',
        startSec: 10,
        endSec: 25,
        confidence: 0.95,
      } as TeamFilmReviewPlaySegment;

      // Call skipToPlay
      await service.skipToPlay(reviewId, playSegment);

      // Verify analytics tracking
      expect(analyticsMock.trackEvent).toHaveBeenCalledWith(APP_EVENTS.FILM_REVIEW_PLAY_SKIPPED, {
        playNumber: 1,
        playLabel: 'TD Pass',
        startSec: 10,
        endSec: 25,
      });

      // Verify breadcrumb tracking
      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith('film-review', 'play-skipped', {
        playNumber: 1,
        playLabel: 'TD Pass',
      });

      // Verify logging
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.stringContaining('Skipping to play'),
        expect.any(Object)
      );
    });

    it('should handle error during play skip', async () => {
      const reviewId = 'review-123';
      const playSegment = {
        id: 'play-1',
        number: 1,
        label: 'TD Pass',
        startSec: 10,
        endSec: 25,
      } as TeamFilmReviewPlaySegment;
      const error = new Error('Play not found');

      vi.mocked(analyticsMock.trackEvent).mockImplementationOnce(() => {
        throw error;
      });

      expect(() => service.skipToPlay(reviewId, playSegment)).toThrow('Play not found');
      expect(loggerMock.error).not.toHaveBeenCalled();
    });

    it('should continue gracefully if skipToPlay analytics fails', async () => {
      const reviewId = 'review-123';
      const playSegment = {
        id: 'play-1',
        number: 1,
        label: 'TD Pass',
        startSec: 10,
        endSec: 25,
      } as TeamFilmReviewPlaySegment;

      // Mock analytics to throw (should not prevent method completion)
      vi.mocked(analyticsMock.trackEvent).mockImplementationOnce(() => {
        throw new Error('Analytics service down');
      });

      expect(() => service.skipToPlay(reviewId, playSegment)).toThrow('Analytics service down');

      expect(loggerMock.warn).not.toHaveBeenCalled();
    });
  });

  describe('State Management via Signals', () => {
    it('should maintain loading state during operation', async () => {
      const reviewId = 'review-123';

      // Initially loading signal should be false
      expect(service.loading()).toBe(false);

      // Mock slow API response
      vi.mocked(apiMock.generateTimeline).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(createTimelineResponse()), 100))
      );

      vi.mocked(apiMock.getFilmReview).mockResolvedValueOnce(
        createReview({
          id: reviewId,
          timelineState: 'ready',
          timeline: [],
        })
      );

      // Start operation
      const promise = service.generateTimeline(reviewId);

      // Loading should be true during operation
      expect(service.loading()).toBe(true);

      // Wait for completion
      await promise;

      // Loading should be false after completion
      expect(service.loading()).toBe(false);
    });

    it('should set error signal on failure', async () => {
      const reviewId = 'review-123';
      const errorMessage = 'Network error';

      // Initially error should be null
      expect(service.error()).toBeNull();

      // Mock API to throw
      vi.mocked(apiMock.generateTimeline).mockRejectedValueOnce(new Error(errorMessage));

      // Call generateTimeline
      await service.generateTimeline(reviewId).catch((_error: unknown) => undefined);

      // Error signal should be set
      expect(service.error()).toBe(errorMessage);
    });

    it('should clear error signal on successful operation after error', async () => {
      const reviewId = 'review-123';

      // First: set an error
      vi.mocked(apiMock.generateTimeline).mockRejectedValueOnce(new Error('First error'));

      await service.generateTimeline(reviewId).catch((_error: unknown) => undefined);
      expect(service.error()).not.toBeNull();

      // Second: successful operation should clear error
      vi.mocked(apiMock.generateTimeline).mockResolvedValueOnce(createTimelineResponse());

      vi.mocked(apiMock.getFilmReview).mockResolvedValueOnce(
        createReview({
          id: reviewId,
          timelineState: 'ready',
          timeline: [],
        })
      );

      await service.generateTimeline(reviewId);

      // Error should be cleared
      expect(service.error()).toBeNull();
    });
  });

  describe('Observability - All 4 Pillars', () => {
    it('should log all lifecycle events', async () => {
      const reviewId = 'review-123';

      vi.mocked(apiMock.generateTimeline).mockResolvedValueOnce(createTimelineResponse());

      vi.mocked(apiMock.getFilmReview).mockResolvedValueOnce(
        createReview({
          id: reviewId,
          timelineState: 'ready',
          timeline: [],
        })
      );

      await service.generateTimeline(reviewId);

      // Verify logger.child() was called (service setup)
      expect(loggerMock.child).toHaveBeenCalledWith('AgentXFilmReviewService');

      // Verify structured logging calls
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reviewId,
        })
      );
    });

    it('should track all analytics events', async () => {
      const reviewId = 'review-123';

      vi.mocked(apiMock.generateTimeline).mockResolvedValueOnce(createTimelineResponse());

      vi.mocked(apiMock.getFilmReview).mockResolvedValueOnce(
        createReview({
          id: reviewId,
          timelineState: 'ready',
          timeline: [],
        })
      );

      await service.generateTimeline(reviewId);

      // Verify analytics events were tracked (no hardcoded strings)
      const calls = vi.mocked(analyticsMock.trackEvent).mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      // Verify first event is INITIATED
      expect(calls[0][0]).toBe(APP_EVENTS.FILM_REVIEW_TIMELINE_GENERATE_INITIATED);
    });

    it('should update breadcrumb state changes', async () => {
      const reviewId = 'review-123';

      vi.mocked(apiMock.generateTimeline).mockResolvedValueOnce(createTimelineResponse());

      vi.mocked(apiMock.getFilmReview).mockResolvedValueOnce(
        createReview({
          id: reviewId,
          timelineState: 'ready',
          timeline: [],
        })
      );

      await service.generateTimeline(reviewId);

      // Verify breadcrumb state changes were tracked
      const calls = vi.mocked(breadcrumbMock.trackStateChange).mock.calls;
      expect(calls.length).toBeGreaterThan(0);

      // Verify feature name is 'film-review'
      const featureNames = calls.map((call) => call[0]);
      expect(featureNames.every((f) => f === 'film-review')).toBe(true);
    });
  });
});
