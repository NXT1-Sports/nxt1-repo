# Frontend Features Overview

This document maps the current frontend feature surfaces across shared UI, the
Angular SSR web app, and the Ionic mobile app.

## Frontend Layers

```text
packages/ui/        Shared Angular/Ionic UI, services, infrastructure
apps/web/           Angular SSR web composition and web-only infrastructure
apps/mobile/        Ionic/Capacitor composition and native integrations
packages/core/      Shared contracts, helpers, API factories, analytics, testing
```

## Shared UI Package

Current feature directories under `packages/ui/src/`:

```text
activity/         auth/            edit-profile/   help-center/
agent-x/          explore/         feed/           invite/
manage-team/      messages/        news/           onboarding/
profile/          scout-reports/   settings/       team/
team-profile/     usage/           intel/          playbook/
post-cards/       athlete-profiles/legal/         qr-code/
components/       services/        infrastructure/ styles/
```

This is where most shared frontend behavior lives:

- reusable UI primitives in `components/`
- cross-platform services in `services/`
- interceptors and global app infrastructure in `infrastructure/`
- feature shells and feature-local UI in the feature directories above

## Web App Features

The web app composes shared UI from `@nxt1/ui/*` and adds SSR-specific routing
and infrastructure.

Current primary route feature directories under `apps/web/src/app/features/`
include:

- `activity`
- `add-sport`
- `agent-x`
- `auth`
- `explore`
- `help-center`
- `invite`
- `join`
- `messages`
- `profile`
- `pulse`
- `settings`
- `team`
- `usage`

Web-specific responsibilities:

- Angular SSR route composition
- SEO metadata and sitemap integration
- browser-only sharing, push, and upload helpers
- app-level shell composition and public-route rendering decisions

See [../../apps/web/README.md](../../apps/web/README.md) for route maps, testing
commands, and observability specifics.

## Mobile App Features

The mobile app composes shared UI from `@nxt1/ui` and adds native routing,
device integration, and mobile-only flows.

Current primary route feature directories under `apps/mobile/src/app/features/`
include:

- `activity`
- `add-sport`
- `agent-x`
- `auth`
- `dev-settings`
- `explore`
- `help-center`
- `invite`
- `join`
- `messages`
- `profile`
- `pulse`
- `settings`
- `team`
- `usage`

Mobile-specific responsibilities:

- `IonRouterOutlet` shell composition
- Capacitor wrappers for push, deep links, haptics, biometrics, share, and
  in-app purchases
- mobile auth flow and native app lifecycle handling

See [../../apps/mobile/README.md](../../apps/mobile/README.md) for the canonical
mobile breakdown.

## Shared Service Pattern

Across web and mobile, feature services should:

- keep writeable signals private
- expose computed signals publicly
- use backend APIs as the source of truth
- include logging, analytics, breadcrumbs, and performance tracing on
  substantial feature work

## Styling And Design

Frontend styling guidance lives in:

- [DESIGN-SYSTEM.md](./DESIGN-SYSTEM.md)
- [TAILWIND-BEST-PRACTICES.md](./TAILWIND-BEST-PRACTICES.md)
- [SEO-IMPLEMENTATION.md](./SEO-IMPLEMENTATION.md)
- [SKELETON-LOADER-SYSTEM.md](./SKELETON-LOADER-SYSTEM.md)

## Guidance

When frontend feature structure changes:

- update this overview if a feature is added, removed, or renamed
- update the app-specific README if routing, deployment, testing, or platform
  behavior changes
- update the design-system docs only when styling rules or tokens change
  materially
