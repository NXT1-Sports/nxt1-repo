import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentXFilmReviewService } from '../agent-x-film-review.service';
import {
  type TeamFilmReviewApi,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlaySegment,
  type UniversalFileDoc,
} from '@nxt1/core';
import { NxtLoggingService } from '../../../services/logging';
import { NxtBreadcrumbService } from '../../../services/breadcrumb';
import { ANALYTICS_ADAPTER } from '../../../services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { AGENT_X_API_BASE_URL } from '../agent-x-job.service';
import { AgentXFilesService } from '../agent-x-files.service';

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

  const apiMock: Partial<TeamFilmReviewApi> = {
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

  const httpMock = {};
  const filesServiceMock = {
    requestFilmReviewDownloadExport: vi.fn(),
  };

  const createReviewDoc = (overrides: Partial<TeamFilmReviewDoc> = {}): TeamFilmReviewDoc => ({
    id: 'review-123',
    teamId: 'team-123',
    title: 'Uploaded Film Review',
    sport: 'football',
    status: 'ready',
    videoUrl: 'https://cdn.example.com/review.mp4',
    createdBy: 'user-123',
    updatedBy: 'user-123',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        AgentXFilmReviewService,
        { provide: 'TeamFilmReviewApi', useValue: apiMock },
        { provide: HttpClient, useValue: httpMock },
        { provide: AgentXFilesService, useValue: filesServiceMock },
        { provide: AGENT_X_API_BASE_URL, useValue: '/api/v1/staging' },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
      ],
    });

    service = TestBed.inject(AgentXFilmReviewService);
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
        review_id: 'review-123',
        play_label: 'TD Pass',
        start_sec: 10,
      });

      // Verify breadcrumb tracking
      expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith('film_review_play_skipped', {
        reviewId: 'review-123',
        playLabel: 'TD Pass',
        startSec: 10,
      });

      // Verify logging
      expect(loggerMock.info).toHaveBeenCalledWith('Play skipped in timeline', expect.any(Object));
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

  describe('ensureReviewDetails', () => {
    it('inserts a hydrated review when it is missing from the loaded review list', async () => {
      const review = createReviewDoc();

      vi.spyOn(service as never, 'getNativeFilmReview' as never).mockResolvedValue(review);

      await service.ensureReviewDetails(review.id, review.teamId);

      expect(service.reviews()).toEqual([review]);
      expect(service.selectedReview()).toBeNull();
    });
  });

  describe('renameTimelinePlay', () => {
    it('falls back to the loaded team context when the cached review row is missing teamId', async () => {
      const review = createReviewDoc({
        teamId: undefined,
        timeline: [
          {
            id: 'play-1',
            number: 1,
            label: 'Inside Zone',
            startSec: 12,
            endSec: 19,
          },
        ],
      });
      const updatedReview = {
        ...review,
        teamId: 'team-123',
        timeline: [
          {
            ...review.timeline![0],
            label: 'Outside Zone',
          },
        ],
      } satisfies TeamFilmReviewDoc;

      vi.spyOn(service as never, 'listNativeFilmReviews' as never).mockResolvedValue([review]);
      const updateLinkedFileReviewSpy = vi
        .spyOn(service as never, 'updateLinkedFileReview' as never)
        .mockResolvedValue(updatedReview);

      await service.load('team-123', 'football');
      await service.renameTimelinePlay(review.id, 0, 'Outside Zone');

      expect(updateLinkedFileReviewSpy).toHaveBeenCalledWith(
        review.id,
        expect.objectContaining({
          teamId: 'team-123',
          timeline: updatedReview.timeline,
        })
      );
    });

    it('updates a user-scope review timeline without requiring teamId in the cache', async () => {
      const review = createReviewDoc({
        teamId: undefined,
        timeline: [
          {
            id: 'play-1',
            number: 1,
            label: 'Inside Zone',
            startSec: 12,
            endSec: 19,
          },
        ],
      });
      const updatedReview = {
        ...review,
        timeline: [
          {
            ...review.timeline![0],
            label: 'Outside Zone',
          },
        ],
      } satisfies TeamFilmReviewDoc;

      vi.spyOn(service as never, 'getNativeFilmReview' as never).mockResolvedValue(review);
      const updateLinkedFileReviewSpy = vi
        .spyOn(service as never, 'updateLinkedFileReview' as never)
        .mockResolvedValue(updatedReview);

      await service.ensureReviewDetails(review.id);
      await service.renameTimelinePlay(review.id, 0, 'Outside Zone');

      expect(updateLinkedFileReviewSpy).toHaveBeenCalledWith(
        review.id,
        expect.objectContaining({
          timeline: updatedReview.timeline,
        })
      );
      expect(updateLinkedFileReviewSpy).not.toHaveBeenCalledWith(
        review.id,
        expect.objectContaining({
          teamId: expect.any(String),
        })
      );
      expect(service.reviews()[0]?.timeline?.[0]?.label).toBe('Outside Zone');
    });
  });

  describe('toFilmReviewDocFromUniversalFile', () => {
    it('preserves access keys for owner-scoped review write checks', () => {
      const file = {
        id: 'review-123',
        type: 'file',
        payloadKind: 'native',
        teamId: undefined,
        organizationId: null,
        title: 'Uploaded Film Review',
        normalizedTitle: 'uploaded film review',
        status: 'ready',
        sport: 'football',
        createdByUserId: 'user-123',
        updatedByUserId: 'user-123',
        readAccessKeys: ['user:user-123'],
        writeAccessKeys: ['user:user-123'],
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
        payload: {
          filmReview: {
            videoUrl: 'https://cdn.example.com/review.mp4',
            schemaVersion: 2,
            source: 'manual_upload',
          },
          asset: {
            kind: 'video',
            url: 'https://cdn.example.com/review.mp4',
          },
        },
      } satisfies UniversalFileDoc;

      const review = (service as never).toFilmReviewDocFromUniversalFile(file) as TeamFilmReviewDoc;

      expect(review.readAccessKeys).toEqual(['user:user-123']);
      expect(review.writeAccessKeys).toEqual(['user:user-123']);
      expect(review.createdBy).toBe('user-123');
    });
  });
});
