import { describe, expect, it } from 'vitest';
import {
  getOrganizationId,
  isEligibleForEngagementPeriod,
  summarizeEngagementIdentityRecords,
} from '../engagement-metrics.js';

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

  it('uses the explicit b2c account-start timestamp for eligibility', () => {
    expect(
      isEligibleForEngagementPeriod(
        {
          createdAt: '2026-07-03T12:00:00.000Z',
          lifecycle: {
            b2cUsers: {
              accountStarted: { createdAt: '2026-06-20T00:00:00.000Z' },
            },
          },
        },
        periodStart,
        periodEndExclusive
      )
    ).toBe(true);
  });
});

describe('summarizeEngagementIdentityRecords', () => {
  const classifySegment = (user: Record<string, unknown>) =>
    user['segment'] === 'b2b' ? ('b2b' as const) : ('b2c' as const);

  it('counts B2B organizations once while keeping B2C at user level', () => {
    expect(
      summarizeEngagementIdentityRecords(
        [
          {
            userId: 'org-member-1',
            user: { segment: 'b2b', activeBillingTarget: { organizationId: 'org-1' } },
          },
          {
            userId: 'org-member-2',
            user: { segment: 'b2b', organizationId: 'org-1' },
          },
          {
            userId: 'org-member-3',
            user: { segment: 'b2b', organizationId: 'org-2' },
          },
          { userId: 'consumer-1', user: { segment: 'b2c' } },
          { userId: 'consumer-2', user: { segment: 'b2c' } },
        ],
        classifySegment
      )
    ).toEqual({ b2b: 2, b2c: 2, total: 4 });
  });
});

describe('getOrganizationId', () => {
  it('prefers the active billing target and falls back to the user field', () => {
    expect(
      getOrganizationId({
        organizationId: 'org-fallback',
        activeBillingTarget: { organizationId: 'org-active' },
      })
    ).toBe('org-active');
    expect(getOrganizationId({ organizationId: 'org-fallback' })).toBe('org-fallback');
  });
});
