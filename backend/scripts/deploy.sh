#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Tự động pull code, build, reload PM2
# Server: 34.72.3.113 | User: ngocsonxx98
# Repo:   /home/vyacheslav_rud1996/nxt1-repo/
# PM2:    app ID = 1
# =============================================================================
set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
REPO_DIR="${REPO_DIR:-/home/vyacheslav_rud1996/nxt1-repo}"
BRANCH="${BRANCH:-main}"
LOG_FILE="${LOG_FILE:-/home/ngocsonxx98/deploy.log}"

# ── Logging ───────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# ── Bắt đầu deploy ────────────────────────────────────────────────────────────
log "══════════════════════════════════════════"
log "🚀 Starting deploy — branch: $BRANCH"

# 1. Pull code mới nhất
log "📥 Pulling latest code..."
cd "$REPO_DIR"
git fetch --all --prune
git reset --hard "origin/$BRANCH"
log "✅ Code pulled: $(git log -1 --format='%h %s')"

# 2. Cài dependencies (toàn bộ workspace)
log "📦 Installing dependencies..."
npm i
log "✅ Dependencies installed"

# 3. Build (turbo build — tất cả packages + backend)
log "🔨 Building..."
npm run build
log "✅ Build complete"

# 4. Reload PM2 (zero-downtime graceful reload)
log "🔄 Reloading PM2 app ID=1..."
pm2 reload 1 --update-env
log "✅ PM2 reloaded"

log "🎉 Deploy complete!"
log "══════════════════════════════════════════"
