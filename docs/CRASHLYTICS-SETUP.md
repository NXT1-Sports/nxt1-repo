# Firebase Crashlytics Setup Guide

> **Enterprise-grade crash reporting for NXT1 monorepo**

This guide covers the complete setup of Firebase Crashlytics across all NXT1
platforms.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Package Structure](#package-structure)
3. [Installation](#installation)
4. [Platform-Specific Setup](#platform-specific-setup)
5. [Usage Guide](#usage-guide)
6. [CI/CD Symbol Uploads](#cicd-symbol-uploads)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

NXT1 uses Firebase Crashlytics for native mobile crash reporting with GA4
fallback for web:

```
┌─────────────────────────────────────────────────────────────────┐
│                    GlobalErrorHandler                           │
│  Catches all unhandled errors → routes to CrashlyticsAdapter   │
├───────────────┬─────────────────┬───────────────────────────────┤
│ Mobile (Native)│ Web (GA4)      │ SSR/Test (No-op)             │
│ @capacitor-    │ gtag exception │ In-memory or silent          │
│ firebase/      │ events         │                              │
│ crashlytics    │                │                              │
├───────────────┼─────────────────┼───────────────────────────────┤
│ ✅ Native ANR  │ ⚠️ JS errors   │ ✅ Safe no-op                │
│ ✅ NDK crashes │ ✅ GA4 reports │                              │
│ ✅ Full stacks │ ⚠️ Limited     │                              │
└───────────────┴─────────────────┴───────────────────────────────┘
```

### Why This Architecture?

1. **Firebase Crashlytics doesn't support web** - Only native SDKs available
2. **GA4 exception events** provide web error tracking in same Firebase Console
3. **Unified adapter interface** means consistent API across platforms
4. **Backend uses Cloud Error Reporting** - Same Google Cloud infrastructure

---

## Package Structure

```
packages/core/src/crashlytics/           ← Pure TypeScript (100% portable)
├── index.ts                             ← Barrel export
├── crashlytics.types.ts                 ← CrashException, CrashUser, etc.
├── crashlytics.constants.ts             ← CRASH_KEYS, severity mappings
└── crashlytics-adapter.ts               ← CrashlyticsAdapter interface

packages/ui/src/infrastructure/
└── error-handling/
    └── global-error-handler.ts          ← GLOBAL_CRASHLYTICS injection token

apps/mobile/src/app/services/
└── crashlytics.service.ts               ← Native Capacitor implementation

apps/web/src/app/core/services/
└── crashlytics.service.ts               ← Web GA4 implementation
```

---

## Installation

### 1. Install Dependencies

```bash
# Mobile app (Capacitor plugin)
cd apps/mobile
npm install @capacitor-firebase/crashlytics
npx cap sync

# Web app (already has @angular/fire)
# No additional dependencies needed
```

### 2. Initialize in main.ts (Mobile)

```typescript
// apps/mobile/src/main.ts
import { CrashlyticsService } from './app/services/crashlytics.service';

// Initialize Crashlytics early to catch startup crashes
const crashlytics = new CrashlyticsService();
crashlytics
  .initialize({
    enabled: environment.production,
    debug: !environment.production,
    initialCustomKeys: {
      app_version: environment.appVersion,
      environment: environment.production ? 'production' : 'development',
    },
  })
  .then(() => {
    bootstrapApplication(AppComponent, appConfig);
  })
  .catch((err) => {
    crashlytics.recordError(err);
    console.error('Bootstrap error:', err);
  });
```

### 3. Wire Up in app.config.ts

Both mobile and web app.config.ts files are already configured:

```typescript
// Already configured in app.config.ts
import {
  GlobalErrorHandler,
  GLOBAL_ERROR_LOGGER,
  GLOBAL_CRASHLYTICS,
} from '@nxt1/ui';
import { CrashlyticsService } from './services/crashlytics.service';

providers: [
  { provide: GLOBAL_ERROR_LOGGER, useExisting: NxtLoggingService },
  { provide: GLOBAL_CRASHLYTICS, useExisting: CrashlyticsService },
  { provide: ErrorHandler, useClass: GlobalErrorHandler },
];
```

---

## Platform-Specific Setup

### iOS Setup

1. **Add GoogleService-Info.plist** to your iOS project:

```bash
# Download from Firebase Console → Project Settings → iOS app
# Place in apps/mobile/ios/App/App/GoogleService-Info.plist
```

2. **Update Podfile** (apps/mobile/ios/App/Podfile):

```ruby
target 'App' do
  capacitor_pods
  pod 'FirebaseCrashlytics'
end
```

3. **Enable dSYM uploads** in Xcode:
   - Build Settings → Debug Information Format → `DWARF with dSYM File`
   - Build Phases → Add "Upload Crashlytics Symbols" script

4. **Add build phase script** (Xcode → Build Phases → New Run Script):

```bash
"${PODS_ROOT}/FirebaseCrashlytics/run"
```

### Android Setup

1. **Add google-services.json** to your Android project:

```bash
# Download from Firebase Console → Project Settings → Android app
# Place in apps/mobile/android/app/google-services.json
```

2. **Update build.gradle** (apps/mobile/android/build.gradle):

```groovy
buildscript {
    dependencies {
        classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.3'
    }
}
```

3. **Update app/build.gradle** (apps/mobile/android/app/build.gradle):

```groovy
plugins {
    id 'com.google.firebase.crashlytics'
}

android {
    buildTypes {
        release {
            // Enable native symbol upload
            firebaseCrashlytics {
                nativeSymbolUploadEnabled true
                unstrippedNativeLibsDir 'build/intermediates/merged_native_libs/release/out/lib'
            }
        }
    }
}
```

### Web Setup

Web uses GA4 exception events automatically through `@angular/fire/analytics`.
No additional setup required - just ensure Firebase Analytics is enabled.

---

## Usage Guide

### Basic Error Recording

```typescript
// In any component or service
import { CrashlyticsService } from '../services/crashlytics.service';

@Component({...})
export class MyComponent {
  private readonly crashlytics = inject(CrashlyticsService);

  async doSomethingRisky() {
    try {
      await this.riskyOperation();
    } catch (error) {
      // Record non-fatal error
      await this.crashlytics.recordError(error as Error);

      // Or with more context
      await this.crashlytics.recordException({
        message: error.message,
        code: 'RISKY_OPERATION_FAILED',
        category: 'javascript',
        severity: 'error',
        stacktrace: error.stack,
      });
    }
  }
}
```

### Setting User Context

```typescript
// After successful login
async onLoginSuccess(user: User) {
  await this.crashlytics.setUser({
    userId: user.uid,
    email: user.email,
    displayName: user.displayName,
  });

  // Set user role for filtering in Firebase Console
  await this.crashlytics.setCustomKey(CRASH_KEYS.USER_ROLE, user.role);
  await this.crashlytics.setCustomKey(CRASH_KEYS.SUBSCRIPTION_TIER, user.subscriptionTier);
}

// On logout
async onLogout() {
  await this.crashlytics.clearUser();
}
```

### Adding Breadcrumbs

Breadcrumbs help understand what the user did before a crash:

```typescript
// Track navigation
await this.crashlytics.trackNavigation('/home', '/profile/123');

// Track HTTP requests
await this.crashlytics.trackHttpRequest('GET', '/api/v1/profile/123', 200, 150);

// Track user actions
await this.crashlytics.trackUserAction('Button clicked: Save Profile', {
  profile_id: '123',
  changes: ['bio', 'avatar'],
});

// Simple log messages
await this.crashlytics.log('User started video upload');
```

### Custom Keys for Context

```typescript
import { CRASH_KEYS } from '@nxt1/core/crashlytics';

// Set screen context
await this.crashlytics.setCustomKey(CRASH_KEYS.SCREEN_NAME, 'profile/123');

// Set feature flags
await this.crashlytics.setCustomKey(
  CRASH_KEYS.FEATURE_FLAGS,
  'new_feed:true,dark_mode:false'
);

// Set network state
await this.crashlytics.setCustomKey(CRASH_KEYS.IS_OFFLINE, false);
await this.crashlytics.setCustomKey(CRASH_KEYS.CONNECTION_TYPE, 'wifi');

// NXT1-specific context
await this.crashlytics.setCustomKey(CRASH_KEYS.ACTIVE_SPORT, 'football');
await this.crashlytics.setCustomKey(CRASH_KEYS.ACTIVE_TEAM_ID, 'team_abc123');
```

### Testing Crashes

```typescript
// ⚠️ Only use in development!
if (!environment.production) {
  // Test non-fatal error
  await this.crashlytics.recordException({
    message: 'Test error from developer',
    severity: 'error',
  });

  // Test fatal crash (will crash the app!)
  await this.crashlytics.crash();
}
```

---

## CI/CD Symbol Uploads

### GitHub Actions Workflow

Add to `.github/workflows/mobile-release.yml`:

```yaml
name: Mobile Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd apps/mobile
          npm ci
          npx cap sync ios

      - name: Build iOS
        run: |
          cd apps/mobile/ios/App
          xcodebuild -workspace App.xcworkspace \
            -scheme App \
            -configuration Release \
            -archivePath build/App.xcarchive \
            archive

      - name: Upload dSYMs to Firebase
        env:
          GOOGLE_APPLICATION_CREDENTIALS:
            ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: |
          # Install Firebase CLI
          npm install -g firebase-tools

          # Find and upload dSYMs
          firebase crashlytics:symbols:upload \
            --app=${{ secrets.FIREBASE_IOS_APP_ID }} \
            apps/mobile/ios/App/build/App.xcarchive/dSYMs

  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: |
          cd apps/mobile
          npm ci
          npx cap sync android

      - name: Build Android
        run: |
          cd apps/mobile/android
          ./gradlew assembleRelease

      - name: Upload Mapping File to Firebase
        env:
          GOOGLE_APPLICATION_CREDENTIALS:
            ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: |
          firebase crashlytics:mappingfile:upload \
            --app=${{ secrets.FIREBASE_ANDROID_APP_ID }} \
            apps/mobile/android/app/build/outputs/mapping/release/mapping.txt
```

### Required Secrets

Add these secrets to your GitHub repository:

| Secret                     | Description                                                |
| -------------------------- | ---------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON                              |
| `FIREBASE_IOS_APP_ID`      | iOS app ID from Firebase Console (1:xxxx:ios:xxxx)         |
| `FIREBASE_ANDROID_APP_ID`  | Android app ID from Firebase Console (1:xxxx:android:xxxx) |

---

## Best Practices

### 1. Initialize Early

Initialize Crashlytics before anything else to catch startup crashes:

```typescript
// main.ts - FIRST thing
const crashlytics = new CrashlyticsService();
await crashlytics.initialize({ enabled: true });

// Then bootstrap Angular
bootstrapApplication(AppComponent, appConfig);
```

### 2. Respect User Privacy

```typescript
// Allow users to opt out
async setAnalyticsConsent(granted: boolean) {
  await this.crashlytics.setEnabled(granted);

  // Store preference
  await this.preferences.set('crashlytics_enabled', granted);
}
```

### 3. Use Standard Keys

Always use `CRASH_KEYS` constants for consistency:

```typescript
import { CRASH_KEYS } from '@nxt1/core/crashlytics';

// ✅ Good
await this.crashlytics.setCustomKey(CRASH_KEYS.USER_ROLE, 'athlete');

// ❌ Avoid - inconsistent naming
await this.crashlytics.setCustomKey('userRole', 'athlete');
```

### 4. Don't Over-Log

```typescript
// ✅ Good - meaningful breadcrumbs
await this.crashlytics.addBreadcrumb({
  type: 'ui',
  message: 'User submitted registration form',
  data: { step: 3, sport: 'football' },
});

// ❌ Avoid - too granular
await this.crashlytics.log('Input changed');
await this.crashlytics.log('Form valid');
await this.crashlytics.log('Button enabled');
```

### 5. Correlate with Analytics

Set the same user ID for both Analytics and Crashlytics:

```typescript
async onUserAuthenticated(user: User) {
  // Same user ID for both services
  await this.analytics.setUserId(user.uid);
  await this.crashlytics.setUserId(user.uid);
}
```

---

## Troubleshooting

### Crashes Not Appearing in Firebase Console

1. **Wait 5-10 minutes** - Crashes are batched and sent on next app launch
2. **Check enabled status**: `await crashlytics.isEnabled()`
3. **Force send reports**: `await crashlytics.sendUnsentReports()`
4. **Check debug logs**: Enable `debug: true` in config

### Missing Stack Traces (iOS)

1. Ensure dSYMs are uploaded (check Firebase Console → Crashlytics → Missing
   dSYMs)
2. Verify build settings: Debug Information Format = `DWARF with dSYM File`
3. Check Xcode build phase script is present

### Missing Stack Traces (Android)

1. Check ProGuard/R8 mapping file is uploaded
2. Verify `firebaseCrashlytics.nativeSymbolUploadEnabled = true` in build.gradle
3. For NDK crashes, ensure native symbol upload is configured

### Web Errors Not Tracking

1. Verify Firebase Analytics is initialized
2. Check browser console for GA4 events
3. Look in GA4 → Events → exception

### Testing Crashes in Development

```typescript
// Test that crashes are being recorded
async testCrashlytics() {
  // Check if ready
  console.log('Ready:', this.crashlytics.isReady());

  // Check if enabled
  console.log('Enabled:', await this.crashlytics.isEnabled());

  // Test breadcrumb
  await this.crashlytics.log('Test breadcrumb');

  // Test non-fatal
  await this.crashlytics.recordException({
    message: 'Test exception',
    severity: 'warning',
  });

  // Force send
  await this.crashlytics.sendUnsentReports();

  console.log('✅ Crashlytics test complete');
}
```

---

## Related Documentation

- [Firebase Crashlytics Docs](https://firebase.google.com/docs/crashlytics)
- [@capacitor-firebase/crashlytics](https://github.com/capawesome-team/capacitor-firebase/tree/main/packages/crashlytics)
- [Google Analytics 4 Exception Events](https://developers.google.com/analytics/devguides/collection/ga4/exceptions)
- [NXT1 Architecture Guide](./ARCHITECTURE.md)
- [NXT1 Logging Guide](./LOGGING.md)
