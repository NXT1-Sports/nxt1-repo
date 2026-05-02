# Agent Tool Metadata Normalization Audit (2026-04-26)

## Objective

Validate that policy-facing tool exposure remains normalized against runtime
registrations after namespace wildcard migration, with no drift between:

- static coordinator policy exposure
- bootstrap tool registrations
- router capability snapshots

## Scope

- `backend/src/modules/agent/agents/tool-policy.ts`
- `backend/src/modules/agent/agents/__tests__/tool-policy-governance.spec.ts`
- `backend/src/modules/agent/agents/__tests__/tool-policy-governance-inverse.spec.ts`
- `backend/src/modules/agent/agents/__tests__/tool-exposure.agent.spec.ts`
- `backend/src/modules/agent/agents/__tests__/agent-workflows.integration.spec.ts`
- `backend/src/modules/agent/__tests__/agent.router.spec.ts`

## Normalization Rules Audited

1. Every bootstrap-registered external tool is either policy-exposed or
   intentionally internal-only.
2. Every policy-exposed tool token resolves to a real registered tool name or a
   manually validated wildcard family.
3. Coordinator runtime exposure uses policy filtering, not ad hoc tool lists.
4. Router capability snapshots reflect effective filtered capabilities.
5. Namespace wildcard patterns must align with real naming prefixes.

## Wildcard Families Validated

The following families are now validated and enforced in inverse-governance
tests:

- `gmail_*`
- `query_gmail_*`
- `create_gmail_*`
- `calendar_get_*`
- `create_calendar_*`
- `delete_calendar_*`
- `drive_*`
- `docs_*`
- `sheets_*`

## Validation Commands

Executed in `nxt1-monorepo/backend`:

```bash
npx vitest run \
  src/modules/agent/agents/__tests__/tool-policy-governance.spec.ts \
  src/modules/agent/agents/__tests__/tool-policy-governance-inverse.spec.ts \
  src/modules/agent/agents/__tests__/tool-exposure.agent.spec.ts \
  src/modules/agent/agents/__tests__/agent-workflows.integration.spec.ts \
  src/modules/agent/__tests__/agent.router.spec.ts \
  src/routes/__tests__/agent-x.routes.spec.ts
```

## Result

- Status: PASS
- Drift detected: NO
- Unknown policy token(s): NONE
- Missing runtime registration(s): NONE
- Capability snapshot mismatch: NONE

## Notes

- Earlier wildcard attempt failed due to prefix mismatch for Gmail/Calendar
  action verbs.
- Prefix-qualified wildcard families were added to preserve dynamic namespace
  flexibility without weakening inverse drift checks.
