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

### 3. Web Transport Cache (HTTP Interceptor)

**Location:** `apps/web/src/app/core/infrastructure/http/cache.interceptor.ts`

Features:

- LRU memory eviction
- TTL per URL pattern (`DEFAULT_TTL_CONFIG`)
- Stale-while-revalidate background fetches
- **Zero-Config Automatic Invalidation**: All mutations (POST, PUT, DELETE)
  trigger a cross-referenced invalidation map (`DEFAULT_INVALIDATION_CONFIG`).
- SSR-safe (no-op on server)

```typescript
// No manual tracking needed in feature services.
// The caching and invalidation is handled entirely by the transport layer automatically.
const data = await this.api.getProfile(id); // Cached transparently
await this.api.updateProfile(data); // Instantly clears '*profile*' memory cache automatically
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

### 5. Mobile Transport Cache (Capacitor Adapter)

**Location:**
`apps/mobile/src/app/core/infrastructure/http/capacitor-http-adapter.service.ts`

Two-tier automated native caching for Ionic/Capacitor apps. There are NO manual
dictionary caches inside mobile UI feature services.

```typescript
// 1. You fire a GET request via the standard portable API wrapper
const data = await this.api.getProfile(id);

// 2. CapacitorHttpAdapter intercepts it. It hits the MobileCacheService (RAM -> Disk).
// 3. It returns the cached payload (0ms latency, offline capable).

// 4. You fire a MUTATION request (POST/PUT/DELETE)
await this.api.updateProfile(newData); // Adapter intercepts this.

// 5. Adapter cross-references mobile-http-cache.policy.ts and automatically
// evicts matching RAM & Disk entries. No manual feature logic required!
```

Features:

- Memory cache (fast) + Persistent Disk cache (Capacitor Preferences)
- Automated zero-config cache intercepting via
  `MOBILE_HTTP_CACHE_INVALIDATION_CONFIG`.
- 100% Architectural parity with the Web App transport cache.

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
// You rarely need to do this manually anymore, as the Zero-Config Automated
// Invalidation handles it. But if needed:
import { clearHttpCache } from './core/infrastructure';

async forceRefreshProfile() {
  await clearHttpCache('*profile*');
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
3. **Rely on zero-config invalidation** - Let the transport layer flush caches
   on PUT/POST/DELETE.
4. **Use Observability Patterns** - Check network traces to ensure caching hits
   happen.
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
