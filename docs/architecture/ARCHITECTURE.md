# NXT1 Architecture Guide

This document describes the current monorepo architecture, package boundaries,
and code-sharing strategy used by NXT1 as of June 2026.

## Architecture Principles

### Backend Is The Source Of Truth

The backend owns:

- business logic and validation
- data aggregation, filtering, sorting, and pagination
- AI orchestration and Agent X execution
- auth enforcement, rate limiting, billing, and third-party integrations
- cache policy, background jobs, and expensive processing

The frontend owns:

- UI rendering and adaptive layouts
- user input collection
- optimistic UX and local state
- platform-native navigation and interaction patterns

### Shared Code Must Respect Package Boundaries

```text
┌─────────────────────────────────────────────────────────────┐
│                    @nxt1/core (portable)                   │
│      Types, API factories, helpers, analytics, testing     │
├─────────────────────────────────────────────────────────────┤
│                     @nxt1/ui (shared UI)                   │
│  Angular/Ionic components, services, infrastructure, UX    │
├────────────────────────┬────────────────────────────────────┤
│      apps/web          │          apps/mobile              │
│     SSR + SEO          │    native UX + Capacitor          │
└────────────────────────┴────────────────────────────────────┘
```

### Share Logic Aggressively, UI Selectively

NXT1 prefers shared feature services and typed contracts, while allowing web-
and mobile-specific shells where SSR, routing, or native affordances differ.

## Monorepo Layout

```text
nxt1-workspace/
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
└── scripts/
```

## Package Structure

### @nxt1/core

`@nxt1/core` is pure TypeScript with zero Angular, Ionic, browser, or
Node-specific runtime requirements.

Current top-level directories under `packages/core/src/`:

```text
activity/        auth/            edit-profile/    help-center/
ai/              browser/         errors/          helpers/
analytics/       cache/           explore/         intel/
api/             constants/       feed/            invite/
content-card/    crashlytics/     flags/           live-update/
logging/         manage-team/     messages/        models/
news/            onboarding/      performance/     platform/
platforms/       posts/           profile/         scout-reports/
seo/             settings/        sport-landing/   storage/
team-profile/    testing/         timeline/        usage/
validation/
```

Use `@nxt1/core` for:

- typed request/response contracts
- feature API factory functions
- constants, analytics events, and trace names
- storage abstractions and helpers
- validation, error parsing, and test IDs

Do not put these in `@nxt1/core`:

- Angular or Ionic imports
- direct browser globals like `window`, `document`, or `localStorage`
- Node-specific runtime code like `fs`, `path`, or Express middleware

### @nxt1/ui

`@nxt1/ui` contains shared Angular/Ionic UI primitives, feature shells,
services, and infrastructure.

Current top-level directories under `packages/ui/src/`:

```text
activity/          auth/              infrastructure/    playbook/
agent-x/           components/        intel/             post-cards/
athlete-profiles/  edit-profile/      invite/            profile/
explore/           feed/              legal/             qr-code/
help-center/       manage-team/       messages/          scout-reports/
news/              onboarding/        services/          settings/
styles/            team/              team-profile/      usage/
```

This package also includes testing support via `__vitest__/` and
`test-setup.ts`.

Use `@nxt1/ui` for:

- reusable components such as icons, logos, avatars, sheets, nav, and headers
- shared feature-level UI and shells
- cross-platform Angular services like logging, breadcrumbs, and theme handling
- infrastructure such as interceptors and global error handling

## Import Strategy

### @nxt1/core Imports

`tsconfig.base.json` maps both the root barrel and sub-path barrels:

```typescript
import { createFeedApi, CACHE_CONFIG } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { TEST_IDS } from '@nxt1/core/testing';
```

### @nxt1/ui Imports

The important implementation detail is:

- web code splitting is driven by `tsconfig.base.json` path mappings such as
  `@nxt1/ui/auth`, `@nxt1/ui/services`, and `@nxt1/ui/*`
- `packages/ui/package.json` exports styles only; it does not define component
  subpath exports for the workspace apps
- mobile may still use the root `@nxt1/ui` barrel where that pattern is already
  established

Examples:

```typescript
// Preferred in web
import { AuthShellComponent } from '@nxt1/ui/auth';
import { NxtPlatformService } from '@nxt1/ui/services/platform';

// Valid in mobile
import { AuthShellComponent, HapticsService } from '@nxt1/ui';
```

## Application Surfaces

### apps/web

The web app is an Angular 22 SSR application.

- every route renders server-side
- route features live in `apps/web/src/app/features/`
- app-level infrastructure and API adapters live in
  `apps/web/src/app/core/services/`
- deployment target is Firebase App Hosting

See [../../apps/web/README.md](../../apps/web/README.md) for the authoritative
app-specific breakdown.

### apps/mobile

The mobile app is an Ionic 8 + Capacitor 8 application.

- routing uses `IonRouterOutlet` and `NavController`
- native wrappers live in `apps/mobile/src/app/core/services/native/`
- feature pages live in `apps/mobile/src/app/features/`
- iOS and Android native projects are committed under `apps/mobile/ios` and
  `apps/mobile/android`

See [../../apps/mobile/README.md](../../apps/mobile/README.md) for the
authoritative mobile breakdown.

### apps/functions

Cloud Functions Gen 2 live under `apps/functions/src/` and handle triggers,
scheduled tasks, monitoring, email, notifications, and user events.

### backend

The backend is a standalone Express 5 API service with:

- route definitions in `backend/src/routes/`
- business services in `backend/src/services/`
- major self-contained modules in `backend/src/modules/`
- background workers in `backend/src/workers/`
- Agent X under `backend/src/modules/agent/`

See [../../backend/README.md](../../backend/README.md) and
[../backend/SERVICES.md](../backend/SERVICES.md) for backend detail.

## Shared Feature Strategy

NXT1 uses three levels of sharing:

### Level 1: Pure TypeScript In @nxt1/core

- feature contracts
- API factories
- analytics and performance constants
- helpers, validation, and error handling

### Level 2: Shared Angular/Ionic In @nxt1/ui

- components
- common services
- feature shells that can work on both web and mobile

### Level 3: Platform-Specific App Code

- SSR-only concerns on web
- native device integrations on mobile
- app-level bootstrapping, routing, and environment-specific infrastructure

## Service Pattern

Frontend feature services should use signal-based state with private writeable
signals and public computed accessors.

```typescript
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly _data = signal<Item[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly data = computed(() => this._data());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
}
```

## Observability Baseline

Every substantial feature is expected to wire:

- structured logging
- analytics events
- breadcrumbs or user journey tracking
- performance tracing

The detailed implementation contract lives in `.github/copilot-instructions.md`.

## Deployment Boundaries

- `apps/web` deploys through Firebase App Hosting
- `backend` deploys through GitHub Actions over SSH/PM2
- `apps/functions` deploy separately as Firebase Functions
- mobile ships through Capacitor native builds and OTA workflows where
  configured

## Related Docs

- [../../README.md](../../README.md)
- [../../apps/web/README.md](../../apps/web/README.md)
- [../../apps/mobile/README.md](../../apps/mobile/README.md)
- [../../backend/README.md](../../backend/README.md)
- [../frontend/FEATURES.md](../frontend/FEATURES.md)
- [../backend/SERVICES.md](../backend/SERVICES.md)
