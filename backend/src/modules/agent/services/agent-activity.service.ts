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
  const notificationCopy = resolveAgentSuccessNotificationCopy({
    threadTitle: threadTitle?.trim() || undefined,
    title: stripMarkdown(result.title ?? ''),
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
 * 2. Multi-task plan: "Completed N tasks: label1, label2, label3."
 * 3. Tool call records: "Completed N steps: tool a, tool b."
 * 4. Empty string (caller falls back to generic copy)
 */
export function deriveBodyFromResult(result: AgentOperationResult): string {
  if (result.summary?.trim()) return result.summary.trim();

  const data =
    typeof result.data === 'object' && result.data !== null
      ? (result.data as Record<string, unknown>)
      : undefined;
  if (!data) return '';

  // Multi-task orchestration path — plan with named tasks
  const plan = data['plan'] as
    | { tasks?: Array<{ displayLabel?: string; description?: string }> }
    | undefined;
  if (plan?.tasks && plan.tasks.length > 0) {
    const taskLabels = plan.tasks
      .map((t) => t.displayLabel ?? t.description)
      .filter((label): label is string => Boolean(label))
      .slice(0, 3)
      .join(', ');
    const count = plan.tasks.length;
    return `Completed ${count} task${count > 1 ? 's' : ''}: ${taskLabels}.`;
  }

  // Delegation fast-exit path — toolCallRecords
  const records = data['toolCallRecords'] as
    | Array<{ toolName?: string; status?: string }>
    | undefined;
  if (records && records.length > 0) {
    const successTools = [
      ...new Set(
        records
          .filter((r) => r.status === 'success')
          .map((r) => r.toolName?.replace(/_/g, ' '))
          .filter((name): name is string => Boolean(name))
      ),
    ];
    if (successTools.length > 0) {
      return successTools.length === 1
        ? `Completed: ${successTools[0]}.`
        : `Completed ${successTools.length} steps: ${successTools.join(', ')}.`;
    }
  }

  return '';
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
