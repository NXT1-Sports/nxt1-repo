import { describe, expect, it } from 'vitest';
import {
  getPreviousWeekStart,
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
          segment: 'b2b',
          signupAt: new Date('2026-06-30T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-01T09:00:00.000Z'),
        },
        {
          segment: 'b2b',
          signupAt: new Date('2026-07-02T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-06T09:00:00.000Z'),
        },
        {
          segment: 'b2c',
          signupAt: new Date('2026-07-03T10:00:00.000Z'),
          usageStartedAt: new Date('2026-07-04T09:00:00.000Z'),
        },
        {
          segment: 'b2c',
          signupAt: new Date('2026-07-04T10:00:00.000Z'),
        },
        {
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
