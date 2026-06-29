# Financial Insights Runbook

## Scope

This runbook covers weekly/monthly financial insights automation and manual
ad-hoc execution.

Report outputs include:

- Agent X cost (Helicone-verified)
- Stripe revenue
- Apple IAP revenue
- Gross margin amount and percent

## Prerequisites

- Backend and Functions deployed with current code.
- Valid `CRON_SECRET` configured in Functions and backend cron guard.
- Slack insights webhook configured:
  - `SLACK_INSIGHTS_WEBHOOK_URL`
  - optional `STAGING_SLACK_INSIGHTS_WEBHOOK_URL`

## Scheduled Jobs

- Weekly: Friday, 8:00 AM America/New_York
  - Function: `weeklyFinancialInsights`
  - Endpoint: `/api/v1/marketing/cron/financial-insights-weekly`
- Monthly: Day 1, 8:00 AM America/New_York
  - Function: `monthlyFinancialInsights`
  - Endpoint: `/api/v1/marketing/cron/financial-insights-monthly`

## Manual Trigger (ad-hoc date range)

Endpoint:

- `POST /api/v1/marketing/cron/financial-insights-ad-hoc`

Example:

```bash
curl -X POST "https://api.nxt1sports.com/api/v1/marketing/cron/financial-insights-ad-hoc" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{
    "reportType": "weekly",
    "periodStart": "2026-06-01T00:00:00.000Z",
    "periodEnd": "2026-06-08T00:00:00.000Z",
    "persist": true,
    "sendSlack": true
  }'
```

### Notes

- Set `persist=false` to avoid writing snapshot records.
- Set `sendSlack=false` to compute only.

## Manual Preview (no persistence, no Slack)

Endpoint:

- `POST /api/v1/marketing/cron/financial-insights-preview`

Example:

```bash
curl -X POST "https://api.nxt1sports.com/api/v1/marketing/cron/financial-insights-preview" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $CRON_SECRET" \
  -d '{
    "reportType": "monthly",
    "periodStart": "2026-05-01T00:00:00.000Z",
    "periodEnd": "2026-06-01T00:00:00.000Z"
  }'
```

## Validation Checklist

1. HTTP response `success=true`.
2. Slack message appears in insights channel when `sendSlack=true`.
3. Snapshot exists in `financialInsightsReports` when `persist=true`.
4. Totals reconcile with source data for the same time window:
   - usageevents with `metadata.heliconeVerifiedCostCents`
   - paymentlogs split by `type === 'apple_iap'` vs others

## Troubleshooting

### 400 invalid range

- Ensure ISO strings are valid.
- Ensure `periodStart < periodEnd`.
- Ensure range <= 366 days.

### Slack not delivered

- Verify insights webhook env vars.
- Check backend logs for `sendSlackAlert` errors and fallback attempts.

### Unexpected low cost totals

- Cost only includes usage events with Helicone-verified cost metadata.
- Check webhook reconciliation pipeline for missing metadata writes.

### Revenue mismatch

- Confirm payment status is `PAID` or `REFUNDED`.
- Refunds reduce net via `amountRefunded`.

## Rollback

If a bad run was persisted:

1. Re-run ad-hoc with corrected window and `persist=true` (upsert by period
   window).
2. If needed, delete incorrect snapshot row from `financialInsightsReports`.
3. Re-run with `sendSlack=true` for corrected Slack output.
