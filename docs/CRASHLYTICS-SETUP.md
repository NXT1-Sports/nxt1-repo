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

---

## Test Your Implementation (2026 Firebase Best Practices)

> **Reference**:
> [Firebase iOS Test Implementation](https://firebase.google.com/docs/crashlytics/ios/test-implementation)
> |
> [Firebase Android Test Implementation](https://firebase.google.com/docs/crashlytics/android/test-implementation)

### Using the Developer Settings Page

NXT1 includes a built-in Developer Settings page for testing Crashlytics:

```
Navigate to: /dev-settings
```

This page provides:

- ✅ Force test crash (fatal)
- ✅ Record non-fatal errors
- ✅ Throw JavaScript exceptions
- ✅ Set test user context
- ✅ Add custom keys and breadcrumbs
- ✅ Send/delete unsent reports
- ✅ Check Crashlytics status

### Step-by-Step Testing Process

#### 1. Build in Release Mode (CRITICAL)

Debug builds may intercept crashes before they reach Crashlytics.

```bash
# iOS
cd apps/mobile
npm run build:production  # Or build:staging for staging Firebase
npx cap sync ios
# Open Xcode: Select "Release" scheme, build to device

# Android
npm run build:production
npx cap sync android
# In Android Studio: Build → Generate Signed APK → Release
```

#### 2. Disconnect the Debugger (CRITICAL)

> ⚠️ **The Xcode/Android Studio debugger prevents crash reports from being
> sent.**

**For iOS:**

1. Build and run app via Xcode (Cmd+R)
2. Wait for app to launch on device
3. Click **Stop** (Cmd+.) to disconnect debugger
4. Open app from device home screen (not Xcode)

**For Android:**

1. Build and install APK via Android Studio
2. Stop the app in Android Studio
3. Open app from device app drawer

#### 3. Force a Test Crash

Navigate to `/dev-settings` in the app and tap **"Force Test Crash"**.

Or programmatically:

```typescript
import { CrashlyticsService } from './services/crashlytics.service';

async testCrash() {
  const crashlytics = inject(CrashlyticsService);

  // Add context before crash
  await crashlytics.log('Test crash triggered');
  await crashlytics.setCustomKey('test_crash', true);

  // Force fatal crash
  await crashlytics.crash();
}
```

#### 4. Reopen the App

After the crash, **open the app again** from the device home screen. This
triggers the crash report upload.

#### 5. Verify in Firebase Console

Wait 5-10 minutes, then check:

- **Staging**:
  https://console.firebase.google.com/project/nxt-1-staging/crashlytics
- **Production**:
  https://console.firebase.google.com/project/nxt-1-de054/crashlytics

### Enable Debug Logging

If crashes aren't appearing, enable debug logging:

**iOS (Xcode):**

1. Product → Scheme → Edit Scheme
2. Run → Arguments tab
3. Add `-FIRDebugEnabled` to Arguments Passed On Launch
4. Look for: `Completed report submission`

**Android (adb):**

```bash
# Enable debug logging
adb shell setprop log.tag.FirebaseCrashlytics DEBUG

# View logs
adb logcat -s FirebaseCrashlytics

# Look for: "Crashlytics report upload complete" or code 204

# Disable when done
adb shell setprop log.tag.FirebaseCrashlytics INFO
```

### Testing Non-Fatal Errors

Non-fatal errors are captured without crashing the app:

```typescript
// Record an error
await this.crashlytics.recordError(new Error('Test non-fatal error'));

// Record with more context
await this.crashlytics.recordException({
  message: 'Payment processing failed',
  code: 'PAYMENT_ERROR_001',
  category: 'payments',
  severity: 'error',
  stacktrace: error.stack,
});
```

### Staging vs Production Testing

Use the Firebase config switching scripts:

```bash
cd apps/mobile

# Switch to staging (development)
npm run config:staging

# Switch to production (App Store/Play Store)
npm run config:production
```

Each environment has its own Crashlytics dashboard:

- Staging crashes → `nxt-1-staging` project
- Production crashes → `nxt-1-de054` project

---

## Testing Crashes Checklist

- [ ] Firebase configured (`FirebaseApp.configure()` in AppDelegate)
- [ ] dSYM upload build phase added (iOS)
- [ ] Crashlytics Gradle plugin applied (Android)
- [ ] Build in **Release** mode
- [ ] Debugger **disconnected**
- [ ] Test crash triggered
- [ ] App reopened after crash
- [ ] Crash visible in Firebase Console (wait 5-10 min)
- [ ] Stack traces are symbolicated (not just addresses)

---

## Related Documentation

- [Firebase Crashlytics Docs](https://firebase.google.com/docs/crashlytics)
- [Firebase iOS Test Implementation](https://firebase.google.com/docs/crashlytics/ios/test-implementation)
- [Firebase Android Test Implementation](https://firebase.google.com/docs/crashlytics/android/test-implementation)
