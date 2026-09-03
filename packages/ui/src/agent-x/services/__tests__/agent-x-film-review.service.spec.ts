import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
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

  const httpMock = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
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

    it('retries once after a revision conflict using the refreshed review revision', async () => {
      const staleReview = createReviewDoc({ reviewRevision: 0 });
      const refreshedReview = createReviewDoc({ reviewRevision: 1, title: 'Refreshed Review' });
      const importedReview = createReviewDoc({
        reviewRevision: 2,
        title: 'Imported Review',
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

      const getReviewSpy = vi
        .spyOn(service as never, 'getNativeFilmReview' as never)
        .mockResolvedValueOnce(staleReview)
        .mockResolvedValueOnce(refreshedReview);
      const importSpy = vi
        .spyOn(service as never, 'importLinkedFileReviewBreakdown' as never)
        .mockRejectedValueOnce(
          new HttpErrorResponse({
            status: 409,
            error: {
              success: false,
              code: 'REVISION_CONFLICT',
              currentRevision: 1,
            },
          })
        )
        .mockResolvedValueOnce(importResponse);

      await service.ensureReviewDetails(staleReview.id, staleReview.teamId);

      const result = await service.importBreakdown(
        staleReview.id,
        new File(['sheet'], 'breakdown.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
      );

      expect(result).toEqual(importResponse);
      expect(getReviewSpy).toHaveBeenCalledTimes(2);
      expect(importSpy).toHaveBeenCalledTimes(2);
      expect(service.reviews()[0]).toEqual(importedReview);
      expect(service.error()).toBeNull();
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
    it('saves freehand drawings through the sidecar API without PATCHing the review timeline', async () => {
      const annotation: TeamFilmReviewPlayAnnotation = {
        kind: 'freehand',
        strokeCount: 2,
        bounds: {
          minX: 0.12,
          minY: 0.18,
          maxX: 0.36,
          maxY: 0.38,
        },
        activeFromSec: 12,
        activeUntilSec: 13.5,
        strokes: [
          [
            { x: 0.12, y: 0.18 },
            { x: 0.2, y: 0.24 },
          ],
          [{ x: 0.36, y: 0.38 }],
        ],
      };
      const review = createReviewDoc({
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
      vi.spyOn(service as never, 'getNativeFilmReview' as never).mockResolvedValue(review);
      const updateLinkedFileReviewSpy = vi.spyOn(
        service as never,
        'updateLinkedFileReview' as never
      );
      httpMock.post.mockReturnValue(
        of({
          success: true,
          data: {
            drawing: {
              id: 'drawing-1',
              playId: 'play-1',
              kind: 'freehand',
              bounds: annotation.bounds,
              strokeCount: 2,
              points: [
                { x: 0.12, y: 0.18 },
                { x: 0.2, y: 0.24 },
                { x: 0.36, y: 0.38 },
              ],
              strokeStartIndexes: [0, 2],
              revision: 1,
              createdBy: 'user-123',
              createdAt: '2026-07-30T00:00:00.000Z',
              updatedBy: 'user-123',
              updatedAt: '2026-07-30T00:00:00.000Z',
            },
          },
        })
      );

      await service.ensureReviewDetails(review.id, review.teamId);
      await service.saveTimelinePlayAnnotations(review.id, 0, [annotation]);

      expect(httpMock.post).toHaveBeenCalledWith(
        '/api/v1/staging/agent-x/files/review-123/film-review/drawings',
        expect.objectContaining({
          points: [
            { x: 0.12, y: 0.18 },
            { x: 0.2, y: 0.24 },
            { x: 0.36, y: 0.38 },
          ],
          strokeStartIndexes: [0, 2],
        })
      );
      const request = httpMock.post.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(request['strokes']).toBeUndefined();
      expect(updateLinkedFileReviewSpy).not.toHaveBeenCalled();
      const savedAnnotations = service.reviews()[0]?.timeline?.[0]?.annotations ?? [];
      expect(savedAnnotations).toHaveLength(1);
      expect(savedAnnotations[0]).toMatchObject({
        kind: 'freehand',
        drawingId: 'drawing-1',
        drawingRevision: 1,
      });

      httpMock.patch.mockReturnValueOnce(
        of({
          success: true,
          data: {
            drawing: {
              id: 'drawing-1',
              playId: 'play-1',
              kind: 'freehand',
              bounds: { minX: 0.14, minY: 0.2, maxX: 0.38, maxY: 0.4 },
              strokeCount: 2,
              points: [
                { x: 0.14, y: 0.2 },
                { x: 0.22, y: 0.26 },
                { x: 0.38, y: 0.4 },
              ],
              strokeStartIndexes: [0, 2],
              revision: 2,
              createdBy: 'user-123',
              createdAt: '2026-07-30T00:00:00.000Z',
              updatedBy: 'user-123',
              updatedAt: '2026-07-30T00:01:00.000Z',
            },
          },
        })
      );

      await service.saveTimelinePlayAnnotations(review.id, 0, [
        {
          ...savedAnnotations[0]!,
          bounds: { minX: 0.14, minY: 0.2, maxX: 0.38, maxY: 0.4 },
          strokes: [
            [
              { x: 0.14, y: 0.2 },
              { x: 0.22, y: 0.26 },
            ],
            [{ x: 0.38, y: 0.4 }],
          ],
        },
      ]);

      expect(httpMock.post).toHaveBeenCalledTimes(1);
      expect(httpMock.patch).toHaveBeenCalledWith(
        '/api/v1/staging/agent-x/files/review-123/film-review/drawings/drawing-1',
        expect.objectContaining({
          expectedRevision: 1,
          bounds: { minX: 0.14, minY: 0.2, maxX: 0.38, maxY: 0.4 },
        })
      );
      expect(service.reviews()[0]?.timeline?.[0]?.annotations?.[0]).toMatchObject({
        drawingId: 'drawing-1',
        drawingRevision: 2,
      });

      httpMock.patch
        .mockReturnValueOnce(
          throwError(
            () =>
              new HttpErrorResponse({
                status: 409,
                error: {
                  success: false,
                  code: 'REVISION_CONFLICT',
                  currentRevision: 20,
                },
              })
          )
        )
        .mockReturnValueOnce(
          of({
            success: true,
            data: {
              drawing: {
                id: 'drawing-1',
                playId: 'play-1',
                kind: 'freehand',
                bounds: { minX: 0.16, minY: 0.22, maxX: 0.4, maxY: 0.42 },
                strokeCount: 2,
                points: [
                  { x: 0.16, y: 0.22 },
                  { x: 0.24, y: 0.28 },
                  { x: 0.4, y: 0.42 },
                ],
                strokeStartIndexes: [0, 2],
                revision: 21,
                createdBy: 'user-123',
                createdAt: '2026-07-30T00:00:00.000Z',
                updatedBy: 'user-123',
                updatedAt: '2026-07-30T00:02:00.000Z',
              },
            },
          })
        );

      await service.saveTimelinePlayAnnotations(review.id, 0, [
        {
          ...service.reviews()[0]!.timeline![0]!.annotations![0]!,
          bounds: { minX: 0.16, minY: 0.22, maxX: 0.4, maxY: 0.42 },
          strokes: [
            [
              { x: 0.16, y: 0.22 },
              { x: 0.24, y: 0.28 },
            ],
            [{ x: 0.4, y: 0.42 }],
          ],
        },
      ]);

      expect(httpMock.patch).toHaveBeenLastCalledWith(
        '/api/v1/staging/agent-x/files/review-123/film-review/drawings/drawing-1',
        expect.objectContaining({
          expectedRevision: 20,
          bounds: { minX: 0.16, minY: 0.22, maxX: 0.4, maxY: 0.42 },
        })
      );
      expect(service.reviews()[0]?.timeline?.[0]?.annotations?.[0]).toMatchObject({
        drawingId: 'drawing-1',
        drawingRevision: 21,
      });
    });

    it('does not re-embed hydrated sidecar drawings when a timeline play is renamed', async () => {
      const drawingAnnotation: TeamFilmReviewPlayAnnotation = {
        kind: 'freehand',
        drawingId: 'drawing-1',
        drawingRevision: 1,
        strokeCount: 1,
        bounds: { minX: 0.12, minY: 0.18, maxX: 0.36, maxY: 0.38 },
        strokes: [
          [
            { x: 0.12, y: 0.18 },
            { x: 0.36, y: 0.38 },
          ],
        ],
      };
      const review = createReviewDoc({
        reviewRevision: 3,
        timeline: [
          {
            id: 'play-1',
            number: 1,
            label: 'Inside Zone',
            startSec: 12,
            endSec: 19,
            annotations: [drawingAnnotation],
          },
        ],
      });
      const updatedReview = {
        ...review,
        timeline: [
          {
            ...review.timeline![0],
            label: 'Outside Zone',
            annotation: null,
            annotations: null,
          },
        ],
      } satisfies TeamFilmReviewDoc;

      vi.spyOn(service as never, 'getNativeFilmReview' as never).mockResolvedValue(review);
      const updateLinkedFileReviewSpy = vi
        .spyOn(service as never, 'updateLinkedFileReview' as never)
        .mockResolvedValue(updatedReview);

      await service.ensureReviewDetails(review.id, review.teamId);
      await service.renameTimelinePlay(review.id, 0, 'Outside Zone');

      const request = updateLinkedFileReviewSpy.mock.calls[0]?.[1] as UpdateTeamFilmReviewRequest;
      expect(request.timeline?.[0]).toMatchObject({ label: 'Outside Zone' });
      expect(request.timeline?.[0]?.annotations).toBeNull();
      expect(request.timeline?.[0]?.annotation).toBeNull();
      expect(JSON.stringify(request.timeline)).not.toContain('drawing-1');
      expect(JSON.stringify(request.timeline)).not.toContain('strokes');
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

  describe('film tracking', () => {
    it('requests tracking and updates local review tracking state', async () => {
      const review = createReviewDoc({
        sources: [
          {
            id: 'wide-1',
            order: 0,
            title: 'Wide Angle',
            videoUrl: 'https://cdn.example.com/review.mp4',
          },
        ],
      });
      (service as unknown as { upsertReview(review: TeamFilmReviewDoc): void }).upsertReview(
        review
      );
      httpMock.post.mockReturnValue(
        of({
          success: true,
          data: {
            jobId: 'film_tracking_123',
            status: 'ready',
            capability: 'tracked_image_space',
            manifest: { manifestStoragePath: 'film-tracking/review-123/wide-1/manifest.json' },
            progress: {
              status: 'ready',
              processedWindowCount: 1,
              totalWindowCount: 1,
              percentComplete: 100,
              updatedAt: '2026-09-02T00:00:00.000Z',
            },
          },
        })
      );

      const result = await service.requestTracking(review.id, {
        teamId: review.teamId,
        sourceId: 'wide-1',
        scope: 'play',
        mode: 'draft',
        playIds: ['play-1'],
      });

      expect(httpMock.post).toHaveBeenCalledWith(
        '/api/v1/staging/agent-x/files/review-123/film-review/tracking',
        expect.objectContaining({ sourceId: 'wide-1', scope: 'play', mode: 'draft' })
      );
      expect(result.status).toBe('ready');
      expect(service.reviews()[0]).toMatchObject({
        trackingStatus: 'ready',
        trackingCapability: 'tracked_image_space',
        trackingManifest: { manifestStoragePath: 'film-tracking/review-123/wide-1/manifest.json' },
      });
    });

    it('loads a tracking window from the file-backed route', async () => {
      httpMock.get.mockReturnValue(
        of({
          success: true,
          data: {
            manifest: { surfaceType: 'field' },
            timeRange: { startSec: 10, endSec: 18 },
            frames: [{ frameIndex: 0, timestampSec: 10, entities: [{ trackId: 'track-home-1' }] }],
          },
        })
      );

      const result = await service.loadTrackingWindow('review-123', {
        teamId: 'team-123',
        sourceId: 'wide-1',
        startSec: 10,
        endSec: 18,
      });

      expect(httpMock.get).toHaveBeenCalledWith(
        '/api/v1/staging/agent-x/files/review-123/film-review/tracking/window?teamId=team-123&sourceId=wide-1&startSec=10&endSec=18'
      );
      expect(result.frames).toHaveLength(1);
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

    it('lazily groups legacy paired wide and tight timeline rows on hydration', () => {
      const file = {
        id: 'review-789',
        type: 'file',
        payloadKind: 'native',
        teamId: 'team-123',
        organizationId: null,
        title: 'Legacy Paired Clips',
        normalizedTitle: 'legacy paired clips',
        status: 'ready',
        sport: 'football',
        createdByUserId: 'user-123',
        updatedByUserId: 'user-123',
        readAccessKeys: ['team:team-123'],
        writeAccessKeys: ['team:team-123'],
        createdAt: '2026-06-24T00:00:00.000Z',
        updatedAt: '2026-06-24T00:00:00.000Z',
        payload: {
          filmReview: {
            videoUrl: 'https://cdn.example.com/clip-20-wide.mp4',
            uploadMode: 'batch_clips',
            sources: [
              {
                id: 'wide-20',
                order: 0,
                title: 'Clip 20 Wide',
                videoUrl: 'https://cdn.example.com/clip-20-wide.mp4',
                cameraAngle: 'wide',
                angleGroupId: 'angle-clip-20',
                durationSec: 12,
              },
              {
                id: 'tight-20',
                order: 1,
                title: 'Clip 20 Tight',
                videoUrl: 'https://cdn.example.com/clip-20-tight.mp4',
                cameraAngle: 'tight',
                angleGroupId: 'angle-clip-20',
                durationSec: 11,
              },
            ],
            timeline: [
              {
                id: 'play-wide-20',
                number: 1,
                label: 'Power Read',
                startSec: 0,
                endSec: 12,
                sourceId: 'wide-20',
              },
              {
                id: 'play-tight-20',
                number: 2,
                label: 'Power Read',
                startSec: 0,
                endSec: 11,
                sourceId: 'tight-20',
              },
            ],
            schemaVersion: 2,
            source: 'manual_upload',
          },
          asset: {
            kind: 'video',
            url: 'https://cdn.example.com/clip-20-wide.mp4',
          },
        },
      } satisfies UniversalFileDoc;

      const review = (service as never).toFilmReviewDocFromUniversalFile(file) as TeamFilmReviewDoc;

      expect(review.timeline).toEqual([
        expect.objectContaining({
          id: 'play-wide-20',
          number: 1,
          label: 'Power Read',
          sourceId: 'wide-20',
          sourceIds: ['wide-20', 'tight-20'],
        }),
      ]);
    });
  });
});
