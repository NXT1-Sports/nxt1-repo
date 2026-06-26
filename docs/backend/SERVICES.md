# Backend Services Overview

This document summarizes the current backend surface area in `backend/src/` and
points to the more detailed docs that already exist.

## Purpose

The backend is the source of truth for business logic, AI orchestration,
billing, security, aggregation, and external integrations.

## Top-Level Backend Structure

```text
backend/src/
├── adapters/
├── config/
├── constants/
├── dtos/
├── middleware/
├── models/
├── modules/
├── routes/
├── services/
├── types/
├── utils/
└── workers/
```

## Route Surface

The API is organized by route groups under `backend/src/routes/`. The primary
product-facing groups documented in the backend README are:

- `activity`
- `agent-x`
- `analytics`
- `auth`
- `billing`
- `edit-profile`
- `explore`
- `feed`
- `help-center`
- `iap`
- `invite`
- `messages`
- `profile`
- `pulse`
- `settings`
- `upload`
- `usage`
- `webhook`

See [../../backend/README.md](../../backend/README.md) for the full route table
and mount prefixes.

## Service Surface

Current service directories under `backend/src/services/`:

```text
communications/
core/
marketing/
platform/
profile/
team/
util/
```

These directories contain the underlying business services used by the routes
and modules.

### What Each Service Area Covers

- `communications/` — email sync, outbound communication flows, and Agent X
  operational messaging support
- `core/` — shared service primitives that back multiple backend features
- `marketing/` — lifecycle messaging, campaign automation, and growth-oriented
  backend jobs
- `platform/` — cross-cutting platform services such as analytics,
  notifications, onboarding, organization, and user operations
- `profile/` — profile hydration, profile viewing/editing support,
  roster-related enrichment
- `team/` — team data operations, invite codes, roster/program management
- `util/` — backend-specific helpers and support services

## Major Modules

### Agent X

`backend/src/modules/agent/` is a live production module, not a placeholder. It
currently includes:

- `agents/` — specialized agent implementations plus planner/base runtime
- `capabilities/`, `config/`, `exceptions/`, `llm/`, `memory/`
- `orchestrator/`, `queue/`, `services/`, `skills/`, `sync/`, `tools/`,
  `triggers/`, `utils/`

This module powers Agent X routing, tool usage, thread memory, async jobs, and
proactive workflows.

### Billing

`backend/src/modules/billing/` owns Stripe billing, usage metering, cost
resolution, Helicone monitoring, and budget controls.

## Middleware

Core middleware lives in `backend/src/middleware/` and covers authentication,
validation, caching, performance, and rate limiting.

## Workers

Background processing lives in `backend/src/workers/` for async workloads such
as Stripe tasks and media processing.

## Existing Detailed Docs

- [../../backend/README.md](../../backend/README.md) — canonical backend
  overview
- [EXPLORE-API.md](./EXPLORE-API.md) — explore/search API details
- [POSTS-API.md](./POSTS-API.md) — posts/feed API details
- [OVERVIEW-BILLING-SYSTEM.md](./OVERVIEW-BILLING-SYSTEM.md) — billing and usage
  system
- [FIREBASE-FUNCTIONS.md](./FIREBASE-FUNCTIONS.md) — related cloud function
  inventory
- [REDIS-RATE-LIMITING.md](./REDIS-RATE-LIMITING.md) — backend rate limiting
  strategy

## Guidance

When adding or changing backend features:

- update the closest route/module/service README first if one already exists
- update this overview only when the backend surface map changes materially
- keep the backend README as the main operational entry point for developers
