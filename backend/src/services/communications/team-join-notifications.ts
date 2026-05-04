/**
 * @fileoverview Team Join Notifications — Org-Level Admin Fan-Out
 * @module @nxt1/backend/services/communications/team-join-notifications
 *
 * Single source of truth for "someone joined a team" notifications.
 *
 * Notifications are ALWAYS dispatched at the ORGANIZATION level, never the
 * team level. Every admin on the organization receives the push + activity
 * entry. This is invoked from BOTH join paths:
 *
 *   1. POST /api/v1/teams/:teamCode/join     (direct join)
 *   2. POST /api/v1/invite/accept            (invite link / QR / referral)
 *
 * Recipient resolution order (deduped):
 *   1. `Organizations/{organizationId}.admins[].userId`
 *   2. `Organizations/{organizationId}.ownerId`               (fallback)
 *   3. `Teams/{teamId}.createdBy`                             (legacy fallback)
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
import { dispatchToMany } from './notification.service.js';
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

    const idempotencyKey = `team_joined_${teamId}_${joinerUid}_${pending ? 'pending' : 'active'}`;

    const dispatched = await dispatchToMany(db, recipients, {
      type,
      title,
      body,
      data: {
        teamId,
        ...(organizationId ? { organizationId } : {}),
        joinerUid,
        pending: String(pending),
        ...(inviterUid ? { inviterUid } : {}),
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

    if (
      recipientSet.size === 0 &&
      typeof orgData?.ownerId === 'string' &&
      orgData.ownerId.length > 0
    ) {
      recipientSet.add(orgData.ownerId);
    }
  }

  // Legacy fallback: pre-Organizations teams only have Teams.createdBy.
  if (
    recipientSet.size === 0 &&
    typeof teamData?.createdBy === 'string' &&
    teamData.createdBy.length > 0
  ) {
    recipientSet.add(teamData.createdBy);
  }

  // Never notify the joiner of their own join.
  recipientSet.delete(excludeUid);

  return {
    organizationId,
    recipients: Array.from(recipientSet),
  };
}
