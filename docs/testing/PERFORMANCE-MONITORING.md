# Firebase Performance Monitoring — NXT1 Monorepo

> **2026 Enterprise Implementation** — Complete guide to Firebase Performance
> Monitoring across Web, iOS, and Android platforms.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Platform-Specific Setup](#platform-specific-setup)
5. [Using Performance Monitoring](#using-performance-monitoring)
6. [Custom Traces](#custom-traces)
7. [Best Practices](#best-practices)
8. [Firebase Console](#firebase-console)
9. [Troubleshooting](#troubleshooting)

---

## Overview

Firebase Performance Monitoring helps you understand where and when the
performance of your app can be improved so that you can use that information to
fix performance issues.

### What Gets Collected Automatically

| Platform    | Automatic Metrics                                                                   |
| ----------- | ----------------------------------------------------------------------------------- |
| **iOS**     | App start time, screen rendering, HTTP/S network requests                           |
| **Android** | App start time, screen rendering, HTTP/S network requests, frozen frames            |
| **Web**     | Page load (FCP, DOMContentLoaded, load), first input delay, HTTP/S network requests |

### NXT1 Performance Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    @nxt1/core/performance                       │
│   PerformanceAdapter Interface | TRACE_NAMES | Utilities        │
├───────────────┬─────────────────┬───────────────────────────────┤
│ Mobile        │ Web             │ Testing/SSR                   │
│ (Capacitor)   │ (@angular/fire) │ (Memory/NoOp)                 │
│               │                 │                               │
│ FirebasePerf  │ firebase/perf   │ In-memory                     │
│ Plugin        │                 │ adapter                       │
├───────────────┴─────────────────┴───────────────────────────────┤
│               Firebase Performance Console                      │
│         Traces | Network | Trends | Alerts | BigQuery           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Shared Core Types (`@nxt1/core/performance`)

The core package provides 100% portable TypeScript types and utilities:

```typescript
import {
  // Types
  PerformanceAdapter,
  ActiveTrace,
  TraceConfig,
  PerformanceConfig,

  // Constants
  TRACE_NAMES,
  METRIC_NAMES,
  ATTRIBUTE_NAMES,
  DEFAULT_PERFORMANCE_CONFIG,

  // Utilities
  traceBuilder,
  traceBatch,
  traceParallel,
  traceWithRetry,
  createTimer,
  aggregateMetrics,

  // Adapters (for testing)
  createMemoryPerformanceAdapter,
  createNoOpPerformanceAdapter,
} from '@nxt1/core/performance';
```

### Platform Services

| Platform | Service Location                                           | Plugin/Library                    |
| -------- | ---------------------------------------------------------- | --------------------------------- |
| Mobile   | `apps/mobile/src/app/core/services/performance.service.ts` | `@capacitor-firebase/performance` |
| Web      | `apps/web/src/app/core/services/performance.service.ts`    | `@angular/fire/performance`       |

---

## Quick Start

### 1. Import and Inject the Service

```typescript
import { Component, inject } from '@angular/core';
import { PerformanceService } from './core/services/performance.service';
import { TRACE_NAMES, METRIC_NAMES } from '@nxt1/core/performance';

@Component({...})
export class FeedComponent {
  private readonly performance = inject(PerformanceService);

  async loadFeed(): Promise<void> {
    const trace = await this.performance.startTrace(TRACE_NAMES.FEED_LOAD);

    try {
      const data = await this.api.getFeed();
      await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, data.length);
      this.feed.set(data);
    } catch (error) {
      await trace.putAttribute('error', 'true');
      throw error;
    } finally {
      await trace.stop();
    }
  }
}
```

### 2. Use the Trace Helper (Cleaner API)

```typescript
async loadFeed(): Promise<void> {
  const data = await this.performance.trace(TRACE_NAMES.FEED_LOAD,
    async () => this.api.getFeed(),
    {
      attributes: { screen: 'home' },
      onSuccess: async (result, trace) => {
        await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, result.length);
      },
    }
  );

  this.feed.set(data);
}
```

---

## Platform-Specific Setup

### Web Setup (Automatic with @angular/fire)

**1. Firebase Performance is already configured in `app.config.ts`:**

```typescript
// apps/web/src/app/app.config.ts
import { providePerformance, getPerformance } from '@angular/fire/performance';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... other providers
    providePerformance(() => getPerformance()),
  ],
};
```

**2. Performance data automatically collects:**

- Page load metrics (First Contentful Paint, DOM Content Loaded)
- First Input Delay (with polyfill)
- All HTTP/S network requests

### iOS Setup

**1. The Podfile already includes the Capacitor plugin:**

```ruby
# apps/mobile/ios/App/Podfile
pod 'CapacitorFirebasePerformance', :path => '../../../../node_modules/@capacitor-firebase/performance'
```

**2. Run pod install:**

```bash
cd apps/mobile/ios/App
pod install --repo-update
```

**3. Enable debug logging (optional):**

In Xcode: Product > Scheme > Edit scheme > Run > Arguments > Add:

```
-FIRDebugEnabled
```

### Android Setup

**1. The Gradle files are already configured:**

```gradle
// apps/mobile/android/build.gradle
classpath 'com.google.firebase:perf-plugin:1.4.2'

// apps/mobile/android/app/build.gradle
apply plugin: 'com.google.firebase.firebase-perf'

dependencies {
  implementation platform('com.google.firebase:firebase-bom:34.8.0')
  implementation 'com.google.firebase:firebase-perf'
}
```

**2. Enable debug logging (optional):**

Add to `AndroidManifest.xml`:

```xml
<application>
  <meta-data
    android:name="firebase_performance_logcat_enabled"
    android:value="true" />
</application>
```

**3. Sync project:**

```bash
cd apps/mobile
npx cap sync android
```

---

## Using Performance Monitoring

### Initialize Service (Optional)

The service auto-initializes, but you can configure it:

```typescript
// In main.ts or an APP_INITIALIZER
import { PerformanceService } from './core/services/performance.service';

async function initApp() {
  const performance = inject(PerformanceService);

  await performance.initialize({
    enabled: !isDevMode(),
    appVersion: environment.version,
    debugLogging: isDevMode(),
  });

  // Set user context after auth
  await performance.setUserContext(user.id, user.role, user.tier);
}
```

### Set User Context

```typescript
// After authentication
await this.performance.setUserContext(
  user.uid,
  user.role, // 'athlete', 'coach', etc.
  user.tier // 'free', 'premium', etc.
);

// On logout
await this.performance.clearUserContext();
```

### Manual HTTP Metric Tracking

For requests not automatically captured:

```typescript
const metric = await this.performance.startHttpMetric(
  'https://api.external.com/data',
  'POST'
);

try {
  const response = await fetch(url, options);
  await metric.setHttpResponseCode(response.status);
  await metric.setResponsePayloadSize(responseSize);
  return response.json();
} finally {
  await metric.stop();
}
```

---

## Custom Traces

### Standard Trace Names

Use the predefined constants for consistency:

```typescript
import { TRACE_NAMES } from '@nxt1/core/performance';

// Authentication
TRACE_NAMES.AUTH_LOGIN; // 'auth_login'
TRACE_NAMES.AUTH_REGISTER; // 'auth_register'
TRACE_NAMES.AUTH_SOCIAL_SIGN_IN; // 'auth_social_sign_in'

// Data Loading
TRACE_NAMES.FEED_LOAD; // 'feed_load'
TRACE_NAMES.PROFILE_LOAD; // 'profile_load'
TRACE_NAMES.SEARCH_EXECUTE; // 'search_execute'

// Media
TRACE_NAMES.IMAGE_UPLOAD; // 'image_upload'
TRACE_NAMES.VIDEO_UPLOAD; // 'video_upload'

// Navigation
TRACE_NAMES.NAVIGATION_ROUTE_CHANGE; // 'navigation_route_change'

// Payment
TRACE_NAMES.PAYMENT_PROCESS; // 'payment_process'
```

### Standard Metric Names

```typescript
import { METRIC_NAMES } from '@nxt1/core/performance';

await trace.putMetric(METRIC_NAMES.ITEMS_LOADED, 25);
await trace.putMetric(METRIC_NAMES.PAYLOAD_SIZE_BYTES, 4096);
await trace.putMetric(METRIC_NAMES.RETRY_COUNT, 2);
await trace.putMetric(METRIC_NAMES.CACHE_SIZE_BYTES, 10240);
```

### Standard Attribute Names

```typescript
import { ATTRIBUTE_NAMES } from '@nxt1/core/performance';

await trace.putAttribute(ATTRIBUTE_NAMES.USER_ID, userId);
await trace.putAttribute(ATTRIBUTE_NAMES.SCREEN_NAME, 'feed');
await trace.putAttribute(ATTRIBUTE_NAMES.CACHE_STATUS, 'hit'); // or 'miss'
await trace.putAttribute(ATTRIBUTE_NAMES.FEATURE_NAME, 'video_player');
```

### Fluent Trace Builder

For complex trace configurations:

```typescript
import { traceBuilder } from '@nxt1/core/performance';

const result = await traceBuilder(
  this.performance,
  'complex_operation',
  async () => {
    // Your async operation
    return await complexOperation();
  }
)
  .attribute('source', 'user_action')
  .attribute('feature', 'media_upload')
  .metric('initial_count', files.length)
  .onSuccess(async (result, trace) => {
    await trace.putMetric('processed_count', result.processed);
    await trace.putMetric('skipped_count', result.skipped);
  })
  .onError(async (error, trace) => {
    await trace.putAttribute('error_code', error.code);
  })
  .execute();
```

### Batch Operations

Trace multiple parallel operations:

```typescript
import { traceParallel } from '@nxt1/core/performance';

const { results, successCount, errorCount, totalDuration } =
  await traceParallel(
    this.performance,
    'batch_upload',
    files.map((file) => () => this.uploadFile(file))
  );

console.log(
  `Uploaded ${successCount}/${files.length} files in ${totalDuration}ms`
);
```

### Retry with Tracing

Automatically trace retry attempts:

```typescript
import { traceWithRetry } from '@nxt1/core/performance';

const data = await traceWithRetry(
  this.performance,
  'api_call_with_retry',
  async () => api.fetchData(),
  {
    maxRetries: 3,
    baseDelay: 1000,
    exponentialBackoff: true,
    isRetryable: (err) => err.status === 429 || err.status >= 500,
  }
);
```

---

## Best Practices

### 1. Trace Critical User Journeys

Focus on operations that directly impact user experience:

```typescript
// ✅ Good: User-facing operations
TRACE_NAMES.AUTH_LOGIN;
TRACE_NAMES.FEED_LOAD;
TRACE_NAMES.SEARCH_EXECUTE;
TRACE_NAMES.VIDEO_UPLOAD;

// ❌ Avoid: Internal operations
('update_local_cache');
('sync_preferences');
('check_feature_flag');
```

### 2. Use Meaningful Metrics

```typescript
// ✅ Meaningful metrics
await trace.putMetric('items_loaded', results.length);
await trace.putMetric('cache_hits', cacheHits);
await trace.putMetric('filtered_count', filtered.length);

// ❌ Avoid: Meaningless metrics
await trace.putMetric('flag', 1);
await trace.putMetric('done', 1);
```

### 3. Add Context Attributes

```typescript
// ✅ Good: Add context for filtering in Firebase Console
await trace.putAttribute('user_tier', 'premium');
await trace.putAttribute('sport', 'football');
await trace.putAttribute('cache_status', wasCached ? 'hit' : 'miss');

// ❌ Avoid: PII in attributes
await trace.putAttribute('email', user.email); // NEVER do this
await trace.putAttribute('phone', user.phone); // NEVER do this
```

### 4. Keep Trace Names Under 100 Characters

Firebase Performance has a 100-character limit on trace names:

```typescript
// ✅ Good: Short, descriptive names
'profile_load';
'feed_refresh';
'video_upload';

// ❌ Bad: Overly long names
'load_user_profile_with_sports_stats_and_offers_from_firebase';
```

### 5. Don't Create Too Many Custom Traces

Firebase has quotas. Focus on the top 10-20 most important operations.

### 6. Initialize Early

Initialize performance monitoring as early as possible:

```typescript
// main.ts
bootstrapApplication(AppComponent, appConfig).then(async (appRef) => {
  const performance = appRef.injector.get(PerformanceService);
  await performance.initialize({ appVersion: '2.0.0' });
});
```

---

## Firebase Console

### Viewing Performance Data

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Performance** in the left sidebar

### Key Dashboards

| Dashboard         | What It Shows                                            |
| ----------------- | -------------------------------------------------------- |
| **Overview**      | App start time, screen traces, network latency           |
| **On-device**     | Screen rendering, frozen frames, slow frames             |
| **Network**       | HTTP request success rate, response times, payload sizes |
| **Custom traces** | Your custom trace durations and metrics                  |

### Setting Up Alerts

1. Go to Performance > Alerts
2. Click "Create alert"
3. Configure:
   - **Metric**: e.g., "App start time"
   - **Condition**: e.g., "exceeds 5 seconds"
   - **Percentile**: e.g., "for 50% of users"
4. Add notification channels (email, Slack, PagerDuty)

### Exporting to BigQuery

For advanced analysis:

1. Go to Project Settings > Integrations
2. Enable BigQuery export for Performance Monitoring
3. Query your data with SQL

```sql
SELECT
  trace_name,
  AVG(duration_us) / 1000 as avg_duration_ms,
  COUNT(*) as trace_count
FROM `project.firebase_performance.traces`
WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
GROUP BY trace_name
ORDER BY avg_duration_ms DESC
LIMIT 20
```

---

## Troubleshooting

### No Data in Console

**Wait 12-24 hours** — Performance data takes time to aggregate.

For faster debugging, enable debug logging:

- **iOS**: Add `-FIRDebugEnabled` launch argument
- **Android**: Add `firebase_performance_logcat_enabled` meta-data
- **Web**: Check Network tab for `firebaselogging.googleapis.com` requests

### Traces Not Appearing

1. Ensure `google-services.json` (Android) / `GoogleService-Info.plist` (iOS)
   are present
2. Verify Firebase project matches your app
3. Check that traces are actually stopped (`trace.stop()`)

### High Memory Usage

Reduce the number of concurrent traces:

```typescript
// ❌ Avoid: Starting many traces without stopping
items.forEach(async (item) => {
  const trace = await performance.startTrace('process_item');
  // ...forgot to stop
});

// ✅ Good: Proper trace lifecycle
for (const item of items) {
  const trace = await performance.startTrace('process_item');
  try {
    await processItem(item);
  } finally {
    await trace.stop();
  }
}
```

### Web Performance Not Working

1. Ensure `providePerformance()` is in your app.config.ts
2. Check browser console for errors
3. Verify Firebase config has correct `measurementId`

### Mobile Performance Not Working

1. Run `npx cap sync` after any native changes
2. Verify `google-services.json` is in `android/app/`
3. Verify `GoogleService-Info.plist` is in `ios/App/App/`
4. Rebuild the native app (not just a web refresh)

---

## References

- [Firebase Performance Monitoring Docs](https://firebase.google.com/docs/perf-mon)
- [Web SDK Reference](https://firebase.google.com/docs/reference/js/performance)
- [iOS SDK Reference](https://firebase.google.com/docs/reference/swift/firebaseperformance/api/reference/Classes)
- [Android SDK Reference](https://firebase.google.com/docs/reference/android/com/google/firebase/perf/FirebasePerformance)
- [@capacitor-firebase/performance](https://github.com/capawesome-team/capacitor-firebase/tree/main/packages/performance)
- [@angular/fire Performance](https://github.com/angular/angularfire/blob/master/docs/performance.md)
