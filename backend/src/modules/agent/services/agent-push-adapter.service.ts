import type { Firestore } from 'firebase-admin/firestore';
import type { AgentPushIntent, DispatchNotificationInput } from '@nxt1/core';
import { AGENT_PUSH_INTENT_KINDS, NOTIFICATION_TYPES } from '@nxt1/core';
import {
  dispatch,
  type DispatchResult,
} from '../../../services/communications/notification.service.js';

export type { DispatchResult };
import { logger } from '../../../utils/logger.js';

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireNonEmpty(value: unknown, field: string): string {
  if (!isNonEmpty(value)) {
    throw new Error(`Invalid agent push intent: ${field} is required`);
  }
  return value.trim();
}

function encodeThreadDeepLink(threadId?: string): string {
  if (!threadId) return '/agent-x';
  return `/agent-x?thread=${encodeURIComponent(threadId)}`;
}

function sanitizeIdempotencyKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
}

function validateIntent(intent: AgentPushIntent): void {
  requireNonEmpty(intent.userId, 'userId');
  requireNonEmpty(intent.operationId, 'operationId');

  if (intent.threadId !== undefined && !isNonEmpty(intent.threadId)) {
    throw new Error('Invalid agent push intent: threadId must be non-empty when provided');
  }

  switch (intent.kind) {
    case AGENT_PUSH_INTENT_KINDS.TASK_COMPLETED:
      requireNonEmpty(intent.sessionId, 'sessionId');
      requireNonEmpty(intent.agentId, 'agentId');
      requireNonEmpty(intent.title, 'title');
      requireNonEmpty(intent.body, 'body');
      return;
    case AGENT_PUSH_INTENT_KINDS.TASK_FAILED:
      requireNonEmpty(intent.sessionId, 'sessionId');
      requireNonEmpty(intent.agentId, 'agentId');
      requireNonEmpty(intent.title, 'title');
      requireNonEmpty(intent.body, 'body');
      requireNonEmpty(intent.errorMessage, 'errorMessage');
      return;
    case AGENT_PUSH_INTENT_KINDS.NEEDS_INPUT:
      requireNonEmpty(intent.title, 'title');
      requireNonEmpty(intent.body, 'body');
      return;
    case AGENT_PUSH_INTENT_KINDS.NEEDS_APPROVAL:
      requireNonEmpty(intent.title, 'title');
      requireNonEmpty(intent.body, 'body');
      requireNonEmpty(intent.approvalId, 'approvalId');
      return;
    case AGENT_PUSH_INTENT_KINDS.PLAYBOOK_READY:
    case AGENT_PUSH_INTENT_KINDS.BRIEFING_READY:
    case AGENT_PUSH_INTENT_KINDS.WEEKLY_RECAP_READY:
    case AGENT_PUSH_INTENT_KINDS.PLAYBOOK_NUDGE:
      requireNonEmpty(intent.title, 'title');
      requireNonEmpty(intent.body, 'body');
      return;
    case AGENT_PUSH_INTENT_KINDS.SCHEDULED_EXECUTION_COMPLETED:
      requireNonEmpty(intent.title, 'title');
      requireNonEmpty(intent.body, 'body');
      requireNonEmpty(intent.scheduleId, 'scheduleId');
      requireNonEmpty(intent.runId, 'runId');
      return;
    case AGENT_PUSH_INTENT_KINDS.SCHEDULED_EXECUTION_FAILED:
      requireNonEmpty(intent.title, 'title');
      requireNonEmpty(intent.body, 'body');
      requireNonEmpty(intent.scheduleId, 'scheduleId');
      requireNonEmpty(intent.runId, 'runId');
      requireNonEmpty(intent.errorMessage, 'errorMessage');
      return;
    case AGENT_PUSH_INTENT_KINDS.APPROVAL_EXPIRING_SOON:
      requireNonEmpty(intent.title, 'title');
      requireNonEmpty(intent.body, 'body');
      requireNonEmpty(intent.approvalId, 'approvalId');
      requireNonEmpty(intent.toolName, 'toolName');
      return;
    default:
      throw new Error(
        `Invalid agent push intent: unsupported kind ${(intent as { kind?: string }).kind}`
      );
  }
}

export function toDispatchInput(intent: AgentPushIntent): DispatchNotificationInput {
  validateIntent(intent);

  switch (intent.kind) {
    case AGENT_PUSH_INTENT_KINDS.TASK_COMPLETED:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: intent.title,
        body: intent.body,
        deepLink: encodeThreadDeepLink(intent.threadId),
        ...(intent.imageUrl ? { mediaUrl: intent.imageUrl, mediaType: 'image' as const } : {}),
        ...(intent.videoUrl && !intent.imageUrl
          ? { mediaUrl: intent.videoUrl, mediaType: 'video' as const }
          : {}),
        data: {
          sessionId: intent.sessionId,
          operationId: intent.operationId,
          ...(intent.threadId ? { threadId: intent.threadId } : {}),
          ...(intent.imageUrl ? { imageUrl: intent.imageUrl } : {}),
          ...(intent.videoUrl ? { videoUrl: intent.videoUrl } : {}),
          ...(intent.origin ? { origin: intent.origin } : {}),
        },
        source: { userName: 'Agent X' },
        metadata: {
          sessionId: intent.sessionId,
          ...(intent.threadId ? { threadId: intent.threadId } : {}),
          operationId: intent.operationId,
          agentId: intent.agentId,
          resultTitle: intent.title,
          resultSummary: intent.resultSummary ?? intent.body,
          outcomeCode: intent.outcomeCode,
          mode: intent.mode,
          ...(intent.imageUrl ? { imageUrl: intent.imageUrl } : {}),
          ...(intent.videoUrl ? { videoUrl: intent.videoUrl } : {}),
        },
      };
    case AGENT_PUSH_INTENT_KINDS.TASK_FAILED:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: intent.title,
        body: intent.body,
        deepLink: encodeThreadDeepLink(intent.threadId),
        data: {
          sessionId: intent.sessionId,
          operationId: intent.operationId,
          ...(intent.threadId ? { threadId: intent.threadId } : {}),
          failed: 'true',
        },
        source: { userName: 'Agent X' },
        metadata: {
          sessionId: intent.sessionId,
          ...(intent.threadId ? { threadId: intent.threadId } : {}),
          operationId: intent.operationId,
          agentId: intent.agentId,
          outcomeCode: intent.outcomeCode,
          failed: true,
          errorMessage: intent.errorMessage,
        },
      };
    case AGENT_PUSH_INTENT_KINDS.NEEDS_INPUT:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.DYNAMIC_AGENT_ALERT,
        title: intent.title,
        body: intent.body,
        deepLink: encodeThreadDeepLink(intent.threadId),
        data: {
          ...(intent.origin !== 'chat' ? { operationId: intent.operationId } : {}),
          reason: intent.reason,
          origin: intent.origin ?? 'worker',
          ...(intent.threadId ? { threadId: intent.threadId, sessionId: intent.threadId } : {}),
          ...(intent.approvalId
            ? { approvalId: intent.approvalId, entityId: intent.approvalId }
            : {}),
          ...(intent.sessionId ? { agentSessionId: intent.sessionId } : {}),
        },
        source: { userName: 'Agent X' },
        priority: 'high',
      };
    case AGENT_PUSH_INTENT_KINDS.NEEDS_APPROVAL:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.DYNAMIC_AGENT_ALERT,
        title: intent.title,
        body: intent.body,
        deepLink: encodeThreadDeepLink(intent.threadId),
        data: {
          operationId: intent.operationId,
          reason: intent.reason,
          origin: intent.origin ?? 'worker',
          approvalId: intent.approvalId,
          ...(intent.toolName ? { toolName: intent.toolName } : {}),
          ...(intent.threadId ? { threadId: intent.threadId } : {}),
          ...(intent.sessionId ? { sessionId: intent.sessionId } : {}),
          entityId: intent.approvalId,
        },
        source: { userName: 'Agent X' },
        priority: 'high',
      };
    case AGENT_PUSH_INTENT_KINDS.PLAYBOOK_READY:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: intent.title,
        body: intent.body,
        deepLink: '/agent-x?tab=playbook',
        data: {
          operationId: intent.operationId,
          tab: 'playbook',
        },
        source: { userName: 'Agent X' },
        metadata: {
          agentId: 'playbook_planner',
          resultTitle: intent.title,
          resultSummary: intent.body,
          operationId: intent.operationId,
          mode: 'playbook',
        },
      };
    case AGENT_PUSH_INTENT_KINDS.BRIEFING_READY:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: intent.title,
        body: intent.body,
        deepLink: '/agent-x',
        data: {
          operationId: intent.operationId,
        },
        source: { userName: 'Agent X' },
        metadata: {
          agentId: 'daily_briefing',
          resultTitle: intent.title,
          resultSummary: intent.body,
          operationId: intent.operationId,
          mode: 'briefing',
        },
      };
    case AGENT_PUSH_INTENT_KINDS.WEEKLY_RECAP_READY:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: intent.title,
        body: intent.body,
        deepLink: '/agent-x',
        source: { userName: 'Agent X' },
        metadata: {
          agentId: 'weekly_recap',
          resultTitle: `Week ${intent.recapNumber} Recap`,
          mode: 'recap',
          operationId: intent.operationId,
          recapNumber: intent.recapNumber,
        },
      };
    case AGENT_PUSH_INTENT_KINDS.PLAYBOOK_NUDGE:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: intent.title,
        body: intent.body,
        deepLink: '/agent-x?tab=playbook',
        data: { tab: 'playbook', nudge: 'playbook-progress', operationId: intent.operationId },
        source: { userName: 'Agent X' },
        metadata: {
          agentId: 'playbook_nudge',
          resultTitle: intent.title,
          resultSummary: intent.body,
          mode: 'playbook',
          operationId: intent.operationId,
        },
      };
    case AGENT_PUSH_INTENT_KINDS.SCHEDULED_EXECUTION_COMPLETED:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: intent.title,
        body: intent.body,
        deepLink: encodeThreadDeepLink(intent.threadId),
        data: {
          operationId: intent.operationId,
          scheduleId: intent.scheduleId,
          runId: intent.runId,
          scheduledExecutionStatus: 'completed',
          entityId: intent.runId,
        },
        source: { userName: 'Agent X' },
        metadata: {
          agentId: 'scheduled_execution',
          resultTitle: intent.title,
          resultSummary: intent.body,
          mode: 'scheduled',
          operationId: intent.operationId,
          scheduleId: intent.scheduleId,
          runId: intent.runId,
          executionStatus: 'completed',
        },
        idempotencyKey: sanitizeIdempotencyKey(
          `agent_sched_completed_${intent.userId}_${intent.scheduleId}_${intent.runId}`
        ),
      };
    case AGENT_PUSH_INTENT_KINDS.SCHEDULED_EXECUTION_FAILED:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.AGENT_ACTION,
        title: intent.title,
        body: intent.body,
        deepLink: '/agent-x',
        data: {
          operationId: intent.operationId,
          scheduleId: intent.scheduleId,
          runId: intent.runId,
          scheduledExecutionStatus: 'failed',
          failed: 'true',
          entityId: intent.runId,
        },
        source: { userName: 'Agent X' },
        metadata: {
          agentId: 'scheduled_execution',
          resultTitle: intent.title,
          resultSummary: intent.body,
          mode: 'scheduled',
          operationId: intent.operationId,
          scheduleId: intent.scheduleId,
          runId: intent.runId,
          executionStatus: 'failed',
          errorMessage: intent.errorMessage,
        },
        idempotencyKey: sanitizeIdempotencyKey(
          `agent_sched_failed_${intent.userId}_${intent.scheduleId}_${intent.runId}`
        ),
      };
    case AGENT_PUSH_INTENT_KINDS.APPROVAL_EXPIRING_SOON:
      return {
        userId: intent.userId,
        type: NOTIFICATION_TYPES.DYNAMIC_AGENT_ALERT,
        title: intent.title,
        body: intent.body,
        deepLink: encodeThreadDeepLink(intent.threadId),
        data: {
          operationId: intent.operationId,
          approvalId: intent.approvalId,
          toolName: intent.toolName,
          entityId: intent.approvalId,
          ...(intent.threadId ? { threadId: intent.threadId } : {}),
          reason: 'approval_expiring_soon',
        },
        source: { userName: 'Agent X' },
        priority: 'high',
        idempotencyKey: sanitizeIdempotencyKey(`agent_approval_expiring_${intent.approvalId}`),
      };
    default:
      throw new Error(`Unhandled agent push intent ${(intent as { kind?: string }).kind}`);
  }
}

export async function dispatchAgentPush(
  db: Firestore,
  intent: AgentPushIntent
): Promise<DispatchResult> {
  try {
    const input = toDispatchInput(intent);
    return await dispatch(db, input);
  } catch (error) {
    logger.error('Failed to map/dispatch agent push intent', {
      kind: intent.kind,
      userId: intent.userId,
      operationId: intent.operationId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
