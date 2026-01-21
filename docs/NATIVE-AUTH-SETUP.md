# Native Authentication Setup Guide

> **Complete setup guide for Google Sign-In and Apple Sign-In on iOS and
> Android.**

This guide covers the native platform configuration required for social
authentication using Capacitor Firebase Authentication.

## 📋 Table of Contents

1. [Overview](#overview)
2. [Firebase Console Setup](#firebase-console-setup)
3. [iOS Configuration](#ios-configuration)
4. [Android Configuration](#android-configuration)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The NXT1 mobile app uses `@capacitor-firebase/authentication` for native OAuth
sign-in. This provides:

- **Native UI**: System sign-in sheets instead of web popups
- **Better Security**: No web redirect attack surface
- **App Store Compliance**: Apple requires native Sign in with Apple for apps
  with social login
- **Better UX**: Faster, more familiar experience

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    User taps "Sign in with Google"              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────────┐     ┌─────────────────────────────────┐  │
│   │  Native Plugin  │────▶│  Google Sign-In SDK (iOS)       │  │
│   │  (Capacitor)    │     │  Google Play Services (Android) │  │
│   └────────┬────────┘     └──────────────┬──────────────────┘  │
│            │                             │                      │
│            │        OAuth ID Token       │                      │
│            ◀─────────────────────────────┘                      │
│            │                                                    │
│            ▼                                                    │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │  Firebase Auth SDK                                       │  │
│   │  signInWithCredential(credential)                        │  │
│   │                                                          │  │
│   │  → Creates/updates Firebase user                         │  │
│   │  → Returns UserCredential                                │  │
│   │  → Same ID token as web auth                             │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Firebase Console Setup

### 1. Enable Authentication Providers

1. Go to [Firebase Console](https://console.firebase.google.com) → Your Project
2. Navigate to **Authentication** → **Sign-in method**
3. Enable the following providers:

| Provider  | Status    | Notes                          |
| --------- | --------- | ------------------------------ |
| Google    | ✅ Enable | Auto-configured with Firebase  |
| Apple     | ✅ Enable | Requires Apple Developer setup |
| Microsoft | ✅ Enable | Requires Azure AD setup        |

### 2. Download Configuration Files

#### iOS: `GoogleService-Info.plist`

1. Go to **Project Settings** → **Your apps** → iOS app
2. Download `GoogleService-Info.plist`
3. Place in `apps/mobile/ios/App/App/GoogleService-Info.plist`

#### Android: `google-services.json`

1. Go to **Project Settings** → **Your apps** → Android app
2. Download `google-services.json`
3. Place in `apps/mobile/android/app/google-services.json`

---

## iOS Configuration

### 1. Apple Developer Portal Setup

#### Create App ID with Sign in with Apple

1. Go to [Apple Developer Portal](https://developer.apple.com) → **Certificates,
   Identifiers & Profiles**
2. Navigate to **Identifiers** → Your App ID (`com.nxt1.sports`)
3. Enable **Sign in with Apple** capability
4. Save changes

#### Create Service ID (for web fallback)

1. Create new **Services ID** (e.g., `com.nxt1.sports.auth`)
2. Enable **Sign in with Apple**
3. Configure domains:
   - **Domain**: `nxt1.app`
   - **Return URL**: `https://nxt1.app/__/auth/handler`

#### Create Key for Firebase

1. Go to **Keys** → Create new key
2. Enable **Sign in with Apple**
3. Download the `.p8` file
4. Note the **Key ID**

#### Configure Firebase

1. In Firebase Console → **Authentication** → **Sign-in method** → **Apple**
2. Enter:
   - **Services ID**: `com.nxt1.sports.auth`
   - **Apple Team ID**: Your team ID
   - **Key ID**: From step above
   - **Private Key**: Contents of `.p8` file

### 2. Xcode Configuration

Open `apps/mobile/ios/App/App.xcworkspace` in Xcode:

#### Add Capabilities

1. Select the **App** target
2. Go to **Signing & Capabilities**
3. Click **+ Capability**
4. Add **Sign in with Apple**

#### Configure URL Schemes

1. Go to **Info** tab
2. Expand **URL Types**
3. Add URL scheme for Google Sign-In:
   - **URL Schemes**: `com.googleusercontent.apps.YOUR_CLIENT_ID` (from
     `GoogleService-Info.plist`)
   - **Identifier**: `com.nxt1.sports`

#### Verify Info.plist

Ensure these entries exist in `ios/App/App/Info.plist`:

```xml
<!-- Google Sign-In URL Scheme -->
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.YOUR_CLIENT_ID</string>
    </array>
  </dict>
</array>

<!-- Google Sign-In Client ID -->
<key>GIDClientID</key>
<string>YOUR_CLIENT_ID.apps.googleusercontent.com</string>
```

### 3. Update AppDelegate

The Capacitor Firebase Authentication plugin handles this automatically. No
manual code required.

---

## Android Configuration

### 1. Google Sign-In Setup

#### Get SHA-1 Fingerprint

```bash
cd apps/mobile/android

# Debug keystore
./gradlew signingReport

# Or manually
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

#### Add SHA-1 to Firebase

1. Firebase Console → **Project Settings** → **Your apps** → Android
2. Click **Add fingerprint**
3. Add both debug and release SHA-1 fingerprints

### 2. Configure build.gradle

#### Project-level `build.gradle`

```gradle
// apps/mobile/android/build.gradle

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.google.gms:google-services:4.4.0'
    }
}
```

#### App-level `build.gradle`

```gradle
// apps/mobile/android/app/build.gradle

plugins {
    id 'com.android.application'
    id 'com.google.gms.google-services'
}

dependencies {
    // Firebase Auth (managed by Capacitor plugin)
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-auth'

    // Google Sign-In
    implementation 'com.google.android.gms:play-services-auth:20.7.0'
}
```

### 3. Verify google-services.json

Ensure `apps/mobile/android/app/google-services.json` contains:

- Correct `package_name`: `com.nxt1.sports`
- OAuth client IDs for web and Android

---

## Testing

### Local Development

```bash
# Build and sync
cd apps/mobile
npm run build
npx cap sync

# iOS (requires Mac with Xcode)
npx cap open ios
# Build and run on simulator or device

# Android
npx cap open android
# Build and run on emulator or device
```

### Testing Checklist

- [ ] Google Sign-In shows native system UI
- [ ] Apple Sign-In shows native sheet (iOS only)
- [ ] Successful sign-in creates Firebase user
- [ ] User appears in Firebase Console → Authentication → Users
- [ ] ID token is valid (check with backend API call)
- [ ] Sign-out clears native credentials
- [ ] Cancellation is handled gracefully (no error shown)

### Debug Logging

Enable verbose logging in development:

```typescript
// In app initialization
if (!environment.production) {
  FirebaseAuthentication.setLanguageCode('en');
}
```

---

## Troubleshooting

### Common Issues

#### "Sign-In cancelled" or popup closes immediately

**Cause**: Missing URL scheme configuration (iOS) or SHA-1 fingerprint (Android)

**Fix**:

- iOS: Verify URL scheme in Xcode matches `GoogleService-Info.plist`
- Android: Add correct SHA-1 to Firebase Console

#### "Configuration error" on Google Sign-In

**Cause**: Mismatched OAuth client IDs

**Fix**:

1. Re-download `GoogleService-Info.plist` / `google-services.json`
2. Ensure Firebase project matches app bundle ID

#### Apple Sign-In not appearing (iOS)

**Cause**: Missing capability in Xcode

**Fix**:

1. Add "Sign in with Apple" capability in Xcode
2. Ensure App ID has capability enabled in Apple Developer Portal

#### "Invalid credential" from Firebase

**Cause**: Token format mismatch or expired token

**Fix**:

1. Ensure `skipNativeAuth: false` in `capacitor.config.json`
2. Check that Firebase Auth is initialized before sign-in

#### Android: "Google Play Services not available"

**Cause**: Emulator without Play Services

**Fix**:

- Use emulator with Google Play (system image with "Google APIs")
- Or test on physical device

### Getting Help

1. Check
   [Capacitor Firebase Auth documentation](https://github.com/capawesome-team/capacitor-firebase/tree/main/packages/authentication)
2. Verify Firebase Console configuration matches native setup
3. Review iOS/Android build logs for detailed error messages

---

## Security Considerations

- **Never commit** `GoogleService-Info.plist` or `google-services.json` to
  public repos
- Use **environment-specific** Firebase projects (staging vs production)
- Enable **App Check** in Firebase for additional security
- Implement **certificate pinning** for production builds
