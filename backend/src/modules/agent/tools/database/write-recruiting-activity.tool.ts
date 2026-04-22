/**
 * @fileoverview Write Recruiting Activity Tool — Atomic writer for offers, visits, interest
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled recruiting activities (offers, visits, commitments, etc.)
 * to the top-level `Recruiting` collection.
 *
 * Each document: { userId, ownerType: 'user', category, collegeName, ... }
 * Queried by the profile API: GET /api/v1/auth/profile/:userId/recruiting
 *
 * Deduplicates by (userId + collegeName + category + sport) to prevent
 * re-importing the same offer on repeated scrapes.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getCacheService } from '../../../../services/core/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile/shared.js';
import { normalizeCollegeName } from './dedup-utils.js';
import { getAnalyticsLoggerService } from '../../../../services/core/analytics-logger.service.js';
import { logger } from '../../../../utils/logger.js';
import { SyncDiffService, type PreviousProfileState } from '../../sync/index.js';
import { onDailySyncComplete } from '../../triggers/trigger.listeners.js';
import { resolveCreatedAt } from './doc-date-utils.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const RECRUITING_COLLECTION = 'Recruiting';
const MAX_ACTIVITIES = 100;

const VALID_CATEGORIES = new Set(['offer', 'interest', 'visit', 'camp', 'commitment', 'contact']);

const RecruitingActivityEntrySchema = z
  .object({
    category: z.string().trim().min(1).optional(),
    collegeName: z.string().trim().min(1).optional(),
    collegeLogoUrl: z.string().trim().min(1).optional(),
    division: z.string().trim().min(1).optional(),
    conference: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional(),
    date: z.string().trim().min(1).optional(),
    scholarshipType: z.string().trim().min(1).optional(),
    coachName: z.string().trim().min(1).optional(),
    coachTitle: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .passthrough();

const WriteRecruitingActivityInputSchema = z.object({
  userId: z.string().trim().min(1),
  targetSport: z.string().trim().min(1),
  source: z.string().trim().min(1),
  sourceUrl: z.string().trim().min(1).optional(),
  profileUrl: z.string().trim().min(1).optional(),
  activities: z.array(RecruitingActivityEntrySchema).min(1).max(MAX_ACTIVITIES),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteRecruitingActivityTool extends BaseTool {
  readonly name = 'write_recruiting_activity';

  readonly description =
    'Writes recruiting activities (offers, visits, commitments, interest) to the Recruiting collection.\n\n' +
    'Call this after reading the "recruiting" section via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "247sports").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- profileUrl (optional): The athlete profile URL on the source platform.\n' +
    '- activities (required): Array of recruiting activity objects:\n' +
    '  • category (required): "offer", "interest", "visit", "camp", "commitment", or "contact".\n' +
    '  • collegeName (optional): College/university name.\n' +
    '  • collegeLogoUrl (optional): Logo URL.\n' +
    '  • division (optional): e.g. "D1", "D2", "NAIA".\n' +
    '  • conference (optional): Conference name.\n' +
    '  • city (optional): College city.\n' +
    '  • state (optional): College state.\n' +
    '  • date (optional): ISO date string.\n' +
    '  • scholarshipType (optional): e.g. "full", "partial", "walk-on".\n' +
    '  • coachName (optional): Recruiting coach name.\n' +
    '  • coachTitle (optional): Coach title.\n' +
    '  • notes (optional): Additional notes.';

  readonly parameters = WriteRecruitingActivityInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'recruiting_coordinator'] as const;
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
    const parsed = WriteRecruitingActivityInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, targetSport, source } = parsed.data;
    const sourceUrl = parsed.data.sourceUrl ?? parsed.data.profileUrl;
    const activities = parsed.data.activities;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageAthleteProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:write_recruiting_activity',
      });
      const userData = accessGrant.targetUserData;
      const sportId = targetSport.trim().toLowerCase();
      if (
        !accessGrant.isSelfWrite &&
        !resolveAuthorizedTargetSportSelection(userData, sportId, accessGrant)
      ) {
        return {
          success: false,
          error: 'Not authorized to write recruiting activity for this sport.',
        };
      }
      const now = new Date().toISOString();

      context?.emitStage?.('fetching_data', {
        icon: 'database',
        phase: 'check_duplicate_recruiting_entries',
      });

      // Fetch existing recruiting activities for dedup
      const existingSnap = await this.db
        .collection(RECRUITING_COLLECTION)
        .where('userId', '==', userId)
        .where('sport', '==', sportId)
        .get();

      // Snapshot previous recruiting state for delta detection
      const previousRecruiting: Record<string, unknown>[] = existingSnap.docs.map((d) => d.data());
      const previousState: PreviousProfileState = {
        recruiting: previousRecruiting,
      };

      const existingKeys = new Set<string>();
      for (const doc of existingSnap.docs) {
        const data = doc.data();
        existingKeys.add(this.dedupeKey(data));
      }

      let written = 0;
      let skipped = 0;
      const writtenRecords: Record<string, unknown>[] = [];

      const batch = this.db.batch();

      for (const activity of activities) {
        if (!activity || typeof activity !== 'object') {
          skipped++;
          continue;
        }
        const a = activity as Record<string, unknown>;

        const category = this.str(a, 'category');
        if (!category || !VALID_CATEGORIES.has(category)) {
          skipped++;
          continue;
        }

        const record: Record<string, unknown> = {
          userId,
          ownerType: 'user',
          sport: sportId,
          category,
          source,
          verified: false,
          // Data lineage
          provider: source,
          extractedAt: now,
          createdAt: resolveCreatedAt(undefined, this.str(a, 'date'), now),
          updatedAt: now,
        };
        if (sourceUrl) record['sourceUrl'] = sourceUrl;

        // Optional fields
        const optionalFields = [
          'collegeName',
          'collegeLogoUrl',
          'division',
          'conference',
          'city',
          'state',
          'date',
          'scholarshipType',
          'coachName',
          'coachTitle',
          'notes',
        ];
        for (const field of optionalFields) {
          const val = this.str(a, field);
          if (val) record[field] = val;
        }

        // Dedup check
        const key = this.dedupeKey(record);
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }
        existingKeys.add(key);

        const docRef = this.db.collection(RECRUITING_COLLECTION).doc();
        record['id'] = docRef.id;
        batch.set(docRef, record);
        writtenRecords.push(record);
        written++;
      }

      if (written > 0) {
        context?.emitStage?.('submitting_job', {
          icon: 'database',
          activityCount: written,
          phase: 'write_recruiting_activity',
        });
        await batch.commit();
        logger.info('[WriteRecruitingActivity] Recruiting activities written', {
          userId,
          sport: sportId,
          source,
          written,
          skipped,
        });
      } else {
        logger.info('[WriteRecruitingActivity] No new recruiting activities to write', {
          userId,
          sport: sportId,
          source,
          skipped,
        });
      }

      // Cache invalidation
      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
          cache.del(`profile:${userId}:recruiting:${sportId}`),
          cache.del(`profile:${userId}:recruiting:all`),
          invalidateProfileCaches(
            userId,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
      } catch {
        // Best-effort
      }

      if (writtenRecords.length > 0) {
        const analytics = getAnalyticsLoggerService();
        await Promise.allSettled(
          writtenRecords.map((record) => {
            const category = String(record['category'] ?? 'activity_recorded');
            const eventType =
              category === 'offer'
                ? 'offer_recorded'
                : category === 'visit'
                  ? 'visit_recorded'
                  : category === 'contact'
                    ? 'coach_contact_recorded'
                    : category === 'commitment'
                      ? 'commitment_recorded'
                      : 'activity_recorded';

            return analytics.safeTrack({
              subjectId: userId,
              subjectType: 'user',
              domain: 'recruiting',
              eventType,
              source: 'agent',
              actorUserId: context.userId,
              sessionId: context.sessionId ?? null,
              threadId: context.threadId ?? null,
              tags: [sportId, category, source].filter(Boolean),
              payload: {
                sportId,
                source,
                sourceUrl,
                collegeName: record['collegeName'],
                division: record['division'],
                conference: record['conference'],
                coachName: record['coachName'],
                coachTitle: record['coachTitle'],
                scholarshipType: record['scholarshipType'],
                date: record['date'],
                notes: record['notes'],
              },
              metadata: {
                toolName: this.name,
              },
            });
          })
        );
      }

      // ── Delta Detection & Trigger ─────────────────────────────────────
      if (written > 0) {
        try {
          const diffService = new SyncDiffService();
          const extractedProfile = {
            platform: source ?? '',
            profileUrl: sourceUrl ?? '',
            recruiting: writtenRecords.map((r) => ({
              category: String(r['category'] ?? '') as
                | 'offer'
                | 'interest'
                | 'visit'
                | 'camp'
                | 'commitment',
              collegeName: r['collegeName'] != null ? String(r['collegeName']) : undefined,
              collegeLogoUrl: r['collegeLogoUrl'] != null ? String(r['collegeLogoUrl']) : undefined,
              division: r['division'] != null ? String(r['division']) : undefined,
              conference: r['conference'] != null ? String(r['conference']) : undefined,
              city: r['city'] != null ? String(r['city']) : undefined,
              state: r['state'] != null ? String(r['state']) : undefined,
              date: r['date'] != null ? String(r['date']) : undefined,
              scholarshipType:
                r['scholarshipType'] != null ? String(r['scholarshipType']) : undefined,
              coachName: r['coachName'] != null ? String(r['coachName']) : undefined,
              coachTitle: r['coachTitle'] != null ? String(r['coachTitle']) : undefined,
              notes: r['notes'] != null ? String(r['notes']) : undefined,
            })),
          };
          const delta = diffService.diff(userId, sportId, source, previousState, extractedProfile);
          if (!delta.isEmpty) {
            onDailySyncComplete(delta).catch((err) =>
              logger.error('[WriteRecruitingActivity] Trigger failed', {
                userId,
                sport: sportId,
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        } catch (err) {
          logger.error('[WriteRecruitingActivity] Delta computation failed', {
            userId,
            sport: sportId,
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
          message: `Wrote ${written} recruiting activit(ies) for "${sportId}" from "${source}" (${skipped} skipped/duplicates).`,
        },
      };
    } catch (err) {
      logger.error('[WriteRecruitingActivity] Failed to write recruiting activities', {
        userId,
        sport: targetSport,
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write recruiting activities',
      };
    }
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Dedup key: category + collegeName (aggressively normalized) + sport + date.
   * Uses {@link normalizeCollegeName} to handle variations like
   * "The Ohio State University" vs "Ohio State".
   */
  private dedupeKey(data: Record<string, unknown>): string {
    const category = String(data['category'] ?? '')
      .toLowerCase()
      .trim();
    const college = normalizeCollegeName(String(data['collegeName'] ?? ''));
    const sport = String(data['sport'] ?? '')
      .toLowerCase()
      .trim();
    const date = String(data['date'] ?? 'undated').split('T')[0];
    return `${category}::${college}::${sport}::${date}`;
  }
}
