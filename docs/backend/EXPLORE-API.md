# Explore/Search API Documentation

## 📋 Overview

Comprehensive search API implementation for the `/explore` endpoint that
searches across all content types in the NXT1 platform.

**Created:** February 6, 2026  
**Status:** ✅ Implemented  
**Location:** `backend/src/routes/explore.routes.ts`

## 🎯 Features

### ✅ What's Implemented

- **Multi-entity search** - Search Athletes, Colleges, Teams, Videos, Camps,
  Events, Scout Reports, Leaderboards
- **Cache-first architecture** - In-memory caching for search results, counts,
  and suggestions
- **Tab-based filtering** - Filter results by content type
- **Pagination support** - Configurable page size and pagination
- **Search suggestions** - Auto-suggest based on query input
- **Trending content** - Get popular/trending items
- **Result counts** - Get counts per tab for a given query
- **Dual environment** - Production `/api/v1/explore/*` and Staging
  `/api/v1/staging/explore/*`

## 🔍 API Endpoints

### 1. Search (`GET /api/v1/explore/search`)

Search across all content based on query and tab filter.

**Query Parameters:**

```typescript
{
  q: string;           // Search query (required, min 2 chars)
  tab?: ExploreTabId;  // Filter by tab (default: 'colleges')
  page?: number;       // Page number (default: 1)
  limit?: number;      // Items per page (default: 20)
  sortBy?: string;     // Sort option (optional)
}
```

**Response:**

```typescript
{
  success: boolean;
  items: ExploreItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  suggestions?: string[];
  relatedSearches?: string[];
}
```

**Example:**

```bash
curl "http://localhost:3000/api/v1/explore/search?q=basketball&tab=athletes&limit=20"
```

### 2. Suggestions (`GET /api/v1/explore/suggestions`)

Get search suggestions based on partial query.

**Query Parameters:**

```typescript
{
  q: string;      // Partial search query
  limit?: number; // Max suggestions (default: 8)
}
```

**Response:**

```typescript
{
  success: boolean;
  suggestions: string[];
}
```

**Example:**

```bash
curl "http://localhost:3000/api/v1/explore/suggestions?q=john&limit=8"
```

### 3. Trending (`GET /api/v1/explore/trending`)

Get trending/popular content.

**Query Parameters:**

```typescript
{
  limit?: number; // Max items (default: 10)
}
```

**Response:**

```typescript
{
  success: boolean;
  trending: string[];
}
```

**Example:**

```bash
curl "http://localhost:3000/api/v1/explore/trending?limit=10"
```

### 4. Counts (`GET /api/v1/explore/counts`)

Get result counts for all tabs based on query.

**Query Parameters:**

```typescript
{
  q: string; // Search query
}
```

**Response:**

```typescript
{
  success: boolean;
  counts: {
    athletes: number;
    colleges: number;
    teams: number;
    videos: number;
    camps: number;
    events: number;
    'scout-reports': number;
    leaderboards: number;
  };
}
```

**Example:**

```bash
curl "http://localhost:3000/api/v1/explore/counts?q=basketball"
```

## 🏗️ Content Types (Tabs)

### Athletes

- **Collection:** `Users` (where `accountType === 'athlete'`)
- **Search Fields:** `searchIndex`
- **Returned Fields:** name, sport, position, classYear, location, team,
  followers, videoCount, commitment

### Colleges

- **Collection:** `Colleges`
- **Search Fields:** `searchIndex`
- **Returned Fields:** name, location, division, conference, sports, colors,
  ranking

### Teams

- **Collection:** `Teams`
- **Search Fields:** `searchIndex`
- **Returned Fields:** name, location, sport, memberCount, record, colors,
  teamType

### Videos

- **Collection:** `Videos`
- **Search Fields:** `searchIndex`
- **Returned Fields:** title, thumbnailUrl, duration, views, likes, creator,
  sport, uploadedAt

### Camps

- **Collection:** `Camps`
- **Search Fields:** `searchIndex`
- **Returned Fields:** name, subtitle, imageUrl

### Events

- **Collection:** `Events`
- **Search Fields:** `searchIndex`
- **Returned Fields:** name, subtitle, imageUrl

### Scout Reports

- **Collection:** `ScoutReports`
- **Search Fields:** `searchIndex`
- **Returned Fields:** athleteName, eventName, athleteImage

### Leaderboards

- **Collection:** `Leaderboards`
- **Search Fields:** `searchIndex`
- **Returned Fields:** name, sport, category

## 📊 Caching Strategy

### Cache Configuration

All search results are cached in-memory for optimal performance:

```typescript
const CACHE_TTL = {
  search: 5 * 60 * 1000, // 5 minutes
  counts: 60 * 1000, // 1 minute
  suggestions: 10 * 60 * 1000, // 10 minutes
  trending: 30 * 60 * 1000, // 30 minutes
};
```

### Cache Hit Flow

1. Request comes in with query parameters
2. Generate cache key from parameters
3. Check if valid cache entry exists
4. If hit → return cached data immediately
5. If miss → query Firestore → cache result → return data

### Cache Invalidation

Cache entries automatically expire based on TTL. Manual invalidation can be
added if needed.

## 🔧 Setup Requirements

### Firestore Collections

Ensure the following collections exist in Firestore:

- `Users` - User accounts including athletes
- `Colleges` - College data
- `Teams` - Team data
- `Videos` - Video content
- `Camps` - Camp information
- `Events` - Event information
- `ScoutReports` - Scout reports
- `Leaderboards` - Leaderboard data

### Search Index Field

**CRITICAL:** All searchable documents **MUST** have a `searchIndex` field for
search to work.

#### What is `searchIndex`?

`searchIndex` is an array of lowercase keywords/tokens extracted from the
document that enable fast text search using Firestore's `array-contains` query.

#### Example: Adding searchIndex to Athletes

```typescript
// Example athlete document
{
  displayName: "John Smith",
  firstName: "John",
  lastName: "Smith",
  sport: "Basketball",
  position: "Point Guard",
  location: "Los Angeles, CA",
  highSchool: "Lincoln High School",

  // Search index - lowercase tokens
  searchIndex: [
    "john",
    "smith",
    "john smith",
    "basketball",
    "point guard",
    "los angeles",
    "lincoln",
    "lincoln high school"
  ]
}
```

#### Building Search Index

Use the existing utility or create documents with search index:

```typescript
// When creating/updating a document
import { buildSearchIndex } from '../utils/buildSearchIndex.js';

const athlete = {
  displayName: 'John Smith',
  sport: 'Basketball',
  position: 'Point Guard',
  // ... other fields
};

// Generate search index
const searchIndex = buildSearchIndex([
  athlete.displayName,
  athlete.sport,
  athlete.position,
  athlete.location,
  athlete.highSchool,
]);

await db
  .collection('Users')
  .doc(athleteId)
  .set({
    ...athlete,
    searchIndex,
  });
```

#### Search Index Best Practices

1. **Include all searchable text fields**
   - Names, titles, descriptions
   - Locations, categories, tags
   - Related entity names

2. **Normalize to lowercase**
   - All tokens should be lowercase
   - Consistent formatting

3. **Include partial matches**
   - "John Smith" → ["john", "smith", "john smith"]
   - Enables better search results

4. **Update on document changes**
   - Regenerate searchIndex when searchable fields change
   - Keep index in sync with data

5. **Limit array size**
   - Firestore has 20,000 array element limit
   - Focus on most relevant search terms

### Firebase Cloud Function for Search Index

You can create a Cloud Function to automatically build search indexes:

```typescript
// apps/functions/src/firestore/onUserUpdate.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { buildSearchIndex } from '../util/buildSearchIndex';

export const updateUserSearchIndex = onDocumentWritten(
  'Users/{userId}',
  async (event) => {
    const data = event.data?.after.data();
    if (!data) return;

    // Only update if searchIndex is missing or outdated
    const searchIndex = buildSearchIndex([
      data.displayName,
      data.firstName,
      data.lastName,
      data.sport,
      data.position,
      data.location,
      data.highSchool,
    ]);

    await event.data.after.ref.update({ searchIndex });
  }
);
```

## 🧪 Testing

### Manual Testing

```bash
# Test search endpoint
curl "http://localhost:3000/api/v1/explore/search?q=test&tab=athletes"

# Test with staging environment
curl "http://localhost:3000/api/v1/staging/explore/search?q=test&tab=colleges"

# Test suggestions
curl "http://localhost:3000/api/v1/explore/suggestions?q=john"

# Test counts
curl "http://localhost:3000/api/v1/explore/counts?q=basketball"

# Test trending
curl "http://localhost:3000/api/v1/explore/trending?limit=5"
```

### Unit Tests

Update the test file at `backend/src/routes/__tests__/explore.routes.spec.ts`:

```typescript
// TODO: Update tests to reflect new implementation
// - Test successful search responses
// - Test cache hits
// - Test error cases
// - Test pagination
// - Test filtering by tab
```

## 🚀 Usage Examples

### Frontend Integration

```typescript
// Import from @nxt1/core (not @nxt1/core/explore)
import { createExploreApi } from '@nxt1/core';

// Create API instance
const exploreApi = createExploreApi(baseUrl);

// Search for athletes
const results = await exploreApi.search({
  query: 'basketball',
  tab: 'athletes',
  page: 1,
  limit: 20,
});

// Get suggestions
const suggestions = await exploreApi.getSuggestions('john', 8);

// Get tab counts
const counts = await exploreApi.getTabCounts('basketball');

// Get trending
const trending = await exploreApi.getTrending(10);
```

## 📈 Performance Considerations

1. **Cache First** - Always checks cache before hitting database
2. **Parallel Queries** - Tab counts run in parallel for better performance
3. **Query Limits** - Configurable limits prevent over-fetching
4. **Index-based Search** - Uses `searchIndex` array for O(1) lookups
5. **TTL Optimization** - Different TTLs based on data freshness needs

## 🔐 Security Notes

- All routes use Firebase context middleware
- Staging routes use separate Firebase instance
- No authentication required for public search (add if needed)
- Rate limiting should be added for production

## 🛠️ Future Enhancements

- [ ] Add authentication/authorization where needed
- [ ] Implement rate limiting
- [ ] Add filters (sport, location, division, etc.)
- [ ] Implement sorting options
- [ ] Add search analytics/tracking
- [ ] Implement fuzzy search
- [ ] Add search history per user
- [ ] Redis cache instead of in-memory
- [ ] Elasticsearch integration for advanced search
- [ ] Update unit tests to match implementation

## 📚 Related Documentation

- `.cursorrules` - Project rules and architecture guidelines
- `backend/ROUTES_SETUP.md` - Backend routes setup documentation
- `packages/core/src/explore/` - Core types and constants
- `apps/functions/src/util/buildSearchIndex.ts` - Search index utility

## 🤝 Contributing

When modifying search functionality:

1. Follow cache-first architecture
2. Update searchIndex when adding new searchable fields
3. Keep types in sync with `@nxt1/core/explore`
4. Update this documentation
5. Add/update tests
6. Test both production and staging routes

---

**Last Updated:** February 6, 2026  
**Maintained By:** NXT1 Backend Team
