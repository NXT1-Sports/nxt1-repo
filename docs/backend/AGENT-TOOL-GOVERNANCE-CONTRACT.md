# Agent Tool Governance Contract

This contract defines how agent tools are registered, owned, exposed, and
verified.

## Source of Truth

1. Runtime registration lives in `backend/src/modules/agent/queue/bootstrap.ts`.
2. Agent ownership/exposure policy lives in
   `backend/src/modules/agent/agents/tool-policy.ts`.
3. Runtime filtering/enforcement happens in:
   - `backend/src/modules/agent/agents/base.agent.ts`
   - `backend/src/modules/agent/agent.router.ts`

## Operational States

Each tool must be one of the following states:

1. User-callable:
   - Registered in bootstrap
   - Assigned in `AGENT_TOOL_POLICY`
   - Reachable by one or more coordinators
2. System-auto-included:
   - Category/system behavior included by runtime filter
   - Not directly exposed as coordinator-specific business tooling
3. Internal-only:
   - Registered but intentionally not user-callable
   - Explicitly listed as internal-only in governance tests

## Contract Rules

1. No orphan tools:
   - Every registered non-system tool must be policy-exposed or marked
     internal-only.
2. No phantom policy entries:
   - Every non-wildcard tool listed in policy must exist in bootstrap
     registrations or an approved dynamic tool set.
3. Dynamic namespace coverage is explicit:
   - Dynamic tool families (for example Google Workspace discovered tools) must
     be declared and validated in governance tests.
4. Router capability snapshots must reflect effective policy-filtered tool
   exposure, not raw registry lists.

## Required Verification Gates

Run these tests before merge:

1. `backend/src/modules/agent/agents/__tests__/tool-policy-governance.spec.ts`
2. `backend/src/modules/agent/agents/__tests__/tool-policy-governance-inverse.spec.ts`
3. `backend/src/modules/agent/agents/__tests__/tool-exposure.agent.spec.ts`
4. `backend/src/modules/agent/agents/__tests__/agent-workflows.integration.spec.ts`
5. `backend/src/modules/agent/__tests__/agent.router.spec.ts` (capability
   snapshot alignment)

## Change Policy

When adding a new tool, update registration, ownership, and tests in the same
change set. A tool should never be merged as registered-but-unreachable.
