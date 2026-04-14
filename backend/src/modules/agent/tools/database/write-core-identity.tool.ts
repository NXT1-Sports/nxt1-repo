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
import { isTeamRole } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { ScraperMediaService } from '../integrations/scraper-media.service.js';
import { getCacheService } from '../../../../services/cache.service.js';
import {
  createProfileWriteAccessService,
  resolveAuthorizedTargetSportSelection,
} from '../../../../services/profile-write-access.service.js';

import { createOrganizationService } from '../../../../services/organization.service.js';
import { enqueueWelcomeGraphicIfReady } from '../../../../services/agent-welcome.service.js';
import { invalidateTeamCache } from '../../../../services/team-code.service.js';
import { CACHE_KEYS as USER_CACHE_KEYS } from '../../../../services/users.service.js';
import { ContextBuilder } from '../../memory/context-builder.js';
import { invalidateProfileCaches } from '../../../../routes/profile.routes.js';
import { platformDisplayName } from './platform-utils.js';
import { SyncDiffService, type PreviousProfileState } from '../../sync/index.js';
import { onDailySyncComplete } from '../../triggers/trigger.listeners.js';
import { logger } from '../../../../utils/logger.js';

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
    '- identity (optional): { firstName, lastName, displayName, aboutMe, height, weight, classOf, city, state, country, school }.\n' +
    '- academics (optional): { gpa, weightedGpa, satScore, actScore, classRank, classSize, intendedMajor }.\n' +
    '- sportInfo (optional): { positions, jerseyNumber, side }.\n' +
    '- team (optional): { name, type, mascot, conference, division, logoUrl, primaryColor, secondaryColor, city, state, country, galleryImages }.\n' +
    '- coach (optional): { firstName, lastName, email, phone, title }.\n' +
    '- awards (optional): Array of { title, category, sport, season, issuer, date }.\n' +
    '- teamHistory (optional): Array of { name, type, sport, location, record, startDate, endDate, isCurrent }.\n' +
    '- profileImgs (optional): Array of image URLs found for the athlete. Promoted to permanent storage and appended via arrayUnion (never overwrites existing images).\n' +
    '- teamId (optional): Firestore Team document ID. Pass this when available from user context — it is used as fallback for the team/org metadata cascade (mascot, colors, conference, division).\n' +
    '- organizationId (optional): Firestore Organization document ID. Same fallback purpose as teamId.';

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string' },
      source: { type: 'string' },
      profileUrl: { type: 'string' },
      faviconUrl: { type: 'string' },
      targetSport: { type: 'string' },
      identity: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          displayName: { type: 'string' },
          aboutMe: { type: 'string' },
          height: { type: 'string' },
          weight: { type: 'string' },
          classOf: { type: 'number' },
          city: { type: 'string' },
          state: { type: 'string' },
          country: { type: 'string' },
          school: { type: 'string' },
        },
      },
      academics: {
        type: 'object',
        properties: {
          gpa: { type: 'number' },
          weightedGpa: { type: 'number' },
          satScore: { type: 'number' },
          actScore: { type: 'number' },
          classRank: { type: 'number' },
          classSize: { type: 'number' },
          intendedMajor: { type: 'string' },
        },
      },
      sportInfo: {
        type: 'object',
        properties: {
          positions: { type: 'array', items: { type: 'string' } },
          jerseyNumber: { type: ['number', 'string'] },
          side: { type: 'string' },
        },
      },
      team: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          mascot: { type: 'string' },
          conference: { type: 'string' },
          division: { type: 'string' },
          logoUrl: { type: 'string' },
          primaryColor: { type: 'string' },
          secondaryColor: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          country: { type: 'string' },
          galleryImages: { type: 'array', items: { type: 'string' } },
        },
      },
      coach: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['firstName', 'lastName'],
      },
      awards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: 'string' },
            sport: { type: 'string' },
            season: { type: 'string' },
            issuer: { type: 'string' },
            date: { type: 'string' },
          },
          required: ['title'],
        },
      },
      teamHistory: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            sport: { type: 'string' },
            location: { type: 'string' },
            record: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            isCurrent: { type: 'boolean' },
          },
          required: ['name'],
        },
      },
      profileImgs: {
        type: 'array',
        items: { type: 'string' },
      },
      teamId: { type: 'string' },
      organizationId: { type: 'string' },
    },
    required: ['userId', 'source', 'profileUrl', 'targetSport'],
  } as const;

  override readonly allowedAgents = ['data_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

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
    const userId = this.str(input, 'userId');
    if (!userId) return this.paramError('userId');
    const source = this.str(input, 'source');
    if (!source) return this.paramError('source');
    const profileUrl = this.str(input, 'profileUrl');
    if (!profileUrl) return this.paramError('profileUrl');
    const targetSport = this.str(input, 'targetSport');
    if (!targetSport) return this.paramError('targetSport');

    const faviconUrl = this.str(input, 'faviconUrl') ?? undefined;
    const identity = this.obj(input, 'identity');
    const academics = this.obj(input, 'academics');
    const sportInfo = this.obj(input, 'sportInfo');
    const team = this.obj(input, 'team');
    const coach = this.obj(input, 'coach');
    const coachTitle = coach ? (this.str(coach, 'title') ?? undefined) : undefined;
    const awards = this.arr(input, 'awards');
    const teamHistory = this.arr(input, 'teamHistory');
    const rawProfileImgs = input['profileImgs'];
    const profileImgs: string[] = Array.isArray(rawProfileImgs)
      ? rawProfileImgs.filter((u): u is string => typeof u === 'string' && u.trim() !== '')
      : [];

    // Optional team/org IDs for cascade fallback
    const explicitTeamId = this.str(input, 'teamId') ?? undefined;
    const explicitOrgId = this.str(input, 'organizationId') ?? undefined;

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    context?.onProgress?.('Validating identity fields…');

    // At least one data section must be provided
    if (
      !identity &&
      !academics &&
      !sportInfo &&
      !team &&
      !coach &&
      !awards &&
      !teamHistory &&
      profileImgs.length === 0
    ) {
      return {
        success: false,
        error:
          'At least one data section (identity, academics, sportInfo, team, coach, awards, teamHistory) is required.',
      };
    }

    const userRef = this.db.collection(USERS_COLLECTION).doc(userId);

    // ── Promote thread-staged logoUrl in team to permanent path ──
    // Team logos may reference thread-scoped storage that expires with the thread.
    if (context?.userId && team && typeof team['logoUrl'] === 'string' && team['logoUrl']) {
      const brandingDest = `users/${context.userId}/profile`;
      const [promoted] = await ScraperMediaService.promoteMedia(
        [team['logoUrl'] as string],
        context.userId,
        brandingDest
      );
      if (promoted) {
        (team as Record<string, unknown>)['logoUrl'] = promoted;
      }
    }

    // ── Promote profileImgs from thread staging → permanent path ──────
    let promotedProfileImgs: string[] = profileImgs;

    // ── Promote team galleryImages from thread staging → permanent path ──
    let promotedTeamGallery: string[] = [];
    if (context?.userId) {
      const galleryDest = `users/${context.userId}/profile`;
      const extractGallery = (obj: Record<string, unknown> | null): string[] =>
        obj && Array.isArray(obj['galleryImages'])
          ? (obj['galleryImages'] as unknown[]).filter(
              (u): u is string => typeof u === 'string' && u.trim() !== ''
            )
          : [];

      const teamGallery = extractGallery(team);
      if (teamGallery.length > 0) {
        promotedTeamGallery = await ScraperMediaService.promoteMedia(
          teamGallery,
          context.userId,
          galleryDest
        );
      }
    }

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
      const scopedExplicitTeamId =
        accessGrant.isSelfWrite || !explicitTeamId || explicitTeamId === authorizedTeamId
          ? explicitTeamId
          : undefined;
      const scopedExplicitOrgId =
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
          `users/${context.userId}/profile`
        );
      } else if (isCoachOrDirector) {
        promotedProfileImgs = [];
      }

      // ── Snapshot previous state BEFORE write (for delta computation) ──
      const previousState: PreviousProfileState = {
        identity: {
          firstName: userData['firstName'],
          lastName: userData['lastName'],
          displayName: userData['displayName'],
          height: userData['height'],
          weight: userData['weight'],
          classOf: userData['classOf'],
          city: (userData['location'] as Record<string, unknown> | undefined)?.['city'],
          state: (userData['location'] as Record<string, unknown> | undefined)?.['state'],
          country: (userData['location'] as Record<string, unknown> | undefined)?.['country'],
          school: userData['school'],
          schoolLogoUrl: userData['schoolLogoUrl'],
          profileImage: userData['profileImage'],
          bannerImage: userData['bannerImage'],
          aboutMe: userData['aboutMe'],
        },
        awards: Array.isArray(userData['awards'])
          ? (userData['awards'] as Record<string, unknown>[])
          : [],
      };

      const rawSports = userData['sports'];
      const existingSports: Record<string, unknown>[] = Array.isArray(rawSports)
        ? (rawSports as Record<string, unknown>[])
        : rawSports && typeof rawSports === 'object'
          ? (Object.values(rawSports) as Record<string, unknown>[])
          : [];
      const now = new Date().toISOString();

      context?.onProgress?.('Merging identity, academics & sport data…');

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
          if (!this.hasValue(existingAcademics[key])) {
            mergedAcademics[key] = value;
            academicsUpdated = true;
          }
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
        context?.onProgress?.(
          `Skipping sport update: User does not have ${targetSport} on their profile.`
        );
      } else if (sportInfo || effectiveTeam || coach) {
        const updatedSports = existingSports.map((s) => ({ ...s }));
        const sportObj = { ...(updatedSports[sportIndex] ?? {}) } as Record<string, unknown>;

        if (sportInfo && !isCoachOrDirector) {
          let sportInfoUpdated = false;
          // Positions are NEVER updated by the scraper.
          // Users set their positions manually in the app.
          const jersey = sportInfo['jerseyNumber'];
          if (jersey !== undefined && jersey !== null && !this.hasValue(sportObj['jerseyNumber'])) {
            sportObj['jerseyNumber'] = jersey;
            sportInfoUpdated = true;
          }
          const side = this.str(sportInfo, 'side');
          if (side && !this.hasValue(sportObj['side'])) {
            sportObj['side'] = side;
            sportInfoUpdated = true;
          }
          if (sportInfoUpdated) writtenSections.push('sportInfo');
        }

        if (effectiveTeam) {
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

      // ── Awards ───────────────────────────────────────────────────────
      if (awards?.length && !isCoachOrDirector) {
        const existingAwards = (userData['awards'] ?? []) as Record<string, unknown>[];
        payload['awards'] = this.mergeAwards(
          existingAwards,
          awards as Record<string, unknown>[],
          targetSport
        );
        writtenSections.push('awards');
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

      // ── Sync Team/Organization metadata ──────────────────────────────
      if (effectiveTeam) {
        context?.onProgress?.('Syncing team organization metadata…');
        await this.syncTeamMetadata(resolvedTeamRef, effectiveTeam, 'team', promotedTeamGallery);
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
        context?.onProgress?.('Writing profile to database…');
        await userRef.update(payload);
      }

      // ── Cache invalidation ───────────────────────────────────────────
      if (shouldUpdateUserDoc) {
        context?.onProgress?.('Invalidating caches…');
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

      // ── Compute delta & fire trigger for Agent X ───────────────────
      if (shouldUpdateUserDoc && !isCoachOrDirector) {
        try {
          const diffService = new SyncDiffService();
          const extractedProfile = {
            platform: source,
            profileUrl,
            ...(identity
              ? {
                  identity: {
                    firstName: this.str(identity, 'firstName'),
                    lastName: this.str(identity, 'lastName'),
                    displayName: this.str(identity, 'displayName'),
                    height: this.str(identity, 'height'),
                    weight: this.str(identity, 'weight'),
                    classOf: identity['classOf'] as number | undefined,
                    city: this.str(identity, 'city'),
                    state: this.str(identity, 'state'),
                    country: this.str(identity, 'country'),
                    school: this.str(identity, 'school'),
                    schoolLogoUrl: this.str(identity, 'schoolLogoUrl'),
                    profileImage: this.str(identity, 'profileImage'),
                    bannerImage: this.str(identity, 'bannerImage'),
                    aboutMe: this.str(identity, 'aboutMe'),
                  },
                }
              : {}),
            ...(awards?.length
              ? {
                  awards: (awards as Record<string, unknown>[]).map((a) => ({
                    title: this.str(a, 'title') ?? '',
                    category: this.str(a, 'category'),
                    sport: this.str(a, 'sport') ?? targetSport,
                    season: this.str(a, 'season'),
                    issuer: this.str(a, 'issuer'),
                  })),
                }
              : {}),
          };

          const delta = diffService.diff(
            userId,
            targetSport,
            source,
            previousState,
            extractedProfile as unknown as import('../scraping/distillers/distiller.types.js').DistilledProfile
          );

          if (!delta.isEmpty) {
            logger.info('[WriteCoreIdentity] Delta detected, firing sync trigger', {
              userId,
              sport: targetSport,
              totalChanges: delta.summary.totalChanges,
            });
            onDailySyncComplete(delta).catch((err) => {
              logger.warn('[WriteCoreIdentity] Trigger dispatch failed', {
                userId,
                error: err instanceof Error ? err.message : String(err),
              });
            });
          }
        } catch (err) {
          // Delta/trigger is non-critical — log and continue
          logger.warn('[WriteCoreIdentity] Delta computation failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

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
          message: `Wrote ${writtenSections.length} section(s) for "${targetSport}" from "${source}": ${writtenSections.join(', ')}.`,
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
      // ONLY overwrite if the user hasn't already provided this field
      if (val && val.length <= VALIDATION.MAX_NAME_LENGTH && !this.hasValue(userData[dst])) {
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

      if (heightVal && !existingMeasurables.some((m) => m['field'] === 'height')) {
        upsertMetric('height', 'Height', heightVal, '', 'physical');
        written.push('height');
      }
      if (weightVal && !existingMeasurables.some((m) => m['field'] === 'weight')) {
        upsertMetric('weight', 'Weight', weightVal, 'lbs', 'physical');
        written.push('weight');
      }

      if (written.includes('height') || written.includes('weight')) {
        payload['measurables'] = existingMeasurables;
      }
    }
    // aboutMe has a longer limit — write as draftAboutMe for human review
    const aboutMe = this.str(id, 'aboutMe');
    if (
      aboutMe &&
      aboutMe.length <= VALIDATION.MAX_ABOUT_ME_LENGTH &&
      !this.hasValue(userData['aboutMe']) &&
      !this.hasValue(userData['draftAboutMe'])
    ) {
      payload['draftAboutMe'] = aboutMe;
      if (!written.includes('draftAboutMe')) written.push('draftAboutMe');
    }

    const classOf = id['classOf'];
    if (
      typeof classOf === 'number' &&
      Number.isInteger(classOf) &&
      classOf >= VALIDATION.MIN_GRADUATION_YEAR &&
      classOf <= VALIDATION.MAX_GRADUATION_YEAR &&
      !this.hasValue(userData['classOf'])
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

    if (city && !this.hasValue(existingLoc['city'])) {
      loc['city'] = city;
      locUpdated = true;
    }
    if (state && !this.hasValue(existingLoc['state'])) {
      loc['state'] = state;
      locUpdated = true;
    }
    if (country && !this.hasValue(existingLoc['country'])) {
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
    const normalized = targetSport.toLowerCase().trim();
    for (let i = 0; i < existingSports.length; i++) {
      if (
        typeof existingSports[i]['sport'] === 'string' &&
        (existingSports[i]['sport'] as string).toLowerCase().trim() === normalized
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

  private mergeAwards(
    existing: Record<string, unknown>[],
    incoming: Record<string, unknown>[],
    defaultSport: string
  ): Record<string, unknown>[] {
    if (incoming.length > VALIDATION.MAX_AWARDS) return existing;
    const merged = [...existing];
    const keyOf = (a: Record<string, unknown>) => {
      const title = String(a['title'] ?? '')
        .toLowerCase()
        .trim();
      const sport = String(a['sport'] ?? defaultSport)
        .toLowerCase()
        .trim();
      const season = String(a['season'] ?? '')
        .toLowerCase()
        .trim();
      return `${title}::${sport}::${season}`;
    };
    const indexMap = new Map<string, number>();
    for (let i = 0; i < merged.length; i++) indexMap.set(keyOf(merged[i]), i);

    for (const entry of incoming) {
      const title = this.str(entry, 'title');
      if (!title) continue;
      const record: Record<string, unknown> = {
        title,
        sport: this.str(entry, 'sport') ?? defaultSport,
      };
      for (const f of ['category', 'season', 'issuer', 'date']) {
        const v = this.str(entry, f);
        if (v) record[f] = v;
      }
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
  ): Promise<void> {
    const teamId = this.str(teamRef ?? {}, 'teamId');
    const orgIdFromRef = this.str(teamRef ?? {}, 'organizationId');
    let organizationId = orgIdFromRef;

    if (teamId) {
      const teamDoc = await this.db.collection('Teams').doc(teamId).get();
      if (teamDoc.exists) {
        const data = teamDoc.data() ?? {};
        const teamCode = typeof data['teamCode'] === 'string' ? data['teamCode'] : undefined;
        const teamUnicode = typeof data['unicode'] === 'string' ? data['unicode'] : undefined;
        organizationId ||=
          typeof data['organizationId'] === 'string' ? data['organizationId'] : null;

        // Write-once: only set conference/division if not already populated on the Team doc
        const updateData: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
        const conf = this.str(teamInput, 'conference');
        if (conf && !this.hasValue(data['conference'])) updateData['conference'] = conf;
        const div = this.str(teamInput, 'division');
        if (div && !this.hasValue(data['division'])) updateData['division'] = div;
        if (galleryImages && galleryImages.length > 0) {
          updateData['galleryImages'] = FieldValue.arrayUnion(...galleryImages);
        }

        if (Object.keys(updateData).length > 1) {
          await this.db.collection('Teams').doc(teamId).update(updateData);
          await invalidateTeamCache(teamId, teamCode, teamUnicode);
        }

        await this.syncOrganizationMetadata(organizationId, teamInput);
        return;
      }
    }

    await this.syncOrganizationMetadata(organizationId, teamInput);
  }

  private async syncOrganizationMetadata(
    organizationId: string | null,
    teamInput: Record<string, unknown>
  ): Promise<void> {
    if (!organizationId) return;

    // Fetch existing org data so we can enforce write-once semantics
    const organizationService = createOrganizationService(this.db);
    const orgDoc = await this.db.collection('Organizations').doc(organizationId).get();
    const existing = orgDoc.exists ? (orgDoc.data() ?? {}) : {};
    const existingLocation =
      typeof existing['location'] === 'object' && existing['location'] !== null
        ? (existing['location'] as Record<string, unknown>)
        : {};

    // Write-once: only set branding fields if not already populated on the Organization doc
    const branding: Record<string, unknown> = {};
    for (const key of ['mascot', 'logoUrl', 'primaryColor', 'secondaryColor']) {
      const val = this.str(teamInput, key);
      if (val && !this.hasValue(existing[key])) branding[key] = val;
    }

    // Write-once: only set location fields if not already populated
    const city = this.str(teamInput, 'city');
    const state = this.str(teamInput, 'state');
    const country = this.str(teamInput, 'country');
    const location: Record<string, string> = {};
    if (city && !this.hasValue(existingLocation['city'])) location['city'] = city;
    if (state && !this.hasValue(existingLocation['state'])) location['state'] = state;
    if (country && !this.hasValue(existingLocation['country'])) location['country'] = country;

    const updateData: Record<string, unknown> = { ...branding };
    if (Object.keys(location).length > 0) updateData['location'] = location;
    if (Object.keys(updateData).length === 0) return;

    await organizationService.updateOrganization(organizationId, updateData, 'agent-x-scraper');
  }
}
