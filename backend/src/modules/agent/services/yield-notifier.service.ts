/**
 * @fileoverview Agent Yield Notifier — Multi-Channel Alerting
 * @module @nxt1/backend/modules/agent/services
 *
 * Dispatches push notifications (and optionally SMS) when Agent X
 * suspends execution and needs user input or approval.
 *
 * Channels:
 * 1. **Push Notification** (always) — Via the unified NotificationService.
 *    Triggers the onNotificationCreated Cloud Function → FCM delivery.
 * 2. **SMS** (opt-in) — Via Twilio, if the user has a verified phone
 *    number and SMS notifications enabled in preferences.
 *
 * The notifier is called by the AgentWorker when it catches an
 * AgentYieldException. It fires-and-forgets — notification delivery
 * must never block or fail the yield serialization.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentYieldReason } from '@nxt1/core';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { dispatch } from '../../../services/notification.service.js';
import { logger } from '../../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface YieldNotification {
  /** The user to notify. */
  readonly userId: string;
  /** Why the agent yielded. */
  readonly reason: AgentYieldReason;
  /** The question or action summary to show. */
  readonly promptToUser: string;
  /** The operation ID for tracking. */
  readonly operationId: string;
  /** The MongoDB thread ID for deep linking. */
  readonly threadId?: string;
  /** The approval request ID (if reason is 'needs_approval'). */
  readonly approvalId?: string;
}

// ─── Notification Dispatch ──────────────────────────────────────────────────

/**
 * Send a push notification (and optionally SMS) to the user when
 * Agent X suspends execution.
 *
 * This is fire-and-forget — errors are logged but never propagated.
 */
export async function notifyYield(db: Firestore, notification: YieldNotification): Promise<void> {
  const { userId, reason, promptToUser, operationId, threadId, approvalId } = notification;

  // ── Push Notification ─────────────────────────────────────────────────
  try {
    const isApproval = reason === 'needs_approval';
    const title = isApproval ? 'Agent X needs your approval' : 'Agent X has a question for you';
    const body = promptToUser.length > 200 ? promptToUser.slice(0, 197) + '...' : promptToUser;

    const deepLink =
      isApproval && approvalId
        ? `/agent-x/approvals/${approvalId}`
        : threadId
          ? `/agent-x?thread=${encodeURIComponent(threadId)}`
          : '/agent-x';

    const notificationType = isApproval
      ? NOTIFICATION_TYPES.AI_NEEDS_APPROVAL
      : NOTIFICATION_TYPES.AI_NEEDS_INPUT;

    await dispatch(db, {
      userId,
      type: notificationType,
      title,
      body,
      deepLink,
      data: {
        operationId,
        reason,
        ...(threadId ? { threadId, sessionId: threadId } : {}),
        ...(approvalId ? { approvalId, entityId: approvalId } : {}),
      },
      source: { userName: 'Agent X' },
      priority: 'high',
    });

    logger.info('Yield push notification dispatched', {
      userId,
      operationId,
      reason,
      notificationType,
    });
  } catch (pushErr) {
    logger.warn('Failed to dispatch yield push notification', {
      userId,
      operationId,
      error: pushErr instanceof Error ? pushErr.message : String(pushErr),
    });
  }

  // ── SMS (Twilio) ──────────────────────────────────────────────────────
  // Only send if the user has opted into SMS and has a verified phone number.
  try {
    await sendYieldSms(db, notification);
  } catch (smsErr) {
    // SMS is strictly best-effort
    logger.warn('Failed to dispatch yield SMS', {
      userId,
      operationId,
      error: smsErr instanceof Error ? smsErr.message : String(smsErr),
    });
  }
}

// ─── SMS Helper ─────────────────────────────────────────────────────────────

/**
 * Send an SMS notification via Twilio when the agent yields.
 *
 * Prerequisites:
 * - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER env vars
 * - User has phone number stored and SMS opt-in in their preferences
 *
 * If any prerequisite is missing, this is a no-op (not an error).
 */
async function sendYieldSms(db: Firestore, notification: YieldNotification): Promise<void> {
  const { userId, reason, promptToUser, operationId } = notification;

  // Check Twilio env vars
  const accountSid = process.env['TWILIO_ACCOUNT_SID'];
  const authToken = process.env['TWILIO_AUTH_TOKEN'];
  const fromNumber = process.env['TWILIO_PHONE_NUMBER'];

  if (!accountSid || !authToken || !fromNumber) {
    // Twilio not configured — silently skip
    return;
  }

  // Look up user's phone number and SMS preference
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return;

  const userData = userDoc.data();
  const phoneNumber = userData?.['phoneNumber'] as string | undefined;
  const smsEnabled = userData?.['notificationPreferences']?.['smsEnabled'] === true;

  if (!phoneNumber || !smsEnabled) return;

  // Build the SMS body
  const isApproval = reason === 'needs_approval';
  const smsBody = isApproval
    ? `[NXT1] Agent X needs your approval: ${promptToUser.slice(0, 120)}. Open the app to review.`
    : `[NXT1] Agent X has a question: ${promptToUser.slice(0, 120)}. Open the app to respond.`;

  // Lazy-import Twilio to avoid cold-start overhead when SMS isn't used
  // @ts-expect-error -- twilio is an optional runtime dependency; types may not be installed
  const twilio = await import('twilio');
  const client = (
    twilio.default as (...args: unknown[]) => {
      messages: { create: (opts: Record<string, string>) => Promise<unknown> };
    }
  )(accountSid, authToken);

  await client.messages.create({
    body: smsBody,
    from: fromNumber,
    to: phoneNumber,
  });

  logger.info('Yield SMS dispatched', {
    userId,
    operationId,
    reason,
  });
}
