import '@angular/compiler';
import 'zone.js';

import { Injector, NgZone, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import type { AgentMessage } from '@nxt1/core';
import { AgentXService } from '../../../../../../../packages/ui/src/agent-x/agent-x.service';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
} from '../../../../../../../packages/ui/src/agent-x/agent-x-job.service';
import { AgentXOperationEventService } from '../../../../../../../packages/ui/src/agent-x/agent-x-operation-event.service';
import { LiveViewSessionService } from '../../../../../../../packages/ui/src/agent-x/live-view-session.service';
import { HapticsService } from '../../../../../../../packages/ui/src/services/haptics';
import { NxtToastService } from '../../../../../../../packages/ui/src/services/toast';
import { NxtLoggingService } from '../../../../../../../packages/ui/src/services/logging';
import { NxtBreadcrumbService } from '../../../../../../../packages/ui/src/services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../../../../../packages/ui/src/services/analytics/analytics-adapter.token';

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

function createPersistedMessage(id: string, content: string, createdAt: string): AgentMessage {
  return {
    id,
    threadId: 'thread-123',
    userId: 'user-123',
    role: id.endsWith('1') || id.endsWith('3') ? 'user' : 'assistant',
    content,
    origin: 'user',
    createdAt,
  };
}

function createService() {
  const httpMock = {
    get: vi.fn().mockReturnValue(of({ success: true, data: [] })),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  const loggerMock = createLoggerMock();
  const toastMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };
  const hapticsMock = {
    impact: vi.fn().mockResolvedValue(undefined),
  };
  const breadcrumbMock = {
    trackStateChange: vi.fn(),
    trackUserAction: vi.fn(),
  };
  const analyticsMock = {
    trackEvent: vi.fn(),
    setUserProperties: vi.fn(),
  };
  const operationEventServiceMock = {
    emitCompleted: vi.fn(),
    emitInProgress: vi.fn(),
  };
  const liveViewMock = {};

  const injector = Injector.create({
    providers: [
      { provide: HttpClient, useValue: httpMock },
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: NgZone, useValue: new NgZone({ enableLongStackTrace: false }) },
      { provide: AGENT_X_API_BASE_URL, useValue: '/api' },
      { provide: AGENT_X_AUTH_TOKEN_FACTORY, useValue: vi.fn().mockResolvedValue('token') },
      { provide: HapticsService, useValue: hapticsMock },
      { provide: NxtToastService, useValue: toastMock },
      { provide: NxtLoggingService, useValue: loggerMock },
      { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
      { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
      { provide: AgentXOperationEventService, useValue: operationEventServiceMock },
      { provide: LiveViewSessionService, useValue: liveViewMock },
    ],
  });

  const service = runInInjectionContext(injector, () => new AgentXService());

  return {
    service,
    httpMock,
    loggerChild: loggerMock._child,
  };
}

describe('AgentXService', () => {
  let service: AgentXService;
  let httpMock: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    const ctx = createService();
    service = ctx.service;
    httpMock = ctx.httpMock;
  });

  it('drains every thread history page and preserves chronological order', async () => {
    const newestPage = {
      success: true,
      data: {
        items: [
          createPersistedMessage('m-3', 'Third', '2026-04-13T10:03:00.000Z'),
          createPersistedMessage('m-4', 'Fourth', '2026-04-13T10:04:00.000Z'),
        ],
        hasMore: true,
        nextCursor: '2026-04-13T10:03:00.000Z',
      },
    };
    const olderPage = {
      success: true,
      data: {
        items: [
          createPersistedMessage('m-1', 'First', '2026-04-13T10:01:00.000Z'),
          createPersistedMessage('m-2', 'Second', '2026-04-13T10:02:00.000Z'),
        ],
        hasMore: false,
      },
    };

    httpMock.get.mockReturnValueOnce(of(newestPage)).mockReturnValueOnce(of(olderPage));

    const messages = await service.getPersistedThreadMessages('thread-123');
    const historyCalls = httpMock.get.mock.calls.filter((call) =>
      String(call[0]).includes('/threads/thread-123/messages')
    );

    expect(messages.map((message) => message.id)).toEqual(['m-1', 'm-2', 'm-3', 'm-4']);
    expect(historyCalls).toHaveLength(2);
    expect(String(historyCalls[1]?.[0] ?? '')).toContain('before=2026-04-13T10%3A03%3A00.000Z');
  });

  it('loads a reopened thread with the full persisted history', async () => {
    const newestPage = {
      success: true,
      data: {
        items: [
          createPersistedMessage('m-3', 'Third', '2026-04-13T10:03:00.000Z'),
          createPersistedMessage('m-4', 'Fourth', '2026-04-13T10:04:00.000Z'),
        ],
        hasMore: true,
        nextCursor: '2026-04-13T10:03:00.000Z',
      },
    };
    const olderPage = {
      success: true,
      data: {
        items: [
          createPersistedMessage('m-1', 'First', '2026-04-13T10:01:00.000Z'),
          createPersistedMessage('m-2', 'Second', '2026-04-13T10:02:00.000Z'),
        ],
        hasMore: false,
      },
    };

    httpMock.get.mockReturnValueOnce(of(newestPage)).mockReturnValueOnce(of(olderPage));

    await service.loadThread('thread-123');

    expect(service.currentThreadId()).toBe('thread-123');
    expect(service.messages().map((message) => message.content)).toEqual([
      'First',
      'Second',
      'Third',
      'Fourth',
    ]);
  });

  it('hydrates persisted attachments when loading thread history', async () => {
    const persistedWithAttachment: AgentMessage = {
      ...createPersistedMessage('m-attach-1', 'Review this report', '2026-04-13T10:05:00.000Z'),
      attachments: [
        {
          id: 'att-1',
          url: 'https://storage.example/report.pdf',
          name: 'report.pdf',
          mimeType: 'application/pdf',
          type: 'pdf',
          sizeBytes: 2048,
        },
      ],
    };

    httpMock.get.mockReturnValueOnce(
      of({
        success: true,
        data: {
          items: [persistedWithAttachment],
          hasMore: false,
        },
      })
    );

    await service.loadThread('thread-123');

    const [message] = service.messages();
    expect(message?.attachments).toEqual([
      {
        id: 'att-1',
        url: 'https://storage.example/report.pdf',
        name: 'report.pdf',
        mimeType: 'application/pdf',
        type: 'pdf',
        sizeBytes: 2048,
      },
    ]);
  });
});
