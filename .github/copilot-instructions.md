# GitHub Copilot Instructions for NXT1 Monorepo

> **2026 ENTERPRISE ARCHITECTURE** — This document defines the production
> patterns for all NXT1 development. Generated code MUST follow these patterns
> precisely.

---

## 0. Golden Rule: Backend Does the Heavy Lifting

> **CRITICAL**: The backend is the source of truth. Frontend is for presentation
> only.

### Backend Responsibilities (Node.js/Express + Firebase Functions)

- ✅ **All business logic** — Validation, calculations, transformations
- ✅ **Data aggregation** — Joins, sorting, filtering, pagination
- ✅ **Security enforcement** — Auth checks, rate limiting, input sanitization
- ✅ **Complex queries** — Firestore/MongoDB queries, search, analytics
- ✅ **Third-party integrations** — Stripe, PayPal, OpenRouter AI, email
  services
- ✅ **Caching decisions** — What to cache, TTLs, invalidation
- ✅ **File processing** — Image optimization, video transcoding, PDF generation
- ✅ **Sensitive operations** — Payment processing, credential validation

### Frontend Responsibilities (Angular Web + Ionic Mobile)

- ✅ **UI rendering** — Display data from backend, responsive layouts
- ✅ **User input collection** — Forms, selections, gestures
- ✅ **Optimistic UI** — Instant feedback, rollback on error
- ✅ **Client-side state** — Loading states, form state, navigation state
- ✅ **Basic validation** — Required fields, format checks (backend
  re-validates)
- ✅ **Caching display data** — HTTP cache for GET requests only

### ❌ NEVER on Frontend

```typescript
// ❌ NEVER: Business logic on frontend
const discount = user.isPremium ? price * 0.2 : 0; // Backend calculates
const canAccess = user.subscription.tier >= 'pro'; // Backend enforces

// ❌ NEVER: Data aggregation on frontend
const stats = posts.reduce((acc, p) => acc + p.likes, 0); // Backend aggregates
const sorted = users.sort((a, b) => b.score - a.score); // Backend sorts

// ❌ NEVER: Security decisions on frontend
if (user.role === 'admin') {
  showDeleteButton();
} // Backend checks permissions

// ❌ NEVER: Direct third-party API calls
const response = await fetch('https://api.stripe.com/...'); // Backend proxies
```

### ✅ CORRECT: Backend-First Pattern

```typescript
// Frontend: Simple API call, display result
async loadDashboard(): Promise<void> {
  // Backend does ALL the work: auth check, data aggregation, sorting, filtering
  const dashboard = await this.api.getDashboard();
  this._data.set(dashboard);
}

// Frontend: Collect input, send to backend
async submitPayment(form: PaymentForm): Promise<void> {
  // Backend: validates, processes payment, updates subscription, sends email
  const result = await this.api.processPayment(form);
  if (result.success) this.router.navigate(['/success']);
}

// Frontend: Basic UX validation (backend re-validates everything)
get isFormValid(): boolean {
  return this.email().includes('@') && this.password().length >= 8;
}
```

---

## 1. Platform Architecture Overview

### 1.0 What NXT1 Is (Read This First)

**NXT1 is a comprehensive AI agent sports platform** — an ecosystem where an
intelligent agent named **Agent X** autonomously performs real work for
athletes, coaches, creators, scouters, and sports programs across the entire
industry.

> **"Most platforms are passive. You use them. NXT1 is active. It works for
> you."**

The core philosophy: users describe what they need in plain language and Agent X
**executes** — whether that's analyzing film, designing professional graphics,
managing communications, generating highlight reels, or coordinating schedules.
This is not a standard chatbot. It is an **AI command center** that runs
background operations, delivers daily briefings, and maintains task-specific
playbooks for any role in the sports industry.

### 1.1 Agent X — The Platform's Core

Agent X is the primary user interface across web and mobile. It is an
**open-ended AI agent** — not limited to a fixed set of modes. It can analyze
gameplay, enhance media, draft professional outreach, build strategic plans, and
handle any sports-related workflow a user describes in plain language. New
capabilities are added continuously without changing the architecture.

**Architecture:**

- **Pure TypeScript core** — Types, API factory, constants, and templates live
  in `@nxt1/core/ai` (100% portable across web, mobile, and backend)
- **Angular UI** — The Agent X shell (command center), chat, input, FAB widget,
  and task-specific components live in `@nxt1/ui/agent-x`
- **Backend orchestration** — All AI calls route through the backend's
  OpenRouter integration. **The frontend never calls AI APIs directly.**

**Agent X Shell (Command Center):**

The shell is an AI-first operations dashboard — not a simple chat window. It
includes proactive daily briefings, active background operations with progress
tracking, weekly playbooks with action buttons, role-specific quick commands,
and a conversational chat interface for free-form requests.

### 1.2 Platform Capabilities Summary

| Capability                     | Description                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Autonomous Agent Workflows** | Instruct Agent X to perform complex, multi-step tasks across the platform                              |
| **AI Creative Director**       | Image generation, graphic enhancement, template-based design, image-to-image editing via OpenRouter    |
| **AI Film & Data Analysis**    | Intelligent breakdown of performance metrics, scout reports, and video highlights                      |
| **AI Help Center**             | AI-powered search and conversational support with knowledge base, video tutorials, and ticket creation |
| **Smart Communications**       | Automated email drafting, multi-channel outreach, and communication playbooks                          |
| **Activity Engine**            | Live USA map with real-time animated pings showing platform activity by state                          |
| **Analytics Dashboard**        | Live engagement metrics, content performance, geo-distribution, and viewer breakdowns                  |

### 1.3 AI-First Development Principles

When building any feature, keep these principles in mind:

1. **Agent X is the primary interface** — Features should be accessible as Agent
   X quick commands, not just standalone pages
2. **Backend owns all AI** — OpenRouter calls, prompt engineering, model
   selection, response processing — all backend. Frontend renders results only.
3. **Everything is an operation** — Long-running AI tasks (highlight generation,
   batch emails) are background operations with progress tracking, not blocking
   API calls
4. **Domain specialization matters** — Agent X is _"The First AI Born in the
   Locker Room"_ — trained on NCAA compliance, sport-specific strategy, and
   verified recruiting data. Generated code should respect sport/position
   context.
5. **Role-aware behavior** — Athletes, coaches, scouts, parents, and college
   programs each get different quick commands and Agent X responses

### 1.4 Technology Stack (2026)

| Layer         | Technology                        | Purpose                     |
| ------------- | --------------------------------- | --------------------------- |
| **Frontend**  | Angular 21+ (Standalone, Signals) | SSR-enabled web application |
| **Mobile**    | Angular + Ionic 8 + Capacitor 8   | Native iOS/Android apps     |
| **Backend**   | Node.js 20 LTS / Express 5 (ESM)  | REST API server             |
| **Functions** | Firebase Cloud Functions (Gen 2)  | Triggers, scheduled tasks   |
| **Databases** | Firestore + MongoDB               | Hybrid data storage         |
| **Auth**      | Firebase Authentication           | User authentication         |
| **Storage**   | Firebase Storage + CDN            | Media files                 |
| **Payments**  | Stripe + PayPal                   | Payment processing          |
| **AI**        | OpenRouter (Backend only)         | AI features                 |
| **Hosting**   | Firebase App Hosting (SSR)        | Production deployment       |

### Monorepo Structure

```
nxt1-monorepo/                        # PRIMARY WORKSPACE
├── apps/
│   ├── web/                          # Angular SSR web application
│   │   ├── src/app/
│   │   │   ├── app.config.ts         # Browser providers
│   │   │   ├── app.config.server.ts  # Server providers (SSR)
│   │   │   ├── app.routes.ts         # Route definitions
│   │   │   ├── app.routes.server.ts  # SSR render modes (100% Server)
│   │   │   ├── core/                 # App-level services & infrastructure
│   │   │   ├── dev/                  # Dev-only utilities
│   │   │   └── features/            # Feature modules (lazy-loaded)
│   │   └── server.ts                 # SSR Express server
│   ├── mobile/                       # Ionic/Capacitor mobile app
│   │   ├── src/app/
│   │   │   ├── core/                 # Mobile-specific services
│   │   │   ├── features/            # Mobile feature modules
│   │   │   └── services/            # Mobile services
│   │   ├── android/                  # Android native project
│   │   └── ios/                      # iOS native project
│   └── functions/                    # Firebase Cloud Functions (Gen 2)
│       └── src/
│           ├── auth/                 # Auth triggers
│           ├── email/                # Email functions
│           ├── monitoring/           # Health checks
│           ├── notification/         # Push notifications
│           ├── scheduled/            # Cron jobs
│           ├── user/                 # User triggers
│           └── util/                 # Shared utilities
├── packages/
│   ├── core/                         # ⭐ 100% PORTABLE — Pure TypeScript
│   ├── ui/                           # ⭐ ~95% SHARED — Angular/Ionic components
│   ├── cache/                        # Cache abstraction (Redis + in-memory)
│   ├── shared-types/                 # Shared TypeScript type definitions
│   ├── config/                       # Build tooling config (ESLint, Prettier, TSConfig, Tailwind)
│   └── design-tokens/                # Design system tokens (CSS/SCSS)
├── backend/                          # Backend API (TypeScript, Express 5)
│   └── src/
│       ├── middleware/               # Auth, rate-limit, cache, performance
│       ├── routes/                   # All API route definitions
│       ├── services/                 # Business logic services
│       ├── models/                   # Mongoose models
│       ├── modules/                  # Feature modules (billing, etc.)
│       ├── adapters/                 # Data adapters (Firestore, etc.)
│       ├── config/                   # Database config
│       ├── constants/                # Backend constants
│       ├── dtos/                     # Data transfer objects
│       ├── types/                    # Backend-specific types
│       ├── utils/                    # Helpers
│       └── workers/                  # Background workers
└── docs/                             # Architecture documentation
```

---

## 2. Shared Package Architecture

### 2.1 Package Boundaries (CRITICAL)

```
┌─────────────────────────────────────────────────────────────┐
│                    @nxt1/core (100% Portable)               │
│   Pure TypeScript — Works EVERYWHERE                        │
│   ⚡ Zero framework dependencies                            │
├─────────────────────────────────────────────────────────────┤
│                     @nxt1/ui (~95% Shared)                  │
│   Angular/Ionic Components — Web & Mobile                   │
│   🎨 Single entry point with tree-shaking                   │
├────────────────────────┬────────────────────────────────────┤
│   apps/web (~5%)       │    apps/mobile (~5%)               │
│   SSR, SEO, PWA        │    Push, IAP, Biometrics           │
└────────────────────────┴────────────────────────────────────┘
```

### 2.2 @nxt1/core — Pure TypeScript (Zero Dependencies)

**Location:** `packages/core/src/`

```
├── index.ts              # Root barrel — import from '@nxt1/core'
├── constants/            # USER_ROLES, PLAN_TIERS, SPORTS, POSITIONS
├── models/               # User, Team, Profile, Notification, Navigation interfaces
├── api/                  # HttpAdapter interface, createFetchAdapter factory
├── auth/                 # AuthStateManager, pure guard functions, error handling
├── cache/                # CACHE_CONFIG, CACHE_KEYS, memory/LRU cache factories
├── helpers/              # formatDate, slugify, validators (pure functions)
├── validation/           # Schema validation with type inference
├── platform/             # Platform detection, theme utilities
├── storage/              # StorageAdapter (browser, memory, capacitor)
├── geolocation/          # Geolocation service factory
├── seo/                  # SEO metadata builders
├── errors/               # NxtApiError, error factories, parseApiError
├── logging/              # Structured logging (ILogger)
├── analytics/            # Analytics event constants (APP_EVENTS, FIREBASE_EVENTS)
├── ai/                   # Agent X types and API factories
├── browser/              # In-App Browser types & utilities
├── crashlytics/          # Crashlytics types & breadcrumb helpers
├── performance/          # Performance tracing (TRACE_NAMES, ATTRIBUTE_NAMES)
├── testing/              # Test IDs, timeouts, routes
├── onboarding/           # Onboarding flow state machine, navigation, session
├── feed/                 # Social post types, FeedApi factory
├── create-post/          # Post creation types, CreatePostApi factory
├── explore/              # Search/discover types, ExploreApi factory
├── messages/             # Conversation types, MessagesApi factory
├── profile/              # Profile viewing types, ProfileApi factory
├── edit-profile/         # Profile editing types, EditProfileApi factory
├── activity/             # Activity feed types, ActivityApi factory
├── news/                 # Article types, NewsApi factory
├── scout-reports/        # Scout report types, ScoutReportsApi factory
├── analytics/            # Analytics types and events

├── settings/             # Settings types
├── help-center/          # AI chat, tickets, HelpCenterApi factory
├── invite/               # Invite system types
├── manage-team/          # Team management types
├── timeline/             # Timeline types
├── usage/                # Usage tracking types
├── sport-landing/        # Sport landing page types
└── [feature]/            # Additional per-feature API types and factories
```

Both root barrel and sub-path imports are supported:

```typescript
// Root barrel (most common)
import { User, createAuthApi, CACHE_CONFIG } from '@nxt1/core';

// Sub-path (feature-specific, also valid)
import { APP_EVENTS, FIREBASE_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES } from '@nxt1/core/performance';
import { ILogger } from '@nxt1/core/logging';
```

**✅ ALLOWED in @nxt1/core:**

- Pure TypeScript with explicit types
- Standard library (Math, Date, String, Array methods)
- Type definitions and interfaces
- Factory functions returning plain objects
- Platform-agnostic adapters (interfaces only)

**❌ FORBIDDEN in @nxt1/core:**

- Angular imports (`@angular/*`)
- Browser globals (`window`, `document`, `localStorage`)
- Node.js APIs (`fs`, `path`, `http`, `process`)
- Firebase SDK directly
- Any external dependencies

### 2.3 @nxt1/ui — Angular/Ionic Components

**Location:** `packages/ui/src/`

```
├── index.ts              # Single entry point — '@nxt1/ui'
├── auth/                 # AuthShell, EmailForm, SocialButtons, BiometricPrompt, Modal
├── onboarding/           # RoleSelection, ProfileStep, ProgressBar, NavigationButtons
├── components/           # All reusable UI components
│   ├── logo/             # NxtLogoComponent
│   ├── icon/             # NxtIconComponent
│   ├── image/            # NxtImageComponent
│   ├── avatar/           # NxtAvatarComponent, NxtAvatarGroupComponent
│   ├── chip/             # NxtChipComponent
│   ├── bottom-sheet/     # NxtBottomSheetComponent, NxtBottomSheetService
│   ├── footer/           # NxtMobileFooterComponent (native tab bar)
│   ├── top-nav/          # NxtHeaderComponent (responsive header)
│   ├── page-header/      # NxtPageHeaderComponent
│   ├── desktop-page-header/ # NxtDesktopPageHeaderComponent
│   ├── picker/           # NxtPickerService (sport/position pickers)
│   ├── form-field/       # NxtFormFieldComponent
│   ├── validation-summary/ # NxtValidationSummaryComponent
│   ├── refresh-container/ # NxtRefreshContainerComponent
│   ├── search-bar/       # NxtSearchBarComponent
│   ├── sidenav/          # NxtSidenavService + components
│   ├── desktop-sidebar/  # Desktop sidebar navigation
│   ├── mobile-header/    # Mobile header
│   ├── mobile-sidebar/   # Mobile sidebar drawer
│   ├── option-scroller/  # Mobile + Web option scrollers
│   ├── back-button/      # NxtBackButtonComponent
│   ├── share-button/     # NxtShareButtonComponent
│   ├── not-found/        # NotFoundComponent (404)
│   ├── hero-header/      # Landing page hero
│   ├── agent-x-demo/     # AI creative director showcase
│   ├── recruitment-engine/ # USA Map + live activity pings
│   ├── [marketing]/      # 30+ marketing/landing page components
│   └── [feature]/        # Feature-specific UI components
├── services/             # All injectable services
│   ├── platform/         # NxtPlatformService
│   ├── toast/            # NxtToastService
│   ├── haptics/          # HapticsService, directives
│   ├── modal/            # NxtModalService
│   ├── breadcrumb/       # Crashlytics breadcrumb tracking
│   ├── auth-error/       # AuthErrorHandler (Firebase error → user message)
│   ├── auth-navigation/  # AuthNavigationService
│   ├── analytics/        # ANALYTICS_ADAPTER token
│   ├── browser/          # BrowserService
│   ├── theme/            # NxtThemeService
│   ├── logging/          # NxtLoggingService
│   ├── scroll/           # ScrollService
│   ├── scroll-hide/      # Scroll-hide directive/service
│   ├── gesture/          # GestureService
│   └── notification-state/ # NotificationStateService
├── infrastructure/       # GlobalErrorHandler, httpErrorInterceptor, GLOBAL_CRASHLYTICS
├── agent-x/              # AgentXService, shell (web/mobile), chat, input, FAB
├── activity/             # ActivityService + components
├── explore/              # ExploreService + shell (web/mobile) + filters
├── messages/             # MessagesService + shell (web/mobile) + conversation
├── profile/              # ProfileService + shell (web/mobile) + header/timeline
├── settings/             # SettingsService + shell + section/item components
├── feed/                 # FeedService + components
├── news/                 # NewsService + components
├── create-post/          # CreatePostService + 10+ components
├── edit-profile/         # EditProfileService + components
├── scout-reports/        # ScoutReportsService + 15+ components

├── help-center/          # HelpCenterService + shell (web/mobile)
├── manage-team/          # ManageTeamService + shell + 7 section components
├── usage/                # UsageService + shell (web/mobile) + sections
├── invite/               # InviteService + 7 components
├── legal/                # About, Terms, Privacy shells
├── team/                 # TeamShellComponent
├── personas/             # Athletes, Coaches, Parents, Scouts landing pages
├── athlete-profiles/     # Athlete profile components
├── sport-landing/        # NxtSportLandingComponent
├── wallet/               # Wallet components
├── qr-code/              # QR code service
└── styles/               # Shared SCSS styles (importable via @nxt1/ui/styles/*)
```

**Import Pattern (Web vs Mobile):**

The web app uses **granular sub-path imports** via tsconfig path mappings
(`@nxt1/ui/*` → `packages/ui/src/*/index.ts`). The mobile app uses **root barrel
imports** from `@nxt1/ui`.

```typescript
// ✅ CORRECT for WEB: Granular sub-path imports (preferred for code splitting)
import { AuthShellComponent, AuthEmailFormComponent } from '@nxt1/ui/auth';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { HapticsService } from '@nxt1/ui/services/haptics';
import { GlobalErrorHandler } from '@nxt1/ui/infrastructure';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { FeedService, FeedListComponent } from '@nxt1/ui/feed';
import { AgentXShellWebComponent } from '@nxt1/ui/agent-x/web';

// ✅ ALSO CORRECT for MOBILE: Root barrel imports work everywhere
import {
  AuthShellComponent,
  HapticsService,
  NxtPlatformService,
} from '@nxt1/ui';
```

> **Why granular for web?** The tsconfig path mapping `@nxt1/ui/*` →
> `packages/ui/src/*` resolves sub-paths directly to source. This helps the
> Angular compiler produce better per-route code splitting. The mobile app uses
> root barrel imports since Capacitor builds don't benefit from the same
> splitting strategy.

---

## 3. MANDATORY Coding Patterns (2026)

### 3.1 Standalone Components with Signals

```typescript
// ✅ CORRECT: 2026 Angular standalone component
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { NxtLogoComponent } from '@nxt1/ui/components/logo';
import { NxtIconComponent } from '@nxt1/ui/components/icon';

@Component({
  selector: 'app-feature',
  imports: [RouterModule, NxtLogoComponent, NxtIconComponent],
  templateUrl: './feature.component.html',
  styleUrl: './feature.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureComponent {
  private readonly featureService = inject(FeatureService);

  // Expose service signals directly (no intermediate variables)
  protected readonly data = this.featureService.data;
  protected readonly loading = this.featureService.loading;
  protected readonly error = this.featureService.error;

  // Derived state via computed
  protected readonly isEmpty = computed(() => this.data().length === 0);
  protected readonly hasError = computed(() => this.error() !== null);
}
```

### 3.2 Signal-Based Services (Required Pattern)

```typescript
// ✅ CORRECT: Service with private signals, public computed, and all 4 observability pillars
import { Injectable, inject, signal, computed } from '@angular/core';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { APP_EVENTS } from '@nxt1/core/analytics';

@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly api = inject(FeatureApiService);

  // ✅ All four observability pillars (REQUIRED)
  private readonly logger = inject(NxtLoggingService).child('FeatureService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  // Private writeable signals (never expose directly)
  private readonly _data = signal<Item[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  // Public readonly computed signals
  readonly data = computed(() => this._data());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly isEmpty = computed(() => this._data().length === 0);
  readonly count = computed(() => this._data().length);

  async loadData(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    this.logger.info('Loading data');
    this.breadcrumb.trackStateChange('feature', 'loading');

    try {
      const result = await this.api.getItems();
      this._data.set(result);
      this.logger.info('Data loaded', { count: result.length });
      this.analytics?.trackEvent(APP_EVENTS.FEATURE_VIEWED, {
        count: result.length,
      });
    } catch (err) {
      this.logger.error('Failed to load data', err);
      this._error.set(
        err instanceof Error ? err.message : 'Failed to load data'
      );
    } finally {
      this._loading.set(false);
    }
  }

  // Optimistic updates with rollback
  async deleteItem(id: string): Promise<void> {
    const previous = this._data();
    this._data.update((items) => items.filter((item) => item.id !== id));
    this.logger.info('Deleting item', { id });

    try {
      await this.api.deleteItem(id);
      this.logger.info('Item deleted', { id });
    } catch (err) {
      this.logger.error('Failed to delete item', err, { id });
      this._data.set(previous); // Rollback on failure
      throw err;
    }
  }
}
```

### 3.3 Pure API Factory Functions (Mobile-Portable)

**Location:** `packages/core/src/api/[feature].api.ts`

```typescript
// ✅ CORRECT: Pure TypeScript API factory — 100% portable
import type { HttpAdapter } from './http.types';
import type { ApiResponse } from '../models';

// Request/Response types (pure interfaces)
export interface CreateItemRequest {
  readonly name: string;
  readonly description?: string;
}

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// Factory function (no decorators, no classes)
export function createFeatureApi(http: HttpAdapter, baseUrl: string) {
  const endpoint = `${baseUrl}/items`;

  return {
    async getItems(): Promise<Item[]> {
      const response = await http.get<ApiResponse<Item[]>>(endpoint);
      if (!response.success)
        throw new Error(response.error ?? 'Failed to fetch items');
      return response.data ?? [];
    },

    async getItem(id: string): Promise<Item | null> {
      const response = await http.get<ApiResponse<Item>>(`${endpoint}/${id}`);
      return response.success ? (response.data ?? null) : null;
    },

    async createItem(data: CreateItemRequest): Promise<Item> {
      const response = await http.post<ApiResponse<Item>>(endpoint, data);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to create item');
      }
      return response.data;
    },

    async updateItem(
      id: string,
      data: Partial<CreateItemRequest>
    ): Promise<Item> {
      const response = await http.put<ApiResponse<Item>>(
        `${endpoint}/${id}`,
        data
      );
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update item');
      }
      return response.data;
    },

    async deleteItem(id: string): Promise<void> {
      const response = await http.delete<ApiResponse<void>>(
        `${endpoint}/${id}`
      );
      if (!response.success)
        throw new Error(response.error ?? 'Failed to delete item');
    },
  } as const;
}

export type FeatureApi = ReturnType<typeof createFeatureApi>;
```

**Angular Adapter (apps/web):**

```typescript
// apps/web/src/app/feature/services/feature-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { createFeatureApi, type FeatureApi } from '@nxt1/core';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FeatureApiService implements FeatureApi {
  private readonly http = inject(HttpClient);

  private readonly api = createFeatureApi(
    {
      get: <T>(url: string) => firstValueFrom(this.http.get<T>(url)),
      post: <T>(url: string, body: unknown) =>
        firstValueFrom(this.http.post<T>(url, body)),
      put: <T>(url: string, body: unknown) =>
        firstValueFrom(this.http.put<T>(url, body)),
      delete: <T>(url: string) => firstValueFrom(this.http.delete<T>(url)),
    },
    environment.apiUrl
  );

  // Delegate to pure API (maintains type safety)
  readonly getItems = this.api.getItems;
  readonly getItem = this.api.getItem;
  readonly createItem = this.api.createItem;
  readonly updateItem = this.api.updateItem;
  readonly deleteItem = this.api.deleteItem;
}
```

**Capacitor Adapter (apps/mobile):**

```typescript
// apps/mobile/src/app/services/feature-api.service.ts
import { CapacitorHttp } from '@capacitor/core';
import { createFeatureApi } from '@nxt1/core';
import { API_URL } from '../config/environment';

const httpAdapter = {
  get: async <T>(url: string) => (await CapacitorHttp.get({ url })).data as T,
  post: async <T>(url: string, data: unknown) =>
    (await CapacitorHttp.post({ url, data: data as object })).data as T,
  put: async <T>(url: string, data: unknown) =>
    (await CapacitorHttp.put({ url, data: data as object })).data as T,
  delete: async <T>(url: string) =>
    (await CapacitorHttp.delete({ url })).data as T,
};

export const featureApi = createFeatureApi(httpAdapter, API_URL);
```

### 3.4 SSR Safety (Mandatory)

```typescript
// ✅ CORRECT: Platform-safe with injection
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly platformId = inject(PLATFORM_ID);

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  get<T>(key: string): T | null {
    if (!this.isBrowser) return null;
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    if (!this.isBrowser) return;
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    if (!this.isBrowser) return;
    localStorage.removeItem(key);
  }
}
```

```typescript
// ✅ CORRECT: DOM manipulation with afterNextRender
import { Component, afterNextRender, ElementRef, viewChild } from '@angular/core';

@Component({...})
export class ChartComponent {
  private readonly chartContainer = viewChild<ElementRef>('chartContainer');

  constructor() {
    afterNextRender(() => {
      // Safe to access DOM and browser APIs here
      this.initializeChart(this.chartContainer()?.nativeElement);
    });
  }
}
```

### 3.5 Template Syntax (2026 Control Flow)

```html
<!-- ✅ CORRECT: Built-in control flow (Angular 17+) -->
<div class="feature-list">
  @if (loading()) {
  <nxt1-skeleton variant="card" [count]="3" />
  } @else if (error()) {
  <nxt1-error-state
    [message]="error()"
    actionLabel="Try Again"
    (action)="loadData()"
  />
  } @else if (isEmpty()) {
  <nxt1-empty-state
    icon="add"
    title="No items yet"
    description="Create your first item to get started"
    actionLabel="Create Item"
    (action)="createItem()"
  />
  } @else { @for (item of data(); track item.id) {
  <app-item-card [item]="item" (delete)="deleteItem(item.id)" />
  } }
</div>

<!-- ✅ CORRECT: Deferred loading for performance -->
@defer (on viewport) {
<app-heavy-component />
} @placeholder {
<nxt1-skeleton variant="chart" />
} @loading (minimum 200ms) {
<nxt1-skeleton variant="chart" />
}
```

---

## 4. Import Conventions (2026)

### 4.1 Package Imports

```typescript
// ✅ CORRECT: @nxt1/core — import from root barrel (single FESM, tree-shakeable)
import { User, UserRole, ApiResponse, formatDate, slugify } from '@nxt1/core';
import { createAuthApi, createMemoryCache, CACHE_CONFIG } from '@nxt1/core';

// ✅ ALSO CORRECT: @nxt1/core sub-path imports for feature-specific modules
import { APP_EVENTS, FIREBASE_EVENTS } from '@nxt1/core/analytics';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';
import { ILogger } from '@nxt1/core/logging';
import { TEST_IDS } from '@nxt1/core/testing';

// ✅ CORRECT (Web): @nxt1/ui — granular sub-path imports for code splitting
import { AuthShellComponent } from '@nxt1/ui/auth';
import { NxtPlatformService } from '@nxt1/ui/services/platform';
import { HapticsService } from '@nxt1/ui/services/haptics';
import { GlobalErrorHandler } from '@nxt1/ui/infrastructure';
import { NxtIconComponent } from '@nxt1/ui/components/icon';
import { NxtLogoComponent } from '@nxt1/ui/components/logo';
import { FeedService } from '@nxt1/ui/feed';
import { ExploreShellWebComponent } from '@nxt1/ui/explore';

// ✅ CORRECT (Mobile): @nxt1/ui — root barrel imports
import {
  AuthShellComponent,
  HapticsService,
  NxtPlatformService,
} from '@nxt1/ui';

// ✅ CORRECT: Local app imports (relative within app boundary)
import { AuthFlowService } from './services/auth-flow.service';
import { environment } from '../../../environments/environment';

// ❌ FORBIDDEN: Deep imports into package source files
import { User } from '@nxt1/core/src/models/user.model';

// ❌ FORBIDDEN: Cross-app imports
import { SomeService } from '../../../../apps/web/src/app/services/some.service';
```

> **Why granular @nxt1/ui imports on web?** The tsconfig path mapping
> `@nxt1/ui/*` → `packages/ui/src/*/index.ts` resolves sub-paths directly to
> source files. This allows the Angular compiler to produce optimal per-route
> code splitting. On mobile, root barrel imports are acceptable since Capacitor
> builds don't benefit from the same splitting strategy.

### 4.2 Package Boundaries

| Package               | Contains                                              | Used By                      |
| --------------------- | ----------------------------------------------------- | ---------------------------- |
| `@nxt1/core`          | Types, API factories, validation, helpers, constants  | All apps, backend, functions |
| `@nxt1/ui`            | Angular components, services, infrastructure          | Web app, mobile app          |
| `@nxt1/cache`         | Cache abstraction (Redis + in-memory fallback)        | Backend                      |
| `@nxt1/shared-types`  | Shared TypeScript type definitions                    | Backend, functions           |
| `@nxt1/config`        | Build tooling config (ESLint, Prettier, TS, Tailwind) | All apps                     |
| `@nxt1/design-tokens` | CSS/SCSS variables, tokens                            | Web app, mobile app          |

### 4.3 Avoid Hardcoding (Use Constants)

```typescript
// ✅ CORRECT: Use constants from @nxt1/core
import { USER_ROLES, PLAN_TIERS, SPORTS, CACHE_KEYS, CACHE_CONFIG } from '@nxt1/core';

// Check user role
if (user.roles.includes(USER_ROLES.ATHLETE)) { ... }

// Check subscription tier
if (user.subscription.tier === PLAN_TIERS.PREMIUM) { ... }

// Cache keys with prefixes
const cacheKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;
const ttl = CACHE_CONFIG.MEDIUM_TTL;

// ❌ FORBIDDEN: Hardcoded magic strings
if (user.role === 'athlete') { ... }  // Use USER_ROLES.ATHLETE
if (tier === 'premium') { ... }       // Use PLAN_TIERS.PREMIUM
cache.set('user:profile:123', data);  // Use CACHE_KEYS.USER_PROFILE
```

---

## 5. Lazy Loading & Routes

### 5.1 Feature Routes

```typescript
// apps/web/src/app/features/[feature]/[feature].routes.ts
import { Routes } from '@angular/router';

export const FEATURE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/list/list.component').then((m) => m.ListComponent),
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./pages/create/create.component').then((m) => m.CreateComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/detail/detail.component').then((m) => m.DetailComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./pages/edit/edit.component').then((m) => m.EditComponent),
  },
];

export default FEATURE_ROUTES;
```

> **Note**: The web app uses **no client-side auth guards** on routes — the
> backend enforces all auth/role checks. This follows the same pattern as
> Twitter, Instagram, and LinkedIn where routes are publicly accessible and auth
> state is checked after the page loads. Pure guard logic lives in
> `@nxt1/core/auth` (`requireAuth`, `requireRole`) and Angular wrappers exist in
> `apps/web/src/app/features/auth/guards/` but are used sparingly.

### 5.2 SSR Render Modes

All routes render server-side by default. The actual `app.routes.server.ts` uses
`RenderMode.Server` for all paths (100% SSR):

```typescript
// apps/web/src/app/app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Public SEO pages — Server-side render
  { path: 'profile/:id', renderMode: RenderMode.Server },
  { path: 'team/:name', renderMode: RenderMode.Server },
  { path: 'explore/**', renderMode: RenderMode.Server },

  // Auth & protected pages — ALSO server-side rendered
  { path: 'auth/**', renderMode: RenderMode.Server },
  { path: 'settings/**', renderMode: RenderMode.Server },

  // Default fallback — everything is SSR
  { path: '**', renderMode: RenderMode.Server },
];
```

---

## 6. Caching Strategy

### 6.1 Cache TTL Guidelines

```typescript
import { CACHE_CONFIG } from '@nxt1/core';

// CACHE_CONFIG values:
// - SHORT_TTL:    60_000     (1 minute)  — Feed, live stats, notifications
// - MEDIUM_TTL:   900_000    (15 minutes) — Profiles, teams, user data
// - LONG_TTL:     3_600_000  (1 hour)    — Colleges, static content
// - EXTENDED_TTL: 86_400_000 (24 hours)  — Sports list, positions, rarely changing
```

### 6.2 Cache Key Patterns

```typescript
import { CACHE_KEYS } from '@nxt1/core';

// Use standardized key prefixes
const profileKey = `${CACHE_KEYS.USER_PROFILE}${userId}`;
const teamKey = `${CACHE_KEYS.TEAM_DETAILS}${teamId}`;
const collegeKey = CACHE_KEYS.COLLEGE_LIST; // Static, no suffix
```

### 6.3 Web Caching (HTTP Interceptor)

```typescript
// apps/web/src/app/app.config.ts
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import {
  httpPerformanceInterceptor,
  authInterceptor,
  httpErrorInterceptor,
  httpCacheInterceptor,
} from './core/infrastructure';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(
      withFetch(),
      withInterceptors([
        httpPerformanceInterceptor({ apiOnly: true }),
        authInterceptor,
        httpErrorInterceptor,
        httpCacheInterceptor,
      ])
    ),
  ],
};
```

---

## 7. Error Handling (Enterprise Pattern)

### 7.1 API Error Factory (Use @nxt1/core)

```typescript
import {
  createApiError,
  validationError,
  notFoundError,
  unauthorizedError,
  NxtApiError,
  parseApiError,
} from '@nxt1/core';

// Backend: Create standardized errors
throw validationError('Email is required', [
  { field: 'email', message: 'Email is required' },
]);

throw notFoundError('User not found', 'USER_NOT_FOUND');

// Frontend: Parse and handle
try {
  await api.updateProfile(data);
} catch (err) {
  const apiError = parseApiError(err);

  if (apiError.isValidationError) {
    // Show field-level errors
    const emailError = apiError.getFieldError('email');
  } else if (apiError.requiresAuth) {
    // Redirect to login
  } else if (apiError.shouldRetry) {
    // Retry with exponential backoff
  }
}
```

### 7.2 Service Error Handling Pattern

```typescript
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = inject(ProfileApiService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  private readonly _error = signal<string | null>(null);
  readonly error = computed(() => this._error());

  async updateProfile(data: ProfileUpdate): Promise<boolean> {
    this._error.set(null);
    this.logger.info('Updating profile', { fields: Object.keys(data) });

    try {
      await this.api.update(data);
      this.logger.info('Profile updated successfully');
      this.analytics?.trackEvent(APP_EVENTS.PROFILE_UPDATED, {
        fields: Object.keys(data),
      });
      this.toast.success('Profile updated successfully');
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to update profile';
      this.logger.error('Failed to update profile', err, {
        fields: Object.keys(data),
      });
      this._error.set(message);
      this.toast.error(message);
      return false;
    }
  }
}
```

---

## 8. Native UX Patterns (2026 Standards)

### 8.1 Haptic Feedback (Required)

```typescript
// ✅ CORRECT: Use HapticsService from @nxt1/ui/services/haptics
import { HapticsService } from '@nxt1/ui/services/haptics';

@Component({...})
export class ActionComponent {
  private readonly haptics = inject(HapticsService);

  async onButtonClick(): Promise<void> {
    await this.haptics.impact('light');
    // ... action
  }

  async onSuccess(): Promise<void> {
    await this.haptics.notification('success');
    // ... celebration
  }

  async onError(): Promise<void> {
    await this.haptics.notification('error');
    // ... error handling
  }
}
```

```html
<!-- Template-based haptics with directives -->
<button nxtHapticButton="medium" (click)="submit()">Submit</button>
<ion-item nxtHapticSelection>Select Option</ion-item>
```

### 8.2 Loading States (Skeletons, Not Spinners)

```html
<!-- ✅ CORRECT: Skeleton loading for content -->
@if (loading()) {
<div class="skeleton-list">
  @for (i of [1, 2, 3]; track i) {
  <div class="skeleton-card animate-pulse">
    <div class="skeleton-avatar"></div>
    <div class="skeleton-text"></div>
  </div>
  }
</div>
} @else {
<!-- Actual content -->
}
```

### 8.3 Empty States with Actions

```html
<!-- ✅ CORRECT: Actionable empty state -->
@if (isEmpty()) {
<div class="empty-state">
  <nxt1-icon name="sports" size="48" />
  <h3>No sports added yet</h3>
  <p>Add your primary sport to get started</p>
  <button class="btn-primary" (click)="addSport()">
    <nxt1-icon name="add" /> Add Sport
  </button>
</div>
}
```

### 8.4 Bottom Sheet (Native-Style Modals)

```typescript
import { NxtBottomSheetService } from '@nxt1/ui/components/bottom-sheet';

@Component({...})
export class SettingsComponent {
  private readonly bottomSheet = inject(NxtBottomSheetService);

  async showOptions(): Promise<void> {
    const result = await this.bottomSheet.open({
      title: 'Options',
      actions: [
        { id: 'edit', label: 'Edit Profile', icon: 'edit' },
        { id: 'share', label: 'Share Profile', icon: 'share' },
        { id: 'delete', label: 'Delete', icon: 'delete', destructive: true },
      ],
    });

    if (result?.action === 'delete') {
      await this.confirmDelete();
    }
  }
}
```

### 8.5 Ionic Navigation & Routing (CRITICAL)

> **CRITICAL**: Always use Ionic's navigation components in mobile app, never
> Angular's standard router components.

**Why**: Ionic components (`ion-content`, `ion-header`, etc.) require Ionic's
routing context to calculate dimensions correctly. Using Angular's
`RouterOutlet` causes `ion-content` to collapse to 0 height.

```typescript
// ❌ WRONG: Angular RouterOutlet in mobile shell - ion-content will NOT render
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  template: `
    <div class="shell">
      <router-outlet></router-outlet>  <!-- WRONG - breaks ion-content sizing -->
    </div>
  `
})

// ✅ CORRECT: IonRouterOutlet in mobile shell
import { IonRouterOutlet } from '@ionic/angular/standalone';

@Component({
  imports: [IonRouterOutlet],
  template: `
    <div class="shell">
      <ion-router-outlet></ion-router-outlet>  <!-- CORRECT - Ionic page lifecycle -->
    </div>
  `
})
```

**Navigation in Services/Components**:

```typescript
// ❌ WRONG: Angular Router for programmatic navigation in mobile
import { Router } from '@angular/router';
this.router.navigate(['/home']);

// ✅ CORRECT: NavController for programmatic navigation in mobile
import { NavController } from '@ionic/angular/standalone';

@Injectable({ providedIn: 'root' })
export class AuthFlowService {
  private readonly navController = inject(NavController);

  async navigateToHome(): Promise<void> {
    // Forward navigation with slide animation
    await this.navController.navigateForward('/home');
  }

  async navigateBack(): Promise<void> {
    // Back navigation with reverse slide animation
    await this.navController.navigateBack('/auth');
  }

  async navigateToRoot(): Promise<void> {
    // Replace entire navigation stack
    await this.navController.navigateRoot('/home');
  }
}
```

**Key Rules**:

- Shell/layout components: Use `IonRouterOutlet`, not `RouterOutlet`
- Programmatic navigation: Use `NavController`, not `Router`
- Root app component: Use `IonApp` + `IonRouterOutlet`
- Child pages using `ion-content`: Parent MUST use `IonRouterOutlet`

---

## 9. Testing Patterns

### 9.1 Pure Function Tests (No TestBed)

```typescript
// packages/core/src/api/__tests__/feature.api.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { createFeatureApi } from '../feature.api';
import type { HttpAdapter } from '../http.types';

describe('createFeatureApi', () => {
  const mockHttp: HttpAdapter = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  const api = createFeatureApi(mockHttp, '/api/v1');

  it('should fetch items', async () => {
    const mockResponse = { success: true, data: [{ id: '1', name: 'Test' }] };
    vi.mocked(mockHttp.get).mockResolvedValue(mockResponse);

    const result = await api.getItems();

    expect(mockHttp.get).toHaveBeenCalledWith('/api/v1/items');
    expect(result).toEqual([{ id: '1', name: 'Test' }]);
  });

  it('should throw on API error', async () => {
    vi.mocked(mockHttp.get).mockResolvedValue({
      success: false,
      error: 'Not found',
    });

    await expect(api.getItems()).rejects.toThrow('Not found');
  });
});
```

### 9.2 Angular Service Tests (Vitest + TestBed)

```typescript
// apps/web/src/app/feature/services/__tests__/feature.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeatureService } from '../feature.service';
import { FeatureApiService } from '../feature-api.service';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';

describe('FeatureService', () => {
  let service: FeatureService;
  const apiMock = {
    getItems: vi.fn(),
    deleteItem: vi.fn(),
  };
  const loggerMock = { info: vi.fn(), error: vi.fn(), child: vi.fn() };
  loggerMock.child.mockReturnValue(loggerMock);

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        FeatureService,
        { provide: FeatureApiService, useValue: apiMock },
        { provide: NxtLoggingService, useValue: loggerMock },
        {
          provide: NxtBreadcrumbService,
          useValue: { trackStateChange: vi.fn() },
        },
        { provide: ANALYTICS_ADAPTER, useValue: { trackEvent: vi.fn() } },
      ],
    });

    service = TestBed.inject(FeatureService);
  });

  it('should load data and update signals', async () => {
    const mockData = [{ id: '1', name: 'Test' }];
    apiMock.getItems.mockResolvedValue(mockData);

    await service.loadData();

    expect(service.data()).toEqual(mockData);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });

  it('should set error signal on API failure', async () => {
    apiMock.getItems.mockRejectedValue(new Error('Network error'));

    await service.loadData();

    expect(service.error()).toBe('Network error');
    expect(service.loading()).toBe(false);
    expect(loggerMock.error).toHaveBeenCalled();
  });
});
```

---

## 10. Analytics Tracking (Mandatory Per Feature)

### 10.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                Components / Services                        │
│   inject(ANALYTICS_ADAPTER) → trackEvent() / setUser()     │
├─────────────────────────────────────────────────────────────┤
│              @nxt1/core/analytics (100% Portable)           │
│   APP_EVENTS, FIREBASE_EVENTS, USER_PROPERTIES,            │
│   EventPayloadMap, AnalyticsAdapter interface               │
├───────────────┬─────────────────┬───────────────────────────┤
│ Mobile        │ Web             │ SSR / Test                │
│ Capacitor FA  │ @angular/fire   │ createMemory-             │
│ Plugin        │ GA4 / gtag      │ AnalyticsAdapter()        │
└───────────────┴─────────────────┴───────────────────────────┘
```

### 10.2 Event Constants (Never Hardcode Event Names)

```typescript
import {
  APP_EVENTS,
  FIREBASE_EVENTS,
  USER_PROPERTIES,
} from '@nxt1/core/analytics';

// ✅ CORRECT: Use typed constants
this.analytics?.trackEvent(APP_EVENTS.PROFILE_VIEWED, { profileId: id });
this.analytics?.trackEvent(FIREBASE_EVENTS.SHARE, {
  method: 'link',
  content_type: 'post',
  item_id: postId,
});
this.analytics?.trackEvent(FIREBASE_EVENTS.SEARCH, { search_term: query });

// ✅ CORRECT: Set user properties on auth
this.analytics?.setUserProperties({
  [USER_PROPERTIES.USER_TYPE]: user.role,
  [USER_PROPERTIES.SPORT]: user.primarySport,
  [USER_PROPERTIES.SUBSCRIPTION_TIER]: user.subscription.tier,
});

// ❌ FORBIDDEN: Hardcoded event strings
this.analytics?.trackEvent('profile_viewed', { profileId: id }); // Use APP_EVENTS.PROFILE_VIEWED
```

### 10.3 Service Pattern (Inject & Track)

```typescript
import { Injectable, inject } from '@angular/core';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { APP_EVENTS, FIREBASE_EVENTS } from '@nxt1/core/analytics';

@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });

  async loadFeature(id: string): Promise<void> {
    // Track page/feature view
    this.analytics?.trackEvent(APP_EVENTS.FEATURE_VIEWED, { featureId: id });
    // ... load data
  }

  async createItem(data: CreateItemRequest): Promise<void> {
    // ... create item
    this.analytics?.trackEvent(APP_EVENTS.ITEM_CREATED, {
      itemType: data.type,
      source: 'feature-page',
    });
  }

  async shareItem(id: string, method: string): Promise<void> {
    // Use Firebase recommended events when applicable
    this.analytics?.trackEvent(FIREBASE_EVENTS.SHARE, {
      method,
      content_type: 'item',
      item_id: id,
    });
  }
}
```

### 10.4 Adding New Events

When creating a new feature, add its events to `APP_EVENTS` in
`packages/core/src/analytics/events.ts`:

```typescript
// packages/core/src/analytics/events.ts
export const APP_EVENTS = {
  // ... existing events

  // New feature events (add here)
  FEATURE_VIEWED: 'feature_viewed',
  FEATURE_ITEM_CREATED: 'feature_item_created',
  FEATURE_ITEM_DELETED: 'feature_item_deleted',
  FEATURE_FILTER_APPLIED: 'feature_filter_applied',
} as const;
```

### 10.5 When to Track

| User Action         | Event Type                          | Example                                  |
| ------------------- | ----------------------------------- | ---------------------------------------- |
| Page/screen load    | `APP_EVENTS.*_VIEWED`               | `PROFILE_VIEWED`, `FEED_VIEWED`          |
| Create/submit       | `APP_EVENTS.*_CREATED`              | `POST_CREATED`, `REPORT_CREATED`         |
| Delete              | `APP_EVENTS.*_DELETED`              | `POST_DELETED`                           |
| Share               | `FIREBASE_EVENTS.SHARE`             | With `method`, `content_type`, `item_id` |
| Search              | `FIREBASE_EVENTS.SEARCH`            | With `search_term`                       |
| Sign up / login     | `FIREBASE_EVENTS.SIGN_UP` / `LOGIN` | With `method`                            |
| Purchase            | `FIREBASE_EVENTS.PURCHASE`          | With `value`, `currency`                 |
| Error (user-facing) | `APP_EVENTS.ERROR_*`                | `ERROR_API`, `ERROR_PAYMENT`             |
| Filter/sort change  | `APP_EVENTS.*_FILTER_APPLIED`       | With filter values                       |

---

## 11. Structured Logging (Mandatory Per Feature)

### 11.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Feature Services                          │
│   inject(NxtLoggingService).child('FeatureName')            │
├─────────────────────────────────────────────────────────────┤
│               NxtLoggingService (Angular)                    │
│   Auto-detects env, platform, min log level                 │
│   PII redaction: password, token, apiKey, ssn, etc.         │
├─────────────────────────────────────────────────────────────┤
│              @nxt1/core/logging (100% Portable)             │
│   ILogger, LogEntry, LogLevel, LogTransport                 │
├───────────────┬─────────────────┬───────────────────────────┤
│ Console       │ Remote (HTTP)   │ Analytics                 │
│ (always)      │ (prod only)     │ (error events)            │
└───────────────┴─────────────────┴───────────────────────────┘
```

### 11.2 Log Levels by Environment

| Environment | Minimum Level | Transports                    |
| ----------- | ------------- | ----------------------------- |
| Development | `debug`       | Console                       |
| Staging     | `info`        | Console                       |
| Production  | `warn`        | Console + Remote (HTTP batch) |

### 11.3 Service Pattern (Required)

Every feature service MUST create a child logger:

```typescript
import { Injectable, inject } from '@angular/core';
import { NxtLoggingService } from '@nxt1/ui/services/logging';

@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly logger = inject(NxtLoggingService).child('FeatureService');

  async loadData(id: string): Promise<void> {
    this.logger.info('Loading feature data', { id });

    try {
      const result = await this.api.getItems(id);
      this._data.set(result);
      this.logger.info('Feature data loaded', { id, count: result.length });
    } catch (err) {
      this.logger.error('Failed to load feature data', err, { id });
      this._error.set(err instanceof Error ? err.message : 'Load failed');
    }
  }

  async deleteItem(id: string): Promise<void> {
    this.logger.info('Deleting item', { id });

    try {
      await this.api.deleteItem(id);
      this.logger.info('Item deleted', { id });
    } catch (err) {
      this.logger.error('Failed to delete item', err, { id });
      throw err;
    }
  }
}
```

### 11.4 Log Level Guidelines

| Level   | Use For                        | Example                                    |
| ------- | ------------------------------ | ------------------------------------------ |
| `debug` | Verbose development info       | `'Cache hit for key', { key }`             |
| `info`  | Key operations / data flow     | `'Profile loaded', { userId, sport }`      |
| `warn`  | Recoverable issues / fallbacks | `'Cache miss, fetching from API', { key }` |
| `error` | Failed operations (caught)     | `'Failed to save draft', err, { draftId }` |
| `fatal` | Unrecoverable / crash-level    | `'Database connection lost', err`          |

### 11.5 Rules

```typescript
// ✅ CORRECT: Child logger with structured data
this.logger.error('Failed to load feed', err, { page, filter, userId });

// ❌ FORBIDDEN: console.log / console.error directly
console.log('something happened'); // Use logger.info()
console.error('failed', err); // Use logger.error()

// ❌ FORBIDDEN: No logger in a feature service
@Injectable({ providedIn: 'root' })
export class FeatureService {
  // Missing: private readonly logger = inject(NxtLoggingService).child('FeatureService');
}

// ❌ FORBIDDEN: Logging PII directly (auto-redacted, but avoid explicitly)
this.logger.info('User data', { password: '123', ssn: '555-12-3456' });
```

---

## 12. Crashlytics & Breadcrumbs (Mandatory)

### 12.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│         GlobalErrorHandler (catches ALL unhandled errors)    │
│   Severity classification → PII scrubbing → Crashlytics     │
├─────────────────────────────────────────────────────────────┤
│         NxtBreadcrumbService (tracks user journey)          │
│   Navigation, clicks, forms, HTTP, state changes            │
├───────────────┬─────────────────┬───────────────────────────┤
│ Mobile        │ Web             │ SSR / Test                │
│ Crashlytics   │ GA4 exception   │ createNoOp-               │
│ (native SDK)  │ events          │ CrashlyticsAdapter()      │
└───────────────┴─────────────────┴───────────────────────────┘
```

### 12.2 Infrastructure Setup (Already Wired)

```typescript
// apps/web/src/app/app.config.ts (already configured)
import {
  GLOBAL_ERROR_LOGGER,
  GLOBAL_CRASHLYTICS,
  GlobalErrorHandler,
} from '@nxt1/ui/infrastructure';

providers: [
  { provide: GLOBAL_ERROR_LOGGER, useExisting: NxtLoggingService },
  { provide: GLOBAL_CRASHLYTICS, useExisting: CrashlyticsService },
  { provide: ErrorHandler, useClass: GlobalErrorHandler },
];
```

The `GlobalErrorHandler` automatically:

- Catches all unhandled errors (throw, promise rejection, HTTP)
- Classifies severity (`fatal` / `error` / `warning` / `info`)
- Scrubs PII (passwords, tokens, SSNs) before reporting
- Shows user-friendly toast (rate-limited to 5s cooldown)
- Auto-recovers from chunk load failures (up to 2 reloads)
- Categorizes: `network`, `authentication`, `navigation`, `storage`, `payment`,
  `media`, `javascript`

### 12.3 Breadcrumb Tracking in Features

Use `NxtBreadcrumbService` to leave a trail for crash debugging:

```typescript
import { Injectable, inject } from '@angular/core';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';

@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly breadcrumb = inject(NxtBreadcrumbService);

  async loadProfile(userId: string): Promise<void> {
    // Leave breadcrumbs at key decision points
    this.breadcrumb.trackStateChange('feature', 'loading', { userId });

    try {
      const profile = await this.api.getProfile(userId);
      this.breadcrumb.trackStateChange('feature', 'loaded', {
        userId,
        hasSport: !!profile.sport,
      });
    } catch (err) {
      // Error breadcrumb auto-added by GlobalErrorHandler,
      // but you can add context breadcrumbs before throwing
      this.breadcrumb.trackStateChange('feature', 'error', { userId });
      throw err;
    }
  }
}
```

### 12.4 Template Directives (Automatic Breadcrumbs)

```html
<!-- Track button clicks automatically -->
<button nxtTrackClick="delete-item" (click)="deleteItem(item.id)">
  Delete
</button>

<!-- Track form submissions -->
<form nxtTrackForm="create-item" (ngSubmit)="onSubmit()">
  <!-- fields -->
</form>

<!-- Track element visibility (scroll into view) -->
<div nxtTrackVisible="feature-section-cta">
  <h2>Get Started</h2>
</div>
```

### 12.5 Breadcrumb Methods Reference

| Method                                    | When to Use             | Example                                            |
| ----------------------------------------- | ----------------------- | -------------------------------------------------- |
| `trackNavigation(from, to)`               | Auto — route changes    | Handled internally                                 |
| `trackUserAction(action, data?)`          | Manual user action      | `trackUserAction('filter-applied', { sport })`     |
| `trackFormSubmit(formName, data?)`        | Form submission         | `trackFormSubmit('edit-profile', { fields })`      |
| `trackHttpRequest(method, url, status)`   | Auto — HTTP interceptor | Handled internally                                 |
| `trackStateChange(feature, state, data?)` | State transitions       | `trackStateChange('feed', 'refreshed', { count })` |
| `trackAuth(action, data?)`                | Auth events             | `trackAuth('login', { method: 'google' })`         |

### 12.6 Error Types (Use @nxt1/core/crashlytics)

```typescript
import { createAppError, createHttpAppError } from '@nxt1/core/crashlytics';

// Create structured errors with context for Crashlytics
const error = createAppError('Feature load failed', {
  category: 'data',
  severity: 'error',
  context: { featureId, userId, endpoint },
});

// HTTP-specific errors (auto-classified)
const httpError = createHttpAppError(response.status, url, {
  method: 'GET',
  body: null,
});
```

---

## 13. Performance Tracing (Mandatory Per Feature)

### 13.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│               Feature Services / API Services               │
│   performance.trace(TRACE_NAMES.*, fn, { attributes })      │
├─────────────────────────────────────────────────────────────┤
│          httpPerformanceInterceptor (auto for HTTP)         │
│   Auto-traces all API calls with method, status, size       │
├─────────────────────────────────────────────────────────────┤
│              @nxt1/core/performance (Portable)              │
│   TRACE_NAMES, METRIC_NAMES, ATTRIBUTE_NAMES, TraceBuilder │
├───────────────┬─────────────────┬───────────────────────────┤
│ Mobile        │ Web             │ SSR / Test                │
│ FirebasePerf  │ @angular/fire   │ NoOpPerformance-          │
│ Capacitor     │ firebase/perf   │ Adapter()                 │
└───────────────┴─────────────────┴───────────────────────────┘
```

### 13.2 HTTP Auto-Tracing (Already Wired)

The `httpPerformanceInterceptor` auto-traces every API call:

```typescript
// apps/web/src/app/app.config.ts (already configured)
provideHttpClient(
  withFetch(),
  withInterceptors([
    httpPerformanceInterceptor({ apiOnly: true }),
    authInterceptor,
    httpErrorInterceptor,
    httpCacheInterceptor,
  ])
);
```

Auto-recorded per request: `endpoint`, `http_method`, `status_code`,
`request_size_bytes`, `response_size_bytes`, `duration_ms`, `success`.

### 13.3 Custom Traces in Feature Services (Required)

Wrap critical operations with named traces:

```typescript
import { Injectable, inject } from '@angular/core';
import { PerformanceService } from '../../core/services/performance.service';
import { TRACE_NAMES, ATTRIBUTE_NAMES } from '@nxt1/core/performance';

@Injectable({ providedIn: 'root' })
export class FeatureApiService {
  private readonly performance = inject(PerformanceService);

  async getItems(filter: string): Promise<Item[]> {
    return this.performance.trace(
      TRACE_NAMES.FEED_LOAD, // Use existing or add new trace name
      () => this.api.getItems(filter),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feature',
          [ATTRIBUTE_NAMES.CONTENT_TYPE]: filter,
        },
        onSuccess: (result) => ({
          metrics: { items_loaded: result.length },
        }),
      }
    );
  }

  async createItem(data: CreateItemRequest): Promise<Item> {
    return this.performance.trace(
      TRACE_NAMES.POST_CREATE,
      () => this.api.createItem(data),
      {
        attributes: {
          [ATTRIBUTE_NAMES.FEATURE_NAME]: 'feature',
          [ATTRIBUTE_NAMES.CONTENT_TYPE]: data.type,
        },
      }
    );
  }
}
```

### 13.4 Adding New Trace Names

When creating a new feature, add trace names to
`packages/core/src/performance/performance.types.ts`:

```typescript
export const TRACE_NAMES = {
  // ... existing traces

  // New feature traces (add here)
  FEATURE_LIST_LOAD: 'feature_list_load',
  FEATURE_DETAIL_LOAD: 'feature_detail_load',
  FEATURE_CREATE: 'feature_create',
  FEATURE_UPDATE: 'feature_update',
  FEATURE_DELETE: 'feature_delete',
} as const;
```

### 13.5 Trace Utilities (Advanced)

```typescript
import {
  traceBuilder,
  traceBatch,
  traceWithRetry,
} from '@nxt1/core/performance';

// Builder pattern for complex traces
const result = await traceBuilder('complex_operation')
  .attribute('feature', 'scout-reports')
  .attribute('sport', sport)
  .metric('report_count', reports.length)
  .execute(() => this.api.generateReports(sport));

// Batch multiple parallel traces
const [profiles, teams] = await traceBatch([
  { name: TRACE_NAMES.PROFILE_LOAD, fn: () => this.api.getProfiles() },
  { name: TRACE_NAMES.TEAM_LOAD, fn: () => this.api.getTeams() },
]);

// Trace with automatic retry
const data = await traceWithRetry(
  TRACE_NAMES.FEED_LOAD,
  () => this.api.getFeed(),
  { maxRetries: 3, backoffMs: 1000 }
);
```

### 13.6 What to Trace

| Operation            | Trace Name Pattern                 | Required?      |
| -------------------- | ---------------------------------- | -------------- |
| List/feed load       | `*_load`                           | ✅ Yes         |
| Detail page load     | `*_detail_load`                    | ✅ Yes         |
| Create/update/delete | `*_create`, `*_update`, `*_delete` | ✅ Yes         |
| Search               | `search_execute`                   | ✅ Yes         |
| File upload          | `image_upload`, `video_upload`     | ✅ Yes         |
| Auth operations      | `auth_*`                           | Already traced |
| HTTP requests        | Auto-traced                        | Already wired  |
| Route changes        | `navigation_route_change`          | Already traced |

---

## 14. E2E Testing (Mandatory Per Feature)

### 14.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Playwright Tests                       │
│   tests/[feature]/*.spec.ts — Complete user flows           │
├─────────────────────────────────────────────────────────────┤
│                    Page Object Layer                         │
│   pages/[feature].page.ts — Encapsulate selectors/actions   │
├─────────────────────────────────────────────────────────────┤
│                     Fixtures Layer                           │
│   fixtures/ — DI for page objects, auth state, test data    │
├─────────────────────────────────────────────────────────────┤
│                   API Mocking (MSW)                          │
│   mocks/ — Mock API responses for deterministic tests       │
├─────────────────────────────────────────────────────────────┤
│              @nxt1/core/testing (Shared)                     │
│   TEST_IDS, TEST_PROFILES, TIMEOUTS, ROUTES, fixtures       │
└─────────────────────────────────────────────────────────────┘
```

### 14.2 Directory Structure

```
apps/web/e2e/
├── playwright.config.ts        # Multi-browser config
├── global.setup.ts             # Auth state setup
├── global.teardown.ts          # Cleanup
├── fixtures/                   # Test fixtures (DI for page objects)
├── mocks/                      # MSW API mock handlers
├── pages/                      # Page Object classes
│   └── [feature].page.ts
├── tests/
│   ├── [feature]/
│   │   ├── [feature].spec.ts   # Happy path + error flows
│   │   └── [feature]-visual.spec.ts  # Visual regression (optional)
│   ├── auth/                   # Auth flow E2E tests
│   └── visual/                 # Visual regression tests
├── snapshots/                  # Visual regression baselines
└── utils/
    ├── test-data.ts            # Shared test data generators
    ├── environment.ts          # Environment config
    └── test-helpers.ts         # Common assertions/utilities
```

### 14.3 TEST_IDS in Component Templates (Required)

Every interactive or assertable element MUST have a `data-testid`:

```typescript
// packages/core/src/testing/index.ts — Add feature test IDs
export const FEATURE_TEST_IDS = {
  LIST_CONTAINER: 'feature-list-container',
  LIST_ITEM: 'feature-list-item',
  CREATE_BUTTON: 'feature-create-button',
  DELETE_BUTTON: 'feature-delete-button',
  SEARCH_INPUT: 'feature-search-input',
  EMPTY_STATE: 'feature-empty-state',
  ERROR_STATE: 'feature-error-state',
  LOADING_SKELETON: 'feature-loading-skeleton',
} as const;

export const TEST_IDS = {
  AUTH: AUTH_TEST_IDS,
  AUTH_PAGE: AUTH_PAGE_TEST_IDS,
  ONBOARDING: ONBOARDING_TEST_IDS,
  ONBOARDING_PAGE: ONBOARDING_PAGE_TEST_IDS,
  COMMON: COMMON_TEST_IDS,
  FEATURE: FEATURE_TEST_IDS, // ← Register here
} as const;
```

Use them in templates:

```html
<!-- ✅ CORRECT: data-testid from constants -->
<div [attr.data-testid]="testIds.LIST_CONTAINER">
  @for (item of data(); track item.id) {
  <app-item-card [item]="item" [attr.data-testid]="testIds.LIST_ITEM" />
  }
</div>

<button [attr.data-testid]="testIds.CREATE_BUTTON" (click)="create()">
  Create
</button>
```

```typescript
// Component class
import { TEST_IDS } from '@nxt1/core/testing';

@Component({...})
export class FeatureListComponent {
  protected readonly testIds = TEST_IDS.FEATURE;
}
```

### 14.4 Page Object Pattern

```typescript
// apps/web/e2e/pages/feature.page.ts
import { type Page, type Locator } from '@playwright/test';
import { TEST_IDS } from '@nxt1/core/testing';

export class FeaturePage {
  readonly listContainer: Locator;
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly errorState: Locator;
  readonly loadingSkeleton: Locator;

  constructor(private readonly page: Page) {
    this.listContainer = page.getByTestId(TEST_IDS.FEATURE.LIST_CONTAINER);
    this.createButton = page.getByTestId(TEST_IDS.FEATURE.CREATE_BUTTON);
    this.searchInput = page.getByTestId(TEST_IDS.FEATURE.SEARCH_INPUT);
    this.emptyState = page.getByTestId(TEST_IDS.FEATURE.EMPTY_STATE);
    this.errorState = page.getByTestId(TEST_IDS.FEATURE.ERROR_STATE);
    this.loadingSkeleton = page.getByTestId(TEST_IDS.FEATURE.LOADING_SKELETON);
  }

  async goto(): Promise<void> {
    await this.page.goto('/feature');
    await this.listContainer.waitFor({ state: 'visible' });
  }

  async createItem(name: string): Promise<void> {
    await this.createButton.click();
    await this.page.getByLabel('Name').fill(name);
    await this.page.getByRole('button', { name: 'Submit' }).click();
  }

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForResponse('**/api/v1/items?*');
  }

  getItemByIndex(index: number): Locator {
    return this.listContainer
      .getByTestId(TEST_IDS.FEATURE.LIST_ITEM)
      .nth(index);
  }
}
```

### 14.5 Test Spec Pattern

```typescript
// apps/web/e2e/tests/feature/feature.spec.ts
import { test, expect } from '@playwright/test';
import { TEST_IDS } from '@nxt1/core/testing';
import { FeaturePage } from '../../pages/feature.page';

test.describe('Feature', () => {
  let featurePage: FeaturePage;

  test.beforeEach(async ({ page }) => {
    featurePage = new FeaturePage(page);
    await featurePage.goto();
  });

  test('should display items list', async () => {
    await expect(featurePage.listContainer).toBeVisible();
    await expect(featurePage.getItemByIndex(0)).toBeVisible();
  });

  test('should show empty state when no items', async ({ page }) => {
    // MSW mock: return empty array
    await page.route('**/api/v1/items', (route) =>
      route.fulfill({ status: 200, json: { success: true, data: [] } })
    );
    await featurePage.goto();
    await expect(featurePage.emptyState).toBeVisible();
  });

  test('should show error state on API failure', async ({ page }) => {
    await page.route('**/api/v1/items', (route) =>
      route.fulfill({
        status: 500,
        json: { success: false, error: 'Server error' },
      })
    );
    await featurePage.goto();
    await expect(featurePage.errorState).toBeVisible();
  });

  test('should create a new item', async () => {
    await featurePage.createItem('Test Item');
    await expect(featurePage.getItemByIndex(0)).toContainText('Test Item');
  });

  test('should search and filter items', async () => {
    await featurePage.search('basketball');
    const items = featurePage.listContainer.getByTestId(
      TEST_IDS.FEATURE.LIST_ITEM
    );
    await expect(items).toHaveCount(1);
  });
});
```

### 14.6 Required E2E Coverage Per Feature

| Scenario                      | Required?                                |
| ----------------------------- | ---------------------------------------- |
| Happy path (load → display)   | ✅ Yes                                   |
| Empty state                   | ✅ Yes                                   |
| Error state (API failure)     | ✅ Yes                                   |
| Create flow (if applicable)   | ✅ Yes                                   |
| Delete flow (if applicable)   | ✅ Yes                                   |
| Search/filter (if applicable) | ✅ Yes                                   |
| Auth-required redirect        | ✅ If auth-gated                         |
| Visual regression             | Optional (recommended for landing pages) |
| Mobile viewport               | Recommended                              |

---

## 15. Production Readiness Checklist

### 15.1 Rendering & Bundle Performance

- [ ] All routes use `loadComponent` for lazy loading
- [ ] `ChangeDetectionStrategy.OnPush` on every component
- [ ] `track` function in every `@for` loop
- [ ] `@defer` for below-fold heavy components
- [ ] `NgOptimizedImage` for all images with explicit dimensions
- [ ] Virtual scrolling for lists > 50 items
- [ ] HTTP cache interceptor with appropriate TTLs
- [ ] Bundle size monitored (main bundle < 200KB gzipped)
- [ ] Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1

### 15.2 Observability (All Required)

- [ ] **Analytics**: Key user actions tracked via `ANALYTICS_ADAPTER`
- [ ] **Analytics**: Feature events added to `APP_EVENTS` (no hardcoded strings)
- [ ] **Logging**: Service has child logger via
      `inject(NxtLoggingService).child()`
- [ ] **Logging**: All catch blocks log at `error` level with context data
- [ ] **Logging**: Key operations logged at `info` level
- [ ] **Crashlytics**: `GlobalErrorHandler` wired (app-level — already done)
- [ ] **Breadcrumbs**: Key state transitions tracked via `NxtBreadcrumbService`
- [ ] **Breadcrumbs**: Interactive elements use `nxtTrackClick` directive
- [ ] **Performance**: Critical API calls wrapped in named traces
      (`TRACE_NAMES`)
- [ ] **Performance**: New trace names added to `TRACE_NAMES` constant

### 15.3 Testing (All Required)

- [ ] **Unit tests**: Pure functions tested (no TestBed) via Vitest
- [ ] **Unit tests**: Service tested with mocked API dependencies
- [ ] **TEST_IDS**: All interactive elements have `data-testid` from constants
- [ ] **E2E**: Happy path test exists in `apps/web/e2e/tests/[feature]/`
- [ ] **E2E**: Error state test exists
- [ ] **E2E**: Empty state test exists
- [ ] **E2E**: Page Object created in `apps/web/e2e/pages/`

### 15.4 Code Quality

- [ ] No `console.log` / `console.error` (use `NxtLoggingService`)
- [ ] No hardcoded event names (use `APP_EVENTS` / `FIREBASE_EVENTS`)
- [ ] No hardcoded trace names (use `TRACE_NAMES`)
- [ ] No hardcoded test IDs (use `TEST_IDS`)
- [ ] No `any` types without explicit justification
- [ ] SSR-safe (no direct `window` / `document` / `localStorage`)

---

## 16. FORBIDDEN Patterns

```typescript
// ❌ NEVER: Direct browser API without platform guard
localStorage.setItem('key', 'value');
window.scrollTo(0, 0);
document.getElementById('element');

// ❌ NEVER: NgModules (use standalone components)
@NgModule({ declarations: [...], imports: [...] })
export class FeatureModule {}

// ❌ NEVER: BehaviorSubject for component state (use signals)
private data$ = new BehaviorSubject<Item[]>([]);

// ❌ NEVER: `any` type without explicit justification
function process(data: any) {}

// ❌ NEVER: Hardcoded strings for enums/constants
if (user.role === 'athlete') {}  // Use USER_ROLES.ATHLETE
if (tier === 'premium') {}       // Use PLAN_TIERS.PREMIUM

// ❌ NEVER: Deep relative imports
import { Service } from '../../../core/services/service';

// ❌ NEVER: Framework code in @nxt1/core
import { Injectable } from '@angular/core';  // In packages/core

// ❌ NEVER: Incomplete code or placeholders
// TODO: implement later
// ... rest of implementation

// ❌ NEVER: Root barrel import of @nxt1/ui in WEB app (breaks code splitting)
import { Component } from '@nxt1/ui';  // Use @nxt1/ui/components/...
import { Service } from '@nxt1/ui';     // Use @nxt1/ui/services/...
// NOTE: Root barrel IS correct for mobile app — only avoid in web

// ❌ NEVER: Module-scope addIcons() (creates side effects, breaks tree-shaking)
import { addIcons } from 'ionicons';
import { heartOutline } from 'ionicons/icons';
addIcons({ heartOutline });  // ← WRONG: must be inside constructor()

// ❌ NEVER: Exposing writeable signals
readonly data = signal<Item[]>([]);  // Should be private with computed

// ❌ NEVER: Old template syntax in new code
<div *ngIf="loading">...</div>  // Use @if (loading()) { ... }
<div *ngFor="let item of items">  // Use @for (item of items(); track item.id)

// ❌ NEVER: Angular RouterOutlet in mobile shell components
import { RouterOutlet } from '@angular/router';  // Use IonRouterOutlet
<router-outlet></router-outlet>  // Use <ion-router-outlet> in mobile

// ❌ NEVER: Angular Router for mobile navigation (use NavController)
this.router.navigate(['/home']);  // Use navController.navigateForward()

// ❌ NEVER: console.log / console.error in feature code
console.log('loading data');      // Use inject(NxtLoggingService).child('Service')
console.error('failed', err);     // Use this.logger.error('Failed to load', err, { id })

// ❌ NEVER: Hardcoded analytics event names
this.analytics?.trackEvent('profile_viewed', {});  // Use APP_EVENTS.PROFILE_VIEWED

// ❌ NEVER: Hardcoded performance trace names
this.performance.trace('load_feed', fn);  // Use TRACE_NAMES.FEED_LOAD

// ❌ NEVER: Hardcoded test IDs in templates
<button data-testid="submit-btn">  // Use [attr.data-testid]="testIds.SUBMIT"

// ❌ NEVER: Feature service without observability
@Injectable({ providedIn: 'root' })
export class BadService {
  // Missing: logger, analytics, breadcrumbs, performance
  // MUST have all four observability pillars
}

// ❌ NEVER: Catch block without structured logging
catch (err) {
  throw err;  // Must log: this.logger.error('Operation failed', err, { context })
}

// ❌ NEVER: Feature without E2E tests
// Every feature MUST have tests/ in apps/web/e2e/tests/[feature]/
// covering happy path, empty state, and error state

// ❌ NEVER: Interactive elements without data-testid
<button (click)="delete()">Delete</button>  // Must have [attr.data-testid]
```

---

## 17. AI Code Generation Requirements

When generating code for NXT1, **every feature** MUST include:

### Architecture & Patterns

1. **Use shared packages** — Import from `@nxt1/core` (root barrel) and
   `@nxt1/ui/*` (granular sub-paths), never duplicate
2. **Use constants** — Never hardcode roles, tiers, sports, cache keys, TTLs,
   event names, trace names, or test IDs
3. **Pure API layer** — API factories in `@nxt1/core` with `HttpAdapter` pattern
4. **Signal-based state** — Private writeable signals, public computed
5. **SSR-safe** — Platform checks on all browser APIs, `afterNextRender` for DOM
6. **Complete implementations** — No TODOs, no placeholders, full error handling
7. **Type-safe** — Explicit types, no `any` without documentation
8. **2026 Angular patterns** — `@if`/`@for`/`@defer`, standalone, `inject()`
9. **Native UX** — Haptics, skeletons, bottom sheets, celebrations

### Observability (Non-Negotiable)

10. **Analytics tracking** — `inject(ANALYTICS_ADAPTER, { optional: true })`
    with `APP_EVENTS.*` / `FIREBASE_EVENTS.*` for key user actions
11. **Structured logging** — `inject(NxtLoggingService).child('ServiceName')`
    with `info` for operations, `error` for failures (never `console.log`)
12. **Breadcrumb tracking** — `inject(NxtBreadcrumbService)` for state
    transitions; `nxtTrackClick` / `nxtTrackForm` directives in templates
13. **Performance tracing** — Critical API calls wrapped in
    `performance.trace(TRACE_NAMES.*, fn)` with attributes and metrics

### Testing (Non-Negotiable)

14. **Unit tests** — Pure functions: Vitest, no TestBed. Services: TestBed with
    mocked APIs.
15. **TEST_IDS** — All interactive/assertable elements have `data-testid` from
    `@nxt1/core/testing` constants
16. **E2E tests** — Playwright Page Object + spec covering happy path, empty
    state, and error state

---

## 18. Quick Reference: Creating a New Feature

### Step 1: Add Types/API to @nxt1/core (if shared)

```
packages/core/src/
├── models/[feature].model.ts    # Add interfaces
├── api/[feature].api.ts         # Add API factory
└── index.ts                     # Export new items
```

### Step 2: Add Constants to @nxt1/core

```
packages/core/src/
├── analytics/events.ts          # Add APP_EVENTS.[FEATURE]_* entries
├── performance/performance.types.ts  # Add TRACE_NAMES.[feature]_* entries
└── testing/index.ts             # Add [FEATURE]_TEST_IDS, register in TEST_IDS
```

### Step 3: Create Feature Module in apps/web

```
apps/web/src/app/features/[feature]/
├── index.ts                     # Barrel export
├── [feature].routes.ts          # Route config
├── services/
│   ├── [feature].service.ts     # State + logging + analytics + breadcrumbs
│   └── [feature]-api.service.ts # HTTP adapter + performance traces
├── pages/
│   ├── list/list.component.ts   # List page (with data-testid attributes)
│   ├── detail/detail.component.ts
│   └── create/create.component.ts
└── components/                  # Feature-specific UI (with nxtTrackClick)
```

**Service must include:**

```typescript
@Injectable({ providedIn: 'root' })
export class FeatureService {
  // ✅ All four observability pillars
  private readonly logger = inject(NxtLoggingService).child('FeatureService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PerformanceService);
  // ... signals, API, business methods with logging/tracking
}
```

### Step 4: Register Routes

```typescript
// apps/web/src/app/app.routes.ts
{
  path: 'feature',
  loadChildren: () => import('./features/feature/feature.routes'),
}

// apps/web/src/app/app.routes.server.ts
{ path: 'feature/:id', renderMode: RenderMode.Server },
```

### Step 5: Create E2E Tests

```
apps/web/e2e/
├── pages/[feature].page.ts      # Page Object (uses TEST_IDS)
└── tests/[feature]/
    └── [feature].spec.ts        # Happy path, empty state, error state
```

### Step 6: Create Unit Tests

```
packages/core/src/api/__tests__/[feature].api.spec.ts   # Pure API factory tests
apps/web/src/app/features/[feature]/services/__tests__/  # Service tests (TestBed)
```

### Step 7: Run Validation

```bash
# Build packages
cd nxt1-monorepo && npm run build:packages

# Unit tests
npm run test

# E2E tests
cd apps/web/e2e && npx playwright test tests/[feature]/

# Lint
npm run lint
```

### Step 8: Verify Checklist

Before merging, verify all items in **Section 15 — Production Readiness
Checklist** are complete.

---

## 19. Agent Routing & Multi-Agent Orchestration (MANDATORY)

> **CRITICAL**: This workspace has a fully configured **multi-agent system**
> defined in `.github/AGENTS.md` with individual agent specifications in
> `.github/agents/*.agent.md`. You MUST consult and follow these definitions
> when routing tasks.

### 19.1 Agent Directory (`.github/AGENTS.md`)

The **Agent Directory** at `.github/AGENTS.md` is the authoritative reference
for which specialized agent handles which type of work. Before starting any
multi-step task, read this file to determine the correct routing.

### 19.2 Available Agents — Technical Team

| Agent                         | File                                                 | Domain                                                               |
| ----------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- |
| `@master-cto`                 | `.github/agents/master-cto.agent.md`                 | Architecture, data modeling, system design, AI strategy              |
| `@full-stack-engineer`        | `.github/agents/full-stack-engineer.agent.md`        | Bug fixes, feature implementation, production code                   |
| `@quality-control-specialist` | `.github/agents/quality-control-specialist.agent.md` | 2026 rule enforcement, bug detection, architecture violations        |
| `@qa-automation-engineer`     | `.github/agents/qa-automation-engineer.agent.md`     | Playwright E2E, Vitest unit tests, Page Objects, TEST_IDS            |
| `@ai-integrator`              | `.github/agents/ai-integrator.agent.md`              | Agent X modules, OpenRouter, LLM workers, prompt engineering         |
| `@devops-engineer`            | `.github/agents/devops-engineer.agent.md`            | CI/CD, GitHub Actions, Turborepo, Firebase App Hosting, environments |

### 19.3 Available Agents — Marketing & Growth Team (GTM A-Team)

| Agent               | File                                       | Domain                                                          |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `@cmo`              | `.github/agents/cmo.agent.md`              | Brand voice, growth strategy, audience personas, campaigns      |
| `@product-marketer` | `.github/agents/product-marketer.agent.md` | Feature-to-benefit translation, launch specs, App Store copy    |
| `@content-creator`  | `.github/agents/content-creator.agent.md`  | Blog posts, email drips, social threads, UI micro-copy          |
| `@seo-strategist`   | `.github/agents/seo-strategist.agent.md`   | SSR optimization, meta tags, structured data, Schema.org        |
| `@growth-hacker`    | `.github/agents/growth-hacker.agent.md`    | APP_EVENTS analysis, A/B tests, conversion funnels, viral loops |

### 19.4 Standard Technical Pipeline (Follow This Order)

For **new features, major refactors, or complex bug fixes**, execute agents in
this strict sequence:

```
Step 1 → @master-cto          (Architectural planning & approval)
Step 2 → @full-stack-engineer  (Implementation)
Step 3 → @quality-control-specialist  (2026 rules enforcement)
Step 4 → @qa-automation-engineer      (E2E + unit tests)
```

**Domain specialists** bypass the pipeline when the task is entirely within
their domain:

- AI/Agent X work → `@ai-integrator`
- CI/CD / deployment → `@devops-engineer`
- SEO / SSR optimization → `@seo-strategist`

### 19.5 GTM Marketing Pipeline (Follow This Order)

For **campaigns, copy, launches, or growth analysis**, execute agents in this
strict sequence:

```
Step 1 → @cmo                 (Brand strategy & campaign vision)
Step 2 → @product-marketer    (Translate to product specs & launch copy)
Step 3 → @content-creator     (Execute final copy: blogs, emails, UI text)
Step 4 → @seo-strategist      (Optimize meta/OG tags, hand tech specs to engineer)
Step 5 → @growth-hacker       (Analyze events, design A/B tests, viral loops)
```

### 19.6 Agent Handoffs

Every agent has defined **handoff targets** in its `.agent.md` frontmatter. When
an agent completes its phase, it should hand off to the next agent in the
pipeline with context about what was done. Respect these handoff chains — they
are the backbone of quality control.

### 19.7 MCP Tools & External Integrations (USE THEM)

> **All agents have access to every MCP (Model Context Protocol) tool configured
> in the workspace.** Agents MUST proactively use these tools rather than making
> assumptions or asking the user to look things up manually.

Available MCP integrations that agents should actively leverage:

| MCP Server         | Capability                                                        | When to Use                                                     |
| ------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| **GitHub**         | PRs, issues, repo data, code search                               | Code reviews, PR creation, issue tracking                       |
| **GitKraken**      | Git operations, branch management, PR workflows                   | Commits, diffs, blame, stash, worktrees                         |
| **Notion**         | Query databases, create/update pages, search                      | Campaign planning, content calendars, meeting notes             |
| **MongoDB**        | Query collections, aggregations, indexes, schema inspection       | Data analysis, debugging, analytics queries                     |
| **Stripe**         | Customers, subscriptions, invoices, products, prices              | Payment debugging, subscription management, billing features    |
| **Sentry**         | Error tracking, issue search, event analysis                      | Bug investigation, error pattern analysis, crash debugging      |
| **Browser/Chrome** | Page navigation, screenshots, DOM interaction, network inspection | E2E debugging, visual verification, scraping, Lighthouse audits |
| **Puppeteer**      | Headless browser automation, PDF generation                       | Automated testing, screenshot comparison, web scraping          |
| **Web Fetch**      | Fetch and analyze web page content                                | Research, documentation lookup, competitive analysis            |
| **Upstash**        | Library documentation lookup                                      | API reference, framework docs, package usage                    |

**Rules for MCP usage:**

```
✅ CORRECT: Proactively query MongoDB to understand data shape before writing queries
✅ CORRECT: Use GitHub MCP to check existing PRs and issues for context
✅ CORRECT: Use Notion MCP to pull campaign briefs before writing copy
✅ CORRECT: Use Stripe MCP to verify subscription structure before billing code
✅ CORRECT: Use Sentry MCP to find related errors when debugging
✅ CORRECT: Use Browser MCP for visual verification of UI changes

❌ WRONG: Assume data structure without checking MongoDB
❌ WRONG: Ask user to "check Notion for the brief" — query it yourself
❌ WRONG: Guess at Stripe product IDs — look them up via MCP
❌ WRONG: Skip error context when Sentry is available
```

### 19.8 Agent Invocation Rules

```typescript
// ✅ CORRECT: Route to the right agent based on task type
// Architecture question → @master-cto
// "Build the feature" → @full-stack-engineer
// "Review this code" → @quality-control-specialist
// "Write tests" → @qa-automation-engineer
// "Fix the AI prompt" → @ai-integrator
// "Update the pipeline" → @devops-engineer
// "Plan the launch campaign" → @cmo
// "Write the blog post" → @content-creator
// "Optimize for Google" → @seo-strategist
// "Analyze conversion" → @growth-hacker

// ❌ WRONG: Handle everything in one agent
// ❌ WRONG: Skip the CTO for architectural decisions
// ❌ WRONG: Skip QC after implementation
// ❌ WRONG: Write tests before code is finalized
// ❌ WRONG: Ignore available MCP tools when data is needed
```

### 19.9 When to Use the Pipeline vs. Single Agent

| Scenario                              | Routing                                |
| ------------------------------------- | -------------------------------------- |
| New feature (full-stack)              | Full technical pipeline (Steps 1–4)    |
| Quick bug fix (single file)           | `@full-stack-engineer` directly        |
| Architecture question / data modeling | `@master-cto` directly                 |
| AI/Agent X module work                | `@ai-integrator` directly              |
| CI/CD or deployment issue             | `@devops-engineer` directly            |
| "Write tests for X"                   | `@qa-automation-engineer` directly     |
| "Review code quality"                 | `@quality-control-specialist` directly |
| Marketing campaign (end-to-end)       | Full GTM pipeline (Steps 1–5)          |
| "Write a blog post about X"           | `@content-creator` (or GTM pipeline)   |
| "Optimize SEO for this page"          | `@seo-strategist` directly             |
| "Analyze our conversion funnel"       | `@growth-hacker` directly              |
