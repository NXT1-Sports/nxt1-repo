/**
 * @fileoverview Agent Activity & Notification Service
 * @module @nxt1/backend/modules/agent/services/agent-activity
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
 * Firestore writes to `Notifications` or `users/{uid}/activity` here.
 *
 * The activity write is the SSOT. Push delivery is best-effort via the
 * onNotificationCreated Cloud Function trigger — if FCM fails, the user
 * still sees the completion in the Activity feed.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { AgentJobPayload, AgentOperationResult } from '@nxt1/core';
import {
  NOTIFICATION_TYPES,
  resolveAgentFailureNotificationCopy,
  resolveAgentSuccessNotificationCopy,
} from '@nxt1/core';
import {
  dispatch,
  type DispatchResult,
} from '../../../services/communications/notification.service.js';
import { logger } from '../../../utils/logger.js';

export interface AgentActivityInput {
  readonly userId: string;
  readonly job: AgentJobPayload;
  readonly result: AgentOperationResult;
}

export async function logAgentTaskCompletion(
  db: Firestore,
  input: AgentActivityInput
): Promise<DispatchResult> {
  const { userId, job, result } = input;
  const notificationCopy = resolveAgentSuccessNotificationCopy({
    title: stripMarkdown(result.title ?? ''),
    summary: stripMarkdown(result.summary),
  });
  const threadId = job.context?.['threadId'] as string | undefined;
  const deepLink = threadId ? `/agent-x?thread=${encodeURIComponent(threadId)}` : '/agent-x';

  const imageUrl = (result.data?.['imageUrl'] as string) ?? '';
  const videoUrl = (result.data?.['videoUrl'] as string) ?? '';

  const dispatchResult = await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.AGENT_ACTION,
    title: notificationCopy.title,
    body: notificationCopy.body,
    deepLink,
    ...(imageUrl ? { mediaUrl: imageUrl, mediaType: 'image' as const } : {}),
    ...(videoUrl && !imageUrl ? { mediaUrl: videoUrl, mediaType: 'video' as const } : {}),
    data: {
      sessionId: job.sessionId,
      operationId: job.operationId,
      ...(threadId ? { threadId } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(videoUrl ? { videoUrl } : {}),
      ...(job.context?.['origin'] ? { origin: String(job.context['origin']) } : {}),
    },
    source: { userName: 'Agent X' },
    metadata: {
      sessionId: job.sessionId,
      ...(threadId ? { threadId } : {}),
      operationId: job.operationId,
      agentId: job.agent,
      resultTitle: stripMarkdown(result.title ?? ''),
      resultSummary: stripMarkdown(result.summary),
      outcomeCode: notificationCopy.outcomeCode,
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

export interface AgentFailureInput {
  readonly userId: string;
  readonly job: AgentJobPayload;
  readonly errorMessage: string;
}

export async function logAgentTaskFailure(
  db: Firestore,
  input: AgentFailureInput
): Promise<DispatchResult> {
  const { userId, job, errorMessage } = input;
  const notificationCopy = resolveAgentFailureNotificationCopy(errorMessage);
  const threadId = job.context?.['threadId'] as string | undefined;
  const deepLink = threadId ? `/agent-x?thread=${encodeURIComponent(threadId)}` : '/agent-x';

  const dispatchResult = await dispatch(db, {
    userId,
    type: NOTIFICATION_TYPES.AGENT_ACTION,
    title: notificationCopy.title,
    body: notificationCopy.body,
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
      outcomeCode: notificationCopy.outcomeCode,
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

function stripMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/^(?:-{3,}|\*{3,}|_{3,})$/gm, '')
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .trim();
}
