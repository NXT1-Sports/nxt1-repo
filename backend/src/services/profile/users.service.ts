/**
 * @fileoverview Users Service
 * @module @nxt1/backend/services/users
 *
 * User data fetching with Redis caching.
 * Single source of truth for user data across team profiles, posts, etc.
 *
 * ✅ Uses Redis caching from @nxt1/cache
 * ✅ Uses error handling from @nxt1/core/errors
 * ✅ Uses cache TTL from @nxt1/core/constants
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getCacheService } from '../core/cache.service.js';
import { logger } from '../../utils/logger.js';
import { CACHE_CONFIG } from '@nxt1/core';

let defaultDb: FirebaseFirestore.Firestore | null = null;
const getDefaultDb = (): FirebaseFirestore.Firestore => {
  if (defaultDb) return defaultDb;
  defaultDb = getFirestore();
  return defaultDb;
};
const USERS_COLLECTION = 'Users';
const getCache = () => getCacheService();

// ============================================
// CACHE KEYS & TTL (from @nxt1/core)
// ============================================

// Use centralized cache TTL from @nxt1/core
// Users data changes infrequently, use MEDIUM_TTL (15 minutes)
const CACHE_TTL_MS = CACHE_CONFIG.MEDIUM_TTL; // 15 minutes
const CACHE_TTL = Math.floor(CACHE_TTL_MS / 1000); // Convert to seconds for Redis

export const CACHE_KEYS = {
  USER_BY_ID: (userId: string) => `users:${userId}`,
  USERS_BATCH: (userIds: string[]) => `users:batch:${userIds.sort().join(',')}`,
};

// ============================================
// TYPES
// ============================================

export interface UserData {
  id: string;
  [key: string]: unknown;
}

// ============================================
// SERVICE FUNCTIONS
// ============================================

/**
 * Fetch multiple users by IDs (with Redis caching)
 *
 * @param userIds - Array of user IDs to fetch
 * @param firestore - Optional Firestore instance (for staging vs production)
 * @returns Array of user data (only existing users)
 *
 * @example
 * ```ts
 * const users = await getUsersByIds(['user1', 'user2', 'user3'], req.firebase.db);
 * // [{ id: 'user1', name: 'John', ... }, ...]
 * ```
 */
export async function getUsersByIds(
  userIds: string[],
  firestore?: FirebaseFirestore.Firestore
): Promise<UserData[]> {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }

  // Use provided Firestore instance or default to production
  const firestoreDb = firestore ?? getDefaultDb();

  // Deduplicate and sort for consistent cache keys
  const uniqueIds = [...new Set(userIds)];
  const cacheKey = CACHE_KEYS.USERS_BATCH(uniqueIds);

  // Try Redis cache first
  const cache = getCache();
  const cached = await cache.get<UserData[]>(cacheKey);
  if (cached) {
    logger.info('[getUsersByIds] ✅ Cache HIT', {
      count: cached.length,
      cacheKey: cacheKey.substring(0, 50) + '...',
    });
    return cached;
  }

  logger.info('[getUsersByIds] ❌ Cache MISS - fetching from Firestore', {
    count: uniqueIds.length,
  });

  // Fetch from Firestore in parallel
  const userDocs = await Promise.all(
    uniqueIds.map((uid) => firestoreDb.collection(USERS_COLLECTION).doc(uid).get())
  );

  // Map to user data (filter out non-existent users)
  const users: UserData[] = userDocs
    .filter((doc) => doc.exists)
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

  logger.info('[getUsersByIds] ✅ Fetched from Firestore', {
    requested: uniqueIds.length,
    found: users.length,
  });

  // Cache the result in Redis
  await cache.set(cacheKey, users, { ttl: CACHE_TTL });
  logger.debug('[getUsersByIds] ✅ Cached in Redis', { ttl: CACHE_TTL });

  return users;
}

/**
 * Fetch a single user by ID (with Redis caching)
 *
 * @param userId - User ID to fetch
 * @param firestore - Optional Firestore instance (for staging vs production)
 * @returns User data or null if not found
 */
export async function getUserById(
  userId: string,
  firestore?: FirebaseFirestore.Firestore
): Promise<UserData | null> {
  if (!userId) return null;

  // Use provided Firestore instance or default to production
  const firestoreDb = firestore ?? getDefaultDb();

  const cacheKey = CACHE_KEYS.USER_BY_ID(userId);

  // Try Redis cache first
  const cache = getCache();
  const cached = await cache.get<UserData>(cacheKey);
  if (cached) {
    logger.info('[getUserById] ✅ Cache HIT', { userId });
    return cached;
  }

  logger.info('[getUserById] ❌ Cache MISS - fetching from Firestore', { userId });

  // Fetch from Firestore
  const userDoc = await firestoreDb.collection(USERS_COLLECTION).doc(userId).get();

  if (!userDoc.exists) {
    logger.warn('[getUserById] User not found', { userId });
    return null;
  }

  const userData: UserData = {
    id: userDoc.id,
    ...userDoc.data(),
  };

  // Cache the result in Redis
  await cache.set(cacheKey, userData, { ttl: CACHE_TTL });
  logger.debug('[getUserById] ✅ Cached in Redis', { userId, ttl: CACHE_TTL });

  return userData;
}
