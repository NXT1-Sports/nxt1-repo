import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { processFirecrawlMonitorWebhook } from '../firecrawl-monitor-notification.service.js';

type StoredDoc = Record<string, unknown>;

function createMockFirestore(seed: Record<string, StoredDoc> = {}): Firestore {
  const documents = new Map<string, StoredDoc>(Object.entries(seed));

  const createDocRef = (path: string) => ({
    async get() {
      const existing = documents.get(path);
      return {
        exists: existing !== undefined,
        data: () => existing,
      };
    },
    async set(payload: unknown) {
      documents.set(path, payload as StoredDoc);
      return undefined;
    },
  });

  return {
    collection(name: string) {
      return {
        doc(id: string) {
          return createDocRef(`${name}/${id}`);
        },
      };
    },
  } as unknown as Firestore;
}

describe('processFirecrawlMonitorWebhook', () => {
  it('dispatches an Agent X activity notification for meaningful monitor changes', async () => {
    const db = createMockFirestore();
    const dispatchNotification = vi.fn().mockResolvedValue({
      activityId: 'activity-1',
      notificationId: 'notification-1',
    });
    const monitorService = {
      getMonitorRegistration: vi.fn().mockResolvedValue({
        userId: 'user-1',
        ownerType: 'user',
        ownerId: 'user-1',
        platform: 'hudl',
        monitorId: 'monitor-1',
        targetUrl: 'https://hudl.com/profile/abc',
        status: 'active',
        enabled: true,
        schedule: { text: 'every day' },
        goal: 'Track my latest highlights',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getMonitorCheck: vi.fn().mockResolvedValue({
        id: 'check-1',
        monitorId: 'monitor-1',
        status: 'completed',
        summary: { changed: 1, new: 0, removed: 0, error: 0 },
        pages: [
          {
            url: 'https://hudl.com/profile/abc',
            status: 'changed',
            diff: { text: '+ Added two touchdown clips in the latest reel' },
            judgment: { meaningful: true, reason: 'New highlight clips were added.' },
          },
        ],
      }),
      recordMonitorCheckSummaryForOwner: vi.fn().mockResolvedValue(undefined),
    };
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldNotify: true,
          confidence: 'high',
          observedChange: 'Your Hudl reel added two new touchdown clips.',
          whyItMatters: 'Fresh clips can strengthen recruiting and scouting conversations.',
          nextStep: 'Want me to break them down here and help update your profile?',
          notification: {
            title: 'Hudl: two new touchdown clips',
            body: 'I saw two new touchdown clips hit your Hudl reel. Want me to break them down here and help update your profile?',
          },
          startupPrompt:
            'I saw two new touchdown clips hit my Hudl reel. Review them, explain what matters most, and help me decide what to update here next.',
        }),
        parsedOutput: {
          shouldNotify: true,
          confidence: 'high',
          observedChange: 'Your Hudl reel added two new touchdown clips.',
          whyItMatters: 'Fresh clips can strengthen recruiting and scouting conversations.',
          nextStep: 'Want me to break them down here and help update your profile?',
          notification: {
            title: 'Hudl: two new touchdown clips',
            body: 'I saw two new touchdown clips hit your Hudl reel. Want me to break them down here and help update your profile?',
          },
          startupPrompt:
            'I saw two new touchdown clips hit my Hudl reel. Review them, explain what matters most, and help me decide what to update here next.',
        },
      }),
    };

    const result = await processFirecrawlMonitorWebhook(
      db,
      {
        success: true,
        type: 'monitor.check.completed',
        id: 'evt-1',
        data: [
          {
            monitorId: 'monitor-1',
            checkId: 'check-1',
            status: 'completed',
            summary: { changed: 1, same: 2 },
          },
        ],
      },
      {
        monitorService,
        llm,
        dispatchNotification,
      }
    );

    expect(result).toEqual({ processedCount: 1, dispatchedCount: 1, ignoredCount: 0 });
    expect(monitorService.recordMonitorCheckSummaryForOwner).toHaveBeenCalledWith(
      db,
      {
        ownerType: 'user',
        ownerId: 'user-1',
        userId: 'user-1',
      },
      'hudl',
      expect.objectContaining({ status: 'completed', lastCheckSummary: { changed: 1, same: 2 } })
    );
    expect(dispatchNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: 'user-1',
        type: NOTIFICATION_TYPES.DYNAMIC_AGENT_ALERT,
        title: 'Hudl: two new touchdown clips',
        body: 'I saw two new touchdown clips hit your Hudl reel. Want me to break them down here and help update your profile?',
        deepLink: '/agent-x',
        metadata: expect.objectContaining({
          monitorId: 'monitor-1',
          checkId: 'check-1',
          platform: 'hudl',
          startupPrompt:
            'I saw two new touchdown clips hit my Hudl reel. Review them, explain what matters most, and help me decide what to update here next.',
          llmDecision: expect.objectContaining({
            shouldNotify: true,
            observedChange: 'Your Hudl reel added two new touchdown clips.',
          }),
        }),
      })
    );
  });

  it('suppresses trivial monitor changes when Agent X judges them as noise', async () => {
    const db = createMockFirestore();
    const dispatchNotification = vi.fn();
    const monitorService = {
      getMonitorRegistration: vi.fn().mockResolvedValue({
        userId: 'user-noise-1',
        ownerType: 'user',
        ownerId: 'user-noise-1',
        platform: 'twitter',
        monitorId: 'monitor-noise-1',
        targetUrl: 'https://x.com/nxt1sports',
        status: 'active',
        enabled: true,
        schedule: { text: 'every day' },
        goal: 'Track my account updates',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getMonitorCheck: vi.fn(),
      recordMonitorCheckSummaryForOwner: vi.fn().mockResolvedValue(undefined),
    };
    const llm = {
      complete: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          shouldNotify: false,
          confidence: 'high',
          suppressionReason: 'likes_reposts_only',
          observedChange: 'The post only gained minor engagement changes.',
        }),
        parsedOutput: {
          shouldNotify: false,
          confidence: 'high',
          suppressionReason: 'likes_reposts_only',
          observedChange: 'The post only gained minor engagement changes.',
        },
      }),
    };

    const result = await processFirecrawlMonitorWebhook(
      db,
      {
        success: true,
        type: 'monitor.page',
        id: 'evt-noise-1',
        data: [
          {
            monitorId: 'monitor-noise-1',
            checkId: 'check-noise-1',
            status: 'changed',
            url: 'https://x.com/nxt1sports/status/1',
            judgment: {
              meaningful: true,
              reason: 'Likes moved from 58 to 60 and reposts changed slightly.',
            },
            diff: {
              text: '+ Likes: 60\n- Likes: 58\n+ Reposts: 4\n- Reposts: 3',
            },
          },
        ],
      },
      {
        monitorService,
        llm,
        dispatchNotification,
      }
    );

    expect(result).toEqual({ processedCount: 1, dispatchedCount: 0, ignoredCount: 1 });
    expect(dispatchNotification).not.toHaveBeenCalled();
    expect(monitorService.recordMonitorCheckSummaryForOwner).toHaveBeenCalledWith(
      db,
      {
        ownerType: 'user',
        ownerId: 'user-noise-1',
        userId: 'user-noise-1',
      },
      'twitter',
      expect.objectContaining({ status: 'changed' })
    );
  });

  it('accepts monitor.page events and uses the page payload for the notification copy', async () => {
    const db = createMockFirestore();
    const dispatchNotification = vi.fn().mockResolvedValue({
      activityId: 'activity-page-1',
      notificationId: 'notification-page-1',
    });
    const monitorService = {
      getMonitorRegistration: vi.fn().mockResolvedValue({
        userId: 'user-page-1',
        ownerType: 'user',
        ownerId: 'user-page-1',
        platform: 'hudl',
        monitorId: 'monitor-page-1',
        targetUrl: 'https://hudl.com/profile/page',
        status: 'active',
        enabled: true,
        schedule: { text: 'every day' },
        goal: 'Track new Hudl highlights',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getMonitorCheck: vi.fn(),
      recordMonitorCheckSummaryForOwner: vi.fn().mockResolvedValue(undefined),
    };
    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };

    const result = await processFirecrawlMonitorWebhook(
      db,
      {
        success: true,
        type: 'monitor.page',
        id: 'evt-page-1',
        webhookId: 'wh-1',
        data: [
          {
            monitorId: 'monitor-page-1',
            checkId: 'check-page-1',
            status: 'changed',
            url: 'https://hudl.com/profile/page',
            currentScrapeId: 'scrape-page-1',
            judgment: {
              meaningful: true,
              reason: 'The highlight reel gained a new touchdown clip.',
            },
            diff: {
              text: '+ Added a new touchdown clip to the reel',
            },
          },
        ],
      },
      {
        monitorService,
        llm,
        dispatchNotification,
      }
    );

    expect(result).toEqual({ processedCount: 1, dispatchedCount: 1, ignoredCount: 0 });
    expect(monitorService.getMonitorCheck).not.toHaveBeenCalled();
    expect(monitorService.recordMonitorCheckSummaryForOwner).toHaveBeenCalledWith(
      db,
      {
        ownerType: 'user',
        ownerId: 'user-page-1',
        userId: 'user-page-1',
      },
      'hudl',
      expect.objectContaining({ status: 'changed' })
    );
    expect(dispatchNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        userId: 'user-page-1',
        body: expect.stringContaining('Want me to review it here'),
        metadata: expect.objectContaining({
          startupPrompt: expect.stringContaining('help me decide what to update here next'),
          notablePages: [
            expect.objectContaining({
              url: 'https://hudl.com/profile/page',
              status: 'changed',
            }),
          ],
        }),
      })
    );
  });

  it('ignores duplicate webhook deliveries using the event receipt document', async () => {
    const db = createMockFirestore({
      'FirecrawlMonitorEvents/firecrawl_monitor_check_completed_monitor-1_check-1': {
        status: 'dispatched',
      },
    });
    const dispatchNotification = vi.fn();
    const monitorService = {
      getMonitorRegistration: vi.fn(),
      getMonitorCheck: vi.fn(),
      recordMonitorCheckSummaryForOwner: vi.fn(),
    };

    const result = await processFirecrawlMonitorWebhook(
      db,
      {
        success: true,
        type: 'monitor.check.completed',
        id: 'evt-2',
        data: [
          {
            monitorId: 'monitor-1',
            checkId: 'check-1',
            status: 'completed',
          },
        ],
      },
      {
        monitorService,
        dispatchNotification,
      }
    );

    expect(result).toEqual({ processedCount: 1, dispatchedCount: 0, ignoredCount: 1 });
    expect(monitorService.getMonitorRegistration).not.toHaveBeenCalled();
    expect(dispatchNotification).not.toHaveBeenCalled();
  });

  it('uses specific fallback copy and startup prompt details when llm copy is unavailable', async () => {
    const db = createMockFirestore();
    const dispatchNotification = vi.fn().mockResolvedValue({
      activityId: 'activity-2',
      notificationId: 'notification-2',
    });
    const monitorService = {
      getMonitorRegistration: vi.fn().mockResolvedValue({
        userId: 'user-2',
        ownerType: 'user',
        ownerId: 'user-2',
        platform: 'hudl',
        monitorId: 'monitor-2',
        targetUrl: 'https://hudl.com/profile/xyz',
        status: 'active',
        enabled: true,
        schedule: { text: 'every day' },
        goal: 'Track new Hudl highlights',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getMonitorCheck: vi.fn().mockResolvedValue({
        id: 'check-2',
        monitorId: 'monitor-2',
        status: 'completed',
        summary: { changed: 1 },
        pages: [
          {
            url: 'https://hudl.com/profile/xyz',
            status: 'changed',
            judgment: { meaningful: true, reason: 'Two new touchdown clips were added.' },
          },
        ],
      }),
      recordMonitorCheckSummaryForOwner: vi.fn().mockResolvedValue(undefined),
    };
    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };

    await processFirecrawlMonitorWebhook(
      db,
      {
        success: true,
        type: 'monitor.check.completed',
        id: 'evt-3',
        data: [
          {
            monitorId: 'monitor-2',
            checkId: 'check-2',
            status: 'completed',
            summary: { changed: 1 },
          },
        ],
      },
      {
        monitorService,
        llm,
        dispatchNotification,
      }
    );

    expect(dispatchNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        title: 'HUDL: Two new touchdown clips were added.',
        body: 'I spotted this on HUDL: Two new touchdown clips were added. Want me to review it here and help with track new hudl highlights?',
        metadata: expect.objectContaining({
          resultSummary:
            'I spotted this on HUDL: Two new touchdown clips were added. Want me to review it here and help with track new hudl highlights?',
          startupPrompt: expect.stringContaining('Monitored page: https://hudl.com/profile/xyz'),
        }),
      })
    );

    const dispatchPayload = dispatchNotification.mock.calls[0]?.[1] as {
      metadata?: { startupPrompt?: string };
    };
    expect(dispatchPayload.metadata?.startupPrompt).not.toContain(
      'If a useful graphic, caption, breakdown, outreach draft, or follow-up asset would help, start there.'
    );
    expect(dispatchPayload.metadata?.startupPrompt).not.toContain(
      'Agent X spotted this hudl update: Two new touchdown clips were added.'
    );
    expect(dispatchPayload.metadata?.startupPrompt).not.toContain(
      'You sent me this Agent X alert:'
    );
    expect(dispatchPayload.metadata?.startupPrompt).not.toContain('Monitor goal:');
  });

  it('includes all fetched notable changes in the Agent X startup prompt', async () => {
    const db = createMockFirestore();
    const dispatchNotification = vi.fn().mockResolvedValue({
      activityId: 'activity-3',
      notificationId: 'notification-3',
    });
    const monitorService = {
      getMonitorRegistration: vi.fn().mockResolvedValue({
        userId: 'user-3',
        ownerType: 'user',
        ownerId: 'user-3',
        platform: 'hudl',
        monitorId: 'monitor-3',
        targetUrl: 'https://hudl.com/profile/xyz',
        status: 'active',
        enabled: true,
        schedule: { text: 'every day' },
        goal: 'Track new Hudl highlights',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getMonitorCheck: vi.fn().mockResolvedValue({
        id: 'check-3',
        monitorId: 'monitor-3',
        status: 'completed',
        summary: { changed: 4 },
        pages: [
          {
            url: 'https://hudl.com/profile/xyz',
            status: 'changed',
            judgment: { meaningful: true, reason: 'Two new touchdown clips were added.' },
          },
          {
            url: 'https://hudl.com/profile/xyz?clip=2',
            status: 'changed',
            judgment: {
              meaningful: true,
              reason: 'A red-zone highlight was re-ordered to the top.',
            },
          },
          {
            url: 'https://hudl.com/profile/xyz?clip=3',
            status: 'new',
            judgment: { meaningful: true, reason: 'A new kickoff return clip was added.' },
          },
          {
            url: 'https://hudl.com/profile/xyz?clip=4',
            status: 'changed',
            judgment: { meaningful: true, reason: 'A fourth-quarter touchdown clip was updated.' },
          },
        ],
      }),
      recordMonitorCheckSummaryForOwner: vi.fn().mockResolvedValue(undefined),
    };
    const llm = {
      complete: vi.fn().mockRejectedValue(new Error('LLM unavailable')),
    };

    await processFirecrawlMonitorWebhook(
      db,
      {
        success: true,
        type: 'monitor.check.completed',
        id: 'evt-4',
        data: [
          {
            monitorId: 'monitor-3',
            checkId: 'check-3',
            status: 'completed',
            summary: { changed: 4 },
          },
        ],
      },
      {
        monitorService,
        llm,
        dispatchNotification,
      }
    );

    expect(dispatchNotification).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        metadata: expect.objectContaining({
          startupPrompt: expect.stringContaining('A fourth-quarter touchdown clip was updated.'),
        }),
      })
    );
  });

  it('normalizes monitor.page payloads with string success, empty checkId, and missing status', async () => {
    const db = createMockFirestore();
    const dispatchNotification = vi.fn().mockResolvedValue({
      activityId: 'activity-page-normalized',
      notificationId: 'notification-page-normalized',
    });
    const monitorService = {
      getMonitorRegistration: vi.fn().mockResolvedValue({
        userId: 'user-page-normalized',
        ownerType: 'user',
        ownerId: 'user-page-normalized',
        platform: 'hudl',
        monitorId: 'monitor-page-normalized',
        targetUrl: 'https://hudl.com/profile/normalized',
        status: 'active',
        enabled: true,
        schedule: { text: 'every day' },
        goal: 'Track new highlights',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getMonitorCheck: vi.fn(),
      recordMonitorCheckSummaryForOwner: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processFirecrawlMonitorWebhook(
      db,
      {
        success: 'true',
        type: 'monitor.page',
        id: 'check-page-normalized',
        webhookId: 'wh-page-normalized',
        data: [
          {
            monitorId: 'monitor-page-normalized',
            checkId: '',
            url: 'https://hudl.com/profile/normalized',
            judgment: {
              meaningful: true,
              reason: 'A new clip was added.',
            },
          },
        ],
      },
      {
        monitorService,
        dispatchNotification,
      }
    );

    expect(result).toEqual({ processedCount: 1, dispatchedCount: 1, ignoredCount: 0 });
    expect(monitorService.recordMonitorCheckSummaryForOwner).toHaveBeenCalledWith(
      db,
      {
        ownerType: 'user',
        ownerId: 'user-page-normalized',
        userId: 'user-page-normalized',
      },
      'hudl',
      {
        status: 'changed',
      }
    );
  });

  it('normalizes monitor.check.completed payloads with string success and missing status/checkId', async () => {
    const db = createMockFirestore();
    const dispatchNotification = vi.fn().mockResolvedValue({
      activityId: 'activity-check-normalized',
      notificationId: 'notification-check-normalized',
    });
    const monitorService = {
      getMonitorRegistration: vi.fn().mockResolvedValue({
        userId: 'user-check-normalized',
        ownerType: 'user',
        ownerId: 'user-check-normalized',
        platform: 'hudl',
        monitorId: 'monitor-check-normalized',
        targetUrl: 'https://hudl.com/profile/normalized',
        status: 'active',
        enabled: true,
        schedule: { text: 'every day' },
        goal: 'Track new highlights',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getMonitorCheck: vi.fn().mockResolvedValue({
        id: 'evt-check-normalized',
        monitorId: 'monitor-check-normalized',
        status: 'completed',
        summary: {
          totalPages: 1,
          same: 0,
          changed: 1,
          new: 0,
          removed: 0,
          error: 0,
        },
        pages: [],
      }),
      recordMonitorCheckSummaryForOwner: vi.fn().mockResolvedValue(undefined),
    };

    const result = await processFirecrawlMonitorWebhook(
      db,
      {
        success: 'true',
        type: 'monitor.check.completed',
        id: 'evt-check-normalized',
        webhookId: 'wh-check-normalized',
        data: [
          {
            monitorId: 'monitor-check-normalized',
            summary: {
              totalPages: 1,
              same: 0,
              changed: 1,
              new: 0,
              removed: 0,
              error: 0,
            },
          },
        ],
      },
      {
        monitorService,
        dispatchNotification,
      }
    );

    expect(result).toEqual({ processedCount: 1, dispatchedCount: 1, ignoredCount: 0 });
    expect(monitorService.getMonitorCheck).toHaveBeenCalledWith(
      'monitor-check-normalized',
      'evt-check-normalized',
      {
        limit: 25,
      }
    );
  });
});
