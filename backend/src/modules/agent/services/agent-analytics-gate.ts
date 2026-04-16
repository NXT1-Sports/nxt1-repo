/**
 * @fileoverview Agent Analytics Gate — automatic fire-and-forget analytics
 * instrumentation for agent infrastructure events.
 *
 * PURPOSE: Every meaningful Agent X action that affects a USER's recruiting
 * journey — sending a coach email, recording an offer, logging stats — gets
 * tracked as an analytics event in the user's record. This is NOT internal
 * telemetry; these events build the athlete's recruiting timeline, NIL history,
 * and performance record.
 *
 * SELF-TRACKING TOOLS: Several high-value tools already call safeTrack() with
 * rich, domain-specific payloads. The gate skips those to avoid double-counting
 * and lets their more detailed events stand alone.
 *
 * DOMAIN MAPPING: Approval events are mapped to the tool's user-facing domain
 * (e.g., approving send_email writes to `communication`, not `system`), so the
 * event lands in the correct rollup bucket on the user's dashboard.
 */

import type { AnalyticsDomain } from '@nxt1/core/models';
import {
  getAnalyticsLoggerService,
  type AnalyticsLoggerService,
} from '../../../services/analytics-logger.service.js';

// ─── Tools That Self-Track ────────────────────────────────────────────────────
// These tools call safeTrack() internally with domain-specific payloads that
// are richer than what the gate can infer. Skip them to prevent double-writes.
const SELF_TRACKING_TOOLS = new Set([
  'write_recruiting_activity',
  'write_season_stats',
  'write_combine_metrics',
  'write_core_identity',
  'write_rankings',
  'write_calendar_events',
  'write_athlete_videos',
  'send_email',
  'write_timeline_post',
]);

// ─── Tool → User Domain Mapping ───────────────────────────────────────────────
// Maps approval-required tool names to the user-facing domain and event type so
// that approve/reject decisions land in the correct analytics rollup bucket
// rather than the generic `system` bucket.
//
// NOTE: Approval events fire BEFORE the tool executes (pending) or AFTER the
// user decides (approved/rejected). We use conservative event types that
// represent the decision itself, not the downstream action, so we don't record
// `email_sent` before the email has actually gone out.
const TOOL_DOMAIN_MAP: Record<string, { domain: AnalyticsDomain; eventType: string }> = {
  send_email: { domain: 'communication', eventType: 'follow_up_scheduled' },
  send_sms: { domain: 'communication', eventType: 'follow_up_scheduled' },
  post_to_social: { domain: 'engagement', eventType: 'content_viewed' },
  update_profile: { domain: 'system', eventType: 'sync_completed' },
  delete_content: { domain: 'system', eventType: 'sync_completed' },
  interact_with_live_view: { domain: 'system', eventType: 'agent_task_completed' },
};

function resolveDomain(toolName: string): { domain: AnalyticsDomain; eventType: string } {
  return TOOL_DOMAIN_MAP[toolName] ?? { domain: 'system', eventType: 'tool_write_completed' };
}

// ─── Gate Class ───────────────────────────────────────────────────────────────

export class AgentAnalyticsGate {
  constructor(private readonly analytics: AnalyticsLoggerService) {}

  /**
   * Fire-and-forget tracking for tool executions that don't already self-track.
   * Called from base.agent.ts after every successful tool result.
   * Read-only and self-tracking tools are silently skipped.
   */
  trackToolExecution(params: {
    userId: string;
    agentId: string;
    toolName: string;
    sessionId?: string;
    threadId?: string;
    operationId?: string;
  }): void {
    // Skip tools that already emit their own detailed domain events
    if (SELF_TRACKING_TOOLS.has(params.toolName)) return;

    const { userId, agentId, toolName, sessionId, threadId, operationId } = params;
    this.analytics
      .track({
        subjectId: userId,
        subjectType: 'user',
        domain: 'system',
        eventType: 'tool_write_completed',
        source: 'agent',
        actorUserId: userId,
        sessionId,
        threadId,
        tags: [],
        payload: { agentId, toolName, operationId },
        metadata: { initiatedBy: 'agent-analytics-gate' },
      })
      .catch(() => undefined);
  }

  /**
   * Tracks successful BullMQ job completion in the user's system record.
   */
  trackJobCompleted(params: {
    userId: string;
    agentId: string;
    operationId: string;
    sessionId?: string;
    threadId?: string;
    durationMs?: number;
  }): void {
    const { userId, agentId, operationId, sessionId, threadId, durationMs } = params;
    this.analytics
      .track({
        subjectId: userId,
        subjectType: 'user',
        domain: 'system',
        eventType: 'agent_task_completed',
        source: 'agent',
        actorUserId: userId,
        sessionId,
        threadId,
        tags: [],
        value: durationMs ?? null,
        payload: { agentId, operationId, status: 'completed', durationMs },
        metadata: { initiatedBy: 'agent-analytics-gate' },
      })
      .catch(() => undefined);
  }

  /**
   * Tracks BullMQ job failure so the user's history reflects the failed attempt.
   */
  trackJobFailed(params: {
    userId: string;
    agentId: string;
    operationId: string;
    error: string;
    sessionId?: string;
    threadId?: string;
    durationMs?: number;
  }): void {
    const { userId, agentId, operationId, error, sessionId, threadId, durationMs } = params;
    this.analytics
      .track({
        subjectId: userId,
        subjectType: 'user',
        domain: 'system',
        eventType: 'agent_task_failed',
        source: 'agent',
        actorUserId: userId,
        sessionId,
        threadId,
        tags: [],
        payload: { agentId, operationId, status: 'failed', error, durationMs },
        metadata: { initiatedBy: 'agent-analytics-gate' },
      })
      .catch(() => undefined);
  }

  /**
   * Tracks when a user's approval is requested for a tool.
   * Maps to the tool's user-facing domain (e.g., send_email → communication)
   * so the event surfaces in the correct recruiting dashboard rollup.
   */
  trackApprovalRequested(params: {
    userId: string;
    operationId: string;
    toolName: string;
    threadId?: string;
    sessionId?: string;
  }): void {
    const { userId, operationId, toolName, threadId, sessionId } = params;
    const { domain, eventType } = resolveDomain(toolName);
    this.analytics
      .track({
        subjectId: userId,
        subjectType: 'user',
        domain,
        eventType,
        source: 'agent',
        actorUserId: userId,
        sessionId,
        threadId,
        tags: [],
        payload: { operationId, toolName, approvalStatus: 'requested' },
        metadata: { initiatedBy: 'agent-analytics-gate' },
      })
      .catch(() => undefined);
  }

  /**
   * Tracks when the user approves or rejects an Agent X action.
   * Maps to the tool's user-facing domain so approved email sends land in
   * `communication`, approved recruiting actions in `recruiting`, etc.
   */
  trackApprovalResolved(params: {
    userId: string;
    operationId: string;
    toolName: string;
    decision: 'approved' | 'rejected';
    threadId?: string;
    sessionId?: string;
  }): void {
    const { userId, operationId, toolName, decision, threadId, sessionId } = params;
    const { domain, eventType } = resolveDomain(toolName);
    this.analytics
      .track({
        subjectId: userId,
        subjectType: 'user',
        domain,
        eventType,
        source: 'agent',
        actorUserId: userId,
        sessionId,
        threadId,
        tags: [],
        payload: { operationId, toolName, approvalStatus: decision },
        metadata: { initiatedBy: 'agent-analytics-gate' },
      })
      .catch(() => undefined);
  }
}

let _instance: AgentAnalyticsGate | null = null;

export function getAgentAnalyticsGate(): AgentAnalyticsGate {
  if (!_instance) {
    _instance = new AgentAnalyticsGate(getAnalyticsLoggerService());
  }
  return _instance;
}
