# NXT1 Architecture Guide

This document provides a detailed overview of the NXT1 monorepo architecture,
design decisions, and patterns.

## Table of Contents

1. [Architecture Principles](#architecture-principles)
2. [Package Structure](#package-structure)
3. [Code Sharing Strategy](#code-sharing-strategy)
4. [Caching Strategy](#caching-strategy)
5. [Type Safety](#type-safety)
6. [Build System](#build-system)
7. [Deployment Strategy](#deployment-strategy)

---

## Architecture Principles

### 1. Maximum Code Reuse

The architecture is designed to maximize code sharing across all platforms:

```
┌─────────────────────────────────────────────────────────────┐
│                    @nxt1/core (100%)                        │
│   Types, Models, Validation, Helpers, API Functions         │
│   ⚡ Pure TypeScript - No framework dependencies            │
├─────────────────────────────────────────────────────────────┤
│                     @nxt1/ui (Adaptive)                     │
│   ┌───────────────────────────────────────────────────────┐ │
│   │  _shared/ (100%)     Services, state, business logic  │ │
│   ├───────────────────────────────────────────────────────┤ │
│   │  mobile/             Ionic components (native feel)   │ │
│   │  web/                Tailwind components (SSR-safe)   │ │
│   └───────────────────────────────────────────────────────┘ │
├────────────────────────┬────────────────────────────────────┤
│   apps/web (~5%)       │    apps/mobile (~5%)               │
│   SSR, PWA, SEO        │    Push, IAP, Biometrics           │
└────────────────────────┴────────────────────────────────────┘
```

### 2. Platform Independence

**@nxt1/core** contains **zero platform dependencies**:

✅ Allowed in @nxt1/core:

- Pure TypeScript
- Standard library (Math, Date, String methods)
- Type definitions

❌ Not allowed in @nxt1/core:

- Angular imports (`@angular/*`)
- Browser APIs (`window`, `document`, `localStorage`)
- Node.js APIs (`fs`, `path`, `http`)
- Firebase SDK directly

### 3. Layered Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                         │
│     Components (Angular/Ionic) - UI rendering, user input     │
├──────────────────────────────────────────────────────────────┤
│                      SERVICE LAYER                            │
│    Angular Services - Orchestration, state management         │
├──────────────────────────────────────────────────────────────┤
│                       API LAYER                               │
│      @nxt1/core - Pure functions, types, validation           │
├──────────────────────────────────────────────────────────────┤
│                   INFRASTRUCTURE LAYER                        │
│        HTTP Adapters, Firebase, Platform-specific code        │
└──────────────────────────────────────────────────────────────┘
```

---

## Package Structure

### @nxt1/core (Pure TypeScript)

The core library contains **zero platform dependencies** - pure TypeScript that
works everywhere:

```
packages/core/src/
├── index.ts              # Root barrel export
├── constants/            # Sport definitions, roles, notification types
├── models/               # User, Profile, Team, Network interfaces
│   ├── user.model.ts
│   ├── team.model.ts
│   ├── network.model.ts  # NetworkStatus, ConnectionType (shared types)
│   └── index.ts
├── api/                  # Pure API function factories (createAuthApi, etc.)
├── auth/                 # Auth types, state manager, guards, error handling
├── cache/                # Caching system (memory, LRU, persistent)
├── helpers/              # Date, string, validation utilities
├── validation/           # Schema validation for registration, profiles
├── platform/             # Platform detection (pure TypeScript)
├── storage/              # Storage adapters (browser, memory, capacitor)
├── seo/                  # SEO types and builders
└── analytics/            # Analytics event constants
```

✅ **Use @nxt1/core for:**

- Backend/Cloud Functions
- Any JavaScript environment
- Pure TypeScript logic shared everywhere

❌ **NOT in @nxt1/core:**

- Angular imports (`@angular/*`)
- Ionic imports (`@ionic/*`)
- Browser APIs (`window`, `document`)
- Node.js APIs (`fs`, `path`)

### @nxt1/ui (Angular/Ionic Components)

The UI library contains **shared Angular/Ionic components** for web and mobile:

```
packages/ui/src/
├── index.ts              # Root barrel export
├── shared/               # General-purpose components
│   └── logo/             # NxtLogoComponent
├── auth/                 # Authentication UI components
│   ├── auth-shell/       # AuthShellComponent - full-page auth layout
│   ├── auth-social-buttons/  # Google, Apple, Microsoft buttons
│   ├── auth-divider/     # "OR" divider
│   └── auth-email-form/  # Email/password form with validation
└── services/             # Angular injectable services
    └── platform/         # NxtPlatformService - device detection, haptics
```

✅ **Use @nxt1/ui for:**

- Web application (apps/web)
- Mobile application (apps/mobile)
- Cross-platform UI components

**Import Examples:**

```typescript
// ✅ CORRECT: Granular sub-path imports (optimal code splitting)
import { AuthShellComponent } from '@nxt1/ui/auth';
import { AuthEmailFormComponent } from '@nxt1/ui/auth/auth-email-form';
import { NxtPlatformService } from '@nxt1/ui/services/platform';

// ❌ AVOID: Root barrel import (defeats code splitting — bundles ALL 700+ symbols)
import { NxtLogoComponent, AuthShellComponent } from '@nxt1/ui';
```

---

## Adaptive Design Pattern (2026)

### Why Adaptive Design?

Different platforms have fundamentally different requirements:

| Requirement          | Web (SSR)                            | Mobile (Native)     |
| -------------------- | ------------------------------------ | ------------------- |
| **Rendering**        | Server-side (hydration-safe)         | Client-side only    |
| **Styling**          | Tailwind CSS (atomic) — **NO IONIC** | Ionic Shadow DOM    |
| **Navigation**       | Angular Router                       | Ionic NavController |
| **Native Features**  | N/A                                  | Haptics, push, IAP  |
| **Performance Goal** | SEO, First Contentful Paint          | 60fps, native feel  |

**Problem with "100% shared UI":** Ionic components use Shadow DOM which causes
SSR hydration mismatches, breaking SEO and performance.

**Solution:** Adaptive Design — Share business logic, platform-specific views.

**⚠️ CRITICAL:** Web components must use **ZERO Ionic imports**
(`@ionic/angular`) to avoid SSR hydration errors. Use pure Tailwind CSS instead.

### Folder Structure

```
packages/ui/src/[feature]/
├── _shared/                    ← 100% shared (services, state, types)
│   ├── [feature].service.ts    ← Signal-based state management
│   ├── [feature].types.ts      ← Feature-specific interfaces
│   └── index.ts                ← Barrel export
├── mobile/                     ← Native mobile (Ionic + Capacitor)
│   ├── [feature]-shell.component.ts
│   ├── [feature]-*.component.ts
│   └── index.ts
├── web/                        ← SSR-safe web (Pure Tailwind)
│   ├── [feature]-shell.component.ts
│   ├── [feature]-*.component.ts
│   └── index.ts
└── index.ts                    ← Main barrel (exports all)
```

### Example: Help Center

```
packages/ui/src/help-center/
├── _shared/
│   ├── help-center.service.ts  ← Signal-based state, search, filtering
│   └── index.ts
├── mobile/
│   ├── help-center-shell.component.ts  ← Uses Ionic: IonContent, IonList, etc.
│   └── index.ts
├── web/
│   ├── help-center-shell.component.ts          ← ⭐ ZERO Ionic — Pure Tailwind only
│   ├── help-center-category-detail.component.ts ← ⭐ ZERO Ionic — Pure Tailwind only
│   ├── help-center-article-detail.component.ts  ← ⭐ ZERO Ionic — Pure Tailwind only
│   └── index.ts
└── index.ts
```

**Key Point:** Web components import **zero Ionic modules**. They use:

- ✅ `CommonModule`, `FormsModule`, `RouterModule` (Angular)
- ✅ Tailwind utility classes for all styling
- ✅ CSS custom properties from design tokens
- ❌ NO `@ionic/angular` imports (causes SSR hydration errors)

### Import Patterns

```typescript
// Web app — imports web-specific components via granular sub-paths
import {
  HelpCenterService,
  HelpCenterShellWebComponent,
  HelpCategoryDetailWebComponent,
} from '@nxt1/ui/help-center';

// Mobile app — imports mobile-specific components via granular sub-paths
import {
  HelpCenterService,
  HelpCenterShellMobileComponent,
} from '@nxt1/ui/help-center';
```

### Service Pattern (100% Shared)

```typescript
// packages/ui/src/[feature]/_shared/[feature].service.ts
@Injectable({ providedIn: 'root' })
export class FeatureService {
  // Private writeable signals
  private readonly _data = signal<Item[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // Public readonly computed signals
  readonly data = computed(() => this._data());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly isEmpty = computed(() => this._data().length === 0);

  // Business logic methods
  async loadData(): Promise<void> {
    /* ... */
  }
  setFilter(filter: string): void {
    /* ... */
  }
}
```

### Web Component Pattern (SSR-Safe)

```typescript
// packages/ui/src/[feature]/web/[feature]-shell.component.ts
@Component({
  selector: 'nxt1-feature-shell-web',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- 100% Tailwind — Design token classes only -->
    <header class="bg-bg-primary border-border-subtle border-b">
      <h1 class="text-text-primary">{{ title }}</h1>
    </header>

    @if (service.loading()) {
      <div class="bg-surface-100 h-20 animate-pulse rounded-xl"></div>
    } @else {
      @for (item of service.data(); track item.id) {
        <div class="bg-surface-100 hover:bg-surface-200 rounded-lg p-4">
          {{ item.title }}
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
        background-color: var(--nxt1-color-bg-primary);
        color: var(--nxt1-color-text-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureShellWebComponent {
  protected readonly service = inject(FeatureService);
}
```

### Mobile Component Pattern (Native Feel)

```typescript
// packages/ui/src/[feature]/mobile/[feature]-shell.component.ts
@Component({
  selector: 'nxt1-feature-shell-mobile',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ title }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (service.loading()) {
        <div class="flex justify-center py-8">
          <ion-spinner />
        </div>
      } @else {
        <ion-list>
          @for (item of service.data(); track item.id) {
            <ion-item (click)="onItemClick(item)" detail>
              <ion-label>{{ item.title }}</ion-label>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureShellMobileComponent {
  protected readonly service = inject(FeatureService);
  private readonly haptics = inject(HapticsService);

  async onItemClick(item: Item): Promise<void> {
    await this.haptics.impact('light');
    // Navigate...
  }
}
```

### Decision Tree: When to Use Adaptive Design

```
Is it a feature with complex UI?
│
├─ YES ─────────────────────────────────────────────────────┐
│   Does it need SSR for SEO?                               │
│   │                                                       │
│   ├─ YES → Adaptive Design (_shared/ + mobile/ + web/)    │
│   │        Examples: Help Center, Profile, Explore        │
│   │                                                       │
│   └─ NO → Shared Ionic (works on both)                    │
│           Examples: Auth Shell, Onboarding                │
│                                                           │
└─ NO ──────────────────────────────────────────────────────┘
    Simple components → Shared in @nxt1/ui/components/
    Examples: Logo, Avatar, Icon, Chip
```

---

### @nxt1/core API Factory Pattern

│ ├── index.ts # Re-exports all helpers │ ├── string.helpers.ts # String
utilities │ ├── date.helpers.ts # Date utilities │ └── async.helpers.ts # Async
utilities └── validation/ ├── index.ts # Re-exports all validators └──
user.validation.ts # User input validation

````

### API Factory Pattern

API functions are created as **factories** that receive an HTTP adapter:

```typescript
// @nxt1/core/src/api/auth.api.ts

export interface HttpAdapter {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  put<T>(url: string, data?: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
}

export function createAuthApi(http: HttpAdapter, baseUrl: string) {
  return {
    async login(email: string, password: string) {
      return http.post(`${baseUrl}/auth/login`, { email, password });
    },
    async register(data: RegisterRequest) {
      return http.post(`${baseUrl}/auth/register`, data);
    },
  };
}
````

**Usage in Angular:**

```typescript
// apps/web/src/app/auth/auth-api.service.ts

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly api = createAuthApi(
    {
      get: (url) => firstValueFrom(this.http.get(url)),
      post: (url, data) => firstValueFrom(this.http.post(url, data)),
      put: (url, data) => firstValueFrom(this.http.put(url, data)),
      delete: (url) => firstValueFrom(this.http.delete(url)),
    },
    environment.apiUrl
  );

  login = this.api.login;
  register = this.api.register;
}
```

**Usage in Capacitor/Mobile:**

```typescript
// apps/mobile/src/services/auth.service.ts

const httpAdapter = {
  get: async (url) => (await CapacitorHttp.get({ url })).data,
  post: async (url, data) => (await CapacitorHttp.post({ url, data })).data,
  // ...
};

const authApi = createAuthApi(httpAdapter, API_URL);
```

---

## Code Sharing Strategy

### Level 1: 100% Shared (@nxt1/core) - Pure TypeScript

Everything that has **no platform dependencies**:

| Category      | Examples                                          |
| ------------- | ------------------------------------------------- |
| Types         | `UserV2`, `ProfileStats`, `ApiResponse<T>`        |
| Constants     | `SPORTS`, `USER_ROLES`, `NOTIFICATION_TYPES`      |
| Validation    | `validateRegistration()`, `isValidEmail()`        |
| Helpers       | `formatRelativeTime()`, `slugify()`, `debounce()` |
| API Factories | `createAuthApi()`, `createProfileApi()`           |
| Auth Logic    | `createAuthStateManager()`, `requireAuth()`       |
| Storage       | `createBrowserStorageAdapter()`, `STORAGE_KEYS`   |

### Level 2: ~90% Shared (@nxt1/ui) - Angular/Ionic Components

Shared UI components that work across web and mobile:

```typescript
// Shared auth shell works on web and mobile
import { AuthShellComponent } from '@nxt1/ui/auth';
import { AuthEmailFormComponent } from '@nxt1/ui/auth/auth-email-form';

@Component({
  selector: 'app-login',
  imports: [AuthShellComponent, AuthEmailFormComponent],
  template: `
    <nxt1-auth-shell variant="card" [showLogo]="true">
      <h1 authTitle>Welcome back</h1>
      <nxt1-auth-email-form
        mode="login"
        [loading]="loading()"
        (submitForm)="onSubmit($event)"
      />
    </nxt1-auth-shell>
  `,
})
export class LoginComponent {}
```

**@nxt1/ui includes:**

- `AuthShellComponent` - Full-page auth layout with branding
- `AuthSocialButtonsComponent` - Google, Apple, Microsoft login
- `AuthEmailFormComponent` - Email/password form with validation
- `NxtLogoComponent` - Logo with size/variant options
- `NxtPlatformService` - Device detection, viewport, haptics

### Level 3: Platform-Specific (~10%)

Code that must be different per platform:

| Web Only              | Mobile Only               |
| --------------------- | ------------------------- |
| Server-Side Rendering | Native push notifications |
| SEO metadata          | In-app purchases          |
| Browser history       | Biometric auth            |
| Service workers       | Camera/gallery access     |

#### Platform-Specific Services Pattern

**When to duplicate vs share:**

❌ **Don't create shared abstraction when:**

- Implementations are fundamentally different
- Web uses browser APIs, mobile uses Capacitor plugins
- One platform has features the other doesn't

✅ **Do create shared types in @nxt1/core:**

- Interface contracts (NetworkStatus, ConnectionType)
- Event types and enums
- Request/response shapes

**Example: NetworkService**

```typescript
// ✅ CORRECT: Shared types in @nxt1/core
// packages/core/src/models/network.model.ts
export type ConnectionType =
  | 'wifi'
  | 'cellular'
  | 'ethernet'
  | 'unknown'
  | 'none';

export interface NetworkStatus {
  isConnected: boolean;
  connectionType: ConnectionType;
}

// ✅ CORRECT: Web implementation
// apps/web/src/app/core/services/network.service.ts
@Injectable({ providedIn: 'root' })
export class NetworkService {
  constructor() {
    // Uses window.navigator.onLine and browser events
    window.addEventListener('online', () => this._isOnline.set(true));
  }
}

// ✅ CORRECT: Mobile implementation
// apps/mobile/src/app/services/network.service.ts
@Injectable({ providedIn: 'root' })
export class NetworkService {
  constructor() {
    // Uses Capacitor Network plugin with WiFi/cellular detection
    Network.addListener('networkStatusChange', (status) => {
      this._status.set({
        isConnected: status.connected,
        connectionType: status.connectionType, // 'wifi', 'cellular', etc.
      });
    });
  }
}
```

**Benefits of this pattern:**

- **Locality principle**: Code lives where it's used
- **Platform optimization**: Each implementation optimized for its platform
- **No false abstractions**: Don't force shared code that isn't truly shared
- **Type safety**: Shared interfaces ensure API compatibility

---

## Caching Strategy

NXT1 uses a comprehensive three-tier caching system for optimal performance:

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    WEB APPLICATION                           │
├─────────────────────────────────────────────────────────────┤
│ Service Worker (ngsw-config.json)                           │
│ ├─ Assets (app.js, styles) - Prefetch                       │
│ ├─ Images - Lazy load                                       │
│ └─ API Data Groups - Freshness/Performance strategies       │
├─────────────────────────────────────────────────────────────┤
│ HTTP Cache Interceptor                                      │
│ ├─ LRU Cache (100 entries)                                  │
│ ├─ Stale-while-revalidate                                   │
│ ├─ Request deduplication                                    │
│ └─ URL-based TTL configuration                              │
├─────────────────────────────────────────────────────────────┤
│ Memory Cache (@nxt1/core)                                   │
│ └─ Computed values, expensive operations                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   MOBILE APPLICATION                         │
├─────────────────────────────────────────────────────────────┤
│ Two-Tier Cache (MobileCacheService)                         │
│ ├─ Tier 1: Memory (LRU - Fast, volatile)                    │
│ └─ Tier 2: Capacitor Preferences (Persistent)               │
└─────────────────────────────────────────────────────────────┘
```

### @nxt1/core/cache Module

Pure TypeScript caching utilities (100% portable):

```typescript
import {
  createMemoryCache,
  createLRUCache,
  createPersistentCache,
} from '@nxt1/core/cache';

// Memory cache - fast, volatile
const cache = createMemoryCache<User>({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,
});

// LRU cache - bounded memory
const lruCache = createLRUCache<ApiResponse>({
  maxSize: 100,
  ttl: 15 * 60 * 1000,
});

// Persistent cache - survives restart
const persistentCache = createPersistentCache<Profile>(storageAdapter, {
  ttl: 60 * 60 * 1000, // 1 hour
});
```

### Cache TTL Configuration

```typescript
import { CACHE_CONFIG } from '@nxt1/core/cache';

CACHE_CONFIG.SHORT_TTL; // 1 min - Frequently changing (feed)
CACHE_CONFIG.MEDIUM_TTL; // 15 min - Semi-static (profiles, teams)
CACHE_CONFIG.LONG_TTL; // 1 hour - Rarely changing (colleges)
CACHE_CONFIG.EXTENDED_TTL; // 24 hours - Static (sports list)
```

### Implementation Examples

**Web - Automatic HTTP Caching:**

```typescript
// apps/web/src/app/app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withInterceptors([
        httpCacheInterceptor({
          ttlConfig: [
            { pattern: /\/api\/college/, ttl: CACHE_CONFIG.LONG_TTL },
            { pattern: /\/api\/profile/, ttl: CACHE_CONFIG.MEDIUM_TTL },
          ],
        }),
      ])
    ),
  ],
};

// Configure URL patterns based on your backend API structure
```

**Mobile - Service Usage:**

```typescript
// Powered by the zero-config CapacitorHttpAdapter
@Component({...})
export class ProfilePage {
  private api = inject(ProfileApiService);

  async loadProfile(userId: string) {
    // 0ms latency thanks to automated RAM/Disk transport Cache intercepting GET requests
    return this.api.getProfile(userId);
  }
}
```

**See [CACHING-STRATEGY.md](../infrastructure/CACHING-STRATEGY.md) for complete
documentation.**

---

## Type Safety

### Strict TypeScript

All packages use strict TypeScript:

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Shared Types Across Stack

The same types are used everywhere:

```typescript
// Backend creates response
const response: ApiResponse<UserV2> = {
  success: true,
  data: user,
};

// Web receives typed response
const { data } = await this.authApi.getProfile();
// data is typed as UserV2

// Mobile uses same types
const profile: UserV2 = await profileService.load();
```

### Validation Functions

Validation logic is shared and type-safe:

```typescript
// Defined once in @nxt1/core
export function validateRegistration(data: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ field: 'data', message: 'Invalid data' }] };
  }

  const { email, password, firstName, lastName } = data as Record<string, unknown>;

  if (!email || !isValidEmail(email as string)) {
    errors.push({ field: 'email', message: 'Valid email is required' });
  }

  // ... more validation

  return { valid: errors.length === 0, errors };
}

// Used in backend
router.post('/register', (req, res) => {
  const validation = validateRegistration(req.body);
  if (!validation.valid) {
    return res.status(400).json({ success: false, errors: validation.errors });
  }
  // ...
});

// Used in frontend
async register() {
  const validation = validateRegistration(this.form.value);
  if (!validation.valid) {
    this.errors.set(validation.errors);
    return;
  }
  // ...
}
```

---

## Build System

### Turborepo Pipeline

```json
// turbo.json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"], // Wait for dependencies to build
      "outputs": ["dist/**", "lib/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

### Build Order

```
@nxt1/core       ──► @nxt1/web
                 ──► @nxt1/mobile
                 ──► @nxt1/backend
                 ──► @nxt1/functions
```

### Caching

Turborepo caches build outputs. Unchanged packages skip rebuilding:

```bash
# First build - all packages
$ npm run build
@nxt1/core:build: cache miss, executing
@nxt1/web:build: cache miss, executing

# Second build - nothing changed
$ npm run build
@nxt1/core:build: cache hit, replaying output
@nxt1/web:build: cache hit, replaying output
```

---

## Deployment Strategy

### Environments

| Environment | Purpose           | Trigger         |
| ----------- | ----------------- | --------------- |
| Development | Local development | Manual          |
| Staging     | QA testing        | Push to `main`  |
| Production  | Live users        | Manual workflow |

### Deployment Targets

| Package         | Target                 | Method                  |
| --------------- | ---------------------- | ----------------------- |
| @nxt1/web       | Firebase Hosting       | GitHub Actions          |
| @nxt1/backend   | Google Cloud Run       | Docker + GitHub Actions |
| @nxt1/functions | Firebase Functions     | Firebase CLI            |
| @nxt1/mobile    | App Store / Play Store | Manual release          |

### Selective Deployment

Only changed packages are deployed:

```yaml
# .github/workflows/deploy.yml
changes:
  outputs:
    web: ${{ steps.filter.outputs.web }}
    backend: ${{ steps.filter.outputs.backend }}

deploy-web:
  if: needs.changes.outputs.web == 'true'
  # ...
```

---

## Best Practices

### 1. Always Start with Types

Define types in @nxt1/core first:

```typescript
// 1. Define the type
export interface CreatePostRequest {
  content: string;
  mediaUrls?: string[];
  visibility: 'public' | 'followers' | 'private';
}

// 2. Create validation
export function validateCreatePost(data: unknown): ValidationResult {
  // ...
}

// 3. Create API function
export function createPostApi(http: HttpAdapter, baseUrl: string) {
  return {
    create: (data: CreatePostRequest) => http.post(`${baseUrl}/posts`, data),
  };
}
```

### 2. Keep Components Thin

Components should only handle UI logic:

```typescript
// ✅ Good - thin component
@Component({
  /* ... */
})
export class CreatePostComponent {
  private readonly postService = inject(PostService);

  content = '';

  async submit() {
    await this.postService.create({ content: this.content });
  }
}

// ❌ Bad - business logic in component
@Component({
  /* ... */
})
export class CreatePostComponent {
  async submit() {
    if (!this.content.trim()) return;

    const validation = validateCreatePost({ content: this.content });
    if (!validation.valid) {
      /* ... */
    }

    const response = await this.http.post('/posts', { content: this.content });
    // ...
  }
}
```

### 3. Use Signal-Based State

Angular services should use signals:

```typescript
@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly _posts = signal<Post[]>([]);
  private readonly _loading = signal(false);

  readonly posts = computed(() => this._posts());
  readonly loading = computed(() => this._loading());
  readonly isEmpty = computed(() => this._posts().length === 0);
}
```

### 4. Handle Errors Consistently

```typescript
// In services
async loadPosts(): Promise<void> {
  this._loading.set(true);
  this._error.set(null);

  try {
    const posts = await this.api.getPosts();
    this._posts.set(posts);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load posts';
    this._error.set(message);
    console.error('[PostService] loadPosts failed:', err);
  } finally {
    this._loading.set(false);
  }
}
```

---

## Migration from Existing Codebase

### Step 1: Extract Types to @nxt1/core

Move all interfaces from `src/app/core/shared/models/` to
`packages/core/src/models/`.

### Step 2: Extract Helpers

Move pure functions from `src/app/core/shared/helpers/` to
`packages/core/src/helpers/`.

### Step 3: Create API Factories

Convert Angular services to pure API factories where possible.

### Step 4: Update Imports

Replace deep imports with @nxt1/core:

```typescript
// Before
import { User } from '../../../shared/models/user.model';
import { formatDate } from '../../../shared/helpers/date.helpers';

// After
import { User, formatDate } from '@nxt1/core';
```

---

_Last updated: April 2026_
