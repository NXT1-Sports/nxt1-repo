/**
 * @fileoverview Base Agent — Abstract Sub-Agent with ReAct Loop
 * @module @nxt1/backend/modules/agent/agents
 *
 * Every specialized coordinator (Performance, Recruiting, Brand & Media, etc.)
 * extends this base class. It provides the standard ReAct execution loop:
 *
 *   System prompt → LLM call → Tool call (if requested) → Observation → Loop
 *
 * Sub-agents override:
 * - `getSystemPrompt()` — The agent's persona and domain instructions.
 * - `getAvailableTools()` — Legacy/debug surface. Runtime tool permissions
 *   are enforced by `tool-policy.ts` via `getEffectiveAgentToolPolicy()`.
 * - `getModelRouting()` — Default model tier for this agent's tasks.
 *
 * The ReAct loop is capped at MAX_ITERATIONS to prevent runaway execution.
 */

import type {
  AgentArtifactHandoff,
  AgentIdentifier,
  AgentToolDefinition,
  AgentToolEntityGroup,
  AgentSessionContext,
  AgentOperationResult,
  AgentToolCallRecord,
  AgentXToolStepIcon,
  GameAnalysisParams,
  ModelRoutingConfig,
  ToolStage,
} from '@nxt1/core';
import { resolveAgentApprovalPrompt } from '@nxt1/core';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import type { ToolExecutionContext, ToolResult } from '../tools/base.tool.js';
import type {
  LLMMessage,
  LLMToolSchema,
  LLMToolCall,
  LLMFileContentPart,
} from '../llm/llm.types.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import { GlobalKnowledgeSkill } from '../skills/knowledge/global-knowledge.skill.js';
import { AgentYieldException, isAgentYield } from '../exceptions/agent-yield.exception.js';
import {
  isAgentDelegation,
  AgentDelegationException,
} from '../exceptions/agent-delegation.exception.js';
import { isDelegateToCoordinator } from '../exceptions/delegate-to-coordinator.exception.js';
import { isPlanAndExecute } from '../exceptions/plan-and-execute.exception.js';
import { isExecuteSavedPlan } from '../exceptions/execute-saved-plan.exception.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import { ASK_USER_CONTEXT_KEY, type AskUserToolContext } from '../tools/system/ask-user.tool.js';
import { parse as parseCsv } from 'csv-parse/sync';
import pdfParse from 'pdf-parse';
import { isToolAllowedByPatterns } from './tool-policy.js';
import { getEffectiveAgentToolPolicy } from './tool-policy.js';
import {
  sanitizeAgentOutputText,
  sanitizeAgentPayload,
} from '../utils/platform-identifier-sanitizer.js';
import { parallelBatch } from '../utils/parallel-batch.js';
import {
  getCachedAgentAppConfig,
  resolveAgentSystemPrompt,
  resolveSeasonInfo,
} from '../config/agent-app-config.js';
import { getToolLoopDetector } from '../services/tool-loop-detector.service.js';
import { getPromptBudgetService } from '../services/prompt-budget.service.js';
import {
  normalizeModelSlugForBudget,
  resolvePromptBudgetPolicyForTier,
} from '../services/model-context-window.service.js';
import { getOperationMemoryService } from '../services/operation-memory.service.js';
import { getThreadMessageWriter } from '../memory/thread-message-writer.service.js';
import { logger } from '../../../utils/logger.js';

/** Maximum tool-calling iterations before we force the agent to respond. */
const MAX_ITERATIONS = 20;

const TERMINAL_ARTIFACT_TOOL_FAILURES = new Set([
  'generate_graphic',
  'create_play_diagram',
  'generate_highlight_reel',
  'export_video',
  'write_intel',
]);

const SHARED_PERSISTENCE_CONTRACT = [
  '## Shared Persistence Contract (CRITICAL)',
  '- Long-term memory: call `save_memory` immediately when the user states a durable preference, goal, recruiting constraint, performance baseline, recurring workflow preference, or brand/compliance constraint that should persist across sessions.',
  '- Save concise third-person facts only. Do not save transient chat, drafts, internal reasoning, duplicate facts, or one-off tool errors.',
  '- Analytics logging: after any successful user-visible mutation, saved artifact, outbound communication, imported dataset, published content, generated deliverable, or completed workflow milestone, call `track_analytics_event` before your final reply.',
  '- Domain mapping: recruiting emails, coach outreach, visits, commitments, and recruiting pipelines -> `recruiting` or `communication`; film analysis, stat imports, scouting, rankings, and performance reports -> `performance`; NIL deals, sponsorships, and brand partnerships -> `nil`; posts, graphics, videos, plans, profile/team activity, and general Agent X workflow completion -> `engagement`.',
  '- Use the target `subjectId` and `subjectType` when the work is for a team or organization; otherwise default to the current user.',
  '- Include useful payload fields when known: `coordinatorId`, `workflow`, `outcome`, `entityId`, `teamId`, `organizationId`, `toolName`, `artifactType`.',
  '- Do not emit duplicate analytics for pure reads, internal reasoning, abandoned drafts, or failed retries the user never received.',
  '- When the user asks for analytics or activity history, retrieve it with `get_analytics_summary` instead of guessing.',
  '- Final response delivery is mandatory: when tools return deliverable URLs (image/video/pdf/export/download links), include those exact URLs in the same user-facing reply. Never claim a file/diagram/report is ready without surfacing its link(s).',
  '- Learning resource augmentation (cross-coordinator): when the user asks for drills, skill work, training plans, installs, role-development routines, or "what should we run" style program guidance, proactively include 3-5 curated watch links by calling `recommend_learning_videos` unless the user explicitly requests text-only output.',
  '- For learning-resource calls, pass known context fields whenever available: `sport`, `position`, `audienceRole`, and `level` so recommendations are role- and level-specific.',
  '- Never claim a deliverable exists before calling the tool: do NOT write "I have created your diagrams", "your report is ready", "diagrams are complete", or any equivalent completion statement unless you have already executed the relevant tool (e.g. create_play_diagram, generate_graphic, write_intel) in this response and received its output. If a tool call is pending, skipped, or failed, explicitly state what is incomplete rather than falsely claiming success.',
  '- Recurring task delivery (CRITICAL — never contradict this): when a recurring task is scheduled with a sourceId/threadId, each run executes inside that originating thread and posts its full response there, exactly like a normal chat reply. The user sees results in-thread. A push notification is ALSO sent as a supplementary alert. Do NOT tell users recurring tasks only notify via push or that results will not appear in the chat — both happen automatically.',
  '',
  '## Email Tool Selection (CRITICAL — All Agents)',
  '- **Multiple recipients (2+)**: ALWAYS use `batch_send_email` with a single template and recipient array. This sends one approved template to many people with per-recipient variable substitution ({{firstName}}, {{collegeName}}, etc.).',
  '- **Single recipient (1)**: use `send_email` for one-off messages.',
  '- **NEVER loop** `send_email` multiple times. If a user asks you to send the same email to more than one person, construct a recipients array and call `batch_send_email` ONCE instead of calling `send_email` in a loop.',
  '- **Connected provider check first**: Before calling any email tool, verify the injected connected-account context shows an active Gmail or Microsoft connection. If no provider is connected, tell the user to connect Gmail or Outlook in Settings → Email, then call the email tool.',
  '- **Fallback to NXT1**: If the user has no connected provider, use `batch_send_email_via_nxt1` (for 2+ recipients) or `send_email_via_nxt1` (for 1 recipient) to send via the platform address (nxt1@nxt1sports.com).',
].join('\n');

/**
 * Maximum characters for a single tool observation fed back to the LLM.
 * Prevents context overflow when scrape results are very large.
 */
const MAX_OBSERVATION_LENGTH = 12_000;
const TOOL_RETRY_MAX_ATTEMPTS = 3;
const TOOL_RETRY_BASE_BACKOFF_MS = 1_000;
const COMPRESSION_TRIGGER_MIN_ITERATION = 6;
const COMPRESSION_TRIGGER_TOKEN_RATIO = 0.7;
const COMPRESSION_KEEP_FIRST_EXCHANGES = 1;
const COMPRESSION_KEEP_LAST_EXCHANGES = 3;
const COMPRESSION_MAX_EXCHANGE_LINES = 36;
const COMPRESSION_SUMMARY_MAX_CHARS = 2_000;
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_INLINE_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_CHARS = 30_000;
const MAX_ATTACHMENT_PREVIEW_ROWS = 60;
const MAX_ATTACHMENT_PREVIEW_COLUMNS = 20;
const DUPLICATE_GUARDED_TOOLS = new Set(['extract_live_view_media']);
const COMPUTE_KEYWORDS = [
  'how many',
  'count',
  'total',
  'average',
  'sum',
  'ratio',
  'percent',
  'percentage',
  'analytics',
  'stats',
  'stat',
  'numbers',
];
const PROGRESS_COMMENTARY_MAX_TOOL_NAMES = 5;
const PROGRESS_COMMENTARY_MAX_CHARS = 160;
const PROGRESS_COMMENTARY_HEAVY_BURST_TOOLS = 5;
const PROGRESS_COMMENTARY_SLOW_BURST_TOOLS = 2;
const PROGRESS_COMMENTARY_SLOW_BURST_MS = 4_000;
const PROGRESS_COMMENTARY_STALE_SILENCE_TOOLS = 4;
const PROGRESS_COMMENTARY_COOLDOWN_MS = 5_000;
const PROGRESS_COMMENTARY_COUNT_PATTERN =
  /\b(?:processed|completed|handled|ran|executed)\s+\d+\s+tool\s+calls?\b/i;
const BRAND_MEDIA_DELEGATION_PATTERN =
  /\b(ffmpeg|merge(?:d|s|ing)?|video|highlight|reel|clip|trim|subtitle|hudl|twitter|instagram|stage[_\s-]?media|analyze[_\s-]?video)\b/i;

/** Artifact field names promoted from tool results for cross-coordinator handoff. */
const ARTIFACT_KEYS = [
  'imageUrl',
  'logoUrl',
  'storagePath',
  'cloudflareVideoId',
  'videoUrl',
  'outputUrl',
  'downloadUrl',
  'pdfUrl',
  'exportUrl',
  'audioUrl',
  'thumbnailUrl',
] as const satisfies ReadonlyArray<keyof AgentArtifactHandoff>;

/**
 * Ledger entry recorded after each successful tool execution within a runLoop (Tier 3).
 * Survives context-window pruning and serves as the third fallback source for
 * artifact injection when both `messages[]` and `conversationHistory` are unavailable.
 */
interface ArtifactLedgerEntry {
  readonly toolName: string;
  readonly artifacts: Record<string, unknown>;
}

/**
 * Recall-cue pattern: detects user phrases that reference prior media
 * (e.g. "that video", "the film I sent", "earlier clip", "my last image").
 */
const PRIOR_MEDIA_RECALL_PATTERN =
  /\b(that|the|earlier|previous|last|my|your)\s+(video|film|clip|image|photo|picture|recording|footage|highlight|reel|intro|slide|graphic)\b/i;

type SessionImageAttachment = NonNullable<AgentSessionContext['attachments']>[number];

// ─── Context Window Budget ────────────────────────────────────────────────────

/**
 * Number of initial tool-calling exchanges to pin at the front of the context.
 * These contain the foundational scraping data the agent's entire reasoning is
 * built on — they must never be pruned.
 */
const CONTEXT_KEEP_FIRST_EXCHANGES = 2;

/**
 * Number of most-recent tool-calling exchanges to retain for recency bias.
 * The LLM needs these to avoid repeating what it just did and to pick the
 * correct next action.
 */
const CONTEXT_KEEP_LAST_EXCHANGES = 3;

/**
 * Minimum number of complete exchanges before pruning is worthwhile.
 * = KEEP_FIRST + KEEP_LAST + 1 (at least one exchange must land in the
 * collapsed middle or the prune is a no-op).
 */
const CONTEXT_PRUNE_THRESHOLD = CONTEXT_KEEP_FIRST_EXCHANGES + CONTEXT_KEEP_LAST_EXCHANGES + 1;
const CONTEXT_PRUNE_TOKEN_RATIO = 0.85;
const EMAIL_SEND_TOOL_NAMES = new Set(['send_email', 'batch_send_email', 'gmail_send_email']);
const EMAIL_CONNECTION_REQUIRED_MESSAGE =
  'No connected email account found. Please connect Gmail or Outlook in Settings -> Email before sending emails.';

export interface ToolSessionContext {
  readonly sessionId?: string;
  readonly threadId?: string;
  readonly operationId?: string;
  readonly environment?: 'staging' | 'production';
  readonly appBaseUrl?: string;
  readonly approvalId?: string;
  readonly allowedToolNames?: readonly string[];
  readonly allowedEntityGroups?: readonly AgentToolEntityGroup[];
  readonly bypassPermissionForTool?: {
    readonly toolName: string;
    readonly toolCallId: string;
  };
}

export abstract class BaseAgent {
  abstract readonly id: AgentIdentifier;
  abstract readonly name: string;

  /** The persona / system prompt for this sub-agent. */
  abstract getSystemPrompt(context: AgentSessionContext): string;

  /**
   * Legacy/debug surface of tool names this agent can describe in prompts.
   * Runtime permission checks are enforced by `getEffectiveAgentToolPolicy()`.
   */
  abstract getAvailableTools(): readonly string[];

  /** Default model routing for this agent. */
  abstract getModelRouting(): ModelRoutingConfig;

  /**
   * Skill names this agent is allowed to dynamically load.
   * Return an empty array if the agent does not use skills.
   * At runtime, skills are semantically matched against the user intent
   * and only relevant ones are injected into the system prompt.
   */
  getSkills(): readonly string[] {
    return [];
  }

  /**
   * Maximum number of matched skills to inject into the active prompt.
   * Keeps prompt assembly focused even when an agent is allowed many skills.
   */
  getSkillBudget(): number {
    return 4;
  }

  /**
   * Maximum number of tools to execute in parallel within a single LLM
   * iteration. Defaults to 1 (sequential) so the user sees one step at a time
   * and the visual stream stays in deterministic order. Override in subclasses
   * (e.g. agents that fan out N read_distilled_section calls) when ordered
   * concurrency is desired \u2014 parallelBatch still preserves input order so
   * the messages array remains structurally valid for OpenRouter.
   */
  getToolConcurrency(): number {
    return 5;
  }

  private shouldInlineDocumentAttachment(attachment: SessionImageAttachment): boolean {
    if (attachment.storagePath) {
      return true;
    }

    try {
      const url = new URL(attachment.url);
      return (
        url.searchParams.has('X-Goog-Algorithm') ||
        url.hostname === 'storage.googleapis.com' ||
        url.hostname === 'firebasestorage.googleapis.com'
      );
    } catch {
      return false;
    }
  }

  private async fetchDocumentAttachmentBuffer(
    attachment: SessionImageAttachment,
    signal?: AbortSignal
  ): Promise<Buffer | null> {
    if (!this.shouldInlineDocumentAttachment(attachment)) {
      return null;
    }

    try {
      const response = await fetch(attachment.url, { signal });
      if (!response.ok) {
        logger.warn(`[${this.id}] Failed to download document attachment`, {
          agentId: this.id,
          url: attachment.url.slice(0, 160),
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const headerContentLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(headerContentLength) && headerContentLength > MAX_INLINE_DOCUMENT_BYTES) {
        logger.warn(`[${this.id}] Skipping document attachment due to size`, {
          agentId: this.id,
          url: attachment.url.slice(0, 160),
          sizeBytes: headerContentLength,
        });
        return null;
      }

      const bodyBuffer = Buffer.from(await response.arrayBuffer());
      if (bodyBuffer.byteLength > MAX_INLINE_DOCUMENT_BYTES) {
        logger.warn(`[${this.id}] Skipping document attachment after download due to size`, {
          agentId: this.id,
          url: attachment.url.slice(0, 160),
          sizeBytes: bodyBuffer.byteLength,
        });
        return null;
      }

      return bodyBuffer;
    } catch (error) {
      logger.warn(`[${this.id}] Failed to fetch document attachment`, {
        agentId: this.id,
        url: attachment.url.slice(0, 160),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private trimAttachmentText(text: string): string {
    const normalized = text.replace(/\r\n/g, '\n').split('\u0000').join('').trim();
    if (normalized.length <= MAX_ATTACHMENT_TEXT_CHARS) {
      return normalized;
    }
    return `${normalized.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}\n... [truncated]`;
  }

  private renderCsvPreview(csvText: string): string {
    const parsedRows = parseCsv(csvText, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as string[][];

    if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
      return '';
    }

    const limitedRows = parsedRows.slice(0, MAX_ATTACHMENT_PREVIEW_ROWS);
    const maxColumns = Math.min(
      MAX_ATTACHMENT_PREVIEW_COLUMNS,
      Math.max(...limitedRows.map((row) => row.length), 0)
    );

    if (maxColumns === 0) {
      return '';
    }

    const toCells = (row: readonly string[]): string[] => {
      const next = row.slice(0, maxColumns).map((cell) => {
        const value = String(cell ?? '')
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ');
        return value.length > 120 ? `${value.slice(0, 120)}...` : value;
      });
      while (next.length < maxColumns) next.push('');
      return next;
    };

    const header = toCells(limitedRows[0] ?? []);
    const body = limitedRows.slice(1).map((row) => toCells(row));

    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...body.map((row) => `| ${row.join(' | ')} |`),
    ];

    const preview = lines.join('\n');
    return this.trimAttachmentText(preview);
  }

  private async buildDocumentAttachmentContext(
    attachment: SessionImageAttachment,
    signal?: AbortSignal
  ): Promise<string | null> {
    const mimeType = attachment.mimeType.toLowerCase();

    if (
      mimeType !== 'application/pdf' &&
      mimeType !== 'text/csv' &&
      mimeType !== 'text/plain' &&
      mimeType !== 'application/vnd.ms-excel'
    ) {
      return null;
    }

    const attachmentBuffer = await this.fetchDocumentAttachmentBuffer(attachment, signal);
    if (!attachmentBuffer) {
      return null;
    }

    const attachmentName = attachment.name?.trim() || 'unnamed-file';

    if (mimeType === 'application/pdf') {
      try {
        const parsed = await pdfParse(attachmentBuffer);
        const extracted = this.trimAttachmentText(parsed.text ?? '');
        if (!extracted) return null;
        return `[Attachment Extract: ${attachmentName} (${mimeType})]\n${extracted}`;
      } catch (error) {
        logger.warn(`[${this.id}] Failed to parse PDF attachment`, {
          agentId: this.id,
          fileName: attachmentName,
          mimeType,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }

    const rawText = attachmentBuffer.toString('utf-8');
    if (!rawText.trim()) {
      return null;
    }

    if (mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel') {
      try {
        const preview = this.renderCsvPreview(rawText);
        if (!preview) return null;
        return `[Attachment Extract: ${attachmentName} (${mimeType})]\n${preview}`;
      } catch (error) {
        logger.warn(`[${this.id}] Failed to parse CSV attachment`, {
          agentId: this.id,
          fileName: attachmentName,
          mimeType,
          error: error instanceof Error ? error.message : String(error),
        });

        const fallback = this.trimAttachmentText(rawText);
        return fallback
          ? `[Attachment Extract: ${attachmentName} (${mimeType})]\n${fallback}`
          : null;
      }
    }

    const trimmed = this.trimAttachmentText(rawText);
    return trimmed ? `[Attachment Extract: ${attachmentName} (${mimeType})]\n${trimmed}` : null;
  }

  private async resolveDocumentAttachmentContexts(
    attachments: readonly SessionImageAttachment[],
    signal?: AbortSignal
  ): Promise<readonly string[]> {
    if (attachments.length === 0) {
      return [];
    }

    const contexts = await Promise.all(
      attachments.map((attachment) => this.buildDocumentAttachmentContext(attachment, signal))
    );
    return contexts.filter((context): context is string => Boolean(context));
  }

  private buildPdfFileParts(
    attachments: readonly SessionImageAttachment[]
  ): readonly LLMFileContentPart[] {
    return attachments
      .filter((attachment) => attachment.mimeType.toLowerCase() === 'application/pdf')
      .map((attachment, index) => {
        const fallbackName = `attachment-${index + 1}.pdf`;
        const trimmedName = attachment.name?.trim();
        const filename = trimmedName && trimmedName.length > 0 ? trimmedName : fallbackName;
        return {
          type: 'file' as const,
          file: {
            filename,
            file_data: attachment.url,
          },
        };
      });
  }

  private shouldInlineImageAttachment(attachment: SessionImageAttachment): boolean {
    if (attachment.storagePath) {
      return true;
    }

    try {
      const url = new URL(attachment.url);
      return (
        url.searchParams.has('X-Goog-Algorithm') ||
        url.hostname === 'storage.googleapis.com' ||
        url.hostname === 'firebasestorage.googleapis.com'
      );
    } catch {
      return false;
    }
  }

  private async inlineImageAttachment(
    attachment: SessionImageAttachment,
    signal?: AbortSignal
  ): Promise<string | null> {
    if (!this.shouldInlineImageAttachment(attachment)) {
      return null;
    }

    try {
      const response = await fetch(attachment.url, { signal });
      if (!response.ok) {
        logger.warn(`[${this.id}] Failed to inline image attachment`, {
          agentId: this.id,
          url: attachment.url.slice(0, 160),
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const headerContentType = response.headers.get('content-type');
      const mimeType = (headerContentType ?? attachment.mimeType).split(';', 1)[0]?.trim();
      if (!mimeType?.startsWith('image/')) {
        return null;
      }

      const headerContentLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(headerContentLength) && headerContentLength > MAX_INLINE_IMAGE_BYTES) {
        logger.warn(`[${this.id}] Skipping inline image attachment due to size`, {
          agentId: this.id,
          url: attachment.url.slice(0, 160),
          sizeBytes: headerContentLength,
        });
        return null;
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      if (imageBuffer.byteLength > MAX_INLINE_IMAGE_BYTES) {
        logger.warn(`[${this.id}] Skipping inline image attachment after download due to size`, {
          agentId: this.id,
          url: attachment.url.slice(0, 160),
          sizeBytes: imageBuffer.byteLength,
        });
        return null;
      }

      return `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    } catch (error) {
      logger.warn(`[${this.id}] Failed to convert image attachment to data URL`, {
        agentId: this.id,
        url: attachment.url.slice(0, 160),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async resolveImageAttachmentUrls(
    attachments: readonly SessionImageAttachment[],
    signal?: AbortSignal
  ): Promise<readonly string[]> {
    if (attachments.length === 0) {
      return [];
    }

    return Promise.all(
      attachments.map(async (attachment) => {
        const inlineDataUrl = await this.inlineImageAttachment(attachment, signal);
        return inlineDataUrl ?? attachment.url;
      })
    );
  }

  protected withConfiguredSystemPrompt(
    basePrompt: string,
    templateValues?: Readonly<Record<string, string | undefined>>
  ): string {
    return resolveAgentSystemPrompt(
      this.id,
      `${basePrompt}\n\n${SHARED_PERSISTENCE_CONTRACT}`,
      templateValues
    );
  }

  private extractSportFromIntent(intent: string): string | undefined {
    const sportLabelMatch = intent.match(/\bSport:\s*([^\n|]+)/i);
    if (sportLabelMatch?.[1]) {
      const value = sportLabelMatch[1].trim();
      if (value.length > 0) return value;
    }

    const fallbackSportMatch = intent.match(/\bsport:\s*([^\n|]+)/i);
    if (fallbackSportMatch?.[1]) {
      const value = fallbackSportMatch[1].trim();
      if (value.length > 0) return value;
    }

    return undefined;
  }

  private extractTimezoneFromIntent(intent: string): string | undefined {
    const patterns = [
      /(?:^|\n)\s*Timezone:\s*([^\n|]+)/i,
      /(?:^|\n)\s*-\s*\*\*timezone\*\*:\s*([^\n]+)/i,
      /(?:^|\n)\s*timezone:\s*([^\n|]+)/i,
    ];

    for (const pattern of patterns) {
      const match = intent.match(pattern);
      const value = match?.[1]?.trim();
      if (value) return value;
    }

    return undefined;
  }

  private formatCurrentTimeForTimezone(now: Date, timezone: string): string | null {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short',
      }).format(now);
    } catch {
      return null;
    }
  }

  private buildRuntimeTemporalContext(intent: string): string {
    const now = new Date();
    const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const currentDate = now.toISOString().slice(0, 10);
    // Include the exact UTC timestamp so the LLM can compute relative times like
    // "in 1 hour" or "at 3 PM" without hallucinating the current clock time.
    const currentUtcIso = now.toISOString();
    const timezone = this.extractTimezoneFromIntent(intent);
    const sport = this.extractSportFromIntent(intent);

    const timezoneContext = timezone ? this.formatCurrentTimeForTimezone(now, timezone) : null;

    const baseContext = timezoneContext
      ? `Current Date & Time Context: It is ${timezoneContext}. ` +
        `Current UTC timestamp: ${currentUtcIso}. ` +
        `When a user says "in X hours/minutes" or "at [time]", compute the target ` +
        `time relative to the local timezone value above and verify it against the UTC ` +
        `timestamp before building any cron expression. ` +
        `Never guess or infer the current time — use only these values.`
      : `Current Date & Time Context: It is ${monthYear} (${currentDate}). ` +
        `Current year: ${now.getFullYear()}. ` +
        `Exact server UTC timestamp: ${currentUtcIso}. ` +
        `When a user says "in X hours/minutes" or "at [time]", always compute the ` +
        `target time relative to this UTC timestamp and convert it to the user's ` +
        `requested IANA timezone before building any cron expression. ` +
        `Never guess or infer the current time — use only this value.`;

    if (!sport) {
      return baseContext;
    }

    const season = resolveSeasonInfo(sport, now);
    if (!season) {
      return `${baseContext} Sport in context: ${sport}.`;
    }

    return (
      `${baseContext} ` +
      `For ${sport}, this is the ${season.phase} period. Focus areas: ${season.focus}.`
    );
  }

  /**
   * Execute the agent's ReAct loop for a given user intent.
   *
   * Flow:
   *   1. Build system prompt + inject tool schemas.
   *   2. Call LLM with conversation history.
   *   3. If LLM requests tool calls → execute them → feed observations back.
   *   4. Repeat until LLM responds with text (no more tool calls) or MAX_ITERATIONS.
   *   5. Return the final text as the operation result.
   */
  async execute(
    intent: string,
    context: AgentSessionContext,
    toolDefinitions: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistry?: ToolRegistry,
    skillRegistry?: SkillRegistry,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService
  ): Promise<AgentOperationResult> {
    if (!llm || !toolRegistry) {
      throw new AgentEngineError(
        'AGENT_DEPENDENCY_MISSING',
        `${this.name}.execute() requires llm and toolRegistry. ` + `Pass them from the AgentRouter.`
      );
    }

    const routing = this.getModelRouting();
    const allowedToolNames = getEffectiveAgentToolPolicy(this.id);

    // Build LLM tool schemas from the registry (filtered to this agent's permissions).
    // System-category tools (e.g. delegate_task) are always included regardless
    // of the agent's getAvailableTools() list — they provide cross-cutting
    // infrastructure that every coordinator needs.
    const toolSchemas: LLMToolSchema[] = toolDefinitions
      .filter(
        (def) => def.category === 'system' || isToolAllowedByPatterns(def.name, allowedToolNames)
      )
      .map((def) => ({
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: def.parameters,
        },
      }));

    // ── Dynamic Skill Loading ───────────────────────────────────────────
    let skillBlock = '';
    const allowedSkillNames = this.getSkills();
    if (skillRegistry && allowedSkillNames.length > 0) {
      try {
        const intentEmbedding = await llm.embed(intent);
        const matched = await skillRegistry.match(
          intentEmbedding,
          (text) => llm.embed(text),
          allowedSkillNames
        );
        const selectedSkills = matched.slice(0, this.getSkillBudget());
        if (selectedSkills.length > 0) {
          // Extract the [Request] segment from the enriched intent so knowledge
          // retrieval embeds the actual user question, not the user-profile dump.
          // Falls back to the full intent for downstream delegations that don't
          // include a [Request] block.
          const requestMatch = /\[Request\]\n([\s\S]+?)(?=\n\n\[|\s*$)/.exec(intent);
          const knowledgeQuery = requestMatch?.[1]?.trim() || intent;
          const knowledgeQueryEmbedding = requestMatch ? undefined : intentEmbedding;

          // Trigger retrieval for GlobalKnowledgeSkill before building prompt.
          // Pass the already-computed intentEmbedding only when the query is unchanged.
          for (const m of selectedSkills) {
            if (m.skill instanceof GlobalKnowledgeSkill) {
              await m.skill.retrieveForIntent(knowledgeQuery, knowledgeQueryEmbedding);
            }
          }
          const skillContextParams = this.buildGameAnalysisParams(intent);
          skillBlock = skillRegistry.buildPromptBlock(selectedSkills, skillContextParams);
          logger.info(`[${this.id}] Injected ${selectedSkills.length} skill(s) into prompt`, {
            agentId: this.id,
            skills: selectedSkills.map((m) => m.skill.name),
          });
        }
      } catch (err) {
        // Skill loading is best-effort — agent can still function without skills
        logger.warn(`[${this.id}] Skill loading failed — proceeding without skills`, {
          agentId: this.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Build initial conversation (with optional skill injection + delegation rule)
    const delegationRule = [
      '\n## Cross-Domain Delegation',
      "If the user's request falls outside your area of expertise or you lack the",
      'tools to complete it, call the `delegate_task` tool with a clear description',
      'of what the user needs. Do NOT attempt to answer outside your domain —',
      'delegate instead. Never apologize or tell the user you cannot help; just delegate.',
    ].join('\n');

    let systemContent = this.withConfiguredSystemPrompt(this.getSystemPrompt(context));

    if (skillBlock) systemContent += `\n${skillBlock}`;

    const requiresComputeFirst = this.isComputeIntent(intent);
    if (requiresComputeFirst) {
      systemContent +=
        '\n\n## Deterministic Compute-First Rule\n' +
        '- This request is numeric/aggregation oriented. Use tools first, then respond.\n' +
        '- Never estimate or infer totals/counts without tool-backed evidence.\n' +
        '- If tool data is incomplete, ask a concise clarification question.';
    }

    systemContent += `\n\n## Runtime Date Guardrail\n${this.buildRuntimeTemporalContext(intent)}`;

    systemContent += delegationRule;
    systemContent +=
      '\n- NEVER reveal raw NXT1 platform identifiers such as user IDs, team IDs, organization IDs, post IDs, unicode values, team codes, routes, cursors, or internal document IDs. Refer to people and entities by name only.';

    // Build the initial user message — multipart when file attachments are present
    // (e.g. images forwarded from the SSE chat client).
    // Video attachments are injected as text URL references (videos can't be passed
    // as vision content) so tools like write_athlete_videos have access to the URL.
    let intentText = intent;
    // Non-image, non-video attachments (PDFs, CSVs, DOCs) are also text references
    // since OpenRouter only supports images + videos for vision content.

    // Add video references
    if (context.videoAttachments?.length) {
      const videoRefs = context.videoAttachments
        .map((v) => {
          const idPart = v.cloudflareVideoId ? ` | cloudflareVideoId: ${v.cloudflareVideoId}` : '';
          return `[Attached video: ${v.name} — ${v.url}${idPart}]`;
        })
        .join('\n');
      intentText = `${intent}\n\n${videoRefs}`;
    }

    // Only map image attachments to vision content
    const imageAttachments = (context.attachments ?? []).filter((a) =>
      a.mimeType.startsWith('image/')
    );
    const imageAttachmentUrls = await this.resolveImageAttachmentUrls(
      imageAttachments,
      context.signal
    );

    // Add non-image, non-video attachment references
    // PDFs: sent natively to OpenRouter, not extracted
    // Other docs (CSV, etc.): extracted and appended as text
    const nonImageAttachments = (context.attachments ?? []).filter(
      (a) => !a.mimeType.startsWith('image/')
    );

    const nonPdfAttachments = nonImageAttachments.filter(
      (a) => a.mimeType.toLowerCase() !== 'application/pdf'
    );

    // Extract and append only non-PDF documents
    const extractedDocumentContexts = await this.resolveDocumentAttachmentContexts(
      nonPdfAttachments,
      context.signal
    );

    // Add simple references for all non-image attachments (for context)
    if (nonImageAttachments.length > 0) {
      const docRefs = nonImageAttachments
        .map((a) => `[Attached document: ${a.mimeType} — ${a.url}]`)
        .join('\n');
      intentText = `${intentText}\n\n${docRefs}`;
    }

    // Append extracted content only for non-PDF documents
    if (extractedDocumentContexts.length > 0) {
      const extractedSection = extractedDocumentContexts.join('\n\n');
      intentText = `${intentText}\n\n[Extracted Attachment Content]\n${extractedSection}`;
    }

    const pdfFileParts = this.buildPdfFileParts(nonImageAttachments);

    const userMessage: LLMMessage =
      imageAttachments.length > 0 || pdfFileParts.length > 0
        ? {
            role: 'user',
            content: [
              { type: 'text' as const, text: intentText },
              ...pdfFileParts,
              ...imageAttachmentUrls.map((url) => ({
                type: 'image_url' as const,
                image_url: { url, detail: 'auto' as const },
              })),
            ],
          }
        : { role: 'user', content: intentText };

    // Some chat-tier models in OpenRouter do not accept image_url content.
    // When user image attachments are present, force vision tier routing.
    const effectiveRouting: ModelRoutingConfig =
      imageAttachments.length > 0 && routing.tier !== 'vision_analysis'
        ? {
            ...routing,
            tier: 'vision_analysis',
            maxTokens: Math.max(routing.maxTokens ?? 0, 4096),
            temperature: 0,
          }
        : routing;

    // Phase C (thread-as-truth): the canonical conversation lives on
    // `AgentMessage` rows and is rehydrated by `ThreadMessageReplayService`
    // before the agent is invoked. By the time we reach this point,
    // `context.conversationHistory` is the full LLMMessage[] (user +
    // assistant + tool, with tool_calls + tool_call_id intact). We
    // pass it through verbatim — no role coercion, no content drop.
    const historyMessages: LLMMessage[] = (context.conversationHistory ?? []).map((m) => {
      const base = {
        role: m.role,
        content: m.content,
      } as LLMMessage;
      // Preserve wire-format tool plumbing when the persisted row carried it.
      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        return { ...base, tool_calls: m.toolCalls } as LLMMessage;
      }
      if (m.role === 'tool' && m.toolCallId) {
        return { ...base, tool_call_id: m.toolCallId } as LLMMessage;
      }
      return base;
    });

    const messages: LLMMessage[] = [
      { role: 'system', content: systemContent },
      ...historyMessages,
      userMessage,
    ];

    // On-demand media recall: if the intent references prior media ("that video",
    // "the image I sent", etc.), surface known attachment URLs from thread history
    // so the agent can re-analyze immediately — no re-upload, no vector search cost.
    this.injectPriorMediaContext(messages, intent);

    logger.info(`[${this.id}] Starting ReAct loop`, {
      agentId: this.id,
      userId: context.userId,
      tier: effectiveRouting.tier,
      tools: allowedToolNames,
      hasImageAttachments: imageAttachments.length > 0,
    });

    const effectiveAllowedToolNames = toolSchemas.map((schema) => schema.function.name);
    const effectiveAllowedEntityGroups = Array.from(
      new Set(
        toolDefinitions
          .map((definition) => definition.entityGroup)
          .filter((group): group is AgentToolEntityGroup => Boolean(group))
      )
    );

    return this.runLoop(
      messages,
      context,
      llm,
      toolRegistry,
      toolSchemas,
      effectiveAllowedToolNames,
      effectiveAllowedEntityGroups,
      effectiveRouting,
      onStreamEvent,
      approvalGate,
      requiresComputeFirst
    );
  }

  /**
   * Continue execution from a previously yielded message array.
   * Used when the user approves a pending tool or answers an ask_user question.
   *
   * Phase L (thread-as-truth): the canonical history is replayed from
   * MongoDB via `ThreadMessageReplayService`. `yieldState.messages` is
   * retained as a fallback for legacy paused threads written before the
   * thread-as-truth rollout. `yieldState.pendingAssistantMessage` (the
   * in-flight assistant turn that triggered the yield but was never
   * persisted because the approval gate intercepted) is appended on top
   * of the replay.
   */
  async resumeExecution(
    yieldState: {
      readonly version?: number;
      readonly reason: 'needs_input' | 'needs_approval';
      readonly messages: readonly Record<string, unknown>[];
      readonly pendingAssistantMessage?: LLMMessage;
      readonly pendingToolCall?: {
        readonly toolName: string;
        readonly toolInput: Record<string, unknown>;
        readonly toolCallId: string;
      };
      readonly planContext?: {
        readonly currentTaskId: string;
        readonly completedTaskResults: Record<string, unknown>;
        readonly enrichedIntent: string;
      };
    },
    context: AgentSessionContext,
    _toolDefinitions: readonly AgentToolDefinition[],
    llm?: OpenRouterService,
    toolRegistry?: ToolRegistry,
    _skillRegistry?: SkillRegistry,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService,
    approvalId?: string
  ): Promise<AgentOperationResult> {
    if (!llm || !toolRegistry) {
      throw new AgentEngineError(
        'AGENT_DEPENDENCY_MISSING',
        `${this.name}.resumeExecution() requires llm and toolRegistry. ` +
          `Pass them from the AgentRouter.`
      );
    }

    const routing = this.getModelRouting();
    const allowedToolNames = getEffectiveAgentToolPolicy(this.id);
    const toolSchemas: LLMToolSchema[] = _toolDefinitions
      .filter(
        (def) => def.category === 'system' || isToolAllowedByPatterns(def.name, allowedToolNames)
      )
      .map((def) => ({
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: def.parameters,
        },
      }));

    // Phase L (thread-as-truth): replay the canonical history from
    // MongoDB. This guarantees the resume sees every persisted
    // assistant.tool_calls + tool result row, including the
    // assistant turn that triggered the yield (it was persisted by the
    // writer immediately before the approval gate threw). The legacy
    // `yieldState.messages` snapshot is used only as a fallback when
    // the replay is empty (e.g. v0 paused threads from before rollout
    // or when threadId is not available).
    let messages: LLMMessage[];
    if (context.threadId) {
      try {
        const { getThreadMessageReplayService } =
          await import('../memory/thread-message-replay.service.js');
        const replayed = await getThreadMessageReplayService().loadAsLLMMessages(context.threadId, {
          maxTokens: 50_000,
        });
        messages = [...replayed] as LLMMessage[];
        // The pendingAssistantMessage is the in-flight assistant turn
        // that was emitted just before the yield. The writer normally
        // persists it, but if the yield arrived BEFORE persistence (rare
        // but possible on tool-loop-detector / approval-gate paths), the
        // resume payload supplies it so the merge stays whole.
        if (yieldState.pendingAssistantMessage) {
          // Avoid duplicating if the replay already contains this assistant
          // turn. The legacy check only compared tool_calls JSON, which
          // fails when content differs or when the same tool_call_id set
          // appears on a different turn. We now check three conditions.
          const pending = yieldState.pendingAssistantMessage;

          // Check 1: the last replayed message is an exact content + tool_calls match.
          const last = messages[messages.length - 1];
          const lastIsExactMatch =
            last?.role === 'assistant' &&
            (last.content ?? '') === (pending.content ?? '') &&
            JSON.stringify(last.tool_calls ?? []) === JSON.stringify(pending.tool_calls ?? []);

          // Check 2: any existing assistant turn already covers all pending
          // tool_call ids — meaning the writer persisted the turn before the
          // yield state was serialised (the common fast-path).
          const pendingToolIds = new Set(
            (pending.tool_calls ?? []).map((tc: LLMToolCall) => tc.id).filter(Boolean)
          );
          const anyAssistantCoversIds =
            pendingToolIds.size > 0 &&
            messages.some(
              (m) =>
                m.role === 'assistant' &&
                (m.tool_calls ?? []).some((tc: LLMToolCall) => pendingToolIds.has(tc.id))
            );

          if (!lastIsExactMatch && !anyAssistantCoversIds) {
            messages.push(pending);
          }
        }
        if (messages.length === 0) {
          // Empty replay \u2014 fall back to the snapshot for legacy threads.
          messages = yieldState.messages.map((msg) => ({ ...msg })) as unknown as LLMMessage[];
        }
      } catch (err) {
        logger.warn(`[${this.id}] Resume replay failed \u2014 falling back to yield snapshot`, {
          agentId: this.id,
          threadId: context.threadId,
          error: err instanceof Error ? err.message : String(err),
        });
        messages = yieldState.messages.map((msg) => ({ ...msg })) as unknown as LLMMessage[];
      }
    } else {
      messages = yieldState.messages.map((msg) => ({ ...msg })) as unknown as LLMMessage[];
    }
    if (yieldState.reason === 'needs_input' && yieldState.pendingToolCall) {
      const pendingToolMessage = this.buildPendingInputResumeMessage(yieldState.pendingToolCall);
      const alreadyPresent = messages.some(
        (msg) => msg.role === 'assistant' && msg.content === pendingToolMessage
      );
      if (!alreadyPresent) {
        messages.push({ role: 'assistant', content: pendingToolMessage });
      }
    }

    const sessionContext: ToolSessionContext = {
      sessionId: context.sessionId,
      threadId: context.threadId,
      operationId: context.operationId,
      ...(context.environment && { environment: context.environment }),
      ...(context.appBaseUrl && { appBaseUrl: context.appBaseUrl }),
      ...(approvalId ? { approvalId } : {}),
      ...(yieldState.reason === 'needs_approval' && yieldState.pendingToolCall
        ? {
            bypassPermissionForTool: {
              toolName: yieldState.pendingToolCall.toolName,
              toolCallId: yieldState.pendingToolCall.toolCallId,
            },
          }
        : {}),
    };

    if (yieldState.reason === 'needs_approval' && yieldState.pendingToolCall) {
      const pendingToolCall: LLMToolCall = {
        id: yieldState.pendingToolCall.toolCallId,
        type: 'function',
        function: {
          name: yieldState.pendingToolCall.toolName,
          arguments: JSON.stringify(yieldState.pendingToolCall.toolInput),
        },
      };

      // ── Repair the assistant↔tool pairing for Anthropic/Vertex ─────────
      // The replay reconciliation strips `tool_calls` from any assistant
      // turn whose tool wasn't resolved by a following `tool` row. After a
      // pause-for-approval, the originating assistant turn is persisted
      // with tool_calls but no tool row follows it, so reconcileToolPairs
      // drops the tool_calls. Pushing the resumed tool_result without a
      // matching `tool_use` block on the immediately preceding assistant
      // produces a 400 from Anthropic:
      //   "messages.N.content.0: unexpected tool_use_id ... Each
      //    tool_result block must have a corresponding tool_use block in
      //    the previous message."
      // Synthesize/repair the assistant turn so the pairing is valid.
      const lastAssistantWithCallIdx = (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (!m) continue;
          if (m.role === 'assistant') return i;
          if (m.role === 'user') return -1;
        }
        return -1;
      })();
      const lastAssistant =
        lastAssistantWithCallIdx >= 0 ? messages[lastAssistantWithCallIdx] : undefined;
      const lastAssistantCoversCall =
        lastAssistant?.role === 'assistant' &&
        (lastAssistant.tool_calls ?? []).some((tc: LLMToolCall) => tc.id === pendingToolCall.id);

      if (!lastAssistantCoversCall) {
        if (lastAssistant?.role === 'assistant' && lastAssistantWithCallIdx >= 0) {
          // Re-attach the missing tool_call to the most recent assistant turn.
          const repaired: LLMMessage = {
            ...lastAssistant,
            tool_calls: [...(lastAssistant.tool_calls ?? []), pendingToolCall],
          };
          messages[lastAssistantWithCallIdx] = repaired;
        } else {
          // No suitable assistant turn (e.g. resume from snapshot only) —
          // synthesize a minimal assistant turn that owns the tool_call.
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [pendingToolCall],
          });
        }
      }

      onStreamEvent?.({
        type: 'step_active',
        agentId: this.id,
        stepId: pendingToolCall.id,
        toolName: pendingToolCall.function.name,
        stageType: 'tool',
        icon: this.resolveToolStepIcon(pendingToolCall.function.name),
        message: this.resolveToolInvocationLabel(
          pendingToolCall.function.name,
          pendingToolCall.function.arguments
        ),
      });

      let observation = await this.executeTool(
        pendingToolCall,
        toolRegistry,
        context.userId,
        context.signal,
        {
          agentId: this.id,
          messages,
          planContext: yieldState.planContext,
        },
        sessionContext,
        messages,
        approvalGate,
        onStreamEvent
      );
      observation = this.truncateObservation(observation);

      let toolSuccess: boolean;
      let toolResult: Record<string, unknown> | undefined;
      try {
        const parsed = JSON.parse(observation) as Record<string, unknown>;
        toolSuccess = parsed['success'] === true;
        toolResult =
          typeof parsed['data'] === 'object' && parsed['data'] !== null
            ? sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
            : undefined;
      } catch {
        toolSuccess = observation.length > 0;
      }

      onStreamEvent?.({
        type: 'tool_result',
        agentId: this.id,
        stepId: pendingToolCall.id,
        toolName: pendingToolCall.function.name,
        stageType: 'tool',
        toolSuccess,
        toolResult,
        icon: this.resolveToolStepIcon(pendingToolCall.function.name),
        message: this.resolveToolInvocationLabel(
          pendingToolCall.function.name,
          pendingToolCall.function.arguments
        ),
      });

      messages.push({
        role: 'tool',
        content: observation,
        tool_call_id: pendingToolCall.id,
      });

      // Phase B/L: persist the resumed tool result so the next turn's
      // replay includes it (otherwise the model would see its own
      // tool_call without a resolution and refuse to proceed).
      {
        const writer = getThreadMessageWriter();
        if (writer && context.threadId) {
          await writer.append(
            {
              role: 'tool',
              content: observation,
              tool_call_id: pendingToolCall.id,
            },
            {
              threadId: context.threadId,
              userId: context.userId,
              agentId: this.id,
              ...(context.operationId ? { operationId: context.operationId } : {}),
            }
          );
        }
      }
    }

    const requiresComputeFirst = this.isComputeIntent(this.extractLatestUserText(messages));

    return this.runLoop(
      messages,
      context,
      llm,
      toolRegistry,
      toolSchemas,
      toolSchemas.map((schema) => schema.function.name),
      Array.from(
        new Set(
          _toolDefinitions
            .map((definition) => definition.entityGroup)
            .filter((group): group is AgentToolEntityGroup => Boolean(group))
        )
      ),
      routing,
      onStreamEvent,
      approvalGate,
      requiresComputeFirst
    );
  }

  private buildPendingInputResumeMessage(pendingToolCall: {
    readonly toolName: string;
    readonly toolInput: Record<string, unknown>;
    readonly toolCallId: string;
  }): string {
    const toolArgs = JSON.stringify(pendingToolCall.toolInput);
    return [
      'Resume context:',
      `A pending tool is available: ${pendingToolCall.toolName}.`,
      `If the latest user reply clearly approves proceeding, call ${pendingToolCall.toolName} with exactly this payload: ${toolArgs}.`,
      'If the latest user reply requests changes, asks questions, or is ambiguous, do not call the tool yet.',
      'Instead, revise the plan or ask one focused follow-up question.',
    ].join(' ');
  }

  private async runLoop(
    messages: LLMMessage[],
    context: AgentSessionContext,
    llm: OpenRouterService,
    toolRegistry: ToolRegistry,
    toolSchemas: readonly LLMToolSchema[],
    allowedToolNames: readonly string[],
    allowedEntityGroups: readonly AgentToolEntityGroup[],
    routing: ModelRoutingConfig,
    onStreamEvent?: OnStreamEvent,
    approvalGate?: ApprovalGateService,
    requiresComputeFirst: boolean = false
  ): Promise<AgentOperationResult> {
    // ── ReAct Loop ────────────────────────────────────────────────────────
    const toolExecutionMeta = new Map<
      string,
      {
        readonly completedAt: string;
        readonly durationMs: number;
      }
    >();
    // ── Artifact Ledger (Tier 3) ───────────────────────────────────────────
    // Tracks every artifact produced in this runLoop invocation. Entries survive
    // context pruning and allow augmentToolCallWithArtifact to recover artifacts
    // even when the originating tool message has been evicted from messages[].
    const artifactLedger: ArtifactLedgerEntry[] = [];
    let completedToolCallCount = 0;
    const recentToolNames: string[] = [];
    let lastProgressCommentaryAtMs = 0;
    let lastProgressCommentaryToolCount = 0;
    let lastProgressCommentaryText = '';

    const appConfig = getCachedAgentAppConfig();
    const promptBudgetPolicy = resolvePromptBudgetPolicyForTier(routing.tier, appConfig);
    let activeBudgetMode: 'primary' | 'fallback_safe' = 'primary';

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      this.throwIfAborted(context.signal);

      const promptBudget =
        activeBudgetMode === 'primary'
          ? promptBudgetPolicy.primaryBudget
          : promptBudgetPolicy.fallbackSafeBudget;

      // Prune the context window before every LLM call (except the first iteration
      // which only has system + user messages — nothing to prune yet).
      // No-op when total tool-calling exchanges is below CONTEXT_PRUNE_THRESHOLD.
      if (iteration > 0) this.pruneMessageHistory(messages, promptBudget.maxPromptTokens);

      // Token-budget governor: enforce a hard ceiling on prompt size with a
      // deterministic degradation ladder. This is a per-LLM-call guard;
      // operations are not bounded — long jobs still run to completion.
      // Throws PromptBudgetExceededError if degradation cannot recover; the
      // outer ReAct loop lets it propagate so the user sees a clear error.
      await this.compressMessageHistoryIfNeeded({
        messages,
        llm,
        context,
        iteration,
        promptBudgetTokens: promptBudget.maxPromptTokens,
      });

      if (promptBudget.source === 'model_aware') {
        logger.info(`[${this.id}] Model-aware prompt budget applied`, {
          agentId: this.id,
          operationId: context.operationId,
          tier: routing.tier,
          budgetMode: activeBudgetMode,
          modelWindowTokens: promptBudget.modelWindowTokens,
          safetyRatio: promptBudget.safetyRatio,
          configuredCeiling: appConfig.primary.maxPromptTokens,
          effectiveCeiling: promptBudget.maxPromptTokens,
          consideredModels: promptBudget.consideredModels,
        });
      }

      if (promptBudget) {
        getPromptBudgetService().applyBudget(
          messages,
          {
            maxPromptTokens: promptBudget.maxPromptTokens,
            maxMessageChars: promptBudget.maxMessageChars,
            maxToolResultChars: promptBudget.maxToolResultChars,
          },
          this.id,
          context.operationId
        );
      }

      logger.info(`[${this.id}] Iteration ${iteration + 1}/${MAX_ITERATIONS}`, {
        agentId: this.id,
        iteration: iteration + 1,
      });

      const llmOptions = {
        tier: routing.tier,
        modelOverride: routing.modelOverride,
        maxTokens: routing.maxTokens,
        temperature: routing.temperature,
        tools: toolSchemas.length > 0 ? toolSchemas : undefined,
        // Agent queue jobs can take longer than the default 60s — use 5 minutes
        timeoutMs: 300_000,
        ...(routing.enableThinking && {
          enableThinking: true,
          thinkingBudgetTokens: routing.thinkingBudgetTokens,
        }),
        ...(context.operationId && {
          telemetryContext: {
            operationId: context.operationId,
            userId: context.userId,
            agentId: this.id,
          },
        }),
        // Propagate the SSE abort signal so client disconnects cancel in-flight LLM calls
        ...(context.signal && { signal: context.signal }),
      };

      // Use streaming when onStreamEvent is provided so deltas flow to the caller.
      // SSE chat now provides onStreamEvent, so streaming is always active for live requests.
      const result = onStreamEvent
        ? await llm.completeStream(messages, llmOptions, (delta) => {
            // Abort the stream eagerly if the operation was paused/cancelled
            // mid-stream — without this check, deltas could keep flowing for
            // hundreds of ms after `signal.abort()` because the underlying
            // fetch reader buffers chunks. Throwing here causes the OpenRouter
            // adapter to reject and propagate the AbortError up.
            this.throwIfAborted(context.signal);
            if (routing.enableThinking && delta.thinkingContent) {
              onStreamEvent({
                type: 'thinking',
                agentId: this.id,
                thinkingText: delta.thinkingContent,
              });
            }
            if (delta.content) {
              onStreamEvent({
                type: 'delta',
                agentId: this.id,
                text: sanitizeAgentOutputText(delta.content),
              });
            }
            if (delta.toolName) {
              onStreamEvent({
                type: 'tool_call',
                agentId: this.id,
                toolName: delta.toolName,
                ...(delta.toolArgs ? { toolArgs: sanitizeAgentOutputText(delta.toolArgs) } : {}),
              });
            }
          })
        : await llm.complete(messages, llmOptions);

      this.throwIfAborted(context.signal);

      const usedModel = normalizeModelSlugForBudget(result.model);
      const primaryModel = normalizeModelSlugForBudget(
        promptBudgetPolicy.fallbackSafeBudget.consideredModels[0] ?? promptBudgetPolicy.primaryModel
      );
      const knownFallbackModels = new Set(promptBudgetPolicy.fallbackSafeBudget.consideredModels);
      const fallbackTriggered =
        usedModel.length > 0 &&
        primaryModel.length > 0 &&
        knownFallbackModels.has(usedModel) &&
        usedModel !== primaryModel;

      if (
        fallbackTriggered &&
        activeBudgetMode === 'primary' &&
        promptBudgetPolicy.fallbackSafeBudget.maxPromptTokens <
          promptBudgetPolicy.primaryBudget.maxPromptTokens
      ) {
        activeBudgetMode = 'fallback_safe';
        logger.warn(`[${this.id}] Fallback model detected — switching to fallback-safe budget`, {
          agentId: this.id,
          operationId: context.operationId,
          tier: routing.tier,
          primaryModel,
          usedModel,
          primaryBudgetTokens: promptBudgetPolicy.primaryBudget.maxPromptTokens,
          fallbackSafeBudgetTokens: promptBudgetPolicy.fallbackSafeBudget.maxPromptTokens,
        });

        await this.compressMessageHistoryIfNeeded({
          messages,
          llm,
          context,
          iteration,
          promptBudgetTokens: promptBudgetPolicy.fallbackSafeBudget.maxPromptTokens,
          force: true,
        });

        getPromptBudgetService().applyBudget(
          messages,
          {
            maxPromptTokens: promptBudgetPolicy.fallbackSafeBudget.maxPromptTokens,
            maxMessageChars: promptBudgetPolicy.fallbackSafeBudget.maxMessageChars,
            maxToolResultChars: promptBudgetPolicy.fallbackSafeBudget.maxToolResultChars,
          },
          this.id,
          context.operationId
        );
      }

      // If the LLM responded with text and no tool calls → we're done
      if (result.toolCalls.length === 0) {
        logger.info(`[${this.id}] Task complete — no more tool calls`, {
          agentId: this.id,
          iteration: iteration + 1,
          model: result.model,
        });
        // Extract structured data from all completed tool call observations
        // so callers (e.g. agent-activity.service) can read imageUrl, storagePath, etc.
        const extractedToolData: Record<string, unknown> = {};
        for (const msg of messages) {
          if (msg.role === 'tool' && typeof msg.content === 'string') {
            try {
              const parsed = JSON.parse(msg.content) as Record<string, unknown>;
              if (
                parsed['success'] === true &&
                parsed['data'] &&
                typeof parsed['data'] === 'object'
              ) {
                Object.assign(
                  extractedToolData,
                  sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
                );
              }
            } catch {
              // Not JSON — skip
            }
          }
        }
        for (const entry of artifactLedger) {
          Object.assign(extractedToolData, sanitizeAgentPayload(entry.artifacts));
        }

        // Build persistent tool call records from the conversation history
        const toolCallRecords = this.extractToolCallRecords(messages, toolExecutionMeta);

        // Synthesize a summary from tool observations when the LLM returns empty content
        let summary = sanitizeAgentOutputText(result.content ?? '');
        const isSynthesized = !summary.trim();

        if (isSynthesized) {
          summary = this.synthesizeSummary(toolCallRecords);
          // When we already streamed assistant content earlier in this run,
          // synth fallback text should start on a fresh paragraph to avoid
          // run-on joins like "...?Completed: ...".
          const hasPriorAssistantContent = messages.some(
            (message) =>
              message.role === 'assistant' &&
              typeof message.content === 'string' &&
              message.content.trim().length > 0
          );
          if (hasPriorAssistantContent && summary.trim().length > 0) {
            summary = `\n\n${summary}`;
          }
        }

        summary = sanitizeAgentOutputText(summary);

        // Only stream the summary if it was synthesized because result.content was already streamed
        if (onStreamEvent && summary.trim() && isSynthesized) {
          onStreamEvent({ type: 'delta', text: summary, agentId: this.id });
        }

        // Phase B (thread-as-truth): the FINAL assistant message is
        // persisted by the worker post-loop (see agent.worker.ts \u2014 it
        // attaches rich UI metadata: steps, parts, resultData,
        // tokenUsage). We do NOT write it here to avoid a duplicate row.
        // Intermediate assistant-with-tool-calls turns and tool result
        // rows ARE written above so the next-turn replay sees the full
        // ReAct trajectory.

        const evidenceTrace = this.buildEvidenceTrace(
          summary,
          toolCallRecords,
          requiresComputeFirst
        );

        // Promote known artifact keys for structured cross-coordinator handoff
        const artifactsAcc: Record<string, string> = {};
        for (const key of ARTIFACT_KEYS) {
          const val = extractedToolData[key];
          if (typeof val === 'string') {
            artifactsAcc[key] = val;
          }
        }
        const artifacts =
          Object.keys(artifactsAcc).length > 0 ? (artifactsAcc as AgentArtifactHandoff) : undefined;

        // Deliverable-based success contract (professional pattern):
        //
        // An operation is only failed when the user's requested DELIVERABLE
        // could not be produced. Concretely:
        //   1. Pure chat / planning / read-only ops → ALWAYS success.
        //   2. Ops that invoked at least one terminal artifact tool
        //      (generate_graphic, create_play_diagram, etc.) → success iff
        //      ANY artifact tool invocation succeeded OR an artifact URL
        //      is present in the aggregated tool data. Helper tool failures
        //      and retry storms that ultimately delivered the artifact must
        //      not flip the sidebar to red.
        //   3. Helper/search/planning tool failures alone → success (the
        //      agent recovered or produced a normal final response).
        const ARTIFACT_DATA_KEYS = [
          'imageUrl',
          'videoUrl',
          'pdfUrl',
          'exportUrl',
          'audioUrl',
          'thumbnailUrl',
          'url',
          'fileUrl',
          'downloadUrl',
        ] as const;
        const hasDeliverableArtifact = ARTIFACT_DATA_KEYS.some(
          (key) =>
            typeof extractedToolData[key] === 'string' &&
            (extractedToolData[key] as string).trim().length > 0
        );
        const artifactToolInvocations = toolCallRecords.filter((record) =>
          TERMINAL_ARTIFACT_TOOL_FAILURES.has(record.toolName)
        );
        const anyArtifactToolSucceeded = artifactToolInvocations.some(
          (record) => record.status === 'success'
        );
        const artifactToolWasAttempted = artifactToolInvocations.length > 0;
        // FAIL only when an artifact was REQUESTED but NEVER produced.
        const deliverableMissing =
          artifactToolWasAttempted && !anyArtifactToolSucceeded && !hasDeliverableArtifact;
        const runLoopSuccess = !deliverableMissing;
        const runLoopErrorMessage = !runLoopSuccess
          ? (() => {
              const lastFailedArtifact = [...artifactToolInvocations]
                .reverse()
                .find((record) => record.status !== 'success');
              const rawErr =
                lastFailedArtifact?.output && typeof lastFailedArtifact.output === 'object'
                  ? (lastFailedArtifact.output as Record<string, unknown>)['error']
                  : undefined;
              if (typeof rawErr === 'string' && rawErr.trim().length > 0) return rawErr;
              return `Could not produce the requested ${lastFailedArtifact?.toolName ?? 'deliverable'}.`;
            })()
          : undefined;

        return {
          summary,
          data: sanitizeAgentPayload({
            model: result.model,
            usage: result.usage,
            toolCallRecords,
            ...(evidenceTrace.length > 0 ? { evidenceTrace } : {}),
            ...extractedToolData,
          }),
          ...(artifacts ? { artifacts } : {}),
          suggestions: [],
          success: runLoopSuccess,
          ...(runLoopErrorMessage ? { errorMessage: runLoopErrorMessage } : {}),
        };
      }

      const askUserToolCall = result.toolCalls.find(
        (toolCall) => toolCall.function.name === 'ask_user'
      );
      const toolCallsForIteration = askUserToolCall ? [askUserToolCall] : result.toolCalls;
      if (askUserToolCall && result.toolCalls.length > 1) {
        logger.warn(`[${this.id}] Dropping sibling tool calls from ask_user yield turn`, {
          agentId: this.id,
          operationId: context.operationId,
          keptToolCallId: askUserToolCall.id,
          droppedTools: result.toolCalls
            .filter((toolCall) => toolCall.id !== askUserToolCall.id)
            .map((toolCall) => toolCall.function.name),
        });
      }

      // Append the assistant message with its tool calls to the conversation
      const assistantMsgWithToolCalls: LLMMessage = {
        role: 'assistant',
        content:
          typeof result.content === 'string'
            ? sanitizeAgentOutputText(result.content)
            : result.content,
        tool_calls: toolCallsForIteration,
      };
      messages.push(assistantMsgWithToolCalls);

      // Phase B (thread-as-truth): persist this assistant turn IMMEDIATELY,
      // including wire-format tool_calls. If the tool execution below
      // throws a yield (approval gate, ask_user) before we can write the
      // resolving tool rows, the resume path uses
      // `pendingAssistantMessage` to merge this same row back in. If
      // execution proceeds normally, the tool rows below will pair with
      // these tool_calls via toolCallId.
      const threadWriter = getThreadMessageWriter();
      if (threadWriter && context.threadId) {
        await threadWriter.append(assistantMsgWithToolCalls, {
          threadId: context.threadId,
          userId: context.userId,
          agentId: this.id,
          semanticPhase: 'assistant_tool_call',
          ...(context.operationId ? { operationId: context.operationId } : {}),
        });
      }

      logger.info(`[${this.id}] Tool calls requested`, {
        agentId: this.id,
        iteration: iteration + 1,
        tools: toolCallsForIteration.map((t) => t.function.name),
      });

      // ── Tool execution (sequential by default, concurrent when opted-in) ──
      // The agent declares its tool concurrency via getToolConcurrency() (default 1).
      // parallelBatch preserves input order regardless of concurrency, so the
      // messages array stays structurally valid \u2014 OpenRouter requires every
      // tool_call to have a matching tool response message with the same id.
      const toolConcurrency = Math.max(
        1,
        Math.min(this.getToolConcurrency(), toolCallsForIteration.length)
      );
      const runConcurrent = toolConcurrency > 1;

      // 1. When running concurrently, emit step_active for ALL tools upfront so
      //    the UI shows the full batch as active in invocation order. When running
      //    sequentially, defer the step_active emission until the worker actually
      //    starts \u2014 this keeps the visual stream in strict order (one step
      //    spinning at a time) and avoids the "ugly" all-at-once flash.
      if (runConcurrent) {
        for (const toolCall of toolCallsForIteration) {
          this.throwIfAborted(context.signal);
          logger.info(`[${this.id}] Executing tool: ${toolCall.function.name}`, {
            agentId: this.id,
            tool: toolCall.function.name,
            args: toolCall.function.arguments,
          });
          onStreamEvent?.({
            type: 'step_active',
            agentId: this.id,
            stepId: toolCall.id,
            toolName: toolCall.function.name,
            stageType: 'tool',
            icon: this.resolveToolStepIcon(toolCall.function.name),
            message: this.resolveToolInvocationLabel(
              toolCall.function.name,
              toolCall.function.arguments
            ),
          });
        }
      }

      // 2. Capture session context once \u2014 shared read-only across all workers.
      const sessionCtxForTools: ToolSessionContext = {
        sessionId: context.sessionId,
        threadId: context.threadId,
        operationId: context.operationId,
        ...(context.appBaseUrl ? { appBaseUrl: context.appBaseUrl } : {}),
        allowedToolNames,
        allowedEntityGroups,
      };

      // 3. Run tools \u2014 sequential or concurrent depending on agent config.
      //    The yield-context messages snapshot is captured here, before any tool
      //    observations are pushed \u2014 safe because ask_user is never co-emitted
      //    alongside data tools in the same LLM response.
      const yieldCtxSnapshot = { agentId: this.id, messages };
      const toolBatchResults = await parallelBatch(
        toolCallsForIteration,
        async (toolCall) => {
          const startedAtMs = Date.now();

          // Smart artifact chaining: auto-inject mediaArtifact from prior results
          const augmentedToolCall = this.augmentToolCallWithArtifact(
            toolCall,
            messages,
            context,
            artifactLedger
          );

          if (!runConcurrent) {
            this.throwIfAborted(context.signal);
            logger.info(`[${this.id}] Executing tool: ${augmentedToolCall.function.name}`, {
              agentId: this.id,
              tool: augmentedToolCall.function.name,
              args: augmentedToolCall.function.arguments,
            });
            onStreamEvent?.({
              type: 'step_active',
              agentId: this.id,
              stepId: augmentedToolCall.id,
              toolName: augmentedToolCall.function.name,
              stageType: 'tool',
              icon: this.resolveToolStepIcon(augmentedToolCall.function.name),
              message: this.resolveToolInvocationLabel(
                augmentedToolCall.function.name,
                augmentedToolCall.function.arguments
              ),
            });
          }
          const observation = await this.executeTool(
            augmentedToolCall,
            toolRegistry,
            context.userId,
            context.signal,
            yieldCtxSnapshot,
            sessionCtxForTools,
            messages,
            approvalGate,
            onStreamEvent
          );

          const completedAtMs = Date.now();
          return {
            observation,
            durationMs: Math.max(0, completedAtMs - startedAtMs),
            completedAt: new Date(completedAtMs).toISOString(),
          };
        },
        { concurrency: toolConcurrency }
      );

      // 4. Process results in original order, push tool messages, emit tool_result events.
      //    Track yield/delegation exceptions; rethrow after all observations are committed
      //    so the messages array is complete and structurally valid for OpenRouter.
      let pendingThrow: unknown = undefined;
      let iterationCompletedToolCalls = 0;
      let iterationToolDurationMs = 0;
      for (let ti = 0; ti < toolCallsForIteration.length; ti++) {
        this.throwIfAborted(context.signal);

        const toolCall = toolCallsForIteration[ti];
        const br = toolBatchResults[ti];

        if (br.status === 'rejected') {
          const err = br.reason;
          // Capture the first yield/delegation exception for rethrowing after the loop.
          if ((isAgentYield(err) || isAgentDelegation(err)) && !pendingThrow) {
            pendingThrow = err;
          }
          if (isAgentDelegation(err) && onStreamEvent) {
            onStreamEvent({
              type: 'tool_result',
              agentId: this.id,
              stepId: toolCall.id,
              toolName: toolCall.function.name,
              stageType: 'tool',
              toolSuccess: true,
              toolResult: { delegated: true },
              icon: this.resolveToolStepIcon(toolCall.function.name),
              message: this.resolveToolInvocationLabel(
                toolCall.function.name,
                toolCall.function.arguments
              ),
            });
          }
          // Always push a placeholder so every tool_call has a corresponding tool message.
          const placeholderToolMsg: LLMMessage = {
            role: 'tool',
            content: JSON.stringify({ success: false, error: 'Tool execution was interrupted.' }),
            tool_call_id: toolCall.id,
          };
          messages.push(placeholderToolMsg);
          completedToolCallCount += 1;
          iterationCompletedToolCalls += 1;
          this.recordRecentToolName(recentToolNames, toolCall.function.name);
          // Phase B: persist the placeholder so replay reconstructs a
          // valid assistant↔tool pair even after an interruption.
          {
            const writer = getThreadMessageWriter();
            if (writer && context.threadId) {
              await writer.append(placeholderToolMsg, {
                threadId: context.threadId,
                userId: context.userId,
                agentId: this.id,
                ...(context.operationId ? { operationId: context.operationId } : {}),
              });
            }
          }
          continue;
        }

        const observation = this.truncateObservation(br.value.observation);
        iterationToolDurationMs += br.value.durationMs;
        toolExecutionMeta.set(toolCall.id, {
          completedAt: br.value.completedAt,
          durationMs: br.value.durationMs,
        });
        // Log tool result summary (structured — avoids logging signed URLs)
        try {
          const parsed = JSON.parse(observation) as Record<string, unknown>;
          const data = parsed['data'] as Record<string, unknown> | undefined;
          const logSummary: Record<string, unknown> = { success: parsed['success'] };
          if (data) {
            logSummary['dataKeys'] = Object.keys(data);
            if (typeof data['imageUrl'] === 'string') {
              logSummary['imageUrl'] = data['imageUrl'].slice(0, 80) + '...[see Firestore]';
            }
            if (typeof data['contentLength'] === 'number') {
              logSummary['contentLength'] = data['contentLength'];
            }
            if (typeof data['provider'] === 'string') {
              logSummary['provider'] = data['provider'];
            }
          }
          if (!parsed['success']) logSummary['error'] = parsed['error'];
          logger.info(`[${this.id}] Tool result: ${toolCall.function.name}`, {
            agentId: this.id,
            tool: toolCall.function.name,
            ...logSummary,
          });
        } catch {
          logger.info(`[${this.id}] Tool result: ${toolCall.function.name}`, {
            agentId: this.id,
            tool: toolCall.function.name,
            responseLength: observation.length,
          });
        }

        if (onStreamEvent) {
          let toolSuccess: boolean;
          let toolResult: Record<string, unknown> | undefined;
          try {
            const parsed = JSON.parse(observation) as Record<string, unknown>;
            toolSuccess = parsed['success'] === true;
            toolResult =
              typeof parsed['data'] === 'object' && parsed['data'] !== null
                ? sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
                : undefined;
          } catch {
            toolSuccess = observation.length > 0;
          }
          onStreamEvent({
            type: 'tool_result',
            agentId: this.id,
            stepId: toolCall.id,
            toolName: toolCall.function.name,
            stageType: 'tool',
            toolSuccess,
            toolResult,
            icon: this.resolveToolStepIcon(toolCall.function.name),
            message: this.resolveToolInvocationLabel(
              toolCall.function.name,
              toolCall.function.arguments
            ),
          });
        }

        const toolResultMsg: LLMMessage = {
          role: 'tool',
          content: observation,
          tool_call_id: toolCall.id,
        };
        messages.push(toolResultMsg);
        completedToolCallCount += 1;
        iterationCompletedToolCalls += 1;
        this.recordRecentToolName(recentToolNames, toolCall.function.name);
        // ── Artifact Ledger (Tier 3): capture artifacts from this tool result ──
        // Entries survive context pruning and are used as the last-resort fallback
        // by augmentToolCallWithArtifact on subsequent iterations.
        try {
          const parsedObs = JSON.parse(observation) as Record<string, unknown>;
          if (
            parsedObs['success'] === true &&
            typeof parsedObs['data'] === 'object' &&
            parsedObs['data'] !== null
          ) {
            const data = parsedObs['data'] as Record<string, unknown>;
            const captured: Record<string, unknown> = {};
            for (const key of ARTIFACT_KEYS) {
              if (data[key] !== undefined) captured[key] = data[key];
            }
            if (data['mediaArtifact'] !== undefined)
              captured['mediaArtifact'] = data['mediaArtifact'];
            if (Object.keys(captured).length > 0) {
              artifactLedger.push({ toolName: toolCall.function.name, artifacts: captured });
            }
          }
        } catch {
          /* skip if observation is not JSON */
        }
        // Phase B (thread-as-truth): persist the tool observation so
        // the next turn's replay reconstructs the exact assistant↔tool
        // pairing that OpenRouter requires.
        {
          const writer = getThreadMessageWriter();
          if (writer && context.threadId) {
            await writer.append(toolResultMsg, {
              threadId: context.threadId,
              userId: context.userId,
              agentId: this.id,
              semanticPhase: 'tool_result',
              ...(context.operationId ? { operationId: context.operationId } : {}),
            });
          }
        }
      }

      if (!pendingThrow) {
        const nowMs = Date.now();
        const shouldEmitProgress = this.shouldEmitProgressCommentary({
          iterationCompletedToolCalls,
          iterationToolDurationMs,
          totalCompletedToolCalls: completedToolCallCount,
          lastProgressCommentaryToolCount,
          lastProgressCommentaryAtMs,
          nowMs,
        });
        if (shouldEmitProgress) {
          const emittedProgressText = await this.emitLlmProgressCommentary(
            llm,
            onStreamEvent,
            context,
            completedToolCallCount,
            recentToolNames,
            lastProgressCommentaryText
          );
          if (emittedProgressText) {
            lastProgressCommentaryAtMs = nowMs;
            lastProgressCommentaryToolCount = completedToolCallCount;
            lastProgressCommentaryText = emittedProgressText;
          }
        }
      }

      // 5. Rethrow yield/delegation only after all tool messages are committed.
      if (pendingThrow) throw pendingThrow;

      // 6. Short-circuit: if any delegation tool already delivered the full
      //    user-facing response (user_already_received_response: true,
      //    follow_up_required: false), skip the next LLM call entirely.
      //    Without this guard the model generates an acknowledgment token
      //    like "Completed:" that appears as a spurious second response.
      const DELEGATION_TOOLS = new Set([
        'delegate_to_coordinator',
        'create_plan',
        'execute_saved_plan',
        'plan_and_execute',
      ]);
      const shouldExitAfterDelegation = toolCallsForIteration.some((tc) => {
        if (!DELEGATION_TOOLS.has(tc.function.name)) return false;
        const toolMsg = [...messages]
          .reverse()
          .find(
            (m: LLMMessage) =>
              m.role === 'tool' && (m as { tool_call_id?: string }).tool_call_id === tc.id
          );
        if (!toolMsg || typeof toolMsg.content !== 'string') return false;
        try {
          const obs = JSON.parse(toolMsg.content) as Record<string, unknown>;
          const data = obs['data'] as Record<string, unknown> | undefined;
          return (
            obs['success'] === true &&
            data?.['user_already_received_response'] === true &&
            data?.['follow_up_required'] === false
          );
        } catch {
          return false;
        }
      });

      if (shouldExitAfterDelegation) {
        const toolCallRecords = this.extractToolCallRecords(messages, toolExecutionMeta);
        const evidenceTrace = this.buildEvidenceTrace('', toolCallRecords, requiresComputeFirst);
        const extractedToolData: Record<string, unknown> = {};
        for (const msg of messages) {
          if (msg.role === 'tool' && typeof msg.content === 'string') {
            try {
              const parsed = JSON.parse(msg.content) as Record<string, unknown>;
              if (
                parsed['success'] === true &&
                parsed['data'] &&
                typeof parsed['data'] === 'object'
              ) {
                Object.assign(
                  extractedToolData,
                  sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
                );
              }
            } catch {
              // Not JSON — skip
            }
          }
        }
        const artifacts =
          Object.keys({} as Record<string, string>).length > 0
            ? ({} as AgentArtifactHandoff)
            : undefined;
        // Delegation short-circuit success: a downstream coordinator has
        // already streamed a complete user-facing response, so Primary must
        // end cleanly without an extra LLM turn.
        return {
          summary: '',
          data: sanitizeAgentPayload({
            model: '',
            toolCallRecords,
            ...(evidenceTrace.length > 0 ? { evidenceTrace } : {}),
            ...extractedToolData,
          }),
          ...(artifacts ? { artifacts } : {}),
          suggestions: [],
          success: true,
        };
      }

      this.throwIfAborted(context.signal);
    }

    logger.warn(
      `[${this.id}] Max iterations (${MAX_ITERATIONS}) reached — returning partial result`,
      {
        agentId: this.id,
        userId: context.userId,
      }
    );

    // Exhausted iterations — still extract any tool results that completed successfully
    const extractedToolData: Record<string, unknown> = {};
    for (const msg of messages) {
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        try {
          const parsed = JSON.parse(msg.content) as Record<string, unknown>;
          if (parsed['success'] === true && parsed['data'] && typeof parsed['data'] === 'object') {
            Object.assign(
              extractedToolData,
              sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
            );
          }
        } catch {
          // Not JSON — skip
        }
      }
    }
    for (const entry of artifactLedger) {
      Object.assign(extractedToolData, sanitizeAgentPayload(entry.artifacts));
    }
    const toolCallRecords = this.extractToolCallRecords(messages, toolExecutionMeta);
    const evidenceTrace = this.buildEvidenceTrace(
      'The agent reached its maximum iteration limit.',
      toolCallRecords,
      requiresComputeFirst
    );

    // Promote known artifact keys even on max-iteration exit
    const maxIterArtifactsAcc: Record<string, string> = {};
    for (const key of ARTIFACT_KEYS) {
      const val = extractedToolData[key];
      if (typeof val === 'string') {
        maxIterArtifactsAcc[key] = val;
      }
    }
    const maxIterArtifacts =
      Object.keys(maxIterArtifactsAcc).length > 0
        ? (maxIterArtifactsAcc as AgentArtifactHandoff)
        : undefined;

    return {
      summary: sanitizeAgentOutputText(
        'The agent reached its maximum iteration limit. ' +
          'The task may be too complex for a single pass.'
      ),
      success: false,
      errorMessage: 'Agent reached its maximum iteration limit before completing the task.',
      data: sanitizeAgentPayload({
        maxIterationsReached: true,
        toolCallRecords,
        ...(evidenceTrace.length > 0 ? { evidenceTrace } : {}),
        ...extractedToolData,
      }),
      ...(maxIterArtifacts ? { artifacts: maxIterArtifacts } : {}),
      suggestions: ['Try breaking the request into smaller tasks.'],
    };
  }

  private recordRecentToolName(buffer: string[], toolName: string): void {
    buffer.push(toolName);
    if (buffer.length > PROGRESS_COMMENTARY_MAX_TOOL_NAMES) {
      buffer.shift();
    }
  }

  private async emitLlmProgressCommentary(
    llm: OpenRouterService,
    onStreamEvent: OnStreamEvent | undefined,
    context: AgentSessionContext,
    completedToolCallCount: number,
    recentToolNames: readonly string[],
    previousCommentary: string
  ): Promise<string | null> {
    if (!onStreamEvent) return null;
    if (typeof llm.complete !== 'function') return null;

    try {
      const progressPrompt: readonly LLMMessage[] = [
        {
          role: 'system',
          content:
            'Write exactly one short live operations commentary line for an AI workflow stream. ' +
            'Use a play-by-play style about what is happening right now. ' +
            'Keep it operational, clear, and under 14 words. ' +
            'No hype, no filler, no markdown, no emojis, no quotes. ' +
            'Do not invent results, metrics, counts, or names. ' +
            'Never mention number of tool calls or numeric progress totals. ' +
            'Avoid template phrasing; the line must read naturally and be materially different from the prior line.',
        },
        {
          role: 'user',
          content:
            `Agent: ${this.id}\n` +
            `Completed tool calls: ${completedToolCallCount}\n` +
            `Recent tools: ${recentToolNames.join(', ') || 'none'}\n` +
            `Prior commentary: ${previousCommentary || 'none'}\n` +
            'Return one progress line now.',
        },
      ];

      const commentary = await llm.complete(progressPrompt, {
        tier: 'chat',
        maxTokens: 40,
        temperature: 0.2,
        ...(context.signal ? { signal: context.signal } : {}),
        ...(context.operationId
          ? {
              telemetryContext: {
                operationId: context.operationId,
                userId: context.userId,
                agentId: this.id,
                feature: 'agent.progress_commentary',
              },
            }
          : {}),
      });

      const text = sanitizeAgentOutputText(commentary.content ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, PROGRESS_COMMENTARY_MAX_CHARS);

      if (!text) return null;
      if (this.shouldSuppressProgressCommentary(text, previousCommentary)) return null;

      onStreamEvent({
        type: 'delta',
        agentId: this.id,
        text: `\n${text}\n`,
        noBatch: true,
      });
      return text;
    } catch (err) {
      logger.warn(`[${this.id}] Failed to generate LLM progress commentary`, {
        agentId: this.id,
        completedToolCallCount,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private shouldSuppressProgressCommentary(text: string, previousCommentary: string): boolean {
    const normalized = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
    const normalizedPrev = previousCommentary
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    if (!normalized) return true;
    if (PROGRESS_COMMENTARY_COUNT_PATTERN.test(text)) return true;
    if (normalized.includes('currently querying platform data sources')) return true;
    if (normalizedPrev && (normalized === normalizedPrev || normalized.includes(normalizedPrev))) {
      return true;
    }

    return false;
  }

  private shouldEmitProgressCommentary(input: {
    iterationCompletedToolCalls: number;
    iterationToolDurationMs: number;
    totalCompletedToolCalls: number;
    lastProgressCommentaryToolCount: number;
    lastProgressCommentaryAtMs: number;
    nowMs: number;
  }): boolean {
    const toolsSinceLast = input.totalCompletedToolCalls - input.lastProgressCommentaryToolCount;
    if (toolsSinceLast <= 0) return false;

    const cooldownPassed =
      input.nowMs - input.lastProgressCommentaryAtMs >= PROGRESS_COMMENTARY_COOLDOWN_MS;
    if (!cooldownPassed) return false;

    const heavyBurst = input.iterationCompletedToolCalls >= PROGRESS_COMMENTARY_HEAVY_BURST_TOOLS;
    const slowBurst =
      input.iterationCompletedToolCalls >= PROGRESS_COMMENTARY_SLOW_BURST_TOOLS &&
      input.iterationToolDurationMs >= PROGRESS_COMMENTARY_SLOW_BURST_MS;
    const staleSilence = toolsSinceLast >= PROGRESS_COMMENTARY_STALE_SILENCE_TOOLS;

    return heavyBurst || slowBurst || staleSilence;
  }

  private isComputeIntent(intent: string): boolean {
    const normalized = intent.toLowerCase();
    return COMPUTE_KEYWORDS.some((keyword) => normalized.includes(keyword));
  }

  private extractLatestUserText(messages: readonly LLMMessage[]): string {
    for (let idx = messages.length - 1; idx >= 0; idx -= 1) {
      const msg = messages[idx];
      if (msg.role !== 'user') continue;
      if (typeof msg.content === 'string') return msg.content;
      if (Array.isArray(msg.content)) {
        const textPart = msg.content.find((part) => part.type === 'text');
        if (textPart && typeof textPart.text === 'string') return textPart.text;
      }
    }
    return '';
  }

  private buildEvidenceTrace(
    summary: string,
    toolCallRecords: readonly AgentToolCallRecord[],
    requiresComputeFirst: boolean
  ): readonly Record<string, unknown>[] {
    const factualSummary = /\d/.test(summary) || /percent|ratio|average|total|count/i.test(summary);
    if (!requiresComputeFirst && !factualSummary) {
      return [];
    }

    const successfulRecords = toolCallRecords.filter((record) => record.status === 'success');
    return successfulRecords.slice(0, 3).map((record) => ({
      claim: factualSummary ? summary.slice(0, 180) : 'Tool-backed factual response',
      toolName: record.toolName,
      confidence: 'high',
      sourceData:
        record.output && typeof record.output === 'object'
          ? JSON.stringify(record.output).slice(0, 220)
          : undefined,
    }));
  }

  private truncateObservation(observation: string): string {
    if (observation.length <= MAX_OBSERVATION_LENGTH) {
      return observation;
    }

    try {
      const parsed = JSON.parse(observation) as Record<string, unknown>;
      if (parsed['success'] && parsed['data'] && typeof parsed['data'] === 'object') {
        const data = parsed['data'] as Record<string, unknown>;
        if (
          typeof data['markdownContent'] === 'string' &&
          data['markdownContent'].length > MAX_OBSERVATION_LENGTH
        ) {
          data['markdownContent'] =
            data['markdownContent'].slice(0, MAX_OBSERVATION_LENGTH) + '\n...[truncated]';
          data['truncated'] = true;
          return JSON.stringify(parsed);
        }
      }
    } catch {
      return observation.slice(0, MAX_OBSERVATION_LENGTH) + '\n...[truncated]';
    }

    return observation;
  }

  // ─── Context Window Pruner ────────────────────────────────────────────────

  /**
   * Prune the ReAct conversation history to keep the LLM context within budget.
   *
   * Without pruning, a 15-iteration run with 3 tools/iteration accumulates
   * 45 tool messages × 8k chars = 360k chars — well beyond what most models
   * handle efficiently, causing slower responses, higher costs, and occasional
   * 400 "context too large" errors that trigger the fallback chain.
   *
   * Strategy:
   * 1. Parse `messages` into complete "exchanges" (one assistant message with
   *    tool_calls + its matching tool-response messages).
   * 2. If total exchanges ≤ CONTEXT_PRUNE_THRESHOLD: no-op.
   * 3. Otherwise: pin the first CONTEXT_KEEP_FIRST_EXCHANGES exchanges
   *    (foundational data) and the last CONTEXT_KEEP_LAST_EXCHANGES exchanges
   *    (recent work), collapse the middle into a single compact assistant
   *    message listing what was accomplished.
   *
   * Invariants:
   * - messages[0] always remains the system prompt.
   * - messages[1] always remains the user intent.
   * - Every assistant message that has tool_calls always appears alongside
   *   ALL its matching tool-response messages — no orphaned tool_call_ids.
   * - Prior summary messages (from earlier prunes) are folded into the new
   *   summary rather than re-inserted as stand-alone messages.
   */
  private pruneMessageHistory(messages: LLMMessage[], maxPromptTokens?: number): void {
    if (messages.length <= 2) return;

    if (typeof maxPromptTokens === 'number' && maxPromptTokens > 0) {
      const estimatedTokens = getPromptBudgetService().estimateTokens(messages);
      if (estimatedTokens < Math.floor(maxPromptTokens * CONTEXT_PRUNE_TOKEN_RATIO)) {
        return;
      }
    }

    const systemMsg = messages[0];
    const userMsg = messages[1];
    const tail = messages.slice(2);

    // ── Parse into exchanges and prior-summary overhead ───────────────────
    // An exchange = [assistantMsg (with tool_calls), ...matching tool msgs].
    // Standalone assistant messages without tool_calls are prior prune
    // summaries — their text is harvested and folded into the next summary.
    const exchanges: LLMMessage[][] = [];
    const priorSummaryLines: string[] = [];
    let current: LLMMessage[] = [];

    for (const msg of tail) {
      if (msg.role === 'assistant') {
        if (current.length > 0) {
          const head = current[0];
          if (head.tool_calls && head.tool_calls.length > 0) {
            exchanges.push(current);
          } else if (typeof head.content === 'string' && head.content.trim()) {
            // Prior prune summary — harvest text, drop the message itself
            priorSummaryLines.push(head.content.trim());
          }
        }
        current = [msg];
      } else {
        current.push(msg);
      }
    }
    // Flush the final group
    if (current.length > 0) {
      const head = current[0];
      if (head.tool_calls && head.tool_calls.length > 0) {
        exchanges.push(current);
      } else if (typeof head.content === 'string' && head.content.trim()) {
        priorSummaryLines.push(head.content.trim());
      }
    }

    // Below threshold — nothing to do
    if (exchanges.length <= CONTEXT_PRUNE_THRESHOLD) return;

    const firstExchanges = exchanges.slice(0, CONTEXT_KEEP_FIRST_EXCHANGES);
    const lastExchanges = exchanges.slice(exchanges.length - CONTEXT_KEEP_LAST_EXCHANGES);
    const middleExchanges = exchanges.slice(
      CONTEXT_KEEP_FIRST_EXCHANGES,
      exchanges.length - CONTEXT_KEEP_LAST_EXCHANGES
    );

    // ── Build the compaction summary ──────────────────────────────────────
    const summaryLines: string[] = [];

    // Carry forward any text from previous prune passes
    if (priorSummaryLines.length > 0) {
      summaryLines.push(...priorSummaryLines, '');
    }

    summaryLines.push(
      `[Context compacted — ${middleExchanges.length} iteration(s) summarized for token efficiency]`,
      'Tool calls completed in compacted iterations:'
    );

    for (const exchange of middleExchanges) {
      const assistantMsg = exchange[0];
      if (!assistantMsg.tool_calls) continue;
      for (const tc of assistantMsg.tool_calls) {
        const toolMsg = exchange.find((m) => m.role === 'tool' && m.tool_call_id === tc.id);
        let outcome = 'completed';
        if (toolMsg && typeof toolMsg.content === 'string') {
          try {
            const p = JSON.parse(toolMsg.content) as Record<string, unknown>;
            if (p['success'] === false) {
              outcome = `failed: ${sanitizeAgentOutputText(String(p['error'] ?? 'unknown'))}`;
            } else {
              const artifactSummary = this.summarizeToolObservationArtifacts(p);
              if (artifactSummary) outcome = `completed; ${artifactSummary}`;
            }
          } catch {
            /* non-JSON observation — treat as completed */
          }
        }
        const argSummary = this.summarizeToolArgs(tc.function.arguments);
        summaryLines.push(`  \u2022 ${tc.function.name}(${argSummary}) \u2192 ${outcome}`);
      }
    }

    const summaryMsg: LLMMessage = {
      role: 'assistant',
      content: summaryLines.join('\n'),
      // Intentionally no tool_calls — this message will not be re-parsed as
      // an exchange on the next prune pass; its content is harvested instead.
    };

    const totalBefore = messages.length;

    // Mutate in-place so callers that hold a reference to this array see
    // the updated window without needing to re-assign.
    messages.splice(
      0,
      messages.length,
      systemMsg,
      userMsg,
      ...firstExchanges.flat(),
      summaryMsg,
      ...lastExchanges.flat()
    );

    logger.info(`[${this.id}] Context window pruned`, {
      agentId: this.id,
      prunedExchanges: middleExchanges.length,
      keptFirst: CONTEXT_KEEP_FIRST_EXCHANGES,
      keptLast: CONTEXT_KEEP_LAST_EXCHANGES,
      messagesBefore: totalBefore,
      messagesAfter: messages.length,
    });
  }

  private async compressMessageHistoryIfNeeded(params: {
    messages: LLMMessage[];
    llm: OpenRouterService;
    context: AgentSessionContext;
    iteration: number;
    promptBudgetTokens: number;
    force?: boolean;
  }): Promise<void> {
    if (!params.force && params.iteration < COMPRESSION_TRIGGER_MIN_ITERATION) return;
    if (params.messages.length <= 2) return;

    const budgetService = getPromptBudgetService();
    const estimatedTokens = budgetService.estimateTokens(params.messages);
    if (
      !params.force &&
      estimatedTokens < Math.floor(params.promptBudgetTokens * COMPRESSION_TRIGGER_TOKEN_RATIO)
    ) {
      return;
    }

    const parsed = this.parseToolExchangesForCompaction(params.messages);
    if (
      parsed.exchanges.length <
      COMPRESSION_KEEP_FIRST_EXCHANGES + COMPRESSION_KEEP_LAST_EXCHANGES + 2
    ) {
      return;
    }

    const firstExchanges = parsed.exchanges.slice(0, COMPRESSION_KEEP_FIRST_EXCHANGES);
    const lastExchanges = parsed.exchanges.slice(
      parsed.exchanges.length - COMPRESSION_KEEP_LAST_EXCHANGES
    );
    const middleExchanges = parsed.exchanges.slice(
      COMPRESSION_KEEP_FIRST_EXCHANGES,
      parsed.exchanges.length - COMPRESSION_KEEP_LAST_EXCHANGES
    );

    const summary = await this.summarizeMiddleExchangesWithLlm(
      middleExchanges,
      params.llm,
      params.context
    );
    const summaryMsg: LLMMessage = {
      role: 'assistant',
      content: summary,
    };

    const totalBefore = params.messages.length;
    params.messages.splice(
      0,
      params.messages.length,
      parsed.systemMsg,
      parsed.userMsg,
      ...firstExchanges.flat(),
      summaryMsg,
      ...lastExchanges.flat()
    );

    logger.info(`[${this.id}] Mid-run context compression applied`, {
      agentId: this.id,
      operationId: params.context.operationId,
      iteration: params.iteration + 1,
      tokensBefore: estimatedTokens,
      tokensAfter: budgetService.estimateTokens(params.messages),
      messagesBefore: totalBefore,
      messagesAfter: params.messages.length,
      summarizedExchanges: middleExchanges.length,
    });
  }

  private parseToolExchangesForCompaction(messages: LLMMessage[]): {
    systemMsg: LLMMessage;
    userMsg: LLMMessage;
    exchanges: LLMMessage[][];
  } {
    const systemMsg = messages[0];
    const userMsg = messages[1];
    const tail = messages.slice(2);
    const exchanges: LLMMessage[][] = [];
    let current: LLMMessage[] = [];

    for (const msg of tail) {
      if (msg.role === 'assistant') {
        if (current.length > 0) {
          const head = current[0];
          if (head.tool_calls && head.tool_calls.length > 0) {
            exchanges.push(current);
          }
        }
        current = [msg];
      } else {
        current.push(msg);
      }
    }

    if (current.length > 0) {
      const head = current[0];
      if (head.tool_calls && head.tool_calls.length > 0) {
        exchanges.push(current);
      }
    }

    return { systemMsg, userMsg, exchanges };
  }

  private async summarizeMiddleExchangesWithLlm(
    middleExchanges: readonly LLMMessage[][],
    llm: OpenRouterService,
    context: AgentSessionContext
  ): Promise<string> {
    const fallbackSummary = this.buildDeterministicCompressionSummary(middleExchanges);

    try {
      const transcript = this.buildCompressionTranscript(middleExchanges);
      const result = await llm.complete(
        [
          {
            role: 'system',
            content:
              'Summarize prior completed agent work into a compact operational memory block. ' +
              'Return plain text only, no markdown, no bullets with special characters, no JSON. ' +
              'Include what was attempted, what succeeded, what failed, and the latest known state.',
          },
          {
            role: 'user',
            content:
              `Create a compressed summary in <= ${COMPRESSION_SUMMARY_MAX_CHARS} characters.\n\n` +
              transcript,
          },
        ],
        {
          tier: 'extraction',
          maxTokens: 420,
          temperature: 0.1,
          ...(context.signal ? { signal: context.signal } : {}),
          ...(context.operationId
            ? {
                telemetryContext: {
                  operationId: context.operationId,
                  userId: context.userId,
                  agentId: this.id,
                },
              }
            : {}),
        }
      );

      const summary = sanitizeAgentOutputText(result.content ?? '').trim();
      if (!summary) return fallbackSummary;

      return this.wrapCompressionSummary(summary);
    } catch (err) {
      logger.warn(`[${this.id}] LLM compression failed; using deterministic summary`, {
        agentId: this.id,
        operationId: context.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return fallbackSummary;
    }
  }

  private buildCompressionTranscript(middleExchanges: readonly LLMMessage[][]): string {
    const lines: string[] = [];

    for (const exchange of middleExchanges) {
      const assistant = exchange[0];
      const assistantText =
        typeof assistant.content === 'string' ? sanitizeAgentOutputText(assistant.content) : '';
      if (assistantText.trim().length > 0) {
        lines.push(`assistant: ${assistantText.slice(0, 240)}`);
      }

      for (const toolCall of assistant.tool_calls ?? []) {
        const toolMsg = exchange.find((m) => m.role === 'tool' && m.tool_call_id === toolCall.id);
        const toolOutcome = this.extractToolOutcome(toolMsg?.content);
        lines.push(`tool: ${toolCall.function.name} -> ${toolOutcome}`);
      }

      if (lines.length >= COMPRESSION_MAX_EXCHANGE_LINES) break;
    }

    return lines.slice(0, COMPRESSION_MAX_EXCHANGE_LINES).join('\n');
  }

  private buildDeterministicCompressionSummary(middleExchanges: readonly LLMMessage[][]): string {
    const lines: string[] = [];

    for (const exchange of middleExchanges) {
      const assistant = exchange[0];
      for (const toolCall of assistant.tool_calls ?? []) {
        const toolMsg = exchange.find((m) => m.role === 'tool' && m.tool_call_id === toolCall.id);
        const outcome = this.extractToolOutcome(toolMsg?.content);
        lines.push(`${toolCall.function.name}: ${outcome}`);
        if (lines.length >= 18) break;
      }
      if (lines.length >= 18) break;
    }

    return this.wrapCompressionSummary(lines.join('; '));
  }

  private wrapCompressionSummary(summary: string): string {
    const bounded = summary.slice(0, COMPRESSION_SUMMARY_MAX_CHARS).trim();
    return `[Context compressed] ${bounded}`;
  }

  private extractToolOutcome(content: unknown): string {
    if (typeof content !== 'string' || !content.trim()) return 'completed';

    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed['success'] === false) {
        return `failed (${sanitizeAgentOutputText(String(parsed['error'] ?? 'error'))})`;
      }

      const data = parsed['data'];
      if (data && typeof data === 'object') {
        const keys = Object.keys(data as Record<string, unknown>);
        if (keys.length > 0) return `completed (${keys.slice(0, 4).join(', ')})`;
      }

      return 'completed';
    } catch {
      return 'completed';
    }
  }

  /**
   * Compress tool call arguments into a short, human-readable string for use
   * inside the context compaction summary. Never fed back to the LLM as tool
   * input — purely for readability in the summary message.
   */
  private summarizeToolArgs(argsJson: string): string {
    const args = this.parseToolCallInput(argsJson);
    if (!args) return argsJson.slice(0, 40);

    const entries = Object.entries(args);
    if (entries.length === 0) return '';
    const [key, val] = entries[0];
    const valStr = String(val).slice(0, 50);
    const suffix = entries.length > 1 ? ` +${entries.length - 1}` : '';
    return `${key}: "${valStr}"${suffix}`;
  }

  private parseToolCallInput(rawArgs: string): Record<string, unknown> | null {
    const tryParse = (candidate: string): Record<string, unknown> | null => {
      try {
        const parsed = JSON.parse(candidate) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return null;
      }
      return null;
    };

    const repairUnclosedJson = (candidate: string): string | null => {
      const stack: string[] = [];
      let inString = false;
      let escaped = false;

      for (const char of candidate) {
        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (char === '\\') {
            escaped = true;
            continue;
          }
          if (char === '"') {
            inString = false;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          continue;
        }

        if (char === '{') {
          stack.push('}');
          continue;
        }

        if (char === '[') {
          stack.push(']');
          continue;
        }

        if (char === '}' || char === ']') {
          const expected = stack.pop();
          if (expected !== char) {
            return null;
          }
        }
      }

      if (inString) {
        return null;
      }

      if (stack.length === 0) {
        return candidate;
      }

      const sanitized = candidate.replace(/,\s*$/u, '').trimEnd();
      return `${sanitized}${stack.reverse().join('')}`;
    };

    const direct = tryParse(rawArgs);
    if (direct) return direct;

    const trimmed = rawArgs.trim();
    const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const fromFence = tryParse(unfenced);
    if (fromFence) return fromFence;

    const repairedUnfenced = repairUnclosedJson(unfenced);
    if (repairedUnfenced) {
      const repaired = tryParse(repairedUnfenced);
      if (repaired) return repaired;
    }

    const firstBrace = unfenced.indexOf('{');
    const lastBrace = unfenced.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const objectSlice = unfenced.slice(firstBrace, lastBrace + 1);
      const sliced = tryParse(objectSlice);
      if (sliced) return sliced;

      const withoutTrailingCommas = objectSlice.replace(/,\s*([}\]])/g, '$1');
      const repaired = tryParse(withoutTrailingCommas);
      if (repaired) return repaired;
    }

    if (firstBrace !== -1) {
      const objectTail = unfenced.slice(firstBrace);
      const repairedTail = repairUnclosedJson(objectTail);
      if (repairedTail) {
        const repaired = tryParse(repairedTail);
        if (repaired) return repaired;
      }
    }

    return null;
  }

  private summarizeToolObservationArtifacts(observation: Record<string, unknown>): string | null {
    const data = observation['data'];
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

    const record = data as Record<string, unknown>;
    const parts: string[] = [];

    for (const key of ARTIFACT_KEYS) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        parts.push(`${key}=${value.trim()}`);
      }
    }

    return parts.length > 0 ? `artifacts: ${parts.join(', ')}` : null;
  }

  // ─── Tool Call Record Extraction ──────────────────────────────────────────

  /**
   * Walk the conversation messages and build `AgentToolCallRecord[]` by
   * pairing each assistant `tool_calls` entry with its corresponding
   * `role: 'tool'` observation. This data is persisted to MongoDB so
   * the frontend can reconstruct historical tool steps.
   */
  private extractToolCallRecords(
    messages: readonly LLMMessage[],
    executionMeta?: ReadonlyMap<
      string,
      {
        readonly completedAt: string;
        readonly durationMs: number;
      }
    >
  ): AgentToolCallRecord[] {
    const records: AgentToolCallRecord[] = [];

    // Build a map from tool_call_id → observation content
    const observationMap = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role === 'tool' && msg.tool_call_id && typeof msg.content === 'string') {
        observationMap.set(msg.tool_call_id, msg.content);
      }
    }

    // Walk assistant messages looking for tool_calls
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.tool_calls) continue;

      for (const tc of msg.tool_calls) {
        const observation = observationMap.get(tc.id) ?? '';
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          // Malformed JSON — leave empty
        }

        let output: Record<string, unknown> | undefined;
        let status: AgentToolCallRecord['status'] = 'success';
        try {
          const parsed = JSON.parse(observation) as Record<string, unknown>;
          if (parsed['success'] === false) {
            status = parsed['error']?.toString().includes('guardrail')
              ? 'blocked_by_guardrail'
              : 'error';
          }
          output =
            typeof parsed['data'] === 'object' && parsed['data'] !== null
              ? sanitizeAgentPayload(parsed['data'] as Record<string, unknown>)
              : sanitizeAgentPayload(parsed);
        } catch {
          // Non-JSON observation — store as raw text
          output = observation
            ? sanitizeAgentPayload({ raw: sanitizeAgentOutputText(observation.slice(0, 500)) })
            : undefined;
        }

        const meta = executionMeta?.get(tc.id);

        records.push({
          toolName: tc.function.name,
          input: sanitizeAgentPayload(input),
          output,
          ...(typeof meta?.durationMs === 'number' ? { durationMs: meta.durationMs } : {}),
          status,
          timestamp: meta?.completedAt ?? new Date().toISOString(),
        });
      }
    }

    return records;
  }

  /**
   * Synthesize a human-readable summary from tool call records when the
   * LLM returns no explicit text content after its final iteration.
   * Falls back to a generic message only if no tool records exist.
   */
  private synthesizeSummary(records: readonly AgentToolCallRecord[]): string {
    if (records.length === 0) return 'Task completed.';

    const successRecords = records.filter((r) => r.status === 'success');
    if (successRecords.length === 0) {
      return 'Task completed, but some steps encountered errors.';
    }

    // Delegation handoffs stream their user-facing output from downstream
    // coordinators/plans. Emitting "Completed: delegate to coordinator." here
    // creates redundant noise and can concatenate awkwardly with streamed text.
    const HANDOFF_TOOLS = new Set([
      'delegate_to_coordinator',
      'create_plan',
      'execute_saved_plan',
      'plan_and_execute',
    ]);
    const allSuccessesAreHandoffs = successRecords.every((r) => HANDOFF_TOOLS.has(r.toolName));
    if (allSuccessesAreHandoffs) {
      return '';
    }

    // Build a description from tool names (human-readable)
    const toolNames = [...new Set(successRecords.map((r) => r.toolName.replace(/_/g, ' ')))];
    if (toolNames.length === 1) {
      return `Completed: ${toolNames[0]}.`;
    }
    return `Completed ${successRecords.length} step${successRecords.length > 1 ? 's' : ''}: ${toolNames.join(', ')}.`;
  }

  // ─── Tool Execution ─────────────────────────────────────────────────────

  /**
   * Execute a single tool call and return the observation string
   * for the LLM to consume.
   *
   * Marked `protected` so the Primary Agent can override and intercept
   * Primary-only control-flow exceptions (DelegateToCoordinator, PlanAndExecute)
   * to dispatch into the existing coordinator/planner pipeline and feed the
   * result back as the next observation.
   */
  protected async executeTool(
    toolCall: LLMToolCall,
    registry: ToolRegistry,
    userId: string,
    signal?: AbortSignal,
    yieldContext?: AskUserToolContext,
    sessionContext?: ToolSessionContext,
    currentMessages?: readonly LLMMessage[],
    approvalGate?: ApprovalGateService,
    onStreamEvent?: OnStreamEvent
  ): Promise<string> {
    this.throwIfAborted(signal);

    const toolName = toolCall.function.name;

    // Re-check permissions: ensure the LLM isn't calling a tool outside its allowlist.
    // System-category tools (e.g. delegate_task) bypass the allowlist.
    const allowedToolNames =
      sessionContext?.allowedToolNames ?? getEffectiveAgentToolPolicy(this.id);
    const tool = registry.get(toolName);
    const isSystemTool = tool?.category === 'system';
    const bypassPermissions =
      sessionContext?.bypassPermissionForTool?.toolName === toolName &&
      sessionContext?.bypassPermissionForTool?.toolCallId === toolCall.id;
    if (
      !isSystemTool &&
      !bypassPermissions &&
      allowedToolNames.length > 0 &&
      !allowedToolNames.includes(toolName)
    ) {
      if (EMAIL_SEND_TOOL_NAMES.has(toolName)) {
        return JSON.stringify({
          success: false,
          error: EMAIL_CONNECTION_REQUIRED_MESSAGE,
          data: { requiresEmailConnection: true },
        });
      }

      if (this.id === 'router' && ['analyze_video', 'extract_live_view_media'].includes(toolName)) {
        return JSON.stringify({
          error: `Tool "${toolName}" is not allowed for agent "router". Delegate film and live-view media work to performance_coordinator via delegate_to_coordinator.`,
          errorCode: 'AGENT_TOOL_NOT_ALLOWED',
          guidance:
            'Call delegate_to_coordinator with coordinatorId="performance_coordinator" and include the user goal, current live-view context, and a strict small-batch limit. Do not retry the forbidden media tool from router.',
        });
      }

      return JSON.stringify({
        error: `Tool "${toolName}" is not allowed for agent "${this.id}".`,
        errorCode: 'AGENT_TOOL_NOT_ALLOWED',
      });
    }

    const input = this.parseToolCallInput(toolCall.function.arguments);
    if (!input) {
      return JSON.stringify({
        error: `Invalid JSON arguments for tool "${toolName}".`,
        errorCode: 'AGENT_TOOL_ARGS_INVALID',
      });
    }

    const operationMemory = sessionContext?.operationId ? getOperationMemoryService() : null;

    // Deterministic duplicate-prevention for expensive live-view extraction tools.
    // If the exact tool+args combo already succeeded earlier in this operation,
    // return the cached successful result instead of re-executing the tool.
    if (operationMemory && sessionContext?.operationId && DUPLICATE_GUARDED_TOOLS.has(toolName)) {
      const cachedResult = operationMemory.getSuccessfulResult(
        sessionContext.operationId,
        toolName,
        input
      );
      if (cachedResult !== undefined) {
        operationMemory.logEvent(sessionContext.operationId, {
          agentId: this.id,
          toolName,
          input,
          outcome: 'skip',
        });
        logger.info('[BaseAgent] Skipped duplicate tool execution via OperationMemory', {
          agentId: this.id,
          operationId: sessionContext.operationId,
          toolName,
        });
        return JSON.stringify({
          success: true,
          data:
            typeof cachedResult === 'object' && cachedResult !== null
              ? {
                  ...(cachedResult as Record<string, unknown>),
                  _dedupedFromOperationMemory: true,
                }
              : {
                  value: cachedResult,
                  _dedupedFromOperationMemory: true,
                },
        });
      }
    }

    // Stuck-loop guard: if this tool has already been locked out for this
    // operation due to repeated identical-args failures, short-circuit
    // immediately with the lockout message instead of re-executing.
    const loopDetector = getToolLoopDetector();
    const lockoutMessage = loopDetector.checkLockout(sessionContext?.operationId, toolName);
    if (lockoutMessage) {
      return lockoutMessage;
    }

    if (approvalGate) {
      const approvalRequirement = approvalGate.getApprovalRequirement(toolName, input);
      if (approvalRequirement) {
        const approvalPrompt = resolveAgentApprovalPrompt({
          reasonCode: approvalRequirement.reasonCode,
          actionSummary: approvalRequirement.actionSummary,
        });
        const approvalAlreadyGranted =
          typeof sessionContext?.approvalId === 'string'
            ? await approvalGate.isApprovalGranted(
                sessionContext.approvalId,
                userId,
                toolName,
                input
              )
            : false;

        if (!approvalAlreadyGranted) {
          // ── Session-level trust check ──────────────────────────────────
          // If the user previously approved a tool in the same trust group
          // (within this session) and checked "Trust for this session",
          // skip the approval gate entirely.
          const sessionId = sessionContext?.sessionId;
          const sessionTrustActive =
            sessionId != null &&
            (await approvalGate
              .hasActiveTrustGrant(userId, sessionId, toolName)
              .catch(() => false));

          if (!sessionTrustActive) {
            const approvalRequest = await approvalGate.requestApproval({
              operationId: sessionContext?.operationId ?? toolCall.id,
              taskId: sessionContext?.operationId ?? toolCall.id,
              userId,
              toolName,
              toolInput: input,
              actionSummary: approvalRequirement.actionSummary,
              reasoning: approvalRequirement.actionSummary,
              threadId: sessionContext?.threadId,
            });

            throw new AgentYieldException({
              reason: 'needs_approval',
              promptToUser: approvalPrompt,
              agentId: this.id,
              messages: currentMessages ?? yieldContext?.messages ?? [],
              pendingToolCall: {
                toolName,
                toolInput: input,
                toolCallId: toolCall.id,
              },
              approvalId: approvalRequest.id,
            });
          }
        }
      }
    }

    // Inject yield context into the input so AskUserTool can read it
    // without relying on mutable singleton state (safe with concurrent workers).
    if (yieldContext && toolName === 'ask_user') {
      input[ASK_USER_CONTEXT_KEY] = yieldContext;
    }

    // Build execution context for the tool — provides identity & session info
    // so tools can use thread-scoped storage paths, audit logging, etc.
    const toolExecContext: ToolExecutionContext = {
      userId,
      ...(signal && { signal }),
      ...(sessionContext?.environment && { environment: sessionContext.environment }),
      ...(sessionContext?.appBaseUrl && { appBaseUrl: sessionContext.appBaseUrl }),
      ...(sessionContext?.operationId && { operationId: sessionContext.operationId }),
      ...(sessionContext?.threadId && { threadId: sessionContext.threadId }),
      ...(sessionContext?.sessionId && { sessionId: sessionContext.sessionId }),
      ...(sessionContext?.allowedToolNames && {
        allowedToolNames: sessionContext.allowedToolNames,
      }),
      ...(sessionContext?.allowedEntityGroups && {
        allowedEntityGroups: sessionContext.allowedEntityGroups,
      }),
      ...(onStreamEvent && {
        emitStage: (stage, metadata) => {
          onStreamEvent({
            type: 'step_active',
            agentId: this.id,
            stepId: toolCall.id,
            toolName,
            stageType: 'tool',
            stage,
            metadata,
            icon: metadata?.icon ?? this.resolveToolStepIcon(toolName, stage),
            message: this.resolveToolStageLabel(toolName, stage, metadata, input),
          });
        },
      }),
    };

    // AgentYieldException from AskUserTool must propagate out of the ReAct loop
    // so the worker can catch it and suspend the job. Do NOT catch it here.
    // AgentDelegationException from DelegateTaskTool must propagate out so the
    // AgentRouter can re-dispatch through the PlannerAgent.
    try {
      const result = await this.executeToolWithRetry({
        registry,
        toolName,
        input,
        toolExecContext,
        signal,
        canRetry: Boolean(tool && !tool.isMutation && !isSystemTool),
        operationId: sessionContext?.operationId,
      });
      this.throwIfAborted(signal);

      // Keep exact tool payloads for the agent's internal ReAct loop so later
      // tool calls can reuse IDs, cursors, routes, and other machine-readable
      // references. User-visible text is scrubbed separately at render/stream time.
      const rawData = result.data !== undefined ? result.data : undefined;

      // Classify the outcome for the loop detector:
      //   'failure' — tool explicitly reported an error (success: false)
      //   'empty'   — tool succeeded but returned null / [] / {} (futile search)
      //   'success' — tool returned real data
      const isDataEmpty =
        rawData === null ||
        rawData === undefined ||
        (Array.isArray(rawData) && rawData.length === 0) ||
        (typeof rawData === 'object' &&
          !Array.isArray(rawData) &&
          Object.keys(rawData as object).length === 0);

      const outcome: 'success' | 'failure' | 'empty' = !result.success
        ? 'failure'
        : isDataEmpty
          ? 'empty'
          : 'success';

      const { advisory } = loopDetector.record(
        sessionContext?.operationId,
        toolName,
        toolCall.function.arguments,
        outcome
      );

      if (operationMemory && sessionContext?.operationId) {
        operationMemory.logEvent(sessionContext.operationId, {
          agentId: this.id,
          toolName,
          input,
          outcome: result.success ? 'success' : 'failure',
        });

        if (result.success && rawData !== undefined) {
          operationMemory.rememberSuccessfulResult(
            sessionContext.operationId,
            toolName,
            input,
            rawData
          );

          if (typeof rawData === 'object' && rawData !== null) {
            const artifactData = rawData as Record<string, unknown>;
            for (const key of ARTIFACT_KEYS) {
              if (artifactData[key] !== undefined) {
                operationMemory.logArtifact(sessionContext.operationId, {
                  key,
                  value: artifactData[key],
                  sourceAgent: this.id,
                  sourceTool: toolName,
                });
              }
            }
            if (artifactData['mediaArtifact'] !== undefined) {
              operationMemory.logArtifact(sessionContext.operationId, {
                key: 'mediaArtifact',
                value: artifactData['mediaArtifact'],
                sourceAgent: this.id,
                sourceTool: toolName,
              });
            }
          }
        }
      }

      if (result.success && result.markdown) {
        // Preserve structured payloads when available. Returning markdown-only here
        // hides `data` from the LLM (e.g., play entries in get_playbook), which
        // breaks downstream reasoning for search and matching tasks.
        if (rawData !== undefined || advisory) {
          return JSON.stringify({
            success: true,
            markdown: result.markdown,
            ...(rawData !== undefined ? { data: rawData } : {}),
            ...(advisory ? { _advisory: advisory } : {}),
          });
        }
        return result.markdown;
      }

      // Advisory must reach the LLM on BOTH success and failure paths.
      // Previously it was only attached to the failure branch, so empty-result
      // advisories were silently dropped and the agent never saw the warning.
      const payload = result.success
        ? {
            success: true,
            ...(rawData !== undefined ? { data: rawData } : {}),
            ...(advisory ? { _advisory: advisory } : {}),
          }
        : {
            success: false,
            error: sanitizeAgentOutputText(result.error ?? 'Tool execution failed'),
            ...(advisory ? { advisory } : {}),
          };
      return JSON.stringify(payload);
    } catch (err) {
      if (isAgentYield(err)) throw err; // Let yields propagate
      if (this.isAbortError(err)) throw err;
      // Primary-only control-flow signals — propagate so PrimaryAgent.executeTool
      // override can dispatch into the coordinator/planner pipeline and inject
      // the result as the next ReAct observation.
      if (isDelegateToCoordinator(err)) throw err;
      if (isPlanAndExecute(err)) throw err;
      if (isExecuteSavedPlan(err)) throw err;
      if (isAgentDelegation(err)) {
        const delegationErr = err as AgentDelegationException;

        if (this.shouldBlockBrandMediaDelegation(delegationErr, currentMessages)) {
          return JSON.stringify({
            success: false,
            error:
              'Brand Coordinator must complete FFmpeg/media tasks directly. Delegation is blocked for this media request. Retry with ffmpeg_* tools, use stage_media if a source URL is inaccessible, or ask_user for one missing clip URL.',
          });
        }

        // ── Tier 2: Enrich delegation with source agent ID and prior work context ──
        // Append artifacts + tool summaries from current-turn messages so the
        // Planner can route without duplicating completed work.
        const priorWork = this.buildPriorWorkContext(currentMessages);
        throw new AgentDelegationException({
          ...delegationErr.payload,
          sourceAgent: this.id,
          forwardingIntent: priorWork
            ? `${delegationErr.payload.forwardingIntent}\n\n${priorWork}`
            : delegationErr.payload.forwardingIntent,
        });
      }
      if (operationMemory && sessionContext?.operationId) {
        operationMemory.logEvent(sessionContext.operationId, {
          agentId: this.id,
          toolName,
          input,
          outcome: 'failure',
        });
      }
      // Treat thrown tool errors as failures for stuck-loop tracking.
      const { advisory } = loopDetector.record(
        sessionContext?.operationId,
        toolName,
        toolCall.function.arguments,
        'failure'
      );
      return JSON.stringify({
        success: false,
        error: sanitizeAgentOutputText(
          err instanceof Error ? err.message : 'Tool execution failed'
        ),
        ...(advisory ? { advisory } : {}),
      });
    }
  }

  private async executeToolWithRetry(params: {
    registry: ToolRegistry;
    toolName: string;
    input: Record<string, unknown>;
    toolExecContext: ToolExecutionContext;
    signal?: AbortSignal;
    canRetry: boolean;
    operationId?: string;
  }): Promise<ToolResult> {
    const maxAttempts = params.canRetry ? TOOL_RETRY_MAX_ATTEMPTS : 1;
    let attempt = 1;

    while (attempt <= maxAttempts) {
      this.throwIfAborted(params.signal);
      try {
        const result = await params.registry.execute(
          params.toolName,
          params.input,
          params.toolExecContext
        );

        if (
          result.success ||
          !this.isTransientToolFailure(result.error) ||
          attempt >= maxAttempts
        ) {
          return result;
        }

        const delayMs = TOOL_RETRY_BASE_BACKOFF_MS * attempt;
        logger.warn(`[${this.id}] Retrying transient tool failure`, {
          agentId: this.id,
          operationId: params.operationId,
          tool: params.toolName,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          reason: result.error,
        });
        await this.delayWithAbort(delayMs, params.signal);
        attempt += 1;
      } catch (err) {
        if (this.isAbortError(err)) throw err;
        if (isAgentYield(err)) throw err;
        if (isAgentDelegation(err)) throw err;
        if (isDelegateToCoordinator(err)) throw err;
        if (isPlanAndExecute(err)) throw err;
        if (isExecuteSavedPlan(err)) throw err;

        if (!params.canRetry || !this.isTransientToolFailure(err) || attempt >= maxAttempts) {
          throw err;
        }

        const delayMs = TOOL_RETRY_BASE_BACKOFF_MS * attempt;
        logger.warn(`[${this.id}] Retrying transient thrown tool error`, {
          agentId: this.id,
          operationId: params.operationId,
          tool: params.toolName,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          error: err instanceof Error ? err.message : String(err),
        });
        await this.delayWithAbort(delayMs, params.signal);
        attempt += 1;
      }
    }

    return {
      success: false,
      error: 'Tool execution failed after retries.',
    };
  }

  private isTransientToolFailure(err: unknown): boolean {
    const text =
      typeof err === 'string'
        ? err
        : err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'error' in err
            ? String((err as { error?: unknown }).error ?? '')
            : '';

    const normalized = text.toLowerCase();
    if (!normalized) return false;

    return (
      normalized.includes('429') ||
      normalized.includes('rate limit') ||
      normalized.includes('timeout') ||
      normalized.includes('timed out') ||
      normalized.includes('econnreset') ||
      normalized.includes('econnaborted') ||
      normalized.includes('socket hang up') ||
      normalized.includes('503') ||
      normalized.includes('502') ||
      normalized.includes('504')
    );
  }

  private async delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        const abortError = new Error('Operation aborted');
        abortError.name = 'AbortError';
        reject(abortError);
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private isAbortError(err: unknown): err is Error {
    return err instanceof Error && err.name === 'AbortError';
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) return;
    const abortError = new Error('Operation aborted');
    abortError.name = 'AbortError';
    throw abortError;
  }

  protected resolveToolStepIcon(toolName: string, stage?: ToolStage): AgentXToolStepIcon {
    const normalized = `${toolName} ${stage ?? ''}`.toLowerCase();

    if (/(delete|remove|cancel)/.test(normalized)) return 'delete';
    if (/(upload|cdn|storage)/.test(normalized)) return 'upload';
    if (/(download|export)/.test(normalized)) return 'download';
    if (/(search|query|find|fetch)/.test(normalized)) return 'search';
    if (/(email|mail)/.test(normalized)) return 'email';
    if (/(video|image|graphic|media|chart|graph)/.test(normalized)) return 'media';
    if (/(database|firebase|mongo|memory)/.test(normalized)) return 'database';
    if (/(document|pdf|doc)/.test(normalized)) return 'document';
    if (/approval/.test(normalized)) return 'approval';

    return 'processing';
  }

  private humanizeToolName(toolName: string): string {
    const KNOWN_TOOLS: Record<string, string> = {
      // Firecrawl & Web
      firecrawl_agent_research: 'Conducting web research',
      firecrawl_search_web: 'Searching the web',
      extract_web_data: 'Extracting structured data',
      scrape_webpage: 'Reviewing web page',
      map_website: 'Mapping website structure',
      search_web: 'Searching the web',

      // Social & Intel
      scrape_instagram: 'Scanning Instagram',
      scrape_twitter: 'Scanning Twitter (X)',
      scrape_and_index_profile: 'Indexing profile data',
      update_intel: 'Updating intelligence file',
      write_intel: 'Writing intelligence report',

      // Memory
      search_memory: 'Recalling memory',
      search_memories: 'Reviewing saved notes',
      save_memory: 'Saving to memory',
      delete_memory: 'Updating memory records',
      ask_user: 'Requesting your input',

      // Database & Platform
      query_nxt1_data: 'Querying platform database',
      list_nxt1_data_views: 'Reviewing available data views',
      query_nxt1_platform_data: 'Querying platform database',
      get_user_profile: 'Reviewing athlete profile',
      get_recent_sync_summaries: 'Reviewing recent sync history',
      get_active_threads: 'Reviewing active conversations',
      get_other_thread_history: 'Reviewing related conversation history',
      search_colleges: 'Searching college database',
      search_college_coaches: 'Searching coaching staff',
      search_nxt1_platform: 'Searching platform registry',
      get_college_logos: 'Collecting college logos',
      get_conference_logos: 'Collecting conference logos',
      write_season_stats: 'Updating athletic stats',
      write_team_stats: 'Updating team statistics',
      write_roster_entries: 'Updating team roster',
      write_schedule: 'Updating season schedule',
      write_calendar_events: 'Updating calendar events',
      write_core_identity: 'Updating core athlete profile',
      write_combine_metrics: 'Updating combine metrics',
      write_rankings: 'Updating rankings data',
      write_recruiting_activity: 'Updating recruiting activity',
      write_connected_source: 'Linking connected source data',
      write_team_news: 'Publishing team news',
      write_team_post: 'Publishing team update',
      write_awards: 'Adding career awards',

      // Media & Video
      generate_graphic: 'Designing graphic',
      generate_chart_visualization: 'Generating chart visualization',
      runway_generate_video: 'Generating AI video',
      analyze_video: 'Analyzing game film',
      runway_upscale_video: 'Enhancing video quality',
      clip_video: 'Clipping video highlight',
      runway_edit_video: 'Editing video',
      runway_check_task: 'Checking video job status',
      import_video: 'Importing media',
      stage_media: 'Staging media',
      create_signed_url: 'Preparing secure upload link',
      delete_video: 'Removing video asset',
      generate_thumbnail: 'Generating thumbnail',
      write_athlete_videos: 'Updating video library',
      generate_captions: 'Transcribing audio/video',
      get_video_details: 'Reviewing video details',
      enable_download: 'Enabling downloads',
      manage_watermark: 'Updating watermark settings',
      // FFmpeg — Local video processing
      ffmpeg_trim_video: 'Trimming video',
      ffmpeg_merge_videos: 'Merging video clips',
      ffmpeg_resize_video: 'Resizing video',
      ffmpeg_add_text_overlay: 'Adding text overlay',
      ffmpeg_burn_subtitles: 'Burning subtitles into video',
      ffmpeg_generate_thumbnail: 'Generating video thumbnail',
      ffmpeg_convert_video: 'Converting video format',
      ffmpeg_compress_video: 'Compressing video',

      // Workspace & Documents — Google Docs
      docs_create_document: 'Drafting document',
      docs_append_text: 'Updating document',
      docs_prepend_text: 'Updating document',
      docs_insert_text: 'Inserting text into document',
      docs_insert_image: 'Inserting image into document',
      docs_batch_update: 'Updating document',
      docs_get_content_as_markdown: 'Reading document',
      docs_get_document_metadata: 'Reviewing document details',

      // Workspace & Documents — Google Sheets
      sheets_create_spreadsheet: 'Building spreadsheet',
      sheets_add_sheet: 'Adding sheet to spreadsheet',
      sheets_delete_sheet: 'Removing sheet from spreadsheet',
      sheets_read_range: 'Reading spreadsheet data',
      sheets_write_range: 'Updating spreadsheet',
      sheets_append_rows: 'Adding rows to spreadsheet',
      sheets_clear_range: 'Clearing spreadsheet range',

      // Workspace & Documents — Google Drive
      drive_create_folder: 'Creating folder',
      drive_delete_file: 'Deleting file',
      drive_list_shared_drives: 'Listing shared drives',
      drive_read_file_content: 'Reading file',
      drive_search_files: 'Searching files',
      drive_upload_file: 'Uploading file',

      // Workspace & Documents — Gmail
      gmail_send_email: 'Sending email',
      gmail_get_message_details: 'Reading email',
      gmail_reply_to_email: 'Replying to email',
      create_gmail_draft: 'Drafting email',
      query_gmail_emails: 'Checking inbox',

      // Workspace & Documents — Calendar
      create_calendar_event: 'Scheduling event',
      calendar_get_events: 'Checking calendar',
      calendar_get_event_details: 'Reviewing event details',
      delete_calendar_event: 'Removing calendar event',

      // Workspace & Documents — Presentations
      create_presentation: 'Creating presentation',
      create_presentation_from_markdown: 'Creating presentation',
      get_presentation: 'Reviewing presentation',
      get_slides: 'Reviewing slides',
      create_slide: 'Adding slide',
      delete_slide: 'Removing slide',
      duplicate_slide: 'Duplicating slide',
      add_text_to_slide: 'Adding text to slide',
      add_formatted_text_to_slide: 'Adding text to slide',
      add_bulleted_list_to_slide: 'Adding bullet list to slide',
      add_table_to_slide: 'Adding table to slide',
      add_slide_notes: 'Adding slide notes',

      // Workspace & Documents — Support
      create_support_ticket: 'Creating support ticket',
      list_google_workspace_tools: 'Checking Google Workspace tools',
      run_google_workspace_tool: 'Using Google Workspace',
      list_microsoft_365_tools: 'Checking Microsoft 365 tools',
      run_microsoft_365_tool: 'Using Microsoft 365',

      // Automation
      schedule_recurring_task: 'Scheduling automation',
      update_recurring_task: 'Updating scheduled automation',
      list_recurring_tasks: 'Reviewing scheduled automations',
      cancel_recurring_task: 'Cancelling scheduled automation',
      call_apify_actor: 'Running cloud automation',
      search_apify_actors: 'Finding automation templates',
      get_apify_actor_details: 'Reviewing automation details',
      get_apify_actor_output: 'Reviewing automation results',
      create_plan: 'Drafting execution plan',
      execute_saved_plan: 'Executing approved plan',
      plan_and_execute: 'Drafting execution plan',
      delegate_to_coordinator: 'Routing to specialist coordinator',
      discover_analytics_templates: 'Reviewing analytics templates',
      register_analytics_template: 'Saving analytics template',
      read_distilled_section: 'Reviewing distilled insights',
      dispatch_extraction: 'Launching data extraction',
      track_analytics_event: 'Recording analytics event',
      get_analytics_summary: 'Reviewing analytics summary',
      whoami_capabilities: 'Checking current capabilities',
      delegate_task: 'Delegating to specialized agent',

      // Live Browser
      open_live_view: 'Opening virtual browser',
      read_live_view: 'Scanning virtual browser',
      capture_live_view_screenshot: 'Capturing browser screenshot',
      extract_live_view_media: 'Extracting media stream',
      navigate_live_view: 'Navigating webpage',
      interact_with_live_view: 'Interacting with webpage',
      close_live_view: 'Closing virtual browser',

      // Comms
      scan_timeline_posts: 'Scanning recent posts',
      write_timeline_post: 'Drafting new post',
      send_email: 'Sending email',
      batch_send_email: 'Sending email campaign',
      dynamic_export: 'Generating data export',
    };

    if (KNOWN_TOOLS[toolName]) return KNOWN_TOOLS[toolName];

    // Fallback for unknown tools
    return toolName
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  }

  /**
   * On-Demand Media Recall: If the user's intent references prior media
   * ("that video", "the image I sent", "earlier clip", etc.), scans the
   * conversation history for [Attached video/file: ...] annotations and
   * injects a synthetic system message listing the URLs immediately before
   * the current user message. This gives the agent direct URL access so it
   * can call analyze_video or vision tools without asking for re-upload.
   * Zero AI cost — pure regex scan of existing message text.
   */
  private injectPriorMediaContext(messages: LLMMessage[], intent: string): void {
    if (!PRIOR_MEDIA_RECALL_PATTERN.test(intent)) {
      return;
    }

    type MediaCandidate = {
      name: string;
      url: string;
      cloudflareVideoId?: string;
      type: 'video' | 'file';
    };
    const candidates: MediaCandidate[] = [];

    // Scan history messages — skip index 0 (system prompt) and last (current user intent)
    for (let i = 1; i < messages.length - 1; i++) {
      const msg = messages[i];
      if (msg.role !== 'user') continue;

      const text =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? (msg.content as Array<{ type: string; text?: string }>)
                .filter((p) => p.type === 'text')
                .map((p) => p.text ?? '')
                .join(' ')
            : '';

      const annotationRe = /\[Attached (video|file|document): ([^\]]+)\]/g;
      let match: RegExpExecArray | null;
      while ((match = annotationRe.exec(text)) !== null) {
        const attachType = match[1] === 'video' ? ('video' as const) : ('file' as const);
        const raw = match[2];

        const dashIdx = raw.indexOf(' \u2014 ');
        if (dashIdx === -1) continue;

        // File annotations include "(mimeType)" in the name — strip it
        const name = raw
          .slice(0, dashIdx)
          .trim()
          .replace(/\s*\([^)]+\)\s*$/, '');
        const rest = raw.slice(dashIdx + 3).trim();

        const pipeIdx = rest.indexOf(' | cloudflareVideoId: ');
        const url = (pipeIdx !== -1 ? rest.slice(0, pipeIdx) : rest).trim();
        const cloudflareVideoId =
          pipeIdx !== -1 ? rest.slice(pipeIdx + ' | cloudflareVideoId: '.length).trim() : undefined;

        if (url) {
          candidates.push({ name, url, cloudflareVideoId, type: attachType });
        }
      }
    }

    if (candidates.length === 0) return;

    // Keep up to 3 most recent (array is in chronological order)
    const recent = candidates.slice(-3);

    const lines = [
      '[Prior Media in This Conversation]',
      'The following media was shared earlier. If the user is referencing one of these,',
      'use the URL directly with the appropriate tool (analyze_video for videos;',
      'vision analysis for images). Do NOT ask the user to re-upload.',
      '',
      ...recent.map((c, idx) => {
        const idNote = c.cloudflareVideoId ? ` | cloudflareVideoId: ${c.cloudflareVideoId}` : '';
        const typeLabel = c.type === 'video' ? '[Video]' : '[File]';
        return `${idx + 1}. ${typeLabel} "${c.name}" — ${c.url}${idNote}`;
      }),
    ];

    // Insert as a system message immediately before the final user message
    messages.splice(messages.length - 1, 0, {
      role: 'system',
      content: lines.join('\n'),
    });

    logger.info(`[${this.id}] Injected prior media context for on-demand recall`, {
      agentId: this.id,
      candidateCount: recent.length,
      names: recent.map((c) => c.name),
    });
  }

  /**
   * Smart Artifact Chaining: Auto-inject mediaArtifact from extraction results
   * into downstream tool calls like analyze_video.
   *
   * Three-pass lookup (Tier 1 + Tier 3):
   *  1. Current-turn messages[] — fastest, covers same-iteration extractions.
   *  2. context.conversationHistory — cross-turn; catches artifacts from a prior
   *     turn or from the Primary agent before delegation (Tier 1 cross-turn fix).
   *  3. artifactLedger — in-memory ledger that survives context-window pruning;
   *     last-resort fallback when both message arrays have been evicted (Tier 3).
   */
  protected augmentToolCallWithArtifact(
    toolCall: LLMToolCall,
    messages: readonly LLMMessage[],
    context?: AgentSessionContext,
    artifactLedger?: ReadonlyArray<ArtifactLedgerEntry>
  ): LLMToolCall {
    const mediaAugmentableTools = new Set([
      'generate_graphic',
      'runway_generate_video',
      'runway_edit_video',
      'ffmpeg_trim_video',
      'ffmpeg_merge_videos',
      'ffmpeg_resize_video',
      'ffmpeg_add_text_overlay',
      'ffmpeg_burn_subtitles',
      'ffmpeg_generate_thumbnail',
      'ffmpeg_convert_video',
      'ffmpeg_compress_video',
    ]);

    if (
      toolCall.function.name !== 'analyze_video' &&
      !mediaAugmentableTools.has(toolCall.function.name)
    ) {
      return toolCall;
    }

    let input: Record<string, unknown>;
    try {
      input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
    } catch {
      return toolCall;
    }

    // analyze_video keeps the strict artifact-only augmentation path.
    if (toolCall.function.name === 'analyze_video' && input['artifact'] !== undefined) {
      return toolCall;
    }

    if (toolCall.function.name === 'generate_graphic') {
      const readStringArray = (value: unknown): string[] =>
        Array.isArray(value)
          ? value
              .filter(
                (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
              )
              .map((entry) => entry.trim())
          : [];

      const asObject = (value: unknown): Record<string, unknown> | null =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;

      const isLikelyUrl = (value: string): boolean => /^https?:\/\//i.test(value);
      const dedupeUrls = (urls: readonly string[]): string[] => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const url of urls) {
          if (!isLikelyUrl(url)) continue;
          if (seen.has(url)) continue;
          seen.add(url);
          out.push(url);
        }
        return out;
      };

      const hasSubjectPhotos = readStringArray(input['subjectPhotoUrls']).length > 0;
      const hasLogoUrls = readStringArray(input['logoUrls']).length > 0;
      const hasVideoSourceUrls = readStringArray(input['videoSourceUrls']).length > 0;

      const aggregate = {
        subjectPhotoUrls: [] as string[],
        logoUrls: [] as string[],
        videoSourceUrls: [] as string[],
        sources: [] as string[],
      };

      const collectFromData = (data: Record<string, unknown>, source: string): void => {
        const containers: Record<string, unknown>[] = [data];
        const items = Array.isArray(data['items'])
          ? data['items'].filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object' && !Array.isArray(item)
            )
          : [];
        containers.push(...items.slice(0, 5));

        const colleges = Array.isArray(data['colleges'])
          ? data['colleges'].filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object' && !Array.isArray(item)
            )
          : [];
        containers.push(...colleges.slice(0, 5));

        const conferences = Array.isArray(data['conferences'])
          ? data['conferences'].filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object' && !Array.isArray(item)
            )
          : [];
        containers.push(...conferences.slice(0, 5));

        for (const entry of containers) {
          const logoUrl = typeof entry['logoUrl'] === 'string' ? entry['logoUrl'].trim() : '';
          if (logoUrl) {
            aggregate.logoUrls.push(logoUrl);
            aggregate.sources.push(`${source}:logoUrl`);
          }

          const imageUrl = typeof entry['imageUrl'] === 'string' ? entry['imageUrl'].trim() : '';
          if (imageUrl) {
            aggregate.subjectPhotoUrls.push(imageUrl);
            aggregate.sources.push(`${source}:imageUrl`);
          }

          const profileImgs = readStringArray(entry['profileImgs']);
          if (profileImgs.length > 0) {
            aggregate.subjectPhotoUrls.push(...profileImgs);
            aggregate.sources.push(`${source}:profileImgs`);
          }

          const galleryImages = readStringArray(entry['galleryImages']);
          if (galleryImages.length > 0) {
            aggregate.subjectPhotoUrls.push(...galleryImages);
            aggregate.sources.push(`${source}:galleryImages`);
          }

          const images = readStringArray(entry['images']);
          if (images.length > 0) {
            aggregate.subjectPhotoUrls.push(...images);
            aggregate.sources.push(`${source}:images`);
          }

          const videoUrl = typeof entry['videoUrl'] === 'string' ? entry['videoUrl'].trim() : '';
          if (videoUrl) {
            aggregate.videoSourceUrls.push(videoUrl);
            aggregate.sources.push(`${source}:videoUrl`);
          }

          const mediaUrls = readStringArray(entry['mediaUrls']);
          if (mediaUrls.length > 0) {
            aggregate.videoSourceUrls.push(...mediaUrls);
            aggregate.sources.push(`${source}:mediaUrls`);
          }

          const persistedMediaUrls = readStringArray(entry['persistedMediaUrls']);
          if (persistedMediaUrls.length > 0) {
            aggregate.videoSourceUrls.push(...persistedMediaUrls);
            aggregate.sources.push(`${source}:persistedMediaUrls`);
          }
        }
      };

      const collectFromText = (text: string, source: string): void => {
        if (!text.trim()) return;
        const urlRegex = /https?:\/\/[^\s)\]"]+ /gi;
        const lines = text.split(/\r?\n/);
        let match: RegExpExecArray | null;
        while ((match = urlRegex.exec(text)) !== null) {
          const url = match[0]?.trim();
          if (!url) continue;

          const index = match.index ?? 0;
          const line =
            lines.find((candidate) => {
              const lineStart = text.indexOf(candidate);
              const lineEnd = lineStart + candidate.length;
              return index >= lineStart && index <= lineEnd;
            }) ?? '';
          const nearby = line.toLowerCase();

          if (/\b(logo|badge|crest|emblem)\b/.test(nearby)) {
            aggregate.logoUrls.push(url);
            aggregate.sources.push(`${source}:text_logo`);
            continue;
          }

          if (/\b(video|film|clip|reel|highlight|hudl|youtube|vimeo|mp4|mov|m3u8)\b/.test(nearby)) {
            aggregate.videoSourceUrls.push(url);
            aggregate.sources.push(`${source}:text_video`);
            continue;
          }

          if (/\b(photo|image|pic|picture|portrait|athlete|subject)\b/.test(nearby)) {
            aggregate.subjectPhotoUrls.push(url);
            aggregate.sources.push(`${source}:text_photo`);
            continue;
          }

          if (/\.(mp4|mov|m3u8|webm)(\?|$)/i.test(url)) {
            aggregate.videoSourceUrls.push(url);
            aggregate.sources.push(`${source}:ext_video`);
            continue;
          }

          if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url)) {
            aggregate.subjectPhotoUrls.push(url);
            aggregate.sources.push(`${source}:ext_image`);
          }
        }
      };

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role !== 'tool' || typeof msg.content !== 'string') continue;
        try {
          const result = JSON.parse(msg.content) as Record<string, unknown>;
          if (result['success'] !== true) continue;
          const data = asObject(result['data']);
          if (!data) continue;
          collectFromData(data, 'current_messages');
        } catch {
          continue;
        }
      }

      if (context?.conversationHistory?.length) {
        for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
          const msg = context.conversationHistory[i];
          if (msg.role !== 'tool' || typeof msg.content !== 'string') continue;
          try {
            const result = JSON.parse(msg.content) as Record<string, unknown>;
            if (result['success'] !== true) continue;
            const data = asObject(result['data']);
            if (!data) continue;
            collectFromData(data, 'conversation_history');
          } catch {
            continue;
          }
        }
      }

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (typeof msg.content !== 'string') continue;
        collectFromText(msg.content, 'messages_text');
      }

      if (context?.conversationHistory?.length) {
        for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
          const msg = context.conversationHistory[i];
          if (typeof msg.content !== 'string') continue;
          collectFromText(msg.content, 'conversation_text');
        }
      }

      const contextRecord = context as unknown as Record<string, unknown>;
      const contextLogoCandidates = [
        contextRecord['teamLogoUrl'],
        contextRecord['logoUrl'],
        contextRecord['organizationLogoUrl'],
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim());
      if (contextLogoCandidates.length > 0) {
        aggregate.logoUrls.push(...contextLogoCandidates);
        aggregate.sources.push('session_context:logo');
      }

      const contextPhotoCandidates = [
        contextRecord['subjectImageUrl'],
        contextRecord['profileImageUrl'],
        contextRecord['imageUrl'],
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim());
      if (contextPhotoCandidates.length > 0) {
        aggregate.subjectPhotoUrls.push(...contextPhotoCandidates);
        aggregate.sources.push('session_context:photo');
      }

      const contextProfileImgs = readStringArray(contextRecord['profileImgs']);
      if (contextProfileImgs.length > 0) {
        aggregate.subjectPhotoUrls.push(...contextProfileImgs);
        aggregate.sources.push('session_context:profileImgs');
      }

      const contextVideoCandidates = [contextRecord['videoUrl'], contextRecord['sourceVideoUrl']]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim());
      if (contextVideoCandidates.length > 0) {
        aggregate.videoSourceUrls.push(...contextVideoCandidates);
        aggregate.sources.push('session_context:video');
      }

      if (artifactLedger?.length) {
        for (let i = artifactLedger.length - 1; i >= 0; i--) {
          const entry = artifactLedger[i];
          collectFromData(entry.artifacts, `artifact_ledger:${entry.toolName}`);
        }
      }

      const dedupedSubjectPhotos = dedupeUrls(aggregate.subjectPhotoUrls).slice(0, 5);
      const dedupedLogos = dedupeUrls(aggregate.logoUrls).slice(0, 3);
      const dedupedVideos = dedupeUrls(aggregate.videoSourceUrls).slice(0, 3);
      const dedupedSources = [...new Set(aggregate.sources)].slice(0, 12);

      const augmentedInput: Record<string, unknown> = { ...input };
      let injectedAny = false;

      if (!hasSubjectPhotos && dedupedSubjectPhotos.length > 0) {
        augmentedInput['subjectPhotoUrls'] = dedupedSubjectPhotos;
        injectedAny = true;
      }

      if (!hasLogoUrls && dedupedLogos.length > 0) {
        augmentedInput['logoUrls'] = dedupedLogos;
        injectedAny = true;
      }

      if (!hasVideoSourceUrls && dedupedVideos.length > 0) {
        augmentedInput['videoSourceUrls'] = dedupedVideos;
        injectedAny = true;
      }

      if (injectedAny) {
        if (!Array.isArray(augmentedInput['autoRetrievedSources']) && dedupedSources.length > 0) {
          augmentedInput['autoRetrievedSources'] = dedupedSources;
        }
        if (augmentedInput['assetSelectionApproved'] === undefined) {
          augmentedInput['assetSelectionApproved'] = false;
        }
        if (augmentedInput['applyMode'] === undefined) {
          const modeHasSubject =
            Array.isArray(augmentedInput['subjectPhotoUrls']) &&
            (augmentedInput['subjectPhotoUrls'] as unknown[]).length > 0;
          const modeHasLogo =
            Array.isArray(augmentedInput['logoUrls']) &&
            (augmentedInput['logoUrls'] as unknown[]).length > 0;
          augmentedInput['applyMode'] =
            modeHasSubject && modeHasLogo
              ? 'mixed'
              : modeHasSubject
                ? 'photo_lock'
                : modeHasLogo
                  ? 'logo_overlay'
                  : 'style_only';
        }
      } else {
        return toolCall;
      }

      logger.info('[BaseAgent] Augmented generate_graphic with retrieved artifacts', {
        agentId: this.id,
        injectedSubjectPhotos: !hasSubjectPhotos && dedupedSubjectPhotos.length > 0,
        injectedLogos: !hasLogoUrls && dedupedLogos.length > 0,
        injectedVideos: !hasVideoSourceUrls && dedupedVideos.length > 0,
        sourceCount: dedupedSources.length,
      });

      return {
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: JSON.stringify(augmentedInput),
        },
      };
    }

    if (mediaAugmentableTools.has(toolCall.function.name)) {
      const readStringArray = (value: unknown): string[] =>
        Array.isArray(value)
          ? value
              .filter(
                (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
              )
              .map((entry) => entry.trim())
          : [];

      const isLikelyUrl = (value: string): boolean => /^https?:\/\//i.test(value);
      const asObject = (value: unknown): Record<string, unknown> | null =>
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : null;

      const videoCandidates: string[] = [];
      const imageCandidates: string[] = [];

      const collectFromData = (data: Record<string, unknown>): void => {
        const items = Array.isArray(data['items'])
          ? data['items'].filter(
              (item): item is Record<string, unknown> =>
                !!item && typeof item === 'object' && !Array.isArray(item)
            )
          : [];

        const containers = [data, ...items.slice(0, 8)];
        for (const entry of containers) {
          const videoUrl = typeof entry['videoUrl'] === 'string' ? entry['videoUrl'].trim() : '';
          const outputUrl = typeof entry['outputUrl'] === 'string' ? entry['outputUrl'].trim() : '';
          const imageUrl = typeof entry['imageUrl'] === 'string' ? entry['imageUrl'].trim() : '';
          const profileImgs = readStringArray(entry['profileImgs']);
          const galleryImages = readStringArray(entry['galleryImages']);
          const images = readStringArray(entry['images']);

          if (videoUrl) videoCandidates.push(videoUrl);
          if (outputUrl && /\.(mp4|mov|m3u8|webm)(\?|$)/i.test(outputUrl))
            videoCandidates.push(outputUrl);
          if (imageUrl) imageCandidates.push(imageUrl);
          imageCandidates.push(...profileImgs, ...galleryImages, ...images);

          const mediaUrls = readStringArray(entry['mediaUrls']);
          const persistedMediaUrls = readStringArray(entry['persistedMediaUrls']);
          videoCandidates.push(...mediaUrls, ...persistedMediaUrls);
        }
      };

      const collectFromText = (text: string): void => {
        const urlRegex = /https?:\/\/[^\s)\]"]+ /gi;
        let match: RegExpExecArray | null;
        while ((match = urlRegex.exec(text)) !== null) {
          const url = (match[0] ?? '').trim();
          if (!url || !isLikelyUrl(url)) continue;
          if (
            /\.(mp4|mov|m3u8|webm)(\?|$)/i.test(url) ||
            /\b(video|clip|film|reel|hudl)\b/i.test(text)
          ) {
            videoCandidates.push(url);
          } else if (/\.(png|jpg|jpeg|webp|gif)(\?|$)/i.test(url)) {
            imageCandidates.push(url);
          }
        }
      };

      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (typeof msg.content === 'string') collectFromText(msg.content);
        if (msg.role === 'tool' && typeof msg.content === 'string') {
          try {
            const result = JSON.parse(msg.content) as Record<string, unknown>;
            if (result['success'] !== true) continue;
            const data = asObject(result['data']);
            if (data) collectFromData(data);
          } catch {
            continue;
          }
        }
      }

      if (context?.conversationHistory?.length) {
        for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
          const msg = context.conversationHistory[i];
          if (typeof msg.content === 'string') collectFromText(msg.content);
          if (msg.role === 'tool' && typeof msg.content === 'string') {
            try {
              const result = JSON.parse(msg.content) as Record<string, unknown>;
              if (result['success'] !== true) continue;
              const data = asObject(result['data']);
              if (data) collectFromData(data);
            } catch {
              continue;
            }
          }
        }
      }

      if (artifactLedger?.length) {
        for (let i = artifactLedger.length - 1; i >= 0; i--) {
          collectFromData(artifactLedger[i].artifacts);
        }
      }

      const dedupe = (urls: readonly string[]): string[] => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const url of urls) {
          if (!isLikelyUrl(url)) continue;
          if (seen.has(url)) continue;
          seen.add(url);
          out.push(url);
        }
        return out;
      };

      const videos = dedupe(videoCandidates);
      const images = dedupe(imageCandidates);
      const augmentedInput: Record<string, unknown> = { ...input };
      let injected = false;

      if (toolCall.function.name === 'runway_generate_video') {
        if (typeof augmentedInput['promptImage'] !== 'string' && images.length > 0) {
          augmentedInput['promptImage'] = images[0];
          injected = true;
        }
      } else if (toolCall.function.name === 'runway_edit_video') {
        if (typeof augmentedInput['video'] !== 'string' && videos.length > 0) {
          augmentedInput['video'] = videos[0];
          injected = true;
        }
        if (typeof augmentedInput['promptImage'] !== 'string' && images.length > 0) {
          augmentedInput['promptImage'] = images[0];
          injected = true;
        }
      } else if (toolCall.function.name === 'ffmpeg_merge_videos') {
        const existing = Array.isArray(augmentedInput['inputPaths'])
          ? (augmentedInput['inputPaths'] as unknown[]).filter(
              (v): v is string => typeof v === 'string' && v.trim().length > 0
            )
          : [];
        if (existing.length === 0 && videos.length >= 2) {
          augmentedInput['inputPaths'] = videos.slice(0, 4);
          injected = true;
        }
      } else {
        if (typeof augmentedInput['inputPath'] !== 'string' && videos.length > 0) {
          augmentedInput['inputPath'] = videos[0];
          injected = true;
        }
      }

      if (!injected) {
        return toolCall;
      }

      logger.info('[BaseAgent] Augmented media tool with retrieved URLs', {
        agentId: this.id,
        toolName: toolCall.function.name,
        injected,
        videoCandidates: videos.length,
        imageCandidates: images.length,
      });

      return {
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: JSON.stringify(augmentedInput),
        },
      };
    }

    // ── Pass 1: Scan current-turn messages ──
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        try {
          const result = JSON.parse(msg.content) as Record<string, unknown>;
          if (result['success'] === true && result['data'] && typeof result['data'] === 'object') {
            const data = result['data'] as Record<string, unknown>;
            if (data['mediaArtifact'] !== undefined) {
              const augmentedInput = {
                ...input,
                artifact: data['mediaArtifact'],
              };
              logger.info('[BaseAgent] Auto-injected mediaArtifact into analyze_video', {
                agentId: this.id,
                hadArtifact: false,
                source: 'current_messages',
                foundFrom: msg.tool_call_id ?? 'unknown_prior_tool',
              });
              return {
                ...toolCall,
                function: {
                  ...toolCall.function,
                  arguments: JSON.stringify(augmentedInput),
                },
              };
            }
          }
        } catch {
          continue;
        }
      }
    }

    // ── Pass 2: Scan context.conversationHistory (cross-turn) ──
    // Catches mediaArtifacts produced in prior turns or by the Primary agent
    // before it delegated to this coordinator.
    if (context?.conversationHistory?.length) {
      for (let i = context.conversationHistory.length - 1; i >= 0; i--) {
        const msg = context.conversationHistory[i];
        if (msg.role === 'tool' && typeof msg.content === 'string') {
          try {
            const result = JSON.parse(msg.content) as Record<string, unknown>;
            if (
              result['success'] === true &&
              result['data'] &&
              typeof result['data'] === 'object'
            ) {
              const data = result['data'] as Record<string, unknown>;
              if (data['mediaArtifact'] !== undefined) {
                const augmentedInput = { ...input, artifact: data['mediaArtifact'] };
                logger.info(
                  '[BaseAgent] Auto-injected mediaArtifact into analyze_video from conversationHistory',
                  { agentId: this.id, source: 'conversationHistory' }
                );
                return {
                  ...toolCall,
                  function: { ...toolCall.function, arguments: JSON.stringify(augmentedInput) },
                };
              }
            }
          } catch {
            continue;
          }
        }
      }
    }

    // ── Pass 3: Check the artifact ledger (survives context pruning) ──
    // If both message scans miss the artifact because of pruning, fall back
    // to the in-memory ledger which tracks all artifacts emitted this session.
    if (artifactLedger?.length) {
      for (let i = artifactLedger.length - 1; i >= 0; i--) {
        const entry = artifactLedger[i];
        if (entry.artifacts['mediaArtifact'] !== undefined) {
          const augmentedInput = { ...input, artifact: entry.artifacts['mediaArtifact'] };
          logger.info(
            '[BaseAgent] Auto-injected mediaArtifact into analyze_video from artifactLedger',
            { agentId: this.id, source: 'artifactLedger', toolName: entry.toolName }
          );
          return {
            ...toolCall,
            function: { ...toolCall.function, arguments: JSON.stringify(augmentedInput) },
          };
        }
      }
    }

    // No mediaArtifact found in any source; return unchanged
    return toolCall;
  }

  /**
   * Tier 2: Build a summary of prior work done by this agent in the current turn.
   * Appended to `forwardingIntent` when throwing AgentDelegationException so the
   * Planner can route without re-executing already-completed tool calls.
   */
  private buildPriorWorkContext(messages?: readonly LLMMessage[]): string | null {
    if (!messages?.length) return null;
    const toolsExecuted: string[] = [];
    const artifacts: Record<string, unknown> = {};
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          toolsExecuted.push(tc.function.name);
        }
      }
      if (msg.role === 'tool' && typeof msg.content === 'string') {
        try {
          const parsed = JSON.parse(msg.content) as Record<string, unknown>;
          if (
            parsed['success'] === true &&
            typeof parsed['data'] === 'object' &&
            parsed['data'] !== null
          ) {
            const data = parsed['data'] as Record<string, unknown>;
            for (const key of ARTIFACT_KEYS) {
              if (data[key] !== undefined) artifacts[key] = data[key];
            }
            if (data['mediaArtifact'] !== undefined)
              artifacts['mediaArtifact'] = data['mediaArtifact'];
          }
        } catch {
          /* skip unparseable */
        }
      }
    }
    const parts: string[] = [];
    const uniqueTools = [...new Set(toolsExecuted)];
    if (uniqueTools.length > 0) {
      parts.push(`[Prior Work from ${this.id}] Tools already executed: ${uniqueTools.join(', ')}`);
    }
    if (Object.keys(artifacts).length > 0) {
      parts.push(`[Prior Artifacts from ${this.id}]: ${JSON.stringify(artifacts).slice(0, 500)}`);
    }
    return parts.length > 0 ? parts.join('\n') : null;
  }

  private shouldBlockBrandMediaDelegation(
    delegation: AgentDelegationException,
    messages?: readonly LLMMessage[]
  ): boolean {
    if (this.id !== 'brand_coordinator') return false;

    const candidates: string[] = [delegation.payload.forwardingIntent];

    if (delegation.payload.structuredPayload) {
      candidates.push(JSON.stringify(delegation.payload.structuredPayload));
    }

    if (messages?.length) {
      for (const message of messages) {
        if (typeof message.content === 'string') {
          candidates.push(message.content);
        }

        if (message.role === 'assistant' && message.tool_calls?.length) {
          for (const toolCall of message.tool_calls) {
            candidates.push(toolCall.function.name);
            candidates.push(toolCall.function.arguments);
          }
        }
      }
    }

    return BRAND_MEDIA_DELEGATION_PATTERN.test(candidates.join('\n'));
  }

  protected resolveToolInvocationLabel(
    toolName: string,
    inputOrArgs?: Record<string, unknown> | string
  ): string {
    const baseLabel = this.humanizeToolName(toolName);
    if (
      toolName === 'scrape_webpage' ||
      toolName === 'ffmpeg_trim_video' ||
      toolName === 'ffmpeg_merge_videos' ||
      toolName === 'write_intel'
    ) {
      return baseLabel;
    }
    const descriptor = this.resolveToolInvocationDescriptor(inputOrArgs);
    return descriptor ? `${baseLabel}: ${descriptor}` : baseLabel;
  }

  private resolveToolInvocationDescriptor(
    inputOrArgs?: Record<string, unknown> | string
  ): string | null {
    let input: Record<string, unknown> | null = null;

    if (typeof inputOrArgs === 'string') {
      input = this.parseToolCallInput(inputOrArgs);
      if (!input) return null;
    } else if (inputOrArgs && typeof inputOrArgs === 'object' && !Array.isArray(inputOrArgs)) {
      input = inputOrArgs;
    }

    if (!input) return null;

    // Humanize coordinator/coordinatorId before it falls into the generic loop which
    // would expose raw snake_case identifiers like "brand_coordinator".
    // The delegate_to_coordinator tool schema uses "coordinator"; the exception
    // payload uses "coordinatorId" — handle both.
    const coordinatorId = input['coordinator'] ?? input['coordinatorId'];
    if (typeof coordinatorId === 'string' && coordinatorId.trim().length > 0) {
      const COORDINATOR_LABELS: Record<string, string> = {
        brand_coordinator: 'Brand & Media Coordinator',
        recruiting_coordinator: 'Recruiting Coordinator',
        performance_coordinator: 'Performance Coordinator',
        strategy_coordinator: 'Strategy Coordinator',
      };
      return (
        COORDINATOR_LABELS[coordinatorId.trim()] ??
        coordinatorId
          .replace(/_coordinator$/i, ' Coordinator')
          .replace(/[_-]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim()
      );
    }

    const rawToolName = input['toolName'];
    if (typeof rawToolName === 'string' && rawToolName.trim().length > 0) {
      const humanizedToolName = this.resolveMcpToolDisplayName(rawToolName);
      if (humanizedToolName) return humanizedToolName;
    }

    // Translate internal view names (e.g. team_timeline_feed) to friendly labels.
    // Must come before the generic key loop so the raw snake_case name is never shown.
    const viewName = input['view'];
    if (typeof viewName === 'string' && viewName.trim().length > 0) {
      const VIEW_LABELS: Record<string, string> = {
        user_profile_snapshot: 'athlete profile',
        user_timeline_feed: 'activity feed',
        user_schedule_events: 'schedule',
        user_recruiting_status: 'recruiting status',
        user_season_stats: 'season stats',
        user_physical_metrics: 'physical metrics',
        user_team_membership: 'team membership',
        user_highlight_videos: 'highlight videos',
        user_active_goals: 'active goals',
        user_goal_history: 'goal history',
        user_current_playbook: 'current playbook',
        team_profile_snapshot: 'team profile',
        team_roster_members: 'team roster',
        team_timeline_feed: 'team feed',
        team_highlight_videos: 'team highlights',
        organization_profile_snapshot: 'organization profile',
        organization_roster_members: 'organization roster',
        organization_highlight_videos: 'organization highlights',
      };
      return VIEW_LABELS[viewName.trim()] ?? null;
    }

    const draftPostDescriptor = this.resolveDraftPostDescriptor(input);
    if (draftPostDescriptor) return draftPostDescriptor;

    const playbookDescriptor = this.resolvePlaybookDescriptor(input['playbookId']);
    if (playbookDescriptor) return playbookDescriptor;

    const gamePlanDescriptor = this.resolveGamePlanDescriptor(input['gamePlanId']);
    if (gamePlanDescriptor) return gamePlanDescriptor;

    const filmReviewDescriptor = this.resolveFilmReviewDescriptor(input['filmReviewId']);
    if (filmReviewDescriptor) return filmReviewDescriptor;

    const priorityKeys = [
      'actionSummary',
      'programName',
      'schoolName',
      'collegeName',
      'teamName',
      'organizationName',
      'school',
      'query',
      'url',
      'hostname',
      'name',
      'title',
      'profileName',
      'personName',
    ] as const;

    for (const key of priorityKeys) {
      const candidate = this.formatToolInvocationValue(input[key]);
      if (candidate) return candidate;
    }

    // Suppress technical IDs (like videoId, operationId, etc.) from user-facing progress labels
    for (const [key, value] of Object.entries(input)) {
      // Hide any field that looks like a technical ID or code
      if (!this.isMeaningfulInvocationKey(key)) continue;
      if (/id$/i.test(key) && typeof value === 'string' && /^[a-f0-9]{8,}$/.test(value)) {
        // Looks like a raw ID, skip
        continue;
      }
      if (/code$/i.test(key) && typeof value === 'string' && /^[A-Z0-9]{6,}$/.test(value)) {
        // Looks like a code, skip
        continue;
      }
      const candidate = this.formatToolInvocationValue(value);
      if (candidate) return candidate;
    }

    return null;
  }

  private resolveMcpToolDisplayName(toolName: string): string | null {
    const normalized = toolName.trim();
    if (!normalized) return null;

    const KNOWN_MCP_TOOLS: Record<string, string> = {
      'list-emails': 'mail list',
      'read-email': 'email details',
      'search-emails': 'mail search',
      'send-email': 'email send',
      'draft-email': 'email draft',
      'list-calendar-events': 'calendar events',
      'create-calendar-event': 'new calendar event',
      'list-files': 'file list',
      'search-files': 'file search',
      'get-file': 'file details',
    };

    const known = KNOWN_MCP_TOOLS[normalized.toLowerCase()];
    if (known) return known;

    return normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private isMeaningfulInvocationKey(key: string): boolean {
    return ![
      'page',
      'limit',
      'offset',
      'cursor',
      'count',
      'ids',
      'include',
      'sort',
      'order',
      'filters',
      'options',
      'metadata',
      'userId',
      'threadId',
      'operationId',
      // Recurring automation internals; never user-facing in progress labels.
      'key',
      'recurringTaskKey',
      'repeatableKey',
      'cronExpression',
      'timezone',
      // Technical identifiers that expose raw snake_case or internal IDs
      'agentId',
      'actorId',
      'teamId',
      'teamCode',
      'coordinator',
      'coordinatorId',
      'sectionId',
      'templateId',
      'viewId',
      'taskId',
      'planId',
      'playbookId',
      'parentOperationId',
      'parentThreadId',
      'sessionId',
      'filmReviewId',
      'type',
      'status',
      'format',
      'role',
      'context',
      // Data view names are handled explicitly above with friendly labels;
      // block here to prevent raw snake_case fallback (e.g. team_timeline_feed).
      'view',
    ].includes(key);
  }

  private resolvePlaybookDescriptor(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim();
    if (!normalized) return null;

    const aliasParts = normalized
      .split('_')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (aliasParts.length >= 3) {
      const name = aliasParts.slice(2).join(' ');
      const humanizedName = name.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
      return humanizedName ? humanizedName.replace(/\b\w/g, (char) => char.toUpperCase()) : null;
    }

    if (/^[A-Za-z0-9]{12,}$/.test(normalized)) {
      return null;
    }

    return this.formatToolInvocationValue(normalized.replace(/[-_]+/g, ' '));
  }

  private resolveGamePlanDescriptor(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim();
    if (!normalized) return null;

    const parts = normalized
      .split('_')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // Common persisted format:
    //   <opaque-id>_<sport-or-team>_<phase>_<YYYY-MM-DD>_<opponent-slug>
    // We hide the opaque prefix and produce a user-facing descriptor.
    if (parts.length >= 5) {
      const phaseRaw = parts.at(-3) ?? '';
      const dateRaw = parts.at(-2) ?? '';
      const opponentRaw = parts.at(-1) ?? '';

      const phase = phaseRaw
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

      const opponent = opponentRaw
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());

      const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw);
      const detailParts = [phase, hasDate ? dateRaw : null].filter(
        (part): part is string => typeof part === 'string' && part.length > 0
      );

      if (opponent) {
        return detailParts.length > 0 ? `${opponent} (${detailParts.join(' • ')})` : opponent;
      }
    }

    // Fallback for non-standard IDs: never expose long opaque tokens.
    if (/^[A-Za-z0-9_-]{14,}$/.test(normalized)) {
      return 'Saved game plan';
    }

    return this.formatToolInvocationValue(normalized.replace(/[-_]+/g, ' '));
  }

  private resolveFilmReviewDescriptor(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const normalized = value.trim();
    if (!normalized) return null;

    const parts = normalized
      .split('_')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length < 3) return null;

    const lastPart = parts.at(-1) ?? '';
    const hasTechnicalSuffix = /^\d{10,}[a-z0-9-]*$/i.test(lastPart);
    const descriptorParts = parts.slice(1, hasTechnicalSuffix ? -1 : undefined);
    if (descriptorParts.length === 0) return null;

    const humanized = descriptorParts.join(' ').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!humanized) return null;

    const collapsed = humanized.replace(/\s+/g, '');
    if (/^[a-z0-9]{12,}$/i.test(collapsed)) return null;

    return humanized.replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private resolveDraftPostDescriptor(input: Record<string, unknown>): string | null {
    const directDescriptor = this.resolvePostEntryDescriptor(input);
    if (directDescriptor) return directDescriptor;

    const posts = input['posts'];
    if (!Array.isArray(posts)) return null;

    for (const post of posts) {
      if (!post || typeof post !== 'object' || Array.isArray(post)) continue;
      const descriptor = this.resolvePostEntryDescriptor(post as Record<string, unknown>);
      if (descriptor) return descriptor;
    }

    return null;
  }

  private resolvePostEntryDescriptor(post: Record<string, unknown>): string | null {
    for (const key of ['title', 'content', 'description'] as const) {
      const candidate = this.formatToolInvocationValue(post[key]);
      if (candidate) return candidate;
    }

    return null;
  }

  private formatToolInvocationValue(value: unknown): string | null {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) return null;
      // Suppress URLs from user-facing labels — they're technical details
      if (/^https?:\/\//i.test(normalized)) {
        return null;
      }
      return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return null;
      // Try to find a meaningful descriptor, skipping URLs
      for (const item of value) {
        const candidate = this.formatToolInvocationValue(item);
        if (candidate) return value.length === 1 ? candidate : `${candidate} +${value.length - 1}`;
      }
      // All items were URLs or empty — suppress descriptor
      return null;
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['name', 'title', 'label', 'url', 'hostname'] as const) {
        const candidate = this.formatToolInvocationValue(record[key]);
        if (candidate) return candidate;
      }
    }

    return null;
  }

  private buildGameAnalysisParams(intent: string): GameAnalysisParams | undefined {
    const normalizedIntent = intent.trim();
    if (!normalizedIntent) return undefined;

    const clean = (value: string | undefined): string | undefined => {
      if (!value) return undefined;
      const normalized = value
        .replace(/[\s\n\t]+/g, ' ')
        .trim()
        .replace(/[.,;:!?]+$/, '');
      return normalized.length > 0 ? normalized : undefined;
    };

    const capture = (pattern: RegExp): string | undefined => {
      const match = normalizedIntent.match(pattern);
      return clean(match?.[1]);
    };

    let ownTeamName = capture(/(?:^|\b)(?:our\s+team|team)\s*:\s*([^.;,\n]+)/i);
    let opponentTeamName = capture(/(?:^|\b)opponent\s*:\s*([^.;,\n]+)/i);

    let ownTeamColor = capture(/(?:^|\b)(?:our\s+team\s+color|team\s+color)\s*:\s*([^.;,\n]+)/i);
    let opponentTeamColor = capture(/(?:^|\b)opponent\s+color\s*:\s*([^.;,\n]+)/i);

    const splitTeamAndColor = (value: string | undefined): { name?: string; color?: string } => {
      if (!value) return {};
      const match = value.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      if (!match) return { name: value };
      return {
        name: clean(match[1]),
        color: clean(match[2]),
      };
    };

    const ownSplit = splitTeamAndColor(ownTeamName);
    ownTeamName = ownSplit.name ?? ownTeamName;
    ownTeamColor = ownTeamColor ?? ownSplit.color;

    const opponentSplit = splitTeamAndColor(opponentTeamName);
    opponentTeamName = opponentSplit.name ?? opponentTeamName;
    opponentTeamColor = opponentTeamColor ?? opponentSplit.color;

    const versusMatch = normalizedIntent.match(
      /([A-Za-z0-9][A-Za-z0-9 '&.-]{1,60})\s*\(([^)]+)\)\s+vs\.?\s+([A-Za-z0-9][A-Za-z0-9 '&.-]{1,60})\s*\(([^)]+)\)/i
    );
    if (versusMatch) {
      ownTeamName = ownTeamName ?? clean(versusMatch[1]);
      ownTeamColor = ownTeamColor ?? clean(versusMatch[2]);
      opponentTeamName = opponentTeamName ?? clean(versusMatch[3]);
      opponentTeamColor = opponentTeamColor ?? clean(versusMatch[4]);
    }

    if (!opponentTeamColor && opponentTeamName) {
      const escapedOpponent = opponentTeamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const opponentWithColor = normalizedIntent.match(
        new RegExp(`${escapedOpponent}\\s*\\(([^)]+)\\)`, 'i')
      );
      opponentTeamColor = clean(opponentWithColor?.[1]);
    }

    const sportLabel = capture(/(?:^|\b)sport\s*:\s*([^.;,\n]+)/i);
    const inferredSportMatch = normalizedIntent.match(
      /\b(football|basketball|baseball|softball|soccer|lacrosse|volleyball|hockey|track|wrestling|tennis|golf)\b/i
    );
    const sport = sportLabel ?? clean(inferredSportMatch?.[1]);

    const division = capture(/(?:^|\b)division\s*:\s*([^.;,\n]+)/i);
    const weekRaw = capture(/(?:^|\b)week\s*:\s*(\d{1,2})/i);
    const week = weekRaw ? Number.parseInt(weekRaw, 10) : undefined;

    const explicitPhaseRaw = capture(
      /(?:^|\b)(?:game\s*phase|phase)\s*:\s*(pregame|pre-game|in-game|in\s*game|postgame|post-game|scouting)/i
    );
    const normalizePhase = (
      phase: string | undefined
    ): 'pregame' | 'in-game' | 'postgame' | 'scouting' | undefined => {
      if (!phase) return undefined;
      const value = phase.toLowerCase().replace(/\s+/g, '-');
      if (value === 'pre-game') return 'pregame';
      if (value === 'in-game' || value === 'in--game') return 'in-game';
      if (value === 'post-game') return 'postgame';
      if (value === 'pregame' || value === 'postgame' || value === 'scouting') {
        return value as 'pregame' | 'postgame' | 'scouting';
      }
      return undefined;
    };

    let phase = normalizePhase(explicitPhaseRaw);
    if (!phase) {
      if (
        /\b(film\s+review|review\s+film|postgame|post-game|after\s+the\s+game)\b/i.test(
          normalizedIntent
        )
      ) {
        phase = 'postgame';
      } else if (/\b(scout|scouting|opponent\s+film)\b/i.test(normalizedIntent)) {
        phase = 'scouting';
      } else if (
        /\b(plan|planning|prepare|pregame|pre-game|ahead\s+of\s+time)\b/i.test(normalizedIntent)
      ) {
        phase = 'pregame';
      }
    }

    const perspectiveRaw = capture(
      /(?:^|\b)perspective\s*:\s*(own|opponent|neutral)/i
    )?.toLowerCase();
    let perspectiveTeam: 'own' | 'opponent' | 'neutral' | undefined;
    if (perspectiveRaw === 'own' || perspectiveRaw === 'opponent' || perspectiveRaw === 'neutral') {
      perspectiveTeam = perspectiveRaw;
    } else if (
      /\b(scout\s+the\s+opponent|opponent\s+film|their\s+perspective)\b/i.test(normalizedIntent)
    ) {
      perspectiveTeam = 'opponent';
    } else if (/\b(our\s+perspective|from\s+our\s+perspective)\b/i.test(normalizedIntent)) {
      perspectiveTeam = 'own';
    }

    const hasTeamData = Boolean(
      ownTeamName || opponentTeamName || ownTeamColor || opponentTeamColor || perspectiveTeam
    );
    const hasGameData = Boolean(
      sport || division || phase || (typeof week === 'number' && !Number.isNaN(week))
    );

    if (!hasTeamData && !hasGameData) return undefined;

    return {
      ...(hasTeamData
        ? {
            team: {
              ...(ownTeamName ? { ownTeamName } : {}),
              ...(ownTeamColor ? { ownTeamColor } : {}),
              ...(opponentTeamName ? { opponentTeamName } : {}),
              ...(opponentTeamColor ? { opponentTeamColor } : {}),
              ...(perspectiveTeam ? { perspectiveTeam } : {}),
            },
          }
        : {}),
      ...(hasGameData
        ? {
            game: {
              ...(sport ? { sport } : {}),
              ...(division ? { division } : {}),
              ...(typeof week === 'number' && !Number.isNaN(week) ? { week } : {}),
              ...(phase ? { phase } : {}),
            },
          }
        : {}),
    };
  }

  private resolveToolStageLabel(
    toolName: string,
    stage: ToolStage,
    metadata?: Record<string, unknown>,
    inputOrArgs?: Record<string, unknown> | string
  ): string {
    const invocationLabel = this.resolveToolInvocationLabel(toolName, inputOrArgs);

    if (stage === 'invoking_sub_agent') {
      const subAgentId =
        typeof metadata?.['subAgentId'] === 'string' ? (metadata['subAgentId'] as string) : null;
      return subAgentId ? `Calling sub-agent: ${subAgentId}...` : 'Calling sub-agent...';
    }

    switch (stage) {
      case 'fetching_data':
        return `Fetching data • ${invocationLabel}`;
      case 'processing_media':
        return `Processing media • ${invocationLabel}`;
      case 'uploading_assets':
        return `Uploading assets • ${invocationLabel}`;
      case 'submitting_job':
        return `Submitting • ${invocationLabel}`;
      case 'checking_status':
        return `Checking status • ${invocationLabel}`;
      case 'persisting_result':
        return `Saving results • ${invocationLabel}`;
      case 'deleting_resource':
        return `Deleting resources • ${invocationLabel}`;
      default:
        return invocationLabel;
    }
  }
}
