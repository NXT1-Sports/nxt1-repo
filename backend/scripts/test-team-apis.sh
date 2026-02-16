#!/bin/bash
# Test Team Management APIs
# Usage: ./test-team-apis.sh [AUTH_TOKEN]

BASE_URL="http://localhost:3000/api/v1"
AUTH_TOKEN="${1:-YOUR_FIREBASE_ID_TOKEN_HERE}"

echo "🧪 Testing Team Management APIs"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Get My Teams (should show existing teams if user has any)
echo -e "${BLUE}📋 Test 1: GET /teams/user/my-teams${NC}"
echo -e "${YELLOW}Expected: List of teams for the authenticated user${NC}"
curl -s -X GET "$BASE_URL/teams/user/my-teams" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo ""
echo "---"
echo ""

# Test 2: Get All Teams (with pagination)
echo -e "${BLUE}📋 Test 2: GET /teams${NC}"
echo -e "${YELLOW}Expected: Paginated list of all teams${NC}"
curl -s -X GET "$BASE_URL/teams?limit=5&page=1" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" | jq '.'
echo ""
echo "---"
echo ""

# Test 3: Get Team by Code (use a real code from Firebase)
echo -e "${BLUE}📋 Test 3: GET /teams/code/:teamCode${NC}"
echo -e "${YELLOW}Enter a team code to test (or press Enter to skip):${NC}"
read -r TEAM_CODE

if [ -n "$TEAM_CODE" ]; then
  curl -s -X GET "$BASE_URL/teams/code/$TEAM_CODE" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" | jq '.'
  echo ""
else
  echo "Skipped"
fi
echo "---"
echo ""

# Test 4: Get Team by ID
echo -e "${BLUE}📋 Test 4: GET /teams/:id${NC}"
echo -e "${YELLOW}Enter a team ID to test (or press Enter to skip):${NC}"
read -r TEAM_ID

if [ -n "$TEAM_ID" ]; then
  curl -s -X GET "$BASE_URL/teams/$TEAM_ID" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" | jq '.'
  echo ""
else
  echo "Skipped"
fi
echo "---"
echo ""

# Test 5: Create New Team (optional)
echo -e "${BLUE}📋 Test 5: POST /teams (Create New Team)${NC}"
echo -e "${YELLOW}Do you want to create a test team? (y/N):${NC}"
read -r CREATE_TEAM

if [ "$CREATE_TEAM" = "y" ] || [ "$CREATE_TEAM" = "Y" ]; then
  RANDOM_CODE="TEST$(date +%s)"
  curl -s -X POST "$BASE_URL/teams" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Team",
      "teamCode": "'"$RANDOM_CODE"'",
      "unicode": "test-team-'"$(date +%s)"'",
      "description": "Automated test team",
      "sportsIds": ["basketball"],
      "city": "Test City",
      "state": "TS",
      "country": "Test Country"
    }' | jq '.'
  echo ""
else
  echo "Skipped"
fi
echo ""

echo -e "${GREEN}✅ Testing Complete!${NC}"
echo ""
echo "To test with your own token:"
echo "  ./test-team-apis.sh YOUR_FIREBASE_ID_TOKEN"
