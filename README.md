# NXT1 Monorepo

> Professional sports platform with unified web, mobile, and backend
> architecture.

<!-- CI/CD Pipeline verified -->

[![CI](https://github.com/nxt1/nxt1-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/nxt1/nxt1-workspace/actions/workflows/ci.yml)
[![Deploy](https://github.com/nxt1/nxt1-workspace/actions/workflows/deploy.yml/badge.svg)](https://github.com/nxt1/nxt1-workspace/actions/workflows/deploy.yml)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         APPLICATIONS                            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Mobile        │   Web           │   Functions                 │
│   (Capacitor)   │   (Angular)     │   (Firebase)                │
│   iOS/Android   │   SSR-enabled   │   Triggers/Cron             │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                          BACKEND                                 │
│                      Express API                                │
│                   (TypeScript, Cloud Run)                        │
├─────────────────────────────────────────────────────────────────┤
│                     SHARED PACKAGES                              │
├──────────────────────────┬──────────────────────────────────────┤
│   @nxt1/core             │   @nxt1/config                       │
│   Pure TypeScript        │   ESLint, TypeScript, Prettier       │
│   Models, API, Helpers   │   Shared configurations              │
└──────────────────────────┴──────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 10.0.0
- **Xcode** (for iOS development)
- **Android Studio** (for Android development)
- **Firebase CLI** (`npm install -g firebase-tools`)

### Installation

```bash
# Clone the repository
git clone https://github.com/nxt1/nxt1-workspace.git
cd nxt1-workspace/monorepo

# Install all dependencies
npm install

# Build core package first
npm run build:core

# Start development servers
npm run dev:all
```

### Development Commands

| Command               | Description                                   |
| --------------------- | --------------------------------------------- |
| `npm run dev`         | Start all development servers with build dist |
| `npm run dev:web`     | Start web app only                            |
| `npm run dev:backend` | Start backend only                            |
| `npm run dev:all`     | Start web + backend + mobile in parallel      |
| `npm run build`       | Build all packages                            |
| `npm run test`        | Run all tests                                 |
| `npm run lint`        | Lint all packages                             |
| `npm run format`      | Format all files with Prettier                |

### Mobile Development

```bash
# Build and sync mobile app
npm run mobile:sync

# Run on iOS
npm run mobile:ios

# Run on Android
npm run mobile:android
```

## Project Structure

```
monorepo/
├── packages/
│   ├── core/                 # @nxt1/core - Shared TypeScript library
│   │   ├── src/
│   │   │   ├── constants/    # App-wide constants (sports, roles, etc.)
│   │   │   ├── models/       # TypeScript interfaces
│   │   │   ├── api/          # Pure API function factories
│   │   │   ├── helpers/      # Utility functions
│   │   │   └── validation/   # Input validation
│   │   └── package.json
│   │
│   └── config/               # @nxt1/config - Shared configs
│       ├── eslint/           # ESLint configurations
│       ├── typescript/       # TypeScript configurations
│       └── prettier/         # Prettier configuration
│
├── apps/
│   ├── web/                  # Angular web application
│   │   ├── src/
│   │   │   └── app/          # Angular components/services
│   │   ├── angular.json
│   │   └── package.json
│   │
│   ├── mobile/               # Ionic Capacitor mobile app
│   │   ├── src/
│   │   ├── ios/              # iOS native project
│   │   ├── android/          # Android native project
│   │   └── capacitor.config.json
│   │
│   └── functions/            # Firebase Cloud Functions
│       ├── src/
│       │   └── index.ts      # Function definitions
│       └── package.json
│
├── backend/                  # Express API server
│   ├── src/
│   │   ├── routes/           # API routes
│   │   ├── middleware/       # Express middleware
│   │   └── utils/            # Backend utilities
│   └── package.json
│
├── .github/
│   └── workflows/            # GitHub Actions CI/CD
│
├── turbo.json                # Turborepo configuration
└── package.json              # Root workspace config
```

## Package Details

### @nxt1/core

Pure TypeScript library with **zero platform dependencies**. 100% portable to
web, mobile, and backend.

```typescript
// Import shared types
import type { UserV2, ProfileStats, ApiResponse } from '@nxt1/core';

// Import validation
import { validateRegistration, isValidEmail } from '@nxt1/core';

// Import constants
import { SPORTS, USER_ROLES, SUBSCRIPTION_TIERS } from '@nxt1/core';

// Import helpers
import { formatRelativeTime, slugify, debounce } from '@nxt1/core';

// Import API factory (for services)
import { createAuthApi, createProfileApi } from '@nxt1/core';
```

### apps/web (Angular)

- Angular 21 with standalone components
- Ionic UI components for unified design
- Server-Side Rendering (SSR) enabled
- Signal-based state management

### apps/mobile (Capacitor)

- Ionic 8 + Capacitor 7
- Shared components with web
- Native iOS/Android builds
- Push notifications support

### backend (Express)

- Express 5 with TypeScript
- Firebase Admin SDK
- Stripe payment integration
- REST API with JWT auth

### apps/functions (Firebase)

- Firebase Cloud Functions v2
- Firestore triggers
- Scheduled tasks
- Callable functions

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feat/my-feature
```

### 2. Make Changes

The monorepo uses **Turborepo** for build orchestration with intelligent
caching.

```bash
# Watch mode for development
npm run dev:web

# Changes to @nxt1/core automatically trigger rebuilds
```

### 3. Commit with Conventional Commits

```bash
# Commit format: type(scope): description
git commit -m "feat(core): add new validation function"
git commit -m "fix(web): resolve routing issue"
git commit -m "docs(readme): update installation steps"
```

**Commit Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructuring
- `perf` - Performance improvement
- `test` - Tests
- `build` - Build changes
- `ci` - CI/CD changes
- `chore` - Other changes

**Scopes:**

- `core` - @nxt1/core package
- `web` - Web application
- `mobile` - Mobile application
- `backend` - Backend API
- `functions` - Cloud Functions
- `config` - Configuration package

### 4. Create Pull Request

Pull requests trigger:

- Linting
- Type checking
- Unit tests
- E2E tests (Playwright)
- Build verification

### 5. Merge and Deploy

Merging to `main` automatically deploys to staging. Use `workflow_dispatch` for
production deployments.

## Environment Variables

### Backend (.env)

```env
# Firebase
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Server
PORT=3000
NODE_ENV=development
```

### Web (environment.ts)

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/v1',
  firebase: {
    apiKey: '...',
    authDomain: '...',
    projectId: '...',
  },
};
```

## Mobile Setup

### iOS (requires macOS)

1. Install Xcode from App Store
2. Install CocoaPods: `sudo gem install cocoapods`
3. Run: `npm run mobile:ios`

### Android

1. Install Android Studio
2. Configure Android SDK
3. Run: `npm run mobile:android`

## Testing

```bash
# Run all tests
npm run test

# Run specific package tests
npm run test:web
npm run test:core

# Run E2E tests
cd apps/web && npm run test:e2e
```

## Deployment

### Staging (Automatic)

Push to `main` → Auto-deploys to staging

### Production (Manual)

```bash
# Via GitHub Actions
# Go to Actions → Deploy → Run workflow → Select 'production'
```

### Manual Deployment

```bash
# Deploy web
cd apps/web && npm run deploy

# Deploy backend
cd backend && npm run deploy:prod

# Deploy functions
cd apps/functions && npm run deploy:prod
```

## Additional Documentation

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Detailed architecture guide
- [CONTRIBUTING.md](./docs/CONTRIBUTING.md) - Contribution guidelines
- [API.md](./docs/API.md) - API documentation
- [MOBILE.md](./docs/MOBILE.md) - Mobile development guide

## Troubleshooting

### "Cannot find module '@nxt1/core'"

Build the core package first:

```bash
npm run build:core
```

### Turborepo cache issues

```bash
npm run clean:cache
npm run clean
npm install
```

### iOS build fails

```bash
cd apps/mobile/ios && pod install
```

## License

Proprietary - All Rights Reserved

---

Built with love by the NXT1 Team
