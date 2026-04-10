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

## Angular 21.1 → 21.2 (Coordinated Bump)

- **Closed PRs**: #28 (`@angular/core`), #31 (`@angular/compiler`), #26
  (`@angular/ssr`)
- **Why manual**: Dependabot bumps each package individually, but Angular
  requires all packages at the same version. Bumping one alone creates peer
  dependency mismatches.
- **Packages to bump together**:
  - `@angular/core` 21.1.4 → 21.2.x
  - `@angular/compiler` 21.1.4 → 21.2.x
  - `@angular/compiler-cli` → 21.2.x
  - `@angular/ssr` 21.1.4 → 21.2.x
  - `@angular/platform-browser` → 21.2.x
  - `@angular/platform-server` → 21.2.x
  - `@angular/router` → 21.2.x
  - `@angular/forms` → 21.2.x
  - `@angular/common` → 21.2.x
  - `@angular-devkit/build-angular` → matching version
- **Strategy**: Single PR bumping all Angular packages at once

## ESLint 9 → 10

- **Closed PR**: #49 (`@eslint/js` 9→10)
- **Why manual**: `@eslint/js@10` requires `eslint@10` peer dependency. Current
  project uses eslint 9.
- **Scope**: Root `package.json`, `eslint.config.mjs`, potentially config
  changes
- **Strategy**: Upgrade `eslint` + `@eslint/js` + `typescript-eslint` together,
  update config if needed
