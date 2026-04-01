/**
 * @fileoverview Agent X Routes
 * @module @nxt1/backend/routes/agent-x
 *
 * REST API for the Agent X background job engine.
 * All heavy work runs via BullMQ workers — these endpoints
 * enqueue jobs and return status. The frontend polls status
 * or listens to Firestore for real-time updates.
 *
 * Routes:
 *   POST /api/v1/agent-x/ask         → Enqueue a new agent job
 *   GET  /api/v1/agent-x/status/:id  → Poll job progress/result
 *   POST /api/v1/agent-x/cancel/:id  → Cancel an active job
 *   GET  /api/v1/agent-x/history     → Get user's job history
 *   POST /api/v1/agent-x/resume-job/:operationId → Resume a yielded agent job
 *   POST /api/v1/agent-x/approvals/:id/resolve   → Resolve an approval request
 *   POST /api/v1/agent-x/playbook/item/:id/status → Update playbook item status
 *   POST /api/v1/agent-x/briefing/generate         → Generate daily AI briefing
 *   POST /api/v1/agent-x/pause       → Pause the entire queue (admin)
 *   POST /api/v1/agent-x/resume      → Resume the entire queue (admin)
 *   POST /api/v1/agent-x/cron/daily-briefings → Run daily briefings (Cloud Scheduler)
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { appGuard, adminGuard, cronGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  AskAgentDto,
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
  ShellActiveOperation,
  ShellWeeklyPlaybookItem,
  ShellBriefingInsight,
  OperationLogEntry,
  AgentThreadCategory,
  AgentYieldState,
} from '@nxt1/core';
import { getShellContentForRole } from '@nxt1/core';
import type { AgentChatService } from '../modules/agent/services/agent-chat.service.js';
import type { ContextBuilder } from '../modules/agent/memory/context-builder.js';
import type { OpenRouterService } from '../modules/agent/llm/openrouter.service.js';
import { logger } from '../utils/logger.js';
import {
  validateJobOrigin,
  mapJobStatus,
  inferCategory,
  iconForCategory,
  computeDuration,
} from './operations-log.helpers.js';
import { AgentGenerationService } from '../modules/agent/services/generation.service.js';
import { FirecrawlProfileService } from '../modules/agent/tools/scraping/firecrawl-profile.service.js';
import { PLATFORM_REGISTRY } from '@nxt1/core';

/** Lazy singleton for content generation — avoids eager init at import time. */
let _generationService: AgentGenerationService | null = null;
function getGenerationService(): AgentGenerationService {
  if (!_generationService) _generationService = new AgentGenerationService();
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
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
  chatService = deps.chatService;
  contextBuilder = deps.contextBuilder;
  llmService = deps.llmService;
}

const router: ExpressRouter = Router();

// ─── POST /ask — Enqueue a new agent job ──────────────────────────────────

router.post('/ask', appGuard, validateBody(AskAgentDto), async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const { intent, sessionId, context, threadId } = req.body as AskAgentDto;

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const operationId = crypto.randomUUID();

    // ─── Thread persistence (MongoDB) ────────────────────────────────
    let resolvedThreadId: string | undefined;
    if (chatService) {
      try {
        resolvedThreadId = await resolveThread(chatService, user.uid, threadId, intent);

        if (resolvedThreadId) {
          await chatService.addMessage({
            threadId: resolvedThreadId,
            userId: user.uid,
            role: 'user',
            content: intent.trim(),
            origin: 'user',
            operationId,
          });
        }
      } catch (chatErr) {
        // Chat persistence must never block the job — log and continue
        logger.warn('Failed to persist user message to MongoDB', {
          error: chatErr instanceof Error ? chatErr.message : String(chatErr),
          userId: user.uid,
        });
      }
    }

    const payload: AgentJobPayload = {
      operationId,
      userId: user.uid,
      intent: intent.trim(),
      sessionId: sessionId ?? crypto.randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context: { ...context, threadId: resolvedThreadId },
    };

    // Write to Firestore first so the frontend can listen immediately.
    // Use req.firebase.db to target the correct environment (staging vs production).
    const { db } = req.firebase!;
    await jobRepository.withDb(db).create(payload);

    // Enqueue the job in Redis/BullMQ
    const jobId = await queueService.enqueue(payload, req.isStaging ? 'staging' : 'production');

    logger.info('Agent job enqueued', {
      operationId,
      userId: user.uid,
      threadId: resolvedThreadId,
    });

    res.status(202).json({
      success: true,
      data: { jobId, operationId, threadId: resolvedThreadId },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to enqueue agent job', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to process request',
    });
  }
});

// ─── GET /status/:id — Poll job progress ──────────────────────────────────

router.get('/status/:id', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      res.status(400).json({ success: false, error: 'Job ID is required' });
      return;
    }

    // Verify ownership: only the job's creator can poll status
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const status = await queueService.getJobStatus(id);

    if (!status) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    // Ownership check: job must belong to the requesting user
    if (status.userId && status.userId !== user.uid) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    res.json({ success: true, data: status });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to get job status', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

// ─── POST /cancel/:id — Cancel an active job ─────────────────────────────

router.post('/cancel/:id', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      res.status(400).json({ success: false, error: 'Job ID is required' });
      return;
    }

    // Verify ownership: only the job's creator can cancel
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    // Check ownership before allowing cancel
    const status = await queueService.getJobStatus(id);
    if (!status) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }
    if (status.userId && status.userId !== user.uid) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

    const cancelled = await queueService.cancel(id);

    if (cancelled) {
      const { db } = req.firebase!;
      await jobRepository.withDb(db).markCancelled(id);
      logger.info('Agent job cancelled', { operationId: id, userId: user.uid });
    }

    res.json({ success: true, data: { cancelled } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to cancel job', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to cancel job' });
  }
});

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

    // Fetch daily operations from Firestore (top-level agentJobs collection).
    // Use the same persisted recent-jobs source as the Activity Log, then
    // filter in memory. This avoids composite-index drift and keeps the
    // dashboard aligned with what users already see in the log.
    let activeOperations: ShellActiveOperation[] = [];
    if (jobRepository) {
      try {
        const jobs = await jobRepository.withDb(db).getByUser(user.uid, 50);
        const todayStartMs = new Date(new Date().setHours(0, 0, 0, 0)).getTime();

        activeOperations = jobs
          .filter((job) => {
            const status = (job['status'] as string) ?? '';
            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
              const completedAt = job['completedAt'] as Timestamp | null | undefined;
              return completedAt ? completedAt.toMillis() >= todayStartMs : false;
            }
            return true;
          })
          .slice(0, 10)
          .map((job) => {
            const progress = job['progress'] as Record<string, unknown> | null;
            const mappedStatus = mapJobStatus((job['status'] as string) ?? '');
            return {
              id: (job['operationId'] as string) ?? '',
              label: ((job['intent'] as string | undefined)?.slice(0, 60) ??
                'Processing...') as string,
              progress:
                typeof progress?.['percent'] === 'number' ? (progress['percent'] as number) : 0,
              icon: 'sparkles' as string,
              status:
                mappedStatus === 'complete'
                  ? ('complete' as const)
                  : mappedStatus === 'error' || mappedStatus === 'cancelled'
                    ? ('error' as const)
                    : ('processing' as const),
              // Pass the Mongo thread ID so the frontend can open the real worker logs.
              threadId: (job['threadId'] as string) || undefined,
              // Pass error message for failed operations so the chat can display it.
              ...(mappedStatus === 'error' || mappedStatus === 'cancelled'
                ? {
                    errorMessage:
                      (job['error'] as string) ??
                      'This operation failed unexpectedly. You can retry it.',
                  }
                : {}),
            };
          });
      } catch (opsErr) {
        const opsError = opsErr instanceof Error ? opsErr : new Error(String(opsErr));
        logger.warn('Failed to fetch agent operations from job repository', {
          error: opsError.message,
          userId: user.uid,
        });
      }
    }

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
        activeOperations,
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

// ─── POST /chat — Real conversational Agent X chat (SSE Streaming) ────────

router.post(
  '/chat',
  appGuard,
  validateBody(AgentChatRequestDto),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { message, mode, history, threadId } = req.body as AgentChatRequestDto;

      // ── Step 1: Resolve thread (create or verify ownership) ──────────
      let resolvedThreadId: string | undefined;
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
        mode ? `\nThe user is currently in "${mode}" mode.` : '',
      ]
        .filter(Boolean)
        .join('');

      // ── Step 3: Build LLM messages array ─────────────────────────────
      const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      // Add client-sent conversation history (limit to last 10)
      if (history?.length) {
        const recentHistory = history.slice(-10);
        for (const msg of recentHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        }
      }

      messages.push({ role: 'user', content: message.trim() });

      // ── Step 4: Stream response via SSE ──────────────────────────────
      //
      // SSE Protocol:
      //   event: delta    → { content: "token fragment" }
      //   event: done     → { threadId, model, usage }
      //   event: error    → { error: "message" }
      //
      // The frontend reads these events via EventSource or fetch + ReadableStream.
      //
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering for SSE
      });

      // Send initial threadId so the frontend knows which thread to reference
      if (resolvedThreadId) {
        res.write(`event: thread\ndata: ${JSON.stringify({ threadId: resolvedThreadId })}\n\n`);
      }

      // Attempt streaming; fall back to non-streaming if LLM service is unavailable
      let responseContent = '';
      let model = 'unknown';
      let tokenUsage: { inputTokens: number; outputTokens: number; model: string } | undefined;

      if (llmService) {
        try {
          const streamResult = await llmService.completeStream(
            messages,
            { tier: 'balanced', maxTokens: 1024, temperature: 0.7 },
            (delta) => {
              if (delta.content) {
                res.write(`event: delta\ndata: ${JSON.stringify({ content: delta.content })}\n\n`);
              }
            }
          );

          responseContent = streamResult.content;
          model = streamResult.model;
          tokenUsage = {
            inputTokens: streamResult.usage.inputTokens,
            outputTokens: streamResult.usage.outputTokens,
            model: streamResult.model,
          };
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

      // ── Step 6: Send final metadata event and close ──────────────────
      const donePayload = {
        threadId: resolvedThreadId,
        model,
        usage: tokenUsage,
        timestamp: new Date().toISOString(),
      };
      res.write(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`);

      logger.info('Agent X SSE chat completed', {
        userId: user.uid,
        model,
        threadId: resolvedThreadId,
      });

      res.end();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Agent X chat failed', { error: error.message, stack: error.stack });

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
        res.end();
      }
    }
  }
);

// ─── POST /playbook/generate — Generate or regenerate weekly playbook ─────

router.post('/playbook/generate', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await getGenerationService().generatePlaybook(user.uid, req.firebase?.db);
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
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { force = false } = req.body as { force?: boolean };
      const result = await getGenerationService().generateBriefing(
        user.uid,
        force,
        req.firebase?.db
      );
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

export default router;
