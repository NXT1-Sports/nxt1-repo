import { describe, expect, it, vi } from 'vitest';
import {
  fetchReportingAccountStartedUsers,
  selectReportingAccountStartedUsers,
} from '../reporting-account-start-users.js';

describe('selectReportingAccountStartedUsers', () => {
  const start = new Date('2026-07-13T00:00:00.000Z');
  const end = new Date('2026-07-19T23:59:59.999Z');

  it('treats createdAt as the canonical account-start timestamp', () => {
    const result = selectReportingAccountStartedUsers(
      [
        {
          userId: 'auth-user',
          user: {
            createdAt: '2026-07-12T23:59:59.999Z',
            lifecycle: {
              signup: {
                notionDashboard: {
                  createdAt: '2026-07-15T00:00:00.000Z',
                },
              },
            },
          },
        },
      ],
      start,
      end
    );

    expect(result).toEqual([]);
  });

  it('falls back to legacy lifecycle markers when createdAt is absent', () => {
    const result = selectReportingAccountStartedUsers(
      [
        {
          userId: 'legacy-user',
          user: {
            lifecycle: {
              b2cUsers: {
                accountStarted: {
                  createdAt: '2026-07-16T12:00:00.000Z',
                },
              },
            },
          },
        },
      ],
      start,
      end
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe('legacy-user');
    expect(result[0]?.accountStartAt.toISOString()).toBe('2026-07-16T12:00:00.000Z');
  });

  it('dedupes users that match multiple source queries', () => {
    const result = selectReportingAccountStartedUsers(
      [
        {
          userId: 'dual-source-user',
          user: {
            createdAt: '2026-07-16T08:00:00.000Z',
          },
        },
        {
          userId: 'dual-source-user',
          user: {
            createdAt: '2026-07-16T08:00:00.000Z',
            lifecycle: {
              b2cUsers: {
                accountStarted: {
                  createdAt: '2026-07-16T09:00:00.000Z',
                },
              },
            },
          },
        },
      ],
      start,
      end
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.userId).toBe('dual-source-user');
    expect(result[0]?.accountStartAt.toISOString()).toBe('2026-07-16T08:00:00.000Z');
  });

  it('includes users whose createdAt is stored as either a timestamp or ISO string', async () => {
    const docsByQuery = new Map<string, Array<{ id: string; data: () => Record<string, unknown> }>>(
      [
        [
          'createdAt|object',
          [
            {
              id: 'timestamp-user',
              data: () => ({
                createdAt: {
                  toDate: () => new Date('2026-07-15T08:00:00.000Z'),
                },
              }),
            },
          ],
        ],
        [
          'createdAt|string',
          [
            {
              id: 'string-user',
              data: () => ({
                createdAt: '2026-07-16T09:00:00.000Z',
              }),
            },
          ],
        ],
      ]
    );

    const get = vi.fn((fieldPath: string, rangeStart: Date | string) =>
      Promise.resolve({
        docs: docsByQuery.get(`${fieldPath}|${typeof rangeStart}`) ?? [],
      })
    );

    const whereSecond = vi.fn((fieldPath: string, rangeStart: Date | string) => ({
      where: vi.fn((_field: string, _op: string, _rangeEnd: Date | string) => ({
        get: () => get(fieldPath, rangeStart),
      })),
    }));

    const db = {
      collection: vi.fn(() => ({
        where: (fieldPath: string, _op: string, rangeStart: Date | string) =>
          whereSecond(fieldPath, rangeStart),
      })),
    };

    const result = await fetchReportingAccountStartedUsers(db as never, start, end);

    expect(result.map((entry) => entry.userId)).toEqual(['timestamp-user', 'string-user']);
  });
});
