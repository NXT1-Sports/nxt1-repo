# Firebase Analytics Integration

## Status: Partially Complete

> The analytics module in `@nxt1/core` is comprehensive, but integration is
> incomplete.

---

## What's Built ✅

### Core Package (`packages/core/src/analytics/`)

| File                     | Purpose                                           | Status      |
| ------------------------ | ------------------------------------------------- | ----------- |
| `analytics-adapter.ts`   | Interface definition                              | ✅ Complete |
| `firebase-analytics.ts`  | Web Firebase SDK adapter                          | ✅ Complete |
| `mobile-analytics.ts`    | Capacitor plugin adapter                          | ✅ Complete |
| `memory-analytics.ts`    | SSR/Testing no-op adapter                         | ✅ Complete |
| `universal-analytics.ts` | Platform auto-detection factory                   | ✅ Complete |
| `events.ts`              | 70+ event constants (APP_EVENTS, FIREBASE_EVENTS) | ✅ Complete |
| `event-schemas.ts`       | TypeScript event payload types                    | ✅ Complete |
| `web-analytics.ts`       | Legacy gtag.js adapter                            | ✅ Complete |

### Features

- ✅ Firebase recommended events (FIREBASE_EVENTS)
- ✅ Custom NXT1 events (APP_EVENTS)
- ✅ User properties for segmentation
- ✅ GDPR consent management (`updateConsent()`)
- ✅ Debug mode for development
- ✅ SSR-safe (memory adapter on server)
- ✅ Platform auto-detection (web vs iOS vs Android)
- ✅ Unit tests passing (176 tests)

---

## What Needs Integration ⚠️

### Web App (`apps/web/`)

| Service           | Analytics         | Status                                    |
| ----------------- | ----------------- | ----------------------------------------- |
| `AuthFlowService` | ✅ Integrated     | Uses `createFirebaseAnalyticsAdapterSync` |
| Other services    | ❌ Not integrated | Need to add tracking                      |

### Mobile App (`apps/mobile/`)

| Service           | Analytics         | Status                                      |
| ----------------- | ----------------- | ------------------------------------------- |
| `AuthFlowService` | ✅ Integrated     | Uses `createMobileAnalyticsAdapterSync`     |
| `ShareService`    | ⚠️ Partial        | Has analytics comment but no implementation |
| Other services    | ❌ Not integrated | Need to add tracking                        |

---

## Integration Tasks

### 1. Mobile Auth Analytics ✅ COMPLETE

- [x] Added `createMobileAnalyticsAdapterSync` to mobile's `AuthFlowService`
- [x] Track auth events (sign_in, sign_up, sign_out) with `AUTH_METHODS`
      constants
- [x] Error tracking with `getAuthErrorCode()`
- [x] Matches web's tracking implementation
- [x] Uses proper platform detection (`isIOS()`, `isAndroid()`)

### 2. Create Analytics Service Wrapper

- [ ] Create `apps/web/src/app/core/services/analytics.service.ts`
- [ ] Create `apps/mobile/src/app/core/services/analytics.service.ts`
- [ ] Provide as singleton, inject where needed

```typescript
// Example: apps/web/src/app/core/services/analytics.service.ts
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly adapter = createFirebaseAnalyticsAdapterSync({
    firebaseConfig: environment.firebase,
    debug: !environment.production,
  });

  trackEvent = this.adapter.trackEvent.bind(this.adapter);
  setUserId = this.adapter.setUserId.bind(this.adapter);
  setUserProperties = this.adapter.setUserProperties.bind(this.adapter);
  trackPageView = this.adapter.trackPageView.bind(this.adapter);
}
```

### 3. Add Page View Tracking

- [ ] Web: Add to router events subscription
- [ ] Mobile: Add to Ionic route changes

```typescript
// Router-level page tracking
this.router.events
  .pipe(filter((event) => event instanceof NavigationEnd))
  .subscribe((event: NavigationEnd) => {
    analytics.trackPageView(event.urlAfterRedirects);
  });
```

### 4. Track Key User Actions

| Feature      | Events to Track                                                           | Status         |
| ------------ | ------------------------------------------------------------------------- | -------------- |
| Auth         | `auth_signed_up`, `auth_signed_in`, `auth_signed_out`                     | ✅ Complete    |
| Onboarding   | `onboarding_started`, `onboarding_step_completed`, `onboarding_completed` | ❌ Not started |
| Profile      | `profile_viewed`, `profile_edited`, `profile_shared`                      | ❌ Not started |
| Video        | `video_viewed`, `video_played`, `video_completed`, `video_uploaded`       | ❌ Not started |
| Subscription | `subscription_started`, `credits_purchased`                               | ❌ Not started |
| Search       | `search_performed`, `search_result_clicked`                               | ❌ Not started |
| Social       | `user_followed`, `comment_added`, `reaction_added`                        | ❌ Not started |

---

## Firebase Console Setup

- [ ] Enable Google Analytics in Firebase Console
- [ ] Configure Data Streams (web, iOS, Android)
- [ ] Create custom audiences
- [ ] Set up conversion events
- [ ] Create dashboards for key metrics

---

## Testing Checklist

- [ ] Events appear in Firebase DebugView
- [ ] User properties set correctly
- [ ] Page views tracking
- [ ] No PII in event parameters
- [ ] SSR doesn't throw errors

---

## Architecture Reference

```
┌─────────────────────────────────────────────────────────────────┐
│                    Your Application                              │
│  import { createAnalytics, APP_EVENTS } from '@nxt1/core/analytics'
├─────────────────────────────────────────────────────────────────┤
│                  AnalyticsAdapter Interface                      │
│  trackEvent() | trackPageView() | setUserId() | ...             │
├───────────────┬─────────────────┬───────────────────────────────┤
│ Web (FB SDK)  │ iOS/Android     │ Memory (SSR/Test)             │
│ Firebase JS   │ Capacitor Plugin│ No-op for SSR                 │
└───────────────┴─────────────────┴───────────────────────────────┘
```

---

## Priority

| Task                  | Priority    | Status                 |
| --------------------- | ----------- | ---------------------- |
| Mobile auth analytics | ✅ Complete | Done - parity with web |
| Page view tracking    | 🟡 Medium   | Not started            |
| Full event coverage   | 🟢 Low      | Partial - Auth done    |
