# Production Environment Setup TODO

## ⚠️ CRITICAL: Production Android App Not Setup

Firebase Production project (`nxt-1-de054`) does not have Android app configured
yet.

---

## 📋 Immediate Actions Required

### 1. Create Android App in Firebase Production (15 minutes)

**Steps:**

1. **Go to Firebase Console**
   - URL: https://console.firebase.google.com/
   - Select project: **nxt-1-de054**

2. **Add Android App**
   - Click ⚙️ (Settings) → Project Settings
   - Under "Your apps", scroll to "Add app"
   - Click Android icon

3. **Configure Android App**

   ```
   Android package name: com.nxt1sports.nxt1
   App nickname: NXT1 Android (Production)
   Debug signing certificate (optional): Leave blank for now
   ```

   - Click "Register app"

4. **Download google-services.json**
   - Click "Download google-services.json"
   - Save to:
     `apps/mobile/firebase-configs/production/android/google-services.json`

5. **Add SHA Fingerprints (After Play Store Setup)**
   - In Firebase Console → Project Settings → Your Apps → NXT1 Android
   - Click "Add fingerprint"
   - Add production SHA-256 (from Play Console or keystore)

---

### 2. Get Production SHA-256 Certificate (10 minutes)

You need production signing key's SHA-256 fingerprint for:

- Firebase Android app configuration
- Android App Links (deep linking)

**Option A: From Play Console (Recommended)**

1. Go to: https://play.google.com/console
2. Select your app (or create if not exists)
3. Navigate to: Release → Setup → App integrity
4. Find "App signing" section
5. Copy **SHA-256 certificate fingerprint**
6. Update in:
   - Firebase Console (Android app settings)
   - `apps/web/src/.well-known/assetlinks.json`

**Option B: From Your Release Keystore**

If you have the production keystore locally:

```bash
keytool -list -v -keystore /path/to/production-release.keystore -alias production
```

Look for:

```
Certificate fingerprints:
     SHA256: XX:XX:XX:XX:...
```

**Option C: From APK/AAB (If Already Signed)**

```bash
# Extract from APK
keytool -printcert -jarfile app-release.apk

# Or from AAB
bundletool dump fingerprints --bundle=app-release.aab
```

---

### 3. Download iOS Production Config (5 minutes)

The iOS app exists in Firebase, just need to download config:

1. Go to: https://console.firebase.google.com/
2. Select project: **nxt-1-de054**
3. Project Settings → Your Apps
4. Find iOS app: **NXT1** (`com.nxt1sports.nxt1`)
5. Click ⚙️ → Download `GoogleService-Info.plist`
6. Save to:
   `apps/mobile/firebase-configs/production/ios/GoogleService-Info.plist`

---

### 4. Update Deep Linking Files (2 minutes)

**After getting production SHA-256:**

Edit
[apps/web/src/.well-known/assetlinks.json](../apps/web/src/.well-known/assetlinks.json):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.nxt1sports.nxt1",
      "sha256_cert_fingerprints": ["YOUR_PRODUCTION_SHA256_HERE"]
    }
  }
]
```

**iOS already configured:** ✅ `apple-app-site-association` has correct Bundle
ID

---

### 5. Test Environment Switching (5 minutes)

```bash
cd apps/mobile

# Test staging
npm run env:staging
cat capacitor.config.json | grep appId
# Should show: "appId": "com.nxt1.sports"

# Test production
npm run env:prod
cat capacitor.config.json | grep appId
# Should show: "appId": "com.nxt1sports.nxt1"
```

---

## 🎯 Summary

| Task                               | Status  | Time   | Priority  |
| ---------------------------------- | ------- | ------ | --------- |
| **Create Android app in Firebase** | ⏳ TODO | 15 min | 🔴 HIGH   |
| **Get production SHA-256**         | ⏳ TODO | 10 min | 🔴 HIGH   |
| **Download iOS production config** | ⏳ TODO | 5 min  | 🟡 MEDIUM |
| **Update assetlinks.json**         | ⏳ TODO | 2 min  | 🔴 HIGH   |
| **Test environment switching**     | ⏳ TODO | 5 min  | 🟡 MEDIUM |
| Configure staging ✅               | ✅ DONE | -      | -         |
| Setup build variants ✅            | ✅ DONE | -      | -         |
| Create switch script ✅            | ✅ DONE | -      | -         |

**Total time:** ~35 minutes

---

## 📱 After Setup - How to Use

### Development (Staging)

```bash
cd apps/mobile

# Automatically uses staging configs
npm run ios:dev      # iOS development
npm run android:dev  # Android development
```

### Testing Staging

```bash
npm run ios:staging      # iOS staging build
npm run android:staging  # Android staging build
```

### Production Builds

```bash
# Switch to production environment first
npm run env:prod

# Then build
npm run build:prod

# Open native IDE for archiving/signing
npm run ios:prod      # Opens Xcode
npm run android:prod  # Opens Android Studio
```

---

## ⚠️ Important Reminders

### Before Production Deploy:

- [ ] Production Firebase configs downloaded and placed correctly
- [ ] Production SHA-256 added to Firebase and assetlinks.json
- [ ] iOS Associated Domains enabled for `com.nxt1sports.nxt1`
- [ ] Environment switched to production: `npm run env:prod`
- [ ] App built with production config
- [ ] Deep linking tested on production build
- [ ] Analytics verified in production Firebase project

### Testing Checklist:

- [ ] Staging: Analytics go to `nxt-1-staging`
- [ ] Production: Analytics go to `nxt-1-de054`
- [ ] Staging: Deep links use `com.nxt1.sports`
- [ ] Production: Deep links use `com.nxt1sports.nxt1`

---

## 🔗 Related Documents

- [ENVIRONMENT-CONFIG.md](ENVIRONMENT-CONFIG.md) - Full environment guide
- [FIREBASE-ANALYTICS-TEST.md](FIREBASE-ANALYTICS-TEST.md) - Analytics testing
- [DEEP-LINKING-CHECKLIST.md](DEEP-LINKING-CHECKLIST.md) - Deep linking setup
- [SHARE-NEXT-STEPS.md](../../todo/SHARE-NEXT-STEPS.md) - Priority 1 tasks

---

## 📞 Next Steps

1. **Today**: Create Android app in Firebase production (15 min)
2. **Today**: Get production SHA-256 fingerprint (10 min)
3. **This week**: Download iOS production config (5 min)
4. **This week**: Update deep linking files (2 min)
5. **This week**: Test production build (30 min)

**Then proceed with Priority 1 analytics and deep linking testing!**
