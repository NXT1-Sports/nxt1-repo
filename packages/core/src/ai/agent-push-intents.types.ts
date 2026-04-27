/**
 * @fileoverview Agent Push Intents
 * @module @nxt1/core/ai
 *
 * Portable contract for backend Agent X notification emitters.
 *
 * The backend maps these intents to DispatchNotificationInput via a single
 * adapter to avoid payload drift across services.
 */

export const AGENT_PUSH_INTENT_KINDS = {
  TASK_COMPLETED: 'agent_task_completed',
  TASK_FAILED: 'agent_task_failed',
  NEEDS_INPUT: 'agent_needs_input',
  NEEDS_APPROVAL: 'agent_needs_approval',
  PLAYBOOK_READY: 'agent_playbook_ready',
  BRIEFING_READY: 'agent_briefing_ready',
  WEEKLY_RECAP_READY: 'agent_weekly_recap_ready',
  PLAYBOOK_NUDGE: 'agent_playbook_nudge',
  SCHEDULED_EXECUTION_COMPLETED: 'agent_scheduled_execution_completed',
  SCHEDULED_EXECUTION_FAILED: 'agent_scheduled_execution_failed',
} as const;

export type AgentPushIntentKind =
  (typeof AGENT_PUSH_INTENT_KINDS)[keyof typeof AGENT_PUSH_INTENT_KINDS];

interface AgentPushIntentBase {
  readonly userId: string;
  readonly operationId: string;
  readonly threadId?: string;
}

export interface AgentTaskCompletedIntent extends AgentPushIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.TASK_COMPLETED;
  readonly sessionId: string;
  readonly agentId: string;
  readonly title: string;
  readonly body: string;
  readonly outcomeCode?: string;
  readonly mode?: string;
  readonly origin?: string;
  readonly imageUrl?: string;
  readonly videoUrl?: string;
  readonly resultSummary?: string;
}

export interface AgentTaskFailedIntent extends AgentPushIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.TASK_FAILED;
  readonly sessionId: string;
  readonly agentId: string;
  readonly title: string;
  readonly body: string;
  readonly errorMessage: string;
  readonly outcomeCode?: string;
}

export interface AgentNeedsInputIntent extends AgentPushIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.NEEDS_INPUT;
  readonly title: string;
  readonly body: string;
  readonly sessionId?: string;
  readonly origin?: 'chat' | 'worker';
  readonly approvalId?: string;
  readonly reason: 'needs_input';
}

export interface AgentNeedsApprovalIntent extends AgentPushIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.NEEDS_APPROVAL;
  readonly title: string;
  readonly body: string;
  readonly sessionId?: string;
  readonly origin?: 'chat' | 'worker';
  readonly approvalId: string;
  readonly toolName?: string;
  readonly reason: 'needs_approval';
}

export interface AgentPlaybookReadyIntent extends AgentPushIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.PLAYBOOK_READY;
  readonly title: string;
  readonly body: string;
}

export interface AgentBriefingReadyIntent extends AgentPushIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.BRIEFING_READY;
  readonly title: string;
  readonly body: string;
}

export interface AgentWeeklyRecapReadyIntent extends AgentPushIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.WEEKLY_RECAP_READY;
  readonly title: string;
  readonly body: string;
  readonly recapNumber: number;
}

export interface AgentPlaybookNudgeIntent extends AgentPushIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.PLAYBOOK_NUDGE;
  readonly title: string;
  readonly body: string;
}

interface AgentScheduledExecutionIntentBase extends AgentPushIntentBase {
  readonly scheduleId: string;
  readonly runId: string;
}

export interface AgentScheduledExecutionCompletedIntent extends AgentScheduledExecutionIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.SCHEDULED_EXECUTION_COMPLETED;
  readonly title: string;
  readonly body: string;
}

export interface AgentScheduledExecutionFailedIntent extends AgentScheduledExecutionIntentBase {
  readonly kind: typeof AGENT_PUSH_INTENT_KINDS.SCHEDULED_EXECUTION_FAILED;
  readonly title: string;
  readonly body: string;
  readonly errorMessage: string;
}

export type AgentPushIntent =
  | AgentTaskCompletedIntent
  | AgentTaskFailedIntent
  | AgentNeedsInputIntent
  | AgentNeedsApprovalIntent
  | AgentPlaybookReadyIntent
  | AgentBriefingReadyIntent
  | AgentWeeklyRecapReadyIntent
  | AgentPlaybookNudgeIntent
  | AgentScheduledExecutionCompletedIntent
  | AgentScheduledExecutionFailedIntent;
