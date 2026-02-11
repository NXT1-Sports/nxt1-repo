# Priority 1 Tasks - Implementation Summary

**Date:** February 11, 2026  
**Status:** Code Complete - Ready for Manual Testing

---

## ✅ What's Been Done (Automated)

### 1. Firebase Analytics Setup ✅

- ✅ **Installed** `@capacitor-firebase/analytics@8.0.1`
- ✅ **Synced** Capacitor plugins to iOS and Android
- ✅ **Verified** share event tracking code is implemented
- ✅ **Verified** Firebase configs are present (staging environment)

**Files created:**

- [apps/mobile/FIREBASE-ANALYTICS-TEST.md](../apps/mobile/FIREBASE-ANALYTICS-TEST.md) -
  Complete testing guide

**Share tracking works in:**

- [apps/web/src/app/core/services/share.service.ts](../apps/web/src/app/core/services/share.service.ts)
- [apps/mobile/src/app/core/services/share.service.ts](../apps/mobile/src/app/core/services/share.service.ts)

### 2. Deep Linking Configuration ✅

- ✅ **Confirmed** production domain: `nxt1sports.com`
- ✅ **Verified** iOS entitlements configured
- ✅ **Verified** Android manifest configured
- ✅ **Verified** deep link service implemented
- ✅ **Verified** .well-known files exist

**Files created:**

- [apps/mobile/DEEP-LINKING-CHECKLIST.md](../apps/mobile/DEEP-LINKING-CHECKLIST.md) -
  Complete configuration guide

**Deep linking ready:**

- Service:
  [apps/mobile/src/app/core/services/deep-link.service.ts](../apps/mobile/src/app/core/services/deep-link.service.ts)
- iOS entitlements:
  [ios/App/App/App.entitlements](../apps/mobile/ios/App/App/App.entitlements)
- Android manifest:
  [android/app/src/main/AndroidManifest.xml](../apps/mobile/android/app/src/main/AndroidManifest.xml)
- AASA file:
  [apps/web/src/.well-known/apple-app-site-association](../apps/web/src/.well-known/apple-app-site-association)
- Asset Links:
  [apps/web/src/.well-known/assetlinks.json](../apps/web/src/.well-known/assetlinks.json)

---

## ⚠️ Configuration Issues Found

### iOS Bundle ID Mismatch

Multiple Bundle IDs detected:

- **Xcode project:** `com.nxt1sports.nxt1` (current)
- **Fastlane configs:** `com.nxt1.sports` (old)
- **GoogleService-Info.plist:** `com.nxt1.sports` (staging)

**Impact:** Needs resolution before production deployment.

**Recommendation:** Standardize on `com.nxt1sports.nxt1` everywhere.

### Firebase Configs Using Staging

Current configs point to staging project:

- Project: `nxt-1-staging`
- Need to switch to: `nxt-1-de054` (production)

---

## 📋 What You Need to Do (Manual)

### Phase 1: Test Analytics (This Week)

**Time estimate:** 30 minutes

1. **Build and install app on real devices**

   ```bash
   cd apps/mobile
   npm run build:staging
   npm run ios:staging    # For iOS
   npm run android:staging # For Android
   ```

2. **Test share functionality**
   - Open app on device
   - Navigate to a post/profile
   - Tap share button
   - Complete the share

3. **Verify in Firebase Console**
   - Go to: https://console.firebase.google.com/
   - Project: **nxt-1-staging**
   - Analytics → Events → look for `share` event
   - Wait 1-2 minutes for events to appear

**Note:** iOS Simulator does NOT support Firebase Analytics - must use real
device.

**Reference:**
[FIREBASE-ANALYTICS-TEST.md](../apps/mobile/FIREBASE-ANALYTICS-TEST.md)

### Phase 2: Configure Deep Links (This Week)

**Time estimate:** 1-2 hours

#### iOS Configuration

1. **Apple Developer Portal**
   - Go to: https://developer.apple.com/account/resources/identifiers/list
   - Find App ID: `com.nxt1sports.nxt1`
   - Enable "Associated Domains" capability
   - Save

2. **Resolve Bundle ID Issues**
   - Decision: Keep `com.nxt1sports.nxt1` or change to `com.nxt1.sports`?
   - Update all configs to match
   - Update Fastlane configs if needed

3. **Production Firebase Config**
   - Download `GoogleService-Info.plist` from production project
   - Project: `nxt-1-de054`
   - Save to: `apps/mobile/firebase-configs/production/ios/`

#### Android Configuration

1. **Get Production SHA-256 Fingerprint**
   - Option A: From Play Console
     - https://play.google.com/console
     - Release → Setup → App integrity
     - Copy SHA-256 certificate fingerprint
   - Option B: From keystore
     ```bash
     keytool -list -v -keystore your-release-key.keystore
     ```

2. **Update assetlinks.json**
   - Edit:
     [apps/web/src/.well-known/assetlinks.json](../apps/web/src/.well-known/assetlinks.json)
   - Replace SHA-256 fingerprint with production value
   - Keep package name: `com.nxt1sports.app.twa`

3. **Production Firebase Config**
   - Download `google-services.json` from production project
   - Project: `nxt-1-de054`
   - Save to: `apps/mobile/firebase-configs/production/android/`

#### Deploy & Test

1. **Deploy Web App**

   ```bash
   cd apps/web
   npm run build
   firebase deploy --only hosting
   ```

2. **Verify Files Accessible**

   ```bash
   curl -I https://nxt1sports.com/.well-known/apple-app-site-association
   curl https://nxt1sports.com/.well-known/assetlinks.json
   ```

   Must return:
   - HTTP/2 200
   - content-type: application/json

3. **Rebuild Apps for Production**

   ```bash
   cd apps/mobile
   npm run build
   npx cap sync
   ```

4. **Test on Devices**
   - iOS:
     ```bash
     xcrun simctl openurl booted "https://nxt1sports.com/profile/test123"
     ```
   - Android:
     ```bash
     adb shell am start -a android.intent.action.VIEW -d "https://nxt1sports.com/profile/test123"
     ```

**Reference:**
[DEEP-LINKING-CHECKLIST.md](../apps/mobile/DEEP-LINKING-CHECKLIST.md)

---

## 📊 Progress Tracker

| Task                        | Status    | Time Required | Blocker? |
| --------------------------- | --------- | ------------- | -------- |
| Install analytics package   | ✅ Done   | -             | No       |
| Sync Capacitor plugins      | ✅ Done   | -             | No       |
| Verify analytics code       | ✅ Done   | -             | No       |
| Verify deep link code       | ✅ Done   | -             | No       |
| Create test guides          | ✅ Done   | -             | No       |
| **Test analytics iOS**      | ⏳ Manual | 15 min        | **Yes**  |
| **Test analytics Android**  | ⏳ Manual | 15 min        | **Yes**  |
| Confirm production domain   | ✅ Done   | -             | No       |
| Verify iOS config           | ✅ Done   | -             | No       |
| Verify Android config       | ✅ Done   | -             | No       |
| **Enable iOS capability**   | ⏳ Manual | 5 min         | **Yes**  |
| **Get Android SHA-256**     | ⏳ Manual | 10 min        | **Yes**  |
| **Update assetlinks.json**  | ⏳ Manual | 2 min         | **Yes**  |
| **Deploy web app**          | ⏳ Manual | 10 min        | **Yes**  |
| **Test deep links iOS**     | ⏳ Manual | 15 min        | **Yes**  |
| **Test deep links Android** | ⏳ Manual | 15 min        | **Yes**  |

**Total manual time:** ~1.5 - 2 hours

---

## 🎯 Quick Start Commands

### For Analytics Testing (Right Now)

```bash
cd apps/mobile

# iOS
npm run build:staging
npm run ios:staging

# Android
npm run build:staging
npm run android:staging
```

### For Deep Linking (After Portal Setup)

```bash
# Update configs first, then:
cd apps/web
npm run build
firebase deploy --only hosting

cd ../mobile
npm run build
npx cap sync ios
npx cap sync android
```

---

## 🚨 Critical Path

To complete Priority 1 this week, you must:

1. **Today:** Test analytics on real devices (30 min)
2. **This week:** Enable iOS capability in Apple Developer Portal (5 min)
3. **This week:** Get production Android SHA-256 (10 min)
4. **This week:** Deploy web app (10 min)
5. **This week:** Test deep links on devices (30 min)

**Total time:** ~1.5 hours of manual work

---

## 📚 Reference Documents

| Document                                                                | Purpose                    |
| ----------------------------------------------------------------------- | -------------------------- |
| [SHARE-NEXT-STEPS.md](../todo/SHARE-NEXT-STEPS.md)                      | Updated task list          |
| [FIREBASE-ANALYTICS-TEST.md](../apps/mobile/FIREBASE-ANALYTICS-TEST.md) | Analytics testing guide    |
| [DEEP-LINKING-CHECKLIST.md](../apps/mobile/DEEP-LINKING-CHECKLIST.md)   | Deep linking configuration |
| [DEEP-LINKS-DEPLOYMENT.md](../todo/DEEP-LINKS-DEPLOYMENT.md)            | Original deployment guide  |

---

## ✅ Next Steps After Priority 1

From [SHARE-NEXT-STEPS.md](../todo/SHARE-NEXT-STEPS.md):

### Priority 2 (Next Sprint)

- Add NxtShareButtonComponent to remaining entry points
- Validate SSR meta tags for all shareable content types

### Optional / Future

- Add BigQuery export for share analytics
- Add A/B test for share CTA

---

## 🆘 Need Help?

### Common Issues

**"Analytics events not appearing"**

- Using iOS Simulator? (won't work - need real device)
- Wait 1-2 minutes for events to propagate
- Check device has internet connection

**"Deep links open in browser"**

- iOS: AASA file must be accessible with correct content-type
- Android: SHA-256 must match exactly
- Both: May take time after first install

**"Build errors"**

- Run `npm install` in apps/mobile
- Clear build: `npm run clean`
- Re-sync: `npx cap sync`

See troubleshooting sections in:

- [FIREBASE-ANALYTICS-TEST.md](../apps/mobile/FIREBASE-ANALYTICS-TEST.md#-troubleshooting)
- [DEEP-LINKING-CHECKLIST.md](../apps/mobile/DEEP-LINKING-CHECKLIST.md#-troubleshooting)
