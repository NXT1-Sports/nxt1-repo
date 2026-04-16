# Billing System — NXT1 Backend

**Last updated:** 2026-03-27  
**Module path:** `backend/src/modules/billing/`  
**Routes path:** `backend/src/routes/billing.routes.ts`,
`backend/src/routes/iap.routes.ts`

---

## Overview

The billing system handles two distinct payment models depending on user type:

| User Type           | Payment Model                              | Gateway                            |
| ------------------- | ------------------------------------------ | ---------------------------------- |
| Individual          | Prepaid wallet — top up first, spend later | Apple In-App Purchase (StoreKit 2) |
| Team / Organization | Postpaid — invoice at end of month         | Stripe                             |

Cost tracking is done via **Helicone.ai**, which measures actual AI token usage
per job. The final charge is `actual_cost × multiplier`, where the multiplier is
a configurable value stored in Firestore.

---

## Architecture Flow

```
[Mobile iOS] → StoreKit 2 purchase
    → POST /api/v1/iap/verify-receipt
    → verify JWS signature (Apple root CAs)
    → addWalletTopUp() → Firestore BillingContexts.walletBalanceCents

[User triggers AI job]
    → estimateMaxCost() ← Gas-station pre-auth (worst-case estimate)
    → checkBudget() / checkSufficientBalance()  ← gate before running using estimate
    → AI calls tagged with buildHeliconeHeaders({ jobId, userId, feature })
    → job completes / stream aborts
    → (wallet is tentatively deducted based on pre-auth estimate)

[Helicone async webhook]
    → POST /api/v1/helicone/webhook (async)
    → verify HMAC signature
    → resolveAICost() ← applies margin to true cost (actual_cost × multiplier)
    → true-up / true-down ledger adjustment (refund unused pre-auth)

[Apple sends REFUND webhook]
    → POST /api/v1/iap/webhook
    → verify signed payload
    → processWalletRefund() ← capped deduction, no negative balance
```

---

## Services

### 1. `budget.service.ts`

**Purpose:** Core budget management for all user types. Acts as the single gate
before any AI feature runs, and the single recorder of spend after a feature
completes.

Manages a hierarchical budget structure:

- **Organization** → master budget (e.g. a high school)
- **Team** → sub-allocation within an org
- **Individual** → personal prepaid wallet

| Function                    | Signature                                              | Description                                                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getBillingContext`         | `(db, userId) → BillingContext \| null`                | Fetch the billing context document for a user. Returns `null` if none exists.                                                                                                                      |
| `getOrCreateBillingContext` | `(db, userId) → BillingContext`                        | Get or lazily create a billing context. Safe to call concurrently.                                                                                                                                 |
| `checkBudget`               | `(db, userId, costCents, teamId?) → BudgetCheckResult` | **Main gate.** Check if a user/team has sufficient budget before running a task. Returns `{ allowed, reason, currentSpend, budget, percentUsed }`. Returns HTTP 402 if over budget.                |
| `checkWalletBudget`         | `(ctx, costCents) → BudgetCheckResult`                 | Internal — for Individual users: checks `walletBalanceCents` instead of monthly spend vs budget.                                                                                                   |
| `recordSpend`               | `(db, userId, costCents, teamId?) → void`              | Record the actual spend after a task completes. Increments both team sub-allocation and org master budget simultaneously.                                                                          |
| `deductWallet`              | `(db, userId, costCents) → void`                       | **Internal.** Atomically deducts from `walletBalanceCents` using a Firestore transaction. Throws if balance would go negative. Sends low-balance push notification when balance drops below $2.00. |
| `processWalletRefund`       | `(db, userId, amountCents) → void`                     | Deduct wallet funds because Apple issued a refund. Caps deduction at current balance — wallet can never go below zero. No-op if billing context is missing.                                        |
| `addWalletTopUp`            | `(db, userId, amountCents) → { newBalance }`           | Credit the wallet after a verified Apple IAP purchase. Atomically increments `walletBalanceCents`. Resets low-balance notification flag.                                                           |
| `updateBudget`              | `(db, userId, monthlyBudget) → void`                   | Update the monthly budget for an Individual user.                                                                                                                                                  |
| `updateTeamBudget`          | `(db, teamId, monthlyBudget) → void`                   | Update a team's monthly sub-allocation budget.                                                                                                                                                     |
| `updateOrgBudget`           | `(db, orgId, monthlyBudget) → void`                    | Update an organization's master monthly budget.                                                                                                                                                    |
| `updateTeamAllocation`      | `(db, teamId, orgId, monthlyLimit) → void`             | Set a specific monthly spend limit for a team within an org.                                                                                                                                       |

**Firestore collections used:**

- `BillingContexts` — per-user billing state (`walletBalanceCents`,
  `currentPeriodSpend`, `monthlyBudget`, `paymentProvider`)

---

### 2. `wallet.service.ts`

**Purpose:** Manages the **prepaid wallet** stored in a dedicated Firestore
collection (`wallets`). Provides a clean interface for top-up, deduct, check
balance, and refund operations — all using Firestore transactions for atomicity.

> Note: `budget.service.ts` also manages `walletBalanceCents` on
> `BillingContexts`. `wallet.service.ts` manages a parallel, lightweight
> `wallets` collection. Both are in sync via `iap.routes.ts` calling
> `addWalletTopUp()` from `budget.service.ts`.

| Function                 | Signature                                                       | Description                                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getWalletBalance`       | `(db, userId) → number`                                         | Returns current balance in cents. Returns `0` if no wallet document exists yet.                                                                                                                                                   |
| `checkSufficientBalance` | `(db, userId, requiredCents) → { balanceCents, sufficient }`    | Check if a user can afford a given cost. Returns both the current balance and a boolean flag. Use this before starting a job.                                                                                                     |
| `topUpWallet`            | `(db, userId, amountCents, idempotencyKey) → WalletTopUpResult` | Add funds to the wallet. Uses the Apple `transactionId` as `idempotencyKey` — if this key was already used, the function returns the current balance without double-crediting. All operations run inside a Firestore transaction. |
| `deductFromWallet`       | `(db, userId, amountCents, jobId) → WalletDeductResult`         | Subtract funds after a job completes. Fails gracefully (returns `success: false`) if balance is insufficient — does not throw. The `jobId` is stored for audit trail.                                                             |
| `refundWallet`           | `(db, userId, amountCents, reason) → WalletTopUpResult`         | Credit back funds for a refund. Logs the refund to the `walletRefunds` collection with the reason string.                                                                                                                         |

**Firestore collections used:**

- `wallets` — document key = `userId`, fields: `balanceCents`, `createdAt`,
  `updatedAt`
- `iapLogs` — idempotency log keyed by Apple `transactionId`
- `walletRefunds` — audit log for all refunds

---

### 3. `helicone.service.ts`

**Purpose:** Connects to [Helicone.ai](https://helicone.ai) to retrieve actual
AI inference costs per job. Every AI call must include the headers from
`buildHeliconeHeaders()` so costs can be queried by `jobId` after the job
finishes.

| Function               | Signature                                                       | Description                                                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getJobCost`           | `(jobId) → HeliconeJobCostResult`                               | Fetch total actual cost (USD) for all AI requests tagged with this `jobId`. Queries the Helicone API `POST /v1/request/query`. If the API is down or returns an error, returns `{ totalCostUsd: 0, source: 'fallback' }` — callers must handle the fallback case. |
| `getUserCostByPeriod`  | `(userId, startDate, endDate) → { totalCostUsd, requestCount }` | Aggregate all AI costs for a user within a date range. Useful for monthly billing reconciliation or analytics dashboards.                                                                                                                                         |
| `buildHeliconeHeaders` | `(params: { jobId, userId, feature }) → Record<string, string>` | Returns the HTTP headers to attach to every AI SDK call so Helicone can tag and group the request. Returns an empty object if `HELICONE_API_KEY` is not set (graceful degradation).                                                                               |

**Headers generated by `buildHeliconeHeaders`:**

```
Helicone-Auth: Bearer <HELICONE_API_KEY>
Helicone-Property-Job-Id: <jobId>
Helicone-Property-User-Id: <userId>
Helicone-Property-Feature: <feature>
```

**Required environment variable:**

```
HELICONE_API_KEY=<from helicone.ai → Settings → API Keys>
```

> ⚠️ **Pending:** `buildHeliconeHeaders()` must be wired into
> `telemetry.service.ts` so all AI calls are automatically tagged. Without this,
> `getJobCost()` will always return 0.

---

### 4. `pricing.service.ts`

**Purpose:** Calculates the final amount to charge a user based on the actual AI
cost (from Helicone) multiplied by a configurable margin multiplier. The
multiplier can be updated at runtime via admin API — no code deploy needed.

| Function                   | Signature                                                                  | Description                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPricingConfig`         | `(db) → PricingConfig`                                                     | Read the multiplier config from Firestore. Results are cached in memory for 5 minutes to avoid repeated Firestore reads on every request. Falls back to `{ defaultMultiplier: 3.0 }` if document doesn't exist.                  |
| `updatePricingConfig`      | `(db, updates) → void`                                                     | Update `defaultMultiplier` or `featureOverrides` in Firestore. Invalidates the in-memory cache immediately. Used by the admin API `PUT /api/v1/billing/pricing`.                                                                 |
| `calculateChargeAmount`    | `(db, actualCostUsd, feature) → ChargeCalculation`                         | Main pricing function. Reads the multiplier (feature-specific override first, then default), computes `charge = actualCostUsd × multiplier`, and rounds up to the nearest cent to protect margin. Returns full breakdown object. |
| `estimateChargeAmountSync` | `(estimatedCostUsd, multiplier?) → { chargeAmountUsd, chargeAmountCents }` | Synchronous estimate — no DB read. Used for pre-task budget gates where latency matters and exact cost isn't available yet. Defaults to `3.0×` multiplier.                                                                       |

**Pricing config in Firestore** (`PricingConfig/default`):

```json
{
  "defaultMultiplier": 3.0,
  "featureOverrides": {
    "scout-report": 4.0,
    "highlights": 3.5
  }
}
```

**Example calculation:**

```
Helicone reports job cost: $0.20
Feature: "scout-report" → multiplier = 4.0
charge = $0.20 × 4.0 = $0.80 → 80 cents deducted from wallet
```

---

### 5. `cost-resolver.service.ts`

**Purpose:** Bridges AI provider costs (OpenRouter / Helicone) to NXT1 business
pricing. It takes actual raw `costUsd` from the provider, applies the business
margin multiplier, and converts it to integer cents.

| Function          | Signature                                       | Description                                                                                                                                                                               |
| ----------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveAICost`   | `(db, actualCostUsd, feature) → CostResolution` | Main pricing function. Takes the raw provider wholesale cost, applies the configured `aiMarginMultiplier` (with feature overrides), and returns the final integer cents amount to charge. |
| `estimateMaxCost` | `(feature, model?) → number (cents)`            | Gas-Station Pre-Auth: Provides a worst-case ceiling cost before the LLM fires, preventing over-spend on prepaid balances.                                                                 |

---

### 6. `platform-config.service.ts`

**Purpose:** Dynamically cached platform configuration stored in Firestore.
Allows changing pricing, multipliers, and model mappings without deploying code
changes.

| Function                | Signature                      | Description                                                                                                                                         |
| ----------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getPlatformConfig`     | `(db) → PlatformBillingConfig` | Reads the config from the `platformConfig/billing` document, cached in memory (default 5-minute TTL). Fallbacks are hardcoded if the DB is missing. |
| `invalidateConfigCache` | `() → void`                    | Clears the in-memory cache, forcing the next call to fetch the latest from Firestore.                                                               |

---

### 7. `helicone-webhook.service.ts`

**Purpose:** Handles async cost reconciliation from Helicone's webhook
callbacks. When an AI operation completes, Helicone sends the exact downstream
cost. This service ensures users are automatically refunded if an AI request
aborts early or errors out.

| Function         | Signature              | Description                                                                                                                                                                                                       |
| ---------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `processWebhook` | `(db, payload) → void` | Parses the Helicone request callback schema, calls `resolveAICost()` on the exact downstream `costUsd`, compares it against the initial pre-auth amount, and issues a "true-up" or "true-down" ledger adjustment. |

---

### 8. `usage.service.ts`

**Purpose:** Creates and tracks `UsageEvents` in Firestore. Every billable
action generates a usage event that goes through a state machine
(`PENDING → PROCESSING → SENT / FAILED`) and is forwarded to Stripe async via
Pub/Sub.

| Function                 | Signature                            | Description                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `generateIdempotencyKey` | `(userId, feature, jobId) → string`  | Generates a SHA-256 hash of `userId:feature:jobId`. Used to deduplicate billing events — the same job can never be billed twice.                                                                                   |
| `checkUsageEventExists`  | `(db, idempotencyKey) → boolean`     | Look up a usage event by idempotency key. Returns `true` if already processed.                                                                                                                                     |
| `recordUsageEvent`       | `(db, input, environment) → eventId` | Create and persist a new usage event. Checks idempotency first — if the event exists, returns the existing ID without creating a duplicate. Publishes to Pub/Sub topic `usage-events` for async Stripe processing. |
| `getUserUsageEvents`     | `(db, userId, limit) → UsageEvent[]` | Fetch the latest usage events for a user, ordered by creation time descending.                                                                                                                                     |
| `getTeamUsageEvents`     | `(db, teamId, limit) → UsageEvent[]` | Fetch usage events for a team.                                                                                                                                                                                     |

**Firestore collection:** `UsageEvents`  
**Pub/Sub topic:** `usage-events`

---

### 6. `stripe.service.ts`

**Purpose:** Stripe API integration for Team / Organization postpaid billing.
Manages customer records and invoice creation. Individual users do not touch
this service.

| Function              | Signature                                                                  | Description                                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getStripeClient`     | `(environment) → Stripe`                                                   | Returns a cached Stripe client for the given environment. Throws if keys are not configured. Includes a safety check that prevents live keys from being used outside production. |
| `getOrCreateCustomer` | `(db, userId, email, teamId, environment) → { customerId, isNew }`         | Look up the Stripe customer in Firestore cache. If not found, create a new Stripe customer and persist to cache. Keyed by `userId + environment`.                                |
| `attachPaymentMethod` | `(customerId, paymentMethodId, environment) → void`                        | Attach a payment method to a Stripe customer and set it as the default.                                                                                                          |
| `createInvoiceItem`   | `(customerId, amount, description, environment) → CreateInvoiceItemResult` | Add a line item to the customer's pending Stripe invoice.                                                                                                                        |
| `generateInvoice`     | `(customerId, environment) → GenerateInvoiceResult`                        | Finalize and send the Stripe invoice. Triggers `invoice.finalized` webhook.                                                                                                      |

**Firestore collection:** `StripeCustomers`

---

### 7. `webhook.service.ts`

**Purpose:** Handles Stripe server-to-server webhook events. Validates the
signature, routes events to the correct handler, and persists raw event data for
audit.

| Function                 | Signature                                          | Description                                                                                                                                   |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `verifyWebhookSignature` | `(payload, signature, environment) → Stripe.Event` | Use `stripe.webhooks.constructEvent()` to verify the `Stripe-Signature` header. Throws if the signature is invalid — prevents replay attacks. |
| `handleInvoiceFinalized` | `(db, invoice, environment) → void`                | Called when Stripe finalizes an invoice. Logs to `PaymentLogs` collection.                                                                    |
| `handlePaymentSucceeded` | `(db, invoice, environment) → void`                | Called when payment is collected. Updates billing status and sends notification to user.                                                      |
| `handlePaymentFailed`    | `(db, invoice, environment) → void`                | Called when payment fails. Logs failure and sends alert to org admin.                                                                         |

**Firestore collection:** `PaymentLogs`  
**Stripe events handled:** `invoice.finalized`, `invoice.payment_succeeded`,
`invoice.payment_failed`

---

### 8. `config.ts`

**Purpose:** Central configuration — Firestore collection names, Stripe
environment setup, price ID mapping, and retry policy.

| Export                                   | Description                                                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `COLLECTIONS`                            | Object with all Firestore collection name constants (`BILLING_CONTEXTS`, `USAGE_EVENTS`, `STRIPE_CUSTOMERS`, `PAYMENT_LOGS`)       |
| `getStripeConfig(environment)`           | Returns Stripe keys and price IDs for staging or production. Validates that live keys are not used in non-production environments. |
| `getStripePriceId(feature, environment)` | Maps a `UsageFeature` enum value to its Stripe Price ID.                                                                           |
| `getUnitCost(feature)`                   | Returns hardcoded cents cost for a feature (legacy — gradually replaced by Helicone actual cost).                                  |
| `RETRY_CONFIG`                           | `{ maxRetries: 5, backoffMultiplier: 2, maxBackoffMs: 60000 }`                                                                     |

---

## Routes

### `billing.routes.ts`

| Method | Path                                             | Auth                    | Description                                                                                                                           |
| ------ | ------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/billing/usage`                          | `appGuard`              | Record a usage event. Runs `checkBudget()` first — returns `402` if over budget. Then calls `recordUsageEvent()` and `recordSpend()`. |
| `GET`  | `/api/v1/billing/usage/me`                       | `appGuard`              | Get the current user's last N usage events.                                                                                           |
| `GET`  | `/api/v1/billing/usage/team/:teamId`             | `appGuard`              | Get usage events for a team (team members only).                                                                                      |
| `GET`  | `/api/v1/billing/budget`                         | `appGuard`              | Get the current user's billing context (budget, spend, balance).                                                                      |
| `PUT`  | `/api/v1/billing/budget`                         | `appGuard`              | Update the current user's monthly budget.                                                                                             |
| `PUT`  | `/api/v1/billing/budget/team/:teamId`            | `appGuard` (team admin) | Update a team's monthly budget.                                                                                                       |
| `PUT`  | `/api/v1/billing/budget/org/:orgId`              | `appGuard` (org admin)  | Update an organization's master budget.                                                                                               |
| `PUT`  | `/api/v1/billing/budget/org/:orgId/team/:teamId` | `appGuard` (org admin)  | Set a team's spending sub-limit within an org.                                                                                        |
| `GET`  | `/api/v1/billing/budget/org/:orgId/allocations`  | `appGuard` (org admin)  | List all team allocations for an org.                                                                                                 |
| `GET`  | `/api/v1/billing/wallet`                         | `appGuard`              | Get the current user's wallet balance.                                                                                                |
| `GET`  | `/api/v1/billing/wallet/check?estimatedCents=N`  | `appGuard`              | Check if the user has enough balance for an estimated cost.                                                                           |
| `GET`  | `/api/v1/billing/pricing`                        | `appGuard`              | Get the current pricing config (multipliers).                                                                                         |
| `PUT`  | `/api/v1/billing/pricing`                        | `appGuard` (admin)      | Update the default multiplier or feature overrides.                                                                                   |

---

### `iap.routes.ts`

| Method | Path                         | Auth             | Description                                                                                                                                                                                                                                                  |
| ------ | ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/api/v1/iap/verify-receipt` | `appGuard`       | Called by iOS app after a StoreKit 2 purchase. Body: `{ jwsTransaction: string }`. Verifies the JWS signature with Apple root CAs, maps `productId` to cents, guards against replay via `iap_processed_transactions`, credits wallet via `addWalletTopUp()`. |
| `POST` | `/api/v1/iap/webhook`        | none (Apple S2S) | Apple App Store Server Notifications V2. Verifies the signed payload, handles `REFUND` events by calling `processWalletRefund()`. Always returns `200` to prevent Apple retry storms.                                                                        |

**Product ID mapping** (defined in `iap.routes.ts`):

| Product ID         | Amount              |
| ------------------ | ------------------- |
| `nxt1.wallet.100`  | $1.00 (100 cents)   |
| `nxt1.wallet.500`  | $5.00 (500 cents)   |
| `nxt1.wallet.1000` | $10.00 (1000 cents) |
| `nxt1.wallet.2500` | $25.00 (2500 cents) |
| `nxt1.wallet.5000` | $50.00 (5000 cents) |

---

## Environment Variables

| Variable                 | Used by               | Status                          |
| ------------------------ | --------------------- | ------------------------------- |
| `APPLE_BUNDLE_ID`        | `iap.routes.ts`       | ✅ set (`com.nxt1sports.nxt1`)  |
| `APPLE_APP_ID`           | `iap.routes.ts`       | ✅ set (`6446410344`)           |
| `APPLE_SHARED_SECRET`    | fallback              | ✅ set                          |
| `HELICONE_API_KEY`       | `helicone.service.ts` | ⚠️ placeholder — needs real key |
| `STRIPE_SECRET_KEY`      | `stripe.service.ts`   | ✅ production                   |
| `STRIPE_TEST_SECRET_KEY` | `stripe.service.ts`   | ✅ staging                      |
| `STRIPE_WEBHOOK_SECRET`  | `webhook.service.ts`  | ✅ set                          |

---

## Firestore Collections Summary

| Collection                   | Key                   | Purpose                                                                 |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------- |
| `BillingContexts`            | `userId`              | Central billing state (budget, spend, wallet balance, payment provider) |
| `wallets`                    | `userId`              | Lightweight wallet balance (used by `wallet.service.ts`)                |
| `UsageEvents`                | auto-id               | All billable usage events with state machine                            |
| `StripeCustomers`            | auto-id               | Stripe customer ID cache per user/environment                           |
| `PaymentLogs`                | auto-id               | Raw Stripe webhook event data                                           |
| `iap_processed_transactions` | Apple `transactionId` | Idempotency guard for IAP receipts                                      |
| `iapLogs`                    | Apple `transactionId` | Idempotency guard used by `wallet.service.ts`                           |
| `walletRefunds`              | auto-id               | Audit log of all wallet refunds                                         |
| `PricingConfig`              | `default`             | Multiplier config (`defaultMultiplier`, `featureOverrides`)             |

---

## Known Gaps / Pending Work

| Item                                                                  | Priority | Status         |
| --------------------------------------------------------------------- | -------- | -------------- |
| Fill `HELICONE_API_KEY` in `.env`                                     | P0       | ⚠️ Pending     |
| Create 5 Consumable products in App Store Connect                     | P0       | ⏳ Needs login |
| Register webhook URL in App Store Connect                             | P0       | ⏳ Needs login |
| Atomic batch: `deductFromWallet` + `createUsageEvent` + `recordSpend` | P1       | ❌ Not done    |
| Stripe refund flow for Org users                                      | P2       | ❌ Not done    |
| Low-balance push notification for Individual (< $1.00)                | P2       | ❌ Not done    |
