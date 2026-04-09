# NXT1 Web Application

Angular 21 SSR web application for the NXT1 AI agent sports platform. Built with
Vite, Tailwind CSS, and Ionic components. Deployed via Firebase App Hosting.

## Quick Start

```bash
# Development server (http://localhost:4200)
npm run dev

# Build for production
npm run build

# Preview production SSR build locally
npm run serve:ssr

# Run unit tests (Vitest)
npm test

# Run E2E tests (Playwright)
npm run e2e

# Type checking
npm run typecheck
```

---

## Project Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── app.config.ts            # Browser providers
│   │   ├── app.config.server.ts     # Server providers (SSR)
│   │   ├── app.routes.ts            # Route definitions
│   │   ├── app.routes.server.ts     # SSR render modes (100% Server)
│   │   │
│   │   ├── core/                    # App-level infrastructure
│   │   │   ├── infrastructure/      # Error handling, HTTP, interceptors
│   │   │   ├── layout/              # WebShellComponent (app shell)
│   │   │   └── services/            # All app services (centralized)
│   │   │       ├── api/             # API adapter services
│   │   │       ├── auth/            # Auth, onboarding, SSR tokens
│   │   │       ├── infrastructure/  # Analytics, crashlytics, logging, network, perf
│   │   │       ├── state/           # Badge count, profile actions
│   │   │       └── web/             # SEO, file upload, web push, email, share
│   │   │
│   │   ├── features/               # Feature modules (lazy-loaded)
│   │   │   ├── activity/           # Notifications & activity feed
│   │   │   ├── add-sport/          # Add sport/team wizard
│   │   │   ├── agent-x/            # Agent X AI assistant
│   │   │   ├── auth/               # Login, signup, forgot-password
│   │   │   ├── explore/            # Discovery & feed hub
│   │   │   ├── help-center/        # Help articles, AI chat, tickets
│   │   │   ├── invite/             # Referral & sharing
│   │   │   ├── join/               # Invite link landing
│   │   │   ├── messages/           # Conversations
│   │   │   ├── profile/            # User profile
│   │   │   ├── pulse/              # Sports recruiting news
│   │   │   ├── settings/           # User settings
│   │   │   ├── team/               # Team pages
│   │   │   └── usage/              # Payment usage dashboard
│   │   │
│   │   ├── marketing/              # Marketing & landing pages
│   │   │   ├── athletes/           # Student-athlete landing
│   │   │   ├── coaches/            # College coaches landing
│   │   │   ├── parents/            # Parents landing
│   │   │   ├── scouts/             # Scouts landing
│   │   │   ├── sport-landing/      # Sport-vertical pages (/football, /basketball)
│   │   │   └── ...                 # NIL, super-profiles, media-coverage, etc.
│   │   │
│   │   └── legal/                  # Terms, privacy
│   │
│   ├── environments/               # Environment configs (dev, staging, prod)
│   ├── index.html
│   ├── main.ts                     # Browser entry point
│   ├── main.server.ts              # Server entry point
│   └── styles-critical.css         # Critical-path styles
│
├── e2e/                            # Playwright E2E tests
├── server.ts                       # Express SSR server
├── angular.json                    # Angular CLI config
├── vitest.config.ts                # Unit test config
├── tailwind.config.js              # Tailwind CSS config
└── tsconfig.app.json               # TypeScript config
```

> **Key pattern**: All services live in `core/services/` (centralized). Feature
> directories contain only routes, page components, and feature-specific UI. No
> nested `services/` folders inside features.

---

## Architecture

### 100% Server-Side Rendering

Every route uses `RenderMode.Server`. No client-side rendering modes.

```typescript
// app.routes.server.ts
export const serverRoutes: ServerRoute[] = [
  { path: 'profile/:param', renderMode: RenderMode.Server },
  { path: 'explore', renderMode: RenderMode.Server },
  { path: 'auth/**', renderMode: RenderMode.Server },
  { path: '**', renderMode: RenderMode.Server }, // catch-all
];
```

This follows the Twitter/Instagram pattern — all routes open, no client-side
auth guards, UI adapts to auth state, backend enforces authorization at the API
level.

### Routing

All main app routes are wrapped in `WebShellComponent` (provides top nav,
sidenav, footer). Auth routes and special pages (add-sport, join, OAuth
callbacks) render outside the shell.

```
/                   → redirects to /agent (Agent X)
/home               → redirects to /explore
/explore            → Discovery & feed hub
/agent-x, /agent    → Agent X AI assistant
/activity           → Notifications
/messages           → Conversations
/profile/:param     → Public profile (outside shell, SEO-critical)
/profile            → Own profile (inside shell)
/pulse              → Sports news (/news redirects here)
/settings           → User settings
/help-center        → Help & support
/team/:slug         → Team pages
/auth               → Login, signup, forgot-password (outside shell)
/add-sport          → Sport/team wizard (outside shell)
/join/:code         → Invite link landing (outside shell)
/welcome            → redirects to /
```

### Lazy Loading

Every route uses `loadComponent` or `loadChildren`:

```typescript
{
  path: 'explore',
  loadChildren: () => import('./features/explore/explore.routes'),
},
```

### Signal-Based State

Services use private writeable signals with public computed accessors:

```typescript
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly _data = signal<Item[]>([]);
  readonly data = computed(() => this._data());
  readonly isEmpty = computed(() => this._data().length === 0);
}
```

---

## Core Services

All services are centralized in `core/services/` with the following structure:

| Directory         | Purpose                     | Key Files                                                                                                              |
| ----------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `auth/`           | Authentication & onboarding | `auth-flow.service.ts`, `browser-auth.service.ts`, `server-auth.service.ts`, `auth-cookie.service.ts`                  |
| `api/`            | Backend API adapters        | `profile-api.service.ts`, `feed-api.service.ts`, `explore-api.service.ts`, `settings-api.service.ts`                   |
| `infrastructure/` | Observability               | `analytics.service.ts`, `crashlytics.service.ts`, `logging.service.ts`, `performance.service.ts`, `network.service.ts` |
| `web/`            | Web-specific services       | `seo.service.ts`, `file-upload.service.ts`, `web-push.service.ts`, `share.service.ts`, `email-connection.service.ts`   |
| `state/`          | Cross-feature state         | `badge-count.service.ts`, `profile-page-actions.service.ts`                                                            |

---

## Styling

### Tailwind CSS + Design Tokens

```html
<div class="flex items-center gap-4 rounded-lg bg-white p-4 shadow">
  <h2 class="text-xl font-semibold text-gray-900">Profile</h2>
</div>
```

Shared design tokens from `@nxt1/design-tokens`:

```scss
.custom-component {
  color: var(--nxt1-color-primary);
  padding: var(--nxt1-spacing-md);
  border-radius: var(--nxt1-radius-md);
}
```

---

## Testing

### Unit Tests (Vitest)

```bash
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # With coverage
```

### E2E Tests (Playwright)

```bash
npm run e2e                 # All browsers
npm run e2e:ui              # Interactive UI mode
npm run e2e:chromium        # Chromium only
npm run e2e:mobile          # Mobile viewports
npm run e2e:debug           # Debug mode
npm run e2e -- auth.spec.ts # Specific test file
```

---

## Deployment

Deployed via **Firebase App Hosting** (SSR). Configuration in `apphosting.yaml`.

```bash
npm run build               # Production build
npm run build:staging       # Staging build
```

### Environments

- `src/environments/environment.ts` — Development
- `src/environments/environment.staging.ts` — Staging
- `src/environments/environment.prod.ts` — Production

---

## Observability

### Error Handling

`GlobalErrorHandler` catches all unhandled errors. Automatically classifies
severity, scrubs PII, and shows rate-limited toasts. Wired in `app.config.ts`.

### Analytics

```typescript
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { APP_EVENTS } from '@nxt1/core/analytics';

this.analytics?.trackEvent(APP_EVENTS.PROFILE_VIEWED, { profileId: id });
```

### Logging

```typescript
import { NxtLoggingService } from '@nxt1/ui/services/logging';

private readonly logger = inject(NxtLoggingService).child('FeatureService');
this.logger.info('Data loaded', { count: result.length });
```

---

## Common SSR Pitfalls

### Hydration Mismatches

```typescript
// ❌ Different value on server vs client
currentTime = new Date();

// ✅ Use afterNextRender for browser-only values
constructor() {
  afterNextRender(() => {
    this.currentTime = new Date();
  });
}
```

### Browser API Access

```typescript
// ❌ Crashes on server
localStorage.setItem('key', 'value');

// ✅ Guard with platform check
if (isPlatformBrowser(this.platformId)) {
  localStorage.setItem('key', 'value');
}
```

---

## 📝 Code Style

### Component Structure

```typescript
@Component({
  selector: 'app-feature',
  standalone: true,
  imports: [RouterModule], // No NgModules like CommonModule or SharedModule
  templateUrl: './feature.component.html',
  styleUrl: './feature.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeatureComponent {
  // 1. Injected dependencies
  private readonly service = inject(FeatureService);
  private readonly router = inject(Router);

  // 2. Signals
  readonly data = this.service.data;
  readonly loading = this.service.loading;

  // 3. Methods
  async onSubmit(form: FormData) {
    await this.service.submit(form);
  }
}
```

### Service Structure

```typescript
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics';
import { NxtBreadcrumbService } from '@nxt1/ui/services/breadcrumb';
import { PerformanceService } from './core/services';

@Injectable({ providedIn: 'root' })
export class FeatureService {
  // 1. Dependencies & Four Observability Pillars (Required)
  private readonly api = inject(FeatureApiService);
  private readonly logger = inject(NxtLoggingService).child('FeatureService');
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly performance = inject(PerformanceService);

  // 2. Private state
  private readonly _data = signal<Item[]>([]);
  private readonly _loading = signal(false);

  // 3. Public API
  readonly data = computed(() => this._data());
  readonly loading = computed(() => this._loading());

  // 4. Methods
  async loadData(): Promise<void> {
    this._loading.set(true);
    this.logger.info('Loading data');
    this.breadcrumb.trackStateChange('feature', 'loading');

    try {
      const result = await this.performance.trace('feature_load_data', () =>
        this.api.getItems()
      );
      this._data.set(result);
    } catch (err) {
      this.logger.error('Failed to load feature data', err);
    } finally {
      this._loading.set(false);
    }
  }
}
```

---

## 📜 License

Proprietary - NXT1 Platform  
© 2026 NXT1. All rights reserved.

---

## 🔗 Related

- **[@nxt1/core](../../packages/core/README.md)** - Shared TypeScript library
- **[@nxt1/ui](../../packages/ui/README.md)** - Shared UI components
- **[Mobile App](../mobile/README.md)** - Native mobile application
- **[Backend API](../../../nxt1-backend/README.md)** - REST API server

---

## 🆘 Support

For questions or issues:

- **Internal:** #engineering on Slack
- **Documentation:** [/docs/](../../docs/)
- **Architecture:** [ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
