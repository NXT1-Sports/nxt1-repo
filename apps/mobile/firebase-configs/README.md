# Firebase Configuration Files

This directory contains Firebase configuration files for staging and production
environments.

## Structure

```
firebase-configs/
├── staging/
│   ├── ios/GoogleService-Info.plist
│   └── android/google-services.json
├── production/
│   ├── ios/GoogleService-Info.plist
│   └── android/google-services.json
└── README.md
```

## How to Download

1. Go to Firebase Console → Project Settings → Your Apps
2. For **Staging** (`nxt-1-staging`):
   - Download iOS config → Save to `staging/ios/GoogleService-Info.plist`
   - Download Android config → Save to `staging/android/google-services.json`
3. For **Production** (`nxt-1-de054`):
   - Download iOS config → Save to `production/ios/GoogleService-Info.plist`
   - Download Android config → Save to `production/android/google-services.json`

## Switching Environments

Use the provided scripts to switch between environments:

```bash
# Switch to staging (default for development)
npm run config:staging

# Switch to production (for release builds)
npm run config:production
```

## IMPORTANT: Crashlytics Requirements

Each Firebase project has its own Crashlytics dashboard. Crashes are reported to
the Firebase project configured in the app at build time:

- **Staging builds**: Crashes appear in `nxt-1-staging` → Crashlytics
- **Production builds**: Crashes appear in `nxt-1-de054` → Crashlytics

Make sure to use production config for App Store/Play Store releases!
