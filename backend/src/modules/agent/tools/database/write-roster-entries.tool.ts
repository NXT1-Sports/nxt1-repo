/**
 * @fileoverview Write Roster Entries Tool — Batch upsert of team roster memberships
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes to the `RosterEntries` collection using a deterministic doc ID of
 * `${teamId}_${playerId}` — making writes idempotent and dedup-safe.
 *
 * CRITICAL: Without valid RosterEntries for a team, `fetchTeamRecruiting()` in
 * timeline.service.ts returns an empty result because it fans out from playerIds
 * collected from this collection.
 *
 * Queried by: TeamTimeline (GET /api/v1/teams/:teamCode/timeline?filter=recruiting)
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const MAX_ENTRIES_PER_CALL = 50;

const VALID_STATUSES = new Set(['ghost', 'active', 'inactive', 'committed', 'transferred']);

// ─── Types ───────────────────────────────────────────────────────────────────

interface RosterEntryInput {
  playerId: string;
  status?: string;
  jerseyNumber?: string;
  position?: string;
  year?: string;
  sportId?: string;
  note?: string;
}

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteRosterEntriesTool extends BaseTool {
  readonly name = 'write_roster_entries';

  readonly description =
    'Batch-upserts player roster entries for a team in the RosterEntries collection.\n\n' +
    'Each entry uses a deterministic doc ID of `{teamId}_{playerId}` for idempotency.\n\n' +
    'IMPORTANT: RosterEntries are required for the team recruiting timeline to work.\n' +
    'Use status "ghost" for prospectsAgent X has identified but who have not formally committed.\n\n' +
    'Parameters:\n' +
    '- teamId (required): Team document ID.\n' +
    '- teamCode (required): Team code slug (used for cache invalidation).\n' +
    '- entries (required): Array of roster entries to upsert:\n' +
    '  • playerId (required): The user/prospect document ID.\n' +
    '  • status (optional): "ghost" | "active" | "inactive" | "committed" | "transferred". Defaults to "active".\n' +
    '  • jerseyNumber (optional): Jersey number string (e.g. "23").\n' +
    '  • position (optional): Position code (e.g. "PG", "QB").\n' +
    '  • year (optional): Academic year (e.g. "2026", "FR", "SO").\n' +
    '  • sportId (optional): Sport identifier.\n' +
    '  • note (optional): Internal scouting note (not shown to non-staff).';

  readonly parameters = {
    type: 'object',
    properties: {
      teamId: { type: 'string' },
      teamCode: { type: 'string' },
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            playerId: { type: 'string' },
            status: {
              type: 'string',
              enum: ['ghost', 'active', 'inactive', 'committed', 'transferred'],
            },
            jerseyNumber: { type: 'string' },
            position: { type: 'string' },
            year: { type: 'string' },
            sportId: { type: 'string' },
            note: { type: 'string' },
          },
          required: ['playerId'],
        },
      },
    },
    required: ['teamId', 'teamCode', 'entries'],
  } as const;

  override readonly allowedAgents = ['data_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const teamId = this.str(input, 'teamId');
    if (!teamId) return this.paramError('teamId');
    const teamCode = this.str(input, 'teamCode');
    if (!teamCode) return this.paramError('teamCode');

    const rawEntries = input['entries'];
    if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
      return { success: false, error: 'entries must be a non-empty array.' };
    }
    if (rawEntries.length > MAX_ENTRIES_PER_CALL) {
      return { success: false, error: `entries exceeds maximum of ${MAX_ENTRIES_PER_CALL}.` };
    }

    try {
      const now = new Date().toISOString();

      // Firestore batch limit is 500 writes; entries cap at 50 so a single batch is fine
      const batch = this.db.batch();
      let written = 0;
      let skipped = 0;

      for (const rawEntry of rawEntries) {
        if (!rawEntry || typeof rawEntry !== 'object') {
          skipped++;
          continue;
        }
        const e = rawEntry as Record<string, unknown>;
        const playerId = this.str(e, 'playerId');
        if (!playerId) {
          skipped++;
          continue;
        }

        const rawStatus = this.str(e, 'status');
        const status: string = rawStatus && VALID_STATUSES.has(rawStatus) ? rawStatus : 'active';

        const entry: RosterEntryInput = {
          playerId,
          status,
          jerseyNumber: this.str(e, 'jerseyNumber') ?? undefined,
          position: this.str(e, 'position') ?? undefined,
          year: this.str(e, 'year') ?? undefined,
          sportId: this.str(e, 'sportId') ?? undefined,
          note: this.str(e, 'note') ?? undefined,
        };

        // Deterministic doc ID: ensures upsert is idempotent
        const docId = `${teamId}_${playerId}`;
        const docRef = this.db.collection(ROSTER_ENTRIES_COLLECTION).doc(docId);

        const docData: Record<string, unknown> = {
          teamId,
          teamCode,
          playerId,
          status: entry.status,
          updatedAt: now,
        };

        if (entry.jerseyNumber !== undefined) docData['jerseyNumber'] = entry.jerseyNumber;
        if (entry.position !== undefined) docData['position'] = entry.position;
        if (entry.year !== undefined) docData['year'] = entry.year;
        if (entry.sportId !== undefined) docData['sportId'] = entry.sportId;
        if (entry.note !== undefined) docData['note'] = entry.note;

        // merge:true preserves existing fields (e.g. joinedAt, statsRef).
        // createdAt is intentionally excluded — with merge:true, any field listed
        // IS overwritten on every call. createdAt is set exactly once by the
        // Firestore onCreate trigger (functions/src/user/roster-entry.trigger.ts).
        // Only updatedAt (already in docData) is updated on every upsert.
        batch.set(docRef, docData, { merge: true });

        written++;
      }

      if (written === 0) {
        return { success: false, error: 'No valid entries after validation.' };
      }

      context?.onProgress?.(`Upserting ${written} roster entry entries…`);
      await batch.commit();

      // Invalidate recruiting timeline for this team
      const cache = getCacheService();
      await Promise.all([
        cache.delByPrefix(`team:timeline:v1:${teamCode}:`),
        cache.delByPrefix(`team:profile:code:${teamCode}:`),
      ]);

      logger.info('[WriteRosterEntriesTool] Entries written', {
        teamId,
        teamCode,
        written,
        skipped,
      });

      return {
        success: true,
        data: {
          written,
          skipped,
          message: `Upserted ${written} roster entr${written === 1 ? 'y' : 'ies'}${skipped > 0 ? `, skipped ${skipped}` : ''}.`,
        },
      };
    } catch (err) {
      logger.error('[WriteRosterEntriesTool] Failed', {
        teamId,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write roster entries.',
      };
    }
  }
}
