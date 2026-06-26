import { computed, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { TEST_IDS } from '@nxt1/core/testing';
import type { TeamFilmReviewDoc, TeamFilmReviewPlaySegment } from '@nxt1/core';
import { AgentXFilmReviewPanelComponent } from './agent-x-film-review-panel.component';
import { AgentXFilmReviewService } from '../../services/agent-x-film-review.service';
import { AgentXService } from '../../services/agent-x.service';
import { AgentXVideoUploadService } from '../../services/agent-x-video-upload.service';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
} from '../../services/agent-x-job.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtPlatformService } from '../../../services/platform';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtArchiveService } from '../../../services/archive';

type FilmReviewPanelTestHarness = {
  buildFilmPlayDragContext: (
    review: TeamFilmReviewDoc,
    play: TeamFilmReviewPlaySegment,
    index: number
  ) => {
    media: {
      videoUrl?: string;
      thumbnailUrl?: string;
      cloudflareVideoId?: string;
    };
    metadata?: Record<string, unknown>;
  };
  getTimelineColumnDisplayValue: (
    play: TeamFilmReviewPlaySegment,
    column: { kind: 'endSec' | 'durationSec'; id: string; label: string; fieldKey: string }
  ) => string;
};

type FilmReviewPanelTestAccess = {
  filmPlayer?: {
    nativeElement: {
      pause: () => void;
      removeAttribute: (name: string) => void;
      load: () => void;
      canPlayType: (type: string) => string;
      readyState?: number;
      duration?: number;
      currentTime?: number;
      playbackRate?: number;
      videoWidth?: number;
      videoHeight?: number;
    };
  };
  nativeVideoSourceUrl: string | null;
  nativePlayerLoading: WritableSignal<boolean>;
  currentPlay: () => TeamFilmReviewPlaySegment | null;
  resolveNativeVideoUrl: (
    review: TeamFilmReviewDoc,
    play: TeamFilmReviewPlaySegment | null
  ) => string | null;
  configureNativeVideoSourceForSelectedReview: (delayMs?: number) => Promise<void>;
  onSelectReview: (reviewId: string) => Promise<void>;
};

describe('AgentXFilmReviewPanelComponent', () => {
  let reviewSignal: ReturnType<typeof signal<TeamFilmReviewDoc | null>>;
  const ensureReviewDetails = vi.fn<AgentXFilmReviewService['ensureReviewDetails']>();
  const selectReview = vi.fn<AgentXFilmReviewService['select']>();

  const createReviewDoc = (): TeamFilmReviewDoc => ({
    id: 'review-1',
    teamId: 'team-1',
    title: 'Batch Clips',
    sport: 'football',
    status: 'ready',
    timelineState: 'ready',
    videoUrl: 'https://cdn.example.com/review/master.mp4',
    thumbnailUrl: 'https://cdn.example.com/review/master.jpg',
    cloudflareVideoId: 'review-master-cf',
    uploadMode: 'batch_clips',
    timeline: [],
    sources: [
      {
        id: 'source-1',
        order: 0,
        title: 'Source Clip 1',
        videoUrl: 'https://cdn.example.com/source-1.mp4',
        thumbnailUrl: 'https://cdn.example.com/source-1.jpg',
        cloudflareVideoId: 'source-1-cf',
      },
      {
        id: 'source-2',
        order: 1,
        title: 'Source Clip 2',
        videoUrl: 'https://cdn.example.com/source-2.mp4',
        thumbnailUrl: 'https://cdn.example.com/source-2.jpg',
        cloudflareVideoId: 'source-2-cf',
      },
    ],
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    reviewSignal = signal<TeamFilmReviewDoc | null>(null);
    ensureReviewDetails.mockResolvedValue(null);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AgentXFilmReviewService,
          useValue: {
            ensureReviewDetails,
            select: selectReview,
            reviews: computed(() => (reviewSignal() ? [reviewSignal()!] : [])),
            playlists: computed(() => []),
            totalReviewCount: computed(() => (reviewSignal() ? 1 : 0)),
            selectedId: computed(() => reviewSignal()?.id ?? null),
            selectedReview: computed(() => reviewSignal()),
            loading: computed(() => false),
            saving: computed(() => false),
            error: computed(() => null),
            isEmpty: computed(() => reviewSignal() === null),
          },
        },
        {
          provide: AgentXService,
          useValue: {
            hasRole: vi.fn().mockReturnValue(false),
            queueSelectedContext: vi.fn(),
            queueSelectedContexts: vi.fn(),
          },
        },
        {
          provide: NxtLoggingService,
          useValue: {
            child: vi.fn().mockReturnValue({
              info: vi.fn(),
              warn: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
            }),
          },
        },
        {
          provide: NxtPlatformService,
          useValue: {
            isNative: vi.fn().mockReturnValue(false),
          },
        },
        { provide: NxtToastService, useValue: { info: vi.fn(), error: vi.fn() } },
        { provide: NxtArchiveService, useValue: {} },
        { provide: AgentXVideoUploadService, useValue: {} },
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.nxt1.test' },
        { provide: AGENT_X_AUTH_TOKEN_FACTORY, useValue: vi.fn().mockResolvedValue(null) },
        {
          provide: DomSanitizer,
          useValue: {
            bypassSecurityTrustResourceUrl: vi.fn((value: string) => value),
          },
        },
      ],
    });
  });

  it('uses the source clip media for timeline play contexts', () => {
    reviewSignal.set(createReviewDoc());

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const review = reviewSignal()!;
    const firstPlay: TeamFilmReviewPlaySegment = {
      id: 'play-1',
      number: 1,
      label: 'Inside Zone',
      startSec: 0,
      endSec: 1,
      sourceId: 'source-1',
    };
    const secondPlay: TeamFilmReviewPlaySegment = {
      id: 'play-2',
      number: 2,
      label: 'Power Read',
      startSec: 0,
      endSec: 1,
      sourceId: 'source-2',
    };

    const panelHarness = component as unknown as FilmReviewPanelTestHarness;
    const firstContext = panelHarness.buildFilmPlayDragContext(review, firstPlay, 0);
    const secondContext = panelHarness.buildFilmPlayDragContext(review, secondPlay, 1);

    expect(firstContext.media).toMatchObject({
      videoUrl: 'https://cdn.example.com/source-1.mp4',
      thumbnailUrl: 'https://cdn.example.com/source-1.jpg',
      cloudflareVideoId: 'source-1-cf',
    });
    expect(secondContext.media).toMatchObject({
      videoUrl: 'https://cdn.example.com/source-2.mp4',
      thumbnailUrl: 'https://cdn.example.com/source-2.jpg',
      cloudflareVideoId: 'source-2-cf',
    });
    expect(firstContext.media.videoUrl).not.toBe(secondContext.media.videoUrl);
    expect(firstContext.metadata).toMatchObject({
      sourceId: 'source-1',
      sourceTitle: 'Source Clip 1',
    });
    expect(secondContext.metadata).toMatchObject({
      sourceId: 'source-2',
      sourceTitle: 'Source Clip 2',
    });
  });

  it('shows the real source duration for placeholder source rows in the breakdown table', () => {
    const review = createReviewDoc();
    reviewSignal.set({
      ...review,
      sources: [
        {
          ...review.sources![0],
          durationSec: 125,
        },
        review.sources![1],
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const placeholderPlay: TeamFilmReviewPlaySegment = {
      id: 'play-source-1',
      number: 1,
      label: 'Source Clip 1',
      startSec: 0,
      endSec: 1,
      sourceId: 'source-1',
    };

    const panelHarness = component as unknown as FilmReviewPanelTestHarness;

    expect(
      panelHarness.getTimelineColumnDisplayValue(placeholderPlay, {
        id: 'endSec',
        kind: 'endSec',
        label: 'End',
        fieldKey: 'endSec',
      })
    ).toBe('02:05');
    expect(
      panelHarness.getTimelineColumnDisplayValue(placeholderPlay, {
        id: 'durationSec',
        kind: 'durationSec',
        label: 'Duration',
        fieldKey: 'durationSec',
      })
    ).toBe('02:05');
  });

  it('selects a newly opened review before hydration finishes', async () => {
    let resolveEnsure: (() => void) | null = null;
    const ensurePending = new Promise<void>((resolve) => {
      resolveEnsure = resolve;
    });

    ensureReviewDetails.mockImplementation(async () => {
      await ensurePending;
      reviewSignal.set(createReviewDoc());
      return reviewSignal();
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    component.teamId = 'team-1';

    const openPromise = component.onSelectReview('review-1');
    await Promise.resolve();

    expect(selectReview).toHaveBeenCalledWith('review-1');
    expect(ensureReviewDetails).toHaveBeenCalledWith('review-1', 'team-1');

    resolveEnsure?.();
    await openPromise;
  });

  it('clears the previous native player source before switching to another review', async () => {
    const initialReview = createReviewDoc();
    const nextReview: TeamFilmReviewDoc = {
      ...createReviewDoc(),
      id: 'review-2',
      title: 'Opponent Cutups',
      videoUrl: 'https://cdn.example.com/review/opponent.mp4',
    };

    reviewSignal.set(initialReview);
    selectReview.mockImplementation((reviewId: string) => {
      if (reviewId === nextReview.id) {
        reviewSignal.set(nextReview);
      }
    });

    const pause = vi.fn();
    const removeAttribute = vi.fn();
    const load = vi.fn();

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    componentAccess.filmPlayer = {
      nativeElement: {
        pause,
        removeAttribute,
        load,
        canPlayType: vi.fn().mockReturnValue('probably'),
      },
    };
    componentAccess.nativeVideoSourceUrl = initialReview.videoUrl;

    await componentAccess.onSelectReview(nextReview.id);

    expect(pause).toHaveBeenCalled();
    expect(removeAttribute).toHaveBeenCalledWith('src');
    expect(load).toHaveBeenCalled();
    expect(componentAccess.nativeVideoSourceUrl).not.toBe(initialReview.videoUrl);
  });

  it('clears the native loading overlay when reusing an already-ready video source', async () => {
    const review: TeamFilmReviewDoc = {
      ...createReviewDoc(),
      cloudflareVideoId: undefined,
      sources: [],
    };
    reviewSignal.set(review);

    Object.defineProperty(HTMLMediaElement, 'HAVE_METADATA', {
      configurable: true,
      value: HTMLMediaElement.HAVE_METADATA || 1,
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const resolvedVideoUrl = componentAccess.resolveNativeVideoUrl(
      review,
      componentAccess.currentPlay()
    );
    componentAccess.filmPlayer = {
      nativeElement: {
        readyState: HTMLMediaElement.HAVE_METADATA,
        duration: 125,
        currentTime: 18,
        playbackRate: 1,
        videoWidth: 0,
        videoHeight: 0,
        canPlayType: vi.fn().mockReturnValue('probably'),
      },
    };
    componentAccess.nativeVideoSourceUrl = resolvedVideoUrl;
    componentAccess.nativePlayerLoading.set(true);

    await componentAccess.configureNativeVideoSourceForSelectedReview(1);

    expect(componentAccess.nativePlayerLoading()).toBe(false);
    expect(component.playerDuration()).toBe(125);
    expect(component.playerCurrentTime()).toBe(18);
  });

  it('renders one table row per source clip when a batch review has no stored timeline', () => {
    reviewSignal.set(createReviewDoc());

    const fixture = TestBed.createComponent(AgentXFilmReviewPanelComponent);
    fixture.componentInstance.teamId = 'team-1';
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Source Clip 1');
    expect(element.textContent).toContain('Source Clip 2');
    expect(element.textContent).not.toContain('No breakdown yet');
    expect(
      element.querySelectorAll(`[data-testid="${TEST_IDS.FILM_REVIEW.TIMELINE_TAG_COLUMN}"]`).length
    ).toBeGreaterThan(0);
  });
});
