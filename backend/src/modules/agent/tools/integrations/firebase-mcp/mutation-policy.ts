/**
 * @fileoverview Firebase MCP Mutation Policy
 * @module @nxt1/backend/modules/agent/tools/integrations/firebase-mcp
 *
 * Per-collection policy table that governs which operations the `firebase_mutate`
 * MCP tool may perform, how document ownership is verified, and which fields are
 * patchable via the LLM-facing schema.
 *
 * Posts (TimelinePosts, TeamPosts) are intentionally EXCLUDED — they are covered
 * by dedicated Tier 3 tools that have richer validation logic.
 */

import type { MutationOperation } from './shared.js';

export interface MutationPolicy {
  /** Firestore top-level collection name (exact, case-sensitive). */
  readonly collection: string;
  /** Allowed DML operations for this collection. */
  readonly allowedOperations: readonly MutationOperation[];
  /**
   * Dot-path from the document's data to the owner's userId.
   * Special value `"__team_owner"` means the ownershipPath is "ownerId" on
   * the parent Teams document whose id is stored in the doc's `teamId` field.
   * Special value `"__org_owner"` means the ownershipPath is "ownerId" on the
   * parent Organizations document referenced by the doc's `organizationId` field.
   * Special value `"__schedule_owner"` reads `ownerType` (`'user'`|`'team'`) and
   * `ownerId` from the document: for `'user'` it matches `ownerId === scope.userId`
   * directly; for `'team'` it fetches `Teams/{ownerId}.ownerId` and matches that.
   */
  readonly ownershipPath: string;
  /**
   * When true, deletes are soft (set `{ deleted: true, deletedAt: serverTimestamp() }`).
   * When false, the document is hard-deleted.
   */
  readonly softDelete: boolean;
  /**
   * Explicit allow-list of top-level field names that may be included in an
   * `update` patch.  If omitted, ALL fields except `userId`, `teamId`,
   * `organizationId`, `ownerId`, `createdAt`, and `id` are permitted.
   */
  readonly allowedPatchFields?: readonly string[];
}

const POLICIES: readonly MutationPolicy[] = [
  // ── Athlete-scoped collections ──────────────────────────────────────────────
  {
    collection: 'Awards',
    allowedOperations: ['update', 'delete'],
    ownershipPath: 'userId',
    softDelete: false,
    allowedPatchFields: ['title', 'year', 'level', 'description', 'sport', 'position', 'category'],
  },
  {
    collection: 'CombineMetrics',
    allowedOperations: ['update', 'delete'],
    ownershipPath: 'userId',
    softDelete: false,
    allowedPatchFields: [
      'event',
      'result',
      'unit',
      'date',
      'sport',
      'position',
      'combineType',
      'notes',
    ],
  },
  {
    collection: 'Intel',
    allowedOperations: ['delete'],
    ownershipPath: 'userId',
    softDelete: false,
  },
  {
    collection: 'Rankings',
    allowedOperations: ['update', 'delete'],
    ownershipPath: 'userId',
    softDelete: false,
    allowedPatchFields: [
      'service',
      'rank',
      'stars',
      'sport',
      'position',
      'classYear',
      'state',
      'national',
      'updatedDate',
    ],
  },
  {
    collection: 'Recruiting',
    allowedOperations: ['update', 'delete'],
    ownershipPath: 'userId',
    softDelete: false,
    allowedPatchFields: [
      'college',
      'status',
      'offerDate',
      'committedDate',
      'sport',
      'position',
      'notes',
    ],
  },
  {
    collection: 'PlayerStats',
    allowedOperations: ['update', 'delete'],
    ownershipPath: 'userId',
    softDelete: false,
    allowedPatchFields: [
      'season',
      'sport',
      'position',
      'stats',
      'games',
      'team',
      'conference',
      'year',
    ],
  },
  {
    collection: 'PlayerMetrics',
    allowedOperations: ['update', 'delete'],
    ownershipPath: 'userId',
    softDelete: false,
    allowedPatchFields: ['height', 'weight', 'wingspan', 'reach', 'hand', 'fortyTime', 'vertical'],
  },
  // ── Team-scoped collections ─────────────────────────────────────────────────
  {
    collection: 'Schedule',
    allowedOperations: ['update', 'delete'],
    ownershipPath: '__schedule_owner',
    softDelete: false,
    allowedPatchFields: [
      'opponent',
      'date',
      'time',
      'location',
      'isHome',
      'result',
      'score',
      'notes',
      'gameType',
    ],
  },
  {
    collection: 'Calendar',
    allowedOperations: ['update', 'delete'],
    ownershipPath: '__team_owner',
    softDelete: false,
    allowedPatchFields: [
      'title',
      'description',
      'startDate',
      'endDate',
      'location',
      'type',
      'recurring',
    ],
  },
  {
    collection: 'TeamNews',
    allowedOperations: ['update', 'delete'],
    ownershipPath: '__team_owner',
    softDelete: true,
    allowedPatchFields: ['headline', 'body', 'imageUrl', 'publishedAt', 'tags'],
  },
  {
    collection: 'TeamStats',
    allowedOperations: ['update', 'delete'],
    ownershipPath: '__team_owner',
    softDelete: false,
    allowedPatchFields: ['season', 'wins', 'losses', 'ties', 'stats', 'conference', 'division'],
  },
  {
    collection: 'Roster',
    allowedOperations: ['update', 'delete'],
    ownershipPath: '__team_owner',
    softDelete: false,
    allowedPatchFields: [
      'number',
      'position',
      'status',
      'year',
      'hometown',
      'height',
      'weight',
      'notes',
    ],
  },
  {
    collection: 'Events',
    allowedOperations: ['update', 'delete'],
    ownershipPath: '__team_owner',
    softDelete: false,
    allowedPatchFields: [
      'title',
      'description',
      'startDate',
      'endDate',
      'location',
      'type',
      'isPublic',
    ],
  },
] as const;

const POLICY_MAP = new Map<string, MutationPolicy>(
  POLICIES.map((policy) => [policy.collection, policy])
);

/**
 * Look up the mutation policy for a Firestore collection.
 * Returns `undefined` when the collection is not in the allow-list — the caller
 * MUST reject the operation when this returns `undefined`.
 */
export function getMutationPolicy(collection: string): MutationPolicy | undefined {
  return POLICY_MAP.get(collection);
}

/** All explicitly allowed collection names for use in error messages / schema enums. */
export const ALLOWED_MUTATION_COLLECTIONS = POLICIES.map((p) => p.collection);
