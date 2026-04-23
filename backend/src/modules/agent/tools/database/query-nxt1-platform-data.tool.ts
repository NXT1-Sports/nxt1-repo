import type { Firestore, Query, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import type { ToolStage } from '@nxt1/core';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { stagingDb } from '../../../../utils/firebase-staging.js';
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const SCAN_BATCH_SIZE = 200;
const CANDIDATE_LIMIT = 5;

const NumberLikeSchema = z.union([z.number(), z.string().trim().min(1)]);

const QueryNxt1PlatformDataInputSchema = z.object({
  entityType: z.string().trim().min(1),
  query: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  unicode: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  postType: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  season: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  field: z.string().trim().min(1).optional(),
  eventType: z.string().trim().min(1).optional(),
  limit: NumberLikeSchema.optional(),
});

const COLLECTIONS = {
  USERS: 'Users',
  TEAMS: 'Teams',
  ORGANIZATIONS: 'Organizations',
  POSTS: 'Posts',
  RECRUITING: 'Recruiting',
  PLAYER_STATS: 'PlayerStats',
  PLAYER_METRICS: 'PlayerMetrics',
  ROSTER_ENTRIES: 'RosterEntries',
  EVENTS: 'Events',
} as const;

type PlatformEntityType =
  | 'users'
  | 'teams'
  | 'organizations'
  | 'posts'
  | 'recruiting'
  | 'season_stats'
  | 'physical_metrics'
  | 'roster_entries'
  | 'events'
  | 'user_bundle';

interface PlatformFirestoreMap {
  readonly production?: Firestore;
  readonly staging?: Firestore;
}

interface PlatformDataFilters {
  readonly query: string | null;
  readonly userId: string | null;
  readonly unicode: string | null;
  readonly sport: string | null;
  readonly state: string | null;
  readonly role: string | null;
  readonly teamId: string | null;
  readonly organizationId: string | null;
  readonly postType: string | null;
  readonly category: string | null;
  readonly season: string | null;
  readonly status: string | null;
  readonly field: string | null;
  readonly eventType: string | null;
  readonly limit: number;
}

interface ScanResult {
  readonly items: Record<string, unknown>[];
  readonly totalCount: number;
}

type BundleUserResolution =
  | { readonly kind: 'single'; readonly user: Record<string, unknown> }
  | {
      readonly kind: 'multiple';
      readonly totalCount: number;
      readonly candidates: Record<string, unknown>[];
    }
  | { readonly kind: 'none' };

export class QueryNxt1PlatformDataTool extends BaseTool {
  readonly name = 'query_nxt1_platform_data';

  readonly description =
    'Query read-only NXT1 platform data across all major Firestore collections. ' +
    'Use this for platform-wide counts and samples of users, teams, organizations, posts, recruiting records, season stats, physical metrics, roster entries, and events. ' +
    'Use entityType "user_bundle" to pull one athlete or user across their related collections (profile, posts, recruiting, stats, metrics, roster memberships, and events). ' +
    'For count questions, answer from totalCount or bundle totals, not from the visible items array length.';

  readonly parameters = QueryNxt1PlatformDataInputSchema;

  override readonly allowedAgents = [
    'strategy_coordinator',
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;
  constructor(private readonly firestoreMap: PlatformFirestoreMap = {}) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = QueryNxt1PlatformDataInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const entityType = this.parseEntityType(parsed.data.entityType);
    if (!entityType) {
      return {
        success: false,
        error:
          'Parameter "entityType" must be one of: users, teams, organizations, posts, recruiting, season_stats, physical_metrics, roster_entries, events, user_bundle.',
      };
    }

    const filters = this.parseFilters(parsed.data);
    if (entityType === 'user_bundle' && !filters.userId && !filters.unicode && !filters.query) {
      return {
        success: false,
        error:
          'Parameter "userId", "unicode", or "query" is required for entityType "user_bundle".',
      };
    }

    try {
      const db = this.resolveDb(context);

      if (entityType === 'user_bundle') {
        context?.emitStage?.('fetching_data', {
          icon: 'database',
          entityType,
          phase: 'resolve_user_bundle',
        });
        return {
          success: true,
          data: await this.loadUserBundle(db, filters, context),
        };
      }

      context?.emitStage?.('fetching_data', {
        icon: 'database',
        entityType,
        phase: 'scan_platform_collection',
      });
      const result = await this.queryEntityCollection(db, entityType, filters, context);
      return {
        success: true,
        data: {
          entityType,
          count: result.items.length,
          totalCount: result.totalCount,
          filtersApplied: this.serializeFilters(filters),
          matchMode: 'collection_scan',
          items: result.items,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to query NXT1 platform data';
      logger.error('[QueryNxt1PlatformDataTool] Query failed', {
        entityType,
        environment: context?.environment ?? 'production',
        filters: this.serializeFilters(filters),
        error: message,
      });
      return { success: false, error: message };
    }
  }

  private parseEntityType(value: unknown): PlatformEntityType | null {
    switch (value) {
      case 'users':
      case 'teams':
      case 'organizations':
      case 'posts':
      case 'recruiting':
      case 'season_stats':
      case 'physical_metrics':
      case 'roster_entries':
      case 'events':
      case 'user_bundle':
        return value;
      default:
        return null;
    }
  }

  private parseFilters(
    input: z.infer<typeof QueryNxt1PlatformDataInputSchema>
  ): PlatformDataFilters {
    const limitValue =
      typeof input.limit === 'number'
        ? input.limit
        : typeof input.limit === 'string'
          ? Number(input.limit)
          : undefined;

    return {
      query: input.query ?? null,
      userId: input.userId ?? null,
      unicode: input.unicode ?? null,
      sport: input.sport ?? null,
      state: this.normalizeState(input.state ?? null),
      role: input.role?.toLowerCase() ?? null,
      teamId: input.teamId ?? null,
      organizationId: input.organizationId ?? null,
      postType: input.postType?.toLowerCase() ?? null,
      category: input.category?.toLowerCase() ?? null,
      season: input.season ?? null,
      status: input.status?.toLowerCase() ?? null,
      field: input.field?.toLowerCase() ?? null,
      eventType: input.eventType?.toLowerCase() ?? null,
      limit: Math.min(
        Math.max(Number.isFinite(limitValue) ? (limitValue as number) : DEFAULT_LIMIT, 1),
        MAX_LIMIT
      ),
    };
  }

  private resolveDb(context?: ToolExecutionContext): Firestore {
    if (context?.environment === 'staging') {
      return this.firestoreMap.staging ?? stagingDb;
    }

    return this.firestoreMap.production ?? getFirestore();
  }

  private async queryEntityCollection(
    db: Firestore,
    entityType: Exclude<PlatformEntityType, 'user_bundle'>,
    filters: PlatformDataFilters,
    context?: ToolExecutionContext
  ): Promise<ScanResult> {
    return this.scanCollection(
      db.collection(this.getCollectionName(entityType)),
      entityType,
      filters,
      filters.limit,
      context
    );
  }

  private async loadUserBundle(
    db: Firestore,
    filters: PlatformDataFilters,
    context?: ToolExecutionContext
  ): Promise<Record<string, unknown>> {
    const resolution = await this.resolveUserForBundle(db, filters, context);
    if (resolution.kind === 'none') {
      return {
        entityType: 'user_bundle',
        matched: false,
        totalCount: 0,
        message: 'No matching user was found across the NXT1 platform.',
      };
    }

    if (resolution.kind === 'multiple') {
      return {
        entityType: 'user_bundle',
        matched: false,
        totalCount: resolution.totalCount,
        message: 'Multiple users matched. Ask the user to specify userId or unicode.',
        candidates: resolution.candidates,
      };
    }

    const user = resolution.user;
    const userId = String(user['id'] ?? user['uid'] ?? '');
    const relatedFilters: PlatformDataFilters = {
      ...filters,
      query: null,
      unicode: null,
      userId,
      limit: filters.limit,
    };

    context?.emitStage?.('fetching_data', {
      icon: 'database',
      entityType: 'user_bundle',
      userId,
      phase: 'load_related_entities',
    });
    const [posts, recruiting, seasonStats, physicalMetrics, rosterEntries, events] =
      await Promise.all([
        this.scanCollection(
          db.collection(COLLECTIONS.POSTS).where('userId', '==', userId),
          'posts',
          relatedFilters,
          filters.limit
        ),
        this.scanCollection(
          db.collection(COLLECTIONS.RECRUITING).where('userId', '==', userId),
          'recruiting',
          relatedFilters,
          filters.limit
        ),
        this.scanCollection(
          db.collection(COLLECTIONS.PLAYER_STATS).where('userId', '==', userId),
          'season_stats',
          relatedFilters,
          filters.limit
        ),
        this.scanCollection(
          db.collection(COLLECTIONS.PLAYER_METRICS).where('userId', '==', userId),
          'physical_metrics',
          relatedFilters,
          filters.limit
        ),
        this.scanCollection(
          db.collection(COLLECTIONS.ROSTER_ENTRIES).where('userId', '==', userId),
          'roster_entries',
          relatedFilters,
          filters.limit
        ),
        this.scanCollection(
          db.collection(COLLECTIONS.EVENTS).where('userId', '==', userId),
          'events',
          relatedFilters,
          filters.limit
        ),
      ]);

    return {
      entityType: 'user_bundle',
      matched: true,
      totalCount: 1,
      user: this.mapEntity('users', user),
      totals: {
        posts: posts.totalCount,
        recruiting: recruiting.totalCount,
        seasonStats: seasonStats.totalCount,
        physicalMetrics: physicalMetrics.totalCount,
        rosterEntries: rosterEntries.totalCount,
        events: events.totalCount,
      },
      posts: posts.items,
      recruiting: recruiting.items,
      seasonStats: seasonStats.items,
      physicalMetrics: physicalMetrics.items,
      rosterEntries: rosterEntries.items,
      events: events.items,
    };
  }

  private async resolveUserForBundle(
    db: Firestore,
    filters: PlatformDataFilters,
    context?: ToolExecutionContext
  ): Promise<BundleUserResolution> {
    if (filters.userId) {
      const directSnapshot = await db.collection(COLLECTIONS.USERS).doc(filters.userId).get();
      if (directSnapshot.exists) {
        return {
          kind: 'single',
          user: this.sanitizeRecord({
            id: directSnapshot.id,
            ...(directSnapshot.data() as Record<string, unknown>),
          }),
        };
      }

      const uidSnapshot = await db
        .collection(COLLECTIONS.USERS)
        .where('uid', '==', filters.userId)
        .limit(1)
        .get();
      if (!uidSnapshot.empty) {
        const doc = uidSnapshot.docs[0];
        return {
          kind: 'single',
          user: this.sanitizeRecord({ id: doc.id, ...(doc.data() as Record<string, unknown>) }),
        };
      }
    }

    if (filters.unicode) {
      const unicodeSnapshot = await db
        .collection(COLLECTIONS.USERS)
        .where('unicode', '==', filters.unicode)
        .limit(CANDIDATE_LIMIT)
        .get();
      if (unicodeSnapshot.docs.length === 1) {
        const doc = unicodeSnapshot.docs[0];
        return {
          kind: 'single',
          user: this.sanitizeRecord({ id: doc.id, ...(doc.data() as Record<string, unknown>) }),
        };
      }

      if (unicodeSnapshot.docs.length > 1) {
        return {
          kind: 'multiple',
          totalCount: unicodeSnapshot.docs.length,
          candidates: unicodeSnapshot.docs.map((doc) =>
            this.mapEntity(
              'users',
              this.sanitizeRecord({ id: doc.id, ...(doc.data() as Record<string, unknown>) })
            )
          ),
        };
      }
    }

    if (!filters.query) {
      return { kind: 'none' };
    }

    const normalizedQuery = filters.query.toLowerCase().trim();
    if (normalizedQuery.length >= 2) {
      const indexedSnapshot = await db
        .collection(COLLECTIONS.USERS)
        .where('searchIndex', 'array-contains', normalizedQuery)
        .limit(CANDIDATE_LIMIT)
        .get();
      const indexedMatches = indexedSnapshot.docs
        .map((doc) =>
          this.sanitizeRecord({ id: doc.id, ...(doc.data() as Record<string, unknown>) })
        )
        .filter((record) => this.matchesEntityFilters('users', record, filters));

      if (indexedMatches.length === 1) {
        return { kind: 'single', user: indexedMatches[0] };
      }

      if (indexedMatches.length > 1) {
        return {
          kind: 'multiple',
          totalCount: indexedMatches.length,
          candidates: indexedMatches.map((record) => this.mapEntity('users', record)),
        };
      }
    }

    context?.emitStage?.('fetching_data', {
      icon: 'database',
      entityType: 'users',
      phase: 'resolve_requested_athlete',
    });
    let totalCount = 0;
    const candidates: Record<string, unknown>[] = [];
    let lastDoc: QueryDocumentSnapshot | undefined;
    const usersQuery = db.collection(COLLECTIONS.USERS);

    while (true) {
      let pageQuery = usersQuery.limit(SCAN_BATCH_SIZE);
      if (lastDoc) {
        pageQuery = pageQuery.startAfter(lastDoc);
      }

      const snapshot = await pageQuery.get();
      if (snapshot.empty) {
        break;
      }

      for (const doc of snapshot.docs) {
        const record = this.sanitizeRecord({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        });
        if (!this.matchesEntityFilters('users', record, filters)) {
          continue;
        }

        totalCount += 1;
        if (candidates.length < CANDIDATE_LIMIT) {
          candidates.push(this.mapEntity('users', record));
        }
      }

      if (snapshot.docs.length < SCAN_BATCH_SIZE) {
        break;
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    if (totalCount === 0) {
      return { kind: 'none' };
    }

    if (totalCount > 1) {
      return {
        kind: 'multiple',
        totalCount,
        candidates,
      };
    }

    const candidate = candidates[0];
    if (!candidate) {
      return { kind: 'none' };
    }

    const userSnapshot = await db.collection(COLLECTIONS.USERS).doc(String(candidate['id'])).get();
    if (!userSnapshot.exists) {
      return { kind: 'none' };
    }

    return {
      kind: 'single',
      user: this.sanitizeRecord({
        id: userSnapshot.id,
        ...(userSnapshot.data() as Record<string, unknown>),
      }),
    };
  }

  private async scanCollection(
    query: Query,
    entityType: Exclude<PlatformEntityType, 'user_bundle'>,
    filters: PlatformDataFilters,
    limit: number,
    context?: ToolExecutionContext
  ): Promise<ScanResult> {
    let totalCount = 0;
    let scannedCount = 0;
    const items: Record<string, unknown>[] = [];
    let lastDoc: QueryDocumentSnapshot | undefined;

    while (true) {
      let pageQuery = query.limit(SCAN_BATCH_SIZE);
      if (lastDoc) {
        pageQuery = pageQuery.startAfter(lastDoc);
      }

      const snapshot = await pageQuery.get();
      if (snapshot.empty) {
        break;
      }

      scannedCount += snapshot.docs.length;
      if (context?.emitStage && scannedCount % 1000 === 0) {
        context.emitStage('fetching_data' satisfies ToolStage, {
          scannedCount,
          entityType,
        });
      }

      for (const doc of snapshot.docs) {
        const record = this.sanitizeRecord({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        });
        if (!this.matchesEntityFilters(entityType, record, filters)) {
          continue;
        }

        totalCount += 1;
        if (items.length < limit) {
          items.push(this.mapEntity(entityType, record));
        }
      }

      if (snapshot.docs.length < SCAN_BATCH_SIZE) {
        break;
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    return { items, totalCount };
  }

  private getCollectionName(entityType: Exclude<PlatformEntityType, 'user_bundle'>): string {
    switch (entityType) {
      case 'users':
        return COLLECTIONS.USERS;
      case 'teams':
        return COLLECTIONS.TEAMS;
      case 'organizations':
        return COLLECTIONS.ORGANIZATIONS;
      case 'posts':
        return COLLECTIONS.POSTS;
      case 'recruiting':
        return COLLECTIONS.RECRUITING;
      case 'season_stats':
        return COLLECTIONS.PLAYER_STATS;
      case 'physical_metrics':
        return COLLECTIONS.PLAYER_METRICS;
      case 'roster_entries':
        return COLLECTIONS.ROSTER_ENTRIES;
      case 'events':
        return COLLECTIONS.EVENTS;
    }
  }

  private matchesEntityFilters(
    entityType: Exclude<PlatformEntityType, 'user_bundle'>,
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    switch (entityType) {
      case 'users':
        return this.matchesUserFilters(record, filters);
      case 'teams':
        return this.matchesTeamFilters(record, filters);
      case 'organizations':
        return this.matchesOrganizationFilters(record, filters);
      case 'posts':
        return this.matchesPostFilters(record, filters);
      case 'recruiting':
        return this.matchesRecruitingFilters(record, filters);
      case 'season_stats':
        return this.matchesSeasonStatsFilters(record, filters);
      case 'physical_metrics':
        return this.matchesPhysicalMetricsFilters(record, filters);
      case 'roster_entries':
        return this.matchesRosterEntryFilters(record, filters);
      case 'events':
        return this.matchesEventFilters(record, filters);
    }
  }

  private matchesUserFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.userId) {
      const recordId = String(record['id'] ?? record['uid'] ?? '');
      const uid = String(record['uid'] ?? '');
      if (recordId !== filters.userId && uid !== filters.userId) {
        return false;
      }
    }

    if (filters.unicode && String(record['unicode'] ?? '') !== filters.unicode) {
      return false;
    }

    if (filters.role && String(record['role'] ?? '').toLowerCase() !== filters.role) {
      return false;
    }

    if (filters.state) {
      const state =
        this.normalizeState(this.readNestedString(record, ['location', 'state'])) ??
        this.normalizeState(this.str(record, 'state'));
      if (state !== filters.state) {
        return false;
      }
    }

    if (filters.sport && !this.matchesSportFilter(record, filters.sport)) {
      return false;
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, [
        'displayName',
        'firstName',
        'lastName',
        'unicode',
        'highSchool',
        'school',
        'city',
        'state',
        'searchIndex',
      ])
    ) {
      return false;
    }

    return true;
  }

  private matchesTeamFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.teamId) {
      const recordId = String(record['id'] ?? '');
      const teamCode = String(record['teamCode'] ?? '');
      if (recordId !== filters.teamId && teamCode !== filters.teamId) {
        return false;
      }
    }

    if (filters.state) {
      const state =
        this.normalizeState(this.str(record, 'state')) ??
        this.normalizeState(this.readNestedString(record, ['location', 'state']));
      if (state !== filters.state) {
        return false;
      }
    }

    if (
      filters.sport &&
      String(record['sport'] ?? '').toLowerCase() !== filters.sport.toLowerCase()
    ) {
      return false;
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, [
        'name',
        'displayName',
        'teamName',
        'teamCode',
        'city',
        'state',
        'mascot',
        'slug',
      ])
    ) {
      return false;
    }

    return true;
  }

  private matchesOrganizationFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.organizationId && String(record['id'] ?? '') !== filters.organizationId) {
      return false;
    }

    if (filters.status && String(record['status'] ?? '').toLowerCase() !== filters.status) {
      return false;
    }

    if (filters.state) {
      const state =
        this.normalizeState(this.str(record, 'state')) ??
        this.normalizeState(this.readNestedString(record, ['location', 'state']));
      const location = String(record['location'] ?? '').toUpperCase();
      if (state !== filters.state && !location.includes(filters.state.toUpperCase())) {
        return false;
      }
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, ['name', 'type', 'status', 'location', 'mascot'])
    ) {
      return false;
    }

    return true;
  }

  private matchesPostFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.userId && String(record['userId'] ?? '') !== filters.userId) {
      return false;
    }

    if (filters.teamId && String(record['teamId'] ?? '') !== filters.teamId) {
      return false;
    }

    if (
      filters.organizationId &&
      String(record['organizationId'] ?? '') !== filters.organizationId
    ) {
      return false;
    }

    if (filters.postType && String(record['type'] ?? '').toLowerCase() !== filters.postType) {
      return false;
    }

    if (filters.sport) {
      const sportId = String(record['sportId'] ?? record['sport'] ?? '').toLowerCase();
      if (sportId !== filters.sport.toLowerCase()) {
        return false;
      }
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, [
        'title',
        'content',
        'type',
        'hashtags',
        'mentions',
      ])
    ) {
      return false;
    }

    return true;
  }

  private matchesRecruitingFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.userId && String(record['userId'] ?? '') !== filters.userId) {
      return false;
    }

    if (filters.teamId && String(record['teamId'] ?? '') !== filters.teamId) {
      return false;
    }

    if (
      filters.organizationId &&
      String(record['organizationId'] ?? '') !== filters.organizationId
    ) {
      return false;
    }

    if (filters.category && String(record['category'] ?? '').toLowerCase() !== filters.category) {
      return false;
    }

    if (
      filters.sport &&
      String(record['sport'] ?? '').toLowerCase() !== filters.sport.toLowerCase()
    ) {
      return false;
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, [
        'collegeName',
        'coachName',
        'category',
        'division',
        'conference',
        'source',
      ])
    ) {
      return false;
    }

    return true;
  }

  private matchesSeasonStatsFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.userId && String(record['userId'] ?? '') !== filters.userId) {
      return false;
    }

    if (filters.teamId && String(record['teamId'] ?? '') !== filters.teamId) {
      return false;
    }

    if (filters.category && String(record['category'] ?? '').toLowerCase() !== filters.category) {
      return false;
    }

    if (filters.sport) {
      const sportId = String(record['sportId'] ?? record['sport'] ?? '').toLowerCase();
      if (sportId !== filters.sport.toLowerCase()) {
        return false;
      }
    }

    if (filters.season && String(record['season'] ?? '') !== filters.season) {
      return false;
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, ['season', 'category', 'source', 'columns'])
    ) {
      return false;
    }

    return true;
  }

  private matchesPhysicalMetricsFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.userId && String(record['userId'] ?? '') !== filters.userId) {
      return false;
    }

    if (filters.category && String(record['category'] ?? '').toLowerCase() !== filters.category) {
      return false;
    }

    if (filters.field && String(record['field'] ?? '').toLowerCase() !== filters.field) {
      return false;
    }

    if (filters.sport) {
      const sportId = String(record['sportId'] ?? record['sport'] ?? '').toLowerCase();
      if (sportId !== filters.sport.toLowerCase()) {
        return false;
      }
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, ['label', 'field', 'category', 'source'])
    ) {
      return false;
    }

    return true;
  }

  private matchesRosterEntryFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.userId && String(record['userId'] ?? '') !== filters.userId) {
      return false;
    }

    if (filters.teamId && String(record['teamId'] ?? '') !== filters.teamId) {
      return false;
    }

    if (
      filters.organizationId &&
      String(record['organizationId'] ?? '') !== filters.organizationId
    ) {
      return false;
    }

    if (filters.role && String(record['role'] ?? '').toLowerCase() !== filters.role) {
      return false;
    }

    if (filters.status && String(record['status'] ?? '').toLowerCase() !== filters.status) {
      return false;
    }

    if (
      filters.sport &&
      String(record['sport'] ?? '').toLowerCase() !== filters.sport.toLowerCase()
    ) {
      return false;
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, [
        'displayName',
        'title',
        'role',
        'sport',
        'positions',
      ])
    ) {
      return false;
    }

    return true;
  }

  private matchesEventFilters(
    record: Record<string, unknown>,
    filters: PlatformDataFilters
  ): boolean {
    if (filters.userId && String(record['userId'] ?? '') !== filters.userId) {
      return false;
    }

    if (filters.teamId && String(record['teamId'] ?? '') !== filters.teamId) {
      return false;
    }

    if (
      filters.organizationId &&
      String(record['organizationId'] ?? '') !== filters.organizationId
    ) {
      return false;
    }

    if (filters.status && String(record['status'] ?? '').toLowerCase() !== filters.status) {
      return false;
    }

    if (filters.eventType && String(record['type'] ?? '').toLowerCase() !== filters.eventType) {
      return false;
    }

    if (filters.category && String(record['category'] ?? '').toLowerCase() !== filters.category) {
      return false;
    }

    if (
      filters.query &&
      !this.matchesQuery(record, filters.query, [
        'title',
        'description',
        'type',
        'category',
        'location',
        'opponent',
      ])
    ) {
      return false;
    }

    return true;
  }

  private matchesSportFilter(record: Record<string, unknown>, sport: string): boolean {
    const normalizedSport = sport.toLowerCase().trim();
    const topSport = String(record['primarySport'] ?? record['sport'] ?? '')
      .toLowerCase()
      .trim();
    if (topSport === normalizedSport) {
      return true;
    }

    const sports = Array.isArray(record['sports'])
      ? (record['sports'] as Array<Record<string, unknown>>)
      : [];
    return sports.some(
      (entry) =>
        String(entry['sport'] ?? '')
          .toLowerCase()
          .trim() === normalizedSport
    );
  }

  private matchesQuery(
    record: Record<string, unknown>,
    query: string,
    paths: readonly string[]
  ): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    return paths.some((path) =>
      this.valueContains(this.readPath(record, path.split('.')), normalizedQuery)
    );
  }

  private valueContains(value: unknown, normalizedQuery: string): boolean {
    if (typeof value === 'string') {
      return value.toLowerCase().includes(normalizedQuery);
    }

    if (Array.isArray(value)) {
      return value.some((entry) => this.valueContains(entry, normalizedQuery));
    }

    if (value && typeof value === 'object') {
      return Object.values(value as Record<string, unknown>).some((entry) =>
        this.valueContains(entry, normalizedQuery)
      );
    }

    return false;
  }

  private mapEntity(
    entityType: Exclude<PlatformEntityType, 'user_bundle'>,
    record: Record<string, unknown>
  ): Record<string, unknown> {
    switch (entityType) {
      case 'users':
        return this.mapUser(record);
      case 'teams':
        return this.pickFields(record, [
          'id',
          'teamCode',
          'name',
          'displayName',
          'teamName',
          'sport',
          'city',
          'state',
          'slug',
          'logoUrl',
          'teamLogoImg',
          'mascot',
        ]);
      case 'organizations':
        return this.pickFields(record, [
          'id',
          'name',
          'type',
          'status',
          'logoUrl',
          'primaryColor',
          'secondaryColor',
          'mascot',
          'location',
          'teamCount',
          'updatedAt',
        ]);
      case 'posts':
        return {
          ...this.pickFields(record, [
            'id',
            'userId',
            'teamId',
            'organizationId',
            'type',
            'title',
            'sportId',
            'visibility',
            'createdAt',
            'updatedAt',
          ]),
          contentPreview: this.toSnippet(this.str(record, 'content')),
          videoUrl: record['videoUrl'] ?? record['mediaUrl'],
        };
      case 'recruiting':
        return this.pickFields(record, [
          'id',
          'userId',
          'ownerType',
          'sport',
          'category',
          'collegeName',
          'division',
          'conference',
          'scholarshipType',
          'coachName',
          'coachEmail',
          'date',
          'source',
          'createdAt',
          'updatedAt',
        ]);
      case 'season_stats':
        return this.pickFields(record, [
          'id',
          'userId',
          'teamId',
          'sportId',
          'season',
          'category',
          'columns',
          'stats',
          'totals',
          'averages',
          'games',
          'gameLogs',
          'source',
          'updatedAt',
        ]);
      case 'physical_metrics':
        return this.pickFields(record, [
          'id',
          'userId',
          'sportId',
          'field',
          'label',
          'value',
          'unit',
          'category',
          'dateRecorded',
          'source',
          'updatedAt',
        ]);
      case 'roster_entries':
        return this.pickFields(record, [
          'id',
          'userId',
          'teamId',
          'organizationId',
          'displayName',
          'role',
          'sport',
          'title',
          'status',
          'jerseyNumber',
          'positions',
          'season',
          'classOfWhenJoined',
          'joinedAt',
          'updatedAt',
          'leftAt',
        ]);
      case 'events':
        return this.pickFields(record, [
          'id',
          'userId',
          'teamId',
          'organizationId',
          'type',
          'category',
          'title',
          'description',
          'status',
          'location',
          'opponent',
          'startsAt',
          'endsAt',
          'createdAt',
          'updatedAt',
        ]);
    }
  }

  private mapUser(user: Record<string, unknown>): Record<string, unknown> {
    const sports = Array.isArray(user['sports'])
      ? (user['sports'] as Array<Record<string, unknown>>)
      : [];
    const primarySport =
      sports.find(
        (sport) => typeof sport['sport'] === 'string' && String(sport['sport']).trim().length > 0
      ) ?? null;
    const sport =
      this.str(user, 'primarySport') ??
      this.str(user, 'sport') ??
      this.str(primarySport ?? {}, 'sport') ??
      undefined;
    const position =
      this.str(primarySport ?? {}, 'position') ?? this.str(user, 'position') ?? undefined;
    const teamName =
      this.readNestedString(primarySport ?? {}, ['team', 'name']) ??
      this.readNestedString(user, ['team', 'name']) ??
      this.str(user, 'highSchool') ??
      undefined;
    const state =
      this.normalizeState(this.readNestedString(user, ['location', 'state'])) ??
      this.normalizeState(this.str(user, 'state')) ??
      undefined;
    const unicode = this.str(user, 'unicode') ?? undefined;
    const fallbackName = [this.str(user, 'firstName'), this.str(user, 'lastName')]
      .filter(Boolean)
      .join(' ');
    const displayName = this.str(user, 'displayName') ?? (fallbackName || 'Unknown User');

    return {
      id: String(user['id'] ?? user['uid'] ?? ''),
      type: 'user',
      name: displayName,
      role: this.str(user, 'role') ?? undefined,
      sport,
      position,
      teamName,
      state,
      unicode,
      school: this.str(user, 'school') ?? this.str(user, 'highSchool') ?? undefined,
      route: unicode
        ? `/profile/${unicode}`
        : `/profile/${String(user['id'] ?? user['uid'] ?? '')}`,
      imageUrl: Array.isArray(user['profileImgs'])
        ? (user['profileImgs'] as unknown[]).find(
            (value): value is string => typeof value === 'string' && value.trim().length > 0
          )
        : undefined,
    };
  }

  private serializeFilters(filters: PlatformDataFilters): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== null && value !== undefined)
    );
  }

  private pickFields(
    record: Record<string, unknown>,
    fields: readonly string[]
  ): Record<string, unknown> {
    return this.sanitizeRecord(
      Object.fromEntries(
        fields.map((field) => [field, record[field]]).filter(([, value]) => value !== undefined)
      )
    );
  }

  private sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(record)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, this.normalizeValue(value)])
    );
  }

  private normalizeValue(value: unknown): unknown {
    if (value instanceof Timestamp) {
      return value.toDate().toISOString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((entry) => this.normalizeValue(entry));
    }

    if (value && typeof value === 'object') {
      if (
        'path' in (value as Record<string, unknown>) &&
        typeof (value as Record<string, unknown>)['path'] === 'string'
      ) {
        return (value as Record<string, unknown>)['path'];
      }

      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          this.normalizeValue(entry),
        ])
      );
    }

    return value;
  }

  private readPath(record: Record<string, unknown>, path: readonly string[]): unknown {
    let current: unknown = record;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return current;
  }

  private readNestedString(
    record: Record<string, unknown>,
    path: readonly string[]
  ): string | null {
    const value = this.readPath(record, path);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private normalizeState(value: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim();
    return normalized.length === 2 ? normalized.toUpperCase() : normalized;
  }

  private toSnippet(value: string | null): string | undefined {
    if (!value) return undefined;
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
}
