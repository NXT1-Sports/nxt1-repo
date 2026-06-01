/**
 * @fileoverview Auth Routes — Onboarding
 * @module @nxt1/backend/routes/auth
 *
 * Handles:
 * - POST /profile/onboarding         (bulk — completes onboarding)
 * - POST /profile/onboarding-step   (incremental — saves one step at a time)
 */

import { Router } from 'express';
import type { Request, Response, Router as RouterType } from 'express';
import { FieldValue, type FieldValue as FirestoreFieldValue } from 'firebase-admin/firestore';
import { asyncHandler, sendError } from '@nxt1/core/errors/express';
import { notFoundError } from '@nxt1/core/errors';
import { USER_SCHEMA_VERSION, normalizeName, isTeamRole } from '@nxt1/core';
import { normalizeConnectedPlatform } from '@nxt1/core/profile';
import type {
  UserRole,
  SportProfile,
  Location,
  UserContact,
  NotificationPreferences,
  PortableTimestamp,
  UserPreferences,
} from '@nxt1/core';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { BulkOnboardingDto, OnboardingStepDto } from '../../dtos/onboarding.dto.js';
import {
  provisionOnboardingPrograms,
  type OnboardingProgramSelection,
  type OnboardingCreateTeamProfile,
} from '../../services/platform/onboarding-program-provisioning.service.js';
import { createRosterEntryService } from '../../services/team/roster-entry.service.js';
import { enqueueLinkedAccountScrape } from '../../modules/agent/services/agent-scrape.service.js';
import { enqueueWelcomeGraphicIfReady } from '../../modules/agent/services/agent-welcome.service.js';
import { invalidateProfileCaches } from '../profile/shared.js';
import { logger } from '../../utils/logger.js';
import { sendLegacyOnboardingCompletionEmail } from '../../services/marketing/email/campaigns/legacy/legacy-onboarding-completion-email.service.js';
import { processCompletedSignupLifecycle } from '../../services/marketing/lifecycle/completed-signup-lifecycle.service.js';
import {
  mapUserTypeToRole,
  clearLegacyLocationFields,
  sanitizeSportsForStorage,
  createSportProfile,
  getPrimarySport,
  getLegacyCoachTitle,
  normalizePositions,
  type UserV2Document,
  type ConnectedSourceRecord,
} from './shared.js';
import { resolveBillingTarget } from '../../modules/billing/index.js';

const router: RouterType = Router();

const DEFAULT_ONBOARDING_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  push: true,
  email: true,
  marketing: true,
};

const DEFAULT_ONBOARDING_PREFERENCES: UserPreferences = {
  notifications: DEFAULT_ONBOARDING_NOTIFICATION_PREFERENCES,
  activityTracking: true,
  analyticsTracking: true,
  biometricLogin: false,
  theme: 'system',
};

type FirestoreTimestampWrite = PortableTimestamp | FirestoreFieldValue;

type OnboardingFirestoreUpdate = Record<string, unknown> & {
  updatedAt?: FirestoreTimestampWrite;
  lastLoginAt?: FirestoreTimestampWrite;
  onboardingCompletedAt?: FirestoreTimestampWrite;
  onboardingCompleted?: boolean;
  _schemaVersion?: number;
  preferences?: UserPreferences;
  firstName?: string;
  lastName?: string;
  contact?: UserContact;
  profileImgs?: string[];
  gender?: string;
  role?: UserRole;
  sports?: SportProfile[];
  activeSportIndex?: number;
  location?: Location;
  classOf?: number;
};

function hasCompleteOnboardingPreferences(
  preferences: Partial<UserPreferences> | undefined
): preferences is UserPreferences {
  return (
    preferences !== undefined &&
    preferences.notifications?.push !== undefined &&
    preferences.notifications?.email !== undefined &&
    preferences.notifications?.marketing !== undefined &&
    preferences.activityTracking !== undefined &&
    preferences.analyticsTracking !== undefined &&
    preferences.biometricLogin !== undefined &&
    preferences.theme !== undefined
  );
}

function hasSignupLifecycleMarker(
  user: UserV2Document | undefined,
  markerKey: 'completedSlackAlertSentAt' | 'welcomeEmailSentAt'
): boolean {
  if (!user) return false;

  if (user.lifecycle?.signup?.[markerKey]) {
    return true;
  }

  return Boolean((user as unknown as Record<string, unknown>)[`lifecycle.signup.${markerKey}`]);
}

function hasSignupNotionDashboardMarker(user: UserV2Document | undefined): boolean {
  if (!user) return false;

  const state = user.lifecycle?.signup?.notionDashboard;
  if (state?.createdAt || state?.pageId || state?.status === 'created') {
    return true;
  }

  const flatUser = user as unknown as Record<string, unknown>;
  return Boolean(
    flatUser['lifecycle.signup.notionDashboard.createdAt'] ||
    flatUser['lifecycle.signup.notionDashboard.pageId'] ||
    flatUser['lifecycle.signup.notionDashboard.status'] === 'created'
  );
}

// ============================================================================
// POST /auth/profile/onboarding  — Bulk save (marks onboarding complete)
// ============================================================================
router.post(
  '/profile/onboarding',
  validateBody(BulkOnboardingDto, { forbidNonWhitelisted: false }),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId, ...profileData } = req.body;

    logger.debug('[POST /profile/onboarding] Request:', { userId, keys: Object.keys(profileData) });

    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) {
      const error = notFoundError('user', userId);
      sendError(res, error);
      return;
    }

    const currentUser = userDoc.data() as UserV2Document | undefined;

    // ─── Legacy migration short-circuit ─────────────────────────────────────
    // When isLegacyOnboardingUpdate is true AND the user doc has a _legacyId,
    // only save linkSources and mark legacyOnboardingCompleted.
    // Do NOT overwrite existing profile fields.
    const isLegacyUpdate =
      profileData['isLegacyOnboardingUpdate'] === true && !!currentUser?._legacyId;
    if (isLegacyUpdate) {
      const legacyUpdateData: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        legacyOnboardingCompleted: true,
      };

      // Save link sources if provided
      const legacyLinkSources = profileData['linkSources'] as
        | { links?: Array<{ platform?: string; url?: string; connected?: boolean }> }
        | undefined;
      if (legacyLinkSources?.links && Array.isArray(legacyLinkSources.links)) {
        const existingConnected: Record<string, unknown>[] =
          (currentUser?.['connectedSources'] as Record<string, unknown>[] | undefined) ?? [];
        const connectedMap = new Map<string, Record<string, unknown>>();
        for (const s of existingConnected) {
          connectedMap.set(s['platform'] as string, s);
        }
        for (const link of legacyLinkSources.links) {
          if (link.connected && link.platform) {
            connectedMap.set(link.platform, {
              platform: link.platform,
              profileUrl: link.url ?? '',
              syncStatus: 'idle',
              displayOrder: connectedMap.size,
            });
          }
        }
        if (connectedMap.size > 0) {
          legacyUpdateData['connectedSources'] = Array.from(connectedMap.values());
        }
      }

      await db.collection('Users').doc(userId).update(legacyUpdateData);
      await invalidateProfileCaches(userId).catch((err) =>
        logger.warn('[POST /profile/onboarding] Legacy cache invalidation failed', { userId, err })
      );

      const updatedUser = await db.collection('Users').doc(userId).get();
      const updatedData = updatedUser.data() as UserV2Document | undefined;

      logger.info('[POST /profile/onboarding] Legacy update success:', {
        userId,
        legacyOnboardingCompleted: true,
      });

      const legacyRecipientEmail =
        updatedData?.contact?.email?.trim().toLowerCase() ||
        updatedData?.email?.trim().toLowerCase() ||
        currentUser?.contact?.email?.trim().toLowerCase() ||
        currentUser?.email?.trim().toLowerCase() ||
        undefined;

      const legacyRecipientFirstName =
        updatedData?.firstName?.trim() || currentUser?.firstName?.trim() || undefined;

      void sendLegacyOnboardingCompletionEmail({
        userId,
        email: legacyRecipientEmail,
        firstName: legacyRecipientFirstName,
        environment: req.isStaging ? 'staging' : 'production',
      })
        .then((result) => {
          logger.info('[POST /profile/onboarding] Legacy migration email processed', {
            userId,
            result,
          });
        })
        .catch((err) => {
          logger.error('[POST /profile/onboarding] Legacy migration email dispatch failed', {
            userId,
            error: err instanceof Error ? err.message : String(err),
          });
        });

      res.json({ success: true, user: updatedData ?? {} });
      return;
    }
    // ─── End legacy short-circuit ────────────────────────────────────────────

    const updateData: OnboardingFirestoreUpdate = {
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
      _schemaVersion: USER_SCHEMA_VERSION,
      onboardingCompleted: true,
      onboardingCompletedAt: FieldValue.serverTimestamp(),
    };

    // Preferences — canonical defaults, backfilled without overriding existing opt-outs
    const currentPreferences = currentUser?.preferences as Partial<UserPreferences> | undefined;
    if (!hasCompleteOnboardingPreferences(currentPreferences)) {
      updateData.preferences = {
        ...DEFAULT_ONBOARDING_PREFERENCES,
        ...(currentPreferences ?? {}),
        notifications: {
          ...DEFAULT_ONBOARDING_NOTIFICATION_PREFERENCES,
          ...(currentPreferences?.notifications ?? {}),
        },
      };
    }

    // Name
    const firstName = normalizeName((profileData['firstName'] as string) || '');
    const lastName = normalizeName((profileData['lastName'] as string) || '');
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    const displayName = [firstName, lastName].filter(Boolean).join(' ');
    if (displayName) (updateData as Record<string, unknown>)['displayName'] = displayName;

    // Contact
    const incomingContact = profileData['contact'] as UserContact | undefined;
    const contactEmail =
      incomingContact?.email?.trim().toLowerCase() ||
      (profileData['contactEmail'] as string | undefined)?.trim().toLowerCase() ||
      (profileData['email'] as string | undefined)?.trim().toLowerCase() ||
      '';
    const contactPhone =
      incomingContact?.phone?.trim() ||
      (profileData['phoneNumber'] as string | undefined)?.trim() ||
      '';
    const mergedContactEmail =
      contactEmail ||
      currentUser?.contact?.email?.trim().toLowerCase() ||
      currentUser?.email?.trim().toLowerCase() ||
      '';
    const mergedContactPhone = contactPhone || currentUser?.contact?.phone?.trim() || undefined;
    if (mergedContactEmail || mergedContactPhone) {
      updateData.contact = {
        email: mergedContactEmail,
        ...(mergedContactPhone ? { phone: mergedContactPhone } : {}),
      };
    }

    // Profile media / gender
    if (profileData['profileImgs']) updateData.profileImgs = profileData['profileImgs'] as string[];
    if (profileData['gender']) updateData.gender = profileData['gender'] as string;

    // Role
    if (profileData['userType']) {
      updateData.role = mapUserTypeToRole(profileData['userType'] as string);
    }

    const resolvedOnboardingRole =
      (updateData.role as string | undefined) ?? (currentUser?.role as string | undefined);
    const isTeamRoleOnboard = isTeamRole(resolvedOnboardingRole);
    const incomingCoachTitle =
      (typeof profileData['coachTitle'] === 'string' && profileData['coachTitle'].trim().length > 0
        ? profileData['coachTitle'].trim()
        : undefined) ?? getLegacyCoachTitle(currentUser);

    // Sports array
    const sports: SportProfile[] = [];

    if (Array.isArray(profileData['sports']) && profileData['sports'].length > 0) {
      const sportsData = profileData['sports'] as Array<{
        sport: string;
        isPrimary?: boolean;
        positions?: string[];
        team?: {
          name?: string;
          type?: string;
          city?: string;
          state?: string;
          teamId?: string;
          organizationId?: string;
          title?: string;
        };
      }>;

      sportsData.forEach((sportData, index) => {
        const sportProfile = createSportProfile(sportData.sport, index, {
          positions: isTeamRoleOnboard ? undefined : sportData.positions,
          teamName: sportData.team?.name,
          title: sportData.team?.title ?? incomingCoachTitle,
          teamType: sportData.team?.type,
          city: sportData.team?.city,
          state: sportData.team?.state,
          teamId: sportData.team?.teamId,
          organizationId: sportData.team?.organizationId,
        });
        sports.push(sportProfile);
      });
    } else if (profileData['sport']) {
      const primarySport = createSportProfile(profileData['sport'] as string, 0, {
        positions: isTeamRoleOnboard
          ? undefined
          : (profileData['positions'] as string[] | undefined),
        teamName: profileData['highSchool'] as string | undefined,
        title: incomingCoachTitle,
        teamType: profileData['highSchoolSuffix'] as string | undefined,
        city: profileData['city'] as string | undefined,
        state: profileData['state'] as string | undefined,
      });
      sports.push(primarySport);

      if (profileData['secondarySport']) {
        sports.push(createSportProfile(profileData['secondarySport'] as string, 1));
      }
      if (profileData['tertiarySport']) {
        sports.push(createSportProfile(profileData['tertiarySport'] as string, 2));
      }
    } else if (Array.isArray(currentUser?.sports) && currentUser.sports.length > 0) {
      const existingSports = JSON.parse(JSON.stringify(currentUser.sports)) as SportProfile[];
      if (isTeamRoleOnboard) {
        existingSports.forEach((sport) => {
          delete sport.positions;
        });
      }
      sports.push(...existingSports);
    }

    if (sports.length > 0) {
      updateData.sports = sports;
      updateData.activeSportIndex = 0;
    }

    // Location
    if (
      profileData['city'] ||
      profileData['state'] ||
      profileData['address'] ||
      profileData['zipCode']
    ) {
      updateData.location = {
        address: (profileData['address'] as string) || '',
        city: (profileData['city'] as string) || '',
        state: (profileData['state'] as string) || '',
        zipCode: (profileData['zipCode'] as string) || '',
        country: (profileData['country'] as string) || 'USA',
      };
      clearLegacyLocationFields(updateData as Record<string, unknown>);
    }

    // Class year (Athletes only)
    if (profileData['classOf'] && resolvedOnboardingRole === 'athlete') {
      updateData.classOf = Number(profileData['classOf']);
    }

    // Remove legacy coachTitle for coach/director roles
    const isCoachRole = resolvedOnboardingRole === 'coach' || resolvedOnboardingRole === 'director';
    if (isCoachRole) {
      (updateData as Record<string, unknown>)['coachTitle'] = FieldValue.delete();
    }

    // Resolve role for provisioning
    const role = mapUserTypeToRole(
      (profileData['userType'] as string) || (currentUser?.role as string) || 'athlete'
    );

    // ---- Program / Team / Roster provisioning ----
    const provisionResult = await provisionOnboardingPrograms({
      db,
      userId,
      role: role as UserRole,
      sports,
      currentUser: {
        firstName: currentUser?.firstName,
        lastName: currentUser?.lastName,
        email:
          updateData.contact?.email?.trim().toLowerCase() ||
          currentUser?.contact?.email?.trim().toLowerCase() ||
          currentUser?.email?.trim().toLowerCase(),
        contact: {
          phone: updateData.contact?.phone?.trim() || currentUser?.contact?.phone?.trim(),
        },
        profileImgs: updateData.profileImgs ?? currentUser?.profileImgs,
      },
      updateData: {
        firstName: updateData.firstName,
        lastName: updateData.lastName,
        profileImgs: updateData.profileImgs,
        coachTitle: incomingCoachTitle,
        athlete: updateData.classOf ? { classOf: updateData.classOf } : undefined,
        location: updateData.location
          ? { city: updateData.location.city, state: updateData.location.state }
          : undefined,
      },
      teamSelection: profileData['teamSelection'] as
        | { teams?: OnboardingProgramSelection[] }
        | undefined,
      createTeamProfile: profileData['createTeamProfile'] as
        | OnboardingCreateTeamProfile
        | undefined,
    });

    const { teamIds, createdTeamIds, sportTeamMap } = provisionResult;

    // Backfill sports[].team with relational IDs
    if (sportTeamMap.size > 0 && Array.isArray(updateData.sports)) {
      for (const sport of updateData.sports) {
        const sportKey = (sport.sport ?? '').toLowerCase();
        const resolved = sportTeamMap.get(sportKey);
        if (resolved && sport.team) {
          sport.team.organizationId = resolved.organizationId;
          sport.team.teamId = resolved.teamId;
          if (resolved.orgName) {
            sport.team.name = resolved.orgName;
          }
        }
      }
      logger.info('[POST /profile/onboarding] Backfilled sports[].team with relational IDs', {
        sportCount: sportTeamMap.size,
        sports: [...sportTeamMap.keys()],
      });
    }

    // Invite flow: resolve missing organizationId from teamId
    if (Array.isArray(updateData.sports)) {
      for (const sport of updateData.sports) {
        if (sport.team?.teamId && !sport.team?.organizationId) {
          try {
            const teamDoc = await db.collection('Teams').doc(sport.team.teamId).get();
            if (teamDoc.exists) {
              const orgId = teamDoc.data()?.['organizationId'] as string | undefined;
              const orgName = teamDoc.data()?.['teamName'] as string | undefined;
              if (orgId) {
                sport.team.organizationId = orgId;
                logger.info(
                  '[POST /profile/onboarding] Backfilled organizationId from teamId (invite flow)',
                  { teamId: sport.team.teamId, organizationId: orgId }
                );
              }
              if (orgName && !sport.team.name) {
                sport.team.name = orgName;
              }
            }
          } catch (err) {
            logger.warn('[POST /profile/onboarding] Failed to resolve organizationId from teamId', {
              teamId: sport.team.teamId,
              error: err,
            });
          }
        }
      }
    }

    // Build connectedSources from linkSources
    const teamConnectedSources: ConnectedSourceRecord[] = [];
    const linkSources = profileData['linkSources'] as
      | {
          links?: Array<{
            platform?: string;
            connected?: boolean;
            connectionType?: string;
            username?: string;
            url?: string;
            scopeType?: string;
            scopeId?: string;
          }>;
        }
      | undefined;

    if (linkSources?.links && Array.isArray(linkSources.links)) {
      const defaultTeamScopeId = getPrimarySport(
        Array.isArray(updateData.sports)
          ? (updateData.sports as SportProfile[])
          : currentUser?.sports
      );
      const existingConnected: ConnectedSourceRecord[] = Array.isArray(
        currentUser?.connectedSources
      )
        ? currentUser.connectedSources
        : [];
      const connectedMap = new Map<string, ConnectedSourceRecord>();
      for (const cs of existingConnected) {
        const normalizedPlatform = normalizeConnectedPlatform(cs.platform);
        const key = cs.scopeId ? `${normalizedPlatform}::${cs.scopeId}` : normalizedPlatform;
        connectedMap.set(key, cs);
      }

      let displayOrder = 0;
      for (const link of linkSources.links) {
        if (link.connected && link.platform) {
          const platform = normalizeConnectedPlatform(link.platform);
          const isPrivilegedRole = role === 'coach' || role === 'director';
          const rawScope = link.scopeType ?? 'global';
          const rawScopeId = link.scopeId;
          const scope =
            isPrivilegedRole && rawScope === 'global' && defaultTeamScopeId ? 'sport' : rawScope;
          const scopeId =
            isPrivilegedRole && !rawScopeId && scope === 'sport' ? defaultTeamScopeId : rawScopeId;
          const key = scopeId ? `${platform}::${scopeId}` : platform;
          const value = link.url ?? link.username ?? '';
          const url = value.startsWith('http')
            ? value
            : value
              ? `https://${platform}.com/${value}`
              : '';

          const sourceInfo: ConnectedSourceRecord = {
            platform,
            profileUrl: url,
            syncStatus: 'idle',
            displayOrder: connectedMap.get(key)?.displayOrder ?? displayOrder++,
            ...(scope !== 'global' && { scopeType: scope }),
            ...(scopeId && { scopeId }),
          };

          if (teamIds.length > 0 && isPrivilegedRole) {
            const addedByName = [firstName, lastName].filter(Boolean).join(' ') || 'Staff';
            teamConnectedSources.push({
              ...sourceInfo,
              addedBy: addedByName,
              addedById: userId,
            });
            connectedMap.delete(key);
          } else {
            connectedMap.set(key, sourceInfo);
          }
        }
      }
      if (connectedMap.size > 0) {
        (updateData as Record<string, unknown>)['connectedSources'] = Array.from(
          connectedMap.values()
        );
      }
    }

    // Write team connected sources to Team docs
    if (teamIds.length > 0 && teamConnectedSources.length > 0) {
      try {
        await Promise.all(
          teamIds.map(async (teamId) => {
            if (!createdTeamIds.includes(teamId)) {
              const teamDoc = await db.collection('Teams').doc(teamId).get();
              const existing: ConnectedSourceRecord[] =
                (teamDoc.data()?.['connectedSources'] as ConnectedSourceRecord[] | undefined) ?? [];
              const merged = new Map<string, ConnectedSourceRecord>();
              for (const cs of existing) {
                const normalizedPlatform = normalizeConnectedPlatform(cs.platform);
                const key = cs.scopeId
                  ? `${normalizedPlatform}::${cs.scopeId}`
                  : normalizedPlatform;
                merged.set(key, cs);
              }
              for (const cs of teamConnectedSources) {
                const normalizedPlatform = normalizeConnectedPlatform(cs.platform);
                const key = cs.scopeId
                  ? `${normalizedPlatform}::${cs.scopeId}`
                  : normalizedPlatform;
                if (!merged.has(key)) merged.set(key, cs);
              }
              return db
                .collection('Teams')
                .doc(teamId)
                .update({ connectedSources: Array.from(merged.values()) });
            }
            return db
              .collection('Teams')
              .doc(teamId)
              .update({ connectedSources: teamConnectedSources });
          })
        );
      } catch (err) {
        logger.error(
          '[POST /profile/onboarding] Failed to update Team linked sources:',
          err as Record<string, unknown>
        );
      }
    }

    // Persist user document
    try {
      if (Array.isArray(updateData.sports)) {
        updateData.sports = sanitizeSportsForStorage(updateData.sports);
      }
      await db.collection('Users').doc(userId).update(updateData);
      logger.debug('[POST /profile/onboarding] Firestore update successful');
    } catch (updateError) {
      const err = updateError instanceof Error ? updateError : new Error(String(updateError));
      logger.error('[POST /profile/onboarding] Firestore update FAILED:', {
        error: err.message,
        stack: err.stack,
      });
      throw updateError;
    }

    // Invalidate Redis cache
    await invalidateProfileCaches(userId).catch((err) =>
      logger.warn('[POST /profile/onboarding] Cache invalidation failed', { userId, err })
    );

    // Initialize billing target for org admins (coaches/directors) before
    // any onboarding-triggered jobs are enqueued. This avoids a race where
    // first-run usage charges can hit personal billing before org routing lands.
    if (role === 'coach' || role === 'director') {
      try {
        await resolveBillingTarget(db, userId);
      } catch (err) {
        logger.warn('[POST /profile/onboarding] Billing target initialization failed', {
          userId,
          role,
          err,
        });
      }
    }

    // Fetch updated user for response
    let userData: UserV2Document | undefined;
    try {
      const updatedUser = await db.collection('Users').doc(userId).get();
      userData = updatedUser.data() as UserV2Document | undefined;
      if (userData) {
        const rosterEntryService = createRosterEntryService(db);
        await rosterEntryService.syncUserProfileToRosterEntries(
          userId,
          userData as unknown as Record<string, unknown>
        );
      }
    } catch (fetchError) {
      const err = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      logger.error('[POST /profile/onboarding] Fetch user FAILED:', {
        error: err.message,
        stack: err.stack,
      });
      throw fetchError;
    }

    logger.info('[POST /profile/onboarding] Success:', { userId, onboardingCompleted: true });

    const primarySportName = getPrimarySport(userData?.sports);
    const agentEnv = req.isStaging ? 'staging' : 'production';

    // Welcome graphic (idempotent — deduped by welcomeGraphicQueued flag)
    void enqueueWelcomeGraphicIfReady(db, { userId }, agentEnv).catch((err) =>
      logger.error('[Auth] Failed to evaluate welcome graphic at onboarding', {
        userId,
        error: err,
      })
    );

    // Linked account scrape
    let scrapeJobId: string | undefined;
    let scrapeJobIds: readonly string[] | undefined;
    let scrapeThreadId: string | undefined;
    let scrapeOperations:
      | readonly {
          readonly operationId: string;
          readonly threadId?: string;
          readonly platforms: readonly string[];
        }[]
      | undefined;
    const firstTeamEntry = sportTeamMap.size > 0 ? sportTeamMap.values().next().value : undefined;
    const resolvedTeamId = firstTeamEntry?.teamId as string | undefined;
    const resolvedOrgId = firstTeamEntry?.organizationId as string | undefined;
    const marketingPreferences = userData?.preferences as
      | {
          notifications?: {
            marketing?: boolean;
          };
        }
      | undefined;

    const signupLifecycleResult = await processCompletedSignupLifecycle({
      db,
      userId,
      environment: req.isStaging ? 'staging' : 'production',
      role: (userData?.role as UserRole | undefined) ?? (role as UserRole),
      firstName: userData?.firstName ?? updateData.firstName,
      lastName: userData?.lastName ?? updateData.lastName,
      displayName: (userData as Record<string, unknown> | undefined)?.['displayName'] as
        | string
        | undefined,
      email:
        userData?.contact?.email?.trim().toLowerCase() ||
        userData?.email?.trim().toLowerCase() ||
        mergedContactEmail ||
        undefined,
      primarySport: primarySportName,
      teamName:
        (firstTeamEntry?.orgName as string | undefined) ??
        userData?.sports?.find((sport) => sport.team?.name)?.team?.name,
      teamId: resolvedTeamId,
      organizationId: resolvedOrgId,
      city: userData?.location?.city ?? userData?.city,
      state: userData?.location?.state ?? userData?.state,
      referralId: userData?.referralId,
      teamCode: userData?.teamCode?.teamCode,
      teamCodeName: userData?.teamCode?.teamName,
      marketingEnabled: marketingPreferences?.notifications?.marketing !== false,
      slackAlertAlreadySent: hasSignupLifecycleMarker(userData, 'completedSlackAlertSentAt'),
      welcomeEmailAlreadySent: hasSignupLifecycleMarker(userData, 'welcomeEmailSentAt'),
      notionDashboardAlreadySynced: hasSignupNotionDashboardMarker(userData),
    });

    logger.info('[POST /profile/onboarding] Signup lifecycle processed', {
      userId,
      signupLifecycleResult,
    });

    const userConnectedSources =
      (userData?.connectedSources as ConnectedSourceRecord[] | undefined) ?? [];
    const allConnectedSources = [...userConnectedSources, ...teamConnectedSources];
    if (allConnectedSources.length > 0) {
      try {
        const scrapeResult = await enqueueLinkedAccountScrape(
          db,
          {
            userId,
            role: (userData?.role as UserRole) ?? 'athlete',
            sport: primarySportName,
            linkedAccounts: allConnectedSources.map((cs) => ({
              platform: cs.platform,
              profileUrl: cs.profileUrl,
            })),
            teamId: resolvedTeamId,
            organizationId: resolvedOrgId,
          },
          agentEnv
        );
        const scrapeOperationIds = scrapeResult?.operationIds ?? [];
        scrapeJobId = scrapeOperationIds[0];
        scrapeJobIds = scrapeOperationIds.length > 0 ? scrapeOperationIds : undefined;
        scrapeThreadId = scrapeResult?.threadId;
        scrapeOperations =
          scrapeResult?.operations && scrapeResult.operations.length > 0
            ? scrapeResult.operations
            : undefined;
      } catch (err) {
        logger.error('[Auth] Failed to enqueue linked account scrape', { userId, error: err });
      }
    }

    res.json({
      success: true,
      user: {
        id: userId,
        firstName: userData?.firstName,
        lastName: userData?.lastName,
        role: userData?.role,
        onboardingCompleted: true,
        completeSignUp: true,
      },
      redirectPath: '/home',
      ...(scrapeJobIds && scrapeJobIds.length > 0 && { scrapeJobIds }),
      ...(scrapeJobId && { scrapeJobId }),
      ...(scrapeThreadId && { scrapeThreadId }),
      ...(scrapeOperations && { scrapeOperations }),
    });
  })
);

// ============================================================================
// POST /auth/profile/onboarding-step  — Incremental step save
// ============================================================================
router.post(
  '/profile/onboarding-step',
  validateBody(OnboardingStepDto),
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { db } = req.firebase!;
    const { userId, stepId, stepData } = req.body;

    const userDoc = await db.collection('Users').doc(userId).get();
    if (!userDoc.exists) {
      const error = notFoundError('user', userId);
      sendError(res, error);
      return;
    }

    const currentUser = userDoc.data() as UserV2Document | undefined;

    const updateData: OnboardingFirestoreUpdate = {
      updatedAt: FieldValue.serverTimestamp(),
      _schemaVersion: USER_SCHEMA_VERSION,
      [`onboardingProgress.${stepId}`]: {
        completed: true,
        completedAt: FieldValue.serverTimestamp(),
      },
    };

    switch (stepId) {
      case 'role': {
        if (stepData['userType']) {
          updateData.role = mapUserTypeToRole(stepData['userType'] as string);
        }
        break;
      }

      case 'profile': {
        if (stepData['firstName']) updateData.firstName = (stepData['firstName'] as string).trim();
        if (stepData['lastName']) updateData.lastName = (stepData['lastName'] as string).trim();
        if (stepData['profileImgs']) updateData.profileImgs = stepData['profileImgs'] as string[];
        if (stepData['gender']) updateData.gender = stepData['gender'] as string;
        break;
      }

      case 'school': {
        const location: Location = {
          city: (stepData['city'] as string)?.trim() || currentUser?.location?.city || '',
          state: (stepData['state'] as string)?.trim() || currentUser?.location?.state || '',
          country: 'USA',
        };
        updateData.location = location;
        clearLegacyLocationFields(updateData);

        const schoolRole = currentUser?.role as string | undefined;
        const schoolIsTeamRole = isTeamRole(schoolRole);
        if (!schoolIsTeamRole && currentUser?.sports && currentUser.sports.length > 0) {
          const updatedSports = [...currentUser.sports];
          const currentTeam = updatedSports[0]?.team;
          updatedSports[0] = {
            ...updatedSports[0],
            team: {
              ...currentTeam,
              name: (stepData['highSchool'] as string)?.trim() || currentTeam?.name,
              type:
                ((stepData['highSchoolSuffix'] as string)?.toLowerCase() as
                  | 'high-school'
                  | 'club') ||
                currentTeam?.type ||
                'high-school',
            },
          };
          updateData.sports = updatedSports;
        }

        if (stepData['classOf'] && !isNaN(Number(stepData['classOf']))) {
          updateData.classOf = Number(stepData['classOf']);
        }
        break;
      }

      case 'organization': {
        const currentRole = currentUser?.role as string | undefined;
        const isTeamRoleUser = isTeamRole(currentRole);
        const organizationName = (stepData['organization'] as string)?.trim();
        const coachTitle = (stepData['coachTitle'] as string)?.trim() || undefined;

        if (isTeamRoleUser) {
          const existingSports = Array.isArray(currentUser?.sports)
            ? (JSON.parse(JSON.stringify(currentUser.sports)) as SportProfile[])
            : [];
          const fallbackPrimarySport = getPrimarySport(currentUser?.sports);
          const updatedSports =
            existingSports.length > 0
              ? existingSports
              : fallbackPrimarySport
                ? [
                    createSportProfile(fallbackPrimarySport, 0, {
                      teamName: organizationName,
                      title: coachTitle,
                      city: (stepData['city'] as string)?.trim() || currentUser?.location?.city,
                      state: (stepData['state'] as string)?.trim() || currentUser?.location?.state,
                    }),
                  ]
                : [];

          if (updatedSports.length > 0) {
            updatedSports.forEach((sport) => {
              delete sport.positions;
              if (!sport.team) {
                sport.team = {
                  type: 'organization',
                  name: organizationName || '',
                  ...(coachTitle ? { title: coachTitle } : {}),
                };
              }
              if (organizationName !== undefined) sport.team.name = organizationName;
              if (coachTitle !== undefined) sport.team.title = coachTitle;
            });
            updateData.sports = updatedSports;
            updateData.activeSportIndex = 0;
          }
          (updateData as Record<string, unknown>)['coachTitle'] = FieldValue.delete();
        }

        if (stepData['city'] || stepData['state']) {
          updateData.location = {
            city: (stepData['city'] as string)?.trim() || currentUser?.location?.city || '',
            state: (stepData['state'] as string)?.trim() || currentUser?.location?.state || '',
            country: 'USA',
          };
          clearLegacyLocationFields(updateData);
        }
        break;
      }

      case 'sport': {
        const sports: SportProfile[] = [];
        const currentSports: SportProfile[] = Array.isArray(currentUser?.sports)
          ? currentUser!.sports
          : [];
        const userRole = currentUser?.role as string | undefined;
        const isTeamRoleUser = isTeamRole(userRole);
        const teamRoleTitle =
          currentUser?.sports?.find((sport) => sport.team?.title)?.team?.title ??
          getLegacyCoachTitle(currentUser);

        if (Array.isArray(stepData['sports']) && stepData['sports'].length > 0) {
          const sportsData = stepData['sports'] as Array<{
            sport: string;
            isPrimary?: boolean;
            positions?: string[];
            team?: {
              name?: string;
              type?: string;
              city?: string;
              state?: string;
              teamId?: string;
              organizationId?: string;
            };
          }>;

          sportsData.forEach((sportData, index) => {
            const existingSport = currentSports.find((s) => s.order === index);
            sports.push(
              createSportProfile(sportData.sport, index, {
                positions: isTeamRoleUser
                  ? undefined
                  : (sportData.positions ?? existingSport?.positions),
                teamName:
                  sportData.team?.name ?? existingSport?.team?.name ?? currentUser?.highSchool,
                title: existingSport?.team?.title ?? teamRoleTitle,
                teamType: sportData.team?.type ?? existingSport?.team?.type,
                city: sportData.team?.city ?? currentUser?.location?.city ?? currentUser?.city,
                state: sportData.team?.state ?? currentUser?.location?.state ?? currentUser?.state,
                teamId: sportData.team?.teamId ?? existingSport?.team?.teamId,
                organizationId:
                  sportData.team?.organizationId ?? existingSport?.team?.organizationId,
              })
            );
          });
        } else {
          const primarySportName = (stepData['primarySport'] as string)?.trim();
          const secondarySportName = (stepData['secondarySport'] as string)?.trim();

          if (primarySportName) {
            const existingPrimary = currentSports.find((s) => s.order === 0);
            sports.push(
              createSportProfile(primarySportName, 0, {
                positions: isTeamRoleUser ? undefined : existingPrimary?.positions,
                teamName: existingPrimary?.team?.name ?? currentUser?.highSchool,
                title: existingPrimary?.team?.title ?? teamRoleTitle,
                teamType: existingPrimary?.team?.type,
                city: currentUser?.location?.city ?? currentUser?.city,
                state: currentUser?.location?.state ?? currentUser?.state,
                teamId: existingPrimary?.team?.teamId,
                organizationId: existingPrimary?.team?.organizationId,
              })
            );
          }

          if (secondarySportName) {
            const existingSecondary = currentSports.find((s) => s.order === 1);
            sports.push(
              createSportProfile(secondarySportName, 1, {
                positions: isTeamRoleUser ? undefined : existingSecondary?.positions,
                title: existingSecondary?.team?.title ?? teamRoleTitle,
                teamId: existingSecondary?.team?.teamId,
                organizationId: existingSecondary?.team?.organizationId,
              })
            );
          }
        }

        if (sports.length > 0) {
          if (isTeamRoleUser) {
            sports.forEach((sport) => {
              if (!sport.team) sport.team = { type: 'organization', name: '' };
              if (teamRoleTitle) sport.team.title = teamRoleTitle;
            });
            (updateData as Record<string, unknown>)['coachTitle'] = FieldValue.delete();
          }
          updateData.sports = sports;
          updateData.activeSportIndex = 0;
        }
        break;
      }

      case 'positions': {
        const rawPositions = Array.isArray(stepData['positions'])
          ? (stepData['positions'] as string[]).slice(0, 10)
          : [];
        const sportName = getPrimarySport(currentUser?.sports) ?? '';
        const positions = normalizePositions(rawPositions, sportName);

        const posUserRole = currentUser?.role as string | undefined;
        const posIsTeamRole = isTeamRole(posUserRole);
        if (!posIsTeamRole) {
          if (currentUser?.sports && currentUser.sports.length > 0) {
            const updatedSports = [...currentUser.sports];
            updatedSports[0] = { ...updatedSports[0], positions };
            updateData.sports = updatedSports;
          } else if (positions.length > 0) {
            const sportName = getPrimarySport(currentUser?.sports) ?? 'unknown';
            updateData.sports = [createSportProfile(sportName, 0, { positions })];
            updateData.activeSportIndex = 0;
          }
        }
        break;
      }

      case 'contact': {
        const contact: UserContact = {
          email:
            (stepData['contactEmail'] as string)?.toLowerCase() ||
            currentUser?.contact?.email ||
            currentUser?.email ||
            '',
          phone: (stepData['phoneNumber'] as string)?.trim() || currentUser?.contact?.phone,
        };
        updateData.contact = contact;

        const existingConnected: ConnectedSourceRecord[] = Array.isArray(
          currentUser?.connectedSources
        )
          ? currentUser.connectedSources
          : [];

        const onboardingLinks: Array<{ platform: string; value: string | undefined }> = [
          { platform: 'instagram', value: (stepData['instagram'] as string)?.trim() },
          { platform: 'twitter', value: (stepData['twitter'] as string)?.trim() },
          { platform: 'tiktok', value: (stepData['tiktok'] as string)?.trim() },
          { platform: 'hudl', value: (stepData['hudlAccountLink'] as string)?.trim() },
          { platform: 'youtube', value: (stepData['youtubeAccountLink'] as string)?.trim() },
        ];

        const connectedMap = new Map<string, ConnectedSourceRecord>();
        for (const cs of existingConnected) {
          connectedMap.set(normalizeConnectedPlatform(cs.platform), cs);
        }

        let displayOrder = 0;
        for (const { platform, value } of onboardingLinks) {
          if (value) {
            const normalizedPlatform = normalizeConnectedPlatform(platform);
            const url = value.startsWith('http')
              ? value
              : `https://${normalizedPlatform}.com/${value}`;
            const existing = connectedMap.get(normalizedPlatform);
            connectedMap.set(normalizedPlatform, {
              platform: normalizedPlatform,
              profileUrl: url,
              syncStatus: 'idle',
              displayOrder: existing?.displayOrder ?? displayOrder++,
            });
          }
        }
        if (connectedMap.size > 0) {
          (updateData as Record<string, unknown>)['connectedSources'] = Array.from(
            connectedMap.values()
          );
        }
        break;
      }

      case 'referral-source': {
        updateData['showedHearAbout'] = true;
        const referralSource = (stepData['source'] as string)?.trim();
        if (referralSource) {
          updateData['referralSource'] = referralSource;
          const referralDetails = (stepData['details'] as string)?.trim();
          const referralClubName = (stepData['clubName'] as string)?.trim();
          const referralOtherSpecify = (stepData['otherSpecify'] as string)?.trim();
          if (referralDetails) updateData['referralDetails'] = referralDetails;
          if (referralClubName) updateData['referralClubName'] = referralClubName;
          if (referralOtherSpecify) updateData['referralOtherSpecify'] = referralOtherSpecify;
        }
        break;
      }

      case 'link-sources': {
        const existingConnected: ConnectedSourceRecord[] = Array.isArray(
          currentUser?.connectedSources
        )
          ? currentUser.connectedSources
          : [];

        const links = Array.isArray(stepData['links'])
          ? (stepData['links'] as Array<{
              platform?: string;
              connected?: boolean;
              username?: string;
              url?: string;
              connectionType?: string;
              scopeType?: string;
              scopeId?: string;
            }>)
          : [];

        const linkRole = currentUser?.role as string | undefined;
        const isTeamRoleUser = isTeamRole(linkRole);

        const userTeamIds: string[] = isTeamRoleUser
          ? ((currentUser?.sports as SportProfile[]) ?? [])
              .map((s) => s.team?.teamId)
              .filter((id): id is string => !!id)
          : [];

        const connectedMap = new Map<string, ConnectedSourceRecord>();
        for (const cs of existingConnected) {
          const normalizedPlatform = normalizeConnectedPlatform(cs.platform);
          const k = cs.scopeId ? `${normalizedPlatform}::${cs.scopeId}` : normalizedPlatform;
          connectedMap.set(k, cs);
        }

        const teamConnectedSourcesStep: ConnectedSourceRecord[] = [];
        const defaultTeamScopeId = getPrimarySport(currentUser?.sports);
        let displayOrder = 0;
        for (const link of links) {
          if (link.connected && link.platform) {
            const platform = normalizeConnectedPlatform(link.platform);
            const rawScope = link.scopeType ?? 'global';
            const scopeType =
              isTeamRoleUser && rawScope === 'global' && defaultTeamScopeId ? 'sport' : rawScope;
            const scopeId =
              isTeamRoleUser && !link.scopeId && scopeType === 'sport'
                ? defaultTeamScopeId
                : link.scopeId;
            const key = scopeId ? `${platform}::${scopeId}` : platform;
            const value = link.url ?? link.username ?? '';
            const url = value.startsWith('http')
              ? value
              : value
                ? `https://${platform}.com/${value}`
                : '';

            const existing = connectedMap.get(key);
            const sourceInfo: ConnectedSourceRecord = {
              platform,
              profileUrl: url,
              syncStatus: 'idle',
              displayOrder: existing?.displayOrder ?? displayOrder++,
              ...(scopeType && scopeType !== 'global' ? { scopeType, scopeId } : {}),
            };

            if (isTeamRoleUser && userTeamIds.length > 0) {
              const addedByName =
                [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') ||
                'Staff';
              teamConnectedSourcesStep.push({
                ...sourceInfo,
                addedBy: addedByName,
                addedById: userId,
              });
              connectedMap.delete(key);
            } else {
              connectedMap.set(key, sourceInfo);
            }
          }
        }

        if (userTeamIds.length > 0 && teamConnectedSourcesStep.length > 0) {
          try {
            await Promise.all(
              userTeamIds.map(async (teamId) => {
                const teamDoc = await db.collection('Teams').doc(teamId).get();
                const existingTeamSources: ConnectedSourceRecord[] =
                  (teamDoc.data()?.['connectedSources'] as ConnectedSourceRecord[] | undefined) ??
                  [];
                const merged = new Map<string, ConnectedSourceRecord>();
                for (const cs of existingTeamSources) {
                  const normalizedPlatform = normalizeConnectedPlatform(cs.platform);
                  const k = cs.scopeId
                    ? `${normalizedPlatform}::${cs.scopeId}`
                    : normalizedPlatform;
                  merged.set(k, cs);
                }
                for (const cs of teamConnectedSourcesStep) {
                  const normalizedPlatform = normalizeConnectedPlatform(cs.platform);
                  const k = cs.scopeId
                    ? `${normalizedPlatform}::${cs.scopeId}`
                    : normalizedPlatform;
                  merged.set(k, cs);
                }
                return db
                  .collection('Teams')
                  .doc(teamId)
                  .update({ connectedSources: Array.from(merged.values()) });
              })
            );
            logger.info('[POST /profile/onboarding-step] Wrote connected sources to Team docs', {
              userId,
              teamIds: userTeamIds,
              sourceCount: teamConnectedSourcesStep.length,
            });
          } catch (err) {
            logger.error(
              '[POST /profile/onboarding-step] Failed to write Team connected sources',
              err as Record<string, unknown>
            );
          }
        }

        if (connectedMap.size > 0) {
          (updateData as Record<string, unknown>)['connectedSources'] = Array.from(
            connectedMap.values()
          );
        } else if (isTeamRoleUser && userTeamIds.length > 0) {
          (updateData as Record<string, unknown>)['connectedSources'] = FieldValue.delete();
        }
        break;
      }

      default: {
        updateData[`onboardingSteps.${stepId}`] = stepData;
      }
    }

    // Sanitize & persist
    if (Array.isArray(updateData.sports)) {
      updateData.sports = sanitizeSportsForStorage(updateData.sports);
    }

    await db.collection('Users').doc(userId).update(updateData);

    await invalidateProfileCaches(userId).catch((err) =>
      logger.warn('[POST /profile/onboarding-step] Cache invalidation failed', { userId, err })
    );

    res.json({
      success: true,
      stepId,
      savedFields: Object.keys(updateData).filter(
        (k) => !k.startsWith('onboardingProgress') && k !== 'updatedAt' && k !== '_schemaVersion'
      ),
    });
  })
);

export default router;
