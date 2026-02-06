# 🔍 Explore/Search API - Quick Start

**Status:** ✅ **IMPLEMENTED**  
**Date:** February 6, 2026

## 🎯 Overview

Comprehensive search API for the `/explore` endpoint has been fully implemented,
enabling search across all content types in the NXT1 platform:

✅ **Athletes** - Search athletes  
✅ **Colleges** - Search colleges  
✅ **Teams** - Search teams  
✅ **Videos** - Search videos  
✅ **Camps** - Search camps  
✅ **Events** - Search events  
✅ **Scout Reports** - Search scout reports  
✅ **Leaderboards** - Search leaderboards

## 🚀 Quick Start

### 1. Setup Search Indexes (REQUIRED)

Before the API works, you need to add the `searchIndex` field to existing
documents:

```bash
# Check how many documents need updates (no changes made)
cd backend
npm run migrate:search-indexes:dry-run

# Run actual migration
npm run migrate:search-indexes

# Migrate only a specific collection
npm run migrate:search-indexes -- --collection=Users
```

### 2. Using the API

#### Basic Search

```bash
# Search athletes with "basketball" keyword
curl "http://localhost:3000/api/v1/explore/search?q=basketball&tab=athletes"

# Search colleges
curl "http://localhost:3000/api/v1/explore/search?q=stanford&tab=colleges"

# Search teams
curl "http://localhost:3000/api/v1/explore/search?q=lakers&tab=teams"
```

#### Get Suggestions

```bash
curl "http://localhost:3000/api/v1/explore/suggestions?q=john"
```

#### Get Counts Per Tab

```bash
curl "http://localhost:3000/api/v1/explore/counts?q=basketball"
```

#### Get Trending Content

```bash
curl "http://localhost:3000/api/v1/explore/trending?limit=10"
```

## 📋 Created/Updated Files

### Core Implementation

- ✅ `backend/src/routes/explore.routes.ts` - Main search API implementation
- ✅ `backend/src/utils/search-index.ts` - Search index utilities
- ✅ `backend/scripts/migrate-search-indexes.ts` - Migration script

### Documentation

- ✅ `backend/EXPLORE-API.md` - Full API documentation
- ✅ `backend/EXPLORE-QUICK-START.md` - This file

### Updated

- ✅ `backend/package.json` - Added migration scripts

## 🔑 Key Features

### 1. Cache-First Architecture

- ✅ All searches are cached in memory
- ✅ Custom TTL for each data type
- ✅ Reduces Firestore load

### 2. Multi-Entity Search

- ✅ Search 8 different entity types
- ✅ Filter by tab
- ✅ Pagination support

### 3. Smart Search Index

- ✅ Lowercase token arrays
- ✅ Includes partial matches
- ✅ Optimized for Firestore array-contains

### 4. Dual Environment

- ✅ Production: `/api/v1/explore/*`
- ✅ Staging: `/api/v1/staging/explore/*`

## 📖 API Endpoints

| Endpoint                      | Method | Description            |
| ----------------------------- | ------ | ---------------------- |
| `/api/v1/explore/search`      | GET    | Main search            |
| `/api/v1/explore/suggestions` | GET    | Get search suggestions |
| `/api/v1/explore/trending`    | GET    | Trending content       |
| `/api/v1/explore/counts`      | GET    | Result counts per tab  |

## 🔧 Cache Configuration

```typescript
search: 5 minutes
counts: 1 minute
suggestions: 10 minutes
trending: 30 minutes
```

## 📊 Database Collections

The API searches in the following collections:

```
Users (athletes only)
Colleges
Teams
Videos
Camps
Events
ScoutReports
Leaderboards
```

## ⚠️ Requirements

### searchIndex Field

**IMPORTANT**: Each document needs to have a `searchIndex` field (array of
strings) for search to work:

```typescript
{
  name: "John Smith",
  sport: "Basketball",
  // ... other fields

  searchIndex: [
    "john",
    "smith",
    "john smith",
    "basketball",
    // ... other tokens
  ]
}
```

### Automatically Add searchIndex

When creating/updating documents, use the utility:

```typescript
import { buildAthleteSearchIndex } from '../utils/search-index.js';

const athlete = { displayName: "John Smith", sport: "Basketball", ... };
const searchIndex = buildAthleteSearchIndex(athlete);

await db.collection('Users').doc(id).set({
  ...athlete,
  searchIndex,
});
```

## 🧪 Testing

```bash
# Build backend
npm run build

# Run tests
npm run test

# Run dev server
npm run dev

# Test search
curl "http://localhost:3000/api/v1/explore/search?q=test&tab=athletes"
```

## 📚 Full Documentation

See details at: [`backend/EXPLORE-API.md`](./EXPLORE-API.md)

## 🎓 Frontend Integration Example

```typescript
// Import from @nxt1/core (not @nxt1/core/explore)
import { createExploreApi } from '@nxt1/core';

// Create API instance
const exploreApi = createExploreApi(baseUrl);

// Search athletes
const results = await exploreApi.search({
  query: 'basketball',
  tab: 'athletes',
  page: 1,
  limit: 20,
});

console.log(results.items); // Array of athlete items
console.log(results.pagination.hasMore); // true/false
```

## 🐛 Troubleshooting

### Search not returning results?

1. **Check if searchIndex has been added**:

   ```bash
   npm run migrate:search-indexes:dry-run
   ```

2. **Run migration if needed**:

   ```bash
   npm run migrate:search-indexes
   ```

3. **Check if query has >= 2 characters**:

   ```bash
   # Wrong - query too short
   curl ".../search?q=a"

   # Correct
   curl ".../search?q=john"
   ```

### Cache issues?

Cache automatically expires after TTL. To force refresh, restart the server:

```bash
npm run dev
```

## 🚀 Next Steps

1. ✅ Run migration to add searchIndex
2. ✅ Test the endpoints
3. ✅ Integrate into frontend
4. 🔄 Add authentication if needed
5. 🔄 Add rate limiting for production
6. 🔄 Monitor performance and optimize

## 💡 Tips

- Use cache-first: API automatically caches results
- Query must be >= 2 characters
- searchIndex should be updated when data changes
- Use utility functions to build searchIndex
- Test on staging environment first

---

**Need help?** See full documentation at `backend/EXPLORE-API.md`
