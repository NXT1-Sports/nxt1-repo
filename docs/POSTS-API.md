# Posts API - Sports Social Platform

## 📋 Overview

Comprehensive post management API for sports social platform. Includes features
specifically designed for athletes, coaches, and sports content creators.

**Location:** `backend/src/routes/posts.routes.ts`  
**Base Path:** `/api/v1/posts`

## 🎯 Key Features Added

### ✅ Core Post Management

- Create, Read, Update, Delete posts
- Draft management
- Post scheduling
- Pin/Unpin posts to profile

### ✅ Social Features

- Share/Repost with comments
- Mentions and tagging
- Collaborative team posts
- Post visibility controls

### ✅ Sports-Specific Features

- **Game highlights** - Link videos to specific games
- **Game stats templates** - Pre-formatted stat posts
- **Performance analytics** - Track post reach and engagement
- **Viewer tracking** - See who viewed highlights

### ✅ Moderation & Safety

- Report inappropriate content
- Hide posts
- Bulk operations

## 📖 API Endpoints

### Post Creation & Drafts

| Endpoint      | Method | Description                  |
| ------------- | ------ | ---------------------------- |
| `/drafts`     | GET    | Get user's draft posts       |
| `/drafts`     | POST   | Save new draft               |
| `/drafts/:id` | PUT    | Update draft                 |
| `/drafts/:id` | DELETE | Delete draft                 |
| `/xp-preview` | POST   | Calculate XP before posting  |
| `/media`      | POST   | Upload media (images/videos) |
| `/`           | POST   | Create new post              |

### Post Management

| Endpoint   | Method | Description                 |
| ---------- | ------ | --------------------------- |
| `/:id`     | GET    | Get post by ID              |
| `/:id`     | PUT    | Edit/update post            |
| `/:id`     | DELETE | Delete post                 |
| `/:id/pin` | POST   | Pin post to profile (max 3) |
| `/:id/pin` | DELETE | Unpin post                  |

### Sharing & Engagement

| Endpoint      | Method | Description                  |
| ------------- | ------ | ---------------------------- |
| `/:id/share`  | POST   | Share/repost with comment    |
| `/:id/shares` | GET    | Get list of users who shared |
| `/:id/share`  | DELETE | Remove share                 |

### Post Analytics (Sports Specific)

| Endpoint         | Method | Description                    |
| ---------------- | ------ | ------------------------------ |
| `/:id/analytics` | GET    | View stats (reach, engagement) |
| `/:id/viewers`   | GET    | See who viewed the post        |
| `/:id/view`      | POST   | Track post view (analytics)    |

**Use Cases:**

- Athletes tracking highlight video reach
- Coaches analyzing content performance
- Measuring content performance

### Scheduling

| Endpoint         | Method | Description             |
| ---------------- | ------ | ----------------------- |
| `/schedule`      | POST   | Schedule post for later |
| `/scheduled`     | GET    | Get all scheduled posts |
| `/scheduled/:id` | PUT    | Update scheduled post   |
| `/scheduled/:id` | DELETE | Cancel scheduled post   |

**Use Cases:**

- Post game day announcements
- Schedule commitment announcements
- Plan content calendar

### Moderation & Reporting

| Endpoint      | Method | Description                  |
| ------------- | ------ | ---------------------------- |
| `/:id/report` | POST   | Report inappropriate content |
| `/:id/hide`   | POST   | Hide post from feed          |
| `/:id/hide`   | DELETE | Unhide post                  |

**Report Reasons:**

- Spam
- Harassment
- False information
- Inappropriate content

### Mentions & Tags

| Endpoint               | Method | Description               |
| ---------------------- | ------ | ------------------------- |
| `/mentions`            | GET    | Get posts mentioning user |
| `/:id/tags`            | GET    | Get tagged athletes       |
| `/:id/tags`            | POST   | Add tags to post          |
| `/:id/tags/:athleteId` | DELETE | Remove tag                |

**Use Cases:**

- Tag teammates in game photos
- Tag coaches in achievements
- Credit photographers/videographers

### Sports-Specific Features

#### Game Stats & Highlights

| Endpoint                   | Method | Description                 |
| -------------------------- | ------ | --------------------------- |
| `/templates/stats`         | GET    | Get game stats templates    |
| `/game-stats`              | POST   | Create formatted stats post |
| `/:id/link-game`           | POST   | Link highlight to game      |
| `/game/:gameId/highlights` | GET    | Get all highlights for game |

**Templates Example:**

```json
{
  "sport": "basketball",
  "templates": [
    {
      "id": "triple-double",
      "name": "Triple Double",
      "fields": ["points", "rebounds", "assists"]
    },
    {
      "id": "game-winner",
      "name": "Game Winner",
      "fields": ["points", "quarter", "time", "opponent"]
    }
  ]
}
```

**Post Game Stats Example:**

```json
POST /api/v1/posts/game-stats
{
  "gameId": "game123",
  "template": "triple-double",
  "stats": {
    "points": 28,
    "rebounds": 12,
    "assists": 10,
    "opponent": "Lincoln High",
    "result": "W 85-72"
  }
}
```

#### Collaborative Posts

| Endpoint             | Method | Description               |
| -------------------- | ------ | ------------------------- |
| `/collab`            | POST   | Create collaborative post |
| `/:id/collab/invite` | POST   | Invite collaborators      |
| `/:id/collab/accept` | POST   | Accept collaboration      |
| `/collab`            | GET    | Get collaborative posts   |

**Use Cases:**

- Team celebration posts
- Multi-athlete highlight reels
- Coach + athlete announcements
- Commitment announcements with family

### Bulk Operations

| Endpoint        | Method | Description                 |
| --------------- | ------ | --------------------------- |
| `/bulk/delete`  | POST   | Delete multiple posts       |
| `/bulk/privacy` | POST   | Change privacy for multiple |

## 🏀 Sports App Specific Use Cases

### For Athletes

**During Game Day:**

```
1. Schedule pregame hype post
2. Post live stats using templates
3. Upload highlight videos
4. Link highlights to game
5. Tag teammates in celebrations
```

**Commitment Season:**

```
1. Pin commitment announcement
2. Schedule visit announcements
3. Track post analytics (college views)
4. Share commitment updates
```

**Team Building:**

```
1. Create collaborative team posts
2. Tag teammates in photos
3. Share teammate achievements
4. Post practice highlights
```

### For Coaches

**Team Management:**

```
1. Schedule announcements
2. Post game results with stats
3. Share team achievements
4. Collaborate on team posts
```

**Athlete Discovery:**

```
1. Track highlight video views
2. Analyze post reach
3. Share program updates
4. Pin program highlights
```

## 🔐 Privacy Levels

Posts support different privacy levels:

- `public` - Anyone can see
- `followers` - Only followers
- `team` - Team members only
- `coaches` - Coaches only
- `private` - Only me

## 📊 Post Types

Specialized post types with different XP rewards:

| Type           | XP  | Description                  |
| -------------- | --- | ---------------------------- |
| `text`         | 10  | Basic text post              |
| `photo`        | 25  | Photo content                |
| `video`        | 50  | Video content                |
| `highlight`    | 75  | Game highlights (highest XP) |
| `stats`        | 30  | Game statistics              |
| `achievement`  | 40  | Milestones & awards          |
| `announcement` | 20  | Important updates            |
| `poll`         | 15  | Polls & questions            |

## 🎮 Gamification: XP System

**Base XP + Bonuses:**

```
Base XP (by type) +
Media Bonus (5 XP per media, max 25) +
Tag Bonus (2 XP per tag, max 10) +
First Post of Day (15 XP) +
Streak Multiplier (1.5x)
```

**Example:**

```
Highlight video post (75 XP) +
3 media files (15 XP) +
5 tagged teammates (10 XP) +
First post today (15 XP) +
7-day streak (1.5x multiplier)
= 172 XP total
```

## 🚀 Implementation Priority

### Phase 1 (MVP)

- ✅ Create/Edit/Delete posts
- ✅ Draft management
- ✅ Media upload
- ✅ Basic sharing

### Phase 2 (Core Social)

- ⏳ Mentions & tags
- ⏳ Post analytics
- ⏳ Share/Repost
- ⏳ Pin posts

### Phase 3 (Sports Features)

- ⏳ Game stats templates
- ⏳ Highlight linking
- ⏳ Scheduled posts
- ⏳ Collaborative posts

### Phase 4 (Advanced)

- ⏳ Advanced analytics
- ⏳ Viewer tracking
- ⏳ Bulk operations
- ⏳ Content moderation

## 💡 Best Practices

### For Athletes

1. Use highlight posts for max XP
2. Tag teammates to increase engagement
3. Link highlights to specific games
4. Schedule important announcements
5. Use stats templates for consistency

### For Coaches

1. Pin important program updates
2. Track post analytics for athlete discovery
3. Use collaborative posts for team content
4. Schedule announcements ahead of time

### For Developers

1. Implement rate limiting per user
2. Validate media before upload
3. Check permissions for collaborative posts
4. Track analytics asynchronously
5. Cache frequently accessed posts

## 🔧 Technical Notes

### Authentication Required

All endpoints require authenticated user (except public post viewing).

### Rate Limits (Recommended)

```
- Post creation: 10/hour per user
- Media upload: 20/hour per user
- Drafts: 50/hour per user
- Analytics: 100/hour per user
```

### Media Limits

```
- Images: 10MB max, 4096x4096
- Videos: 100MB max, 5 minutes
- Max media per post: 10 items
```

### Post Constraints

```
- Text: 2000 characters max
- Tags: 20 athletes max per post
- Pinned posts: 3 max per profile
- Scheduled posts: 30 days advance max
```

## 📚 Related Documentation

- `backend/ROUTES_SETUP.md` - General routes documentation
- `packages/core/src/create-post/` - Frontend types and constants
- `.cursorrules` - Project architecture rules

---

**Last Updated:** February 6, 2026  
**Status:** Routes defined, implementation pending  
**Maintained By:** NXT1 Backend Team
