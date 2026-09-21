/**
 * @fileoverview Monthly Scoreboard Notion Entry Service
 * @module @nxt1/backend/services/marketing/integrations/notion/monthly-scoreboard-entry
 */

import type {
  NotionProperties,
  NotionPageSummary,
  NotionSignupDashboardConfig,
} from './notion-client.service.js';
import {
  createNotionSignupDashboardPage,
  queryNotionDatabase,
  queryNotionDatabasePages,
  updateNotionSignupDashboardPage,
} from './notion-client.service.js';

export interface MonthlyScoreboardMetrics {
  readonly monthStart: Date;
  readonly activePayingAccountsActual: number;
  readonly b2bActivePayingAccountsActual: number;
  readonly b2cActivePayingAccountsActual: number;
  readonly b2bNewAccountsStartedActual: number;
  readonly b2cNewAccountsStartedActual: number;
  readonly engagedUsersActual: number;
  readonly engagementEligibleAccountsActual: number;
  readonly payingEngagedUsersActual: number;
  readonly b2bEngagedUsersActual: number;
  readonly b2bEngagementEligibleAccountsActual: number;
  readonly b2bPayingEngagedUsersActual: number;
  readonly b2cEngagedUsersActual: number;
  readonly b2cEngagementEligibleAccountsActual: number;
  readonly b2cPayingEngagedUsersActual: number;
  readonly usageStartedAccountsActual: number;
  readonly b2bUsageStartedAccountsActual: number;
  readonly b2cUsageStartedAccountsActual: number;
  readonly usageRevenueActual: number;
  readonly b2bUsageRevenueActual: number;
  readonly b2cUsageRevenueActual: number;
  readonly reconciledCostActual: number;
  readonly grossMarginPercentActual: number; // 0-100
  readonly b2bReconciledCostActual: number;
  readonly b2cReconciledCostActual: number;
  readonly b2bGrossMarginPercentActual: number; // 0-100
  readonly b2cGrossMarginPercentActual: number; // 0-100
  readonly momRevenueGrowthPercent?: number; // 0-100
  readonly newAccountsStartedActual: number;
  readonly usageStartRatePercent: number; // 0-100
  readonly b2bUsageStartRatePercent: number; // 0-100
  readonly b2cUsageStartRatePercent: number; // 0-100
  readonly closedWonAccountsActual: number;
  readonly b2bClosedWonAccountsActual: number;
  readonly b2cClosedWonAccountsActual: number;
  readonly closedLostAccountsActual: number;
  readonly b2bClosedLostAccountsActual: number;
  readonly b2cClosedLostAccountsActual: number;
  readonly expansionAccountsActual: number;
  readonly b2bExpansionAccountsActual: number;
  readonly b2cExpansionAccountsActual: number;
  readonly churnedAccountsActual: number;
  readonly b2bChurnedAccountsActual: number;
  readonly b2cChurnedAccountsActual: number;
  readonly onboardingCompletedAccountsActual: number;
  readonly b2bOnboardingCompletedAccountsActual: number;
  readonly b2cOnboardingCompletedAccountsActual: number;
  readonly timeToFirstUsageHoursActual?: number;
  readonly b2bTimeToFirstUsageHoursActual?: number;
  readonly b2cTimeToFirstUsageHoursActual?: number;
  readonly totalSiteVisitorsActual?: number;
  readonly visitorConversationsActual?: number;
  readonly visitorToSignupConversionPercent?: number; // 0-100
  readonly visitorToConversationRatePercent?: number; // 0-100
  readonly topReferralSourcesActual?: string;
  readonly topReferralDetailsActual?: string;
  readonly trialsStartedActual: number;
  readonly personalTrialsStartedActual: number;
  readonly organizationTrialsStartedActual: number;
  readonly trialsConvertedActual: number;
  readonly personalTrialsConvertedActual: number;
  readonly organizationTrialsConvertedActual: number;
  readonly trialsExpiredActual: number;
  readonly personalTrialsExpiredActual: number;
  readonly organizationTrialsExpiredActual: number;
  readonly trialConversionRatePercent: number; // 0-100
  readonly personalTrialConversionRatePercent: number; // 0-100
  readonly organizationTrialConversionRatePercent: number; // 0-100
  readonly avgDaysToTrialConversionActual: number;
  readonly personalAvgDaysToTrialConversionActual: number;
  readonly organizationAvgDaysToTrialConversionActual: number;
  readonly notes?: string;
}

export interface UpsertMonthlyScoreboardRowInput {
  readonly config: NotionSignupDashboardConfig;
  readonly metrics: MonthlyScoreboardMetrics;
}

export type UpsertMonthlyScoreboardRowResult =
  | {
      readonly status: 'created' | 'updated';
      readonly pageId: string;
      readonly pageUrl?: string;
    }
  | {
      readonly status: 'skipped';
      readonly reason: 'disabled' | 'missing-token' | 'missing-database-id';
    }
  | {
      readonly status: 'failed';
      readonly reason: 'notion-error';
      readonly error?: string;
    };

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function buildPeriodTitle(monthStart: Date): string {
  return `${formatMonthKey(monthStart)} Month`;
}

function toNotionPercent(value: number): number {
  return Number((value / 100).toFixed(6));
}

function getLatestCompletedMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

export function isCurrentMonthDashboardRow(monthStart: Date, now: Date = new Date()): boolean {
  return formatMonthKey(monthStart) === formatMonthKey(getLatestCompletedMonthStart(now));
}

export function buildMonthlyScoreboardProperties(
  metrics: MonthlyScoreboardMetrics,
  options: {
    readonly isCurrentMonth?: boolean;
  } = {}
): NotionProperties {
  const properties: NotionProperties = {
    Period: {
      title: [
        {
          type: 'text',
          text: { content: buildPeriodTitle(metrics.monthStart) },
        },
      ],
    },
    Date: {
      date: {
        start: formatIsoDate(metrics.monthStart),
      },
    },
    'Current Month': {
      checkbox: options.isCurrentMonth ?? false,
    },
    'Active Paying Accounts (Actual)': {
      number: metrics.activePayingAccountsActual,
    },
    'B2B Active Paying Accounts (Actual)': {
      number: metrics.b2bActivePayingAccountsActual,
    },
    'B2C Active Paying Accounts (Actual)': {
      number: metrics.b2cActivePayingAccountsActual,
    },
    'B2B New Accounts Started (Actual)': {
      number: metrics.b2bNewAccountsStartedActual,
    },
    'B2C New Accounts Started (Actual)': {
      number: metrics.b2cNewAccountsStartedActual,
    },
    'Usage Revenue ($) Actual': {
      number: metrics.usageRevenueActual,
    },
    'B2B Usage Revenue ($) Actual': {
      number: metrics.b2bUsageRevenueActual,
    },
    'B2C Usage Revenue ($) Actual': {
      number: metrics.b2cUsageRevenueActual,
    },
    'Usage Started Accounts (Actual)': {
      number: metrics.usageStartedAccountsActual,
    },
    'Engaged Users (Actual)': {
      number: metrics.engagedUsersActual,
    },
    'Engagement Eligible Accounts (Actual)': {
      number: metrics.engagementEligibleAccountsActual,
    },
    'Paying Engaged Users (Actual)': {
      number: metrics.payingEngagedUsersActual,
    },
    'B2B Usage Started Accounts (Actual)': {
      number: metrics.b2bUsageStartedAccountsActual,
    },
    'B2B Engaged Users (Actual)': {
      number: metrics.b2bEngagedUsersActual,
    },
    'B2B Engagement Eligible Accounts (Actual)': {
      number: metrics.b2bEngagementEligibleAccountsActual,
    },
    'B2B Paying Engaged Users (Actual)': {
      number: metrics.b2bPayingEngagedUsersActual,
    },
    'B2C Usage Started Accounts (Actual)': {
      number: metrics.b2cUsageStartedAccountsActual,
    },
    'B2C Engaged Users (Actual)': {
      number: metrics.b2cEngagedUsersActual,
    },
    'B2C Engagement Eligible Accounts (Actual)': {
      number: metrics.b2cEngagementEligibleAccountsActual,
    },
    'B2C Paying Engaged Users (Actual)': {
      number: metrics.b2cPayingEngagedUsersActual,
    },
    'Reconciled Cost ($) Actual': {
      number: metrics.reconciledCostActual,
    },
    'B2B Reconciled Cost ($) Actual': {
      number: metrics.b2bReconciledCostActual,
    },
    'B2C Reconciled Cost ($) Actual': {
      number: metrics.b2cReconciledCostActual,
    },
    'B2B Gross Margin (%) Actual': {
      number: toNotionPercent(metrics.b2bGrossMarginPercentActual),
    },
    'B2C Gross Margin (%) Actual': {
      number: toNotionPercent(metrics.b2cGrossMarginPercentActual),
    },
    'New Accounts Started (Actual)': {
      number: metrics.newAccountsStartedActual,
    },
    'Usage Start Rate (%)': {
      number: toNotionPercent(metrics.usageStartRatePercent),
    },
    'B2B Usage Start Rate (%)': {
      number: toNotionPercent(metrics.b2bUsageStartRatePercent),
    },
    'B2C Usage Start Rate (%)': {
      number: toNotionPercent(metrics.b2cUsageStartRatePercent),
    },
    'Closed Won Accounts (Actual)': {
      number: metrics.closedWonAccountsActual,
    },
    'B2B Closed Won Accounts (Actual)': {
      number: metrics.b2bClosedWonAccountsActual,
    },
    'B2C Closed Won Accounts (Actual)': {
      number: metrics.b2cClosedWonAccountsActual,
    },
    'Closed Lost Accounts (Actual)': {
      number: metrics.closedLostAccountsActual,
    },
    'B2B Closed Lost Accounts (Actual)': {
      number: metrics.b2bClosedLostAccountsActual,
    },
    'B2C Closed Lost Accounts (Actual)': {
      number: metrics.b2cClosedLostAccountsActual,
    },
    'Expansion Accounts (Actual)': {
      number: metrics.expansionAccountsActual,
    },
    'B2B Expansion Accounts (Actual)': {
      number: metrics.b2bExpansionAccountsActual,
    },
    'B2C Expansion Accounts (Actual)': {
      number: metrics.b2cExpansionAccountsActual,
    },
    'Churned Accounts (Actual)': {
      number: metrics.churnedAccountsActual,
    },
    'B2B Churned Accounts (Actual)': {
      number: metrics.b2bChurnedAccountsActual,
    },
    'B2C Churned Accounts (Actual)': {
      number: metrics.b2cChurnedAccountsActual,
    },
    'Onboarding Completed Accounts (Actual)': {
      number: metrics.onboardingCompletedAccountsActual,
    },
    'B2B Onboarding Completed Accounts (Actual)': {
      number: metrics.b2bOnboardingCompletedAccountsActual,
    },
    'B2C Onboarding Completed Accounts (Actual)': {
      number: metrics.b2cOnboardingCompletedAccountsActual,
    },
    'Trials Started (Actual)': {
      number: metrics.trialsStartedActual,
    },
    'Personal Trials Started (Actual)': {
      number: metrics.personalTrialsStartedActual,
    },
    'Organization Trials Started (Actual)': {
      number: metrics.organizationTrialsStartedActual,
    },
    'Trials Converted (Actual)': {
      number: metrics.trialsConvertedActual,
    },
    'Personal Trials Converted (Actual)': {
      number: metrics.personalTrialsConvertedActual,
    },
    'Organization Trials Converted (Actual)': {
      number: metrics.organizationTrialsConvertedActual,
    },
    'Trials Expired (Actual)': {
      number: metrics.trialsExpiredActual,
    },
    'Personal Trials Expired (Actual)': {
      number: metrics.personalTrialsExpiredActual,
    },
    'Organization Trials Expired (Actual)': {
      number: metrics.organizationTrialsExpiredActual,
    },
    'Trial Conversion Rate (%)': {
      number: toNotionPercent(metrics.trialConversionRatePercent),
    },
    'Personal Trial Conversion Rate (%)': {
      number: toNotionPercent(metrics.personalTrialConversionRatePercent),
    },
    'Organization Trial Conversion Rate (%)': {
      number: toNotionPercent(metrics.organizationTrialConversionRatePercent),
    },
    'Avg Days to Trial Conversion (Actual)': {
      number: metrics.avgDaysToTrialConversionActual,
    },
    'Personal Avg Days to Trial Conversion (Actual)': {
      number: metrics.personalAvgDaysToTrialConversionActual,
    },
    'Organization Avg Days to Trial Conversion (Actual)': {
      number: metrics.organizationAvgDaysToTrialConversionActual,
    },
  };

  if (typeof metrics.momRevenueGrowthPercent === 'number') {
    properties['MoM Revenue Growth (%)'] = {
      number: toNotionPercent(metrics.momRevenueGrowthPercent),
    };
  } else {
    properties['MoM Revenue Growth (%)'] = { number: null };
  }

  if (typeof metrics.timeToFirstUsageHoursActual === 'number') {
    properties['Time to First Usage (hrs) Actual'] = {
      number: metrics.timeToFirstUsageHoursActual,
    };
  } else {
    properties['Time to First Usage (hrs) Actual'] = { number: null };
  }

  if (typeof metrics.b2bTimeToFirstUsageHoursActual === 'number') {
    properties['B2B Time to First Usage (hrs) Actual'] = {
      number: metrics.b2bTimeToFirstUsageHoursActual,
    };
  } else {
    properties['B2B Time to First Usage (hrs) Actual'] = { number: null };
  }

  if (typeof metrics.b2cTimeToFirstUsageHoursActual === 'number') {
    properties['B2C Time to First Usage (hrs) Actual'] = {
      number: metrics.b2cTimeToFirstUsageHoursActual,
    };
  } else {
    properties['B2C Time to First Usage (hrs) Actual'] = { number: null };
  }

  if (typeof metrics.totalSiteVisitorsActual === 'number') {
    properties['Total Site Visitors (Actual)'] = {
      number: metrics.totalSiteVisitorsActual,
    };
  } else {
    properties['Total Site Visitors (Actual)'] = { number: null };
  }

  properties['Visitor Conversations (Actual)'] = {
    number:
      typeof metrics.visitorConversationsActual === 'number'
        ? metrics.visitorConversationsActual
        : null,
  };

  if (typeof metrics.visitorToSignupConversionPercent === 'number') {
    properties['Visitor to Signup Conversion (%)'] = {
      number: toNotionPercent(metrics.visitorToSignupConversionPercent),
    };
  } else {
    properties['Visitor to Signup Conversion (%)'] = { number: null };
  }

  properties['Visitor to Conversation Rate (%)'] = {
    number:
      typeof metrics.visitorToConversationRatePercent === 'number'
        ? toNotionPercent(metrics.visitorToConversationRatePercent)
        : null,
  };

  if (metrics.topReferralSourcesActual) {
    properties['Top Referral Sources (Actual)'] = {
      rich_text: [
        {
          type: 'text',
          text: { content: metrics.topReferralSourcesActual },
        },
      ],
    };
  } else {
    properties['Top Referral Sources (Actual)'] = { rich_text: [] };
  }

  if (metrics.topReferralDetailsActual) {
    properties['Top Referral Details (Actual)'] = {
      rich_text: [
        {
          type: 'text',
          text: { content: metrics.topReferralDetailsActual },
        },
      ],
    };
  } else {
    properties['Top Referral Details (Actual)'] = { rich_text: [] };
  }

  if (metrics.notes) {
    properties['Notes'] = {
      rich_text: [
        {
          type: 'text',
          text: { content: metrics.notes },
        },
      ],
    };
  } else {
    properties['Notes'] = { rich_text: [] };
  }

  return properties;
}

async function queryExistingMonthlyScoreboardRow(
  config: NotionSignupDashboardConfig,
  monthStart: Date
): Promise<NotionPageSummary | null> {
  return queryNotionDatabase({
    config,
    filter: {
      property: 'Period',
      title: {
        equals: buildPeriodTitle(monthStart),
      },
    },
  });
}

async function queryCurrentMonthlyScoreboardRows(
  config: NotionSignupDashboardConfig
): Promise<readonly NotionPageSummary[]> {
  return queryNotionDatabasePages({
    config,
    filter: {
      property: 'Current Month',
      checkbox: {
        equals: true,
      },
    },
    pageSize: config.batchLimit,
  });
}

export async function upsertMonthlyScoreboardRow(
  input: UpsertMonthlyScoreboardRowInput
): Promise<UpsertMonthlyScoreboardRowResult> {
  const disabledReason = input.config.enabled
    ? null
    : input.config.apiToken
      ? 'missing-database-id'
      : 'missing-token';

  if (!input.config.enabled || disabledReason) {
    return {
      status: 'skipped',
      reason: disabledReason || 'disabled',
    };
  }

  if (!input.config.apiToken) {
    return { status: 'skipped', reason: 'missing-token' };
  }

  if (!input.config.databaseId) {
    return { status: 'skipped', reason: 'missing-database-id' };
  }

  try {
    const isCurrentMonth = isCurrentMonthDashboardRow(input.metrics.monthStart);
    const properties = buildMonthlyScoreboardProperties(input.metrics, {
      isCurrentMonth,
    });
    const existingRow = await queryExistingMonthlyScoreboardRow(
      input.config,
      input.metrics.monthStart
    );

    let result: NotionPageSummary;
    if (existingRow?.id) {
      result = await updateNotionSignupDashboardPage({
        config: input.config,
        pageId: existingRow.id,
        properties,
      });
    } else {
      result = await createNotionSignupDashboardPage({
        config: input.config,
        properties,
      });
    }

    if (isCurrentMonth) {
      const currentRows = await queryCurrentMonthlyScoreboardRows(input.config);

      await Promise.all(
        currentRows
          .filter((row) => row.id !== result.id)
          .map((row) =>
            updateNotionSignupDashboardPage({
              config: input.config,
              pageId: row.id,
              properties: {
                'Current Month': {
                  checkbox: false,
                },
              },
            })
          )
      );
    }

    return {
      status: existingRow?.id ? 'updated' : 'created',
      pageId: result.id,
      pageUrl: result.url,
    };
  } catch (error) {
    return {
      status: 'failed',
      reason: 'notion-error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
