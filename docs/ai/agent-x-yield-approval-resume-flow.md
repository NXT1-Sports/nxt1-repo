# Agent X Yield, Approval, and Resume Flow

This document defines the authoritative backend flow for yielded Agent X
operations.

## Why this exists

Yielded operations are the highest-risk state machine in Agent X streaming:

- A worker can pause in `awaiting_input` or `awaiting_approval`.
- The user can respond or approve from multiple clients.
- The system must resume exactly once with deterministic linkage between old and
  new operation IDs.

## States

The operation status transitions are:

1. `in-progress`
2. `awaiting_input` or `awaiting_approval` (yielded)
3. `completed` / `failed` / `cancelled`

When resumed, a new operation row is created and linked via
`context.resumedFrom`.

## Resume Job: `POST /api/v1/agent-x/resume-job/:operationId`

File: `backend/src/routes/agent/chat.routes.ts`

Validation gates:

1. Queue + repository health checks pass.
2. Authenticated user owns the original operation.
3. Original operation status is `awaiting_input` or `awaiting_approval`.
4. `yieldState` exists and is not expired.
5. `response` body is non-empty and <= 5000 chars.

Behavior:

1. Persist user response to thread messages (best effort).
2. Build a new `AgentJobPayload` with:
   - fresh `operationId`
   - fresh `sessionId`
   - `context.threadId`
   - `context.resumedFrom` set to original operation ID
   - normalized prior `yieldState.messages`
   - appended tool-response observation carrying `userResponse`
3. Create new operation row.
4. Mark original operation completed with summary indicating the new operation
   ID.
5. Enqueue via outbox.

## Approval Resolve: `POST /api/v1/agent-x/approvals/:id/resolve`

File: `backend/src/routes/agent/chat.routes.ts`

Validation gates:

1. Approval request exists and belongs to authenticated user.
2. Approval status is still `pending`.
3. Decision is `approved` or `rejected`.
4. Optional `toolInput` must be an object.

Behavior:

1. Resolve approval transactionally.
2. If rejected:
   - mark original operation cancelled
   - return without resume.
3. If approved and pending tool call exists:
   - create new operation with fresh `operationId`
   - carry `context.resumedFrom`, `context.approvalId`, and updated
     `pendingToolCall.toolInput`
   - normalize `yieldState.messages`
   - mark original operation completed and enqueue new one.

## Message Contract Hardening

For both resume paths, `yieldState.messages` are normalized before re-enqueue:

- keep only entries with non-empty `role` and `content`
- preserve `tool_call_id` when valid
- stringify non-string content to avoid malformed payload failures

This prevents schema drift from breaking resumed jobs.

## Operation Linkage Guarantees

Each resume creates deterministic linkage fields:

- Original operation: terminal summary includes `resumedAs`.
- New operation context: includes `resumedFrom` (and `approvalId` for approval
  path).

This allows auditability and timeline reconstruction in operations logs.

## Streaming Continuity

Streaming attachment for resumed operations is still served through the same
SSE/replay stack:

- persisted events replay first
- live PubSub tail second
- Firestore fallback polling if PubSub is unavailable

So yield/resume does not bypass stream durability guarantees.
