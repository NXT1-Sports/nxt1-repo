/**
 * @fileoverview Invite Routes
 * @module @nxt1/backend/routes/invite
 *
 * Production invite system with Firestore persistence.
 * Handles referral link generation and invite tracking.
 *
 * Matches INVITE_API_ENDPOINTS from @nxt1/core/invite/constants.
 */

import { Router, type Request, type Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  SendInviteDto,
  SendBulkInvitesDto,
  ValidateInviteDto,
  AcceptInviteDto,
} from '../dtos/teams.dto.js';
import * as teamCodeService from '../services/team-code.service.js';
import { ROLE, RosterEntryStatus, UserRole } from '@nxt1/core/models';
import { RosterEntryService } from '../services/roster-entry.service.js';
import { TeamMemberRole } from '../dtos/teams.dto.js';
import { logger } from '../utils/logger.js';
import { INVITE_UI_CONFIG } from '@nxt1/core';
import type { InviteType, InviteChannel, InviteStatus } from '@nxt1/core';
import { invalidateTeamProfileCache } from '../services/cache.service.js';
import {
  creditReferralReward,
  getReferralRewardCents,
  NEW_USER_MAX_AGE_MINUTES,
} from '../modules/billing/index.js';

const router = Router();

// ============================================
// FIRESTORE DOCUMENT TYPES
// ============================================

interface InviteStatsDoc {
  userId: string;
  totalSent: number;
  accepted: number;
  pending: number;
  streakDays: number;
  bestStreak: number;
  weeklyCount: number;
  monthlyCount: number;
  channelsUsed: string[];
  qrAccepted: number;
  lastInviteAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserDoc {
  referralCode?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  profileImgs?: string[];
  role?: string;
  sports?: Array<{
    sport: string;
    team?: {
      teamId: string;
      name?: string;
      organizationId?: string;
    };
    positions?: string[];
  }>;
  activeSportIndex?: number;
  team?: {
    teamId: string;
    name: string;
    organizationId?: string;
    type?: string;
  };
}

interface TeamDoc {
  name?: string;
  teamCode?: string;
  teamName?: string;
  sport?: string;
  createdBy?: string;
  admins?: string[];
  coaches?: string[];
  members?: string[];
  memberIds?: string[];
  organizationId?: string;
}

interface InviteDoc {
  teamName?: string;
}

// ============================================
// CONSTANTS
// ============================================

const INVITES_COLLECTION = 'Invites';
const INVITE_STATS_COLLECTION = 'InviteStats';
const USERS_COLLECTION = 'Users';
const TEAMS_COLLECTION = 'Teams';

const VALID_INVITE_TYPES: InviteType[] = [
  'general',
  'team',
  'profile',
  'event',
  'recruit',
  'referral',
];
const VALID_CHANNELS: InviteChannel[] = [
  'sms',
  'email',
  'whatsapp',
  'messenger',
  'instagram',
  'twitter',
  'copy_link',
  'qr_code',
  'contacts',
  'airdrop',
];

/** App base URL for invite links (resolved per environment) */
function getAppBaseUrl(isStaging: boolean, origin?: string): string {
  // APP_URL always wins — lets developers override via .env (e.g. ngrok tunnel)
  if (process.env['APP_URL']) return process.env['APP_URL'];

  // If the request came from localhost, mirror that origin back so the invite
  // link points at the local dev app (works regardless of NODE_ENV / staging flag).
  // This handles both web (localhost:4200) and mobile (localhost:4300).
  if (origin && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
    return origin;
  }

  return isStaging
    ? (process.env['STAGING_APP_URL'] ??
        'https://nxt1-repo--nxt-1-staging-v2.us-central1.hosted.app')
    : 'https://nxt1sports.com';
}

// ============================================
// HELPERS
// ============================================

/**
 * Generate a unique referral code: NXT-XXXXXX
 * Uses crypto.randomUUID() and takes first 6 chars uppercased.
 */
function generateReferralCode(): string {
  const raw = crypto.randomUUID().replace(/-/g, '').substring(0, 6).toUpperCase();
  return `NXT-${raw}`;
}

/**
 * Get or create the user's referral code. Persists to Firestore.
 */
async function getOrCreateReferralCode(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<string> {
  const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
  const userData = userDoc.data() as UserDoc | undefined;

  if (userData?.referralCode) return userData.referralCode;

  // Generate and persist
  const referralCode = generateReferralCode();
  await db.collection(USERS_COLLECTION).doc(userId).set({ referralCode }, { merge: true });
  return referralCode;
}

/**
 * Get or initialize invite stats document.
 */
async function getOrCreateStats(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<FirebaseFirestore.DocumentReference> {
  const ref = db.collection(INVITE_STATS_COLLECTION).doc(userId);
  const doc = await ref.get();

  if (!doc.exists) {
    await ref.set({
      userId,
      totalSent: 0,
      accepted: 0,
      pending: 0,
      streakDays: 0,
      bestStreak: 0,
      weeklyCount: 0,
      monthlyCount: 0,
      channelsUsed: [],
      qrAccepted: 0,
      lastInviteAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return ref;
}

// ============================================
// ROUTES
// ============================================

/**
 * POST /api/v1/invite/link
 * Generate a personalized invite link for the authenticated user.
 *
 * Query or Body: { type?: InviteType, teamId?: string, teamCode?: string }
 * Returns: { success: true, data: InviteLink }
 */
router.post('/link', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase.db;
    const isStaging = req.isStaging;
    // Support both query params (frontend sends here) and body
    const type: InviteType =
      ((req.query['type'] ?? req.body?.type) as InviteType | undefined) ?? 'general';
    const teamId: string | undefined =
      (req.query['teamId'] as string | undefined) ?? req.body?.teamId;
    const reqTeamCode: string | undefined =
      (req.query['teamCode'] as string | undefined) ?? req.body?.teamCode;

    if (type && !VALID_INVITE_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid invite type' });
    }

    // Get or create persistent referral code
    const referralCode = await getOrCreateReferralCode(db, userId);
    const origin = req.headers['origin'] as string | undefined;
    const baseUrl = getAppBaseUrl(isStaging, origin);

    // When it's a team invite, look up teamCode + teamName to embed in the URL.
    // Priority order:
    // 1. Find by teamCode parameter (if provided from frontend)
    // 2. Find by teamId parameter (if provided from frontend)
    // 3. Find by user's sports[activeSportIndex].team.teamId (current user structure)
    // 4. Find first team in collection (last resort for dev/testing)
    let teamCode: string | undefined;
    let teamName: string | undefined;
    let teamSport: string | undefined;
    if (type === 'team') {
      let resolvedTeamId = teamId;

      // Priority 1: Find by teamCode parameter
      if (!resolvedTeamId && reqTeamCode) {
        const teamCodeSnap = await db
          .collection(TEAMS_COLLECTION)
          .where('teamCode', '==', reqTeamCode)
          .limit(1)
          .get();
        if (!teamCodeSnap.empty) {
          resolvedTeamId = teamCodeSnap.docs[0].id;
        }
      }

      // Priority 3: Get team from user's active sport
      if (!resolvedTeamId) {
        const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
        const userData = userDoc.data();

        // Try sports[activeSportIndex].team.teamId first (current structure)
        const activeSportIndex = userData?.['activeSportIndex'];
        const sports = userData?.['sports'];

        if (
          typeof activeSportIndex === 'number' &&
          Array.isArray(sports) &&
          sports[activeSportIndex]
        ) {
          const activeSport = sports[activeSportIndex];
          const sportTeamId = activeSport?.['team']?.['teamId'];
          if (sportTeamId) {
            logger.debug(
              '[POST /invite/link] Found team via sports[activeSportIndex].team.teamId',
              {
                activeSportIndex,
                sportTeamId,
                sport: activeSport?.['sport'],
              }
            );
            resolvedTeamId = sportTeamId;
            // teamCode, teamName, sport are already stored on the user's sports entry —
            // use them directly to avoid an extra Firestore read below.
            teamCode = activeSport?.['team']?.['teamCode'] ?? undefined;
            teamName = activeSport?.['team']?.['name'] ?? undefined;
            teamSport = activeSport?.['sport'] ?? undefined;
          }
        }

        // Fallback: Try legacy team.teamId field
        if (!resolvedTeamId) {
          const legacyTeamId = userData?.['team']?.['teamId'];
          if (legacyTeamId) {
            logger.debug('[POST /invite/link] Found team via legacy team.teamId', { legacyTeamId });
            resolvedTeamId = legacyTeamId;
          } else {
            logger.debug('[POST /invite/link] No team found in user profile', {
              hasSports: !!sports,
              activeSportIndex,
              hasLegacyTeam: !!userData?.['team'],
            });
          }
        }
      }

      // Priority 4: Fallback to any team (for dev/testing)
      if (!resolvedTeamId) {
        const anyTeamSnap = await db.collection(TEAMS_COLLECTION).limit(1).get();
        if (!anyTeamSnap.empty) {
          resolvedTeamId = anyTeamSnap.docs[0].id;
        }
      }

      if (resolvedTeamId) {
        const teamDoc = await db.collection(TEAMS_COLLECTION).doc(resolvedTeamId).get();
        const teamData = teamDoc.data() as TeamDoc | undefined;
        // Authoritative values from the Teams doc override any stale user-data copies.
        // Fall back to what we already read from sports[activeSportIndex].team if missing.
        teamCode = teamData?.teamCode ?? teamCode;
        teamName = teamData?.teamName ?? teamData?.name ?? teamName;
        teamSport = teamData?.sport ?? teamSport;

        logger.info('[POST /invite/link] Resolved team', {
          resolvedTeamId,
          teamCode,
          teamName,
          sport: teamSport,
          organizationId: teamData?.organizationId,
        });
      } else {
        logger.warn('[POST /invite/link] No team found for user', { userId, type });
      }
    }

    // Build the invite URL.
    const params = new URLSearchParams();
    let pathCode: string;

    // Calculate expiration (used for both team invite doc and response)
    const expiresAt = new Date(
      Date.now() + INVITE_UI_CONFIG.linkExpirationDays * 24 * 60 * 60 * 1000
    ).toISOString();
    const now = new Date().toISOString();

    if (type === 'team' && teamCode) {
      // Team invite: use the team's own code as the URL token so the link is
      // stable and human-readable.  URL: /join/NXT-{teamCode}
      pathCode = `NXT-${teamCode}`;

      // Upsert invite doc keyed by (userId, teamCode) — regenerating the link replaces the old one
      // Store `code` WITHOUT the NXT- prefix so /validate can match after stripping the prefix.
      await db
        .collection(INVITES_COLLECTION)
        .doc(`team-link-${userId}-${teamCode}`)
        .set(
          {
            code: teamCode,
            type: 'team',
            inviterUid: userId,
            teamCode,
            teamName: teamName ?? '',
            sport: teamSport ?? '',
            expiresAt,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
    } else {
      // General/profile invite: /join/{referralCode}?type=...
      pathCode = referralCode;
      if (type !== 'general') params.set('type', type);
    }

    const path = `/join/${pathCode}`;
    const query = params.toString();
    const url = `${baseUrl}${path}${query ? `?${query}` : ''}`;
    const shortUrl = url;

    logger.info('[POST /invite/link] Generated invite link', {
      userId,
      referralCode,
      type,
      teamCode,
    });

    return res.json({
      success: true,
      data: { url, shortUrl, referralCode, expiresAt, teamCode, teamName },
    });
  } catch (error) {
    logger.error('[POST /invite/link] Failed', { error });
    return res.status(500).json({ success: false, error: 'Failed to generate invite link' });
  }
});

/**
 * POST /api/v1/invite/send
 * Record a sent invite.
 *
 * Body: { type, channel, recipients[], teamId?, message? }
 * Returns: { success, invites[] }
 */
router.post('/send', appGuard, validateBody(SendInviteDto), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase.db;
    const { type, channel, recipients, teamId, message } = req.body as {
      type: InviteType;
      channel: InviteChannel;
      recipients: Array<{ id: string; name?: string; phone?: string; email?: string }>;
      teamId?: string;
      message?: string;
    };

    // Validate required fields
    if (!type || !channel || !recipients?.length) {
      return res
        .status(400)
        .json({ success: false, error: 'Missing required fields: type, channel, recipients' });
    }
    if (!VALID_INVITE_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid invite type' });
    }
    if (!VALID_CHANNELS.includes(channel)) {
      return res.status(400).json({ success: false, error: 'Invalid channel' });
    }
    if (recipients.length > INVITE_UI_CONFIG.maxBulkRecipients) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${INVITE_UI_CONFIG.maxBulkRecipients} recipients`,
      });
    }
    if (message && message.length > INVITE_UI_CONFIG.maxMessageLength) {
      return res.status(400).json({
        success: false,
        error: `Message exceeds ${INVITE_UI_CONFIG.maxMessageLength} characters`,
      });
    }

    const referralCode = await getOrCreateReferralCode(db, userId);
    const statsRef = await getOrCreateStats(db, userId);
    const statsDoc = await statsRef.get();
    const statsData = statsDoc.data() as InviteStatsDoc;

    const now = new Date().toISOString();
    const batch = db.batch();
    const invites: Array<Record<string, unknown>> = [];

    for (const recipient of recipients) {
      const inviteId = crypto.randomUUID();

      const inviteDoc = {
        id: inviteId,
        type,
        channel,
        status: 'pending' as InviteStatus,
        recipient: {
          id: recipient.id,
          name: recipient.name ?? null,
          phone: recipient.phone ?? null,
          email: recipient.email ?? null,
        },
        senderId: userId,
        teamId: teamId ?? null,
        message: message ?? null,
        referralCode,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(
          Date.now() + INVITE_UI_CONFIG.linkExpirationDays * 24 * 60 * 60 * 1000
        ).toISOString(),
      };

      batch.set(db.collection(INVITES_COLLECTION).doc(inviteId), inviteDoc);
      invites.push(inviteDoc);
    }

    // Update stats atomically
    const channelsUsed: string[] = [...(statsData.channelsUsed ?? [])];
    if (!channelsUsed.includes(channel)) channelsUsed.push(channel);

    // Calculate streak
    const lastInviteAt = statsData.lastInviteAt ? new Date(statsData.lastInviteAt).getTime() : 0;
    const hoursSinceLast = (Date.now() - lastInviteAt) / (1000 * 60 * 60);
    let streakDays = statsData.streakDays ?? 0;
    if (hoursSinceLast > 48) {
      streakDays = 1; // Reset streak
    } else if (hoursSinceLast > 20) {
      streakDays += 1; // Continue streak
    }
    const bestStreak = Math.max(statsData.bestStreak ?? 0, streakDays);

    const newTotalSent = (statsData.totalSent ?? 0) + recipients.length;
    const newPending = (statsData.pending ?? 0) + recipients.length;

    batch.update(statsRef, {
      totalSent: newTotalSent,
      pending: newPending,
      weeklyCount: (statsData.weeklyCount ?? 0) + recipients.length,
      monthlyCount: (statsData.monthlyCount ?? 0) + recipients.length,
      channelsUsed,
      streakDays,
      bestStreak,
      lastInviteAt: now,
      updatedAt: now,
    });

    await batch.commit();

    logger.info('[POST /invite/send] Invites sent', {
      userId,
      count: recipients.length,
      channel,
    });

    return res.json({
      success: true,
      invites,
    });
  } catch (error) {
    logger.error('[POST /invite/send] Failed', { error });
    return res.status(500).json({ success: false, error: 'Failed to send invites' });
  }
});

/**
 * POST /api/v1/invite/send-bulk
 * Send bulk team invites.
 */
router.post(
  '/send-bulk',
  appGuard,
  validateBody(SendBulkInvitesDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const db = req.firebase.db;
      const { teamId, recipients, channel, message } = req.body as {
        teamId: string;
        recipients: Array<{ id: string; name?: string; phone?: string; email?: string }>;
        channel: InviteChannel;
        message?: string;
      };

      if (!teamId || !recipients?.length || !channel) {
        return res
          .status(400)
          .json({ success: false, error: 'Missing required fields: teamId, recipients, channel' });
      }
      if (!VALID_CHANNELS.includes(channel)) {
        return res.status(400).json({ success: false, error: 'Invalid channel' });
      }
      if (recipients.length > INVITE_UI_CONFIG.maxBulkRecipients) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${INVITE_UI_CONFIG.maxBulkRecipients} recipients`,
        });
      }

      // Verify team exists and user has access
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
      if (!teamDoc.exists) {
        return res.status(404).json({ success: false, error: 'Team not found' });
      }
      const teamData = teamDoc.data() as TeamDoc | undefined;
      const isTeamAdmin =
        teamData?.createdBy === userId ||
        teamData?.admins?.includes(userId) ||
        teamData?.coaches?.includes(userId);
      if (!isTeamAdmin) {
        return res
          .status(403)
          .json({ success: false, error: 'Not authorized to invite for this team' });
      }

      // Re-use the /send handler logic inline
      const referralCode = await getOrCreateReferralCode(db, userId);
      const statsRef = await getOrCreateStats(db, userId);
      const statsDoc = await statsRef.get();
      const statsData = statsDoc.data() as InviteStatsDoc;

      const now = new Date().toISOString();
      const batch = db.batch();
      const invites: Array<Record<string, unknown>> = [];

      for (const recipient of recipients) {
        const inviteId = crypto.randomUUID();

        const inviteDoc = {
          id: inviteId,
          type: 'team' as InviteType,
          channel,
          status: 'pending' as InviteStatus,
          recipient: {
            id: recipient.id,
            name: recipient.name ?? null,
            phone: recipient.phone ?? null,
            email: recipient.email ?? null,
          },
          senderId: userId,
          teamId,
          teamName: teamData?.name ?? null,
          message: message ?? null,
          referralCode,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(db.collection(INVITES_COLLECTION).doc(inviteId), inviteDoc);
        invites.push(inviteDoc);
      }

      const channelsUsed: string[] = [...(statsData.channelsUsed ?? [])];
      if (!channelsUsed.includes(channel)) channelsUsed.push(channel);

      batch.update(statsRef, {
        totalSent: (statsData.totalSent ?? 0) + recipients.length,
        pending: (statsData.pending ?? 0) + recipients.length,
        channelsUsed,
        lastInviteAt: now,
        updatedAt: now,
      });

      await batch.commit();

      logger.info('[POST /invite/send-bulk] Bulk invites sent', {
        userId,
        teamId,
        count: recipients.length,
      });

      return res.json({
        success: true,
        invites,
      });
    } catch (error) {
      logger.error('[POST /invite/send-bulk] Failed', { error });
      return res.status(500).json({ success: false, error: 'Failed to send bulk invites' });
    }
  }
);

/**
 * GET /api/v1/invite/history
 * Get paginated invite history for the authenticated user.
 *
 * Query: type?, channel?, status?, teamId?, since?, until?, page?, limit?
 */
router.get('/history', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase.db;

    const page = Math.max(1, Number(req.query['page']) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query['limit']) || 20));
    const type = req.query['type'] as InviteType | undefined;
    const channel = req.query['channel'] as InviteChannel | undefined;
    const status = req.query['status'] as InviteStatus | undefined;

    let query: FirebaseFirestore.Query = db
      .collection(INVITES_COLLECTION)
      .where('senderId', '==', userId)
      .orderBy('createdAt', 'desc');

    if (type) query = query.where('type', '==', type);
    if (channel) query = query.where('channel', '==', channel);
    if (status) query = query.where('status', '==', status);

    // Count total (for pagination metadata)
    const countSnapshot = await query.count().get();
    const total = countSnapshot.data().count;

    // Paginate
    const offset = (page - 1) * limit;
    const snapshot = await query.offset(offset).limit(limit).get();

    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data };
    });

    return res.json({
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        hasMore: offset + items.length < total,
      },
    });
  } catch (error) {
    logger.error('[GET /invite/history] Failed', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch invite history' });
  }
});

/**
 * GET /api/v1/invite/stats
 * Get the authenticated user's invite statistics.
 */
router.get('/stats', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase.db;

    const statsRef = await getOrCreateStats(db, userId);
    const statsDoc = await statsRef.get();
    const data = statsDoc.data() as InviteStatsDoc;

    const totalSent = data.totalSent ?? 0;
    const accepted = data.accepted ?? 0;
    const conversionRate = totalSent > 0 ? Math.round((accepted / totalSent) * 100) : 0;

    // Read the live referral reward so frontend copy stays in sync with the
    // actual wallet credit applied on acceptance (no drift between UI & ledger).
    const referralRewardCents = await getReferralRewardCents(db);

    return res.json({
      success: true,
      data: {
        totalSent,
        accepted,
        pending: data.pending ?? 0,
        streakDays: data.streakDays ?? 0,
        bestStreak: data.bestStreak ?? 0,
        weeklyCount: data.weeklyCount ?? 0,
        monthlyCount: data.monthlyCount ?? 0,
        conversionRate,
        referralRewardCents,
      },
    });
  } catch (error) {
    logger.error('[GET /invite/stats] Failed', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch invite stats' });
  }
});

/**
 * POST /api/v1/invite/validate
 * Validate a referral code and return inviter info.
 *
 * Body: { code: string }
 */
router.post('/validate', validateBody(ValidateInviteDto), async (req: Request, res: Response) => {
  try {
    const db = req.firebase.db;
    const { code } = req.body as { code?: string };

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing referral code' });
    }

    // Normalize: strip leading "NXT-" prefix for team invite doc lookup.
    const normalizedCode = code.toUpperCase().replace(/^NXT-/, '');
    // Personal referral codes are stored WITH the "NXT-" prefix in Users.referralCode.
    const codeUpper = code.toUpperCase();
    const codeWithPrefix = codeUpper.startsWith('NXT-') ? codeUpper : `NXT-${codeUpper}`;

    // Find user with this referral code (personal invite — stored as "NXT-XXXXXX")
    const usersSnapshot = await db
      .collection(USERS_COLLECTION)
      .where('referralCode', '==', codeWithPrefix)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      // Check the Invites collection for a team invite doc with this code.
      // Try both the bare code ("CPEKC0") and the legacy prefixed form ("NXT-CPEKC0")
      // so old docs created before the prefix-stripping fix still resolve.
      const [newSnap, legacySnap] = await Promise.all([
        db
          .collection(INVITES_COLLECTION)
          .where('code', '==', normalizedCode)
          .where('type', '==', 'team')
          .limit(1)
          .get(),
        db
          .collection(INVITES_COLLECTION)
          .where('code', '==', `NXT-${normalizedCode}`)
          .where('type', '==', 'team')
          .limit(1)
          .get(),
      ]);
      const teamInviteSnap = !newSnap.empty ? newSnap : legacySnap;

      if (!teamInviteSnap.empty) {
        const inviteData = teamInviteSnap.docs[0].data();
        const inviterDoc = await db
          .collection(USERS_COLLECTION)
          .doc(inviteData['inviterUid'] as string)
          .get();
        const inviterData = inviterDoc.data() as UserDoc | undefined;

        return res.json({
          success: true,
          data: {
            valid: true,
            inviterUid: inviteData['inviterUid'] as string,
            inviterName:
              `${inviterData?.firstName ?? ''} ${inviterData?.lastName ?? ''}`.trim() ||
              'NXT1 User',
            inviterAvatar: inviterData?.profileImgs?.[0] ?? null,
            type: 'team',
            teamCode: inviteData['teamCode'] as string,
            teamName: inviteData['teamName'] as string,
            sport: inviteData['sport'] as string,
          },
        });
      }

      return res.json({ success: true, data: { valid: false } });
    }

    const inviterDoc = usersSnapshot.docs[0];
    const inviterData = inviterDoc.data() as UserDoc;

    return res.json({
      success: true,
      data: {
        valid: true,
        inviterUid: inviterDoc.id,
        inviterName:
          `${inviterData.firstName ?? ''} ${inviterData.lastName ?? ''}`.trim() || 'NXT1 User',
        inviterAvatar: inviterData.profileImgs?.[0] ?? null,
      },
    });
  } catch (error) {
    logger.error('[POST /invite/validate] Failed', { error });
    return res.json({ success: true, data: { valid: false } });
  }
});

/**
 * POST /api/v1/invite/accept
 * Accept an invite — links the new user to the inviter.
 * If teamCode + role are provided, also adds the user to the team roster.
 * Staff roles (Coach, Administrative) are added with pending status for admin approval.
 *
 * Body: { code: string, teamCode?: string, role?: TeamMemberRole }
 */
router.post(
  '/accept',
  appGuard,
  validateBody(AcceptInviteDto),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.uid;
      const db = req.firebase.db;
      const {
        code,
        teamCode,
        role,
        inviterUid: passedInviterUid,
        isNewUser,
      } = req.body as {
        code: string;
        teamCode?: string;
        role?: TeamMemberRole;
        inviterUid?: string;
        isNewUser?: boolean;
      };

      // Normalize codes:
      //   normalizedCode — strip prefix for team invite doc lookup (stored without prefix)
      //   codeWithPrefix — keep/add prefix for personal referral code lookup (stored as "NXT-XXXXXX")
      const normalizedCode = code.toUpperCase().replace(/^NXT-/, '');
      const codeWithPrefix = code.toUpperCase().startsWith('NXT-')
        ? code.toUpperCase()
        : `NXT-${code.toUpperCase()}`;
      const now = new Date().toISOString();
      let inviterId: string | undefined;
      let teamJoined: string | undefined;
      let joinedAsPending = false;

      // ── Resolve inviter ──
      // Case A: code is a personal referral code (stored as "NXT-XXXXXX" in Users.referralCode)
      // Case B: code is a team invite token (stored without prefix in Invites.code)
      const usersSnapshot = await db
        .collection(USERS_COLLECTION)
        .where('referralCode', '==', codeWithPrefix)
        .limit(1)
        .get();

      if (!usersSnapshot.empty) {
        inviterId = usersSnapshot.docs[0].id;
        // Prevent self-referral
        if (inviterId === userId) {
          return res.status(400).json({ success: false, error: 'Cannot accept your own invite' });
        }
      } else if (passedInviterUid && passedInviterUid !== 'unknown') {
        // Team invite: inviterUid was resolved on the join page
        inviterId = passedInviterUid;
      } else if (!teamCode) {
        // No teamCode and no valid referral code — nothing to do
        return res.status(404).json({ success: false, error: 'Invalid referral code' });
      }
      // If teamCode is provided but no inviter found, proceed (join team without tracking)

      // ── Check if already accepted (only when we have an inviter) ──
      // Team invite docs use field `code`; sent-invite docs use `referralCode`.
      if (inviterId) {
        const [existingByReferral, existingByCode] = await Promise.all([
          db
            .collection(INVITES_COLLECTION)
            .where('referralCode', '==', codeWithPrefix)
            .where('recipient.id', '==', userId)
            .where('status', '==', 'accepted')
            .limit(1)
            .get(),
          db
            .collection(INVITES_COLLECTION)
            .where('code', '==', normalizedCode)
            .where('status', '==', 'accepted')
            .limit(1)
            .get(),
        ]);

        if (!existingByReferral.empty || !existingByCode.empty) {
          return res.status(409).json({ success: false, error: 'Invite already accepted' });
        }
      }

      const batch = db.batch();

      // ── Update invite doc & track referral on the new user ──
      // Sent-invite docs use `referralCode`; team invite docs use `code`.
      if (inviterId) {
        const [pendingByReferral, pendingByCode] = await Promise.all([
          db
            .collection(INVITES_COLLECTION)
            .where('referralCode', '==', codeWithPrefix)
            .where('status', '==', 'pending')
            .limit(1)
            .get(),
          db
            .collection(INVITES_COLLECTION)
            .where('code', '==', normalizedCode)
            .where('status', '!=', 'accepted')
            .limit(1)
            .get(),
        ]);

        const pendingDoc = !pendingByReferral.empty
          ? pendingByReferral.docs[0]
          : !pendingByCode.empty
            ? pendingByCode.docs[0]
            : null;

        if (pendingDoc) {
          const inviteData = pendingDoc.data() as InviteDoc;
          batch.update(pendingDoc.ref, { status: 'accepted', updatedAt: now });
          teamJoined = inviteData.teamName ?? undefined;
        }

        // Record the referral on the new user
        batch.set(
          db.collection(USERS_COLLECTION).doc(userId),
          { referralId: inviterId, referralSource: 'invite_link', referralDetails: code },
          { merge: true }
        );
      }

      await batch.commit();

      let verifiedIsNewUser = false;
      if (inviterId && isNewUser === true && !teamCode) {
        try {
          const userRecord = await getAuth().getUser(userId);
          const creationTime = userRecord.metadata.creationTime;

          if (creationTime) {
            const accountAgeMinutes = Math.max(
              0,
              (Date.now() - new Date(creationTime).getTime()) / 60_000
            );
            verifiedIsNewUser = accountAgeMinutes <= NEW_USER_MAX_AGE_MINUTES;

            if (!verifiedIsNewUser) {
              logger.warn('[POST /invite/accept] Skipping referral reward — account is not new', {
                referrerId: inviterId,
                userId,
                accountAgeMinutes,
                maxAgeMinutes: NEW_USER_MAX_AGE_MINUTES,
              });
            }
          } else {
            logger.warn('[POST /invite/accept] Skipping referral reward — missing creation time', {
              referrerId: inviterId,
              userId,
            });
          }
        } catch (verificationError) {
          logger.warn('[POST /invite/accept] Failed to verify new-user status', {
            referrerId: inviterId,
            userId,
            error:
              verificationError instanceof Error
                ? verificationError.message
                : String(verificationError),
          });
        }
      }

      // ── Credit referral reward to the inviter's Agent X wallet ──
      // Rules:
      //   1. Only when the invitee is a brand-new user completing onboarding (isNewUser = true).
      //   2. Only for INDIVIDUAL referral invites (no teamCode in body).
      //      Coach/Director team invites are a program-management action, not a referral.
      //   3. Amount is read live from AppConfig/referralReward in Firestore (adjustable without deploy).
      if (inviterId && verifiedIsNewUser && !teamCode) {
        try {
          const rewardResult = await creditReferralReward(db, inviterId, userId);
          if (rewardResult.success) {
            logger.info('[POST /invite/accept] Referral reward credited', {
              referrerId: inviterId,
              newUserId: userId,
              newBalanceCents: rewardResult.newBalanceCents,
            });
          }
        } catch (rewardErr) {
          // Non-blocking — invite acceptance should still succeed even if
          // the wallet credit fails. The idempotent design allows retry.
          logger.warn('[POST /invite/accept] Referral reward failed (non-blocking)', {
            referrerId: inviterId,
            newUserId: userId,
            error: rewardErr instanceof Error ? rewardErr.message : String(rewardErr),
          });
        }
      } else if (inviterId && isNewUser === true && teamCode) {
        logger.debug(
          '[POST /invite/accept] Skipping referral reward — team invite (coach/director flow)',
          {
            referrerId: inviterId,
            userId,
            teamCode,
          }
        );
      } else if (inviterId && isNewUser === true && !teamCode) {
        logger.debug(
          '[POST /invite/accept] Skipping referral reward — server did not verify new user',
          {
            referrerId: inviterId,
            userId,
          }
        );
      } else if (inviterId && !isNewUser) {
        logger.debug('[POST /invite/accept] Skipping referral reward — existing user join', {
          referrerId: inviterId,
          userId,
        });
      }

      // ── Team join (outside the batch; uses its own Firestore operations) ──
      if (teamCode) {
        try {
          const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
          const userData = userDoc.data() as UserDoc | undefined;

          // Staff roles (Coach / Administrative) are added as pending for admin approval.
          const isStaffRole =
            role === TeamMemberRole.COACH || role === TeamMemberRole.ADMINISTRATIVE;

          // Map TeamMemberRole → ROLE enum used by joinTeam
          const roleMap: Partial<Record<TeamMemberRole, ROLE>> = {
            [TeamMemberRole.ATHLETE]: ROLE.athlete,
            [TeamMemberRole.COACH]: ROLE.coach,
            [TeamMemberRole.ADMINISTRATIVE]: ROLE.admin,
            [TeamMemberRole.MEDIA]: ROLE.media,
          };
          const mappedRole = role ? (roleMap[role] ?? ROLE.athlete) : ROLE.athlete;

          const team = await teamCodeService.joinTeam(db, {
            userId,
            teamCode,
            role: mappedRole,
            userProfile: {
              firstName: userData?.firstName ?? '',
              lastName: userData?.lastName ?? '',
              email: userData?.email ?? '',
            },
          });

          teamJoined = team.teamName ?? teamJoined;
          joinedAsPending = isStaffRole;

          // Write RosterEntry (junction table) with inviterUid tracked
          if (team.id) {
            const rosterRoleMap: Partial<Record<ROLE, UserRole>> = {
              [ROLE.athlete]: 'athlete',
              [ROLE.coach]: 'coach',
              [ROLE.admin]: 'director',
              [ROLE.media]: 'coach',
            };
            const rosterRole: UserRole = rosterRoleMap[mappedRole] ?? 'athlete';
            const rosterStatus = isStaffRole ? RosterEntryStatus.PENDING : RosterEntryStatus.ACTIVE;

            // Read organizationId directly from the Teams document to ensure it's never empty
            const teamDocSnap = await db.collection('Teams').doc(team.id).get();
            const organizationId: string =
              teamDocSnap.data()?.['organizationId'] ?? team.organizationId ?? '';
            const teamSport: string = teamDocSnap.data()?.['sport'] ?? team.sport ?? '';
            const athletePositions =
              rosterRole === 'athlete'
                ? userData?.sports?.find(
                    (sport) => sport.sport?.trim().toLowerCase() === teamSport.trim().toLowerCase()
                  )?.positions
                : undefined;

            const rosterService = new RosterEntryService(db);
            try {
              await rosterService.createRosterEntry({
                userId,
                teamId: team.id,
                organizationId,
                role: rosterRole,
                sport: teamSport,
                status: rosterStatus,
                invitedBy: inviterId ?? undefined,
                ...(rosterRole === 'athlete' ? { positions: athletePositions } : {}),
                firstName: userData?.firstName ?? '',
                lastName: userData?.lastName ?? '',
                displayName:
                  userData?.displayName ??
                  [userData?.firstName ?? '', userData?.lastName ?? '']
                    .map((value) => value.trim())
                    .filter(Boolean)
                    .join(' '),
                email: userData?.email ?? '',
              });
            } catch (rosterErr: unknown) {
              const msg = rosterErr instanceof Error ? rosterErr.message : String(rosterErr);
              if (msg.includes('already') && rosterStatus === RosterEntryStatus.ACTIVE) {
                // An earlier flow (e.g. saveOnboardingProfile) may have created a PENDING
                // entry before the invite was accepted — upgrade it to ACTIVE now.
                try {
                  const existingSnap = await db
                    .collection('RosterEntries')
                    .where('userId', '==', userId)
                    .where('teamId', '==', team.id)
                    .where('status', '==', RosterEntryStatus.PENDING)
                    .limit(1)
                    .get();
                  if (!existingSnap.empty) {
                    await existingSnap.docs[0].ref.update({
                      status: RosterEntryStatus.ACTIVE,
                      updatedAt: new Date().toISOString(),
                    });
                    logger.info(
                      '[POST /invite/accept] Upgraded existing PENDING RosterEntry to ACTIVE',
                      { userId, teamId: team.id }
                    );
                  }
                } catch (upgradeErr) {
                  logger.warn('[POST /invite/accept] Failed to upgrade RosterEntry status', {
                    userId,
                    teamId: team.id,
                    error: upgradeErr instanceof Error ? upgradeErr.message : String(upgradeErr),
                  });
                }
              } else if (!msg.includes('already')) {
                logger.warn('[POST /invite/accept] RosterEntry creation failed (non-blocking)', {
                  userId,
                  teamId: team.id,
                  error: msg,
                });
              }
            }
          }

          logger.info('[POST /invite/accept] User joined team via invite', {
            userId,
            teamCode,
            role: mappedRole,
            pending: joinedAsPending,
          });

          void invalidateTeamProfileCache(team.id ?? '', team.slug ?? undefined);
        } catch (teamErr) {
          // Non-blocking — if team join fails (e.g. team full), invite is still accepted
          logger.warn('[POST /invite/accept] Team join failed (non-blocking)', {
            userId,
            teamCode,
            error: teamErr instanceof Error ? teamErr.message : String(teamErr),
          });
        }
      }

      logger.info('[POST /invite/accept] Invite accepted', {
        userId,
        inviterId,
        code,
        teamCode,
      });

      return res.json({
        success: true,
        teamJoined,
        joinedAsPending,
      });
    } catch (error) {
      logger.error('[POST /invite/accept] Failed', { error });
      return res.status(500).json({ success: false, error: 'Failed to accept invite' });
    }
  }
);

/**
 * GET /api/v1/invite/team/:teamId/members
 * Get team members available to invite.
 */
router.get('/team/:teamId/members', appGuard, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.uid;
    const db = req.firebase.db;
    const teamId = req.params['teamId'] as string;

    if (!teamId) {
      return res.status(400).json({ success: false, error: 'Missing teamId' });
    }

    const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
    if (!teamDoc.exists) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }

    const teamData = teamDoc.data() as TeamDoc | undefined;
    const memberIds: string[] = teamData?.members ?? [];

    // Exclude current user from the list
    const eligibleIds = memberIds.filter((id: string) => id !== userId);

    // Fetch member details
    const members = await Promise.all(
      eligibleIds.slice(0, 50).map(async (memberId: string) => {
        const memberDoc = await db.collection(USERS_COLLECTION).doc(memberId).get();
        if (!memberDoc.exists) return null;
        const data = memberDoc.data() as UserDoc;
        return {
          id: memberId,
          name: `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim(),
          avatarUrl: data.profileImgs?.[0] ?? null,
          email: data.email ?? null,
        };
      })
    );

    return res.json({
      success: true,
      data: members.filter(Boolean),
    });
  } catch (error) {
    logger.error('[GET /invite/team/:teamId/members] Failed', { error });
    return res.status(500).json({ success: false, error: 'Failed to fetch team members' });
  }
});

export default router;
