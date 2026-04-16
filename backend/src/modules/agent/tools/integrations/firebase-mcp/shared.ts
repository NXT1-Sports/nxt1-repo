import { createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { z } from 'zod';

export const FIREBASE_VIEW_NAMES = [
  'user_profile_snapshot',
  'user_timeline_feed',
  'user_schedule_events',
  'user_recruiting_status',
  'user_season_stats',
  'user_physical_metrics',
  'user_team_membership',
  'user_highlight_videos',
  'team_profile_snapshot',
  'team_roster_members',
  'team_timeline_feed',
  'team_highlight_videos',
  'organization_profile_snapshot',
  'organization_roster_members',
  'organization_highlight_videos',
] as const;

export const FirebaseViewNameSchema = z.enum(FIREBASE_VIEW_NAMES);

export type FirebaseViewName = z.infer<typeof FirebaseViewNameSchema>;

export const MAX_FIREBASE_VIEW_LIMIT = 50;
export const DEFAULT_FIREBASE_VIEW_LIMIT = 10;

const FilterValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);

export type FirebaseFilterValue = z.infer<typeof FilterValueSchema>;

export const FirebaseFiltersSchema = z.record(z.string(), FilterValueSchema);

export type FirebaseFilters = z.infer<typeof FirebaseFiltersSchema>;

export const FirebaseMcpScopeSchema = z.object({
  userId: z.string().min(1),
  teamIds: z.array(z.string().min(1)).default([]),
  organizationIds: z.array(z.string().min(1)).default([]),
  defaultTeamId: z.string().min(1).optional(),
  defaultOrganizationId: z.string().min(1).optional(),
  threadId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
});

export type FirebaseMcpScope = z.infer<typeof FirebaseMcpScopeSchema>;

export const FirebaseMcpSignedScopeEnvelopeSchema = z.object({
  scope: FirebaseMcpScopeSchema,
  signature: z.string().min(1),
});

export type FirebaseMcpSignedScopeEnvelope = z.infer<typeof FirebaseMcpSignedScopeEnvelopeSchema>;

export const FirebaseMcpQueryInputSchema = z.object({
  view: FirebaseViewNameSchema,
  filters: FirebaseFiltersSchema.optional(),
  limit: z.number().int().min(1).max(MAX_FIREBASE_VIEW_LIMIT).optional(),
  cursor: z.string().min(1).optional(),
});

export type FirebaseMcpQueryInput = z.infer<typeof FirebaseMcpQueryInputSchema>;

export const FirebaseMcpQueryToolArgsSchema = FirebaseMcpQueryInputSchema.extend({
  scopeEnvelope: FirebaseMcpSignedScopeEnvelopeSchema,
});

export const FirebaseMcpListViewsToolArgsSchema = z
  .object({
    scopeEnvelope: FirebaseMcpSignedScopeEnvelopeSchema.optional(),
  })
  .optional();

export const FirebaseMcpViewMetadataSchema = z.object({
  name: FirebaseViewNameSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  filterHelp: z.array(z.string()),
  defaultLimit: z.number().int().positive(),
  maxLimit: z.number().int().positive(),
});

export type FirebaseMcpViewMetadata = z.infer<typeof FirebaseMcpViewMetadataSchema>;

export const FirebaseMcpAvailableScopesSchema = z.object({
  userId: z.string().min(1),
  teamIds: z.array(z.string().min(1)),
  organizationIds: z.array(z.string().min(1)),
  defaultTeamId: z.string().min(1).optional(),
  defaultOrganizationId: z.string().min(1).optional(),
});

export type FirebaseMcpAvailableScopes = z.infer<typeof FirebaseMcpAvailableScopesSchema>;

export const FirebaseMcpListViewsResultSchema = z.object({
  views: z.array(FirebaseMcpViewMetadataSchema),
  availableScopes: FirebaseMcpAvailableScopesSchema,
});

export type FirebaseMcpListViewsResult = z.infer<typeof FirebaseMcpListViewsResultSchema>;

export const FirebaseMcpQueryResultSchema = z.object({
  view: FirebaseViewNameSchema,
  count: z.number().int().nonnegative(),
  items: z.array(z.record(z.string(), z.unknown())),
  nextCursor: z.string().min(1).optional(),
  appliedFilters: FirebaseFiltersSchema.optional(),
});

export type FirebaseMcpQueryResult = z.infer<typeof FirebaseMcpQueryResultSchema>;

interface CursorPayload {
  readonly sortValue: string;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function normalizeScope(scope: FirebaseMcpScope): FirebaseMcpScope {
  const parsed = FirebaseMcpScopeSchema.parse(scope);
  const teamIds = uniqueSorted(parsed.teamIds);
  const organizationIds = uniqueSorted(parsed.organizationIds);

  const defaultTeamId =
    parsed.defaultTeamId && teamIds.includes(parsed.defaultTeamId)
      ? parsed.defaultTeamId
      : teamIds.length === 1
        ? teamIds[0]
        : undefined;

  const defaultOrganizationId =
    parsed.defaultOrganizationId && organizationIds.includes(parsed.defaultOrganizationId)
      ? parsed.defaultOrganizationId
      : organizationIds.length === 1
        ? organizationIds[0]
        : undefined;

  return {
    userId: parsed.userId,
    teamIds,
    organizationIds,
    ...(defaultTeamId ? { defaultTeamId } : {}),
    ...(defaultOrganizationId ? { defaultOrganizationId } : {}),
    ...(parsed.threadId ? { threadId: parsed.threadId } : {}),
    ...(parsed.sessionId ? { sessionId: parsed.sessionId } : {}),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function buildScopeSignature(scope: FirebaseMcpScope, secret: string): string {
  return createHmac('sha256', secret).update(stableStringify(scope)).digest('base64url');
}

export function createSignedScopeEnvelope(
  scope: FirebaseMcpScope,
  secret: string
): FirebaseMcpSignedScopeEnvelope {
  const normalized = normalizeScope(scope);
  return {
    scope: normalized,
    signature: buildScopeSignature(normalized, secret),
  };
}

export function verifySignedScopeEnvelope(
  envelope: FirebaseMcpSignedScopeEnvelope,
  secret: string
): FirebaseMcpScope {
  const parsed = FirebaseMcpSignedScopeEnvelopeSchema.parse(envelope);
  const normalized = normalizeScope(parsed.scope);
  const expectedSignature = buildScopeSignature(normalized, secret);

  if (parsed.signature !== expectedSignature) {
    throw new Error('Invalid Firebase MCP scope signature');
  }

  return normalized;
}

export function normalizeViewLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_FIREBASE_VIEW_LIMIT;
  }

  return Math.min(
    Math.max(Math.trunc(limit ?? DEFAULT_FIREBASE_VIEW_LIMIT), 1),
    MAX_FIREBASE_VIEW_LIMIT
  );
}

export function encodeCursor(sortValue: string): string {
  const payload: CursorPayload = { sortValue };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor?: string): string | null {
  if (!cursor) return null;

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as CursorPayload;
    return typeof parsed.sortValue === 'string' && parsed.sortValue.trim().length > 0
      ? parsed.sortValue
      : null;
  } catch {
    throw new Error('Invalid Firebase MCP cursor');
  }
}
