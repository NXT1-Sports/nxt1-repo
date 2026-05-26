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
  resolveAgentFailureNotificationCopy,
  resolveAgentSuccessNotificationCopy,
} from '@nxt1/core';
import { dispatchAgentPush, type DispatchResult } from './agent-push-adapter.service.js';
import { logger } from '../../../utils/logger.js';

export interface AgentActivityInput {
  readonly userId: string;
  readonly job: AgentJobPayload;
  readonly result: AgentOperationResult;
  /** Thread title generated at enqueue time — used as the notification title. */
  readonly threadTitle?: string;
}

export async function logAgentTaskCompletion(
  db: Firestore,
  input: AgentActivityInput
): Promise<DispatchResult> {
  const { userId, job, result, threadTitle } = input;
  const derivedSummary = stripMarkdown(deriveBodyFromResult(result));
  const derivedTitle = stripMarkdown(deriveTitleFromResult(result));
  const notificationCopy = resolveAgentSuccessNotificationCopy({
    threadTitle: threadTitle?.trim() || undefined,
    title: derivedTitle,
    summary: derivedSummary,
  });
  const threadId = job.context?.['threadId'] as string | undefined;

  const imageUrl = (result.data?.['imageUrl'] as string) ?? '';
  const videoUrl = (result.data?.['videoUrl'] as string) ?? '';

  const dispatchResult = await dispatchAgentPush(db, {
    kind: 'agent_task_completed',
    userId,
    operationId: job.operationId,
    sessionId: job.sessionId,
    threadId,
    agentId: job.agent ?? 'router',
    title: notificationCopy.title,
    body: notificationCopy.body,
    outcomeCode: notificationCopy.outcomeCode,
    mode: typeof job.context?.['mode'] === 'string' ? String(job.context['mode']) : undefined,
    origin: job.context?.['origin'] ? String(job.context['origin']) : undefined,
    imageUrl: imageUrl || undefined,
    videoUrl: videoUrl || undefined,
    resultSummary: derivedSummary,
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

  const dispatchResult = await dispatchAgentPush(db, {
    kind: 'agent_task_failed',
    userId,
    operationId: job.operationId,
    sessionId: job.sessionId,
    threadId,
    agentId: job.agent ?? 'router',
    title: notificationCopy.title,
    body: notificationCopy.body,
    outcomeCode: notificationCopy.outcomeCode,
    errorMessage,
  });

  logger.info('Agent action failure notification dispatched', {
    userId,
    activityId: dispatchResult.activityId,
    operationId: job.operationId,
  });

  return dispatchResult;
}

/**
 * Derives a human-readable notification body from an AgentOperationResult.
 *
 * Priority:
 * 1. result.summary — the LLM's direct response (most common path)
 * 2. result.data.response — explicit agent response from orchestration data
 * 3. coordinator/plan observations from successful tool records
 * 4. Empty string (caller falls back to generic copy)
 */
export function deriveBodyFromResult(result: AgentOperationResult): string {
  if (result.summary?.trim()) {
    return sanitizeDerivedNotificationText(result.summary.trim());
  }

  const data =
    typeof result.data === 'object' && result.data !== null
      ? (result.data as Record<string, unknown>)
      : undefined;
  if (!data) return '';

  const response = data['response'];
  if (typeof response === 'string' && response.trim().length > 0) {
    return sanitizeDerivedNotificationText(response.trim());
  }

  const records = data['toolCallRecords'] as
    | Array<{
        toolName?: string;
        status?: string;
        output?: Record<string, unknown>;
      }>
    | undefined;

  if (records && records.length > 0) {
    // Prefer explicit coordinator/plan observations over synthetic tool-name lists.
    // Iterate from newest to oldest so the latest successful dispatch wins.
    for (let i = records.length - 1; i >= 0; i -= 1) {
      const record = records[i];
      if (record.status !== 'success') continue;
      const output = record.output;
      if (!output || typeof output !== 'object') continue;

      const coordinatorObservation = output['coordinator_observation'];
      if (typeof coordinatorObservation === 'string' && coordinatorObservation.trim().length > 0) {
        const cleaned = sanitizeDerivedNotificationText(coordinatorObservation.trim());
        if (cleaned.length > 0) return cleaned;
      }

      const planObservation = output['plan_observation'];
      if (typeof planObservation === 'string' && planObservation.trim().length > 0) {
        const cleaned = sanitizeDerivedNotificationText(planObservation.trim());
        if (cleaned.length > 0) return cleaned;
      }
    }
  }

  return '';
}

function deriveTitleFromResult(result: AgentOperationResult): string {
  if (result.title?.trim()) {
    return result.title.trim();
  }

  const data =
    typeof result.data === 'object' && result.data !== null
      ? (result.data as Record<string, unknown>)
      : undefined;

  const notificationTitle = data?.['notificationTitle'];
  return typeof notificationTitle === 'string' ? notificationTitle.trim() : '';
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

function sanitizeDerivedNotificationText(text: string): string {
  if (!text) return '';

  let cleaned = text.replace(/\s+/g, ' ').trim();

  // Remove internal orchestration boilerplate that should never surface to users.
  cleaned = cleaned.replace(/^[a-z_]+\s+dispatch\s+result\s*[-:]\s*/i, '');
  cleaned = cleaned.replace(/^dispatch\s+result\s*[-:]\s*/i, '');
  cleaned = cleaned.replace(/^✅\s*/, '');
  cleaned = cleaned.replace(/^[a-z_]+\d+\s*:\s*/i, '');

  if (/dispatch\s+result/i.test(cleaned) && /coordinator/i.test(cleaned)) {
    return '';
  }

  return cleaned.trim();
}
