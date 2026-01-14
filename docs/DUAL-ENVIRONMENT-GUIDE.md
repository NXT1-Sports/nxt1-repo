# Dual Environment API Guide - Production & Staging

Complete guide for working with production and staging environments in the NXT1
backend.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Setup](#setup)
4. [Writing Routes](#writing-routes)
5. [Testing](#testing)
6. [Files Created](#files-created)

---

## Overview

The backend supports **2 independent API environments** running in parallel:

### 🟢 Production Environment

- **Base URL**: `/api/v1/*`
- **Firebase Account**: `FIREBASE_SERVICE_ACCOUNT`
- **Storage Bucket**: `FIREBASE_STORAGE_BUCKET`
- **Use Case**: Live production data

### 🟡 Staging Environment

- **Base URL**: `/api/v1/staging/*`
- **Firebase Account**: `STAGING_FIREBASE_SERVICE_ACCOUNT`
- **Storage Bucket**: `STAGING_FIREBASE_STORAGE_BUCKET`
- **Use Case**: Testing with staging data before production

**Key Feature**: Same code serves both environments - middleware automatically
detects and injects the correct Firebase instance.

---

## Architecture

### How It Works

```
┌─────────────────────────────────────────────────┐
│  Client Request                                 │
│  POST /api/v1/auth/login                       │
│  POST /api/v1/staging/auth/login               │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│  firebaseContext Middleware                     │
│                                                 │
│  if (req.originalUrl.includes('/staging/')) {  │
│    req.firebase = stagingFirebase              │
│    req.isStaging = true                        │
│  } else {                                      │
│    req.firebase = productionFirebase           │
│    req.isStaging = false                       │
│  }                                             │
└─────────────┬───────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────┐
│  Route Handler                                  │
│                                                 │
│  const { db, auth, storage } = req.firebase;   │
│  // Uses correct environment automatically     │
│  await db.collection('Users').get();           │
└─────────────────────────────────────────────────┘
```

### Why This Approach?

1. **Single Codebase**: Write once, runs in both environments
2. **No Duplication**: Don't need separate staging routes
3. **Type Safe**: Full TypeScript support
4. **Easy Testing**: Switch environments by changing URL
5. **Independent Data**: Each environment has its own Firebase instance

---

## Setup

### 1. Environment Variables

Create `.env` file in `backend/` directory:

```env
# Server
PORT=3000
NODE_ENV=development

# Production Firebase
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"nxt-1-de054",...}'
FIREBASE_STORAGE_BUCKET='nxt-1-de054.appspot.com'

# Staging Firebase
STAGING_FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"nxt-1-staging",...}'
STAGING_FIREBASE_STORAGE_BUCKET='nxt-1-staging.appspot.com'
```

### 2. Firebase Instances

**Production** (`src/utils/firebase.ts`):

```typescript
import admin from 'firebase-admin';

const app = admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)
  ),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

export const db = admin.firestore();
export const auth = admin.auth();
export const storage = admin.storage();
```

**Staging** (`src/utils/firebase-staging.ts`):

```typescript
import admin from 'firebase-admin';

const stagingApp = admin.initializeApp(
  {
    credential: admin.credential.cert(
      JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT!)
    ),
    storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
  },
  'staging' // Named app instance
);

export const stagingDb = admin.firestore(stagingApp);
export const stagingAuth = admin.auth(stagingApp);
export const stagingStorage = admin.storage(stagingApp);
```

### 3. Middleware

**Firebase Context** (`src/middleware/firebase-context.middleware.ts`):

```typescript
import type { Request, Response, NextFunction } from 'express';
import { db, auth, storage } from '../utils/firebase.js';
import {
  stagingDb,
  stagingAuth,
  stagingStorage,
} from '../utils/firebase-staging.js';

export const firebaseContext = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isStaging = req.originalUrl.includes('/staging/');

  if (isStaging) {
    req.firebase = {
      db: stagingDb,
      auth: stagingAuth,
      storage: stagingStorage,
    };
    req.isStaging = true;

    if (process.env.NODE_ENV === 'development') {
      console.log('🟡 [Staging] Request:', req.method, req.originalUrl);
    }
  } else {
    req.firebase = {
      db,
      auth,
      storage,
    };
    req.isStaging = false;

    if (process.env.NODE_ENV === 'development') {
      console.log('🟢 [Production] Request:', req.method, req.originalUrl);
    }
  }

  next();
};
```

### 4. Type Extensions

**Express Types** (`src/types/express.d.ts`):

```typescript
import type { Firestore, Auth, Storage } from 'firebase-admin';

declare global {
  namespace Express {
    interface Request {
      firebase: {
        db: Firestore;
        auth: Auth;
        storage: Storage;
      };
      isStaging: boolean;
    }
  }
}
```

### 5. Register Middleware

**Server Entry** (`src/index.ts`):

```typescript
import express from 'express';
import { firebaseContext } from './middleware/firebase-context.middleware.js';
import authRoutes from './routes/auth.routes.js';

const app = express();

// Parse JSON
app.use(express.json());

// Apply Firebase context BEFORE routes
app.use(firebaseContext);

// Register routes for BOTH environments
app.use('/api/v1/auth', authRoutes); // Production
app.use('/api/v1/staging/auth', authRoutes); // Staging

app.listen(3000, () => {
  console.log('✅ Server running on http://localhost:3000');
  console.log('🟢 Production: /api/v1/*');
  console.log('🟡 Staging:    /api/v1/staging/*');
});
```

---

## Writing Routes

### Basic Pattern

Every route handler follows this pattern:

```typescript
import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

router.method('/endpoint', async (req: Request, res: Response) => {
  try {
    // 1. Destructure Firebase services at the top
    const { db, auth, storage } = req.firebase;

    // 2. Optional: Check environment for conditional logic
    if (req.isStaging) {
      // Do something specific for staging
    }

    // 3. Use Firebase services directly
    const result = await db.collection('Collection').get();

    // 4. Return response
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Route] Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
```

**✅ Destructure once at the top:**

```typescript
router.post('/create-user', async (req, res) => {
  const { db } = req.firebase; // Once per handler

  const user = await db.collection('Users').doc(uid).get();
  await db.collection('Users').doc(uid).set(data);
  await db.collection('Logs').add(log);
  // Clean and readable
});
```

### Example 1: Simple GET Route

```typescript
// routes/users.routes.ts
import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

/**
 * GET /users/:id
 * Get user by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { db } = req.firebase;
    const { id } = req.params;

    const doc = await db.collection('Users').doc(id).get();

    if (!doc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: {
        id: doc.id,
        ...doc.data(),
      },
    });
  } catch (error) {
    console.error('[Users] Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;
```

### Example 2: POST with Validation

```typescript
// routes/posts.routes.ts
import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

/**
 * POST /posts
 * Create a new post
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { db } = req.firebase;
    const { title, content, authorId } = req.body;

    // Validation
    if (!title || !content || !authorId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Check author exists
    const author = await db.collection('Users').doc(authorId).get();
    if (!author.exists) {
      res.status(404).json({ error: 'Author not found' });
      return;
    }

    // Create post
    const postRef = await db.collection('Posts').add({
      title,
      content,
      authorId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      postId: postRef.id,
    });
  } catch (error) {
    console.error('[Posts] Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

export default router;
```

### Example 3: Using Multiple Services

```typescript
// routes/files.routes.ts
import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

/**
 * POST /files/upload
 * Upload file with metadata
 */
router.post('/upload', async (req: Request, res: Response): Promise<void> => {
  try {
    // Destructure all needed services
    const { db, storage, auth } = req.firebase;
    const { userId, fileName, fileData } = req.body;

    // Verify user with Auth
    const user = await auth.getUser(userId);
    if (!user) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    // Upload to Storage
    const bucket = storage.bucket();
    const file = bucket.file(`uploads/${userId}/${fileName}`);
    await file.save(Buffer.from(fileData, 'base64'));

    const downloadUrl = await file.getSignedUrl({
      action: 'read',
      expires: '03-01-2500',
    });

    // Save metadata to Firestore
    await db.collection('Files').add({
      userId,
      fileName,
      url: downloadUrl[0],
      uploadedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      url: downloadUrl[0],
    });
  } catch (error) {
    console.error('[Files] Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

export default router;
```

### Example 4: Environment-Specific Logic

```typescript
// routes/admin.routes.ts
import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

/**
 * DELETE /admin/users/:id
 * Delete user (with safety checks)
 */
router.delete(
  '/users/:id',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { db, auth } = req.firebase;
      const { id } = req.params;

      // Extra safety: Don't allow deletion in production without confirmation
      if (!req.isStaging && !req.body.confirmed) {
        res.status(403).json({
          error: 'Production deletion requires confirmation',
          hint: 'Send { "confirmed": true } in body',
        });
        return;
      }

      // Delete from Auth
      await auth.deleteUser(id);

      // Delete from Firestore
      await db.collection('Users').doc(id).delete();

      const env = req.isStaging ? 'staging' : 'production';
      console.log(`🗑️ User ${id} deleted from ${env}`);

      res.json({ success: true, message: 'User deleted' });
    } catch (error) {
      console.error('[Admin] Delete user error:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

export default router;
```

### Registering New Routes

After creating a route file, register it in `index.ts`:

```typescript
// src/index.ts
import usersRoutes from './routes/users.routes.js';
import postsRoutes from './routes/posts.routes.js';
import filesRoutes from './routes/files.routes.js';

// Production routes
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/posts', postsRoutes);
app.use('/api/v1/files', filesRoutes);

// Staging routes (same code!)
app.use('/api/v1/staging/users', usersRoutes);
app.use('/api/v1/staging/posts', postsRoutes);
app.use('/api/v1/staging/files', filesRoutes);
```

**That's it!** Both environments work with zero code duplication.

---

## Testing

### Test Production Endpoints

```bash
# Get user from production
curl http://localhost:3000/api/v1/users/user123

# Create post in production
curl -X POST http://localhost:3000/api/v1/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello World",
    "content": "This is a test post",
    "authorId": "user123"
  }'
```

### Test Staging Endpoints

```bash
# Get user from staging
curl http://localhost:3000/api/v1/staging/users/user123

# Create post in staging
curl -X POST http://localhost:3000/api/v1/staging/posts \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Hello World",
    "content": "This is a test post",
    "authorId": "user123"
  }'
```

### Verify Environment Detection

Check console logs when making requests:

```
🟢 [Production] Request: GET /api/v1/users/user123
🟡 [Staging] Request: POST /api/v1/staging/posts
```

## Key Concepts Summary

### ✅ Do's

- **Destructure once per handler**: `const { db } = req.firebase;`
- **Use descriptive error messages**: Help debug which environment failed
- **Log environment in development**: See which DB you're hitting
- **Test in staging first**: Before pushing to production
- **Keep same route logic**: Let middleware handle environment

### ❌ Don'ts

- **Don't destructure outside handlers**: `req` doesn't exist at module load
- **Don't repeat `req.firebase.db`**: Verbose and harder to read
- **Don't write separate staging routes**: Use same code for both
- **Don't hardcode Firebase instances**: Always use `req.firebase`
- **Don't skip error handling**: Always wrap in try-catch

---

## 🎯 Quick Reference

| Aspect            | Production                 | Staging                            |
| ----------------- | -------------------------- | ---------------------------------- |
| URL Pattern       | `/api/v1/*`                | `/api/v1/staging/*`                |
| Environment Check | `req.isStaging === false`  | `req.isStaging === true`           |
| Console Log       | 🟢 [Production]            | 🟡 [Staging]                       |
| Firebase Env Var  | `FIREBASE_SERVICE_ACCOUNT` | `STAGING_FIREBASE_SERVICE_ACCOUNT` |
| Storage Env Var   | `FIREBASE_STORAGE_BUCKET`  | `STAGING_FIREBASE_STORAGE_BUCKET`  |

---

**That's everything you need to work with dual environments!** 🚀

Write routes once, test in staging, deploy to production. Simple and powerful.
