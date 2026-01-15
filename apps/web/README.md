# NXT1 Web Application

Angular 21 SSR (Server-Side Rendering) web application for NXT1 sports
recruiting platform.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Development server (http://localhost:4200)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run serve:ssr:nxt1-web

# Run tests
npm test

# Type checking
npm run typecheck
```

---

## 📁 Project Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── app.config.ts           # Browser providers
│   │   ├── app.config.server.ts    # Server providers (SSR)
│   │   ├── app.routes.ts           # Route definitions
│   │   ├── app.routes.server.ts    # SSR render modes
│   │   │
│   │   ├── core/                   # Core infrastructure
│   │   │   ├── auth/               # Auth services & guards
│   │   │   ├── infrastructure/     # HTTP, interceptors
│   │   │   └── services/           # Network, SEO services
│   │   │
│   │   └── [feature]/              # Feature modules
│   │       ├── [feature].routes.ts # Feature routes
│   │       ├── services/           # Feature services
│   │       ├── features/           # Page components
│   │       └── components/         # UI components
│   │
│   ├── environments/               # Environment configs
│   ├── index.html                  # HTML template
│   ├── main.ts                     # Browser entry point
│   ├── main.server.ts              # Server entry point
│   └── styles.scss                 # Global styles
│
├── server.ts                       # Express SSR server
├── angular.json                    # Angular configuration
├── tsconfig.app.json              # TypeScript config
└── vite.config.ts                 # Vite bundler config
```

---

## 🏗️ Architecture

### SSR (Server-Side Rendering)

The application uses Angular Universal for SSR:

**Benefits:**

- ✅ SEO optimization (crawlable by search engines)
- ✅ Faster initial page load
- ✅ Better social media previews (Open Graph)
- ✅ Improved Core Web Vitals

**Render Modes:**

```typescript
// apps/web/src/app/app.routes.server.ts
export const serverRoutes: ServerRoute[] = [
  // Public pages - Server render for SEO
  { path: 'profile/:id', renderMode: RenderMode.Server },
  { path: 'team/:name', renderMode: RenderMode.Server },

  // Auth-protected pages - Client render
  { path: 'home', renderMode: RenderMode.Client },
  { path: 'settings/**', renderMode: RenderMode.Client },
];
```

### Lazy Loading

All routes are lazy-loaded for optimal performance:

```typescript
// Example: Auth routes
export const AUTH_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
];
```

### Signal-Based State

Using Angular signals for reactive state management:

```typescript
@Injectable({ providedIn: 'root' })
export class FeatureService {
  private readonly _data = signal<Item[]>([]);
  readonly data = computed(() => this._data());
  readonly isEmpty = computed(() => this._data().length === 0);
}
```

---

## 🔌 Key Services

### NetworkService (Web Browser Implementation)

```typescript
import { NetworkService } from './core/services';

@Component({...})
export class AppComponent {
  private readonly network = inject(NetworkService);

  constructor() {
    // Show offline banner when disconnected
    effect(() => {
      if (this.network.isOffline()) {
        this.showOfflineBanner();
      }
    });
  }
}
```

### SeoService (Dynamic Meta Tags)

```typescript
import { SeoService } from './core/services';

@Component({...})
export class ProfileComponent {
  private readonly seo = inject(SeoService);

  ngOnInit() {
    // Set dynamic meta tags for SEO
    this.seo.updateTags({
      title: `${this.profile.name} - NXT1`,
      description: this.profile.bio,
      image: this.profile.photoURL,
      type: 'profile'
    });
  }
}
```

### Auth Services

```typescript
import { FirebaseAuthService } from './core/auth';

@Component({...})
export class LoginComponent {
  private readonly auth = inject(FirebaseAuthService);

  async signIn(email: string, password: string) {
    const result = await this.auth.signInWithEmailAndPassword(email, password);
    if (result.user) {
      this.router.navigate(['/home']);
    }
  }
}
```

---

## 🎨 Styling

### Tailwind CSS

The application uses Tailwind CSS for utility-first styling:

```html
<div class="flex items-center justify-between p-4 bg-white rounded-lg shadow">
  <h2 class="text-xl font-semibold text-gray-900">Profile</h2>
  <button class="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">
    Edit
  </button>
</div>
```

### Design Tokens

Shared design tokens from `@nxt1/design-tokens`:

```scss
@import '@nxt1/design-tokens';

.custom-component {
  color: var(--nxt1-color-primary);
  padding: var(--nxt1-spacing-md);
  border-radius: var(--nxt1-radius-md);
}
```

---

## 🧪 Testing

### Unit Tests

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage
```

### E2E Tests (Playwright)

```bash
# Run E2E tests
npm run e2e

# Run E2E in UI mode
npm run e2e:ui

# Run specific test file
npm run e2e -- forgot-password.spec.ts
```

---

## 🚢 Deployment

### Firebase Hosting (Production)

```bash
# Build for production
npm run build

# Deploy to Firebase
firebase deploy --only hosting:production

# Deploy with preview channel
firebase hosting:channel:deploy preview-branch
```

### Environment Variables

```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  firebase: {
    apiKey: 'your-api-key',
    authDomain: 'nxt1-dev.firebaseapp.com',
    projectId: 'nxt1-dev',
  },
  apiUrl: 'http://localhost:3000/api/v1',
};
```

**Environment files:**

- `environment.ts` - Development
- `environment.staging.ts` - Staging
- `environment.prod.ts` - Production

---

## ⚡ Performance Optimization

### Bundle Analysis

```bash
# Analyze bundle size
npm run build -- --stats-json
npx webpack-bundle-analyzer dist/nxt1-web/browser/stats.json
```

### Optimization Checklist

- ✅ Lazy loading all routes
- ✅ OnPush change detection strategy
- ✅ trackBy functions on all @for loops
- ✅ Virtual scrolling for long lists
- ✅ NgOptimizedImage for images
- ✅ Preload critical routes
- ✅ HTTP caching via interceptor
- ✅ Service worker (PWA)

---

## 🔒 Security

### Content Security Policy

```html
<!-- src/index.html -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self' 'unsafe-inline';
               style-src 'self' 'unsafe-inline';">
```

### Environment Security

```typescript
// Never commit sensitive data
// Use environment variables
firebase: {
  apiKey: process.env['FIREBASE_API_KEY'], // From CI/CD
}
```

---

## 📊 Monitoring

### Analytics

```typescript
import { APP_EVENTS } from '@nxt1/core/analytics';

// Track page views
this.analytics.trackPageView('/profile');

// Track events
this.analytics.trackEvent(APP_EVENTS.AUTH_SIGNED_IN, {
  method: 'email',
});
```

### Error Tracking (Future)

```typescript
import * as Sentry from '@sentry/angular';

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: environment.production ? 'production' : 'development',
});
```

---

## 🐛 Common Issues

### SSR Hydration Errors

```typescript
// ❌ Wrong - causes hydration mismatch
export class MyComponent {
  currentTime = new Date(); // Different on server vs client
}

// ✅ Correct - use afterNextRender
export class MyComponent {
  currentTime?: Date;

  constructor() {
    afterNextRender(() => {
      this.currentTime = new Date();
    });
  }
}
```

### Browser API Access

```typescript
// ❌ Wrong - crashes on server
ngOnInit() {
  localStorage.setItem('key', 'value');
}

// ✅ Correct - check platform
constructor() {
  if (isPlatformBrowser(this.platformId)) {
    localStorage.setItem('key', 'value');
  }
}
```

---

## 📝 Code Style

### Component Structure

```typescript
@Component({
  selector: 'app-feature',
  standalone: true,
  imports: [CommonModule, FormsModule, SharedModule],
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
@Injectable({ providedIn: 'root' })
export class FeatureService {
  // 1. Dependencies
  private readonly http = inject(HttpClient);

  // 2. Private state
  private readonly _data = signal<Item[]>([]);
  private readonly _loading = signal(false);

  // 3. Public API
  readonly data = computed(() => this._data());
  readonly loading = computed(() => this._loading());

  // 4. Methods
  async loadData(): Promise<void> {
    this._loading.set(true);
    try {
      const result = await firstValueFrom(this.http.get<Item[]>('/api/items'));
      this._data.set(result);
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
