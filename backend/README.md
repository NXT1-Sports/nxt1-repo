# NXT1 Backend API

Node.js/Express API server for the NXT1 Sports Platform. Source of truth for all
business logic, data aggregation, AI orchestration (Agent X), security
enforcement, and third-party integrations.

## Technology Stack

| Layer            | Technology                      | Version |
| ---------------- | ------------------------------- | ------- |
| Runtime          | Node.js (ESM)                   | 20 LTS  |
| Framework        | Express                         | 5.x     |
| Language         | TypeScript (strict)             | —       |
| Databases        | Firestore + MongoDB/Mongoose    | —       |
| Auth             | Firebase Admin SDK              | 13.x    |
| AI               | OpenRouter (via Agent X module) | —       |
| Payments         | Stripe                          | 20.x    |
| IAP              | Apple App Store Server Library  | 3.x     |
| Cache            | Redis (ioredis)                 | —       |
| Queue            | BullMQ                          | 5.x     |
| Image Processing | Sharp                           | 0.34.x  |
| Web Scraping     | Firecrawl, Apify                | —       |
| Pub/Sub          | Google Cloud Pub/Sub            | 5.x     |
| Validation       | Zod, class-validator            | —       |
| PDF              | pdfmake                         | —       |
| Testing          | Vitest + Supertest              | —       |

## Directory Structure

```
backend/
├── .env                          # Environment variables (not committed)
├── apphosting.yaml               # Firebase App Hosting config
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── scripts/                      # One-off migration & maintenance scripts
│   ├── clear-cache.ts
│   ├── migrate-search-indexes.ts
│   └── reconcile-usage-events.ts
└── src/
    ├── index.ts                  # Express app bootstrap
    ├── test-app.ts               # Test app factory (Supertest)
    ├── adapters/                 # Data adapters
    │   └── firestore-posts.adapter.ts
    ├── config/                   # Database initialization
    │   └── database.config.ts
    ├── constants/                # Backend-specific constants
    │   └── api.constants.ts
    ├── dtos/                     # Request/response validation
    ├── middleware/                # Express middleware
    ├── models/                   # Mongoose schemas
    ├── modules/                  # Self-contained feature modules
    │   ├── agent/                # Agent X (AI orchestration)
    │   └── billing/              # Stripe billing & usage tracking
    ├── routes/                   # API route definitions
    ├── services/                 # Core business logic
    ├── types/                    # TypeScript declarations
    │   └── express.d.ts
    ├── utils/                    # Shared helpers
    └── workers/                  # Background processors
        ├── stripe-worker.ts
        └── video-processing-worker.ts
```

## Routes (22)

Each file in `src/routes/` defines an Express router mounted on the app.

| Route File   | Prefix              | Purpose                          |
| ------------ | ------------------- | -------------------------------- |
| activity     | `/api/activity`     | Activity feed                    |
| agent-x      | `/api/agent-x`      | Agent X chat & operations        |
| analytics    | `/api/analytics`    | Platform analytics               |
| auth         | `/api/auth`         | Authentication & sessions        |
| billing      | `/api/billing`      | Stripe subscriptions & payments  |
| edit-profile | `/api/edit-profile` | Profile editing                  |
| explore      | `/api/explore`      | Search & discovery               |
| feed         | `/api/feed`         | Social feed (posts)              |
| helicone     | `/api/helicone`     | AI cost tracking webhooks        |
| help-center  | `/api/help-center`  | AI help & support tickets        |
| iap          | `/api/iap`          | In-app purchases (Apple)         |
| invite       | `/api/invite`       | Invite system                    |
| messages     | `/api/messages`     | Direct messaging                 |
| profile      | `/api/profile`      | Public profile viewing           |
| pulse        | `/api/pulse`        | News/pulse articles              |
| settings     | `/api/settings`     | User settings                    |
| sitemap      | `/api/sitemap`      | SEO sitemap generation           |
| upload       | `/api/upload`       | File uploads (images, video)     |
| usage        | `/api/usage`        | Usage tracking & limits          |
| webhook      | `/api/webhook`      | External webhooks (Stripe, etc.) |

Route tests live in `src/routes/__tests__/` (16 spec files).

## Services (18)

Core business logic in `src/services/`:

| Service                         | Purpose                         |
| ------------------------------- | ------------------------------- |
| agent-activity                  | Agent X activity logging        |
| agent-scrape                    | Web scraping for Agent X        |
| agent-welcome                   | New user welcome agent flow     |
| analytics                       | Platform analytics aggregation  |
| cache                           | Cache management (Redis)        |
| email-sync                      | Email synchronization           |
| help-center                     | Help articles, FAQs, AI chat    |
| messages                        | Direct messaging logic          |
| name-normalizer                 | Name formatting/normalization   |
| notification                    | Push notifications              |
| onboarding-program-provisioning | Program setup on onboarding     |
| organization                    | Organization/program management |
| profile-hydration               | Profile data enrichment         |
| roster-entry                    | Roster management               |
| team-adapter                    | Team data transformation        |
| team-code                       | Team invite code generation     |
| timeline                        | User timeline                   |
| users                           | User CRUD & queries             |

Service tests live in `src/services/__tests__/`.

## Middleware (7)

| Middleware       | Purpose                        |
| ---------------- | ------------------------------ |
| auth             | Firebase token verification    |
| cache-status     | Cache hit/miss headers         |
| firebase-context | Firebase app context injection |
| performance      | Request timing & metrics       |
| rate-limit       | Express rate limiting          |
| redis-rate-limit | Redis-backed rate limiting     |
| validation       | Request body/param validation  |

## Modules

### Agent X (`modules/agent/`)

The largest module — full AI agent orchestration system.

```
modules/agent/
├── agents/           # 8 specialized agents
│   ├── base.agent.ts
│   ├── planner.agent.ts
│   ├── general.agent.ts
│   ├── brand-media-coordinator.agent.ts
│   ├── compliance-coordinator.agent.ts
│   ├── data-coordinator.agent.ts
│   ├── performance-coordinator.agent.ts
│   └── recruiting-coordinator.agent.ts
├── skills/           # Skill registry + domain skills
│   ├── brand/
│   ├── compliance/
│   ├── copywriting/
│   ├── evaluation/
│   └── knowledge/
├── tools/            # Tool registry + tool categories
│   ├── automation/
│   ├── comms/
│   ├── data/
│   ├── database/
│   ├── integrations/
│   ├── media/
│   ├── scraping/
│   └── system/
├── llm/              # LLM client / OpenRouter integration
├── memory/           # Conversation memory & threads
├── queue/            # BullMQ job queue for async ops
├── sync/             # Real-time sync (SSE)
├── triggers/         # Event-driven triggers
├── errors/           # Agent-specific error types
└── services/         # Agent-internal services
```

### Billing (`modules/billing/`)

Stripe integration, usage-based billing, and cost tracking.

| File                     | Purpose                    |
| ------------------------ | -------------------------- |
| stripe.service           | Stripe API operations      |
| pricing.service          | Plan pricing logic         |
| usage.service            | Usage metering             |
| usage-deduction.service  | Credit deductions          |
| budget.service           | Spending limits            |
| cost-resolver.service    | AI cost calculation        |
| helicone.service         | AI cost monitoring         |
| helicone-webhook.service | Helicone event processing  |
| platform-config.service  | Billing feature flags      |
| pubsub.service           | Pub/Sub event publishing   |
| webhook.service          | Stripe webhook handling    |
| config                   | Billing constants & config |

## Models (Mongoose)

| Model          | Description                           |
| -------------- | ------------------------------------- |
| agent-message  | Agent X chat messages                 |
| agent-thread   | Agent X conversation threads          |
| college        | College/university data               |
| contact        | User contacts                         |
| conversation   | DM conversations                      |
| message        | DM messages                           |
| help-center/\* | Help articles, FAQs, article feedback |

## DTOs (10)

Request/response validation objects in `src/dtos/`:

agent-x, auth, billing, common, profile, settings, social, teams, upload, usage

## Commands

Run from `nxt1-monorepo/backend/`:

### Development

| Command               | Description                       |
| --------------------- | --------------------------------- |
| `npm run dev`         | Dev server with hot-reload        |
| `npm run dev:staging` | Dev server with staging config    |
| `npm run dev:prod`    | Dev server with production config |
| `npm run build`       | Compile TypeScript to `dist/`     |
| `npm run build:watch` | Watch mode compilation            |
| `npm run typecheck`   | Type-check without emitting       |
| `npm run lint`        | Run ESLint                        |
| `npm run lint:fix`    | Auto-fix lint issues              |
| `npm run clean`       | Remove dist/, node_modules/       |

### Testing

| Command              | Description             |
| -------------------- | ----------------------- |
| `npm run test`       | Run Vitest (single run) |
| `npm run test:watch` | Run Vitest (watch mode) |

### Scripts & Maintenance

| Command                                  | Description                    |
| ---------------------------------------- | ------------------------------ |
| `npm run worker:stripe`                  | Start Stripe background worker |
| `npm run migrate:search-indexes`         | Run search index migration     |
| `npm run migrate:search-indexes:dry-run` | Dry-run search index migration |
| `npm run reconcile:usage`                | Reconcile usage events         |
| `npm run reconcile:usage:dry-run`        | Dry-run usage reconciliation   |
| `npm run reconcile:usage:staging`        | Reconcile against staging      |
| `npm run cache:clear`                    | Clear all Redis cache          |
| `npm run cache:clear:staging`            | Clear staging cache            |
| `npm run cache:clear:profiles`           | Clear profile cache only       |
| `npm run cache:clear:teams`              | Clear team cache only          |

### Deployment

| Command                  | Description                   |
| ------------------------ | ----------------------------- |
| `npm run deploy:staging` | Deploy to staging (gcloud)    |
| `npm run deploy:prod`    | Deploy to production (gcloud) |

## Shared Package Dependencies

| Package        | Usage                                       |
| -------------- | ------------------------------------------- |
| `@nxt1/core`   | Types, constants, API factories, validation |
| `@nxt1/cache`  | Redis + in-memory cache abstraction         |
| `@nxt1/config` | ESLint/TypeScript config (devDependency)    |

## Prerequisites

A valid `.env` file is required with:

- Firebase Admin SDK credentials
- MongoDB connection URI
- OpenRouter API key
- Stripe secret key + webhook signing secret
- Redis connection URL
- Helicone API key
