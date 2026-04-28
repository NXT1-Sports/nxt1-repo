# NXT1 Mobile OTA Update Guide (English)

**Last updated:** April 28, 2026 **Stack:** `@capgo/capacitor-updater@8.45.10`
(self-hosted, manual mode) + Cloudflare R2 + Firestore

---

## System Overview

NXT1 mobile uses **Over-the-Air (OTA) bundle updates** to ship JS/HTML/CSS
changes **without submitting to the App Store**. Key files:

| File                                                              | Role                                               |
| ----------------------------------------------------------------- | -------------------------------------------------- |
| `apps/mobile/src/app/core/services/native/live-update.service.ts` | Orchestrator: check, download, stage               |
| `apps/mobile/src/app/app.component.ts` (line 234)                 | Triggers `initialize()` on every cold start        |
| `backend/scripts/deploy-mobile-bundle.ts`                         | Build → zip → upload R2 → write Firestore manifest |
| Firestore `AppUpdates/ios_production`                             | Manifest: version, URL, SHA-256, rollout%          |
| Cloudflare R2 `nxt1-app-bundles-prod`                             | Bundle file storage                                |

---

## ✅ What CAN be deployed via OTA (no Xcode rebuild needed)

Any change inside `apps/mobile/src/` qualifies for OTA:

- **Logic bug fixes** — services, component logic, business logic
- **UI changes** — colors, layout, fonts, spacing, Tailwind classes
- **New Angular/Ionic features** — new screens, components, route changes
- **API calls** — add/modify endpoints, request/response handling
- **Text & copy** — labels, error messages, placeholders
- **Assets** — images, icons (if bundled into `www/browser/`)
- **Shared packages** (`@nxt1/core`, `@nxt1/ui`) — TypeScript/Angular library
  changes

**Simple rule:** If the output ends up as a file inside
`apps/mobile/www/browser/` → it can be OTA'd.

---

## ❌ What REQUIRES a full Xcode rebuild + App Store submission

| Change type                                                | Why                                                |
| ---------------------------------------------------------- | -------------------------------------------------- |
| Add/remove a Capacitor plugin (`@capacitor/*`, `@capgo/*`) | Native plugin must be compiled into `.xcframework` |
| Modify `apps/mobile/capacitor.config.json`                 | Read at native build time, not at runtime          |
| Modify `Info.plist` (permissions, URL schemes)             | Apple requires review for permission changes       |
| Modify `AppDelegate.swift` or any Swift/Kotlin code        | Native code, cannot be OTA'd                       |
| Bump `MARKETING_VERSION` in Xcode (e.g. 5.0.0 → 6.0.0)     | Must ship through App Store                        |
| Change entitlements, push certificates, signing config     | Build-time configuration                           |
| Modify `PrivacyInfo.xcprivacy`                             | Privacy manifest is bundled at build time          |
| Change assets outside `www/browser/`                       | Not packed into the OTA bundle                     |

---

## How It Works (verified against source code)

```
App cold start
    │
    ▼
app.component.ts → liveUpdate.initialize()
    │
    ├─ notifyAppReady()           ← marks current bundle as healthy (no crash)
    ├─ updater.current()          ← gets running version ("" if no OTA yet)
    │
    ▼
checkForUpdate()
    ├─ Fetch Firestore AppUpdates/ios_production
    ├─ manifest.enabled === false?          → skip
    ├─ nativeVersion < minNativeVersion?    → skip (native-too-old)
    ├─ currentVersion >= manifest.version?  → up-to-date
    ├─ isInRollout(deviceId, rollout%)?     → not eligible → skip
    └─ failureCount >= 3?                   → skip (circuit breaker)
    │
    ▼ (status === 'available')
applyUpdate()
    ├─ WiFi check: cellular connection → DEFER (no download)
    ├─ download(url: R2_URL, version, checksum: sha256)
    ├─ next({ id: bundle.id })    ← STAGE for next launch (does NOT reload now)
    └─ saveState(version, failureCount: 0)
    │
    ▼
User backgrounds app → kills it → reopens
    └─ New bundle is loaded ✅
```

> **Why `next()` instead of `set()`?** `set()` immediately destroys the
> JavaScript context — the app appears to crash mid-session. `next()` queues the
> bundle for the next app launch — clean UX, Apple-friendly.

---

## ⚠️ Conditions Required for an Update to be Received

1. **WiFi required** — If the device is on cellular (4G/5G), the download is
   deferred until the next WiFi session. _(source: `live-update.service.ts` →
   `applyUpdate()`, line: `connectionType !== 'wifi'`)_

2. **Native shell version gate** — If the installed App Store version is older
   than `minNativeVersion` in the manifest, OTA is skipped. This prevents
   incompatible JS from running on outdated native shells.

3. **Rollout percentage** — Setting `rolloutPercentage: 100` sends to all users.
   Lower values (e.g. `10`) limit delivery to a deterministic subset of devices
   based on device ID hash.

4. **Circuit breaker** — After **3 consecutive failures** (download error,
   SHA-256 mismatch), OTA is automatically disabled until the next native app
   update.

---

## Deploy Process

### Step 1: Build the Angular bundle

```bash
cd apps/mobile
npm run build          # production build
# or
npm run build:staging  # staging build
```

Output directory: `apps/mobile/www/browser/`

### Step 2: Deploy to R2 + Firestore

```bash
cd backend

# Production — iOS
NODE_ENV=production npm run deploy:mobile-bundle:prod -- --platform ios --version 1.0.4

# Staging — iOS
NODE_ENV=staging npm run deploy:mobile-bundle:staging -- --platform ios --version 1.0.4-beta

# With optional flags
NODE_ENV=production npm run deploy:mobile-bundle:prod \
  -- --platform ios \
     --version 1.0.4 \
     --rollout 10 \           # deliver to 10% of users (canary)
     --min-native 1.0.0 \     # minimum App Store version required
     --notes "Fix login bug"
```

### Step 3: Verify the upload

```bash
curl -I "https://pub-d1df5b170c2a4c708dd963b5febd3996.r2.dev/app-bundles/production/ios/1.0.4/bundle.zip"
# Expected: HTTP/1.1 200 OK
```

---

## Firestore Manifest Structure

**Collection:** `AppUpdates` **Document ID format:** `{platform}_{channel}`
(e.g. `ios_production`, `android_staging`)

```json
{
  "platform": "ios",
  "channel": "production",
  "version": "1.0.4",
  "bundleUrl": "https://pub-d1df5b170c2a4c708dd963b5febd3996.r2.dev/app-bundles/production/ios/1.0.4/bundle.zip",
  "bundleHash": "sha256_hex_string",
  "bundleSize": 3857368,
  "minNativeVersion": "1.0.0",
  "publishedAt": "2026-04-28T09:19:14.000Z",
  "enabled": true,
  "rolloutPercentage": 100
}
```

**Emergency kill switch:**

```
Firestore Console → AppUpdates → ios_production → set enabled: false
```

No deployment needed — all users immediately stop receiving the update.

---

## Cloudflare R2 Storage

| Field             | Value                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| **Bucket**        | `nxt1-app-bundles-prod`                                                          |
| **Public URL**    | `https://pub-d1df5b170c2a4c708dd963b5febd3996.r2.dev`                            |
| **Path pattern**  | `app-bundles/{channel}/{platform}/{version}/bundle.zip`                          |
| **Cache-Control** | `public, max-age=31536000, immutable` (content-addressed, safe to cache forever) |

---

## Rollback Procedures

### Roll back to a previous OTA version

Deploy an older version number — the manifest will point clients to the old
bundle:

```bash
NODE_ENV=production npm run deploy:mobile-bundle:prod -- --platform ios --version 1.0.3
```

Users receive `1.0.3` on their next app launch.

### Emergency disable (immediate)

Firestore Console → `AppUpdates/ios_production` → set `enabled: false`

### Reset to the native (App Store) bundle

The plugin automatically resets after 3 consecutive failures (circuit breaker).
To reset manually via an in-app dev menu:

```typescript
liveUpdateService.resetToNativeBundle();
```

---

## Security & Apple Compliance

- **SHA-256 checksum** — Verified by the plugin before applying any bundle. A
  tampered zip will be rejected.
- **No Capgo cloud** — `autoUpdate: false`, `statsUrl: ""`, `updateUrl: ""` in
  `capacitor.config.json`. No telemetry sent to third-party servers.
- **Apple App Store Review Guidelines §4.7** permits OTA delivery of interpreted
  code (JS/HTML/CSS) provided:
  1. The update does not change the primary purpose of the app
  2. The update does not create a code marketplace
  3. The update does not bypass Apple's security or payment systems
- **NXT1 satisfies all three conditions** — no Apple notification or approval is
  required for OTA updates.

---

## Quick Reference

| Question                                                | Answer                                         |
| ------------------------------------------------------- | ---------------------------------------------- |
| Can I ship a UI fix without App Store?                  | ✅ Yes — build + deploy script                 |
| Can I add a new screen without App Store?               | ✅ Yes                                         |
| Can I add a new `@capacitor/` plugin without App Store? | ❌ No — requires Xcode build                   |
| How long until a user gets the update?                  | Next app launch after download (WiFi required) |
| What if the bundle crashes on launch?                   | Auto-reset to native bundle after 3 failures   |
| How do I target only 10% of users?                      | `--rollout 10` flag in deploy command          |
| How do I instantly stop an OTA?                         | Set `enabled: false` in Firestore              |
