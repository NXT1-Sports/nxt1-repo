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
 * NOTE: Videos are stored in the Posts collection as type: 'video' (Cloudflare Stream).
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { FeedItem, FeedAuthor, FeedItemResponse } from '@nxt1/core/posts';
import type { TeamProfileTeam } from '@nxt1/core/team-profile';
import type { FirestorePostDoc } from '../adapters/firestore-posts.adapter.js';
import { firestorePostToFeedPost } from '../adapters/firestore-posts.adapter.js';
import {
  feedPostToFeedItem,
  eventDocToFeedItemEvent,
  scheduleDocToFeedItemSchedule,
  statDocToFeedItemStat,
  recruitingDocToFeedItemVariant,
  metricGroupToFeedItemMetric,
  rankingDocToFeedItemAward,
  newsArticleToFeedItemNews,
  teamStatDocToFeedItemStat,
  teamToFeedAuthor,
} from '@nxt1/core/posts';
import { logger } from '../utils/logger.js';

// ============================================
// CONSTANTS
// ============================================

const POSTS_COLLECTION = 'Posts';
const EVENTS_COLLECTION = 'Events';
const SCHEDULE_COLLECTION = 'Schedule';
const PLAYER_STATS_COLLECTION = 'PlayerStats';
const TEAM_STATS_COLLECTION = 'TeamStats';
const RECRUITING_COLLECTION = 'Recruiting';
const PLAYER_METRICS_COLLECTION = 'PlayerMetrics';
const RANKINGS_COLLECTION = 'Rankings';
const NEWS_COLLECTION = 'News';
const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const TEAMS_COLLECTION = 'Teams';

function extractPrimaryYear(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const match = value.match(/\b(19|20)\d{2}\b/);
  if (!match) return undefined;

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compareCreatedAtDescWithSeasonTieBreaker(
  leftCreatedAt: string,
  rightCreatedAt: string,
  leftSeason?: string,
  rightSeason?: string
): number {
  const timeDiff = new Date(rightCreatedAt).getTime() - new Date(leftCreatedAt).getTime();
  if (timeDiff !== 0) return timeDiff;

  const leftYear = extractPrimaryYear(leftSeason);
  const rightYear = extractPrimaryYear(rightSeason);
  if (leftYear !== undefined || rightYear !== undefined) {
    return (rightYear ?? Number.NEGATIVE_INFINITY) - (leftYear ?? Number.NEGATIVE_INFINITY);
  }

  return 0;
}

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
  /** Virtual IDs of pinned metric groups stored on the User doc */
  readonly pinnedMetricGroups?: readonly string[];
}

export interface TeamTimelineOptions {
  /** Maximum number of items to return */
  readonly limit: number;
  /** Filter by content type */
  readonly filter?: 'all' | 'media' | 'stats' | 'games' | 'schedule' | 'recruiting' | 'news';
  /** Filter by sport */
  readonly sportId?: string;
  /** Cursor for pagination (base64-encoded ISO timestamp) */
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
   * Concurrently fetches from Posts, Events, Schedule, PlayerStats, Recruiting,
   * PlayerMetrics, and Rankings,
   * maps each to the correct FeedItem variant, merges and sorts.
   */
  async getProfileTimeline(
    userId: string,
    author: FeedAuthor,
    options: TimelineOptions
  ): Promise<FeedItemResponse> {
    const { limit, sportId, cursor, pinnedMetricGroups = [] } = options;
    // Fetch extra to know if there are more items
    const fetchLimit = limit + 1;

    logger.debug('[Timeline] Building polymorphic timeline', {
      userId,
      limit,
      sportId,
      hasCursor: !!cursor,
    });

    const [posts, events, schedule, stats, recruiting, metrics, rankings] = await Promise.all([
      this.fetchPosts(userId, fetchLimit, sportId, cursor),
      this.fetchEvents(userId, fetchLimit, sportId, cursor),
      this.fetchSchedule(userId, fetchLimit, sportId, cursor),
      this.fetchStats(userId, fetchLimit, sportId, cursor),
      this.fetchRecruiting(userId, fetchLimit, sportId, cursor),
      this.fetchMetrics(userId, fetchLimit, sportId, cursor, pinnedMetricGroups),
      this.fetchRankings(userId, fetchLimit, sportId, cursor),
    ]);

    // Map to polymorphic FeedItem variants
    const items: FeedItem[] = [];

    for (const post of posts) {
      const feedPost = firestorePostToFeedPost(post.id, post.data, author);
      items.push(feedPostToFeedItem(feedPost));
    }

    for (const event of events) {
      items.push(eventDocToFeedItemEvent(event.id, event.data, author, event.data.isPinned));
    }

    for (const scheduleEvent of schedule) {
      items.push(
        scheduleDocToFeedItemSchedule(
          scheduleEvent.id,
          scheduleEvent.data,
          author,
          scheduleEvent.data.isPinned
        )
      );
    }

    for (const stat of stats) {
      items.push(statDocToFeedItemStat(stat.id, stat.data, author, stat.data.isPinned));
    }

    for (const recruitingDoc of recruiting) {
      items.push(
        recruitingDocToFeedItemVariant(
          recruitingDoc.id,
          recruitingDoc.data,
          author,
          recruitingDoc.data.isPinned
        )
      );
    }

    for (const metric of metrics) {
      items.push(metricGroupToFeedItemMetric(metric.id, metric.data, author, metric.data.isPinned));
    }

    for (const ranking of rankings) {
      items.push(
        rankingDocToFeedItemAward(ranking.id, ranking.data, author, ranking.data.isPinned)
      );
    }

    // Sort: pinned items float to top, then newest-first within each group
    items.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Determine pagination first so we only enrich the page we're returning
    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    // Batch-enrich engagement counts via a single Firestore getAll() RPC —
    // one network round-trip regardless of page size, far cheaper than
    // N individual .get() calls even when run via Promise.all.
    const engagementMap = new Map<string, { views: number; shares: number }>();

    if (resultItems.length > 0) {
      const engRefs = resultItems.map((item) => this.db.collection('Engagement').doc(item.id));

      const engSnaps = await this.db
        .getAll(...engRefs)
        .catch(() => [] as FirebaseFirestore.DocumentSnapshot[]);

      for (const snap of engSnaps) {
        if (!snap.exists) continue;
        const d = snap.data()!;
        engagementMap.set(snap.id, {
          views: (d['views'] as number | undefined) ?? 0,
          shares: (d['shares'] as number | undefined) ?? 0,
        });
      }
    }

    // Merge engagement into each item (immutable spread)
    const enrichedItems = resultItems.map((item) => {
      const eng = engagementMap.get(item.id);
      if (!eng) return item;
      return {
        ...item,
        engagement: {
          viewCount: eng.views,
          shareCount: eng.shares,
        },
      } as typeof item;
    });
    const nextCursor =
      enrichedItems.length > 0
        ? Buffer.from(enrichedItems[enrichedItems.length - 1].createdAt).toString('base64')
        : undefined;

    logger.debug('[Timeline] Timeline assembled', {
      userId,
      total: enrichedItems.length,
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
      data: enrichedItems,
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
   * Fetch competitive schedule events from the Schedule collection for a user.
   * Returns normalized data shape compatible with scheduleDocToFeedItemSchedule.
   */
  private async fetchSchedule(
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
        scheduleType?: string;
        result?: {
          teamScore?: number;
          opponentScore?: number;
          outcome?: string;
          overtime?: boolean;
        };
        sport?: string;
        teamId?: string;
        isPinned?: boolean;
      };
    }>
  > {
    try {
      let query = this.db
        .collection(SCHEDULE_COLLECTION)
        .where('ownerId', '==', userId)
        .where('ownerType', '==', 'user')
        .orderBy('date', 'desc')
        .limit(limit) as FirebaseFirestore.Query;

      if (sportId) {
        query = query.where('sport', '==', sportId.toLowerCase());
      }

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
            scheduleType: d['scheduleType'] as string | undefined,
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
            isPinned: d['isPinned'] === true,
          },
        };
      });
    } catch (err) {
      logger.error('[Timeline] Failed to fetch schedule', {
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
        isPinned?: boolean;
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
            isPinned: d['isPinned'] === true,
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
        season?: string;
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
        isPinned?: boolean;
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
          season?: string;
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
          isPinned?: boolean;
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
              season,
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
              isPinned: d['isPinned'] === true,
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
      results.sort((a, b) =>
        compareCreatedAtDescWithSeasonTieBreaker(
          a.data.createdAt,
          b.data.createdAt,
          a.data.season,
          b.data.season
        )
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
        isPinned?: boolean;
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
            isPinned: data['isPinned'] === true,
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
    cursor?: string,
    pinnedMetricGroups: readonly string[] = []
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
        isPinned?: boolean;
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
        .map(([key, value]) => {
          const groupId = Buffer.from(key).toString('base64url');
          return {
            id: groupId,
            data: {
              measuredAt: value.measuredAt,
              source: value.source,
              category: value.category,
              metrics: value.metrics.sort((left, right) => left.label.localeCompare(right.label)),
              isPinned: pinnedMetricGroups.includes(groupId),
            },
          };
        })
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
        isPinned?: boolean;
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
              isPinned: data['isPinned'] === true,
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

  // ============================================
  // TEAM TIMELINE
  // ============================================

  /**
   * Build a polymorphic timeline for a team profile.
   *
   * Concurrently fetches from Posts (teamId), Schedule (teamId+ownerType:'team'),
   * TeamStats, News (teamId+type:'team'), and Recruiting fan-out via RosterEntries.
   * Maps each to the correct FeedItem variant, applies optional filter, merges and sorts.
   */
  async getTeamTimeline(teamCode: string, options: TeamTimelineOptions): Promise<FeedItemResponse> {
    const { limit = 20, filter = 'all', sportId, cursor } = options;
    const fetchLimit = limit + 1;

    logger.debug('[Timeline] Building team polymorphic timeline', {
      teamCode,
      filter,
      limit,
      hasCursor: !!cursor,
    });

    // Resolve team document to get teamId and build FeedAuthor
    // Primary: Teams collection (new architecture)
    const teamSnap = await this.db
      .collection(TEAMS_COLLECTION)
      .where('teamCode', '==', teamCode)
      .limit(1)
      .get();

    let teamId: string;
    let td: FirebaseFirestore.DocumentData;

    if (!teamSnap.empty) {
      teamId = teamSnap.docs[0].id;
      td = teamSnap.docs[0].data();
    } else {
      // Fallback: legacy TeamCodes collection — document ID = teamCode
      const legacySnap = await this.db.collection('TeamCodes').doc(teamCode).get();
      if (!legacySnap.exists) {
        logger.warn('[Timeline] Team not found for teamCode', { teamCode });
        return { success: true, data: [], hasMore: false };
      }
      td = legacySnap.data() ?? {};
      teamId = (td['teamId'] as string | undefined) ?? legacySnap.id;
    }

    const author = teamToFeedAuthor({
      id: teamId,
      teamName: String(td['teamName'] ?? ''),
      logoUrl: (td['logoUrl'] as string | undefined) ?? undefined,
      slug: (td['slug'] as string | undefined) ?? teamCode,
      teamType: (td['teamType'] as string | undefined) ?? 'other',
      sport: (td['sport'] as string | undefined) ?? '',
      city: (td['city'] as string | undefined) ?? '',
      state: (td['state'] as string | undefined) ?? '',
      location: String(td['location'] ?? ''),
      verificationStatus: (td['verificationStatus'] as string | undefined) ?? 'unverified',
      isActive: !!(td['isActive'] as boolean | undefined),
      createdAt: (td['createdAt'] as string | undefined) ?? new Date().toISOString(),
      updatedAt: (td['updatedAt'] as string | undefined) ?? new Date().toISOString(),
    } as unknown as TeamProfileTeam);

    // Determine which sources to fetch based on filter
    const fetchAll = filter === 'all';
    const fetchPosts = fetchAll || filter === 'media';
    const fetchScheduleGames = fetchAll || filter === 'games';
    const fetchScheduleUpcoming = fetchAll || filter === 'schedule';
    const fetchStats = fetchAll || filter === 'stats';
    const fetchNews = fetchAll || filter === 'news';
    const fetchRecruiting = fetchAll || filter === 'recruiting';

    const [teamPosts, scheduleDocs, teamStatsDocs, newsDocs, recruitingItems] = await Promise.all([
      fetchPosts || fetchScheduleGames || fetchScheduleUpcoming
        ? this.fetchTeamPosts(teamId, fetchLimit, sportId, cursor)
        : Promise.resolve([]),
      fetchScheduleGames || fetchScheduleUpcoming
        ? this.fetchTeamSchedule(teamId, fetchLimit, sportId, cursor)
        : Promise.resolve([]),
      fetchStats ? this.fetchTeamStats(teamId, fetchLimit, sportId, cursor) : Promise.resolve([]),
      fetchNews ? this.fetchTeamNews(teamId, fetchLimit, cursor) : Promise.resolve([]),
      fetchRecruiting ? this.fetchTeamRecruiting(teamId, fetchLimit, cursor) : Promise.resolve([]),
    ]);

    const items: FeedItem[] = [];

    // Posts (media filter: only highlight/image/video post types)
    for (const post of teamPosts) {
      const feedPost = firestorePostToFeedPost(post.id, post.data, author);
      const feedItem = feedPostToFeedItem(feedPost);
      if (filter === 'media') {
        const pt = feedPost.type;
        if (pt === 'image' || pt === 'video') items.push(feedItem);
      } else {
        items.push(feedItem);
      }
    }

    // Schedule — split by status for games vs schedule filter
    for (const s of scheduleDocs) {
      const feedItem = scheduleDocToFeedItemSchedule(s.id, s.data, author);
      const status = s.data.status?.toLowerCase() ?? '';
      if (filter === 'games') {
        if (status === 'final' || status === 'completed') items.push(feedItem);
      } else if (filter === 'schedule') {
        if (status !== 'final' && status !== 'completed') items.push(feedItem);
      } else {
        items.push(feedItem);
      }
    }

    // TeamStats
    for (const stat of teamStatsDocs) {
      items.push(teamStatDocToFeedItemStat(stat.id, stat.data, author));
    }

    // News
    for (const news of newsDocs) {
      items.push(newsArticleToFeedItemNews(news.id, news.data, author));
    }

    // Recruiting
    for (const rec of recruitingItems) {
      items.push(recruitingDocToFeedItemVariant(rec.id, rec.data, author));
    }

    // Sort newest first
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;

    // Batch-enrich engagement via single getAll() RPC — same pattern as profile timeline
    const engagementMap = new Map<string, { views: number; shares: number }>();
    if (resultItems.length > 0) {
      const engRefs = resultItems.map((item) => this.db.collection('Engagement').doc(item.id));
      const engSnaps = await this.db
        .getAll(...engRefs)
        .catch(() => [] as FirebaseFirestore.DocumentSnapshot[]);
      for (const snap of engSnaps) {
        if (!snap.exists) continue;
        const d = snap.data()!;
        engagementMap.set(snap.id, {
          views: (d['views'] as number | undefined) ?? 0,
          shares: (d['shares'] as number | undefined) ?? 0,
        });
      }
    }

    const enrichedItems = resultItems.map((item) => {
      const eng = engagementMap.get(item.id);
      if (!eng) return item;
      return {
        ...item,
        engagement: { viewCount: eng.views, shareCount: eng.shares },
      } as typeof item;
    });

    const nextCursor =
      enrichedItems.length > 0
        ? Buffer.from(enrichedItems[enrichedItems.length - 1].createdAt).toString('base64')
        : undefined;

    logger.debug('[Timeline] Team timeline assembled', {
      teamCode,
      teamId,
      filter,
      total: enrichedItems.length,
      hasMore,
    });

    return {
      success: true,
      data: enrichedItems,
      nextCursor: hasMore ? nextCursor : undefined,
      hasMore,
    };
  }

  // ============================================
  // PRIVATE: Team-Specific Collection Fetchers
  // ============================================

  private async fetchTeamPosts(
    teamId: string,
    limit: number,
    sportId?: string,
    _cursor?: string
  ): Promise<Array<{ id: string; data: FirestorePostDoc }>> {
    try {
      // Note: Firestore composite index (teamId + createdAt DESC) must be deployed
      // for orderBy to work. We omit orderBy here and rely on the global sort in
      // getTeamTimeline to keep this resilient across environments.
      let query = this.db
        .collection(POSTS_COLLECTION)
        .where('teamId', '==', teamId)
        .limit(limit) as FirebaseFirestore.Query;

      if (sportId) query = query.where('sportId', '==', sportId);

      const snap = await query.get();
      return snap.docs.map((doc) => ({ id: doc.id, data: doc.data() as FirestorePostDoc }));
    } catch (err) {
      logger.error('[Timeline] Failed to fetch team posts', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchTeamSchedule(
    teamId: string,
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
        scheduleType?: string;
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
        .collection(SCHEDULE_COLLECTION)
        .where('teamId', '==', teamId)
        .where('ownerType', '==', 'team')
        .orderBy('date', 'desc')
        .limit(limit) as FirebaseFirestore.Query;

      if (sportId) query = query.where('sport', '==', sportId.toLowerCase());
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
            scheduleType: d['scheduleType'] as string | undefined,
            result: d['result'] as
              | { teamScore?: number; opponentScore?: number; outcome?: string; overtime?: boolean }
              | undefined,
            sport: d['sport'] as string | undefined,
            teamId: d['teamId'] as string | undefined,
          },
        };
      });
    } catch (err) {
      logger.error('[Timeline] Failed to fetch team schedule', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchTeamStats(
    teamId: string,
    limit: number,
    sportId?: string,
    cursor?: string
  ): Promise<
    Array<{
      id: string;
      data: {
        createdAt: string;
        season?: string;
        sportId?: string;
        source?: string;
        stats: readonly {
          label: string;
          value: string | number;
          unit?: string;
          category?: string;
          trend?: string;
          trendValue?: number;
          isHighlight?: boolean;
        }[];
      };
    }>
  > {
    try {
      let query = this.db
        .collection(TEAM_STATS_COLLECTION)
        .where('teamId', '==', teamId)
        .orderBy('createdAt', 'desc')
        .limit(limit) as FirebaseFirestore.Query;

      if (sportId) query = query.where('sportId', '==', sportId.toLowerCase());
      if (cursor) {
        const cursorDate = new Date(Buffer.from(cursor, 'base64').toString());
        const { Timestamp: FsTimestamp } = await import('firebase-admin/firestore');
        query = query.startAfter(FsTimestamp.fromMillis(cursorDate.getTime()));
      }

      const snap = await query.get();
      const results = snap.docs.map((doc) => {
        const d = doc.data();
        const rawStats = Array.isArray(d['stats']) ? d['stats'] : [];
        const createdAt =
          typeof d['createdAt'] === 'string'
            ? d['createdAt']
            : this.firestoreTimestampToISO(d['createdAt']);

        return {
          id: doc.id,
          data: {
            createdAt,
            season: d['season'] as string | undefined,
            sportId: d['sportId'] as string | undefined,
            source: d['source'] as string | undefined,
            stats: rawStats.map((s: Record<string, unknown>) => ({
              label: String(s['label'] ?? ''),
              value: typeof s['value'] === 'number' ? s['value'] : String(s['value'] ?? ''),
              unit: s['unit'] as string | undefined,
              category: s['category'] as string | undefined,
              trend: s['trend'] as string | undefined,
              trendValue: typeof s['trendValue'] === 'number' ? s['trendValue'] : undefined,
              isHighlight: s['isHighlight'] as boolean | undefined,
            })),
          },
        };
      });

      results.sort((a, b) =>
        compareCreatedAtDescWithSeasonTieBreaker(
          a.data.createdAt,
          b.data.createdAt,
          a.data.season,
          b.data.season
        )
      );

      return results;
    } catch (err) {
      logger.error('[Timeline] Failed to fetch team stats', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchTeamNews(
    teamId: string,
    limit: number,
    cursor?: string
  ): Promise<
    Array<{
      id: string;
      data: {
        headline: string;
        source: string;
        sourceLogoUrl?: string;
        excerpt?: string;
        articleUrl?: string;
        imageUrl?: string;
        publishedAt: string;
        category?: string;
      };
    }>
  > {
    try {
      let query = this.db
        .collection(NEWS_COLLECTION)
        .where('teamId', '==', teamId)
        .where('type', '==', 'team')
        .orderBy('publishedAt', 'desc')
        .limit(limit) as FirebaseFirestore.Query;

      if (cursor) {
        const cursorDate = Buffer.from(cursor, 'base64').toString();
        query = query.where('publishedAt', '<', cursorDate);
      }

      const snap = await query.get();
      return snap.docs.map((doc) => {
        const d = doc.data();
        const publishedAt =
          typeof d['publishedAt'] === 'string'
            ? d['publishedAt']
            : this.firestoreTimestampToISO(d['publishedAt']);

        return {
          id: doc.id,
          data: {
            headline: String(d['headline'] ?? d['title'] ?? 'News Update'),
            source: String(d['source'] ?? 'Team News'),
            sourceLogoUrl: d['sourceLogoUrl'] as string | undefined,
            excerpt: d['excerpt'] as string | undefined,
            articleUrl: d['articleUrl'] ?? (d['url'] as string | undefined),
            imageUrl: d['imageUrl'] as string | undefined,
            publishedAt,
            category: d['category'] as string | undefined,
          },
        };
      });
    } catch (err) {
      logger.error('[Timeline] Failed to fetch team news', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async fetchTeamRecruiting(
    teamId: string,
    limit: number,
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
      // Fan-out via RosterEntries: get all playerIds for this team
      const rosterSnap = await this.db
        .collection(ROSTER_ENTRIES_COLLECTION)
        .where('teamId', '==', teamId)
        .where('status', 'in', ['active', 'ghost'])
        .select('playerId')
        .get();

      const playerIds = rosterSnap.docs
        .map((doc) => doc.data()['playerId'] as string | undefined)
        .filter((id): id is string => !!id);

      if (playerIds.length === 0) return [];

      // Firestore IN query supports up to 30 elements; chunk if needed
      const chunks: string[][] = [];
      for (let i = 0; i < playerIds.length; i += 30) {
        chunks.push(playerIds.slice(i, i + 30));
      }

      const allResults: Array<{
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
      }> = [];

      await Promise.all(
        chunks.map(async (chunk) => {
          let q = this.db
            .collection(RECRUITING_COLLECTION)
            .where('userId', 'in', chunk)
            .orderBy('date', 'desc')
            .limit(limit) as FirebaseFirestore.Query;

          if (cursor) {
            const cursorDate = Buffer.from(cursor, 'base64').toString();
            q = q.where('date', '<', cursorDate);
          }

          const snap = await q.get();
          for (const doc of snap.docs) {
            const data = doc.data();
            allResults.push({
              id: doc.id,
              data: {
                category: String(data['category'] ?? 'offer'),
                collegeName: String(data['collegeName'] ?? 'Unknown Program'),
                collegeLogoUrl: data['collegeLogoUrl'] as string | undefined,
                division: data['division'] as string | undefined,
                conference: data['conference'] as string | undefined,
                sport: data['sport'] as string | undefined,
                date: this.firestoreTimestampToISO(data['date']),
                endDate: data['endDate']
                  ? this.firestoreTimestampToISO(data['endDate'])
                  : undefined,
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
            });
          }
        })
      );

      allResults.sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());
      return allResults.slice(0, limit);
    } catch (err) {
      logger.error('[Timeline] Failed to fetch team recruiting', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
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
