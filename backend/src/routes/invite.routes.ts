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
import { appGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  SendInviteDto,
  SendBulkInvitesDto,
  ValidateInviteDto,
  AcceptInviteDto,
} from '../dtos/teams.dto.js';
import * as teamCodeService from '../services/team-code.service.js';
import { ROLE } from '@nxt1/core/models';
import { TeamMemberRole } from '../dtos/teams.dto.js';
import { logger } from '../utils/logger.js';
import { INVITE_UI_CONFIG } from '@nxt1/core';
import type { InviteType, InviteChannel, InviteStatus } from '@nxt1/core';

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
  email?: string;
  profileImgs?: string[];
  role?: string;
}

interface TeamDoc {
  name?: string;
  teamCode?: string;
  teamName?: string;
  createdBy?: string;
  admins?: string[];
  coaches?: string[];
  members?: string[];
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
function getAppBaseUrl(isStaging: boolean): string {
  return isStaging ? 'https://staging.nxt1sports.com' : 'https://nxt1sports.com';
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
 * Query or Body: { type?: InviteType, teamId?: string }
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

    if (type && !VALID_INVITE_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid invite type' });
    }

    // Get or create persistent referral code
    const referralCode = await getOrCreateReferralCode(db, userId);
    const baseUrl = getAppBaseUrl(isStaging);

    // When it's a team invite, look up teamCode + teamName to embed in the URL
    let teamCode: string | undefined;
    let teamName: string | undefined;
    if (teamId) {
      const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
      const teamData = teamDoc.data() as TeamDoc | undefined;
      teamCode = teamData?.teamCode ?? undefined;
      teamName = teamData?.name ?? teamData?.teamName ?? undefined;
    }

    // Build the invite URL.
    // The inviter UID can be resolved later from the referral code itself,
    // so we keep share links clean and only include team-specific context.
    const params = new URLSearchParams();
    if (type !== 'general') params.set('type', type);
    if (teamCode) params.set('teamCode', teamCode);
    if (teamName) params.set('teamName', teamName);

    const path = `/join/${referralCode}`;
    const query = params.toString();
    const url = `${baseUrl}${path}${query ? `?${query}` : ''}`;
    const shortUrl = url;

    // Calculate expiration
    const expiresAt = new Date(
      Date.now() + INVITE_UI_CONFIG.linkExpirationDays * 24 * 60 * 60 * 1000
    ).toISOString();

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

    // Find user with this referral code
    const usersSnapshot = await db
      .collection(USERS_COLLECTION)
      .where('referralCode', '==', code.toUpperCase())
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
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
      const { code, teamCode, role } = req.body as {
        code: string;
        teamCode?: string;
        role?: TeamMemberRole;
      };

      // Find inviter by referral code
      const usersSnapshot = await db
        .collection(USERS_COLLECTION)
        .where('referralCode', '==', code.toUpperCase())
        .limit(1)
        .get();

      if (usersSnapshot.empty) {
        return res.status(404).json({ success: false, error: 'Invalid referral code' });
      }

      const inviterId = usersSnapshot.docs[0].id;

      // Prevent self-referral
      if (inviterId === userId) {
        return res.status(400).json({ success: false, error: 'Cannot accept your own invite' });
      }

      // Check if already accepted
      const existingAccept = await db
        .collection(INVITES_COLLECTION)
        .where('referralCode', '==', code.toUpperCase())
        .where('recipient.id', '==', userId)
        .where('status', '==', 'accepted')
        .limit(1)
        .get();

      if (!existingAccept.empty) {
        return res.status(409).json({ success: false, error: 'Invite already accepted' });
      }

      const batch = db.batch();
      const now = new Date().toISOString();

      // Update any pending invite for this recipient to accepted
      const pendingInvites = await db
        .collection(INVITES_COLLECTION)
        .where('referralCode', '==', code.toUpperCase())
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      let teamJoined: string | undefined;
      let joinedAsPending = false;

      if (!pendingInvites.empty) {
        const inviteRef = pendingInvites.docs[0].ref;
        const inviteData = pendingInvites.docs[0].data() as InviteDoc;
        batch.update(inviteRef, { status: 'accepted', updatedAt: now });
        teamJoined = inviteData.teamName ?? undefined;
      }

      // Record the referral on the new user
      batch.set(
        db.collection(USERS_COLLECTION).doc(userId),
        { referralId: inviterId, referralSource: 'invite_link', referralDetails: code },
        { merge: true }
      );

      await batch.commit();

      // ── Team join (outside the batch; uses its own Firestore operations) ──
      if (teamCode) {
        try {
          const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
          const userData = userDoc.data() as UserDoc | undefined;

          // Staff roles (Coach / Administrative) are added as pending for admin approval.
          // All other roles (Athlete, Parent, Media) join immediately.
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

          logger.info('[POST /invite/accept] User joined team via invite', {
            userId,
            teamCode,
            role: mappedRole,
            pending: joinedAsPending,
          });
        } catch (teamErr) {
          // Non-blocking — if team join fails (e.g. team full), invite is still accepted
          logger.warn('[POST /invite/accept] Team join failed (non-blocking)', {
            userId,
            teamCode,
            error: teamErr instanceof Error ? teamErr.message : String(teamErr),
          });
        }
      }

      logger.info('[POST /invite/accept] Invite accepted', { userId, inviterId, code, teamCode });

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
