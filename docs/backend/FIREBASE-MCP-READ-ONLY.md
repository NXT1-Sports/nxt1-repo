# Firebase MCP Read-Only Architecture

This backend includes an internal Firebase MCP server for Agent X so the agent
can query user-scoped Firebase data without dozens of bespoke read tools.

## Why this exists

- Existing MCP integrations in the agent runtime use bridge services over
  `BaseMcpClientService`.
- Firebase Admin SDK is the correct server-side access model for backend workers
  and long-running agent jobs.
- Raw Firestore path access is not exposed to the model. The LLM only sees named
  read views.

## Design

- Server entry:
  `backend/src/modules/agent/tools/integrations/firebase-mcp-server.ts`
- Bridge:
  `backend/src/modules/agent/tools/integrations/firebase-mcp-bridge.service.ts`
- Agent-facing tools:
  - `list_user_firebase_views`
  - `query_user_firebase_data`
- Shared schemas and signing helpers:
  `backend/src/modules/agent/tools/integrations/firebase-mcp/shared.ts`
- View resolvers:
  `backend/src/modules/agent/tools/integrations/firebase-mcp/views.ts`

## Security model

- The MCP server uses `firebase-admin`, not end-user Firebase client tokens.
- User scope is injected from `ToolExecutionContext` at tool execution time.
- The LLM never supplies `userId`.
- Scope is signed with an internal HMAC secret before crossing the stdio
  boundary into the child MCP process.
- The MCP server verifies that signature before every query.
- No write tools are exposed through this MCP server.

## Exposed views

- `user_profile_snapshot`
- `user_timeline_feed`
- `user_schedule_events`
- `user_recruiting_status`
- `user_season_stats`
- `user_physical_metrics`
- `user_team_membership`
- `user_highlight_videos`

These views are intentionally named read models over known collections such as
`Users`, `Posts`, `Events`, `Recruiting`, `PlayerStats`, `PlayerMetrics`,
`RosterEntries`, and `Teams`.

## Operational notes

- The bridge spawns the compiled MCP server via `StdioClientTransport` using the
  current Node executable.
- The MCP process inherits the backend environment, including Firebase Admin
  credentials.
- `FIREBASE_MCP_TARGET_APP` can force the child process to use `staging` or
  `default` Firebase Admin wiring. If unset, the server defaults to `staging`
  when `NODE_ENV=staging`, otherwise `default`.
- Firebase Admin SDK initialization follows Firebase official guidance: prefer
  ADC or service-account-backed server credentials in trusted environments.
- The bridge caches view metadata and per-user queries using the existing
  backend cache service.

## Usage from agents

Recommended agent sequence:

1. Call `list_user_firebase_views` if the available Firebase read surface is
   unclear.
2. Call `query_user_firebase_data` with a named `view` and narrow `filters`.
3. Use the returned `nextCursor` for pagination on feed-style views.

## Why not expose raw Firestore queries

- Raw paths and arbitrary operators let the model drift outside approved data
  contracts.
- Named views let the backend own filtering, redaction, ordering, and future
  schema evolution.
- This keeps the Firebase surface aligned with the NXT1 backend-first
  architecture.
