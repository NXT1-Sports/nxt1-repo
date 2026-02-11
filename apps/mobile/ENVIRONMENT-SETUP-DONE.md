# Environment Configuration - DONE ✅

## 🎉 What Was Accomplished

Successfully configured multi-environment setup for iOS and Android apps with
proper Firebase integration and deep linking support.

---

## 📦 Files Created/Modified

### Configuration Files

- ✅ `capacitor.config.json` (base - currently staging)
- ✅ `capacitor.config.staging.json` (staging environment)
- ✅ `capacitor.config.prod.json` (production environment)

### Scripts

- ✅ `scripts/switch-environment.js` (environment switcher)
- ✅ Updated `package.json` with env commands

### Android Configuration

- ✅ Updated `android/app/build.gradle` with product flavors
  - `stagingDebug` / `stagingRelease`
  - `productionDebug` / `productionRelease`

### Deep Linking Files

- ✅ `apps/web/src/.well-known/assetlinks.json` (production Android)
- ✅ `apps/web/src/.well-known/assetlinks.staging.json` (staging Android)
- ✅ `apps/web/src/.well-known/apple-app-site-association` (iOS - both envs)

### Documentation

- ✅ `ENVIRONMENT-CONFIG.md` (comprehensive guide)
- ✅ `PRODUCTION-SETUP-TODO.md` (production setup steps)
- ✅ `FIREBASE-ANALYTICS-TEST.md` (analytics testing)
- ✅ `DEEP-LINKING-CHECKLIST.md` (deep linking setup)

---

## 🏗️ Environment Structure

### Staging (Local + Development)

```
iOS Bundle ID:     com.nxt1.sports
Android Package:   com.nxt1.sports
Firebase Project:  nxt-1-staging (455734259010)
Firebase Configs:  ✅ Ready in firebase-configs/staging/
Status:            ✅ READY TO USE
```

### Production

```
iOS Bundle ID:     com.nxt1sports.nxt1
Android Package:   com.nxt1sports.nxt1
Firebase Project:  nxt-1-de054 (574223545656)
iOS Config:        ⏳ Need to download from Firebase
Android App:       ⏳ Need to create in Firebase
Status:            ⏳ SETUP REQUIRED
```

---

## 🔄 How to Switch Environments

### Method 1: NPM Scripts (Recommended)

```bash
cd apps/mobile

# Switch to staging
npm run env:staging

# Switch to production
npm run env:prod
```

### Method 2: Manual

```bash
cd apps/mobile

# Switch to staging
node scripts/switch-environment.js staging
npx cap sync

# Switch to production
node scripts/switch-environment.js production
npx cap sync
```

---

## 📱 Build Commands

### Development (Staging)

```bash
npm run ios:dev        # iOS development build
npm run android:dev    # Android development build
```

### Staging Testing

```bash
npm run ios:staging      # iOS staging build & run
npm run android:staging  # Android staging build & run
```

### Production

```bash
npm run ios:prod      # iOS production (opens Xcode)
npm run android:prod  # Android production (opens Android Studio)
```

---

## 🔗 Deep Linking Configuration

### Staging

- Bundle/Package: `com.nxt1.sports`
- SHA-256:
  `75:a0:b2:86:f2:ee:0f:9b:b1:52:e7:63:a7:2b:04:23:26:c5:6a:fc:20:45:ce:43:b1:11:2f:92:3c:ed:1c:7a`
- File: `assetlinks.staging.json`

### Production

- Bundle/Package: `com.nxt1sports.nxt1`
- SHA-256: Needs to be added (from Play Console)
- File: `assetlinks.json`
- iOS Team ID: `794G2RS4WQ`

---

## ✅ Verification

Current environment can be checked:

```bash
# Check Capacitor config
cat capacitor.config.json | grep appId

# Check iOS Firebase config
cat ios/App/App/GoogleService-Info.plist | grep BUNDLE_ID -A 1

# Check Android Firebase config
cat android/app/google-services.json | grep package_name
```

---

## ⏭️ Next Steps

### For Staging Testing (Ready Now)

1. ✅ Switch to staging: `npm run env:staging`
2. ✅ Build: `npm run ios:staging` or `npm run android:staging`
3. ✅ Test analytics and deep linking

### For Production (Requires Setup)

1. ⏳ Create Android app in Firebase production
2. ⏳ Download iOS production config
3. ⏳ Get production SHA-256 fingerprint
4. ⏳ Update assetlinks.json
5. ⏳ Enable iOS Associated Domains capability
6. Then: Build and test production

---

## 📚 Related Documentation

- [ENVIRONMENT-CONFIG.md](../apps/mobile/ENVIRONMENT-CONFIG.md) - Complete guide
- [PRODUCTION-SETUP-TODO.md](../apps/mobile/PRODUCTION-SETUP-TODO.md) -
  Production setup
- [SHARE-NEXT-STEPS.md](../todo/SHARE-NEXT-STEPS.md) - Updated task list

---

**Summary:** Environment configuration is complete and working for staging.
Production requires manual Firebase setup steps before use.
