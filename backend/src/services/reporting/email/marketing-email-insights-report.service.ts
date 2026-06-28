import {
  getRuntimeEnvironment,
  type RuntimeEnvironment,
} from '../../../config/runtime-environment.js';
import { AnalyticsEventModel } from '../../../models/analytics/analytics-event.model.js';
import { MarketingEmailDispatchModel } from '../../../models/marketing/marketing-email-dispatch.model.js';
import { MarketingEmailInsightsReportModel } from '../../../models/marketing/marketing-email-insights-report.model.js';
import { sendSlackAlert, type AlertField } from '../../platform/alert.service.js';

type ReportType = 'weekly' | 'monthly';

interface DispatchRecord {
  readonly campaignKey?: string;
  readonly campaignFamily?: string;
  readonly sendStatus?: string;
}

interface AnalyticsEventRecord {
  readonly eventType?: string;
  readonly payload?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

export interface MarketingEmailInsightsCampaignReport {
  readonly campaignKey: string;
  readonly campaignFamily: string;
  readonly attemptedCount: number;
  readonly sentCount: number;
  readonly failedCount: number;
  readonly openedCount: number;
  readonly uniqueOpenedCount: number;
  readonly clickedCount: number;
  readonly uniqueClickedCount: number;
  readonly openRate: number;
  readonly clickThroughRate: number;
}

export interface MarketingEmailInsightsReport {
  readonly reportType: ReportType;
  readonly environment: RuntimeEnvironment;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly generatedAt: Date;
  readonly totals: {
    readonly attemptedCount: number;
    readonly sentCount: number;
    readonly failedCount: number;
    readonly openedCount: number;
    readonly uniqueOpenedCount: number;
    readonly clickedCount: number;
    readonly uniqueClickedCount: number;
    readonly openRate: number;
    readonly clickThroughRate: number;
  };
  readonly campaigns: readonly MarketingEmailInsightsCampaignReport[];
  readonly topLinks: readonly {
    readonly url: string;
    readonly clicks: number;
  }[];
}

export interface GenerateMarketingEmailInsightsReportInput {
  readonly reportType: ReportType;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly environment?: RuntimeEnvironment;
  readonly persist?: boolean;
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getEventField(event: AnalyticsEventRecord, key: string): string | null {
  const payloadValue = event.payload?.[key];
  if (typeof payloadValue === 'string' && payloadValue.trim().length > 0) {
    return payloadValue.trim();
  }

  const metadataValue = event.metadata?.[key];
  if (typeof metadataValue === 'string' && metadataValue.trim().length > 0) {
    return metadataValue.trim();
  }

  return null;
}

function getDispatchIdentity(event: AnalyticsEventRecord): string | null {
  return getEventField(event, 'dispatchId') ?? getEventField(event, 'sourceRecordId');
}

function isSentLikeStatus(status: string | undefined): boolean {
  return (
    status === 'sent' ||
    status === 'delivered' ||
    status === 'bounced' ||
    status === 'blocked' ||
    status === 'unsubscribed' ||
    status === 'complained'
  );
}

function createEmptyCampaignReport(
  campaignKey: string,
  campaignFamily: string
): MarketingEmailInsightsCampaignReport {
  return {
    campaignKey,
    campaignFamily,
    attemptedCount: 0,
    sentCount: 0,
    failedCount: 0,
    openedCount: 0,
    uniqueOpenedCount: 0,
    clickedCount: 0,
    uniqueClickedCount: 0,
    openRate: 0,
    clickThroughRate: 0,
  };
}

function formatCampaignMetrics(report: MarketingEmailInsightsCampaignReport): string {
  return [
    `sent ${report.sentCount}`,
    `failed ${report.failedCount}`,
    `opened ${report.uniqueOpenedCount}`,
    `clicked ${report.uniqueClickedCount}`,
    `open ${report.openRate}%`,
    `ctr ${report.clickThroughRate}%`,
  ].join(' | ');
}

function buildInsightsAlertFields(report: MarketingEmailInsightsReport): AlertField[] {
  const fields: AlertField[] = [
    {
      label: 'Totals',
      value: [
        `sent ${report.totals.sentCount}`,
        `failed ${report.totals.failedCount}`,
        `opened ${report.totals.uniqueOpenedCount}`,
        `clicked ${report.totals.uniqueClickedCount}`,
        `open ${report.totals.openRate}%`,
        `ctr ${report.totals.clickThroughRate}%`,
      ].join(' | '),
    },
  ];

  for (const campaign of report.campaigns) {
    fields.push({
      label: campaign.campaignKey,
      value: formatCampaignMetrics(campaign),
    });
  }

  if (report.topLinks.length > 0) {
    fields.push({
      label: 'Top links',
      value: report.topLinks.map((entry) => `${entry.clicks}x ${entry.url}`).join(' | '),
    });
  }

  return fields;
}

async function persistMarketingEmailInsightsReport(
  report: MarketingEmailInsightsReport
): Promise<void> {
  await MarketingEmailInsightsReportModel.findOneAndUpdate(
    {
      environment: report.environment,
      reportType: report.reportType,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
    },
    {
      $set: {
        environment: report.environment,
        reportType: report.reportType,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        generatedAt: report.generatedAt,
        totals: report.totals,
        campaigns: report.campaigns,
        topLinks: report.topLinks,
        metadata: {
          campaignCount: report.campaigns.length,
        },
      },
    },
    {
      upsert: true,
    }
  );
}

export function buildWeeklyInsightsWindow(now: Date = new Date()): {
  readonly periodStart: Date;
  readonly periodEnd: Date;
} {
  return {
    periodStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    periodEnd: now,
  };
}

export function buildPreviousMonthInsightsWindow(now: Date = new Date()): {
  readonly periodStart: Date;
  readonly periodEnd: Date;
} {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodStart = new Date(
    Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1, 0, 0, 0, 0)
  );

  return { periodStart, periodEnd };
}

export async function generateMarketingEmailInsightsReport(
  input: GenerateMarketingEmailInsightsReportInput
): Promise<MarketingEmailInsightsReport> {
  const environment = input.environment ?? getRuntimeEnvironment();
  const generatedAt = new Date();
  const campaignMap = new Map<string, MarketingEmailInsightsCampaignReport>();
  const uniqueOpenDispatchIds = new Set<string>();
  const uniqueClickDispatchIds = new Set<string>();
  const topLinkCounts = new Map<string, number>();

  const dispatches = (await MarketingEmailDispatchModel.find({
    environment,
    createdAt: {
      $gte: input.periodStart,
      $lt: input.periodEnd,
    },
  }).lean()) as DispatchRecord[];

  for (const dispatch of dispatches) {
    const campaignKey = dispatch.campaignKey ?? 'unknown';
    const campaignFamily = dispatch.campaignFamily ?? 'unknown';
    const existing =
      campaignMap.get(campaignKey) ?? createEmptyCampaignReport(campaignKey, campaignFamily);

    const next: MarketingEmailInsightsCampaignReport = {
      ...existing,
      attemptedCount: existing.attemptedCount + 1,
      sentCount: existing.sentCount + (isSentLikeStatus(dispatch.sendStatus) ? 1 : 0),
      failedCount: existing.failedCount + (dispatch.sendStatus === 'failed' ? 1 : 0),
    };

    campaignMap.set(campaignKey, next);
  }

  const events = (await AnalyticsEventModel.find({
    environment,
    domain: 'communication',
    eventType: { $in: ['email_opened', 'link_clicked'] },
    occurredAt: {
      $gte: input.periodStart,
      $lt: input.periodEnd,
    },
    $or: [{ 'payload.emailOrigin': 'marketing' }, { 'metadata.emailOrigin': 'marketing' }],
  }).lean()) as AnalyticsEventRecord[];

  const uniqueOpensByCampaign = new Map<string, Set<string>>();
  const uniqueClicksByCampaign = new Map<string, Set<string>>();

  for (const event of events) {
    const campaignKey = getEventField(event, 'campaignKey') ?? 'unknown';
    const campaignFamily = getEventField(event, 'campaignFamily') ?? 'unknown';
    const existing =
      campaignMap.get(campaignKey) ?? createEmptyCampaignReport(campaignKey, campaignFamily);
    const dispatchId = getDispatchIdentity(event);
    let next = existing;

    if (event.eventType === 'email_opened') {
      next = {
        ...next,
        openedCount: next.openedCount + 1,
      };
      if (dispatchId) {
        uniqueOpenDispatchIds.add(dispatchId);
        const bucket = uniqueOpensByCampaign.get(campaignKey) ?? new Set<string>();
        bucket.add(dispatchId);
        uniqueOpensByCampaign.set(campaignKey, bucket);
      }
    }

    if (event.eventType === 'link_clicked') {
      next = {
        ...next,
        clickedCount: next.clickedCount + 1,
      };
      if (dispatchId) {
        uniqueClickDispatchIds.add(dispatchId);
        const bucket = uniqueClicksByCampaign.get(campaignKey) ?? new Set<string>();
        bucket.add(dispatchId);
        uniqueClicksByCampaign.set(campaignKey, bucket);
      }

      const normalizedUrl = getEventField(event, 'normalizedUrl');
      if (normalizedUrl) {
        topLinkCounts.set(normalizedUrl, (topLinkCounts.get(normalizedUrl) ?? 0) + 1);
      }
    }

    campaignMap.set(campaignKey, next);
  }

  const campaigns = [...campaignMap.values()]
    .map((campaign) => {
      const uniqueOpenedCount = uniqueOpensByCampaign.get(campaign.campaignKey)?.size ?? 0;
      const uniqueClickedCount = uniqueClicksByCampaign.get(campaign.campaignKey)?.size ?? 0;
      return {
        ...campaign,
        uniqueOpenedCount,
        uniqueClickedCount,
        openRate: toPercent(uniqueOpenedCount, campaign.sentCount),
        clickThroughRate: toPercent(uniqueClickedCount, campaign.sentCount),
      };
    })
    .sort(
      (left, right) =>
        right.sentCount - left.sentCount || left.campaignKey.localeCompare(right.campaignKey)
    );

  const totals = campaigns.reduce(
    (accumulator, campaign) => ({
      attemptedCount: accumulator.attemptedCount + campaign.attemptedCount,
      sentCount: accumulator.sentCount + campaign.sentCount,
      failedCount: accumulator.failedCount + campaign.failedCount,
      openedCount: accumulator.openedCount + campaign.openedCount,
      uniqueOpenedCount: accumulator.uniqueOpenedCount + campaign.uniqueOpenedCount,
      clickedCount: accumulator.clickedCount + campaign.clickedCount,
      uniqueClickedCount: accumulator.uniqueClickedCount + campaign.uniqueClickedCount,
      openRate: 0,
      clickThroughRate: 0,
    }),
    {
      attemptedCount: 0,
      sentCount: 0,
      failedCount: 0,
      openedCount: 0,
      uniqueOpenedCount: 0,
      clickedCount: 0,
      uniqueClickedCount: 0,
      openRate: 0,
      clickThroughRate: 0,
    }
  );

  const report: MarketingEmailInsightsReport = {
    reportType: input.reportType,
    environment,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedAt,
    totals: {
      ...totals,
      uniqueOpenedCount: uniqueOpenDispatchIds.size,
      uniqueClickedCount: uniqueClickDispatchIds.size,
      openRate: toPercent(uniqueOpenDispatchIds.size, totals.sentCount),
      clickThroughRate: toPercent(uniqueClickDispatchIds.size, totals.sentCount),
    },
    campaigns,
    topLinks: [...topLinkCounts.entries()]
      .map(([url, clicks]) => ({ url, clicks }))
      .sort((left, right) => right.clicks - left.clicks || left.url.localeCompare(right.url))
      .slice(0, 5),
  };

  if (input.persist) {
    await persistMarketingEmailInsightsReport(report);
  }

  return report;
}

export async function sendMarketingEmailInsightsSlackReport(
  report: MarketingEmailInsightsReport
): Promise<boolean> {
  const title = report.reportType === 'weekly' ? 'Weekly Email Insights' : 'Monthly Email Insights';
  const summary = [
    `Window: ${toIsoDate(report.periodStart)} to ${toIsoDate(report.periodEnd)}`,
    `Sent ${report.totals.sentCount}, failed ${report.totals.failedCount}, opened ${report.totals.uniqueOpenedCount}, clicked ${report.totals.uniqueClickedCount}.`,
  ].join('\n');

  return sendSlackAlert({
    target: 'insights',
    environment: report.environment,
    severity: 'info',
    title,
    summary,
    fields: buildInsightsAlertFields(report),
  });
}

export async function runWeeklyMarketingEmailInsightsReport(input?: {
  readonly now?: Date;
  readonly environment?: RuntimeEnvironment;
}): Promise<{
  readonly report: MarketingEmailInsightsReport;
  readonly slackDelivered: boolean;
}> {
  const window = buildWeeklyInsightsWindow(input?.now);
  const report = await generateMarketingEmailInsightsReport({
    reportType: 'weekly',
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    environment: input?.environment,
    persist: true,
  });

  const slackDelivered = await sendMarketingEmailInsightsSlackReport(report);
  return { report, slackDelivered };
}

export async function runMonthlyMarketingEmailInsightsReport(input?: {
  readonly now?: Date;
  readonly environment?: RuntimeEnvironment;
}): Promise<{
  readonly report: MarketingEmailInsightsReport;
  readonly slackDelivered: boolean;
}> {
  const window = buildPreviousMonthInsightsWindow(input?.now);
  const report = await generateMarketingEmailInsightsReport({
    reportType: 'monthly',
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    environment: input?.environment,
    persist: true,
  });

  const slackDelivered = await sendMarketingEmailInsightsSlackReport(report);
  return { report, slackDelivered };
}
