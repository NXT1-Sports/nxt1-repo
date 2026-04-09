# NXT1 Mobile Application

Native iOS and Android application built with Angular 21, Ionic 8, and
Capacitor. Shares ~95% of UI via `@nxt1/ui` and 100% of business logic via
`@nxt1/core`.

## Quick Start

```bash
# Development server in browser (http://localhost:4300)
npm run dev

# Build for production
npm run build

# Sync with native projects
npm run sync

# Run on iOS (requires Mac + Xcode)
npm run ios:dev

# Run on Android (requires Android Studio)
npm run android:dev

# Run unit tests (Vitest)
npm test

# Type checking
npm run typecheck
```

---

## Prerequisites

### iOS

- macOS + Xcode 15+
- CocoaPods (`sudo gem install cocoapods`)

### Android

- Android Studio + JDK 17 + Android SDK

### All Platforms

- Node.js 22+, npm 10+

---

## Project Structure

```
apps/mobile/
├── src/
│   ├── app/
│   │   ├── app.component.ts         # Root (IonApp + IonRouterOutlet)
│   │   ├── app.config.ts            # App providers & DI tokens
│   │   ├── app.routes.ts            # Route definitions
│   │   │
│   │   ├── core/                    # App-level infrastructure
│   │   │   ├── infrastructure/      # Error handling, HTTP, interceptors, storage
│   │   │   ├── layout/              # MobileShellComponent (tab bar shell)
│   │   │   └── services/            # All app services (centralized)
│   │   │       ├── api/             # Backend HTTP adapters
│   │   │       ├── auth/            # Auth, onboarding, biometrics
│   │   │       ├── infrastructure/  # Analytics, cache, crashlytics, network, perf
│   │   │       ├── native/          # Capacitor native wrappers
│   │   │       └── state/           # Profile state service
│   │   │
│   │   ├── features/               # Feature modules (lazy-loaded)
│   │   │   ├── activity/           # Notifications & activity feed
│   │   │   ├── add-sport/          # Add sport/team wizard
│   │   │   ├── agent-x/            # Agent X AI assistant
│   │   │   ├── auth/               # Login, signup, onboarding (guards, pages)
│   │   │   ├── dev-settings/       # Developer settings (non-prod)
│   │   │   ├── explore/            # Discovery & feed hub
│   │   │   ├── help-center/        # Help & support
│   │   │   ├── invite/             # Referral & sharing
│   │   │   ├── join/               # Invite link landing
│   │   │   ├── messages/           # Conversations
│   │   │   ├── profile/            # User profile
│   │   │   ├── pulse/              # Sports recruiting news
│   │   │   ├── settings/           # User settings
│   │   │   ├── team/               # Team pages
│   │   │   └── usage/              # Payment usage dashboard
│   │   │
│   │   └── legal/                  # Terms, privacy
│   │
│   ├── environments/               # Environment configs (dev, staging, prod)
│   ├── index.html
│   ├── main.ts                     # Entry point
│   └── styles.scss                 # Global styles
│
├── android/                        # Android native project
├── ios/                            # iOS native project
├── capacitor.config.json           # Capacitor configuration
├── angular.json                    # Angular CLI config
├── vitest.config.ts                # Unit test config
├── tailwind.config.js              # Tailwind CSS config
└── tsconfig.app.json               # TypeScript config
```

> **Key pattern**: All services live in `core/services/` (centralized),
> mirroring the web app's structure. Feature directories contain only routes,
> pages, guards, and feature-specific UI. No nested `services/` folders inside
> features.

---

## Architecture

### Routing

Auth routes render standalone (no shell). All authenticated routes are children
of `MobileShellComponent` which provides the bottom tab bar and sidenav.

```
/auth               → Login, signup, onboarding (no shell, no auth guard)
/join/:code         → Invite link landing (no shell, no auth guard)
/add-sport          → Sport/team wizard (standalone, auth guarded)
/                   → Redirects to /agent (Agent X)
/home               → Redirects to /explore
/explore            → Discovery & feed hub
/agent, /agent-x    → Agent X AI assistant
/activity           → Notifications
/messages           → Conversations
/profile            → User profile
/pulse              → Sports news
/settings           → User settings
/help-center        → Help & support
/team/:slug         → Team pages
/invite             → Referral
/usage              → Payment dashboard
/terms, /privacy    → Legal pages
/dev-settings       → Developer tools (non-prod)
```

Unlike the web app, mobile uses `authGuard` on the shell route — unauthenticated
users are redirected to `/auth`.

### Navigation

Mobile uses Ionic's navigation primitives — not Angular Router directly:

```typescript
// ✅ Shell/layout: IonRouterOutlet (not RouterOutlet)
<ion-router-outlet></ion-router-outlet>

// ✅ Programmatic nav: NavController (not Router)
await this.navController.navigateForward('/home');
await this.navController.navigateBack('/auth');
await this.navController.navigateRoot('/home');
```

### Lazy Loading

Every route uses `loadComponent` or `loadChildren`:

```typescript
{
  path: 'explore',
  loadChildren: () =>
    import('./features/explore/explore.routes').then((m) => m.EXPLORE_ROUTES),
},
```

---

## Core Services

All services are centralized in `core/services/`:

| Directory         | Purpose                     | Key Files                                                                                                                                       |
| ----------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`           | Authentication & onboarding | `auth-flow.service.ts`, `firebase-auth.service.ts`, `native-auth.service.ts`, `biometric.service.ts`, `onboarding.service.ts`                   |
| `api/`            | Backend API adapters        | `profile-api.service.ts`, `feed-api.service.ts`, `settings-api.service.ts`, `edit-profile-api.service.ts`                                       |
| `infrastructure/` | Observability               | `analytics.service.ts`, `crashlytics.service.ts`, `performance.service.ts`, `network.service.ts`, `cache.service.ts`                            |
| `native/`         | Capacitor native wrappers   | `native-app.service.ts`, `push-handler.service.ts`, `fcm-registration.service.ts`, `deep-link.service.ts`, `iap.service.ts`, `share.service.ts` |
| `state/`          | Cross-feature state         | `profile.service.ts`                                                                                                                            |

---

## Native Plugins

Key Capacitor plugins used:

| Plugin                       | Purpose                 |
| ---------------------------- | ----------------------- |
| `@capacitor/app`             | App state & lifecycle   |
| `@capacitor/haptics`         | Haptic feedback         |
| `@capacitor/keyboard`        | Keyboard control        |
| `@capacitor/network`         | Connectivity monitoring |
| `@capacitor/preferences`     | Key-value storage       |
| `@capacitor/splash-screen`   | Splash screen           |
| `@capacitor/status-bar`      | Status bar control      |
| `@capacitor/camera`          | Camera access           |
| `@capacitor/filesystem`      | File system             |
| `@capacitor/share`           | Share dialog            |
| `capacitor-native-biometric` | Face ID / Touch ID      |

---

## Building for Production

### iOS

```bash
npm run build
npx cap sync ios
npx cap open ios
# In Xcode: Product → Archive → Distribute App
```

### Android

```bash
npm run build
npx cap sync android
npx cap open android
# In Android Studio: Build → Generate Signed Bundle / APK
```

### Staging Debug (on-device with staging backend)

```bash
npm run ios:staging-debug
```

---

## Testing

### Unit Tests (Vitest)

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

---

## Environments

- `src/environments/environment.ts` — Development (auto-detects local IP)
- `src/environments/environment.staging.ts` — Staging
- `src/environments/environment.prod.ts` — Production

Firebase config auto-switches per environment via `npm run auto:firebase`.

---

## Common Issues

### iOS Build Fails

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/*
cd ios/App && pod deintegrate && pod install
npx cap sync ios
```

### Android Build Fails

```bash
cd android && ./gradlew clean
# File → Invalidate Caches → Invalidate and Restart
```

### Capacitor Sync Issues

```bash
npx cap sync --force
```
