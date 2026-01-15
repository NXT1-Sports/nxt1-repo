# @nxt1/ui

Shared Angular/Ionic UI components and services for NXT1 platform.  
**~90% code sharing** between web and mobile applications.

## 📦 What's Inside

### Auth UI Components

```typescript
import {
  AuthShellComponent,
  AuthEmailFormComponent,
  AuthSocialButtonsComponent,
  AuthDividerComponent,
} from '@nxt1/ui/auth';
```

Complete authentication UI ready to use in any Angular/Ionic app.

### Shared Components

```typescript
import { NxtLogoComponent, RefreshContainerComponent } from '@nxt1/ui/shared';
```

Reusable UI components that work across platforms.

### Directives

```typescript
import {
  HapticButtonDirective,
  HapticSelectionDirective,
} from '@nxt1/ui/services';
```

Automatic haptic feedback on user interactions.

### UI Services

```typescript
import {
  NxtPlatformService,
  NxtToastService,
  HapticsService,
} from '@nxt1/ui/services';
```

Platform detection, notifications, and tactile feedback.

---

## 🚀 Installation

```bash
# In workspace (already installed via tsconfig paths)
# Import directly from @nxt1/ui

# Peer dependencies (must be installed)
npm install @angular/core@^21.0.0
npm install @ionic/angular@^8.0.0
```

---

## 💡 Usage Examples

### 1. Auth Shell (Complete Login/Signup UI)

```typescript
import { Component } from '@angular/core';
import { AuthShellComponent, AuthEmailFormComponent } from '@nxt1/ui/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [AuthShellComponent, AuthEmailFormComponent],
  template: `
    <nxt1-auth-shell variant="card" [showLogo]="true">
      <h1 authTitle>Welcome back</h1>
      <p authSubtitle>Sign in to continue to NXT1</p>

      <nxt1-auth-email-form
        mode="login"
        [loading]="loading()"
        (submitForm)="onSubmit($event)"
      />
    </nxt1-auth-shell>
  `,
})
export class LoginComponent {
  loading = signal(false);

  async onSubmit(data: { email: string; password: string }) {
    this.loading.set(true);
    try {
      await this.authService.signIn(data);
      this.router.navigate(['/home']);
    } finally {
      this.loading.set(false);
    }
  }
}
```

### 2. Social Auth Buttons

```typescript
import { AuthSocialButtonsComponent } from '@nxt1/ui/auth';

@Component({
  template: `
    <nxt1-auth-social-buttons
      [loading]="socialLoading()"
      [providers]="['google', 'apple', 'microsoft']"
      (providerClick)="onSocialLogin($event)"
    />
  `,
})
export class SignupComponent {
  async onSocialLogin(provider: 'google' | 'apple' | 'microsoft') {
    await this.authService.signInWithProvider(provider);
  }
}
```

### 3. Platform Service (Device Detection)

```typescript
import { Component, inject } from '@angular/core';
import { NxtPlatformService } from '@nxt1/ui/services';

@Component({
  template: `
    <div class="responsive-layout">
      @if (platform.isMobile()) {
        <ion-header>
          <ion-toolbar>
            <ion-title>Mobile View</ion-title>
          </ion-toolbar>
        </ion-header>
      }

      @if (platform.isDesktop()) {
        <div class="sidebar">Desktop Navigation</div>
      }

      <main>
        Device: {{ platform.deviceType() }}<br />
        OS: {{ platform.os() }}<br />
        Native: {{ platform.isNative() ? 'Yes' : 'No' }}
      </main>
    </div>
  `,
})
export class HomeComponent {
  readonly platform = inject(NxtPlatformService);
}
```

### 4. Toast Notifications

```typescript
import { NxtToastService } from '@nxt1/ui/services';

@Component({...})
export class ProfileComponent {
  private readonly toast = inject(NxtToastService);

  async saveProfile() {
    try {
      await this.api.updateProfile(data);

      // Success toast
      this.toast.show('Profile updated successfully', {
        type: 'success',
        duration: 3000
      });
    } catch (error) {
      // Error toast
      this.toast.show('Failed to update profile', {
        type: 'error',
        duration: 5000
      });
    }
  }
}
```

### 5. Haptic Feedback

```typescript
import { HapticsService } from '@nxt1/ui/services';
import { HapticButtonDirective } from '@nxt1/ui/services';

@Component({
  imports: [HapticButtonDirective],
  template: `
    <!-- Automatic haptic on tap -->
    <ion-button nxtHaptic="medium">Submit</ion-button>

    <!-- Heavy haptic for destructive actions -->
    <ion-button nxtHaptic="heavy" (click)="delete()">Delete</ion-button>

    <!-- Success haptic -->
    <ion-button nxtHaptic="success" (click)="save()">Save</ion-button>
  `,
})
export class FormComponent {
  private readonly haptics = inject(HapticsService);

  async onSuccess() {
    // Programmatic haptic
    await this.haptics.notification('success');
  }
}
```

### 6. Logo Component

```typescript
import { NxtLogoComponent } from '@nxt1/ui/shared';

@Component({
  imports: [NxtLogoComponent],
  template: `
    <!-- Default size -->
    <nxt1-logo />

    <!-- Custom size -->
    <nxt1-logo size="large" />

    <!-- Monochrome variant -->
    <nxt1-logo variant="monochrome" />
  `
})
```

---

## 🎨 Available Components

### Auth Package (`@nxt1/ui/auth`)

| Component                    | Description                                              |
| ---------------------------- | -------------------------------------------------------- |
| `AuthShellComponent`         | Full-page auth layout with logo and card/page variants   |
| `AuthEmailFormComponent`     | Email/password form with validation (login/signup modes) |
| `AuthSocialButtonsComponent` | Google, Apple, Microsoft sign-in buttons                 |
| `AuthDividerComponent`       | "OR" divider for separating auth methods                 |

### Shared Package (`@nxt1/ui/shared`)

| Component                   | Description                             |
| --------------------------- | --------------------------------------- |
| `NxtLogoComponent`          | NXT1 logo with size/variant options     |
| `RefreshContainerComponent` | Pull-to-refresh wrapper for ion-content |

### Directives (`@nxt1/ui/services`)

| Directive                  | Description                             |
| -------------------------- | --------------------------------------- |
| `HapticButtonDirective`    | Auto-trigger haptic feedback on buttons |
| `HapticSelectionDirective` | Haptic for toggles and selections       |

---

## 🛠️ Services API

### NxtPlatformService

```typescript
// Device Type
readonly deviceType: Signal<'desktop' | 'tablet' | 'mobile'>
readonly isMobile: Signal<boolean>
readonly isTablet: Signal<boolean>
readonly isDesktop: Signal<boolean>

// Operating System
readonly os: Signal<'ios' | 'android' | 'windows' | 'macos' | 'linux'>
readonly isIOS: Signal<boolean>
readonly isAndroid: Signal<boolean>

// Platform
readonly isNative: Signal<boolean>
readonly isWeb: Signal<boolean>

// Orientation
readonly orientation: Signal<'portrait' | 'landscape'>
readonly isPortrait: Signal<boolean>
readonly isLandscape: Signal<boolean>

// Capabilities
readonly capabilities: Signal<PlatformCapabilities>

// Viewport
readonly viewportInfo: Signal<ViewportInfo>
readonly width: Signal<number>
readonly height: Signal<number>
```

### NxtToastService

```typescript
// Show toast
show(message: string, options?: ToastOptions): Promise<void>

// Toast types
type ToastType = 'success' | 'error' | 'warning' | 'info';

// Toast positions
type ToastPosition = 'top' | 'bottom' | 'middle';

// Options
interface ToastOptions {
  type?: ToastType;
  duration?: number;
  position?: ToastPosition;
  action?: ToastAction;
}
```

### HapticsService

```typescript
// Impact feedback (button taps)
impact(style: 'light' | 'medium' | 'heavy'): Promise<void>

// Notification feedback (success/error/warning)
notification(type: 'success' | 'warning' | 'error'): Promise<void>

// Selection feedback (toggles, pickers)
selection(): Promise<void>

// Availability
readonly isAvailable: Signal<boolean>
```

---

## 📁 Package Structure

```
packages/ui/
├── src/
│   ├── index.ts                    # Root export (components)
│   ├── auth/                       # Authentication UI
│   │   ├── auth-shell/
│   │   ├── auth-email-form/
│   │   ├── auth-social-buttons/
│   │   └── auth-divider/
│   ├── shared/                     # General components
│   │   ├── logo/
│   │   └── refresh-container/
│   ├── services/                   # UI Services
│   │   ├── platform/               # NxtPlatformService
│   │   ├── toast/                  # NxtToastService
│   │   └── haptics/                # HapticsService + directives
│   └── styles/                     # Shared styles (future)
├── auth/                           # Secondary entry point
│   └── ng-package.json
├── shared/                         # Secondary entry point
│   └── ng-package.json
├── services/                       # Secondary entry point
│   └── ng-package.json
└── dist/                           # Compiled output
```

---

## 🎯 Design Principles

### 1. Platform Agnostic (Where Possible)

Components work identically on web and mobile:

```typescript
// Same code, different platforms
<nxt1-auth-shell>
  <nxt1-auth-email-form />
</nxt1-auth-shell>
```

### 2. Standalone Components

All components are standalone (no NgModules):

```typescript
@Component({
  standalone: true,
  imports: [CommonModule, IonicModule],
})
export class AuthShellComponent {}
```

### 3. Signal-Based State

Using Angular signals for reactive state:

```typescript
readonly isLoading = signal(false);
readonly deviceType = computed(() => this.platform.deviceType());
```

### 4. Minimal Dependencies

Only depends on:

- `@angular/core` and `@angular/common`
- `@ionic/angular`
- `@nxt1/core` (types only)

No heavy dependencies that slow down builds.

---

## 🏗️ Building

This library is built with **ng-packagr** and outputs Angular Package Format
(APF).

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

## 🏗️ Building

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

---

## 🔄 Version Compatibility

| @nxt1/ui | Angular | Ionic | @nxt1/core |
| -------- | ------- | ----- | ---------- |
| 1.1.x    | ^21.0   | ^8.0  | ^2.0       |
| 1.0.x    | ^19-21  | ^8.0  | ^1.0       |

---

## 🧪 Testing

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthShellComponent } from '@nxt1/ui/auth';

describe('AuthShellComponent', () => {
  let component: AuthShellComponent;
  let fixture: ComponentFixture<AuthShellComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthShellComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AuthShellComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

---

## 📝 Contributing

### Adding New Components

```bash
# 1. Create component in appropriate folder
packages/ui/src/shared/new-component/
├── new-component.component.ts
├── new-component.component.html
├── new-component.component.scss
└── index.ts

# 2. Export from parent index
# packages/ui/src/shared/index.ts
export { NewComponent } from './new-component';

# 3. Re-export from secondary entry point if needed
# packages/ui/shared/ng-package.json already configured
```

### Style Guidelines

- ✅ Use Ionic components when possible
- ✅ Follow Angular style guide
- ✅ Use signals for state
- ✅ Standalone components only
- ✅ `OnPush` change detection
- ✅ Comprehensive JSDoc comments

---

## 📜 License

Proprietary - NXT1 Platform  
© 2026 NXT1. All rights reserved.

---

## 🔗 Related Packages

- **[@nxt1/core](../core/README.md)** - Pure TypeScript shared library
- **[@nxt1/design-tokens](../design-tokens/README.md)** - Design system tokens
- **[Web App](../../apps/web/README.md)** - Angular SSR web application
- **[Mobile App](../../apps/mobile/README.md)** - Ionic/Capacitor mobile app

---

## 🆘 Support

For questions or issues:

- **Internal:** #engineering on Slack
- **Documentation:** [/docs/DESIGN-SYSTEM.md](../../docs/DESIGN-SYSTEM.md)
