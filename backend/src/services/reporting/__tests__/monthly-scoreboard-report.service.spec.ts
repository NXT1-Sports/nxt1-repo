import { describe, expect, it } from 'vitest';
import {
  getPreviousMonthStart,
  summarizeUniqueSegmentedMatches,
} from '../monthly-scoreboard-report.service.js';
import { resolveUsageEventCostCents } from '../usage-event-costs.js';

describe('getPreviousMonthStart', () => {
  it('returns first day of the prior month', () => {
    const result = getPreviousMonthStart(new Date('2026-07-05T12:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('handles january year boundary', () => {
    const result = getPreviousMonthStart(new Date('2026-01-10T12:00:00.000Z'));
    expect(result.toISOString()).toBe('2025-12-01T00:00:00.000Z');
  });
});

describe('resolveUsageEventCostCents', () => {
  it('prefers metadata chargeBreakdown when available', () => {
    const result = resolveUsageEventCostCents({
      unitCostSnapshot: 200,
      quantity: 5,
      metadata: {
        chargeBreakdown: [{ chargeAmountCents: 145 }, { chargeAmountCents: 55 }],
      },
    });

    expect(result).toBe(200);
  });

  it('uses settled unit snapshot times quantity when no breakdown is present', () => {
    const result = resolveUsageEventCostCents({
      unitCostSnapshot: 88,
      quantity: 2,
    });

    expect(result).toBe(176);
  });

  it('uses legacy Helicone verified cents for historical compatibility', () => {
    const result = resolveUsageEventCostCents({
      metadata: {
        heliconeVerifiedCostCents: 411,
      },
    });

    expect(result).toBe(411);
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
              closedLost: { createdAt: '2026-07-01T00:00:00.000Z' },
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
              closedLost: { createdAt: '2026-07-01T00:00:00.000Z' },
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
              closedLost: { createdAt: '2026-07-03T00:00:00.000Z' },
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
