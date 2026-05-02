# Agent Tool Capability Migration Ledger

## Purpose

Track completion of policy-governed capability-family migration for
coordinator-visible tools and confirm closure criteria.

## Closure Criteria

A capability family is considered closed only when all items are true:

- policy family exists in `AGENT_TOOL_POLICY`
- inverse governance test allowlists wildcard family
- coordinator exposure tests pass
- router capability snapshot tests pass
- workflow integration coverage includes required family behavior

## Capability Family Ledger

| Family                 | Policy Status       | Inverse Governance | Exposure Tests | Router Snapshot | Workflow Coverage | Status |
| ---------------------- | ------------------- | ------------------ | -------------- | --------------- | ----------------- | ------ |
| Gmail (base namespace) | `gmail_*`           | Validated          | Pass           | Pass            | Pass              | Closed |
| Gmail query prefix     | `query_gmail_*`     | Validated          | Pass           | Pass            | Pass              | Closed |
| Gmail create prefix    | `create_gmail_*`    | Validated          | Pass           | Pass            | Pass              | Closed |
| Calendar get prefix    | `calendar_get_*`    | Validated          | Pass           | Pass            | Pass              | Closed |
| Calendar create prefix | `create_calendar_*` | Validated          | Pass           | Pass            | Pass              | Closed |
| Calendar delete prefix | `delete_calendar_*` | Validated          | Pass           | Pass            | Pass              | Closed |
| Drive namespace        | `drive_*`           | Validated          | Pass           | Pass            | Pass              | Closed |
| Docs namespace         | `docs_*`            | Validated          | Pass           | Pass            | Pass              | Closed |
| Sheets namespace       | `sheets_*`          | Validated          | Pass           | Pass            | Pass              | Closed |

## Final Verification Snapshot

Verification command (run in `backend/`):

```bash
npx vitest run \
  src/modules/agent/agents/__tests__/tool-policy-governance.spec.ts \
  src/modules/agent/agents/__tests__/tool-policy-governance-inverse.spec.ts \
  src/modules/agent/agents/__tests__/tool-exposure.agent.spec.ts \
  src/modules/agent/agents/__tests__/agent-workflows.integration.spec.ts \
  src/modules/agent/__tests__/agent.router.spec.ts \
  src/routes/__tests__/agent-x.routes.spec.ts
```

Observed result:

- 6 test files passed
- 74 tests passed
- 0 failed

## Sign-off

- Migration slice: Coordinator tool policy namespace hardening
- Date: 2026-04-26
- Owner: Master CTO execution lane
