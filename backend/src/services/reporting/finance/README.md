# Financial Reporting Service Domain

This folder owns backend financial insight reporting for Agent X cost vs
revenue.

## Purpose

- Aggregate reconciled Agent X cost from usage events.
- Aggregate recognized revenue from Stripe and Apple IAP payment logs.
- Calculate gross margin metrics for weekly and monthly reporting windows.
- Persist snapshots for audit/history.
- Send summary reports to Slack insights channel.

## Data Sources

- Cost source: `usageevents` via `UsageEventModel`
  - field: `metadata.heliconeVerifiedCostCents`
- Revenue source: `paymentlogs` via `PaymentLogModel`
  - Stripe rows: payment logs where `type !== 'apple_iap'`
  - Apple rows: payment logs where `type === 'apple_iap'`
  - Net calculation: `amountPaid - amountRefunded` (with refunded fallback
    behavior)

## Core Service

- File: `financial-insights-report.service.ts`
- Main exports:
  - `generateFinancialInsightsReport(...)`
  - `sendFinancialInsightsSlackReport(...)`
  - `runWeeklyFinancialInsightsReport(...)`
  - `runMonthlyFinancialInsightsReport(...)`
  - `buildWeeklyFinancialInsightsWindow(...)`
  - `buildPreviousMonthFinancialInsightsWindow(...)`

## Route Endpoints

Defined in `backend/src/routes/marketing/cron.routes.ts`.

- `POST /api/v1/marketing/cron/financial-insights-weekly`
  - scheduled weekly run (Friday 8:00 AM ET)
- `POST /api/v1/marketing/cron/financial-insights-monthly`
  - scheduled monthly run (day 1, 8:00 AM ET)
- `POST /api/v1/marketing/cron/financial-insights-ad-hoc`
  - manual date-range run with optional persistence/slack send
- `POST /api/v1/marketing/cron/financial-insights-preview`
  - manual date-range preview only (no persistence, no Slack)

### Ad-hoc request body

```json
{
  "reportType": "weekly",
  "periodStart": "2026-06-01T00:00:00.000Z",
  "periodEnd": "2026-06-08T00:00:00.000Z",
  "persist": true,
  "sendSlack": true
}
```

Constraints:

- `reportType` must be `weekly` or `monthly`.
- `periodStart` and `periodEnd` must be valid ISO date strings.
- `periodStart` must be before `periodEnd`.
- Max range is 366 days.

## Scheduler Entries

Defined in `apps/functions/src/scheduled/`:

- `weeklyFinancialInsights.ts`
- `monthlyFinancialInsights.ts`

Both call backend cron endpoints via `postBackendCronJson` and `CRON_SECRET`.

## Slack Target

- Uses existing insights route:
  - `sendSlackAlert({ target: 'insights', ... })`
- Existing webhook env keys are reused:
  - `SLACK_INSIGHTS_WEBHOOK_URL`
  - `STAGING_SLACK_INSIGHTS_WEBHOOK_URL`

## Testing

- Unit tests:
  - `backend/src/services/reporting/finance/__tests__/financial-insights-report.service.spec.ts`
