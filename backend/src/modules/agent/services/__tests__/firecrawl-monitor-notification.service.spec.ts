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
          title: 'You got a fresh Hudl update',
          body: 'New highlight clips just landed on Hudl. Want me to break them down and build the next move?',
        }),
        parsedOutput: {
          title: 'You got a fresh Hudl update',
          body: 'New highlight clips just landed on Hudl. Want me to break them down and build the next move?',
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
        deepLink: '/agent-x',
        metadata: expect.objectContaining({
          monitorId: 'monitor-1',
          checkId: 'check-1',
          platform: 'hudl',
          startupPrompt: expect.stringContaining('https://hudl.com/profile/abc'),
        }),
      })
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
        metadata: expect.objectContaining({
          startupPrompt: expect.stringContaining('The highlight reel gained a new touchdown clip.'),
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
        body: 'Two new touchdown clips were added. Want me to break down what changed and make the best next move?',
        metadata: expect.objectContaining({
          resultSummary:
            'Two new touchdown clips were added. Want me to break down what changed and make the best next move?',
          startupPrompt: expect.stringContaining('Agent X spotted a hudl update.'),
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
});
