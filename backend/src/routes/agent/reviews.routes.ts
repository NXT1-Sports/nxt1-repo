/**
 * @fileoverview Agent X in-app review routes.
 * @module @nxt1/backend/routes/agent/reviews
 *
 * POST /reviews — submit desktop web Agent X product feedback.
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { validateBody } from '../../middleware/validation/validation.middleware.js';
import { AgentXQuickReviewDto } from '../../dtos/agent-x.dto.js';
import { logger } from '../../utils/logger.js';
import { sendAgentXDesktopReviewAlert } from '../../services/communications/agent-x/agent-x-desktop-review-alert.service.js';

const router = Router();

router.post(
  '/reviews',
  appGuard,
  validateBody(AgentXQuickReviewDto),
  async (req: Request, res: Response) => {
    try {
      const authUser = req.user;
      if (!authUser?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const body = req.body as AgentXQuickReviewDto;
      const normalizedReviewText = body.reviewText?.trim() ?? '';
      const userProfile = await readUserProfile(req, authUser.uid);
      const reviewIdentity = await resolveReviewIdentityContext(req, userProfile);

      const delivered = await sendAgentXDesktopReviewAlert({
        environment: req.isStaging ? 'staging' : 'production',
        userId: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName,
        organizationName: reviewIdentity.organizationName,
        teamName: reviewIdentity.teamName,
        primarySport: reviewIdentity.primarySport,
        location: reviewIdentity.location,
        rating: body.rating,
        promptVersion: body.promptVersion,
        surface: body.surface,
        pageUrl: body.pageUrl ?? null,
        reviewText: normalizedReviewText,
        userAgent: req.get('user-agent') ?? null,
      });

      if (!delivered) {
        res.status(502).json({ success: false, error: 'Review could not be delivered right now' });
        return;
      }

      logger.info('[agent-x.reviews] Review submitted', {
        userId: authUser.uid,
        rating: body.rating,
        promptVersion: body.promptVersion,
        surface: body.surface,
        reviewLength: normalizedReviewText.length,
        environment: req.isStaging ? 'staging' : 'production',
      });

      res.json({ success: true, data: { delivered: true } });
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[agent-x.reviews] Failed to submit review', {
        userId: req.user?.uid,
        error: err.message,
        stack: err.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to submit review' });
    }
  }
);

export default router;

async function readUserProfile(
  req: Request,
  userId: string
): Promise<Record<string, unknown> | undefined> {
  const snapshot = await req.firebase.db.collection('Users').doc(userId).get();
  const data = snapshot.data();
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
}

async function resolveReviewIdentityContext(
  req: Request,
  userProfile: Record<string, unknown> | undefined
): Promise<{
  readonly organizationName?: string;
  readonly teamName?: string;
  readonly primarySport?: string;
  readonly location?: string;
}> {
  const directTeamId = firstNonEmptyString(
    userProfile?.['teamId'],
    asRecord(resolvePrimarySportProfile(userProfile)?.['team'])?.['teamId']
  );
  const directOrganizationId = firstNonEmptyString(
    userProfile?.['organizationId'],
    asRecord(resolvePrimarySportProfile(userProfile)?.['team'])?.['organizationId']
  );

  const teamDoc = directTeamId
    ? await req.firebase.db.collection('Teams').doc(directTeamId).get()
    : null;
  const teamData = teamDoc?.exists ? asRecord(teamDoc.data()) : undefined;

  const organizationId = directOrganizationId ?? firstNonEmptyString(teamData?.['organizationId']);
  const orgDoc = organizationId
    ? await req.firebase.db.collection('Organizations').doc(organizationId).get()
    : null;
  const organizationData = orgDoc?.exists ? asRecord(orgDoc.data()) : undefined;

  return {
    organizationName: resolveOrganizationName(userProfile, organizationData, teamData),
    teamName: resolveTeamName(userProfile, teamData),
    primarySport: resolvePrimarySport(userProfile, teamData),
    location: resolveLocation(userProfile, organizationData, teamData),
  };
}

function resolveOrganizationName(
  userProfile: Record<string, unknown> | null | undefined,
  organizationData?: Record<string, unknown>,
  teamData?: Record<string, unknown>
): string | undefined {
  const primarySportProfile = resolvePrimarySportProfile(userProfile);
  const primaryTeam = asRecord(primarySportProfile?.['team']);
  const candidates = [
    userProfile?.['organizationName'],
    userProfile?.['schoolName'],
    userProfile?.['orgName'],
    userProfile?.['coachProgram'],
    primaryTeam?.['organizationName'],
    primaryTeam?.['schoolName'],
    primaryTeam?.['orgName'],
    organizationData?.['name'],
    organizationData?.['organizationName'],
    organizationData?.['schoolName'],
    teamData?.['organizationName'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function resolveTeamName(
  userProfile: Record<string, unknown> | null | undefined,
  teamData?: Record<string, unknown>
): string | undefined {
  const primarySportProfile = resolvePrimarySportProfile(userProfile);
  const primaryTeam = asRecord(primarySportProfile?.['team']);
  const teamHistory = Array.isArray(userProfile?.['teamHistory'])
    ? userProfile?.['teamHistory'].map((entry) => asRecord(entry)).find(Boolean)
    : undefined;
  const candidates = [
    userProfile?.['teamName'],
    userProfile?.['currentTeam'],
    primaryTeam?.['name'],
    teamHistory?.['teamName'],
    teamData?.['teamName'],
    teamData?.['name'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function resolvePrimarySport(
  userProfile: Record<string, unknown> | null | undefined,
  teamData?: Record<string, unknown>
): string | undefined {
  const primarySportProfile = resolvePrimarySportProfile(userProfile);
  const candidates = [
    userProfile?.['primarySport'],
    userProfile?.['sport'],
    primarySportProfile?.['sport'],
    teamData?.['sport'],
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return undefined;
}

function resolveLocation(
  userProfile: Record<string, unknown> | null | undefined,
  organizationData?: Record<string, unknown>,
  teamData?: Record<string, unknown>
): string | undefined {
  const locationRecord = asRecord(userProfile?.['location']);
  const organizationLocation = asRecord(organizationData?.['location']);
  const city = firstNonEmptyString(
    locationRecord?.['city'],
    userProfile?.['city'],
    organizationLocation?.['city'],
    teamData?.['city']
  );
  const state = firstNonEmptyString(
    locationRecord?.['state'],
    userProfile?.['state'],
    organizationLocation?.['state'],
    teamData?.['state']
  );

  if (city && state) {
    return `${city}, ${state}`;
  }

  if (city) {
    return city;
  }

  if (state) {
    return state;
  }

  const directLocation = userProfile?.['location'];
  if (typeof directLocation === 'string' && directLocation.trim()) {
    return directLocation.trim();
  }

  return undefined;
}

function resolvePrimarySportProfile(
  userProfile: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  const sports = userProfile?.['sports'];
  if (!Array.isArray(sports) || sports.length === 0) {
    return undefined;
  }

  const normalizedSports = sports
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== undefined);

  const explicitPrimary = normalizedSports.find((entry) => entry['order'] === 0);
  return explicitPrimary ?? normalizedSports[0];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}
