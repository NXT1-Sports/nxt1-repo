# Redis Cache - Router Setup Guide

> **The only file you need to setup cache for all routers**

---

## 🚀 Workflow: When Updating/Implementing New Routers

### Scenario 1: Implement New Router (Router Without Logic)

**Example**: You're implementing `feed.routes.ts` or `posts.routes.ts`

```bash
# Step 1: Implement database logic FIRST
# Write Firestore/MongoDB queries as normal
router.get('/', async (req, res) => {
  const { userId, page } = req.query;
  const posts = await db.collection('Posts').where('userId', '==', userId).get();
  return res.json({ posts });
});

# Step 2: Add cache (4 lines of code)
# Copy pattern from colleges.routes.ts
```

**Time**: 15-20 minutes total (10 min database logic + 5 min cache)

---

### Scenario 2: Update Existing Router (Add Cache)

**Example**: Router already has database queries, needs cache

#### ✅ Quick Add Cache (3 minutes)

```typescript
// File: your-router.routes.ts

// 1. ADD: Imports at top of file
import { getCacheService } from '../services/cache.service.js';
import { logger } from '../utils/logger.js';

// 2. ADD: Constants after imports
const CACHE_TTL = 300; // ← Choose appropriate TTL
const CACHE_PREFIX = 'your-resource';

// 3. MODIFY: Wrap existing GET endpoint
router.get('/endpoint', async (req, res) => {
  const { param } = req.query;

  // ADD: Generate cache key
  const cacheKey = `${CACHE_PREFIX}:endpoint:${JSON.stringify({ param })}`;

  // ADD: Check cache
  const cache = getCacheService();
  const cached = await cache.get(cacheKey);
  if (cached) {
    logger.info(`[${CACHE_PREFIX}] Cache HIT`);
    return res.json(cached);
  }

  logger.info(`[${CACHE_PREFIX}] Cache MISS`);

  // KEEP: Your existing database query
  const data = await YourModel.find({ param });
  const result = { data };

  // ADD: Save to cache
  await cache.set(cacheKey, result, {
    ttl: CACHE_TTL,
    tags: [CACHE_PREFIX],
  });

  return res.json(result);
});

// 4. ADD: Invalidate on write operations
router.post('/', async (req, res) => {
  const result = await YourModel.create(req.body);

  // ADD: Invalidate cache
  const cache = getCacheService();
  await cache.invalidateTags([CACHE_PREFIX]);

  return res.json(result);
});
```

**Changes Summary**:

- ✅ **2 imports** added (top of file)
- ✅ **2 constants** added (after imports)
- ✅ **5 lines** added to GET endpoint (cache check + save)
- ✅ **2 lines** added to POST/PUT/DELETE (invalidation)

**Total**: ~15 lines of code

---

### Scenario 3: Update Endpoint in Cached Router

**Example**: `colleges.routes.ts` already has cache, you're adding new endpoint

```typescript
// File already has: CACHE_PREFIX, CACHE_TTL, imports ✅

// Just need: Copy pattern into new endpoint
router.get('/new-endpoint', async (req, res) => {
  const { newParam } = req.query;

  // Copy these 3 blocks:

  // 1. Cache key
  const cacheKey = `${CACHE_PREFIX}:new-endpoint:${JSON.stringify({ newParam })}`;

  // 2. Check cache
  const cache = getCacheService();
  const cached = await cache.get(cacheKey);
  if (cached) {
    logger.info(`[${CACHE_PREFIX}] Cache HIT`);
    return res.json(cached);
  }

  // 3. Your query + save
  const data = await YourModel.find({ newParam });
  await cache.set(cacheKey, { data }, { ttl: CACHE_TTL, tags: [CACHE_PREFIX] });
  return res.json({ data });
});
```

**Time**: 2-3 minutes per endpoint

---

## ⚡ Super Quick Checklist

When updating router, follow this order:

### 📝 Preparation (1 minute)

- [ ] Identify router file to update
- [ ] Determine data type (dynamic/static) → Choose TTL
- [ ] Open [CACHE-ROUTER-SETUP-EN.md](./CACHE-ROUTER-SETUP-EN.md) (this file)

### 💻 Implementation (2-5 minutes)

- [ ] Add 2 imports (if not already present)
- [ ] Add 2 constants: `CACHE_TTL`, `CACHE_PREFIX`
- [ ] For each GET endpoint:
  - [ ] Generate cache key
  - [ ] Check cache → return if hit
  - [ ] Query database (existing code)
  - [ ] Save to cache
- [ ] For each POST/PUT/DELETE endpoint:
  - [ ] Add `cache.invalidateTags([CACHE_PREFIX])`

### 🧪 Testing (2 minutes)

- [ ] Build: `npm run build --workspace=@nxt1/backend`
- [ ] Test endpoint twice with same params
- [ ] Check logs: Should see "Cache HIT" on 2nd request
- [ ] Verify response matches both times

### ✅ Done!

- [ ] Commit: `git commit -m "feat(cache): Add cache to your-router"`
- [ ] Celebrate 20x performance improvement! 🎉

---

## 📱 Copy-Paste Templates

### Template 1: New GET Endpoint (With Cache)

```typescript
router.get('/my-endpoint', async (req, res) => {
  try {
    const { param1, param2 } = req.query;
    const cacheKey = `${CACHE_PREFIX}:my-endpoint:${JSON.stringify({ param1, param2 })}`;

    const cache = getCacheService();
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.info(`[${CACHE_PREFIX}] Cache HIT`, { endpoint: '/my-endpoint' });
      return res.json(cached);
    }

    logger.info(`[${CACHE_PREFIX}] Cache MISS`, { endpoint: '/my-endpoint' });

    // YOUR DATABASE QUERY HERE
    const data = await YourModel.find({ param1, param2 });
    const result = { data };

    await cache.set(cacheKey, result, { ttl: CACHE_TTL, tags: [CACHE_PREFIX] });
    return res.json(result);
  } catch (error) {
    logger.error(`[${CACHE_PREFIX}] Error:`, { error });
    return res.status(500).json({ message: 'Error' });
  }
});
```

### Template 2: Update Existing GET (Add Cache)

```typescript
// BEFORE (no cache)
router.get('/endpoint', async (req, res) => {
  const data = await YourModel.find({ param });
  return res.json({ data });
});

// AFTER (with cache) - Add 6 lines
router.get('/endpoint', async (req, res) => {
  const { param } = req.query;
  const cacheKey = `${CACHE_PREFIX}:endpoint:${JSON.stringify({ param })}`; // +1

  const cache = getCacheService(); // +2
  const cached = await cache.get(cacheKey); // +3
  if (cached) return res.json(cached); // +4

  const data = await YourModel.find({ param }); // existing
  const result = { data };
  await cache.set(cacheKey, result, { ttl: CACHE_TTL, tags: [CACHE_PREFIX] }); // +5
  return res.json(result); // +6
});
```

### Template 3: Add Cache Invalidation

```typescript
// BEFORE
router.post('/', async (req, res) => {
  const result = await YourModel.create(req.body);
  return res.json(result);
});

// AFTER - Add 2 lines
router.post('/', async (req, res) => {
  const result = await YourModel.create(req.body);

  const cache = getCacheService(); // +1
  await cache.invalidateTags([CACHE_PREFIX]); // +2

  return res.json(result);
});
```

---

## 🎯 Quick Reference

### TTL Strategy

```typescript
// Copy into your router file
const CACHE_TTL = 300; // ← Change this number based on data type

// Reference:
// 30      → Real-time (notifications)
// 300     → Dynamic (posts, comments) ⭐ RECOMMENDED for posts
// 900     → Semi-dynamic (user activity)
// 3600    → Semi-static (profiles, rankings) ⭐ RECOMMENDED
// 86400   → Static (colleges, teams) ⭐ RECOMMENDED
```

### Cache Key Pattern

```typescript
// Pattern: resource:action:params
const cacheKey = `posts:feed:user:${userId}:page:${page}`;
const cacheKey = `colleges:filter:${JSON.stringify({ sport, state })}`;
const cacheKey = `rankings:list:${sport}:${division}`;
```

---

## 📋 Implementation Checklist

### ▢ Step 1: Add Imports (30 seconds)

```typescript
import { getCacheService } from '../services/cache.service.js';
import { logger } from '../utils/logger.js';
```

### ▢ Step 2: Add Constants (30 seconds)

```typescript
const CACHE_TTL = 300; // ← Choose from table above
const CACHE_PREFIX = 'posts'; // ← Your resource name
```

### ▢ Step 3: Wrap GET Endpoints (2 minutes)

```typescript
router.get('/your-endpoint', async (req, res) => {
  try {
    const { param1, param2 } = req.query;

    // 1. Generate cache key
    const cacheKey = `${CACHE_PREFIX}:endpoint:${JSON.stringify({ param1, param2 })}`;

    // 2. Try cache first
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);

    if (cached) {
      logger.info(`[${CACHE_PREFIX}] Cache HIT`);
      return res.json(cached);
    }

    logger.info(`[${CACHE_PREFIX}] Cache MISS`);

    // 3. Your existing query (no changes)
    const data = await YourModel.find({
      /* ... */
    });
    const result = { data };

    // 4. Save to cache
    await cache.set(cacheKey, result, {
      ttl: CACHE_TTL,
      tags: [CACHE_PREFIX],
    });

    return res.json(result);
  } catch (error) {
    logger.error(`[${CACHE_PREFIX}] Error:`, error);
    return res.status(500).json({ message: 'Error' });
  }
});
```

### ▢ Step 4: Add Invalidation to POST/PUT/DELETE (1 minute)

```typescript
router.post('/', async (req, res) => {
  const result = await YourModel.create(req.body);

  // Clear cache after update
  const cache = getCacheService();
  await cache.invalidateTags([CACHE_PREFIX]);

  return res.json(result);
});

router.put('/:id', async (req, res) => {
  const result = await YourModel.updateOne({ _id: id }, req.body);
  await cache.invalidateTags([CACHE_PREFIX]);
  return res.json(result);
});

router.delete('/:id', async (req, res) => {
  await YourModel.deleteOne({ _id: id });
  await cache.invalidateTags([CACHE_PREFIX]);
  return res.json({ success: true });
});
```

### ▢ Step 5: Build & Test (1 minute)

```bash
npm run build --workspace=@nxt1/backend
# Request twice with same params → Should see "Cache HIT" in logs on 2nd request
```

---

## 🚀 Complete Examples

### Example 1: Posts Feed (Dynamic - 5 min TTL)

```typescript
// backend/src/routes/post/post.routes.ts
import { Router } from 'express';
import { getCacheService } from '../../services/cache.service.js';
import { logger } from '../../utils/logger.js';

const router = Router();
const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'posts';

router.get('/feed', async (req, res) => {
  try {
    const { userId, page = 1, limit = 20 } = req.query;
    const cacheKey = `${CACHE_PREFIX}:feed:user:${userId}:page:${page}`;

    const cache = getCacheService();
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.info('[Posts] Cache HIT', { userId, page });
      return res.json(cached);
    }

    logger.info('[Posts] Cache MISS', { userId, page });

    const posts = await Post.find({ userId })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('author')
      .lean();

    const result = { posts, page, hasMore: posts.length === limit };
    await cache.set(cacheKey, result, { ttl: CACHE_TTL, tags: ['posts'] });

    return res.json(result);
  } catch (error) {
    logger.error('[Posts] Error:', error);
    return res.status(500).json({ message: 'Error' });
  }
});

router.post('/', async (req, res) => {
  const post = await Post.create(req.body);
  await cache.invalidateTags(['posts']);
  return res.json(post);
});

export default router;
```

### Example 2: Rankings (Semi-static - 1 hour TTL)

```typescript
// backend/src/routes/rankings/rankings.routes.ts
import { Router } from 'express';
import { getCacheService } from '../../services/cache.service.js';
import { logger } from '../../utils/logger.js';

const router = Router();
const CACHE_TTL = 3600; // 1 hour
const CACHE_PREFIX = 'rankings';

router.get('/', async (req, res) => {
  try {
    const { sport, division, season = 'current' } = req.query;
    const cacheKey = `${CACHE_PREFIX}:list:${sport}:${division}:${season}`;

    const cache = getCacheService();
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.info('[Rankings] Cache HIT', { sport, division });
      return res.json(cached);
    }

    logger.info('[Rankings] Cache MISS', { sport, division });

    const rankings = await Ranking.aggregate([
      { $match: { sport, ...(division && { division }), season } },
      { $sort: { rank: 1 } },
      // ... your aggregation
    ]);

    const result = { rankings, sport, division, season };
    await cache.set(cacheKey, result, { ttl: CACHE_TTL, tags: ['rankings'] });

    return res.json(result);
  } catch (error) {
    logger.error('[Rankings] Error:', error);
    return res.status(500).json({ message: 'Error' });
  }
});

router.post('/update', async (req, res) => {
  await Ranking.updateMany(
    {
      /* ... */
    },
    req.body
  );
  await cache.invalidateTags(['rankings']);
  return res.json({ success: true });
});

export default router;
```

### Example 3: User Profile (Semi-static - 30 min TTL)

```typescript
// backend/src/routes/profile/profile.routes.ts
import { Router } from 'express';
import { getCacheService } from '../../services/cache.service.js';
import { logger } from '../../utils/logger.js';

const router = Router();
const CACHE_TTL = 1800; // 30 minutes
const CACHE_PREFIX = 'profiles';

router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // ⚠️ IMPORTANT: Don't cache own profile!
    if (req.user?.id === userId) {
      const profile = await User.findById(userId).select('-password').lean();
      return res.json(profile);
    }

    // Cache other users' profiles
    const cacheKey = `${CACHE_PREFIX}:user:${userId}`;
    const cache = getCacheService();
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.info('[Profiles] Cache HIT', { userId });
      return res.json(cached);
    }

    logger.info('[Profiles] Cache MISS', { userId });

    const profile = await User.findById(userId)
      .select('-password')
      .populate('followers following')
      .lean();

    if (profile) {
      await cache.set(cacheKey, profile, {
        ttl: CACHE_TTL,
        tags: ['profiles', `user:${userId}`],
      });
    }

    return res.json(profile);
  } catch (error) {
    logger.error('[Profiles] Error:', error);
    return res.status(500).json({ message: 'Error' });
  }
});

router.put('/:userId', async (req, res) => {
  const profile = await User.findByIdAndUpdate(req.params.userId, req.body, {
    new: true,
  });

  await cache.invalidateTags([`user:${req.params.userId}`]);
  return res.json(profile);
});

export default router;
```

### Example 4: College Filter (Static - 24 hours TTL) ✅ DONE

```typescript
// backend/src/routes/colleges.routes.ts
// Already implemented - see file for reference
const CACHE_TTL = 86400; // 24 hours
```

---

## 📊 Router Priority & TTL Table

| Router               | Priority  | TTL          | Reason         | Status  |
| -------------------- | --------- | ------------ | -------------- | ------- |
| **colleges**         | 🔴 High   | 86400 (24h)  | Rarely changes | ✅ DONE |
| **rankings**         | 🔴 High   | 3600 (1h)    | Updated daily  | ⏳ TODO |
| **teams**            | 🔴 High   | 3600 (1h)    | Semi-static    | ⏳ TODO |
| **posts/feed**       | 🟡 Medium | 300 (5min)   | Dynamic        | ⏳ TODO |
| **posts/detail**     | 🟡 Medium | 900 (15min)  | Less dynamic   | ⏳ TODO |
| **profiles**         | 🟡 Medium | 1800 (30min) | User data      | ⏳ TODO |
| **prospects**        | 🟡 Medium | 3600 (1h)    | Search results | ⏳ TODO |
| **follow/followers** | 🟢 Low    | 600 (10min)  | Social data    | ⏳ TODO |
| **follow/following** | 🟢 Low    | 600 (10min)  | Social data    | ⏳ TODO |
| **videos**           | 🟢 Low    | 1800 (30min) | Media list     | ⏳ TODO |

---

## 🚨 Common Mistakes & Fixes

### ❌ Mistake 1: Non-unique cache key

```typescript
// BAD
const cacheKey = 'posts';

// GOOD
const cacheKey = `posts:feed:user:${userId}:page:${page}`;
```

### ❌ Mistake 2: Forgot to invalidate cache

```typescript
// BAD
router.put('/:id', async (req, res) => {
  await Model.updateOne({ _id: id }, data);
  return res.json({ success: true }); // ← Missing invalidation!
});

// GOOD
router.put('/:id', async (req, res) => {
  await Model.updateOne({ _id: id }, data);
  await cache.invalidateTags(['resource']); // ← Invalidate!
  return res.json({ success: true });
});
```

### ❌ Mistake 3: TTL too long for dynamic data

```typescript
// BAD - Posts cached for 24h!
const CACHE_TTL = 86400; // Posts change every minute!

// GOOD
const CACHE_TTL = 300; // 5 minutes for dynamic content
```

### ❌ Mistake 4: Cache user-specific data globally

```typescript
// BAD - All users share same cache!
const cacheKey = 'user-feed';

// GOOD - Each user has own cache
const cacheKey = `feed:user:${userId}`;
```

---

## 🎯 Decision Tree: Choose TTL

```
Does data change every second?
└─ YES → DON'T cache (or 30s if acceptable)

Does data change every few minutes?
└─ YES → 300s (5min) - Posts, comments, activity

Does data change every hour?
└─ YES → 3600s (1h) - Rankings, stats

Does data change daily?
└─ YES → 86400s (24h) - Colleges, teams

Does data rarely change?
└─ YES → 604800s (7 days) - Reference data
```

---

## ✅ Quick Checklist (Per Router)

When setting up cache for a new router:

- [ ] Add imports: `getCacheService`, `logger`
- [ ] Define `CACHE_TTL` (based on Decision Tree ↑)
- [ ] Define `CACHE_PREFIX` (resource name)
- [ ] Wrap GET endpoints with cache check
- [ ] Generate unique cache key for each query
- [ ] Add `cache.invalidateTags()` to POST/PUT/DELETE
- [ ] Build: `npm run build --workspace=@nxt1/backend`
- [ ] Test: Request twice → Check logs for "Cache HIT"
- [ ] Monitor: Check performance improvement
- [ ] Update table ↑ status: ✅ DONE

---

## 🔧 Debug Commands

```bash
# Check if Redis is running
redis-cli ping
# → PONG

# View all cache keys
redis-cli KEYS '*'

# View cache for specific resource
redis-cli KEYS 'posts:*'

# Clear cache for specific resource
redis-cli DEL $(redis-cli KEYS 'posts:*')

# Check how many keys are cached
redis-cli DBSIZE

# Clear ALL cache (careful!)
redis-cli FLUSHDB
```

---

## 📈 Expected Performance

| Metric          | Before Cache | After Cache | Improvement       |
| --------------- | ------------ | ----------- | ----------------- |
| Response time   | 500-800ms    | 25-30ms     | **20-26x faster** |
| DB queries      | 1000/min     | 50/min      | **95% reduction** |
| Cache hit rate  | 0%           | 90-95%      | After warm-up     |
| Cost (DB reads) | $50/mo       | $2.50/mo    | **95% savings**   |

---

## 🚀 Next Steps

1. **Pick a router** from Priority Table ↑
2. **Copy template** from Examples ↑
3. **Customize** 3 things: TTL, cache key, tags
4. **Test** with 2 identical requests
5. **Verify** logs show "Cache HIT"
6. **Repeat** for next routers

---

## 💡 Pro Tips

### 1. Use Tags to Invalidate by Group

```typescript
// Set cache with multiple tags
await cache.set(key, data, {
  ttl: 300,
  tags: ['posts', `user:${userId}`, `post:${postId}`],
});

// Invalidate at different levels
await cache.invalidateTags(['posts']); // All posts
await cache.invalidateTags([`user:${userId}`]); // User's posts only
await cache.invalidateTags([`post:${postId}`]); // Specific post
```

### 2. Don't Cache Errors

```typescript
try {
  const data = await queryDB();

  // ✅ Only cache successful responses
  if (data) {
    await cache.set(key, data, { ttl: 300 });
  }

  return res.json(data);
} catch (error) {
  // ❌ Don't cache errors!
  return res.status(500).json({ error });
}
```

### 3. Cache Warm-up (Optional)

```typescript
// Warm cache at server startup for frequently accessed data
async function warmCache() {
  const commonQueries = [
    { sport: 'Football', division: 'D1' },
    { sport: 'Basketball', division: 'D1' },
  ];

  for (const query of commonQueries) {
    const key = `colleges:filter:${JSON.stringify(query)}`;
    const data = await College.find(query);
    await cache.set(key, { colleges: data }, { ttl: 86400 });
  }
}

// Call in index.ts after server starts
await warmCache();
```

---

## 🎓 Step-by-Step Example: Implement Cache for Feed Router

**Scenario**: You just implemented `feed.routes.ts` and want to add cache

### Before: No Cache

```typescript
// backend/src/routes/feed.routes.ts
import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  const { db } = req.firebase;
  const { userId, page = 1, limit = 20 } = req.query;

  // Query Firestore
  const snapshot = await db
    .collection('Posts')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset((page - 1) * limit)
    .get();

  const posts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return res.json({ posts, page, hasMore: posts.length === limit });
});

export default router;
```

**Performance**: ~600ms per request

---

### After: With Cache (Step-by-Step)

#### Step 1: Add Imports & Constants (1 minute)

```typescript
// backend/src/routes/feed.routes.ts
import { Router } from 'express';
import { getCacheService } from '../services/cache.service.js'; // ← ADD
import { logger } from '../utils/logger.js'; // ← ADD

const router = Router();

// ← ADD: Cache configuration
const CACHE_TTL = 300; // 5 minutes (feeds change frequently)
const CACHE_PREFIX = 'feeds';

router.get('/', async (req, res) => {
  // ... rest of code
});
```

#### Step 2: Add Cache Check (1 minute)

```typescript
router.get('/', async (req, res) => {
  const { db } = req.firebase;
  const { userId, page = 1, limit = 20 } = req.query;

  // ← ADD: Generate cache key
  const cacheKey = `${CACHE_PREFIX}:user:${userId}:page:${page}:limit:${limit}`;

  // ← ADD: Check cache
  const cache = getCacheService();
  const cached = await cache.get(cacheKey);
  if (cached) {
    logger.info('[Feeds] Cache HIT', { userId, page });
    return res.json(cached);
  }

  logger.info('[Feeds] Cache MISS', { userId, page });

  // KEEP: Existing database query
  const snapshot = await db
    .collection('Posts')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset((page - 1) * limit)
    .get();

  const posts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const result = { posts, page, hasMore: posts.length === limit };

  // ← ADD: Save to cache
  await cache.set(cacheKey, result, {
    ttl: CACHE_TTL,
    tags: ['feeds', `user:${userId}`],
  });

  return res.json(result);
});
```

#### Step 3: Add Cache Invalidation for Write Ops (30 seconds)

```typescript
// If you have POST endpoint to create posts
router.post('/posts', async (req, res) => {
  const { db } = req.firebase;
  const { userId, content } = req.body;

  // Create post
  const post = await db.collection('Posts').add({
    userId,
    content,
    createdAt: new Date(),
  });

  // ← ADD: Invalidate user's feed cache
  const cache = getCacheService();
  await cache.invalidateTags([`user:${userId}`]);

  return res.json({ id: post.id });
});
```

#### Step 4: Test (2 minutes)

```bash
# Build
npm run build --workspace=@nxt1/backend

# Test 1: First request (cache miss)
curl "http://localhost:3000/api/v1/feed?userId=123&page=1"
# Expected: ~600ms, log shows "Cache MISS"

# Test 2: Second request (cache hit)
curl "http://localhost:3000/api/v1/feed?userId=123&page=1"
# Expected: ~25ms, log shows "Cache HIT" ✅

# Test 3: Different page (cache miss)
curl "http://localhost:3000/api/v1/feed?userId=123&page=2"
# Expected: ~600ms, log shows "Cache MISS"

# Test 4: Create new post (invalidates cache)
curl -X POST "http://localhost:3000/api/v1/feed/posts" \
  -H "Content-Type: application/json" \
  -d '{"userId":"123","content":"New post"}'

# Test 5: Request again (cache miss - invalidated)
curl "http://localhost:3000/api/v1/feed?userId=123&page=1"
# Expected: ~600ms, log shows "Cache MISS"
```

**Performance Result**:

- First request: 600ms
- Cached requests: 25ms ⚡ **24x faster!**
- Cache hit rate: 90-95% after warmup

---

## 🔧 Troubleshooting

### Issue 1: Cache Not Working (Always Cache MISS)

**Symptoms**:

```bash
[Feeds] Cache MISS   # Request 1
[Feeds] Cache MISS   # Request 2 ← Should be HIT!
[Feeds] Cache MISS   # Request 3
```

**Common Causes**:

#### Cause A: Inconsistent Cache Key

```typescript
// ❌ BAD - Random cache key each time!
const cacheKey = `feeds:${Date.now()}:${userId}`;

// ✅ GOOD - Consistent cache key
const cacheKey = `feeds:user:${userId}:page:${page}`;
```

#### Cause B: Cache Key Includes Timestamps

```typescript
// ❌ BAD - Cache key changes every request
const cacheKey = `feeds:${userId}:${new Date().toISOString()}`;

// ✅ GOOD - Cache key based on query params only
const cacheKey = `feeds:user:${userId}:page:${page}`;
```

#### Cause C: Using Wrong Variable

```typescript
// ❌ BAD - Using request object (different each time)
const cacheKey = `feeds:${JSON.stringify(req.query)}`;
// Result: "feeds:{"userId":"123","timestamp":"..."}"

// ✅ GOOD - Extract specific params
const { userId, page } = req.query;
const cacheKey = `feeds:user:${userId}:page:${page}`;
```

---

### Issue 2: Cache Serving Stale Data

**Symptoms**: Data updated but old data still returned

**Solutions**:

#### Solution A: Reduce TTL

```typescript
// If data changes frequently
const CACHE_TTL = 60; // 1 minute instead of 5 minutes
```

#### Solution B: Add Cache Invalidation

```typescript
router.post('/posts', async (req, res) => {
  await Post.create(req.body);

  // ADD: Invalidate related caches
  await cache.invalidateTags(['feeds', `user:${userId}`]);

  return res.json({ success: true });
});
```

#### Solution C: Use More Specific Tags

```typescript
// Set cache with multiple tags
await cache.set(cacheKey, data, {
  ttl: 300,
  tags: ['feeds', `user:${userId}`, `feed:${feedId}`],
});

// Invalidate specific feed only
await cache.invalidateTags([`feed:${feedId}`]);
```

---

### Issue 3: High Memory Usage

**Symptoms**: Redis using too much memory

**Solutions**:

#### Solution A: Reduce TTL

```typescript
// Shorter TTL = less data in cache
const CACHE_TTL = 300; // 5 minutes instead of 1 hour
```

#### Solution B: Cache Smaller Objects

```typescript
// ❌ BAD - Caching too much data
const posts = await Post.find({}).populate('author', 'comments', 'likes');
await cache.set(key, { posts }); // Could be 10MB+

// ✅ GOOD - Cache only necessary fields
const posts = await Post.find({}).select('id title author createdAt');
await cache.set(key, { posts }); // ~100KB
```

#### Solution C: Use Pagination

```typescript
// Don't cache unlimited results
const cacheKey = `posts:all`; // ❌ Could be huge!

// Cache per page
const cacheKey = `posts:page:${page}:limit:${limit}`; // ✅ Bounded size
```

---

### Issue 4: Cache Not Invalidating

**Symptoms**: Update data but cache still returns old data

**Check**:

#### Check A: Verify Invalidation Called

```typescript
router.put('/posts/:id', async (req, res) => {
  await Post.updateOne({ _id: id }, req.body);

  // ADD THIS:
  const cache = getCacheService();
  await cache.invalidateTags(['posts']);
  logger.info('[Posts] Cache invalidated'); // ← Add log

  return res.json({ success: true });
});
```

#### Check B: Tags Match

```typescript
// When setting cache
await cache.set(key, data, { tags: ['posts'] }); // ← 'posts'

// When invalidating
await cache.invalidateTags(['posts']); // ← Must match!

// ❌ Won't work if mismatch:
await cache.invalidateTags(['post']); // Wrong tag!
```

#### Check C: Redis Connection

```bash
# Test Redis is working
redis-cli ping
# Expected: PONG

# Check if invalidation command reaches Redis
redis-cli MONITOR
# Then trigger invalidation and watch logs
```

---

### Issue 5: Build Errors After Adding Cache

**Error**: `Cannot find module '../services/cache.service.js'`

**Solutions**:

#### Solution A: Check Import Path

```typescript
// If router is in backend/src/routes/
import { getCacheService } from '../services/cache.service.js'; // ✅

// If router is in backend/src/routes/subfolder/
import { getCacheService } from '../../services/cache.service.js'; // ✅
```

#### Solution B: Check File Extension

```typescript
import { getCacheService } from '../services/cache.service.js'; // ✅ .js
import { getCacheService } from '../services/cache.service'; // ❌ Missing .js
```

#### Solution C: Rebuild

```bash
npm run build --workspace=@nxt1/backend
```

---

## 📚 Additional Resources

- [colleges.routes.ts](../backend/src/routes/colleges.routes.ts) - Complete
  working example
- [explore.routes.ts](../backend/src/routes/explore.routes.ts) - Advanced
  implementation
- [CACHE-STATUS-REPORT.md](./CACHE-STATUS-REPORT.md) - Current implementation
  status
- [packages/cache/README.md](../packages/cache/README.md) - Cache package
  documentation

---

## 🎯 Final Checklist: When Updating ANY Router

- [ ] **Determine if should cache**: GET endpoint? Not user-specific? ✅
- [ ] **Choose TTL**: Based on data type (see Quick Reference) ✅
- [ ] **Add 2 imports**: `getCacheService`, `logger` ✅
- [ ] **Add 2 constants**: `CACHE_TTL`, `CACHE_PREFIX` ✅
- [ ] **For GET**: Add cache check → query → save (5 lines) ✅
- [ ] **For POST/PUT/DELETE**: Add invalidation (2 lines) ✅
- [ ] **Build**: `npm run build --workspace=@nxt1/backend` ✅
- [ ] **Test**: 2 identical requests → See "Cache HIT" on 2nd ✅
- [ ] **Verify logs**: Check both "Cache HIT" and "Cache MISS" ✅
- [ ] **Commit**: `git commit -m "feat(cache): Add cache to router-name"` ✅

**Time Investment**: 5-10 minutes per router  
**Performance Gain**: 20-26x faster responses  
**Code Added**: ~15 lines total  
**Maintenance**: Zero (automatic TTL expiration)

---

**That's it!** Copy templates → Customize 3 things → Build → Test → Done! 🎉

**Time per router**: ~5 minutes  
**Expected speedup**: 20-26x faster  
**Cost savings**: 95% reduction

---

**Last Updated**: February 14, 2026  
**Redis**: ✅ Operational & Ready  
**Coverage**: 100% of implemented routers  
**Your Turn**: Pick a router and add cache! 🚀
