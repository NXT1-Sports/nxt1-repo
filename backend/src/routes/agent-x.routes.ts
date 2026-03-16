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
} from '@nxt1/core';
import { getShellContentForRole } from '@nxt1/core';
import { logger } from '../utils/logger.js';

/** Maximum allowed intent length (characters) to prevent prompt injection / DoS. */
const MAX_INTENT_LENGTH = 5_000;

/** Extract the authenticated user from the request (set by appGuard). */
function getAuthUser(req: Request): { uid: string } | undefined {
  return (req as Request & { user?: { uid: string } }).user;
}

// Lazy-loaded singletons (initialized by bootstrapAgentQueue in app startup)
let queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService | null = null;
let jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository | null =
  null;

/**
 * Called once at server startup to inject the queue + repo singletons.
 * This avoids circular imports and ensures Redis is connected first.
 */
export function setAgentDependencies(deps: {
  queueService: import('../modules/agent/queue/queue.service.js').AgentQueueService;
  jobRepository: import('../modules/agent/queue/job.repository.js').AgentJobRepository;
}): void {
  queueService = deps.queueService;
  jobRepository = deps.jobRepository;
}

const router: ExpressRouter = Router();

// ─── POST /ask — Enqueue a new agent job ──────────────────────────────────

router.post('/ask', appGuard, async (req: Request, res: Response) => {
  try {
    if (!queueService || !jobRepository) {
      res.status(503).json({ success: false, error: 'Agent queue not initialized' });
      return;
    }

    const { intent, sessionId, context } = req.body as {
      intent?: string;
      sessionId?: string;
      context?: Record<string, unknown>;
    };

    if (!intent || typeof intent !== 'string' || intent.trim().length === 0) {
      res.status(400).json({ success: false, error: 'intent is required' });
      return;
    }

    if (intent.trim().length > MAX_INTENT_LENGTH) {
      res.status(400).json({
        success: false,
        error: `intent exceeds maximum length of ${MAX_INTENT_LENGTH} characters`,
      });
      return;
    }

    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const operationId = crypto.randomUUID();
    const payload: AgentJobPayload = {
      operationId,
      userId: user.uid,
      intent: intent.trim(),
      sessionId: sessionId ?? crypto.randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context,
    };

    // Write to Firestore first so the frontend can listen immediately.
    // Use req.firebase.db to target the correct environment (staging vs production).
    const { db } = req.firebase!;
    await jobRepository.withDb(db).create(payload);

    // Enqueue the job in Redis/BullMQ
    const jobId = await queueService.enqueue(payload, req.isStaging ? 'staging' : 'production');

    logger.info('Agent job enqueued', { operationId, userId: user.uid });

    res.status(202).json({
      success: true,
      data: { jobId, operationId },
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
    const jobs = await jobRepository.withDb(db).getByUser(user.uid, limit);

    const entries: OperationLogEntry[] = jobs.map((job) => {
      const status = mapJobStatus(job['status'] as string);
      const category = inferCategory(job['intent'] as string);
      const createdAt = job['createdAt'] as Timestamp | undefined;
      const completedAt = job['completedAt'] as Timestamp | undefined | null;
      const result = job['result'] as { summary?: string } | null | undefined;

      return {
        id: job['operationId'] as string,
        title: (job['intent'] as string).slice(0, 120),
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
      };
    });

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

router.post('/goals', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { goals } = req.body as { goals?: AgentDashboardGoal[] };

    if (!Array.isArray(goals) || goals.length === 0 || goals.length > 2) {
      res.status(400).json({ success: false, error: 'Provide 1-2 goals' });
      return;
    }

    // Validate each goal
    for (const goal of goals) {
      if (
        !goal.id ||
        !goal.text ||
        typeof goal.text !== 'string' ||
        goal.text.trim().length === 0
      ) {
        res.status(400).json({ success: false, error: 'Each goal must have an id and text' });
        return;
      }
      if (goal.text.length > 200) {
        res.status(400).json({ success: false, error: 'Goal text must be under 200 characters' });
        return;
      }
    }

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

// ─── POST /chat — Real conversational Agent X chat ────────────────────────

router.post('/chat', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const { message, mode, history, userContext } = req.body as {
      message?: string;
      mode?: string;
      history?: Array<{ role: string; content: string }>;
      userContext?: Record<string, unknown>;
    };

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ success: false, error: 'message is required' });
      return;
    }

    if (message.trim().length > MAX_INTENT_LENGTH) {
      res.status(400).json({
        success: false,
        error: `message exceeds maximum length of ${MAX_INTENT_LENGTH} characters`,
      });
      return;
    }

    // Build system prompt based on role
    const { db } = req.firebase!;
    const userDoc = await db.collection('users').doc(user.uid).get();
    const userData = userDoc.data() ?? {};
    const role = (userData['role'] ?? 'athlete') as string;
    const sport = (userData['sport'] ?? userContext?.['sport'] ?? '') as string;
    const displayName = (userData['displayName'] ?? '') as string;
    const agentGoals: AgentDashboardGoal[] = (userData['agentGoals'] ?? []) as AgentDashboardGoal[];

    const goalContext =
      agentGoals.length > 0
        ? `Their current goals are: ${agentGoals.map((g) => g.text).join('; ')}.`
        : 'They have not set any goals yet.';

    const systemPrompt = [
      `You are Agent X, the AI assistant for NXT1 — an AI-first sports platform.`,
      `You are speaking to ${displayName || 'a user'}, who is a ${role}${sport ? ` in ${sport}` : ''}.`,
      goalContext,
      `Be concise, actionable, and sports-aware. Format responses with bullet points when listing items.`,
      `If asked about tasks you can do, mention: creating highlight reels, drafting recruiting emails, generating scout reports, analyzing film, building graphics, and managing recruiting outreach.`,
      mode ? `The user is currently in "${mode}" mode.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    // Build messages for OpenRouter
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (limit to last 10 for context)
    if (history?.length) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: 'user', content: message.trim() });

    // Call OpenRouter via the backend LLM service
    let responseContent: string;
    let model = 'unknown';

    try {
      const { OpenRouterService } = await import('../modules/agent/llm/openrouter.service.js');
      const llm = new OpenRouterService();
      const llmMessages = messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));
      const llmResult = await llm.complete(llmMessages, {
        tier: 'balanced',
        maxTokens: 1024,
        temperature: 0.7,
      });
      responseContent = llmResult.content ?? '';
      model = llmResult.model;
    } catch {
      // Graceful fallback when OpenRouter is not configured or fails
      logger.warn('OpenRouter not available for chat, using fallback');
      responseContent = `I understand you're asking about "${message.slice(0, 50)}". Agent X is being set up — full AI responses will be available shortly. In the meantime, explore the Coordinator cards on your dashboard for quick actions.`;
    }

    const responseMessage = {
      id: crypto.randomUUID(),
      role: 'assistant' as const,
      content: responseContent,
      timestamp: new Date().toISOString(),
      metadata: { model, mode },
    };

    logger.info('Agent X chat response sent', { userId: user.uid, model });

    res.json({
      success: true,
      message: responseMessage,
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Agent X chat failed', { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      errorCode: 'AI_SERVICE_ERROR',
    });
  }
});

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

export default router;
