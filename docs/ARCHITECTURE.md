# NXT1 Architecture Guide

This document provides a detailed overview of the NXT1 monorepo architecture,
design decisions, and patterns.

## Table of Contents

1. [Architecture Principles](#architecture-principles)
2. [Package Structure](#package-structure)
3. [Code Sharing Strategy](#code-sharing-strategy)
4. [Type Safety](#type-safety)
5. [Build System](#build-system)
6. [Deployment Strategy](#deployment-strategy)

---

## Architecture Principles

### 1. Maximum Code Reuse

The architecture is designed to maximize code sharing across all platforms:

```
┌─────────────────────────────────────────────────────────────┐
│                    @nxt1/core (100%)                        │
│   Types, Models, Validation, Helpers, API Functions         │
├─────────────────────────────────────────────────────────────┤
│              Shared UI Components (~80%)                     │
│      Ionic components work on Web, iOS, and Android         │
├────────────────────────┬────────────────────────────────────┤
│   Platform-Specific    │    Platform-Specific               │
│   (Web ~20%)           │    (Mobile ~20%)                   │
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

### @nxt1/core

The shared library is organized by domain:

```
packages/core/src/
├── index.ts              # Root barrel export
├── constants/
│   ├── index.ts          # Re-exports all constants
│   ├── sports.ts         # Sport definitions
│   ├── roles.ts          # User roles
│   ├── notifications.ts  # Notification types
│   └── subscriptions.ts  # Subscription tiers
├── models/
│   ├── index.ts          # Re-exports all types
│   ├── user.model.ts     # User interfaces
│   ├── profile.model.ts  # Profile interfaces
│   ├── team.model.ts     # Team interfaces
│   ├── video.model.ts    # Video interfaces
│   └── api.model.ts      # API response types
├── api/
│   ├── index.ts          # Re-exports all API factories
│   ├── auth.api.ts       # Auth API functions
│   ├── profile.api.ts    # Profile API functions
│   └── http-adapter.ts   # HTTP abstraction
├── helpers/
│   ├── index.ts          # Re-exports all helpers
│   ├── string.helpers.ts # String utilities
│   ├── date.helpers.ts   # Date utilities
│   └── async.helpers.ts  # Async utilities
└── validation/
    ├── index.ts          # Re-exports all validators
    └── user.validation.ts # User input validation
```

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
```

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

### Level 1: 100% Shared (@nxt1/core)

Everything that has **no platform dependencies**:

| Category      | Examples                                          |
| ------------- | ------------------------------------------------- |
| Types         | `UserV2`, `ProfileStats`, `ApiResponse<T>`        |
| Constants     | `SPORTS`, `USER_ROLES`, `NOTIFICATION_TYPES`      |
| Validation    | `validateRegistration()`, `isValidEmail()`        |
| Helpers       | `formatRelativeTime()`, `slugify()`, `debounce()` |
| API Factories | `createAuthApi()`, `createProfileApi()`           |

### Level 2: ~80% Shared (Ionic Components)

Ionic components work across platforms with minor adaptations:

```typescript
// Shared component works on web and mobile
@Component({
  selector: 'app-profile-card',
  template: `
    <ion-card>
      <ion-card-header>
        <ion-avatar>
          <img [src]="user.photoURL" />
        </ion-avatar>
        <ion-card-title>{{ user.displayName }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        {{ user.bio }}
      </ion-card-content>
    </ion-card>
  `,
})
export class ProfileCardComponent {
  @Input() user!: UserV2;
}
```

### Level 3: Platform-Specific (~20%)

Code that must be different per platform:

| Web Only              | Mobile Only               |
| --------------------- | ------------------------- |
| Server-Side Rendering | Native push notifications |
| SEO metadata          | In-app purchases          |
| Browser storage       | Biometric auth            |
| Service workers       | Camera/gallery access     |

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

Move all interfaces from `src/app/v2/shared/models/` to
`packages/core/src/models/`.

### Step 2: Extract Helpers

Move pure functions from `src/app/v2/shared/helpers/` to
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

_Last updated: January 2025_
