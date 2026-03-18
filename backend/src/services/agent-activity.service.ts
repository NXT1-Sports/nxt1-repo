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
  const threadId = job.context?.['threadId'] as string | undefined;
  const deepLink = threadId ? `/agent-x?thread=${encodeURIComponent(threadId)}` : '/agent-x';
  const notificationType = isWelcome
    ? NOTIFICATION_TYPES.AGENT_WELCOME
    : NOTIFICATION_TYPES.AI_TASK_COMPLETE;

  // Extract media URLs from result data (e.g. generated graphics, highlight reels)
  const imageUrl = (result.data?.['imageUrl'] as string) ?? '';
  const videoUrl = (result.data?.['videoUrl'] as string) ?? '';

  const dispatchResult = await dispatch(db, {
    userId,
    type: notificationType,
    title,
    body,
    deepLink,
    ...(imageUrl ? { mediaUrl: imageUrl, mediaType: 'image' as const } : {}),
    ...(videoUrl && !imageUrl ? { mediaUrl: videoUrl, mediaType: 'video' as const } : {}),
    data: {
      sessionId: job.sessionId,
      operationId: job.operationId,
      ...(threadId ? { threadId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
    },
    source: { userName: 'Agent X' },
    metadata: {
      sessionId: job.sessionId,
      ...(threadId ? { threadId } : {}),
      operationId: job.operationId,
      agentId: job.agent,
      resultSummary: result.summary,
      mode: job.context?.['mode'],
      ...(imageUrl ? { imageUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
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

// ============================================
// FAILURE NOTIFICATION
// ============================================

export interface AgentFailureInput {
  /** The user receiving the notification */
  readonly userId: string;
  /** The failed job payload */
  readonly job: AgentJobPayload;
  /** Human-readable error message */
  readonly errorMessage: string;
}

/**
 * Notify the user that an Agent X task failed.
 * The user sees this in their activity feed so they know something
 * went wrong (instead of just silence).
 */
export async function logAgentTaskFailure(
  db: Firestore,
  input: AgentFailureInput
): Promise<DispatchResult> {
  const { userId, job, errorMessage } = input;
  const isWelcome = job.context?.['origin'] === 'registration';

  const title = 'Agent X: Task Issue';
  const body = isWelcome
    ? "We couldn't generate your welcome graphic right now. Tap to try again."
    : `Something went wrong with your request. ${errorMessage.length <= 80 ? errorMessage : 'Tap to retry.'}`;
  const threadId = job.context?.['threadId'] as string | undefined;
  const deepLink = threadId ? `/agent-x?thread=${encodeURIComponent(threadId)}` : '/agent-x';

  const dispatchResult = await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.AI_TASK_COMPLETE,
    title,
    body,
    deepLink,
    data: {
      sessionId: job.sessionId,
      operationId: job.operationId,
      ...(threadId ? { threadId } : {}),
      failed: 'true',
    },
    source: { userName: 'Agent X' },
    metadata: {
      sessionId: job.sessionId,
      ...(threadId ? { threadId } : {}),
      operationId: job.operationId,
      agentId: job.agent,
      failed: true,
      errorMessage,
    },
  });

  logger.info('Agent task failure notification dispatched', {
    userId,
    activityId: dispatchResult.activityId,
    operationId: job.operationId,
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
