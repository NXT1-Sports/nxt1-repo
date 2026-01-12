# @nxt1/ui

Shared Angular/Ionic UI components for the NXT1 platform.

## Overview

This package contains **platform-specific UI components** that use Angular and
Ionic Framework. These components are designed to work seamlessly across web,
iOS, and Android platforms.

> **Note**: For pure TypeScript utilities, types, and API functions, use
> `@nxt1/core` instead.

## Architecture

```
@nxt1/ui (this package)
├── Depends on @nxt1/core for types, helpers, validation
├── Depends on @nxt1/design-tokens for styling
└── Requires Angular + Ionic as peer dependencies

@nxt1/core (pure TypeScript)
├── NO Angular/Ionic/browser dependencies
├── 100% portable to any JavaScript environment
└── Can be used in backend, functions, mobile, web
```

## Building

This library is built with **ng-packagr** and outputs Angular Package Format
(APF).

```bash
# Build the library
npm run build:ui

# Build in watch mode (development)
cd packages/ui && npm run build:watch
```

The build outputs to `dist/` with:

- ESM2022 bundles (tree-shakable)
- FESM2022 bundles (flat ESM)
- Type definitions (.d.ts)
- Source maps

## Installation

```bash
# In the monorepo
npm install

# Or in a consuming app
npm install @nxt1/ui @nxt1/core @nxt1/design-tokens
```

## Usage

### Import from Secondary Entry Points (Recommended)

For optimal tree-shaking, import from specific entry points:

```typescript
// Auth components
import { AuthShellComponent, AuthEmailFormComponent } from '@nxt1/ui/auth';

// Shared components
import { NxtLogoComponent } from '@nxt1/ui/shared';

// Services
import { NxtPlatformService } from '@nxt1/ui/services';
```

### Auth Components

```html
<!-- Login page example -->
<nxt1-auth-shell variant="card" [showLogo]="true">
  <h1 authTitle>Welcome back</h1>
  <p authSubtitle>Sign in to continue</p>

  <nxt1-auth-social-buttons
    (googleClick)="signInWithGoogle()"
    (appleClick)="signInWithApple()"
  />

  <nxt1-auth-divider text="or" />

  <nxt1-auth-email-form
    mode="login"
    [loading]="loading()"
    [error]="error()"
    (submitForm)="onSubmit($event)"
  />

  <p authFooter>Don't have an account? <a routerLink="/signup">Sign up</a></p>
</nxt1-auth-shell>
```

### Logo Component

```html
<!-- Basic usage -->
<nxt1-logo />

<!-- With size variant -->
<nxt1-logo size="lg" />

<!-- Auth page variant -->
<nxt1-logo variant="auth" />
```

### Platform Service

```typescript
import { NxtPlatformService } from '@nxt1/ui/services';

@Component({...})
export class MyComponent {
  private platform = inject(NxtPlatformService);

  // Use reactive signals
  isMobile = this.platform.isMobile;
  isIOS = this.platform.isIOS;

  async doSomething() {
    // Haptic feedback
    await this.platform.hapticFeedback('light');
  }
}
```

## Components Reference

### Shared Components

| Component          | Selector      | Description                               |
| ------------------ | ------------- | ----------------------------------------- |
| `NxtLogoComponent` | `<nxt1-logo>` | NXT1 brand logo with size/variant options |

### Auth Components

| Component                    | Selector                     | Description                            |
| ---------------------------- | ---------------------------- | -------------------------------------- |
| `AuthShellComponent`         | `<nxt1-auth-shell>`          | Full-page auth layout shell            |
| `AuthSocialButtonsComponent` | `<nxt1-auth-social-buttons>` | Google, Apple, Microsoft login buttons |
| `AuthEmailFormComponent`     | `<nxt1-auth-email-form>`     | Email/password form with validation    |
| `AuthDividerComponent`       | `<nxt1-auth-divider>`        | "OR" divider between auth options      |

### Services

| Service              | Description                                |
| -------------------- | ------------------------------------------ |
| `NxtPlatformService` | Platform detection, viewport info, haptics |

## Development

```bash
# Build the package
pnpm --filter @nxt1/ui build

# Watch mode
pnpm --filter @nxt1/ui build:watch

# Lint
pnpm --filter @nxt1/ui lint
```

## Dependencies

- `@nxt1/core` - Types, helpers, validation
- `@nxt1/design-tokens` - Design system tokens and assets

## Peer Dependencies

- `@angular/common` ^19.0.0 || ^20.0.0 || ^21.0.0
- `@angular/core` ^19.0.0 || ^20.0.0 || ^21.0.0
- `@angular/forms` ^19.0.0 || ^20.0.0 || ^21.0.0
- `@ionic/angular` ^8.0.0
- `ionicons` ^7.0.0
