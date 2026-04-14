/**
 * @fileoverview Agent Activity & Notification Service
 * @module @nxt1/backend/services/agent-activity
 *
 * Unified dispatcher for ALL Agent X notifications. Every agent output —
 * whether it's a welcome graphic, daily briefing, coach-reply analysis,
 * or a generated highlight reel — flows through a single `AGENT_ACTION`
 * notification type.
 *
 * Title, body, and media are derived dynamically from the operation result
 * so the AI controls its own notification copy. No hardcoded strings.
 *
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
 * Log a completed Agent X action to the user's activity feed and dispatch
 * a push notification.
 *
 * Title and body are built dynamically from the operation result. The title
 * comes from a dedicated AI-generated short title, while the summary powers
 * the body copy. No special-case branching for welcome,
 * briefing, or any other action type.
 */
export async function logAgentTaskCompletion(
  db: Firestore,
  input: AgentActivityInput
): Promise<DispatchResult> {
  const { userId, job, result } = input;
  const title = buildTitle(result);
  const body = buildBody(result);
  const threadId = job.context?.['threadId'] as string | undefined;
  const deepLink = threadId ? `/agent-x?thread=${encodeURIComponent(threadId)}` : '/agent-x';

  // Extract media URLs from result data (e.g. generated graphics, highlight reels)
  const imageUrl = (result.data?.['imageUrl'] as string) ?? '';
  const videoUrl = (result.data?.['videoUrl'] as string) ?? '';

  const dispatchResult = await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.AGENT_ACTION,
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
      resultTitle: stripMarkdown(result.title ?? ''),
      resultSummary: stripMarkdown(result.summary),
      mode: job.context?.['mode'],
      ...(imageUrl ? { imageUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
    },
  });

  logger.info('Agent action dispatched via unified service', {
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
 * Notify the user that an Agent X action failed.
 * The user sees this in their activity feed so they know something
 * went wrong (instead of just silence).
 */
export async function logAgentTaskFailure(
  db: Firestore,
  input: AgentFailureInput
): Promise<DispatchResult> {
  const { userId, job, errorMessage } = input;

  const title = 'Agent X ran into an issue';
  const body =
    errorMessage.length <= 100
      ? `${errorMessage} Tap to retry.`
      : 'Something went wrong with your request. Tap to retry.';
  const threadId = job.context?.['threadId'] as string | undefined;
  const deepLink = threadId ? `/agent-x?thread=${encodeURIComponent(threadId)}` : '/agent-x';

  const dispatchResult = await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.AGENT_ACTION,
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

  logger.info('Agent action failure notification dispatched', {
    userId,
    activityId: dispatchResult.activityId,
    operationId: job.operationId,
  });

  return dispatchResult;
}

// ============================================
// DYNAMIC TITLE & BODY BUILDERS
// ============================================

/**
 * Removes markdown syntax to generate clean plain text.
 * Essential for mobile OS push notifications to look proper on lock screens.
 */
function stripMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/^#{1,6}\s+/gm, '') // Remove headers (e.g. "## Analysis")
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // Remove bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // Remove italic
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/```[\s\S]*?```/g, '') // Remove entire code blocks
    .replace(/^>\s+/gm, '') // Remove blockquotes
    .replace(/^(?:-{3,}|\*{3,}|_{3,})$/gm, '') // Remove horizontal rules
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1') // Extract text from links/images
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .trim();
}

/**
 * Build a concise push-notification title from the AI-generated operation title.
 */
function buildTitle(result: AgentOperationResult): string {
  const cleanTitle = stripMarkdown(result.title ?? '');
  return cleanTitle || 'Agent X Update';
}

/**
 * Build the notification body from the result (used by push notifications).
 * Prefers the agent's own description, falls back gracefully.
 */
function buildBody(result: AgentOperationResult): string {
  const cleanSummary = stripMarkdown(result.summary);
  if (!cleanSummary) {
    return 'Open Agent X to review it.';
  }

  const cleanTitle = stripMarkdown(result.title ?? '');
  if (cleanTitle && cleanSummary.toLowerCase() === cleanTitle.toLowerCase()) {
    return 'Open Agent X to review it.';
  }

  return cleanSummary;
}
