/**
 * @fileoverview Agent X — Shared singletons, helpers, and constants.
 *
 * All lazy-loaded service instances live here so sub-route files can
 * import them without circular-dependency issues. `setAgentDependencies`
 * is the only mutable API — called once at bootstrap time.
 */

import type { Request, Response } from 'express';
import type { AgentChatService } from '../../modules/agent/services/agent-chat.service.js';
import type { ContextBuilder } from '../../modules/agent/memory/context-builder.js';
import type { OpenRouterService } from '../../modules/agent/llm/openrouter.service.js';
import type { ToolRegistry } from '../../modules/agent/tools/tool-registry.js';
import type { AgentIdentifier, AgentYieldState } from '@nxt1/core';
import {
  AgentGenerationService,
  isLegacyFallbackPlaybook,
} from '../../modules/agent/services/generation.service.js';
import { FirecrawlProfileService } from '../../modules/agent/tools/integrations/firecrawl/browser/firecrawl-profile.service.js';
import { LiveViewSessionService } from '../../modules/agent/tools/integrations/firecrawl/browser/live-view-session.service.js';
import { AGENT_X_ALLOWED_MIME_TYPES, AGENT_X_MAX_FILE_SIZE } from '@nxt1/core';
import { logger } from '../../utils/logger.js';
import multer from 'multer';

// ─── Re-export so callers don't need to import from generation directly ────
export { isLegacyFallbackPlaybook };

// ─── Lazy service singletons ─────────────────────────────────────────────

export let queueService:
  | import('../../modules/agent/queue/queue.service.js').AgentQueueService
  | null = null;
export let jobRepository:
  | import('../../modules/agent/queue/job.repository.js').AgentJobRepository
  | null = null;
export let chatService: AgentChatService | null = null;
export let contextBuilder: ContextBuilder | null = null;
export let llmService: OpenRouterService | null = null;
export let toolRegistryRef: ToolRegistry | null = null;
export let pubsubService:
  | import('../../modules/agent/queue/pubsub.service.js').AgentPubSubService
  | null = null;
export let agentRouterRef: import('../../modules/agent/agent.router.js').AgentRouter | null = null;

/**
 * Called once at server startup to inject the queue + repo singletons.
 * This avoids circular imports and ensures Redis is connected first.
 */
export function setAgentDependencies(deps: {
  queueService: import('../../modules/agent/queue/queue.service.js').AgentQueueService;
  jobRepository: import('../../modules/agent/queue/job.repository.js').AgentJobRepository;
  chatService: AgentChatService;
  contextBuilder: ContextBuilder;
  llmService: OpenRouterService;
  toolRegistry?: ToolRegistry;
  pubsub?: import('../../modules/agent/queue/pubsub.service.js').AgentPubSubService | null;
  agentRouter?: import('../../modules/agent/agent.router.js').AgentRouter;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
  chatService = deps.chatService;
  contextBuilder = deps.contextBuilder;
  llmService = deps.llmService;
  if (deps.toolRegistry) toolRegistryRef = deps.toolRegistry;
  if ('pubsub' in deps) pubsubService = deps.pubsub ?? null;
  if (deps.agentRouter) agentRouterRef = deps.agentRouter;

  // Reset generation service cache when dependencies change
  _generationService = null;
  _generationServiceLlm = undefined;
}

// ─── Constants ───────────────────────────────────────────────────────────

/**
 * Fallback maximum agentic loop iterations per chat request.
 * The live value is read from `AppConfig/agentConfig` → `operationalLimits.maxAgenticTurns`
 * in Firestore.
 * This constant is only used if the Firestore doc is absent.
 */
export const MAX_AGENTIC_TURNS = 6;

/** Maximum lifetime for an entry in the activeAbortControllers map (10 minutes). */
export const ABORT_CONTROLLER_TTL_MS = 10 * 60 * 1000;

/** Valid MongoDB ObjectId format (24-character hex string). */
export const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Valid AgentThreadCategory values from @nxt1/core. */
export const VALID_THREAD_CATEGORIES = new Set<string>([
  'general',
  'recruiting',
  'highlights',
  'graphics',
  'scouting',
  'analytics',
  'compliance',
  'performance',
]);

/** Alphanumeric + underscores only — prevents Firestore path injection. */
export const PLATFORM_KEY_RE = /^[a-z0-9_]+$/i;

// ─── AbortController registry ────────────────────────────────────────────

/**
 * In-memory registry of active AbortControllers keyed by chatOperationId.
 * Allows the explicit POST /cancel/:operationId endpoint to abort an
 * in-flight chat request even if the TCP connection hasn't been detected
 * as closed (e.g. behind aggressive load balancers / proxies).
 */
export const activeAbortControllers = new Map<
  string,
  { controller: AbortController; createdAt: number; userId: string }
>();

// Sweep stale entries every 60 seconds.
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of activeAbortControllers) {
    if (now - entry.createdAt > ABORT_CONTROLLER_TTL_MS) {
      entry.controller.abort();
      activeAbortControllers.delete(id);
      logger.warn('Evicted stale AbortController (TTL expired)', { operationId: id });
    }
  }
}, 60_000).unref();

// ─── Validators ──────────────────────────────────────────────────────────

/** Validate a string is a valid MongoDB ObjectId. */
export function isValidObjectId(id: string): boolean {
  return OBJECT_ID_RE.test(id);
}

// ─── Lazy service factories ───────────────────────────────────────────────

let _generationService: AgentGenerationService | null = null;
let _generationServiceLlm: OpenRouterService | null | undefined = undefined;

/**
 * Lazy singleton for content generation.
 * Re-creates if the llmService changes (e.g. after `setAgentDependencies`).
 */
export function getGenerationService(): AgentGenerationService {
  if (!_generationService || _generationServiceLlm !== llmService) {
    _generationService = new AgentGenerationService(llmService ?? undefined);
    _generationServiceLlm = llmService;
  }
  return _generationService;
}

let _firecrawlProfileService: FirecrawlProfileService | null = null;

/** Lazy singleton — only created when a Firecrawl session is requested. */
export function getFirecrawlProfileService(): FirecrawlProfileService {
  if (!_firecrawlProfileService) _firecrawlProfileService = new FirecrawlProfileService();
  return _firecrawlProfileService;
}

let _liveViewSessionService: LiveViewSessionService | null = null;

/** Lazy singleton for live-view sessions — only created on first request. */
export function getLiveViewSessionService(): LiveViewSessionService {
  if (!_liveViewSessionService) _liveViewSessionService = new LiveViewSessionService();
  return _liveViewSessionService;
}

// ─── Multer upload config ─────────────────────────────────────────────────

export const AGENT_X_ALLOWED_MIMES_SET = new Set(AGENT_X_ALLOWED_MIME_TYPES);

export const agentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AGENT_X_MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (AGENT_X_ALLOWED_MIMES_SET.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed for Agent X attachments`));
    }
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Helper to bypass Google App Engine / Firebase HTTP proxy buffering.
 */
export function forceProxyFlush(res: Response & { flush?: () => void }) {
  if (typeof res.flush === 'function') {
    res.flush();
  }
  res.write(`: ${' '.repeat(4096)}\n\n`);
}

/** Extract the authenticated user from the request (set by appGuard). */
export function getAuthUser(req: Request): { uid: string } | undefined {
  return (req as Request & { user?: { uid: string } }).user;
}

/**
 * Convert a raw tool function name into a user-friendly label.
 */
export function humanizeToolName(name: string): string {
  if (!name) return 'Processing…';
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
  if (!words) return 'Processing…';
  return words.charAt(0).toUpperCase() + words.slice(1) + '…';
}

/**
 * Resolve a thread for message persistence.
 * If threadId is provided, verify ownership. If not, create a new thread.
 */
export async function resolveThread(
  service: AgentChatService,
  userId: string,
  threadId: string | undefined,
  title: string
): Promise<string | undefined> {
  if (threadId) {
    const thread = await service.getThread(threadId, userId);
    if (!thread) {
      logger.warn('Thread ownership check failed — threadId does not belong to user', {
        threadId,
        userId,
      });
      return undefined;
    }
    return threadId;
  }

  const thread = await service.createThread({
    userId,
    ...(title.trim().slice(0, 80) ? { title: title.trim().slice(0, 80) } : {}),
  });
  return thread.id;
}

/**
 * Replay stored Firestore JobEvents as SSE frames to the client.
 */
export function replayJobEventsAsSSE(
  res: Response,
  events: ReadonlyArray<{
    seq?: number;
    type: string;
    text?: string;
    stepId?: string;
    agentId?: string;
    stageType?: string;
    stage?: string;
    outcomeCode?: string;
    metadata?: Record<string, unknown>;
    icon?: string;
    toolName?: string;
    message?: string;
    messageKey?: string;
    toolSuccess?: boolean;
  }>,
  afterSeq = -1
): void {
  for (const evt of events) {
    if (afterSeq >= 0 && (evt.seq ?? 0) <= afterSeq) continue;
    switch (evt.type) {
      case 'delta':
        if (evt.text) {
          res.write(`event: delta\ndata: ${JSON.stringify({ content: evt.text })}\n\n`);
        }
        break;
      case 'step_active':
      case 'step_done':
      case 'step_error': {
        const status =
          evt.type === 'step_active' ? 'active' : evt.type === 'step_done' ? 'success' : 'error';
        const stepId = typeof evt.stepId === 'string' ? evt.stepId.trim() : '';
        const label = typeof evt.message === 'string' ? evt.message.trim() : '';
        if (!stepId || !label) break;
        res.write(
          `event: step\ndata: ${JSON.stringify({
            ...(typeof evt.seq === 'number' ? { seq: evt.seq } : {}),
            emittedAt: new Date().toISOString(),
            ...(evt.messageKey ? { messageKey: evt.messageKey } : {}),
            id: stepId,
            label,
            ...(evt.agentId ? { agentId: evt.agentId } : {}),
            ...(evt.stageType ? { stageType: evt.stageType } : {}),
            ...(evt.stage ? { stage: evt.stage } : {}),
            ...(evt.outcomeCode ? { outcomeCode: evt.outcomeCode } : {}),
            ...(evt.metadata ? { metadata: evt.metadata } : {}),
            ...(evt.icon ? { icon: evt.icon } : {}),
            status,
          })}\n\n`
        );
        break;
      }
      case 'tool_call':
        break;
      case 'tool_result': {
        const stepId = typeof evt.stepId === 'string' ? evt.stepId.trim() : '';
        const label = typeof evt.message === 'string' ? evt.message.trim() : '';
        if (!stepId || !label) break;
        res.write(
          `event: step\ndata: ${JSON.stringify({
            ...(typeof evt.seq === 'number' ? { seq: evt.seq } : {}),
            emittedAt: new Date().toISOString(),
            ...(evt.messageKey ? { messageKey: evt.messageKey } : {}),
            id: stepId,
            label,
            ...(evt.agentId ? { agentId: evt.agentId } : {}),
            ...(evt.stageType ? { stageType: evt.stageType } : {}),
            ...(evt.stage ? { stage: evt.stage } : {}),
            ...(evt.outcomeCode ? { outcomeCode: evt.outcomeCode } : {}),
            ...(evt.metadata ? { metadata: evt.metadata } : {}),
            ...(evt.icon ? { icon: evt.icon } : {}),
            status: evt.toolSuccess ? 'success' : 'error',
          })}\n\n`
        );
        break;
      }
      default:
        break;
    }
  }
}

/**
 * Build an inline ask_user card for the SSE `card` event.
 * The frontend renders this as a question prompt with a text input.
 * The user submits their answer through POST /resume-job/:operationId
 * so the backend resumes the exact yielded tool context deterministically.
 */
export function buildInlineAskUserCard(params: {
  agentId: AgentIdentifier;
  question: string;
  context?: string;
  threadId?: string;
  operationId?: string;
}): {
  agentId: AgentIdentifier;
  type: 'ask_user';
  title: string;
  payload: Record<string, unknown>;
} {
  return {
    agentId: params.agentId,
    type: 'ask_user',
    title: 'Agent X has a question',
    payload: {
      question: params.question,
      context: params.context ?? '',
      ...(params.threadId ? { threadId: params.threadId } : {}),
      ...(params.operationId ? { operationId: params.operationId } : {}),
    },
  };
}

/**
 * Build an inline approval card for the SSE `card` event.
 */
export function buildInlineApprovalCard(params: {
  agentId: AgentIdentifier;
  toolName: string;
  approvalId: string;
  operationId: string;
  promptToUser: string;
  toolInput: Record<string, unknown>;
}): {
  agentId: AgentIdentifier;
  type: 'draft' | 'confirmation';
  title: string;
  payload: Record<string, unknown>;
} {
  if (params.toolName === 'send_email') {
    return {
      agentId: params.agentId,
      type: 'draft',
      title: 'Email Draft',
      payload: {
        content:
          (typeof params.toolInput['bodyHtml'] === 'string' && params.toolInput['bodyHtml']) ||
          (typeof params.toolInput['body'] === 'string' ? params.toolInput['body'] : '') ||
          '',
        subject: typeof params.toolInput['subject'] === 'string' ? params.toolInput['subject'] : '',
        recipientsCount: 1,
        toEmail: typeof params.toolInput['toEmail'] === 'string' ? params.toolInput['toEmail'] : '',
        approvalId: params.approvalId,
        operationId: params.operationId,
      },
    };
  }

  return {
    agentId: params.agentId,
    type: 'confirmation',
    title: 'Approval Required',
    payload: {
      message: params.promptToUser,
      actions: [
        { id: 'reject', label: 'Reject', variant: 'secondary' },
        { id: 'approve', label: 'Approve', variant: 'primary' },
      ],
      approvalId: params.approvalId,
      operationId: params.operationId,
    },
  };
}

// Re-export AgentYieldState type for convenience
export type { AgentYieldState };
