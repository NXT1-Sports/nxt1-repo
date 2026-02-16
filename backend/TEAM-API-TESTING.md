# Team Management API Testing Guide

## 🚀 Quick Start

Backend server running on: `http://localhost:3000`

## 📋 Available Endpoints

```TypeScript
// Base URL
const BASE_URL = 'http://localhost:3000/api/v1';

// Production endpoints
GET    /api/v1/teams/all                      // List all teams (no paginated)
GET    /api/v1/teams                          // List all teams (paginated)
POST   /api/v1/teams                          // Create team
GET    /api/v1/teams/:id                      // Get team by ID
GET    /api/v1/teams/code/:teamCode           // Get team by code
GET    /api/v1/teams/unicode/:unicode         // Get team by unicode
PATCH  /api/v1/teams/:id                      // Update team
DELETE /api/v1/teams/:id                      // Delete team (soft)
POST   /api/v1/teams/:teamCode/join           // Join team
POST   /api/v1/teams/:id/invite               // Invite member
DELETE /api/v1/teams/:id/members/:userId      // Remove member
PATCH  /api/v1/teams/:id/members/:userId/role // Update member role
PATCH  /api/v1/teams/:id/members/bulk         // Bulk update roles
GET    /api/v1/teams/user/my-teams            // Get my teams
POST   /api/v1/teams/:id/view                 // Increment views

// Staging endpoints (same routes with /staging/ prefix)
/api/v1/staging/teams/*
```

## 🔐 Authentication

All endpoints require Firebase ID token in header:

```bash
Authorization: Bearer YOUR_FIREBASE_ID_TOKEN
```

### Option 1: Get Token from Firebase Console

1. Go to Firebase Console → Authentication
2. Select a user
3. Copy the UID
4. Use Firebase Auth REST API to sign in

### Option 2: Get Token from Frontend

If you have the NXT1 frontend running:

```javascript
// In browser console
firebase.auth().currentUser.getIdToken().then(console.log);
```

### Option 3: Using Firebase CLI

```bash
firebase login:ci
# Use the token from output
```

## 🧪 Test with cURL

### 1. Get Your Teams

```bash
curl -X GET "http://localhost:3000/api/v1/teams/user/my-teams" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

**Expected Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "team123",
      "name": "Lakers",
      "teamCode": "LAK001",
      "unicode": "lakers-2024",
      "members": [
        {
          "userId": "user1",
          "displayName": "John Doe",
          "role": "Administrative",
          "joinedAt": "2024-01-15T10:30:00Z"
        }
      ],
      "analytics": {
        "totalMembers": 5,
        "activeMembers": 5,
        "pageViews": 120
      }
    }
  ]
}
```

### 2. Get Team by Code

```bash
# Find a team code from your Firebase TeamCodes collection first
TEAM_CODE="LAK001"  # Replace with real code

curl -X GET "http://localhost:3000/api/v1/teams/code/$TEAM_CODE" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

### 3. Get Team by ID

```bash
# Use a real team ID from Firebase
TEAM_ID="abc123xyz"  # Replace with real ID

curl -X GET "http://localhost:3000/api/v1/teams/$TEAM_ID" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

### 4. Create New Team

```bash
curl -X POST "http://localhost:3000/api/v1/teams" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Warriors",
    "teamCode": "WAR'$(date +%s)'",
    "unicode": "test-warriors-'$(date +%s)'",
    "description": "Test team for API validation",
    "sportsIds": ["basketball", "football"],
    "city": "San Francisco",
    "state": "CA",
    "country": "USA",
    "zipCode": "94102",
    "teamType": "school"
  }'
```

### 5. Update Team

```bash
TEAM_ID="abc123xyz"  # Replace with real ID

curl -X PATCH "http://localhost:3000/api/v1/teams/$TEAM_ID" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Team Name",
    "description": "New description"
  }'
```

### 6. Join Team

```bash
TEAM_CODE="LAK001"  # Replace with real code

curl -X POST "http://localhost:3000/api/v1/teams/$TEAM_CODE/join" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "Athlete",
    "userProfile": {
      "displayName": "Jane Smith",
      "email": "jane@example.com",
      "avatarUrl": "https://example.com/avatar.jpg"
    }
  }'
```

### 7. Invite Member

```bash
TEAM_ID="abc123xyz"  # Replace with real ID

curl -X POST "http://localhost:3000/api/v1/teams/$TEAM_ID/invite" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "invitedUser123",
    "role": "Coach",
    "userProfile": {
      "displayName": "Coach Mike",
      "email": "coach@example.com"
    }
  }'
```

### 8. Update Member Role

```bash
TEAM_ID="abc123xyz"  # Replace with real ID
USER_ID="user456"    # Replace with real user ID

curl -X PATCH "http://localhost:3000/api/v1/teams/$TEAM_ID/members/$USER_ID/role" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "newRole": "Administrative"
  }'
```

### 9. Remove Member

```bash
TEAM_ID="abc123xyz"  # Replace with real ID
USER_ID="user456"    # Replace with real user ID

curl -X DELETE "http://localhost:3000/api/v1/teams/$TEAM_ID/members/$USER_ID" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json"
```

### 10. Bulk Update Member Roles

```bash
TEAM_ID="abc123xyz"  # Replace with real ID

curl -X PATCH "http://localhost:3000/api/v1/teams/$TEAM_ID/members/bulk" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {
        "userId": "user1",
        "newRole": "Coach"
      },
      {
        "userId": "user2",
        "newRole": "Athlete"
      }
    ]
  }'
```

## 📊 Testing with Real Firebase Data

Since your Firebase TeamCodes collection already has data:

1. **First, check existing teams:**

   ```bash
   curl -X GET "http://localhost:3000/api/v1/teams/user/my-teams" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. **Pick a team ID/code from the response**

3. **Test other endpoints with that real data**

## 🔍 Response Format

All successful responses follow this structure:

```json
{
  "success": true,
  "data": {
    /* response data */
  },
  "message": "Optional success message"
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      /* optional error details */
    }
  }
}
```

## 🎯 Testing Checklist

- [ ] ✅ Get my teams (verify returns existing data)
- [ ] ✅ Get team by ID (use real ID from step 1)
- [ ] ✅ Get team by code (use real code from Firebase)
- [ ] ✅ Create new team (should add to Firebase)
- [ ] ✅ Update team (should modify Firebase doc)
- [ ] ✅ Join team (should add member to array)
- [ ] ✅ Invite member (admin only)
- [ ] ✅ Update member role (admin only)
- [ ] ✅ Remove member (admin only)
- [ ] ✅ Bulk update roles (admin only)
- [ ] ✅ Delete team (soft delete, admin only)
- [ ] ✅ Increment views (public endpoint)

## 🐛 Troubleshooting

### "Unauthorized" or 401 Error

- Token expired → Get new token
- Token invalid → Verify token format
- User not found → Check Firebase Authentication

### "Forbidden" or 403 Error

- User not admin → Only admins can modify teams
- User not member → Some endpoints require membership

### "Not Found" or 404 Error

- Team ID doesn't exist → Verify ID from Firebase
- Team code wrong → Check spelling/case

### "Bad Request" or 400 Error

- Missing required fields → Check request body
- Invalid data format → Verify JSON structure

## 📝 Notes

- All timestamps are in ISO 8601 format
- Roles: `Administrative`, `Coach`, `Athlete`, `Media`
- Team codes must be unique
- Unicode slugs must be unique
- Deleted teams have `isActive: false` but remain in database
- Cache TTL is 5 minutes for team data

## 🔗 Related Files

- Routes: `backend/src/routes/teams.routes.ts`
- Service: `backend/src/services/team-code.service.ts`
- Models: `packages/core/src/models/team-code.model.ts`
- Middleware: `backend/src/middleware/firebase-context.middleware.ts`
