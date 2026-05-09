/**
 * @fileoverview Write Core Identity Tool — Atomic profile writer for identity data
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Focused database tool that writes distilled identity data to the User doc.
 * Designed to receive data from `read_distilled_section` after a distiller has
 * pre-processed the raw platform JSON.
 *
 * Handles: identity (name, bio, height, weight, classOf, location), academics,
 * sportInfo (positions, jersey, side), team, coach, awards, teamHistory.
 *
 * All data is merged — never overwrites existing data that wasn't provided.
 */

import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { isTeamRole, normalizeBaseSportKey, type UserRole } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import { ScraperMediaService } from '../../integrations/social/scraper-media.service.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../../services/profile/profile-write-access.service.js';

import { createOrganizationService } from '../../../../../services/team/organization.service.js';
import { enqueueWelcomeGraphicIfReady } from '../../../services/agent-welcome.service.js';
import { invalidateTeamCache } from '../../../../../services/team/team-code.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../../services/profile/users.service.js';
import { ContextBuilder } from '../../../memory/context-builder.js';
import { invalidateProfileCaches } from '../../../../../routes/profile/shared.js';
import { provisionOnboardingPrograms } from '../../../../../services/platform/onboarding-program-provisioning.service.js';
import { platformDisplayName } from '../../platform/platform-utils.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

// ─── Constants ──────────────────────────────────────────────────────────────

const USERS_COLLECTION = 'Users';

const VALIDATION = {
  MIN_GRADUATION_YEAR: new Date().getFullYear() - 2,
  MAX_GRADUATION_YEAR: new Date().getFullYear() + 8,
  MAX_ABOUT_ME_LENGTH: 2000,
  MAX_NAME_LENGTH: 100,
  MAX_POSITIONS: 5,
  MAX_AWARDS: 50,
  MAX_TEAM_HISTORY: 30,
} as const;

const StringOrNumberSchema = z.union([z.string().trim().min(1), z.number()]);

const IdentitySectionSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    displayName: z.string().trim().min(1).optional(),
    aboutMe: z.string().trim().min(1).optional(),
    height: z.string().trim().min(1).optional(),
    weight: z.string().trim().min(1).optional(),
    classOf: z.union([z.number(), z.string().trim().min(1)]).optional(),
    city: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
    profileImage: z.string().trim().min(1).optional(),
  })
  .passthrough();

const AcademicsSectionSchema = z
  .object({
    gpa: StringOrNumberSchema.optional(),
    weightedGpa: StringOrNumberSchema.optional(),
    satScore: StringOrNumberSchema.optional(),
    actScore: StringOrNumberSchema.optional(),
    classRank: StringOrNumberSchema.optional(),
    classSize: StringOrNumberSchema.optional(),
    intendedMajor: z.string().trim().min(1).optional(),
  })
  .passthrough();

const SportInfoSectionSchema = z
  .object({
    positions: z.array(z.string().trim().min(1)).optional(),
    jerseyNumber: StringOrNumberSchema.optional(),
    side: z.string().trim().min(1).optional(),
  })
  .passthrough();

const TeamSectionSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    type: z.string().trim().min(1).optional(),
    mascot: z.string().trim().min(1).optional(),
    conference: z.string().trim().min(1).optional(),
    division: z.string().trim().min(1).optional(),
    teamId: z.string().trim().min(1).optional(),
    organizationId: z.string().trim().min(1).optional(),
    logoUrl: z.string().trim().min(1).optional(),
    primaryColor: z.string().trim().min(1).optional(),
    secondaryColor: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
    galleryImages: z.array(z.string().trim().min(1)).optional(),
  })
  .passthrough();

const CoachSectionSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    email: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
  })
  .passthrough();

const TeamHistoryEntrySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    type: z.string().trim().min(1).optional(),
    sport: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    record: z.string().trim().min(1).optional(),
    startDate: z.string().trim().min(1).optional(),
    endDate: z.string().trim().min(1).optional(),
    isCurrent: z.boolean().optional(),
  })
  .passthrough();

const WriteCoreIdentityInputSchema = z.object({
  userId: z.string().trim().min(1),
  source: z.string().trim().min(1),
  profileUrl: z.string().trim().min(1),
  faviconUrl: z.string().trim().min(1).optional(),
  targetSport: z.string().trim().min(1),
  identity: IdentitySectionSchema.optional(),
  academics: AcademicsSectionSchema.optional(),
  sportInfo: SportInfoSectionSchema.optional(),
  team: TeamSectionSchema.optional(),
  coach: CoachSectionSchema.optional(),
  teamHistory: z.array(TeamHistoryEntrySchema).max(VALIDATION.MAX_TEAM_HISTORY).optional(),
  profileImgs: z.array(z.string().trim().min(1)).optional(),
  teamId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
});

// ─── Tool ───────────────────────────────────────────────────────────────────

export class WriteCoreIdentityTool extends BaseTool {
  readonly name = 'write_core_identity';

  readonly description =
    "Writes distilled identity data to the athlete's Firestore profile. " +
    'Call this after reading identity, academics, sportInfo, team, coach, and awards ' +
    'sections via read_distilled_section.\n\n' +
    'Parameters:\n' +
    '- userId (required): Firebase UID.\n' +
    '- source (required): Platform slug (e.g. "maxpreps", "hudl").\n' +
    '- profileUrl (required): The URL that was scraped.\n' +
    '- faviconUrl (optional): Favicon URL for the platform icon.\n' +
    '- targetSport (required): Sport key (e.g. "football").\n' +
    '- identity (optional): { firstName, lastName, displayName, aboutMe, height, weight, classOf, city, state, country }.\n' +
    '- academics (optional): { gpa, weightedGpa, satScore, actScore, classRank, classSize, intendedMajor }.\n' +
    '- sportInfo (optional): { positions, jerseyNumber, side }. Position values from scraped data are not written; use update_core_identity for manual position corrections.\n' +
    '- team (optional): { name, type, mascot, conference, division, logoUrl, primaryColor, secondaryColor, city, state, country, galleryImages }.\n' +
    '- coach (optional): { firstName, lastName, email, phone, title }.\n' +
    '- awards (optional): Array of { title, category, sport, season, issuer, date }.\n' +
    '- teamHistory (optional): Array of { name, type, sport, location, record, startDate, endDate, isCurrent }.\n' +
    '- profileImgs (optional): Array of image URLs found for the athlete. Promoted to permanent storage and appended via arrayUnion (never overwrites existing images).\n' +
    '- teamId (optional): Firestore Team document ID. Pass this when available from user context — it is used as fallback for the team/org metadata cascade (mascot, colors, conference, division).\n' +
    '- organizationId (optional): Firestore Organization document ID. Same fallback purpose as teamId.';

  readonly parameters = WriteCoreIdentityInputSchema;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'user_tools' as const;
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  // ─── Execute ────────────────────────────────────────────────────────────

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = WriteCoreIdentityInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const { userId, source, profileUrl, targetSport } = parsed.data;
    const faviconUrl = parsed.data.faviconUrl;
    const identity = parsed.data.identity as Record<string, unknown> | undefined;
    const academics = parsed.data.academics as Record<string, unknown> | undefined;
    const sportInfo = parsed.data.sportInfo as Record<string, unknown> | undefined;
    const team = parsed.data.team as Record<string, unknown> | undefined;
    const coach = parsed.data.coach as Record<string, unknown> | undefined;
    const coachTitle = coach ? (this.str(coach, 'title') ?? undefined) : undefined;
    const teamHistory = parsed.data.teamHistory as Record<string, unknown>[] | undefined;
    const profileImgs = parsed.data.profileImgs ?? [];

    // Optional team/org IDs for cascade fallback
    const explicitTeamId = parsed.data.teamId;
    const explicitOrgId = parsed.data.organizationId;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    context?.emitStage?.('fetching_data', {
      icon: 'database',
      userId,
      targetSport,
      phase: 'validate_identity_fields',
    });

    // At least one data section must be provided
    if (
      !identity &&
      !academics &&
      !sportInfo &&
      !team &&
      !coach &&
      !teamHistory &&
      profileImgs.length === 0
    ) {
      return {
        success: false,
        error:
          'At least one data section (identity, academics, sportInfo, team, coach, teamHistory) is required.',
      };
    }

    const userRef = this.db.collection(USERS_COLLECTION).doc(userId);

    // ── Promote profileImgs from thread staging → permanent path ──────
    // Team logo + gallery promotions are deferred until resolvedTeamRef is known (see below).
    let promotedProfileImgs: string[] = profileImgs;
    let promotedTeamGallery: string[] = [];

    try {
      const accessGrant = await createProfileWriteAccessService(
        this.db
      ).assertCanManageProfileTarget({
        actorUserId: context.userId,
        targetUserId: userId,
        action: 'tool:write_core_identity',
      });
      const userData = accessGrant.targetUserData;
      const normalizedTargetSport = targetSport.trim().toLowerCase();
      const authorizedSportSelection = accessGrant.isSelfWrite
        ? null
        : resolveAuthorizedTargetSportSelection(userData, normalizedTargetSport, accessGrant);
      if (!accessGrant.isSelfWrite && !authorizedSportSelection) {
        return { success: false, error: 'Not authorized to write profile data for this sport.' };
      }
      const authorizedTeamId = accessGrant.isSelfWrite
        ? undefined
        : authorizedSportSelection?.teamId;
      const authorizedOrgId = accessGrant.isSelfWrite
        ? undefined
        : authorizedSportSelection?.organizationId;
      let scopedExplicitTeamId =
        accessGrant.isSelfWrite || !explicitTeamId || explicitTeamId === authorizedTeamId
          ? explicitTeamId
          : undefined;
      let scopedExplicitOrgId =
        accessGrant.isSelfWrite || !explicitOrgId || explicitOrgId === authorizedOrgId
          ? explicitOrgId
          : undefined;

      if (
        (!accessGrant.isSelfWrite && explicitTeamId && explicitTeamId !== scopedExplicitTeamId) ||
        (!accessGrant.isSelfWrite && explicitOrgId && explicitOrgId !== scopedExplicitOrgId)
      ) {
        logger.warn('[WriteCoreIdentity] Ignoring out-of-scope team/org identifiers', {
          actorUserId: context.userId,
          targetUserId: userId,
          explicitTeamId,
          explicitOrgId,
          sharedTeamIds: accessGrant.sharedTeamIds,
          sharedOrganizationIds: accessGrant.sharedOrganizationIds,
        });
      }

      const effectiveTeam = team ? { ...team } : null;
      if (!accessGrant.isSelfWrite && effectiveTeam) {
        const nestedTeamId = this.str(effectiveTeam, 'teamId') ?? undefined;
        const nestedOrgId = this.str(effectiveTeam, 'organizationId') ?? undefined;

        if (nestedTeamId && nestedTeamId !== authorizedTeamId) {
          delete effectiveTeam['teamId'];
        }
        if (nestedOrgId && nestedOrgId !== authorizedOrgId) {
          delete effectiveTeam['organizationId'];
        }
      }

      const userRole = typeof userData['role'] === 'string' ? userData['role'] : 'athlete';
      const isCoachOrDirector = isTeamRole(userRole);

      if (!isCoachOrDirector && profileImgs.length > 0 && context?.userId) {
        promotedProfileImgs = await ScraperMediaService.promoteMedia(
          profileImgs,
          context.userId,
          `Users/${context.userId}/profile`
        );
      } else if (isCoachOrDirector) {
        promotedProfileImgs = [];
      }

      const rawSports = userData['sports'];
      const existingSports: Record<string, unknown>[] = Array.isArray(rawSports)
        ? (rawSports as Record<string, unknown>[])
        : rawSports && typeof rawSports === 'object'
          ? (Object.values(rawSports) as Record<string, unknown>[])
          : [];
      const now = new Date().toISOString();

      context?.emitStage?.('submitting_job', {
        icon: 'database',
        userId,
        targetSport,
        phase: 'merge_identity_data',
      });

      const payload: Record<string, unknown> = {};
      const writtenSections: string[] = [];

      // ── Identity fields ──────────────────────────────────────────────
      if (identity && !isCoachOrDirector) {
        this.mergeIdentity(identity, userData, payload, writtenSections, source, isCoachOrDirector);
      }

      // ── Academics ────────────────────────────────────────────────────
      if (academics && !isCoachOrDirector) {
        const existingAcademics = (userData['academics'] ?? {}) as Record<string, unknown>;
        const sanitized = this.sanitizeAcademics(academics);
        const mergedAcademics = { ...existingAcademics };
        let academicsUpdated = false;

        for (const [key, value] of Object.entries(sanitized)) {
          mergedAcademics[key] = value;
          academicsUpdated = true;
        }

        if (academicsUpdated) {
          payload['academics'] = mergedAcademics;
          writtenSections.push('academics');
        }
      }

      // ── Sport-scoped data ────────────────────────────────────────────
      // Coaches/directors NEVER create new sports or write sportInfo/measurables.
      // They may still write team/coach refs on an EXISTING sport.
      const sportIndex =
        authorizedSportSelection?.index ?? this.resolveSportIndex(existingSports, targetSport);
      const isNewSport = sportIndex >= existingSports.length;

      if (isNewSport) {
        // No roles create new sport entries from scraped data.
        context?.emitStage?.('fetching_data', {
          icon: 'database',
          userId,
          targetSport,
          phase: 'skip_missing_sport_profile',
        });
      } else if (sportInfo || effectiveTeam || coach) {
        const updatedSports = existingSports.map((s) => ({ ...s }));
        const sportObj = { ...(updatedSports[sportIndex] ?? {}) } as Record<string, unknown>;

        if (sportInfo && !isCoachOrDirector) {
          let sportInfoUpdated = false;
          // Positions are NEVER updated by the scraper.
          // Users set their positions manually in the app.
          const jersey = sportInfo['jerseyNumber'];
          if (jersey !== undefined && jersey !== null) {
            sportObj['jerseyNumber'] = jersey;
            sportInfoUpdated = true;
          }
          const side = this.str(sportInfo, 'side');
          if (side) {
            sportObj['side'] = side;
            sportInfoUpdated = true;
          }
          if (sportInfoUpdated) writtenSections.push('sportInfo');
        }

        if (effectiveTeam) {
          const hasMissingIds = !this.str(effectiveTeam, 'teamId') && !scopedExplicitTeamId;
          const hasScrapedName = this.str(effectiveTeam, 'name')?.trim();

          if (hasMissingIds && hasScrapedName) {
            try {
              context?.emitStage?.('fetching_data', {
                icon: 'search',
                userId,
                targetSport,
                teamName: hasScrapedName,
                phase: 'resolve_team_identity',
              });

              const teamType = this.str(effectiveTeam, 'type') ?? 'high-school';
              const teamCity = this.str(effectiveTeam, 'city');
              const teamState = this.str(effectiveTeam, 'state');
              const teamLocation = [teamCity, teamState].filter(Boolean).join(', ');
              const organizationService = createOrganizationService(this.db);
              const matchedOrganization = (
                await organizationService.searchOrganizations(hasScrapedName, {
                  ...(teamState ? { state: teamState } : {}),
                  limit: 10,
                })
              ).find(
                (organization) =>
                  organization.name.trim().toLowerCase() === hasScrapedName.toLowerCase()
              );

              const provisionResult = await provisionOnboardingPrograms({
                db: this.db,
                userId: context.userId,
                role: userRole as UserRole,
                sports: [{ sport: targetSport, order: 0 }],
                updateData: {},
                teamSelection: {
                  teams: [
                    {
                      id:
                        matchedOrganization?.id ??
                        `draft_${targetSport.toLowerCase()}_${Date.now().toString(36)}`,
                      name: matchedOrganization?.name ?? hasScrapedName,
                      teamType,
                      location: teamLocation || undefined,
                      ...(matchedOrganization
                        ? { organizationId: matchedOrganization.id }
                        : { isDraft: true }),
                    },
                  ],
                },
                ...(matchedOrganization
                  ? {}
                  : {
                      createTeamProfile: {
                        programName: hasScrapedName,
                        teamType,
                        city: teamCity ?? undefined,
                        state: teamState ?? undefined,
                      },
                    }),
              });

              const mapping = provisionResult.sportTeamMap.get(targetSport.toLowerCase());
              if (mapping) {
                effectiveTeam['teamId'] = mapping.teamId;
                effectiveTeam['organizationId'] = mapping.organizationId;
                scopedExplicitTeamId = mapping.teamId;
                scopedExplicitOrgId = mapping.organizationId;
                logger.info('[WriteCoreIdentity] Resolved scraped team to canonical records', {
                  userId,
                  targetSport,
                  teamName: hasScrapedName,
                  teamId: mapping.teamId,
                  organizationId: mapping.organizationId,
                  reusedOrganizationId: matchedOrganization?.id,
                });
              }
            } catch (err) {
              logger.warn(
                '[WriteCoreIdentity] Auto-provisioning failed for scraped team, falling back to raw strings.',
                {
                  userId,
                  targetSport,
                  teamName: hasScrapedName,
                  error: err instanceof Error ? err.message : String(err),
                }
              );
            }
          }

          const existingTeam = (sportObj['team'] ?? {}) as Record<string, unknown>;
          sportObj['team'] = this.mergeTeamRef(
            existingTeam,
            effectiveTeam,
            scopedExplicitTeamId,
            scopedExplicitOrgId,
            isCoachOrDirector ? coachTitle : undefined
          );
          writtenSections.push('team');
        } else if (
          isCoachOrDirector &&
          (coachTitle || scopedExplicitTeamId || scopedExplicitOrgId)
        ) {
          const existingTeam = (sportObj['team'] ?? {}) as Record<string, unknown>;
          sportObj['team'] = this.mergeTeamRef(
            existingTeam,
            {},
            scopedExplicitTeamId,
            scopedExplicitOrgId,
            coachTitle
          );
          writtenSections.push('team');
        }

        if (coach && !isCoachOrDirector) {
          sportObj['coach'] = this.sanitizeCoach(coach);
          writtenSections.push('coach');
        }

        sportObj['updatedAt'] = now;
        updatedSports[sportIndex] = sportObj;
        payload['sports'] = updatedSports;
      }

      // ── Team History ─────────────────────────────────────────────────
      if (teamHistory?.length && !isCoachOrDirector) {
        const existingHistory = (userData['teamHistory'] ?? []) as Record<string, unknown>[];
        payload['teamHistory'] = this.mergeTeamHistory(
          existingHistory,
          teamHistory as Record<string, unknown>[],
          targetSport
        );
        writtenSections.push('teamHistory');
      }

      // ── Profile images ─────────────────────────────────────────────
      if (promotedProfileImgs.length > 0 && !isCoachOrDirector) {
        payload['profileImgs'] = FieldValue.arrayUnion(...promotedProfileImgs);
        writtenSections.push('profileImgs');
      }

      const resolvedSportIndex = isNewSport ? existingSports.length : sportIndex;
      const nextSports = Array.isArray(payload['sports'])
        ? (payload['sports'] as Record<string, unknown>[])
        : existingSports;
      const resolvedSport = nextSports[resolvedSportIndex] as Record<string, unknown> | undefined;
      const resolvedTeamRef = this.resolveTeamRef(
        resolvedSport,
        userData,
        scopedExplicitTeamId,
        scopedExplicitOrgId,
        authorizedTeamId,
        authorizedOrgId
      );

      // ── Connected source sync record ─────────────────────────────────
      // For athletes: write connectedSources to the User doc.
      // For coaches/directors: write to the Teams doc (linked accounts belong to the team).
      if (isCoachOrDirector) {
        const teamId = this.str(resolvedTeamRef, 'teamId');
        if (teamId) {
          try {
            const teamRef = this.db.collection('Teams').doc(teamId);
            const teamDoc = await teamRef.get();
            const existingTeamConnectedSources = teamDoc.exists
              ? (((teamDoc.data() ?? {})['connectedSources'] ?? []) as Record<string, unknown>[])
              : [];
            const connectedSourcesUpdate = this.buildConnectedSourcesUpdate(
              existingTeamConnectedSources,
              source,
              profileUrl,
              targetSport,
              now,
              faviconUrl
            );
            await teamRef.set(
              { connectedSources: connectedSourcesUpdate, updatedAt: FieldValue.serverTimestamp() },
              { merge: true }
            );
            writtenSections.push('connectedSources(team)');
          } catch (err) {
            logger.warn('[WriteCoreIdentity] Skipping team-role connectedSources update', {
              userId,
              teamId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else {
          logger.warn('[WriteCoreIdentity] Missing teamId for team-role connectedSources update', {
            userId,
            source,
          });
        }
      } else {
        const connectedSourcesUpdate = this.buildConnectedSourcesUpdate(
          (userData['connectedSources'] ?? []) as Record<string, unknown>[],
          source,
          profileUrl,
          targetSport,
          now,
          faviconUrl
        );
        payload['connectedSources'] = connectedSourcesUpdate;
      }

      // ── Measurables verification ─────────────────────────────────────
      // When height or weight was written from an external source, tag the
      // ── Clean up legacy flat height/weight fields ────────────────────
      // Measurables are now stored as root-level measurables[] VerifiedMetric
      // objects (built in mergeIdentity). Delete the old flat string fields.
      const measurablesWritten =
        writtenSections.includes('height') || writtenSections.includes('weight');
      if (measurablesWritten) {
        payload['height'] = FieldValue.delete();
        payload['weight'] = FieldValue.delete();
      }

      // Clean up legacy flat fields if team data was written
      if (effectiveTeam && !isCoachOrDirector) {
        payload['conference'] = FieldValue.delete();
        payload['division'] = FieldValue.delete();
        payload['level'] = FieldValue.delete();
      }

      // ── Promote team logo + gallery now that resolvedTeamRef is authoritative ────────────
      // resolvedTeamRef has the full cascade: sport record → userData.teamId → explicitTeamId.
      // Promoting here guarantees we always write to Teams/{teamId}/logo/ and Teams/{teamId}/gallery/.
      const authorityTeamId = this.str(resolvedTeamRef, 'teamId') ?? undefined;
      if (context?.userId && effectiveTeam) {
        // Logo
        if (typeof effectiveTeam['logoUrl'] === 'string' && effectiveTeam['logoUrl']) {
          const logoDest = authorityTeamId
            ? `Teams/${authorityTeamId}/logo`
            : `Users/${context.userId}/profile`;
          const [promotedLogo] = await ScraperMediaService.promoteMedia(
            [effectiveTeam['logoUrl'] as string],
            context.userId,
            logoDest
          );
          if (promotedLogo) effectiveTeam['logoUrl'] = promotedLogo;
        }
        // Gallery
        const rawGallery = Array.isArray(effectiveTeam['galleryImages'])
          ? (effectiveTeam['galleryImages'] as unknown[]).filter(
              (u): u is string => typeof u === 'string' && u.trim() !== ''
            )
          : [];
        if (rawGallery.length > 0) {
          const galleryDest = authorityTeamId
            ? `Teams/${authorityTeamId}/gallery`
            : `Users/${context.userId}/profile`;
          promotedTeamGallery = await ScraperMediaService.promoteMedia(
            rawGallery,
            context.userId,
            galleryDest
          );
        }
      }

      // ── Sync Team/Organization metadata ──────────────────────────────
      let orgMetadataWritten: string[] = [];
      let orgMetadataSkipped: string[] = [];
      let orgId: string | null = null;
      if (effectiveTeam) {
        context?.emitStage?.('submitting_job', {
          icon: 'database',
          userId,
          targetSport,
          phase: 'sync_team_metadata',
        });
        const orgResult = await this.syncTeamMetadata(
          resolvedTeamRef,
          effectiveTeam,
          'team',
          promotedTeamGallery
        );
        orgMetadataWritten = orgResult.orgWritten;
        orgMetadataSkipped = orgResult.orgSkipped;
        orgId = orgResult.orgId;
        if (isCoachOrDirector) writtenSections.push('teamMetadata');
      }

      const shouldUpdateUserDoc = Object.keys(payload).length > 0;
      if (shouldUpdateUserDoc) {
        if (isCoachOrDirector) {
          payload['coachTitle'] = FieldValue.delete();
        }
        payload['updatedAt'] = FieldValue.serverTimestamp();
      }

      if (writtenSections.length === 0 && !shouldUpdateUserDoc) {
        return { success: false, error: 'No actionable fields were provided.' };
      }

      // ── Write ────────────────────────────────────────────────────────
      if (shouldUpdateUserDoc) {
        context?.emitStage?.('submitting_job', {
          icon: 'database',
          userId,
          targetSport,
          phase: 'write_profile',
        });
        await userRef.update(payload);
      }

      // ── Cache invalidation ───────────────────────────────────────────
      if (shouldUpdateUserDoc) {
        context?.emitStage?.('persisting_result', {
          icon: 'database',
          userId,
          targetSport,
          phase: 'invalidate_caches',
        });
        try {
          const cache = getCacheService();
          await Promise.all([
            cache.del(USER_CACHE_KEYS.USER_BY_ID(userId)),
            invalidateProfileCaches(
              userId,
              typeof userData['unicode'] === 'string' ? userData['unicode'] : null
            ),
          ]);
          const contextBuilder = new ContextBuilder();
          await contextBuilder.invalidateContext(userId);
        } catch {
          // Best-effort
        }
      }

      // ── Deferred welcome graphic after first completed scrape ─────────
      // If the user uploaded their photo/logo before the first linked-account
      // sync completed, the edit-profile route intentionally deferred the
      // welcome job. Re-check readiness here after this source has been marked
      // as synced so the graphic enqueues automatically.
      if (shouldUpdateUserDoc) {
        try {
          const welcomeResult = await enqueueWelcomeGraphicIfReady(this.db, { userId }, 'staging');

          if (welcomeResult.status === 'enqueued') {
            logger.info('[WriteCoreIdentity] Welcome graphic enqueued after sync completion', {
              userId,
              source,
              targetSport,
            });
          }
        } catch (err) {
          logger.warn('[WriteCoreIdentity] Welcome graphic readiness check failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const orgSkippedNote =
        orgMetadataSkipped.length > 0
          ? ` Org fields blocked by write-once guard (already populated — use mutate_nxt1_data with collection "Organizations" and documentId "${orgId}" to overwrite): ${orgMetadataSkipped.join(', ')}.`
          : '';

      return {
        success: true,
        data: {
          userId,
          source,
          profileUrl,
          targetSport,
          sportIndex: resolvedSportIndex,
          isNewSport,
          writtenSections,
          sectionCount: writtenSections.length,
          orgMetadata: {
            organizationId: orgId,
            written: orgMetadataWritten,
            skipped: orgMetadataSkipped,
          },
          message: `Wrote ${writtenSections.length} section(s) for "${targetSport}" from "${source}": ${writtenSections.join(', ')}.${orgSkippedNote}`,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to write core identity',
      };
    }
  }

  // ─── Merge Helpers ──────────────────────────────────────────────────────

  private mergeIdentity(
    id: Record<string, unknown>,
    userData: Record<string, unknown>,
    payload: Record<string, unknown>,
    written: string[],
    source: string,
    isCoachOrDirector: boolean
  ): void {
    const fields: Array<[string, string]> = [
      ['firstName', 'firstName'],
      ['lastName', 'lastName'],
      ['displayName', 'displayName'],
    ];
    for (const [src, dst] of fields) {
      const val = this.str(id, src);
      if (val && val.length <= VALIDATION.MAX_NAME_LENGTH) {
        payload[dst] = val;
        written.push(dst);
      }
    }

    // ── Height / Weight → root-level measurables[] (VerifiedMetric) ──
    // Coaches/directors don't get athlete measurables written to their profile.
    const heightVal = !isCoachOrDirector ? this.str(id, 'height') : null;
    const weightVal = !isCoachOrDirector ? this.str(id, 'weight') : null;
    if (heightVal || weightVal) {
      const existingMeasurables = Array.isArray(userData['measurables'])
        ? ([...userData['measurables']] as Record<string, unknown>[])
        : [];
      const now = new Date().toISOString();
      const displayName = platformDisplayName(source);

      const upsertMetric = (
        field: string,
        label: string,
        value: string,
        unit: string,
        category: string
      ) => {
        const idx = existingMeasurables.findIndex((m) => m['field'] === field);
        const metric: Record<string, unknown> = {
          id: `${field}_${now}`,
          field,
          label,
          value,
          unit,
          category,
          source: { platform: source, displayName },
          verified: true,
          verifiedBy: displayName,
          dateRecorded: now,
          updatedAt: now,
        };
        if (idx >= 0) {
          // Only update if user hasn't manually set this metric
          if (!existingMeasurables[idx]['manual']) {
            existingMeasurables[idx] = { ...existingMeasurables[idx], ...metric };
          }
        } else {
          existingMeasurables.push(metric);
        }
      };

      if (heightVal) {
        upsertMetric('height', 'Height', heightVal, '', 'physical');
        written.push('height');
      }
      if (weightVal) {
        upsertMetric('weight', 'Weight', weightVal, 'lbs', 'physical');
        written.push('weight');
      }

      if (written.includes('height') || written.includes('weight')) {
        payload['measurables'] = existingMeasurables;
      }
    }
    // aboutMe has a longer limit — write as draftAboutMe for human review
    const aboutMe = this.str(id, 'aboutMe');
    if (aboutMe && aboutMe.length <= VALIDATION.MAX_ABOUT_ME_LENGTH) {
      payload['draftAboutMe'] = aboutMe;
      if (!written.includes('draftAboutMe')) written.push('draftAboutMe');
    }

    const classOf = id['classOf'];
    if (
      typeof classOf === 'number' &&
      Number.isInteger(classOf) &&
      classOf >= VALIDATION.MIN_GRADUATION_YEAR &&
      classOf <= VALIDATION.MAX_GRADUATION_YEAR
    ) {
      payload['classOf'] = classOf;
      written.push('classOf');
    }

    // Location
    const existingLoc = (userData['location'] ?? {}) as Record<string, string>;
    const loc: Record<string, string> = { ...existingLoc };
    let locUpdated = false;

    const city = this.str(id, 'city');
    const state = this.str(id, 'state');
    const country = this.str(id, 'country');

    if (city) {
      loc['city'] = city;
      locUpdated = true;
    }
    if (state) {
      loc['state'] = state;
      locUpdated = true;
    }
    if (country) {
      loc['country'] = country;
      locUpdated = true;
    }

    if (locUpdated) {
      payload['location'] = loc;
      written.push('location');
    }
  }

  private hasValue(val: unknown): boolean {
    if (val === undefined || val === null) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    if (Array.isArray(val) && val.length === 0) return false;
    return true;
  }

  /**
   * Normalize position strings to shorthands using POSITION_ABBREVIATIONS.
   * E.g. "Point Guard" → "PG", "Quarterback" → "QB".
   * Falls back to original string if no mapping exists.
   */
  private sanitizeAcademics(a: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const numField = (key: string, min: number, max: number) => {
      const val = a[key];
      if (typeof val === 'number' && val >= min && val <= max) result[key] = val;
    };
    numField('gpa', 0, 5);
    numField('weightedGpa', 0, 6);
    numField('satScore', 400, 1600);
    numField('actScore', 1, 36);
    numField('classRank', 1, 10000);
    numField('classSize', 1, 10000);
    const major = this.str(a, 'intendedMajor');
    if (major) result['intendedMajor'] = major;
    return result;
  }

  private resolveSportIndex(
    existingSports: Record<string, unknown>[],
    targetSport: string
  ): number {
    const normalized = normalizeBaseSportKey(targetSport);
    for (let i = 0; i < existingSports.length; i++) {
      if (
        typeof existingSports[i]['sport'] === 'string' &&
        normalizeBaseSportKey(existingSports[i]['sport'] as string) === normalized
      ) {
        return i;
      }
    }
    return existingSports.length;
  }

  private mergeTeamRef(
    existing: Record<string, unknown> | undefined,
    team: Record<string, unknown>,
    explicitTeamId?: string,
    explicitOrgId?: string,
    explicitTitle?: string
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    // Preserve existing IDs
    for (const key of ['teamId', 'organizationId', 'title', 'updatedAt']) {
      const val = existing?.[key];
      if (val !== undefined && val !== null && val !== '') result[key] = val;
    }
    const teamId = this.str(team, 'teamId') ?? explicitTeamId;
    if (!this.hasValue(result['teamId']) && teamId) result['teamId'] = teamId;
    const organizationId = this.str(team, 'organizationId') ?? explicitOrgId;
    if (!this.hasValue(result['organizationId']) && organizationId) {
      result['organizationId'] = organizationId;
    }
    // Write only the lightweight fields to the User doc
    const name = this.str(team, 'name');
    if (name) result['name'] = name;
    const type = this.str(team, 'type');
    if (type) result['type'] = type;
    const title = explicitTitle ?? this.str(team, 'title');
    if (title) result['title'] = title;
    return result;
  }

  private sanitizeCoach(coach: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const first = this.str(coach, 'firstName');
    const last = this.str(coach, 'lastName');
    if (first) result['firstName'] = first;
    if (last) result['lastName'] = last;
    const email = this.str(coach, 'email');
    if (email) result['email'] = email;
    const phone = this.str(coach, 'phone');
    if (phone) result['phone'] = phone;
    const title = this.str(coach, 'title');
    if (title) result['title'] = title;
    return result;
  }

  private mergeTeamHistory(
    existing: Record<string, unknown>[],
    incoming: Record<string, unknown>[],
    defaultSport: string
  ): Record<string, unknown>[] {
    if (incoming.length > VALIDATION.MAX_TEAM_HISTORY) return existing;
    const merged = [...existing];
    const keyOf = (t: Record<string, unknown>) => {
      const name = String(t['name'] ?? '')
        .toLowerCase()
        .trim();
      const sport = String(t['sport'] ?? defaultSport)
        .toLowerCase()
        .trim();
      const start = String(t['startDate'] ?? '')
        .toLowerCase()
        .trim();
      return `${name}::${sport}::${start}`;
    };
    const indexMap = new Map<string, number>();
    for (let i = 0; i < merged.length; i++) indexMap.set(keyOf(merged[i]), i);

    for (const entry of incoming) {
      const name = this.str(entry, 'name');
      if (!name) continue;
      const record: Record<string, unknown> = {
        name,
        sport: this.str(entry, 'sport') ?? defaultSport,
      };
      for (const f of ['type', 'location', 'record', 'startDate', 'endDate']) {
        const v = this.str(entry, f);
        if (v) record[f] = v;
      }
      if (entry['isCurrent'] !== undefined) record['isCurrent'] = !!entry['isCurrent'];
      const key = keyOf(record);
      const idx = indexMap.get(key);
      if (idx !== undefined) {
        merged[idx] = { ...merged[idx], ...record };
      } else {
        indexMap.set(key, merged.length);
        merged.push(record);
      }
    }
    return merged;
  }

  private buildConnectedSourcesUpdate(
    existing: Record<string, unknown>[],
    platform: string,
    profileUrl: string,
    scopeId: string,
    now: string,
    faviconUrl?: string
  ): Record<string, unknown>[] {
    const updated = [...existing];
    const matchIndex = updated.findIndex(
      (cs) => cs['platform'] === platform && cs['scopeId'] === scopeId
    );
    const record: Record<string, unknown> = {
      platform,
      profileUrl,
      lastSyncedAt: now,
      syncStatus: 'success',
      scopeType: 'sport',
      scopeId,
      ...(faviconUrl && { faviconUrl }),
    };
    if (matchIndex >= 0) {
      updated[matchIndex] = { ...updated[matchIndex], ...record };
    } else {
      updated.push(record);
    }
    return updated;
  }

  private resolveTeamRef(
    resolvedSport: Record<string, unknown> | undefined,
    userData: Record<string, unknown>,
    explicitTeamId?: string,
    explicitOrgId?: string,
    lockedTeamId?: string,
    lockedOrgId?: string
  ): Record<string, unknown> {
    let teamRef = resolvedSport?.['team'] as Record<string, unknown> | undefined;

    if (!teamRef) teamRef = {};
    if (lockedTeamId) {
      teamRef = { ...teamRef, teamId: lockedTeamId };
    }
    if (lockedOrgId) {
      teamRef = { ...teamRef, organizationId: lockedOrgId };
    }
    if (!this.str(teamRef, 'teamId') && typeof userData['teamId'] === 'string') {
      teamRef = { ...teamRef, teamId: userData['teamId'] };
    }
    if (!this.str(teamRef, 'organizationId') && typeof userData['organizationId'] === 'string') {
      teamRef = { ...teamRef, organizationId: userData['organizationId'] };
    }
    if (!this.str(teamRef, 'teamId') && explicitTeamId) {
      teamRef = { ...teamRef, teamId: explicitTeamId };
    }
    if (!this.str(teamRef, 'organizationId') && explicitOrgId) {
      teamRef = { ...teamRef, organizationId: explicitOrgId };
    }

    return teamRef;
  }

  // ─── Team/Org Metadata Sync ─────────────────────────────────────────────

  private async syncTeamMetadata(
    teamRef: Record<string, unknown> | undefined,
    teamInput: Record<string, unknown>,
    _relationKind: 'team',
    galleryImages?: string[]
  ): Promise<{ orgId: string | null; orgWritten: string[]; orgSkipped: string[] }> {
    const teamId = this.str(teamRef ?? {}, 'teamId');
    let organizationId = this.str(teamRef ?? {}, 'organizationId');
    let existingTeamData: Record<string, unknown> | null = null;
    let teamCode: string | undefined;
    let teamUnicode: string | undefined;

    if (teamId) {
      const teamDoc = await this.db.collection('Teams').doc(teamId).get();
      if (teamDoc.exists) {
        const data = teamDoc.data() ?? {};
        existingTeamData = data;
        teamCode = typeof data['teamCode'] === 'string' ? data['teamCode'] : undefined;
        teamUnicode = typeof data['unicode'] === 'string' ? data['unicode'] : undefined;
        organizationId ||=
          typeof data['organizationId'] === 'string' ? data['organizationId'] : null;
      }
    }

    const orgResult = await this.syncOrganizationMetadata(organizationId, teamInput);

    if (!teamId || !existingTeamData) {
      return orgResult;
    }

    // Write-once: only set conference/division if not already populated on the Team doc.
    // Organization metadata is synchronized first because branding renders from the organization.
    const updateData: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const conf = this.str(teamInput, 'conference');
    if (conf && !this.hasValue(existingTeamData['conference'])) updateData['conference'] = conf;
    const div = this.str(teamInput, 'division');
    if (div && !this.hasValue(existingTeamData['division'])) updateData['division'] = div;
    if (galleryImages && galleryImages.length > 0) {
      updateData['galleryImages'] = FieldValue.arrayUnion(...galleryImages);
    }

    if (Object.keys(updateData).length > 1) {
      await this.db.collection('Teams').doc(teamId).update(updateData);
      await invalidateTeamCache(teamId, teamCode, teamUnicode);
    }

    return orgResult;
  }

  private async syncOrganizationMetadata(
    organizationId: string | null,
    teamInput: Record<string, unknown>
  ): Promise<{ orgId: string | null; orgWritten: string[]; orgSkipped: string[] }> {
    if (!organizationId) return { orgId: null, orgWritten: [], orgSkipped: [] };

    const organizationService = createOrganizationService(this.db);

    const orgWritten: string[] = [];
    const orgSkipped: string[] = [];

    // Always overwrite branding fields — this is an explicit agent action
    const branding: Record<string, unknown> = {};
    for (const key of ['mascot', 'logoUrl', 'primaryColor', 'secondaryColor']) {
      const val = this.str(teamInput, key);
      if (val) {
        branding[key] = val;
        orgWritten.push(key);
      }
    }

    // Always overwrite location fields
    const city = this.str(teamInput, 'city');
    const state = this.str(teamInput, 'state');
    const country = this.str(teamInput, 'country');
    const location: Record<string, string> = {};
    if (city) {
      location['city'] = city;
      orgWritten.push('city');
    }
    if (state) {
      location['state'] = state;
      orgWritten.push('state');
    }
    if (country) {
      location['country'] = country;
      orgWritten.push('country');
    }

    const updateData: Record<string, unknown> = { ...branding };
    if (Object.keys(location).length > 0) updateData['location'] = location;
    if (Object.keys(updateData).length > 0) {
      await organizationService.updateOrganization(organizationId, updateData, 'agent-x-scraper');
    }

    return { orgId: organizationId, orgWritten, orgSkipped };
  }
}
