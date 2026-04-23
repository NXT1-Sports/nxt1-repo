# Agent X Monitoring

> **2026 OPERATIONS GUIDE** — This document defines the monitoring model for
> Agent X in production and staging.

---

## 1. Overview

Agent X monitoring is split across four different surfaces because the agent is
not a single request-response feature.

- **AgentJobs** answers: Did the run start, what state is it in, and how did it
  finish?
- **BullMQ / Redis queue state** answers: Is the engine healthy and keeping up?
- **Helicone / OpenRouter telemetry** answers: What did the model do, how long
  did it take, and how much did it cost?
- **GCP Logs** answers: Why did this specific run fail?

These surfaces serve different operational jobs. Treating logs as the primary
monitoring source is the wrong model for this codebase.

---

## 2. What Not To Use

### `analyticsEvents` Is Not Agent Ops Telemetry

The `analyticsEvents` collection is for user-facing product analytics and
timeline-style history. It is not the source of truth for runtime health,
backlog, stuck jobs, or worker reliability.

Use `analyticsEvents` for questions like:

- How many user-visible agent tasks completed?
- What user-facing domains were touched?
- What actions should appear in the athlete's history?

Do **not** use `analyticsEvents` for questions like:

- Is the queue backed up?
- Are jobs getting stuck in `thinking` or `acting`?
- Did the worker crash?
- Which runs are currently waiting for approval?
- What is the median time from queued to completed?

---

## 3. Primary Monitoring Surface: `AgentJobs`

### Why `AgentJobs` Exists

`AgentJobs/{operationId}` is the operational state store for Agent X. It exists
so the frontend can subscribe to live job state, and it is also the best source
for monitoring agent runtime behavior.

Each document stores the state of a single run, including:

- `status`
- `progress`
- `result`
- `error`
- `threadId`
- `createdAt`
- `updatedAt`
- `completedAt`
- `yieldState`
- `expiresAt`

There is also an `events` subcollection for step-level execution details.

### Operational Questions `AgentJobs` Should Answer

- How many jobs are currently queued, acting, thinking, awaiting input, or
  failed?
- Which operations are stuck in non-terminal states?
- What is the failure rate over the last 5 minutes, 1 hour, or 24 hours?
- What is the median and p95 runtime?
- Which runs are waiting for approval and aging out?
- Which threads repeatedly fail?

### Key Statuses To Watch

- `queued`
- `thinking`
- `acting`
- `awaiting_input`
- `awaiting_approval`
- `completed`
- `failed`
- `cancelled`

### Recommended Metrics From `AgentJobs`

- Count of runs by `status`
- Failure rate over time
- Median duration: `completedAt - createdAt`
- p95 duration: `completedAt - createdAt`
- Count of stale jobs where `status` is non-terminal and `updatedAt` is older
  than your SLA
- Count of approval-blocked jobs where `status = awaiting_approval`
- Count of input-blocked jobs where `status = awaiting_input`

### Recommended Alerts From `AgentJobs`

- **Failure spike**: failed runs in the last 5 minutes exceed threshold
- **Stuck jobs**: non-terminal jobs with old `updatedAt`
- **Approval backlog**: too many runs sitting in `awaiting_approval`
- **Input backlog**: too many runs sitting in `awaiting_input`
- **Slow completions**: p95 duration exceeds threshold

---

## 4. Queue Health: BullMQ And Redis

### Purpose

BullMQ and Redis are the execution engine, not the durable monitoring history.
Use them to understand queue pressure and worker health.

### Questions Queue Monitoring Should Answer

- Is the worker draining jobs fast enough?
- Are jobs piling up in `waiting`?
- Is Redis reachable?
- Is the queue paused?
- Are delayed jobs growing unexpectedly?

### Queue States To Watch

- `waiting`
- `active`
- `completed`
- `failed`
- `delayed`
- `paused`

### Recommended Queue Alerts

- `waiting` exceeds threshold for more than N minutes
- `active` remains high while completions drop
- `failed` spikes above baseline
- queue is paused unexpectedly
- Redis unavailable on startup or reconnect

### Important Limitation

BullMQ is not your durable history. Redis is ephemeral relative to Firestore.
Use queue counts for engine health and `AgentJobs` for persistent monitoring.

---

## 5. LLM Monitoring: Helicone / OpenRouter Telemetry

### Purpose

Helicone is the best place to inspect model-level behavior for a given run.
Agent X already tags LLM requests with operation-scoped headers so model calls
can be grouped by job.

### Questions Helicone Should Answer

- Which model calls happened inside one agent run?
- Which agent made the call?
- How long did each model call take?
- What was the total token and cost footprint?
- Which runs show model retries or repeated failures?

### Primary Correlation Keys

- `operationId`
- `agentId`
- `userId`
- `feature`

### Best Use Cases

- Investigating high latency inside the LLM layer
- Comparing coordinator performance
- Tracking model cost per operation
- Debugging prompt or routing regressions

### Important Limitation

Helicone tells you what happened inside the model layer. It does not replace
job-state monitoring, queue health monitoring, or worker failure monitoring.

---

## 6. GCP Logs: Root Cause Debugging Only

### Purpose

Use GCP Logs to debug failures, startup issues, worker crashes, Redis
connectivity problems, and unexpected runtime exceptions.

### Why Logs Are Secondary In This Repo

The backend logger currently formats messages into plain text and writes through
`console.log`, `console.warn`, and `console.error`. That means Cloud Logging
mostly receives `textPayload`, not a clean structured `jsonPayload` schema.

Because of that:

- Logs are good for inspection
- Logs are bad as the primary monitoring database
- Logs are useful for tracing a single broken run by `operationId`
- Logs are weak for aggregate analytics compared with `AgentJobs`

### Good Uses For GCP Logs

- Find a stack trace for one failed operation
- Confirm worker boot or shutdown behavior
- Inspect Redis connectivity failures
- Inspect Firestore write failures
- Trace a specific `operationId` across services

### Bad Uses For GCP Logs

- Building the main dashboard for agent health
- Calculating durable failure rates
- Measuring backlog
- Tracking long-running stale jobs

### Example Log Explorer Filter

```text
resource.type="cloud_run_revision"
resource.labels.service_name="YOUR_BACKEND_SERVICE"
(
  textPayload:"[Agent"
  OR textPayload:"operationId"
  OR textPayload:"agent_task_failed"
)
```

### Example Failure Filter

```text
resource.type="cloud_run_revision"
resource.labels.service_name="YOUR_BACKEND_SERVICE"
severity>=ERROR
(
  textPayload:"[Agent"
  OR textPayload:"agent_task_failed"
)
```

---

## 7. Recommended Monitoring Model

Use the following division of responsibility:

| Surface        | Primary Question                               | Use For                                                            |
| -------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `AgentJobs`    | Did the run start, progress, stall, or finish? | Main ops dashboard, run health, duration, stale jobs, failure rate |
| BullMQ / Redis | Is the engine healthy and draining work?       | Queue pressure, worker health, backlog alerts                      |
| Helicone       | What happened inside the LLM layer?            | Model latency, token usage, cost, prompt investigation             |
| GCP Logs       | Why did this specific run fail?                | Root-cause debugging and infrastructure inspection                 |

If you only choose one persistent operational source, choose `AgentJobs`.

---

## 8. Suggested Production Dashboard

### Top-Line Cards

- Runs started in last 15 minutes
- Runs completed in last 15 minutes
- Runs failed in last 15 minutes
- Current queued runs
- Current active runs
- Current approval-blocked runs
- Current input-blocked runs
- Median duration
- p95 duration

### Trend Charts

- Completion rate over time
- Failure rate over time
- Duration over time
- Queue backlog over time

### Triage Tables

- Failed runs with `operationId`, `updatedAt`, `error`
- Non-terminal runs older than SLA
- Approval-blocked runs sorted by age
- Input-blocked runs sorted by age

### Deep Links

- Link each row by `operationId`
- Link to the associated `threadId` when present
- Link from the run to Helicone session data
- Link from the run to filtered GCP logs by `operationId`

---

## 9. Suggested Alert Policy

### Critical

- Worker cannot start because Redis is unavailable
- Queue backlog exceeds emergency threshold
- Failed runs spike sharply over a short interval

### Warning

- p95 duration degrades above target
- approval backlog exceeds threshold
- input backlog exceeds threshold
- stale non-terminal runs exceed threshold

### Investigate

- One coordinator shows materially worse latency in Helicone
- One tool repeatedly appears in failed runs
- Runs complete, but durations trend upward release over release

---

## 10. Implementation Guidance

### If You Need One Monitoring Source Today

Start with `AgentJobs`.

It already exists, it already tracks lifecycle state, and it maps directly to
the operational questions the team actually cares about.

### If You Need Better Root-Cause Debugging

Use GCP Logs with `operationId` and agent-specific prefixes.

### If You Need Better Model Visibility

Use Helicone grouped by `operationId` and `agentId`.

### If You Need Better Queue Reliability Monitoring

Export BullMQ queue counts and alert on backlog, pause state, and failure
spikes.

---

## 11. Bottom Line

The correct monitoring model for Agent X is:

- **`AgentJobs` is the operational source of truth**
- **BullMQ / Redis measures engine health**
- **Helicone measures LLM behavior**
- **GCP Logs explain specific failures**

`analyticsEvents` remains useful for user history and product analytics, but it
is not the correct foundation for agent operations monitoring.
