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
import { NOTIFICATION_TYPES, resolveAgentYieldCopy } from '@nxt1/core';
import { dispatch } from '../../../services/communications/notification.service.js';
import { logger } from '../../../utils/logger.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface YieldNotificationBase {
  /** The user to notify. */
  readonly userId: string;
  /** The operation ID for tracking. */
  readonly operationId: string;
  /** The MongoDB thread ID for deep linking. */
  readonly threadId?: string;
  /** The approval request ID (if reason is 'needs_approval'). */
  readonly approvalId?: string;
  /**
   * Origin of the yield.
   * 'chat' = SSE inline chat (thread-based resume — do NOT call /resume-job).
   * 'worker' = Background BullMQ job (resume via /resume-job/:operationId).
   * When 'chat', the notification deep-links to the thread only.
   */
  readonly origin?: 'chat' | 'worker';
}

export type YieldNotification =
  | (YieldNotificationBase & {
      /** Approval notifications use the structured action summary. */
      readonly reason: 'needs_approval';
      readonly actionSummary: string;
    })
  | (YieldNotificationBase & {
      /** Input notifications still need the exact question text. */
      readonly reason: 'needs_input';
      readonly promptToUser: string;
    });

// ─── Notification Dispatch ──────────────────────────────────────────────────

/**
 * Send a push notification (and optionally SMS) to the user when
 * Agent X suspends execution.
 *
 * This is fire-and-forget — errors are logged but never propagated.
 */
export async function notifyYield(db: Firestore, notification: YieldNotification): Promise<void> {
  const { userId, reason, operationId, threadId, approvalId, origin } = notification;
  const copy =
    reason === 'needs_approval'
      ? resolveAgentYieldCopy({ reason, actionSummary: notification.actionSummary })
      : resolveAgentYieldCopy({ reason, promptToUser: notification.promptToUser });

  // ── Push Notification ─────────────────────────────────────────────────
  try {
    const deepLink = threadId ? `/agent-x?thread=${encodeURIComponent(threadId)}` : '/agent-x';

    const notificationType = NOTIFICATION_TYPES.DYNAMIC_AGENT_ALERT;

    await dispatch(db, {
      userId,
      type: notificationType,
      title: copy.title,
      body: copy.body,
      deepLink,
      data: {
        // For 'chat' origin, omit operationId from action data — the client
        // resumes by sending the next message in the thread, not /resume-job.
        ...(origin !== 'chat' ? { operationId } : {}),
        reason,
        origin: origin ?? 'worker',
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
  const { userId, reason, operationId } = notification;
  const copy =
    reason === 'needs_approval'
      ? resolveAgentYieldCopy({ reason, actionSummary: notification.actionSummary })
      : resolveAgentYieldCopy({ reason, promptToUser: notification.promptToUser });

  // Check Twilio env vars
  const accountSid = process.env['TWILIO_ACCOUNT_SID'];
  const authToken = process.env['TWILIO_AUTH_TOKEN'];
  const fromNumber = process.env['TWILIO_PHONE_NUMBER'];

  if (!accountSid || !authToken || !fromNumber) {
    // Twilio not configured — silently skip
    return;
  }

  // Look up user's phone number and SMS preference
  const userDoc = await db.collection('Users').doc(userId).get();
  if (!userDoc.exists) return;

  const userData = userDoc.data();
  const phoneNumber = userData?.['phoneNumber'] as string | undefined;
  const smsEnabled = userData?.['notificationPreferences']?.['smsEnabled'] === true;

  if (!phoneNumber || !smsEnabled) return;

  // Build the SMS body
  // Lazy-import Twilio to avoid cold-start overhead when SMS isn't used
  // @ts-expect-error -- twilio is an optional runtime dependency; types may not be installed
  const twilio = await import('twilio');
  const client = (
    twilio.default as (...args: unknown[]) => {
      messages: { create: (opts: Record<string, string>) => Promise<unknown> };
    }
  )(accountSid, authToken);

  await client.messages.create({
    body: copy.smsBody,
    from: fromNumber,
    to: phoneNumber,
  });

  logger.info('Yield SMS dispatched', {
    userId,
    operationId,
    reason,
  });
}
