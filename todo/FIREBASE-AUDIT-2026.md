# TODO: Firebase Audit 2026

**Status:** Audit Complete, Remediation Required

## Context

This audit covers the monorepo Firebase setup only, using Firebase MCP against
the `nxt-1-staging-v2` Firestore database on April 12, 2026. MongoDB was not
part of this review.

The goal is to convert the current Firestore setup into a production-safe,
grade-A foundation before launch by fixing schema drift, security gaps, write
path inconsistencies, and stale data patterns.

## Executive Summary

The overall architecture direction is good. The strongest parts are the billing
entity model, the agent job lifecycle, the `org:` billing identity pattern, the
v3 user schema, and the claim flow for organizations.

The highest-risk problems are operational discipline issues, not product-model
issues:

- Timestamps are inconsistent across collections and often stored as strings
  instead of native Firestore timestamps.
- Several collections that will need compound filtering do not yet have
  composite indexes.

## What Is Working Well

- **Billing model:** the normalized billing collections already support
  individual and organization billing, budget caps, threshold notifications, and
  dual payment rails.
- **Usage billing detail:** `UsageEvents` stores raw provider cost, idempotency,
  retries, and cost snapshots.
- **Agent job structure:** `AgentJobs` has operation IDs, progress state, result
  payloads, and lifecycle timestamps.
- **Wallet linkage:** `WalletHolds.jobId` links directly to agent jobs.
- **Organization claim flow:** `isClaimed` is the correct pattern for
  auto-created records.
- **Search normalization:** fields like `nameLower` show the right Firestore
  search strategy.
- **User schema direction:** the v3 user structure supports provenance and
  verification well.

## Remaining Critical Fixes

### 1. Normalize timestamps everywhere

- [ ] Replace string ISO timestamps with native Firestore `Timestamp` values in
      all write paths.
- [ ] Audit `Users`, `Teams`, `Organizations`, `Rankings`, `BillingPreferences`,
      `PeriodLedgers`, `Wallets`, `AgentJobs`, and `PricingConfig` for
      string-based timestamps.
- [ ] Migrate existing staging documents so `createdAt`, `updatedAt`,
      `completedAt`, `resolvedAt`, and any TTL field are stored as native
      timestamps.
- [ ] Standardize on backend helpers so future writes cannot regress to string
      dates.

## High-Priority Fixes

### 3. Standardize `UsageEvents.metadata`

- [ ] Define one canonical metadata schema for usage events.
- [ ] Normalize agent-related fields such as `agent`, `model`, `agentTools`,
      `threadId`, and `operationId`.
- [ ] Backfill or version metadata where older records use a different shape.

### 4. Resolve user schema drift

- [ ] Decide whether all v2 `Users` documents will be migrated to v3 or
      permanently supported through a compatibility layer.
- [ ] Write a migration plan for sparse v2 user records.
- [ ] Add validation at write time so new users cannot be created in the old
      shape.

### 5. Standardize empty values

- [ ] Pick one representation for unset optional fields: `null` or omitted.
- [ ] Remove mixed usage of empty strings, `null`, and missing fields for the
      same semantic meaning.
- [ ] Apply this rule first to `Teams`, `Organizations`, and billing-related
      collections.

### 6. Add missing composite indexes

- [x] Review the current `firestore.indexes.json` against actual API query
      patterns instead of waiting for console-generated failures.
- [x] Add the confirmed missing composite indexes for `Teams` (`organizationId`,
      `sport`, `isActive`) and `RosterEntries` (`userId`, `teamId`, `status`).
- [ ] Add any additional composite indexes still required by real query
      patterns, especially conditional timeline and roster filters if they are
      exercised in production.

### 7. Add expiry and cleanup for wallet holds

- [ ] Add `expiresAt` as a native Firestore timestamp on `WalletHolds`.
- [ ] Configure a TTL policy for stale unreleased holds.
- [ ] Add monitoring for holds that do not transition out of pending or held
      states within the expected time window.

## Medium-Priority Cleanup

### 11. Unify collection naming conventions

- [ ] Choose a single Firestore collection naming convention.
- [ ] Document whether the platform standard is PascalCase or camelCase.
- [ ] Plan a safe migration for inconsistent names such as `AgentJobs`,
      `BillingPreferences`, `PeriodLedgers`, `UsageEvents`, and `WalletHolds` if
      standardization is required.

### 12. Enforce team slug consistency

- [ ] Ensure every Team write path produces a valid `slug` when needed for
      routing or lookup.
- [ ] Audit existing Team docs for missing slugs.

### 13. Isolate seeded or fake staging data

- [ ] Mark seeded data explicitly with a field such as `isSeed`.
- [ ] Keep staging analytics and validation runs from mixing real and seeded
      records.
- [ ] Audit any `seed_*` IDs that may still be flowing into linked documents
      like `Posts`.

### 14. Clean up ownership skeletons for organizations

- [ ] Prevent scraped or auto-created organizations from looking owned when
      `createdBy` and `ownerId` are empty.
- [ ] Define claim-state semantics clearly for empty ownership fields.
- [ ] Replace flat `admins[]` arrays with a safer long-term ownership and role
      model if organization admin membership is still evolving.

## Database Configuration Fixes

- [ ] Enable delete protection before production.
- [ ] Enable PITR before production.
- [ ] Re-evaluate whether pessimistic concurrency is still the right choice for
      your write profile.
- [ ] Increase operational safety so staging habits match production standards.

## Collections Reviewed In This Audit

- `Users`
- `BillingPreferences`
- `PeriodLedgers`
- `Wallets`
- `AgentJobs`
- `PricingConfig`
- `StripeCustomers`
- `Posts`
- `Organizations`
- `WalletHolds`
- `Teams`
- `Rankings`
- `UsageEvents`

## Definition Of Done For Grade A+

- [ ] All date fields used for ordering, retention, and lifecycle logic are
      native Firestore timestamps.
- [x] Team documents no longer contain deprecated `members[]` data.
- [x] Firestore rules explicitly cover every sensitive collection.
- [x] Billing and usage pipelines reconcile cleanly with no stuck pending
      states.
- [ ] Required composite indexes exist before queries hit production traffic.
- [ ] Seeded data is clearly isolated from real staging validation.
- [ ] Staging and production Firebase settings are aligned with recovery and
      deletion safeguards.
