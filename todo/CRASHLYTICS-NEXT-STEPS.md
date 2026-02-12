# Crashlytics Testing - Next Steps

> **Status**: ✅ Setup Complete | ⚠️ Testing Required

All Crashlytics infrastructure is now in place following Firebase 2026 best
practices. This document outlines what was implemented and the steps to verify
everything works.

---

## ✅ What Was Completed

### 1. iOS Configuration

- ✅ Added `FirebaseApp.configure()` to AppDelegate.swift
- ✅ Added Firebase Crashlytics dSYM upload build phase
- ✅ Build phase runs `${PODS_ROOT}/FirebaseCrashlytics/run` automatically
- ✅ Configured to upload debug symbols for readable stack traces

### 2. Android Configuration

- ✅ Enabled `mappingFileUploadEnabled` for release builds
- ✅ Enabled `nativeSymbolUploadEnabled` for NDK crashes
- ✅ Disabled mapping uploads in debug builds (faster builds)

### 3. Multi-Environment Support

- ✅ Created `firebase-configs/` directory structure
- ✅ Staging configs backed up to `firebase-configs/staging/`
- ✅ Production config placeholders created
- ✅ Environment switch script: `scripts/switch-firebase-env.sh`
- ✅ New npm scripts: `config:staging`, `config:production`

### 4. Developer Testing Tools

- ✅ Created `/dev-settings` page with full Crashlytics test suite
- ✅ Force fatal crash button
- ✅ Record non-fatal errors
- ✅ Test user context, custom keys, breadcrumbs
- ✅ Status monitoring and report management

### 5. Documentation

- ✅ Updated `docs/CRASHLYTICS-SETUP.md` with test implementation guide
- ✅ Added Firebase 2026 best practices
- ✅ Included troubleshooting section

---

## ⚠️ Required: Download Production Firebase Configs

The production Firebase configs are placeholders and need to be replaced with
actual files from Firebase Console.

### Step 1: Download iOS Production Config

1. Go to
   [Firebase Console - Production Project](https://console.firebase.google.com/project/nxt-1-de054/settings/general)
2. Scroll to "Your apps" section
3. Find the iOS app with bundle ID: `com.nxt1.sports`
4. Click the ⚙️ gear icon → Download `GoogleService-Info.plist`
5. Save to:
   `apps/mobile/firebase-configs/production/ios/GoogleService-Info.plist`

### Step 2: Download Android Production Config

1. Same Firebase Console page:
   [Production Project](https://console.firebase.google.com/project/nxt-1-de054/settings/general)
2. Find the Android app with package name: `com.nxt1.sports`
3. Click the ⚙️ gear icon → Download `google-services.json`
4. Save to:
   `apps/mobile/firebase-configs/production/android/google-services.json`

### Step 3: Verify Config Structure

```bash
cd apps/mobile

# Should see these files:
ls -la firebase-configs/staging/ios/GoogleService-Info.plist
ls -la firebase-configs/staging/android/google-services.json
ls -la firebase-configs/production/ios/GoogleService-Info.plist
ls -la firebase-configs/production/android/google-services.json
```

---

## 🧪 Testing Crashlytics (Step-by-Step)

### Prerequisites

- [ ] Production Firebase configs downloaded (see above)
- [ ] Physical device or simulator available
- [ ] Firebase Console access

### Option A: Quick Test with Dev Settings Page

This is the easiest way to test Crashlytics.

```bash
cd apps/mobile

# 1. Switch to staging environment
npm run config:staging

# 2. Build the app
npm run build:dev

# 3. Sync native projects
npx cap sync

# 4. Open in Xcode or Android Studio
npx cap open ios      # For iOS
# OR
npx cap open android  # For Android
```

**In Xcode/Android Studio:**

1. **Build in Release mode** (not Debug!)
   - Xcode: Product → Scheme → Edit Scheme → Run → Release
   - Android Studio: Build → Select Build Variant → Release

2. **Run the app** (Cmd+R / Run button)

3. **Stop the debugger** (Cmd+. / Stop button)
   - ⚠️ CRITICAL: The debugger prevents crash reports from being sent!

4. **Open app from device home screen** (not from IDE)

5. **Navigate to** `/dev-settings`
   - You can manually type this in the app or add a temporary navigation button

6. **Tap "Force Test Crash"**
   - Confirm the alert
   - App will crash and close

7. **Reopen the app** from device home screen
   - This sends the crash report to Firebase

8. **Check Firebase Console** (wait 5-10 minutes)
   - Staging:
     https://console.firebase.google.com/project/nxt-1-staging/crashlytics
   - Look for your test crash

### Option B: Test Production Environment

```bash
# 1. Switch to production (ONLY after downloading production configs!)
npm run config:production

# 2. Build for production
npm run build

# 3. Follow same steps as Option A
npx cap sync
npx cap open ios  # or android
```

Check production dashboard:
https://console.firebase.google.com/project/nxt-1-de054/crashlytics

### Option C: Test Non-Fatal Errors

Non-fatal errors don't crash the app:

```bash
# Same setup as Option A/B

# In the app at /dev-settings:
1. Tap "Record Non-Fatal Error"
2. Tap "Throw JS Exception" (will be caught by global handler)
3. Add test user context
4. Add custom keys
5. Send unsent reports

# Check Firebase Console for non-fatal errors
```

---

## 🐛 Troubleshooting

### Crashes Not Appearing in Firebase Console

**Checklist:**

- [ ] Wait 5-10 minutes (crashes are batched)
- [ ] Built in **Release mode** (not Debug)
- [ ] Debugger was **disconnected** before crashing
- [ ] App was **reopened** after crash (to send report)
- [ ] Using correct Firebase environment (staging/production)
- [ ] GoogleService-Info.plist / google-services.json present in project

**Enable Debug Logging:**

**iOS:**

1. Xcode → Product → Scheme → Edit Scheme
2. Run → Arguments tab
3. Add `-FIRDebugEnabled` to Arguments Passed On Launch
4. Run app and look for: `Completed report submission`

**Android:**

```bash
# Enable debug logging
adb shell setprop log.tag.FirebaseCrashlytics DEBUG

# View logs
adb logcat -s FirebaseCrashlytics

# Look for: "Crashlytics report upload complete" or code 204
```

### Stack Traces Show Addresses (Not Readable)

**iOS:**

- Check Firebase Console → Crashlytics → Missing dSYMs
- Verify build phase script is running (check Xcode build logs)
- Ensure "Debug Information Format" = "DWARF with dSYM File"

**Android:**

- Verify `firebaseCrashlytics { mappingFileUploadEnabled true }` in build.gradle
- Check build logs for mapping file upload confirmation

---

## 📱 Dev Settings Page Features

Access at: `/dev-settings`

### Test Actions

- **Force Test Crash** - Fatal crash (app closes)
- **Record Non-Fatal Error** - Logs error without crashing
- **Throw JS Exception** - Tests global error handler

### Context & Logging

- **Set Test User** - Sets user ID for crash reports
- **Add Custom Keys** - Adds filterable metadata
- **Add Breadcrumb** - Logs navigation/user actions
- **Log Message** - Simple log message

### Report Management

- **Send Unsent Reports** - Forces upload of pending reports
- **Delete Unsent Reports** - Clears pending reports
- **Refresh Status** - Re-checks Crashlytics state

---

## 🔄 Environment Switching

### Manual Switch

```bash
cd apps/mobile

# Switch to staging
npm run config:staging

# Switch to production
npm run config:production
```

### Automatic Build Scripts

```bash
# Build with staging config
npm run build:staging

# Build with production config
npm run build:production
```

The script automatically:

1. Copies correct GoogleService-Info.plist / google-services.json
2. Runs `npx cap sync` to update native projects

---

## 📊 Firebase Dashboards

### Staging Environment

- **Project ID**: `nxt-1-staging`
- **Dashboard**:
  https://console.firebase.google.com/project/nxt-1-staging/crashlytics
- **Use for**: Development, QA testing, staging builds

### Production Environment

- **Project ID**: `nxt-1-de054`
- **Dashboard**:
  https://console.firebase.google.com/project/nxt-1-de054/crashlytics
- **Use for**: App Store, Play Store releases only

---

## ✅ Testing Checklist

Before considering Crashlytics "production ready":

### iOS

- [ ] Download production `GoogleService-Info.plist`
- [ ] Test crash in **staging** environment
- [ ] Verify crash appears in staging dashboard
- [ ] Verify stack trace is symbolicated (readable)
- [ ] Test non-fatal error recording
- [ ] Switch to **production** config
- [ ] Test crash in production environment
- [ ] Verify crash appears in production dashboard

### Android

- [ ] Download production `google-services.json`
- [ ] Test crash in **staging** environment
- [ ] Verify crash appears in staging dashboard
- [ ] Verify stack trace is deobfuscated
- [ ] Test non-fatal error recording
- [ ] Switch to **production** config
- [ ] Test crash in production environment
- [ ] Verify crash appears in production dashboard

---

## 📚 Related Documentation

- [CRASHLYTICS-SETUP.md](../../docs/CRASHLYTICS-SETUP.md) - Full setup guide
- [Firebase Crashlytics Docs](https://firebase.google.com/docs/crashlytics)
- [Firebase iOS Test Implementation](https://firebase.google.com/docs/crashlytics/ios/test-implementation)
- [Firebase Android Test Implementation](https://firebase.google.com/docs/crashlytics/android/test-implementation)

---

## 🎯 Quick Commands Reference

```bash
# Environment switching
npm run config:staging
npm run config:production

# Building
npm run build:staging      # Build with staging config
npm run build:production   # Build with production config

# Native project sync
npx cap sync

# Open native IDEs
npx cap open ios
npx cap open android

# Debug logging (Android)
adb shell setprop log.tag.FirebaseCrashlytics DEBUG
adb logcat -s FirebaseCrashlytics
```

---

**Next Action**: Download production Firebase configs, then run through the
testing checklist above.
