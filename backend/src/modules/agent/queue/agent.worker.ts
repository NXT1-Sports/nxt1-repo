/**
 * @fileoverview Agent Worker — Background Job Processor
 * @module @nxt1/backend/modules/agent/queue
 *
 * A BullMQ Worker that pulls jobs off the agent queue and delegates
 * them to the AgentRouter for execution.
 *
 * Responsibilities:
 * - Listens on the `agent-jobs` queue for new work.
 * - Instantiates the AgentRouter pipeline (planner → sub-agents).
 * - Reports progress updates back to Redis (polled by the status API).
 * - Handles cancellation by checking for removed job state.
 * - Provides graceful shutdown for zero-data-loss deploys.
 *
 * Lifecycle:
 * 1. Queue receives a job via POST /api/v1/agent/ask
 * 2. Worker picks it up, calls AgentRouter.run()
 * 3. AgentRouter's onUpdate callback feeds progress into job.updateProgress()
 * 4. Frontend polls GET /api/v1/agent/status/:jobId and reads progress
 * 5. Worker returns the final AgentQueueJobResult
 *
 * @example
 * ```ts
 * const worker = new AgentWorker(router);
 * // Worker is now processing jobs in the background.
 * // On shutdown:
 * await worker.shutdown();
 * ```
 */

import { Worker, Job, UnrecoverableError } from 'bullmq';
import { getFirestore } from 'firebase-admin/firestore';
import type {
  AgentIdentifier,
  AgentJobPayload,
  AgentJobUpdate,
  AgentOperationResult,
  AgentYieldState,
  AgentXRichCard,
} from '@nxt1/core';
import { AGENT_X_RUNTIME_CONFIG, AGENT_APPROVAL_TOOL_GROUPS } from '@nxt1/core/ai';
import {
  extractMediaAttachmentsFromResultData,
  sanitizeStorageUrlsFromText,
  resolveAgentApprovalCopy,
  resolveAgentSuccessNotificationCopy,
  formatApprovalRichPreview,
  buildAttachmentUrlSet,
  createStreamingSanitizer,
  stripEchoedUserAttachments,
  type StreamingSanitizer,
} from '@nxt1/core';
import type { AgentRouter } from '../agent.router.js';
import type { AgentQueueJobData, AgentQueueJobResult, AgentJobProgress } from './queue.types.js';
import {
  AGENT_QUEUE_NAME,
  AGENT_QUEUE_PREFIX,
  WORKER_CONCURRENCY,
  JOB_LOCK_DURATION_MS,
  JOB_TIMEOUT_MS,
  COMPLETED_JOB_TTL_S,
  FAILED_JOB_TTL_S,
} from './queue.types.js';
import { AgentQueueService } from './queue.service.js';
import { AgentJobRepository, AGENT_WEEKLY_RECAP_JOBS_COLLECTION } from './job.repository.js';
import { DebouncedEventWriter } from './event-writer.js';
import type { StreamEvent } from './event-writer.js';
import { PersistedAssistantStreamBuilder } from './persisted-stream-message.js';
import { AgentPubSubService } from './pubsub.service.js';
import type { AgentChatService } from '../services/agent-chat.service.js';
import { getThreadMessageWriter } from '../memory/thread-message-writer.service.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { withAgentAppConfigForFirestore } from '../config/agent-app-config.js';
import { isAgentYield } from '../exceptions/agent-yield.exception.js';
import { AgentEngineError, getAgentEngineErrorCode } from '../exceptions/agent-engine.error.js';
import { notifyYield } from '../services/yield-notifier.service.js';
import { estimateChargeAmountSync } from '../../billing/pricing.service.js';
import {
  getBillingState,
  createWalletHold,
  releaseWalletHold,
} from '../../billing/budget.service.js';
import { executeBillingDeduction } from '../../billing/usage-deduction.service.js';
import {
  logAgentTaskCompletion,
  logAgentTaskFailure,
  deriveBodyFromResult,
} from '../services/agent-activity.service.js';
import {
  processRecapForUser,
  updateWeeklyRecapDispatchStatus,
} from '../services/weekly-recap-email.service.js';
import { dispatchAgentPush } from '../services/agent-push-adapter.service.js';
import { getConnectedSourceSyncTracker } from '../services/connected-source-sync-tracker.service.js';
import { logger } from '../../../utils/logger.js';
import { AgentGenerationService } from '../services/generation.service.js';
import { runWithMongoEnvironmentScope } from '../../../middleware/mongo/mongo-scope.context.js';
import { sendSlackAlert } from '../../../services/platform/alert.service.js';
import crypto from 'node:crypto';

const AGENT_X_STANDARD_HOLD_COST_CENTS = estimateChargeAmountSync(0.1).chargeAmountCents;
const AGENT_X_MEDIA_HOLD_COST_CENTS = (() => {
  const parsed = Number.parseInt(process.env['AGENT_X_MEDIA_BILLING_GATE_COST_CENTS'] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : AGENT_X_STANDARD_HOLD_COST_CENTS;
})();

const RECURRING_TASKS_COLLECTION = 'RecurringTasks' as const;

function estimateAgentXHoldCostCents(payload: AgentJobPayload): number {
  const text =
    `${payload.intent ?? ''} ${payload.displayIntent ?? ''} ${payload.agent ?? ''}`.toLowerCase();
  const isMediaIntent =
    /\b(video|videos|highlight|highlights|reel|clips?|film|hudl|runway|ffmpeg|merge|combine|intro|opener|motion\s+graphic|thumbnail|poster|graphic)\b/i.test(
      text
    ) &&
    /\b(create|make|generate|edit|build|produce|merge|combine|cut|trim|add|turn|post)\b/i.test(
      text
    );

  return isMediaIntent
    ? Math.max(AGENT_X_STANDARD_HOLD_COST_CENTS, AGENT_X_MEDIA_HOLD_COST_CENTS)
    : AGENT_X_STANDARD_HOLD_COST_CENTS;
}

const AGENT_IDENTIFIER_SET = new Set<AgentIdentifier>([
  'router',
  'admin_coordinator',
  'brand_coordinator',
  'data_coordinator',
  'strategy_coordinator',
  'recruiting_coordinator',
  'performance_coordinator',
]);

function isAgentIdentifier(value: unknown): value is AgentIdentifier {
  return typeof value === 'string' && AGENT_IDENTIFIER_SET.has(value as AgentIdentifier);
}

function shouldSuppressCompletionPushWhenActivelyViewing(payload: AgentJobPayload): boolean {
  const explicitPolicy = payload.notificationPolicy?.suppressPushWhenActivelyViewing;
  if (typeof explicitPolicy === 'boolean') {
    return explicitPolicy;
  }

  return false;
}

const MAX_TIMEOUT_AUTO_CONTINUATIONS =
  AGENT_X_RUNTIME_CONFIG.operationQueue.maxTimeoutAutoContinuations;
const PARENT_OPERATION_POLL_MS = AGENT_X_RUNTIME_CONFIG.operationQueue.parentOperationPollMs;
const PARENT_OPERATION_MAX_WAIT_MS =
  JOB_TIMEOUT_MS + AGENT_X_RUNTIME_CONFIG.operationQueue.parentOperationTimeoutBufferMs;
const PARENT_OPERATION_STALE_HEARTBEAT_MS = Math.max(
  AGENT_X_RUNTIME_CONFIG.operationQueue.viewerHeartbeatFreshnessMs * 5,
  5 * 60_000
);

function toMillis(value: unknown): number | null {
  if (!value) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value === 'object' && value !== null) {
    const maybeTimestamp = value as { toMillis?: () => number };
    if (typeof maybeTimestamp.toMillis === 'function') {
      const ms = maybeTimestamp.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
  }

  return null;
}

function isJobTimeoutError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  return err.message.startsWith('Agent job timed out after ');
}

function normalizeTerminalMessageText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

const PAUSE_RESUME_TOOL_NAME = 'resume_paused_operation';

function isPauseYieldState(yieldState: AgentYieldState | null | undefined): boolean {
  return yieldState?.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME;
}

function isAbortError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'AbortError';
}

function createAbortError(message: string): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

interface InsufficientBalanceSnapshot {
  readonly currentBalanceCents?: number;
  readonly amountNeededCents?: number;
}

function parseDollarsToCents(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const dollars = Number.parseFloat(input);
  if (!Number.isFinite(dollars)) return undefined;
  return Math.max(0, Math.round(dollars * 100));
}

function extractInsufficientBalanceSnapshot(message: string): InsufficientBalanceSnapshot | null {
  if (!/insufficient/i.test(message) || !/balance/i.test(message)) {
    return null;
  }

  const amountsMatch = message.match(
    /\$([0-9]+(?:\.[0-9]{1,2})?)\s*<\s*\$([0-9]+(?:\.[0-9]{1,2})?)/
  );
  if (!amountsMatch) {
    return {};
  }

  return {
    currentBalanceCents: parseDollarsToCents(amountsMatch[1]),
    amountNeededCents: parseDollarsToCents(amountsMatch[2]),
  };
}

// ─── Approval card enrichment helpers ────────────────────────────────────────

type GenericApprovalCategory =
  | 'profileWrite'
  | 'profileDelete'
  | 'teamWrite'
  | 'teamDelete'
  | 'communication'
  | 'workspace'
  | 'automation'
  | 'destructive'
  | 'other';

type ApprovalRiskLevel = 'low' | 'medium' | 'high' | 'critical';

const PROFILE_WRITE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.profileWrites);
const PROFILE_DELETE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.profileDeletes);
const TEAM_WRITE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.teamWrites);
const TEAM_DELETE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.teamDeletes);
const WORKSPACE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.workspaceActions);
const AUTOMATION_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.automationAndExternalActions);
const DESTRUCTIVE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.destructiveStorage);
const INTEL_WRITE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.intelAndSourcesWrites);
const INTEL_DELETE_TOOLS = new Set<string>(AGENT_APPROVAL_TOOL_GROUPS.intelAndSourcesDeletes);

function classifyApprovalTool(toolName: string): {
  category: GenericApprovalCategory;
  riskLevel: ApprovalRiskLevel;
} {
  if (
    PROFILE_DELETE_TOOLS.has(toolName) ||
    TEAM_DELETE_TOOLS.has(toolName) ||
    INTEL_DELETE_TOOLS.has(toolName)
  ) {
    return {
      category: toolName.startsWith('delete_team') ? 'teamDelete' : 'profileDelete',
      riskLevel: 'critical',
    };
  }
  if (DESTRUCTIVE_TOOLS.has(toolName)) {
    return { category: 'destructive', riskLevel: 'critical' };
  }
  if (PROFILE_WRITE_TOOLS.has(toolName) || INTEL_WRITE_TOOLS.has(toolName)) {
    return { category: 'profileWrite', riskLevel: 'medium' };
  }
  if (TEAM_WRITE_TOOLS.has(toolName)) {
    return { category: 'teamWrite', riskLevel: 'medium' };
  }
  if (WORKSPACE_TOOLS.has(toolName)) {
    return { category: 'workspace', riskLevel: 'high' };
  }
  if (AUTOMATION_TOOLS.has(toolName)) {
    return { category: 'automation', riskLevel: 'high' };
  }
  return { category: 'other', riskLevel: 'medium' };
}

const SENSITIVE_FIELD_PATTERN = /password|token|secret|key|auth|credential|ssn|credit|cvv/i;
const SKIP_FIELD_PATTERN = /id$|Id$|Url$|url$|html$|Html$/;
const MAX_PREVIEW_FIELDS = 5;
const MAX_FIELD_VALUE_LEN = 120;

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function formatPreviewValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return null;
    return cleaned.length > MAX_FIELD_VALUE_LEN
      ? `${cleaned.slice(0, MAX_FIELD_VALUE_LEN).trim()}…`
      : cleaned;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const items = value.filter((v) => typeof v === 'string' || typeof v === 'number').slice(0, 3);
    return items.length ? items.join(', ') : null;
  }
  return null;
}

function extractDataFields(
  toolInput: Record<string, unknown>
): Array<{ key: string; value: string }> {
  const fields: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(toolInput)) {
    if (fields.length >= MAX_PREVIEW_FIELDS) break;
    if (SENSITIVE_FIELD_PATTERN.test(key)) continue;
    if (SKIP_FIELD_PATTERN.test(key)) continue;
    const formatted = formatPreviewValue(value);
    if (!formatted) continue;
    fields.push({ key: humanizeKey(key), value: formatted });
  }
  return fields;
}

function humanizeToolName(toolName: string): string {
  return toolName
    .replace(/^(write|update|delete|create)_/, '')
    .replace(/_/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function buildGenericApprovalTitle(toolName: string): string {
  if (toolName.startsWith('delete_')) return 'Confirm Deletion';
  if (DESTRUCTIVE_TOOLS.has(toolName)) return 'Confirm Destructive Action';
  if (WORKSPACE_TOOLS.has(toolName)) return 'Review Workspace Action';
  if (AUTOMATION_TOOLS.has(toolName)) return 'Review Automation';
  if (toolName.startsWith('write_') || toolName.startsWith('update_')) return 'Review Data Write';
  return 'Approval Required';
}

function extractTimelinePostDraft(
  toolName: string,
  toolInput: Record<string, unknown>
): {
  title?: string;
  description: string;
  postType?: string;
  isTeamPost: boolean;
} | null {
  if (toolName === 'write_timeline_post') {
    const description =
      (typeof toolInput['content'] === 'string' && toolInput['content'].trim()) ||
      (typeof toolInput['description'] === 'string' && toolInput['description'].trim()) ||
      '';
    if (!description) return null;
    const title =
      typeof toolInput['title'] === 'string' && toolInput['title'].trim()
        ? toolInput['title'].trim()
        : undefined;
    const postType =
      typeof toolInput['type'] === 'string' && toolInput['type'].trim()
        ? toolInput['type'].trim()
        : undefined;
    return { title, description, postType, isTeamPost: false };
  }

  if (toolName === 'write_team_post') {
    const posts = Array.isArray(toolInput['posts']) ? (toolInput['posts'] as Array<unknown>) : [];
    const firstPost = posts.find((p) => p && typeof p === 'object') as
      | Record<string, unknown>
      | undefined;
    if (!firstPost) return null;

    const description =
      (typeof firstPost['content'] === 'string' && firstPost['content'].trim()) ||
      (typeof firstPost['description'] === 'string' && firstPost['description'].trim()) ||
      '';
    if (!description) return null;

    const title =
      typeof firstPost['title'] === 'string' && firstPost['title'].trim()
        ? firstPost['title'].trim()
        : undefined;
    const postType =
      typeof firstPost['type'] === 'string' && firstPost['type'].trim()
        ? firstPost['type'].trim()
        : undefined;

    return { title, description, postType, isTeamPost: true };
  }

  return null;
}

function extractEmailApprovalDraft(
  toolName: string,
  toolInput: Record<string, unknown>
): {
  readonly title: string;
  readonly variant: 'email' | 'email-batch';
  readonly subject: string;
  readonly body: string;
  readonly toEmail?: string;
  readonly recipients: Array<string | { toEmail: string; variables: Record<string, unknown> }>;
  readonly recipientsCount: number;
  readonly approveLabel: string;
} | null {
  type EmailBatchRecipient = { toEmail: string; variables: Record<string, unknown> };

  const readString = (record: Record<string, unknown>, keys: readonly string[]): string => {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    return '';
  };

  const readBodyContent = (value: unknown): string => {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const record = value as Record<string, unknown>;
    return readString(record, ['content', 'html', 'bodyHtml', 'body', 'text']);
  };

  const collectRecipientEmails = (value: unknown, depth = 0): string[] => {
    if (depth > 3 || value == null) return [];
    if (typeof value === 'string' && value.trim().length > 0) return [value.trim()];
    if (Array.isArray(value))
      return value.flatMap((entry) => collectRecipientEmails(entry, depth + 1));
    if (typeof value !== 'object') return [];

    const record = value as Record<string, unknown>;
    const direct = readString(record, ['address', 'email', 'toEmail', 'recipientEmail']);
    const nested = [
      record['emailAddress'],
      record['recipient'],
      record['to'],
      record['toRecipients'],
      record['recipients'],
    ].flatMap((entry) => collectRecipientEmails(entry, depth + 1));

    return [...(direct ? [direct] : []), ...nested];
  };

  const uniqueRecipients = (recipients: readonly string[]): string[] => [
    ...new Set(recipients.map((recipient) => recipient.trim()).filter(Boolean)),
  ];

  const buildEmailDraft = (params: {
    readonly subject: string;
    readonly body: string;
    readonly recipients: readonly string[];
    readonly title?: string;
    readonly approveLabel?: string;
  }) => {
    const recipients = uniqueRecipients(params.recipients);
    return {
      title:
        params.title ??
        (recipients.length > 1
          ? `Review and Approve Emails (${recipients.length} recipients)`
          : 'Review and Approve Email'),
      variant: recipients.length > 1 ? ('email-batch' as const) : ('email' as const),
      subject: params.subject,
      body: params.body,
      ...(recipients[0] ? { toEmail: recipients[0] } : {}),
      recipients,
      recipientsCount: Math.max(recipients.length, 1),
      approveLabel: params.approveLabel ?? (recipients.length > 1 ? 'Send All' : 'Send'),
    };
  };

  if (toolName === 'send_email' || toolName === 'send_email_via_nxt1') {
    const subject = typeof toolInput['subject'] === 'string' ? toolInput['subject'] : '';
    const body =
      (typeof toolInput['bodyHtml'] === 'string' && toolInput['bodyHtml']) ||
      (typeof toolInput['body'] === 'string' ? toolInput['body'] : '') ||
      '';
    const toEmail = typeof toolInput['toEmail'] === 'string' ? toolInput['toEmail'] : '';

    return {
      title: 'Review and Approve Email',
      variant: 'email',
      subject,
      body,
      toEmail,
      recipients: toEmail ? [toEmail] : [],
      recipientsCount: 1,
      approveLabel: 'Send',
    };
  }

  if (toolName === 'create_gmail_draft') {
    return buildEmailDraft({
      subject: readString(toolInput, ['subject']),
      body: readString(toolInput, ['body']),
      recipients: collectRecipientEmails(toolInput['to']),
      title: 'Review and Approve Email Draft',
      approveLabel: 'Create Draft',
    });
  }

  if (toolName === 'gmail_send_email') {
    const subject = typeof toolInput['subject'] === 'string' ? toolInput['subject'] : '';
    const body = typeof toolInput['body'] === 'string' ? toolInput['body'] : '';
    const recipients = Array.isArray(toolInput['to'])
      ? toolInput['to'].filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
        )
      : [];
    const toEmail = recipients[0] ?? '';

    return {
      title:
        recipients.length > 1
          ? `Review and Approve Emails (${recipients.length} recipients)`
          : 'Review and Approve Email',
      variant: recipients.length > 1 ? 'email-batch' : 'email',
      subject,
      body,
      toEmail,
      recipients,
      recipientsCount: Math.max(recipients.length, 1),
      approveLabel: recipients.length > 1 ? 'Send All' : 'Send',
    };
  }

  if (toolName === 'gmail_reply_to_email') {
    return buildEmailDraft({
      subject: 'Gmail reply',
      body: readString(toolInput, ['reply_body', 'body']),
      recipients: [],
      title: 'Review and Approve Email Reply',
      approveLabel: toolInput['send'] === false ? 'Save Draft' : 'Send',
    });
  }

  if (toolName === 'gmail_send_draft') {
    const draftId = readString(toolInput, ['draft_id', 'draftId', 'id']);
    return buildEmailDraft({
      subject: draftId ? `Gmail draft ${draftId}` : 'Gmail draft',
      body: '',
      recipients: [],
      title: 'Review and Approve Email Draft',
      approveLabel: 'Send Draft',
    });
  }

  if (toolName === 'run_google_workspace_tool') {
    const nestedToolName =
      typeof toolInput['toolName'] === 'string' ? toolInput['toolName'].trim() : '';
    if (
      nestedToolName !== 'gmail_send_email' &&
      nestedToolName !== 'create_gmail_draft' &&
      nestedToolName !== 'gmail_reply_to_email' &&
      nestedToolName !== 'gmail_send_draft'
    ) {
      return null;
    }

    const args =
      toolInput['arguments'] &&
      typeof toolInput['arguments'] === 'object' &&
      !Array.isArray(toolInput['arguments'])
        ? (toolInput['arguments'] as Record<string, unknown>)
        : {};
    return extractEmailApprovalDraft(nestedToolName, args);
  }

  if (toolName === 'run_microsoft_365_tool') {
    const nestedToolName =
      typeof toolInput['toolName'] === 'string' ? toolInput['toolName'].trim().toLowerCase() : '';
    if (!/(send|reply|forward|draft)/i.test(nestedToolName)) return null;

    const args =
      toolInput['arguments'] &&
      typeof toolInput['arguments'] === 'object' &&
      !Array.isArray(toolInput['arguments'])
        ? (toolInput['arguments'] as Record<string, unknown>)
        : {};
    const message =
      args['message'] && typeof args['message'] === 'object' && !Array.isArray(args['message'])
        ? (args['message'] as Record<string, unknown>)
        : {};
    const recipients = uniqueRecipients([
      ...collectRecipientEmails(args['to']),
      ...collectRecipientEmails(args['toEmail']),
      ...collectRecipientEmails(args['recipient']),
      ...collectRecipientEmails(args['recipients']),
      ...collectRecipientEmails(args['toRecipients']),
      ...collectRecipientEmails(message['toRecipients']),
    ]);
    const body =
      readString(args, ['bodyHtml', 'body', 'content', 'messageBody', 'replyBody']) ||
      readBodyContent(args['body']) ||
      readBodyContent(message['body']);

    return buildEmailDraft({
      subject: readString(args, ['subject', 'title']) || readString(message, ['subject', 'title']),
      body,
      recipients,
      approveLabel: recipients.length > 1 ? 'Send All' : 'Send',
    });
  }

  if (toolName === 'batch_send_email' || toolName === 'batch_send_email_via_nxt1') {
    const subject =
      (typeof toolInput['subjectTemplate'] === 'string' && toolInput['subjectTemplate']) ||
      (typeof toolInput['subject'] === 'string' ? toolInput['subject'] : '') ||
      '';
    const body =
      (typeof toolInput['bodyHtmlTemplate'] === 'string' && toolInput['bodyHtmlTemplate']) ||
      (typeof toolInput['bodyHtml'] === 'string' && toolInput['bodyHtml']) ||
      (typeof toolInput['body'] === 'string' ? toolInput['body'] : '') ||
      '';
    const recipients = Array.isArray(toolInput['recipients'])
      ? (toolInput['recipients'] as Array<unknown>)
          .map((r): EmailBatchRecipient | null => {
            if (typeof r === 'string' && r.trim()) {
              return { toEmail: r.trim(), variables: {} };
            }
            if (r && typeof r === 'object') {
              const obj = r as Record<string, unknown>;
              const toEmail =
                typeof obj['toEmail'] === 'string' && obj['toEmail'].trim()
                  ? obj['toEmail'].trim()
                  : typeof obj['email'] === 'string' && obj['email'].trim()
                    ? obj['email'].trim()
                    : '';
              if (!toEmail) return null;
              return {
                toEmail,
                variables:
                  obj['variables'] &&
                  typeof obj['variables'] === 'object' &&
                  !Array.isArray(obj['variables'])
                    ? (obj['variables'] as Record<string, unknown>)
                    : {},
              };
            }
            return null;
          })
          .filter((recipient): recipient is EmailBatchRecipient => recipient !== null)
      : [];

    return {
      title: `Review and Approve Emails (${recipients.length} recipient${recipients.length === 1 ? '' : 's'})`,
      variant: 'email-batch',
      subject,
      body,
      recipients,
      recipientsCount: recipients.length,
      approveLabel: 'Send All',
    };
  }

  return null;
}

/**
 * Build an inline rich card for an agent yield (approval or input request).
 *
 * Maps:
 *   • `needs_approval` for `send_email` / `batch_send_email` →
 *     `draft` card (renders an editable email preview with Approve/Reject).
 *   • `needs_approval` for any other tool → `confirmation` card with
 *     `generic_approval` variant, rich action summary, risk level, and
 *     a structured key-value preview of the most relevant tool arguments.
 *   • `needs_input` (ask_user / pause_resume) → `ask_user` card with a
 *     reply text input.
 *
 * Returns `null` when no meaningful card can be built (defensive — falls
 * back to the plain assistant text bubble).
 */
export function buildInlineYieldCard(params: {
  yieldPayload: {
    reason: string;
    promptToUser: string;
    agentId: AgentIdentifier;
    pendingToolCall?: {
      readonly toolName: string;
      readonly toolInput: Record<string, unknown>;
      readonly toolCallId: string;
    };
    approvalId?: string;
  };
  yieldState?: AgentYieldState;
  operationId: string;
  threadId?: string;
}): AgentXRichCard | null {
  const { yieldPayload, operationId, threadId } = params;
  const { reason, promptToUser, agentId, pendingToolCall, approvalId } = yieldPayload;
  const yieldPayloadFields = {
    ...(params.yieldState ? { yieldState: params.yieldState } : {}),
  };

  // ── Approval cards ────────────────────────────────────────────────────
  if (reason === 'needs_approval' && pendingToolCall && approvalId) {
    const { toolName, toolInput } = pendingToolCall;

    const emailDraft = extractEmailApprovalDraft(toolName, toolInput);
    if (emailDraft) {
      return {
        type: 'confirmation',
        agentId,
        title: emailDraft.title,
        payload: {
          message: promptToUser,
          variant: emailDraft.variant,
          emailData: {
            subject: emailDraft.subject,
            body: emailDraft.body,
            ...(emailDraft.toEmail ? { toEmail: emailDraft.toEmail } : {}),
            recipients: emailDraft.recipients,
            recipientsCount: emailDraft.recipientsCount,
          },
          actions: [
            { id: 'reject', label: 'Reject', variant: 'secondary' },
            { id: 'approve', label: emailDraft.approveLabel, variant: 'primary' },
          ],
          approvalId,
          toolCallId: pendingToolCall.toolCallId,
          operationId,
          ...yieldPayloadFields,
        },
      };
    }

    // Timeline/team post approvals: show editable title + description card.
    if (toolName === 'write_timeline_post' || toolName === 'write_team_post') {
      const draft = extractTimelinePostDraft(toolName, toolInput);
      if (draft) {
        return {
          type: 'confirmation',
          agentId,
          title: draft.isTeamPost ? 'Review Team Post' : 'Review Timeline Post',
          payload: {
            message: promptToUser,
            variant: 'timeline_post',
            timelinePostData: {
              ...(draft.title ? { title: draft.title } : {}),
              description: draft.description,
              ...(draft.postType ? { postType: draft.postType } : {}),
              isTeamPost: draft.isTeamPost,
            },
            actions: [
              { id: 'reject', label: 'Reject', variant: 'secondary' },
              { id: 'approve', label: 'Publish', variant: 'primary' },
            ],
            approvalId,
            toolCallId: pendingToolCall.toolCallId,
            operationId,
            ...yieldPayloadFields,
          },
        };
      }
    }

    // Plan approval (`execute_saved_plan`) → rich `plan_approval` card showing
    // goal + ordered step list. The plan content is passed through the
    // pendingToolCall.toolInput under the `__planApproval` namespace by
    // `agent-router-primary.service.ts.runPlan` precisely so this card
    // builder can surface the actual plan to the user instead of a bare
    // `planId` data row.
    if (toolName === 'execute_saved_plan') {
      const planMeta =
        toolInput['__planApproval'] && typeof toolInput['__planApproval'] === 'object'
          ? (toolInput['__planApproval'] as Record<string, unknown>)
          : null;
      const planId =
        (planMeta && typeof planMeta['planId'] === 'string' && planMeta['planId']) ||
        (typeof toolInput['planId'] === 'string' ? toolInput['planId'] : '');
      const goal =
        planMeta && typeof planMeta['goal'] === 'string' && planMeta['goal'].trim()
          ? planMeta['goal'].trim()
          : '';
      const summary =
        planMeta && typeof planMeta['summary'] === 'string' && planMeta['summary'].trim()
          ? planMeta['summary'].trim()
          : '';
      const rawSteps =
        planMeta && Array.isArray(planMeta['steps']) ? (planMeta['steps'] as Array<unknown>) : [];
      const steps = rawSteps
        .map((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
          const step = entry as Record<string, unknown>;
          const id = typeof step['id'] === 'string' ? step['id'] : '';
          const label =
            (typeof step['label'] === 'string' && step['label'].trim()) ||
            (typeof step['description'] === 'string' && step['description'].trim()) ||
            '';
          if (!id || !label) return null;
          return {
            id,
            label,
            ...(typeof step['description'] === 'string' && step['description'].trim()
              ? { description: step['description'].trim() }
              : {}),
            ...(typeof step['coordinator'] === 'string' && step['coordinator'].trim()
              ? { coordinator: step['coordinator'].trim() }
              : {}),
            ...(typeof step['toolName'] === 'string' && step['toolName'].trim()
              ? { toolName: step['toolName'].trim() }
              : {}),
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null);

      // Only render the rich plan card when we actually have steps to show;
      // fall through to the generic approval renderer otherwise so the user
      // never sees a blank card.
      if (steps.length > 0 && planId) {
        return {
          type: 'confirmation',
          agentId,
          title: 'Review Execution Plan',
          payload: {
            message: promptToUser,
            variant: 'plan_approval',
            planApprovalData: {
              goal: goal || summary || 'Multi-step plan',
              planId,
              steps,
            },
            actions: [
              { id: 'reject', label: 'Reject', variant: 'secondary' },
              { id: 'approve', label: 'Approve & Execute', variant: 'primary' },
            ],
            approvalId,
            toolCallId: pendingToolCall.toolCallId,
            operationId,
            ...yieldPayloadFields,
          },
        };
      }
    }

    // Generic approval-required tool → rich `generic_approval` confirmation card.
    const approvialCopy = resolveAgentApprovalCopy({ toolName, toolInput });
    const { category, riskLevel } = classifyApprovalTool(toolName);
    const dataFields = extractDataFields(toolInput);
    const cardTitle = buildGenericApprovalTitle(toolName);
    const resourceName = humanizeToolName(toolName);
    const richPreview = formatApprovalRichPreview(toolName, toolInput);

    return {
      type: 'confirmation',
      agentId,
      title: cardTitle,
      payload: {
        message: promptToUser,
        variant: 'generic_approval',
        genericApprovalData: {
          category,
          riskLevel,
          actionSummary: approvialCopy.actionSummary,
          resourceName,
          ...(dataFields.length > 0 ? { dataFields } : {}),
          ...(richPreview ? { richPreview } : {}),
        },
        actions: [
          { id: 'reject', label: 'Reject', variant: 'secondary' },
          { id: 'approve', label: 'Approve', variant: 'primary' },
        ],
        approvalId,
        toolCallId: pendingToolCall.toolCallId,
        operationId,
        ...yieldPayloadFields,
      },
    };
  }

  // ── Ask-user / paused cards ────────────────────────────────────────────
  if (reason === 'needs_input') {
    // Saved-plan review is handled conversationally: keep the planner card
    // already emitted by the router, persist the assistant prompt text, and
    // let the user reply in normal chat. Do not replace that text with an
    // ask_user input card.
    if (pendingToolCall?.toolName === 'execute_saved_plan') {
      return null;
    }

    return {
      type: 'ask_user',
      agentId,
      title: 'Agent X has a question',
      payload: {
        question: promptToUser,
        ...(threadId ? { threadId } : {}),
        operationId,
        ...yieldPayloadFields,
      },
    };
  }

  return null;
}

// ─── Worker ─────────────────────────────────────────────────────────────────

export class AgentWorker {
  private readonly worker: Worker<AgentQueueJobData, AgentQueueJobResult>;

  constructor(
    private readonly router: AgentRouter,
    private readonly productionJobRepo: AgentJobRepository,
    private readonly stagingJobRepo: AgentJobRepository,
    private readonly chatService: AgentChatService,
    private readonly pubsub: AgentPubSubService,
    private readonly stagingFirestore?: FirebaseFirestore.Firestore,
    private readonly llmService?: OpenRouterService,
    redisUrl?: string,
    private readonly enqueueContinuationJob?: (
      payload: AgentJobPayload,
      environment: 'staging' | 'production'
    ) => Promise<string>,
    private readonly queueService?: AgentQueueService
  ) {
    const url = redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';

    // Parse URL into RedisOptions for BullMQ compatibility (includes auth)
    const connection = AgentQueueService.parseRedisUrl(url);

    this.worker = new Worker(
      AGENT_QUEUE_NAME,
      async (job) => {
        // BullMQ jobs run outside the Express request lifecycle, so rehydrate
        // the Mongo environment scope from the job payload before any model access.
        const scope = job.data.environment === 'production' ? 'production' : 'staging';
        return runWithMongoEnvironmentScope(scope, () => this.processJob(job));
      },
      {
        connection,
        prefix: AGENT_QUEUE_PREFIX,
        concurrency: WORKER_CONCURRENCY,
        lockDuration: JOB_LOCK_DURATION_MS,
        removeOnComplete: { age: COMPLETED_JOB_TTL_S, count: 1000 },
        removeOnFail: { age: FAILED_JOB_TTL_S, count: 500 },
      }
    );

    this.attachEventListeners();

    // Phase B (thread-as-truth): bootstrap the writer singleton so
    // BaseAgent.runLoop can persist assistant.tool_calls + tool result
    // rows the moment they're produced. The writer delegates to the
    // same chatService passed to the worker, so a single MongoDB
    // session is shared.
    getThreadMessageWriter(this.chatService);
  }

  // ─── Repository Selector ────────────────────────────────────────────────

  private isWeeklyRecapPersistenceJob(job: Job<AgentQueueJobData, AgentQueueJobResult>): boolean {
    return job.data.kind === 'agent' && job.data.payload.triggerEvent?.type === 'weekly_recap';
  }

  /** Return the correct Firestore repo based on which environment the job belongs to. */
  private getJobRepo(job: Job<AgentQueueJobData, AgentQueueJobResult>): AgentJobRepository {
    const baseRepo =
      job.data.environment === 'staging' ? this.stagingJobRepo : this.productionJobRepo;
    return this.isWeeklyRecapPersistenceJob(job)
      ? baseRepo.withCollection(AGENT_WEEKLY_RECAP_JOBS_COLLECTION)
      : baseRepo;
  }

  /** Return the correct Firestore instance for user lookups based on job environment. */
  private getUserFirestore(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): FirebaseFirestore.Firestore | undefined {
    return job.data.environment === 'staging' ? this.stagingFirestore : getFirestore();
  }

  private async getAgentConfigFirestore(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<FirebaseFirestore.Firestore | undefined> {
    if (job.data.environment === 'staging') {
      return this.stagingFirestore;
    }

    return getFirestore();
  }

  /** Return the correct Firestore for activity/notification writes. */
  private async getActivityFirestore(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<FirebaseFirestore.Firestore> {
    if (job.data.environment === 'staging' && this.stagingFirestore) {
      return this.stagingFirestore;
    }
    return getFirestore();
  }

  private getScheduledRunContext(
    job: Job<AgentQueueJobData, AgentQueueJobResult>,
    payload: import('@nxt1/core').AgentJobPayload
  ): { scheduleId: string; runId: string } | null {
    if (payload.origin !== 'system_cron') {
      return null;
    }

    const runId = job.id?.toString() ?? `${payload.operationId}-${job.timestamp}`;
    const repeatJobKey = (job as unknown as { repeatJobKey?: string }).repeatJobKey;
    const scheduleId = repeatJobKey && repeatJobKey.trim().length > 0 ? repeatJobKey : job.name;

    return { scheduleId, runId };
  }

  private resolvePayloadThreadIdFromContext(
    payload: import('@nxt1/core').AgentJobPayload
  ): string | undefined {
    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};

    const threadIdRaw =
      typeof (contextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((contextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;
    const threadId = threadIdRaw?.trim();
    if (threadId) {
      return threadId;
    }

    const sourceIdRaw =
      typeof (contextObj as Record<string, unknown>)['sourceId'] === 'string'
        ? ((contextObj as Record<string, unknown>)['sourceId'] as string)
        : undefined;
    const sourceId = sourceIdRaw?.trim();
    return sourceId || undefined;
  }

  private resolveThreadIdFromRecurringMetadata(
    data: Record<string, unknown> | undefined
  ): string | undefined {
    if (!data) return undefined;

    const threadIdRaw = typeof data['threadId'] === 'string' ? data['threadId'] : undefined;
    const threadId = threadIdRaw?.trim();
    if (threadId) {
      return threadId;
    }

    const sourceIdRaw = typeof data['sourceId'] === 'string' ? data['sourceId'] : undefined;
    const sourceId = sourceIdRaw?.trim();
    return sourceId || undefined;
  }

  private async resolveScheduledRunThreadId(
    job: Job<AgentQueueJobData, AgentQueueJobResult>,
    scheduledRunContext: { scheduleId: string; runId: string } | null,
    db: FirebaseFirestore.Firestore
  ): Promise<string | undefined> {
    if (!scheduledRunContext) return undefined;

    try {
      const scheduleDoc = await db
        .collection(RECURRING_TASKS_COLLECTION)
        .doc(scheduledRunContext.scheduleId)
        .get();
      const fromDoc = this.resolveThreadIdFromRecurringMetadata(
        scheduleDoc.exists ? (scheduleDoc.data() as Record<string, unknown> | undefined) : undefined
      );
      if (fromDoc) {
        return fromDoc;
      }

      const byJobName = await db
        .collection(RECURRING_TASKS_COLLECTION)
        .where('jobName', '==', job.name)
        .limit(1)
        .get();
      const firstMatch = byJobName.docs[0];
      const fromJobName = this.resolveThreadIdFromRecurringMetadata(
        firstMatch?.data() as Record<string, unknown> | undefined
      );
      if (fromJobName) {
        return fromJobName;
      }

      logger.warn('Scheduled run has no recoverable thread metadata', {
        operationId: scheduledRunContext.runId,
        scheduleId: scheduledRunContext.scheduleId,
        jobName: job.name,
      });
    } catch (err) {
      logger.warn('Failed to resolve scheduled run thread metadata', {
        operationId: scheduledRunContext.runId,
        scheduleId: scheduledRunContext.scheduleId,
        jobName: job.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    return undefined;
  }

  private async ensureJobDocumentExists(
    repo: AgentJobRepository,
    payload: AgentJobPayload
  ): Promise<void> {
    const existing = await repo.getById(payload.operationId);
    if (existing) {
      return;
    }

    await repo.create(payload);
    logger.info('Bootstrapped missing AgentJobs document in worker', {
      operationId: payload.operationId,
      userId: payload.userId,
      origin: payload.origin,
    });
  }

  private async waitForParentOperationCompletion(
    repo: AgentJobRepository,
    payload: AgentJobPayload,
    signal?: AbortSignal
  ): Promise<void> {
    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const parentOperationId =
      typeof (contextObj as Record<string, unknown>)['parentOperationId'] === 'string'
        ? String((contextObj as Record<string, unknown>)['parentOperationId']).trim()
        : '';

    if (!parentOperationId || parentOperationId === payload.operationId) {
      return;
    }

    logger.info('Child operation waiting for parent operation to terminate', {
      operationId: payload.operationId,
      parentOperationId,
    });

    const waitStartedAtMs = Date.now();

    const waitOnce = async (): Promise<void> => {
      if (signal?.aborted) {
        throw createAbortError('Queued child operation aborted before parent completion');
      }

      const [parentJob, currentJob] = await Promise.all([
        repo.getById(parentOperationId),
        repo.getById(payload.operationId),
      ]);

      if (currentJob?.status === 'cancelled' || currentJob?.status === 'failed') {
        throw createAbortError('Queued child operation cancelled before execution');
      }

      if (
        !parentJob ||
        parentJob.status === 'completed' ||
        parentJob.status === 'failed' ||
        parentJob.status === 'cancelled'
      ) {
        return;
      }

      const nowMs = Date.now();
      const parentUpdatedAtMs = toMillis(parentJob.updatedAt) ?? toMillis(parentJob.createdAt);
      const elapsedWaitMs = nowMs - waitStartedAtMs;
      const staleHeartbeatMs = parentUpdatedAtMs === null ? 0 : nowMs - parentUpdatedAtMs;
      const exceededMaxWait = elapsedWaitMs >= PARENT_OPERATION_MAX_WAIT_MS;
      const staleByHeartbeat =
        parentUpdatedAtMs !== null && staleHeartbeatMs >= PARENT_OPERATION_STALE_HEARTBEAT_MS;

      if (exceededMaxWait || staleByHeartbeat) {
        const parentFailureReason =
          'Parent operation became stale while a child operation was blocked waiting for completion.';

        logger.error('Detected stale parent operation; forcing terminal failure to unblock child', {
          operationId: payload.operationId,
          parentOperationId,
          parentStatus: parentJob.status,
          elapsedWaitMs,
          parentUpdatedAtMs,
          staleHeartbeatMs,
        });

        try {
          await repo.markFailed(parentOperationId, parentFailureReason);
        } catch (err) {
          logger.warn('Failed to mark stale parent operation as failed; unblocking child anyway', {
            operationId: payload.operationId,
            parentOperationId,
            error: err instanceof Error ? err.message : String(err),
          });
        }

        return;
      }

      await new Promise<void>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          cleanup();
          resolve();
        }, PARENT_OPERATION_POLL_MS);

        const onAbort = () => {
          clearTimeout(timeoutId);
          cleanup();
          reject(createAbortError('Queued child operation aborted while waiting on parent'));
        };

        const cleanup = () => {
          signal?.removeEventListener('abort', onAbort);
        };

        signal?.addEventListener('abort', onAbort, { once: true });
      });

      await waitOnce();
    };

    await waitOnce();

    logger.info('Child operation unblocked after parent termination', {
      operationId: payload.operationId,
      parentOperationId,
    });
  }

  private async shouldSuppressTerminalCompletionForPause(
    repo: AgentJobRepository,
    operationId: string
  ): Promise<{ suppressed: boolean; persistedStatus?: string }> {
    try {
      const latest = await repo.getById(operationId);
      if (!latest) {
        return { suppressed: false };
      }

      const persistedStatus = latest.status;
      const explicitPaused = persistedStatus === 'paused';
      const inferredPaused =
        persistedStatus === 'awaiting_input' && isPauseYieldState(latest.yieldState ?? undefined);

      return {
        suppressed: explicitPaused || inferredPaused,
        persistedStatus,
      };
    } catch (err) {
      logger.warn('Failed to read latest job state before terminal completion guard', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { suppressed: false };
    }
  }

  private async flushConnectedSourceTerminalStatus(
    operationId: string,
    outcome: 'success' | 'error',
    reason: string
  ): Promise<void> {
    try {
      await getConnectedSourceSyncTracker().flush(operationId, outcome);
      logger.info('Connected source terminal status flush complete', {
        operationId,
        outcome,
        reason,
      });
    } catch (err) {
      logger.error('Connected source terminal status flush failed', {
        operationId,
        outcome,
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private discardConnectedSourceTracking(operationId: string, reason: string): void {
    try {
      getConnectedSourceSyncTracker().discard(operationId);
      logger.info('Connected source tracker discarded', {
        operationId,
        reason,
      });
    } catch (err) {
      logger.warn('Connected source tracker discard failed', {
        operationId,
        reason,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async continueTimedOutJob(
    job: Job<AgentQueueJobData, AgentQueueJobResult>,
    repo: AgentJobRepository,
    payload: AgentJobPayload,
    timeoutMessage: string,
    eventWriter: DebouncedEventWriter,
    startMs: number,
    billingDb: FirebaseFirestore.Firestore,
    iapHoldId: string | null
  ): Promise<AgentQueueJobResult | null> {
    if (!this.enqueueContinuationJob) {
      return null;
    }

    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const timeoutContinuationCountRaw = (contextObj as Record<string, unknown>)[
      'timeoutContinuationCount'
    ];
    const timeoutContinuationCount =
      typeof timeoutContinuationCountRaw === 'number'
        ? Math.max(0, Math.floor(timeoutContinuationCountRaw))
        : 0;

    if (timeoutContinuationCount >= MAX_TIMEOUT_AUTO_CONTINUATIONS) {
      return null;
    }

    const nextOperationId = crypto.randomUUID();
    const nextPayload: AgentJobPayload = {
      ...payload,
      operationId: nextOperationId,
      sessionId: crypto.randomUUID(),
      context: {
        ...(contextObj as Record<string, unknown>),
        resumedFrom: payload.operationId,
        timeoutContinuationCount: timeoutContinuationCount + 1,
        timeoutContinuedFrom: payload.operationId,
        timeoutContinuedAt: new Date().toISOString(),
      },
    };

    await repo.create(nextPayload);
    await this.enqueueContinuationJob(nextPayload, job.data.environment);

    const continuationMessage = `Operation slice timed out; automatically continuing as ${nextOperationId}.`;

    await job.updateProgress({
      status: 'completed',
      message: continuationMessage,
      agentId: 'router',
      outcomeCode: 'success_default',
      metadata: {
        continuationReason: 'timeout',
        continuedAs: nextOperationId,
      },
      percent: 100,
      currentStep: 1,
      totalSteps: 1,
      updatedAt: new Date().toISOString(),
    });

    eventWriter.emit({
      type: 'done',
      success: true,
      message: continuationMessage,
      agentId: 'router',
      metadata: {
        continuationReason: 'timeout',
        continuedAs: nextOperationId,
      },
    });
    await eventWriter.dispose();

    await repo.markCompleted(payload.operationId, {
      summary: continuationMessage,
      data: {
        resumedAs: nextOperationId,
        continuationReason: 'timeout',
        timeoutMessage,
      },
    });

    await this.flushConnectedSourceTerminalStatus(
      payload.operationId,
      'error',
      'timeout_continuation'
    );

    if (iapHoldId) {
      releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
        logger.warn('[billing] Failed to release IAP hold on timeout continuation', {
          holdId: iapHoldId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }

    logger.warn('Agent job auto-continued after timeout window', {
      operationId: payload.operationId,
      continuedAs: nextOperationId,
      timeoutContinuationCount: timeoutContinuationCount + 1,
      timeoutLimit: MAX_TIMEOUT_AUTO_CONTINUATIONS,
    });

    return {
      result: {
        summary: continuationMessage,
        data: {
          continuedAs: nextOperationId,
          continuationReason: 'timeout',
          timeoutContinuationCount: timeoutContinuationCount + 1,
        },
      },
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  }

  private async processThreadSummarizationJob(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<AgentQueueJobResult> {
    if (job.data.kind !== 'thread_summarization') {
      throw new AgentEngineError(
        'AGENT_JOB_PAYLOAD_INVALID',
        'Invalid thread summarization job payload',
        { metadata: { kind: (job.data as { kind?: unknown }).kind } }
      );
    }

    if (!this.llmService) {
      throw new AgentEngineError(
        'AGENT_SERVICE_UNAVAILABLE',
        'LLM service not initialized for thread summarization'
      );
    }

    const startMs = Date.now();
    await job.updateProgress({
      status: 'acting',
      message: 'Summarizing idle thread memory',
      agentId: 'router',
      stageType: 'router',
      stage: 'summarizing_memory',
      metadata: { threadId: job.data.threadId },
      percent: 10,
      currentStep: 1,
      totalSteps: 1,
      updatedAt: new Date().toISOString(),
    });

    const { VectorMemoryService } = await import('../memory/vector.service.js');
    const { MemorySummarizationService } =
      await import('../memory/memory-summarization.service.js');

    const vectorMemory = new VectorMemoryService(this.llmService);
    const summarizerFirestore = await this.getActivityFirestore(job);
    const summarizer = new MemorySummarizationService(
      this.llmService,
      vectorMemory,
      undefined,
      summarizerFirestore
    );
    const memoriesCreated = await summarizer.processSingleThread(
      job.data.threadId,
      job.data.userId
    );

    await job.updateProgress({
      status: 'completed',
      message: 'Idle thread summarization complete',
      agentId: 'router',
      stageType: 'router',
      stage: 'summarizing_memory',
      outcomeCode: 'success_default',
      metadata: { threadId: job.data.threadId, memoriesCreated },
      percent: 100,
      currentStep: 1,
      totalSteps: 1,
      updatedAt: new Date().toISOString(),
    });

    return {
      result: {
        summary:
          memoriesCreated > 0
            ? `Created ${memoriesCreated} durable memory entries from the idle chat.`
            : 'No new durable facts were extracted from the idle chat.',
        data: {
          threadId: job.data.threadId,
          memoriesCreated,
        },
        suggestions: [],
      },
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  }

  private async processPlaybookGenerationJob(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<AgentQueueJobResult> {
    if (job.data.kind !== 'playbook_generation') {
      throw new AgentEngineError(
        'AGENT_JOB_PAYLOAD_INVALID',
        'Invalid playbook generation job payload',
        { metadata: { kind: (job.data as { kind?: unknown }).kind } }
      );
    }

    const startMs = Date.now();
    const { operationId, userId } = job.data;
    const repo = this.getJobRepo(job);
    const billingDb = await this.getActivityFirestore(job);
    const generationService = new AgentGenerationService(this.llmService);

    const processingProgress: AgentJobProgress = {
      status: 'acting',
      message: 'Generating your weekly playbook',
      agentId: 'strategy_coordinator',
      stageType: 'router',
      stage: 'agent_thinking',
      percent: 20,
      currentStep: 1,
      totalSteps: 2,
      updatedAt: new Date().toISOString(),
    };

    await job.updateProgress(processingProgress);
    await repo.updateProgress(operationId, processingProgress).catch((err: unknown) => {
      logger.warn('Failed to write playbook progress to Firestore', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    try {
      const playbook = await generationService.generatePlaybook(userId, billingDb, operationId);

      const completionSummary = `Playbook generated with ${playbook.items.length} items.`;
      const operationResult: AgentOperationResult = {
        summary: completionSummary,
        data: {
          generatedAt: playbook.generatedAt,
          itemCount: playbook.items.length,
          goalCount: playbook.goals.length,
          canRegenerate: playbook.canRegenerate,
          playbook,
        },
      };

      const completedProgress: AgentJobProgress = {
        status: 'completed',
        message: 'Playbook generation complete',
        agentId: 'strategy_coordinator',
        outcomeCode: 'success_default',
        percent: 100,
        currentStep: 2,
        totalSteps: 2,
        updatedAt: new Date().toISOString(),
      };

      await job.updateProgress(completedProgress);
      await repo.markCompleted(operationId, operationResult).catch((err: unknown) => {
        logger.warn('Failed to persist playbook completion to Firestore', {
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      if (job.data.skipBilling === true) {
        logger.info('[AgentWorker] Skipping billing deduction for recovered playbook job', {
          operationId,
          userId,
          kind: job.data.kind,
        });
      } else {
        void executeBillingDeduction({
          db: billingDb,
          userId,
          operationId,
          feature: 'playbook-generation',
          coordinatorId: 'strategy_coordinator',
          environment: job.data.environment,
        });
      }

      return {
        result: operationResult,
        durationMs: Date.now() - startMs,
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate playbook';

      const failedProgress: AgentJobProgress = {
        status: 'failed',
        message,
        agentId: 'strategy_coordinator',
        stageType: 'router',
        stage: 'routing_to_agent',
        outcomeCode: 'task_failed',
        metadata: { errorCode: 'PLAYBOOK_GENERATION_FAILED' },
        percent: 100,
        currentStep: 2,
        totalSteps: 2,
        updatedAt: new Date().toISOString(),
      };

      await job.updateProgress(failedProgress);
      await repo.markFailed(operationId, message).catch((fsErr: unknown) => {
        logger.warn('Failed to persist playbook failure to Firestore', {
          operationId,
          error: fsErr instanceof Error ? fsErr.message : String(fsErr),
        });
      });

      throw err;
    }
  }

  // ─── Job Processor ──────────────────────────────────────────────────────

  /**
   * The core job processor. Called by BullMQ for each job.
   *
   * 1. Extracts the AgentJobPayload from the job data.
   * 2. Calls AgentRouter.run() with a progress-reporting callback.
   * 3. Returns the result so BullMQ stores it for retrieval.
   */
  private async processJob(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<AgentQueueJobResult> {
    if (job.data.kind === 'thread_summarization') {
      return this.processThreadSummarizationJob(job);
    }

    if (job.data.kind === 'playbook_generation') {
      return this.processPlaybookGenerationJob(job);
    }

    if (job.data.kind !== 'agent') {
      throw new AgentEngineError(
        'AGENT_JOB_KIND_UNSUPPORTED',
        `Unsupported queue job kind: ${String((job.data as { kind?: unknown }).kind)}`,
        { metadata: { kind: (job.data as { kind?: unknown }).kind } }
      );
    }

    const basePayload = job.data.payload;
    const payloadContext =
      typeof basePayload.context === 'object' && basePayload.context !== null
        ? basePayload.context
        : {};
    const scheduledRunContext = this.getScheduledRunContext(job, basePayload);
    const payload = scheduledRunContext
      ? { ...basePayload, operationId: scheduledRunContext.runId }
      : basePayload;
    const startMs = Date.now();
    const repo = this.getJobRepo(job);
    const billingDb = await this.getActivityFirestore(job);
    const syncWeeklyRecapDispatchStatus = async (
      status: 'completed' | 'failed',
      error?: string
    ): Promise<void> => {
      if (payload.triggerEvent?.type !== 'weekly_recap') return;

      await updateWeeklyRecapDispatchStatus(billingDb, {
        operationId: payload.operationId,
        status,
        ...(status === 'failed' ? { error } : {}),
      }).catch((dispatchErr) => {
        logger.warn('Failed to update weekly recap dispatch status', {
          operationId: payload.operationId,
          status,
          error: dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
        });
      });
    };
    const payloadThreadId =
      this.resolvePayloadThreadIdFromContext(basePayload) ??
      (await this.resolveScheduledRunThreadId(job, scheduledRunContext, billingDb));

    await this.ensureJobDocumentExists(repo, payload);
    if (scheduledRunContext) {
      await repo.patchContext(payload.operationId, {
        recurringTaskKey: scheduledRunContext.scheduleId,
      });
    }

    // Create a job-scoped AbortController before any execution gating so the
    // cancel endpoint can also abort queued child operations while they wait
    // behind a parentOperationId.
    const jobAbortController = new AbortController();
    this.queueService?.registerController(payload.operationId, jobAbortController);

    // Cross-instance control listener: pause/cancel HTTP requests may hit a
    // different backend instance than the one running this worker. The HTTP
    // handler broadcasts a control message via Redis pub/sub which we receive
    // here and translate into a local AbortController.abort().
    let unsubscribeControl: (() => Promise<void>) | null = null;
    try {
      unsubscribeControl = await this.pubsub.subscribeControl(payload.operationId, (msg) => {
        if (jobAbortController.signal.aborted) return;
        logger.info('[worker] Received cross-instance control message', {
          operationId: payload.operationId,
          action: msg.action,
          issuedBy: msg.issuedBy,
        });
        try {
          jobAbortController.abort();
        } catch (abortErr) {
          logger.warn('[worker] Local abort from control message failed', {
            operationId: payload.operationId,
            action: msg.action,
            error: abortErr instanceof Error ? abortErr.message : String(abortErr),
          });
        }
      });
    } catch (subErr) {
      logger.warn('[worker] Failed to subscribe to control channel', {
        operationId: payload.operationId,
        error: subErr instanceof Error ? subErr.message : String(subErr),
      });
    }

    await this.waitForParentOperationCompletion(repo, payload, jobAbortController.signal);

    // Register connected source targets from enqueue context and stamp
    // pending immediately once the operation begins execution.
    const connectedSourceTracker = getConnectedSourceSyncTracker();
    const trackedTargetCount = connectedSourceTracker.trackFromContext(
      payload.operationId,
      payload.context
    );
    if (trackedTargetCount > 0) {
      await connectedSourceTracker.markPending(payload.operationId).catch((err) => {
        logger.warn('Failed to mark connected source targets pending at operation start', {
          operationId: payload.operationId,
          trackedTargetCount,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    if (payload.origin === 'system_cron' && payloadThreadId && this.chatService) {
      try {
        await this.chatService.addMessage({
          threadId: payloadThreadId,
          userId: payload.userId,
          role: 'user',
          content: payload.displayIntent?.trim() || payload.intent,
          origin: 'system_cron',
          operationId: payload.operationId,
        });
      } catch (err) {
        logger.warn('Failed to persist scheduled run intent to MongoDB thread', {
          operationId: payload.operationId,
          threadId: payloadThreadId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const feature = typeof payload.agent === 'string' ? payload.agent : 'agent';
    const skipBilling = (payloadContext as Record<string, unknown>)['skipBilling'] === true;

    // ── IAP hold: show "Processing" amount in usage overview ─────────────
    // For prepaid wallet users, create a hold at job start so the UI can display
    // the estimated in-flight cost under "Processing". Released or captured at end.
    let iapHoldId: string | null = null;
    let walletHoldEstimateCents: number | undefined;
    const billingCtxForHold = await getBillingState(billingDb, payload.userId);
    const hasPrepaidWalletBalance = (billingCtxForHold?.walletBalanceCents ?? 0) > 0;
    if (
      !skipBilling &&
      ((billingCtxForHold?.billingEntity === 'individual' &&
        (billingCtxForHold.hardStop ||
          billingCtxForHold.paymentProvider === 'iap' ||
          hasPrepaidWalletBalance)) ||
        (billingCtxForHold?.billingEntity === 'organization' && billingCtxForHold?.hardStop))
    ) {
      const estimatedCents = estimateAgentXHoldCostCents(payload);
      walletHoldEstimateCents = estimatedCents;
      const holdResult = await createWalletHold(
        billingDb,
        payload.userId,
        estimatedCents,
        payload.operationId,
        feature
      );
      if (holdResult.success && holdResult.holdId) {
        iapHoldId = holdResult.holdId;
        logger.info('[billing] Wallet hold created for job', {
          holdId: iapHoldId,
          estimatedCents,
          userId: payload.userId,
          operationId: payload.operationId,
        });
      } else {
        logger.warn('[billing] Failed to create wallet hold for hard-stop billing target', {
          userId: payload.userId,
          reason: holdResult.reason,
        });

        const reason = (holdResult.reason ?? '').toLowerCase();
        if (reason.includes('insufficient')) {
          const billingGateMessage =
            'You need more wallet credits to run this request. Open Usage to add funds and try again.';
          const cardData: AgentXRichCard = {
            type: 'billing-action',
            agentId: 'router',
            title: 'Add Funds to Continue',
            payload: {
              reason: 'insufficient_funds',
              description: billingGateMessage,
              ...(typeof holdResult.availableBalance === 'number'
                ? { currentBalanceCents: holdResult.availableBalance }
                : {}),
              amountNeededCents: estimatedCents,
            },
          };

          const operationEvent = this.streamEventToSSE(
            {
              type: 'operation',
              operationId: payload.operationId,
              threadId: payloadThreadId,
              status: 'complete',
              timestamp: new Date().toISOString(),
            },
            payload.operationId,
            payloadThreadId
          );
          if (operationEvent) {
            void this.pubsub.publish(
              payload.operationId,
              operationEvent.event,
              operationEvent.data
            );
          }

          const deltaEvent = this.streamEventToSSE(
            { type: 'delta', agentId: 'router', text: billingGateMessage },
            payload.operationId,
            payloadThreadId
          );
          if (deltaEvent) {
            void this.pubsub.publish(payload.operationId, deltaEvent.event, deltaEvent.data);
          }

          const cardEvent = this.streamEventToSSE(
            { type: 'card', agentId: 'router', cardData },
            payload.operationId,
            payloadThreadId
          );
          if (cardEvent) {
            void this.pubsub.publish(payload.operationId, cardEvent.event, cardEvent.data);
          }

          const doneEvent = this.streamEventToSSE(
            {
              type: 'done',
              success: true,
              message: billingGateMessage,
              agentId: 'router',
            },
            payload.operationId,
            payloadThreadId
          );
          if (doneEvent) {
            void this.pubsub.publish(payload.operationId, doneEvent.event, doneEvent.data);
          }

          await job.updateProgress({
            status: 'completed',
            message: billingGateMessage,
            agentId: 'router',
            outcomeCode: 'billing_action_required',
            metadata: {
              reason: 'insufficient_funds',
              holdRejectReason: holdResult.reason,
            },
            percent: 100,
            currentStep: 1,
            totalSteps: 1,
            updatedAt: new Date().toISOString(),
          });

          await repo
            .markCompleted(payload.operationId, {
              summary: billingGateMessage,
              data: {
                blockedByBilling: true,
                reason: 'insufficient_funds',
                currentBalanceCents:
                  typeof holdResult.availableBalance === 'number'
                    ? holdResult.availableBalance
                    : undefined,
                amountNeededCents: estimatedCents,
              },
            })
            .catch((err: unknown) => {
              logger.warn('Failed to persist billing-gated completion to Firestore', {
                operationId: payload.operationId,
                error: err instanceof Error ? err.message : String(err),
              });
            });

          return {
            result: {
              summary: billingGateMessage,
              data: {
                blockedByBilling: true,
                reason: 'insufficient_funds',
                currentBalanceCents:
                  typeof holdResult.availableBalance === 'number'
                    ? holdResult.availableBalance
                    : undefined,
                amountNeededCents: estimatedCents,
              },
            },
            durationMs: Date.now() - startMs,
            completedAt: new Date().toISOString(),
          };
        }
      }
    }

    let stepIndex = 0;
    let totalSteps = 1; // Updated once the plan is created
    const invokedTools: string[] = [];
    const successfulTools: string[] = [];
    let primaryFirstDeltaLogged = false;

    // Build the onUpdate callback that feeds progress into BullMQ and Firestore
    const onUpdate = async (update: AgentJobUpdate): Promise<void> => {
      // Use structured payload data for reliable progress tracking
      const eventPayload = update.step.payload as Record<string, unknown> | undefined;
      if (
        eventPayload?.['eventType'] === 'plan_created' &&
        typeof eventPayload['taskCount'] === 'number'
      ) {
        totalSteps = eventPayload['taskCount'] as number;
      }
      if (eventPayload?.['eventType'] === 'task_started') {
        stepIndex++;
      }

      const progress: AgentJobProgress = {
        status: update.status,
        message: update.step.message,
        agentId: update.agentId ?? update.step.agentId,
        stageType: update.stageType ?? update.step.stageType,
        stage: update.stage ?? update.step.stage,
        outcomeCode: update.outcomeCode ?? update.step.outcomeCode,
        metadata: update.metadata ?? update.step.metadata,
        percent: Math.min(99, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
        currentStep: stepIndex,
        totalSteps,
        updatedAt: new Date().toISOString(),
      };

      await job.updateProgress(progress);
      // Mirror progress to Firestore (fire-and-forget — don't block/fail the job)
      repo.updateProgress(payload.operationId, progress).catch((err: unknown) => {
        logger.warn('Failed to write progress to Firestore', {
          operationId: payload.operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    };

    // ── Debounced Event Writer: streams granular events to Firestore subcollection ──
    // The frontend subscribes to `AgentJobs/{operationId}/events` via onSnapshot
    // to render a live "watch it work" chat experience.
    let pendingAutoOpenPanel: Record<string, unknown> | null = null;

    // ── Echoed-attachment defense (Layer 3) ─────────────────────────────
    // The system prompt forbids embedding user-provided media URLs back into the
    // reply, but models occasionally regress. We strip any `<video>` / `<img>` /
    // markdown image whose URL matches one of the user's own attachments, both
    // from streaming deltas and from the persisted summary. This is a pure,
    // tested helper from `@nxt1/core` so the logic is identical on every path.
    const userAttachmentUrlSet: ReadonlySet<string> = (() => {
      const ctx = payload.context as Record<string, unknown> | undefined;
      const collect = (key: string): string[] => {
        const raw = ctx?.[key];
        if (!Array.isArray(raw)) return [];
        const urls: string[] = [];
        for (const entry of raw) {
          if (entry && typeof entry === 'object') {
            const url = (entry as { url?: unknown }).url;
            if (typeof url === 'string' && url.length > 0) urls.push(url);
          }
        }
        return urls;
      };
      return buildAttachmentUrlSet([...collect('attachments'), ...collect('videoAttachments')]);
    })();
    const streamingSanitizer: StreamingSanitizer = createStreamingSanitizer(userAttachmentUrlSet);

    const eventWriter = new DebouncedEventWriter(
      repo,
      payload.operationId,
      payload.userId,
      undefined,
      {
        /**
         * LIVE EVENT HOOK: Publishes each delta to SSE immediately (token-by-token)
         * This is the "real-time" path — deltas appear in the client stream instantly,
         * without waiting for the 300ms Firestore batch. Professional typing feel.
         */
        onLiveEvent: (event) => {
          // Handle deltas and thinking live (token-by-token); all other events go through onPersistedEvent
          if (event.type !== 'delta' && event.type !== 'thinking') return;

          // Defense-in-depth: strip user-attachment URLs from streaming deltas
          // before they ever leave the worker. The push() may hold a tail
          // fragment that could start a `<video>` / `![]()` tag; that fragment
          // is flushed once enough characters arrive (or on terminal event).
          if (event.type === 'delta' && typeof event.text === 'string') {
            const safeText = streamingSanitizer.push(event.text);
            if (safeText.length === 0) return;
            event = { ...event, text: safeText };
          }

          if (!primaryFirstDeltaLogged && event.agentId === 'router') {
            primaryFirstDeltaLogged = true;
            const preview = typeof event.text === 'string' ? event.text.slice(0, 120) : '';
            logger.info('[PrimaryChat] first_delta_sent', {
              operationId: payload.operationId,
              userId: payload.userId,
              threadId: payloadThreadId,
              emittedAt: new Date().toISOString(),
              preview,
            });
          }

          const sseEvent = this.streamEventToSSE(event, payload.operationId, payloadThreadId);
          if (!sseEvent) return;

          // Fire-and-forget publish; no latency tracking needed for live events
          this.pubsub
            .publish(payload.operationId, sseEvent.event, sseEvent.data)
            .catch(() => undefined);
        },
        onPersistedEventMetrics: ({ type, durationMs, seq }) => {
          if (durationMs >= 1500) {
            logger.warn('Stream event persistence latency high', {
              operationId: payload.operationId,
              eventType: type,
              seq,
              durationMs,
            });
          }
        },
        /**
         * PERSISTED EVENT HOOK: Publishes non-delta events and persistence milestones
         * Called AFTER Firestore write with final seq number. For terminal events,
         * state transitions, etc. Deltas already published via onLiveEvent.
         */
        onPersistedEvent: (event) => {
          // Skip deltas and thinking — already published live via onLiveEvent
          if (event.type === 'delta' || event.type === 'thinking') return;

          let sseEvent = this.streamEventToSSE(event, payload.operationId, payloadThreadId);
          if (!sseEvent) return;

          if (
            event.type === 'tool_result' &&
            event.toolSuccess !== false &&
            event.toolResult &&
            typeof event.toolResult === 'object' &&
            event.toolResult['autoOpenPanel'] &&
            typeof event.toolResult['autoOpenPanel'] === 'object'
          ) {
            pendingAutoOpenPanel = event.toolResult['autoOpenPanel'] as Record<string, unknown>;
          }

          if (
            sseEvent.event === 'done' &&
            pendingAutoOpenPanel &&
            sseEvent.data &&
            typeof sseEvent.data === 'object'
          ) {
            sseEvent = {
              ...sseEvent,
              data: {
                ...(sseEvent.data as Record<string, unknown>),
                autoOpenPanel: pendingAutoOpenPanel,
              },
            };
          }

          const publishStartedAt = Date.now();
          this.pubsub
            .publish(payload.operationId, sseEvent.event, sseEvent.data)
            .then(() => {
              const publishDurationMs = Date.now() - publishStartedAt;
              if (publishDurationMs >= 300) {
                logger.warn('Stream event publish latency high', {
                  operationId: payload.operationId,
                  eventType: sseEvent.event,
                  durationMs: publishDurationMs,
                });
              }
            })
            .catch(() => undefined);

          if (
            event.type === 'tool_result' &&
            event.toolSuccess !== false &&
            event.toolResult &&
            typeof event.toolResult === 'object' &&
            event.toolResult['autoOpenPanel'] &&
            typeof event.toolResult['autoOpenPanel'] === 'object'
          ) {
            this.pubsub
              .publish(
                payload.operationId,
                'panel',
                event.toolResult['autoOpenPanel'] as Record<string, unknown>
              )
              .catch(() => undefined);
          }
        },
      }
    );

    // Emit canonical lifecycle transition as soon as worker execution begins.
    eventWriter.emit({
      type: 'operation',
      operationId: payload.operationId,
      threadId: payloadThreadId,
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    const persistedAssistantStream = new PersistedAssistantStreamBuilder();

    // ── Dual-write callback: Firestore (persistence) + Redis PubSub (real-time SSE pipe) ──
    // The Redis PubSub path enables Express to hold an SSE connection open and
    // forward tokens in real-time, giving the frontend the same streaming UX
    // regardless of whether the LLM loop runs inline or in BullMQ.
    const onStreamEvent = (event: StreamEvent): void => {
      if (event.toolName && (event.type === 'tool_call' || event.type === 'step_active')) {
        invokedTools.push(event.toolName);
      }
      if (event.toolName && event.type === 'tool_result' && event.toolSuccess !== false) {
        successfulTools.push(event.toolName);
      }

      // ── Emit connect-account card when email tool reports no connected provider ─
      if (
        event.type === 'tool_result' &&
        event.toolSuccess === false &&
        event.toolName &&
        (event.toolName === 'send_email' || event.toolName === 'batch_send_email') &&
        typeof event.toolResult === 'object' &&
        event.toolResult !== null &&
        (event.toolResult as Record<string, unknown>)['requiresEmailConnection'] === true
      ) {
        eventWriter.emit({
          type: 'card',
          agentId: event.agentId,
          cardData: {
            agentId: event.agentId as AgentIdentifier,
            type: 'connect-account',
            title: 'Email Account Required',
            payload: {
              reason:
                'Connect your Gmail or Outlook account in Settings -> Email before sending from your own address.',
              connectLabel: 'Connect Gmail or Outlook',
              pendingTool: event.toolName,
              suggestedAction: 'connect-account',
            },
          },
        });
      }

      persistedAssistantStream.process(event);

      // 1. Firestore (existing — persistence for reconnection/replay)
      eventWriter.emit(event);

      // 2. Redis PubSub is emitted by the event writer only after persistence.
    };

    // Execute the full agent pipeline (with overall timeout)
    let result: AgentOperationResult;

    try {
      const userFirestore = this.getUserFirestore(job);
      const configFirestore = await this.getAgentConfigFirestore(job);
      const routerPromise = withAgentAppConfigForFirestore(configFirestore, () =>
        this.router.run(
          payload,
          onUpdate,
          userFirestore,
          onStreamEvent,
          job.data.environment,
          jobAbortController.signal
        )
      );
      const timeoutMinutes = Math.round(JOB_TIMEOUT_MS / 60_000);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Agent job timed out after ${timeoutMinutes} minutes`)),
          JOB_TIMEOUT_MS
        );
      });
      result = await Promise.race([routerPromise, timeoutPromise]);
    } catch (err) {
      // Flush any buffered deltas before handling the error
      await eventWriter.flush().catch(() => undefined);

      let handledError: unknown = err;

      if (isAbortError(err)) {
        const latest = await repo.getById(payload.operationId).catch(() => null);
        const persistedStatus = latest?.status;
        const abortedAsPaused =
          persistedStatus === 'paused' ||
          (persistedStatus === 'awaiting_input' && isPauseYieldState(latest?.yieldState));
        const abortedAsCancelled = persistedStatus === 'cancelled';

        if (abortedAsPaused || abortedAsCancelled) {
          await eventWriter.dispose();

          const controlledStatus = abortedAsPaused ? 'paused' : 'cancelled';
          const controlledMessage =
            controlledStatus === 'paused'
              ? 'Operation paused by user'
              : 'Operation cancelled by user';

          if (controlledStatus === 'cancelled') {
            await this.flushConnectedSourceTerminalStatus(
              payload.operationId,
              'error',
              'controlled_cancel'
            );
          } else {
            this.discardConnectedSourceTracking(payload.operationId, 'controlled_pause');
          }

          await job.updateProgress({
            status: controlledStatus,
            message: controlledMessage,
            agentId: 'router',
            outcomeCode: controlledStatus === 'paused' ? 'input_required' : 'cancelled',
            metadata: {
              reason: abortedAsPaused ? 'paused_by_user' : 'cancelled_by_user',
              persistedStatus,
            },
            percent: Math.min(99, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
            currentStep: stepIndex,
            totalSteps,
            updatedAt: new Date().toISOString(),
          });

          if (iapHoldId) {
            releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
              logger.warn('[billing] Failed to release IAP hold after controlled abort', {
                holdId: iapHoldId,
                error: e instanceof Error ? e.message : String(e),
              });
            });
          }

          // Persist whatever partial response the agent streamed so far to MongoDB.
          // Without this, when the user returns to the session they see the yield
          // card but all streamed content (tool steps, partial text) is gone.
          // This applies to both pause and cancel — cancelled jobs also benefit from
          // having partial context visible in the thread.
          if (this.chatService) {
            const threadId = payloadThreadId;

            if (threadId) {
              const partialSnapshot = persistedAssistantStream.snapshot();
              const hasContent =
                partialSnapshot.content.length > 0 ||
                partialSnapshot.steps.length > 0 ||
                partialSnapshot.parts.length > 0;

              if (hasContent) {
                try {
                  await this.chatService.addMessage({
                    threadId,
                    userId: payload.userId,
                    role: 'assistant',
                    // Persist only actual streamed prose; avoid UI-facing control placeholders.
                    content: partialSnapshot.content || '',
                    origin: payload.origin,
                    agentId: 'router',
                    operationId: payload.operationId,
                    // Phase-scoped idempotency: prevents double-persist if the
                    // worker is retried after a partial write on abort/pause.
                    idempotencyKey: `${payload.operationId}:assistant_partial`,
                    semanticPhase: 'assistant_partial',
                    ...(partialSnapshot.steps.length > 0 ? { steps: partialSnapshot.steps } : {}),
                    ...(partialSnapshot.parts.length > 0 ? { parts: partialSnapshot.parts } : {}),
                  });
                  logger.info('Persisted partial agent response on controlled abort', {
                    operationId: payload.operationId,
                    threadId,
                    controlledStatus,
                    contentLength: partialSnapshot.content.length,
                    stepCount: partialSnapshot.steps.length,
                  });
                } catch (chatErr) {
                  logger.warn('Failed to persist partial response on controlled abort', {
                    operationId: payload.operationId,
                    threadId,
                    error: chatErr instanceof Error ? chatErr.message : String(chatErr),
                  });
                }
              }
            }
          }

          logger.info('Agent job aborted after explicit lifecycle transition', {
            operationId: payload.operationId,
            userId: payload.userId,
            controlledStatus,
          });

          return {
            result: {
              summary:
                controlledStatus === 'paused'
                  ? 'Operation paused. Resume whenever you are ready.'
                  : 'Operation cancelled by user.',
              data: {
                aborted: true,
                controlledStatus,
                operationStatus: controlledStatus,
              },
            },
            durationMs: Date.now() - startMs,
            completedAt: new Date().toISOString(),
          };
        }

        // Abort without a controlled persisted state should fail once, never retry.
        handledError = new UnrecoverableError(err.message || 'Operation aborted');
      }

      if (isJobTimeoutError(handledError)) {
        try {
          const continuationResult = await this.continueTimedOutJob(
            job,
            repo,
            payload,
            handledError.message,
            eventWriter,
            startMs,
            billingDb,
            iapHoldId
          );
          if (continuationResult) {
            return continuationResult;
          }
        } catch (continuationErr) {
          logger.error('Failed to auto-continue timed out agent job', {
            operationId: payload.operationId,
            error:
              continuationErr instanceof Error ? continuationErr.message : String(continuationErr),
          });
        }
      }

      // ── Yield handling: agent needs user input or approval ─────────────
      if (isAgentYield(handledError)) {
        const yieldPayload = handledError.payload;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        const yieldStatus =
          yieldPayload.reason === 'needs_approval' ? 'awaiting_approval' : 'awaiting_input';
        const yieldOutcomeCode =
          yieldPayload.reason === 'needs_approval' ? 'approval_required' : 'input_required';

        const yieldState: AgentYieldState = {
          reason: yieldPayload.reason,
          promptToUser: yieldPayload.promptToUser,
          agentId: yieldPayload.agentId,
          // @nxt1/core defines messages as Record<string, unknown>[] because
          // it can't import backend-only LLMMessage types. The actual data IS
          // LLMMessage[] — this widening cast is safe at the serialization boundary.
          messages: yieldPayload.messages as unknown as readonly Record<string, unknown>[],
          pendingToolCall: yieldPayload.pendingToolCall,
          approvalId: yieldPayload.approvalId,
          planContext: yieldPayload.planContext,
          yieldedAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
        };

        await job.updateProgress({
          status: yieldStatus,
          message: yieldPayload.promptToUser,
          agentId: yieldPayload.agentId,
          outcomeCode: yieldOutcomeCode,
          metadata: {
            reason: yieldPayload.reason,
            approvalId: yieldPayload.approvalId,
          },
          percent: Math.min(99, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
          currentStep: stepIndex,
          totalSteps,
          updatedAt: new Date().toISOString(),
        });

        // Persist yield state to Firestore
        await repo.markYielded(payload.operationId, yieldState).catch((fsErr: unknown) => {
          logger.warn('Failed to write yield state to Firestore', {
            operationId: payload.operationId,
            error: fsErr instanceof Error ? fsErr.message : String(fsErr),
          });
        });

        // Persist the agent's question as a system message in MongoDB thread
        const threadId = payloadThreadId;

        // Emit a rich inline card (`confirmation` / `draft` / `ask_user`) so
        // the chat UI renders interactive Approve/Reject buttons or a reply
        // input rather than just a plain assistant text bubble. The card
        // builders are inlined here to avoid a routes/ → modules/ layering
        // inversion (the routes/agent/shared.ts versions are deprecated and
        // will be removed once any external callers are migrated).
        try {
          const inlineCard = buildInlineYieldCard({
            yieldPayload,
            yieldState,
            operationId: payload.operationId,
            threadId,
          });
          if (inlineCard) {
            eventWriter.emit({
              type: 'card',
              cardData: inlineCard,
            });
          }
        } catch (cardErr) {
          logger.warn('Failed to build inline yield card', {
            operationId: payload.operationId,
            reason: yieldPayload.reason,
            error: cardErr instanceof Error ? cardErr.message : String(cardErr),
          });
        }

        eventWriter.emit({
          type: 'operation',
          operationId: payload.operationId,
          threadId,
          status: yieldStatus,
          yieldState,
          timestamp: new Date().toISOString(),
        });
        await eventWriter.dispose();

        if (threadId && this.chatService) {
          try {
            // Persist stream snapshot (tool steps + parts) so the thread
            // timeline survives a page reload while the yield card is active.
            // Without this, only the assistant_yield text row is stored and
            // all streamed tool steps are lost from MongoDB on reload.
            // Uses the same idempotency key as the controlled-abort path —
            // safe because the two paths are mutually exclusive per operation.
            const yieldSnapshot = persistedAssistantStream.snapshot();
            const hasYieldSnapshot =
              yieldSnapshot.content.length > 0 ||
              yieldSnapshot.steps.length > 0 ||
              yieldSnapshot.parts.length > 0;

            if (hasYieldSnapshot) {
              const enrichedExisting =
                await this.chatService.enrichLatestAssistantMessageForOperation({
                  threadId,
                  userId: payload.userId,
                  operationId: payload.operationId,
                  ...(yieldSnapshot.steps.length > 0 ? { steps: yieldSnapshot.steps } : {}),
                  ...(yieldSnapshot.parts.length > 0 ? { parts: yieldSnapshot.parts } : {}),
                });

              if (!enrichedExisting) {
                await this.chatService.addMessage({
                  threadId,
                  userId: payload.userId,
                  role: 'assistant',
                  content: yieldSnapshot.content || '',
                  origin: payload.origin,
                  agentId: yieldPayload.agentId,
                  operationId: payload.operationId,
                  idempotencyKey: `${payload.operationId}:assistant_partial`,
                  semanticPhase: 'assistant_partial',
                  ...(yieldSnapshot.steps.length > 0 ? { steps: yieldSnapshot.steps } : {}),
                  ...(yieldSnapshot.parts.length > 0 ? { parts: yieldSnapshot.parts } : {}),
                });
                logger.info('Persisted fallback partial agent response on yield', {
                  operationId: payload.operationId,
                  threadId,
                  contentLength: yieldSnapshot.content.length,
                  stepCount: yieldSnapshot.steps.length,
                });
              } else {
                logger.info('Enriched existing assistant response on yield', {
                  operationId: payload.operationId,
                  threadId,
                  contentLength: yieldSnapshot.content.length,
                  stepCount: yieldSnapshot.steps.length,
                  messageId: enrichedExisting.id,
                });
              }
            }

            await this.chatService.updateThreadPausedYieldState?.(threadId, yieldState);
            await this.chatService.addMessage({
              threadId,
              userId: payload.userId,
              role: 'assistant',
              content: yieldPayload.promptToUser,
              origin: 'agent_chain',
              agentId: yieldPayload.agentId,
              operationId: payload.operationId,
              // Store yield reason so the frontend can distinguish needs_approval
              // from needs_input on session reload — the in-memory SSE card is
              // gone after leaving and returning to a session.
              resultData: { yieldState: { reason: yieldPayload.reason } },
              // Phase-scoped idempotency: prevents duplicate yield prompts on
              // BullMQ retry. Stable per operation — a given job yields at most
              // once, so the key space is safe.
              idempotencyKey: `${payload.operationId}:assistant_yield`,
              semanticPhase: 'assistant_yield',
            });
          } catch (chatErr) {
            logger.warn('Failed to persist yield message to MongoDB', {
              threadId,
              operationId: payload.operationId,
              error: chatErr instanceof Error ? chatErr.message : String(chatErr),
            });
          }
        }

        // Multi-channel notification (push + SMS)
        try {
          const activityDb = await this.getActivityFirestore(job);
          const approvalCopy =
            yieldPayload.reason === 'needs_approval' && yieldPayload.pendingToolCall
              ? resolveAgentApprovalCopy({
                  toolName: yieldPayload.pendingToolCall.toolName,
                  toolInput: yieldPayload.pendingToolCall.toolInput,
                })
              : null;
          if (yieldPayload.reason === 'needs_approval' && approvalCopy) {
            await notifyYield(activityDb, {
              userId: payload.userId,
              reason: 'needs_approval',
              operationId: payload.operationId,
              threadId,
              approvalId: yieldPayload.approvalId,
              actionSummary: approvalCopy.actionSummary,
            });
          } else {
            await notifyYield(activityDb, {
              userId: payload.userId,
              reason: 'needs_input',
              operationId: payload.operationId,
              threadId,
              approvalId: yieldPayload.approvalId,
              promptToUser: yieldPayload.promptToUser,
            });
          }
        } catch (notifyErr) {
          logger.warn('Failed to dispatch yield notification', {
            operationId: payload.operationId,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }

        logger.info('Agent job yielded — awaiting user response', {
          operationId: payload.operationId,
          userId: payload.userId,
          reason: yieldPayload.reason,
          agentId: yieldPayload.agentId,
        });

        // Release any IAP hold — job is paused, not actively running
        if (iapHoldId) {
          releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
            logger.warn('[billing] Failed to release IAP hold on yield', {
              holdId: iapHoldId,
              error: e instanceof Error ? e.message : String(e),
            });
          });
        }

        this.discardConnectedSourceTracking(
          payload.operationId,
          'yielded_waiting_input_or_approval'
        );

        // Return a clean result so BullMQ marks the job as "completed" (not failed).
        // The actual continuation happens when the user responds via the resume route.
        return {
          result: {
            summary: yieldPayload.promptToUser,
            data: { yielded: true, reason: yieldPayload.reason, agentId: yieldPayload.agentId },
          },
          durationMs: Date.now() - startMs,
          completedAt: new Date().toISOString(),
        };
      }

      const message = handledError instanceof Error ? handledError.message : 'Agent pipeline error';
      const insufficientBalanceSnapshot = extractInsufficientBalanceSnapshot(message);
      const errorCode = getAgentEngineErrorCode(handledError) ?? 'AGENT_PIPELINE_FAILED';
      const failedAgentId = isAgentIdentifier(payload.agent)
        ? payload.agent
        : isAgentIdentifier((payload.context as Record<string, unknown> | undefined)?.['agentId'])
          ? ((payload.context as Record<string, unknown>)['agentId'] as AgentIdentifier)
          : undefined;

      await job.updateProgress({
        status: 'failed',
        message,
        agentId: failedAgentId,
        outcomeCode: 'task_failed',
        metadata: { errorCode },
        percent: Math.min(100, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
        currentStep: stepIndex,
        totalSteps,
        updatedAt: new Date().toISOString(),
      });

      // Write terminal 'done' event with error so frontend's Firestore listener knows to stop
      if (insufficientBalanceSnapshot) {
        const insufficientMessage =
          'You need more wallet credits to run this request. Open Usage to add funds and try again.';
        eventWriter.emit({
          type: 'delta',
          agentId: failedAgentId ?? 'router',
          text: insufficientMessage,
        });
        eventWriter.emit({
          type: 'card',
          agentId: failedAgentId ?? 'router',
          cardData: {
            type: 'billing-action',
            agentId: failedAgentId ?? 'router',
            title: 'Add Funds to Continue',
            payload: {
              reason: 'insufficient_funds',
              description: insufficientMessage,
              ...(insufficientBalanceSnapshot.currentBalanceCents !== undefined
                ? { currentBalanceCents: insufficientBalanceSnapshot.currentBalanceCents }
                : {}),
              ...(insufficientBalanceSnapshot.amountNeededCents !== undefined
                ? { amountNeededCents: insufficientBalanceSnapshot.amountNeededCents }
                : {}),
            },
          },
        });
      }

      eventWriter.emit({
        type: 'operation',
        operationId: payload.operationId,
        threadId: payloadThreadId,
        status: 'failed',
        timestamp: new Date().toISOString(),
      });
      eventWriter.emit({
        type: 'done',
        success: false,
        error: message,
        errorCode,
        outcomeCode: 'task_failed',
        metadata: { errorCode },
        agentId: failedAgentId ?? 'router',
      });
      await eventWriter.dispose();

      // Write failure to Firestore before re-throwing so BullMQ records the error
      await repo.markFailed(payload.operationId, message).catch((fsErr: unknown) => {
        logger.warn('Failed to write failure to Firestore', {
          operationId: payload.operationId,
          error: fsErr instanceof Error ? fsErr.message : String(fsErr),
        });
      });
      await syncWeeklyRecapDispatchStatus('failed', message);

      await this.flushConnectedSourceTerminalStatus(
        payload.operationId,
        'error',
        'unhandled_pipeline_failure'
      );

      // Notify the user that their task failed (they shouldn't just see silence)
      try {
        const activityDb = await this.getActivityFirestore(job);
        if (scheduledRunContext) {
          await dispatchAgentPush(activityDb, {
            kind: 'agent_scheduled_execution_failed',
            userId: payload.userId,
            operationId: payload.operationId,
            scheduleId: scheduledRunContext.scheduleId,
            runId: scheduledRunContext.runId,
            threadId: payloadThreadId,
            title: 'Scheduled Agent Task Failed',
            body: message,
            errorMessage: message,
          });
        } else {
          await logAgentTaskFailure(activityDb, {
            userId: payload.userId,
            job: payload,
            errorMessage: message,
          });
        }
      } catch (notifyErr) {
        logger.error('Failed to dispatch failure notification', {
          operationId: payload.operationId,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }

      // Release any IAP hold — job failed, funds should not stay locked
      if (iapHoldId) {
        releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
          logger.warn('[billing] Failed to release IAP hold on job failure', {
            holdId: iapHoldId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }

      throw handledError;
    } finally {
      // Always unregister the AbortController — the LLM router is no longer
      // running at this point regardless of success, failure, or yield.
      this.queueService?.unregisterController(payload.operationId);
      // Release the Redis control-channel subscription so we don't leak
      // subscribers across jobs.
      if (unsubscribeControl) {
        await unsubscribeControl().catch((err) => {
          logger.warn('[worker] Failed to unsubscribe from control channel', {
            operationId: payload.operationId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    }

    const resultData =
      typeof result.data === 'object' && result.data !== null
        ? (result.data as Record<string, unknown>)
        : undefined;
    const pauseCompletionGuard = await this.shouldSuppressTerminalCompletionForPause(
      repo,
      payload.operationId
    );
    if (pauseCompletionGuard.suppressed) {
      await eventWriter.flush().catch(() => undefined);
      await eventWriter.dispose();

      await job.updateProgress({
        status: 'paused',
        message: 'Operation paused by user',
        agentId: 'router',
        outcomeCode: 'input_required',
        metadata: {
          reason: 'paused_by_user',
          persistedStatus: pauseCompletionGuard.persistedStatus,
        },
        percent: Math.min(99, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
        currentStep: stepIndex,
        totalSteps,
        updatedAt: new Date().toISOString(),
      });

      if (iapHoldId) {
        releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
          logger.warn('[billing] Failed to release IAP hold for paused operation', {
            holdId: iapHoldId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }

      logger.info('Pause guard suppressed terminal completion and side effects', {
        operationId: payload.operationId,
        userId: payload.userId,
        persistedStatus: pauseCompletionGuard.persistedStatus,
      });

      this.discardConnectedSourceTracking(payload.operationId, 'pause_completion_guard');

      return {
        result: {
          summary: 'Operation paused. Resume whenever you are ready.',
          data: {
            paused: true,
            suppressedTerminalCompletion: true,
            persistedStatus: pauseCompletionGuard.persistedStatus,
          },
        },
        durationMs: Date.now() - startMs,
        completedAt: new Date().toISOString(),
      };
    }

    const maxIterationsReached = resultData?.['maxIterationsReached'] === true;
    const planFailed = resultData?.['operationStatus'] === 'failed';
    // Tool failure propagated from the agent runLoop (e.g. an underlying tool
    // returned `{ success: false }` and the agent had no successful recovery).
    // Treating this as a terminal failure flips the sidebar / operations log
    // to a red error state instead of a green check.
    const toolFailureReported = result.success === false;
    const isTerminalFailure = maxIterationsReached || planFailed || toolFailureReported;
    const terminalMessage =
      typeof result.summary === 'string' && result.summary.length > 0
        ? result.summary
        : maxIterationsReached
          ? 'The agent reached its maximum iteration limit without completing the task.'
          : planFailed
            ? 'Execution plan failed.'
            : toolFailureReported
              ? result.errorMessage?.trim() || 'A required tool failed.'
              : 'All tasks finished.';
    const firstFailedAssignedAgent = (
      resultData?.['firstFailedTask'] as { assignedAgent?: unknown } | undefined
    )?.assignedAgent;
    const finalAgentId = isTerminalFailure
      ? isAgentIdentifier(firstFailedAssignedAgent)
        ? firstFailedAssignedAgent
        : isAgentIdentifier(payload.agent)
          ? payload.agent
          : 'router'
      : isAgentIdentifier(payload.agent)
        ? payload.agent
        : 'router';
    const terminalOutcomeCode = isTerminalFailure ? 'task_failed' : 'success_default';

    // ── Flush remaining deltas and write terminal events ─────────────────
    //
    // Thread titles are now generated at enqueue time via generateTitleFromPromptOnly
    // in the route handler. No LLM call or blocking needed here — the title_updated
    // SSE event is published by the route immediately after thread creation.
    const rawSummary = this.resolveResultSummary(result);
    // Strip any echoed user-attachment URLs from the persisted summary so the
    // saved chat message matches the sanitized live stream. The streaming
    // sanitizer's residual tail (if any) is also flushed to SSE below before
    // the terminal `done` event is emitted.
    const summary =
      userAttachmentUrlSet.size > 0
        ? stripEchoedUserAttachments(rawSummary, userAttachmentUrlSet)
        : rawSummary;
    const sanitizerTail = streamingSanitizer.flush();
    if (sanitizerTail.length > 0) {
      try {
        const tailSse = this.streamEventToSSE(
          {
            type: 'delta',
            agentId: finalAgentId,
            text: sanitizerTail,
            timestamp: new Date().toISOString(),
          },
          payload.operationId,
          payloadThreadId
        );
        if (tailSse) {
          await this.pubsub
            .publish(payload.operationId, tailSse.event, tailSse.data)
            .catch(() => undefined);
        }
      } catch (tailErr) {
        logger.warn('Failed to flush streaming sanitizer tail', {
          operationId: payload.operationId,
          error: tailErr instanceof Error ? tailErr.message : String(tailErr),
        });
      }
    }

    // Flush any pending data/delta events to subscribers, but DEFER the terminal
    // `operation` event until AFTER the Firestore write succeeds. This prevents
    // a race where the frontend receives `complete` over SSE before the
    // `AgentJobs/{operationId}` document is updated, leaving the UI in an
    // inconsistent state (SSE says done, Firestore snapshot still shows running).
    await eventWriter.flush().catch(() => undefined);
    const terminalStatus = isTerminalFailure ? 'error' : 'complete';
    const terminalOperationStatus: 'failed' | 'complete' =
      terminalStatus === 'error' ? 'failed' : 'complete';

    const emitTerminalOperationEvent = async (
      status: 'failed' | 'complete' = terminalOperationStatus
    ): Promise<void> => {
      try {
        eventWriter.emit({
          type: 'operation',
          operationId: payload.operationId,
          threadId: payloadThreadId,
          status,
          timestamp: new Date().toISOString(),
        });
        await eventWriter.flush().catch(() => undefined);
      } catch (emitErr) {
        logger.warn('Failed to emit terminal operation SSE event', {
          operationId: payload.operationId,
          status,
          error: emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }
    };

    const terminalProgress: AgentJobProgress = {
      status: isTerminalFailure ? 'failed' : 'completed',
      message: isTerminalFailure ? terminalMessage : 'All tasks finished.',
      agentId: finalAgentId,
      outcomeCode: terminalOutcomeCode,
      percent: 100,
      currentStep: totalSteps,
      totalSteps,
      updatedAt: new Date().toISOString(),
    };
    await job.updateProgress(terminalProgress);

    logger.info('Agent job result resolved before persistence', {
      operationId: payload.operationId,
      resultSummary: result.summary,
      operationStatus: resultData?.['operationStatus'],
    });

    // Treat max-iterations as a failure — the agent made no real progress
    if (maxIterationsReached) {
      logger.warn('Agent hit max iterations limit — marking as failed', {
        operationId: payload.operationId,
        userId: payload.userId,
      });
      await repo.markFailed(payload.operationId, terminalMessage).catch((err: unknown) => {
        logger.warn('Failed to write max-iterations failure to Firestore', {
          operationId: payload.operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      await syncWeeklyRecapDispatchStatus('failed', terminalMessage);

      await this.flushConnectedSourceTerminalStatus(payload.operationId, 'error', 'max_iterations');

      // Emit terminal SSE event AFTER persistence so the frontend's SSE-derived
      // state cannot get ahead of the Firestore document.
      await emitTerminalOperationEvent('failed');

      if (scheduledRunContext) {
        try {
          const activityDb = await this.getActivityFirestore(job);
          await dispatchAgentPush(activityDb, {
            kind: 'agent_scheduled_execution_failed',
            userId: payload.userId,
            operationId: payload.operationId,
            scheduleId: scheduledRunContext.scheduleId,
            runId: scheduledRunContext.runId,
            threadId: payloadThreadId,
            title: 'Scheduled Agent Task Failed',
            body: terminalMessage,
            errorMessage: terminalMessage,
          });
        } catch (notifyErr) {
          logger.error('Failed to dispatch scheduled max-iterations failure notification', {
            operationId: payload.operationId,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }

      return {
        result,
        durationMs: Date.now() - startMs,
        completedAt: new Date().toISOString(),
      };
    }

    if (planFailed) {
      logger.warn('Agent execution plan failed — marking as failed', {
        operationId: payload.operationId,
        userId: payload.userId,
        firstFailedTask: resultData?.['firstFailedTask'],
      });
      await repo.markFailed(payload.operationId, terminalMessage).catch((err: unknown) => {
        logger.warn('Failed to write plan failure to Firestore', {
          operationId: payload.operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });
      await syncWeeklyRecapDispatchStatus('failed', terminalMessage);

      await this.flushConnectedSourceTerminalStatus(payload.operationId, 'error', 'plan_failed');

      // Emit terminal SSE event AFTER persistence so the frontend's SSE-derived
      // state cannot get ahead of the Firestore document.
      await emitTerminalOperationEvent('failed');

      if (scheduledRunContext) {
        try {
          const activityDb = await this.getActivityFirestore(job);
          await dispatchAgentPush(activityDb, {
            kind: 'agent_scheduled_execution_failed',
            userId: payload.userId,
            operationId: payload.operationId,
            scheduleId: scheduledRunContext.scheduleId,
            runId: scheduledRunContext.runId,
            threadId: payloadThreadId,
            title: 'Scheduled Agent Task Failed',
            body: terminalMessage,
            errorMessage: terminalMessage,
          });
        } catch (notifyErr) {
          logger.error('Failed to dispatch scheduled plan-failure notification', {
            operationId: payload.operationId,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }

      return {
        result,
        durationMs: Date.now() - startMs,
        completedAt: new Date().toISOString(),
      };
    }

    // `summary` and `generatedOperationTitle` are already computed above in the
    // terminal-events section. Re-use them here so we avoid a redundant LLM call;
    // `result.title` was already set if a title was generated in time.

    // Persist final result to Firestore.
    // Fail closed: if completion state cannot be persisted, do not continue with
    // success side-effects while the durable job record is inconsistent.
    //
    // Status routing: when the agent loop signals `success === false` (an
    // underlying tool failed, the agent hit max iterations, or a guardrail
    // aborted execution) route through `markFailed` so the operations log
    // sidebar shows a red error state instead of a green check. Without this
    // branch, a job whose only "result" was an apology message ("Sorry, I
    // couldn't generate that graphic.") would still flip the sidebar to green
    // on next refresh / session re-entry.
    const operationFailed = result.success === false;
    const failureMessage = operationFailed
      ? result.errorMessage?.trim() || result.summary?.trim() || 'Operation failed.'
      : '';
    try {
      if (operationFailed) {
        await repo.markFailed(payload.operationId, failureMessage);
        await syncWeeklyRecapDispatchStatus('failed', failureMessage);
      } else {
        await repo.markCompleted(payload.operationId, result);
      }
    } catch (err: unknown) {
      const persistError = err instanceof Error ? err.message : String(err);
      logger.error('Failed to write completion to Firestore', {
        operationId: payload.operationId,
        operationFailed,
        error: persistError,
      });

      await repo
        .markFailed(payload.operationId, `Completion persistence failed: ${persistError}`)
        .catch((markFailedErr: unknown) => {
          logger.error('Failed to persist fallback failed status after completion write error', {
            operationId: payload.operationId,
            error: markFailedErr instanceof Error ? markFailedErr.message : String(markFailedErr),
          });
        });
      await syncWeeklyRecapDispatchStatus(
        'failed',
        `Completion persistence failed: ${persistError}`
      );

      await this.flushConnectedSourceTerminalStatus(
        payload.operationId,
        'error',
        'completion_persist_failed'
      );

      // Notify clients that the operation failed even though it ran to completion
      // logically — the durable record is the source of truth.
      await emitTerminalOperationEvent('failed');

      throw new AgentEngineError(
        'AGENT_COMPLETION_PERSIST_FAILED',
        `Failed to persist completion state: ${persistError}`,
        { metadata: { operationId: payload.operationId } }
      );
    }

    await this.flushConnectedSourceTerminalStatus(
      payload.operationId,
      operationFailed ? 'error' : 'success',
      operationFailed ? 'tool_failure' : 'completed'
    );

    // Firestore write succeeded — now safe to tell SSE subscribers we're done.
    // Frontend `onSnapshot` and SSE listeners will now agree on the terminal state.
    // Emit `failed` (not `complete`) when an underlying tool reported failure so
    // the sidebar / operations log renders a red error state, matching the
    // Firestore document we just wrote via `markFailed`.
    await emitTerminalOperationEvent(operationFailed ? 'failed' : 'complete');

    // Registration-origin jobs (welcome graphic onboarding path) should not wait
    // for post-processing side effects (activity feed, notification dispatch,
    // Mongo persistence) before notifying the UI that the operation is terminal.
    // Emit an early `done` event so the chat spinner can resolve immediately.
    const isRegistrationOrigin =
      typeof (payloadContext as Record<string, unknown>)['origin'] === 'string' &&
      ((payloadContext as Record<string, unknown>)['origin'] as string).trim().toLowerCase() ===
        'registration';
    if (isRegistrationOrigin && summary.trim().length > 0) {
      eventWriter.emit({
        type: 'delta',
        agentId: finalAgentId,
        text: `\n${summary}\n`,
        noBatch: true,
      });
      await eventWriter.flush().catch(() => undefined);
    }

    // Billing deduction: use centralized pipeline. Keep job-level org/team
    // context so charges are attributed to the active team instead of a stored
    // billing-target fallback.
    const contextOrgId =
      typeof (payloadContext as Record<string, unknown>)['organizationId'] === 'string'
        ? ((payloadContext as Record<string, unknown>)['organizationId'] as string)
        : undefined;
    const contextTeamId =
      typeof (payloadContext as Record<string, unknown>)['teamId'] === 'string'
        ? ((payloadContext as Record<string, unknown>)['teamId'] as string)
        : undefined;
    if (skipBilling) {
      logger.info('[AgentWorker] Skipping billing deduction for platform-sponsored job', {
        operationId: payload.operationId,
        userId: payload.userId,
        agent: payload.agent,
        origin: payload.origin,
      });
    } else {
      void executeBillingDeduction({
        db: billingDb,
        userId: payload.userId,
        operationId: payload.operationId,
        coordinatorId: payload.agent,
        agentTools: invokedTools,
        successfulTools,
        environment: job.data.environment,
        iapHoldId: iapHoldId ?? undefined,
        fallbackChargeAmountCents: iapHoldId ? walletHoldEstimateCents : undefined,
        teamId: contextTeamId,
        organizationId: contextOrgId,
        metadata: { agent: payload.agent, agentTools: invokedTools, successfulTools },
      });
    }

    // Dispatch activity feed item + push notification (fire-and-forget).
    // Skip push when the operation currently has an active live stream subscriber.
    // The user is already watching the completion in real time.
    try {
      const activityDb = await this.getActivityFirestore(job);

      // Fetch the thread title generated at enqueue time so notifications
      // display a meaningful subject instead of the generic “Agent X Update” fallback.
      let threadTitle: string | undefined;
      if (payloadThreadId && this.chatService) {
        const thread = await this.chatService
          .getThread(payloadThreadId, payload.userId)
          .catch(() => null);
        threadTitle = thread?.title?.trim() || undefined;
      }

      if (scheduledRunContext) {
        const schedCopy = resolveAgentSuccessNotificationCopy({
          threadTitle,
          title: result.title?.trim() || undefined,
          summary: deriveBodyFromResult(result) || undefined,
        });
        await dispatchAgentPush(activityDb, {
          kind: 'agent_scheduled_execution_completed',
          userId: payload.userId,
          operationId: payload.operationId,
          scheduleId: scheduledRunContext.scheduleId,
          runId: scheduledRunContext.runId,
          threadId: payloadThreadId,
          title: schedCopy.title,
          body: schedCopy.body,
        });
      } else {
        const latestJobDoc =
          typeof (repo as { getById?: unknown }).getById === 'function'
            ? await repo.getById(payload.operationId)
            : null;
        const viewerLastSeenAtRaw = (latestJobDoc as Record<string, unknown> | null)?.[
          'viewerLastSeenAt'
        ];
        const viewerLastSeenAtMs =
          typeof viewerLastSeenAtRaw === 'string' ? Date.parse(viewerLastSeenAtRaw) : Number.NaN;
        const hasRecentViewerHeartbeat =
          Number.isFinite(viewerLastSeenAtMs) &&
          Date.now() - viewerLastSeenAtMs <=
            AGENT_X_RUNTIME_CONFIG.operationQueue.viewerHeartbeatFreshnessMs;

        const activeSubscribers =
          typeof this.pubsub.subscriberCount === 'function'
            ? await this.pubsub.subscriberCount(payload.operationId)
            : 0;
        const suppressPushWhenActivelyViewing =
          shouldSuppressCompletionPushWhenActivelyViewing(payload);

        if (suppressPushWhenActivelyViewing && activeSubscribers > 0 && hasRecentViewerHeartbeat) {
          logger.info('Skipping completion push; active engaged viewer detected', {
            operationId: payload.operationId,
            subscriberCount: activeSubscribers,
            viewerLastSeenAt: viewerLastSeenAtRaw,
            origin: payload.origin,
          });
        } else {
          await logAgentTaskCompletion(activityDb, {
            userId: payload.userId,
            job: payload,
            result,
            threadTitle,
          });
        }
      }
    } catch (notifyErr) {
      logger.error('Failed to dispatch activity/notification', {
        operationId: payload.operationId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    // ─── Weekly recap email (fire-and-forget) ─────────────────────────────
    if (payload.triggerEvent?.type === 'weekly_recap') {
      const recapNumber = payload.triggerEvent.eventData['recapNumber'];
      const recapWeekLabel = payload.triggerEvent.eventData['recapWeekLabel'];

      void processRecapForUser(payload.userId, summary, job.id?.toString(), billingDb, {
        recapNumber: typeof recapNumber === 'number' ? recapNumber : undefined,
        weekLabel: typeof recapWeekLabel === 'string' ? recapWeekLabel : undefined,
      });
    }

    const persistedStreamSnapshot = persistedAssistantStream.snapshot();
    const persistedAssistantContentForDone =
      persistedStreamSnapshot.content.length > 0 ? persistedStreamSnapshot.content : summary;

    // ─── Persist assistant response to MongoDB thread ─────────────────────
    const threadId = payloadThreadId;
    let persistedAssistantMessageId: string | undefined;

    if (threadId && this.chatService) {
      try {
        // Extract agentId with runtime type check
        const rawAgent =
          typeof result.data === 'object' && result.data !== null
            ? (result.data as Record<string, unknown>)['agent']
            : undefined;
        const agentId =
          typeof rawAgent === 'string'
            ? (rawAgent as import('@nxt1/core').AgentIdentifier)
            : undefined;

        // Extract tool call records from result.data (built by base.agent.ts)
        const rawToolCalls =
          typeof result.data === 'object' && result.data !== null
            ? (result.data as Record<string, unknown>)['toolCallRecords']
            : undefined;
        const toolCalls = Array.isArray(rawToolCalls)
          ? (rawToolCalls as import('@nxt1/core').AgentToolCallRecord[])
          : undefined;
        const resultDataRecord =
          typeof result.data === 'object' && result.data !== null
            ? (result.data as Record<string, unknown>)
            : undefined;
        const generatedAttachments = resultDataRecord
          ? extractMediaAttachmentsFromResultData(resultDataRecord)
          : [];

        // [DIAG] Temporary diagnostic log — remove after confirming media attachment flow
        logger.info('[MediaDiag] extractMediaAttachmentsFromResultData result', {
          operationId: payload.operationId,
          agentId: finalAgentId,
          attachmentCount: generatedAttachments.length,
          attachments: generatedAttachments.map((a) => ({
            url: a.url?.slice(0, 120),
            name: a.name,
            type: a.type,
          })),
          resultDataKeys: resultDataRecord ? Object.keys(resultDataRecord) : [],
          hasImageUrl: typeof resultDataRecord?.['imageUrl'] === 'string',
          imageUrlPreview:
            typeof resultDataRecord?.['imageUrl'] === 'string'
              ? (resultDataRecord['imageUrl'] as string).slice(0, 120)
              : null,
          hasFiles: Array.isArray(resultDataRecord?.['files']),
          filesCount: Array.isArray(resultDataRecord?.['files'])
            ? (resultDataRecord['files'] as unknown[]).length
            : 0,
        });

        const resolvePersistedAttachmentType = (
          mimeType: string,
          fallbackType: import('@nxt1/core').AgentXAttachment['type']
        ): import('@nxt1/core').AgentXAttachment['type'] => {
          if (mimeType === 'application/pdf') return 'pdf';
          if (mimeType === 'text/csv') return 'csv';
          return fallbackType;
        };

        const attachmentsFromResultData: import('@nxt1/core').AgentXAttachment[] =
          generatedAttachments.map((attachment) => {
            const mimeType =
              attachment.mimeType ??
              (attachment.type === 'image'
                ? 'image/jpeg'
                : attachment.type === 'video'
                  ? 'video/mp4'
                  : 'application/octet-stream');

            return {
              id: crypto.randomUUID(),
              url: attachment.url,
              ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
              name: attachment.name,
              mimeType,
              type: resolvePersistedAttachmentType(mimeType, attachment.type),
              sizeBytes: attachment.sizeBytes ?? 0,
              ...(attachment.thumbnailUrl ? { thumbnailUrl: attachment.thumbnailUrl } : {}),
              ...(attachment.cloudflareVideoId
                ? { cloudflareVideoId: attachment.cloudflareVideoId }
                : {}),
            };
          });

        // Normalize persisted prose: remove model-emitted raw storage/diagrams.net URLs
        // and then append canonical links from structured tool result data.
        const baseAssistantContent = sanitizeStorageUrlsFromText(persistedAssistantContentForDone, {
          normalizeWhitespace: false,
        })
          .replace(/https:\/\/app\.diagrams\.net\/#R[^\s)\]]+/gi, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // Ensure generated export/document links are delivered in the same final
        // assistant message even if the LLM forgets to include them in prose.
        const missingDocLinks = attachmentsFromResultData
          .filter((attachment) => attachment.type === 'doc')
          .filter((attachment) => {
            const url = attachment.url?.trim();
            return !!url && !baseAssistantContent.includes(url);
          })
          .map(
            (attachment) => `- [${attachment.name || 'Download file'}](${attachment.url.trim()})`
          );

        const persistedAssistantContentForStorage =
          missingDocLinks.length > 0
            ? `${baseAssistantContent}${missingDocLinks.length > 0 ? `\n\nDownload:\n${missingDocLinks.join('\n')}` : ''}`
            : baseAssistantContent;

        const addMessageParams = {
          threadId,
          userId: payload.userId,
          role: 'assistant' as const,
          content: persistedAssistantContentForStorage,
          origin: payload.origin,
          agentId,
          operationId: payload.operationId,
          toolCalls,
          // Idempotency key prevents duplicate rows when BullMQ retries the
          // job after a transient failure. The key is stable per operation so
          // a second attempt finds the existing row and returns it without
          // creating a new one or double-incrementing thread messageCount.
          idempotencyKey: `${payload.operationId}:final-assistant`,
          // Phase-aware: final row supersedes any assistant_partial row written
          // on pause/abort. The UI projection removes partial rows when final
          // exists for the same operationId.
          semanticPhase: 'assistant_final' as const,
          ...(persistedStreamSnapshot.steps.length > 0
            ? { steps: persistedStreamSnapshot.steps }
            : {}),
          ...(persistedStreamSnapshot.parts.length > 0
            ? { parts: persistedStreamSnapshot.parts }
            : {}),
          ...(attachmentsFromResultData.length > 0
            ? { attachments: attachmentsFromResultData }
            : {}),
          resultData: resultDataRecord,
        };

        // Retry transient MongoDB write failures (network blip, replica lag).
        // The idempotency key guarantees exactly-once semantics across retries.
        const PERSIST_RETRY_DELAYS_MS = [0, 500, 1500];
        let lastPersistError: unknown;
        for (let attempt = 0; attempt < PERSIST_RETRY_DELAYS_MS.length; attempt++) {
          const delayMs = PERSIST_RETRY_DELAYS_MS[attempt];
          if (delayMs > 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
          }
          try {
            const persistedAssistantMessage = await this.chatService.addMessage(addMessageParams);
            persistedAssistantMessageId = persistedAssistantMessage.id;
            lastPersistError = undefined;
            break;
          } catch (err) {
            lastPersistError = err;
            if (attempt < PERSIST_RETRY_DELAYS_MS.length - 1) {
              logger.warn('Transient MongoDB write failure persisting agent response, retrying', {
                threadId,
                operationId: payload.operationId,
                attempt,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }

        if (persistedAssistantMessageId) {
          logger.info('Agent response persisted to MongoDB thread', {
            threadId,
            operationId: payload.operationId,
            messageId: persistedAssistantMessageId,
          });

          if ((agentId ?? finalAgentId) === 'router') {
            logger.info('[PrimaryChat] assistant_message_persisted', {
              operationId: payload.operationId,
              userId: payload.userId,
              threadId,
              messageId: persistedAssistantMessageId,
              persistedAt: new Date().toISOString(),
              summaryPreview: persistedAssistantContentForStorage.slice(0, 160),
            });
          }
        } else if (lastPersistError) {
          // Chat persistence must never fail the job, but log at error level since
          // this causes the done event to have no messageId — a data-loss scenario.
          throw lastPersistError;
        }

        // Thread title is managed at enqueue time via generateTitleFromPromptOnly
        // in the route handler (chat.routes.ts). No LLM call is needed here.
        // If the upstream title gen failed, the thread title remains the raw
        // prompt prefix — still readable. applyGeneratedThreadTitle's guard
        // prevents any accidental overwrite if both paths ran.
      } catch (chatErr) {
        // Chat persistence must never fail the job, but log at error level since
        // this causes the done event to have no messageId — a data-loss scenario.
        logger.error(
          'Failed to persist agent response to MongoDB — done event will lack messageId',
          {
            threadId,
            operationId: payload.operationId,
            error: chatErr instanceof Error ? chatErr.message : String(chatErr),
          }
        );
      }
    }

    if (!persistedAssistantMessageId) {
      if (!threadId) {
        logger.error(
          'Agent done event emitted without messageId: threadId was absent from job context',
          {
            operationId: payload.operationId,
            userId: payload.userId,
            hasChatService: !!this.chatService,
          }
        );
      } else {
        // threadId was present but addMessage threw above
        logger.error(
          'Agent done event emitted without messageId: assistant message persistence failed',
          {
            operationId: payload.operationId,
            threadId,
            userId: payload.userId,
          }
        );
      }
    }

    const shouldSuppressDoneMessage =
      !maxIterationsReached &&
      !planFailed &&
      normalizeTerminalMessageText(terminalMessage) ===
        normalizeTerminalMessageText(persistedAssistantContentForDone);
    const doneMessageForEvent = shouldSuppressDoneMessage ? undefined : terminalMessage;

    eventWriter.emit({
      type: 'done',
      success: !operationFailed,
      message: doneMessageForEvent,
      ...(operationFailed ? { error: failureMessage || terminalMessage } : {}),
      outcomeCode: terminalOutcomeCode,
      agentId: finalAgentId,
      messageId: persistedAssistantMessageId,
      ...(threadId ? { threadId } : {}),
    });
    await eventWriter.dispose();

    return {
      result,
      plan: (result.data?.['plan'] as AgentQueueJobResult['plan']) ?? undefined,
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  }

  private resolveResultSummary(result: AgentOperationResult): string {
    if (result.success === false) {
      if (typeof result.errorMessage === 'string' && result.errorMessage.length > 0) {
        return result.errorMessage;
      }

      if (
        typeof result.summary === 'string' &&
        result.summary.length > 0 &&
        !/^task completed\.?$/i.test(result.summary.trim())
      ) {
        return result.summary;
      }

      if (typeof result.data === 'object' && result.data !== null) {
        const response = (result.data as Record<string, unknown>)['response'];
        if (
          typeof response === 'string' &&
          response.length > 0 &&
          !/^task completed\.?$/i.test(response.trim())
        ) {
          return response;
        }
      }

      return 'Task failed.';
    }

    if (typeof result.summary === 'string' && result.summary.length > 0) {
      return result.summary;
    }

    if (typeof result.data === 'object' && result.data !== null) {
      const response = (result.data as Record<string, unknown>)['response'];
      if (typeof response === 'string' && response.length > 0) {
        return response;
      }
    }

    return 'Task completed.';
  }

  // ─── SSE Translation ─────────────────────────────────────────────────

  /**
   * Convert a StreamEvent (internal worker format) to an SSE-compatible
   * event + data pair for Redis PubSub publishing.
   *
   * Returns null for events that don't map to SSE (shouldn't happen in practice).
   */
  private streamEventToSSE(
    event: StreamEvent,
    operationId: string,
    threadId?: string
  ): { event: string; data: unknown } | null {
    const seqPayload = typeof event.seq === 'number' ? { seq: event.seq } : {};
    switch (event.type) {
      case 'card':
        return {
          event: 'card',
          data: {
            ...(event.cardData ?? {}),
            ...seqPayload,
          },
        };
      case 'title_updated':
        return {
          event: 'title_updated',
          data: {
            ...seqPayload,
            operationId,
            ...(event.threadId ? { threadId: event.threadId } : {}),
            title: event.title ?? '',
            timestamp: event.timestamp ?? new Date().toISOString(),
          },
        };
      case 'operation':
        return {
          event: 'operation',
          data: {
            ...seqPayload,
            operationId,
            ...(event.threadId ? { threadId: event.threadId } : {}),
            status: event.status ?? 'in-progress',
            ...(event.agentId ? { agentId: event.agentId } : {}),
            ...(event.stageType ? { stageType: event.stageType } : {}),
            ...(event.stage ? { stage: event.stage } : {}),
            ...(event.outcomeCode ? { outcomeCode: event.outcomeCode } : {}),
            ...(event.metadata ? { metadata: event.metadata } : {}),
            ...(event.message ? { message: event.message } : {}),
            ...(event.yieldState ? { yieldState: event.yieldState } : {}),
            timestamp: event.timestamp ?? new Date().toISOString(),
          },
        };
      case 'progress_stage':
      case 'progress_subphase':
      case 'metric':
        return {
          event: 'progress',
          data: {
            ...seqPayload,
            operationId,
            ...(event.threadId ? { threadId: event.threadId } : {}),
            type: event.type,
            ...(event.agentId ? { agentId: event.agentId } : {}),
            ...(event.stageType ? { stageType: event.stageType } : {}),
            ...(event.stage ? { stage: event.stage } : {}),
            ...(event.outcomeCode ? { outcomeCode: event.outcomeCode } : {}),
            ...(event.metadata ? { metadata: event.metadata } : {}),
            ...(event.message ? { message: event.message } : {}),
            timestamp: event.timestamp ?? new Date().toISOString(),
          },
        };
      case 'delta':
        return {
          event: 'delta',
          data: {
            ...seqPayload,
            content: event.text ?? '',
            emittedAt: new Date().toISOString(),
          },
        };
      case 'thinking':
        return {
          event: 'thinking',
          data: {
            ...seqPayload,
            content: event.thinkingText ?? '',
            emittedAt: new Date().toISOString(),
          },
        };
      case 'step_active':
        return {
          event: 'step',
          data: {
            ...seqPayload,
            id: event.stepId ?? event.agentId ?? 'unknown',
            label: event.message ?? '',
            agentId: event.agentId,
            stageType: event.stageType,
            stage: event.stage,
            status: 'active',
            icon: event.icon,
          },
        };
      case 'step_done':
        return {
          event: 'step',
          data: {
            ...seqPayload,
            id: event.stepId ?? event.agentId ?? 'unknown',
            label: event.message ?? '',
            agentId: event.agentId,
            stageType: event.stageType,
            stage: event.stage,
            status: 'success',
            icon: event.icon,
          },
        };
      case 'step_error':
        return {
          event: 'step',
          data: {
            ...seqPayload,
            id: event.stepId ?? event.agentId ?? 'unknown',
            label: event.message ?? '',
            agentId: event.agentId,
            stageType: event.stageType,
            stage: event.stage,
            status: 'error',
            icon: event.icon,
          },
        };
      case 'tool_call':
        // tool_call fires during LLM streaming and has no stepId yet.
        // step_active always follows immediately with the same stepId and a
        // richer label, so skip SSE step creation for tool_call to avoid
        // creating a duplicate active row that would never resolve.
        return null;
      case 'tool_result':
        return {
          event: 'step',
          data: {
            ...seqPayload,
            id: event.stepId ?? event.toolName ?? 'tool',
            label: event.message ?? '',
            agentId: event.agentId,
            stageType: event.stageType,
            stage: event.stage,
            status: event.toolSuccess ? 'success' : 'error',
            icon: event.icon,
          },
        };
      case 'done': {
        const doneStatus =
          event.status ?? (event.success === false ? 'error' : event.error ? 'error' : 'complete');
        return {
          event: 'done',
          data: {
            ...seqPayload,
            operationId,
            ...(threadId ? { threadId } : {}),
            status: doneStatus,
            success: event.success ?? true,
            error: event.error,
            message: event.message,
            messageId: event.messageId,
            timestamp: new Date().toISOString(),
          },
        };
      }
      default:
        return null;
    }
  }

  // ─── Event Listeners ───────────────────────────────────────────────────

  private resolveQueueStatsUrl(): string {
    const baseUrl = process.env['BACKEND_BASE_URL'] ?? process.env['BACKEND_URL'] ?? '';
    if (!baseUrl) {
      return '/api/v1/agent/queue-stats';
    }

    return `${baseUrl.replace(/\/$/, '')}/api/v1/agent/queue-stats`;
  }

  private async postWorkerAlert(
    eventType: 'failed' | 'stalled',
    details: {
      jobId?: string | number;
      operationId?: string;
      error?: string;
    }
  ): Promise<void> {
    const headerText =
      eventType === 'failed' ? 'Agent Queue Job Failed' : 'Agent Queue Job Stalled';
    const queueStatsUrl = this.resolveQueueStatsUrl();

    await sendSlackAlert({
      target: 'agent',
      severity: 'critical',
      title: headerText,
      summary: 'Agent queue event requires attention.',
      fields: [
        { label: 'Job ID', value: String(details.jobId ?? 'unknown') },
        ...(details.operationId ? [{ label: 'Operation ID', value: details.operationId }] : []),
        ...(details.error ? [{ label: 'Error', value: details.error }] : []),
      ],
      linkText: 'Queue Stats',
      linkUrl: queueStatsUrl,
    });
  }

  private attachEventListeners(): void {
    this.worker.on('completed', (job) => {
      if (job) {
        const duration = job.returnvalue?.durationMs ?? 0;
        const operationId =
          job.data.kind === 'agent'
            ? job.data.payload.origin === 'system_cron'
              ? (job.id?.toString() ?? job.data.payload.operationId)
              : job.data.payload.operationId
            : job.data.kind === 'thread_summarization'
              ? `summarize_${job.data.threadId}`
              : job.data.operationId;

        logger.info('Agent queue job completed', {
          jobId: job.id,
          operationId,
          durationMs: duration,
        });
      }
    });

    this.worker.on('failed', (job, err) => {
      const operationId =
        job?.data.kind === 'agent'
          ? job.data.payload.origin === 'system_cron'
            ? (job.id?.toString() ?? job.data.payload.operationId)
            : job.data.payload.operationId
          : job?.data.kind === 'thread_summarization'
            ? `summarize_${job.data.threadId}`
            : job?.data.kind === 'playbook_generation'
              ? job.data.operationId
              : undefined;

      logger.error('Agent queue job failed', {
        jobId: job?.id,
        operationId,
        error: err.message,
        stack: err.stack,
      });

      void this.postWorkerAlert('failed', {
        jobId: job?.id,
        operationId,
        error: err.message,
      });
    });

    this.worker.on('stalled', (jobId) => {
      logger.error('Agent job stalled (lock expired) — marking as failed in Firestore', {
        jobId,
      });

      void this.postWorkerAlert('stalled', {
        jobId,
      });

      // Mark all candidate repos — stalled jobs only surface a jobId here, so recover
      // both standard AgentJobs and the recap-specific collection across environments.
      const failMessage = 'Job stalled: processing exceeded lock duration and was abandoned.';
      void this.productionJobRepo.markFailed(jobId, failMessage).catch(() => {
        /* stall recovery */
      });
      void this.productionJobRepo
        .withCollection(AGENT_WEEKLY_RECAP_JOBS_COLLECTION)
        .markFailed(jobId, failMessage)
        .catch(() => {
          /* stall recovery */
        });
      void this.stagingJobRepo.markFailed(jobId, failMessage).catch(() => {
        /* stall recovery */
      });
      void this.stagingJobRepo
        .withCollection(AGENT_WEEKLY_RECAP_JOBS_COLLECTION)
        .markFailed(jobId, failMessage)
        .catch(() => {
          /* stall recovery */
        });
    });

    this.worker.on('error', (err) => {
      // Worker-level errors (Redis disconnect, etc.)
      logger.error('Agent worker error', {
        error: err.message,
      });
    });
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Gracefully shut down the worker.
   * Waits for active jobs to finish (up to 30 seconds), then disconnects.
   */
  async shutdown(): Promise<void> {
    await this.worker.close();
  }

  /** Check if the worker is currently running. */
  isRunning(): boolean {
    return this.worker.isRunning();
  }
}
