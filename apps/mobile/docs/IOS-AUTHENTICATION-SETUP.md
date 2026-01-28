# iOS Authentication Setup Guide

Complete guide to set up and run the NXT1 mobile app with Google, Apple, and
Microsoft authentication on iOS.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Firebase Setup](#firebase-setup)
- [Azure AD Setup (Microsoft)](#azure-ad-setup-microsoft)
- [iOS Project Configuration](#ios-project-configuration)
- [Building and Running](#building-and-running)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js**: v22 or higher
- **npm**: v11.7.0 or higher
- **Xcode**: Latest version (15.0+)
- **CocoaPods**: Latest version
  ```bash
  sudo gem install cocoapods
  ```
- **Capacitor CLI**: v8.0.0
  ```bash
  npm install -g @capacitor/cli
  ```

### Required Accounts

- **Firebase Project**: https://console.firebase.google.com
- **Azure AD (Microsoft)**: https://portal.azure.com (for Microsoft Sign-In)
- **Apple Developer Account**: https://developer.apple.com

---

## Firebase Setup

### 1. Create Firebase iOS App

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (or create new one)
3. Click **"Add app"** → **iOS**
4. Enter iOS Bundle ID: `com.nxt1.sports`
5. Download `GoogleService-Info.plist`
6. Place file in: `apps/mobile/ios/App/App/GoogleService-Info.plist`

### 2. Enable Authentication Methods

Navigate to **Authentication** → **Sign-in method**:

#### Google Sign-In

1. Click **Google** → **Enable**
2. Enter support email
3. Click **Save**

#### Apple Sign-In

1. Click **Apple** → **Enable**
2. Click **Save**

#### Microsoft Sign-In

1. Click **Microsoft** → **Enable**
2. Enter these details:
   - **Application (client) ID**: `aaceb7d3-bc1d-4c44-a871-cb96826558de`
   - **Application (client) secret**: `XYq8Q~Wo1kzV7C1dTM4gLROVmLolVnamYyuL1dAB`
3. Click **Save**

### 3. Configure OAuth Redirect URIs

In Firebase Console → **Authentication** → **Settings** → **Authorized
domains**:

- Add your domains (if needed)

---

## Azure AD Setup (Microsoft)

### 1. Create Azure AD App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Enter:
   - **Name**: NXT1 Sports
   - **Supported account types**: Accounts in any organizational directory and
     personal Microsoft accounts
5. Click **Register**

### 2. Configure App Settings

#### Application ID

- Copy **Application (client) ID**: `aaceb7d3-bc1d-4c44-a871-cb96826558de`

#### Client Secret

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Copy secret value: `XYq8Q~Wo1kzV7C1dTM4gLROVmLolVnamYyuL1dAB`

#### Redirect URIs

1. Go to **Authentication**
2. Click **Add a platform** → **Web**
3. Add redirect URI from Firebase Console (found in Microsoft provider settings)
4. Example: `https://nxt1-sports.firebaseapp.com/__/auth/handler`

#### API Permissions

1. Go to **API permissions**
2. Add these permissions:
   - `User.Read` (Microsoft Graph)
   - `Mail.Read` (Microsoft Graph)
   - `Mail.Send` (Microsoft Graph)
   - `email` (OpenID)
   - `profile` (OpenID)
   - `openid` (OpenID)
3. Click **Grant admin consent**

---

## iOS Project Configuration

### 1. Install Dependencies

```bash
cd apps/mobile
npm install
```

### 2. Configure Capacitor

File: `apps/mobile/capacitor.config.json`

```json
{
  "appId": "com.nxt1.sports",
  "appName": "NXT1 Sports",
  "plugins": {
    "FirebaseAuthentication": {
      "skipNativeAuth": false,
      "providers": ["apple.com", "google.com", "microsoft.com"]
    }
  }
}
```

### 3. Add GoogleService-Info.plist

1. Download `GoogleService-Info.plist` from Firebase Console
2. Place in: `apps/mobile/ios/App/App/GoogleService-Info.plist`

### 4. Configure Info.plist

File: `apps/mobile/ios/App/App/Info.plist`

#### Add URL Schemes

```xml
<key>CFBundleURLTypes</key>
<array>
  <!-- Google Sign-In -->
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.455734259010-d04kqk9g2kkfov38t0lrdqcrlujtrsom</string>
    </array>
  </dict>

  <!-- Apple Sign-In -->
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.nxt1.sports</string>
    </array>
  </dict>
</array>
```

> **Note**: The `REVERSED_CLIENT_ID` value
> (`com.googleusercontent.apps.455734259010-d04kqk9g2kkfov38t0lrdqcrlujtrsom`)
> is found in your `GoogleService-Info.plist` file.

### 5. Configure Podfile

File: `apps/mobile/ios/App/Podfile`

```ruby
target 'App' do
  capacitor_pods
  # Add your Pods here
  pod 'CapacitorFirebaseAuthentication/Google', :path => '../../node_modules/@capacitor-firebase/authentication'
end

post_install do |installer|
  assertDeploymentTarget(installer)

  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'

      # Disable code signing for bundles (required for Google Sign-In)
      if target.respond_to?(:product_type) and target.product_type == "com.apple.product-type.bundle"
        config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
      end
    end
  end
end
```

### 6. Install Pods

```bash
cd ios/App
pod install
```

If you encounter dependency conflicts:

```bash
cd ios/App
rm -rf Pods Podfile.lock
pod install --repo-update
```

### 7. Enable Sign in with Apple

1. Open Xcode project: `apps/mobile/ios/App/App.xcworkspace`
2. Select **App** target
3. Go to **Signing & Capabilities**
4. Click **+ Capability** → **Sign in with Apple**

---

## Building and Running

### Method 1: Command Line

```bash
# From project root
cd apps/mobile

# Build web assets
npm run build

# Sync with iOS
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### Method 2: NPM Script

```bash
# From project root
npm run mobile:ios
```

### Method 3: Xcode

1. Open `apps/mobile/ios/App/App.xcworkspace` in Xcode
2. Select your development team in **Signing & Capabilities**
3. Select a device or simulator
4. Click **Run** (⌘R)

---

## Authentication Flow

### Supported Providers

1. **Google Sign-In**
   - Uses `@capacitor-firebase/authentication` plugin
   - Native iOS Google Sign-In experience
   - Properly shows Google icon in Firebase Console

2. **Apple Sign-In**
   - Uses `@capacitor-community/apple-sign-in` plugin
   - Native iOS Apple Sign-In sheet
   - SHA-256 nonce hashing for security
   - Properly shows Apple icon in Firebase Console

3. **Microsoft Sign-In**
   - Uses `@capacitor-firebase/authentication` plugin
   - Native browser OAuth flow
   - Properly shows Microsoft icon in Firebase Console
   - Supports Mail.Send and Mail.Read scopes

## Troubleshooting

### Common Issues

#### 1. "No Firebase user found after sign-in"

**Cause**: `GoogleService-Info.plist` not properly configured

**Solution**:

- Ensure `GoogleService-Info.plist` is in `apps/mobile/ios/App/App/`
- Verify Bundle ID matches: `com.nxt1.sports`
- Clean build: Product → Clean Build Folder (Shift+⌘K)

#### 2. Pod install fails with version conflicts

**Cause**: Outdated Podfile.lock

**Solution**:

```bash
cd apps/mobile/ios/App
rm -rf Pods Podfile.lock
pod install --repo-update
```

#### 3. Google Sign-In shows error "Invalid client ID"

**Cause**: Missing or incorrect URL scheme in Info.plist

**Solution**:

- Open `GoogleService-Info.plist`
- Copy the `REVERSED_CLIENT_ID` value
- Add to Info.plist URL schemes (see step 4 above)

#### 4. Apple Sign-In not available

**Cause**: Missing "Sign in with Apple" capability

**Solution**:

1. Open Xcode
2. Select App target
3. Go to Signing & Capabilities
4. Add "Sign in with Apple" capability

#### 5. Microsoft Sign-In fails

**Cause**: Incorrect Azure AD configuration

**Solution**:

- Verify Application ID and Secret in Firebase Console
- Check redirect URIs in Azure AD match Firebase
- Ensure API permissions are granted

#### 6. "Code signing for bundles" error

**Cause**: Google Sign-In bundle not code signed

**Solution**:

- Verify Podfile has the code signing fix in `post_install` (see step 5 above)
- Run `pod install` again

#### 7. Navigation doesn't work after sign-in

**Cause**: `onboardingCompleted` status not properly synced

**Solution**:

- Check Safari Web Inspector console for logs
- Look for `[AuthFlowService] Navigation check:` logs
- Verify backend returns `onboardingCompleted` field

### Debug Logs

Enable detailed logging by checking Safari Web Inspector:

1. Connect iPhone to Mac
2. Open Safari → Develop → [Your iPhone] → [App]
3. Look for logs starting with:
   - `[AuthFlowService]` - Authentication flow
   - `[FirebaseAuthService]` - Firebase operations
   - `[NativeAuthService]` - Native plugin calls

### Useful Commands

```bash
# Clean iOS build
cd apps/mobile/ios/App
xcodebuild clean

# Update pods
cd apps/mobile/ios/App
pod update

# Rebuild everything
cd apps/mobile
rm -rf node_modules package-lock.json
npm install
npm run build
npx cap sync ios

# Check Capacitor config
npx cap doctor
```

---

## Architecture Overview

### Plugin Stack

```
┌─────────────────────────────────────────────┐
│     @capacitor-firebase/authentication      │
│   (Google, Microsoft - Native Firebase)    │
├─────────────────────────────────────────────┤
│  @capacitor-community/apple-sign-in         │
│        (Apple - Native Sign-In)             │
├─────────────────────────────────────────────┤
│           Firebase Auth SDK                 │
│      (Unified Authentication)               │
├─────────────────────────────────────────────┤
│         NXT1 Auth Services                  │
│  (Business Logic & State Management)        │
└─────────────────────────────────────────────┘
```

### Key Files

- **Auth Flow**:
  `apps/mobile/src/app/features/auth/services/auth-flow.service.ts`
- **Firebase Auth**:
  `apps/mobile/src/app/features/auth/services/firebase-auth.service.ts`
- **Native Auth**:
  `apps/mobile/src/app/features/auth/services/native-auth.service.ts`
- **Capacitor Config**: `apps/mobile/capacitor.config.json`
- **iOS Config**: `apps/mobile/ios/App/App/Info.plist`
- **Pods**: `apps/mobile/ios/App/Podfile`

---

## Additional Resources

- [Capacitor Firebase Authentication Docs](https://github.com/capawesome-team/capacitor-firebase/tree/main/packages/authentication)
- [Firebase iOS Setup](https://firebase.google.com/docs/ios/setup)
- [Apple Sign In Setup](https://developer.apple.com/documentation/sign_in_with_apple)
- [Microsoft Identity Platform](https://docs.microsoft.com/en-us/azure/active-directory/develop/)

---

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review Safari Web Inspector console logs
3. Check Firebase Console for authentication events
4. Verify Azure AD app registration settings

---

**Last Updated**: January 29, 2026
