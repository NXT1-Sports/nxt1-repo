# NXT1 Monorepo

AI-first sports platform monorepo for the NXT1 web app, mobile app, backend API,
Firebase functions, and shared packages.

[![CI](https://github.com/nxt1/nxt1-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/nxt1/nxt1-workspace/actions/workflows/ci.yml)
[![Deploy Web Staging](https://github.com/nxt1/nxt1-workspace/actions/workflows/deploy-web-staging.yml/badge.svg)](https://github.com/nxt1/nxt1-workspace/actions/workflows/deploy-web-staging.yml)
[![Deploy Web Production](https://github.com/nxt1/nxt1-workspace/actions/workflows/deploy-web-production.yml/badge.svg)](https://github.com/nxt1/nxt1-workspace/actions/workflows/deploy-web-production.yml)

## What This Repo Contains

- `apps/web` — Angular 22 SSR web application deployed with Firebase App Hosting
- `apps/mobile` — Ionic 8 + Capacitor 8 mobile application for iOS and Android
- `apps/functions` — Firebase Cloud Functions Gen 2
- `backend` — Node.js 22 + Express 5 API, business logic, billing, and Agent X
  orchestration
- `packages/core` — pure TypeScript shared contracts, API factories, helpers,
  validation, analytics, performance, testing, and feature modules
- `packages/ui` — shared Angular/Ionic UI, services, and infrastructure
- `packages/design-tokens`, `packages/cache`, `packages/config`,
  `packages/shared-types` — shared platform support packages

## Technology Stack

| Area                | Current stack                                             |
| ------------------- | --------------------------------------------------------- |
| Runtime             | Node.js `>=22.22.3 <23`, npm `>=11`                       |
| Web                 | Angular 22, Angular SSR, Tailwind CSS 3, Ionic components |
| Mobile              | Angular 22, Ionic 8, Capacitor 8                          |
| Backend             | Express 5, TypeScript 6, BullMQ, Redis                    |
| Data                | Firestore + MongoDB/Mongoose                              |
| Auth                | Firebase Authentication + Firebase Admin                  |
| AI                  | OpenRouter via backend-only Agent X module                |
| Testing             | Vitest + Playwright                                       |
| Build orchestration | Turborepo                                                 |

## Monorepo Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                         APPLICATIONS                            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Mobile        │   Web           │   Functions                 │
│   (Capacitor)   │   (Angular SSR) │   (Firebase Gen 2)          │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                          BACKEND                                │
│             Express API + Agent X + Billing + Jobs             │
├─────────────────────────────────────────────────────────────────┤
│                        SHARED PACKAGES                          │
├──────────────────────────┬──────────────────────────────────────┤
│   @nxt1/core             │   @nxt1/ui                           │
│   Pure TypeScript        │   Shared Angular/Ionic UI            │
│   Types, APIs, helpers   │   Components, services, infra        │
└──────────────────────────┴──────────────────────────────────────┘
```

## Enterprise Rules

The repository follows the 2026 NXT1 architecture rules. The short version:

- backend is the source of truth for business logic, aggregation, AI calls, and
  security decisions
- `@nxt1/core` stays framework-free and portable
- web prefers granular `@nxt1/ui/*` imports for route-level splitting
- mobile can use root `@nxt1/ui` barrel imports where the app already does so
- Angular state uses private writable signals plus public computed signals
- every substantial feature is expected to include observability: analytics,
  structured logging, breadcrumbs, and performance tracing
- SSR safety is mandatory for web code
- new feature work is expected to include unit tests and Playwright coverage
  where applicable

The full rule set lives in
[.github/copilot-instructions.md](./.github/copilot-instructions.md).

## Quick Start

### Prerequisites

- Node.js 22.x
- npm 11+
- Firebase CLI for Firebase workflows
- Xcode for iOS development
- Android Studio for Android development

### Install

```bash
npm install
```

### Common Commands

| Command                  | Description                                           |
| ------------------------ | ----------------------------------------------------- |
| `npm run dev`            | Build shared packages, then start workspace dev tasks |
| `npm run dev:web`        | Start web app only                                    |
| `npm run dev:mobile`     | Start mobile app only                                 |
| `npm run dev:backend`    | Start backend only                                    |
| `npm run dev:all`        | Start web, mobile, and backend together               |
| `npm run build`          | Build packages and all workspaces                     |
| `npm run build:packages` | Build `@nxt1/core` and `@nxt1/ui`                     |
| `npm run typecheck`      | Run workspace typechecks                              |
| `npm run lint`           | Run workspace linting                                 |
| `npm run test`           | Run workspace tests                                   |
| `npm run e2e`            | Run web Playwright E2E suite                          |
| `npm run mobile:sync`    | Build and sync the mobile app to native projects      |

## Project Structure

```text
nxt1-monorepo/
├── apps/
│   ├── web/
│   ├── mobile/
│   └── functions/
├── backend/
├── packages/
│   ├── core/
│   ├── ui/
│   ├── cache/
│   ├── config/
│   ├── design-tokens/
│   └── shared-types/
├── docs/
├── roadmap/
├── scripts/
└── todo/
```

## Shared Package Boundaries

### `@nxt1/core`

Pure TypeScript shared code. Current feature areas include:

- platform and storage abstractions
- analytics, logging, performance, crashlytics, and testing helpers
- Agent X and AI contracts
- activity, explore, feed, help-center, invite, messages, posts, profile,
  scout-reports, settings, sport-landing, timeline, and usage feature modules
- validation, helpers, auth, cache, and SEO utilities

Do not add Angular, Ionic, browser-only, or Node-only code here.

### `@nxt1/ui`

Shared Angular/Ionic UI. Current top-level areas include:

- primitives in `components/`
- cross-platform services and infrastructure
- feature modules such as `agent-x`, `activity`, `auth`, `edit-profile`,
  `explore`, `feed`, `help-center`, `intel`, `invite`, `manage-team`,
  `messages`, `news`, `playbook`, `post-cards`, `profile`, `scout-reports`,
  `settings`, `team`, `team-profile`, and `usage`

Import behavior:

- web uses TypeScript path mappings like `@nxt1/ui/auth` and
  `@nxt1/ui/services/platform`
- mobile can use either granular imports or the root `@nxt1/ui` barrel
- `packages/ui/package.json` exports styles only; app code resolves
  component/module imports through workspace path mappings in
  [tsconfig.base.json](./tsconfig.base.json)

## Surface-Specific Docs

- [apps/web/README.md](./apps/web/README.md)
- [apps/mobile/README.md](./apps/mobile/README.md)
- [backend/README.md](./backend/README.md)
- [docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md)

## Documentation Map

- [docs/architecture/ARCHITECTURE.md](./docs/architecture/ARCHITECTURE.md) —
  monorepo architecture and sharing model
- [docs/backend/SERVICES.md](./docs/backend/SERVICES.md) — backend services,
  modules, and route ownership
- [docs/frontend/FEATURES.md](./docs/frontend/FEATURES.md) — frontend feature
  surfaces and shared UI modules
- [docs/frontend/DESIGN-SYSTEM.md](./docs/frontend/DESIGN-SYSTEM.md) — design
  system rules
- [docs/backend/FIREBASE-FUNCTIONS.md](./docs/backend/FIREBASE-FUNCTIONS.md) —
  cloud functions reference
- [roadmap/README.md](./roadmap/README.md) — future work and strategic plans
- [todo/README.md](./todo/README.md) — active execution items

## Testing Expectations

- unit tests use Vitest across packages and apps
- web end-to-end tests use Playwright in [apps/web/e2e](./apps/web/e2e)
- feature work should include test IDs, unit coverage, and E2E coverage when the
  feature has user-facing flows

Use the surface-specific READMEs for exact local commands.

## Deployment Model

- web deploys through Firebase App Hosting
- backend deploys separately via GitHub Actions over SSH and runs under PM2
- functions deploy separately from `apps/functions`
- mobile uses Angular/Capacitor builds plus native project distribution

## Troubleshooting

### Shared package resolution issues

```bash
npm run build:packages
```

### Cache issues

```bash
npm run clean:cache
npm run clean
npm install
```

### iOS native dependency issues

```bash
cd apps/mobile/ios && pod install
```

## License

Proprietary. All rights reserved.
