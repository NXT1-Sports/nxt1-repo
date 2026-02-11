# Share Next Steps

## ✅ Environment Configuration Complete

**Multi-environment setup implemented!**

| Environment       | iOS Bundle ID         | Android Package       | Firebase Project | Status            |
| ----------------- | --------------------- | --------------------- | ---------------- | ----------------- |
| **Staging/Local** | `com.nxt1.sports`     | `com.nxt1.sports`     | `nxt-1-staging`  | ✅ Ready          |
| **Production**    | `com.nxt1sports.nxt1` | `com.nxt1sports.nxt1` | `nxt-1-de054`    | ⏳ Setup required |

**Switch environments easily:**

```bash
npm run env:staging  # For development/testing
npm run env:prod     # For production builds
```

**Full guide:** [ENVIRONMENT-CONFIG.md](../apps/mobile/ENVIRONMENT-CONFIG.md) |
**Setup TODO:**
[PRODUCTION-SETUP-TODO.md](../apps/mobile/PRODUCTION-SETUP-TODO.md)

---

## Priority 1 (This Week)

### ✅ Completed

- [x] **Installed** `@capacitor-firebase/analytics@8.0.1` package
- [x] **Synced** Capacitor plugins (Android + iOS)
- [x] **Verified** Firebase Analytics configuration (staging)
- [x] **Confirmed** production domain: `nxt1sports.com`
- [x] **Verified** iOS entitlements have Associated Domains
- [x] **Verified** Android manifest has App Links intent filters
- [x] **Confirmed** deep link service implementation is ready
- [x] **Created multi-environment configuration** (staging/production)
- [x] **Setup Android product flavors** for different environments
- [x] **Created environment switch script** and npm commands

### 🔧 Environment Issues Resolved

**Bundle ID/Package Name standardized:**

- ✅ Staging: `com.nxt1.sports` (matches Firebase staging)
- ✅ Production: `com.nxt1sports.nxt1` (matches Firebase production)
- ✅ Android build.gradle updated with product flavors
- ✅ Capacitor configs created for each environment

**Remaining: Production Firebase Setup**

- ⏳ Create Android app in Firebase production
- ⏳ Download production configs
- ⏳ Get production SHA-256 fingerprint

**See details:**
[PRODUCTION-SETUP-TODO.md](../apps/mobile/PRODUCTION-SETUP-TODO.md)

### 📋 Manual Tasks Required

#### Task 1: Test Firebase Analytics Share Events

**See:**
[apps/mobile/FIREBASE-ANALYTICS-TEST.md](../apps/mobile/FIREBASE-ANALYTICS-TEST.md)

- [ ] Build iOS app for staging (`npm run ios:staging`)
- [ ] Test share on iOS device (real device required, not simulator)
- [ ] Verify `share` events in Firebase Console
- [ ] Build Android app for staging (`npm run android:staging`)
- [ ] Test share on Android device
- [ ] Verify `share` events in Firebase Console

#### Task 2: Deep Linking Setup

**See:**
[apps/mobile/DEEP-LINKING-CHECKLIST.md](../apps/mobile/DEEP-LINKING-CHECKLIST.md)

**iOS:**

- [ ] Verify Team ID is `794G2RS4WQ` in Apple Developer Portal
- [ ] Enable "Associated Domains" capability for `com.nxt1sports.nxt1`
- [ ] Resolve Bundle ID inconsistencies
- [ ] Download production `GoogleService-Info.plist` from Firebase

**Android:**

- [ ] Get production SHA-256 fingerprint from Play Console
- [ ] Update [assetlinks.json](../apps/web/src/.well-known/assetlinks.json) with
      production fingerprint
- [ ] Download production `google-services.json` from Firebase

**Deploy & Test:**

- [ ] Deploy web app with `.well-known` files to `nxt1sports.com`
- [ ] Verify AASA accessible:
      `https://nxt1sports.com/.well-known/apple-app-site-association`
- [ ] Verify Asset Links accessible:
      `https://nxt1sports.com/.well-known/assetlinks.json`
- [ ] Rebuild iOS app for production
- [ ] Rebuild Android app for production
- [ ] Test deep links on real devices

### 🚀 Quick Start

**For Analytics Testing:**

```bash
cd apps/mobile
npm run build:staging
npm run ios:staging  # or android:staging
```

**For Deep Linking:**

1. Follow [DEEP-LINKING-CHECKLIST.md](../apps/mobile/DEEP-LINKING-CHECKLIST.md)
2. Get production credentials from Apple/Google
3. Update configuration files
4. Deploy and test

## Priority 2 (Next Sprint)

- Add NxtShareButtonComponent to remaining share entry points (team, video,
  post, scout report, news).
- Validate SSR meta tags for all shareable content types using
  scripts/test-ssr.sh.

## Optional / Future

- Add BigQuery export and dashboards for share analytics.
- Add A/B test for share CTA.
