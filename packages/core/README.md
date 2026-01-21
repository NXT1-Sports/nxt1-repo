# @nxt1/core

Pure TypeScript shared library for NXT1 platform.  
**100% portable** - works on web, mobile, backend, and any JavaScript
environment.

## 📦 What's Inside

### Models & Types

```typescript
import {
  User,
  UserRole,
  UserProfile,
  Team,
  TeamMember,
  TeamCode,
  NetworkStatus,
  ConnectionType,
  Post,
  Comment,
  Notification,
} from '@nxt1/core';
```

Complete TypeScript interfaces for all platform entities with zero framework
dependencies.

### API Factories

```typescript
import { createAuthApi, createPostApi, type HttpAdapter } from '@nxt1/core';
```

Platform-agnostic API functions using the adapter pattern. Write once, use
everywhere.

### Validation & Helpers

```typescript
import {
  validateEmail,
  validatePhone,
  formatRelativeTime,
  slugify,
  isValidTeamCode,
} from '@nxt1/core';
```

Pure utility functions for common operations.

### Constants

```typescript
import {
  USER_ROLES,
  SPORT_TYPES,
  POSITIONS,
  NOTIFICATION_TYPES,
  PLAN_TIERS,
} from '@nxt1/core';
```

Centralized constants used across all platforms.

### Caching System

```typescript
import { createMemoryCache, CACHE_CONFIG, CACHE_KEYS } from '@nxt1/core/cache';
```

Portable caching utilities with LRU eviction and TTL support.

---

## 🚀 Installation

```bash
# In workspace (already installed)
npm install @nxt1/core

# In external projects
npm install @nxt1/core@latest
```

---

## 💡 Usage Examples

### 1. Using Models

```typescript
import { User, UserRole } from '@nxt1/core';

const user: User = {
  uid: '123',
  email: 'athlete@example.com',
  displayName: 'John Smith',
  role: 'athlete',
  isPremium: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Type-safe role checking
const isAthlete = user.role === 'athlete'; // ✅ Type checked
```

### 2. Creating Platform-Agnostic APIs

#### Web (Angular with HttpClient)

```typescript
import { createAuthApi, type HttpAdapter } from '@nxt1/core';
import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
    'https://api.nxt1.app'
  );

  signIn = this.api.signIn;
  signUp = this.api.signUp;
}
```

#### Mobile (Capacitor HTTP)

```typescript
import { createAuthApi } from '@nxt1/core';
import { CapacitorHttp } from '@capacitor/core';

const httpAdapter = {
  get: async (url) => (await CapacitorHttp.get({ url })).data,
  post: async (url, data) => (await CapacitorHttp.post({ url, data })).data,
  put: async (url, data) => (await CapacitorHttp.put({ url, data })).data,
  delete: async (url) => (await CapacitorHttp.delete({ url })).data,
};

const authApi = createAuthApi(httpAdapter, 'https://api.nxt1.app');

// Same API, different HTTP client
await authApi.signIn({ email: 'user@example.com', password: 'pass' });
```

#### Backend (Node.js fetch)

```typescript
import { createAuthApi } from '@nxt1/core';

const authApi = createAuthApi(
  {
    get: (url) => fetch(url).then((r) => r.json()),
    post: (url, data) =>
      fetch(url, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      }).then((r) => r.json()),
    // ...
  },
  'https://api.nxt1.app'
);
```

### 3. Using Validation

```typescript
import { validateEmail, validatePhone } from '@nxt1/core';

// Email validation
if (!validateEmail(email)) {
  throw new Error('Invalid email format');
}

// Phone validation
if (!validatePhone(phone)) {
  throw new Error('Invalid phone number');
}
```

### 4. Using Helper Functions

```typescript
import { formatRelativeTime, slugify, truncate } from '@nxt1/core';

// Relative time formatting
const posted = formatRelativeTime('2026-01-14T10:00:00Z');
// → "3h ago" or "2d ago"

// URL-friendly slugs
const slug = slugify('My Awesome Post Title!');
// → "my-awesome-post-title"

// Text truncation
const preview = truncate(longText, 100);
// → "First 100 characters..."
```

### 5. Using Constants

```typescript
import { USER_ROLES, SPORT_TYPES, POSITIONS } from '@nxt1/core';

// Type-safe role checks
const availableRoles: UserRole[] = [
  USER_ROLES.ATHLETE,
  USER_ROLES.COACH,
  USER_ROLES.PARENT,
];

// Sport configuration
const footballPositions = POSITIONS.football;
// → ['QB', 'RB', 'WR', 'TE', ...]

// All supported sports
const allSports = Object.keys(SPORT_TYPES);
// → ['football', 'basketball', 'baseball', ...]
```

### 6. Using Caching

```typescript
import { createMemoryCache, CACHE_CONFIG, CACHE_KEYS } from '@nxt1/core/cache';

// Create cache instance
const userCache = createMemoryCache<User>({
  ttl: CACHE_CONFIG.MEDIUM_TTL, // 15 minutes
  maxSize: 100,
});

// Set values
await userCache.set(`${CACHE_KEYS.USER_PROFILE}123`, userData);

// Get values
const user = await userCache.get(`${CACHE_KEYS.USER_PROFILE}123`);

// Get-or-fetch pattern
const profile = await userCache.getOrSet(
  `${CACHE_KEYS.USER_PROFILE}456`,
  () => fetchUserFromAPI('456'),
  CACHE_CONFIG.LONG_TTL
);

// Clear specific keys
await userCache.invalidate(`${CACHE_KEYS.USER_PROFILE}*`);
```

---

## 🏗️ Architecture Principles

### Zero Dependencies

```json
{
  "dependencies": {},
  "peerDependencies": {},
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

No Angular, React, Vue, or any framework code. Just pure TypeScript.

### Pure Functions

```typescript
// ✅ Pure - same input always produces same output
export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === 'string' ? new Date(date) : date;
  // ... pure logic
}

// ❌ Not in @nxt1/core - impure (depends on Angular)
@Injectable()
export class DateService {}
```

### Adapter Pattern

```typescript
// Define the contract
export interface HttpAdapter {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data: unknown): Promise<T>;
  // ...
}

// Create factory that accepts any HTTP implementation
export function createAuthApi(http: HttpAdapter, baseUrl: string) {
  return {
    async signIn(credentials: SignInRequest) {
      return http.post(`${baseUrl}/auth/signin`, credentials);
    },
  };
}
```

This allows the same API logic to work with:

- Angular HttpClient
- Capacitor HTTP
- Node.js fetch
- Axios
- Any HTTP library

---

## 📁 Package Structure

```
packages/core/
├── src/
│   ├── index.ts                    # Main export
│   ├── api/                        # API factory functions
│   │   ├── auth.api.ts
│   │   ├── post.api.ts
│   │   ├── profile.api.ts
│   │   └── http.types.ts          # HttpAdapter interface
│   ├── auth/                       # Auth state & guards
│   │   ├── auth-state-manager.ts
│   │   └── guards.ts
│   ├── models/                     # TypeScript interfaces
│   │   ├── user.model.ts
│   │   ├── team.model.ts
│   │   ├── network.model.ts
│   │   └── index.ts
│   ├── validation/                 # Schema validation
│   │   ├── user.validation.ts
│   │   └── team.validation.ts
│   ├── helpers/                    # Pure utility functions
│   │   ├── date.helpers.ts
│   │   ├── string.helpers.ts
│   │   └── validation.helpers.ts
│   ├── constants/                  # Platform constants
│   │   ├── user.constants.ts
│   │   ├── sport.constants.ts
│   │   └── notification.constants.ts
│   ├── cache/                      # Caching utilities
│   │   ├── memory-cache.ts
│   │   ├── lru-cache.ts
│   │   └── config.ts
│   └── storage/                    # Storage adapters
│       ├── browser-storage.ts
│       └── memory-storage.ts
└── dist/                           # Compiled output
```

---

## 🧪 Testing

```typescript
import { validateEmail, formatRelativeTime } from '@nxt1/core';

describe('validateEmail', () => {
  it('should validate correct emails', () => {
    expect(validateEmail('user@example.com')).toBe(true);
    expect(validateEmail('test.user+tag@domain.co.uk')).toBe(true);
  });

  it('should reject invalid emails', () => {
    expect(validateEmail('notanemail')).toBe(false);
    expect(validateEmail('@example.com')).toBe(false);
  });
});
```

Pure functions are trivial to test - no mocking needed!

---

## 🔄 Version Compatibility

| @nxt1/core | TypeScript | Node.js |
| ---------- | ---------- | ------- |
| 2.x        | ^5.7.0     | ^22.0   |
| 1.x        | ^5.3.0     | ^20.0   |

---

## 📝 Contributing

### Adding New Models

```typescript
// 1. Create interface in src/models/
export interface NewFeature {
  id: string;
  name: string;
  createdAt: string;
}

// 2. Export from src/models/index.ts
export { type NewFeature } from './new-feature.model';

// 3. Re-export from src/index.ts (if commonly used)
export { type NewFeature } from './models';
```

### Adding New API Functions

```typescript
// 1. Create in src/api/
export function createFeatureApi(http: HttpAdapter, baseUrl: string) {
  return {
    async getFeatures(): Promise<Feature[]> {
      return http.get(`${baseUrl}/features`);
    },
  };
}

// 2. Export from src/api/index.ts
export { createFeatureApi } from './feature.api';
```

---

## 📜 License

Proprietary - NXT1 Platform  
© 2026 NXT1. All rights reserved.

---

## 🔗 Related Packages

- **[@nxt1/ui](../ui/README.md)** - Shared Angular/Ionic components
- **[@nxt1/config](../config/README.md)** - Shared configuration
- **[@nxt1/design-tokens](../design-tokens/README.md)** - Design system tokens

---

## 🆘 Support

For questions or issues:

- **Internal:** #engineering on Slack
- **Documentation:** [/docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)
