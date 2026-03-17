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
 *   POST /api/v1/agent-x/pause       → Pause the entire queue (admin)
 *   POST /api/v1/agent-x/resume      → Resume the entire queue (admin)
 */

import { Router, type Router as ExpressRouter, type Request, type Response } from 'express';
import { appGuard, adminGuard } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { AskAgentDto, SetGoalsDto, AgentChatRequestDto } from '../dtos/agent-x.dto.js';
import { Timestamp } from 'firebase-admin/firestore';
import type {
  AgentJobPayload,
  AgentJobOrigin,
  AgentDashboardGoal,
  ShellActiveOperation,
  ShellWeeklyPlaybookItem,
  ShellBriefingInsight,
  OperationLogEntry,
  OperationLogStatus,
  OperationLogCategory,
  AgentThreadCategory,
} from '@nxt1/core';
import { getShellContentForRole } from '@nxt1/core';
import type { AgentChatService } from '../modules/agent/services/agent-chat.service.js';
import type { ContextBuilder } from '../modules/agent/memory/context-builder.js';
import type { OpenRouterService } from '../modules/agent/llm/openrouter.service.js';
import { logger } from '../utils/logger.js';

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

/**
 * Maps the raw AgentOperationStatus from Firestore to the display-friendly
 * OperationLogStatus used by the frontend bottom sheet component.
 */
function mapJobStatus(status: string): OperationLogStatus {
  switch (status) {
    case 'completed':
      return 'complete';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'in-progress';
  }
}

/** Infer an operation category from the job intent text. */
function inferCategory(intent: string): OperationLogCategory {
  const lower = intent.toLowerCase();
  if (
    lower.includes('email') ||
    lower.includes('outreach') ||
    lower.includes('coach') ||
    lower.includes('send')
  )
    return 'outreach';
  if (
    lower.includes('highlight') ||
    lower.includes('graphic') ||
    lower.includes('video') ||
    lower.includes('reel') ||
    lower.includes('post') ||
    lower.includes('brand')
  )
    return 'content';
  if (
    lower.includes('film') ||
    lower.includes('game') ||
    lower.includes('footage') ||
    lower.includes('play')
  )
    return 'film';
  if (
    lower.includes('recruit') ||
    lower.includes('camp') ||
    lower.includes('ncaa') ||
    lower.includes('transfer') ||
    lower.includes('prospect')
  )
    return 'recruiting';
  if (
    lower.includes('stat') ||
    lower.includes('analytics') ||
    lower.includes('report') ||
    lower.includes('scout') ||
    lower.includes('compare')
  )
    return 'analytics';
  if (
    lower.includes('profile') ||
    lower.includes('bio') ||
    lower.includes('photo') ||
    lower.includes('gpa') ||
    lower.includes('academic')
  )
    return 'profile';
  return 'system';
}

/** Pick an icon based on category. */
function iconForCategory(category: OperationLogCategory): string {
  switch (category) {
    case 'outreach':
      return 'mail';
    case 'content':
      return 'sparkles';
    case 'film':
      return 'videocam';
    case 'recruiting':
      return 'school';
    case 'analytics':
      return 'barChart';
    case 'profile':
      return 'person';
    case 'system':
      return 'settings';
  }
}

/** Compute a human-readable duration between two Firestore Timestamps. */
function computeDuration(
  createdAt: Timestamp | undefined,
  completedAt: Timestamp | undefined | null
): string | undefined {
  if (!createdAt || !completedAt) return undefined;
  const diffMs = completedAt.toMillis() - createdAt.toMillis();
  if (diffMs <= 0) return '0m 00s';
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

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
    const limit = Math.min(parseInt(typeof limitParam === 'string' ? limitParam : '50') || 50, 100);

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

    for (const job of jobs) {
      const intent = (job['intent'] as string) ?? '';
      if (!intent) continue; // skip malformed documents

      const status = mapJobStatus((job['status'] as string) ?? '');
      const category = inferCategory(intent);
      const createdAt = job['createdAt'] as Timestamp | undefined;
      const completedAt = job['completedAt'] as Timestamp | undefined | null;
      const result = job['result'] as { summary?: string } | null | undefined;

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
        metadata: {
          origin: job['origin'],
          agent: (result as Record<string, unknown> | null)?.['agent'] ?? null,
        },
      });
    }

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
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data() ?? {};
    const role: string = userData['role'] ?? 'athlete';
    const agentGoals: AgentDashboardGoal[] = userData['agentGoals'] ?? [];

    // Coordinators are role-determined (static, no AI needed)
    const shellContent = getShellContentForRole(role);

    // Fetch active operations from Firestore (real-time source of truth)
    // Wrapped in its own try/catch so a missing composite index doesn't break the entire dashboard
    let activeOperations: ShellActiveOperation[] = [];
    try {
      const opsSnapshot = await db
        .collection('users')
        .doc(user.uid)
        .collection('agent_operations')
        .where('status', 'in', ['processing', 'queued'])
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

      activeOperations = opsSnapshot.docs.map((doc) => {
        const d = doc.data();
        return {
          id: doc.id,
          label: (d['label'] ??
            (d['intent'] as string | undefined)?.slice(0, 60) ??
            'Processing...') as string,
          progress: (d['progress'] ?? 0) as number,
          icon: (d['icon'] ?? 'sparkles') as string,
          status:
            d['status'] === 'complete'
              ? ('complete' as const)
              : d['status'] === 'error'
                ? ('error' as const)
                : ('processing' as const),
        };
      });
    } catch (opsErr) {
      // Graceful degradation — composite index may not exist yet
      const opsError = opsErr instanceof Error ? opsErr : new Error(String(opsErr));
      logger.warn('Failed to fetch agent operations (composite index may be missing)', {
        error: opsError.message,
        userId: user.uid,
      });
    }

    // Fetch generated briefing (or fall back to static defaults)
    const briefingDoc = await db
      .collection('users')
      .doc(user.uid)
      .collection('agent_briefings')
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    let briefingInsights: ShellBriefingInsight[] = [...shellContent.briefingInsights];
    let briefingPreviewText = shellContent.briefingPreviewText.replace(
      '{count}',
      String(briefingInsights.length)
    );
    let briefingGeneratedAt = new Date().toISOString();

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
      .collection('users')
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

    // Store goals on user document
    await db
      .collection('users')
      .doc(user.uid)
      .set({ agentGoals: goals, agentGoalsUpdatedAt: new Date().toISOString() }, { merge: true });

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
        const userDoc = await db.collection('users').doc(user.uid).get();
        const userData = userDoc.data() ?? {};
        const role = (userData['role'] ?? 'athlete') as string;
        const displayName = (userData['displayName'] ?? '') as string;
        const sport = (userData['sport'] ?? '') as string;
        profileContext = `User: ${displayName} | Role: ${role}${sport ? ` | Sport: ${sport}` : ''}`;
      }

      // Fetch agent goals from Firestore (lightweight — not part of ContextBuilder)
      const goalsDoc = await db.collection('users').doc(user.uid).get();
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

    const { db } = req.firebase!;
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data() ?? {};
    const role = (userData['role'] ?? 'athlete') as string;
    const sport = (userData['sport'] ?? '') as string;
    const displayName = (userData['displayName'] ?? '') as string;
    const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    if (agentGoals.length === 0) {
      res
        .status(400)
        .json({ success: false, error: 'Set at least one goal before generating a playbook' });
      return;
    }

    const goalsText = agentGoals
      .map((g, i) => `${i + 1}. ${g.text} (category: ${g.category})`)
      .join('\n');

    const prompt = [
      `You are Agent X, the AI assistant for NXT1 sports platform.`,
      `Generate a personalized weekly playbook for ${displayName || 'the user'}, a ${role}${sport ? ` in ${sport}` : ''}.`,
      `Their goals are:\n${goalsText}`,
      ``,
      `Return EXACTLY a JSON array of 3-5 playbook items. Each item must have:`,
      `- "id": unique string like "wp-1"`,
      `- "weekLabel": day abbreviation ("Mon", "Tue", "Wed", "Thu", "Fri")`,
      `- "title": short action title (max 50 chars)`,
      `- "summary": one-sentence description`,
      `- "details": detailed explanation of what Agent X prepared`,
      `- "actionLabel": button text (e.g., "Review Draft", "Send Emails")`,
      `- "status": always "pending"`,
      `- "goal": object with "id" and "label" matching one of the user's goals`,
      ``,
      `Return ONLY the JSON array, no markdown fences, no explanation.`,
    ].join('\n');

    let playbookItems: ShellWeeklyPlaybookItem[] = [];

    try {
      const { OpenRouterService } = await import('../modules/agent/llm/openrouter.service.js');
      const llm = new OpenRouterService();
      const llmResult = await llm.complete(
        [
          { role: 'system', content: 'You are a JSON generator. Return only valid JSON arrays.' },
          { role: 'user', content: prompt },
        ],
        {
          tier: 'balanced',
          maxTokens: 2048,
          temperature: 0.7,
          jsonMode: true,
        }
      );

      try {
        // Strip any markdown fences if present
        let jsonText = (llmResult.content ?? '').trim();
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
        }
        const parsed = JSON.parse(jsonText) as unknown;
        if (Array.isArray(parsed)) {
          playbookItems = parsed.map((item: Record<string, unknown>) => ({
            id: String(item['id'] ?? `wp-${crypto.randomUUID().slice(0, 8)}`),
            weekLabel: String(item['weekLabel'] ?? ''),
            title: String(item['title'] ?? ''),
            summary: String(item['summary'] ?? ''),
            details: String(item['details'] ?? ''),
            actionLabel: String(item['actionLabel'] ?? 'Take Action'),
            status: 'pending' as const,
            goal:
              item['goal'] && typeof item['goal'] === 'object'
                ? {
                    id: String((item['goal'] as Record<string, unknown>)['id'] ?? ''),
                    label: String((item['goal'] as Record<string, unknown>)['label'] ?? ''),
                  }
                : undefined,
          }));
        }
      } catch (parseErr) {
        logger.error('Failed to parse playbook JSON from LLM', { error: String(parseErr) });
      }
    } catch {
      // OpenRouter not available or failed — fall through to template fallback
      logger.warn('OpenRouter not available for playbook generation, using fallback');
    }

    // Fallback: generate template-based playbook if LLM unavailable or parse fails
    if (playbookItems.length === 0) {
      playbookItems = agentGoals.flatMap((goal, gi) => [
        {
          id: `wp-${gi * 2 + 1}`,
          weekLabel: gi === 0 ? 'Mon' : 'Wed',
          title: `Work on: ${goal.text.slice(0, 40)}`,
          summary: `Agent X has prepared action steps for your "${goal.text}" goal.`,
          details: `Review the plan and take the first step toward achieving your goal.`,
          actionLabel: 'Review Plan',
          status: 'pending' as const,
          goal: { id: goal.id, label: goal.text.slice(0, 30) },
        },
      ]);
    }

    const generatedAt = new Date().toISOString();

    // Persist the generated playbook
    await db.collection('users').doc(user.uid).collection('agent_playbooks').add({
      items: playbookItems,
      goals: agentGoals,
      generatedAt,
      role,
    });

    logger.info('Agent playbook generated', {
      userId: user.uid,
      itemCount: playbookItems.length,
      goalCount: agentGoals.length,
    });

    res.json({
      success: true,
      data: {
        items: playbookItems,
        goals: agentGoals,
        generatedAt,
        canRegenerate: true,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to generate playbook', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to generate playbook' });
  }
});

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

export default router;
