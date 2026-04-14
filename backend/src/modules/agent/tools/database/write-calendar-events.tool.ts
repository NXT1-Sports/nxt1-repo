/**
 * @fileoverview Write Calendar Events Tool — Atomic writer for schedule/game events
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled schedule events (games, practices, camps, tryouts, etc.)
 * to the top-level `Events` collection.
 *
 * Each document: { userId, ownerType: 'user', eventType, title, date, ... }
 * Queried by the profile API: GET /api/v1/auth/profile/:userId/schedule
 *
 * Deduplicates by (userId + date + opponent + sport) so repeated scrapes
 * don't create duplicate game entries.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../services/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';
import { SyncDiffService, type PreviousScheduleEntry } from '../../sync/index.js';
import { onDailySyncComplete } from '../../triggers/trigger.listeners.js';
import { logger } from '../../../../utils/logger.js';
import { normalizeOpponentName } from './dedup-utils.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const EVENTS_COLLECTION = 'Events';
const MAX_EVENTS = 200;

const VALID_EVENT_TYPES = new Set([
  'game',
  'practice',
  'scrimmage',
  'camp',
  'tryout',
  'combine',
  'showcase',
  'tournament',
  'other',
]);

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteCalendarEventsTool extends BaseTool {
  readonly name = 'write_calendar_events';

  readonly description =
    'Writes schedule/game events to the Events collection.\n\n' +
    'Call this after reading the "schedule" section via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "maxpreps").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- profileUrl (optional): The athlete profile URL on the source platform.\n' +
    '- events (required): Array of event objects:\n' +
    '  • eventType (required): "game", "practice", "scrimmage", "camp", "tryout", "combine", "showcase", "tournament", or "other".\n' +
    '  • title (optional): Event title / summary.\n' +
    '  • description (optional): Additional details.\n' +
    '  • date (required): ISO date string (event start).\n' +
    '  • endDate (optional): ISO date string (event end).\n' +
    '  • location (optional): Venue / address.\n' +
    '  • opponent (optional): Opponent team name.\n' +
    '  • result (optional): Score result string (e.g. "W 3-1").\n' +
    '  • outcome (optional): "win", "loss", or "draw".';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      targetSport: { type: 'string' },
      source: { type: 'string' },
      sourceUrl: { type: 'string' },
      profileUrl: { type: 'string' },
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            eventType: {
              type: 'string',
              enum: [
                'game',
                'practice',
                'scrimmage',
                'camp',
                'tryout',
                'combine',
                'showcase',
                'tournament',
                'other',
              ],
            },
            title: { type: 'string' },
            description: { type: 'string' },
            date: { type: 'string' },
            endDate: { type: 'string' },
            location: { type: 'string' },
            opponent: { type: 'string' },
            result: { type: 'string' },
            outcome: { type: 'string', enum: ['win', 'loss', 'draw'] },
          },
          required: ['eventType', 'date'],
        },
      },
    },
    required: ['userId', 'targetSport', 'source', 'events'],
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
    if (!userId) return this.paramError('userId');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');
    const sourceUrl = this.str(input, 'sourceUrl') ?? this.str(input, 'profileUrl') ?? undefined;

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

    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:write_calendar_events',
      });
      const userData = accessGrant.targetUserData;
      const sportId = targetSport.trim().toLowerCase();
      if (
        !accessGrant.isSelfWrite &&
        !resolveAuthorizedTargetSportSelection(userData, sportId, accessGrant)
      ) {
        return { success: false, error: 'Not authorized to write calendar events for this sport.' };
      }
      const now = new Date().toISOString();

      context?.onProgress?.('Checking for duplicate schedule events…');

      // Fetch existing events for dedup
      const existingSnap = await this.db
        .collection(EVENTS_COLLECTION)
        .where('userId', '==', userId)
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
          eventType: typeof data['eventType'] === 'string' ? data['eventType'] : undefined,
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

        const eventType = this.str(e, 'eventType');
        if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
          skipped++;
          continue;
        }

        const date = this.str(e, 'date');
        if (!date) {
          skipped++;
          continue;
        }

        const record: Record<string, unknown> = {
          userId,
          ownerType: 'user',
          sport: sportId,
          eventType,
          date,
          source,
          verified: false,
          // Data lineage
          provider: source,
          extractedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        if (sourceUrl) record['sourceUrl'] = sourceUrl;

        // Optional fields
        const optionalFields = [
          'title',
          'description',
          'endDate',
          'location',
          'opponent',
          'result',
          'outcome',
        ];
        for (const field of optionalFields) {
          const val = this.str(e, field);
          if (val) record[field] = val;
        }

        // Build a display title if none provided
        if (!record['title']) {
          const opponent = this.str(e, 'opponent');
          record['title'] = opponent ? `vs ${opponent}` : `${eventType} — ${date}`;
        }

        // Dedup check
        const key = this.dedupeKey(record);
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key);

        const docRef = this.db.collection(EVENTS_COLLECTION).doc();
        record['id'] = docRef.id;
        batch.set(docRef, record);
        written++;
      }

      if (written > 0) {
        context?.onProgress?.(`Writing ${written} event(s) to database…`);
        await batch.commit();
      }

      // Cache invalidation
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          cache.del(`profile:sub:schedule:${userId}:${sportId}`),
          cache.del(`profile:sub:schedule:${userId}`),
          invalidateProfileCaches(
            userId,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
      } catch {
        // Best-effort
      }

      // ── Delta computation & fire trigger for Agent X ──────────────────
      if (written > 0) {
        try {
          const diffService = new SyncDiffService();
          // Build a minimal extracted profile with just the schedule section
          const extractedProfile = {
            platform: source,
            profileUrl: '',
            schedule: (events as Record<string, unknown>[])
              .filter((e) => e && typeof e === 'object' && (e as Record<string, unknown>)['date'])
              .map((e) => {
                const ev = e as Record<string, unknown>;
                return {
                  date: String(ev['date'] ?? ''),
                  opponent: typeof ev['opponent'] === 'string' ? ev['opponent'] : undefined,
                  location: typeof ev['location'] === 'string' ? ev['location'] : undefined,
                  result: typeof ev['result'] === 'string' ? ev['result'] : undefined,
                  score: typeof ev['result'] === 'string' ? ev['result'] : undefined,
                };
              }),
          };

          const delta = diffService.diff(
            userId,
            sportId,
            source,
            { schedule: previousSchedule },
            extractedProfile
          );

          if (!delta.isEmpty) {
            logger.info('[WriteCalendarEvents] Delta detected, firing sync trigger', {
              userId,
              sport: sportId,
              newScheduleEvents: delta.summary.newScheduleEvents,
            });
            onDailySyncComplete(delta).catch((err) => {
              logger.warn('[WriteCalendarEvents] Trigger dispatch failed', {
                userId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        } catch (err) {
          // Delta/trigger is non-critical — log and continue
          logger.warn('[WriteCalendarEvents] Delta computation failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        success: true,
        data: {
          userId,
          sportId,
          source,
          written,
          skipped,
          message: `Wrote ${written} event(s) for "${sportId}" from "${source}" (${skipped} skipped/duplicates).`,
        },
      };
    } catch (err) {
      logger.error('[WriteCalendarEvents] Failed to write calendar events', {
        userId,
        sport: targetSport,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write calendar events',
      };
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Dedup key: date (day portion) + opponent (aggressively normalized) + sport + eventType.
   * Uses {@link normalizeOpponentName} to handle variations like
   * "St. Mary's JV" vs "Saint Marys".
   */
  private dedupeKey(data: Record<string, unknown>): string {
    const date = String(data['date'] ?? '').split('T')[0] || 'nodate';
    const opponent = normalizeOpponentName(String(data['opponent'] ?? ''));
    const sport = String(data['sport'] ?? '')
      .toLowerCase()
      .trim();
    const eventType = String(data['eventType'] ?? '')
      .toLowerCase()
      .trim();
    return `${date}::${opponent}::${sport}::${eventType}`;
  }
}
