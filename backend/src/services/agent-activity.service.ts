/**
 * @fileoverview Agent Activity & Notification Service
 * @module @nxt1/backend/services/agent-activity
 *
 * Convenience wrapper for Agent X task completion notifications.
 * Delegates to the unified `NotificationService.dispatch()` — no direct
 * Firestore writes to `notifications` or `users/{uid}/activity` here.
 *
 * The activity write is the SSOT. Push delivery is best-effort via the
 * onNotificationCreated Cloud Function trigger — if FCM fails, the user
 * still sees the completion in the Activity feed.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentOperationResult, AgentJobPayload } from '@nxt1/core';
import { NOTIFICATION_TYPES } from '@nxt1/core';
import { dispatch, type DispatchResult } from './notification.service.js';
import { logger } from '../utils/logger.js';

// ============================================
// TYPES
// ============================================

export interface AgentActivityInput {
  /** The user receiving the notification */
  readonly userId: string;
  /** The completed job payload */
  readonly job: AgentJobPayload;
  /** The operation result from the agent */
  readonly result: AgentOperationResult;
}

// ============================================
// SERVICE
// ============================================

/**
 * Log a completed Agent X task to the user's activity feed and dispatch a push notification.
 *
 * Delegates to the unified NotificationService so the same push queue,
 * Cloud Function processor, and preference checks are used as every
 * other feature on the platform.
 */
export async function logAgentTaskCompletion(
  db: Firestore,
  input: AgentActivityInput
): Promise<DispatchResult> {
  const { userId, job, result } = input;
  const isWelcome = job.context?.['origin'] === 'registration';
  const title = isWelcome ? 'Welcome to NXT1! 🎨' : buildTitle(result);
  const body = isWelcome
    ? 'Agent X created a personalized welcome graphic just for you.'
    : result.summary || 'Your task has been completed.';
  const deepLink = isWelcome ? '/agent-x' : `/agent-x/chat/${job.sessionId}`;
  const notificationType = isWelcome
    ? NOTIFICATION_TYPES.AGENT_WELCOME
    : NOTIFICATION_TYPES.AI_TASK_COMPLETE;

  // Extract image URL from result data (e.g. generated welcome graphic)
  const imageUrl = (result.data?.['imageUrl'] as string) ?? '';

  const dispatchResult = await dispatch(db, {
    userId,
    type: notificationType,
    title,
    body,
    deepLink,
    data: {
      sessionId: job.sessionId,
      operationId: job.operationId,
      ...(imageUrl ? { imageUrl } : {}),
    },
    source: { userName: 'Agent X' },
    metadata: {
      sessionId: job.sessionId,
      operationId: job.operationId,
      agentId: job.agent,
      resultSummary: result.summary,
      mode: job.context?.['mode'],
      ...(imageUrl ? { imageUrl } : {}),
    },
  });

  logger.info('Agent task activity dispatched via unified service', {
    userId,
    activityId: dispatchResult.activityId,
    notificationId: dispatchResult.notificationId,
    operationId: job.operationId,
    sessionId: job.sessionId,
  });

  return dispatchResult;
}

/**
 * Build a human-readable title from the operation result.
 */
function buildTitle(result: AgentOperationResult): string {
  if (result.summary && result.summary.length <= 65) {
    return `Agent X: ${result.summary}`;
  }
  return 'Agent X: Task Complete';
}
