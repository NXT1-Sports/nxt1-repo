import { describe, expect, it } from 'vitest';
import { buildWeeklyKpisProperties, type WeeklyKpisMetrics } from '../weekly-kpis-entry.service.js';

function createMetrics(overrides: Partial<WeeklyKpisMetrics> = {}): WeeklyKpisMetrics {
  return {
    weekStart: new Date('2026-07-06T00:00:00.000Z'),
    newAccountsStartedActual: 10,
    usageStartedAccountsActual: 8,
    engagedUsersActual: 6,
    engagementEligibleAccountsActual: 24,
    payingEngagedUsersActual: 5,
    closedWonAccountsActual: 5,
    closedLostAccountsActual: 2,
    expansionAccountsActual: 1,
    churnedAccountsActual: 1,
    onboardingCompletedAccountsActual: 7,
    activeAccountsActual: 33,
    reconciledCostActual: 82,
    totalSiteVisitorsActual: 250,
    b2bNewAccountsStartedActual: 4,
    b2bUsageStartedAccountsActual: 3,
    b2bEngagedUsersActual: 2,
    b2bEngagementEligibleAccountsActual: 9,
    b2bPayingEngagedUsersActual: 2,
    b2bUsageStartRatePercent: 75,
    b2bClosedWonAccountsActual: 2,
    b2bClosedLostAccountsActual: 1,
    b2bExpansionAccountsActual: 1,
    b2bChurnedAccountsActual: 1,
    b2bOnboardingCompletedAccountsActual: 3,
    b2bActiveAccountsActual: 9,
    b2bReconciledCostActual: 41,
    b2bUsageRevenueActual: 120,
    b2bGrossMarginPercentActual: 60,
    b2bTimeToFirstUsageHoursActual: 5,
    b2cNewAccountsStartedActual: 6,
    b2cUsageStartedAccountsActual: 5,
    b2cEngagedUsersActual: 4,
    b2cEngagementEligibleAccountsActual: 15,
    b2cPayingEngagedUsersActual: 3,
    b2cUsageStartRatePercent: 83.3,
    b2cClosedWonAccountsActual: 3,
    b2cClosedLostAccountsActual: 1,
    b2cExpansionAccountsActual: 0,
    b2cChurnedAccountsActual: 0,
    b2cOnboardingCompletedAccountsActual: 4,
    b2cActiveAccountsActual: 24,
    b2cReconciledCostActual: 41,
    b2cUsageRevenueActual: 80,
    b2cGrossMarginPercentActual: 55,
    b2cTimeToFirstUsageHoursActual: 7,
    usageRevenueActual: 200,
    grossMarginPercentActual: 58,
    usageStartRatePercent: 80,
    timeToFirstUsageHoursActual: 6,
    ...overrides,
  };
}

describe('buildWeeklyKpisProperties', () => {
  it('maps full global and segment actual fields', () => {
    const properties = buildWeeklyKpisProperties(createMetrics());

    expect(properties['Week Start']).toEqual({ date: { start: '2026-07-06' } });
    expect(properties['Closed Lost Accounts (Actual)']).toEqual({ number: 2 });
    expect(properties['B2B Closed Lost Accounts (Actual)']).toEqual({ number: 1 });
    expect(properties['B2C Closed Lost Accounts (Actual)']).toEqual({ number: 1 });
    expect(properties['Engaged Users (Actual)']).toEqual({ number: 6 });
    expect(properties['Engagement Eligible Accounts (Actual)']).toEqual({ number: 24 });
    expect(properties['Paying Engaged Users (Actual)']).toEqual({ number: 5 });
    expect(properties['B2B Engaged Users (Actual)']).toEqual({ number: 2 });
    expect(properties['B2B Engagement Eligible Accounts (Actual)']).toEqual({ number: 9 });
    expect(properties['B2B Paying Engaged Users (Actual)']).toEqual({ number: 2 });
    expect(properties['B2C Engaged Users (Actual)']).toEqual({ number: 4 });
    expect(properties['B2C Engagement Eligible Accounts (Actual)']).toEqual({ number: 15 });
    expect(properties['B2C Paying Engaged Users (Actual)']).toEqual({ number: 3 });
    expect(properties['B2B Usage Revenue ($) Actual']).toEqual({ number: 120 });
    expect(properties['B2C Usage Revenue ($) Actual']).toEqual({ number: 80 });
    expect(properties['Reconciled Cost ($) Actual']).toEqual({ number: 82 });
    expect(properties['Total Site Visitors (Actual)']).toEqual({ number: 250 });
    expect(properties['B2B Reconciled Cost ($) Actual']).toEqual({ number: 41 });
    expect(properties['B2C Reconciled Cost ($) Actual']).toEqual({ number: 41 });
    expect(properties['Onboarding Completed Accounts (Actual)']).toEqual({ number: 7 });
    expect(properties['Active Paying Accounts (Actual)']).toEqual({ number: 33 });
  });

  it('converts percentage values to Notion percent storage format', () => {
    const properties = buildWeeklyKpisProperties(createMetrics());

    expect(properties['Usage Start Rate (%)']).toEqual({ number: 0.8 });
    expect(properties['Gross Margin (%) Actual']).toBeUndefined();
    expect(properties['B2B Usage Start Rate (%)']).toEqual({ number: 0.75 });
    expect(properties['B2C Usage Start Rate (%)']).toEqual({ number: 0.833 });
    expect(properties['B2B Gross Margin (%) Actual']).toEqual({ number: 0.6 });
    expect(properties['B2C Gross Margin (%) Actual']).toEqual({ number: 0.55 });
  });

  it('omits optional time and visitor fields when undefined', () => {
    const properties = buildWeeklyKpisProperties(
      createMetrics({
        totalSiteVisitorsActual: undefined,
        timeToFirstUsageHoursActual: undefined,
        b2bTimeToFirstUsageHoursActual: undefined,
        b2cTimeToFirstUsageHoursActual: undefined,
      })
    );

    expect(properties['Time to First Usage (hrs) Actual']).toBeUndefined();
    expect(properties['Total Site Visitors (Actual)']).toBeUndefined();
    expect(properties['B2B Time to First Usage (hrs) Actual']).toBeUndefined();
    expect(properties['B2C Time to First Usage (hrs) Actual']).toBeUndefined();
  });
});
