import type { Firestore } from 'firebase-admin/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import type { TeamCode } from '@nxt1/core';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { getAllTeams } from '../../../../services/team-code.service.js';
import { stagingDb } from '../../../../utils/firebase-staging.js';
import { logger } from '../../../../utils/logger.js';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const USER_SCAN_BATCH_SIZE = 200;

type SearchEntityType = 'teams' | 'users' | 'all';

interface SearchPlatformResultItem {
  readonly id: string;
  readonly type: 'team' | 'user';
  readonly name: string;
  readonly subtitle?: string;
  readonly route: string;
  readonly imageUrl?: string;
  readonly sport?: string;
  readonly state?: string;
  readonly role?: string;
  readonly teamCode?: string;
  readonly unicode?: string;
}

interface SearchPlatformFirestoreMap {
  readonly production?: Firestore;
  readonly staging?: Firestore;
}

interface SearchPlatformSearchResult {
  readonly items: SearchPlatformResultItem[];
  readonly totalCount: number;
  readonly matchMode?: 'search_index' | 'filtered_browse' | 'fallback_filtered_browse';
}

export class SearchNxt1PlatformTool extends BaseTool {
  readonly name = 'search_nxt1_platform';

  readonly description =
    'Search NXT1 teams and user profiles across the platform. ' +
    'Use this when the user asks what teams are on NXT1, wants to find other users, or wants counts/browse results by sport, role, state, or name. ' +
    'If entityType is "teams" and query is omitted, this tool returns a browseable list of active teams. ' +
    'For platform count questions, use the returned totalCount field instead of inferring from the visible items array.';

  readonly parameters = {
    type: 'object',
    properties: {
      entityType: {
        type: 'string',
        enum: ['teams', 'users', 'all'],
        description: 'What to search across the NXT1 platform.',
      },
      query: {
        type: 'string',
        description:
          'Optional free-text search. Use for person or team names. Not required when browsing or counting users by sport, role, or state.',
      },
      sport: {
        type: 'string',
        description: 'Optional sport filter, for example Football or Basketball.',
      },
      state: {
        type: 'string',
        description: 'Optional state filter, for example TX or Texas.',
      },
      role: {
        type: 'string',
        description:
          'Optional user-role filter for user searches, for example athlete, coach, or parent.',
      },
      limit: {
        type: 'number',
        description: `Optional max rows to return. Hard-capped at ${MAX_LIMIT}.`,
      },
    },
    required: ['entityType'],
  } as const;

  override readonly allowedAgents = [
    'general',
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'database' as const;

  constructor(private readonly firestoreMap: SearchPlatformFirestoreMap = {}) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const entityType = this.parseEntityType(input['entityType']);
    if (!entityType) {
      return {
        success: false,
        error: 'Parameter "entityType" must be one of: teams, users, all.',
      };
    }

    const query = this.str(input, 'query');
    const sport = this.str(input, 'sport');
    const state = this.normalizeState(this.str(input, 'state'));
    const role = this.str(input, 'role')?.toLowerCase();
    const limit = Math.min(Math.max(this.num(input, 'limit') ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    if (
      (entityType === 'users' || entityType === 'all') &&
      !query &&
      !this.hasUserBrowseFilters({ sport, state, role })
    ) {
      return {
        success: false,
        error:
          'Parameter "query" is required when searching NXT1 users unless you provide at least one filter such as sport, state, or role.',
      };
    }

    try {
      context?.onProgress?.('Searching NXT1 teams and profiles…');
      const db = this.resolveDb(context);

      const teamPromise =
        entityType === 'users'
          ? Promise.resolve({ items: [] as SearchPlatformResultItem[], totalCount: 0 })
          : this.searchTeams(db, { query, sport, state, limit });
      const userPromise =
        entityType === 'teams'
          ? Promise.resolve({
              items: [] as SearchPlatformResultItem[],
              totalCount: 0,
            } as SearchPlatformSearchResult)
          : this.searchUsers(db, { query, sport, state, role, limit });

      const [teams, users] = await Promise.all([teamPromise, userPromise]);
      const items = [...teams.items, ...users.items].slice(0, limit);
      const totalCount = teams.totalCount + users.totalCount;

      return {
        success: true,
        data: {
          entityType,
          ...(query ? { query } : {}),
          ...(sport ? { sport } : {}),
          ...(state ? { state } : {}),
          count: items.length,
          totalCount,
          ...(users.matchMode ? { userMatchMode: users.matchMode } : {}),
          items,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search the NXT1 platform';
      logger.error('[SearchNxt1PlatformTool] Search failed', {
        entityType,
        query,
        sport,
        state,
        role,
        environment: context?.environment ?? 'production',
        error: message,
      });
      return { success: false, error: message };
    }
  }

  private resolveDb(context?: ToolExecutionContext): Firestore {
    if (context?.environment === 'staging') {
      return this.firestoreMap.staging ?? stagingDb;
    }

    return this.firestoreMap.production ?? getFirestore();
  }

  private parseEntityType(value: unknown): SearchEntityType | null {
    return value === 'teams' || value === 'users' || value === 'all' ? value : null;
  }

  private async searchTeams(
    db: Firestore,
    input: {
      query: string | null;
      sport: string | null;
      state: string | null;
      limit: number;
    }
  ): Promise<SearchPlatformSearchResult> {
    const result = await getAllTeams(db, {
      limit: input.limit,
      offset: 0,
      ...(input.sport ? { sportName: input.sport } : {}),
      ...(input.state ? { state: input.state } : {}),
      ...(input.query ? { search: input.query } : {}),
      sortBy: 'traffic',
      sortOrder: 'desc',
    });

    return {
      items: result.teams.slice(0, input.limit).map((team) => this.mapTeam(team)),
      totalCount: result.total,
    };
  }

  private async searchUsers(
    db: Firestore,
    input: {
      query: string | null;
      sport: string | null;
      state: string | null;
      role: string | undefined;
      limit: number;
    }
  ): Promise<SearchPlatformSearchResult> {
    const normalizedQuery = input.query?.toLowerCase().trim() ?? null;
    const hasBrowseFilters = this.hasUserBrowseFilters(input);

    if (!normalizedQuery) {
      return hasBrowseFilters
        ? this.browseUsers(db, input, 'filtered_browse')
        : { items: [], totalCount: 0 };
    }

    if (normalizedQuery.length < 2) {
      return hasBrowseFilters
        ? this.browseUsers(db, input, 'filtered_browse')
        : { items: [], totalCount: 0 };
    }

    if (this.isGenericUserCategoryQuery(normalizedQuery, input)) {
      return this.browseUsers(db, input, 'filtered_browse');
    }

    let query = db.collection('Users') as FirebaseFirestore.Query;
    if (input.role) {
      query = query.where('role', '==', input.role);
    }
    query = query.where('searchIndex', 'array-contains', normalizedQuery).limit(input.limit * 2);

    const snapshot = await query.get();
    const matchedUsers = snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
      .filter((user) => this.matchesUserFilters(user, input));

    if (matchedUsers.length > 0 || !hasBrowseFilters) {
      return {
        items: matchedUsers.slice(0, input.limit).map((user) => this.mapUser(user)),
        totalCount: matchedUsers.length,
        matchMode: 'search_index',
      };
    }

    return this.browseUsers(db, input, 'fallback_filtered_browse');
  }

  private async browseUsers(
    db: Firestore,
    input: {
      query: string | null;
      sport: string | null;
      state: string | null;
      role: string | undefined;
      limit: number;
    },
    matchMode: 'filtered_browse' | 'fallback_filtered_browse'
  ): Promise<SearchPlatformSearchResult> {
    let query = db.collection('Users') as FirebaseFirestore.Query;
    if (input.role) {
      query = query.where('role', '==', input.role);
    }

    let totalCount = 0;
    const items: SearchPlatformResultItem[] = [];
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

    while (true) {
      let pageQuery = query.limit(USER_SCAN_BATCH_SIZE);
      if (lastDoc) {
        pageQuery = pageQuery.startAfter(lastDoc);
      }

      const snapshot = await pageQuery.get();
      if (snapshot.empty) {
        break;
      }

      for (const doc of snapshot.docs) {
        const user = { id: doc.id, ...(doc.data() as Record<string, unknown>) };
        if (!this.matchesUserFilters(user, input)) {
          continue;
        }

        totalCount += 1;
        if (items.length < input.limit) {
          items.push(this.mapUser(user));
        }
      }

      if (snapshot.docs.length < USER_SCAN_BATCH_SIZE) {
        break;
      }

      lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    return { items, totalCount, matchMode };
  }

  private hasUserBrowseFilters(input: {
    sport: string | null;
    state: string | null;
    role: string | undefined;
  }): boolean {
    return Boolean(input.sport || input.state || input.role);
  }

  private isGenericUserCategoryQuery(
    normalizedQuery: string,
    input: {
      sport: string | null;
      state: string | null;
      role: string | undefined;
    }
  ): boolean {
    const tokens = normalizedQuery
      .split(/\s+/)
      .map((token) => token.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);

    if (tokens.length === 0) {
      return false;
    }

    const allowed = new Set<string>([
      'athlete',
      'athletes',
      'player',
      'players',
      'user',
      'users',
      'profile',
      'profiles',
    ]);

    if (input.role) {
      allowed.add(input.role);
      allowed.add(`${input.role}s`);
    }

    if (input.sport) {
      for (const token of input.sport.toLowerCase().split(/\s+/)) {
        if (token) allowed.add(token);
      }
    }

    if (input.state) {
      for (const token of input.state.toLowerCase().split(/\s+/)) {
        if (token) allowed.add(token);
      }
    }

    return tokens.every((token) => allowed.has(token));
  }

  private matchesUserFilters(
    user: Record<string, unknown>,
    input: { sport: string | null; state: string | null; role: string | undefined }
  ): boolean {
    if (input.role && String(user['role'] ?? '').toLowerCase() !== input.role) {
      return false;
    }

    if (input.state) {
      const nestedState = this.normalizeState(this.readNestedString(user, ['location', 'state']));
      const topState = this.normalizeState(this.str(user, 'state'));
      if (nestedState !== input.state && topState !== input.state) {
        return false;
      }
    }

    if (input.sport) {
      const normalizedSport = input.sport.toLowerCase().trim();
      const topSport = String(user['primarySport'] ?? user['sport'] ?? '')
        .toLowerCase()
        .trim();
      const sports = Array.isArray(user['sports'])
        ? (user['sports'] as Array<Record<string, unknown>>)
        : [];
      const matchedSport =
        topSport === normalizedSport ||
        sports.some(
          (sport) =>
            String(sport['sport'] ?? '')
              .toLowerCase()
              .trim() === normalizedSport
        );
      if (!matchedSport) {
        return false;
      }
    }

    return true;
  }

  private mapTeam(team: TeamCode): SearchPlatformResultItem {
    const location = [team.city, team.state].filter(Boolean).join(', ');
    return {
      id: team.id ?? team.teamCode,
      type: 'team',
      name: team.teamName,
      subtitle: [team.sport, location].filter(Boolean).join(' • ') || undefined,
      route: team.slug ? `/team/${team.slug}/${team.teamCode}` : `/team/${team.teamCode}`,
      imageUrl: team.logoUrl ?? team.teamLogoImg,
      sport: team.sport,
      state: team.state,
      teamCode: team.teamCode,
    };
  }

  private mapUser(user: Record<string, unknown>): SearchPlatformResultItem {
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
      subtitle: [sport, position, teamName, state].filter(Boolean).join(' • ') || undefined,
      route: unicode
        ? `/profile/${unicode}`
        : `/profile/${String(user['id'] ?? user['uid'] ?? '')}`,
      imageUrl: Array.isArray(user['profileImgs'])
        ? (user['profileImgs'] as unknown[]).find(
            (value): value is string => typeof value === 'string' && value.trim().length > 0
          )
        : undefined,
      sport,
      state,
      role: this.str(user, 'role') ?? undefined,
      unicode,
    };
  }

  private readNestedString(
    record: Record<string, unknown>,
    path: readonly string[]
  ): string | null {
    let current: unknown = record;
    for (const segment of path) {
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        return null;
      }
      current = (current as Record<string, unknown>)[segment];
    }

    return typeof current === 'string' && current.trim().length > 0 ? current.trim() : null;
  }

  private normalizeState(value: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim();
    return normalized.length === 2 ? normalized.toUpperCase() : normalized;
  }
}
