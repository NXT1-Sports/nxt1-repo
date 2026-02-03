# Deep Links Deployment Checklist

> **Status:** Code complete, awaiting server deployment

All deep linking code is implemented and ready. Follow these steps to activate
Universal Links (iOS) and App Links (Android).

---

## 📋 Deployment Steps

### 1. Deploy Web App with Deep Link Files ✅ READY

The `.well-known` files are already included in the build:

```bash
# Deploy monorepo web app (includes .well-known files)
cd apps/web
npm run build
firebase deploy --only hosting
```

**What happens:**

- `apple-app-site-association` → served at
  `https://nxt1sports.com/.well-known/apple-app-site-association`
- `assetlinks.json` → served at
  `https://nxt1sports.com/.well-known/assetlinks.json`

**Files included:**

- ✅
  [apps/web/src/.well-known/apple-app-site-association](../apps/web/src/.well-known/apple-app-site-association)
- ✅
  [apps/web/src/.well-known/assetlinks.json](../apps/web/src/.well-known/assetlinks.json)

---

### 2. Verify Server Files Are Accessible

After deployment, test both URLs:

```bash
# Test iOS (no file extension, JSON content-type)
curl -v https://nxt1sports.com/.well-known/apple-app-site-association

# Test Android
curl https://nxt1sports.com/.well-known/assetlinks.json
```

**Expected results:**

- ✅ Status: `200 OK`
- ✅ Content-Type: `application/json` (critical for iOS)
- ✅ No redirects (must be direct HTTPS)
- ✅ Valid JSON content

---

### 3. Enable Associated Domains in Apple Developer Portal

1. Go to: https://developer.apple.com/account/resources/identifiers/list
2. Find App ID: `com.nxt1sports.nxt1`
3. Edit → Capabilities
4. Enable: **"Associated Domains"**
5. Save

---

### 4. Rebuild iOS App (After Enabling Capability)

```bash
cd apps/mobile
npx cap sync
npx cap open ios
```

In Xcode:

1. Product → Clean Build Folder (`Cmd+Shift+K`)
2. Product → Build (`Cmd+B`)
3. Archive and submit update to App Store

---

### 5. Rebuild Android App

```bash
cd apps/mobile
npx cap sync
npx cap open android
```

In Android Studio:

1. Build → Clean Project
2. Build → Rebuild Project
3. Generate signed APK/Bundle for Play Store

---

## 🧪 Testing Deep Links

### iOS Testing (Simulator/Device)

```bash
# Test with xcrun (device/simulator must be running)
xcrun simctl openurl booted "https://nxt1sports.com/profile/john123"

# Or send link via Messages/Notes and tap it
```

### Android Testing (Device/Emulator)

```bash
# Test with adb
adb shell am start -a android.intent.action.VIEW -d "https://nxt1sports.com/profile/john123"
```

### Expected Behavior

- ✅ App opens (doesn't go to Safari/Chrome)
- ✅ Navigates to correct screen (e.g., profile page)
- ✅ Check logs for: `"Deep link received"`

---

## 📦 What's Already Configured

| Component             | iOS                              | Android                     |
| --------------------- | -------------------------------- | --------------------------- |
| **Bundle/Package ID** | `com.nxt1sports.nxt1`            | `com.nxt1sports.app.twa`    |
| **Entitlements**      | ✅ Associated Domains            | ✅ App Links intent filters |
| **Deep Link Handler** | ✅ DeepLinkService               | ✅ DeepLinkService          |
| **URL Patterns**      | ✅ `/profile/*`, `/team/*`, etc. | ✅ Same patterns            |
| **Fallback Scheme**   | ✅ `nxt1://`                     | ✅ `nxt1://`                |

---

## 🔗 Supported Deep Link Patterns

All these patterns will open the app:

```
https://nxt1sports.com/profile/:userId
https://nxt1sports.com/athlete/:userId
https://nxt1sports.com/team/:teamId
https://nxt1sports.com/post/:postId
https://nxt1sports.com/rankings
https://nxt1sports.com/rankings/:sport/:year
https://nxt1sports.com/college/:collegeId
https://nxt1sports.com/settings
https://nxt1sports.com/explore
https://nxt1sports.com/home

# Custom scheme fallback
nxt1://profile/john123
```

---

## 🐛 Troubleshooting

### iOS: Links open in Safari instead of app

**Causes:**

1. `apple-app-site-association` not accessible at root domain
2. Wrong Content-Type header (must be `application/json`)
3. Associated Domains capability not enabled
4. HTTPS redirect issues
5. App not installed from App Store (TestFlight/Xcode direct install doesn't
   support Universal Links on first launch)

**Fix:**

```bash
# Verify file is correct
curl -I https://nxt1sports.com/.well-known/apple-app-site-association

# Should return:
# HTTP/2 200
# content-type: application/json
```

### Android: Links open in Chrome instead of app

**Causes:**

1. `assetlinks.json` not found or wrong format
2. SHA256 fingerprint doesn't match
3. `android:autoVerify="true"` missing in manifest
4. App not verified (can take hours after first install)

**Fix:**

```bash
# Check verification status
adb shell pm get-app-links com.nxt1sports.app.twa

# Force verification
adb shell pm verify-app-links --re-verify com.nxt1sports.app.twa
```

### Deep link received but app doesn't navigate

**Check logs:**

```bash
# iOS: Use Xcode console
# Android: Use Logcat with filter "DeepLinkService"
```

Look for:

- `"Deep link received"` — Handler triggered
- `"Navigating to deep link route"` — Route resolved
- `"No route found for deep link"` — Pattern not matched (add to route map)

---

## 📝 Code Changes Summary

All changes are complete. No code changes needed, just deployment:

1. ✅ iOS Bundle ID: `com.nxt1sports.nxt1` (matches App Store)
2. ✅ Android Package: `com.nxt1sports.app.twa` (matches Play Store)
3. ✅ Associated Domains entitlement added
4. ✅ Android App Links intent filters added
5. ✅ DeepLinkService created with route mapping
6. ✅ Service integrated in app.component.ts
7. ✅ Server files created (apple-app-site-association, assetlinks.json)
8. ✅ Build config updated to include .well-known directory

**These apps can update existing listings — no new app required.**

---

## 🎯 Next Actions (Priority Order)

1. [ ] Deploy web app with .well-known files
2. [ ] Verify both URLs are accessible (curl tests)
3. [ ] Enable Associated Domains in Apple Developer Portal
4. [ ] Rebuild + submit iOS app update
5. [ ] Rebuild + submit Android app update
6. [ ] Test deep links on real devices
7. [ ] Monitor logs for any issues

**Estimated time:** 30 minutes (excluding App Store/Play Store review)
