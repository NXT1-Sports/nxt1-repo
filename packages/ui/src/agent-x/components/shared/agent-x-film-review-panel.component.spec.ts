import { computed, signal } from '@angular/core';
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

  it('hydrates review details before selecting a newly opened review', async () => {
    const events: string[] = [];
    ensureReviewDetails.mockImplementation(async () => {
      events.push('ensure');
      reviewSignal.set(createReviewDoc());
      return reviewSignal();
    });
    selectReview.mockImplementation(() => {
      events.push('select');
    });

    const component = TestBed.runInInjectionContext(() => new AgentXFilmReviewPanelComponent());
    component.teamId = 'team-1';

    await component.onSelectReview('review-1');

    expect(ensureReviewDetails).toHaveBeenCalledWith('review-1', 'team-1');
    expect(selectReview).toHaveBeenCalledWith('review-1');
    expect(events).toEqual(['ensure', 'select']);
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
