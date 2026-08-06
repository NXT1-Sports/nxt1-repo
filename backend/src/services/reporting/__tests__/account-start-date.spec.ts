import { describe, expect, it } from 'vitest';
import { coerceDate, getReportingAccountStartDate } from '../account-start-date.js';

describe('coerceDate', () => {
  it('parses Firestore Timestamp-like objects via toDate()', () => {
    const result = coerceDate({
      toDate: () => new Date('2026-07-19T07:45:05.252Z'),
    });

    expect(result?.toISOString()).toBe('2026-07-19T07:45:05.252Z');
  });

  it('parses Firestore emulator timestamp-like objects via seconds', () => {
    const result = coerceDate({
      seconds: 1784447105,
    });

    expect(result?.toISOString()).toBe('2026-07-19T07:45:05.000Z');
  });
});

describe('getReportingAccountStartDate', () => {
  it('prefers createdAt as the canonical account-start timestamp', () => {
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

    expect(result?.toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });

  it('falls back to the b2b signup marker when createdAt is absent', () => {
    const result = getReportingAccountStartDate({
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

  it('falls back to the b2c account-start marker before generic undefined', () => {
    const result = getReportingAccountStartDate({
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
