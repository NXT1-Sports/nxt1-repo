import { describe, expect, it } from 'vitest';
import {
  buildMonthlyScoreboardProperties,
  formatMonthKey,
  isCurrentMonthDashboardRow,
  type MonthlyScoreboardMetrics,
} from '../monthly-scoreboard-entry.service.js';

function createMetrics(
  overrides: Partial<MonthlyScoreboardMetrics> = {}
): MonthlyScoreboardMetrics {
  return {
    monthStart: new Date('2026-06-01T00:00:00.000Z'),
    activePayingAccountsActual: 42,
    b2bActivePayingAccountsActual: 18,
    b2cActivePayingAccountsActual: 24,
    b2bNewAccountsStartedActual: 46,
    b2cNewAccountsStartedActual: 74,
    engagedUsersActual: 51,
    engagementEligibleAccountsActual: 210,
    payingEngagedUsersActual: 17,
    b2bEngagedUsersActual: 20,
    b2bEngagementEligibleAccountsActual: 72,
    b2bPayingEngagedUsersActual: 8,
    b2cEngagedUsersActual: 31,
    b2cEngagementEligibleAccountsActual: 138,
    b2cPayingEngagedUsersActual: 9,
    usageStartedAccountsActual: 71,
    b2bUsageStartedAccountsActual: 29,
    b2cUsageStartedAccountsActual: 42,
    usageRevenueActual: 12500,
    b2bUsageRevenueActual: 8000,
    b2cUsageRevenueActual: 4500,
    reconciledCostActual: 3100,
    grossMarginPercentActual: 75.2,
    b2bReconciledCostActual: 1800,
    b2cReconciledCostActual: 1300,
    b2bGrossMarginPercentActual: 77.5,
    b2cGrossMarginPercentActual: 71.1,
    momRevenueGrowthPercent: 21.4,
    newAccountsStartedActual: 120,
    usageStartRatePercent: 59.2,
    b2bUsageStartRatePercent: 63,
    b2cUsageStartRatePercent: 56,
    closedWonAccountsActual: 40,
    b2bClosedWonAccountsActual: 17,
    b2cClosedWonAccountsActual: 23,
    closedLostAccountsActual: 9,
    b2bClosedLostAccountsActual: 4,
    b2cClosedLostAccountsActual: 5,
    expansionAccountsActual: 15,
    b2bExpansionAccountsActual: 6,
    b2cExpansionAccountsActual: 9,
    churnedAccountsActual: 12,
    b2bChurnedAccountsActual: 5,
    b2cChurnedAccountsActual: 7,
    onboardingCompletedAccountsActual: 33,
    b2bOnboardingCompletedAccountsActual: 14,
    b2cOnboardingCompletedAccountsActual: 19,
    timeToFirstUsageHoursActual: 6.5,
    b2bTimeToFirstUsageHoursActual: 4.2,
    b2cTimeToFirstUsageHoursActual: 7.6,
    totalSiteVisitorsActual: 2500,
    visitorToSignupConversionPercent: 4.8,
    topReferralSourcesActual: 'Social Media (12, 48%) | Friend or Teammate (7, 28%)',
    topReferralDetailsActual: 'Instagram (8, 57%) | TikTok (4, 29%)',
    trialsStartedActual: 30,
    personalTrialsStartedActual: 22,
    organizationTrialsStartedActual: 8,
    trialsConvertedActual: 11,
    personalTrialsConvertedActual: 8,
    organizationTrialsConvertedActual: 3,
    trialsExpiredActual: 6,
    personalTrialsExpiredActual: 4,
    organizationTrialsExpiredActual: 2,
    trialConversionRatePercent: 64.7,
    personalTrialConversionRatePercent: 66.7,
    organizationTrialConversionRatePercent: 60,
    avgDaysToTrialConversionActual: 9.3,
    personalAvgDaysToTrialConversionActual: 8.1,
    organizationAvgDaysToTrialConversionActual: 12.6,
    notes: 'Monthly automation sync',
    ...overrides,
  };
}

describe('formatMonthKey', () => {
  it('returns YYYY-MM in UTC', () => {
    expect(formatMonthKey(new Date('2026-06-15T22:30:00.000Z'))).toBe('2026-06');
  });
});

describe('buildMonthlyScoreboardProperties', () => {
  it('maps split revenue and account fields', () => {
    const properties = buildMonthlyScoreboardProperties(createMetrics());

    expect(properties['Period']).toEqual({
      title: [{ type: 'text', text: { content: '2026-06 Month' } }],
    });
    expect(properties['Date']).toEqual({ date: { start: '2026-06-01' } });
    expect(properties['Usage Revenue ($) Actual']).toEqual({ number: 12500 });
    expect(properties['B2B Usage Revenue ($) Actual']).toEqual({ number: 8000 });
    expect(properties['B2C Usage Revenue ($) Actual']).toEqual({ number: 4500 });
    expect(properties['Active Paying Accounts (Actual)']).toEqual({ number: 42 });
    expect(properties['B2B Active Paying Accounts (Actual)']).toEqual({ number: 18 });
    expect(properties['B2C Active Paying Accounts (Actual)']).toEqual({ number: 24 });
    expect(properties['B2B New Accounts Started (Actual)']).toEqual({ number: 46 });
    expect(properties['B2C New Accounts Started (Actual)']).toEqual({ number: 74 });
    expect(properties['Usage Started Accounts (Actual)']).toEqual({ number: 71 });
    expect(properties['Engaged Users (Actual)']).toEqual({ number: 51 });
    expect(properties['Engagement Eligible Accounts (Actual)']).toEqual({ number: 210 });
    expect(properties['Paying Engaged Users (Actual)']).toEqual({ number: 17 });
    expect(properties['B2B Usage Started Accounts (Actual)']).toEqual({ number: 29 });
    expect(properties['B2B Engaged Users (Actual)']).toEqual({ number: 20 });
    expect(properties['B2B Engagement Eligible Accounts (Actual)']).toEqual({ number: 72 });
    expect(properties['B2B Paying Engaged Users (Actual)']).toEqual({ number: 8 });
    expect(properties['B2C Usage Started Accounts (Actual)']).toEqual({ number: 42 });
    expect(properties['B2C Engaged Users (Actual)']).toEqual({ number: 31 });
    expect(properties['B2C Engagement Eligible Accounts (Actual)']).toEqual({ number: 138 });
    expect(properties['B2C Paying Engaged Users (Actual)']).toEqual({ number: 9 });
    expect(properties['B2B Reconciled Cost ($) Actual']).toEqual({ number: 1800 });
    expect(properties['B2C Reconciled Cost ($) Actual']).toEqual({ number: 1300 });
    expect(properties['B2B Gross Margin (%) Actual']).toEqual({ number: 0.775 });
    expect(properties['B2C Gross Margin (%) Actual']).toEqual({ number: 0.711 });
    expect(properties['Usage Start Rate (%)']).toEqual({ number: 0.592 });
    expect(properties['B2B Usage Start Rate (%)']).toEqual({ number: 0.63 });
    expect(properties['B2C Usage Start Rate (%)']).toEqual({ number: 0.56 });
    expect(properties['B2B Closed Won Accounts (Actual)']).toEqual({ number: 17 });
    expect(properties['B2C Closed Won Accounts (Actual)']).toEqual({ number: 23 });
    expect(properties['Closed Lost Accounts (Actual)']).toEqual({ number: 9 });
    expect(properties['B2B Closed Lost Accounts (Actual)']).toEqual({ number: 4 });
    expect(properties['B2C Closed Lost Accounts (Actual)']).toEqual({ number: 5 });
    expect(properties['B2B Expansion Accounts (Actual)']).toEqual({ number: 6 });
    expect(properties['B2C Expansion Accounts (Actual)']).toEqual({ number: 9 });
    expect(properties['B2B Churned Accounts (Actual)']).toEqual({ number: 5 });
    expect(properties['B2C Churned Accounts (Actual)']).toEqual({ number: 7 });
    expect(properties['Onboarding Completed Accounts (Actual)']).toEqual({ number: 33 });
    expect(properties['B2B Onboarding Completed Accounts (Actual)']).toEqual({ number: 14 });
    expect(properties['B2C Onboarding Completed Accounts (Actual)']).toEqual({ number: 19 });
    expect(properties['B2B Time to First Usage (hrs) Actual']).toEqual({ number: 4.2 });
    expect(properties['B2C Time to First Usage (hrs) Actual']).toEqual({ number: 7.6 });
    expect(properties['Total Site Visitors (Actual)']).toEqual({ number: 2500 });
    expect(properties['Visitor to Signup Conversion (%)']).toEqual({ number: 0.048 });
    expect(properties['Current Month']).toEqual({ checkbox: false });
  });

  it('only maps backend-owned percentage fields', () => {
    const properties = buildMonthlyScoreboardProperties(createMetrics());

    expect(properties['MoM Revenue Growth (%)']).toEqual({ number: 0.214 });
    expect(properties['Gross Margin (%) Actual']).toBeUndefined();
    expect(properties['Churn Rate (%)']).toBeUndefined();
  });

  it('maps top referral summary fields when present', () => {
    const properties = buildMonthlyScoreboardProperties(createMetrics());

    expect(properties['Top Referral Sources (Actual)']).toEqual({
      rich_text: [
        {
          type: 'text',
          text: { content: 'Social Media (12, 48%) | Friend or Teammate (7, 28%)' },
        },
      ],
    });

    expect(properties['Top Referral Details (Actual)']).toEqual({
      rich_text: [
        {
          type: 'text',
          text: { content: 'Instagram (8, 57%) | TikTok (4, 29%)' },
        },
      ],
    });
  });

  it('clears optional fields when undefined', () => {
    const properties = buildMonthlyScoreboardProperties(
      createMetrics({
        momRevenueGrowthPercent: undefined,
        timeToFirstUsageHoursActual: undefined,
        b2bTimeToFirstUsageHoursActual: undefined,
        b2cTimeToFirstUsageHoursActual: undefined,
        totalSiteVisitorsActual: undefined,
        visitorToSignupConversionPercent: undefined,
        topReferralSourcesActual: undefined,
        topReferralDetailsActual: undefined,
      })
    );

    expect(properties['MoM Revenue Growth (%)']).toEqual({ number: null });
    expect(properties['Time to First Usage (hrs) Actual']).toEqual({ number: null });
    expect(properties['B2B Time to First Usage (hrs) Actual']).toEqual({ number: null });
    expect(properties['B2C Time to First Usage (hrs) Actual']).toEqual({ number: null });
    expect(properties['Total Site Visitors (Actual)']).toEqual({ number: null });
    expect(properties['Visitor to Signup Conversion (%)']).toEqual({ number: null });
    expect(properties['Top Referral Sources (Actual)']).toEqual({ rich_text: [] });
    expect(properties['Top Referral Details (Actual)']).toEqual({ rich_text: [] });
  });

  it('marks the row selected for the current dashboard month when requested', () => {
    const properties = buildMonthlyScoreboardProperties(createMetrics(), {
      isCurrentMonth: true,
    });

    expect(properties['Current Month']).toEqual({ checkbox: true });
  });
});

describe('isCurrentMonthDashboardRow', () => {
  it('treats the previous completed month as the active dashboard month', () => {
    expect(
      isCurrentMonthDashboardRow(
        new Date('2026-06-01T00:00:00.000Z'),
        new Date('2026-07-07T12:00:00.000Z')
      )
    ).toBe(true);

    expect(
      isCurrentMonthDashboardRow(
        new Date('2026-05-01T00:00:00.000Z'),
        new Date('2026-07-07T12:00:00.000Z')
      )
    ).toBe(false);
  });
});

describe('buildMonthlyScoreboardProperties trial fields', () => {
  it('maps trial lifecycle fields, excluding org-affiliated personal wallets from personal counts', () => {
    const properties = buildMonthlyScoreboardProperties(createMetrics());

    expect(properties['Trials Started (Actual)']).toEqual({ number: 30 });
    expect(properties['Personal Trials Started (Actual)']).toEqual({ number: 22 });
    expect(properties['Organization Trials Started (Actual)']).toEqual({ number: 8 });
    expect(properties['Trials Converted (Actual)']).toEqual({ number: 11 });
    expect(properties['Personal Trials Converted (Actual)']).toEqual({ number: 8 });
    expect(properties['Organization Trials Converted (Actual)']).toEqual({ number: 3 });
    expect(properties['Trials Expired (Actual)']).toEqual({ number: 6 });
    expect(properties['Personal Trials Expired (Actual)']).toEqual({ number: 4 });
    expect(properties['Organization Trials Expired (Actual)']).toEqual({ number: 2 });
    expect(properties['Trial Conversion Rate (%)']).toEqual({ number: 0.647 });
    expect(properties['Personal Trial Conversion Rate (%)']).toEqual({ number: 0.667 });
    expect(properties['Organization Trial Conversion Rate (%)']).toEqual({ number: 0.6 });
    expect(properties['Avg Days to Trial Conversion (Actual)']).toEqual({ number: 9.3 });
    expect(properties['Personal Avg Days to Trial Conversion (Actual)']).toEqual({ number: 8.1 });
    expect(properties['Organization Avg Days to Trial Conversion (Actual)']).toEqual({
      number: 12.6,
    });
  });
});
