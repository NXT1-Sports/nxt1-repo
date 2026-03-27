/**
 * @fileoverview Feed Hydration Service
 * @module @nxt1/backend/services/feed-hydration
 *
 * Resolves FeedPointer arrays (stored in Redis by the background worker)
 * into fully hydrated FeedItem[] arrays. This is the core of the
 * Materialized View pattern for the Explore/Trending feeds.
 *
 * Architecture:
 *   Redis key "explore:feed:pointers" → FeedPointer[]
 *     → group by collection
 *     → batch-fetch Firestore docs (getAll)
 *     → map to FeedItem variants
 *     → return sorted array
 *
 * This service also powers the /feed/trending and /feed/discover endpoints.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { FeedItem, FeedPointer, FeedAuthor } from '@nxt1/core/feed';
import type { FirestorePostDoc, UserProfile } from '../adapters/firestore-posts.adapter.js';
import {
  firestorePostToFeedPost,
  userProfileToFeedAuthor,
} from '../adapters/firestore-posts.adapter.js';
import {
  feedPostToFeedItem,
  eventDocToFeedItemEvent,
  statDocToFeedItemStat,
} from '@nxt1/core/feed';
import { getCacheService } from './cache.service.js';
import { logger } from '../utils/logger.js';

// ============================================
// CONSTANTS
// ============================================

/** Redis key for the explore feed pointer array */
export const EXPLORE_FEED_KEY = 'explore:feed:pointers';
/** Redis key for the trending feed pointer array */
export const TRENDING_FEED_KEY = 'trending:feed:pointers';

// ============================================
// SERVICE CLASS
// ============================================

export class FeedHydrationService {
  constructor(private readonly db: Firestore) {}

  /**
   * Hydrate an array of FeedPointers into fully resolved FeedItem[].
   *
   * Groups pointers by Firestore collection, batch-fetches documents,
   * resolves author data, and maps each to the correct FeedItem variant.
   */
  async hydrate(pointers: readonly FeedPointer[]): Promise<FeedItem[]> {
    if (pointers.length === 0) return [];

    logger.debug('[FeedHydration] Hydrating pointers', { count: pointers.length });

    // Group pointers by collection for efficient batch reads
    const grouped = this.groupByCollection(pointers);

    // Batch-fetch all documents concurrently
    const [postDocs, eventDocs, statDocs] = await Promise.all([
      this.batchFetchDocs(grouped.get('Posts') ?? []),
      this.batchFetchDocs(grouped.get('Events') ?? []),
      this.batchFetchDocs(grouped.get('PlayerStats') ?? []),
    ]);

    // Collect all unique user IDs for author enrichment
    const userIds = new Set<string>();
    for (const [, data] of postDocs) {
      if (data?.['userId']) userIds.add(data['userId'] as string);
    }
    for (const [, data] of eventDocs) {
      if (data?.['userId']) userIds.add(data['userId'] as string);
    }
    for (const [, data] of statDocs) {
      if (data?.['userId']) userIds.add(data['userId'] as string);
    }

    // Batch-fetch user profiles for author enrichment
    const authorMap = await this.batchFetchAuthors([...userIds]);

    // Map documents to FeedItem variants
    const items: FeedItem[] = [];

    for (const [id, data] of postDocs) {
      if (!data) continue;
      const authorId = data['userId'] as string;
      const author = authorMap.get(authorId);
      if (!author) continue;
      const feedPost = firestorePostToFeedPost(id, data as unknown as FirestorePostDoc, author);
      items.push(feedPostToFeedItem(feedPost));
    }

    for (const [id, data] of eventDocs) {
      if (!data) continue;
      const authorId = data['userId'] as string;
      const author = authorMap.get(authorId);
      if (!author) continue;
      items.push(
        eventDocToFeedItemEvent(
          id,
          {
            date:
              typeof data['date'] === 'string'
                ? data['date']
                : this.firestoreTimestampToISO(data['date']),
            opponent: data['opponent'] as string | undefined,
            opponentLogoUrl: data['opponentLogoUrl'] as string | undefined,
            location: data['location'] as string | undefined,
            isHome: data['isHome'] as boolean | undefined,
            status: data['status'] as string | undefined,
            result: data['result'] as
              | {
                  teamScore?: number;
                  opponentScore?: number;
                  outcome?: string;
                  overtime?: boolean;
                }
              | undefined,
            sport: data['sport'] as string | undefined,
            teamId: data['teamId'] as string | undefined,
          },
          author
        )
      );
    }

    for (const [id, data] of statDocs) {
      if (!data) continue;
      const authorId = data['userId'] as string;
      const author = authorMap.get(authorId);
      if (!author) continue;
      const statsArray = Array.isArray(data['stats']) ? data['stats'] : [];
      if (statsArray.length === 0) continue;

      items.push(
        statDocToFeedItemStat(
          id,
          {
            createdAt:
              typeof data['createdAt'] === 'string'
                ? data['createdAt']
                : this.firestoreTimestampToISO(data['createdAt']),
            context: data['season']
              ? `${data['season']} ${data['sportId'] ?? ''} Season Stats`.trim()
              : 'Season Stats',
            stats: statsArray.map((s: Record<string, unknown>) => ({
              label: String(s['label'] ?? s['name'] ?? ''),
              value: s['value'] != null ? (s['value'] as string | number) : 0,
              unit: s['unit'] as string | undefined,
              isHighlight: s['isHighlight'] as boolean | undefined,
            })),
          },
          author
        )
      );
    }

    // Preserve pointer ordering (ranked by score)
    const itemMap = new Map(items.map((item) => [this.normalizeItemId(item), item]));
    const orderedItems: FeedItem[] = [];
    for (const pointer of pointers) {
      const key = `${pointer.feedType}-${pointer.id}`;
      const item = itemMap.get(key);
      if (item) orderedItems.push(item);
    }

    // Add any items not matched by pointer key (fallback)
    for (const item of items) {
      const key = this.normalizeItemId(item);
      if (!orderedItems.some((o) => this.normalizeItemId(o) === key)) {
        orderedItems.push(item);
      }
    }

    logger.debug('[FeedHydration] Hydration complete', {
      requested: pointers.length,
      resolved: orderedItems.length,
    });

    return orderedItems;
  }

  /**
   * Get the explore feed from Redis pointers and hydrate.
   * Falls back to live Firestore query if Redis is empty.
   */
  async getExploreFeed(limit: number, offset = 0): Promise<FeedItem[]> {
    const cache = getCacheService();
    const pointers = await cache.get<FeedPointer[]>(EXPLORE_FEED_KEY);

    if (pointers && pointers.length > 0) {
      const page = pointers.slice(offset, offset + limit);
      return this.hydrate(page);
    }

    logger.debug('[FeedHydration] No explore pointers in cache, falling back to live query');
    return this.fallbackExploreFeed(limit);
  }

  /**
   * Get the trending feed from Redis pointers and hydrate.
   */
  async getTrendingFeed(limit: number, offset = 0): Promise<FeedItem[]> {
    const cache = getCacheService();
    const pointers = await cache.get<FeedPointer[]>(TRENDING_FEED_KEY);

    if (pointers && pointers.length > 0) {
      const page = pointers.slice(offset, offset + limit);
      return this.hydrate(page);
    }

    logger.debug('[FeedHydration] No trending pointers in cache, using explore fallback');
    return this.getExploreFeed(limit, offset);
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /**
   * Group pointers by their Firestore collection name.
   */
  private groupByCollection(pointers: readonly FeedPointer[]): Map<string, FeedPointer[]> {
    const map = new Map<string, FeedPointer[]>();
    for (const pointer of pointers) {
      const existing = map.get(pointer.collection) ?? [];
      existing.push(pointer);
      map.set(pointer.collection, existing);
    }
    return map;
  }

  /**
   * Batch-fetch Firestore documents by pointer IDs.
   * Uses getAll() for efficient reads (max 500 per batch).
   */
  private async batchFetchDocs(
    pointers: FeedPointer[]
  ): Promise<Map<string, Record<string, unknown> | null>> {
    const result = new Map<string, Record<string, unknown> | null>();
    if (pointers.length === 0) return result;

    const collection = pointers[0].collection;

    // Process in chunks of 500 (Firestore getAll limit)
    for (let i = 0; i < pointers.length; i += 500) {
      const chunk = pointers.slice(i, i + 500);
      const refs = chunk.map((p) => this.db.collection(collection).doc(p.id));

      try {
        const snapshots = await this.db.getAll(...refs);
        for (const snap of snapshots) {
          if (snap.exists) {
            result.set(snap.id, snap.data() as Record<string, unknown>);
          } else {
            result.set(snap.id, null);
          }
        }
      } catch (err) {
        logger.error('[FeedHydration] Batch fetch failed', {
          collection,
          count: chunk.length,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  /**
   * Batch-fetch user profiles for author enrichment.
   */
  private async batchFetchAuthors(userIds: string[]): Promise<Map<string, FeedAuthor>> {
    const map = new Map<string, FeedAuthor>();
    if (userIds.length === 0) return map;

    // Process in chunks of 10 (Firestore 'in' query limit)
    for (let i = 0; i < userIds.length; i += 10) {
      const chunk = userIds.slice(i, i + 10);
      try {
        const snap = await this.db.collection('Users').where('__name__', 'in', chunk).get();

        for (const doc of snap.docs) {
          const d = doc.data();
          const profile: UserProfile = {
            uid: doc.id,
            displayName: (d['displayName'] as string) || 'Unknown User',
            photoURL: d['photoURL'] as string | undefined,
            role: d['role'] as string | undefined,
            sport: d['sport'] as string | undefined,
            position: d['position'] as string | undefined,
            schoolName: d['schoolName'] as string | undefined,
            isVerified: d['isVerified'] as boolean | undefined,
            verificationStatus: d['verificationStatus'] as string | undefined,
            profileCode: d['profileCode'] as string | undefined,
            firstName: d['firstName'] as string | undefined,
            lastName: d['lastName'] as string | undefined,
            classYear: d['classYear'] as string | undefined,
            schoolLogoUrl: d['schoolLogoUrl'] as string | undefined,
          };
          map.set(doc.id, userProfileToFeedAuthor(profile));
        }
      } catch (err) {
        logger.error('[FeedHydration] Failed to fetch user batch', {
          chunk,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return map;
  }

  /**
   * Fallback: live Firestore query for explore when Redis is empty.
   * Fetches recent public posts sorted by engagement.
   */
  private async fallbackExploreFeed(limit: number): Promise<FeedItem[]> {
    try {
      const snap = await this.db
        .collection('Posts')
        .where('visibility', '==', 'PUBLIC')
        .where('deletedAt', '==', null)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();

      const posts = snap.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as FirestorePostDoc,
      }));

      const userIds = [...new Set(posts.map((p) => p.data.userId))];
      const authorMap = await this.batchFetchAuthors(userIds);

      const items: FeedItem[] = [];
      for (const post of posts) {
        const author = authorMap.get(post.data.userId);
        if (!author) continue;
        const feedPost = firestorePostToFeedPost(post.id, post.data, author);
        items.push(feedPostToFeedItem(feedPost));
      }

      return items;
    } catch (err) {
      logger.error('[FeedHydration] Fallback explore query failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Normalize item ID for pointer-to-item matching.
   */
  private normalizeItemId(item: FeedItem): string {
    // Item IDs are prefixed (e.g., "event-abc123", "stat-xyz")
    // Pointers use feedType + raw doc ID
    return `${item.feedType}-${item.id.replace(/^(event|stat|offer|visit|camp)-/, '')}`;
  }

  /**
   * Safely convert a Firestore Timestamp-like object to ISO string.
   */
  private firestoreTimestampToISO(ts: unknown): string {
    if (ts && typeof ts === 'object' && 'toDate' in ts) {
      return (ts as { toDate(): Date }).toDate().toISOString();
    }
    if (typeof ts === 'string') return ts;
    return new Date().toISOString();
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Create a FeedHydrationService instance.
 */
export function createFeedHydrationService(db: Firestore): FeedHydrationService {
  return new FeedHydrationService(db);
}
