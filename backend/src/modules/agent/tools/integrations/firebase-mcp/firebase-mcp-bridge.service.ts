import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Firestore } from 'firebase-admin/firestore';
import { RosterEntryStatus } from '@nxt1/core/models';
import {
  CACHE_TTL,
  generateCacheKey,
  getCacheService,
  incrementCacheHit,
  incrementCacheMiss,
  incrementCacheSet,
} from '../../../../../services/core/cache.service.js';
import { logger } from '../../../../../utils/logger.js';
import { db } from '../../../../../utils/firebase.js';
import { stagingDb } from '../../../../../utils/firebase-staging.js';
import type { ToolExecutionContext } from '../../base.tool.js';
import { BaseMcpClientService, type McpToolCallResult } from '../base-mcp-client.service.js';
import {
  type FirebaseMcpListViewsResult,
  FirebaseMcpListViewsResultSchema,
  type FirebaseMcpQueryInput,
  type FirebaseMcpQueryResult,
  FirebaseMcpQueryResultSchema,
  createSignedScopeEnvelope,
  type FirebaseMcpScope,
  type FirebaseViewName,
} from './shared.js';

const FIREBASE_MCP_TOOL_TIMEOUT_MS = 30_000;
const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const TEAMS_COLLECTION = 'Teams';
const ORGANIZATIONS_COLLECTION = 'Organizations';

const FIREBASE_MCP_CACHE_PREFIX = {
  LIST_VIEWS: 'agent:mcp:firebase:list-views',
  QUERY_VIEW: 'agent:mcp:firebase:query-view',
} as const;

function resolveFirestoreTarget(): Firestore {
  const target =
    process.env['FIREBASE_MCP_TARGET_APP'] ??
    (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'default');

  if (target === 'staging') {
    return stagingDb;
  }

  return db;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function extractPayload(result: McpToolCallResult): unknown {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent;
  }

  const textPayload = result.content
    .flatMap((content) => {
      if (content.type === 'text' && content.text) return [content.text];
      if (typeof content.data === 'string' && content.data.trim().length > 0) return [content.data];
      return [] as string[];
    })
    .join('\n')
    .trim();

  if (!textPayload) {
    throw new Error('Firebase MCP returned no structured content');
  }

  return JSON.parse(textPayload);
}

function resolveCacheTtl(view: FirebaseViewName): number {
  switch (view) {
    case 'user_profile_snapshot':
    case 'user_team_membership':
    case 'user_physical_metrics':
    case 'team_profile_snapshot':
    case 'organization_profile_snapshot':
      return CACHE_TTL.PROFILES;
    case 'user_schedule_events':
    case 'user_recruiting_status':
    case 'user_season_stats':
    case 'team_roster_members':
    case 'organization_roster_members':
      return CACHE_TTL.SEARCH;
    case 'user_timeline_feed':
    case 'user_highlight_videos':
    case 'team_highlight_videos':
    case 'organization_highlight_videos':
    case 'user_current_playbook':
      return CACHE_TTL.FEED;
    case 'user_active_goals':
      return CACHE_TTL.PROFILES;
    case 'user_goal_history':
      return CACHE_TTL.SEARCH;
    default:
      return CACHE_TTL.SEARCH;
  }
}

export class FirebaseMcpBridgeService extends BaseMcpClientService {
  readonly serverName = 'firebase';

  private readonly scopeSecret = randomBytes(32).toString('hex');
  private readonly firestore = resolveFirestoreTarget();

  private extractOrganizationAdminUserIds(admins: unknown): string[] {
    if (!Array.isArray(admins)) {
      return [];
    }

    return Array.from(
      new Set(
        admins
          .map((admin) =>
            typeof admin === 'object' && admin !== null && 'userId' in admin
              ? (admin['userId'] as string | undefined)
              : undefined
          )
          .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
      )
    );
  }

  protected getTransport(): Transport {
    const serverPath = fileURLToPath(new URL('./firebase-mcp-server.js', import.meta.url));

    return new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      env: {
        ...(process.env as Record<string, string>),
        FIREBASE_MCP_SCOPE_SECRET: this.scopeSecret,
        FIREBASE_MCP_TARGET_APP:
          process.env['FIREBASE_MCP_TARGET_APP'] ??
          (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'default'),
      },
    });
  }

  private async resolveAccessScope(context: ToolExecutionContext): Promise<FirebaseMcpScope> {
    const [rosterSnapshot, organizationSnapshot] = await Promise.all([
      this.firestore
        .collection(ROSTER_ENTRIES_COLLECTION)
        .where('userId', '==', context.userId)
        .where('status', 'in', [RosterEntryStatus.ACTIVE, RosterEntryStatus.PENDING])
        .get(),
      this.firestore.collection(ORGANIZATIONS_COLLECTION).get(),
    ]);

    const orgSnapshotDocs = new Map();
    organizationSnapshot.docs
      .filter((doc) =>
        this.extractOrganizationAdminUserIds(doc.data()?.['admins']).includes(context.userId)
      )
      .forEach((doc) => orgSnapshotDocs.set(doc.id, doc));

    const teamIds = uniqueSorted(
      rosterSnapshot.docs
        .map((doc) => doc.data()['teamId'])
        .filter((teamId): teamId is string => typeof teamId === 'string')
    );

    const teamDocs = await Promise.all(
      teamIds.map(async (teamId) => {
        const snapshot = await this.firestore.collection(TEAMS_COLLECTION).doc(teamId).get();
        return snapshot.exists ? snapshot.data() : null;
      })
    );

    const teamOrganizationIds = teamDocs
      .map((teamDoc) => teamDoc?.['organizationId'])
      .filter((organizationId): organizationId is string => typeof organizationId === 'string');

    const adminOrganizationIds = Array.from(orgSnapshotDocs.values()).map((doc) => doc.id);
    const organizationIds = uniqueSorted([...teamOrganizationIds, ...adminOrganizationIds]);

    return {
      userId: context.userId,
      teamIds,
      organizationIds,
      ...(context.threadId ? { threadId: context.threadId } : {}),
      ...(context.sessionId ? { sessionId: context.sessionId } : {}),
      ...(teamIds.length > 0 ? { defaultTeamId: teamIds[0] } : {}),
      ...(organizationIds.length > 0 ? { defaultOrganizationId: organizationIds[0] } : {}),
    };
  }

  async listViews(context: ToolExecutionContext): Promise<FirebaseMcpListViewsResult> {
    context.emitStage?.('fetching_data', {
      source: 'firebase_mcp',
      phase: 'resolve_scope',
      icon: 'database',
    });
    const scope = await this.resolveAccessScope(context);
    const cache = getCacheService();
    const cacheKey = generateCacheKey(FIREBASE_MCP_CACHE_PREFIX.LIST_VIEWS, {
      userId: scope.userId,
      teamIds: scope.teamIds.join(','),
      organizationIds: scope.organizationIds.join(','),
    });
    const cached = await cache.get(cacheKey);

    if (cached) {
      incrementCacheHit();
      const cachedText = typeof cached === 'string' ? cached : JSON.stringify(cached);
      return FirebaseMcpListViewsResultSchema.parse(JSON.parse(cachedText));
    }

    incrementCacheMiss();
    context.emitStage?.('fetching_data', {
      source: 'firebase_mcp',
      phase: 'list_views',
      icon: 'database',
    });
    const result = await this.executeTool(
      'firebase_list_views',
      { scopeEnvelope: createSignedScopeEnvelope(scope, this.scopeSecret) },
      { timeoutMs: FIREBASE_MCP_TOOL_TIMEOUT_MS }
    );
    const payload = FirebaseMcpListViewsResultSchema.parse(extractPayload(result));

    await cache.set(cacheKey, JSON.stringify(payload), { ttl: CACHE_TTL.SEARCH });
    incrementCacheSet();
    return payload;
  }

  async queryView(
    input: FirebaseMcpQueryInput,
    context: ToolExecutionContext
  ): Promise<FirebaseMcpQueryResult> {
    context.emitStage?.('fetching_data', {
      source: 'firebase_mcp',
      phase: 'resolve_scope',
      view: input.view,
      icon: 'database',
    });
    const scope = await this.resolveAccessScope(context);

    const scopeEnvelope = createSignedScopeEnvelope(scope, this.scopeSecret);
    const args = {
      scopeEnvelope,
      view: input.view,
      ...(input.filters ? { filters: input.filters } : {}),
      ...(input.limit ? { limit: input.limit } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    };

    const cache = getCacheService();
    const cacheKey = generateCacheKey(FIREBASE_MCP_CACHE_PREFIX.QUERY_VIEW, {
      userId: context.userId,
      teamIds: scope.teamIds.join(','),
      organizationIds: scope.organizationIds.join(','),
      view: input.view,
      limit: input.limit,
      cursor: input.cursor,
      filters: input.filters ? JSON.stringify(input.filters) : undefined,
    });

    const cached = await cache.get(cacheKey);
    if (cached) {
      incrementCacheHit();
      const cachedText = typeof cached === 'string' ? cached : JSON.stringify(cached);
      return FirebaseMcpQueryResultSchema.parse(JSON.parse(cachedText));
    }

    incrementCacheMiss();
    context.emitStage?.('fetching_data', {
      source: 'firebase_mcp',
      phase: 'query_view',
      view: input.view,
      icon: 'database',
    });
    logger.info('[FirebaseMCP] Querying named view', {
      view: input.view,
      userId: context.userId,
      teamCount: scope.teamIds.length,
      organizationCount: scope.organizationIds.length,
      sessionId: context.sessionId,
      threadId: context.threadId,
    });

    const result = await this.executeTool('firebase_query_view', args, {
      timeoutMs: FIREBASE_MCP_TOOL_TIMEOUT_MS,
      signal: context.signal,
    });

    const payload = FirebaseMcpQueryResultSchema.parse(extractPayload(result));

    await cache.set(cacheKey, JSON.stringify(payload), { ttl: resolveCacheTtl(input.view) });
    incrementCacheSet();
    return payload;
  }
}
