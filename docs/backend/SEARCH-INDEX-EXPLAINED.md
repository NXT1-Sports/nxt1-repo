# 🔍 Search Index - Detailed Explanation

## ❓ What is searchIndex?

`searchIndex` is an **array of strings** containing lowercase keywords extracted
from document content, enabling text search in Firestore.

### The Problem We're Solving

**Firestore DOES NOT SUPPORT full-text search!**

```typescript
// ❌ CANNOT do this in Firestore:
db.collection('Users').where('name', 'LIKE', '%john%'); // SQL-style search

// ❌ CANNOT search partial strings:
db.collection('Users').where('displayName', 'contains', 'john'); // Doesn't exist!
```

### Solution: searchIndex Array

```typescript
// ✅ Add searchIndex to document:
{
  id: "user123",
  displayName: "John Smith",
  sport: "Basketball",
  location: "Los Angeles",

  // This array enables search!
  searchIndex: [
    "john",
    "smith",
    "john smith",
    "basketball",
    "los",
    "angeles",
    "los angeles"
  ]
}

// ✅ Now we can search:
db.collection('Users')
  .where('searchIndex', 'array-contains', 'john')  // Found!
  .get()
```

## 🎯 Specific Benefits

### 1. Enable Partial Search

**Without searchIndex:**

```typescript
// Search for "John Smith" with query "john"
await db.collection('Users').where('displayName', '==', 'john').get();
// → 0 results ❌ (because "john" ≠ "John Smith")
```

**With searchIndex:**

```typescript
await db
  .collection('Users')
  .where('searchIndex', 'array-contains', 'john')
  .get();
// → 1 result ✅ (found "John Smith")
```

### 2. Case-Insensitive Search

**searchIndex is always lowercase**, so it's case-insensitive:

```typescript
// User input: "BASKETBALL" or "basketball" or "BasketBall"
const normalized = query.toLowerCase(); // → "basketball"

await db
  .collection('Users')
  .where('searchIndex', 'array-contains', normalized)
  .get();
// → Found all! ✅
```

### 3. Multi-Field Search

```typescript
// searchIndex combines multiple fields:
searchIndex: [
  ...from displayName,
  ...from sport,
  ...from location,
  ...from school
]

// One query searches multiple fields!
```

## 🛠️ When Do You Need searchIndex?

### ✅ NEED searchIndex when:

- Want to search text (names, locations, sports, etc.)
- Want to find partial matches ("john" → "John Smith")
- Want case-insensitive search
- Want to search multiple fields at once

### ❌ DON'T NEED searchIndex when:

- Only querying exact matches (`where('id', '==', 'user123')`)
- Only querying numeric fields (`where('age', '>', 18)`)
- Only querying boolean fields (`where('isActive', '==', true)`)

## 📝 Migration Script - FAQ

### 1. Why do we need migration?

**Old documents don't have searchIndex:**

```
Firestore Database (BEFORE search API):
├─ Users/
│  ├─ user1: { name: "John", sport: "Basketball" }
│  ├─ user2: { name: "Jane", sport: "Soccer" }
│  └─ user3: { name: "Mike", sport: "Football" }
└─ ...

❌ No searchIndex → Search API doesn't work!
```

**Migration adds searchIndex to all documents:**

```
Firestore Database (AFTER running migration):
├─ Users/
│  ├─ user1: {
│  │    name: "John",
│  │    sport: "Basketball",
│  │    searchIndex: ["john", "basketball"]  ← ADDED
│  │  }
│  ├─ user2: {
│  │    name: "Jane",
│  │    sport: "Soccer",
│  │    searchIndex: ["jane", "soccer"]  ← ADDED
│  │  }
│  └─ user3: {
│       name: "Mike",
│       sport: "Football",
│       searchIndex: ["mike", "football"]  ← ADDED
│     }
└─ ...

✅ Has searchIndex → Search API works!
```

### 2. Do I need to run it manually?

**IT DEPENDS:**

#### Option A: Run Manually (Recommended)

```bash
# Step 1: Check how many documents need updates
npm run migrate:search-indexes:dry-run

# Output:
# Checking Users...
#   Documents needing index: 1,523
# Checking Colleges...
#   Documents needing index: 342
# ...

# Step 2: Run actual migration
npm run migrate:search-indexes

# Output:
# 🔄 Migrating Users...
#   ✅ Updated 1,523 documents in Users
# 🔄 Migrating Colleges...
#   ✅ Updated 342 documents in Colleges
# ...
# ✅ Migration Complete! (45.2s)
```

**Run once when:**

- First time setting up search
- Database already has data
- Want to enable search for existing documents

#### Option B: Automatic (For New Documents)

When creating/updating new documents, automatically add searchIndex:

```typescript
import { buildAthleteSearchIndex } from '../utils/search-index.js';

// Create new athlete
const athlete = {
  displayName: 'John Smith',
  sport: 'Basketball',
  position: 'Guard',
};

// Automatically build searchIndex
const searchIndex = buildAthleteSearchIndex(athlete);

// Save with searchIndex
await db
  .collection('Users')
  .doc(userId)
  .set({
    ...athlete,
    searchIndex, // ← Automatically added
    createdAt: new Date(),
  });
```

**Or use Cloud Function automatically:**

```typescript
// apps/functions/src/firestore/onUserCreate.ts
export const autoAddSearchIndex = onDocumentCreated(
  'Users/{userId}',
  async (event) => {
    const data = event.data?.data();
    if (!data || data.searchIndex) return; // Already has one, skip

    const searchIndex = buildAthleteSearchIndex(data);
    await event.data?.ref.update({ searchIndex });
  }
);
```

### 3. Do I need to run migration again?

**NO - ONLY RUN ONCE** for old documents.

**After running migration:**

- ✅ Old documents now have searchIndex
- ✅ New documents automatically add searchIndex when created
- ✅ No need to run again

**Only re-run when:**

- Adding new searchable fields (e.g., adding "nickname" field)
- Changing searchIndex build logic
- Data corruption

### 4. What's the impact of migration?

**Performance:**

- Migration runs in batches (100 docs at a time)
- Doesn't block API
- Can run in background

**Firestore costs:**

- Each document: 1 write operation
- Example: 10,000 documents = 10,000 writes
- Free tier: 20,000 writes/day → OK ✅

**Downtime:**

- NO downtime needed
- API continues running normally
- Search only works after migration completes

## 🚀 Complete Workflow

### First Time Setup (ONLY ONCE):

```bash
# 1. Check if migration is needed
cd backend
npm run migrate:search-indexes:dry-run

# 2. Review output, then run migration
npm run migrate:search-indexes

# 3. Verify search works
curl "http://localhost:3000/api/v1/explore/search?q=basketball&tab=athletes"

# ✅ DONE! No need to do again
```

### After That (Automatic):

**When creating new documents, always add searchIndex:**

```typescript
// ✅ CORRECT: Has searchIndex
await db.collection('Users').add({
  displayName: "New User",
  sport: "Soccer",
  searchIndex: buildAthleteSearchIndex({ ... })  // ← Always add
});

// ❌ WRONG: Forgot searchIndex → Cannot search!
await db.collection('Users').add({
  displayName: "New User",
  sport: "Soccer"
  // Missing searchIndex!
});
```

## 📊 Comparison: Before vs After searchIndex

### BEFORE (No searchIndex):

```typescript
// ❌ Only finds exact matches
const results = await db
  .collection('Users')
  .where('displayName', '==', 'John Smith') // Must match 100%
  .get();

// ❌ Cannot find:
// - "john" → Doesn't match "John Smith"
// - "JOHN SMITH" → Different case
// - "smith" → Only searches full name
```

### AFTER (Has searchIndex):

```typescript
// ✅ Finds partial, case-insensitive matches
const results = await db
  .collection('Users')
  .where('searchIndex', 'array-contains', 'john')
  .get();

// ✅ Finds ALL:
// - "John Smith"
// - "Johnny Williams"
// - "john doe"
// - "JOHN ANDERSON"
```

## 🎓 Conclusion

### What is searchIndex?

- Array of lowercase tokens that enables text search in Firestore

### What's the benefit?

- Enables partial search, case-insensitive, multi-field search

### Do I run it manually?

- **ONCE only** for old documents
- **Automatic** for new documents (code must add searchIndex)

### Workflow:

1. Run migration once: `npm run migrate:search-indexes`
2. Verify: `npm run migrate:search-indexes:dry-run` → 0 documents
3. After that: Automatically add searchIndex when creating new documents

---

**TL;DR:** searchIndex is like an "index" in SQL database, but you have to
create it yourself because Firestore doesn't have full-text search. Migration
script adds searchIndex to old documents ONCE, then new documents automatically
have searchIndex when created.
