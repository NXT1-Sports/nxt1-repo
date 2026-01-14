# NXT1 Caching Strategy

> Production-grade, multi-tier caching system for optimal performance across web
> and mobile platforms.

## Overview

The NXT1 caching architecture implements a comprehensive caching strategy across
all layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CDN / Edge Cache                             │
│   Firebase App Hosting - Static assets, immutable hashes        │
├─────────────────────────────────────────────────────────────────┤
│                   Service Worker (PWA)                           │
│   ngsw-config.json - Asset precaching, API data groups          │
├─────────────────────────────────────────────────────────────────┤
│                  HTTP Interceptor Cache                          │
│   LRU in-memory - API response caching with stale-while-revalidate │
├─────────────────────────────────────────────────────────────────┤
│                    Application Cache                             │
│   @nxt1/core/cache - Memory + Persistent storage                │
├─────────────────────────────────────────────────────────────────┤
│                   SSR Transfer Cache                             │
│   Angular HttpTransferCache - Server→Client hydration           │
└─────────────────────────────────────────────────────────────────┘
```

## Cache Layers

### 1. CDN / Static Assets (Firebase App Hosting)

**Location:** `apps/web/apphosting.yaml`

```yaml
# Immutable assets (hashed filenames)
- source: '**/*.{js,css,woff2,png,jpg,webp}'
  headers:
    - header: Cache-Control
      value: 'public, max-age=31536000, immutable'

# HTML (dynamic, SSR)
- source: '**/*.html'
  headers:
    - header: Cache-Control
      value: 'no-cache, no-store, must-revalidate'
```

### 2. Service Worker (PWA)

**Location:** `apps/web/ngsw-config.json`

#### Asset Groups

| Group           | Strategy | Purpose                              |
| --------------- | -------- | ------------------------------------ |
| `app-shell`     | prefetch | Core app files (index.html, main.js) |
| `common-chunks` | lazy     | Shared code chunks                   |
| `fonts`         | lazy     | Web fonts                            |
| `images`        | lazy     | Asset images                         |
| `logo-assets`   | prefetch | Brand logos (always available)       |

#### Data Groups (API Caching)

| Group          | Strategy    | TTL | Use Case      |
| -------------- | ----------- | --- | ------------- |
| `api-profile`  | freshness   | 1h  | User profiles |
| `api-colleges` | freshness   | 1d  | College data  |
| `api-teams`    | freshness   | 30m | Team data     |
| `api-posts`    | freshness   | 5m  | Feed/posts    |
| `api-ssr-meta` | performance | 1h  | SEO metadata  |

### 3. HTTP Interceptor Cache

**Location:** `apps/web/src/app/core/infrastructure/http/cache.interceptor.ts`

Features:

- LRU eviction (100 entries default)
- TTL per URL pattern
- Stale-while-revalidate
- Request deduplication
- SSR-safe (no-op on server)

```typescript
// Configure in app.config.ts
provideHttpClient(
  withInterceptors([
    httpCacheInterceptor({
      maxSize: 100,
      staleWhileRevalidate: true,
    }),
  ])
);
```

#### TTL Configuration Example

Configure patterns based on your backend API structure:

```typescript
httpCacheInterceptor({
  ttlConfig: [
    { pattern: /\/api\/college/, ttl: CACHE_CONFIG.LONG_TTL }, // 1 hour
    { pattern: /\/api\/profile/, ttl: CACHE_CONFIG.MEDIUM_TTL }, // 15 min
    { pattern: /\/api\/team/, ttl: CACHE_CONFIG.MEDIUM_TTL }, // 15 min
    { pattern: /\/api\/post\/feed/, ttl: CACHE_CONFIG.SHORT_TTL }, // 1 min
  ],
  excludeUrls: [
    /\/auth\//, // Security sensitive
    /\/stripe\//, // Payment operations
    /\/paypal\//, // Payment operations
    /\/admin\//, // Admin operations
  ],
});
```

### 4. Application Cache (@nxt1/core)

**Location:** `packages/core/src/cache/`

Three cache implementations for different use cases:

#### Memory Cache (Fastest)

```typescript
import { createMemoryCache } from '@nxt1/core/cache';

const cache = createMemoryCache<User>({
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,
  slidingExpiration: true,
});

await cache.set('user:123', userData);
const user = await cache.get('user:123');
```

#### LRU Cache (Bounded Memory)

```typescript
import { createLRUCache } from '@nxt1/core/cache';

const cache = createLRUCache<ApiResponse>({
  maxSize: 50, // Required
  ttl: 60000,
});

// Least recently used entries evicted when full
```

#### Persistent Cache (Survives Restart)

```typescript
import { createPersistentCache } from '@nxt1/core/cache';
import { createBrowserStorageAdapter } from '@nxt1/core/storage';

const storage = createBrowserStorageAdapter();
const cache = createPersistentCache<Settings>(storage, {
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});
```

### 5. Mobile Cache Service

**Location:** `apps/mobile/src/app/services/cache.service.ts`

Two-tier caching for Ionic/Capacitor apps:

```typescript
@Component({...})
export class ProfilePage {
  private cache = inject(MobileCacheService);

  async loadProfile(userId: string) {
    return this.cache.getOrFetch(
      `profile:${userId}`,
      () => this.api.getProfile(userId),
      CACHE_CONFIG.MEDIUM_TTL
    );
  }
}
```

Features:

- Memory cache (fast) + Persistent cache (Capacitor Preferences)
- Automatic cache warming on app start
- `getOrFetch` pattern for clean API calls
- User cache invalidation on logout

### 6. SSR Transfer Cache

**Location:** `apps/web/src/app/app.config.ts`

```typescript
provideClientHydration(
  withHttpTransferCacheOptions({
    includePostRequests: false,
    includeHeaders: ['Authorization'],
  })
);
```

Prevents duplicate API calls during hydration by transferring server-fetched
data to the client.

## Cache Key Standards

All caches use consistent key prefixes from `@nxt1/core/cache`:

```typescript
import { CACHE_KEYS } from '@nxt1/core/cache';

CACHE_KEYS.USER_PROFILE; // 'user:profile:'
CACHE_KEYS.TEAM_DETAILS; // 'team:details:'
CACHE_KEYS.COLLEGE_LIST; // 'college:list'
CACHE_KEYS.API_RESPONSE; // 'api:'
```

## TTL Standards

```typescript
import { CACHE_CONFIG } from '@nxt1/core/cache';

CACHE_CONFIG.SHORT_TTL; // 1 minute - Feed, dynamic data
CACHE_CONFIG.MEDIUM_TTL; // 15 minutes - User data
CACHE_CONFIG.LONG_TTL; // 1 hour - Semi-static data
CACHE_CONFIG.EXTENDED_TTL; // 24 hours - Static reference data
```

## Cache Invalidation

### Manual Invalidation

```typescript
// Clear specific key
await cache.delete('user:profile:123');

// Clear by pattern
await cache.invalidate('user:*');

// Clear all
await cache.clear();
```

### HTTP Cache Clearing

```typescript
import { clearHttpCache } from './core/infrastructure';

// After user action that changes data
async updateProfile(data: ProfileUpdate) {
  await this.api.updateProfile(data);
  await clearHttpCache('profile:*');
}
```

### Mobile Cache on Logout

```typescript
// In auth service
async signOut() {
  await this.cache.invalidateUserCache();
  // ... rest of sign out
}
```

## Best Practices

### DO ✅

1. **Use appropriate TTL** - Match cache lifetime to data volatility
2. **Use cache keys from constants** - Prevents typos, enables bulk invalidation
3. **Use `getOrSet`/`getOrFetch` pattern** - Cleaner code, automatic caching
4. **Invalidate on mutations** - Clear relevant caches after POST/PUT/DELETE
5. **Check cache stats** - Monitor hit ratios in development

### DON'T ❌

1. **Don't cache auth tokens** - Security risk
2. **Don't cache user-specific data globally** - Include user ID in key
3. **Don't over-cache** - Stale data hurts UX more than slight latency
4. **Don't cache non-deterministic endpoints** - AI responses, real-time data

## Monitoring

### Get Cache Statistics

```typescript
// HTTP cache
import { getHttpCacheStats } from './core/infrastructure';
const stats = getHttpCacheStats();
console.log(`Hit ratio: ${(stats.hitRatio * 100).toFixed(1)}%`);

// Application cache
const memoryStats = cache.getStats();
console.log(
  `Entries: ${memoryStats.size}, Evictions: ${memoryStats.evictions}`
);
```

### Service Worker Status

```typescript
// Check in DevTools → Application → Service Workers
// Or programmatically:
if ('serviceWorker' in navigator) {
  const registration = await navigator.serviceWorker.ready;
  console.log('SW active:', registration.active);
}
```

## Testing

Cache tests are located in `packages/core/src/cache/cache.spec.ts`:

```bash
# Run cache tests
npm run test:core -- --filter cache

# Watch mode
npm run test:watch -- cache
```

## Architecture Diagram

```
User Request
     │
     ▼
┌─────────────┐
│  CDN Edge   │ ◄─── Static assets (1y cache)
└──────┬──────┘
       │ (miss)
       ▼
┌─────────────┐
│   Service   │ ◄─── PWA offline support
│   Worker    │      Asset precaching
└──────┬──────┘
       │ (miss)
       ▼
┌─────────────┐
│    HTTP     │ ◄─── LRU response cache
│ Interceptor │      Stale-while-revalidate
└──────┬──────┘
       │ (miss)
       ▼
┌─────────────┐
│  SSR Server │ ◄─── Server-side rendering
│  (if fresh) │      Transfer cache to client
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Backend    │ ◄─── Origin server
│    API      │
└─────────────┘
```
