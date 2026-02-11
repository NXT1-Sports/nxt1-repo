# Environment Configuration Guide

## 🎯 Environment Overview

| Environment    | Uses              | iOS Bundle ID         | Android Package       | Firebase Project |
| -------------- | ----------------- | --------------------- | --------------------- | ---------------- |
| **Local/Dev**  | Local development | `com.nxt1.sports`     | `com.nxt1.sports`     | `nxt-1-staging`  |
| **Staging**    | Testing           | `com.nxt1.sports`     | `com.nxt1.sports`     | `nxt-1-staging`  |
| **Production** | Live app          | `com.nxt1sports.nxt1` | `com.nxt1sports.nxt1` | `nxt-1-de054`    |

---

## 📱 Firebase Configuration Status

### Staging (nxt-1-staging)

**iOS App:**

- ✅ App ID: `1:455734259010:ios:0e3891c1c716f3dc5a6cdb`
- ✅ Bundle ID: `com.nxt1.sports`
- ✅ Config file: `firebase-configs/staging/ios/GoogleService-Info.plist`

**Android App:**

- ✅ App ID: `1:455734259010:android:05691dfdfb6bba955a6cdb`
- ✅ Package: `com.nxt1.sports`
- ✅ Config file: `firebase-configs/staging/android/google-services.json`
- ✅ SHA-256:
  `75:a0:b2:86:f2:ee:0f:9b:b1:52:e7:63:a7:2b:04:23:26:c5:6a:fc:20:45:ce:43:b1:11:2f:92:3c:ed:1c:7a`
- ✅ SHA-1 (debug):
  `ad:a7:89:35:bc:c6:b9:80:d9:d1:c0:5b:96:b2:e0:7f:93:29:9f:24`

### Production (nxt-1-de054)

**iOS App:**

- ✅ App ID: `1:574223545656:ios:59960b003ce26cd245bdcd`
- ✅ Bundle ID: `com.nxt1sports.nxt1`
- ✅ Team ID: `794G2RS4WQ`
- ✅ App Store ID: `6446410344`
- ⏳ Config file: Need to download `GoogleService-Info.plist`

**Android App:**

- ⏳ **NOT SETUP YET** - Need to create in Firebase Console
- Target Package: `com.nxt1sports.nxt1`
- ⏳ Need production SHA-256 fingerprint

---

## 🚀 Quick Start

### Switch to Staging (Default for Development)

```bash
cd apps/mobile

# Automatically switches configs and syncs
npm run env:staging

# Or manual
node scripts/switch-environment.js staging
npx cap sync
```

### Switch to Production

```bash
cd apps/mobile

# Automatically switches configs and syncs
npm run env:prod

# Or manual
node scripts/switch-environment.js production
npx cap sync
```

---

## 📋 Setup Checklist

### ✅ Already Done

- [x] Created `capacitor.config.staging.json`
- [x] Created `capacitor.config.prod.json`
- [x] Updated Android build.gradle with product flavors
- [x] Created environment switch script
- [x] Updated package.json with env scripts
- [x] Configured staging deep linking
- [x] iOS entitlements configured
- [x] Android manifest configured

### ⏳ TODO - Production Setup

#### 1. Create Android App in Firebase Production

1. Go to: https://console.firebase.google.com/
2. Select project: **nxt-1-de054**
3. Click ⚙️ → Project Settings
4. Under "Your apps", click "Add app" → Android
5. Enter package name: **`com.nxt1sports.nxt1`**
6. Download `google-services.json`
7. Save to:
   `apps/mobile/firebase-configs/production/android/google-services.json`

#### 2. Download iOS Production Config

1. Go to: https://console.firebase.google.com/
2. Select project: **nxt-1-de054**
3. Find iOS app: `com.nxt1sports.nxt1`
4. Click ⚙️ → Download `GoogleService-Info.plist`
5. Save to:
   `apps/mobile/firebase-configs/production/ios/GoogleService-Info.plist`

#### 3. Get Production Android SHA-256

**Option A: From Play Console (Recommended)**

```
1. Go to: https://play.google.com/console
2. Select your app
3. Release → Setup → App integrity
4. Copy SHA-256 certificate fingerprint
```

**Option B: From your keystore**

```bash
keytool -list -v -keystore /path/to/production-release.keystore
```

#### 4. Update Production Deep Linking

Edit
[apps/web/src/.well-known/assetlinks.json](../apps/web/src/.well-known/assetlinks.json):

```json
{
  "sha256_cert_fingerprints": ["YOUR_PRODUCTION_SHA256_HERE"]
}
```

#### 5. Enable iOS Associated Domains

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Find App ID: `com.nxt1sports.nxt1`
3. Edit → Capabilities
4. Enable "Associated Domains"
5. Save

---

## 🔨 Build Commands

### Development (uses Staging)

```bash
# iOS
npm run ios:dev

# Android
npm run android:dev
```

### Staging Testing

```bash
# iOS
npm run ios:staging

# Android
npm run android:staging
```

### Production Build

```bash
# iOS (opens Xcode for archiving)
npm run ios:prod

# Android (opens Android Studio)
npm run android:prod
```

---

## 🏗️ Android Build Variants

After switching environment, use these variants in Android Studio:

| Variant             | Environment | Use Case              |
| ------------------- | ----------- | --------------------- |
| `stagingDebug`      | Staging     | Local testing         |
| `stagingRelease`    | Staging     | Staging deployment    |
| `productionDebug`   | Production  | Production testing    |
| `productionRelease` | Production  | Production deployment |

**In Android Studio:**

1. Build → Select Build Variant
2. Choose variant
3. Build → Make Project

---

## 📱 iOS Build Schemes

### Current Bundle IDs in Xcode

The Xcode project currently uses: `com.nxt1sports.nxt1`

**To support both:**

1. Open: `apps/mobile/ios/App/App.xcodeproj`
2. Select target → Build Settings
3. Search: "Product Bundle Identifier"
4. For staging builds: manually change to `com.nxt1.sports`
5. For production: use `com.nxt1sports.nxt1`

**Or:**

- Always run `npm run env:staging` or `npm run env:prod` before building
- This copies the correct GoogleService-Info.plist

---

## 🔗 Deep Linking Configuration

### Staging Domain (Optional)

If using staging subdomain (e.g., `staging.nxt1sports.com`):

1. Create `apps/web/src/.well-known/apple-app-site-association.staging`
2. Update with staging Bundle ID: `com.nxt1.sports`
3. Deploy to staging subdomain

### Production Domain

- Domain: `nxt1sports.com`
- iOS: Uses `apple-app-site-association` (already configured)
- Android: Uses `assetlinks.json` (needs production SHA-256)

---

## 🧪 Testing

### Test Staging Environment

```bash
# Switch to staging
npm run env:staging

# Build and run
npm run ios:staging  # or android:staging

# Test Firebase Analytics
# Check Firebase Console: nxt-1-staging
```

### Test Production Environment

```bash
# Switch to production
npm run env:prod

# Build and run
npm run ios:prod  # or android:prod

# Test Firebase Analytics
# Check Firebase Console: nxt-1-de054
```

### Verify Current Environment

**Check Capacitor config:**

```bash
cat capacitor.config.json | grep appId
# Staging: "appId": "com.nxt1.sports"
# Production: "appId": "com.nxt1sports.nxt1"
```

**Check iOS Firebase config:**

```bash
cat ios/App/App/GoogleService-Info.plist | grep BUNDLE_ID -A 1
```

**Check Android Firebase config:**

```bash
cat android/app/google-services.json | grep package_name
```

---

## ⚠️ Important Notes

### Firebase Analytics

- Events are environment-specific
- Staging events go to `nxt-1-staging`
- Production events go to `nxt-1-de054`
- **Never test production with staging configs!**

### Deep Links

- Staging app won't handle production domain links (different Bundle/Package
  IDs)
- Production app should be deployed with production configs only
- Test staging deep links on staging app, production on production app

### Bundle ID / Package Name Changes

If you change Bundle ID or Package Name:

1. Update Capacitor config
2. Update Firebase configs
3. Update deep linking files
4. Rebuild from scratch (`npm run clean`)
5. Re-sync Capacitor (`npx cap sync`)

---

## 🐛 Troubleshooting

### "Firebase not initialized"

Check:

```bash
# Is the right config file copied?
ls -la ios/App/App/GoogleService-Info.plist
ls -la android/app/google-services.json

# Run environment switch
npm run env:staging  # or env:prod
```

### "Deep links not working"

1. Verify correct environment is active
2. Check Bundle ID/Package Name matches Firebase
3. For production: ensure production configs are deployed
4. iOS: Verify Associated Domains enabled in Apple Developer Portal
5. Android: Verify SHA-256 matches production keystore

### "Build errors after switching"

```bash
# Clean and rebuild
npm run clean
npm install
npm run env:staging  # or env:prod
npx cap sync
```

---

## 📚 File Structure

```
apps/mobile/
├── capacitor.config.json              (current - switches between envs)
├── capacitor.config.staging.json      (staging config)
├── capacitor.config.prod.json         (production config)
├── firebase-configs/
│   ├── staging/
│   │   ├── android/
│   │   │   └── google-services.json   ✅ Ready
│   │   └── ios/
│   │       └── GoogleService-Info.plist ✅ Ready
│   └── production/
│       ├── android/
│       │   └── google-services.json   ⏳ Need to create
│       └── ios/
│           └── GoogleService-Info.plist ⏳ Need to download
├── android/app/
│   └── google-services.json           (symlink - switches)
└── ios/App/App/
    └── GoogleService-Info.plist       (symlink - switches)
```

---

## ✅ Final Verification

Before deploying, verify:

- [ ] Staging environment tested with correct Firebase project
- [ ] Production Firebase configs downloaded
- [ ] Production Android app created in Firebase
- [ ] Production SHA-256 updated in assetlinks.json
- [ ] iOS Associated Domains enabled for production Bundle ID
- [ ] Deep linking tested on both staging and production
- [ ] Analytics events appearing in correct Firebase project

---

## 🆘 Need Help?

Check existing docs:

- [FIREBASE-ANALYTICS-TEST.md](FIREBASE-ANALYTICS-TEST.md) - Analytics testing
- [DEEP-LINKING-CHECKLIST.md](DEEP-LINKING-CHECKLIST.md) - Deep linking setup
- [DEEP-LINKS-DEPLOYMENT.md](../../todo/DEEP-LINKS-DEPLOYMENT.md) - Deployment
  guide
