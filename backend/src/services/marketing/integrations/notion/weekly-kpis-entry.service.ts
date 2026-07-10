/**
 * @fileoverview Weekly KPIs Notion Entry Service
 * @module @nxt1/backend/services/marketing/integrations/notion/weekly-kpis-entry
 *
 * Maps computed backend metrics into Notion properties for the Weekly KPIs database.
 * Uses email-based deduplication to upsert rows by week start date.
 */

import type {
  NotionProperties,
  NotionPageSummary,
  NotionSignupDashboardConfig,
} from './notion-client.service.js';
import {
  queryNotionDatabase,
  createNotionSignupDashboardPage,
  updateNotionSignupDashboardPage,
} from './notion-client.service.js';

/**
 * Represents one week's worth of computed KPI metrics.
 * All actual metrics should be filled; targets are typically managed manually in Notion.
 */
export interface WeeklyKpisMetrics {
  readonly weekStart: Date; // Monday of the week (00:00:00 UTC)
  readonly newAccountsStartedActual: number;
  readonly usageStartedAccountsActual: number;
  readonly engagedUsersActual: number;
  readonly engagementEligibleAccountsActual: number;
  readonly payingEngagedUsersActual: number;
  readonly closedWonAccountsActual: number;
  readonly closedLostAccountsActual: number;
  readonly expansionAccountsActual: number;
  readonly churnedAccountsActual: number;
  readonly onboardingCompletedAccountsActual: number;
  readonly activeAccountsActual: number;
  readonly reconciledCostActual: number;
  readonly usageRevenueActual: number; // dollars
  readonly grossMarginPercentActual: number; // 0-100
  readonly totalSiteVisitorsActual?: number;
  readonly usageStartRatePercent: number; // 0-100
  readonly timeToFirstUsageHoursActual?: number; // optional median/average
  readonly b2bNewAccountsStartedActual: number;
  readonly b2bUsageStartedAccountsActual: number;
  readonly b2bEngagedUsersActual: number;
  readonly b2bEngagementEligibleAccountsActual: number;
  readonly b2bPayingEngagedUsersActual: number;
  readonly b2bUsageStartRatePercent: number;
  readonly b2bClosedWonAccountsActual: number;
  readonly b2bClosedLostAccountsActual: number;
  readonly b2bExpansionAccountsActual: number;
  readonly b2bChurnedAccountsActual: number;
  readonly b2bOnboardingCompletedAccountsActual: number;
  readonly b2bActiveAccountsActual: number;
  readonly b2bReconciledCostActual: number;
  readonly b2bUsageRevenueActual: number;
  readonly b2bGrossMarginPercentActual: number;
  readonly b2bTimeToFirstUsageHoursActual?: number;
  readonly b2cNewAccountsStartedActual: number;
  readonly b2cUsageStartedAccountsActual: number;
  readonly b2cEngagedUsersActual: number;
  readonly b2cEngagementEligibleAccountsActual: number;
  readonly b2cPayingEngagedUsersActual: number;
  readonly b2cUsageStartRatePercent: number;
  readonly b2cClosedWonAccountsActual: number;
  readonly b2cClosedLostAccountsActual: number;
  readonly b2cExpansionAccountsActual: number;
  readonly b2cChurnedAccountsActual: number;
  readonly b2cOnboardingCompletedAccountsActual: number;
  readonly b2cActiveAccountsActual: number;
  readonly b2cReconciledCostActual: number;
  readonly b2cUsageRevenueActual: number;
  readonly b2cGrossMarginPercentActual: number;
  readonly b2cTimeToFirstUsageHoursActual?: number;
  readonly notes?: string;
}

export interface UpsertWeeklyKpisRowInput {
  readonly config: NotionSignupDashboardConfig;
  readonly metrics: WeeklyKpisMetrics;
  readonly organizationId?: string; // optional context for notes
}

export type UpsertWeeklyKpisRowResult =
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

function buildWeekTitle(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  return `${formatIsoDate(weekStart)} Week`;
}

export function buildWeeklyKpisProperties(metrics: WeeklyKpisMetrics): NotionProperties {
  const properties: NotionProperties = {
    Week: {
      title: [
        {
          type: 'text',
          text: { content: buildWeekTitle(metrics.weekStart) },
        },
      ],
    },
    'Week Start': {
      date: {
        start: formatIsoDate(metrics.weekStart),
      },
    },
    'New Accounts Started (Actual)': {
      number: metrics.newAccountsStartedActual,
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
    'Usage Start Rate (%)': {
      number: metrics.usageStartRatePercent / 100, // Notion percent format stores 0-1 (0.75 → displays 75%)
    },
    'Closed Won Accounts (Actual)': {
      number: metrics.closedWonAccountsActual,
    },
    'Expansion Accounts (Actual)': {
      number: metrics.expansionAccountsActual,
    },
    'Closed Lost Accounts (Actual)': {
      number: metrics.closedLostAccountsActual,
    },
    'Onboarding Completed Accounts (Actual)': {
      number: metrics.onboardingCompletedAccountsActual,
    },
    'Active Paying Accounts (Actual)': {
      number: metrics.activeAccountsActual,
    },
    'Reconciled Cost ($) Actual': {
      number: metrics.reconciledCostActual,
    },
    'Usage Revenue ($) Actual': {
      number: metrics.usageRevenueActual,
    },
    // 'Gross Margin (%) Actual' (overall) is a live Notion formula derived from
    // Usage Revenue and Reconciled Cost — intentionally not pushed as a raw number.
    'Churned Accounts (Actual)': {
      number: metrics.churnedAccountsActual,
    },
    'B2B New Accounts Started (Actual)': {
      number: metrics.b2bNewAccountsStartedActual,
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
    'B2B Usage Start Rate (%)': {
      number: metrics.b2bUsageStartRatePercent / 100,
    },
    'B2B Closed Won Accounts (Actual)': {
      number: metrics.b2bClosedWonAccountsActual,
    },
    'B2B Closed Lost Accounts (Actual)': {
      number: metrics.b2bClosedLostAccountsActual,
    },
    'B2B Expansion Accounts (Actual)': {
      number: metrics.b2bExpansionAccountsActual,
    },
    'B2B Churned Accounts (Actual)': {
      number: metrics.b2bChurnedAccountsActual,
    },
    'B2B Onboarding Completed Accounts (Actual)': {
      number: metrics.b2bOnboardingCompletedAccountsActual,
    },
    'B2B Active Paying Accounts (Actual)': {
      number: metrics.b2bActiveAccountsActual,
    },
    'B2B Reconciled Cost ($) Actual': {
      number: metrics.b2bReconciledCostActual,
    },
    'B2B Usage Revenue ($) Actual': {
      number: metrics.b2bUsageRevenueActual,
    },
    'B2B Gross Margin (%) Actual': {
      number: metrics.b2bGrossMarginPercentActual / 100,
    },
    'B2C New Accounts Started (Actual)': {
      number: metrics.b2cNewAccountsStartedActual,
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
    'B2C Usage Start Rate (%)': {
      number: metrics.b2cUsageStartRatePercent / 100,
    },
    'B2C Closed Won Accounts (Actual)': {
      number: metrics.b2cClosedWonAccountsActual,
    },
    'B2C Closed Lost Accounts (Actual)': {
      number: metrics.b2cClosedLostAccountsActual,
    },
    'B2C Expansion Accounts (Actual)': {
      number: metrics.b2cExpansionAccountsActual,
    },
    'B2C Churned Accounts (Actual)': {
      number: metrics.b2cChurnedAccountsActual,
    },
    'B2C Onboarding Completed Accounts (Actual)': {
      number: metrics.b2cOnboardingCompletedAccountsActual,
    },
    'B2C Active Paying Accounts (Actual)': {
      number: metrics.b2cActiveAccountsActual,
    },
    'B2C Reconciled Cost ($) Actual': {
      number: metrics.b2cReconciledCostActual,
    },
    'B2C Usage Revenue ($) Actual': {
      number: metrics.b2cUsageRevenueActual,
    },
    'B2C Gross Margin (%) Actual': {
      number: metrics.b2cGrossMarginPercentActual / 100,
    },
  };

  if (typeof metrics.timeToFirstUsageHoursActual === 'number') {
    properties['Time to First Usage (hrs) Actual'] = {
      number: metrics.timeToFirstUsageHoursActual,
    };
  }

  if (typeof metrics.totalSiteVisitorsActual === 'number') {
    properties['Total Site Visitors (Actual)'] = {
      number: metrics.totalSiteVisitorsActual,
    };
  }

  if (typeof metrics.b2bTimeToFirstUsageHoursActual === 'number') {
    properties['B2B Time to First Usage (hrs) Actual'] = {
      number: metrics.b2bTimeToFirstUsageHoursActual,
    };
  }

  if (typeof metrics.b2cTimeToFirstUsageHoursActual === 'number') {
    properties['B2C Time to First Usage (hrs) Actual'] = {
      number: metrics.b2cTimeToFirstUsageHoursActual,
    };
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
  }

  return properties;
}

/**
 * Query the Weekly KPIs database for an existing row matching the week start date.
 * Deduplicates by Week Start to prevent duplicate rows.
 */
async function queryExistingWeeklyKpisRow(
  config: NotionSignupDashboardConfig,
  weekStart: Date
): Promise<NotionPageSummary | null> {
  const weekStartStr = formatIsoDate(weekStart);

  return queryNotionDatabase({
    config,
    filter: {
      property: 'Week Start',
      date: {
        equals: weekStartStr,
      },
    },
  });
}

/**
 * Upsert a weekly KPIs row in Notion.
 * Creates a new row if one doesn't exist for that week, otherwise updates the existing row.
 */
export async function upsertWeeklyKpisRow(
  input: UpsertWeeklyKpisRowInput
): Promise<UpsertWeeklyKpisRowResult> {
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
    const properties = buildWeeklyKpisProperties(input.metrics);

    // Query for existing row to deduplicate by week start
    const existingRow = await queryExistingWeeklyKpisRow(input.config, input.metrics.weekStart);

    let result: NotionPageSummary;

    if (existingRow?.id) {
      // Update existing row
      result = await updateNotionSignupDashboardPage({
        config: input.config,
        pageId: existingRow.id,
        properties,
      });
      return {
        status: 'updated',
        pageId: result.id,
        pageUrl: result.url,
      };
    } else {
      // Create new row
      result = await createNotionSignupDashboardPage({
        config: input.config,
        properties,
      });
      return {
        status: 'created',
        pageId: result.id,
        pageUrl: result.url,
      };
    }
  } catch (error) {
    return {
      status: 'failed',
      reason: 'notion-error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
