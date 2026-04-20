/**
 * @fileoverview Write Schedule Tool — Atomic writer for competitive schedule events
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes competitive schedule events (games, scrimmages, practices, playoffs)
 * to the top-level `Schedule` collection.
 *
 * Supports both athlete (ownerType: 'user') and team (ownerType: 'team') events
 * in a single collection, differentiated by `ownerId` + `ownerType`.
 *
 * Each document: { ownerId, ownerType, sport, scheduleType, date, opponent, result, ... }
 * Queried by the profile API: GET /api/v1/auth/profile/:userId/schedule
 * Queried by the team API: GET /api/v1/team/:teamId/schedule
 *
 * Deduplicates by (ownerId + date + sport + opponent) so repeated scrapes
 * don't create duplicate game entries.
 *
 * NOTE: Exposure events (camps, combines, showcases) belong in the `Events`
 * collection via write_calendar_events. This tool is for competitive schedule only.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../services/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile/shared.js';
import { SyncDiffService, type PreviousScheduleEntry } from '../../sync/index.js';
import { getAnalyticsLoggerService } from '../../../../services/analytics-logger.service.js';
import { onDailySyncComplete } from '../../triggers/trigger.listeners.js';
import { logger } from '../../../../utils/logger.js';
import { normalizeOpponentName } from './dedup-utils.js';
import { resolveCreatedAt } from './doc-date-utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const SCHEDULE_COLLECTION = 'Schedule';
const TEAMS_COLLECTION = 'Teams';
const MAX_EVENTS = 200;

const VALID_SCHEDULE_TYPES = new Set(['game', 'scrimmage', 'practice', 'playoff', 'other']);

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteScheduleTool extends BaseTool {
  readonly name = 'write_schedule';

  readonly description =
    'Writes competitive schedule events (games, scrimmages, practices, playoffs) to the Schedule collection.\n\n' +
    'Call this after reading the "schedule" section via read_distilled_section.\n\n' +
    'Use write_calendar_events for exposure events (camps, combines, showcases).\n\n' +
    'Parameters:\n' +
    '- userId (required for athletes): Firebase UID of the athlete.\n' +
    '- teamId (required for teams): Team document ID. Provide teamId instead of userId for team schedule pages.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "hudl", "maxpreps").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- events (required): Array of schedule event objects:\n' +
    '  • scheduleType (required): "game", "scrimmage", "practice", "playoff", or "other".\n' +
    '  • title (optional): Event title / summary.\n' +
    '  • date (required): ISO date string (event start).\n' +
    '  • endDate (optional): ISO date string (event end).\n' +
    '  • location (optional): Venue / address.\n' +
    '  • opponent (optional): Opponent team name.\n' +
    '  • isHome (optional): true if the team is playing at home.\n' +
    '  • result (optional): Score result string (e.g. "W 24-14").\n' +
    '  • outcome (optional): "win", "loss", or "draw".\n' +
    '  • status (optional): "upcoming", "final", "postponed", or "cancelled".';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      teamId: { type: 'string' },
      targetSport: { type: 'string' },
      source: { type: 'string' },
      sourceUrl: { type: 'string' },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            scheduleType: {
              type: 'string',
              enum: ['game', 'scrimmage', 'practice', 'playoff', 'other'],
            },
            title: { type: 'string' },
            date: { type: 'string' },
            endDate: { type: 'string' },
            location: { type: 'string' },
            opponent: { type: 'string' },
            isHome: { type: 'boolean' },
            result: { type: 'string' },
            outcome: { type: 'string', enum: ['win', 'loss', 'draw'] },
            status: {
              type: 'string',
              enum: ['upcoming', 'final', 'postponed', 'cancelled'],
            },
          },
          required: ['scheduleType', 'date'],
        },
      },
    },
    required: ['targetSport', 'source', 'events'],
  } as const;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
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
    const userId = this.str(input, 'userId');
    const teamId = this.str(input, 'teamId');

    if (!userId && !teamId) {
      return { success: false, error: 'Either userId or teamId is required.' };
    }

    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');
    const sourceUrl = this.str(input, 'sourceUrl') ?? undefined;

    const events = input['events'];
    if (!Array.isArray(events) || events.length === 0) {
      return { success: false, error: 'events must be a non-empty array.' };
    }
    if (events.length > MAX_EVENTS) {
      return { success: false, error: `events exceeds maximum of ${MAX_EVENTS}.` };
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const ownerType: 'user' | 'team' = teamId ? 'team' : 'user';
    const ownerId = (teamId ?? userId)!;
    const sportId = targetSport.trim().toLowerCase();
    const now = new Date().toISOString();

    try {
      // ── Auth: verify actor can write for this owner ────────────────────
      let targetUserData: Record<string, unknown> = {};

      if (ownerType === 'user') {
        // Athlete schedule — use existing profile access service
        const accessGrant = await createProfileWriteAccessService(
          this.db
        ).assertCanManageAthleteProfileTarget({
          actorUserId: context.userId,
          targetUserId: ownerId,
          action: 'tool:write_schedule',
        });
        targetUserData = accessGrant.targetUserData;

        if (
          !accessGrant.isSelfWrite &&
          !resolveAuthorizedTargetSportSelection(targetUserData, sportId, accessGrant)
        ) {
          return {
            success: false,
            error: 'Not authorized to write schedule events for this sport.',
          };
        }
      } else {
        // Team schedule — verify actor is team owner or admin
        const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(ownerId).get();
        if (!teamDoc.exists) {
          return { success: false, error: `Team ${ownerId} not found.` };
        }
        const teamData = teamDoc.data() ?? {};
        const teamOwnerId = typeof teamData['ownerId'] === 'string' ? teamData['ownerId'] : null;
        if (teamOwnerId !== context.userId) {
          return {
            success: false,
            error: 'Not authorized to write schedule events for this team.',
          };
        }
        targetUserData = teamData;
      }

      context?.onProgress?.('Checking for duplicate schedule events…');

      // ── Dedup: load existing docs for this owner + sport ──────────────
      const existingSnap = await this.db
        .collection(SCHEDULE_COLLECTION)
        .where('ownerId', '==', ownerId)
        .where('sport', '==', sportId)
        .get();

      const existingKeys = new Set<string>();
      const previousSchedule: PreviousScheduleEntry[] = [];
      for (const doc of existingSnap.docs) {
        const data = doc.data();
        existingKeys.add(this.dedupeKey(data));
        previousSchedule.push({
          date: String(data['date'] ?? ''),
          opponent: typeof data['opponent'] === 'string' ? data['opponent'] : undefined,
          sport: typeof data['sport'] === 'string' ? data['sport'] : undefined,
          eventType: typeof data['scheduleType'] === 'string' ? data['scheduleType'] : undefined,
        });
      }

      let written = 0;
      let skipped = 0;
      const batch = this.db.batch();

      for (const event of events) {
        if (!event || typeof event !== 'object') {
          skipped++;
          continue;
        }
        const e = event as Record<string, unknown>;

        const scheduleType = this.str(e, 'scheduleType');
        if (!scheduleType || !VALID_SCHEDULE_TYPES.has(scheduleType)) {
          skipped++;
          continue;
        }

        const date = this.str(e, 'date');
        if (!date) {
          skipped++;
          continue;
        }

        const record: Record<string, unknown> = {
          ownerId,
          ownerType,
          sport: sportId,
          scheduleType,
          date,
          source,
          verified: false,
          provider: source,
          extractedAt: now,
          createdAt: resolveCreatedAt(undefined, date, now),
          updatedAt: now,
        };

        // Keep userId field for backwards compat on athlete records
        if (ownerType === 'user') record['userId'] = ownerId;
        if (ownerType === 'team') record['teamId'] = ownerId;
        if (sourceUrl) record['sourceUrl'] = sourceUrl;

        // Optional fields
        const optionalStrFields = [
          'title',
          'location',
          'opponent',
          'result',
          'outcome',
          'status',
          'endDate',
        ];
        for (const field of optionalStrFields) {
          const val = this.str(e, field);
          if (val) record[field] = val;
        }

        // Boolean isHome
        if (typeof e['isHome'] === 'boolean') {
          record['isHome'] = e['isHome'];
        }

        // Build display title if none provided
        if (!record['title']) {
          const opponent = this.str(e, 'opponent');
          const typeLabel = scheduleType === 'playoff' ? 'Playoff Game' : scheduleType;
          record['title'] = opponent ? `vs ${opponent}` : `${typeLabel} — ${date}`;
        }

        // Dedup check
        const key = this.dedupeKey(record);
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key);

        const docRef = this.db.collection(SCHEDULE_COLLECTION).doc();
        record['id'] = docRef.id;
        batch.set(docRef, record);
        written++;
      }

      if (written > 0) {
        context?.onProgress?.(`Writing ${written} schedule event(s) to database…`);
        await batch.commit();
      }

      // ── Cache invalidation ─────────────────────────────────────────────
      try {
        const cache = getCacheService();
        const cacheOps: Promise<unknown>[] = [
          cache.del(`profile:sub:schedule:${ownerId}:${sportId}`),
          cache.del(`profile:sub:schedule:${ownerId}`),
        ];
        if (ownerType === 'user') {
          cacheOps.push(cache.del(USER_CACHE_KEYS.USER_BY_ID(ownerId)));
          cacheOps.push(
            invalidateProfileCaches(
              ownerId,
              typeof targetUserData['unicode'] === 'string' ? targetUserData['unicode'] : null
            )
          );
        } else {
          cacheOps.push(cache.del(`team:schedule:${ownerId}`));
          cacheOps.push(cache.del(`team:profile:${ownerId}`));
        }
        await Promise.all(cacheOps);
      } catch {
        // Best-effort
      }

      // ── Delta computation & Agent X trigger (athlete only) ─────────────
      if (written > 0 && ownerType === 'user') {
        try {
          const diffService = new SyncDiffService();
          const extractedProfile = {
            platform: source,
            profileUrl: '',
            schedule: (events as Record<string, unknown>[])
              .filter((e) => e && typeof e === 'object' && (e as Record<string, unknown>)['date'])
              .map((e) => {
                const ev = e as Record<string, unknown>;
                return {
                  date: String(ev['date'] ?? ''),
                  eventType:
                    typeof ev['scheduleType'] === 'string' ? ev['scheduleType'] : undefined,
                  opponent: typeof ev['opponent'] === 'string' ? ev['opponent'] : undefined,
                  location: typeof ev['location'] === 'string' ? ev['location'] : undefined,
                  result: typeof ev['result'] === 'string' ? ev['result'] : undefined,
                  score: typeof ev['result'] === 'string' ? ev['result'] : undefined,
                };
              }),
          };

          const delta = diffService.diff(
            ownerId,
            sportId,
            source,
            { schedule: previousSchedule },
            extractedProfile
          );

          if (!delta.isEmpty) {
            logger.info('[WriteSchedule] Delta detected, firing sync trigger', {
              ownerId,
              sport: sportId,
              newScheduleEvents: delta.summary.newScheduleEvents,
            });
            onDailySyncComplete(delta).catch((err) => {
              logger.warn('[WriteSchedule] Trigger dispatch failed', {
                ownerId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        } catch (err) {
          logger.warn('[WriteSchedule] Delta computation failed (non-critical)', {
            ownerId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (written > 0) {
        await getAnalyticsLoggerService().safeTrack({
          subjectId: ownerId,
          subjectType: ownerType === 'team' ? 'team' : 'user',
          domain: 'system',
          eventType: 'tool_write_completed',
          source: 'agent',
          actorUserId: context.userId,
          value: written,
          tags: ['schedule', sportId, source, ownerType],
          payload: {
            toolName: this.name,
            sportId,
            ownerType,
            eventsWritten: written,
            eventsSkipped: skipped,
          },
          metadata: { initiatedBy: 'write-schedule' },
        });
      }

      return {
        success: true,
        data: {
          ownerId,
          ownerType,
          sportId,
          source,
          written,
          skipped,
          message: `Wrote ${written} schedule event(s) for "${sportId}" from "${source}" (${skipped} skipped/duplicates).`,
        },
      };
    } catch (err) {
      logger.error('[WriteSchedule] Failed to write schedule events', {
        ownerId,
        ownerType,
        sport: targetSport,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write schedule events',
      };
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Dedup key: date (day portion) + normalized opponent + sport + scheduleType.
   */
  private dedupeKey(data: Record<string, unknown>): string {
    const date = String(data['date'] ?? '').split('T')[0] || 'nodate';
    const opponent = normalizeOpponentName(String(data['opponent'] ?? ''));
    const sport = String(data['sport'] ?? '')
      .toLowerCase()
      .trim();
    const scheduleType = String(data['scheduleType'] ?? '')
      .toLowerCase()
      .trim();
    return `${date}::${opponent}::${sport}::${scheduleType}`;
  }
}
