import { describe, expect, it } from 'vitest';
import { getReportingAccountStartDate } from '../account-start-date.js';

describe('getReportingAccountStartDate', () => {
  it('prefers the b2b signup marker when present', () => {
    const result = getReportingAccountStartDate({
      createdAt: '2026-07-10T00:00:00.000Z',
      lifecycle: {
        signup: {
          notionDashboard: {
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        },
        b2cUsers: {
          accountStarted: {
            createdAt: '2026-07-02T00:00:00.000Z',
          },
        },
      },
    });

    expect(result?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('falls back to the b2c account-start marker before generic createdAt', () => {
    const result = getReportingAccountStartDate({
      createdAt: '2026-07-10T00:00:00.000Z',
      lifecycle: {
        b2cUsers: {
          accountStarted: {
            createdAt: '2026-07-02T00:00:00.000Z',
          },
        },
      },
    });

    expect(result?.toISOString()).toBe('2026-07-02T00:00:00.000Z');
  });

  it('falls back to createdAt when no lifecycle markers exist', () => {
    const result = getReportingAccountStartDate({
      createdAt: '2026-07-10T00:00:00.000Z',
    });

    expect(result?.toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });
});
