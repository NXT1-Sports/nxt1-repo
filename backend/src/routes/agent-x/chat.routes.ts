/**
 * @fileoverview Agent X — Chat & conversation routes.
 *
 * POST /cancel/:id
 * POST /resume-job/:operationId
 * POST /approvals/:id/resolve
 * POST /enqueue
 * POST /chat
 */

import { Router, type Request, type Response } from 'express';
import { appGuard } from '../../middleware/auth.middleware.js';
import { validateBody } from '../../middleware/validation.middleware.js';
import { AgentChatRequestDto, AgentEnqueueRequestDto } from '../../dtos/agent-x.dto.js';
import type {
  AgentJobPayload,
  AgentJobOrigin,
  AgentDashboardGoal,
  AgentYieldState,
} from '@nxt1/core';
import { isAgentYield } from '../../modules/agent/exceptions/agent-yield.exception.js';
import type { LLMMessage, LLMContentPart } from '../../modules/agent/llm/llm.types.js';
import { buildSseStreamCallback } from './sse-stream-adapter.js';
import { DebouncedEventWriter } from '../../modules/agent/queue/event-writer.js';
import type { StreamEvent } from '../../modules/agent/queue/event-writer.js';
import { STREAM_TERMINAL_EVENTS } from '../../modules/agent/queue/pubsub.service.js';
import { notifyYield } from '../../modules/agent/services/yield-notifier.service.js';
import { logger } from '../../utils/logger.js';
import {
  executeBillingDeduction,
  UsageFeature,
  resolveBillingTarget,
  checkBudgetFromContext,
} from '../../modules/billing/index.js';
import crypto from 'node:crypto';

import {
  queueService,
  jobRepository,
  chatService,
  contextBuilder,
  llmService,
  pubsubService,
  activeAbortControllers,
  getAuthUser,
  resolveThread,
  replayJobEventsAsSSE,
  buildInlineApprovalCard,
  buildInlineAskUserCard,
  forceProxyFlush,
  agentRouterRef,
} from './shared.js';

const router = Router();

// ─── POST /cancel/:id — Explicit cancellation endpoint ───────────────────

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

    if (jobDoc.userId !== user.uid) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }

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

    if (new Date(yieldState.expiresAt).getTime() < Date.now()) {
      await jobRepository.withDb(db).markFailed(operationId, 'Yield expired before user responded');
      res.status(410).json({ success: false, error: 'This request has expired' });
      return;
    }

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

    const resumedPayload: AgentJobPayload = {
      operationId: crypto.randomUUID(),
      userId: user.uid,
      intent: jobDoc.intent,
      sessionId: crypto.randomUUID(),
      origin: 'user' as AgentJobOrigin,
      context: {
        threadId,
        resumedFrom: operationId,
        yieldState: {
          ...yieldState,
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

    await jobRepository.withDb(db).create(resumedPayload);
    await jobRepository.withDb(db).markCompleted(operationId, {
      summary: `Resumed by user — continuing as ${resumedPayload.operationId}`,
      data: { resumedAs: resumedPayload.operationId },
    });

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
    const approvalRef = db.collection('AgentApprovalRequests').doc(approvalId);

    const transactionResult = await db.runTransaction(async (txn) => {
      const approvalSnap = await txn.get(approvalRef);
      if (!approvalSnap.exists) return { code: 404, error: 'Approval request not found' } as const;

      const approvalData = approvalSnap.data()!;

      if (approvalData['userId'] !== user.uid) {
        return { code: 404, error: 'Approval request not found' } as const;
      }

      if (approvalData['status'] !== 'pending') {
        return {
          code: 409,
          error: `Approval is already "${approvalData['status']}"`,
        } as const;
      }

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

    if ('error' in transactionResult) {
      res.status(transactionResult.code).json({ success: false, error: transactionResult.error });
      return;
    }

    const operationId = transactionResult.operationId;
    const resolvedToolInput = transactionResult.toolInput;
    if (!operationId) {
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    const jobDoc = await jobRepository.withDb(db).getById(operationId);
    if (!jobDoc) {
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    const yieldState = jobDoc.yieldState as AgentYieldState | undefined;

    if (decision === 'rejected') {
      await jobRepository.withDb(db).markCancelled(operationId);
      res.json({ success: true, data: { decision, resumed: false } });
      return;
    }

    if (!yieldState?.pendingToolCall) {
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

// ─── POST /enqueue — Background enqueue without SSE ──────────────────────

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

// ─── POST /chat — Real conversational Agent X chat (SSE Streaming) ────────

router.post(
  '/chat',
  appGuard,
  validateBody(AgentChatRequestDto),
  async (req: Request, res: Response) => {
    const chatOperationId = `chat-${crypto.randomUUID()}`;
    const chatUser = getAuthUser(req);
    let resolvedThreadId: string | undefined;
    let chatEventWriter: DebouncedEventWriter | null = null;

    const abortController = new AbortController();
    activeAbortControllers.set(chatOperationId, {
      controller: abortController,
      createdAt: Date.now(),
    });

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

      const { message, mode, history, threadId, attachments, resumeOperationId, afterSeq } =
        req.body as AgentChatRequestDto;

      // ── Pre-compute enriched message text ─────────────────────────────
      // Build the full enriched text BEFORE Step 1 so it can be stored in
      // thread history. This means follow-up turns always have full context
      // (video IDs, image URLs, doc references) in their history — not just
      // the raw typed message.
      const _allAttachments = attachments ?? [];
      const _fileAttachments = _allAttachments.filter(
        (a: { mimeType: string }) =>
          a.mimeType.startsWith('image/') ||
          a.mimeType === 'application/pdf' ||
          a.mimeType === 'text/csv' ||
          a.mimeType === 'text/plain' ||
          a.mimeType === 'application/vnd.ms-excel' ||
          a.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          a.mimeType === 'application/msword' ||
          a.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) as {
        id: string;
        url: string;
        name: string;
        mimeType: string;
        type: string;
        sizeBytes: number;
      }[];
      const _videoAttachments = _allAttachments.filter((a: { mimeType: string }) =>
        a.mimeType.startsWith('video/')
      ) as {
        id: string;
        url: string;
        name: string;
        mimeType: string;
        type: string;
        sizeBytes: number;
        cloudflareVideoId?: string;
      }[];

      // Produce enriched text that carries all attachment references.
      // This is what gets stored in thread history so future turns retain full context.
      let enrichedMessageText = message.trim();
      if (_videoAttachments.length > 0) {
        const videoRefs = _videoAttachments
          .map((v) => {
            const idPart = v.cloudflareVideoId
              ? ` | cloudflareVideoId: ${v.cloudflareVideoId}`
              : '';
            return `[Attached video: ${v.name} — ${v.url}${idPart}]`;
          })
          .join('\n');
        enrichedMessageText = `${enrichedMessageText}\n\n${videoRefs}`;
      }
      if (_fileAttachments.length > 0) {
        const fileRefs = _fileAttachments
          .map((f) => `[Attached file: ${f.name} (${f.mimeType}) — ${f.url}]`)
          .join('\n');
        enrichedMessageText = `${enrichedMessageText}\n\n${fileRefs}`;
      }

      // ── Drop Recovery ─────────────────────────────────────────────────
      if (resumeOperationId && pubsubService && jobRepository) {
        logger.info('Drop recovery: resuming heavy task stream', {
          operationId: resumeOperationId,
          userId: user.uid,
        });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        try {
          const job = await jobRepository.getById(resumeOperationId);
          if (!job || job.userId !== user.uid) {
            res.write(
              `event: error\ndata: ${JSON.stringify({ error: 'Operation not found or unauthorized' })}\n\n`
            );
            res.end();
            return;
          }

          if (job.status === 'completed' || job.status === 'failed') {
            const events = await jobRepository.getJobEvents(resumeOperationId);
            replayJobEventsAsSSE(res, events, afterSeq);
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

          const events = await jobRepository.getJobEvents(resumeOperationId);
          replayJobEventsAsSSE(res, events, afterSeq);

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

        return;
      }

      // ── Step 1: Resolve thread ────────────────────────────────────────
      const isNewThread = !threadId;
      if (chatService) {
        try {
          resolvedThreadId = await resolveThread(chatService, user.uid, threadId, message);

          if (resolvedThreadId) {
            await chatService.addMessage({
              threadId: resolvedThreadId,
              userId: user.uid,
              role: 'user',
              content: enrichedMessageText,
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

      // ── Step 2: Build system prompt ───────────────────────────────────
      const { db } = req.firebase!;
      // ApprovalGateService is handled inside AgentRouter — no local instance needed.
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

        if (resolvedThreadId) {
          try {
            threadHistoryStr = await contextBuilder.getRecentThreadHistory(resolvedThreadId, 20);
          } catch {
            // Thread history is non-critical
          }
        }
      }

      if (!profileContext) {
        const userDoc = await db.collection('Users').doc(user.uid).get();
        const userData = userDoc.data() ?? {};
        const role = (userData['role'] ?? 'athlete') as string;
        const displayName = (userData['displayName'] ?? '') as string;
        const sport = (userData['sport'] ?? '') as string;
        profileContext = `User: ${displayName} | Role: ${role}${sport ? ` | Sport: ${sport}` : ''}`;
      }

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

      if (history?.length) {
        const recentHistory = history.slice(-10);
        for (const msg of recentHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
          }
        }
      }

      // Reuse the pre-computed attachment splits from above (already filtered).
      const fileAttachments = _fileAttachments;
      const videoAttachments = _videoAttachments;

      // enrichedMessageText already contains video + file refs (built before Step 1).
      if (fileAttachments.length > 0) {
        const contentParts: LLMContentPart[] = [{ type: 'text', text: enrichedMessageText }];
        for (const att of fileAttachments) {
          contentParts.push({
            type: 'image_url',
            image_url: { url: att.url, detail: 'auto' },
          });
        }
        messages.push({ role: 'user', content: contentParts });
      } else {
        messages.push({ role: 'user', content: enrichedMessageText });
      }

      // ── Step 4: Budget preflight ──────────────────────────────────────
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
        'X-Accel-Buffering': 'no',
      });

      res.flushHeaders();
      res.socket?.setNoDelay(true);

      if (resolvedThreadId) {
        res.write(
          `event: thread\ndata: ${JSON.stringify({ threadId: resolvedThreadId, operationId: chatOperationId })}\n\n`
        );

        forceProxyFlush(res);

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

      let responseContent = '';
      let model = 'unknown';
      let tokenUsage: { inputTokens: number; outputTokens: number; model: string } | undefined;
      let pendingAutoOpenPanel: Record<string, unknown> | null = null;
      const invokedTools: string[] = [];

      // ── Step 3: Build AgentJobPayload + stream through AgentRouter ────
      const chatPayload: AgentJobPayload = {
        operationId: chatOperationId,
        userId: user.uid,
        intent: message.trim(),
        sessionId: crypto.randomUUID(),
        origin: 'user' as AgentJobOrigin,
        // Direct-route to GeneralAgent: skip Planner for low-latency chat.
        // GeneralAgent delegates via the `delegate_task` tool if a specialist is needed.
        agent: 'general' as import('@nxt1/core').AgentIdentifier,
        context: {
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
          ...(mode ? { mode } : {}),
          ...(fileAttachments.length > 0 ? { attachments: fileAttachments } : {}),
          ...(videoAttachments.length > 0 ? { videoAttachments } : {}),
        },
      };

      // Create a lightweight job record so /resume-job can locate the paused
      // state if ask_user fires and the user needs to resume later.
      if (jobRepository) {
        try {
          await jobRepository.withDb(db).create(chatPayload);
          chatEventWriter = new DebouncedEventWriter(
            jobRepository.withDb(db),
            chatOperationId,
            user.uid
          );
        } catch (createErr) {
          logger.warn('Failed to create SSE chat job record in Firestore', {
            operationId: chatOperationId,
            error: createErr instanceof Error ? createErr.message : String(createErr),
          });
        }
      }

      const streamRef: import('./sse-stream-adapter.js').SseStreamRef = {
        invokedTools,
        model,
        tokenUsage: undefined,
        pendingAutoOpenPanel: null,
      };
      const sseSink = buildSseStreamCallback(res, streamRef);
      const onStreamEvent = (event: StreamEvent) => {
        sseSink(event);
        chatEventWriter?.emit(event);
        if (pubsubService) {
          pubsubService.publish(chatOperationId, event.type, event).catch(() => undefined);
        }
      };

      if (agentRouterRef) {
        try {
          const result = await agentRouterRef.run(
            chatPayload,
            undefined,
            db,
            onStreamEvent,
            req.isStaging ? 'staging' : 'production',
            abortController.signal
          );

          responseContent = result.summary;
          const resultData = result.data ?? {};
          model = (resultData['model'] as string) ?? 'unknown';
          const usage = resultData['usage'] as
            | { inputTokens: number; outputTokens: number }
            | undefined;
          if (usage) {
            tokenUsage = {
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              model,
            };
          }
          pendingAutoOpenPanel = streamRef.pendingAutoOpenPanel;
        } catch (err) {
          // ── AgentYieldException (ask_user / approval gate) ────────────
          // The agent paused mid-execution waiting for user input.
          // Persist the yield state so /resume-job can reconstruct it,
          // emit a card to the client, then close the SSE stream cleanly.
          if (isAgentYield(err) && jobRepository) {
            const yieldPayload = err.payload;
            const now = new Date();
            const yieldState: AgentYieldState = {
              reason: yieldPayload.reason,
              promptToUser: yieldPayload.promptToUser,
              agentId: yieldPayload.agentId,
              messages: yieldPayload.messages as unknown as readonly Record<string, unknown>[],
              pendingToolCall: yieldPayload.pendingToolCall,
              approvalId: yieldPayload.approvalId,
              planContext: yieldPayload.planContext,
              yieldedAt: now.toISOString(),
              expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
            };

            if (chatEventWriter) {
              try {
                await chatEventWriter.flush();
              } catch {
                /* non-critical */
              }
            }
            await jobRepository.withDb(db).markYielded(chatOperationId, yieldState);

            // Persist the agent's question to the conversation thread
            if (chatService && resolvedThreadId && yieldPayload.promptToUser) {
              try {
                await chatService.addMessage({
                  threadId: resolvedThreadId,
                  userId: user.uid,
                  role: 'assistant',
                  content: yieldPayload.promptToUser,
                  origin: 'user',
                  agentId: yieldPayload.agentId,
                });
              } catch {
                // Non-critical — thread history is best-effort
              }
            }

            // Emit the appropriate card type
            const yieldCardData =
              yieldPayload.reason === 'needs_approval' && yieldPayload.pendingToolCall
                ? buildInlineApprovalCard({
                    toolName: yieldPayload.pendingToolCall.toolName,
                    approvalId: yieldPayload.approvalId ?? '',
                    operationId: chatOperationId,
                    promptToUser: yieldPayload.promptToUser,
                    toolInput: yieldPayload.pendingToolCall.toolInput,
                  })
                : {
                    ...buildInlineAskUserCard({
                      question: yieldPayload.promptToUser,
                      context: '',
                      threadId: resolvedThreadId,
                    }),
                    // Tell the frontend to discard any streamed text before
                    // this card — the question lives solely in the card.
                    clearText: true,
                  };

            try {
              res.write(`event: card\ndata: ${JSON.stringify(yieldCardData)}\n\n`);
              forceProxyFlush(res);
              responseContent = yieldPayload.promptToUser;
            } catch {
              // Client disconnected
            }

            notifyYield(db, {
              userId: user.uid,
              reason: yieldPayload.reason,
              promptToUser: yieldPayload.promptToUser,
              operationId: chatOperationId,
              ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
              ...(yieldPayload.approvalId ? { approvalId: yieldPayload.approvalId } : {}),
            }).catch((notifyErr: unknown) =>
              logger.warn('Failed to dispatch yield notification', {
                operationId: chatOperationId,
                error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
              })
            );

            // Emit done + operation events, then close
            try {
              res.write(
                `event: done\ndata: ${JSON.stringify({
                  threadId: resolvedThreadId,
                  operationId: chatOperationId,
                  timestamp: new Date().toISOString(),
                })}\n\n`
              );
              if (resolvedThreadId) {
                res.write(
                  `event: operation\ndata: ${JSON.stringify({
                    threadId: resolvedThreadId,
                    status: 'awaiting_input',
                    operationId: chatOperationId,
                    timestamp: new Date().toISOString(),
                    yieldState,
                  })}\n\n`
                );
                forceProxyFlush(res);
              }
            } catch {
              // Client disconnected
            }

            logger.info('SSE chat yielded', {
              operationId: chatOperationId,
              reason: yieldPayload.reason,
              agentId: yieldPayload.agentId,
              userId: user.uid,
              threadId: resolvedThreadId,
            });

            activeAbortControllers.delete(chatOperationId);
            // Dispose event writer for yield path (fire-and-forget)
            if (chatEventWriter) {
              chatEventWriter.dispose().catch(() => undefined);
              chatEventWriter = null;
            }
            res.end();

            void executeBillingDeduction({
              db,
              userId: user.uid,
              operationId: chatOperationId,
              feature: UsageFeature.ACTIVITY_USAGE,
              environment: (process.env['NODE_ENV'] === 'staging' ? 'staging' : 'production') as
                | 'production'
                | 'staging',
              metadata: {
                threadId: resolvedThreadId,
                model,
                mode,
                agentTools: invokedTools,
                yielded: true,
              },
            });
            return;
          }

          const isAbort =
            abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError');

          if (isAbort) {
            logger.info('Agent X chat aborted (user cancel or disconnect)', {
              operationId: chatOperationId,
              userId: user.uid,
              partialContentLength: responseContent.length,
            });
          } else {
            logger.warn('AgentRouter.run() failed — using fallback response', {
              operationId: chatOperationId,
              error: err instanceof Error ? err.message : String(err),
            });
            responseContent = `I understand you're asking about "${message.slice(0, 50)}". Agent X is being set up — full AI responses will be available shortly. In the meantime, explore the Coordinator cards on your dashboard for quick actions.`;
            try {
              res.write(`event: delta\ndata: ${JSON.stringify({ content: responseContent })}\n\n`);
            } catch {
              // Client disconnected
            }
          }
        }
      } else {
        responseContent = `I understand you're asking about "${message.slice(0, 50)}". Agent X is being set up — full AI responses will be available shortly. In the meantime, explore the Coordinator cards on your dashboard for quick actions.`;
        try {
          res.write(`event: delta\ndata: ${JSON.stringify({ content: responseContent })}\n\n`);
        } catch {
          // Client disconnected
        }
      }
      // ─── (old manual loop removed) ───────────────────────────────────

      // ── Step 5: Persist assistant reply ──────────────────────────────
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

      // ── Step 5b: Auto-generate thread title ───────────────────────────
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
          logger.warn('Title generation failed', {
            error: titleErr instanceof Error ? titleErr.message : String(titleErr),
            threadId: resolvedThreadId,
          });
        }
      }

      // ── Step 6: Send final done event ─────────────────────────────────
      if (!abortController.signal.aborted) {
        const donePayload: Record<string, unknown> = {
          threadId: resolvedThreadId,
          model,
          usage: tokenUsage,
          timestamp: new Date().toISOString(),
          operationId: chatOperationId,
        };

        if (pendingAutoOpenPanel) {
          donePayload['autoOpenPanel'] = pendingAutoOpenPanel;
          logger.info('Including autoOpenPanel in done event', {
            type: (pendingAutoOpenPanel as Record<string, unknown>)['type'],
            userId: user.uid,
          });
        }

        res.write(`event: done\ndata: ${JSON.stringify(donePayload)}\n\n`);

        // Always emit operation:complete — use threadId if available, else operationId
        // as the identifier so the frontend can always clear the spinner.
        res.write(
          `event: operation\ndata: ${JSON.stringify({
            threadId: resolvedThreadId ?? chatOperationId,
            operationId: chatOperationId,
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

      activeAbortControllers.delete(chatOperationId);

      if (jobRepository && chatEventWriter) {
        try {
          await chatEventWriter.dispose();
          await jobRepository.withDb(db).markCompleted(chatOperationId, {
            summary: responseContent.slice(0, 500),
          });
        } catch {
          // Non-critical
        }
      }

      res.end();

      // ── Step 7: Billing deduction (fire-and-forget) ────────────────────
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

      // ── Step 8: Back-fill threadId if resolveThread failed earlier ────
      // If chatService was available but resolveThread threw (e.g. MongoDB
      // timeout), the Firestore job was created with threadId: null. Now that
      // the stream is complete, attempt to create/recover the thread and patch
      // the job so future operations-log fetches can correctly link the entry
      // to its Firestore AgentJob document.
      if (jobRepository && chatService && !resolvedThreadId && responseContent) {
        void (async () => {
          try {
            const recoveredThreadId = await resolveThread(
              chatService,
              user.uid,
              undefined,
              message
            );
            if (recoveredThreadId) {
              await chatService.addMessage({
                threadId: recoveredThreadId,
                userId: user.uid,
                role: 'user',
                content: message,
                origin: 'user',
              });
              await chatService.addMessage({
                threadId: recoveredThreadId,
                userId: user.uid,
                role: 'assistant',
                content: responseContent,
                origin: 'agent_chain',
              });
              await jobRepository.withDb(req.firebase!.db).patchContext(chatOperationId, {
                threadId: recoveredThreadId,
              });
              logger.info('Back-filled threadId on Firestore job after resolveThread recovery', {
                operationId: chatOperationId,
                recoveredThreadId,
                userId: user.uid,
              });
            }
          } catch (recoveryErr) {
            logger.warn('Post-stream thread recovery failed — job will remain without threadId', {
              operationId: chatOperationId,
              userId: user.uid,
              error: recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr),
            });
          }
        })();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      const isAbort = abortController.signal.aborted || error.name === 'AbortError';

      if (isAbort) {
        logger.info('Agent X chat handler terminated by abort', {
          operationId: chatOperationId,
          userId: chatUser?.uid,
        });
        if (!res.writableEnded) {
          try {
            res.end();
          } catch {
            // Already closed
          }
        }
        activeAbortControllers.delete(chatOperationId);
        if (jobRepository && req.firebase?.db) {
          jobRepository
            .withDb(req.firebase.db)
            .markCancelled(chatOperationId)
            .catch(() => undefined);
        }
        return;
      }

      logger.error('Agent X chat failed', { error: error.message, stack: error.stack });

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

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to process message',
          errorCode: 'AI_SERVICE_ERROR',
        });
      } else {
        try {
          res.write(
            `event: error\ndata: ${JSON.stringify({ error: 'Failed to process message' })}\n\n`
          );
          // Always emit operation:error regardless of thread resolution
          res.write(
            `event: operation\ndata: ${JSON.stringify({
              threadId: resolvedThreadId ?? chatOperationId,
              operationId: chatOperationId,
              status: 'error',
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
          forceProxyFlush(res);
          res.end();
        } catch {
          // Client already disconnected
        }
      }

      if (jobRepository && req.firebase?.db) {
        jobRepository
          .withDb(req.firebase.db)
          .markFailed(chatOperationId, error.message ?? 'Unknown error')
          .catch(() => undefined);
      }

      activeAbortControllers.delete(chatOperationId);
    }
  }
);

export default router;
