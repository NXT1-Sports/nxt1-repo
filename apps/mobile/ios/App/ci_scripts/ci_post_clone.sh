#!/bin/sh
# ci_post_clone.sh — Xcode Cloud post-clone hook
# Runs after the repo is cloned, before Xcode Cloud archives/tests.
# Required because:
#   • App/Pods/ is gitignored — pod install must be run here
#   • Web assets must be built and synced via Capacitor before archiving
set -e

# ---- Paths ----------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IOS_APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"           # apps/mobile/ios/App
MOBILE_DIR="$(cd "$IOS_APP_DIR/../../.." && pwd)"     # apps/mobile
REPO_ROOT="$(cd "$MOBILE_DIR/../.." && pwd)"          # repo root

echo "▶ Repo root  : $REPO_ROOT"
echo "▶ Mobile dir : $MOBILE_DIR"
echo "▶ iOS App dir: $IOS_APP_DIR"

# ---- Node.js / npm --------------------------------------------------------
# Xcode Cloud provides Homebrew; install Node via brew if not already present
if ! command -v node >/dev/null 2>&1; then
  echo "▶ Installing Node.js via Homebrew..."
  brew install node
fi
echo "▶ Node: $(node --version)  npm: $(npm --version)"

# ---- Install monorepo dependencies ----------------------------------------
cd "$REPO_ROOT"
echo "▶ Installing npm dependencies..."
npm ci

# ---- Build mobile web assets ----------------------------------------------
echo "▶ Building mobile web assets..."
NODE_OPTIONS=--max_old_space_size=4096 npm run build:mobile

# ---- Capacitor sync -------------------------------------------------------
echo "▶ Running cap sync ios..."
cd "$MOBILE_DIR"
npx cap sync ios

# ---- Switch Firebase config to production ---------------------------------
echo "▶ Switching Firebase config to production..."
node scripts/auto-switch-firebase-env.js production

# ---- CocoaPods ------------------------------------------------------------
cd "$IOS_APP_DIR"
echo "▶ Running pod install..."
pod install --repo-update

echo "✅ ci_post_clone.sh complete"
