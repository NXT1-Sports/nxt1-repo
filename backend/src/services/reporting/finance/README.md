# Financial Reporting Service Domain

This folder owns backend financial insight reporting for Agent X cost vs
revenue.

## Purpose

- Aggregate reconciled Agent X cost from usage events.
- Aggregate recognized revenue from Stripe and Apple IAP payment logs.
- Calculate gross margin metrics for weekly and monthly reporting windows.
- Persist snapshots for audit/history.

## Data Sources

- Cost source: `usageevents` via `UsageEventModel`
  - precedence:
    - `metadata.chargeBreakdown[].chargeAmountCents`
    - `unitCostSnapshot * quantity`
    - legacy fallback: `metadata.heliconeVerifiedCostCents`
- Revenue source: `paymentlogs` via `PaymentLogModel`
  - Stripe rows: payment logs where `type !== 'apple_iap'`
  - Apple rows: payment logs where `type === 'apple_iap'`
  - Net calculation: `amountPaid - amountRefunded` (with refunded fallback
    behavior)

## Route Endpoints

Defined in `backend/src/routes/marketing/cron.routes.ts`.

- `POST /api/v1/marketing/cron/financial-insights-weekly`
  - currently disabled
- `POST /api/v1/marketing/cron/financial-insights-monthly`
  - currently disabled
- `POST /api/v1/marketing/cron/financial-insights-ad-hoc`
  - currently disabled
- `POST /api/v1/marketing/cron/financial-insights-preview`
  - currently disabled

## Scheduler Entries

Defined in `apps/functions/src/scheduled/`:

- `weeklyFinancialInsights.ts`
- `monthlyFinancialInsights.ts`

Both are currently disabled no-op entrypoints.

## Testing

No active unit tests remain for this disabled module.
