# Firebase Performance Monitoring — Usage Examples

> **Real-world examples** showing how performance monitoring works in your NXT1
> app.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  AUTOMATIC (Zero Code Required)                             │
├─────────────────────────────────────────────────────────────┤
│  ✅ App start time                                          │
│  ✅ All HTTP/HTTPS requests to /api/*                       │
│  ✅ Page load times (web)                                   │
│  ✅ Screen rendering (mobile)                               │
│  ✅ Network latency & response codes                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  MANUAL (Add where needed)                                  │
├─────────────────────────────────────────────────────────────┤
│  📊 Custom traces for critical operations                   │
│  📊 Business metrics (items loaded, users found, etc.)      │
│  📊 User journey tracking                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Automatic HTTP Tracking (Already Working!)

Every API call to `/api/*` is **automatically tracked** via the HTTP
interceptor:

```typescript
// apps/web/src/app/app.config.ts
provideHttpClient(
  withInterceptors([
    httpPerformanceInterceptor({ apiOnly: true }), // ✅ Added automatically
  ])
);
```

**What gets tracked automatically:**

```typescript
// When you make ANY HTTP request:
this.http.get('/api/v1/feed').subscribe(...);
this.http.post('/api/v1/profile', data).subscribe(...);

// Firebase automatically records:
// - Trace name: "http_get_feed" or "http_post_profile"
// - Duration in milliseconds
// - HTTP status code (200, 404, 500, etc.)
// - Request/response payload sizes
// - Success/failure status
```

**No code changes needed** — it just works! 🎉

---

## 2. Feed Loading Example (Manual Traces)

Track how long it takes to load the feed with custom metrics:

```typescript
// apps/web/src/app/features/feed/services/feed.service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { PerformanceService } from '../../../core/services/performance.service';
import {
  TRACE_NAMES,
  METRIC_NAMES,
  ATTRIBUTE_NAMES,
} from '@nxt1/core/performance';

@Injectable({ providedIn: 'root' })
export class FeedService {
  private readonly api = inject(FeedApiService);
  private readonly performance = inject(PerformanceService);

  private readonly _feed = signal<FeedPost[]>([]);
  readonly feed = computed(() => this._feed());

  async loadFeed(): Promise<void> {
    // Start custom trace
    const trace = await this.performance.startTrace(TRACE_NAMES.FEED_LOAD);

    try {
      // Make API call (this also gets tracked by HTTP interceptor!)
      const posts = await this.api.getFeed();

      // Add custom metrics
      await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, posts.length);
      await trace.putAttribute(ATTRIBUTE_NAMES.SCREEN_NAME, 'home');
      await trace.putAttribute(ATTRIBUTE_NAMES.CACHE_STATUS, 'miss');

      this._feed.set(posts);
    } catch (error) {
      await trace.putAttribute('error', 'true');
      throw error;
    } finally {
      await trace.stop(); // Records duration
    }
  }

  // Alternative: Use trace wrapper (cleaner)
  async loadFeedClean(): Promise<void> {
    const posts = await this.performance.trace(
      TRACE_NAMES.FEED_LOAD,
      () => this.api.getFeed(),
      {
        attributes: { screen: 'home' },
        onSuccess: async (result, trace) => {
          await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, result.length);
        },
      }
    );

    this._feed.set(posts);
  }
}
```

---

## 3. Authentication Flow Example

Track the entire auth flow from start to finish:

```typescript
// apps/web/src/app/features/auth/services/auth.service.ts
import { Injectable, inject } from '@angular/core';
import { PerformanceService } from '../../../core/services/performance.service';
import { TRACE_NAMES } from '@nxt1/core/performance';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly performance = inject(PerformanceService);

  async signInWithEmail(email: string, password: string): Promise<void> {
    // Automatically tracked and includes user context
    await this.performance.trace(
      TRACE_NAMES.AUTH_LOGIN,
      async () => {
        const credential = await signInWithEmailAndPassword(
          this.auth,
          email,
          password
        );

        // Set user context for ALL future traces
        await this.performance.setUserContext(
          credential.user.uid,
          'athlete', // or 'coach', 'parent'
          'free' // or 'premium', 'elite'
        );

        return credential;
      },
      {
        attributes: {
          method: 'email',
          provider: 'firebase',
        },
      }
    );
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    // Clear user context
    await this.performance.clearUserContext();
  }
}
```

---

## 4. Search Example (With Retry Logic)

Track search with automatic retry on failure:

```typescript
// apps/web/src/app/features/search/services/search.service.ts
import { Injectable, inject } from '@angular/core';
import { PerformanceService } from '../../../core/services/performance.service';
import { traceWithRetry } from '@nxt1/core/performance';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly api = inject(SearchApiService);
  private readonly performance = inject(PerformanceService);

  async search(query: string): Promise<SearchResult[]> {
    // Automatically retries on failure with exponential backoff
    return traceWithRetry(
      this.performance,
      'search_execute',
      () => this.api.search(query),
      {
        maxRetries: 3,
        isRetryable: (err) => err.status === 429 || err.status >= 500,
      }
    );
  }
}
```

---

## 5. Batch Operations Example

Upload multiple files and track each one:

```typescript
// apps/web/src/app/features/media/services/upload.service.ts
import { Injectable, inject } from '@angular/core';
import { PerformanceService } from '../../../core/services/performance.service';
import { traceBatch, traceParallel } from '@nxt1/core/performance';

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly api = inject(MediaApiService);
  private readonly performance = inject(PerformanceService);

  // Sequential uploads (one after another)
  async uploadSequential(files: File[]): Promise<void> {
    const { results, successCount, errorCount } = await traceBatch(
      this.performance,
      'batch_upload',
      files.map((file) => () => this.api.uploadFile(file))
    );

    console.log(`Uploaded ${successCount}/${files.length} files`);
  }

  // Parallel uploads (all at once)
  async uploadParallel(files: File[]): Promise<void> {
    const { results, successCount, totalDuration } = await traceParallel(
      this.performance,
      'parallel_upload',
      files.map((file) => () => this.api.uploadFile(file))
    );

    console.log(`Uploaded ${successCount} files in ${totalDuration}ms`);
  }
}
```

---

## 6. Component Example (Route Navigation)

Track how long it takes to load a page component:

```typescript
// apps/web/src/app/features/profile/pages/profile/profile.component.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { PerformanceService } from '../../../../core/services/performance.service';
import { TRACE_NAMES } from '@nxt1/core/performance';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  standalone: true,
})
export class ProfileComponent implements OnInit {
  private readonly performance = inject(PerformanceService);
  private readonly profileService = inject(ProfileService);

  readonly profile = signal<Profile | null>(null);
  readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    // Start screen trace
    const screenTrace = await this.performance.startScreenTrace('profile');

    try {
      // Load profile data
      const data = await this.performance.trace(
        TRACE_NAMES.PROFILE_LOAD,
        () => this.profileService.loadProfile(),
        {
          attributes: { source: 'navigation' },
        }
      );

      this.profile.set(data);
    } finally {
      this.loading.set(false);
      await screenTrace.stop(); // Records total screen load time
    }
  }
}
```

---

## 7. Mobile-Specific Example

Track native features like camera access:

```typescript
// apps/mobile/src/app/features/media/services/camera.service.ts
import { Injectable, inject } from '@angular/core';
import { Camera, CameraResultType } from '@capacitor/camera';
import { PerformanceService } from '../../../core/services/performance.service';

@Injectable({ providedIn: 'root' })
export class CameraService {
  private readonly performance = inject(PerformanceService);

  async takePicture(): Promise<string> {
    return this.performance.trace(
      'camera_capture',
      async () => {
        const image = await Camera.getPhoto({
          quality: 90,
          resultType: CameraResultType.DataUrl,
        });
        return image.dataUrl!;
      },
      {
        attributes: {
          feature: 'camera',
          platform: 'mobile',
        },
      }
    );
  }
}
```

---

## 8. What You'll See in Firebase Console

After implementing the above, Firebase Console will show:

### Custom Traces

| Trace Name       | Avg Duration | P95 Duration | Call Count |
| ---------------- | ------------ | ------------ | ---------- |
| `feed_load`      | 342ms        | 850ms        | 1,234      |
| `profile_load`   | 156ms        | 420ms        | 892        |
| `auth_login`     | 1,230ms      | 2,100ms      | 145        |
| `search_execute` | 89ms         | 250ms        | 567        |
| `camera_capture` | 2,340ms      | 4,200ms      | 89         |

### Network Requests (Automatic)

| Endpoint               | Success Rate | Avg Duration | P95 Duration |
| ---------------------- | ------------ | ------------ | ------------ |
| `GET /api/v1/feed`     | 99.2%        | 245ms        | 680ms        |
| `POST /api/v1/profile` | 98.7%        | 123ms        | 340ms        |
| `GET /api/v1/search`   | 97.5%        | 67ms         | 180ms        |

### Custom Metrics

- **Items loaded per request**: 12.3 avg, 45 max
- **Retry count**: 0.12 avg (mostly succeed first try)
- **Cache hit rate**: 67% (from cache_status attribute)

---

## 9. Best Practices for Your App

```typescript
// ✅ DO: Trace critical user journeys
TRACE_NAMES.AUTH_LOGIN;
TRACE_NAMES.FEED_LOAD;
TRACE_NAMES.PROFILE_LOAD;
TRACE_NAMES.SEARCH_EXECUTE;
TRACE_NAMES.PAYMENT_PROCESS;

// ✅ DO: Add meaningful metrics
await trace.putMetric('items_loaded', results.length);
await trace.putMetric('filtered_count', filtered.length);

// ✅ DO: Add context attributes
await trace.putAttribute('user_tier', 'premium');
await trace.putAttribute('sport', 'football');
await trace.putAttribute('cache_status', 'hit');

// ❌ DON'T: Trace trivial operations
('update_local_cache');
('format_date_string');

// ❌ DON'T: Add PII to attributes
await trace.putAttribute('email', user.email); // NEVER
await trace.putAttribute('phone', user.phone); // NEVER
```

---

## Summary

**What you need to do:**

1. ✅ **Nothing for HTTP calls** — Already auto-tracked via interceptor
2. 📊 **Add traces to critical operations** — Login, feed load, search, etc.
3. 📈 **Add metrics & attributes** — Items loaded, cache status, user tier
4. 🔍 **Set user context** — After authentication
5. 🧪 **Test** — Run `testPerformance()` in browser console

**The implementation is ALREADY working** — your HTTP calls are being tracked
right now!
