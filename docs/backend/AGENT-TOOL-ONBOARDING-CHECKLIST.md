# Agent Tool Onboarding Checklist

Use this checklist for every new Agent X tool.

## 1) Register

1. Add the tool registration in `backend/src/modules/agent/queue/bootstrap.ts`.
2. Ensure tool metadata (`name`, `category`, `allowedAgents`, entity group) is
   correct.

## 2) Assign Ownership

1. Add tool exposure in `backend/src/modules/agent/agents/tool-policy.ts`.
2. If dynamic/discovered, include namespace or explicit dynamic coverage in
   governance tests.
3. If intentionally non-user-callable, mark as internal-only in governance
   tests.

## 3) Validate Exposure

1. Update
   `backend/src/modules/agent/agents/__tests__/tool-exposure.agent.spec.ts` with
   coordinator expectations.
2. Update
   `backend/src/modules/agent/agents/__tests__/agent-workflows.integration.spec.ts`
   if this tool is part of a critical workflow.

## 4) Run Governance Gates

1. `npx vitest run backend/src/modules/agent/agents/__tests__/tool-policy-governance.spec.ts`
2. `npx vitest run backend/src/modules/agent/agents/__tests__/tool-policy-governance-inverse.spec.ts`
3. `npx vitest run backend/src/modules/agent/agents/__tests__/tool-exposure.agent.spec.ts`
4. `npx vitest run backend/src/modules/agent/agents/__tests__/agent-workflows.integration.spec.ts`
5. `npx vitest run backend/src/modules/agent/__tests__/agent.router.spec.ts`

## 5) Verify Planner/Router Alignment

1. Confirm capability snapshot contains the new tool for intended coordinators.
2. Confirm capability snapshot does not include tool for non-owning
   coordinators.

## 6) Smoke Validation (Manual)

1. Recruiting flow: search and outreach.
2. Brand flow: media generation and publish path.
3. Performance flow: film analysis and intel persistence.
4. Data flow: ingestion and profile/team writes.

If smoke validation cannot run locally, document the blocker and attach test
evidence from gates above.
