/**
 * @fileoverview Write Recruiting Activity Tool — Atomic writer for offers, visits, interest
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes distilled recruiting activities (offers, visits, commitments, etc.)
 * to the top-level `Recruiting` collection.
 *
 * Records can be team-linked, athlete-linked, or both. When the same event is
 * re-ingested with more complete linkage, the existing recruiting document is
 * enriched instead of duplicated.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
  type ProfileWriteAccessGrant,
  type AuthorizedTargetSportSelection,
} from '../../../../../services/profile/profile-write-access.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { normalizeCollegeName } from '../dedup-utils.js';
import { logger } from '../../../../../utils/logger.js';
import { resolveCreatedAt } from '../doc-date-utils.js';
import { CollegeModel } from '../../../../../models/core/college.model.js';
import { z } from 'zod';

const RECRUITING_COLLECTION = 'Recruiting';
const TEAMS_COLLECTION = 'Teams';
const ROSTER_ENTRIES_COLLECTION = 'RosterEntries';
const MAX_ACTIVITIES = 100;

const VALID_CATEGORIES = new Set(['offer', 'interest', 'visit', 'camp', 'commitment', 'contact']);

const COLLEGE_NAME_ALIASES: Readonly<Record<string, string>> = {
  ucf: 'University of Central Florida',
  usf: 'University of South Florida',
  fau: 'Florida Atlantic University',
  fiu: 'Florida International University',
  fsu: 'Florida State University',
  'ucf knights': 'University of Central Florida',
  'usf bulls': 'University of South Florida',
  'fau owls': 'Florida Atlantic University',
  uf: 'University of Florida',
  florida: 'University of Florida',
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getStorageBucket(): string | null {
  return (
    process.env['STAGING_FIREBASE_STORAGE_BUCKET'] ?? process.env['FIREBASE_STORAGE_BUCKET'] ?? null
  );
}

function buildCollegeLogoUrl(rawLogoValue: string, defaultBucket: string): string {
  const trimmed = rawLogoValue.trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('gs://')) {
    const withoutScheme = trimmed.slice('gs://'.length);
    const slashIndex = withoutScheme.indexOf('/');
    if (slashIndex <= 0) {
      return '';
    }

    const bucket = withoutScheme.slice(0, slashIndex).trim();
    const objectPath = withoutScheme.slice(slashIndex + 1).trim();
    if (!bucket || !objectPath) return '';

    return `https://storage.googleapis.com/${bucket}/${objectPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')}`;
  }

  const looksLikePath = trimmed.includes('/');
  const fileName = looksLikePath
    ? trimmed
    : trimmed.includes('.')
      ? `Colleges/${trimmed}`
      : `Colleges/${trimmed}.png`;

  return `https://storage.googleapis.com/${defaultBucket}/${fileName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}

function buildCollegeNameCandidates(name: string): readonly string[] {
  const normalized = normalizeCollegeName(name);
  if (!normalized) return [];

  const lower = normalized.toLowerCase();
  const alias = COLLEGE_NAME_ALIASES[lower];
  if (!alias) return [normalized];

  return [normalized, alias];
}

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
    endDate: z.string().trim().min(1).optional(),
    announcedAt: z.string().trim().min(1).optional(),
    scholarshipType: z.string().trim().min(1).optional(),
    visitType: z.string().trim().min(1).optional(),
    commitmentStatus: z.string().trim().min(1).optional(),
    coachName: z.string().trim().min(1).optional(),
    coachTitle: z.string().trim().min(1).optional(),
    notes: z.string().trim().min(1).optional(),
    graphicUrl: z.string().trim().min(1).optional(),
    rosterEntryId: z.string().trim().min(1).optional(),
    prospectDisplayName: z.string().trim().min(1).optional(),
    prospectFirstName: z.string().trim().min(1).optional(),
    prospectLastName: z.string().trim().min(1).optional(),
    classOf: z.union([z.string().trim().min(1), z.number().int()]).optional(),
  })
  .passthrough();

const WriteRecruitingActivityInputSchema = z
  .object({
    userId: z.string().trim().min(1).optional(),
    teamId: z.string().trim().min(1).optional(),
    organizationId: z.string().trim().min(1).optional(),
    teamCode: z.string().trim().min(1).optional(),
    targetSport: z.string().trim().min(1),
    source: z.string().trim().min(1),
    sourceUrl: z.string().trim().min(1).optional(),
    profileUrl: z.string().trim().min(1).optional(),
    activities: z.array(RecruitingActivityEntrySchema).min(1).max(MAX_ACTIVITIES),
  })
  .superRefine((value, ctx) => {
    if (!value.userId && !value.teamId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either userId or teamId is required.',
        path: ['userId'],
      });
    }
  });

type ExistingRecruitingRecord = {
  readonly ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  readonly data: Record<string, unknown>;
};

export class WriteRecruitingActivityTool extends BaseTool {
  readonly name = 'write_recruiting_activity';

  readonly description =
    'Writes recruiting activities (offers, visits, commitments, interest) to the Recruiting collection.\n\n' +
    'Call this after reading the "recruiting" section via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (optional): Firebase UID for athlete-linked records.\n' +
    '- teamId (optional): Team document ID for team-linked records.\n' +
    '- organizationId (optional): Organization ID for team-linked records.\n' +
    '- teamCode (optional): Team code used for cache invalidation.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- source (required): Platform slug (e.g. "247sports").\n' +
    '- sourceUrl (optional): The URL that was scraped to extract this data.\n' +
    '- profileUrl (optional): The source profile URL.\n' +
    '- activities (required): Array of recruiting activity objects. Each activity may include: category, collegeName, collegeLogoUrl, division, conference, city, state, date, endDate, announcedAt, scholarshipType, visitType, commitmentStatus, coachName, coachTitle, notes, graphicUrl, rosterEntryId, prospectDisplayName, prospectFirstName, prospectLastName, and classOf.';

  readonly parameters = WriteRecruitingActivityInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'recruiting_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'user_tools' as const;
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

    const { userId, teamId, targetSport, source } = parsed.data;
    const sourceUrl = parsed.data.sourceUrl ?? parsed.data.profileUrl;
    const activities = parsed.data.activities;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    try {
      const sportId = targetSport.trim().toLowerCase();
      let userData: Record<string, unknown> = {};
      let targetUnicode: string | null = null;
      let resolvedTeamId = teamId?.trim() || undefined;
      let resolvedOrganizationId = parsed.data.organizationId?.trim() || undefined;
      let resolvedTeamCode = parsed.data.teamCode?.trim() || undefined;
      let accessGrant: ProfileWriteAccessGrant | null = null;
      let authorizedSelection: AuthorizedTargetSportSelection | null = null;

      if (userId) {
        accessGrant = await createProfileWriteAccessService(
          this.db
        ).assertCanManageAthleteProfileTarget({
          actorUserId: context.userId,
          targetUserId: userId,
          action: 'tool:write_recruiting_activity',
        });

        userData = accessGrant.targetUserData;
        const selection = resolveAuthorizedTargetSportSelection(userData, sportId, accessGrant);
        authorizedSelection = selection;

        if (!accessGrant.isSelfWrite && !selection) {
          return {
            success: false,
            error: 'Not authorized to write recruiting activity for this sport.',
          };
        }

        if (!resolvedTeamId && selection?.teamId) {
          resolvedTeamId = selection.teamId;
        }
        if (!resolvedOrganizationId && selection?.organizationId) {
          resolvedOrganizationId = selection.organizationId;
        }

        if (
          accessGrant.isSelfWrite &&
          resolvedTeamId &&
          selection?.teamId &&
          resolvedTeamId !== selection.teamId
        ) {
          return {
            success: false,
            error: 'Not authorized to write recruiting activity for this team.',
          };
        }

        if (
          accessGrant.isSelfWrite &&
          resolvedOrganizationId &&
          selection?.organizationId &&
          resolvedOrganizationId !== selection.organizationId
        ) {
          return {
            success: false,
            error: 'Not authorized to write recruiting activity for this team.',
          };
        }
        targetUnicode = typeof userData['unicode'] === 'string' ? userData['unicode'] : null;
      }

      if (resolvedTeamId) {
        const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(resolvedTeamId).get();
        if (!teamDoc.exists) {
          return { success: false, error: `Team ${resolvedTeamId} not found.` };
        }

        const teamData = (teamDoc.data() ?? {}) as Record<string, unknown>;
        const isAuthorizedSelfWriteTeam =
          accessGrant?.isSelfWrite === true &&
          authorizedSelection?.teamId === resolvedTeamId &&
          (!authorizedSelection.organizationId ||
            !resolvedOrganizationId ||
            authorizedSelection.organizationId === resolvedOrganizationId);

        if (!isAuthorizedSelfWriteTeam) {
          const canManageTeam = await canManageTeamMutationForUser(
            this.db,
            context.userId,
            resolvedTeamId,
            teamData
          );
          if (!canManageTeam) {
            return {
              success: false,
              error: 'Not authorized to write recruiting activity for this team.',
            };
          }
        }

        if (!resolvedOrganizationId) {
          resolvedOrganizationId =
            typeof teamData['organizationId'] === 'string' ? teamData['organizationId'] : undefined;
        }
        if (!resolvedTeamCode) {
          resolvedTeamCode =
            typeof teamData['teamCode'] === 'string' ? teamData['teamCode'] : undefined;
        }
      }

      if (
        accessGrant?.isSelfWrite &&
        authorizedSelection?.organizationId &&
        !resolvedOrganizationId
      ) {
        resolvedOrganizationId = authorizedSelection.organizationId;
      }

      if (accessGrant?.isSelfWrite && authorizedSelection?.teamId && !resolvedTeamId) {
        resolvedTeamId = authorizedSelection.teamId;
      }

      const now = new Date().toISOString();
      const logoBucket = getStorageBucket();
      const logoCache = new Map<string, string | null>();

      const resolveCollegeLogoUrl = async (collegeName: string): Promise<string | null> => {
        const normalizedName = normalizeCollegeName(collegeName);
        if (!normalizedName || !logoBucket) return null;

        if (logoCache.has(normalizedName)) {
          return logoCache.get(normalizedName) ?? null;
        }

        try {
          const candidates = buildCollegeNameCandidates(normalizedName);

          for (const candidate of candidates) {
            const textFilter: Record<string, unknown> =
              candidate.length >= 3
                ? { $text: { $search: candidate } }
                : { name: { $regex: `^${escapeRegex(candidate)}$`, $options: 'i' } };

            const containsFilter: Record<string, unknown> = {
              name: { $regex: escapeRegex(candidate), $options: 'i' },
            };

            const college =
              (await CollegeModel.findOne(textFilter, { logoUrl: 1 })
                .lean<{ logoUrl?: unknown }>()
                .exec()) ??
              (await CollegeModel.findOne(containsFilter, { logoUrl: 1 })
                .lean<{ logoUrl?: unknown }>()
                .exec());

            const logoValue = typeof college?.logoUrl === 'string' ? college.logoUrl.trim() : '';
            if (!logoValue) continue;

            const resolvedUrl = buildCollegeLogoUrl(logoValue, logoBucket);
            if (!resolvedUrl) continue;

            logoCache.set(normalizedName, resolvedUrl);
            return resolvedUrl;
          }

          logoCache.set(normalizedName, null);
          return null;
        } catch {
          logoCache.set(normalizedName, null);
          return null;
        }
      };

      const parseOptionalClassOf = (value: unknown): number | undefined => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return Math.trunc(value);
        }
        if (typeof value !== 'string') {
          return undefined;
        }
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parsedClass = Number.parseInt(trimmed, 10);
        return Number.isFinite(parsedClass) ? parsedClass : undefined;
      };

      const buildPatch = (
        existing: Record<string, unknown>,
        incoming: Record<string, unknown>
      ): Record<string, unknown> => {
        const patch: Record<string, unknown> = {};

        const fillIfMissing = (field: string): void => {
          const existingValue = existing[field];
          const incomingValue = incoming[field];
          const hasExisting =
            existingValue !== undefined &&
            existingValue !== null &&
            (!(typeof existingValue === 'string') || existingValue.trim().length > 0);
          const hasIncoming =
            incomingValue !== undefined &&
            incomingValue !== null &&
            (!(typeof incomingValue === 'string') || incomingValue.trim().length > 0);

          if (!hasExisting && hasIncoming) {
            patch[field] = incomingValue;
          }
        };

        [
          'userId',
          'teamId',
          'organizationId',
          'rosterEntryId',
          'prospectDisplayName',
          'prospectFirstName',
          'prospectLastName',
          'classOf',
          'collegeLogoUrl',
          'division',
          'conference',
          'city',
          'state',
          'endDate',
          'announcedAt',
          'scholarshipType',
          'visitType',
          'commitmentStatus',
          'coachName',
          'coachTitle',
          'notes',
          'graphicUrl',
          'sourceUrl',
        ].forEach(fillIfMissing);

        if (Object.keys(patch).length > 0) {
          patch['updatedAt'] = now;
        }

        return patch;
      };

      context?.emitStage?.('fetching_data', {
        icon: 'database',
        phase: 'check_duplicate_recruiting_entries',
      });

      const existingQueries: Array<
        Promise<FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>>
      > = [];
      if (userId) {
        existingQueries.push(
          this.db
            .collection(RECRUITING_COLLECTION)
            .where('userId', '==', userId)
            .where('sport', '==', sportId)
            .get()
        );
      }
      if (resolvedTeamId) {
        existingQueries.push(
          this.db
            .collection(RECRUITING_COLLECTION)
            .where('teamId', '==', resolvedTeamId)
            .where('sport', '==', sportId)
            .get()
        );
      }

      const existingSnaps = await Promise.all(existingQueries);
      const existingByKey = new Map<string, ExistingRecruitingRecord>();
      for (const existingSnap of existingSnaps) {
        for (const doc of existingSnap.docs) {
          const data = doc.data() as Record<string, unknown>;
          const key = this.dedupeKey(data);
          if (!existingByKey.has(key)) {
            existingByKey.set(key, { ref: doc.ref, data });
          }
        }
      }

      let written = 0;
      let updated = 0;
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

        const rosterEntryId = this.str(a, 'rosterEntryId');
        if (rosterEntryId && resolvedTeamId) {
          const rosterEntrySnap = await this.db
            .collection(ROSTER_ENTRIES_COLLECTION)
            .doc(rosterEntryId)
            .get();
          if (!rosterEntrySnap.exists) {
            skipped++;
            continue;
          }
          const rosterEntryData = rosterEntrySnap.data() ?? {};
          if (rosterEntryData['teamId'] !== resolvedTeamId) {
            skipped++;
            continue;
          }
        }

        const record: Record<string, unknown> = {
          ownerType: teamId ? 'team' : 'user',
          sport: sportId,
          category,
          source,
          verified: false,
          provider: source,
          extractedAt: now,
          createdAt: resolveCreatedAt(undefined, this.str(a, 'date'), now),
          updatedAt: now,
        };
        if (userId) record['userId'] = userId;
        if (resolvedTeamId) record['teamId'] = resolvedTeamId;
        if (resolvedOrganizationId) record['organizationId'] = resolvedOrganizationId;
        if (sourceUrl) record['sourceUrl'] = sourceUrl;

        const optionalFields = [
          'collegeName',
          'collegeLogoUrl',
          'division',
          'conference',
          'city',
          'state',
          'date',
          'endDate',
          'announcedAt',
          'scholarshipType',
          'visitType',
          'commitmentStatus',
          'coachName',
          'coachTitle',
          'notes',
          'graphicUrl',
          'rosterEntryId',
          'prospectDisplayName',
          'prospectFirstName',
          'prospectLastName',
        ] as const;
        for (const field of optionalFields) {
          const val = this.str(a, field);
          if (val) record[field] = val;
        }

        const classOf = parseOptionalClassOf(a['classOf']);
        if (classOf !== undefined) {
          record['classOf'] = classOf;
        }

        if (!record['collegeLogoUrl']) {
          const collegeName = this.str(a, 'collegeName');
          if (collegeName) {
            const resolvedLogoUrl = await resolveCollegeLogoUrl(collegeName);
            if (resolvedLogoUrl) {
              record['collegeLogoUrl'] = resolvedLogoUrl;
            }
          }
        }

        const key = this.dedupeKey(record);
        const existing = existingByKey.get(key);
        if (existing) {
          const patch = buildPatch(existing.data, record);
          if (Object.keys(patch).length > 0) {
            batch.update(existing.ref, patch);
            existingByKey.set(key, { ref: existing.ref, data: { ...existing.data, ...patch } });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        const docRef = this.db.collection(RECRUITING_COLLECTION).doc();
        record['id'] = docRef.id;
        batch.set(docRef, record);
        existingByKey.set(key, { ref: docRef, data: record });
        written++;
      }

      if (written > 0 || updated > 0) {
        context?.emitStage?.('submitting_job', {
          icon: 'database',
          activityCount: written + updated,
          phase: 'write_recruiting_activity',
        });
        await batch.commit();
        logger.info('[WriteRecruitingActivity] Recruiting activities written', {
          userId: userId ?? null,
          teamId: resolvedTeamId ?? null,
          sport: sportId,
          source,
          written,
          updated,
          skipped,
        });
      } else {
        logger.info('[WriteRecruitingActivity] No new recruiting activities to write', {
          userId: userId ?? null,
          teamId: resolvedTeamId ?? null,
          sport: sportId,
          source,
          skipped,
        });
      }

      try {
        const cache = getCacheService();
        await Promise.all([
          ...(userId
            ? [
                cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
                cache.del(`profile:${userId}:recruiting:${sportId}`),
                cache.del(`profile:${userId}:recruiting:all`),
                invalidateProfileCaches(userId, targetUnicode),
              ]
            : []),
          ...(resolvedTeamCode
            ? [
                cache.delByPrefix(`team:timeline:v1:${resolvedTeamCode}:`),
                cache.delByPrefix(`team:profile:code:${resolvedTeamCode}:`),
              ]
            : []),
        ]);
      } catch {
        // Best-effort
      }

      return {
        success: true,
        data: {
          userId: userId ?? null,
          teamId: resolvedTeamId ?? null,
          sportId,
          source,
          written,
          updated,
          skipped,
          message: `Processed ${written + updated} recruiting activit(ies) for "${sportId}" from "${source}" (${written} created, ${updated} linked/updated, ${skipped} skipped).`,
        },
      };
    } catch (err) {
      logger.error('[WriteRecruitingActivity] Failed to write recruiting activities', {
        userId: userId ?? null,
        teamId: teamId ?? null,
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

  private dedupeKey(data: Record<string, unknown>): string {
    const category = String(data['category'] ?? '')
      .toLowerCase()
      .trim();
    const college = normalizeCollegeName(String(data['collegeName'] ?? ''));
    const sport = String(data['sport'] ?? '')
      .toLowerCase()
      .trim();
    const date = String(data['date'] ?? 'undated').split('T')[0];
    const rosterEntryId = String(data['rosterEntryId'] ?? '').trim();
    const linkedUserId = String(data['userId'] ?? '').trim();
    const displayName = String(data['prospectDisplayName'] ?? '')
      .trim()
      .toLowerCase();
    const firstName = String(data['prospectFirstName'] ?? '')
      .trim()
      .toLowerCase();
    const lastName = String(data['prospectLastName'] ?? '')
      .trim()
      .toLowerCase();
    const classOf = String(data['classOf'] ?? '').trim();
    const linkedTeamId = String(data['teamId'] ?? '').trim();

    const nameKey = [firstName, lastName, classOf].filter(Boolean).join('::');
    const prospectKey =
      rosterEntryId || displayName || nameKey || linkedUserId || linkedTeamId || 'unknown-prospect';

    return `${category}::${college}::${sport}::${date}::${prospectKey}`;
  }
}
