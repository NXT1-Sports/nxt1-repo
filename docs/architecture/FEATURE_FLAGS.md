# Feature Flags: How It Works

This document explains exactly how the centralized feature flag system works in
NXT1 today.

## Source of Truth

All flags are defined in shared core:

- `packages/core/src/flags/flags.types.ts`
- `packages/core/src/flags/flags.constants.ts`
- `packages/core/src/flags/index.ts`

Backend evaluation is centralized in:

- `backend/src/config/feature-flags/feature-flags.service.ts`
- `backend/src/config/feature-flags/index.ts`

## Resolution Flow (Exact Order)

When backend code calls `getFlagValue()` or `isEnabled()`, the service resolves
values in this order:

1. In-memory cache (if entry exists and TTL has not expired).
2. Firestore document `AppConfig/featureFlags` from `flags.<flagKey>`.
3. Legacy environment compatibility mapping (for migrated env toggles).
4. Generic env fallback: `ENABLE_<FLAG_KEY_WITH_DOTS_REPLACED_BY_UNDERSCORES>`.
5. Default value from the core registry.
6. Type validation against registry definition (`boolean`, `enum`, `numeric`,
   `json`).

If validation fails, the service throws `InvalidFlagValueError`.

## Cache Behavior

- Default TTL: 300 seconds.
- Cache key: exact feature flag key string.
- Cache is invalidated per-flag on `setFlagValue()` and `deleteFlagValue()`.

## Sync vs Async Access

There are two access modes in backend:

1. Async (normal path)
   - Uses Firestore + cache + env fallback + defaults.
   - API: `getFeatureFlagsService(db).isEnabled(key)`.

2. Sync (bootstrap/static path)
   - Uses env compatibility + defaults (no Firestore read).
   - API: `isFeatureEnabledSync(key)` and `getFeatureFlagValueSync(key)`.
   - Intended for early process startup and static module initialization.

## Firestore Shape

Document path:

- `AppConfig/featureFlags`

Stored structure:

```json
{
  "flags": {
    "team.intel.enabled": true,
    "ai.distiller.enabled": true,
    "experimental.semantic.cache.enabled": false
  },
  "updatedAt": "2026-05-13T18:00:00.000Z"
}
```

## Legacy Env Compatibility

To keep migration safe, the service still understands these env vars through
explicit compatibility readers:

- `AGENT_ENGINE_DISABLED` -> `experimental.agent.engine.enabled` (inverted)
- `SEMANTIC_CACHE_ENABLED` -> `experimental.semantic.cache.enabled`
- `AI_DISTILLER_ENABLED` -> `ai.distiller.enabled`
- `USE_PROD_MODELS_IN_DEV` -> `ai.model.prod.catalog.in.dev.enabled`
- `STRIPE_ENABLED` -> `billing.stripe.enabled`

This lets old deploy environments continue working while all runtime code reads
centralized flags.

## Current Key Consumers

Recent centralized consumers include:

- `backend/src/modules/agent/queue/bootstrap.ts`
- `backend/src/modules/agent/memory/semantic-cache.service.ts`
- `backend/src/modules/agent/llm/llm.types.ts`
- `backend/src/modules/billing/config.ts`
- `backend/src/modules/agent/tools/integrations/firecrawl/scraping/distillers/universal-ai.distiller.ts`

## Operational Runbook

To change a flag safely:

1. Set the value in Firestore `AppConfig/featureFlags` under `flags.<key>`.
2. Wait for cache TTL to expire (or trigger process restart if immediate
   propagation is needed).
3. Verify behavior and logs in staging first.
4. Promote to production with the same key/value.

## Adding a New Flag (Required Steps)

1. Add the new key to `packages/core/src/flags/flags.types.ts` union.
2. Add full definition in `packages/core/src/flags/flags.constants.ts`.
3. Register in `ALL_FLAGS` and relevant grouped export (`TEAM_FLAGS`,
   `AI_FLAGS`, etc.).
4. Use the key from backend via centralized service.
5. Add or update tests in:
   - `packages/core/src/flags/flags.types.spec.ts`
   - backend feature-specific tests as needed.

## API Endpoints

Read endpoints are available at:

- `GET /api/v1/flags/:flagKey`
- `GET /api/v1/flags/batch?keys=...`
- `GET /api/v1/flags/all` (admin only)

Route implementation:

- `backend/src/routes/core/flags/index.ts`

## Validation Checklist

Before shipping flag changes:

1. `npx vitest run src/flags` in `packages/core` passes.
2. Backend typecheck passes.
3. Backend build passes.
4. No runtime module contains direct feature-toggle env checks outside
   centralized compatibility logic.
