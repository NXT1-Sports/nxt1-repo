import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosDeleteMock, axiosPatchMock, axiosPostMock } = vi.hoisted(() => ({
  axiosDeleteMock: vi.fn(),
  axiosPatchMock: vi.fn(),
  axiosPostMock: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock,
    patch: axiosPatchMock,
    delete: axiosDeleteMock,
  },
}));

vi.mock('../../../../../../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  FirecrawlMonitorService,
  type FirecrawlMonitorSchedule,
  type FirestoreLike,
} from '../firecrawl-monitor.service.js';

type JsonRecord = Record<string, unknown>;

function createMockFirestore(seed: Record<string, JsonRecord> = {}): FirestoreLike & {
  readDocument: (path: string) => JsonRecord | undefined;
} {
  const store = new Map<string, JsonRecord>(
    Object.entries(seed).map(([path, value]) => [path, structuredClone(value)])
  );

  return {
    collection: (name: string) => ({
      doc: (id: string) => {
        const path = `${name}/${id}`;
        return {
          get: async () => ({
            exists: store.has(path),
            data: () => {
              const value = store.get(path);
              return value ? structuredClone(value) : undefined;
            },
          }),
          set: async (payload: JsonRecord) => {
            store.set(path, structuredClone(payload));
          },
          delete: async () => {
            store.delete(path);
          },
        };
      },
    }),
    readDocument: (path: string) => {
      const value = store.get(path);
      return value ? structuredClone(value) : undefined;
    },
  };
}

describe('FirecrawlMonitorService', () => {
  const userId = 'user-123';
  const platform = 'hudl';
  const schedule: FirecrawlMonitorSchedule = {
    text: 'every 30 minutes',
    timezone: 'UTC',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('BACKEND_URL', 'https://api-staging.nxt1.test');
    vi.stubEnv('NODE_ENV', 'staging');
    vi.stubEnv('FIRECRAWL_MONITOR_WEBHOOK_SECRET', 'monitor-secret');
  });

  it('creates a Firecrawl monitor and persists both the user summary and registry mapping', async () => {
    const db = createMockFirestore({
      [`Users/${userId}`]: {
        connectedAccounts: {
          [platform]: {
            type: 'firecrawl_profile',
            status: 'active',
            connectedAt: '2026-06-15T00:00:00.000Z',
          },
        },
      },
    });

    axiosPostMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'mon_123',
          status: 'active',
          schedule: {
            text: 'every 30 minutes',
            timezone: 'UTC',
          },
          targets: [
            {
              type: 'scrape',
              urls: ['https://hudl.com/team/123'],
            },
          ],
          goal: 'Notify me when the team page changes',
          judgeEnabled: true,
          createdAt: '2026-06-16T10:00:00.000Z',
          updatedAt: '2026-06-16T10:00:00.000Z',
        },
      },
    });

    const service = new FirecrawlMonitorService('fc-key', 'https://api.firecrawl.dev');
    const summary = await service.createMonitor(db, userId, {
      platform,
      targetUrl: 'https://hudl.com/team/123',
      schedule,
      goal: 'Notify me when the team page changes',
      judgeEnabled: true,
      metadata: { rosterId: 'roster_1' },
    });

    expect(axiosPostMock).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v2/monitor',
      expect.objectContaining({
        schedule,
        targets: [
          {
            type: 'scrape',
            urls: ['https://hudl.com/team/123'],
          },
        ],
        goal: 'Notify me when the team page changes',
        judgeEnabled: true,
        webhook: expect.objectContaining({
          url: 'https://api-staging.nxt1.test/api/v1/staging/firecrawl-monitor-webhook',
          headers: {
            'x-firecrawl-monitor-secret': 'monitor-secret',
          },
        }),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fc-key',
        }),
      })
    );

    expect(summary).toMatchObject({
      monitorId: 'mon_123',
      targetUrl: 'https://hudl.com/team/123',
      status: 'active',
      enabled: true,
      schedule,
      goal: 'Notify me when the team page changes',
      judgeEnabled: true,
      metadata: { rosterId: 'roster_1' },
    });

    expect(db.readDocument(`Users/${userId}`)).toEqual({
      connectedAccounts: {
        [platform]: {
          type: 'firecrawl_profile',
          status: 'active',
          connectedAt: '2026-06-15T00:00:00.000Z',
          monitor: expect.objectContaining({
            monitorId: 'mon_123',
            targetUrl: 'https://hudl.com/team/123',
            status: 'active',
          }),
        },
      },
    });

    expect(db.readDocument('FirecrawlMonitorRegistrations/mon_123')).toEqual(
      expect.objectContaining({
        userId,
        ownerType: 'user',
        ownerId: userId,
        platform,
        monitorId: 'mon_123',
        targetUrl: 'https://hudl.com/team/123',
        status: 'active',
        enabled: true,
      })
    );
  });

  it('persists team-owned monitors on the Team document and keeps the acting user as notification owner', async () => {
    const db = createMockFirestore({
      'Teams/team-456': {
        teamName: 'NXT1 Academy',
        connectedAccounts: {
          [platform]: {
            label: 'Hudl team account',
          },
        },
      },
    });

    axiosPostMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'mon_team_456',
          status: 'active',
          schedule: {
            text: 'every 30 minutes',
            timezone: 'UTC',
          },
          targets: [
            {
              type: 'scrape',
              urls: ['https://hudl.com/team/team-456'],
            },
          ],
          createdAt: '2026-06-16T12:00:00.000Z',
          updatedAt: '2026-06-16T12:00:00.000Z',
        },
      },
    });

    const service = new FirecrawlMonitorService('fc-key', 'https://api.firecrawl.dev');
    await service.createMonitorForOwner(
      db,
      {
        ownerType: 'team',
        ownerId: 'team-456',
        userId,
      },
      {
        platform,
        targetUrl: 'https://hudl.com/team/team-456',
        schedule,
      }
    );

    expect(db.readDocument('Teams/team-456')).toEqual({
      teamName: 'NXT1 Academy',
      connectedAccounts: {
        [platform]: {
          label: 'Hudl team account',
          monitor: expect.objectContaining({
            monitorId: 'mon_team_456',
            targetUrl: 'https://hudl.com/team/team-456',
            status: 'active',
          }),
        },
      },
    });
    expect(db.readDocument(`Users/${userId}`)).toBeUndefined();
    expect(db.readDocument('FirecrawlMonitorRegistrations/mon_team_456')).toEqual(
      expect.objectContaining({
        userId,
        ownerType: 'team',
        ownerId: 'team-456',
        platform,
        monitorId: 'mon_team_456',
      })
    );
  });

  it('updates monitor persistence and removes both the user summary and registry document on delete', async () => {
    const db = createMockFirestore({
      [`Users/${userId}`]: {
        profile: { firstName: 'Jane' },
        connectedAccounts: {
          [platform]: {
            type: 'firecrawl_profile',
            status: 'active',
            connectedAt: '2026-06-15T00:00:00.000Z',
            monitor: {
              enabled: true,
              monitorId: 'mon_123',
              targetUrl: 'https://hudl.com/team/123',
              status: 'active',
              schedule: {
                text: 'every 30 minutes',
                timezone: 'UTC',
              },
              goal: 'Old goal',
              createdAt: '2026-06-16T10:00:00.000Z',
              updatedAt: '2026-06-16T10:00:00.000Z',
            },
          },
        },
      },
      'FirecrawlMonitorRegistrations/mon_123': {
        userId,
        platform,
        monitorId: 'mon_123',
      },
    });

    axiosPatchMock.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'mon_123',
          status: 'paused',
          schedule: {
            cron: '0 * * * *',
            timezone: 'UTC',
          },
          targets: [
            {
              type: 'scrape',
              urls: ['https://hudl.com/team/updated'],
            },
          ],
          goal: 'Updated goal',
          updatedAt: '2026-06-16T11:00:00.000Z',
        },
      },
    });
    axiosDeleteMock.mockResolvedValue({ data: { success: true } });

    const service = new FirecrawlMonitorService('fc-key', 'https://api.firecrawl.dev');
    const updated = await service.updateMonitor(db, userId, platform, {
      targetUrl: 'https://hudl.com/team/updated',
      schedule: {
        cron: '0 * * * *',
        timezone: 'UTC',
      },
      goal: 'Updated goal',
      enabled: false,
    });

    expect(axiosPatchMock).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v2/monitor/mon_123',
      expect.objectContaining({
        status: 'paused',
        schedule: {
          cron: '0 * * * *',
          timezone: 'UTC',
        },
        targets: [
          {
            type: 'scrape',
            urls: ['https://hudl.com/team/updated'],
          },
        ],
      }),
      expect.any(Object)
    );

    expect(updated).toMatchObject({
      monitorId: 'mon_123',
      targetUrl: 'https://hudl.com/team/updated',
      status: 'paused',
      enabled: false,
      goal: 'Updated goal',
      schedule: {
        cron: '0 * * * *',
        timezone: 'UTC',
      },
    });

    expect(db.readDocument(`Users/${userId}`)).toEqual({
      profile: { firstName: 'Jane' },
      connectedAccounts: {
        [platform]: {
          type: 'firecrawl_profile',
          status: 'active',
          connectedAt: '2026-06-15T00:00:00.000Z',
          monitor: expect.objectContaining({
            monitorId: 'mon_123',
            status: 'paused',
            enabled: false,
            targetUrl: 'https://hudl.com/team/updated',
          }),
        },
      },
    });

    await service.deleteMonitor(db, userId, platform);

    expect(axiosDeleteMock).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v2/monitor/mon_123',
      expect.any(Object)
    );
    expect(db.readDocument('FirecrawlMonitorRegistrations/mon_123')).toBeUndefined();
    expect(db.readDocument(`Users/${userId}`)).toEqual({
      profile: { firstName: 'Jane' },
      connectedAccounts: {
        [platform]: {
          type: 'firecrawl_profile',
          status: 'active',
          connectedAt: '2026-06-15T00:00:00.000Z',
        },
      },
    });
  });
});
