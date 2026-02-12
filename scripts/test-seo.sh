#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 NXT1 Sports - SSR SEO Testing${NC}"
echo -e "${BLUE}=================================${NC}"
echo ""

# Check if server is running
SERVER_URL="http://localhost:8080"
if ! curl -s --head --request GET $SERVER_URL > /dev/null; then
  echo -e "${RED}❌ Server is not running at $SERVER_URL${NC}"
  echo -e "${YELLOW}Please run: npm run serve:ssr:nxt1-web${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Server is running at $SERVER_URL${NC}"
echo ""

# Test Auth Page
echo -e "${BLUE}📄 Testing /auth page:${NC}"
echo "-----------------------------------"
AUTH_TITLE=$(curl -s $SERVER_URL/auth | grep -o '<title>[^<]*</title>' | sed 's/<title>\(.*\)<\/title>/\1/')
echo -e "Title: ${GREEN}$AUTH_TITLE${NC}"

AUTH_OG_TITLE=$(curl -s $SERVER_URL/auth | grep 'og:title' | grep -o 'content="[^"]*"' | sed 's/content="\(.*\)"/\1/')
echo -e "OG Title: ${GREEN}$AUTH_OG_TITLE${NC}"

AUTH_OG_DESC=$(curl -s $SERVER_URL/auth | grep 'og:description' | grep -o 'content="[^"]*"' | sed 's/content="\(.*\)"/\1/')
echo -e "OG Description: ${GREEN}$AUTH_OG_DESC${NC}"

AUTH_TWITTER=$(curl -s $SERVER_URL/auth | grep 'twitter:card' | grep -o 'content="[^"]*"' | sed 's/content="\(.*\)"/\1/')
echo -e "Twitter Card: ${GREEN}$AUTH_TWITTER${NC}"
echo ""

# Test Home Page (Protected - should still render)
echo -e "${BLUE}📄 Testing /home page:${NC}"
echo "-----------------------------------"
HOME_TITLE=$(curl -s $SERVER_URL/home | grep -o '<title>[^<]*</title>' | sed 's/<title>\(.*\)<\/title>/\1/')
echo -e "Title: ${GREEN}$HOME_TITLE${NC}"
echo ""

# Test Explore Page
echo -e "${BLUE}📄 Testing /explore page:${NC}"
echo "-----------------------------------"
EXPLORE_TITLE=$(curl -s $SERVER_URL/explore | grep -o '<title>[^<]*</title>' | sed 's/<title>\(.*\)<\/title>/\1/')
echo -e "Title: ${GREEN}$EXPLORE_TITLE${NC}"

EXPLORE_OG_TITLE=$(curl -s $SERVER_URL/explore | grep 'og:title' | grep -o 'content="[^"]*"' | sed 's/content="\(.*\)"/\1/')
echo -e "OG Title: ${GREEN}$EXPLORE_OG_TITLE${NC}"
echo ""

# Test Profile Page (if exists)
echo -e "${BLUE}📄 Testing /profile/:unicode page:${NC}"
echo "-----------------------------------"
PROFILE_TITLE=$(curl -s $SERVER_URL/profile/test-123 | grep -o '<title>[^<]*</title>' | sed 's/<title>\(.*\)<\/title>/\1/')
echo -e "Title: ${GREEN}$PROFILE_TITLE${NC}"

PROFILE_OG=$(curl -s $SERVER_URL/profile/test-123 | grep 'og:type' | grep -o 'content="[^"]*"' | sed 's/content="\(.*\)"/\1/')
echo -e "OG Type: ${GREEN}$PROFILE_OG${NC}"
echo ""

# Summary
echo -e "${BLUE}=================================${NC}"
echo -e "${BLUE}📊 Test Summary:${NC}"
echo ""

if [[ $AUTH_TITLE == *"Sign In"* ]]; then
  echo -e "${GREEN}✅ Auth page title - PASSED${NC}"
else
  echo -e "${RED}❌ Auth page title - FAILED${NC}"
fi

if [[ $HOME_TITLE == *"Home"* ]]; then
  echo -e "${GREEN}✅ Home page title - PASSED${NC}"
else
  echo -e "${RED}❌ Home page title - FAILED${NC}"
fi

if [[ $EXPLORE_TITLE == *"Explore"* ]]; then
  echo -e "${GREEN}✅ Explore page title - PASSED${NC}"
else
  echo -e "${RED}❌ Explore page title - FAILED${NC}"
fi

if [[ $AUTH_TWITTER == "summary_large_image" ]]; then
  echo -e "${GREEN}✅ Twitter Cards - PASSED${NC}"
else
  echo -e "${RED}❌ Twitter Cards - FAILED${NC}"
fi

echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "1. View full HTML: curl -s $SERVER_URL/auth | head -100"
echo "2. Check specific tag: curl -s $SERVER_URL/auth | grep 'og:image'"
echo "3. Test on Facebook: https://developers.facebook.com/tools/debug"
echo "4. Test on Twitter: https://cards-dev.twitter.com/validator"
echo ""
