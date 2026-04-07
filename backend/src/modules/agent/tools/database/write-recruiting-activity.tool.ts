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
import { getCacheService } from '../../../../services/cache.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';
import { normalizeCollegeName } from './dedup-utils.js';
import { logger } from '../../../../utils/logger.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const RECRUITING_COLLECTION = 'Recruiting';
const USERS_COLLECTION = 'Users';
const MAX_ACTIVITIES = 100;

const VALID_CATEGORIES = new Set(['offer', 'interest', 'visit', 'camp', 'commitment', 'contact']);

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

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      targetSport: { type: 'string' },
      source: { type: 'string' },
      activities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: ['offer', 'interest', 'visit', 'camp', 'commitment', 'contact'],
            },
            collegeName: { type: 'string' },
            collegeLogoUrl: { type: 'string' },
            division: { type: 'string' },
            conference: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            date: { type: 'string' },
            scholarshipType: { type: 'string' },
            coachName: { type: 'string' },
            coachTitle: { type: 'string' },
            notes: { type: 'string' },
          },
          required: ['category'],
        },
      },
    },
    required: ['userId', 'targetSport', 'source', 'activities'],
  } as const;

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
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');

    const activities = input['activities'];
    if (!Array.isArray(activities) || activities.length === 0) {
      return { success: false, error: 'activities must be a non-empty array.' };
    }
    if (activities.length > MAX_ACTIVITIES) {
      return { success: false, error: `activities exceeds maximum of ${MAX_ACTIVITIES}.` };
    }

    // Validate user exists
    const userDoc = await this.db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) {
      return { success: false, error: `User "${userId}" not found.` };
    }
    const userData = userDoc.data() as Record<string, unknown>;

    try {
      const sportId = targetSport.trim().toLowerCase();
      const now = new Date().toISOString();

      context?.onProgress?.('Checking for duplicate recruiting entries…');

      // Fetch existing recruiting activities for dedup
      const existingSnap = await this.db
        .collection(RECRUITING_COLLECTION)
        .where('userId', '==', userId)
        .where('sport', '==', sportId)
        .get();

      const existingKeys = new Set<string>();
      for (const doc of existingSnap.docs) {
        const data = doc.data();
        existingKeys.add(this.dedupeKey(data));
      }

      let written = 0;
      let skipped = 0;

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
          createdAt: now,
          updatedAt: now,
        };

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
        written++;
      }

      if (written > 0) {
        context?.onProgress?.(
          `Writing ${written} recruiting activit${written === 1 ? 'y' : 'ies'}…`
        );
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
            typeof userData['username'] === 'string' ? userData['username'] : undefined,
            typeof userData['unicode'] === 'string' ? userData['unicode'] : null
          ),
        ]);
      } catch {
        // Best-effort
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
