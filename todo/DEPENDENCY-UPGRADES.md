# Pending Manual Dependency Upgrades

> Dependabot PRs closed on 2026-04-09 — these require coordinated manual
> upgrades.

## Stripe SDK (v17/v20 → v22)

- **Closed PR**: #45
- **Scope**: `backend/` (v20→v22) + `apps/functions/` (v17→v22)
- **Why manual**: 5-major-version jump for functions, 2-major for backend
- **Breaking changes**:
  - v18: Removed Invoice fields, `price` → `pricing` on
    `InvoiceItemCreateParams`
  - v21: Introduced `Stripe.Decimal` type for decimal_string fields
  - v22: Restructured TypeScript types (moved from `/types/` to inline `.ts`
    files), changed CJS entry point
- **Files to update**:
  - `backend/src/modules/billing/stripe.service.ts` (apiVersion
    `2026-02-25.clover`)
  - `apps/functions/src/scheduled/monthlyOrgInvoice.ts` (apiVersion
    `2026-01-28.clover`, has type cast)
  - `backend/src/modules/billing/webhook.service.ts`
- **Strategy**: Staged upgrade — v17→v18→v20→v22 for functions, v20→v22 for
  backend
