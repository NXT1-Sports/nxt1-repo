/**
 * @fileoverview Agent X Routes
 * @module @nxt1/backend/routes/agent-x
 *
 * REST API for Agent X — the AI agent command center.
 *
 * Architecture (2026 Unified Streaming):
 *   All agent interactions flow through a single POST /chat SSE stream.
 *   When the LLM decides a request requires heavy processing, it invokes
 *   `enqueue_heavy_task` which queues a BullMQ job. Instead of closing the
 *   SSE connection, the Express server subscribes to a Redis PubSub channel
 *   and proxies the worker's streaming output verbatim to the client.
 *
 *   BullMQ Worker → Redis PubSub → Express SSE Proxy → Frontend
 *
 * Routes:
 *   POST /api/v1/agent-x/chat              → SSE streaming chat (unified entry point)
 *   POST /api/v1/agent-x/chat/send-draft   → Approve a HITL email draft
 *   POST /api/v1/agent-x/resume-job/:id    → Resume a yielded agent job
 *   POST /api/v1/agent-x/approvals/:id/resolve → Resolve an approval request
 *   POST /api/v1/agent-x/playbook/item/:id/status → Update playbook item status
 *   POST /api/v1/agent-x/briefing/generate  → Generate daily AI briefing
 *   GET  /api/v1/agent-x/history            → Get user's job history
 *   POST /api/v1/agent-x/pause              → Pause the entire queue (admin)
 *   POST /api/v1/agent-x/resume             → Resume the entire queue (admin)
 *   POST /api/v1/agent-x/cron/*             → Cloud Scheduler triggers
 *
 * Deprecated (410 Gone):
 *   POST /api/v1/agent-x/ask               → Use /chat instead
 *   GET  /api/v1/agent-x/status/:id        → Use /chat with resumeOperationId
 *   GET  /api/v1/agent-x/events/:id        → Use /chat with resumeOperationId
 *   POST /api/v1/agent-x/cancel/:id        → Jobs cancel via SSE disconnect
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { appGuard, adminGuard, cronGuard } from '../middleware/auth.middleware.js';
import { uploadRateLimit } from '../middleware/rate-limit.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  SetGoalsDto,
  AgentChatRequestDto,
  UpdatePlaybookItemStatusDto,
  GenerateBriefingDto,
} from '../dtos/agent-x.dto.js';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  AgentJobPayload,
  AgentJobOrigin,
  AgentDashboardGoal,
  ShellWeeklyPlaybookItem,
  ShellBriefingInsight,
  OperationLogEntry,
  AgentThreadCategory,
  AgentYieldState,
} from '@nxt1/core';
import {
  getShellContentForRole,
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_FILE_SIZE,
  AGENT_APPROVAL_POLICIES,
} from '@nxt1/core';
import type { AgentChatService } from '../modules/agent/services/agent-chat.service.js';
import type { ContextBuilder } from '../modules/agent/memory/context-builder.js';
import type { OpenRouterService } from '../modules/agent/llm/openrouter.service.js';
import type { LLMMessage, LLMContentPart, LLMToolSchema } from '../modules/agent/llm/llm.types.js';
import type { ToolRegistry } from '../modules/agent/tools/tool-registry.js';
import { STREAM_TERMINAL_EVENTS } from '../modules/agent/queue/pubsub.service.js';
import { logger } from '../utils/logger.js';
import multer from 'multer';
import { getStorage } from 'firebase-admin/storage';
import { sendEmailViaProvider } from '../services/email-sync.service.js';
import {
  validateJobOrigin,
  mapJobStatus,
  inferCategory,
  iconForCategory,
  computeDuration,
} from './operations-log.helpers.js';
import { AgentGenerationService } from '../modules/agent/services/generation.service.js';
import { FirecrawlProfileService } from '../modules/agent/tools/scraping/firecrawl-profile.service.js';
import { LiveViewSessionService } from '../modules/agent/tools/scraping/live-view-session.service.js';
import { PLATFORM_REGISTRY } from '@nxt1/core';
import { executeBillingDeduction, UsageFeature, checkBudget } from '../modules/billing/index.js';
import crypto from 'node:crypto';

/**
 * Helper to bypass Google App Engine / Firebase HTTP proxy buffering.
 * App Engine forcefully buffers the first 4KB+ of an HTTP response, ignoring
 * X-Accel-Buffering, Cache-Control: no-transform, and socket.setNoDelay().
 * This dummy payload rapidly fills the proxy buffer forcing it to flush downstream.
 * Frontend SSE parsers safely ignore any line starting with a colon (:).
 */
function forceProxyFlush(res: Response) {
  if (typeof (res as any).flush === 'function') {
    (res as any).flush();
  }
  res.write(`: ${' '.repeat(4096)}\n\n`);
}

/**
 * Lazy singleton for content generation.
 * Re-creates if the llmService changes (e.g. after `setAgentDependencies`),
 * ensuring the generation service always uses the telemetry-wired LLM instance.
 */
let _generationService: AgentGenerationService | null = null;
let _generationServiceLlm: OpenRouterService | null | undefined = undefined;
function getGenerationService(): AgentGenerationService {
  if (!_generationService || _generationServiceLlm !== llmService) {
    _generationService = new AgentGenerationService(llmService ?? undefined);
    _generationServiceLlm = llmService;
  }
  return _generationService;
}

/** Extract the authenticated user from the request (set by appGuard). */
function getAuthUser(req: Request): { uid: string } | undefined {
  return (req as Request & { user?: { uid: string } }).user;
}

/** Valid MongoDB ObjectId format (24-character hex string). */
const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

/** Valid AgentThreadCategory values from @nxt1/core. */
const VALID_THREAD_CATEGORIES = new Set<string>([
  'general',
  'recruiting',
  'highlights',
  'graphics',
  'scouting',
  'analytics',
  'compliance',
  'performance',
]);

/** Validate a string is a valid MongoDB ObjectId. */
function isValidObjectId(id: string): boolean {
  return OBJECT_ID_RE.test(id);
}

/**
 * Resolve a thread for message persistence.
 * If threadId is provided, verify ownership. If not, create a new thread.
 * Returns the resolved threadId, or undefined if persistence failed.
 */
async function resolveThread(
  service: AgentChatService,
  userId: string,
  threadId: string | undefined,
  title: string
): Promise<string | undefined> {
  if (threadId) {
    // Verify the caller owns this thread before writing to it (C1 fix)
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

  // No threadId provided — create a new thread
  const thread = await service.createThread({
    userId,
    title: title.trim().slice(0, 80) || 'New Conversation',
  });
  return thread.id;
}

// Lazy-loaded singletons (initialized by bootstrapAgentQueue in app startup)
let queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService | null = null;
let jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository | null =
  null;
let chatService: AgentChatService | null = null;
let contextBuilder: ContextBuilder | null = null;
let llmService: OpenRouterService | null = null;
let toolRegistryRef: ToolRegistry | null = null;
let pubsubService: import('../modules/agent/queue/pubsub.service.js').AgentPubSubService | null =
  null;

/**
 * Maximum agentic loop iterations per chat request.
 * Each iteration = one LLM call + optional tool execution.
 * Prevents runaway loops from consuming excessive resources.
 */
const MAX_AGENTIC_TURNS = 6;

/**
 * Convert a raw tool function name (e.g. `getAthleteStats`) into a
 * user-friendly label (e.g. "Getting athlete stats…").
 * Falls back to titlecasing the snake/camel name.
 */
function humanizeToolName(name: string): string {
  if (!name) return 'Processing…';
  // Convert camelCase / snake_case to space-separated words
  const words = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .toLowerCase();
  if (!words) return 'Processing…';
  // Capitalize first letter and add ellipsis
  return words.charAt(0).toUpperCase() + words.slice(1) + '…';
}

/**
 * Called once at server startup to inject the queue + repo singletons.
 * This avoids circular imports and ensures Redis is connected first.
 */
export function setAgentDependencies(deps: {
  queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService;
  jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository;
  chatService: AgentChatService;
  contextBuilder: ContextBuilder;
  llmService: OpenRouterService;
  toolRegistry?: ToolRegistry;
  pubsub?: import('../modules/agent/queue/pubsub.service.js').AgentPubSubService;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
  chatService = deps.chatService;
  contextBuilder = deps.contextBuilder;
  llmService = deps.llmService;
  if (deps.toolRegistry) toolRegistryRef = deps.toolRegistry;
  if (deps.pubsub) pubsubService = deps.pubsub;
}

const router: ExpressRouter = Router();

// ─── DEPRECATED ROUTES (unified into POST /chat) ─────────────────────────
// These endpoints are replaced by the unified /chat SSE stream with
// Redis PubSub bridging for heavy tasks. Old clients receive 410 Gone.

const deprecatedHandler = (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error: 'This endpoint has been unified into POST /chat. Use /chat with SSE streaming instead.',
    code: 'ENDPOINT_DEPRECATED',
  });
};

router.post('/ask', appGuard, deprecatedHandler);
router.get('/status/:id', appGuard, deprecatedHandler);
router.get('/events/:id', appGuard, deprecatedHandler);
router.post('/cancel/:id', appGuard, deprecatedHandler);

// ─── POST /resume-job/:operationId — Resume a yielded agent job ───────────
//
// Called when the user answers a question from Agent X (via chat or push
// notification deep link). Reads the serialized yield state from Firestore,
// injects the user's answer into the saved message array, and re-enqueues
// a new BullMQ job that continues the ReAct loop from where it left off.

router.post('/resume-job/:operationId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { operationId } = req.params;
    if (!operationId || typeof operationId !== 'string') {
      res.status(400).json({ success: false, error: 'Operation ID is required' });
      return;
    }

    const { response: userResponse } = req.body as { response?: string };
    if (!userResponse || typeof userResponse !== 'string' || userResponse.trim().length === 0) {
      res.status(400).json({ success: false, error: 'A non-empty response is required' });
      return;
    }

    if (userResponse.length > 5000) {
      res.status(400).json({ success: false, error: 'Response must be 5000 characters or less' });
      return;
    }

    const { db } = req.firebase!;
    const jobDoc = await jobRepository.withDb(db).getById(operationId);
    if (!jobDoc) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    // Ownership check
    if (jobDoc.userId !== user.uid) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    // Must be in a yielded state
    const status = jobDoc.status;
    if (status !== 'awaiting_input' && status !== 'awaiting_approval') {
      res.status(409).json({
        success: false,
        error: `Job is in "${status}" state — only yielded jobs can be resumed`,
      });
      return;
    }

    const yieldState = jobDoc.yieldState as AgentYieldState | undefined;
    if (!yieldState) {
      res.status(409).json({ success: false, error: 'No yield state found on this job' });
      return;
    }

    // Check expiry
    if (new Date(yieldState.expiresAt).getTime() < Date.now()) {
      await jobRepository.withDb(db).markFailed(operationId, 'Yield expired before user responded');
      res.status(410).json({ success: false, error: 'This request has expired' });
      return;
    }

    // Persist the user's reply to the MongoDB thread
    const threadId = jobDoc.threadId;
    if (threadId && chatService) {
      try {
        await chatService.addMessage({
          threadId,
          userId: user.uid,
          role: 'user',
          content: userResponse.trim(),
          origin: 'user',
          operationId,
        });
      } catch (chatErr) {
        logger.warn('Failed to persist resume message to MongoDB', {
          error: chatErr instanceof Error ? chatErr.message : String(chatErr),
          userId: user.uid,
        });
      }
    }

    // Build the resumed job payload
    const resumedPayload: AgentJobPayload = {
      operationId: crypto.randomUUID(), // New operation ID for the resumed job
      userId: user.uid,
      intent: jobDoc.intent,
      sessionId: crypto.randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context: {
        threadId,
        resumedFrom: operationId,
        yieldState: {
          ...yieldState,
          // Inject the user's answer as a new tool result message in the saved array
          messages: [
            ...yieldState.messages,
            {
              role: 'tool',
              content: JSON.stringify({
                success: true,
                data: { userResponse: userResponse.trim() },
              }),
              tool_call_id: yieldState.pendingToolCall?.toolCallId ?? 'ask_user_response',
            },
          ],
        } satisfies AgentYieldState,
      },
    };

    // Write the new job to Firestore
    await jobRepository.withDb(db).create(resumedPayload);

    // Mark the original job as completed (it's been superseded)
    await jobRepository.withDb(db).markCompleted(operationId, {
      summary: `Resumed by user — continuing as ${resumedPayload.operationId}`,
      data: { resumedAs: resumedPayload.operationId },
    });

    // Enqueue in BullMQ
    const jobId = await queueService.enqueue(
      resumedPayload,
      req.isStaging ? 'staging' : 'production'
    );

    logger.info('Agent job resumed', {
      originalOperationId: operationId,
      newOperationId: resumedPayload.operationId,
      userId: user.uid,
    });

    res.status(202).json({
      success: true,
      data: {
        jobId,
        operationId: resumedPayload.operationId,
        threadId,
        resumedFrom: operationId,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to resume agent job', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to resume job' });
  }
});

// ─── POST /approvals/:id/resolve — Resolve an approval request ────────────
//
// Called when the user approves or rejects a pending approval (e.g. "Send
// Gmail to 24 coaches"). Resolves the approval in Firestore and, if approved,
// re-enqueues the job so the agent can continue with the approved tool call.

router.post('/approvals/:id/resolve', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const approvalId = req.params['id'];
    if (!approvalId || typeof approvalId !== 'string') {
      res.status(400).json({ success: false, error: 'Approval ID is required' });
      return;
    }

    const { decision } = req.body as { decision?: string };
    if (decision !== 'approved' && decision !== 'rejected') {
      res.status(400).json({
        success: false,
        error: 'Decision must be "approved" or "rejected"',
      });
      return;
    }

    const { db } = req.firebase!;

    // Atomically resolve the approval inside a Firestore transaction to
    // prevent TOCTOU races (two concurrent taps both seeing "pending").
    const approvalRef = db.collection('agentApprovalRequests').doc(approvalId);

    const transactionResult = await db.runTransaction(async (txn) => {
      const approvalSnap = await txn.get(approvalRef);
      if (!approvalSnap.exists) return { code: 404, error: 'Approval request not found' } as const;

      const approvalData = approvalSnap.data()!;

      // Ownership check
      if (approvalData['userId'] !== user.uid) {
        return { code: 404, error: 'Approval request not found' } as const;
      }

      if (approvalData['status'] !== 'pending') {
        return {
          code: 409,
          error: `Approval is already "${approvalData['status']}"`,
        } as const;
      }

      // Atomically update within the transaction
      txn.update(approvalRef, {
        status: decision,
        resolvedAt: new Date().toISOString(),
        resolvedBy: user.uid,
      });

      return {
        code: 200,
        operationId: approvalData['operationId'] as string | undefined,
      } as const;
    });

    // Handle transaction rejection (auth/ownership/conflict)
    if ('error' in transactionResult) {
      res.status(transactionResult.code).json({ success: false, error: transactionResult.error });
      return;
    }

    const operationId = transactionResult.operationId;
    if (!operationId) {
      // Edge case: orphaned approval — resolve it but don't try to resume
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    // Load the original job's yield state
    const jobDoc = await jobRepository.withDb(db).getById(operationId);
    if (!jobDoc) {
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    const yieldState = jobDoc.yieldState as AgentYieldState | undefined;

    if (decision === 'rejected') {
      // Mark the original job as cancelled
      await jobRepository.withDb(db).markCancelled(operationId);
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    // Approved — re-enqueue with the pending tool call result injected
    if (!yieldState?.pendingToolCall) {
      // No tool call to resume — just mark completed
      await jobRepository.withDb(db).markCompleted(operationId, {
        summary: 'Approval granted but no pending action to resume.',
      });
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    const threadId = jobDoc.threadId;

    const resumedPayload: AgentJobPayload = {
      operationId: crypto.randomUUID(),
      userId: user.uid,
      intent: jobDoc.intent,
      sessionId: crypto.randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context: {
        threadId,
        resumedFrom: operationId,
        approvalId,
        yieldState: {
          ...yieldState,
          // For approvals, the tool call was already serialized — the worker
          // re-runs it now that the user has approved.
          messages: [
            ...yieldState.messages,
            {
              role: 'tool',
              content: JSON.stringify({
                success: true,
                data: { approved: true, approvalId },
              }),
              tool_call_id: yieldState.pendingToolCall.toolCallId,
            },
          ],
        } satisfies AgentYieldState,
      },
    };

    await jobRepository.withDb(db).create(resumedPayload);
    await jobRepository.withDb(db).markCompleted(operationId, {
      summary: `Approved — continuing as ${resumedPayload.operationId}`,
      data: { resumedAs: resumedPayload.operationId, approvalId },
    });

    const jobId = await queueService.enqueue(
      resumedPayload,
      req.isStaging ? 'staging' : 'production'
    );

    logger.info('Approval resolved and job resumed', {
      approvalId,
      decision,
      originalOperationId: operationId,
      newOperationId: resumedPayload.operationId,
      userId: user.uid,
    });

    res.status(202).json({
      success: true,
      data: {
        decision,
        resumed: true,
        jobId,
        operationId: resumedPayload.operationId,
        threadId,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to resolve approval', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to resolve approval' });
  }
});

// ─── GET /history — Get user's job history ────────────────────────────────

router.get('/history', appGuard, async (req: Request, res: Response) => {
  try {
    if (!jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitParam = req.query['limit'];
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '20') || 20, 50);
    const { db } = req.firebase!;
    const jobs = await jobRepository.withDb(db).getByUser(user.uid, limit);

    res.json({ success: true, data: jobs });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get job history', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get history' });
  }
});

// ─── GET /operations-log — Formatted operations activity log ──────────────
// Helper functions (validateJobOrigin, mapJobStatus, inferCategory,
// iconForCategory, computeDuration) are imported from ./operations-log.helpers.ts

router.get('/operations-log', appGuard, async (req: Request, res: Response) => {
  try {
    if (!jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitParam = req.query['limit'];
    const rawLimit = typeof limitParam === 'string' ? Number(limitParam) : NaN;
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 50;

    const { db } = req.firebase!;

    let jobs: import('../modules/agent/queue/job.repository.js').AgentJobDocument[];
    try {
      jobs = await jobRepository.withDb(db).getByUser(user.uid, limit);
    } catch (queryErr) {
      // Gracefully handle missing composite index or empty collection
      const msg = queryErr instanceof Error ? queryErr.message : String(queryErr);
      logger.warn('agentJobs query failed — composite index may not be deployed', {
        userId: user.uid,
        error: msg,
      });
      jobs = [];
    }

    const entries: OperationLogEntry[] = [];
    // Track thread IDs already represented by a Firestore job so MongoDB threads
    // are only added for conversations that have no recent Firestore job entry.
    const representedThreadIds = new Set<string>();

    for (const job of jobs) {
      const intent = (job['intent'] as string) ?? '';
      if (!intent) continue; // skip malformed documents

      const status = mapJobStatus((job['status'] as string) ?? '', (raw) =>
        logger.warn('Unknown job status mapped to in-progress', { status: raw })
      );
      const category = inferCategory(intent);
      const createdAt = job['createdAt'] as Timestamp | undefined;
      const completedAt = job['completedAt'] as Timestamp | undefined | null;
      const result = job['result'] as { summary?: string } | null | undefined;
      const jobOrigin = validateJobOrigin(job['origin']);
      const isScheduled = jobOrigin !== 'user';
      const threadId = (job['threadId'] as string) ?? undefined;

      if (threadId) representedThreadIds.add(threadId);

      entries.push({
        id: (job['operationId'] as string) ?? '',
        title: intent.slice(0, 120),
        summary:
          result?.summary ??
          (status === 'error' ? ((job['error'] as string) ?? 'Operation failed') : 'Processing...'),
        icon: iconForCategory(category),
        status,
        category,
        timestamp: createdAt
          ? new Date(createdAt.toMillis()).toISOString()
          : new Date().toISOString(),
        duration: computeDuration(createdAt, completedAt),
        threadId,
        origin: jobOrigin,
        isScheduled,
        metadata: {
          // 'origin' is promoted to a top-level field on OperationLogEntry.
          // 'agent' remains here as supplementary detail (not standardised across all entry types).
          agent: (result as Record<string, unknown> | null)?.['agent'] ?? null,
        },
      });
    }

    // ── Augment with MongoDB threads not yet in the Firestore result ──────────
    // This surfaces older conversations whose Firestore job TTL has expired,
    // as well as threads created directly (not via a queued job).
    if (chatService) {
      try {
        const threadResult = await chatService.getUserThreads({
          userId: user.uid,
          archived: false,
          limit,
        });
        const threads = threadResult.items ?? [];
        const threadsHasMore = threadResult.hasMore ?? false;

        if (threadsHasMore) {
          logger.warn('Operations log thread augmentation truncated — consider increasing limit', {
            userId: user.uid,
            displayedCount: threads.length,
            limit,
          });
        }

        for (const thread of threads) {
          if (!thread.id || representedThreadIds.has(thread.id)) continue;

          const category = inferCategory(thread.title);
          entries.push({
            id: thread.id,
            title: thread.title.slice(0, 120),
            summary: `${thread.messageCount} message${thread.messageCount !== 1 ? 's' : ''} · ${thread.category ?? 'general'}`,
            icon: iconForCategory(category),
            status: 'complete',
            category,
            timestamp: thread.lastMessageAt,
            threadId: thread.id,
            origin: 'user',
            isScheduled: false,
            metadata: {
              source: 'thread',
              messageCount: thread.messageCount,
              threadCategory: thread.category ?? null,
            },
          });
        }
      } catch (threadErr) {
        // Thread augmentation must never block the primary Firestore result
        logger.warn('Failed to augment operations log with MongoDB threads', {
          userId: user.uid,
          error: threadErr instanceof Error ? threadErr.message : String(threadErr),
        });
      }
    }

    // Sort merged entries by timestamp descending (newest first)
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    logger.info('Operations log fetched', { userId: user.uid, count: entries.length });
    res.json({ success: true, data: entries });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get operations log', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get operations log' });
  }
});

// ─── GET /dashboard — Aggregated Agent X dashboard ────────────────────────

router.get('/dashboard', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { db } = req.firebase!;
    const userDoc = await db.collection('Users').doc(user.uid).get();
    const userData = userDoc.data() ?? {};
    const role: string = userData['role'] ?? 'athlete';
    const agentGoals: AgentDashboardGoal[] = userData['agentGoals'] ?? [];

    // Coordinators are role-determined (static, no AI needed)
    const shellContent = getShellContentForRole(role);

    // Fetch generated briefing (or fall back to static defaults)
    const briefingDoc = await db
      .collection('Users')
      .doc(user.uid)
      .collection('agent_briefings')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    let briefingInsights: ShellBriefingInsight[] = [];
    let briefingPreviewText = '';
    let briefingGeneratedAt: string | null = null;

    if (!briefingDoc.empty) {
      const bData = briefingDoc.docs[0].data();
      if ((bData['insights'] as unknown[])?.length) {
        briefingInsights = bData['insights'] as ShellBriefingInsight[];
      }
      if (bData['previewText']) {
        briefingPreviewText = bData['previewText'] as string;
      }
      briefingGeneratedAt = (bData['generatedAt'] as string) ?? briefingGeneratedAt;
    }

    // Fetch generated playbook (or return empty with goals)
    const playbookDoc = await db
      .collection('Users')
      .doc(user.uid)
      .collection('agent_playbooks')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    let playbookItems: ShellWeeklyPlaybookItem[] = [];
    let playbookGeneratedAt: string | null = null;

    if (!playbookDoc.empty) {
      const pData = playbookDoc.docs[0].data();
      playbookItems = (pData['items'] ?? []) as ShellWeeklyPlaybookItem[];
      playbookGeneratedAt = (pData['generatedAt'] as string) ?? null;
    }

    res.json({
      success: true,
      data: {
        briefing: {
          previewText: briefingPreviewText,
          insights: briefingInsights,
          generatedAt: briefingGeneratedAt,
        },
        playbook: {
          items: playbookItems,
          goals: agentGoals,
          generatedAt: playbookGeneratedAt,
          canRegenerate: agentGoals.length > 0,
        },
        coordinators: shellContent.coordinators,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get agent dashboard', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to load dashboard' });
  }
});

// ─── POST /goals — Set or update user goals (max 2) ──────────────────────

router.post('/goals', appGuard, validateBody(SetGoalsDto), async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { goals } = req.body as SetGoalsDto;

    const { db } = req.firebase!;

    // Convert class instances to plain objects for Firestore
    const plainGoals = goals.map((g) => ({
      id: g.id,
      text: g.text,
      category: g.category,
      ...(g.createdAt ? { createdAt: g.createdAt } : {}),
    }));

    // Store goals on user document
    await db
      .collection('Users')
      .doc(user.uid)
      .set(
        { agentGoals: plainGoals, agentGoalsUpdatedAt: new Date().toISOString() },
        { merge: true }
      );

    logger.info('Agent goals updated', { userId: user.uid, goalCount: goals.length });

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to set agent goals', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to save goals' });
  }
});

// ─── POST /upload — Upload files for Agent X chat attachments ─────────────

const AGENT_X_ALLOWED_MIMES_SET = new Set(AGENT_X_ALLOWED_MIME_TYPES);

const agentUpload = multer({
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

router.post(
  '/upload',
  appGuard,
  uploadRateLimit,
  agentUpload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No file provided' });
        return;
      }

      const bucket = getStorage().bucket();
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `agent-x/${user.uid}/${timestamp}_${sanitizedName}`;
      const storageFile = bucket.file(storagePath);

      await storageFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
          cacheControl: 'public, max-age=31536000',
        },
      });

      await storageFile.makePublic();
      const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

      logger.info('Agent X file uploaded', {
        userId: user.uid,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath,
      });

      res.json({
        success: true,
        data: {
          url,
          name: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X file upload failed', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to upload file' });
    }
  }
);

// ─── Helper: Replay Firestore JobEvents as SSE to a client ────────────────
// Used by both the "drop recovery" path and the "completed job replay" path
// to convert stored JobEvent documents into SSE frames.

function replayJobEventsAsSSE(
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

// ─── POST /chat — Real conversational Agent X chat (SSE Streaming) ────────

router.post(
  '/chat',
  appGuard,
  validateBody(AgentChatRequestDto),
  async (req: Request, res: Response) => {
    // Billing context — defined outside try so catch can access for rage-quit billing
    const chatOperationId = `chat-${crypto.randomUUID()}`;
    const chatUser = getAuthUser(req);
    let resolvedThreadId: string | undefined;

    try {
      const user = chatUser;
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { message, mode, history, threadId, attachments, resumeOperationId } =
        req.body as AgentChatRequestDto;

      // ── Drop Recovery: Resume an in-progress heavy task stream ───────
      // If the client passes resumeOperationId, the user's SSE connection dropped
      // while a BullMQ job was still running. We skip the LLM loop and:
      //   1. Replay historical events from Firestore
      //   2. Re-subscribe to Redis PubSub for any remaining live events
      if (resumeOperationId && pubsubService && jobRepository) {
        logger.info('Drop recovery: resuming heavy task stream', {
          operationId: resumeOperationId,
          userId: user.uid,
        });

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        // 1. Replay Firestore events (everything the worker already produced)
        try {
          const job = await jobRepository.getById(resumeOperationId);
          if (!job || job.userId !== user.uid) {
            res.write(
              `event: error\ndata: ${JSON.stringify({ error: 'Operation not found or unauthorized' })}\n\n`
            );
            res.end();
            return;
          }

          // If job already completed, replay everything and close
          if (job.status === 'completed' || job.status === 'failed') {
            const events = await jobRepository.getJobEvents(resumeOperationId);
            replayJobEventsAsSSE(res, events);
            res.write(
              `event: done\ndata: ${JSON.stringify({
                operationId: resumeOperationId,
                status: job.status,
                timestamp: new Date().toISOString(),
              })}\n\n`
            );
            res.end();
            logger.info('Drop recovery: replayed completed job from Firestore', {
              operationId: resumeOperationId,
              userId: user.uid,
              eventCount: events.length,
            });
            return;
          }

          // Job still running — replay existing events, then subscribe to PubSub
          const events = await jobRepository.getJobEvents(resumeOperationId);
          replayJobEventsAsSSE(res, events);

          logger.info('Drop recovery: replayed events, subscribing to live stream', {
            operationId: resumeOperationId,
            userId: user.uid,
            replayedCount: events.length,
          });
        } catch (replayErr) {
          logger.warn('Drop recovery: Firestore replay failed, proceeding to PubSub only', {
            operationId: resumeOperationId,
            error: replayErr instanceof Error ? replayErr.message : String(replayErr),
          });
        }

        // 2. Subscribe to Redis PubSub for remaining live events
        const heartbeatInterval = setInterval(() => {
          try {
            res.write(`event: ping\ndata: {}\n\n`);
          } catch {
            clearInterval(heartbeatInterval);
          }
        }, 15_000);

        const unsubscribe = await pubsubService.subscribe(resumeOperationId, (msg) => {
          try {
            res.write(`event: ${msg.event}\ndata: ${JSON.stringify(msg.data)}\n\n`);

            if (STREAM_TERMINAL_EVENTS.has(msg.event)) {
              clearInterval(heartbeatInterval);
              void unsubscribe();
              res.write(
                `event: done\ndata: ${JSON.stringify({
                  operationId: resumeOperationId,
                  timestamp: new Date().toISOString(),
                })}\n\n`
              );
              res.end();
              logger.info('Drop recovery: PubSub stream completed', {
                operationId: resumeOperationId,
                userId: user.uid,
              });
            }
          } catch {
            clearInterval(heartbeatInterval);
            void unsubscribe();
          }
        });

        req.on('close', () => {
          clearInterval(heartbeatInterval);
          void unsubscribe();
          logger.info('Drop recovery: client disconnected again', {
            operationId: resumeOperationId,
            userId: user.uid,
          });
        });

        // Return early — drop recovery owns the response lifecycle
        return;
      }

      // ── Step 1: Resolve thread (create or verify ownership) ──────────
      const isNewThread = !threadId; // Track if this is the first message (new thread)
      if (chatService) {
        try {
          resolvedThreadId = await resolveThread(chatService, user.uid, threadId, message);

          if (resolvedThreadId) {
            // Persist the user's message immediately (before streaming starts)
            await chatService.addMessage({
              threadId: resolvedThreadId,
              userId: user.uid,
              role: 'user',
              content: message.trim(),
              origin: 'user',
            });
          }
        } catch (chatErr) {
          logger.warn('Failed to persist user message to MongoDB', {
            error: chatErr instanceof Error ? chatErr.message : String(chatErr),
            userId: user.uid,
          });
        }
      }

      // ── Step 2: Build rich system prompt via ContextBuilder ───────────
      //
      // This replaces the old manual Firestore fetch. The ContextBuilder:
      // - Redis-caches the assembled AgentUserContext for 15 min
      // - Extracts sport, position, height, weight, GPA, school, recruiting targets
      // - Includes connected accounts (Hudl, MaxPreps, Gmail)
      // - Compresses everything into a token-efficient string
      //
      const { db } = req.firebase!;
      let profileContext = '';
      let threadHistoryStr = '';

      if (contextBuilder) {
        try {
          const userContext = await contextBuilder.buildContext(user.uid, db);
          profileContext = contextBuilder.compressToPrompt(userContext);
        } catch (ctxErr) {
          logger.warn('ContextBuilder failed, using minimal context', {
            error: ctxErr instanceof Error ? ctxErr.message : String(ctxErr),
            userId: user.uid,
          });
        }

        // Fetch recent thread history from MongoDB for conversation continuity
        if (resolvedThreadId) {
          try {
            threadHistoryStr = await contextBuilder.getRecentThreadHistory(resolvedThreadId, 20);
          } catch {
            // Thread history is non-critical — continue without it
          }
        }
      }

      // Fall back to Firestore read when ContextBuilder is unavailable
      if (!profileContext) {
        const userDoc = await db.collection('Users').doc(user.uid).get();
        const userData = userDoc.data() ?? {};
        const role = (userData['role'] ?? 'athlete') as string;
        const displayName = (userData['displayName'] ?? '') as string;
        const sport = (userData['sport'] ?? '') as string;
        profileContext = `User: ${displayName} | Role: ${role}${sport ? ` | Sport: ${sport}` : ''}`;
      }

      // Fetch agent goals from Firestore (lightweight — not part of ContextBuilder)
      const goalsDoc = await db.collection('Users').doc(user.uid).get();
      const goalsData = goalsDoc.data() ?? {};
      const agentGoals: AgentDashboardGoal[] = (goalsData['agentGoals'] ??
        []) as AgentDashboardGoal[];
      const goalContext =
        agentGoals.length > 0 ? `\nGoals: ${agentGoals.map((g) => g.text).join('; ')}` : '';

      const systemPrompt = [
        `You are Agent X — The First AI Born in the Locker Room. You are the AI assistant for NXT1, an AI-first sports platform.`,
        `\n[User Profile]\n${profileContext}${goalContext}`,
        threadHistoryStr ? `\n${threadHistoryStr}` : '',
        `\nBe concise, actionable, and sports-aware. Format responses with markdown and bullet points when listing items.`,
        `You can: create highlight reels, draft recruiting emails, generate scout reports, analyze film, build graphics, manage recruiting outreach, evaluate prospects, and handle NCAA compliance questions.`,
        `\n[Tool Usage Rules]`,
        `- When calling tools, extract userId, teamId, and organizationId from the [User Profile] above. NEVER ask the user for their UserID, TeamID, or OrgID — you already have them.`,
        `- If a required parameter is available in the user profile context, use it directly.`,
        `- When the user wants to BROWSE or SEE a website interactively, use the open_live_view tool. It opens a live browser in their command center. If they have a connected account for that platform, the session will be pre-authenticated.`,
        `- After opening a live view, use navigate_live_view (change URL), read_live_view (extract page content), interact_with_live_view (click/type/scroll), and close_live_view (end session) to control the SAME browser the user sees. You do NOT need to pass a sessionId — the tools auto-resolve it from the userId. NEVER use read_webpage or interact_with_webpage on URLs already open in a live view — those create separate browsers.`,
        `- You can safely call open_live_view again with a new URL — it automatically reuses the existing session. Only use close_live_view when the user explicitly asks to close the browser or the task is fully done.`,
        mode ? `\nThe user is currently in "${mode}" mode.` : '',
      ]
        .filter(Boolean)
        .join('');

      // ── Step 3: Build LLM messages array ─────────────────────────────
      const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

      // Add client-sent conversation history (limit to last 10)
      if (history?.length) {
        const recentHistory = history.slice(-10);
        for (const msg of recentHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        }
      }

      // Build the final user message — multimodal when attachments are present.
      // OpenRouter natively supports images, PDFs, CSVs, and Word documents when
      // passed as file URLs inside content parts — no backend parsing required.
      const fileAttachments = (attachments ?? []).filter(
        (a: { mimeType: string }) =>
          a.mimeType.startsWith('image/') ||
          a.mimeType === 'application/pdf' ||
          a.mimeType === 'text/csv' ||
          a.mimeType === 'text/plain' ||
          a.mimeType === 'application/vnd.ms-excel' ||
          a.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          a.mimeType === 'application/msword' ||
          a.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      if (fileAttachments.length > 0) {
        // Multimodal message: text + file URL parts passed to OpenRouter.
        // OpenRouter accepts image, PDF, CSV, and doc URLs in the image_url field
        // and routes them to the appropriate native or OCR processing engine.
        const contentParts: LLMContentPart[] = [{ type: 'text', text: message.trim() }];
        for (const att of fileAttachments) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: att.url, detail: 'auto' },
          });
        }
        messages.push({ role: 'user', content: contentParts });
      } else {
        messages.push({ role: 'user', content: message.trim() });
      }

      // ── Step 4: Stream agentic response via SSE ──────────────────────
      //
      // SSE Protocol:
      //   event: delta    → { content: "token fragment" }
      //   event: step     → { id, label, status: "active"|"success"|"error" }
      //   event: done     → { threadId, model, usage }
      //   event: error    → { error: "message" }
      //
      // The frontend reads these events via EventSource or fetch + ReadableStream.
      //
      // AGENTIC LOOP: We pass all registered tools to the LLM. If the LLM
      // responds with tool_calls instead of content, we execute them, feed
      // results back as role: "tool" messages, and re-stream. This repeats
      // up to MAX_AGENTIC_TURNS to prevent infinite loops.
      //

      // ── Budget preflight — reject before opening SSE stream ──────────
      // checkBudget(costCents=0) performs a synchronous gate check using the
      // user's current spend + pending holds vs their budget limit. We resolve
      // teamId from the billing context internally, so no extra lookup needed.
      const chatBudgetCheck = await checkBudget(db, user.uid, 0);
      if (!chatBudgetCheck.allowed) {
        res.status(402).json({
          success: false,
          error: chatBudgetCheck.reason ?? 'Budget limit reached',
          code: 'BUDGET_EXCEEDED',
        });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
      });

      // Disable Nagle's algorithm so tiny SSE chunks (like the in-progress
      // event below) are pushed to the wire immediately instead of being
      // held in the kernel's TCP buffer waiting for more data.
      res.flushHeaders();
      res.socket?.setNoDelay(true);

      // Send initial threadId so the frontend knows which thread to reference
      if (resolvedThreadId) {
        res.write(`event: thread\ndata: ${JSON.stringify({ threadId: resolvedThreadId })}\n\n`);

        forceProxyFlush(res);

        // Emit operation lifecycle event — marks this thread as in-progress
        // in the operations log sidebar in real-time (no polling needed).
        res.write(
          `event: operation\ndata: ${JSON.stringify({
            threadId: resolvedThreadId,
            status: 'in-progress',
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
        logger.info('SSE operation event emitted: in-progress', { threadId: resolvedThreadId });

        forceProxyFlush(res);
      }

      // Attempt streaming; fall back to non-streaming if LLM service is unavailable
      let responseContent = '';
      let model = 'unknown';
      let tokenUsage: { inputTokens: number; outputTokens: number; model: string } | undefined;
      let stepCounter = 0;
      // Track autoOpenPanel instructions emitted by tool executions (outer scope for done event)
      let pendingAutoOpenPanel: Record<string, unknown> | null = null;

      // Build LLM tool schemas from the registry (read-only tools only for chat safety)
      const chatTools: LLMToolSchema[] = [];
      if (toolRegistryRef) {
        const defs = toolRegistryRef.getDefinitions();
        for (const def of defs) {
          chatTools.push({
            type: 'function',
            function: {
              name: def.name,
              description: def.description,
              parameters: def.parameters,
            },
          });
        }
      }

      if (llmService) {
        try {
          // ── Agentic loop: stream → detect tool calls → execute → re-stream ──
          for (let turn = 0; turn < MAX_AGENTIC_TURNS; turn++) {
            const activeToolSteps = new Map<number, { id: string; name: string }>();

            const streamResult = await llmService.completeStream(
              messages,
              {
                tier: 'chat',
                maxTokens: 4096,
                temperature: 0.7,
                ...(chatTools.length > 0 ? { tools: chatTools } : {}),
                telemetryContext: {
                  operationId: chatOperationId,
                  userId: user.uid,
                  agentId: 'general' as const,
                },
              },
              (delta) => {
                if (delta.content) {
                  res.write(
                    `event: delta\ndata: ${JSON.stringify({ content: delta.content })}\n\n`
                  );
                }

                // Emit real-time step indicators when the LLM starts calling a tool
                if (delta.toolName != null && delta.toolCallIndex != null) {
                  const stepId = `step-${stepCounter++}`;
                  activeToolSteps.set(delta.toolCallIndex, { id: stepId, name: delta.toolName });

                  res.write(
                    `event: step\ndata: ${JSON.stringify({
                      id: stepId,
                      label: humanizeToolName(delta.toolName),
                      status: 'active',
                    })}\n\n`
                  );
                  forceProxyFlush(res);
                }
              }
            );

            model = streamResult.model;
            tokenUsage = {
              inputTokens: (tokenUsage?.inputTokens ?? 0) + streamResult.usage.inputTokens,
              outputTokens: (tokenUsage?.outputTokens ?? 0) + streamResult.usage.outputTokens,
              model: streamResult.model,
            };

            // ── No tool calls → final answer received, break ──
            if (streamResult.toolCalls.length === 0) {
              responseContent += streamResult.content;

              // Mark any lingering step indicators as complete
              for (const [, step] of activeToolSteps) {
                res.write(
                  `event: step\ndata: ${JSON.stringify({
                    id: step.id,
                    label: humanizeToolName(step.name),
                    status: 'success',
                  })}\n\n`
                );
              }
              if (activeToolSteps.size > 0) forceProxyFlush(res);
              break;
            }

            // ── Tool calls detected → execute each and continue ──
            // Append the assistant's tool-calling message to the conversation
            messages.push({
              role: 'assistant',
              content: streamResult.content || null,
              tool_calls: streamResult.toolCalls,
            });

            // Execute tools in parallel (all I/O-bound — safe to parallelize)
            // But first, check if any tool requires HITL approval (e.g., send_email).
            // If so, emit a draft card and yield instead of executing.
            let hitlYielded = false;
            let heavyTaskOperationId: string | null = null;

            const toolResults = await Promise.all(
              streamResult.toolCalls.map(async (tc, tcIndex) => {
                // Use array index to look up step — .find() by name fails when
                // the LLM calls the same tool multiple times in a single turn.
                const stepInfo = activeToolSteps.get(tcIndex);

                try {
                  let parsedArgs: Record<string, unknown> = {};
                  try {
                    parsedArgs = JSON.parse(tc.function.arguments);
                  } catch {
                    // LLM occasionally produces malformed JSON — treat as empty input
                    logger.warn('Malformed tool arguments from LLM', {
                      tool: tc.function.name,
                      args: tc.function.arguments.slice(0, 200),
                    });
                  }

                  // ── HITL intercept: yield draft card for approval-required tools ──
                  const approvalPolicy = AGENT_APPROVAL_POLICIES.find(
                    (p) => p.toolName === tc.function.name && p.requiresApproval
                  );
                  if (approvalPolicy) {
                    hitlYielded = true;

                    // Emit a draft card so the user can review/edit before sending
                    const draftPayload = {
                      type: 'draft',
                      title: 'Email Draft',
                      payload: {
                        content: (parsedArgs['bodyHtml'] as string) ?? '',
                        subject: (parsedArgs['subject'] as string) ?? '',
                        recipientsCount: 1,
                        // Pass through the tool args so the frontend can send them back
                        toEmail: (parsedArgs['toEmail'] as string) ?? '',
                        toolCallId: tc.id,
                        toolName: tc.function.name,
                      },
                    };
                    res.write(`event: card\ndata: ${JSON.stringify(draftPayload)}\n\n`);
                    forceProxyFlush(res);

                    if (stepInfo) {
                      res.write(
                        `event: step\ndata: ${JSON.stringify({
                          id: stepInfo.id,
                          label: 'Waiting for your approval',
                          status: 'success',
                        })}\n\n`
                      );
                      forceProxyFlush(res);
                    }

                    logger.info('HITL yield: draft card emitted for approval', {
                      tool: tc.function.name,
                      userId: user.uid,
                      toEmail: parsedArgs['toEmail'],
                    });

                    // Return a synthetic tool result so the LLM knows the draft was shown
                    return {
                      role: 'tool' as const,
                      tool_call_id: tc.id,
                      content: JSON.stringify({
                        status: 'pending_approval',
                        message:
                          'Email draft has been shown to the user for review. Waiting for approval before sending.',
                      }),
                    };
                  }

                  // Inject the current request environment into enqueue_heavy_task so the
                  // background worker targets the correct Firestore project (staging vs production).
                  if (tc.function.name === 'enqueue_heavy_task') {
                    parsedArgs['context'] = {
                      ...(typeof parsedArgs['context'] === 'object' &&
                      parsedArgs['context'] !== null
                        ? (parsedArgs['context'] as Record<string, unknown>)
                        : {}),
                      environment: req.isStaging ? 'staging' : 'production',
                    };
                  }

                  const result = toolRegistryRef
                    ? await toolRegistryRef.execute(tc.function.name, parsedArgs, {
                        userId: user.uid,
                        threadId: resolvedThreadId,
                        sessionId: chatOperationId,
                        onProgress: (label: string) => {
                          if (stepInfo) {
                            try {
                              res.write(
                                `event: step\ndata: ${JSON.stringify({
                                  id: stepInfo.id,
                                  label,
                                  status: 'active',
                                })}\n\n`
                              );
                              forceProxyFlush(res);
                            } catch {
                              // Client disconnected — swallow
                            }
                          }
                        },
                      })
                    : { success: false, error: 'Tool registry unavailable' };

                  // ── Heavy task bridge: capture operationId for SSE proxy ──
                  if (
                    tc.function.name === 'enqueue_heavy_task' &&
                    result.success &&
                    result.data &&
                    typeof result.data === 'object' &&
                    'operationId' in (result.data as Record<string, unknown>)
                  ) {
                    heavyTaskOperationId = (result.data as Record<string, unknown>)[
                      'operationId'
                    ] as string;
                  }

                  // Capture autoOpenPanel instruction from tool results (e.g. live-view)
                  if (
                    result.success &&
                    result.data &&
                    typeof result.data === 'object' &&
                    'autoOpenPanel' in (result.data as Record<string, unknown>)
                  ) {
                    pendingAutoOpenPanel = (result.data as Record<string, unknown>)[
                      'autoOpenPanel'
                    ] as Record<string, unknown>;

                    // Emit immediately so the frontend can open the panel without
                    // waiting for the full LLM response to finish.
                    try {
                      res.write(`event: panel\ndata: ${JSON.stringify(pendingAutoOpenPanel)}\n\n`);
                      forceProxyFlush(res);
                      logger.info('Emitted panel SSE event immediately', {
                        type: (pendingAutoOpenPanel as Record<string, unknown>)['type'],
                        userId: user.uid,
                      });
                    } catch {
                      // Client disconnected — swallow
                    }
                  }

                  // Mark step as success
                  if (stepInfo) {
                    res.write(
                      `event: step\ndata: ${JSON.stringify({
                        id: stepInfo.id,
                        label: humanizeToolName(stepInfo.name),
                        status: result.success ? 'success' : 'error',
                      })}\n\n`
                    );
                    forceProxyFlush(res);
                  }

                  return {
                    role: 'tool' as const,
                    tool_call_id: tc.id,
                    content: JSON.stringify(result.success ? result.data : { error: result.error }),
                  };
                } catch (toolErr) {
                  logger.error('Tool execution failed', {
                    tool: tc.function.name,
                    error: toolErr instanceof Error ? toolErr.message : String(toolErr),
                  });

                  // Mark step as error
                  if (stepInfo) {
                    res.write(
                      `event: step\ndata: ${JSON.stringify({
                        id: stepInfo.id,
                        label: humanizeToolName(stepInfo.name),
                        status: 'error',
                      })}\n\n`
                    );
                    forceProxyFlush(res);
                  }

                  return {
                    role: 'tool' as const,
                    tool_call_id: tc.id,
                    content: JSON.stringify({
                      error: toolErr instanceof Error ? toolErr.message : 'Tool execution failed',
                    }),
                  };
                }
              })
            );

            // Append all tool results to the conversation for the next turn
            for (const result of toolResults) {
              messages.push(result);
            }

            // ── HITL: if a draft card was yielded, break out of the agentic loop ──
            // The user must approve/edit the draft before we continue.
            // We send a final delta so the LLM's "I've drafted an email..." text renders.
            if (hitlYielded) {
              const hitlMessage =
                "I've prepared an email draft for your review. You can edit the subject and body, then tap **Approve & Send** when you're ready.";
              responseContent += hitlMessage;
              res.write(`event: delta\ndata: ${JSON.stringify({ content: hitlMessage })}\n\n`);

              // Emit operation lifecycle event — marks this thread as awaiting user input (yield gate)
              if (resolvedThreadId) {
                res.write(
                  `event: operation\ndata: ${JSON.stringify({
                    threadId: resolvedThreadId,
                    status: 'awaiting_input',
                    timestamp: new Date().toISOString(),
                  })}\n\n`
                );
                forceProxyFlush(res);
              }

              logger.info('HITL: breaking agentic loop, awaiting user approval', {
                userId: user.uid,
                turn: turn + 1,
              });
              break;
            }

            // ── Heavy task SSE proxy: bridge BullMQ worker stream to open SSE ──
            // When enqueue_heavy_task was called, we pivot from the inline LLM loop
            // to a Redis PubSub proxy that forwards the worker's streaming output
            // directly to the client's open SSE connection.
            if (heavyTaskOperationId && pubsubService) {
              logger.info('Pivoting to PubSub SSE proxy for heavy task', {
                operationId: heavyTaskOperationId,
                userId: user.uid,
              });

              // Emit a queued step so the user sees immediate feedback
              res.write(
                `event: step\ndata: ${JSON.stringify({
                  id: 'heavy-task-queued',
                  label: 'Agent processing in background',
                  status: 'active',
                })}\n\n`
              );
              forceProxyFlush(res);

              // 15-second heartbeat keeps the connection alive through proxies/load balancers
              const heartbeatInterval = setInterval(() => {
                try {
                  res.write(`event: ping\ndata: {}\n\n`);
                } catch {
                  clearInterval(heartbeatInterval);
                }
              }, 15_000);

              // Subscribe to the worker's Redis PubSub channel
              const unsubscribe = await pubsubService.subscribe(heavyTaskOperationId, (msg) => {
                try {
                  // Forward the worker's SSE event verbatim to the client
                  res.write(`event: ${msg.event}\ndata: ${JSON.stringify(msg.data)}\n\n`);

                  // Accumulate delta content for persistence
                  if (
                    msg.event === 'delta' &&
                    msg.data &&
                    typeof msg.data === 'object' &&
                    'content' in (msg.data as Record<string, unknown>)
                  ) {
                    responseContent += (msg.data as Record<string, unknown>)['content'] as string;
                  }

                  // On terminal event, clean up and close the SSE connection
                  if (STREAM_TERMINAL_EVENTS.has(msg.event)) {
                    clearInterval(heartbeatInterval);
                    void unsubscribe();

                    // Mark queued step as done
                    res.write(
                      `event: step\ndata: ${JSON.stringify({
                        id: 'heavy-task-queued',
                        label: 'Agent processing in background',
                        status: msg.event === 'done' ? 'success' : 'error',
                      })}\n\n`
                    );

                    // Send the final done event with metadata
                    const donePayload: Record<string, unknown> = {
                      threadId: resolvedThreadId,
                      model,
                      usage: tokenUsage,
                      timestamp: new Date().toISOString(),
                      operationId: heavyTaskOperationId,
                    };
                    if (pendingAutoOpenPanel) {
                      donePayload['autoOpenPanel'] = pendingAutoOpenPanel;
                    }
                    res.write(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`);

                    // Emit operation lifecycle event for the heavy task completion
                    res.write(
                      `event: operation\ndata: ${JSON.stringify({
                        threadId: resolvedThreadId,
                        status: msg.event === 'done' ? 'complete' : 'error',
                        timestamp: new Date().toISOString(),
                      })}\n\n`
                    );
                    forceProxyFlush(res);

                    res.end();

                    logger.info('Heavy task SSE proxy completed', {
                      operationId: heavyTaskOperationId,
                      userId: user.uid,
                      terminalEvent: msg.event,
                    });
                  }
                } catch (proxyErr) {
                  // Connection may have been closed by the client
                  clearInterval(heartbeatInterval);
                  void unsubscribe();
                  logger.warn('SSE proxy write failed (client likely disconnected)', {
                    operationId: heavyTaskOperationId,
                    error: proxyErr instanceof Error ? proxyErr.message : String(proxyErr),
                  });
                }
              });

              // Client disconnect cleanup
              req.on('close', () => {
                clearInterval(heartbeatInterval);
                void unsubscribe();
                logger.info('Client disconnected during heavy task proxy', {
                  operationId: heavyTaskOperationId,
                  userId: user.uid,
                });
              });

              // Persist the LLM's inline response before the heavy task started
              if (chatService && resolvedThreadId && responseContent) {
                try {
                  await chatService.addMessage({
                    threadId: resolvedThreadId,
                    userId: user.uid,
                    role: 'assistant',
                    content: responseContent,
                    origin: 'user',
                    agentId: 'general',
                    tokenUsage,
                  });
                } catch (persistErr) {
                  logger.warn('Failed to persist pre-proxy assistant reply', {
                    error: persistErr instanceof Error ? persistErr.message : String(persistErr),
                    userId: user.uid,
                  });
                }
              }

              // Break out of the agentic loop — the PubSub handler owns the response now.
              // Return early to skip the standard Step 5/6/7 finalization below.
              return;
            }

            // Accumulate any partial content from the tool-calling turn
            if (streamResult.content) {
              responseContent += streamResult.content;
            }

            logger.info('Agentic turn completed', {
              turn: turn + 1,
              toolsCalled: streamResult.toolCalls.map((tc) => tc.function.name),
              userId: user.uid,
            });
          }
        } catch (llmErr) {
          logger.warn('OpenRouter streaming failed, using fallback', {
            error: llmErr instanceof Error ? llmErr.message : String(llmErr),
          });
          responseContent = `I understand you're asking about "${message.slice(0, 50)}". Agent X is being set up — full AI responses will be available shortly. In the meantime, explore the Coordinator cards on your dashboard for quick actions.`;
          // Send the fallback as a single delta
          res.write(`event: delta\ndata: ${JSON.stringify({ content: responseContent })}\n\n`);
        }
      } else {
        // No LLM service injected — use static fallback
        responseContent = `I understand you're asking about "${message.slice(0, 50)}". Agent X is being set up — full AI responses will be available shortly. In the meantime, explore the Coordinator cards on your dashboard for quick actions.`;
        res.write(`event: delta\ndata: ${JSON.stringify({ content: responseContent })}\n\n`);
      }

      // ── Step 5: Persist assistant reply to MongoDB ───────────────────
      if (chatService && resolvedThreadId) {
        try {
          await chatService.addMessage({
            threadId: resolvedThreadId,
            userId: user.uid,
            role: 'assistant',
            content: responseContent,
            origin: 'user',
            agentId: 'general',
            tokenUsage,
          });
        } catch (chatErr) {
          logger.warn('Failed to persist assistant reply to MongoDB', {
            error: chatErr instanceof Error ? chatErr.message : String(chatErr),
            userId: user.uid,
          });
        }
      }

      // ── Step 5b: Auto-generate thread title for new conversations ────
      // Uses a cheap/fast model (extraction tier) to summarize the user's
      // intent into a 3-6 word title, matching ChatGPT/Copilot behavior.
      // Runs inline (before done event) so the title_updated SSE frame
      // reaches the client while the stream is still open.
      let generatedTitle: string | null = null;
      if (isNewThread && chatService && llmService && resolvedThreadId && responseContent) {
        try {
          generatedTitle = await chatService.generateThreadTitle(
            resolvedThreadId,
            user.uid,
            message,
            responseContent,
            llmService
          );
          if (generatedTitle) {
            res.write(
              `event: title_updated\ndata: ${JSON.stringify({ threadId: resolvedThreadId, title: generatedTitle })}\n\n`
            );
            forceProxyFlush(res);
          }
        } catch (titleErr) {
          // Title generation is non-critical — never block the response
          logger.warn('Title generation failed', {
            error: titleErr instanceof Error ? titleErr.message : String(titleErr),
            threadId: resolvedThreadId,
          });
        }
      }

      // ── Step 6: Send final metadata event and close ──────────────────
      const donePayload: Record<string, unknown> = {
        threadId: resolvedThreadId,
        model,
        usage: tokenUsage,
        timestamp: new Date().toISOString(),
      };

      // Attach autoOpenPanel instruction if any tool requested one
      if (pendingAutoOpenPanel) {
        donePayload['autoOpenPanel'] = pendingAutoOpenPanel;
        logger.info('Including autoOpenPanel in done event', {
          type: (pendingAutoOpenPanel as Record<string, unknown>)['type'],
          userId: user.uid,
        });
      }

      res.write(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`);

      // Emit operation lifecycle event — marks this thread as complete
      if (resolvedThreadId) {
        res.write(
          `event: operation\ndata: ${JSON.stringify({
            threadId: resolvedThreadId,
            status: 'complete',
            timestamp: new Date().toISOString(),
          })}\n\n`
        );
        forceProxyFlush(res);
      }

      logger.info('Agent X SSE chat completed', {
        userId: user.uid,
        model,
        threadId: resolvedThreadId,
      });

      res.end();

      // ── Step 7: Billing deduction (fire-and-forget) ────────────────────
      // Captures all accumulated LLM costs from the agentic loop (including
      // tool-call re-streams and title generation) via the job-cost-tracker.
      const { db: billingDb } = req.firebase!;
      void executeBillingDeduction({
        db: billingDb,
        userId: user.uid,
        operationId: chatOperationId,
        feature: UsageFeature.CHAT_CONVERSATION,
        environment: (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production') as
          | 'production'
          | 'staging',
        metadata: { threadId: resolvedThreadId, model, mode },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X chat failed', { error: error.message, stack: error.stack });

      // Bill for any partial streaming cost even on error (rage-quit protection)
      if (req.firebase?.db && chatUser?.uid) {
        void executeBillingDeduction({
          db: req.firebase.db,
          userId: chatUser.uid,
          operationId: chatOperationId,
          feature: UsageFeature.CHAT_CONVERSATION,
          environment: (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production') as
            | 'production'
            | 'staging',
          metadata: { error: true },
        });
      }

      // If headers haven't been sent yet, return JSON error
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to process message',
          errorCode: 'AI_SERVICE_ERROR',
        });
      } else {
        // Headers already sent (SSE mode) — send error event and close
        res.write(
          `event: error\ndata: ${JSON.stringify({ error: 'Failed to process message' })}\n\n`
        );
        // Emit operation lifecycle event — marks this thread as errored
        if (resolvedThreadId) {
          res.write(
            `event: operation\ndata: ${JSON.stringify({
              threadId: resolvedThreadId,
              status: 'error',
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
          forceProxyFlush(res);
        }
        res.end();
      }
    }
  }
);

// ─── POST /chat/send-draft — Execute a user-approved email draft (HITL) ───

router.post('/chat/send-draft', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { toEmail, subject, body } = req.body as {
      toEmail?: string;
      subject?: string;
      body?: string;
    };

    // ── Input validation ────────────────────────────────────────────────
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!toEmail || typeof toEmail !== 'string' || !emailRegex.test(toEmail)) {
      res.status(400).json({ success: false, error: 'Invalid or missing "toEmail".' });
      return;
    }
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Invalid or missing "subject".' });
      return;
    }
    if (subject.length > 500) {
      res.status(400).json({ success: false, error: '"subject" exceeds 500 characters.' });
      return;
    }
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Invalid or missing "body".' });
      return;
    }
    if (body.length > 50_000) {
      res.status(400).json({ success: false, error: '"body" exceeds 50,000 characters.' });
      return;
    }

    // ── Auto-detect provider from user's connected emails ───────────────
    const { db } = req.firebase!;
    const userDoc = await db.collection('Users').doc(user.uid).get();
    const userData = userDoc.data();
    const connectedEmails: Array<{ provider: string; isActive: boolean }> =
      userData?.['connectedEmails'] ?? [];

    const active = connectedEmails.find(
      (ce) => ce.isActive && (ce.provider === 'gmail' || ce.provider === 'microsoft')
    );

    if (!active) {
      res.status(400).json({
        success: false,
        error: 'No connected email account found. Connect Gmail or Outlook in Settings → Email.',
      });
      return;
    }

    const provider = active.provider as 'gmail' | 'microsoft';

    // ── Send via the unified email service ──────────────────────────────
    const result = await sendEmailViaProvider(user.uid, provider, toEmail, subject, body, db);

    logger.info('Draft email sent (HITL approved)', {
      userId: user.uid,
      provider,
      toEmail,
      messageId: result.externalMessageId,
    });

    res.json({
      success: true,
      data: {
        messageId: result.externalMessageId ?? null,
        provider,
        message: `Email sent to ${toEmail} via ${provider}.`,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to send draft email', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to send email.' });
  }
});

// ─── POST /playbook/generate — Generate or regenerate weekly playbook ─────

router.post('/playbook/generate', appGuard, async (req: Request, res: Response) => {
  const playbookOpId = `playbook-${crypto.randomUUID()}`;
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    if (req.firebase?.db) {
      const playbookBudgetCheck = await checkBudget(req.firebase.db, user.uid, 0);
      if (!playbookBudgetCheck.allowed) {
        res.status(402).json({
          success: false,
          error: playbookBudgetCheck.reason ?? 'Budget limit reached',
          code: 'BUDGET_EXCEEDED',
        });
        return;
      }
    }

    const result = await getGenerationService().generatePlaybook(
      user.uid,
      req.firebase?.db,
      playbookOpId
    );

    // Billing deduction (fire-and-forget)
    if (req.firebase?.db) {
      void executeBillingDeduction({
        db: req.firebase.db,
        userId: user.uid,
        operationId: playbookOpId,
        feature: UsageFeature.PLAYBOOK_GENERATION,
        environment: (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production') as
          | 'production'
          | 'staging',
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.message.includes('Set at least one goal')) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    logger.error('Failed to generate playbook', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to generate playbook' });
  }
});

// ─── POST /playbook/item/:id/status — Update a playbook item's status ─────
//
// Allows users (or Agent X) to mark a playbook item as complete, in-progress,
// or problem. Uses a Firestore transaction to prevent concurrent-update races.

router.post(
  '/playbook/item/:id/status',
  appGuard,
  validateBody(UpdatePlaybookItemStatusDto),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const itemId = req.params['id'];
      if (!itemId || typeof itemId !== 'string') {
        res.status(400).json({ success: false, error: 'Item ID is required' });
        return;
      }

      const { status } = req.body as { status: ShellWeeklyPlaybookItem['status'] };
      const { db } = req.firebase!;
      const playbooksRef = db.collection('Users').doc(user.uid).collection('agent_playbooks');

      // Find the latest playbook doc ref outside the transaction (immutable query)
      const latestPlaybook = await playbooksRef.orderBy('generatedAt', 'desc').limit(1).get();
      if (latestPlaybook.empty) {
        res.status(404).json({ success: false, error: 'No playbook found' });
        return;
      }

      const playbookRef = latestPlaybook.docs[0].ref;

      // Use a transaction to atomically read-modify-write the items array,
      // preventing concurrent status updates from silently overwriting each other.
      const updatedItem = await db.runTransaction(async (tx) => {
        const doc = await tx.get(playbookRef);
        const items = (doc.data()?.['items'] ?? []) as ShellWeeklyPlaybookItem[];
        const itemIndex = items.findIndex((i) => i.id === itemId);

        if (itemIndex === -1) return null;

        const patched: ShellWeeklyPlaybookItem = { ...items[itemIndex], status };
        const updatedItems = items.map((item, idx) => (idx === itemIndex ? patched : item));
        tx.update(playbookRef, { items: updatedItems });
        return patched;
      });

      if (!updatedItem) {
        res.status(404).json({ success: false, error: `Playbook item "${itemId}" not found` });
        return;
      }

      logger.info('Playbook item status updated', {
        userId: user.uid,
        itemId,
        status,
      });

      res.json({ success: true, data: updatedItem });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to update playbook item status', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to update playbook item status' });
    }
  }
);

// ─── POST /briefing/generate — Generate or refresh daily AI briefing ───────
//
// Generates a personalized daily briefing from the user's goals, recent
// operations, and delta sync data. Persists to agent_briefings subcollection
// and prunes old entries (keep last 7 days worth).

router.post(
  '/briefing/generate',
  appGuard,
  validateBody(GenerateBriefingDto),
  async (req: Request, res: Response) => {
    const briefingOpId = `briefing-${crypto.randomUUID()}`;
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { force = false } = req.body as { force?: boolean };

      if (req.firebase?.db) {
        const briefingBudgetCheck = await checkBudget(req.firebase.db, user.uid, 0);
        if (!briefingBudgetCheck.allowed) {
          res.status(402).json({
            success: false,
            error: briefingBudgetCheck.reason ?? 'Budget limit reached',
            code: 'BUDGET_EXCEEDED',
          });
          return;
        }
      }

      const result = await getGenerationService().generateBriefing(
        user.uid,
        force,
        req.firebase?.db,
        briefingOpId
      );

      // Billing deduction (fire-and-forget)
      if (req.firebase?.db) {
        void executeBillingDeduction({
          db: req.firebase.db,
          userId: user.uid,
          operationId: briefingOpId,
          feature: UsageFeature.BRIEFING_GENERATION,
          environment: (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production') as
            | 'production'
            | 'staging',
        });
      }

      res.json({ success: true, data: result });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to generate briefing', { error: error.message, stack: error.stack });
      res.status(500).json({ success: false, error: 'Failed to generate briefing' });
    }
  }
);

// ─── POST /pause — Pause the entire queue (admin only) ────────────────────

router.post('/pause', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    await queueService.pauseAll();
    logger.info('Agent queue paused by admin');
    res.json({ success: true, data: { paused: true } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to pause queue', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to pause queue' });
  }
});

// ─── POST /resume — Resume the queue (admin only) ─────────────────────────

router.post('/resume', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    await queueService.resumeAll();
    logger.info('Agent queue resumed by admin');
    res.json({ success: true, data: { paused: false } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to resume queue', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to resume queue' });
  }
});

// ─── GET /queue-stats — Queue health (admin only) ─────────────────────────

router.get('/queue-stats', adminGuard, async (_req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const counts = await queueService.getCounts();
    const paused = await queueService.isPaused();
    res.json({ success: true, data: { counts, paused } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get queue stats', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// ─── POST /cron/daily-briefings — Cloud Scheduler trigger (CRON only) ─────

router.post('/cron/daily-briefings', cronGuard, async (_req: Request, res: Response) => {
  try {
    const { runDailyBriefings } = await import('../modules/agent/triggers/trigger.listeners.js');
    await runDailyBriefings();
    res.json({ success: true, message: 'Daily briefings completed' });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON daily briefings failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Daily briefings failed' });
  }
});

// ─── POST /cron/summarize-threads — Cloud Scheduler trigger (CRON only) ───
// Extracts durable facts from inactive threads into long-term vector memory.

router.post('/cron/summarize-threads', cronGuard, async (_req: Request, res: Response) => {
  try {
    if (!llmService) {
      res.status(503).json({ success: false, error: 'LLM service not initialized' });
      return;
    }

    const { MemorySummarizationService } =
      await import('../modules/agent/memory/memory-summarization.service.js');
    const { VectorMemoryService } = await import('../modules/agent/memory/vector.service.js');

    const vectorMemory = new VectorMemoryService(llmService);
    const summarizer = new MemorySummarizationService(llmService, vectorMemory);
    const result = await summarizer.summarizeInactiveThreads();

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON summarize-threads failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Thread summarization failed' });
  }
});

// ─── POST /cron/cleanup-thread-media — Cloud Scheduler trigger (CRON only) ──
// Deletes Firebase Storage media for threads whose expiresAt is within the
// next 24 hours.  MongoDB TTL deletes are silent (no trigger/hook), so this
// pre-expiry sweep ensures orphaned media never accumulates.

router.post('/cron/cleanup-thread-media', cronGuard, async (_req: Request, res: Response) => {
  try {
    const { ScraperMediaService } =
      await import('../modules/agent/tools/integrations/scraper-media.service.js');
    const { AgentThreadModel: AgentThread } = await import('../models/agent-thread.model.js');

    // Find threads expiring within the next 24 hours that haven't been cleaned
    const cutoff = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const threads = await AgentThread.find({
      expiresAt: { $lte: cutoff },
      mediaCleaned: { $ne: true },
    })
      .select('_id userId')
      .limit(100)
      .lean();

    let cleaned = 0;
    let filesDeleted = 0;

    for (const thread of threads) {
      try {
        const count = await ScraperMediaService.deleteThreadMedia(
          thread.userId,
          String(thread._id)
        );
        filesDeleted += count;

        // Mark as cleaned so we don't re-process
        await AgentThread.updateOne({ _id: thread._id }, { $set: { mediaCleaned: true } });
        cleaned++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('Failed to clean thread media', {
          threadId: String(thread._id),
          userId: thread.userId,
          error: msg,
        });
        // Continue with next thread — don't fail the entire batch
      }
    }

    logger.info('CRON cleanup-thread-media completed', {
      threadsScanned: threads.length,
      threadsCleaned: cleaned,
      filesDeleted,
    });

    res.json({
      success: true,
      data: { threadsScanned: threads.length, threadsCleaned: cleaned, filesDeleted },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('CRON cleanup-thread-media failed', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Thread media cleanup failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Thread & Message CRUD (MongoDB — parallel conversation support)
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /threads — List user's conversation threads ──────────────────────

router.get('/threads', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const limitParam = req.query['limit'];
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '20') || 20, 100);
    const archived =
      req.query['archived'] === 'true'
        ? true
        : req.query['archived'] === 'false'
          ? false
          : undefined;

    // Validate cursor: must be an ISO-8601 date prefix if provided
    const beforeRaw = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;
    const before = beforeRaw && /^\d{4}-\d{2}-\d{2}T/.test(beforeRaw) ? beforeRaw : undefined;

    // Validate category against allowed enum values
    const categoryRaw =
      typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
    const category =
      categoryRaw && VALID_THREAD_CATEGORIES.has(categoryRaw)
        ? (categoryRaw as AgentThreadCategory)
        : undefined;

    const result = await chatService.getUserThreads({
      userId: user.uid,
      limit,
      before,
      archived,
      category,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to list threads', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to list threads' });
  }
});

// ─── GET /threads/:threadId — Get a single thread ─────────────────────────

router.get('/threads/:threadId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const threadId = req.params['threadId'] as string;
    if (!isValidObjectId(threadId)) {
      res.status(400).json({ success: false, error: 'Invalid thread ID format' });
      return;
    }

    const thread = await chatService.getThread(threadId, user.uid);
    if (!thread) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    res.json({ success: true, data: thread });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get thread' });
  }
});

// ─── GET /threads/:threadId/messages — Get messages for a thread ──────────

router.get('/threads/:threadId/messages', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const threadId = req.params['threadId'] as string;
    if (!isValidObjectId(threadId)) {
      res.status(400).json({ success: false, error: 'Invalid thread ID format' });
      return;
    }

    // Ownership check: verify thread belongs to this user
    const thread = await chatService.getThread(threadId, user.uid);
    if (!thread) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    const limitParam = req.query['limit'];
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '50') || 50, 200);
    const before = typeof req.query['before'] === 'string' ? req.query['before'] : undefined;

    const result = await chatService.getThreadMessages({ threadId, limit, before });

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get thread messages', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get messages' });
  }
});

// ─── PATCH /threads/:threadId — Update thread title ───────────────────────

router.patch('/threads/:threadId', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const threadId = req.params['threadId'] as string;
    if (!isValidObjectId(threadId)) {
      res.status(400).json({ success: false, error: 'Invalid thread ID format' });
      return;
    }

    const { title } = req.body as { title?: string };

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      res.status(400).json({ success: false, error: 'Title is required' });
      return;
    }

    if (title.trim().length > 200) {
      res.status(400).json({ success: false, error: 'Title must be 200 characters or less' });
      return;
    }

    const updated = await chatService.updateThreadTitle(threadId, user.uid, title.trim());
    if (!updated) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to update thread' });
  }
});

// ─── POST /threads/:threadId/archive — Archive a thread ───────────────────

router.post('/threads/:threadId/archive', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const threadId = req.params['threadId'] as string;
    if (!isValidObjectId(threadId)) {
      res.status(400).json({ success: false, error: 'Invalid thread ID format' });
      return;
    }

    const archived = await chatService.archiveThread(threadId, user.uid);
    if (!archived) {
      res.status(404).json({ success: false, error: 'Thread not found' });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to archive thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to archive thread' });
  }
});

// ─── POST /threads — Explicitly create a new empty thread ─────────────────

router.post('/threads', appGuard, async (req: Request, res: Response) => {
  try {
    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service not initialized' });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { title, category } = req.body as { title?: string; category?: string };

    // Validate category if provided
    const validCategory =
      category && VALID_THREAD_CATEGORIES.has(category)
        ? (category as AgentThreadCategory)
        : undefined;

    const thread = await chatService.createThread({
      userId: user.uid,
      title: title?.trim().slice(0, 200) || 'New Conversation',
      category: validCategory,
    });

    res.status(201).json({ success: true, data: thread });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create thread', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to create thread' });
  }
});

// ─── Firecrawl Persistent Profile Sign-In ────────────────────────────────

/** Alphanumeric + underscores only — prevents Firestore path injection. */
const PLATFORM_KEY_RE = /^[a-z0-9_]+$/i;

/** Lazy singleton — only created when a Firecrawl session is requested. */
let _firecrawlProfileService: FirecrawlProfileService | null = null;
function getFirecrawlProfileService(): FirecrawlProfileService {
  if (!_firecrawlProfileService) _firecrawlProfileService = new FirecrawlProfileService();
  return _firecrawlProfileService;
}

/** Lazy singleton for live-view sessions — only created on first request. */
let _liveViewSessionService: LiveViewSessionService | null = null;
function getLiveViewSessionService(): LiveViewSessionService {
  if (!_liveViewSessionService) _liveViewSessionService = new LiveViewSessionService();
  return _liveViewSessionService;
}

/**
 * Start an interactive browser session for a user to sign in to a third-party platform.
 * Returns an embeddable `interactiveLiveViewUrl` that the frontend renders in an iframe.
 *
 * Body: { platform: string }
 * The platform must exist in PLATFORM_REGISTRY with a `loginUrl`.
 */
router.post('/firecrawl/session/start', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { platform } = req.body;
    if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
      res.status(400).json({ success: false, error: 'Invalid platform identifier' });
      return;
    }

    // Look up the platform in the registry to get loginUrl (allowlist-based)
    const platformDef = PLATFORM_REGISTRY.find((p) => p.platform === platform && p.loginUrl);
    if (!platformDef?.loginUrl) {
      res.status(400).json({
        success: false,
        error: `Platform "${platform}" does not support Firecrawl sign-in`,
      });
      return;
    }

    const isMobile = req.body.isMobile === true;
    const service = getFirecrawlProfileService();
    const session = await service.startSignInSession(
      user.uid,
      platform,
      platformDef.loginUrl,
      isMobile
    );

    logger.info('[AgentX] Firecrawl sign-in session started', {
      userId: user.uid,
      platform,
      sessionId: session.sessionId,
      profileName: session.profileName,
    });

    res.json({
      success: true,
      data: {
        sessionId: session.sessionId,
        interactiveLiveViewUrl: session.interactiveLiveViewUrl,
        liveViewUrl: session.liveViewUrl,
        profileName: session.profileName,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to start Firecrawl sign-in session', {
      error: error.message,
      stack: error.stack,
    });

    // Handle Firecrawl 409 (concurrent saver on same profile)
    if (error.message.includes('409') || error.message.includes('conflict')) {
      res.status(409).json({
        success: false,
        error: 'Another session is currently active for this account. Please try again shortly.',
      });
      return;
    }

    // Handle concurrent session limit (free plan: 2 concurrent)
    if (error.message.includes('maximum number of concurrent')) {
      res.status(429).json({
        success: false,
        error: 'Too many active sessions. Please wait a moment and try again.',
      });
      return;
    }

    res.status(500).json({ success: false, error: 'Failed to start sign-in session' });
  }
});

/**
 * Complete a Firecrawl sign-in session — saves profile and stores in Firestore.
 *
 * Body: { sessionId: string, platform: string, profileName: string }
 */
router.post('/firecrawl/session/complete', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId, platform, profileName } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'sessionId is required' });
      return;
    }
    if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
      res.status(400).json({ success: false, error: 'Invalid platform identifier' });
      return;
    }
    if (!profileName || typeof profileName !== 'string') {
      res.status(400).json({ success: false, error: 'profileName is required' });
      return;
    }

    // Verify profileName matches expected format to prevent spoofing
    const service = getFirecrawlProfileService();
    const expectedName = service.generateProfileName(user.uid, platform);
    if (profileName !== expectedName) {
      res.status(403).json({ success: false, error: 'Profile name mismatch' });
      return;
    }

    // Delete browser session — Firecrawl saves browser state to the profile
    await service.completeSignInSession(sessionId);

    // Validate that the saved profile actually authenticated successfully.
    // Probe the login URL — if authenticated, it should redirect away from the login page.
    const platformDef = PLATFORM_REGISTRY.find((p) => p.platform === platform && p.loginUrl);
    let verified = true;

    if (platformDef?.loginUrl) {
      try {
        const probe = await service.probeProfileStatus(user.uid, platform, platformDef.loginUrl);
        verified = probe.authenticated;

        logger.info('[AgentX] Firecrawl profile probe result', {
          userId: user.uid,
          platform,
          authenticated: probe.authenticated,
          pageTitle: probe.pageTitle,
          finalUrl: probe.finalUrl,
        });
      } catch (probeErr) {
        // Probe failure is non-blocking — save as unverified rather than failing the entire flow
        logger.warn('[AgentX] Profile probe failed, saving as unverified', {
          userId: user.uid,
          platform,
          error: probeErr instanceof Error ? probeErr.message : String(probeErr),
        });
        verified = false;
      }
    }

    // Store the profile reference in Firestore
    const db = req.firebase?.db;
    if (db) {
      await db
        .collection('Users')
        .doc(user.uid)
        .set(
          {
            connectedAccounts: {
              [platform]: {
                type: 'firecrawl_profile',
                profileName,
                status: verified ? 'active' : 'unverified',
                connectedAt: new Date().toISOString(),
                ...(verified
                  ? {}
                  : { verificationNote: 'Profile probe could not confirm authentication' }),
              },
            },
          },
          { merge: true }
        );
    }

    logger.info('[AgentX] Firecrawl sign-in session completed', {
      userId: user.uid,
      platform,
      profileName,
      sessionId,
      verified,
    });

    res.json({
      success: true,
      data: { verified },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to complete Firecrawl sign-in session', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to complete sign-in session' });
  }
});

/**
 * Cancel an in-progress Firecrawl sign-in session (user dismissed the modal).
 * Cleans up the browser session without saving the profile.
 *
 * Body: { sessionId: string }
 */
router.post('/firecrawl/session/cancel', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'sessionId is required' });
      return;
    }

    // Best-effort cleanup — don't fail if already expired
    try {
      const service = getFirecrawlProfileService();
      await service.completeSignInSession(sessionId);
    } catch {
      // Session may have already expired via TTL — that's fine
    }

    logger.info('[AgentX] Firecrawl sign-in session cancelled', {
      userId: user.uid,
      sessionId,
    });

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to cancel Firecrawl session', {
      error: error.message,
    });
    res.status(500).json({ success: false, error: 'Failed to cancel session' });
  }
});

/**
 * Disconnect a Firecrawl-authenticated account.
 * Removes the profile reference from the user's Firestore document.
 *
 * Body: { platform: string }
 */
router.post('/firecrawl/session/disconnect', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { platform } = req.body;
    if (!platform || typeof platform !== 'string' || !PLATFORM_KEY_RE.test(platform)) {
      res.status(400).json({ success: false, error: 'Invalid platform identifier' });
      return;
    }

    const db = req.firebase?.db;
    if (db) {
      const { FieldValue } = await import('firebase-admin/firestore');
      await db
        .collection('Users')
        .doc(user.uid)
        .update({
          [`connectedAccounts.${platform}`]: FieldValue.delete(),
        });
    }

    logger.info('[AgentX] Firecrawl account disconnected', {
      userId: user.uid,
      platform,
    });

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to disconnect Firecrawl account', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to disconnect account' });
  }
});

// ─── LIVE VIEW SESSION ENDPOINTS ─────────────────────────────────────────────
// Provide the Agent X desktop Command Center with session-backed, interactive
// browser views. Supports both allowlisted platforms and arbitrary validated URLs.

/**
 * POST /live-view/start — Start a new live-view browser session.
 *
 * Body: { url: string, platformKey?: string }
 *  - url:         The destination URL to open in the live view.
 *  - platformKey:  Optional platform hint (e.g. 'hudl') to skip domain matching.
 *
 * Returns: { success: true, data: LiveViewSession }
 */
router.post('/live-view/start', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { url, platformKey } = req.body;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'URL is required' });
      return;
    }

    if (platformKey && (typeof platformKey !== 'string' || !PLATFORM_KEY_RE.test(platformKey))) {
      res.status(400).json({ success: false, error: 'Invalid platform key' });
      return;
    }

    // Fetch connected accounts for auth profile reuse
    const { db } = req.firebase!;
    const userDoc = await db.collection('Users').doc(user.uid).get();
    const connectedAccounts =
      (userDoc.data()?.['connectedAccounts'] as Record<
        string,
        { profileName?: string; status?: string }
      >) ?? {};

    const service = getLiveViewSessionService();
    const result = await service.startSession(user.uid, { url, platformKey }, connectedAccounts);

    logger.info('[AgentX] Live view session started', {
      userId: user.uid,
      sessionId: result.session.sessionId,
      tier: result.session.destinationTier,
      authStatus: result.session.authStatus,
    });

    res.json({ success: true, data: result.session });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    // 409 — conflict (concurrent saver on same profile)
    if (error.message.includes('409') || error.message.includes('conflict')) {
      res.status(409).json({
        success: false,
        error: 'Another session is currently active for this account. Please try again shortly.',
      });
      return;
    }

    // 429 — concurrent session limit
    if (error.message.includes('maximum number of concurrent')) {
      res.status(429).json({
        success: false,
        error: 'Too many active sessions. Please wait a moment and try again.',
      });
      return;
    }

    logger.error('[AgentX] Failed to start live view session', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to start live view session' });
  }
});

/**
 * POST /live-view/navigate — Navigate an active session to a new URL.
 *
 * Body: { sessionId: string, url: string }
 */
router.post('/live-view/navigate', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId, url } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }
    if (!url || typeof url !== 'string') {
      res.status(400).json({ success: false, error: 'URL is required' });
      return;
    }

    const service = getLiveViewSessionService();
    const result = await service.navigate(sessionId, user.uid, url);

    res.json({ success: true, data: result });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to navigate live view', { error: error.message });

    if (error.message.includes('not found') || error.message.includes('expired')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }

    res.status(500).json({ success: false, error: 'Failed to navigate' });
  }
});

/**
 * POST /live-view/refresh — Refresh the current page in an active session.
 *
 * Body: { sessionId: string }
 */
router.post('/live-view/refresh', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }

    const service = getLiveViewSessionService();
    await service.refresh(sessionId, user.uid);

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to refresh live view', { error: error.message });

    if (error.message.includes('not found') || error.message.includes('expired')) {
      res.status(404).json({ success: false, error: error.message });
      return;
    }

    res.status(500).json({ success: false, error: 'Failed to refresh' });
  }
});

/**
 * POST /live-view/close — Close and clean up a live-view session.
 *
 * Body: { sessionId: string }
 */
router.post('/live-view/close', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const { sessionId } = req.body;
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ success: false, error: 'Session ID is required' });
      return;
    }

    const service = getLiveViewSessionService();
    await service.closeSession(sessionId, user.uid);

    res.json({ success: true });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('[AgentX] Failed to close live view session', { error: error.message });
    // Swallow errors on close — best-effort cleanup
    res.json({ success: true });
  }
});

// ─── GET /health — Agent X system health (unauthenticated, highly cached) ─
// Returns the current operational status of Agent X:
//   'active'   → All systems go (green dot)
//   'degraded' → Partial issues, queue delays, or elevated error rates (yellow dot)
//   'down'     → Offline, execution paused (red dot)
//
// The endpoint checks:
//   1. Whether the BullMQ queue service is connected
//   2. Whether the LLM (OpenRouter) service is reachable
//   3. Whether Firestore is responding
//
// Cache: CDN-safe 60s cache header. No auth required — lightweight status probe.
router.get('/health', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

  try {
    // Check 1: Queue service connected?
    const queueHealthy = queueService !== null;

    // Check 2: LLM service available?
    const llmHealthy = llmService !== null;

    // Check 3: Quick Firestore read (uses request-injected db from firebaseContext)
    let firestoreHealthy = false;
    try {
      const { db } = req.firebase!;
      await db.collection('_health').doc('ping').get();
      firestoreHealthy = true;
    } catch {
      firestoreHealthy = false;
    }

    // Determine overall status
    let status: 'active' | 'degraded' | 'down';
    if (queueHealthy && llmHealthy && firestoreHealthy) {
      status = 'active';
    } else if (!queueHealthy && !llmHealthy) {
      status = 'down';
    } else {
      status = 'degraded';
    }

    res.json({ success: true, data: { status } });
  } catch (err) {
    logger.error('[AgentX] Health check failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    // If the health check itself throws, report 'down'
    res.json({ success: true, data: { status: 'down' } });
  }
});

export default router;
