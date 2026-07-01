import {
  getRuntimeEnvironment,
  type RuntimeEnvironment,
} from '../../../config/runtime-environment.js';
import { UsageEventModel } from '../../../models/analytics/usage-event.model.js';
import { PaymentLogModel } from '../../../models/billing/payment-log.model.js';
import { FinancialInsightsReportModel } from '../../../models/reporting/financial-insights-report.model.js';
import { sendSlackAlert, type AlertField } from '../../platform/alert.service.js';

export type ReportType = 'weekly' | 'monthly';

// ─── Ad-hoc input parsing ──────────────────────────────────────────────────────

export function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseOptionalBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

export function parseReportType(value: unknown): ReportType | null {
  return value === 'weekly' || value === 'monthly' ? value : null;
}

export function validateDateRange(periodStart: Date, periodEnd: Date): string | null {
  if (periodStart >= periodEnd) {
    return 'periodStart must be before periodEnd';
  }

  const rangeMs = periodEnd.getTime() - periodStart.getTime();
  if (rangeMs > 366 * 24 * 60 * 60 * 1000) {
    return 'Date range cannot exceed 366 days';
  }

  return null;
}

interface UsageEventCostRecord {
  readonly metadata?: Record<string, unknown>;
}

interface PaymentLogRecord {
  readonly amountPaid?: number;
  readonly amountRefunded?: number;
  readonly status?: 'PAID' | 'FAILED' | 'PENDING' | 'VOID' | 'REFUNDED';
  readonly type?: string;
}

export interface FinancialInsightsReport {
  readonly reportType: ReportType;
  readonly environment: RuntimeEnvironment;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly generatedAt: Date;
  readonly totals: {
    readonly costCents: number;
    readonly stripeRevenueCents: number;
    readonly appleRevenueCents: number;
    readonly totalRevenueCents: number;
    readonly grossMarginCents: number;
    readonly grossMarginPercent: number;
    readonly usageEventsCount: number;
    readonly reconciledUsageEventsCount: number;
    readonly unreconciledUsageEventsCount: number;
    readonly stripeTransactionsCount: number;
    readonly appleTransactionsCount: number;
  };
}

export interface GenerateFinancialInsightsReportInput {
  readonly reportType: ReportType;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly environment?: RuntimeEnvironment;
  readonly persist?: boolean;
}

function getValidatedProductionEnvironment(environment?: RuntimeEnvironment): RuntimeEnvironment {
  const resolvedEnvironment = environment ?? getRuntimeEnvironment();
  if (resolvedEnvironment !== 'production') {
    throw new Error('Financial insights reports can only run in production');
  }

  return resolvedEnvironment;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function formatUsdFromCents(valueCents: number): string {
  return `$${(valueCents / 100).toFixed(2)}`;
}

function toCents(valueDollars: number | undefined): number {
  if (typeof valueDollars !== 'number' || !Number.isFinite(valueDollars)) {
    return 0;
  }

  return Math.round(valueDollars * 100);
}

function getVerifiedCostCents(record: UsageEventCostRecord): number | null {
  const candidate = record.metadata?.['heliconeVerifiedCostCents'];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? Math.round(candidate) : null;
}

function buildFinancialAlertFields(report: FinancialInsightsReport): AlertField[] {
  return [
    {
      label: 'Totals',
      value: [
        `cost ${formatUsdFromCents(report.totals.costCents)}`,
        `revenue ${formatUsdFromCents(report.totals.totalRevenueCents)}`,
        `margin ${formatUsdFromCents(report.totals.grossMarginCents)} (${report.totals.grossMarginPercent}%)`,
      ].join(' | '),
    },
    {
      label: 'Revenue breakdown',
      value: [
        `Stripe ${formatUsdFromCents(report.totals.stripeRevenueCents)}`,
        `Apple ${formatUsdFromCents(report.totals.appleRevenueCents)}`,
      ].join(' | '),
    },
    {
      label: 'Reconciliation',
      value: [
        `usage ${report.totals.usageEventsCount}`,
        `reconciled ${report.totals.reconciledUsageEventsCount}`,
        `pending ${report.totals.unreconciledUsageEventsCount}`,
      ].join(' | '),
    },
  ];
}

async function persistFinancialInsightsReport(report: FinancialInsightsReport): Promise<void> {
  await FinancialInsightsReportModel.findOneAndUpdate(
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
        metadata: {
          usageEventsCount: report.totals.usageEventsCount,
          reconciledUsageEventsCount: report.totals.reconciledUsageEventsCount,
          unreconciledUsageEventsCount: report.totals.unreconciledUsageEventsCount,
        },
      },
    },
    {
      upsert: true,
    }
  );
}

export function buildWeeklyFinancialInsightsWindow(now: Date = new Date()): {
  readonly periodStart: Date;
  readonly periodEnd: Date;
} {
  return {
    periodStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    periodEnd: now,
  };
}

export function buildPreviousMonthFinancialInsightsWindow(now: Date = new Date()): {
  readonly periodStart: Date;
  readonly periodEnd: Date;
} {
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodStart = new Date(
    Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() - 1, 1, 0, 0, 0, 0)
  );

  return { periodStart, periodEnd };
}

export async function generateFinancialInsightsReport(
  input: GenerateFinancialInsightsReportInput
): Promise<FinancialInsightsReport> {
  const environment = input.environment ?? getRuntimeEnvironment();
  const generatedAt = new Date();

  const usageEvents = (await UsageEventModel.find({
    createdAt: {
      $gte: input.periodStart,
      $lt: input.periodEnd,
    },
  })
    .select({ metadata: 1 })
    .lean()) as UsageEventCostRecord[];

  const paymentLogs = (await PaymentLogModel.find({
    createdAt: {
      $gte: input.periodStart,
      $lt: input.periodEnd,
    },
    status: { $in: ['PAID', 'REFUNDED'] },
  }).lean()) as PaymentLogRecord[];

  let costCents = 0;
  let reconciledUsageEventsCount = 0;

  for (const usageEvent of usageEvents) {
    const verifiedCost = getVerifiedCostCents(usageEvent);
    if (verifiedCost === null) {
      continue;
    }

    costCents += verifiedCost;
    reconciledUsageEventsCount += 1;
  }

  let stripeRevenueCents = 0;
  let appleRevenueCents = 0;
  let stripeTransactionsCount = 0;
  let appleTransactionsCount = 0;

  for (const paymentLog of paymentLogs) {
    const paidCents = toCents(paymentLog.amountPaid);
    let refundedCents = toCents(paymentLog.amountRefunded);

    if (paymentLog.status === 'REFUNDED' && refundedCents === 0 && paidCents > 0) {
      refundedCents = paidCents;
    }

    const netCents = paidCents - refundedCents;
    const isAppleIap = paymentLog.type === 'apple_iap';

    if (isAppleIap) {
      appleRevenueCents += netCents;
      appleTransactionsCount += 1;
    } else {
      stripeRevenueCents += netCents;
      stripeTransactionsCount += 1;
    }
  }

  const totalRevenueCents = stripeRevenueCents + appleRevenueCents;
  const grossMarginCents = totalRevenueCents - costCents;

  const report: FinancialInsightsReport = {
    reportType: input.reportType,
    environment,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    generatedAt,
    totals: {
      costCents,
      stripeRevenueCents,
      appleRevenueCents,
      totalRevenueCents,
      grossMarginCents,
      grossMarginPercent: toPercent(grossMarginCents, totalRevenueCents),
      usageEventsCount: usageEvents.length,
      reconciledUsageEventsCount,
      unreconciledUsageEventsCount: usageEvents.length - reconciledUsageEventsCount,
      stripeTransactionsCount,
      appleTransactionsCount,
    },
  };

  if (input.persist) {
    await persistFinancialInsightsReport(report);
  }

  return report;
}

export async function sendFinancialInsightsSlackReport(
  report: FinancialInsightsReport
): Promise<boolean> {
  const title =
    report.reportType === 'weekly' ? 'Weekly Financial Insights' : 'Monthly Financial Insights';
  const summary = [
    `Window: ${toIsoDate(report.periodStart)} to ${toIsoDate(report.periodEnd)}`,
    `Cost ${formatUsdFromCents(report.totals.costCents)} vs revenue ${formatUsdFromCents(report.totals.totalRevenueCents)}.`,
  ].join('\n');

  return sendSlackAlert({
    target: 'insights',
    environment: report.environment,
    severity: 'info',
    title,
    summary,
    fields: buildFinancialAlertFields(report),
  });
}

export async function runWeeklyFinancialInsightsReport(input?: {
  readonly now?: Date;
  readonly environment?: RuntimeEnvironment;
}): Promise<{
  readonly report: FinancialInsightsReport;
  readonly slackDelivered: boolean;
}> {
  const environment = getValidatedProductionEnvironment(input?.environment);
  const window = buildWeeklyFinancialInsightsWindow(input?.now);
  const report = await generateFinancialInsightsReport({
    reportType: 'weekly',
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    environment,
    persist: true,
  });

  const slackDelivered = await sendFinancialInsightsSlackReport(report);
  return { report, slackDelivered };
}

export async function runMonthlyFinancialInsightsReport(input?: {
  readonly now?: Date;
  readonly environment?: RuntimeEnvironment;
}): Promise<{
  readonly report: FinancialInsightsReport;
  readonly slackDelivered: boolean;
}> {
  const environment = getValidatedProductionEnvironment(input?.environment);
  const window = buildPreviousMonthFinancialInsightsWindow(input?.now);
  const report = await generateFinancialInsightsReport({
    reportType: 'monthly',
    periodStart: window.periodStart,
    periodEnd: window.periodEnd,
    environment,
    persist: true,
  });

  const slackDelivered = await sendFinancialInsightsSlackReport(report);
  return { report, slackDelivered };
}
