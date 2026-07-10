import { computed, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { TEST_IDS } from '@nxt1/core/testing';
import type {
  TeamFilmReviewDoc,
  TeamFilmReviewPlayAnnotation,
  TeamFilmReviewPlaySegment,
} from '@nxt1/core';
import type { AgentXSelectedContext } from '@nxt1/core/ai';
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

type FilmReviewPanelTestDrawAnnotationBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type FilmReviewPanelTestDrawAnnotationKind = 'freehand' | 'square' | 'circle' | 'text';

type FilmReviewPanelTestEditableDrawAnnotation =
  | {
      kind: 'freehand';
      bounds: FilmReviewPanelTestDrawAnnotationBounds;
      strokes: Array<Array<{ x: number; y: number }>>;
    }
  | {
      kind: 'square' | 'circle';
      bounds: FilmReviewPanelTestDrawAnnotationBounds;
    }
  | {
      kind: 'text';
      bounds: FilmReviewPanelTestDrawAnnotationBounds;
      text: string;
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
  nativePlaybackSourcePlayIndex: WritableSignal<number | null>;
  nativePlayerLoading: WritableSignal<boolean>;
  playerCurrentTime: WritableSignal<number>;
  playerDuration: WritableSignal<number>;
  isVideoView: WritableSignal<boolean>;
  currentPlay: () => TeamFilmReviewPlaySegment | null;
  resolveReviewDurationSec: (
    review: TeamFilmReviewDoc | null | undefined,
    play?: TeamFilmReviewPlaySegment | null
  ) => number;
  resolveNativeVideoUrl: (
    review: TeamFilmReviewDoc,
    play: TeamFilmReviewPlaySegment | null
  ) => string | null;
  configureNativeVideoSourceForSelectedReview: (delayMs?: number) => Promise<void>;
  onSelectReview: (reviewId: string) => Promise<void>;
  onSeekPointerDown: () => void;
  onSeekPointerUp: () => void;
  onSeekTime: (nextTime: number) => void;
  onPlayerTimeUpdate: () => void;
  seekToTimestampMs: (
    timeMs: number,
    options?: { readonly filmReviewId?: string | null; readonly sourceId?: string | null }
  ) => Promise<void>;
  updatePlayerTimeSignal: (currentTimeSec: number, skipOverlayRender?: boolean) => void;
  focusTextEffectInput: (selectAll?: boolean) => void;
  buildDefaultTextEffectBounds: () => FilmReviewPanelTestDrawAnnotationBounds;
  drawModeEnabled: () => boolean;
  selectedDrawTool: () => FilmReviewPanelTestDrawAnnotationKind;
  drawAnnotation: FilmReviewPanelTestEditableDrawAnnotation | null;
  currentDrawEffectWindow: { startSec: number; endSec: number } | null;
  isTextEffectPanelVisible: () => boolean;
  isTextEffectPanelEditable: () => boolean;
  currentTextEffectText: () => string;
  currentTextEffectPanelWindowLabel: () => string;
  onDrawToolToggle: (kind: FilmReviewPanelTestDrawAnnotationKind) => void;
  hasDrawing: () => boolean;
  hasClearableDrawOverlay: () => boolean;
  clearDrawOverlay: () => void;
  restoreEditableDrawAnnotation: (
    annotation: TeamFilmReviewPlayAnnotation
  ) => FilmReviewPanelTestEditableDrawAnnotation | null;
  onDeleteConfirm: (review: TeamFilmReviewDoc, event: Event) => Promise<void>;
  selectedLibraryReviewIds: WritableSignal<ReadonlySet<string>>;
  buildFilmReviewDragContextsForLibrary: (
    review: TeamFilmReviewDoc
  ) => readonly AgentXSelectedContext[];
  canMutateFilmReviewLibrary: () => boolean;
};

describe('AgentXFilmReviewPanelComponent', () => {
  let reviewSignal: ReturnType<typeof signal<TeamFilmReviewDoc | null>>;
  let reviewsSignal: ReturnType<typeof signal<readonly TeamFilmReviewDoc[]>>;
  let userContextSignal: ReturnType<typeof signal<{ userId?: string } | null>>;
  const ensureReviewDetails = vi.fn<AgentXFilmReviewService['ensureReviewDetails']>();
  const selectReview = vi.fn<AgentXFilmReviewService['select']>();
  const deleteReview = vi.fn<AgentXFilmReviewService['deleteReview']>();
  const toastInfo = vi.fn();
  const toastError = vi.fn();

  const createReviewDoc = (): TeamFilmReviewDoc => ({
    id: 'review-1',
    teamId: 'team-1',
    title: 'Batch Clips',
    source: 'team_files',
    schemaVersion: 2,
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
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: '2026-06-22T00:00:00.000Z',
    updatedAt: '2026-06-22T00:00:00.000Z',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    reviewSignal = signal<TeamFilmReviewDoc | null>(null);
    reviewsSignal = signal<readonly TeamFilmReviewDoc[]>([]);
    userContextSignal = signal<{ userId?: string } | null>({ userId: 'viewer-1' });
    ensureReviewDetails.mockResolvedValue(undefined);
    deleteReview.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AgentXFilmReviewService,
          useValue: {
            ensureReviewDetails,
            select: selectReview,
            deleteReview,
            reviews: computed(() =>
              reviewsSignal().length > 0 ? reviewsSignal() : reviewSignal() ? [reviewSignal()!] : []
            ),
            playlists: computed(() => []),
            totalReviewCount: computed(() =>
              reviewsSignal().length > 0 ? reviewsSignal().length : reviewSignal() ? 1 : 0
            ),
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
            userContext: vi.fn(() => userContextSignal()),
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
        { provide: NxtToastService, useValue: { info: toastInfo, error: toastError } },
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

  it('groups selected film review videos into one drag context', () => {
    const firstReview = createReviewDoc();
    const secondReview: TeamFilmReviewDoc = {
      ...createReviewDoc(),
      id: 'review-2',
      title: 'Red Zone Cutups',
      videoUrl: 'https://cdn.example.com/review/red-zone.mp4',
      thumbnailUrl: 'https://cdn.example.com/review/red-zone.jpg',
      cloudflareVideoId: 'review-red-zone-cf',
      timeline: [
        {
          id: 'play-3',
          number: 3,
          label: 'Goal Line Fit',
          startSec: 12,
          endSec: 18,
        },
      ],
    };
    reviewsSignal.set([firstReview, secondReview]);

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    componentAccess.selectedLibraryReviewIds.set(new Set(['review-1', 'review-2']));

    const contexts = componentAccess.buildFilmReviewDragContextsForLibrary(firstReview);

    expect(contexts).toHaveLength(2);
    expect(contexts[0]).toMatchObject({
      id: 'film-review:review-1',
      kind: 'film_play',
      title: 'Batch Clips',
      source: {
        type: 'film_review',
        id: 'review-1',
        label: 'Batch Clips',
      },
      metadata: {
        itemType: 'film_review',
        sport: 'football',
        playCount: 2,
      },
    });
    expect(contexts[0]?.entityRefs).toEqual([
      { type: 'film_review', id: 'review-1', label: 'Batch Clips' },
    ]);
    expect(contexts[1]).toMatchObject({
      id: 'film-review:review-2',
      kind: 'film_play',
      title: 'Red Zone Cutups',
      source: {
        type: 'film_review',
        id: 'review-2',
        label: 'Red Zone Cutups',
      },
      metadata: {
        itemType: 'film_review',
        sport: 'football',
        playCount: 1,
      },
    });
    expect(contexts[1]?.entityRefs).toEqual([
      { type: 'film_review', id: 'review-2', label: 'Red Zone Cutups' },
    ]);
  });

  it('selects a newly opened review before hydration finishes', async () => {
    let resolveEnsure: (() => void) | null = null;
    const ensurePending = new Promise<void>((resolve) => {
      resolveEnsure = () => resolve();
    });

    ensureReviewDetails.mockImplementation(async () => {
      await ensurePending;
      reviewSignal.set(createReviewDoc());
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    component.teamId = 'team-1';

    const openPromise = component.onSelectReview('review-1');
    await Promise.resolve();

    expect(selectReview).toHaveBeenCalledWith('review-1');
    expect(ensureReviewDetails).toHaveBeenCalledWith('review-1', 'team-1');

    if (resolveEnsure) {
      resolveEnsure();
    }
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
    selectReview.mockImplementation((reviewId: string | null) => {
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
        pause: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
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
    expect(componentAccess.playerDuration()).toBe(125);
    expect(componentAccess.playerCurrentTime()).toBe(18);
  });

  it('prefers the loaded source clip duration over absolute timeline end seconds', () => {
    Object.defineProperty(HTMLMediaElement, 'HAVE_METADATA', {
      configurable: true,
      value: HTMLMediaElement.HAVE_METADATA || 1,
    });

    const review: TeamFilmReviewDoc = {
      ...createReviewDoc(),
      durationSec: 180,
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Clip 1 Start',
          startSec: 40,
          endSec: 46,
          sourceId: 'source-1',
        },
        {
          id: 'play-2',
          number: 2,
          label: 'Clip 1 End',
          startSec: 46,
          endSec: 52,
          sourceId: 'source-1',
        },
      ],
      sources: [
        {
          id: 'source-1',
          order: 0,
          title: 'Source Clip 1',
          videoUrl: 'https://cdn.example.com/source-1.mp4',
          thumbnailUrl: 'https://cdn.example.com/source-1.jpg',
          cloudflareVideoId: 'source-1-cf',
        },
      ],
    };
    reviewSignal.set(review);

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const activePlay = componentAccess.currentPlay();
    componentAccess.filmPlayer = {
      nativeElement: {
        readyState: HTMLMediaElement.HAVE_METADATA,
        duration: 12,
        currentTime: 4,
        playbackRate: 1,
        videoWidth: 0,
        videoHeight: 0,
        pause: vi.fn(),
        removeAttribute: vi.fn(),
        load: vi.fn(),
        canPlayType: vi.fn().mockReturnValue('probably'),
      },
    };
    componentAccess.nativeVideoSourceUrl = componentAccess.resolveNativeVideoUrl(
      review,
      activePlay
    );

    expect(componentAccess.resolveReviewDurationSec(review, activePlay)).toBe(12);
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

  it('pauses playback when it reaches a draw effect marker', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 4,
          annotations: [
            {
              kind: 'square',
              bounds: {
                minX: 0.1,
                minY: 0.1,
                maxX: 0.3,
                maxY: 0.3,
              },
              strokeCount: 1,
              activeFromSec: 2,
              activeUntilSec: 3,
            },
          ],
        },
      ],
    });

    const pause = vi.fn();
    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess & {
      onPlayerTimeUpdate: () => void;
    };
    const player = {
      currentTime: 1.9,
      duration: 10,
      paused: false,
      ended: false,
      pause,
      removeAttribute: vi.fn(),
      load: vi.fn(),
      canPlayType: vi.fn().mockReturnValue('probably'),
    };
    componentAccess.filmPlayer = { nativeElement: player };

    componentAccess.onPlayerTimeUpdate();

    player.currentTime = 2.2;
    componentAccess.onPlayerTimeUpdate();

    expect(pause).toHaveBeenCalledTimes(1);
    expect(player.currentTime).toBe(2);
    expect(componentAccess.playerCurrentTime()).toBe(2);

    vi.unstubAllGlobals();
  });

  it('keeps manual scrub position on the full video timeline after release', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      })
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 2,
          endSec: 4,
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const player = {
      currentTime: 2.5,
      duration: 10,
      paused: true,
      ended: false,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      canPlayType: vi.fn().mockReturnValue('probably'),
    };

    componentAccess.filmPlayer = { nativeElement: player };

    componentAccess.onSeekPointerDown();
    componentAccess.onSeekTime(8);

    expect(player.currentTime).toBe(8);
    expect(componentAccess.playerCurrentTime()).toBe(8);

    componentAccess.onSeekPointerUp();

    expect(player.currentTime).toBe(8);
    expect(componentAccess.playerCurrentTime()).toBe(8);

    componentAccess.onPlayerTimeUpdate();

    expect(player.pause).not.toHaveBeenCalled();
    expect(player.currentTime).toBe(8);
    expect(componentAccess.playerCurrentTime()).toBe(8);

    vi.unstubAllGlobals();
  });

  it('keeps the loaded source stable when manual scrub enters another timeline play', async () => {
    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-1',
        },
        {
          id: 'play-2',
          number: 2,
          label: 'Power Read',
          startSec: 5,
          endSec: 9,
          sourceId: 'source-2',
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const load = vi.fn();
    const player = {
      currentTime: 1,
      duration: 10,
      paused: true,
      ended: false,
      readyState: HTMLMediaElement.HAVE_METADATA,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load,
      canPlayType: vi.fn().mockReturnValue('probably'),
    };

    componentAccess.filmPlayer = { nativeElement: player };
    componentAccess.nativePlaybackSourcePlayIndex.set(0);
    const loadedSourceUrl = componentAccess.resolveNativeVideoUrl(
      reviewSignal()!,
      componentAccess.currentPlay()
    );
    componentAccess.nativeVideoSourceUrl = loadedSourceUrl;

    componentAccess.onSeekPointerDown();
    componentAccess.onSeekTime(7);
    componentAccess.onSeekPointerUp();

    expect(componentAccess.currentPlay()?.id).toBe('play-1');

    await componentAccess.configureNativeVideoSourceForSelectedReview(1);

    expect(componentAccess.nativeVideoSourceUrl).toBe(loadedSourceUrl);
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps manual seek aligned to plays on the currently loaded source clip', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Source 1 Play',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-1',
        },
        {
          id: 'play-2',
          number: 2,
          label: 'Source 2 Play',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-2',
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const player = {
      currentTime: 1,
      duration: 10,
      paused: true,
      ended: false,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      canPlayType: vi.fn().mockReturnValue('probably'),
    };

    componentAccess.filmPlayer = { nativeElement: player };
    componentAccess.nativePlaybackSourcePlayIndex.set(0);

    componentAccess.onSeekPointerDown();
    componentAccess.onSeekTime(3);
    componentAccess.onSeekPointerUp();

    expect(componentAccess.currentPlay()?.id).toBe('play-1');
  });

  it('keeps external timestamp seeks aligned to the currently loaded source clip', async () => {
    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Source 1 Play',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-1',
        },
        {
          id: 'play-2',
          number: 2,
          label: 'Source 2 Play',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-2',
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const player = {
      currentTime: 1,
      duration: 10,
      paused: true,
      ended: false,
      readyState: HTMLMediaElement.HAVE_METADATA,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      canPlayType: vi.fn().mockReturnValue('probably'),
    };

    componentAccess.isVideoView.set(true);
    componentAccess.filmPlayer = { nativeElement: player };
    componentAccess.nativePlaybackSourcePlayIndex.set(0);

    await componentAccess.seekToTimestampMs(3000);

    expect(componentAccess.currentPlay()?.id).toBe('play-1');
  });

  it('switches to the requested source clip for source-aware external timestamp seeks', async () => {
    reviewSignal.set({
      ...createReviewDoc(),
      sources: [
        {
          id: 'source-1',
          name: 'Source 1',
          videoUrl: 'https://example.com/source-1.mp4',
          durationSec: 10,
        },
        {
          id: 'source-2',
          name: 'Source 2',
          videoUrl: 'https://example.com/source-2.mp4',
          durationSec: 10,
        },
      ],
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Source 1 Play',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-1',
        },
        {
          id: 'play-2',
          number: 2,
          label: 'Source 2 Play',
          startSec: 0,
          endSec: 4,
          sourceId: 'source-2',
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const player = {
      currentTime: 1,
      duration: 10,
      paused: true,
      ended: false,
      readyState: HTMLMediaElement.HAVE_METADATA,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      canPlayType: vi.fn().mockReturnValue('probably'),
    };

    componentAccess.isVideoView.set(true);
    componentAccess.filmPlayer = { nativeElement: player };
    componentAccess.nativePlaybackSourcePlayIndex.set(0);
    componentAccess.nativeVideoSourceUrl = 'https://example.com/source-1.mp4';

    await componentAccess.seekToTimestampMs(3000, { sourceId: 'source-2' });

    expect(componentAccess.currentPlay()?.id).toBe('play-2');
    expect(componentAccess.nativePlaybackSourcePlayIndex()).toBe(1);
    expect(componentAccess.playerCurrentTime()).toBe(3);
  });

  it('keeps active playback continuous while scrubbing', () => {
    reviewSignal.set(createReviewDoc());

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess & {
      playWhenReady: (player: HTMLVideoElement) => Promise<void>;
      startSmoothProgressTracking: () => void;
      stopSmoothProgressTracking: () => void;
    };

    componentAccess.playWhenReady = vi.fn(() => Promise.resolve());
    componentAccess.startSmoothProgressTracking = vi.fn();
    componentAccess.stopSmoothProgressTracking = vi.fn();

    const player = {
      currentTime: 1,
      duration: 10,
      paused: false,
      ended: false,
      pause: vi.fn(() => {
        player.paused = true;
      }),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      canPlayType: vi.fn().mockReturnValue('probably'),
    };

    componentAccess.filmPlayer = { nativeElement: player };

    componentAccess.onSeekPointerDown();
    expect(player.pause).not.toHaveBeenCalled();
    expect(player.paused).toBe(false);

    componentAccess.onSeekPointerUp();

    expect(componentAccess.playWhenReady).not.toHaveBeenCalled();
    expect(componentAccess.startSmoothProgressTracking).toHaveBeenCalledTimes(1);
    expect(componentAccess.stopSmoothProgressTracking).not.toHaveBeenCalled();
  });

  it('throttles draw overlay rendering during ordinary playback', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 4,
          annotations: [
            {
              kind: 'square',
              bounds: {
                minX: 0.1,
                minY: 0.1,
                maxX: 0.3,
                maxY: 0.3,
              },
              strokeCount: 1,
              activeFromSec: 2,
              activeUntilSec: 3,
            },
          ],
        },
      ],
    });

    const nowSpy = vi.spyOn(performance, 'now');
    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess & {
      hasDrawing: WritableSignal<boolean>;
      renderDrawOverlay: () => void;
      updatePlayerTimeSignal: (currentSec: number) => void;
    };
    componentAccess.hasDrawing.set(true);
    componentAccess.renderDrawOverlay = vi.fn();

    nowSpy.mockReturnValue(20);
    componentAccess.updatePlayerTimeSignal(1);
    expect(componentAccess.renderDrawOverlay).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(120);
    componentAccess.updatePlayerTimeSignal(2.2);
    expect(componentAccess.renderDrawOverlay).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(150);
    componentAccess.updatePlayerTimeSignal(2.3);
    expect(componentAccess.renderDrawOverlay).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(230);
    componentAccess.updatePlayerTimeSignal(2.4);
    expect(componentAccess.renderDrawOverlay).toHaveBeenCalledTimes(2);

    nowSpy.mockReturnValue(260);
    componentAccess.updatePlayerTimeSignal(3.4);
    expect(componentAccess.renderDrawOverlay).toHaveBeenCalledTimes(3);

    nowSpy.mockReturnValue(380);
    componentAccess.updatePlayerTimeSignal(3.5);
    expect(componentAccess.renderDrawOverlay).toHaveBeenCalledTimes(3);

    nowSpy.mockRestore();
  });

  it('opens a below-player text draft immediately when the text tool is enabled', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const focusSpy = vi
      .spyOn(componentAccess, 'focusTextEffectInput')
      .mockImplementation(() => undefined);

    componentAccess.onDrawToolToggle('text');

    expect(componentAccess.drawModeEnabled()).toBe(true);
    expect(componentAccess.selectedDrawTool()).toBe('text');
    expect(componentAccess.drawAnnotation).toEqual({
      kind: 'text',
      text: '',
      bounds: componentAccess.buildDefaultTextEffectBounds(),
    });
    expect(componentAccess.isTextEffectPanelVisible()).toBe(true);
    expect(componentAccess.isTextEffectPanelEditable()).toBe(true);
    expect(componentAccess.currentTextEffectText()).toBe('');
    expect(componentAccess.currentTextEffectPanelWindowLabel()).toBe('00:00 - 00:01');
    expect(focusSpy).toHaveBeenCalledWith(true);
  });

  it('treats an empty text draft as clearable from the toolbar', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    componentAccess.onDrawToolToggle('text');

    expect(componentAccess.hasDrawing()).toBe(false);
    expect(componentAccess.hasClearableDrawOverlay()).toBe(true);

    componentAccess.clearDrawOverlay();

    expect(componentAccess.drawAnnotation).toBeNull();
    expect(componentAccess.drawModeEnabled()).toBe(false);
    expect(componentAccess.hasClearableDrawOverlay()).toBe(false);
  });

  it('shows the text draft only while its effect window is active', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    componentAccess.onDrawToolToggle('text');
    componentAccess.currentDrawEffectWindow = {
      startSec: 2,
      endSec: 4,
    };

    componentAccess.updatePlayerTimeSignal(1.5, true);
    expect(componentAccess.isTextEffectPanelVisible()).toBe(false);

    componentAccess.updatePlayerTimeSignal(3, true);
    expect(componentAccess.isTextEffectPanelVisible()).toBe(true);

    componentAccess.updatePlayerTimeSignal(4.5, true);
    expect(componentAccess.isTextEffectPanelVisible()).toBe(false);
  });

  it('restores persisted text annotations into editable text state', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const persistedAnnotation: TeamFilmReviewPlayAnnotation = {
      kind: 'text',
      text: 'QB Eyes Safety',
      bounds: {
        minX: 0.18,
        minY: 0.22,
        maxX: 0.46,
        maxY: 0.34,
      },
      activeFromSec: 2,
      activeUntilSec: 4,
    };

    const restored = componentAccess.restoreEditableDrawAnnotation(persistedAnnotation);

    expect(restored).toEqual({
      kind: 'text',
      text: 'QB Eyes Safety',
      bounds: {
        minX: 0.18,
        minY: 0.22,
        maxX: 0.46,
        maxY: 0.34,
      },
    });
  });

  it('restores legacy freehand annotations saved as a flat points array', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const persistedAnnotation = {
      kind: 'freehand',
      strokeCount: 2,
      bounds: {
        minX: 0.1,
        minY: 0.2,
        maxX: 0.6,
        maxY: 0.7,
      },
      // Legacy payload shape: flat list instead of nested stroke arrays.
      strokes: [
        { x: 0.11, y: 0.22 },
        { x: 0.33, y: 0.44 },
      ],
    } as unknown as TeamFilmReviewPlayAnnotation;

    const restored = componentAccess.restoreEditableDrawAnnotation(persistedAnnotation);

    expect(restored).toEqual({
      kind: 'freehand',
      bounds: {
        minX: 0.1,
        minY: 0.2,
        maxX: 0.6,
        maxY: 0.7,
      },
      strokes: [
        [
          { x: 0.11, y: 0.22 },
          { x: 0.33, y: 0.44 },
        ],
      ],
    });
  });

  it('blocks delete mutation when the user lacks write access', async () => {
    reviewSignal.set({
      ...createReviewDoc(),
      createdBy: 'owner-1',
      writeAccessKeys: ['user:owner-1'],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const event = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as Event;

    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    await componentAccess.onDeleteConfirm(reviewSignal()!, event);

    expect(deleteReview).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      'You do not have write access to edit this team film review.'
    );
  });

  it('allows delete mutation when the user has explicit write access', async () => {
    reviewSignal.set({
      ...createReviewDoc(),
      createdBy: 'owner-1',
      writeAccessKeys: ['user:viewer-1'],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const event = {
      stopPropagation: vi.fn(),
      preventDefault: vi.fn(),
    } as unknown as Event;

    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    await componentAccess.onDeleteConfirm(reviewSignal()!, event);

    expect(deleteReview).toHaveBeenCalledWith('review-1');
  });

  it('allows coach personal-scope library mutations when the user owns the review', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      teamId: undefined,
      createdBy: 'viewer-1',
      writeAccessKeys: ['user:viewer-1'],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    component.role = 'coach';
    component.teamId = null;

    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    expect(componentAccess.canMutateFilmReviewLibrary()).toBe(true);
  });
});
