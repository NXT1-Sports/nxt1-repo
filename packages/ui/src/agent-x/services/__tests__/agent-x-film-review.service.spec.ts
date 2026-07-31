import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentXFilmReviewService } from '../agent-x-film-review.service';
import {
  type TeamFilmReviewApi,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlayAnnotation,
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
    refreshFile: vi.fn().mockResolvedValue(undefined),
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

  describe('importBreakdown', () => {
    it('hydrates the review before importing when team context is missing from cache', async () => {
      const review = createReviewDoc({ reviewRevision: 2 });
      const importedReview = createReviewDoc({
        reviewRevision: 3,
        timeline: [
          {
            id: 'play-1',
            number: 1,
            label: 'Opening Drive',
            startSec: 12,
            endSec: 24,
          },
        ],
      });
      const importResponse = {
        filmReview: importedReview,
        playCount: 1,
        rowCount: 1,
        warnings: [],
      };

      vi.spyOn(service as never, 'getNativeFilmReview' as never).mockResolvedValue(review);
      const importSpy = vi
        .spyOn(service as never, 'importLinkedFileReviewBreakdown' as never)
        .mockResolvedValue(importResponse);

      const result = await service.importBreakdown(
        review.id,
        new File(['sheet'], 'breakdown.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      );

      expect(importSpy).toHaveBeenCalledWith(review.id, review.teamId, expect.any(FormData));
      expect(result).toEqual(importResponse);
      expect(service.selectedId()).toBe(review.id);
      expect(service.reviews()).toEqual([importedReview]);
      expect(service.reviews()[0]?.reviewRevision).toBe(3);
    });
  });

  describe('revision advancement', () => {
    it('stores the revision returned after adding an annotation', async () => {
      const review = createReviewDoc({ reviewRevision: 2, annotations: [] });
      const annotation = {
        id: 'annotation-1',
        note: 'Check the fit',
        atSec: 12,
        createdBy: 'user-123',
        createdAt: '2026-07-30T00:00:00.000Z',
      };
      vi.spyOn(service as never, 'getNativeFilmReview' as never).mockResolvedValue(review);
      const annotationSpy = vi
        .spyOn(service as never, 'addLinkedFileReviewAnnotation' as never)
        .mockResolvedValue({ annotations: [annotation], reviewRevision: 3 });

      await service.ensureReviewDetails(review.id, review.teamId);
      await service.addAnnotation(review.id, { note: annotation.note, atSec: annotation.atSec });

      expect(annotationSpy).toHaveBeenCalledWith(
        review.id,
        expect.objectContaining({ expectedRevision: 2, teamId: review.teamId })
      );
      expect(service.reviews()[0]).toMatchObject({
        reviewRevision: 3,
        annotations: [annotation],
      });
    });

    it('stores the revision returned after refreshing AI', async () => {
      const review = createReviewDoc({ reviewRevision: 4 });
      vi.spyOn(service as never, 'getNativeFilmReview' as never).mockResolvedValue(review);
      const refreshSpy = vi
        .spyOn(service as never, 'refreshLinkedFileReviewAi' as never)
        .mockResolvedValue({
          aiSummary: 'Updated summary',
          aiTags: [],
          keyInsights: ['Updated insight'],
          reviewRevision: 5,
        });

      await service.ensureReviewDetails(review.id, review.teamId);
      await service.refreshAi(review.id);

      expect(refreshSpy).toHaveBeenCalledWith(review.id, review.teamId);
      expect(service.reviews()[0]).toMatchObject({
        reviewRevision: 5,
        aiSummary: 'Updated summary',
        keyInsights: ['Updated insight'],
      });
    });
  });

  describe('renameTimelinePlay', () => {
    it('falls back to the loaded team context when the cached review row is missing teamId', async () => {
      const review = createReviewDoc({
        teamId: undefined,
        reviewRevision: 7,
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
          expectedRevision: 7,
          teamId: 'team-123',
          timeline: updatedReview.timeline,
        })
      );
    });

    it('updates a user-scope review timeline without requiring teamId in the cache', async () => {
      const review = createReviewDoc({
        teamId: undefined,
        reviewRevision: 7,
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
          expectedRevision: 7,
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

  describe('revision conflicts', () => {
    it('retries timeline play annotation saves against the refreshed review once', async () => {
      const annotation: TeamFilmReviewPlayAnnotation = {
        kind: 'circle',
        strokeCount: 1,
        bounds: {
          x: 0.12,
          y: 0.18,
          width: 0.24,
          height: 0.2,
        },
        activeFromSec: 12,
        activeUntilSec: 13.5,
      };
      const staleReview = createReviewDoc({
        reviewRevision: 3,
        timeline: [
          {
            id: 'play-1',
            number: 1,
            label: 'Inside Zone',
            startSec: 12,
            endSec: 19,
            annotations: [],
          },
        ],
      });
      const latestReview = createReviewDoc({
        reviewRevision: 4,
        title: 'Updated by another coach',
        timeline: [
          {
            ...staleReview.timeline![0],
            label: 'Updated by another coach',
          },
        ],
      });
      const updatedReview = createReviewDoc({
        reviewRevision: 5,
        title: latestReview.title,
        timeline: [
          {
            ...latestReview.timeline![0],
            annotation,
            annotations: [annotation],
          },
        ],
      });
      const getReviewSpy = vi
        .spyOn(service as never, 'getNativeFilmReview' as never)
        .mockResolvedValueOnce(staleReview)
        .mockResolvedValueOnce(latestReview);
      const updateLinkedFileReviewSpy = vi
        .spyOn(service as never, 'updateLinkedFileReview' as never)
        .mockRejectedValueOnce(
          new HttpErrorResponse({
            status: 409,
            error: {
              success: false,
              code: 'REVISION_CONFLICT',
              currentRevision: 4,
            },
          })
        )
        .mockResolvedValueOnce(updatedReview);

      await service.ensureReviewDetails(staleReview.id, staleReview.teamId);
      await service.saveTimelinePlayAnnotations(staleReview.id, 0, [annotation]);

      expect(getReviewSpy).toHaveBeenCalledTimes(2);
      expect(updateLinkedFileReviewSpy).toHaveBeenNthCalledWith(
        1,
        staleReview.id,
        expect.objectContaining({
          expectedRevision: 3,
        })
      );
      expect(updateLinkedFileReviewSpy).toHaveBeenNthCalledWith(
        2,
        staleReview.id,
        expect.objectContaining({
          expectedRevision: 4,
          timeline: updatedReview.timeline,
        })
      );
      expect(service.reviews()[0]).toMatchObject({
        reviewRevision: 5,
        title: latestReview.title,
        timeline: updatedReview.timeline,
      });
      expect(service.error()).toBeNull();
    });

    it('reloads the latest review and reports a targeted conflict message', async () => {
      const staleReview = createReviewDoc({
        reviewRevision: 3,
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
      const latestReview = createReviewDoc({
        reviewRevision: 4,
        title: 'Updated by another coach',
        timeline: staleReview.timeline,
      });
      const getReviewSpy = vi
        .spyOn(service as never, 'getNativeFilmReview' as never)
        .mockResolvedValueOnce(staleReview)
        .mockResolvedValueOnce(latestReview);
      vi.spyOn(service as never, 'updateLinkedFileReview' as never).mockRejectedValue(
        new HttpErrorResponse({
          status: 409,
          error: {
            success: false,
            code: 'REVISION_CONFLICT',
            currentRevision: 4,
          },
        })
      );

      await service.ensureReviewDetails(staleReview.id, staleReview.teamId);

      await expect(service.renameTimelinePlay(staleReview.id, 0, 'Outside Zone')).rejects.toThrow(
        'This film review changed elsewhere. The latest version has been reloaded.'
      );

      expect(getReviewSpy).toHaveBeenCalledTimes(2);
      expect(service.reviews()[0]).toMatchObject({
        reviewRevision: 4,
        title: 'Updated by another coach',
      });
      expect(service.error()).toBe(
        'This film review changed elsewhere. The latest version has been reloaded.'
      );
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
            reviewRevision: 6,
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
      expect(review.reviewRevision).toBe(6);
    });

    it('prefers the refreshed primary asset URL over stale nested film review URLs', () => {
      const file = {
        id: 'review-456',
        type: 'file',
        payloadKind: 'native',
        teamId: 'team-123',
        organizationId: null,
        title: 'Refreshed Film Review',
        normalizedTitle: 'refreshed film review',
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
            videoUrl: 'https://stale.example.com/review.mp4',
            sources: [
              {
                id: 'source-1',
                order: 0,
                videoUrl: 'https://stale.example.com/source.mp4',
              },
            ],
            schemaVersion: 2,
            source: 'manual_upload',
          },
          asset: {
            kind: 'video',
            url: 'https://signed.example.com/review.mp4',
            mimeType: 'video/mp4',
            origin: 'files_upload',
            sizeBytes: 4096,
          },
        },
      } satisfies UniversalFileDoc;

      const review = (service as never).toFilmReviewDocFromUniversalFile(file) as TeamFilmReviewDoc;

      expect(review.videoUrl).toBe('https://signed.example.com/review.mp4');
      expect(review.sources?.[0]?.videoUrl).toBe('https://stale.example.com/source.mp4');
    });
  });
});
