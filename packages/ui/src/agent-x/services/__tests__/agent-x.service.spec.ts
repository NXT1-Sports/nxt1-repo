import { HttpClient } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AgentXSelectedContext } from '@nxt1/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { AGENT_X_API_BASE_URL, AGENT_X_AUTH_TOKEN_FACTORY } from '../agent-x-job.service';
import { AgentXService } from '../agent-x.service';

describe('AgentXService selected context queueing', () => {
  let service: AgentXService;

  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  loggerMock.child.mockReturnValue(loggerMock);

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        AgentXService,
        {
          provide: HttpClient,
          useValue: {
            get: vi.fn(),
            post: vi.fn(),
            put: vi.fn(),
            patch: vi.fn(),
            delete: vi.fn(),
          },
        },
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: HapticsService, useValue: { impact: vi.fn(), notification: vi.fn() } },
        { provide: NxtToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } },
        { provide: NxtLoggingService, useValue: loggerMock },
        {
          provide: NxtBreadcrumbService,
          useValue: { trackStateChange: vi.fn(), trackUserAction: vi.fn() },
        },
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.nxt1.test' },
        { provide: AGENT_X_AUTH_TOKEN_FACTORY, useValue: vi.fn().mockResolvedValue('token') },
      ],
    });

    service = TestBed.inject(AgentXService);
  });

  it('bundles multi-context drops from one film review into one pending context chip', () => {
    const contexts: AgentXSelectedContext[] = Array.from({ length: 5 }, (_, index) => ({
      id: `film-play:review-1:play-${index + 1}`,
      kind: 'film_play',
      title: `Play ${index + 1}`,
      source: {
        type: 'film_review',
        id: 'review-1',
        label: 'Week 4 Cutup',
      },
      entityRefs: [
        { type: 'film_review', id: 'review-1', label: 'Week 4 Cutup' },
        { type: 'film_play', id: `play-${index + 1}`, label: `Play ${index + 1}` },
      ],
      media: {
        videoUrl: 'https://media.nxt1.test/review-1.mp4',
        thumbnailUrl: 'https://media.nxt1.test/review-1.jpg',
      },
    }));

    service.queueSelectedContexts(contexts);

    expect(service.pendingSelectedContexts()).toHaveLength(1);
    expect(service.pendingSelectedContexts()[0]).toMatchObject({
      kind: 'film_play',
      title: '5 selected film plays',
      source: {
        type: 'film_review',
        id: 'review-1',
        label: 'Week 4 Cutup',
      },
      metadata: {
        bundleCount: 5,
      },
    });
  });
});
