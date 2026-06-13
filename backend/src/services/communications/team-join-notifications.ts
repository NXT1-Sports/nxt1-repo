/**
 * @fileoverview Team Join Notifications — Team Membership Fan-Out
 * @module @nxt1/backend/services/communications/team-join-notifications
 *
 * Single source of truth for "someone joined a team" notifications.
 *
 * Notifications are dispatched to every organization admin plus active
 * team-level managers/coaches so the people who can act on roster requests
 * receive the push + activity entry. This is invoked from BOTH join paths:
 *
 *   1. POST /api/v1/teams/:teamCode/join     (direct join)
 *   2. POST /api/v1/invite/accept            (invite link / QR / referral)
 *
 * Recipient resolution order (deduped):
 *   1. `Organizations/{organizationId}.admins[].userId`
 *   2. `Organizations/{organizationId}.ownerId`
 *   3. Active manager roles in `RosterEntries`
 *   4. `Teams/{teamId}.createdBy`                             (legacy fallback)
 *
 * The joiner is always excluded from recipients.
 *
 * Notification type:
 *   - PENDING staff (Coach/Administrative awaiting approval) → `team_join_request`
 *   - ACTIVE member                                          → `team_member_joined`
 *
 * Idempotency: keyed on `{teamId}_{joinerId}_{pending|active}` so retries and
 * the dual-path race (e.g. /invite/accept after onboarding pre-creates a
 * RosterEntry) cannot duplicate the alert within a 5-minute window.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { dispatch, dispatchToMany } from './notification.service.js';
import { canManageTeamMembershipForRole } from '../team/team-intel-permissions.js';
import { logger } from '../../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface NotifyTeamJoinedInput {
  /** Team primary key (Teams/{id}) */
  readonly teamId: string;
  /** Display name of the team (used in notification copy) */
  readonly teamName: string;
  /** Organization the team belongs to. If omitted, resolved from Teams doc. */
  readonly organizationId?: string;
  /** UID of the user who just joined / requested to join */
  readonly joinerUid: string;
  /** Display name of the joiner (used in notification copy) */
  readonly joinerName: string;
  /** Optional avatar URL for the activity feed source block */
  readonly joinerAvatarUrl?: string | null;
  /**
   * If true, the joiner is a staff role (Coach / Administrative) added with
   * PENDING status awaiting admin approval. Triggers `team_join_request`
   * instead of `team_member_joined` and uses approval-prompt copy.
   */
  readonly pending: boolean;
  /**
   * Optional inviter UID — included as metadata for audit trails. Has no
   * effect on recipient resolution (admins are always sourced from the org).
   */
  readonly inviterUid?: string;
}

export interface NotifyTeamJoinedResult {
  readonly recipientCount: number;
  readonly dispatchedCount: number;
  readonly organizationId: string | null;
}

export interface NotifyMembershipApprovedInput {
  /** Team primary key (Teams/{id}) */
  readonly teamId: string;
  /** UID of the approved user */
  readonly userId: string;
  /** UID of the team admin who approved the request */
  readonly approvedBy: string;
  /** Optional display name of the team. If omitted, resolved from Teams doc. */
  readonly teamName?: string;
}

export interface NotifyMembershipApprovedResult {
  readonly dispatched: boolean;
  readonly notificationId: string | null;
}

export interface NotifyMembershipRemovedInput {
  readonly teamId: string;
  readonly userId: string;
  readonly removedBy: string;
  readonly teamName?: string;
  readonly memberName?: string;
}

export interface NotifyMembershipRemovedResult {
  readonly removedUserNotified: boolean;
  readonly managerNotified: boolean;
}

// ============================================
// SERVICE
// ============================================

/**
 * Notify every admin on a team's organization that a new member joined or
 * requested to join.
 *
 * Fire-and-forget safe: never throws. Failures are logged. Caller should
 * still wrap in `void (...).catch(...)` for defense-in-depth.
 */
export async function notifyTeamJoined(
  db: Firestore,
  input: NotifyTeamJoinedInput
): Promise<NotifyTeamJoinedResult> {
  const { teamId, teamName, joinerUid, joinerName, joinerAvatarUrl, pending, inviterUid } = input;

  try {
    const { organizationId, recipients } = await resolveOrgAdminRecipients(db, {
      teamId,
      organizationId: input.organizationId,
      excludeUid: joinerUid,
    });

    if (recipients.length === 0) {
      logger.warn('[notifyTeamJoined] No admin recipients resolved — skipping', {
        teamId,
        organizationId,
        joinerUid,
      });
      return { recipientCount: 0, dispatchedCount: 0, organizationId };
    }

    const type = pending
      ? NOTIFICATION_TYPES.TEAM_JOIN_REQUEST
      : NOTIFICATION_TYPES.TEAM_MEMBER_JOINED;

    const title = pending
      ? `${joinerName} requested to join ${teamName}`
      : `${joinerName} joined ${teamName}`;

    const body = pending
      ? `Tap to review and approve the request.`
      : `A new member is now on your roster.`;

    const initialFilter = pending ? 'pending' : 'roster';
    const deepLink = `/activity?manageMembersTeamId=${encodeURIComponent(
      teamId
    )}&filter=${initialFilter}`;
    const idempotencyKey = `team_joined_${teamId}_${joinerUid}_${pending ? 'pending' : 'active'}`;

    const dispatched = await dispatchToMany(db, recipients, {
      type,
      title,
      body,
      deepLink,
      data: {
        teamId,
        manageMembersTeamId: teamId,
        manageMembersFilter: initialFilter,
        ...(organizationId ? { organizationId } : {}),
        joinerUid,
        pending: String(pending),
        ...(inviterUid ? { inviterUid } : {}),
      },
      metadata: {
        navigationTarget: 'manage-members',
        teamId,
        initialFilter,
      },
      source: {
        userId: joinerUid,
        userName: joinerName,
        teamName,
        ...(joinerAvatarUrl ? { avatarUrl: joinerAvatarUrl } : {}),
      },
      idempotencyKey,
    });

    logger.info('[notifyTeamJoined] Dispatched org-level join notification', {
      teamId,
      organizationId,
      joinerUid,
      pending,
      recipientCount: recipients.length,
      dispatchedCount: dispatched.length,
    });

    return {
      recipientCount: recipients.length,
      dispatchedCount: dispatched.length,
      organizationId,
    };
  } catch (err) {
    logger.error('[notifyTeamJoined] Failed to dispatch notification', {
      teamId,
      joinerUid,
      pending,
      error: err instanceof Error ? err.message : String(err),
    });
    return { recipientCount: 0, dispatchedCount: 0, organizationId: null };
  }
}

/**
 * Notify a user that a pending team membership request was approved.
 * Fire-and-forget safe: never throws. Failures are logged and returned.
 */
export async function notifyMembershipApproved(
  db: Firestore,
  input: NotifyMembershipApprovedInput
): Promise<NotifyMembershipApprovedResult> {
  const { teamId, userId, approvedBy } = input;

  try {
    const teamName = input.teamName ?? (await resolveTeamName(db, teamId)) ?? 'your team';
    const result = await dispatch(db, {
      userId,
      type: NOTIFICATION_TYPES.TEAM_MEMBER_JOINED,
      title: `You're on ${teamName}`,
      body: `Your request to join ${teamName} was accepted.`,
      deepLink: '',
      data: {
        teamId,
        approvedBy,
      },
      source: { teamName },
      idempotencyKey: `team_membership_approved_${teamId}_${userId}`,
    });

    logger.info('[notifyMembershipApproved] Dispatched approval notification', {
      teamId,
      userId,
      approvedBy,
      notificationId: result.notificationId,
    });

    return { dispatched: true, notificationId: result.notificationId };
  } catch (err) {
    logger.error('[notifyMembershipApproved] Failed to dispatch approval notification', {
      teamId,
      userId,
      approvedBy,
      error: err instanceof Error ? err.message : String(err),
    });
    return { dispatched: false, notificationId: null };
  }
}

/**
 * Notify the removed member and, when relevant, the team owner/creator that a
 * membership ended. Used for both admin removals and self-leave flows.
 */
export async function notifyMembershipRemoved(
  db: Firestore,
  input: NotifyMembershipRemovedInput
): Promise<NotifyMembershipRemovedResult> {
  const { teamId, userId, removedBy } = input;

  try {
    const teamName = input.teamName ?? (await resolveTeamName(db, teamId)) ?? 'the team';
    const isSelfLeave = userId === removedBy;
    let removedUserNotified = false;
    let managerNotified = false;

    if (!isSelfLeave) {
      await dispatch(db, {
        userId,
        type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
        title: `You were removed from ${teamName}`,
        body: `Your membership in ${teamName} was updated by a team admin.`,
        deepLink: '/activity',
        data: { teamId, removedBy },
        source: { teamName },
        idempotencyKey: `team_member_removed_${teamId}_${userId}_${removedBy}`,
      });
      removedUserNotified = true;
    }

    const teamSnap = await db.collection('Teams').doc(teamId).get();
    const rawManagerUserId = teamSnap.data()?.['createdBy'];
    const managerUserId =
      typeof rawManagerUserId === 'string' && rawManagerUserId.trim().length > 0
        ? rawManagerUserId.trim()
        : null;

    if (managerUserId && managerUserId !== removedBy && managerUserId !== userId) {
      const memberName = input.memberName?.trim() || 'A member';
      await dispatch(db, {
        userId: managerUserId,
        type: NOTIFICATION_TYPES.TEAM_MEMBER_LEFT,
        title: isSelfLeave ? 'A member left your team' : 'A member was removed from your team',
        body: isSelfLeave
          ? `${memberName} left ${teamName}.`
          : `${memberName} was removed from ${teamName}.`,
        deepLink: '/activity',
        data: { teamId, memberUserId: userId, removedBy },
        source: { teamName },
        idempotencyKey: `team_member_left_manager_${teamId}_${userId}_${isSelfLeave ? 'self' : 'admin'}`,
      });
      managerNotified = true;
    }

    logger.info('[notifyMembershipRemoved] Dispatched membership removal notification', {
      teamId,
      userId,
      removedBy,
      removedUserNotified,
      managerNotified,
    });

    return { removedUserNotified, managerNotified };
  } catch (err) {
    logger.error('[notifyMembershipRemoved] Failed to dispatch membership removal notification', {
      teamId,
      userId,
      removedBy,
      error: err instanceof Error ? err.message : String(err),
    });
    return { removedUserNotified: false, managerNotified: false };
  }
}

// ============================================
// HELPERS
// ============================================

interface ResolveAdminsArgs {
  readonly teamId: string;
  readonly organizationId?: string;
  readonly excludeUid: string;
}

interface ResolveAdminsResult {
  readonly organizationId: string | null;
  readonly recipients: readonly string[];
}

/**
 * Resolve the full list of org-level admin UIDs to notify, deduped and with
 * the joining user filtered out.
 *
 * Falls back to `Teams.createdBy` only when the team has no organization or
 * the organization has no admins — covers legacy teams created before the
 * Organizations collection existed.
 */
async function resolveOrgAdminRecipients(
  db: Firestore,
  { teamId, organizationId: passedOrgId, excludeUid }: ResolveAdminsArgs
): Promise<ResolveAdminsResult> {
  // Always re-read the team to ensure organizationId / createdBy are current.
  const teamSnap = await db.collection('Teams').doc(teamId).get();
  const teamData = teamSnap.data() as { organizationId?: string; createdBy?: string } | undefined;

  const organizationId =
    (passedOrgId && passedOrgId.length > 0 ? passedOrgId : undefined) ??
    (typeof teamData?.organizationId === 'string' && teamData.organizationId.length > 0
      ? teamData.organizationId
      : undefined) ??
    null;

  const recipientSet = new Set<string>();

  if (organizationId) {
    const orgSnap = await db.collection('Organizations').doc(organizationId).get();
    const orgData = orgSnap.data() as
      | {
          admins?: Array<{ userId?: string }>;
          ownerId?: string;
        }
      | undefined;

    if (Array.isArray(orgData?.admins)) {
      for (const admin of orgData.admins) {
        if (typeof admin?.userId === 'string' && admin.userId.length > 0) {
          recipientSet.add(admin.userId);
        }
      }
    }

    if (typeof orgData?.ownerId === 'string' && orgData.ownerId.length > 0) {
      recipientSet.add(orgData.ownerId);
    }
  }

  const managerIds = await resolveActiveTeamManagerRecipients(db, teamId);
  for (const managerId of managerIds) {
    recipientSet.add(managerId);
  }

  // Legacy fallback: pre-Organizations teams only have Teams.createdBy. Keep it
  // included for current teams too because this is often the acting coach.
  if (typeof teamData?.createdBy === 'string' && teamData.createdBy.length > 0) {
    recipientSet.add(teamData.createdBy);
  }

  // Never notify the joiner of their own join.
  recipientSet.delete(excludeUid);

  return {
    organizationId,
    recipients: Array.from(recipientSet),
  };
}

async function resolveActiveTeamManagerRecipients(
  db: Firestore,
  teamId: string
): Promise<readonly string[]> {
  const snapshot = await db
    .collection('RosterEntries')
    .where('teamId', '==', teamId)
    .where('status', '==', 'active')
    .get();

  const recipients = new Set<string>();

  for (const doc of snapshot.docs) {
    const data = doc.data() as { userId?: string; role?: string | null };
    if (typeof data.userId !== 'string' || data.userId.length === 0) continue;
    if (!canManageTeamMembershipForRole(data.role)) continue;
    recipients.add(data.userId);
  }

  return Array.from(recipients);
}

async function resolveTeamName(db: Firestore, teamId: string): Promise<string | null> {
  const teamSnap = await db.collection('Teams').doc(teamId).get();
  const data = teamSnap.data() as { teamName?: string; name?: string } | undefined;
  return data?.teamName ?? data?.name ?? null;
}
