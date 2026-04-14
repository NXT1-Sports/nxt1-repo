/**
 * @fileoverview Timeline Service — Read-Time Assembly
 * @module @nxt1/backend/services/timeline
 *
 * Implements the 2026 polymorphic timeline architecture.
 * Fetches concurrently from Posts, Events, PlayerStats, Recruiting,
 * PlayerMetrics, and Rankings collections, maps each to the appropriate
 * FeedItem variant, and returns a
 * chronologically sorted FeedItem[] array.
 *
 * This replaces the legacy approach of querying only the Posts collection
 * and embedding domain-specific data as optional fields on a single god object.
 *
 * Data flow:
 *   Promise.all([Posts, Events, PlayerStats, Recruiting, PlayerMetrics, Rankings])
 *     → map each doc → FeedItem variant (via @nxt1/core mappers)
 *     → merge, sort by createdAt desc
 *     → slice to limit
 *
 * NOTE: Videos are consolidated into the Posts collection as type: 'highlight'.
 * There is no separate Videos collection query — highlights come through fetchPosts.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { FeedItem, FeedAuthor, FeedItemResponse } from '@nxt1/core/feed';
import type { FirestorePostDoc } from '../adapters/firestore-posts.adapter.js';
import { firestorePostToFeedPost } from '../adapters/firestore-posts.adapter.js';
import {
  feedPostToFeedItem,
  eventDocToFeedItemEvent,
  statDocToFeedItemStat,
  recruitingDocToFeedItemVariant,
  metricGroupToFeedItemMetric,
  rankingDocToFeedItemAward,
} from '@nxt1/core/feed';
import { logger } from '../utils/logger.js';

// ============================================
// CONSTANTS
// ============================================

const POSTS_COLLECTION = 'Posts';
const EVENTS_COLLECTION = 'Events';
const PLAYER_STATS_COLLECTION = 'PlayerStats';
const RECRUITING_COLLECTION = 'Recruiting';
const PLAYER_METRICS_COLLECTION = 'PlayerMetrics';
const RANKINGS_COLLECTION = 'Rankings';

// ============================================
// TYPES
// ============================================

export interface TimelineOptions {
  /** Maximum number of items to return */
  readonly limit: number;
  /** Filter by sport (optional) */
  readonly sportId?: string;
  /** Current viewer's user ID (for engagement state) */
  readonly viewerUserId?: string;
  /** Cursor for pagination (ISO timestamp of last item) */
  readonly cursor?: string;
}

// ============================================
// SERVICE CLASS
// ============================================

export class TimelineService {
  constructor(private readonly db: Firestore) {}

  /**
   * Build a polymorphic timeline for a user profile.
   *
   * Concurrently fetches from Posts, Events, PlayerStats, Recruiting,
   * PlayerMetrics, and Rankings,
   * maps each to the correct FeedItem variant, merges and sorts.
   */
  async getProfileTimeline(
    userId: string,
    author: FeedAuthor,
    options: TimelineOptions
  ): Promise<FeedItemResponse> {
    const { limit, sportId, cursor } = options;
    // Fetch extra to know if there are more items
    const fetchLimit = limit + 1;

    logger.debug('[Timeline] Building polymorphic timeline', {
      userId,
      limit,
      sportId,
      hasCursor: !!cursor,
    });

    const [posts, events, stats, recruiting, metrics, rankings] = await Promise.all([
      this.fetchPosts(userId, fetchLimit, sportId, cursor),
      this.fetchEvents(userId, fetchLimit, sportId, cursor),
      this.fetchStats(userId, fetchLimit, sportId, cursor),
      this.fetchRecruiting(userId, fetchLimit, sportId, cursor),
      this.fetchMetrics(userId, fetchLimit, sportId, cursor),
      this.fetchRankings(userId, fetchLimit, sportId, cursor),
    ]);

    // Map to polymorphic FeedItem variants
    const items: FeedItem[] = [];

    for (const post of posts) {
      const feedPost = firestorePostToFeedPost(post.id, post.data, author);
      items.push(feedPostToFeedItem(feedPost));
    }

    for (const event of events) {
      items.push(eventDocToFeedItemEvent(event.id, event.data, author));
    }

    for (const stat of stats) {
      items.push(statDocToFeedItemStat(stat.id, stat.data, author));
    }

    for (const recruitingDoc of recruiting) {
      items.push(recruitingDocToFeedItemVariant(recruitingDoc.id, recruitingDoc.data, author));
    }

    for (const metric of metrics) {
      items.push(metricGroupToFeedItemMetric(metric.id, metric.data, author));
    }

    for (const ranking of rankings) {
      items.push(rankingDocToFeedItemAward(ranking.id, ranking.data, author));
    }

    // Sort all items by date descending (newest first)
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Determine pagination
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      resultItems.length > 0
        ? Buffer.from(resultItems[resultItems.length - 1].createdAt).toString('base64')
        : undefined;

    logger.debug('[Timeline] Timeline assembled', {
      userId,
      total: resultItems.length,
      posts: posts.length,
      events: events.length,
      stats: stats.length,
      recruiting: recruiting.length,
      metrics: metrics.length,
      rankings: rankings.length,
      hasMore,
    });

    return {
      success: true,
      data: resultItems,
      nextCursor: hasMore ? nextCursor : undefined,
      hasMore,
    };
  }

  // ============================================
  // PRIVATE: Collection Fetchers
  // ============================================

  /**
   * Fetch posts from the Posts collection for a user.
   */
  private async fetchPosts(
    userId: string,
    limit: number,
    sportId?: string,
    cursor?: string
  ): Promise<Array<{ id: string; data: FirestorePostDoc }>> {
    try {
      let query = this.db
        .collection(POSTS_COLLECTION)
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc') as FirebaseFirestore.Query;

      if (sportId) {
        query = query.where('sportId', '==', sportId);
      }

      if (cursor) {
        const cursorDate = new Date(Buffer.from(cursor, 'base64').toString());
        const { Timestamp: FsTimestamp } = await import('firebase-admin/firestore');
        query = query.startAfter(FsTimestamp.fromMillis(cursorDate.getTime()));
      }

      query = query.limit(limit);
      const snap = await query.get();

      return snap.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as FirestorePostDoc,
      }));
    } catch (err) {
      logger.error('[Timeline] Failed to fetch posts', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Fetch events from the Events collection for a user.
   * Returns normalized data shape compatible with eventDocToFeedItemEvent.
   */
  private async fetchEvents(
    userId: string,
    limit: number,
    sportId?: string,
    cursor?: string
  ): Promise<
    Array<{
      id: string;
      data: {
        date: string;
        opponent?: string;
        opponentLogoUrl?: string;
        location?: string;
        isHome?: boolean;
        status?: string;
        result?: {
          teamScore?: number;
          opponentScore?: number;
          outcome?: string;
          overtime?: boolean;
        };
        sport?: string;
        teamId?: string;
      };
    }>
  > {
    try {
      let query = this.db
        .collection(EVENTS_COLLECTION)
        .where('userId', '==', userId)
        .where('ownerType', '==', 'user')
        .orderBy('date', 'desc')
        .limit(limit) as FirebaseFirestore.Query;

      if (sportId) {
        query = query.where('sport', '==', sportId.toLowerCase());
      }

      // Events use 'date' field, not 'createdAt' — cursor filters on date
      if (cursor) {
        const cursorDate = Buffer.from(cursor, 'base64').toString();
        query = query.where('date', '<', cursorDate);
      }

      const snap = await query.get();

      return snap.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          data: {
            date:
              typeof d['date'] === 'string' ? d['date'] : this.firestoreTimestampToISO(d['date']),
            opponent: d['opponent'] as string | undefined,
            opponentLogoUrl: d['opponentLogoUrl'] as string | undefined,
            location: d['location'] as string | undefined,
            isHome: d['isHome'] as boolean | undefined,
            status: d['status'] as string | undefined,
            result: d['result'] as
              | {
                  teamScore?: number;
                  opponentScore?: number;
                  outcome?: string;
                  overtime?: boolean;
                }
              | undefined,
            sport: d['sport'] as string | undefined,
            teamId: d['teamId'] as string | undefined,
          },
        };
      });
    } catch (err) {
      logger.error('[Timeline] Failed to fetch events', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Fetch stat updates from the PlayerStats collection for a user.
   * PlayerStats are stored as PlayerStats/{userId}_{sportId}_{season}
   * with a stats array and optional gameLogs array.
   */
  private async fetchStats(
    userId: string,
    limit: number,
    sportId?: string,
    cursor?: string
  ): Promise<
    Array<{
      id: string;
      data: {
        createdAt: string;
        context?: string;
        gameDate?: string;
        gameResult?: string;
        opponent?: string;
        stats: readonly {
          label: string;
          value: string | number;
          unit?: string;
          isHighlight?: boolean;
        }[];
        seasonTotals?: readonly {
          label: string;
          value: string | number;
          unit?: string;
          isHighlight?: boolean;
        }[];
      };
    }>
  > {
    try {
      let query = this.db
        .collection(PLAYER_STATS_COLLECTION)
        .where('userId', '==', userId) as FirebaseFirestore.Query;

      if (sportId) {
        query = query.where('sportId', '==', sportId.toLowerCase());
      }

      const snap = await query.get();
      const results: Array<{
        id: string;
        data: {
          createdAt: string;
          context?: string;
          gameDate?: string;
          gameResult?: string;
          opponent?: string;
          stats: readonly {
            label: string;
            value: string | number;
            unit?: string;
            isHighlight?: boolean;
          }[];
          seasonTotals?: readonly {
            label: string;
            value: string | number;
            unit?: string;
            isHighlight?: boolean;
          }[];
        };
      }> = [];

      for (const doc of snap.docs) {
        const d = doc.data();
        const statsArray = Array.isArray(d['stats']) ? d['stats'] : [];
        const season = d['season'] as string | undefined;
        const sport = d['sportId'] as string | undefined;
        const createdAt =
          typeof d['createdAt'] === 'string'
            ? d['createdAt']
            : d['createdAt']
              ? this.firestoreTimestampToISO(d['createdAt'])
              : new Date().toISOString();

        // Each PlayerStats doc becomes a single stat-line card
        if (statsArray.length > 0) {
          results.push({
            id: doc.id,
            data: {
              createdAt,
              context: season ? `${season} ${sport ?? ''} Season Stats`.trim() : 'Season Stats',
              stats: statsArray.map(
                (s: Record<string, unknown>) =>
                  ({
                    label: String(s['label'] ?? s['name'] ?? ''),
                    value: s['value'] != null ? s['value'] : 0,
                    unit: s['unit'] as string | undefined,
                    isHighlight: s['isHighlight'] as boolean | undefined,
                  }) as {
                    label: string;
                    value: string | number;
                    unit?: string;
                    isHighlight?: boolean;
                  }
              ),
            },
          });
        }
      }

      if (cursor) {
        const cursorDate = new Date(Buffer.from(cursor, 'base64').toString()).getTime();
        results.splice(
          0,
          results.length,
          ...results.filter((entry) => new Date(entry.data.createdAt).getTime() < cursorDate)
        );
      }

      // Sort by createdAt descending and limit
      results.sort(
        (a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime()
      );

      return results.slice(0, limit);
    } catch (err) {
      logger.error('[Timeline] Failed to fetch stats', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Fetch recruiting activity from the unified Recruiting collection for a user.
   */
  private async fetchRecruiting(
    userId: string,
    limit: number,
    sportId?: string,
    cursor?: string
  ): Promise<
    Array<{
      id: string;
      data: {
        category: string;
        collegeName: string;
        collegeLogoUrl?: string;
        division?: string;
        conference?: string;
        sport?: string;
        date: string;
        endDate?: string;
        scholarshipType?: string;
        visitType?: string;
        commitmentStatus?: string;
        announcedAt?: string;
        coachName?: string;
        notes?: string;
        graphicUrl?: string;
      };
    }>
  > {
    try {
      let query = this.db
        .collection(RECRUITING_COLLECTION)
        .where('userId', '==', userId)
        .where('ownerType', '==', 'user')
        .orderBy('date', 'desc') as FirebaseFirestore.Query;

      if (sportId) {
        query = query.where('sport', '==', sportId.toLowerCase());
      }

      if (cursor) {
        const cursorDate = Buffer.from(cursor, 'base64').toString();
        query = query.where('date', '<', cursorDate);
      }

      query = query.limit(limit);
      const snap = await query.get();

      return snap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          data: {
            category: String(data['category'] ?? 'offer'),
            collegeName: String(data['collegeName'] ?? 'Unknown Program'),
            collegeLogoUrl: data['collegeLogoUrl'] as string | undefined,
            division: data['division'] as string | undefined,
            conference: data['conference'] as string | undefined,
            sport: data['sport'] as string | undefined,
            date: this.firestoreTimestampToISO(data['date']),
            endDate: data['endDate'] ? this.firestoreTimestampToISO(data['endDate']) : undefined,
            scholarshipType: data['scholarshipType'] as string | undefined,
            visitType: data['visitType'] as string | undefined,
            commitmentStatus: data['commitmentStatus'] as string | undefined,
            announcedAt: data['announcedAt']
              ? this.firestoreTimestampToISO(data['announcedAt'])
              : undefined,
            coachName: data['coachName'] as string | undefined,
            notes: data['notes'] as string | undefined,
            graphicUrl: data['graphicUrl'] as string | undefined,
          },
        };
      });
    } catch (err) {
      logger.error('[Timeline] Failed to fetch recruiting activity', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Fetch and group player metrics from the PlayerMetrics collection for a user.
   */
  private async fetchMetrics(
    userId: string,
    limit: number,
    sportId?: string,
    cursor?: string
  ): Promise<
    Array<{
      id: string;
      data: {
        measuredAt: string;
        source: string;
        category?: string;
        metrics: readonly {
          label: string;
          value: string | number;
          unit?: string;
          verified?: boolean;
          previousValue?: string | number;
        }[];
      };
    }>
  > {
    try {
      const queryLimit = Math.max(limit * 5, limit);
      let query = this.db
        .collection(PLAYER_METRICS_COLLECTION)
        .where('userId', '==', userId)
        .orderBy('dateRecorded', 'desc') as FirebaseFirestore.Query;

      if (sportId) {
        query = query.where('sportId', '==', sportId.toLowerCase());
      }

      if (cursor) {
        const cursorDate = Buffer.from(cursor, 'base64').toString();
        query = query.where('dateRecorded', '<', cursorDate);
      }

      query = query.limit(queryLimit);
      const snap = await query.get();

      const grouped = new Map<
        string,
        {
          measuredAt: string;
          source: string;
          category?: string;
          metrics: Array<{
            label: string;
            value: string | number;
            unit?: string;
            verified?: boolean;
            previousValue?: string | number;
          }>;
        }
      >();

      for (const doc of snap.docs) {
        const data = doc.data();
        const measuredAt = this.firestoreTimestampToISO(
          data['dateRecorded'] ?? data['extractedAt']
        );
        const source = String(
          data['verifiedBy'] ?? data['provider'] ?? data['source'] ?? 'Verified Metrics'
        );
        const category = (data['category'] as string | undefined) ?? 'Metrics';
        const key = `${measuredAt}::${source}::${category}`;

        const current = grouped.get(key) ?? {
          measuredAt,
          source,
          category,
          metrics: [],
        };

        current.metrics.push({
          label: String(data['label'] ?? this.humanizeFieldName(String(data['field'] ?? 'metric'))),
          value:
            typeof data['value'] === 'number' || typeof data['value'] === 'string'
              ? (data['value'] as string | number)
              : '0',
          unit: data['unit'] as string | undefined,
          verified: data['verified'] as boolean | undefined,
          previousValue:
            typeof data['previousValue'] === 'number' || typeof data['previousValue'] === 'string'
              ? (data['previousValue'] as string | number)
              : undefined,
        });

        grouped.set(key, current);
      }

      const result = [...grouped.entries()]
        .map(([key, value]) => ({
          id: Buffer.from(key).toString('base64url'),
          data: {
            measuredAt: value.measuredAt,
            source: value.source,
            category: value.category,
            metrics: value.metrics.sort((left, right) => left.label.localeCompare(right.label)),
          },
        }))
        .sort(
          (left, right) =>
            new Date(right.data.measuredAt).getTime() - new Date(left.data.measuredAt).getTime()
        );

      return result.slice(0, limit);
    } catch (err) {
      logger.error('[Timeline] Failed to fetch metrics', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  /**
   * Fetch ranking records from the Rankings collection for a user.
   */
  private async fetchRankings(
    userId: string,
    limit: number,
    sportId?: string,
    cursor?: string
  ): Promise<
    Array<{
      id: string;
      data: {
        createdAt: string;
        name: string;
        sport?: string;
        classOf?: number;
        nationalRank?: number | null;
        stateRank?: number | null;
        positionRank?: number | null;
        stars?: number | null;
      };
    }>
  > {
    try {
      let query = this.db
        .collection(RANKINGS_COLLECTION)
        .where('userId', '==', userId) as FirebaseFirestore.Query;

      if (sportId) {
        query = query.where('sportId', '==', sportId);
      }

      query = query.limit(limit);
      const snap = await query.get();

      const result = snap.docs
        .map((doc) => {
          const data = doc.data();
          const createdAt = this.firestoreTimestampToISO(
            data['rankedAt'] ?? data['date'] ?? data['createdAt'] ?? data['updatedAt']
          );
          return {
            id: doc.id,
            data: {
              createdAt,
              name: String(data['name'] ?? 'Ranking Service'),
              sport:
                (data['sport'] as string | undefined) ?? (data['sportId'] as string | undefined),
              classOf:
                typeof data['classOf'] === 'number' ? (data['classOf'] as number) : undefined,
              nationalRank:
                typeof data['nationalRank'] === 'number' ? (data['nationalRank'] as number) : null,
              stateRank:
                typeof data['stateRank'] === 'number' ? (data['stateRank'] as number) : null,
              positionRank:
                typeof data['positionRank'] === 'number' ? (data['positionRank'] as number) : null,
              stars: typeof data['stars'] === 'number' ? (data['stars'] as number) : null,
            },
          };
        })
        .filter((entry) => {
          if (!cursor) return true;
          const cursorDate = new Date(Buffer.from(cursor, 'base64').toString()).getTime();
          return new Date(entry.data.createdAt).getTime() < cursorDate;
        })
        .sort(
          (left, right) =>
            new Date(right.data.createdAt).getTime() - new Date(left.data.createdAt).getTime()
        );

      return result.slice(0, limit);
    } catch (err) {
      logger.error('[Timeline] Failed to fetch rankings', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
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

  private humanizeFieldName(field: string): string {
    return field
      .split(/[_-]+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ');
  }
}

// ============================================
// FACTORY
// ============================================

/**
 * Create a TimelineService instance.
 */
export function createTimelineService(db: Firestore): TimelineService {
  return new TimelineService(db);
}
