#!/usr/bin/env bash
# ============================================================
# NXT1 SSR Tester — Local Development
# ============================================================
# Tests SSR output for any route WITHOUT needing production.
#
# Usage:
#   ./scripts/test-ssr.sh /profile/some-unicode
#   ./scripts/test-ssr.sh /team/some-team
#   ./scripts/test-ssr.sh /                        # homepage
#   ./scripts/test-ssr.sh /profile/abc --full       # full HTML
#   ./scripts/test-ssr.sh /profile/abc --raw        # raw meta tags only
#   ./scripts/test-ssr.sh --build /profile/abc      # rebuild first
#
# The script will:
#   1. Check if SSR build exists (or build if --build flag)
#   2. Start the SSR server on a random port
#   3. Curl the URL and extract SEO/meta tag info
#   4. Display a formatted report
#   5. Kill the server
# ============================================================

set -uo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIR="$MONOREPO_DIR/apps/web"
DIST_DIR="$WEB_DIR/dist/nxt1-web"
SERVER_FILE="$DIST_DIR/server/server.mjs"
PORT="${SSR_TEST_PORT:-0}" # 0 = random port
SERVER_PID=""
SHOW_FULL=false
SHOW_RAW=false
DO_BUILD=false
PATHS=()

# ============================================================
# Argument parsing
# ============================================================
while [[ $# -gt 0 ]]; do
  case $1 in
    --full)   SHOW_FULL=true; shift ;;
    --raw)    SHOW_RAW=true; shift ;;
    --build)  DO_BUILD=true; shift ;;
    --port)   PORT="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [OPTIONS] <path> [path2] [path3] ..."
      echo ""
      echo "Options:"
      echo "  --build    Build SSR before testing"
      echo "  --full     Show full rendered HTML"
      echo "  --raw      Show only raw meta tags (no formatting)"
      echo "  --port N   Use specific port (default: random)"
      echo "  -h,--help  Show this help"
      echo ""
      echo "Examples:"
      echo "  $0 /profile/john123"
      echo "  $0 /profile/john123 /team/warriors /explore"
      echo "  $0 --build /profile/john123"
      echo "  $0 /profile/john123 --full"
      exit 0
      ;;
    /*) PATHS+=("$1"); shift ;;
    *)  PATHS+=("/$1"); shift ;; # auto-prefix with /
  esac
done

# Default to homepage if no path given
if [[ ${#PATHS[@]} -eq 0 ]]; then
  PATHS=("/")
fi

# ============================================================
# Cleanup trap
# ============================================================
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# ============================================================
# Build check
# ============================================================
echo ""
echo -e "${BOLD}🔍 NXT1 SSR Tester${NC}"
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ "$DO_BUILD" == true ]]; then
  echo -e "${YELLOW}⏳ Building SSR...${NC}"
  cd "$MONOREPO_DIR"
  npx turbo run build --filter='@nxt1/web' --force 2>&1 | tail -5
  echo -e "${GREEN}✅ Build complete${NC}"
  echo ""
fi

if [[ ! -f "$SERVER_FILE" ]]; then
  echo -e "${RED}❌ SSR build not found at:${NC}"
  echo -e "   ${DIM}$SERVER_FILE${NC}"
  echo ""
  echo -e "   Run with ${YELLOW}--build${NC} flag or build manually:"
  echo -e "   ${CYAN}cd apps/web && npm run build${NC}"
  exit 1
fi

# ============================================================
# Start SSR server
# ============================================================
echo -e "${BLUE}🚀 Starting SSR server...${NC}"

# Use a random available port
if [[ "$PORT" == "0" ]]; then
  PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')
fi

cd "$WEB_DIR"
PORT=$PORT node "$SERVER_FILE" &
SERVER_PID=$!

# Wait for server to be ready (max 30s)
MAX_WAIT=30
WAITED=0
while ! curl -s -o /dev/null "http://localhost:$PORT/health" 2>/dev/null; do
  sleep 0.5
  WAITED=$((WAITED + 1))
  if [[ $WAITED -ge $((MAX_WAIT * 2)) ]]; then
    echo -e "${RED}❌ Server failed to start within ${MAX_WAIT}s${NC}"
    # Show any server output
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      kill "$SERVER_PID" 2>/dev/null || true
    fi
    exit 1
  fi
done

echo -e "${GREEN}✅ SSR server ready on port $PORT${NC}"
echo ""

# ============================================================
# Test each path
# ============================================================
for URL_PATH in "${PATHS[@]}"; do
  FULL_URL="http://localhost:$PORT$URL_PATH"

  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}📄 Testing: ${CYAN}$URL_PATH${NC}"
  echo -e "${DIM}   GET $FULL_URL${NC}"
  echo ""

  # Fetch the HTML (with timeout, follow redirects)
  HTTP_CODE=$(curl -s -o /tmp/ssr-test-output.html -w "%{http_code}" \
    -H "User-Agent: Twitterbot/1.0" \
    --max-time 15 \
    -L "$FULL_URL" 2>/dev/null || echo "000")

  if [[ "$HTTP_CODE" == "000" ]]; then
    echo -e "  ${RED}❌ Request failed (timeout or connection error)${NC}"
    echo ""
    continue
  fi

  HTML=$(cat /tmp/ssr-test-output.html)

  # Show HTTP status
  if [[ "$HTTP_CODE" == "200" ]]; then
    echo -e "  ${GREEN}HTTP Status: $HTTP_CODE ✅${NC}"
  else
    echo -e "  ${YELLOW}HTTP Status: $HTTP_CODE ⚠️${NC}"
  fi
  echo ""

  # --raw mode: just dump meta tags
  if [[ "$SHOW_RAW" == true ]]; then
    echo -e "  ${BOLD}Raw Meta Tags:${NC}"
    echo "$HTML" | grep -iE '<meta|<title|<link.*canonical' | sed 's/^/    /' || echo "    (none found)"
    echo ""
    continue
  fi

  # --full mode: show entire HTML
  if [[ "$SHOW_FULL" == true ]]; then
    echo "$HTML"
    echo ""
    continue
  fi

  # ============================================================
  # Formatted SEO Report
  # ============================================================

  # Helper: extract meta content by attribute=value
  extract_meta() {
    local attr="$1"
    local value="$2"
    local result
    result=$(echo "$HTML" | grep -i "$attr=\"$value\"" | head -1 | sed -E 's/.*content="([^"]*)".*/\1/' 2>/dev/null || echo "")
    # If the sed didn't match (output equals input line), return empty
    if echo "$result" | grep -q '<meta' 2>/dev/null; then
      echo ""
    else
      echo "$result"
    fi
  }

  # Helper: extract by property or name
  extract_og() { extract_meta "property" "$1"; }
  extract_name() { extract_meta "name" "$1"; }

  # Title
  TITLE=$(echo "$HTML" | grep -o '<title>[^<]*</title>' | head -1 | sed 's/<[^>]*>//g' 2>/dev/null || echo "")

  # OpenGraph
  OG_TITLE=$(extract_og "og:title")
  OG_DESC=$(extract_og "og:description")
  OG_IMAGE=$(extract_og "og:image")
  OG_URL=$(extract_og "og:url")
  OG_TYPE=$(extract_og "og:type")
  OG_SITE=$(extract_og "og:site_name")

  # Twitter
  TW_CARD=$(extract_name "twitter:card")
  TW_TITLE=$(extract_name "twitter:title")
  TW_DESC=$(extract_name "twitter:description")
  TW_IMAGE=$(extract_name "twitter:image")
  TW_SITE=$(extract_name "twitter:site")

  # Other SEO
  DESCRIPTION=$(extract_name "description")
  CANONICAL=$(echo "$HTML" | grep -i 'rel="canonical"' | head -1 | sed -E 's/.*href="([^"]*)".*/\1/' 2>/dev/null || echo "")
  ROBOTS=$(extract_name "robots")

  # JSON-LD
  JSONLD=$(echo "$HTML" | grep -o '<script type="application/ld+json">[^<]*</script>' | head -1 | sed 's/<[^>]*>//g' 2>/dev/null || echo "")

  # ---- Display ----

  echo -e "  ${BOLD}📋 Basic SEO${NC}"
  echo -e "  ├─ Title:       ${TITLE:-${RED}MISSING${NC}}"
  echo -e "  ├─ Description: ${DESCRIPTION:-${RED}MISSING${NC}}"
  echo -e "  ├─ Canonical:   ${CANONICAL:-${DIM}not set${NC}}"
  echo -e "  └─ Robots:      ${ROBOTS:-${DIM}not set (default: index)${NC}}"
  echo ""

  echo -e "  ${BOLD}🔗 OpenGraph (Facebook, LinkedIn, iMessage)${NC}"
  echo -e "  ├─ og:title:     ${OG_TITLE:-${RED}MISSING${NC}}"
  echo -e "  ├─ og:description: ${OG_DESC:-${RED}MISSING${NC}}"
  echo -e "  ├─ og:image:     ${OG_IMAGE:-${RED}MISSING${NC}}"
  echo -e "  ├─ og:url:       ${OG_URL:-${DIM}not set${NC}}"
  echo -e "  ├─ og:type:      ${OG_TYPE:-${DIM}not set${NC}}"
  echo -e "  └─ og:site_name: ${OG_SITE:-${DIM}not set${NC}}"
  echo ""

  echo -e "  ${BOLD}🐦 Twitter Card${NC}"
  echo -e "  ├─ twitter:card:  ${TW_CARD:-${RED}MISSING${NC}}"
  echo -e "  ├─ twitter:title: ${TW_TITLE:-${DIM}(falls back to og:title)${NC}}"
  echo -e "  ├─ twitter:desc:  ${TW_DESC:-${DIM}(falls back to og:description)${NC}}"
  echo -e "  ├─ twitter:image: ${TW_IMAGE:-${DIM}(falls back to og:image)${NC}}"
  echo -e "  └─ twitter:site:  ${TW_SITE:-${DIM}not set${NC}}"
  echo ""

  if [[ -n "$JSONLD" ]]; then
    echo -e "  ${BOLD}📊 JSON-LD Structured Data${NC}"
    echo -e "  └─ ${GREEN}Present ✅${NC}"
    # Pretty print if jq is available
    if command -v jq &>/dev/null; then
      echo "$JSONLD" | jq '.' 2>/dev/null | sed 's/^/     /' || echo "     $JSONLD"
    else
      echo -e "     ${DIM}$JSONLD${NC}"
    fi
    echo ""
  else
    echo -e "  ${BOLD}📊 JSON-LD Structured Data${NC}"
    echo -e "  └─ ${DIM}Not present${NC}"
    echo ""
  fi

  # ============================================================
  # Score card
  # ============================================================
  SCORE=0
  TOTAL=0
  ISSUES=()

  check() {
    local label="$1"
    local value="$2"
    local required="$3" # "required" or "recommended"
    TOTAL=$((TOTAL + 1))
    if [[ -n "$value" ]]; then
      SCORE=$((SCORE + 1))
    else
      if [[ "$required" == "required" ]]; then
        ISSUES+=("${RED}✗ $label (REQUIRED)${NC}")
      else
        ISSUES+=("${YELLOW}○ $label (recommended)${NC}")
      fi
    fi
  }

  check "title" "$TITLE" "required"
  check "meta description" "$DESCRIPTION" "required"
  check "og:title" "$OG_TITLE" "required"
  check "og:description" "$OG_DESC" "required"
  check "og:image" "$OG_IMAGE" "required"
  check "og:url" "$OG_URL" "recommended"
  check "og:type" "$OG_TYPE" "recommended"
  check "og:site_name" "$OG_SITE" "recommended"
  check "twitter:card" "$TW_CARD" "required"
  check "canonical" "$CANONICAL" "recommended"
  check "JSON-LD" "$JSONLD" "recommended"

  PERCENT=$((SCORE * 100 / TOTAL))

  if [[ $PERCENT -ge 90 ]]; then
    GRADE="${GREEN}A${NC}"
  elif [[ $PERCENT -ge 80 ]]; then
    GRADE="${GREEN}B${NC}"
  elif [[ $PERCENT -ge 60 ]]; then
    GRADE="${YELLOW}C${NC}"
  elif [[ $PERCENT -ge 40 ]]; then
    GRADE="${RED}D${NC}"
  else
    GRADE="${RED}F${NC}"
  fi

  echo -e "  ${BOLD}📊 SEO Score: ${SCORE}/${TOTAL} ($PERCENT%) — Grade: ${GRADE}${NC}"

  if [[ ${#ISSUES[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${BOLD}Issues:${NC}"
    for issue in "${ISSUES[@]}"; do
      echo -e "    $issue"
    done
  fi

  # Check if content appears to be dynamic (not just shell)
  if echo "$HTML" | grep -qE 'nxt1-profile-shell|app-profile|app-team|app-explore' 2>/dev/null; then
    # Check if the component was rendered with actual content vs empty shell
    BODY_LENGTH=$(echo "$HTML" | wc -c | tr -d ' ')
    if [[ $BODY_LENGTH -gt 5000 ]]; then
      echo ""
      echo -e "  ${GREEN}📦 SSR Content: Rendered (${BODY_LENGTH} bytes)${NC}"
    else
      echo ""
      echo -e "  ${YELLOW}📦 SSR Content: Minimal (${BODY_LENGTH} bytes) — may be empty shell${NC}"
    fi
  fi

  echo ""
done

# ============================================================
# Cleanup
# ============================================================
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Done. Server stopped.${NC}"
echo ""

# Cleanup temp file
rm -f /tmp/ssr-test-output.html
