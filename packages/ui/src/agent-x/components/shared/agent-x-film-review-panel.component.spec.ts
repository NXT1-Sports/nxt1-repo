import { computed, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { TEST_IDS } from '@nxt1/core/testing';
import type {
  TeamFilmReviewCameraAngle,
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
      paused?: boolean;
    };
  };
  nativeVideoSourceUrl: string | null;
  nativePlaybackSourcePlayIndex: WritableSignal<number | null>;
  selectedCameraAngle: WritableSignal<TeamFilmReviewCameraAngle>;
  availableCameraAngleOptions: () => readonly {
    readonly value: TeamFilmReviewCameraAngle;
    readonly label: string;
    readonly sourceCount: number;
  }[];
  isCameraAngleOptionActive: (cameraAngle: TeamFilmReviewCameraAngle) => boolean;
  selectedCameraAngleLabel: () => string;
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
  buildFilmPlayDragContext: (
    review: TeamFilmReviewDoc,
    play: TeamFilmReviewPlaySegment,
    fallbackIndex: number
  ) => { readonly metadata?: Readonly<Record<string, unknown>> };
  configureNativeVideoSourceForSelectedReview: (delayMs?: number) => Promise<void>;
  onSelectCameraAngle: (cameraAngle: TeamFilmReviewCameraAngle) => void;
  onSelectReview: (reviewId: string) => Promise<void>;
  onSeekPointerDown: () => void;
  onSeekPointerUp: () => void;
  onSeekTime: (nextTime: number) => void;
  onPlayerTimeUpdate: () => void;
  onPlayerPlay: () => void;
  seekToTimestampMs: (
    timeMs: number,
    options?: { readonly filmReviewId?: string | null; readonly sourceId?: string | null }
  ) => Promise<void>;
  updatePlayerTimeSignal: (currentTimeSec: number, skipOverlayRender?: boolean) => void;
  jumpTo: (seconds: number) => void;
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
  onDrawPointerDown: (event: PointerEvent) => void;
  onDrawPointerMove: (event: PointerEvent) => void;
  onDrawPointerUp: (event: PointerEvent) => void;
  hasDrawing: () => boolean;
  hasClearableDrawOverlay: () => boolean;
  clearDrawOverlay: () => void;
  currentDrawAnnotationIndex: number | null;
  updateDrawEffectDuration: (markerId: string, durationSec: number) => Promise<void>;
  restoreEditableDrawAnnotation: (
    annotation: TeamFilmReviewPlayAnnotation
  ) => FilmReviewPanelTestEditableDrawAnnotation | null;
  shouldRenderCurrentDrawAnnotation: () => boolean;
  shouldRenderDrawOverlayAtCurrentTime: () => boolean;
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
  const saveTimelinePlayAnnotations =
    vi.fn<AgentXFilmReviewService['saveTimelinePlayAnnotations']>();
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
    saveTimelinePlayAnnotations.mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AgentXFilmReviewService,
          useValue: {
            ensureReviewDetails,
            select: selectReview,
            deleteReview,
            saveTimelinePlayAnnotations,
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

  it('falls back to the visible playback source thumbnail when the dragged source has no poster', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      sources: [
        {
          id: 'wide-20',
          order: 0,
          title: 'Clip 020 Wide',
          videoUrl: 'https://cdn.example.com/clip-020-wide.mp4',
          cloudflareVideoId: 'wide-20-cf',
          cameraAngle: 'wide',
          angleGroupId: 'clip-020',
        },
        {
          id: 'tight-20',
          order: 1,
          title: 'Clip 020 Tight',
          videoUrl: 'https://cdn.example.com/clip-020-tight.mp4',
          thumbnailUrl: 'https://cdn.example.com/clip-020-tight.jpg',
          cloudflareVideoId: 'tight-20-cf',
          cameraAngle: 'tight',
          angleGroupId: 'clip-020',
        },
      ],
      timeline: [
        {
          id: 'play-20',
          number: 20,
          label: 'Mesh Concept',
          startSec: 5,
          endSec: 12,
          sourceId: 'wide-20',
          sourceIds: ['wide-20', 'tight-20'],
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    componentAccess.selectedCameraAngle.set('tight');

    const context = componentAccess.buildFilmPlayDragContext(
      reviewSignal()!,
      {
        id: 'play-20',
        number: 20,
        label: 'Mesh Concept',
        startSec: 5,
        endSec: 12,
        sourceId: 'wide-20',
        sourceIds: ['wide-20', 'tight-20'],
      },
      0
    );

    expect(context.media).toMatchObject({
      videoUrl: 'https://cdn.example.com/clip-020-wide.mp4',
      thumbnailUrl: 'https://cdn.example.com/clip-020-tight.jpg',
      cloudflareVideoId: 'wide-20-cf',
    });
  });

  it('falls back to the review thumbnail when no source poster is available', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      thumbnailUrl: 'https://cdn.example.com/review/fallback.jpg',
      sources: [
        {
          id: 'source-1',
          order: 0,
          title: 'Source Clip 1',
          videoUrl: 'https://cdn.example.com/source-1.mp4',
          cloudflareVideoId: 'source-1-cf',
        },
      ],
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 1,
          sourceId: 'source-1',
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const panelHarness = component as unknown as FilmReviewPanelTestHarness;
    const context = panelHarness.buildFilmPlayDragContext(
      reviewSignal()!,
      reviewSignal()!.timeline![0]!,
      0
    );

    expect(context.media).toMatchObject({
      videoUrl: 'https://cdn.example.com/source-1.mp4',
      thumbnailUrl: 'https://cdn.example.com/review/fallback.jpg',
      cloudflareVideoId: 'source-1-cf',
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

  it('adds imported custom breakdown columns to the visible timeline grid', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      breakdownSource: {
        provider: 'csv',
        fileName: 'week-1.csv',
        rowCount: 2,
        playCount: 2,
        customColumns: [
          {
            id: 'backsets',
            label: 'Backsets',
            valueType: 'string',
            width: 'regular',
          },
          {
            id: 'isscripted',
            label: 'Is Scripted',
            valueType: 'boolean',
            width: 'compact',
          },
        ],
      },
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 8,
          sourceId: 'source-1',
          tags: {
            odk: 'O',
            backsets: 'Pistol Strong',
            isscripted: true,
          },
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as {
      currentTimelineColumns: () => readonly {
        readonly id: string;
        readonly label: string;
      }[];
      getTimelineColumnDisplayValue: (
        play: TeamFilmReviewPlaySegment,
        column: {
          readonly kind: 'tag';
          readonly id: string;
          readonly label: string;
          readonly fieldKey: string;
          readonly width: 'compact' | 'regular' | 'wide';
          readonly tagDefinition: {
            readonly id: string;
            readonly label: string;
            readonly valueType: 'string' | 'number' | 'enum' | 'boolean';
          };
        }
      ) => string;
    };

    const timelineColumns = componentAccess.currentTimelineColumns();
    const backsetsColumn = timelineColumns.find((column) => column.id === 'tag:backsets');
    const scriptedColumn = timelineColumns.find((column) => column.id === 'tag:isscripted');
    const firstPlay = reviewSignal()!.timeline![0]!;

    expect(backsetsColumn).toMatchObject({ label: 'Backsets' });
    expect(scriptedColumn).toMatchObject({ label: 'Is Scripted' });
    expect(
      componentAccess.getTimelineColumnDisplayValue(firstPlay, {
        id: 'tag:backsets',
        kind: 'tag',
        label: 'Backsets',
        fieldKey: 'tag:backsets',
        width: 'regular',
        tagDefinition: {
          id: 'backsets',
          label: 'Backsets',
          valueType: 'string',
        },
      })
    ).toBe('Pistol Strong');
    expect(
      componentAccess.getTimelineColumnDisplayValue(firstPlay, {
        id: 'tag:isscripted',
        kind: 'tag',
        label: 'Is Scripted',
        fieldKey: 'tag:isscripted',
        width: 'compact',
        tagDefinition: {
          id: 'isscripted',
          label: 'Is Scripted',
          valueType: 'boolean',
        },
      })
    ).toBe('Y');
  });

  it('switches the current play to the matching wide or tight source angle', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      sources: [
        {
          id: 'wide-13',
          order: 0,
          title: 'Clip 013 Wide',
          videoUrl: 'https://cdn.example.com/clip-013-wide.mp4',
          cameraAngle: 'wide',
          angleGroupId: 'angle-clip-013',
        },
        {
          id: 'tight-13',
          order: 1,
          title: 'Clip 013 Tight',
          videoUrl: 'https://cdn.example.com/clip-013-tight.mp4',
          cameraAngle: 'tight',
          angleGroupId: 'angle-clip-013',
        },
        {
          id: 'wide-14',
          order: 2,
          title: 'Clip 014 Wide',
          videoUrl: 'https://cdn.example.com/clip-014-wide.mp4',
          cameraAngle: 'wide',
          angleGroupId: 'angle-clip-014',
        },
      ],
      timeline: [
        {
          id: 'play-13',
          number: 13,
          label: 'Inside Zone',
          startSec: 18,
          endSec: 26,
          sourceId: 'wide-13',
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    expect(componentAccess.availableCameraAngleOptions().map((option) => option.value)).toEqual([
      'wide',
      'tight',
    ]);
    expect(
      componentAccess.resolveNativeVideoUrl(reviewSignal()!, componentAccess.currentPlay())
    ).toBe('https://cdn.example.com/clip-013-wide.mp4');

    componentAccess.selectedCameraAngle.set('tight');

    expect(
      componentAccess.resolveNativeVideoUrl(reviewSignal()!, componentAccess.currentPlay())
    ).toBe('https://cdn.example.com/clip-013-tight.mp4');
  });

  it('switches grouped sourceIds within the same timeline play', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      sources: [
        {
          id: 'wide-20',
          order: 0,
          title: 'Clip 020 Wide',
          videoUrl: 'https://cdn.example.com/clip-020-wide.mp4',
          cameraAngle: 'wide',
          angleGroupId: 'angle-clip-020',
        },
        {
          id: 'tight-20',
          order: 1,
          title: 'Clip 020 Tight',
          videoUrl: 'https://cdn.example.com/clip-020-tight.mp4',
          cameraAngle: 'tight',
          angleGroupId: 'angle-clip-020',
        },
        {
          id: 'wide-21',
          order: 2,
          title: 'Clip 021 Wide',
          videoUrl: 'https://cdn.example.com/clip-021-wide.mp4',
          cameraAngle: 'wide',
          angleGroupId: 'angle-clip-021',
        },
      ],
      timeline: [
        {
          id: 'play-20',
          number: 20,
          label: 'Power Read',
          startSec: 0,
          endSec: 12,
          sourceId: 'wide-20',
          sourceIds: ['wide-20', 'tight-20'],
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    expect(componentAccess.availableCameraAngleOptions().map((option) => option.value)).toEqual([
      'wide',
      'tight',
    ]);
    expect(
      componentAccess.resolveNativeVideoUrl(reviewSignal()!, componentAccess.currentPlay())
    ).toBe('https://cdn.example.com/clip-020-wide.mp4');

    componentAccess.selectedCameraAngle.set('tight');

    expect(
      componentAccess.resolveNativeVideoUrl(reviewSignal()!, componentAccess.currentPlay())
    ).toBe('https://cdn.example.com/clip-020-tight.mp4');
  });

  it('defaults Agent X grouped play context to the wide source unless requested otherwise', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      sources: [
        {
          id: 'wide-20',
          order: 0,
          title: 'Clip 020 Wide',
          videoUrl: 'https://cdn.example.com/clip-020-wide.mp4',
          cameraAngle: 'wide',
          angleGroupId: 'angle-clip-020',
        },
        {
          id: 'tight-20',
          order: 1,
          title: 'Clip 020 Tight',
          videoUrl: 'https://cdn.example.com/clip-020-tight.mp4',
          cameraAngle: 'tight',
          angleGroupId: 'angle-clip-020',
        },
      ],
      timeline: [
        {
          id: 'play-20',
          number: 20,
          label: 'Power Read',
          startSec: 0,
          endSec: 12,
          sourceId: 'wide-20',
          sourceIds: ['wide-20', 'tight-20'],
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    componentAccess.selectedCameraAngle.set('tight');

    expect(
      componentAccess.resolveNativeVideoUrl(reviewSignal()!, componentAccess.currentPlay())
    ).toBe('https://cdn.example.com/clip-020-tight.mp4');

    const context = componentAccess.buildFilmPlayDragContext(
      { ...reviewSignal()!, perspective: 'neutral' },
      componentAccess.currentPlay()!,
      0
    );

    expect(context.metadata).toMatchObject({
      perspective: 'neutral',
      sourceId: 'wide-20',
      sourceTitle: 'Clip 020 Wide',
      sourceCameraAngle: 'wide',
    });
  });

  it('shows a single inferred camera angle option for legacy sources without metadata', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      sources: [
        {
          id: 'legacy-tight-1',
          order: 0,
          title: 'Tight - Clip 001.mp4',
          videoUrl: 'https://cdn.example.com/tight-clip-001.mp4',
        },
      ],
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Kickoff',
          startSec: 0,
          endSec: 17,
          sourceId: 'legacy-tight-1',
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    expect(componentAccess.availableCameraAngleOptions()).toEqual([
      { value: 'tight', label: 'Tight', sourceCount: 1 },
    ]);
    expect(componentAccess.selectedCameraAngleLabel()).toBe('Tight');
    expect(componentAccess.isCameraAngleOptionActive('tight')).toBe(true);
  });

  it('always exposes a fallback view angle option when no angle data exists', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      title: 'Game Film',
      sources: [],
      videoUrl: 'https://cdn.example.com/game-film.mp4',
      timeline: [],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    expect(componentAccess.availableCameraAngleOptions()).toEqual([
      { value: 'unknown', label: 'View', sourceCount: 1 },
    ]);
    expect(componentAccess.selectedCameraAngleLabel()).toBe('View');
    expect(componentAccess.isCameraAngleOptionActive('unknown')).toBe(true);
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

  it('keeps the loaded video element when annotation saves rotate a signed URL', async () => {
    Object.defineProperty(HTMLMediaElement, 'HAVE_METADATA', {
      configurable: true,
      value: HTMLMediaElement.HAVE_METADATA || 1,
    });
    Object.defineProperty(HTMLMediaElement, 'NETWORK_LOADING', {
      configurable: true,
      value: HTMLMediaElement.NETWORK_LOADING || 2,
    });

    const originalUrl =
      'https://storage.googleapis.com/nxt1-test/film/1784846276167_Wide_-_Clip_013.mp4?X-Goog-Signature=old';
    const refreshedUrl =
      'https://storage.googleapis.com/nxt1-test/film/1784846276167_Wide_-_Clip_013.mp4?X-Goog-Signature=new';
    const storagePath = 'film/1784846276167_Wide_-_Clip_013.mp4';
    const review: TeamFilmReviewDoc = {
      ...createReviewDoc(),
      cloudflareVideoId: undefined,
      videoUrl: originalUrl,
      storagePath,
      sources: [
        {
          id: 'source-1',
          order: 0,
          title: 'Wide Clip 013',
          videoUrl: originalUrl,
          storagePath,
        },
      ],
    };
    reviewSignal.set(review);

    const load = vi.fn();
    const player = {
      src: '',
      currentSrc: '',
      readyState: HTMLMediaElement.HAVE_METADATA,
      networkState: HTMLMediaElement.NETWORK_LOADING,
      duration: 20,
      currentTime: 6.25,
      playbackRate: 1,
      videoWidth: 1280,
      videoHeight: 720,
      paused: true,
      ended: false,
      crossOrigin: '',
      preload: '',
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load,
      canPlayType: vi.fn().mockReturnValue('probably'),
      getAttribute(name: string) {
        return name === 'src' ? this.src : null;
      },
    };

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    componentAccess.filmPlayer = { nativeElement: player };

    await componentAccess.configureNativeVideoSourceForSelectedReview(1);
    player.currentSrc = player.src;
    load.mockClear();

    reviewSignal.set({
      ...review,
      videoUrl: refreshedUrl,
      sources: [
        {
          ...review.sources![0],
          videoUrl: refreshedUrl,
        },
      ],
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 1,
          sourceId: 'source-1',
          annotations: [
            {
              kind: 'circle',
              bounds: { minX: 0.2, minY: 0.2, maxX: 0.4, maxY: 0.4 },
              strokeCount: 1,
              activeFromSec: 6,
              activeUntilSec: 7,
            },
          ],
        },
      ],
    });

    await componentAccess.configureNativeVideoSourceForSelectedReview(2);

    expect(player.src).toBe(originalUrl);
    expect(load).not.toHaveBeenCalled();
    expect(componentAccess.nativeVideoSourceUrl).toBe(originalUrl);
    expect(componentAccess.playerCurrentTime()).toBe(6.25);
    expect(componentAccess.playerDuration()).toBe(20);
  });

  it('waits for queued annotation persistence before saving a draw effect duration change', async () => {
    vi.useFakeTimers();

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
              kind: 'circle',
              bounds: {
                minX: 0.2,
                minY: 0.2,
                maxX: 0.4,
                maxY: 0.4,
              },
              strokeCount: 1,
              activeFromSec: 1,
              activeUntilSec: 2,
            },
          ],
        },
      ],
    });

    let resolveFirstSave: (() => void) | null = null;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });

    const applyAnnotations = (
      playIndex: number,
      annotations: readonly TeamFilmReviewPlayAnnotation[]
    ): void => {
      reviewSignal.update((current) => {
        if (!current?.timeline) {
          return current;
        }

        return {
          ...current,
          timeline: current.timeline.map((play, index) =>
            index === playIndex ? { ...play, annotations: [...annotations] } : play
          ),
        };
      });
    };

    saveTimelinePlayAnnotations.mockImplementationOnce(
      async (_reviewId, playIndex, annotations) => {
        await firstSave;
        applyAnnotations(playIndex, annotations);
      }
    );
    saveTimelinePlayAnnotations.mockImplementation(async (_reviewId, playIndex, annotations) => {
      applyAnnotations(playIndex, annotations);
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;

    componentAccess.onDrawToolToggle('circle');
    componentAccess.drawAnnotation = {
      kind: 'circle',
      bounds: {
        minX: 0.25,
        minY: 0.25,
        maxX: 0.45,
        maxY: 0.45,
      },
    };
    componentAccess.currentDrawEffectWindow = { startSec: 1, endSec: 2 };

    const persistCall = (
      componentAccess as unknown as {
        scheduleCurrentPlayAnnotationPersistence: () => void;
      }
    ).scheduleCurrentPlayAnnotationPersistence();
    void persistCall;
    vi.advanceTimersByTime(180);
    await Promise.resolve();

    expect(saveTimelinePlayAnnotations).toHaveBeenCalledTimes(1);

    const durationSavePromise = componentAccess.updateDrawEffectDuration(
      'play-0-annotation-0',
      0.75
    );
    await Promise.resolve();

    expect(saveTimelinePlayAnnotations).toHaveBeenCalledTimes(1);

    try {
      if (resolveFirstSave) {
        resolveFirstSave();
      }
      await firstSave;
      await durationSavePromise;

      expect(saveTimelinePlayAnnotations).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('delegates a freehand drawing draft to the film-review drawing persistence service', async () => {
    vi.useFakeTimers();
    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 4,
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const drawingState = component as unknown as { hasDrawing: WritableSignal<boolean> };
    componentAccess.onDrawToolToggle('freehand');
    componentAccess.drawAnnotation = {
      kind: 'freehand',
      bounds: { minX: 0.1, minY: 0.2, maxX: 0.4, maxY: 0.5 },
      strokes: [
        [
          { x: 0.1, y: 0.2 },
          { x: 0.2, y: 0.3 },
        ],
        [{ x: 0.4, y: 0.5 }],
      ],
    };
    componentAccess.currentDrawEffectWindow = { startSec: 1, endSec: 2 };
    drawingState.hasDrawing.set(true);

    (
      componentAccess as unknown as {
        scheduleCurrentPlayAnnotationPersistence: () => void;
      }
    ).scheduleCurrentPlayAnnotationPersistence();
    vi.advanceTimersByTime(180);
    await Promise.resolve();

    expect(saveTimelinePlayAnnotations).toHaveBeenCalledWith('review-1', 0, [
      expect.objectContaining({
        kind: 'freehand',
        strokeCount: 2,
        strokes: [
          [
            { x: 0.1, y: 0.2 },
            { x: 0.2, y: 0.3 },
          ],
          [{ x: 0.4, y: 0.5 }],
        ],
      }),
    ]);
    vi.useRealTimers();
  });

  it('selects an existing visible circle annotation before starting a new draw', () => {
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
              kind: 'circle',
              bounds: {
                minX: 0.2,
                minY: 0.2,
                maxX: 0.5,
                maxY: 0.5,
              },
              strokeCount: 1,
              activeFromSec: 0,
              activeUntilSec: 4,
            },
          ],
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess & {
      drawCanvas?: {
        nativeElement: HTMLCanvasElement & { setPointerCapture?: (pointerId: number) => void };
      };
      toNormalizedDrawPoint: () => { x: number; y: number } | null;
      syncDrawCanvasCursor: () => void;
      ensureDrawCanvasSize: () => void;
      renderDrawOverlay: () => void;
    };

    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 300 });
    canvas.style.cursor = 'default';
    componentAccess.drawCanvas = { nativeElement: canvas };
    componentAccess.toNormalizedDrawPoint = () => ({ x: 0.3, y: 0.3 });
    componentAccess.syncDrawCanvasCursor = () => undefined;
    componentAccess.ensureDrawCanvasSize = () => undefined;
    componentAccess.renderDrawOverlay = () => undefined;

    componentAccess.onDrawToolToggle('circle');
    componentAccess.drawAnnotation = null;
    componentAccess.currentDrawAnnotationIndex = null;

    componentAccess.onDrawPointerDown({
      pointerId: 1,
      preventDefault: () => undefined,
    } as PointerEvent);

    expect(componentAccess.currentDrawAnnotationIndex).toBe(0);
    expect(componentAccess.drawAnnotation).toEqual({
      kind: 'circle',
      bounds: {
        minX: 0.2,
        minY: 0.2,
        maxX: 0.5,
        maxY: 0.5,
      },
    });
  });

  it('resizes an existing visible circle annotation from its corner handle', () => {
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
              kind: 'circle',
              bounds: {
                minX: 0.2,
                minY: 0.2,
                maxX: 0.5,
                maxY: 0.5,
              },
              strokeCount: 1,
              activeFromSec: 0,
              activeUntilSec: 4,
            },
          ],
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess & {
      drawCanvas?: {
        nativeElement: HTMLCanvasElement & {
          setPointerCapture?: (pointerId: number) => void;
          releasePointerCapture?: (pointerId: number) => void;
        };
      };
      toNormalizedDrawPoint: () => { x: number; y: number } | null;
      syncDrawCanvasCursor: () => void;
      ensureDrawCanvasSize: () => void;
      renderDrawOverlay: () => void;
    };

    const canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 400 });
    Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 300 });
    canvas.setPointerCapture = vi.fn();
    canvas.releasePointerCapture = vi.fn();
    componentAccess.drawCanvas = { nativeElement: canvas };
    let pointer = { x: 0.5, y: 0.5 };
    componentAccess.toNormalizedDrawPoint = () => pointer;
    componentAccess.syncDrawCanvasCursor = () => undefined;
    componentAccess.ensureDrawCanvasSize = () => undefined;
    componentAccess.renderDrawOverlay = () => undefined;

    componentAccess.onDrawToolToggle('circle');
    componentAccess.drawAnnotation = null;
    componentAccess.currentDrawAnnotationIndex = null;

    componentAccess.onDrawPointerDown({
      pointerId: 1,
      preventDefault: () => undefined,
    } as PointerEvent);

    pointer = { x: 0.65, y: 0.65 };
    componentAccess.onDrawPointerMove({
      pointerId: 1,
      preventDefault: () => undefined,
    } as PointerEvent);

    expect(componentAccess.currentDrawAnnotationIndex).toBe(0);
    expect(componentAccess.drawAnnotation).toEqual({
      kind: 'circle',
      bounds: {
        minX: 0.2,
        minY: 0.2,
        maxX: 0.65,
        maxY: 0.65,
      },
    });
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('preserves saved drawing identity when persisting a resized circle annotation', async () => {
    vi.useFakeTimers();
    const savedAnnotation: TeamFilmReviewPlayAnnotation = {
      kind: 'circle',
      drawingId: 'drawing-1',
      drawingRevision: 4,
      bounds: {
        minX: 0.2,
        minY: 0.2,
        maxX: 0.5,
        maxY: 0.5,
      },
      strokeCount: 1,
      activeFromSec: 0,
      activeUntilSec: 4,
    };
    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 4,
          annotations: [savedAnnotation],
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const drawingState = component as unknown as { hasDrawing: WritableSignal<boolean> };
    const editableAnnotation = componentAccess.restoreEditableDrawAnnotation(savedAnnotation);
    if (!editableAnnotation) {
      throw new Error('Expected editable saved annotation');
    }

    componentAccess.onDrawToolToggle('circle');
    componentAccess.currentDrawAnnotationIndex = 0;
    componentAccess.drawAnnotation = {
      ...editableAnnotation,
      bounds: {
        minX: 0.2,
        minY: 0.2,
        maxX: 0.65,
        maxY: 0.65,
      },
    };
    componentAccess.currentDrawEffectWindow = { startSec: 0, endSec: 4 };
    drawingState.hasDrawing.set(true);

    (
      componentAccess as unknown as {
        scheduleCurrentPlayAnnotationPersistence: () => void;
      }
    ).scheduleCurrentPlayAnnotationPersistence();
    vi.advanceTimersByTime(180);
    await Promise.resolve();

    expect(saveTimelinePlayAnnotations).toHaveBeenCalledWith('review-1', 0, [
      expect.objectContaining({
        kind: 'circle',
        drawingId: 'drawing-1',
        drawingRevision: 4,
        bounds: {
          minX: 0.2,
          minY: 0.2,
          maxX: 0.65,
          maxY: 0.65,
        },
      }),
    ]);
    vi.useRealTimers();
  });

  it('hides an active draft draw effect after its timing window ends', () => {
    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 8,
        },
      ],
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const drawingState = component as unknown as { hasDrawing: WritableSignal<boolean> };

    componentAccess.onDrawToolToggle('circle');
    componentAccess.currentDrawAnnotationIndex = null;
    componentAccess.drawAnnotation = {
      kind: 'circle',
      bounds: { minX: 0.2, minY: 0.2, maxX: 0.5, maxY: 0.5 },
    };
    componentAccess.currentDrawEffectWindow = { startSec: 2, endSec: 5 };
    drawingState.hasDrawing.set(true);

    componentAccess.playerCurrentTime.set(4.99);
    expect(componentAccess.shouldRenderCurrentDrawAnnotation()).toBe(true);

    componentAccess.playerCurrentTime.set(5.01);
    expect(componentAccess.shouldRenderCurrentDrawAnnotation()).toBe(false);
  });

  it('waits for in-flight queued annotation persistence before saving a draw effect duration change', async () => {
    vi.useFakeTimers();

    const originalAnnotation: TeamFilmReviewPlayAnnotation = {
      kind: 'circle',
      bounds: {
        minX: 0.2,
        minY: 0.2,
        maxX: 0.4,
        maxY: 0.4,
      },
      strokeCount: 1,
      activeFromSec: 1,
      activeUntilSec: 2,
    };

    reviewSignal.set({
      ...createReviewDoc(),
      timeline: [
        {
          id: 'play-1',
          number: 1,
          label: 'Inside Zone',
          startSec: 0,
          endSec: 4,
          annotations: [originalAnnotation],
        },
      ],
    });

    let resolveFirstSave: (() => void) | null = null;
    let resolveSecondSave: (() => void) | null = null;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirstSave = resolve;
    });
    const secondSave = new Promise<void>((resolve) => {
      resolveSecondSave = resolve;
    });

    const applyAnnotations = (
      playIndex: number,
      annotations: readonly TeamFilmReviewPlayAnnotation[]
    ): void => {
      reviewSignal.update((current) => {
        if (!current?.timeline) {
          return current;
        }

        return {
          ...current,
          timeline: current.timeline.map((play, index) =>
            index === playIndex ? { ...play, annotations: [...annotations] } : play
          ),
        };
      });
    };

    saveTimelinePlayAnnotations.mockImplementationOnce(
      async (_reviewId, playIndex, annotations) => {
        await firstSave;
        applyAnnotations(playIndex, annotations);
      }
    );
    saveTimelinePlayAnnotations.mockImplementationOnce(
      async (_reviewId, playIndex, annotations) => {
        await secondSave;
        applyAnnotations(playIndex, annotations);
      }
    );
    saveTimelinePlayAnnotations.mockImplementation(async (_reviewId, playIndex, annotations) => {
      applyAnnotations(playIndex, annotations);
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess;
    const drawingState = component as unknown as { hasDrawing: WritableSignal<boolean> };
    const editableAnnotation = componentAccess.restoreEditableDrawAnnotation(originalAnnotation);
    if (!editableAnnotation) {
      throw new Error('Expected editable draw annotation');
    }

    componentAccess.onDrawToolToggle('circle');
    componentAccess.currentDrawAnnotationIndex = 0;
    componentAccess.drawAnnotation = {
      ...editableAnnotation,
      bounds: {
        minX: 0.25,
        minY: 0.25,
        maxX: 0.45,
        maxY: 0.45,
      },
    };
    componentAccess.currentDrawEffectWindow = { startSec: 1, endSec: 2 };
    drawingState.hasDrawing.set(true);

    const schedulePersistence = componentAccess as unknown as {
      scheduleCurrentPlayAnnotationPersistence: () => void;
    };

    schedulePersistence.scheduleCurrentPlayAnnotationPersistence();
    vi.advanceTimersByTime(180);
    await Promise.resolve();

    expect(saveTimelinePlayAnnotations).toHaveBeenCalledTimes(1);

    componentAccess.drawAnnotation = {
      ...componentAccess.drawAnnotation!,
      bounds: {
        minX: 0.3,
        minY: 0.3,
        maxX: 0.5,
        maxY: 0.5,
      },
    };
    schedulePersistence.scheduleCurrentPlayAnnotationPersistence();
    vi.advanceTimersByTime(180);
    await Promise.resolve();

    expect(saveTimelinePlayAnnotations).toHaveBeenCalledTimes(1);

    const durationSavePromise = componentAccess.updateDrawEffectDuration(
      'play-0-annotation-0',
      0.75
    );
    await Promise.resolve();

    expect(saveTimelinePlayAnnotations).toHaveBeenCalledTimes(1);

    try {
      if (resolveFirstSave) {
        resolveFirstSave();
      }
      await firstSave;
      await Promise.resolve();

      expect(saveTimelinePlayAnnotations).toHaveBeenCalledTimes(2);

      if (resolveSecondSave) {
        resolveSecondSave();
      }
      await secondSave;
      await durationSavePromise;

      expect(saveTimelinePlayAnnotations).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
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

  it('pauses at a draw effect marker and keeps it visible while paused', () => {
    vi.useFakeTimers();
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
      renderDrawOverlay: () => void;
    };
    const renderDrawOverlay = vi.fn();
    componentAccess.renderDrawOverlay = renderDrawOverlay;
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
    expect(componentAccess.hasDrawing()).toBe(false);

    componentAccess.onPlayerTimeUpdate();

    player.currentTime = 2.2;
    componentAccess.onPlayerTimeUpdate();

    player.currentTime = 1.999;
    componentAccess.updatePlayerTimeSignal(1.999, true);

    expect(pause).toHaveBeenCalledTimes(1);
    expect(componentAccess.shouldRenderDrawOverlayAtCurrentTime()).toBe(true);
    expect(renderDrawOverlay).toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(componentAccess.shouldRenderDrawOverlayAtCurrentTime()).toBe(true);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows a paused draw effect again when jumping back to its timestamp', () => {
    vi.useFakeTimers();
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

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess & {
      onPlayerTimeUpdate: () => void;
    };
    const player = {
      currentTime: 1.9,
      duration: 10,
      paused: false,
      ended: false,
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
      canPlayType: vi.fn().mockReturnValue('probably'),
    };
    componentAccess.filmPlayer = { nativeElement: player };
    componentAccess.onPlayerTimeUpdate();
    player.currentTime = 2.2;
    componentAccess.onPlayerTimeUpdate();

    expect(componentAccess.shouldRenderDrawOverlayAtCurrentTime()).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(componentAccess.shouldRenderDrawOverlayAtCurrentTime()).toBe(true);

    componentAccess.jumpTo(1.5);
    componentAccess.jumpTo(2);

    expect(componentAccess.shouldRenderDrawOverlayAtCurrentTime()).toBe(true);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('shows a paused draw effect again when playback resumes through its timestamp', () => {
    vi.useFakeTimers();
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

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess & {
      pausedDrawEffectMarkerId: string | null;
    };

    componentAccess.playerCurrentTime.set(2);
    expect(componentAccess.shouldRenderDrawOverlayAtCurrentTime()).toBe(true);

    componentAccess.pausedDrawEffectMarkerId = 'play-0-annotation-0';
    vi.advanceTimersByTime(3000);
    expect(componentAccess.shouldRenderDrawOverlayAtCurrentTime()).toBe(true);

    componentAccess.onPlayerPlay();
    expect(componentAccess.shouldRenderDrawOverlayAtCurrentTime()).toBe(true);

    vi.useRealTimers();
  });

  it('keeps a selected draw effect visible while playback is paused on its marker', () => {
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

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    const componentAccess = component as unknown as FilmReviewPanelTestAccess & {
      pausedDrawEffectMarkerId: string | null;
    };
    const editable = componentAccess.restoreEditableDrawAnnotation(
      reviewSignal()!.timeline![0]!.annotations![0]!
    );
    if (!editable) {
      throw new Error('Expected editable draw annotation');
    }

    componentAccess.currentDrawAnnotationIndex = 0;
    componentAccess.drawAnnotation = editable;
    componentAccess.playerCurrentTime.set(1.999);
    componentAccess.pausedDrawEffectMarkerId = 'play-0-annotation-0';

    expect(componentAccess.shouldRenderCurrentDrawAnnotation()).toBe(true);
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
