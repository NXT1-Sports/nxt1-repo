import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { AgentEngineError } from '../../../exceptions/agent-engine.error.js';
import { logger } from '../../../../../utils/logger.js';
import { BaseMcpClientService, type McpToolCallResult } from '../base-mcp-client.service.js';
import {
  OutstandAccountMetricsSchema,
  OutstandCreatePostResultSchema,
  OutstandPostAnalyticsSchema,
  OutstandSocialAccountSchema,
  type OutstandAccountMetrics,
  type OutstandCreatePostResult,
  type OutstandPostAnalytics,
  type OutstandSocialAccount,
  type OutstandSocialPlatform,
  type PublishPostToSocialsInput,
} from './schemas.js';

const DEFAULT_TIMEOUT_MS = 45_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function extractTextPayload(result: McpToolCallResult): string {
  return result.content
    .flatMap((part) => {
      if (part.type === 'text' && typeof part.text === 'string') return [part.text.trim()];
      if (typeof part.data === 'string') return [part.data.trim()];
      return [] as string[];
    })
    .filter((value) => value.length > 0)
    .join('\n')
    .trim();
}

function extractPayload(result: McpToolCallResult): unknown {
  if (result.structuredContent && Object.keys(result.structuredContent).length > 0) {
    return result.structuredContent;
  }

  const text = extractTextPayload(result);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function extractErrorMessage(result: McpToolCallResult): string {
  const payload = extractPayload(result);
  const record = asRecord(payload);

  if (record) {
    const error = record['error'];
    const message = record['message'];
    if (typeof error === 'string' && error.trim().length > 0) return error;
    if (typeof message === 'string' && message.trim().length > 0) return message;
  }

  const text = extractTextPayload(result);
  return text || 'Unknown Outstand MCP error';
}

function getNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function findFirstUrlCandidate(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findFirstUrlCandidate(entry);
      if (found) return found;
    }
    return null;
  }

  const record = asRecord(value);
  if (!record) return null;

  const urlKeys = [
    'auth_url',
    'authorization_url',
    'url',
    'redirect_url',
    'authUrl',
    'authorizationUrl',
    'redirectUrl',
    'text',
  ] as const;

  for (const key of urlKeys) {
    const candidate = getString(record[key]);
    if (candidate && (candidate.startsWith('http://') || candidate.startsWith('https://'))) {
      return candidate;
    }
  }

  for (const nestedKey of ['data', 'result', 'response']) {
    const nested = asRecord(record[nestedKey]);
    if (!nested) continue;
    const nestedCandidate = findFirstUrlCandidate(nested);
    if (nestedCandidate) return nestedCandidate;
  }

  for (const nested of Object.values(record)) {
    const nestedCandidate = findFirstUrlCandidate(nested);
    if (nestedCandidate) return nestedCandidate;
  }

  return null;
}

function toIsoStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function mapNetwork(value: unknown): OutstandSocialPlatform | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'twitter') return 'x';
  if (
    normalized === 'x' ||
    normalized === 'instagram' ||
    normalized === 'youtube' ||
    normalized === 'tiktok'
  ) {
    return normalized;
  }

  return null;
}

function normalizeSocialAccount(value: unknown): OutstandSocialAccount | null {
  const record = asRecord(value);
  if (!record) return null;

  const parsed = OutstandSocialAccountSchema.safeParse({
    id: getString(record['id']) ?? getString(record['social_account_id']),
    network: mapNetwork(record['network']) ?? mapNetwork(record['platform']),
    username: getString(record['username']) ?? getString(record['handle']),
    displayName: getString(record['display_name']) ?? getString(record['displayName']),
    profileUrl: getString(record['profile_url']) ?? getString(record['profileUrl']),
    followerCount:
      getNumber(record['followers']) || getNumber(record['follower_count']) || undefined,
    connectedAt:
      toIsoStringOrUndefined(record['connected_at']) ??
      toIsoStringOrUndefined(record['created_at']) ??
      undefined,
    isActive: typeof record['is_active'] === 'boolean' ? record['is_active'] : true,
  });

  return parsed.success ? parsed.data : null;
}

function isToolNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    (message.includes('tool') && message.includes('not found')) ||
    message.includes('method not found') ||
    message.includes('unknown tool')
  );
}

function normalizeCreatePostResult(payload: unknown): OutstandCreatePostResult {
  const record = asRecord(payload) ?? {};

  const postIdsRaw = record['post_ids'] ?? record['postIds'] ?? record['ids'];
  const postIds = Array.isArray(postIdsRaw)
    ? postIdsRaw.map((value) => getString(value)).filter((value): value is string => !!value)
    : [];

  const singlePostId = getString(record['post_id']) ?? getString(record['id']);
  if (singlePostId && postIds.length === 0) {
    postIds.push(singlePostId);
  }

  const parsed = OutstandCreatePostResultSchema.safeParse({
    postIds,
    scheduledAt:
      toIsoStringOrUndefined(record['scheduled_at']) ??
      toIsoStringOrUndefined(record['scheduledAt']) ??
      undefined,
    status: getString(record['status']) ?? undefined,
    raw: record,
  });

  if (!parsed.success) {
    throw new AgentEngineError(
      'OUTSTAND_MCP_INVALID_RESPONSE',
      'Outstand create_post response shape was invalid.'
    );
  }

  return parsed.data;
}

function normalizePostAnalytics(postId: string, payload: unknown): OutstandPostAnalytics {
  const record = asRecord(payload) ?? {};

  const parsed = OutstandPostAnalyticsSchema.safeParse({
    postId,
    likes: getNumber(record['likes']),
    comments: getNumber(record['comments']),
    shares: getNumber(record['shares']),
    views: getNumber(record['views']),
    impressions: getNumber(record['impressions']),
    reach: getNumber(record['reach']),
    engagementRate: getNumber(record['engagement_rate'] ?? record['engagementRate']),
    raw: record,
  });

  if (!parsed.success) {
    throw new AgentEngineError(
      'OUTSTAND_MCP_INVALID_RESPONSE',
      'Outstand get_post_analytics response shape was invalid.'
    );
  }

  return parsed.data;
}

function normalizeAccountMetrics(
  socialAccountId: string,
  payload: unknown
): OutstandAccountMetrics {
  const record = asRecord(payload) ?? {};

  const trendPointsRaw =
    (Array.isArray(record['trend_points']) && record['trend_points']) ||
    (Array.isArray(record['trendPoints']) && record['trendPoints']) ||
    (Array.isArray(record['daily_metrics']) && record['daily_metrics']) ||
    [];

  const trendPoints = trendPointsRaw
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => !!entry)
    .map((entry) => ({
      date: getString(entry['date']) ?? getString(entry['day']) ?? '',
      followerCount: getNumber(entry['follower_count'] ?? entry['followers']) || undefined,
      engagementRate: getNumber(entry['engagement_rate']) || undefined,
      likes: getNumber(entry['likes']) || undefined,
      comments: getNumber(entry['comments']) || undefined,
      shares: getNumber(entry['shares']) || undefined,
      views: getNumber(entry['views']) || undefined,
    }))
    .filter((entry) => entry.date.length > 0);

  const parsed = OutstandAccountMetricsSchema.safeParse({
    socialAccountId,
    followerCount: getNumber(record['follower_count'] ?? record['followers']),
    engagementRate: getNumber(record['engagement_rate'] ?? record['engagementRate']),
    likes: getNumber(record['likes']),
    comments: getNumber(record['comments']),
    shares: getNumber(record['shares']),
    views: getNumber(record['views']),
    impressions: getNumber(record['impressions']),
    reach: getNumber(record['reach']),
    startDate:
      toIsoStringOrUndefined(record['start_date']) ??
      toIsoStringOrUndefined(record['startDate']) ??
      undefined,
    endDate:
      toIsoStringOrUndefined(record['end_date']) ??
      toIsoStringOrUndefined(record['endDate']) ??
      undefined,
    trendPoints,
    raw: record,
  });

  if (!parsed.success) {
    throw new AgentEngineError(
      'OUTSTAND_MCP_INVALID_RESPONSE',
      'Outstand get_account_metrics response shape was invalid.'
    );
  }

  return parsed.data;
}

export interface ResolveConnectionInput {
  readonly platform: OutstandSocialPlatform;
  readonly pendingConnectionId?: string;
  readonly connectionId?: string;
  readonly code?: string;
  readonly socialAccountId?: string;
}

export class OutstandSocialBridgeService extends BaseMcpClientService {
  readonly serverName = 'outstand-mcp';

  private readonly mcpUrl: string;
  private readonly apiKey: string;

  constructor() {
    super();

    const apiKey = process.env['OUTSTAND_API_KEY']?.trim();
    if (!apiKey) {
      throw new AgentEngineError(
        'OUTSTAND_MCP_CONFIG_MISSING_KEY',
        'OUTSTAND_API_KEY is required for OutstandSocialBridgeService.'
      );
    }

    this.apiKey = apiKey;
    this.mcpUrl = (process.env['OUTSTAND_MCP_URL'] ?? 'https://mcp.outstand.so/mcp').trim();
  }

  protected getTransport(): Transport {
    return new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    });
  }

  private async executeFirstAvailable(
    toolNames: readonly string[],
    args: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<McpToolCallResult> {
    let lastError: unknown = null;

    for (const toolName of toolNames) {
      try {
        return await this.executeTool(toolName, args, { timeoutMs });
      } catch (error) {
        lastError = error;
        if (!isToolNotFoundError(error)) {
          throw error;
        }
      }
    }

    throw new AgentEngineError(
      'OUTSTAND_MCP_TOOL_UNAVAILABLE',
      `No compatible Outstand MCP tool found. Tried: ${toolNames.join(', ')}`,
      { cause: lastError }
    );
  }

  async listSocialAccounts(network?: OutstandSocialPlatform): Promise<OutstandSocialAccount[]> {
    const args = network ? { network } : {};
    const result = await this.executeTool('list_social_accounts', args, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });

    if (result.isError) {
      throw new AgentEngineError('OUTSTAND_MCP_REQUEST_FAILED', extractErrorMessage(result));
    }

    const payload = extractPayload(result);
    const record = asRecord(payload) ?? {};

    const candidates = [
      record['accounts'],
      record['social_accounts'],
      record['items'],
      record['data'],
      payload,
    ];

    for (const candidate of candidates) {
      if (!Array.isArray(candidate)) continue;

      const accounts = candidate
        .map((entry) => normalizeSocialAccount(entry))
        .filter((entry): entry is OutstandSocialAccount => !!entry);

      if (accounts.length > 0 || candidate.length === 0) {
        return network ? accounts.filter((account) => account.network === network) : accounts;
      }
    }

    return [];
  }

  async getSocialAccount(socialAccountId: string): Promise<OutstandSocialAccount | null> {
    const result = await this.executeTool(
      'get_social_account',
      { social_account_id: socialAccountId },
      { timeoutMs: DEFAULT_TIMEOUT_MS }
    );

    if (result.isError) {
      throw new AgentEngineError('OUTSTAND_MCP_REQUEST_FAILED', extractErrorMessage(result));
    }

    const payload = extractPayload(result);
    const record = asRecord(payload) ?? {};

    const account =
      normalizeSocialAccount(record['social_account']) ??
      normalizeSocialAccount(record['account']) ??
      normalizeSocialAccount(payload);

    return account;
  }

  async deleteSocialAccount(socialAccountId: string): Promise<void> {
    const result = await this.executeTool(
      'delete_social_account',
      { social_account_id: socialAccountId },
      { timeoutMs: DEFAULT_TIMEOUT_MS }
    );

    if (result.isError) {
      throw new AgentEngineError('OUTSTAND_MCP_REQUEST_FAILED', extractErrorMessage(result));
    }
  }

  async getAuthUrl(platform: OutstandSocialPlatform, callbackUrl: string): Promise<string> {
    const result = await this.executeTool(
      'get_auth_url',
      {
        network: platform,
        // Outstand deployments are inconsistent on callback field naming.
        // Send all common aliases so callback routing works reliably.
        callback_url: callbackUrl,
        callbackUrl,
        redirect_uri: callbackUrl,
        redirectUrl: callbackUrl,
      },
      { timeoutMs: DEFAULT_TIMEOUT_MS }
    );

    if (result.isError) {
      throw new AgentEngineError('OUTSTAND_MCP_REQUEST_FAILED', extractErrorMessage(result));
    }

    const payload = extractPayload(result);
    const authUrl = findFirstUrlCandidate(payload);

    if (!authUrl) {
      throw new AgentEngineError(
        'OUTSTAND_MCP_INVALID_RESPONSE',
        'Outstand get_auth_url did not include an auth URL.'
      );
    }

    return authUrl;
  }

  async createPost(input: {
    readonly content: string;
    readonly socialAccountIds: readonly string[];
    readonly mediaIds?: readonly string[];
    readonly scheduledAt?: string;
    readonly firstComment?: string;
    readonly threadContent?: readonly string[];
    readonly platformOverrides?: Record<string, unknown>;
  }): Promise<OutstandCreatePostResult> {
    const args: Record<string, unknown> = {
      content: input.content,
      social_account_ids: input.socialAccountIds,
      ...(input.mediaIds && input.mediaIds.length > 0 ? { media_ids: input.mediaIds } : {}),
      ...(input.scheduledAt ? { scheduled_at: input.scheduledAt } : {}),
      ...(input.firstComment ? { first_comment: input.firstComment } : {}),
      ...(input.threadContent && input.threadContent.length > 0
        ? { thread_content: input.threadContent }
        : {}),
      ...(input.platformOverrides ? { platform_overrides: input.platformOverrides } : {}),
    };

    const result = await this.executeTool('create_post', args, {
      timeoutMs: input.scheduledAt ? DEFAULT_TIMEOUT_MS : DEFAULT_TIMEOUT_MS,
    });

    if (result.isError) {
      throw new AgentEngineError('OUTSTAND_MCP_REQUEST_FAILED', extractErrorMessage(result));
    }

    return normalizeCreatePostResult(extractPayload(result));
  }

  async getPostAnalytics(postId: string): Promise<OutstandPostAnalytics> {
    const result = await this.executeTool(
      'get_post_analytics',
      { post_id: postId },
      {
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }
    );

    if (result.isError) {
      throw new AgentEngineError('OUTSTAND_MCP_REQUEST_FAILED', extractErrorMessage(result));
    }

    return normalizePostAnalytics(postId, extractPayload(result));
  }

  async getAccountMetrics(
    socialAccountId: string,
    startDate?: string,
    endDate?: string
  ): Promise<OutstandAccountMetrics> {
    const args: Record<string, unknown> = {
      social_account_id: socialAccountId,
      ...(startDate ? { start_date: startDate } : {}),
      ...(endDate ? { end_date: endDate } : {}),
    };

    const result = await this.executeTool('get_account_metrics', args, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });

    if (result.isError) {
      throw new AgentEngineError('OUTSTAND_MCP_REQUEST_FAILED', extractErrorMessage(result));
    }

    return normalizeAccountMetrics(socialAccountId, extractPayload(result));
  }

  async resolveConnectedSocialAccount(
    input: ResolveConnectionInput
  ): Promise<OutstandSocialAccount> {
    if (input.socialAccountId) {
      const direct = await this.getSocialAccount(input.socialAccountId);
      if (direct) return direct;
    }

    const hasFinalizeInput = !!(input.pendingConnectionId || input.connectionId || input.code);

    if (hasFinalizeInput) {
      const finalizeArgs: Record<string, unknown> = {
        ...(input.pendingConnectionId ? { pending_connection_id: input.pendingConnectionId } : {}),
        ...(input.connectionId ? { connection_id: input.connectionId } : {}),
        ...(input.code ? { code: input.code } : {}),
        network: input.platform,
      };

      try {
        const finalizeResult = await this.executeFirstAvailable(
          [
            'finalize_pending_connection',
            'finalize_social_account_connection',
            'finalize_pending_social_connection',
          ],
          finalizeArgs,
          DEFAULT_TIMEOUT_MS
        );

        if (finalizeResult.isError) {
          throw new AgentEngineError(
            'OUTSTAND_MCP_REQUEST_FAILED',
            extractErrorMessage(finalizeResult)
          );
        }

        const finalizePayload = extractPayload(finalizeResult);
        const finalizeRecord = asRecord(finalizePayload) ?? {};

        const account =
          normalizeSocialAccount(finalizeRecord['social_account']) ??
          normalizeSocialAccount(finalizeRecord['account']) ??
          normalizeSocialAccount(finalizePayload);

        if (account) return account;

        const socialAccountId =
          getString(finalizeRecord['social_account_id']) ??
          getString(finalizeRecord['account_id']) ??
          null;

        if (socialAccountId) {
          const fetched = await this.getSocialAccount(socialAccountId);
          if (fetched) return fetched;
        }
      } catch (error) {
        logger.warn('[OutstandMCP] finalize connection fallback triggered', {
          platform: input.platform,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const accounts = await this.listSocialAccounts(input.platform);
    if (accounts.length === 1) {
      return accounts[0];
    }

    if (accounts.length > 1) {
      const sorted = [...accounts].sort((left, right) => {
        const leftDate = left.connectedAt ? Date.parse(left.connectedAt) : 0;
        const rightDate = right.connectedAt ? Date.parse(right.connectedAt) : 0;
        return rightDate - leftDate;
      });
      return sorted[0];
    }

    throw new AgentEngineError(
      'OUTSTAND_MCP_CONNECTION_NOT_FOUND',
      `No connected ${input.platform} account found after OAuth callback.`
    );
  }

  async publishPostForPlatforms(
    input: PublishPostToSocialsInput,
    accountIdsByPlatform: Record<OutstandSocialPlatform, string>
  ): Promise<OutstandCreatePostResult> {
    const socialAccountIds = input.platforms
      .map((platform) => accountIdsByPlatform[platform])
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (socialAccountIds.length === 0) {
      throw new AgentEngineError(
        'OUTSTAND_MCP_ACCOUNT_NOT_CONNECTED',
        'No connected social account IDs were resolved for requested platforms.'
      );
    }

    return this.createPost({
      content: input.content,
      socialAccountIds,
      mediaIds: input.mediaIds,
      scheduledAt: input.scheduledAt,
      firstComment: input.firstComment,
      threadContent: input.threadContent,
      platformOverrides: input.platformOverrides,
    });
  }
}
