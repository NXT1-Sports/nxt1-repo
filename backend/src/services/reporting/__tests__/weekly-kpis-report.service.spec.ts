import { describe, expect, it } from 'vitest';
import {
  getPreviousWeekStart,
  summarizeExplicitSegmentedMatches,
  summarizeUniqueSegmentedMatches,
  summarizeWeeklyUsageStartCohort,
} from '../weekly-kpis-report.service.js';
import { resolveUsageEventCostCents } from '../usage-event-costs.js';

describe('getPreviousWeekStart', () => {
  it('returns prior Monday when called on Monday', () => {
    const result = getPreviousWeekStart(new Date('2026-07-06T12:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-29T00:00:00.000Z');
  });

  it('returns prior Monday when called on Sunday', () => {
    const result = getPreviousWeekStart(new Date('2026-07-05T12:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-22T00:00:00.000Z');
  });
});

describe('summarizeWeeklyUsageStartCohort', () => {
  it('counts only signup cohort members who started usage by week end', () => {
    const weekEnd = new Date('2026-07-05T23:59:59.999Z');

    const result = summarizeWeeklyUsageStartCohort(
      [
        {
          userId: 'b2b-user',
          segment: 'b2b',
          signupAt: new Date('2026-06-30T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-01T09:00:00.000Z'),
        },
        {
          userId: 'late-user',
          segment: 'b2b',
          signupAt: new Date('2026-07-02T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-06T09:00:00.000Z'),
        },
        {
          userId: 'b2c-user',
          segment: 'b2c',
          signupAt: new Date('2026-07-03T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-04T09:00:00.000Z'),
        },
        {
          userId: 'not-started-user',
          segment: 'b2c',
          signupAt: new Date('2026-07-04T10:00:00.000Z'),
        },
        {
          userId: 'invalid-user',
          segment: 'b2c',
          signupAt: new Date('2026-07-05T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-05T09:00:00.000Z'),
        },
      ],
      weekEnd
    );

    expect(result).toEqual({
      b2b: 1,
      b2c: 1,
      total: 2,
    });
  });

  it('dedupes dual-marker accounts into b2b with the b2b account-start timestamp', () => {
    const weekEnd = new Date('2026-07-05T23:59:59.999Z');

    const result = summarizeWeeklyUsageStartCohort(
      [
        {
          userId: 'migrated-user',
          segment: 'b2c',
          signupAt: new Date('2026-07-01T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-02T09:00:00.000Z'),
        },
        {
          userId: 'migrated-user',
          segment: 'b2b',
          signupAt: new Date('2026-07-03T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-02T09:00:00.000Z'),
        },
      ],
      weekEnd
    );

    expect(result).toEqual({ b2b: 0, b2c: 0, total: 0 });
  });
});

describe('summarizeUniqueSegmentedMatches', () => {
  it('reclassifies organization-mode matches out of the b2c split and dedupes users', () => {
    const result = summarizeUniqueSegmentedMatches([
      {
        userId: 'org-user',
        user: {
          lifecycle: {
            b2cUsers: {
              churned: { createdAt: '2026-07-01T00:00:00.000Z' },
              organizationMode: { createdAt: '2026-07-02T00:00:00.000Z' },
            },
          },
        },
      },
      {
        userId: 'org-user',
        user: {
          lifecycle: {
            b2cUsers: {
              churned: { createdAt: '2026-07-01T00:00:00.000Z' },
              organizationMode: { createdAt: '2026-07-02T00:00:00.000Z' },
            },
          },
        },
      },
      {
        userId: 'consumer-user',
        user: {
          lifecycle: {
            b2cUsers: {
              churned: { createdAt: '2026-07-03T00:00:00.000Z' },
            },
          },
        },
      },
    ]);

    expect(result).toEqual({
      b2b: 1,
      b2c: 1,
      total: 2,
    });
  });
});

describe('summarizeExplicitSegmentedMatches', () => {
  it('counts account-started matches from explicit b2b and b2c sources without double-counting users', () => {
    const result = summarizeExplicitSegmentedMatches([
      {
        userId: 'team-user',
        segment: 'b2b',
        user: {},
      },
      {
        userId: 'consumer-user',
        segment: 'b2c',
        user: {},
      },
      {
        userId: 'consumer-user',
        segment: 'b2c',
        user: {},
      },
      {
        userId: 'migrated-user',
        segment: 'b2c',
        user: {},
      },
      {
        userId: 'migrated-user',
        segment: 'b2b',
        user: {},
      },
    ]);

    expect(result).toEqual({
      b2b: 2,
      b2c: 1,
      total: 3,
    });
  });
});

describe('resolveUsageEventCostCents', () => {
  it('prefers metadata chargeBreakdown when available', () => {
    const result = resolveUsageEventCostCents({
      unitCostSnapshot: 999,
      quantity: 9,
      metadata: {
        chargeBreakdown: [{ chargeAmountCents: 125 }, { chargeAmountCents: 75 }],
        heliconeVerifiedCostCents: 500,
      },
    });

    expect(result).toBe(200);
  });

  it('falls back to settled unit snapshot times quantity', () => {
    const result = resolveUsageEventCostCents({
      unitCostSnapshot: 64,
      quantity: 3,
      metadata: {
        heliconeVerifiedCostCents: 900,
      },
    });

    expect(result).toBe(192);
  });

  it('falls back to legacy helicone verified cents when settled fields are absent', () => {
    const result = resolveUsageEventCostCents({
      metadata: {
        heliconeVerifiedCostCents: 333,
      },
    });

    expect(result).toBe(333);
  });
});
