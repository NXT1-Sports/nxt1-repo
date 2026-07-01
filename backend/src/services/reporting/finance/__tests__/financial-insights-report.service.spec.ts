import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  usageFindLeanMock,
  paymentLogFindLeanMock,
  reportFindOneAndUpdateMock,
  sendSlackAlertMock,
} = vi.hoisted(() => ({
  usageFindLeanMock: vi.fn(),
  paymentLogFindLeanMock: vi.fn(),
  reportFindOneAndUpdateMock: vi.fn(),
  sendSlackAlertMock: vi.fn(),
}));

vi.mock('../../../../models/analytics/usage-event.model.js', () => ({
  UsageEventModel: {
    find: vi.fn(() => ({
      select: vi.fn(() => ({
        lean: usageFindLeanMock,
      })),
    })),
  },
}));

vi.mock('../../../../models/billing/payment-log.model.js', () => ({
  PaymentLogModel: {
    find: vi.fn(() => ({
      lean: paymentLogFindLeanMock,
    })),
  },
}));

vi.mock('../../../../models/reporting/financial-insights-report.model.js', () => ({
  FinancialInsightsReportModel: {
    findOneAndUpdate: reportFindOneAndUpdateMock,
  },
}));

vi.mock('../../../platform/alert.service.js', () => ({
  sendSlackAlert: sendSlackAlertMock,
}));

import {
  generateFinancialInsightsReport,
  runWeeklyFinancialInsightsReport,
} from '../financial-insights-report.service.js';

describe('financial insights report service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportFindOneAndUpdateMock.mockResolvedValue(undefined);
    sendSlackAlertMock.mockResolvedValue(true);
  });

  it('aggregates reconciled costs and net revenue for Stripe and Apple IAP', async () => {
    usageFindLeanMock.mockResolvedValue([
      { metadata: { heliconeVerifiedCostCents: 120 } },
      { metadata: { heliconeVerifiedCostCents: 80 } },
      { metadata: {} },
    ]);

    paymentLogFindLeanMock.mockResolvedValue([
      { amountPaid: 10, status: 'PAID', type: 'wallet_topup' },
      { amountPaid: 5, status: 'PAID', type: 'apple_iap' },
      { amountPaid: 4, amountRefunded: 1, status: 'REFUNDED', type: 'wallet_topup' },
    ]);

    const report = await generateFinancialInsightsReport({
      reportType: 'weekly',
      periodStart: new Date('2026-06-14T00:00:00.000Z'),
      periodEnd: new Date('2026-06-21T00:00:00.000Z'),
      environment: 'production',
      persist: false,
    });

    expect(report.totals.costCents).toBe(200);
    expect(report.totals.stripeRevenueCents).toBe(1300);
    expect(report.totals.appleRevenueCents).toBe(500);
    expect(report.totals.totalRevenueCents).toBe(1800);
    expect(report.totals.grossMarginCents).toBe(1600);
    expect(report.totals.grossMarginPercent).toBe(88.9);
    expect(report.totals.usageEventsCount).toBe(3);
    expect(report.totals.reconciledUsageEventsCount).toBe(2);
    expect(report.totals.unreconciledUsageEventsCount).toBe(1);
  });

  it('persists and sends weekly report to insights webhook target', async () => {
    usageFindLeanMock.mockResolvedValue([]);
    paymentLogFindLeanMock.mockResolvedValue([]);

    const result = await runWeeklyFinancialInsightsReport({
      now: new Date('2026-06-21T12:00:00.000Z'),
      environment: 'production',
    });

    expect(reportFindOneAndUpdateMock).toHaveBeenCalledOnce();
    expect(sendSlackAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'insights',
        environment: 'production',
        severity: 'info',
      })
    );
    expect(result.slackDelivered).toBe(true);
  });

  it('rejects staging environment for weekly report runs', async () => {
    await expect(
      runWeeklyFinancialInsightsReport({
        now: new Date('2026-06-21T12:00:00.000Z'),
        environment: 'staging',
      })
    ).rejects.toThrow('Financial insights reports can only run in production');

    expect(reportFindOneAndUpdateMock).not.toHaveBeenCalled();
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
  });
});
