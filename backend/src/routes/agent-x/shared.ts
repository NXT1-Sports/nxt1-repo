/**
 * @fileoverview Agent X Shared State, Singletons & Helpers
 * @module @nxt1/backend/routes/agent-x/shared
 *
 * Single source of truth for all module-scoped singletons that are mutated
 * by setAgentDependencies() at server startup. ES module live-binding semantics
 * guarantee that sub-routers always see the current values without closures.
 *
 * Exported singletons (live bindings via `export let`):
 *   queueService, jobRepository, chatService, contextBuilder,
 *   llmService, toolRegistryRef, pubsubService
 *
 * Exported helpers:
 *   setAgentDependencies, getAuthUser, resolveThread, forceProxyFlush,
 *   humanizeToolName, buildInlineApprovalCard, replayJobEventsAsSSE,
 *   isValidObjectId, getGenerationService, getFirecrawlProfileService,
 *   getLiveViewSessionService
 *
 * Exported constants:
 *   MAX_AGENTIC_TURNS, ABORT_CONTROLLER_TTL_MS, OBJECT_ID_RE,
 *   VALID_THREAD_CATEGORIES, PLATFORM_KEY_RE, activeAbortControllers,
 *   agentUpload
 */

import { type Request, type Response } from 'express';
import { uploadRateLimit } from '../../middleware/rate-limit.middleware.js';
import type { AgentChatService } from '../../modules/agent/services/agent-chat.service.js';
import type { ContextBuilder } from '../../modules/agent/memory/context-builder.js';
import type { OpenRouterService } from '../../modules/agent/llm/openrouter.service.js';
import type { ToolRegistry } from '../../modules/agent/tools/tool-registry.js';
import { logger } from '../../utils/logger.js';
import multer from 'multer';
import {
  AgentGenerationService,
} from '../../modules/agent/services/generation.service.js';
import { FirecrawlProfileService } from '../../modules/agent/tools/scraping/firecrawl-profile.service.js';
import { LiveViewSessionService } from '../../modules/agent/tools/scraping/live-view-session.service.js';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_FILE_SIZE,
} from '@nxt1/core';
import type { AgentThreadCategory } from '@nxt1/core';

// ─── Lazy-loaded service singletons ──────────────────────────────────────
// Initialized by setAgentDependencies() at server startup.
// Exported as `let` so sub-routers get live bindings.

export let queueService: import('../../modules/agent/queue/queue.service.js').AgentQueueService | null = null;
export let jobRepository: import('../../modules/agent/queue/job.repository.js').AgentJobRepository | null = null;
export let chatService: AgentChatService | null = null;
export let contextBuilder: ContextBuilder | null = null;
export let llmService: OpenRouterService | null = null;
export let toolRegistryRef: ToolRegistry | null = null;
export let pubsubService: import('../../modules/agent/queue/pubsub.service.js').AgentPubSubService | null = null;

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
  pubsub?: import('../../modules/agent/queue/pubsub.service.js').AgentPubSubService;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
  chatService = deps.chatService;
  contextBuilder = deps.contextBuilder;
  llmService = deps.llmService;
  if (deps.toolRegistry) toolRegistryRef = deps.toolRegistry;
  if (deps.pubsub) pubsubService = deps.pubsub;
}

// ─── Constants ────────────────────────────────────────────────────────────

/**
 * Maximum agentic loop iterations per chat request.
 * Each iteration = one LLM call + optional tool execution.
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

/**
 * In-memory registry of active AbortControllers keyed by chatOperationId.
 * Allows the explicit POST /cancel/:operationId endpoint to abort an
 * in-flight chat request even if the TCP connection hasn't been detected
 * as closed (e.g. behind aggressive load balancers / proxies).
 */
export const activeAbortControllers = new Map<
  string,
  { controller: AbortController; createdAt: number }
>();

/** Sweep stale AbortControllers every 60 seconds. */
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

// ─── Multer upload config ─────────────────────────────────────────────────

const AGENT_X_ALLOWED_MIMES_SET = new Set(AGENT_X_ALLOWED_MIME_TYPES);

/** Multer instance for Agent X file attachments. */
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

// ─── Helper functions ─────────────────────────────────────────────────────

/**
 * Helper to bypass Google App Engine / Firebase HTTP proxy buffering.
 * App Engine forcefully buffers the first 4KB+ of an HTTP response, ignoring
 * X-Accel-Buffering, Cache-Control: no-transform, and socket.setNoDelay().
 */
export function forceProxyFlush(res: Response & { flush?: () => void }): void {
  if (typeof res.flush === 'function') {
    res.flush();
  }
  res.write(\`: ${' '.repeat(4096)}\n\n\`);
}

/** Extract the authenticated user from the request (set by appGuard). */
export function getAuthUser(req: Request): { uid: string } | undefined {
  return (req as Request & { user?: { uid: string } }).user;
}

/** Validate a string is a valid MongoDB ObjectId. */
export function isValidObjectId(id: string): boolean {
  return OBJECT_ID_RE.test(id);
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
    title: title.trim().slice(0, 80) || 'New Conversation',
  });
  return thread.id;
}

/**
 * Convert a raw tool function name into a user-friendly label.
 * Falls back to titlecasing the snake/camelCase name.
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

/** Build an inline approval card for draft or confirmation flows. */
export function buildInlineApprovalCard(params: {
  toolName: string;
  approvalId: string;
  operationId: string;
  promptToUser: string;
  toolInput: Record<string, unknown>;
}): {
  type: 'draft' | 'confirmation';
  title: string;
  payload: Record<string, unknown>;
} {
  if (params.toolName === 'send_email') {
    return {
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

/** Replay stored Firestore JobEvents as SSE frames to a client. */
export function replayJobEventsAsSSE(
  res: Response,
  events: ReadonlyArray<{
    type: string;
    text?: string;
    toolName?: string;
    message?: string;
    toolSuccess?: boolean;
  }>
): void {
  for (const evt of events) {
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
        res.write(
          `event: step\ndata: ${JSON.stringify({
            id: evt.toolName ?? evt.type,
            label: evt.message ?? evt.type,
            status,
          })}\n\n`
        );
        break;
      }
      case 'tool_call':
        res.write(
          `event: step\ndata: ${JSON.stringify({
            id: evt.toolName ?? 'tool',
            label: evt.message ?? evt.toolName ?? 'Tool',
            status: 'active',
          })}\n\n`
        );
        break;
      case 'tool_result':
        res.write(
          `event: step\ndata: ${JSON.stringify({
            id: evt.toolName ?? 'tool',
            label: evt.message ?? evt.toolName ?? 'Tool',
            status: evt.toolSuccess ? 'success' : 'error',
          })}\n\n`
        );
        break;
      default:
        break;
    }
  }
}

// ─── Lazy generation service singleton ───────────────────────────────────

let _generationService: AgentGenerationService | null = null;
let _generationServiceLlm: OpenRouterService | null | undefined = undefined;

/**
 * Lazy singleton for content generation.
 * Re-creates if the llmService changes (e.g. after setAgentDependencies),
 * ensuring the generation service always uses the telemetry-wired LLM instance.
 */
export function getGenerationService(): AgentGenerationService {
  if (!_generationService || _generationServiceLlm !== llmService) {
    _generationService = new AgentGenerationService(llmService ?? undefined);
    _generationServiceLlm = llmService;
  }
  return _generationService;
}

// ─── Lazy Firecrawl service singleton ────────────────────────────────────

let _firecrawlProfileService: FirecrawlProfileService | null = null;

/** Returns the lazy Firecrawl profile service singleton. */
export function getFirecrawlProfileService(): FirecrawlProfileService {
  if (!_firecrawlProfileService) _firecrawlProfileService = new FirecrawlProfileService();
  return _firecrawlProfileService;
}

// ─── Lazy live-view service singleton ────────────────────────────────────

let _liveViewSessionService: LiveViewSessionService | null = null;

/** Returns the lazy live-view session service singleton. */
export function getLiveViewSessionService(): LiveViewSessionService {
  if (!_liveViewSessionService) _liveViewSessionService = new LiveViewSessionService();
  return _liveViewSessionService;
}
