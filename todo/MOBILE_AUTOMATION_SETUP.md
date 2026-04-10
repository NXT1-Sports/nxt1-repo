# Mobile Deployment Automation Pipeline (TODO)

## Overview

The current `.github/workflows/deploy-mobile.yml` is incorrect. It was ported
from an Expo/EAS project, but NXT1 is a modern **Ionic 8 + Capacitor**
application. We need to completely rewrite the GitHub Actions workflow to use
**Fastlane** for native iOS and Android builds, and set up cryptographic code
signing.

This document outlines the exact steps required to complete the mobile CI/CD
automation.

---

## 🛑 Phase 1: Accounts & Credentials (Manual Setup)

_Mobile automation cannot work without valid Apple and Google cryptographic
certificates._

### 1. iOS Setup (Requires a Mac)

You need to set up App Store Connect API keys and Fastlane Match for cloud-based
code signing.

- [x] **Create App Store Connect API Key** _(COMPLETED)_
  - Go to App Store Connect → Users and Access → Keys.
  - Generate a new key with the "App Manager" role.
  - Download the `.p8` file. You will need the **Issuer ID**, **Key ID**, and
    the **Key Content**.
- [ ] **Create a Private GitHub Repo for Certificates**
  - Create a completely private, empty repository (e.g.,
    `NXT1-Sports/nxt1-certificates`).
- [ ] **Initialize Fastlane Match**
  - On your local Mac, run:
    ```bash
    cd apps/mobile/ios/App
    fastlane match init
    ```
    (Point it to the private certificates repo URL).
  - Generate the certificates:
    ```bash
    fastlane match appstore
    ```
    (You will be prompted to create a Match PASSPHRASE. **DO NOT LOSE THIS**).

### 2. Android Setup

You need a keystore file to sign the APK/AAB and a Google Cloud Service Account
to upload to the Play Store.

- [ ] **Generate a Release Keystore**
  - Run locally:
    ```bash
    keytool -genkey -v -keystore nxt1-release.keystore -alias nxt1 -keyalg RSA -keysize 2048 -validity 10000
    ```
  - Base64 encode it for GitHub Actions:
    `base64 -i nxt1-release.keystore | pbcopy`
- [ ] **Create Google Play Service Account**
  - Go to Google Play Console → API Access → Link Google Cloud Project.
  - Create a Service Account with **Release Manager** permissions.
  - Generate and download the JSON key.

---

## 🔐 Phase 2: Add GitHub Secrets

Once Phase 1 is done, add the following secrets to the `NXT1-Sports/nxt1-repo`
GitHub repository (Settings → Secrets and variables → Actions):

### iOS Secrets

- [ ] `MATCH_GIT_URL`: The URL to your private certificates repo.
- [ ] `MATCH_PASSWORD`: The passphrase you created during `fastlane match`.
- [x] `APP_STORE_CONNECT_API_KEY_ID`: The Key ID from App Store Connect.
      (COMPLETED)
- [x] `APP_STORE_CONNECT_API_ISSUER_ID`: The Issuer ID from App Store Connect.
      (COMPLETED)
- [x] `APP_STORE_CONNECT_API_KEY_CONTENT`: The raw text content of the `.p8`
      file. (COMPLETED)

### Android Secrets

- [ ] `ANDROID_KEYSTORE_BASE64`: The base64 encoded string of your `.keystore`
      file.
- [ ] `ANDROID_KEYSTORE_PASSWORD`: The password you set when generating the
      keystore.
- [ ] `ANDROID_KEY_ALIAS`: The alias you used (e.g., `nxt1`).
- [ ] `ANDROID_KEY_PASSWORD`: The password for the specific key alias.
- [ ] `GOOGLE_PLAY_JSON_KEY`: The raw text content of your Google Cloud Service
      Account JSON file.

---

## 🛠 Phase 3: Rewrite GitHub Actions Workflow

Once the certificates and secrets are in place, we will rewrite
`.github/workflows/deploy-mobile.yml`.

- [ ] Delete the current `deploy-mobile.yml` (it uses `eas-cli` which is invalid
      for Capacitor).
- [ ] Create a new workflow that performs the following steps:
  1. Set up Node.js 22 and Ruby (for Fastlane).
  2. Run `npm ci` at the monorepo root.
  3. Run `npm run build` in `apps/mobile` to compile the Angular application.
  4. Run `npx cap sync ios` and `npx cap sync android` to inject the web assets
     into the native IDE folders.
  5. **For iOS:** Run `fastlane match` to download the certificates, then
     `fastlane build` to compile the `.ipa` via Xcode tools, and finally upload
     to TestFlight.
  6. **For Android:** Decode the keystore, run `./gradlew bundleRelease`, sign
     it, and upload to the Google Play Internal Track using the Service Account
     JSON.
- [ ] Add `fastlane/Fastfile` configurations to the `ios/App` and `android`
      directories to define the build lanes.

## Next Steps

Assign Phase 1 to the mobile lead. Once the certificates are generated and added
to GitHub Secrets, we can safely write the final
`.github/workflows/deploy-mobile.yml` pipeline!
