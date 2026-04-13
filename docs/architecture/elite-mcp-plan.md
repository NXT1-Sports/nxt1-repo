# Elite MCP Plan

## Objective

Harden the monorepo MCP client architecture to A+ 2026 enterprise standards
before onboarding additional MCP integrations. The goal is to make remote MCP
dependencies observable, mutation-safe, cache-aware, and resilient under failure
pressure from Agent X multi-step workflows.

## Scope

The first implementation wave focuses on the shared MCP base client and the
Apify bridge:

- `backend/src/modules/agent/tools/integrations/base-mcp-client.service.ts`
- `backend/src/modules/agent/tools/integrations/apify-mcp-bridge.service.ts`
- `backend/src/modules/agent/tools/integrations/call-apify-actor.tool.ts`

## Phase 1: Base Client Hardening

1. Add structured execution tracing for every MCP tool call.
2. Add a local circuit breaker with `closed`, `open`, and `half-open` states.
3. Stop retrying user-cancelled executions.
4. Stop auto-retrying non-idempotent MCP mutations.
5. Detect transport, timeout, server, and rate-limit failures separately.

## Phase 2: Apify Bridge Hardening

1. Use `structuredContent` when present instead of relying only on text blocks.
2. Parse and validate discovery/output payloads with Zod before returning them.
3. Add read-through cache for read-only MCP calls:
   - actor search
   - actor details
   - paged dataset output
4. Capture `Retry-After` headers from Apify transport responses and feed them
   into the base circuit breaker.

## Phase 3: Tool Contract Cleanup

1. Return `datasetId` from `call_apify_actor` whenever the MCP response includes
   it.
2. Keep `get_apify_actor_output` aligned with the actual actor-run payload
   contract.

## Verification

1. A transport failure on a read call retries once after reconnect.
2. A mutation failure does not auto-retry.
3. Three consecutive dependency failures open the breaker and fail fast.
4. A `429` response opens the breaker immediately using `Retry-After` when
   available.
5. Two identical Apify discovery calls reuse cached data.
6. Invalid Apify discovery payloads fail validation instead of propagating raw
   unknown data.

## Follow-Up

1. Promote MCP trace metrics into shared backend performance reporting if we
   need dashboard-level visibility.
2. Consider a Redis-backed distributed breaker if MCP traffic grows across
   multiple backend workers.
3. Add shared schema modules for each production MCP integration as new bridges
   are added.
