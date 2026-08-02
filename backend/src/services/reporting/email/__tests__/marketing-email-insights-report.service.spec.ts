import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dispatchFindLeanMock,
  analyticsFindLeanMock,
  reportFindOneAndUpdateMock,
  sendSlackAlertMock,
} = vi.hoisted(() => ({
  dispatchFindLeanMock: vi.fn(),
  analyticsFindLeanMock: vi.fn(),
  reportFindOneAndUpdateMock: vi.fn(),
  sendSlackAlertMock: vi.fn(),
}));

vi.mock('../../../../models/marketing/marketing-email-dispatch.model.js', () => ({
  MarketingEmailDispatchModel: {
    find: vi.fn(() => ({
      lean: dispatchFindLeanMock,
    })),
  },
}));

vi.mock('../../../../models/analytics/analytics-event.model.js', () => ({
  AnalyticsEventModel: {
    find: vi.fn(() => ({
      lean: analyticsFindLeanMock,
    })),
  },
}));

vi.mock('../../../../models/marketing/marketing-email-insights-report.model.js', () => ({
  MarketingEmailInsightsReportModel: {
    findOneAndUpdate: reportFindOneAndUpdateMock,
  },
}));

vi.mock('../../../platform/alert.service.js', () => ({
  sendSlackAlert: sendSlackAlertMock,
}));

import {
  generateMarketingEmailInsightsReport,
  runWeeklyMarketingEmailInsightsReport,
  sendMarketingEmailInsightsSlackReport,
} from '../marketing-email-insights-report.service.js';

describe('marketing email insights report service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reportFindOneAndUpdateMock.mockResolvedValue(undefined);
    sendSlackAlertMock.mockResolvedValue(true);
  });

  it('aggregates sent, failed, opened, clicked, and top link metrics by campaign', async () => {
    dispatchFindLeanMock.mockResolvedValue([
      {
        dispatchId: 'dispatch-1',
        campaignKey: 'welcome_intro_athlete',
        campaignFamily: 'welcome',
        sendStatus: 'sent',
      },
      {
        dispatchId: 'dispatch-failed',
        campaignKey: 'welcome_intro_athlete',
        campaignFamily: 'welcome',
        sendStatus: 'failed',
      },
      {
        dispatchId: 'dispatch-2',
        campaignKey: 'monthly_campaign_01_athlete',
        campaignFamily: 'monthly',
        sendStatus: 'sent',
      },
    ]);
    analyticsFindLeanMock.mockResolvedValue([
      {
        eventType: 'email_opened',
        payload: {
          dispatchId: 'dispatch-1',
          campaignKey: 'welcome_intro_athlete',
          campaignFamily: 'welcome',
          emailOrigin: 'marketing',
        },
        metadata: {},
      },
      {
        eventType: 'link_clicked',
        payload: {
          dispatchId: 'dispatch-1',
          campaignKey: 'welcome_intro_athlete',
          campaignFamily: 'welcome',
          emailOrigin: 'marketing',
          normalizedUrl: 'https://example.com/start',
        },
        metadata: {},
      },
      {
        eventType: 'email_opened',
        payload: {
          dispatchId: 'dispatch-2',
          campaignKey: 'monthly_campaign_01_athlete',
          campaignFamily: 'monthly',
          emailOrigin: 'marketing',
        },
        metadata: {},
      },
    ]);

    const report = await generateMarketingEmailInsightsReport({
      reportType: 'weekly',
      periodStart: new Date('2026-06-14T00:00:00.000Z'),
      periodEnd: new Date('2026-06-21T00:00:00.000Z'),
      environment: 'production',
      persist: false,
    });

    expect(report.totals.sentCount).toBe(2);
    expect(report.totals.failedCount).toBe(1);
    expect(report.totals.uniqueOpenedCount).toBe(2);
    expect(report.totals.uniqueClickedCount).toBe(1);
    expect(report.totals.openRate).toBe(100);
    expect(report.totals.clickThroughRate).toBe(50);
    expect(report.campaigns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          campaignKey: 'welcome_intro_athlete',
          sentCount: 1,
          failedCount: 1,
          uniqueOpenedCount: 1,
          uniqueClickedCount: 1,
          openRate: 100,
          clickThroughRate: 100,
        }),
        expect.objectContaining({
          campaignKey: 'monthly_campaign_01_athlete',
          sentCount: 1,
          failedCount: 0,
          uniqueOpenedCount: 1,
          uniqueClickedCount: 0,
          openRate: 100,
          clickThroughRate: 0,
        }),
      ])
    );
    expect(report.topLinks).toEqual([{ url: 'https://example.com/start', clicks: 1 }]);
  });

  it('ignores engagement events for dispatches outside the report send cohort', async () => {
    dispatchFindLeanMock.mockResolvedValue([
      {
        dispatchId: 'dispatch-window',
        campaignKey: 'welcome_intro_athlete',
        campaignFamily: 'welcome',
        sendStatus: 'sent',
      },
    ]);
    analyticsFindLeanMock.mockResolvedValue([
      {
        eventType: 'email_opened',
        payload: {
          dispatchId: 'dispatch-window',
          campaignKey: 'welcome_intro_athlete',
          campaignFamily: 'welcome',
          emailOrigin: 'marketing',
        },
        metadata: {},
      },
      {
        eventType: 'link_clicked',
        payload: {
          dispatchId: 'dispatch-window',
          campaignKey: 'welcome_intro_athlete',
          campaignFamily: 'welcome',
          emailOrigin: 'marketing',
          normalizedUrl: 'https://example.com/current',
        },
        metadata: {},
      },
      {
        eventType: 'email_opened',
        payload: {
          dispatchId: 'dispatch-old',
          campaignKey: 'legacy_campaign',
          campaignFamily: 'legacy',
          emailOrigin: 'marketing',
        },
        metadata: {},
      },
      {
        eventType: 'link_clicked',
        payload: {
          dispatchId: 'dispatch-old',
          campaignKey: 'legacy_campaign',
          campaignFamily: 'legacy',
          emailOrigin: 'marketing',
          normalizedUrl: 'https://example.com/old',
        },
        metadata: {},
      },
    ]);

    const report = await generateMarketingEmailInsightsReport({
      reportType: 'weekly',
      periodStart: new Date('2026-06-14T00:00:00.000Z'),
      periodEnd: new Date('2026-06-21T00:00:00.000Z'),
      environment: 'production',
      persist: false,
    });

    expect(report.totals.sentCount).toBe(1);
    expect(report.totals.uniqueOpenedCount).toBe(1);
    expect(report.totals.uniqueClickedCount).toBe(1);
    expect(report.totals.openRate).toBe(100);
    expect(report.totals.clickThroughRate).toBe(100);
    expect(report.campaigns).toEqual([
      expect.objectContaining({
        campaignKey: 'welcome_intro_athlete',
        sentCount: 1,
        uniqueOpenedCount: 1,
        uniqueClickedCount: 1,
        openRate: 100,
        clickThroughRate: 100,
      }),
    ]);
    expect(report.topLinks).toEqual([{ url: 'https://example.com/current', clicks: 1 }]);
  });

  it('persists and sends the weekly report to the insights webhook target', async () => {
    dispatchFindLeanMock.mockResolvedValue([]);
    analyticsFindLeanMock.mockResolvedValue([]);

    const result = await runWeeklyMarketingEmailInsightsReport({
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

  it('formats the Slack report with multiline sections for readability', async () => {
    const report = await generateMarketingEmailInsightsReport({
      reportType: 'weekly',
      periodStart: new Date('2026-06-14T00:00:00.000Z'),
      periodEnd: new Date('2026-06-21T00:00:00.000Z'),
      environment: 'production',
      persist: false,
    });

    await sendMarketingEmailInsightsSlackReport({
      ...report,
      totals: {
        sentCount: 12,
        failedCount: 1,
        uniqueOpenedCount: 7,
        uniqueClickedCount: 3,
        openRate: 58.33,
        clickThroughRate: 25,
      },
      campaigns: [
        {
          campaignKey: 'welcome_intro_athlete',
          campaignFamily: 'welcome',
          attemptedCount: 12,
          sentCount: 12,
          failedCount: 1,
          openedCount: 7,
          uniqueOpenedCount: 7,
          clickedCount: 3,
          uniqueClickedCount: 3,
          openRate: 58.33,
          clickThroughRate: 25,
        },
      ],
      topLinks: [{ url: 'https://example.com/start', clicks: 3 }],
    });

    expect(sendSlackAlertMock).toHaveBeenCalledWith({
      target: 'insights',
      environment: 'production',
      severity: 'info',
      title: 'Weekly Email Insights',
      summary: [
        '*Reporting window*',
        '2026-06-14 to 2026-06-21',
        '',
        '*Coverage*',
        '• Campaigns: 1',
        '• Top links tracked: 1',
      ].join('\n'),
      fields: [
        {
          label: 'Totals',
          value: [
            '• Sent: 12',
            '• Failed: 1',
            '• Unique opens: 7',
            '• Unique clicks: 3',
            '• Open rate: 58.33%',
            '• CTR: 25%',
          ].join('\n'),
        },
        {
          label: 'welcome_intro_athlete',
          value: [
            '• Sent: 12',
            '• Failed: 1',
            '• Unique opens: 7',
            '• Unique clicks: 3',
            '• Open rate: 58.33%',
            '• CTR: 25%',
          ].join('\n'),
        },
        {
          label: 'Top Links',
          value: '1. 3 clicks - https://example.com/start',
        },
      ],
    });
  });

  it('rejects staging environment for weekly report runs', async () => {
    await expect(
      runWeeklyMarketingEmailInsightsReport({
        now: new Date('2026-06-21T12:00:00.000Z'),
        environment: 'staging',
      })
    ).rejects.toThrow('Marketing email insights reports can only run in production');

    expect(reportFindOneAndUpdateMock).not.toHaveBeenCalled();
    expect(sendSlackAlertMock).not.toHaveBeenCalled();
  });
});
