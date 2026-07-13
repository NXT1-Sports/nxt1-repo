import { describe, expect, it } from 'vitest';
import { isEligibleForEngagementPeriod } from '../engagement-metrics.js';

describe('isEligibleForEngagementPeriod', () => {
  const periodStart = new Date('2026-06-01T00:00:00.000Z');
  const periodEndExclusive = new Date('2026-07-01T00:00:00.000Z');

  it('includes accounts that existed before the period end and were not dead before the period', () => {
    expect(
      isEligibleForEngagementPeriod(
        {
          createdAt: '2026-05-15T12:00:00.000Z',
        },
        periodStart,
        periodEndExclusive
      )
    ).toBe(true);
  });

  it('excludes accounts that did not exist before the period end', () => {
    expect(
      isEligibleForEngagementPeriod(
        {
          createdAt: '2026-07-03T12:00:00.000Z',
        },
        periodStart,
        periodEndExclusive
      )
    ).toBe(false);
  });

  it('excludes accounts closed lost before the period starts', () => {
    expect(
      isEligibleForEngagementPeriod(
        {
          createdAt: '2026-05-10T12:00:00.000Z',
          lifecycle: {
            sales: {
              closedLost: { createdAt: '2026-05-20T00:00:00.000Z' },
            },
          },
        },
        periodStart,
        periodEndExclusive
      )
    ).toBe(false);
  });

  it('keeps accounts that churn during the period because they were engageable for part of it', () => {
    expect(
      isEligibleForEngagementPeriod(
        {
          createdAt: '2026-05-10T12:00:00.000Z',
          lifecycle: {
            b2cUsers: {
              churned: { createdAt: '2026-06-18T00:00:00.000Z' },
            },
          },
        },
        periodStart,
        periodEndExclusive
      )
    ).toBe(true);
  });
});
