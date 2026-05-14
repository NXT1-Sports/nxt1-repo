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

## 2026-05-14 Follow-Up: Phased Major Upgrade Plan

> Added after broad safe update pass. Backend and web builds are green on the
> current lockfile; remaining outdated items are primarily major-version jumps.

### Phase 1 — Tooling-Only Majors (Low Runtime Risk)

- **Goal**: Upgrade developer tooling first with minimal production behavior
  impact.
- **Primary packages**:
  - `@commitlint/cli` `20.x` → `21.x`
  - `@commitlint/config-conventional` `20.x` → `21.x`
  - `cross-env` `7.x` → `10.x`
  - `jsdom` `28.x` → `29.x`
  - `prettier-plugin-tailwindcss` `0.7.x` → `0.8.x`
  - `shx` `0.3.x` → `0.4.x`
- **Validation**:
  - `npm run lint`
  - `npm run test`
  - `npm run build`

### Phase 2 — Runtime Backend Majors (Medium/High Risk)

- **Goal**: Upgrade backend/runtime dependencies in controlled batches.
- **Primary packages**:
  - `stripe` `20.x` → `22.x` (`backend`) and `17.x` → `22.x` (`apps/functions`)
  - `@stripe/stripe-js` `5.x` → `9.x` (`packages/ui`)
  - `express-rate-limit` `7.x` → `8.x`
  - `rate-limit-redis` `4.x` → `5.x`
  - `class-validator` `0.14.x` → `0.15.x`
  - `pdf-parse` `1.x` → `2.x`
  - `csv-parse` `5.x` → `6.x`
- **Likely code touchpoints**:
  - billing and webhook modules in `backend/src/modules/billing/`
  - scheduled invoice flow in `apps/functions/src/scheduled/`
  - middleware/rate-limit wiring in `backend/src/middleware/`
- **Validation**:
  - targeted backend vitest suites for agent + webhook modules
  - `npm run build --workspace=@nxt1/backend`
  - `npm run build --workspace=@nxt1/functions`

### Phase 3 — Tailwind v4 Migration (Highest Surface Area)

- **Goal**: Move design/build pipeline from `tailwindcss@3` to `4` across root,
  web, and mobile.
- **Scope**:
  - root `package.json`
  - `apps/web`
  - `apps/mobile`
  - shared styles and design tokens where utility behavior changed
- **Expected work**:
  - postcss/build config alignment for v4
  - utility/class compatibility audit
  - visual regression checks for landing + auth + shell pages
- **Validation**:
  - `npm run build --workspace=@nxt1/web`
  - `npm run build --workspace=@nxt1/mobile`
  - key UI smoke checks (desktop + mobile)

## Security Debt To Track

- **Current audit (prod deps only)**: `8 low` vulnerabilities
- **Primary chain**: `@tootallnate/once` via `teeny-request` /
  `@google-cloud/storage` / `firebase-admin`
- **Constraint**: `npm audit fix --force` currently proposes a breaking
  `firebase-admin` resolution path
- **Decision**: Keep as tracked low-severity debt until we schedule a dedicated
  Firebase admin/storage dependency alignment upgrade
