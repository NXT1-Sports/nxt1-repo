# Deep Linking Configuration Checklist

## ✅ Current Status

- Code implementation: **COMPLETE**
- Deep link service: **READY**
- Configuration files: **NEEDS VERIFICATION**

---

## ⚠️ Configuration Issues Found

### iOS Bundle ID Mismatch

Multiple Bundle IDs found in project:

| Location                     | Bundle ID             | Status           |
| ---------------------------- | --------------------- | ---------------- |
| Xcode project.pbxproj        | `com.nxt1sports.nxt1` | ⚠️ Primary       |
| Fastlane configs             | `com.nxt1.sports`     | ⚠️ Old           |
| apple-app-site-association   | `com.nxt1sports.nxt1` | ✅ Matches Xcode |
| App/GoogleService-Info.plist | `com.nxt1.sports`     | ⚠️ Mismatch      |

**Recommended action:** Standardize on **`com.nxt1sports.nxt1`**

### Android Package Name

| Location              | Package Name             | Status     |
| --------------------- | ------------------------ | ---------- |
| capacitor.config.json | `com.nxt1sports.app.twa` | ✅ Primary |
| assetlinks.json       | `com.nxt1sports.app.twa` | ✅ Match   |
| google-services.json  | `com.nxt1.sports`        | ⚠️ Staging |

---

## 📋 Task 1: Confirm Production Domain

### Current Configuration

- **Production Domain:** `nxt1sports.com`
- **Web URL:** `https://nxt1sports.com`
- **API URL:** `https://backend.nxt1sports.com`

### Files to Deploy

✅ Already created:

- [apps/web/src/.well-known/apple-app-site-association](../apps/web/src/.well-known/apple-app-site-association)
- [apps/web/src/.well-known/assetlinks.json](../apps/web/src/.well-known/assetlinks.json)

### Action Items

- [ ] Confirm domain is `nxt1sports.com` (not a subdomain)
- [ ] Confirm SSL certificate is valid
- [ ] Verify DNS is pointing correctly

---

## 📋 Task 2: iOS Configuration

### Current Setup

**From Xcode project:**

- Bundle ID: `com.nxt1sports.nxt1`
- Team ID: Needs verification

**From apple-app-site-association:**

- App ID: `794G2RS4WQ.com.nxt1sports.nxt1`
- Team ID: `794G2RS4WQ`

### Action Items

#### 2.1 Verify Team ID

```bash
# Check current Team ID in Xcode
cd apps/mobile
npx cap open ios
```

In Xcode:

1. Select project root "App"
2. Go to "Signing & Capabilities" tab
3. Note the **Team** dropdown value
4. Confirm Team ID is: **`794G2RS4WQ`**

#### 2.2 Enable Associated Domains

**In Apple Developer Portal:**

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Find App ID: `com.nxt1sports.nxt1`
3. Click "Edit"
4. Under "Capabilities", find **"Associated Domains"**
5. **Enable it** (check the box)
6. Click "Save"

#### 2.3 Update Xcode Entitlements

Open: `apps/mobile/ios/App/App/App.entitlements`

Verify this section exists:

```xml
<key>com.apple.developer.associated-domains</key>
<array>
    <string>applinks:nxt1sports.com</string>
    <string>applinks:*.nxt1sports.com</string>
</array>
```

#### 2.4 Fix GoogleService-Info.plist (if needed)

Current file at `apps/mobile/ios/App/App/GoogleService-Info.plist` has:

```xml
<key>BUNDLE_ID</key>
<string>com.nxt1.sports</string>
```

**Options:**

1. **Update to production config** with Bundle ID `com.nxt1sports.nxt1`
2. Or standardize all to `com.nxt1.sports`

**Recommended:** Use production Firebase project (`nxt-1-de054`) with correct
Bundle ID.

### Checklist

- [ ] Verify Team ID: `794G2RS4WQ`
- [ ] Confirm Bundle ID: `com.nxt1sports.nxt1`
- [ ] Enable Associated Domains in Apple Developer Portal
- [ ] Verify entitlements file has `applinks:nxt1sports.com`
- [ ] Update GoogleService-Info.plist to production config

---

## 📋 Task 3: Android Configuration

### Current Setup

**From capacitor.config.json:**

- Package Name: `com.nxt1sports.app.twa`

**From assetlinks.json:**

- Package Name: `com.nxt1sports.app.twa`
- SHA-256 Fingerprint:
  `5E:9B:2A:78:B8:53:DC:F7:73:D6:C7:22:E7:65:D5:23:34:2D:9F:FB:41:88:FD:34:8F:4E:0A:67:40:56:A9:85`

### Action Items

#### 3.1 Verify Package Name

```bash
# Check AndroidManifest.xml
cat apps/mobile/android/app/src/main/AndroidManifest.xml | grep package
```

Should show: `package="com.nxt1sports.app.twa"`

#### 3.2 Get Production SHA-256 Fingerprint

**For debug keystore (development):**

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**For release keystore (production):**

```bash
# Location of your production keystore
keytool -list -v -keystore /path/to/your-release-key.keystore
```

**From Google Play Console:**

1. Go to: https://play.google.com/console
2. Select your app
3. Go to: Release → Setup → App integrity
4. Under "App signing", find **SHA-256 certificate fingerprint**
5. Copy the fingerprint

#### 3.3 Update assetlinks.json

Edit:
[apps/web/src/.well-known/assetlinks.json](../apps/web/src/.well-known/assetlinks.json)

Ensure it contains the **production SHA-256 fingerprint**:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.nxt1sports.app.twa",
      "sha256_cert_fingerprints": ["PRODUCTION_SHA256_HERE"]
    }
  }
]
```

#### 3.4 Verify AndroidManifest.xml

Open: `apps/mobile/android/app/src/main/AndroidManifest.xml`

Verify intent filter exists:

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="nxt1sports.com" />
</intent-filter>
```

**Key:** `android:autoVerify="true"` is critical!

#### 3.5 Update google-services.json (if needed)

Current: Staging config (`nxt-1-staging`)

**For production:** Download from Firebase Console:

1. Go to: https://console.firebase.google.com/
2. Select project: **nxt-1-de054** (production)
3. Go to: Project Settings → Your Apps → Android app
4. Download `google-services.json`
5. Save to:
   `apps/mobile/firebase-configs/production/android/google-services.json`

### Checklist

- [ ] Verify package name: `com.nxt1sports.app.twa`
- [ ] Get production SHA-256 fingerprint
- [ ] Update assetlinks.json with production fingerprint
- [ ] Verify AndroidManifest.xml has `autoVerify="true"`
- [ ] Update google-services.json to production config

---

## 📋 Task 4: Deploy .well-known Files

### Prerequisites

- [ ] Files updated with correct IDs and fingerprints
- [ ] Web app built for production
- [ ] Firebase hosting configured

### Deploy

```bash
cd apps/web

# Build production
npm run build

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

### Verify Deployment

**iOS (AASA file):**

```bash
curl -I https://nxt1sports.com/.well-known/apple-app-site-association
```

Expected:

```
HTTP/2 200
content-type: application/json
```

**Android (Asset Links):**

```bash
curl https://nxt1sports.com/.well-known/assetlinks.json
```

Expected: Valid JSON with your package name and SHA-256.

### Important Requirements

- ✅ HTTPS only (no HTTP redirect loops)
- ✅ Status code: 200
- ✅ Content-Type: `application/json`
- ✅ No authentication required
- ✅ No redirects
- ✅ Files served from root domain (not subdomain)

### Checklist

- [ ] Built web app for production
- [ ] Deployed to Firebase Hosting
- [ ] Verified AASA file accessible
- [ ] Verified assetlinks.json accessible
- [ ] Confirmed Content-Type is `application/json`
- [ ] Confirmed no redirects (direct HTTPS)

---

## 📋 Task 5: Rebuild & Test Apps

### iOS

```bash
cd apps/mobile

# Build production
npm run build

# Sync
npx cap sync ios

# Open Xcode
npx cap open ios
```

**In Xcode:**

1. Product → Clean Build Folder (`Cmd+Shift+K`)
2. Select real iOS device (not simulator)
3. Product → Archive
4. Upload to App Store / TestFlight

**Test:**

- Install from TestFlight or App Store
- Send yourself a link: `https://nxt1sports.com/profile/test123`
- Tap link in Messages/Mail
- Should open app (not Safari)

### Android

```bash
cd apps/mobile

# Build production
npm run build

# Sync
npx cap sync android

# Open Android Studio
npx cap open android
```

**In Android Studio:**

1. Build → Clean Project
2. Build → Rebuild Project
3. Build → Generate Signed Bundle / APK
4. Upload to Play Console

**Test:**

- Install from Play Store
- Send yourself a link: `https://nxt1sports.com/profile/test123`
- Tap link in Messages/Chrome
- Should open app (not browser)

### Checklist

- [ ] iOS: Built and archived for production
- [ ] iOS: Uploaded to TestFlight/App Store
- [ ] iOS: Tested deep link on real device
- [ ] Android: Built signed APK/Bundle
- [ ] Android: Uploaded to Play Store
- [ ] Android: Tested deep link on real device

---

## 📋 Task 6: Wire App Link Routing

### Status: ✅ ALREADY COMPLETE

Deep link routing is implemented in:

- [apps/mobile/src/app/core/services/deep-link.service.ts](../apps/mobile/src/app/core/services/deep-link.service.ts)

Supported patterns:

- `/profile/:userId`
- `/athlete/:userId`
- `/team/:teamId`
- `/post/:postId`
- `/rankings`
- `/college/:collegeId`
- `/settings`
- `/explore`
- `/home`

### Verify Implementation

Check that deep link service is initialized in app.component.ts:

```typescript
afterNextRender(() => {
  this.deepLink.initialize();
});
```

### Test Routing

**iOS Simulator:**

```bash
xcrun simctl openurl booted "https://nxt1sports.com/profile/john123"
```

**Android Device:**

```bash
adb shell am start -a android.intent.action.VIEW -d "https://nxt1sports.com/profile/john123"
```

**Check Logs:**

- Look for: `"Deep link received"`
- Look for: `"Navigating to deep link route"`
- If no route found: `"No route found for deep link"`

### Checklist

- [ ] Verified deep link service is initialized
- [ ] Tested profile link routing
- [ ] Tested team link routing
- [ ] Tested other supported routes
- [ ] Logs show successful navigation

---

## 🎯 Summary: Completion Checklist

### Configuration ⚙️

- [ ] Confirmed production domain: `nxt1sports.com`
- [ ] Resolved iOS Bundle ID conflicts
- [ ] Obtained production Android SHA-256 fingerprint
- [ ] Updated .well-known files with production values

### iOS Setup 🍎

- [ ] Verified Team ID in Apple Developer Portal
- [ ] Enabled Associated Domains capability
- [ ] Updated iOS entitlements file
- [ ] Switched to production GoogleService-Info.plist

### Android Setup 🤖

- [ ] Verified package name
- [ ] Updated assetlinks.json with production fingerprint
- [ ] Verified AndroidManifest.xml has autoVerify
- [ ] Switched to production google-services.json

### Deployment 🚀

- [ ] Deployed web app with .well-known files
- [ ] Verified AASA accessible via HTTPS
- [ ] Verified assetlinks.json accessible via HTTPS
- [ ] Confirmed proper Content-Type headers

### Testing ✅

- [ ] Rebuilt iOS app for production
- [ ] Tested iOS deep links on real device
- [ ] Rebuilt Android app for production
- [ ] Tested Android deep links on real device
- [ ] Verified app routing works correctly

---

## 🐛 Troubleshooting

### iOS Links Still Open in Safari

1. Delete app from device completely
2. Verify AASA file is accessible (curl test)
3. Reinstall from TestFlight/App Store
4. iOS verifies AASA on first install only
5. May need to restart device

### Android Links Open in Browser

1. Check verification status:
   ```bash
   adb shell pm get-app-links com.nxt1sports.app.twa
   ```
2. Should show: `verified` (not `none`)
3. If not verified:
   - Check assetlinks.json accessible
   - Verify SHA-256 fingerprint matches
   - Reinstall app
   - Wait up to 24 hours for verification

### Deep Link Received but No Navigation

Check logs for errors:

- iOS: Xcode Console
- Android: Logcat

Common issues:

- Route pattern not matching (add to route map)
- Navigation guard blocking
- User not authenticated

---

## 📚 References

- [DEEP-LINKS-DEPLOYMENT.md](../../todo/DEEP-LINKS-DEPLOYMENT.md) - Full
  deployment guide
- [Deep Link Service](../apps/mobile/src/app/core/services/deep-link.service.ts) -
  Implementation
- [iOS Universal Links](https://developer.apple.com/ios/universal-links/)
- [Android App Links](https://developer.android.com/training/app-links)
