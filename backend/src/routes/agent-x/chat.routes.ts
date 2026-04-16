/**
 * @fileoverview Agent X Chat Routes
 * @module @nxt1/backend/routes/agent-x/chat
 *
 * Routes: /cancel/:id, /resume-job/:operationId, /approvals/:id/resolve,
 *         /upload, /enqueue, /chat (SSE stream)
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth.middleware.js';
import { uploadRateLimit } from '../../middleware/rate-limit.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import {
  AgentChatRequestDto,
  AgentEnqueueRequestDto,
} from '../../dtos/agent-x.dto.js';
import type {
  AgentJobPayload,
  AgentJobOrigin,
  AgentYieldState,
} from '@nxt1/core';
import { isAgentYield } from '../../modules/agent/errors/agent-yield.error.js';
import { STREAM_TERMINAL_EVENTS } from '../../modules/agent/queue/pubsub.service.js';
import { notifyYield } from '../../modules/agent/services/yield-notifier.service.js';
import { logger } from '../../utils/logger.js';
import { getStorage } from 'firebase-admin/storage';
import {
  queueService,
  jobRepository,
  chatService,
  llmService,
  contextBuilder,
  toolRegistryRef,
  pubsubService,
  activeAbortControllers,
  MAX_AGENTIC_TURNS,
  getAuthUser,
  resolveThread,
  humanizeToolName,
  buildInlineApprovalCard,
  forceProxyFlush,
  replayJobEventsAsSSE,
  agentUpload,
} from './shared.js';
import crypto from 'node:crypto';

const router = Router();

router.post('/cancel/:id', appGuard, (req: Request, res: Response) => {
  const user = getAuthUser(req);
  if (!user?.uid) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const operationId = req.params['id'] as string;
  if (!operationId) {
    res.status(400).json({ success: false, error: 'Operation ID is required' });
    return;
  }

  const entry = activeAbortControllers.get(operationId);
  if (entry) {
    entry.controller.abort();
    activeAbortControllers.delete(operationId);
    logger.info('Agent X operation cancelled via explicit endpoint', {
      operationId,
      userId: user.uid,
    });
  } else {
    logger.info('Cancel requested but operation not found (may have already completed)', {
      operationId,
      userId: user.uid,
    });
  }

  res.json({ success: true, cancelled: !!entry });
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

    const { decision, toolInput } = req.body as {
      decision?: string;
      toolInput?: Record<string, unknown>;
    };
    if (decision !== 'approved' && decision !== 'rejected') {
      res.status(400).json({
        success: false,
        error: 'Decision must be "approved" or "rejected"',
      });
      return;
    }
    if (
      toolInput !== undefined &&
      (typeof toolInput !== 'object' || toolInput === null || Array.isArray(toolInput))
    ) {
      res.status(400).json({
        success: false,
        error: 'toolInput must be an object when provided',
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
        ...(toolInput ? { toolInput } : {}),
      });

      return {
        code: 200,
        operationId: approvalData['operationId'] as string | undefined,
        toolInput: (toolInput ?? approvalData['toolInput']) as Record<string, unknown> | undefined,
      } as const;
    });

    // Handle transaction rejection (auth/ownership/conflict)
    if ('error' in transactionResult) {
      res.status(transactionResult.code).json({ success: false, error: transactionResult.error });
      return;
    }

    const operationId = transactionResult.operationId;
    const resolvedToolInput = transactionResult.toolInput;
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
        yieldState: yieldState.pendingToolCall
          ? {
              ...yieldState,
              approvalId,
              pendingToolCall: {
                ...yieldState.pendingToolCall,
                toolInput: resolvedToolInput ?? yieldState.pendingToolCall.toolInput,
              },
            }
          : yieldState,
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

// ─── POST /chat — Real conversational Agent X chat (SSE Streaming) ────────

router.post(
  '/enqueue',
  appGuard,
  validateBody(AgentEnqueueRequestDto),
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      if (!queueService || !jobRepository) {
        res.status(503).json({ success: false, error: 'Agent queue is unavailable' });
        return;
      }

      const { intent, userContext, threadId } = req.body as AgentEnqueueRequestDto;
      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }

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
              agentId: 'general',
            });
          }
        } catch (threadErr) {
          logger.warn('Failed to prepare thread for background enqueue', {
            userId: user.uid,
            error: threadErr instanceof Error ? threadErr.message : String(threadErr),
          });
        }
      }

      const operationId = crypto.randomUUID();
      const sessionId = crypto.randomUUID();
      const payload: AgentJobPayload = {
        operationId,
        userId: user.uid,
        intent: intent.trim(),
        sessionId,
        origin: 'user' as AgentJobOrigin,
        context: {
          ...(userContext ?? {}),
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
        },
      };

      await jobRepository.withDb(db).create(payload);
      const jobId = await queueService.enqueue(payload, req.isStaging ? 'staging' : 'production');

      logger.info('Agent X background job enqueued', {
        operationId,
        jobId,
        userId: user.uid,
        hasThread: !!resolvedThreadId,
      });

      res.status(202).json({
        success: true,
        data: {
          jobId,
          operationId,
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to enqueue Agent X background job', {
        error: error.message,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to enqueue job' });
    }
  }
);

router.post(
  '/chat',
  appGuard,
  validateBody(AgentChatRequestDto),
  async (req: Request, res: Response) => {
    // Billing context — defined outside try so catch can access for rage-quit billing
    const chatOperationId = `chat-${crypto.randomUUID()}`;
    const chatUser = getAuthUser(req);
    let resolvedThreadId: string | undefined;

    // ── Cancellation: AbortController propagated to LLM + tool execution ──
    // Aborted when the client disconnects (req.on('close')) or via the
    // explicit POST /cancel/:operationId endpoint. The signal is passed
    // to llmService.completeStream() (which forwards it to fetch()) and
    // to each tool's ToolExecutionContext so long-running tools can bail out.
    const abortController = new AbortController();
    activeAbortControllers.set(chatOperationId, {
      controller: abortController,
      createdAt: Date.now(),
    });

    // Clean up the controller when the client drops the SSE connection.
    // This is the primary cancellation path for well-behaved connections.
    req.on('close', () => {
      if (!abortController.signal.aborted) {
        abortController.abort();
        logger.info('Agent X operation aborted via SSE disconnect', {
          operationId: chatOperationId,
          userId: chatUser?.uid,
        });
      }
      activeAbortControllers.delete(chatOperationId);
    });

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
      const inlineApprovalGate = jobRepository ? new ApprovalGateService(db) : null;
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
        `You are Agent X — The Ultimate AI Sports Coordinators. You are the AI assistant for NXT1, an AI-first sports platform.`,
        `\n[User Profile]\n${profileContext}${goalContext}`,
        threadHistoryStr ? `\n${threadHistoryStr}` : '',
        `\nBe concise, actionable, and sports-aware. Format responses with markdown and bullet points when listing items.`,
        `You can: create highlight reels, draft recruiting emails, generate scout reports, analyze film, build graphics, manage recruiting outreach, evaluate prospects, and handle NCAA compliance questions.`,
        `\n[Tool Usage Rules]`,
        `- When calling tools, extract userId, teamId, and organizationId from the [User Profile] above. NEVER ask the user for their UserID, TeamID, or OrgID — you already have them.`,
        `- If a required parameter is available in the user profile context, use it directly.`,
        `- When the user wants to BROWSE or SEE a website interactively, use the open_live_view tool. It opens a live browser in their command center. If they have a connected account for that platform, the session will be pre-authenticated.`,
        `- After opening a live view, use navigate_live_view (change URL), read_live_view (extract page content), interact_with_live_view (click/type/scroll), and close_live_view (end session) to control the SAME browser the user sees. You do NOT need to pass a sessionId — the tools auto-resolve it from the userId. For content extraction from a separate URL, use scrape_webpage. For anything already open in live view, stay within the live-view tools so the user sees the same browser state.`,
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
      // resolveBillingTarget properly resolves org membership for directors
      // and returns the correct org-level or individual-level context.
      const chatTarget = await resolveBillingTarget(db, user.uid);
      const chatCtx = chatTarget.context;
      const chatBudgetCheck = checkBudgetFromContext(chatCtx);
      if (!chatBudgetCheck.allowed) {
        const isWalletUser =
          chatCtx.billingEntity === 'individual' && chatCtx.paymentProvider === 'iap';
        res.status(402).json({
          success: false,
          error: chatBudgetCheck.reason,
          code: isWalletUser ? 'WALLET_EMPTY' : 'BUDGET_EXCEEDED',
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
        res.write(
          `event: thread\ndata: ${JSON.stringify({ threadId: resolvedThreadId, operationId: chatOperationId })}\n\n`
        );

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
      // Track tool names the agent autonomously invokes (for billing metadata)
      const invokedTools: string[] = [];
      let inlineYieldState: AgentYieldState | null = null;

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
            // Bail early if the client disconnected between loop iterations
            if (abortController.signal.aborted) {
              logger.info('Agentic loop bailing: abort signal received between turns', {
                turn,
                operationId: chatOperationId,
                userId: user.uid,
              });
              break;
            }

            const activeToolSteps = new Map<number, { id: string; name: string }>();

            const streamResult = await llmService.completeStream(
              messages,
              {
                tier: 'chat',
                maxTokens: 4096,
                temperature: 0.7,
                signal: abortController.signal,
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

            const parsedToolCalls = streamResult.toolCalls.map((tc, tcIndex) => {
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments);
              } catch {
                logger.warn('Malformed tool arguments from LLM', {
                  tool: tc.function.name,
                  args: tc.function.arguments.slice(0, 200),
                });
              }

              return {
                tc,
                parsedArgs,
                stepInfo: activeToolSteps.get(tcIndex),
              };
            });

            const approvalCandidate = inlineApprovalGate
              ? parsedToolCalls
                  .map((entry) => {
                    const requirement = inlineApprovalGate.getApprovalRequirement(
                      entry.tc.function.name,
                      entry.parsedArgs
                    );
                    return requirement ? { ...entry, requirement } : null;
                  })
                  .find((entry) => entry !== null)
              : null;

            if (approvalCandidate && jobRepository) {
              const approvalRequest = await inlineApprovalGate!.requestApproval({
                operationId: chatOperationId,
                taskId: 'inline_chat',
                userId: user.uid,
                toolName: approvalCandidate.tc.function.name,
                toolInput: approvalCandidate.parsedArgs,
                actionSummary: approvalCandidate.requirement.actionSummary,
                reasoning: streamResult.content || undefined,
                threadId: resolvedThreadId,
              });

              const yieldState: AgentYieldState = {
                reason: 'needs_approval',
                promptToUser: approvalCandidate.requirement.promptToUser,
                agentId: 'general',
                messages: messages.map((msg) => ({ ...msg })) as readonly Record<string, unknown>[],
                pendingToolCall: {
                  toolName: approvalCandidate.tc.function.name,
                  toolInput: approvalCandidate.parsedArgs,
                  toolCallId: approvalCandidate.tc.id,
                },
                approvalId: approvalRequest.id,
                yieldedAt: new Date().toISOString(),
                expiresAt: new Date(
                  Date.now() + (approvalRequest.expiresInMs ?? 86_400_000)
                ).toISOString(),
              };

              await jobRepository.withDb(db).create({
                operationId: chatOperationId,
                userId: user.uid,
                intent: message.trim(),
                sessionId: chatOperationId,
                origin: 'user' as AgentJobOrigin,
                context: {
                  ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
                },
              });
              await jobRepository.withDb(db).markYielded(chatOperationId, yieldState);

              const approvalCard = buildInlineApprovalCard({
                toolName: approvalCandidate.tc.function.name,
                approvalId: approvalRequest.id,
                operationId: chatOperationId,
                promptToUser: approvalCandidate.requirement.promptToUser,
                toolInput: approvalCandidate.parsedArgs,
              });

              if (approvalCandidate.stepInfo) {
                res.write(
                  `event: step\ndata: ${JSON.stringify({
                    id: approvalCandidate.stepInfo.id,
                    label: 'Waiting for your approval',
                    status: 'success',
                  })}\n\n`
                );
                forceProxyFlush(res);
              }

              res.write(`event: card\ndata: ${JSON.stringify(approvalCard)}\n\n`);
              forceProxyFlush(res);

              if (streamResult.content) {
                responseContent += streamResult.content;
              }

              const hitlMessage =
                approvalCandidate.tc.function.name === 'send_email'
                  ? "I've prepared a draft for your review. Edit it if needed, then approve it to continue."
                  : 'I need your approval before I take the next action. Review the confirmation card and continue when ready.';
              responseContent += hitlMessage;
              res.write(`event: delta\ndata: ${JSON.stringify({ content: hitlMessage })}\n\n`);

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

              logger.info('Inline chat yielded for approval', {
                approvalId: approvalRequest.id,
                operationId: chatOperationId,
                tool: approvalCandidate.tc.function.name,
                userId: user.uid,
              });

              break;
            }

            let heavyTaskOperationId: string | null = null;

            const toolResults = await Promise.all(
              parsedToolCalls.map(async ({ tc, parsedArgs, stepInfo }) => {
                try {
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

                  // Track tool invocation for autonomous billing metadata
                  invokedTools.push(tc.function.name);

                  const result = toolRegistryRef
                    ? await toolRegistryRef.execute(tc.function.name, parsedArgs, {
                        userId: user.uid,
                        threadId: resolvedThreadId,
                        sessionId: chatOperationId,
                        signal: abortController.signal,
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

                  // Emit media SSE event for tool results containing image/video URLs
                  // so the frontend can render them immediately (instead of waiting
                  // for the LLM to mention them in its text response).
                  if (result.success && result.data && typeof result.data === 'object') {
                    const toolData = result.data as Record<string, unknown>;
                    if (typeof toolData['imageUrl'] === 'string') {
                      try {
                        res.write(
                          `event: media\ndata: ${JSON.stringify({
                            type: 'image',
                            url: toolData['imageUrl'],
                            mimeType: toolData['mimeType'] ?? 'image/png',
                          })}\n\n`
                        );
                        forceProxyFlush(res);
                      } catch {
                        // Client disconnected
                      }
                    }
                    if (typeof toolData['videoUrl'] === 'string') {
                      try {
                        res.write(
                          `event: media\ndata: ${JSON.stringify({
                            type: 'video',
                            url: toolData['videoUrl'],
                            mimeType: toolData['mimeType'] ?? 'video/mp4',
                          })}\n\n`
                        );
                        forceProxyFlush(res);
                      } catch {
                        // Client disconnected
                      }
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
                  if (isAgentYield(toolErr) && jobRepository) {
                    const yieldPayload = toolErr.payload;
                    const now = new Date();
                    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

                    inlineYieldState = {
                      reason: yieldPayload.reason,
                      promptToUser: yieldPayload.promptToUser,
                      agentId: yieldPayload.agentId,
                      messages: yieldPayload.messages as unknown as readonly Record<
                        string,
                        unknown
                      >[],
                      pendingToolCall: yieldPayload.pendingToolCall,
                      approvalId: yieldPayload.approvalId,
                      planContext: yieldPayload.planContext,
                      yieldedAt: now.toISOString(),
                      expiresAt: expiresAt.toISOString(),
                    };

                    await jobRepository.withDb(db).create({
                      operationId: chatOperationId,
                      userId: user.uid,
                      intent: message.trim(),
                      sessionId: chatOperationId,
                      origin: 'user' as AgentJobOrigin,
                      context: {
                        ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
                      },
                    });
                    await jobRepository.withDb(db).markYielded(chatOperationId, inlineYieldState);

                    try {
                      await notifyYield(db, {
                        userId: user.uid,
                        reason: yieldPayload.reason,
                        promptToUser: yieldPayload.promptToUser,
                        operationId: chatOperationId,
                        ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
                        ...(yieldPayload.approvalId ? { approvalId: yieldPayload.approvalId } : {}),
                      });
                    } catch (notifyErr) {
                      logger.warn('Failed to dispatch inline yield notification', {
                        operationId: chatOperationId,
                        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
                      });
                    }

                    if (stepInfo) {
                      res.write(
                        `event: step\ndata: ${JSON.stringify({
                          id: stepInfo.id,
                          label:
                            yieldPayload.reason === 'needs_approval'
                              ? 'Waiting for your approval'
                              : 'Waiting for your response',
                          status: 'success',
                        })}\n\n`
                      );
                      forceProxyFlush(res);
                    }

                    const prompt = yieldPayload.promptToUser.trim();
                    if (prompt) {
                      responseContent += `${responseContent ? '\n\n' : ''}${prompt}`;
                      res.write(`event: delta\ndata: ${JSON.stringify({ content: prompt })}\n\n`);
                      forceProxyFlush(res);
                    }

                    logger.info('Inline chat yielded for user input', {
                      operationId: chatOperationId,
                      threadId: resolvedThreadId,
                      reason: yieldPayload.reason,
                      tool: tc.function.name,
                      userId: user.uid,
                    });

                    return {
                      role: 'tool' as const,
                      tool_call_id: tc.id,
                      content: JSON.stringify({
                        success: true,
                        yielded: true,
                        reason: yieldPayload.reason,
                      }),
                    };
                  }

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

            if (inlineYieldState) {
              break;
            }

            logger.info('Agentic turn completed', {
              turn: turn + 1,
              toolsCalled: streamResult.toolCalls.map((tc) => tc.function.name),
              userId: user.uid,
            });
          }
        } catch (llmErr) {
          // ── Abort handling: user cancelled or SSE disconnected ──
          // Gracefully end the stream without a fallback error message.
          // The partial responseContent (if any) is still persisted below.
          const isAbort =
            abortController.signal.aborted ||
            (llmErr instanceof Error && llmErr.name === 'AbortError');

          if (isAbort) {
            logger.info('Agent X chat aborted (user cancel or disconnect)', {
              operationId: chatOperationId,
              userId: user.uid,
              partialContentLength: responseContent.length,
            });
            // Don't write anything more — the client is gone or stopped listening.
            // Fall through to Step 5 to persist whatever partial content we have.
          } else {
            logger.warn('OpenRouter streaming failed, using fallback', {
              error: llmErr instanceof Error ? llmErr.message : String(llmErr),
            });
            responseContent = `I understand you're asking about "${message.slice(0, 50)}". Agent X is being set up — full AI responses will be available shortly. In the meantime, explore the Coordinator cards on your dashboard for quick actions.`;
            // Send the fallback as a single delta
            res.write(`event: delta\ndata: ${JSON.stringify({ content: responseContent })}\n\n`);
          }
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
      // Skip if aborted — the client is disconnected so there's no point.
      let generatedTitle: string | null = null;
      if (
        !abortController.signal.aborted &&
        isNewThread &&
        chatService &&
        llmService &&
        resolvedThreadId &&
        responseContent
      ) {
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
      // Skip SSE writes if the request was aborted (client already disconnected).
      if (!abortController.signal.aborted) {
        const donePayload: Record<string, unknown> = {
          threadId: resolvedThreadId,
          model,
          usage: tokenUsage,
          timestamp: new Date().toISOString(),
          ...(inlineYieldState ? { operationId: chatOperationId } : {}),
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

        // Emit operation lifecycle event — complete by default, awaiting_input when yielded inline
        if (resolvedThreadId) {
          res.write(
            `event: operation\ndata: ${JSON.stringify({
              threadId: resolvedThreadId,
              status: inlineYieldState ? 'awaiting_input' : 'complete',
              timestamp: new Date().toISOString(),
              operationId: chatOperationId,
              ...(inlineYieldState ? { yieldState: inlineYieldState } : {}),
            })}\n\n`
          );
          forceProxyFlush(res);
        }
      }

      logger.info('Agent X SSE chat completed', {
        userId: user.uid,
        model,
        threadId: resolvedThreadId,
      });

      // Clean up the abort controller from the registry on normal completion
      activeAbortControllers.delete(chatOperationId);

      res.end();

      // ── Step 7: Billing deduction (fire-and-forget) ────────────────────
      // Captures all accumulated LLM costs from the agentic loop (including
      // tool-call re-streams and title generation) via the job-cost-tracker.
      // All agent compute is billed under ACTIVITY_USAGE; the specific tools
      // the agent autonomously invoked are recorded in metadata so the /usage
      // breakdown can display granular line items to the user.
      const { db: billingDb } = req.firebase!;
      void executeBillingDeduction({
        db: billingDb,
        userId: user.uid,
        operationId: chatOperationId,
        feature: UsageFeature.ACTIVITY_USAGE,
        environment: (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production') as
          | 'production'
          | 'staging',
        metadata: { threadId: resolvedThreadId, model, mode, agentTools: invokedTools },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // ── Abort: user cancelled or SSE disconnected ─────────────────────
      // Don't log as an error or write error events — this is a normal flow.
      const isAbort = abortController.signal.aborted || error.name === 'AbortError';

      if (isAbort) {
        logger.info('Agent X chat handler terminated by abort', {
          operationId: chatOperationId,
          userId: chatUser?.uid,
        });
        // Clean end: the client is already disconnected, just close quietly.
        if (!res.writableEnded) {
          try {
            res.end();
          } catch {
            // Already closed — expected for aborted connections
          }
        }
        activeAbortControllers.delete(chatOperationId);
        return;
      }

      logger.error('Agent X chat failed', { error: error.message, stack: error.stack });

      // Bill for any partial streaming cost even on error (rage-quit protection)
      if (req.firebase?.db && chatUser?.uid) {
        void executeBillingDeduction({
          db: req.firebase.db,
          userId: chatUser.uid,
          operationId: chatOperationId,
          feature: UsageFeature.ACTIVITY_USAGE,
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
        try {
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
        } catch {
          // Client already disconnected — swallow write errors
        }
      }

      activeAbortControllers.delete(chatOperationId);
    }
  }
);

// ─── POST /playbook/generate — Generate or regenerate weekly playbook ─────


export default router;
