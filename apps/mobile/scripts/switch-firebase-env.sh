#!/bin/bash
# switch-firebase-env.sh
# Switches Firebase configuration between staging and production
# Usage: ./switch-firebase-env.sh [staging|production]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_DIR="$MOBILE_DIR/firebase-configs"

ENV=${1:-staging}

if [[ "$ENV" != "staging" && "$ENV" != "production" ]]; then
    echo "❌ Invalid environment: $ENV"
    echo "Usage: $0 [staging|production]"
    exit 1
fi

echo "🔄 Switching Firebase configuration to: $ENV"

# iOS Configuration
IOS_SOURCE="$CONFIG_DIR/$ENV/ios/GoogleService-Info.plist"
IOS_DEST="$MOBILE_DIR/ios/App/App/GoogleService-Info.plist"

if [[ -f "$IOS_SOURCE" ]]; then
    cp "$IOS_SOURCE" "$IOS_DEST"
    echo "✅ iOS: Copied GoogleService-Info.plist from $ENV"
else
    echo "⚠️  iOS: $ENV config not found at $IOS_SOURCE"
    echo "    Please download from Firebase Console → Project Settings → iOS app"
fi

# Android Configuration
ANDROID_SOURCE="$CONFIG_DIR/$ENV/android/google-services.json"
ANDROID_DEST="$MOBILE_DIR/android/app/google-services.json"

if [[ -f "$ANDROID_SOURCE" ]]; then
    cp "$ANDROID_SOURCE" "$ANDROID_DEST"
    echo "✅ Android: Copied google-services.json from $ENV"
else
    echo "⚠️  Android: $ENV config not found at $ANDROID_SOURCE"
    echo "    Please download from Firebase Console → Project Settings → Android app"
fi

# Also copy to the root ios/App directory (some Capacitor versions look there)
IOS_DEST_ROOT="$MOBILE_DIR/ios/App/GoogleService-Info.plist"
if [[ -f "$IOS_SOURCE" ]]; then
    cp "$IOS_SOURCE" "$IOS_DEST_ROOT"
fi

echo ""
echo "🎯 Firebase environment set to: $ENV"
echo ""
echo "Next steps:"
echo "  1. Run 'npx cap sync' to sync native projects"
echo "  2. Rebuild the app for the changes to take effect"
echo ""

# Print which Firebase project is now active
if [[ "$ENV" == "production" ]]; then
    echo "📊 Crashlytics dashboard: https://console.firebase.google.com/project/nxt-1-de054/crashlytics"
else
    echo "📊 Crashlytics dashboard: https://console.firebase.google.com/project/nxt-1-staging/crashlytics"
fi
