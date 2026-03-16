# Crashlytics — Remaining Steps

> Last updated: March 15, 2026 Infrastructure is complete. Only production
> configs and device testing remain.

---

## 1. Download Production Firebase Configs

- [ ] **iOS**: Download `GoogleService-Info.plist` from
      [Firebase Console](https://console.firebase.google.com/project/nxt-1-de054/settings/general)
      for bundle ID `com.nxt1.sports`
  - Save to:
    `apps/mobile/firebase-configs/production/ios/GoogleService-Info.plist`
- [ ] **Android**: Download `google-services.json` for package `com.nxt1.sports`
  - Save to:
    `apps/mobile/firebase-configs/production/android/google-services.json`

## 2. Test in Staging

- [ ] Build app in **Release mode** (not Debug)
- [ ] Disconnect debugger before crashing
- [ ] Navigate to `/dev-settings` → Tap "Force Test Crash"
- [ ] Reopen app from home screen (sends crash report)
- [ ] Check
      [Staging Console](https://console.firebase.google.com/project/nxt-1-staging/crashlytics)
      (wait 5-10 min)

## 3. Verify Crash Reports

- [ ] Crash appears in Firebase Console
- [ ] Stack traces are readable (iOS dSYM / Android mapping uploaded)
- [ ] Non-fatal errors appear separately
- [ ] User context and custom keys visible

## 4. Test Production Environment

- [ ] Switch to production: `npm run config:production`
- [ ] Repeat crash test steps above
- [ ] Check
      [Production Console](https://console.firebase.google.com/project/nxt-1-de054/crashlytics)
