# Agent X Monitoring Gaps & Recommendations

> **Audited:** April 18, 2026  
> **Scope:** `backend/src/modules/agent/` — queue, worker, tool registry, LLM
> layer, routes

---

## Current Monitoring Coverage (What We Have)

### Upstream / External Platform Alerts → Slack

| Layer             | Coverage                                                              |
| ----------------- | --------------------------------------------------------------------- |
| **Sentry**        | Catches unhandled exceptions → Slack via `/sentry-webhook` route      |
| **Helicone**      | LLM cost reconciliation webhooks → MongoDB billing deduction tracking |
| **GCP Alerts**    | Cloud infra (CPU, memory, instance health on App Hosting)             |
| **MongoDB Atlas** | DB-level alerts (connections, ops, storage)                           |
| **Crashlytics**   | Frontend crash tracking (mobile + web)                                |

### Worker & Queue Layer (Internal Logging Only)

| Signal                       | Location                                               |
| ---------------------------- | ------------------------------------------------------ |
| Job `completed`              | `logger.info` — `jobId`, `operationId`, `durationMs`   |
| Job `failed`                 | `logger.error` — `jobId`, `operationId`, error + stack |
| Job `stalled`                | `logger.error` + both Firestore repos marked failed    |
| Worker Redis disconnect      | `logger.error('Agent worker error')`                   |
| Job timeout (5 min hard cap) | Throws → caught by BullMQ `failed` handler             |
| Queue stats                  | Admin-only `GET /api/v1/agent/queue-stats` (pull only) |

### Tool Execution (Internal Logging Only)

| Signal                       | Location                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| Individual tool failures     | `logger.error('[ToolName] Failed', { error })` inside each tool |
| LLM retry/fallback           | OpenRouter service — exponential backoff + model fallback chain |
| Scrape timeouts              | `AbortSignal.timeout(SCRAPE_TIMEOUT_MS)` per request            |
| Video analysis timeout       | `AbortSignal.timeout(VIDEO_ANALYSIS_TIMEOUT_MS)`                |
| Task self-correction retries | `TASK_MAX_RETRIES = 2` in `agent.router.ts`                     |

### Bootstrap / Startup

- Redis unavailable → `logger.warn` → queue disabled gracefully
- Firebase MCP bridge failure → `logger.warn`
- LiveView service failure → `logger.warn` + tool disabled at init

---

## Gaps — What's Missing

### 🔴 High Priority

#### 1. No Slack alert for BullMQ `failed` or `stalled` events

- **File:** `backend/src/modules/agent/queue/agent.worker.ts` →
  `attachEventListeners()`
- The `failed` and `stalled` handlers only call `logger.error`. A real
  user-facing job failure **never pings Slack.**
- **Fix:** Add a Slack webhook call inside both handlers (same pattern as the
  existing Sentry → Slack route in
  `backend/src/routes/webhooks/sentry-webhook.routes.ts`). Include `jobId`,
  `operationId`, `userId`, error message, and a link to the admin queue stats
  endpoint.

#### 2. No agent-aware `/health` endpoint

- **File:** `backend/src/index.ts` — existing `/health` only checks Redis ping
- No visibility into: is the worker processing? what's the current queue depth?
  when was the last completed job? is OpenRouter reachable?
- **Fix:** Extend `/health` (or add `/health/agent`) to return:
  - BullMQ queue counts (`waiting`, `active`, `failed`, `delayed`)
  - Worker alive/paused status
  - Timestamp of last completed job
  - OpenRouter reachability (lightweight HEAD check or cached status)

---

### 🟡 Medium Priority

#### 3. No tool-level failure rate aggregation

- Individual tools log errors in isolation. There's no way to tell if
  `scrape_twitter`, `generate_image`, or `analyze_video` is systematically
  broken vs. a one-off.
- **Fix:** Add a lightweight in-memory (or Redis) error counter per tool name.
  After N failures within a rolling window (e.g., 5 failures in 10 minutes),
  push a Slack alert. Reset counter on success.
- **Suggested location:** `backend/src/modules/agent/tools/tool-registry.ts` —
  wrap the `execute()` method with counter logic.

#### 4. No queue depth alert

- `GET /queue-stats` is a pull endpoint. Nothing sends a proactive alert when
  the waiting count spikes (e.g., the worker crashes and jobs pile up).
- **Fix:** Add a cron check (can reuse existing cron infra in
  `backend/src/routes/agent-x/cron.routes.ts`) that runs every 5 minutes, calls
  `queueService.getCounts()`, and posts to Slack if `waiting > threshold`
  (e.g., > 20 jobs).

#### 5. No LLM provider outage alerting

- When the entire OpenRouter fallback chain fails (all models exhausted), it
  throws `OpenRouterError` which bubbles up to BullMQ `failed` — but that only
  logs (see Gap #1). No proactive signal that the AI backbone is down.
- **Fix:** In `backend/src/modules/agent/llm/openrouter.service.ts`, on
  full-chain exhaustion, set a Redis flag `openrouter:circuit_open = 1` with a
  TTL (e.g., 2 minutes). On first open → post Slack alert. On recovery
  (successful call) → clear flag + post recovery alert.

---

### 🟢 Low Priority

#### 6. No runtime circuit breaker per tool

- If an external integration (Firecrawl, Twitter scraper, video analysis) goes
  down at runtime, Agent X keeps delegating tasks to that tool and they keep
  failing. The bootstrap disables `open_live_view` on init failure, but nothing
  does this dynamically for other tools.
- **Fix:** Generalize the startup disable pattern into a runtime circuit
  breaker. After a configurable consecutive failure threshold, mark the tool as
  `disabled` in the registry and route around it. Auto-re-enable after a
  cooldown.
- **Suggested location:** `backend/src/modules/agent/tools/tool-registry.ts`

#### 7. No dead-letter backlog alert

- BullMQ keeps failed jobs in Redis for 7 days (`FAILED_JOB_TTL_S = 604_800`).
  Nothing alerts if that failed set grows beyond a reasonable size (e.g., > 50
  jobs).
- **Fix:** Include `failed` count in the cron queue-depth check (Gap #4) and
  alert separately when failed backlog exceeds threshold.

---

## Implementation Order

```
1. Gap #1  — Slack alert in attachEventListeners() (worker.ts)          ~1 hour
2. Gap #2  — Agent-aware /health endpoint                                ~1 hour
3. Gap #4  — Queue depth cron alert                                      ~30 min
4. Gap #3  — Tool error rate counter + alert                             ~2 hours
5. Gap #5  — OpenRouter circuit flag + Slack alert                       ~1 hour
6. Gap #6  — Runtime circuit breaker in ToolRegistry                     ~3 hours
7. Gap #7  — Dead-letter backlog alert (extend Gap #4 cron)              ~30 min
```

---

## Relevant Files

| File                                                   | Relevance                               |
| ------------------------------------------------------ | --------------------------------------- |
| `backend/src/modules/agent/queue/agent.worker.ts`      | BullMQ event listeners (Gaps 1, 4, 7)   |
| `backend/src/modules/agent/tools/tool-registry.ts`     | Tool execution wrapper (Gaps 3, 6)      |
| `backend/src/modules/agent/llm/openrouter.service.ts`  | OpenRouter fallback chain (Gap 5)       |
| `backend/src/routes/agent-x/admin-queue.routes.ts`     | Queue stats endpoint                    |
| `backend/src/routes/agent-x/cron.routes.ts`            | Cron infra for depth alerts (Gap 4)     |
| `backend/src/routes/webhooks/sentry-webhook.routes.ts` | Existing Slack webhook pattern to copy  |
| `backend/src/index.ts`                                 | `/health` endpoint registration (Gap 2) |
