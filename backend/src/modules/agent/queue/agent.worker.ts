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

import { Worker, Job } from 'bullmq';
import type { AgentJobUpdate, AgentOperationResult, AgentYieldState } from '@nxt1/core';
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
import { AgentJobRepository } from './job.repository.js';
import { DebouncedEventWriter } from './event-writer.js';
import type { StreamEvent } from './event-writer.js';
import { AgentPubSubService } from './pubsub.service.js';
import type { AgentChatService } from '../services/agent-chat.service.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { isAgentYield } from '../exceptions/agent-yield.exception.js';
import { notifyYield } from '../services/yield-notifier.service.js';
import { estimateChargeAmountSync } from '../../billing/pricing.service.js';
import {
  getBillingContext,
  createWalletHold,
  releaseWalletHold,
} from '../../billing/budget.service.js';
import { UsageFeature } from '../../billing/types/index.js';
import { executeBillingDeduction } from '../../billing/usage-deduction.service.js';
import {
  logAgentTaskCompletion,
  logAgentTaskFailure,
} from '../../../services/agent-activity.service.js';
import { getAgentAnalyticsGate } from '../services/agent-analytics-gate.js';
import { logger } from '../../../utils/logger.js';

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
    redisUrl?: string
  ) {
    const url = redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';

    // Parse URL into RedisOptions for BullMQ compatibility (includes auth)
    const connection = AgentQueueService.parseRedisUrl(url);

    this.worker = new Worker(AGENT_QUEUE_NAME, async (job) => this.processJob(job), {
      connection,
      prefix: AGENT_QUEUE_PREFIX,
      concurrency: WORKER_CONCURRENCY,
      lockDuration: JOB_LOCK_DURATION_MS,
      removeOnComplete: { age: COMPLETED_JOB_TTL_S, count: 1000 },
      removeOnFail: { age: FAILED_JOB_TTL_S, count: 500 },
    });

    this.attachEventListeners();
  }

  // ─── Repository Selector ────────────────────────────────────────────────

  /** Return the correct Firestore repo based on which environment the job belongs to. */
  private getJobRepo(job: Job<AgentQueueJobData, AgentQueueJobResult>): AgentJobRepository {
    return job.data.environment === 'staging' ? this.stagingJobRepo : this.productionJobRepo;
  }

  /** Return the correct Firestore instance for user lookups based on job environment. */
  private getUserFirestore(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): FirebaseFirestore.Firestore | undefined {
    return job.data.environment === 'staging' ? this.stagingFirestore : undefined;
  }

  /** Return the correct Firestore for activity/notification writes. */
  private async getActivityFirestore(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<FirebaseFirestore.Firestore> {
    if (job.data.environment === 'staging' && this.stagingFirestore) {
      return this.stagingFirestore;
    }
    const { getFirestore } = await import('firebase-admin/firestore');
    return getFirestore();
  }

  private async processThreadSummarizationJob(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<AgentQueueJobResult> {
    if (job.data.kind !== 'thread_summarization') {
      throw new Error('Invalid thread summarization job payload');
    }

    if (!this.llmService) {
      throw new Error('LLM service not initialized for thread summarization');
    }

    const startMs = Date.now();
    await job.updateProgress({
      status: 'thinking',
      message: 'Summarizing idle thread memory',
      percent: 10,
      currentStep: 1,
      totalSteps: 1,
      updatedAt: new Date().toISOString(),
    });

    const { VectorMemoryService } = await import('../memory/vector.service.js');
    const { MemorySummarizationService } =
      await import('../memory/memory-summarization.service.js');

    const vectorMemory = new VectorMemoryService(this.llmService);
    const summarizer = new MemorySummarizationService(this.llmService, vectorMemory);
    const memoriesCreated = await summarizer.processSingleThread(
      job.data.threadId,
      job.data.userId
    );

    await job.updateProgress({
      status: 'completed',
      message: 'Idle thread summarization complete',
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

    if (job.data.kind !== 'agent') {
      throw new Error(
        `Unsupported queue job kind: ${String((job.data as { kind?: unknown }).kind)}`
      );
    }

    const { payload } = job.data;
    const startMs = Date.now();
    const repo = this.getJobRepo(job);

    // Hoist billing db so it's available across the full job lifecycle
    const billingDb = await this.getActivityFirestore(job);
    const feature = typeof payload.agent === 'string' ? payload.agent : 'agent';

    // ── IAP hold: show "Processing" amount in usage overview ─────────────
    // For prepaid wallet users, create a hold at job start so the UI can display
    // the estimated in-flight cost under "Processing". Released or captured at end.
    let iapHoldId: string | null = null;
    const billingCtxForHold = await getBillingContext(billingDb, payload.userId);
    if (
      (billingCtxForHold?.paymentProvider === 'iap' &&
        billingCtxForHold.billingEntity === 'individual') ||
      (billingCtxForHold?.billingEntity === 'organization' && billingCtxForHold?.hardStop)
    ) {
      const { chargeAmountCents: estimatedCents } = estimateChargeAmountSync(0.1);
      const holdResult = await createWalletHold(
        billingDb,
        payload.userId,
        estimatedCents,
        payload.operationId,
        feature
      );
      if (holdResult.success && holdResult.holdId) {
        iapHoldId = holdResult.holdId;
        logger.info('[billing] IAP hold created for job', {
          holdId: iapHoldId,
          estimatedCents,
          userId: payload.userId,
          operationId: payload.operationId,
        });
      } else {
        logger.warn('[billing] Failed to create IAP hold — job will proceed without hold', {
          userId: payload.userId,
          reason: holdResult.reason,
        });
      }
    }

    let stepIndex = 0;
    let totalSteps = 1; // Updated once the plan is created

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
    const eventWriter = new DebouncedEventWriter(repo, payload.operationId);

    // ── Dual-write callback: Firestore (persistence) + Redis PubSub (real-time SSE pipe) ──
    // The Redis PubSub path enables Express to hold an SSE connection open and
    // forward tokens in real-time, giving the frontend the same streaming UX
    // regardless of whether the LLM loop runs inline or in BullMQ.
    const onStreamEvent = (event: StreamEvent): void => {
      // 1. Firestore (existing — persistence for reconnection/replay)
      eventWriter.emit(event);

      // 2. Redis PubSub (new — real-time SSE pipe to Express)
      const sseEvent = this.streamEventToSSE(event);
      if (sseEvent) {
        this.pubsub
          .publish(payload.operationId, sseEvent.event, sseEvent.data)
          .catch(() => undefined);
      }
    };

    // Execute the full agent pipeline (with overall timeout)
    let result: AgentOperationResult;
    try {
      const userFirestore = this.getUserFirestore(job);
      const routerPromise = this.router.run(
        payload,
        onUpdate,
        userFirestore,
        onStreamEvent,
        job.data.environment
      );
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Agent job timed out after 5 minutes')), JOB_TIMEOUT_MS);
      });
      result = await Promise.race([routerPromise, timeoutPromise]);
    } catch (err) {
      // Flush any buffered deltas before handling the error
      await eventWriter.flush().catch(() => undefined);

      // ── Yield handling: agent needs user input or approval ─────────────
      if (isAgentYield(err)) {
        await eventWriter.dispose();
        const yieldPayload = err.payload;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

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

        // Persist yield state to Firestore
        await repo.markYielded(payload.operationId, yieldState).catch((fsErr: unknown) => {
          logger.warn('Failed to write yield state to Firestore', {
            operationId: payload.operationId,
            error: fsErr instanceof Error ? fsErr.message : String(fsErr),
          });
        });

        // Persist the agent's question as a system message in MongoDB thread
        const contextObj =
          typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
        const threadId =
          typeof (contextObj as Record<string, unknown>)['threadId'] === 'string'
            ? ((contextObj as Record<string, unknown>)['threadId'] as string)
            : undefined;

        if (threadId && this.chatService) {
          try {
            await this.chatService.addMessage({
              threadId,
              userId: payload.userId,
              role: 'assistant',
              content: yieldPayload.promptToUser,
              origin: 'agent_chain',
              agentId: yieldPayload.agentId,
              operationId: payload.operationId,
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
          await notifyYield(activityDb, {
            userId: payload.userId,
            reason: yieldPayload.reason,
            promptToUser: yieldPayload.promptToUser,
            operationId: payload.operationId,
            threadId,
            approvalId: yieldPayload.approvalId,
          });
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

      const message = err instanceof Error ? err.message : 'Agent pipeline error';

      // Write terminal 'done' event with error so frontend's Firestore listener knows to stop
      eventWriter.emit({ type: 'done', success: false, error: message });
      await eventWriter.dispose();

      // Write failure to Firestore before re-throwing so BullMQ records the error
      await repo.markFailed(payload.operationId, message).catch((fsErr: unknown) => {
        logger.warn('Failed to write failure to Firestore', {
          operationId: payload.operationId,
          error: fsErr instanceof Error ? fsErr.message : String(fsErr),
        });
      });

      // Notify the user that their task failed (they shouldn't just see silence)
      try {
        const activityDb = await this.getActivityFirestore(job);
        await logAgentTaskFailure(activityDb, {
          userId: payload.userId,
          job: payload,
          errorMessage: message,
        });
      } catch (notifyErr) {
        logger.error('Failed to dispatch failure notification', {
          operationId: payload.operationId,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }

      // Track job failure in user's analytics record (fire-and-forget)
      getAgentAnalyticsGate().trackJobFailed({
        userId: payload.userId,
        agentId: typeof payload.agent === 'string' ? payload.agent : 'unknown',
        operationId: payload.operationId,
        error: message,
        durationMs: Date.now() - startMs,
        threadId:
          typeof (payload.context as Record<string, unknown> | undefined)?.['threadId'] === 'string'
            ? ((payload.context as Record<string, unknown>)['threadId'] as string)
            : undefined,
      });

      // Release any IAP hold — job failed, funds should not stay locked
      if (iapHoldId) {
        releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
          logger.warn('[billing] Failed to release IAP hold on job failure', {
            holdId: iapHoldId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }

      throw err;
    }

    const resultData =
      typeof result.data === 'object' && result.data !== null
        ? (result.data as Record<string, unknown>)
        : undefined;
    const maxIterationsReached = resultData?.['maxIterationsReached'] === true;
    const planFailed = resultData?.['operationStatus'] === 'failed';
    const terminalMessage =
      typeof result.summary === 'string' && result.summary.length > 0
        ? result.summary
        : maxIterationsReached
          ? 'The agent reached its maximum iteration limit without completing the task.'
          : planFailed
            ? 'Execution plan failed.'
            : 'All tasks finished.';

    // ── Flush remaining deltas and write terminal 'done' event ──────────
    await eventWriter.flush().catch(() => undefined);
    eventWriter.emit({
      type: 'done',
      success: !maxIterationsReached && !planFailed,
      message: terminalMessage,
    });
    await eventWriter.dispose();

    const terminalProgress: AgentJobProgress = {
      status: maxIterationsReached || planFailed ? 'failed' : 'completed',
      message: maxIterationsReached || planFailed ? terminalMessage : 'All tasks finished.',
      percent: 100,
      currentStep: totalSteps,
      totalSteps,
      updatedAt: new Date().toISOString(),
    };
    await job.updateProgress(terminalProgress);

    logger.info('[DEBUGLOG] Final job result before persistence:', {
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
      return {
        result,
        durationMs: Date.now() - startMs,
        completedAt: new Date().toISOString(),
      };
    }

    const summary = this.resolveResultSummary(result);
    let generatedOperationTitle: string | null = null;

    if (this.llmService) {
      generatedOperationTitle = await this.chatService.generateOperationTitle(
        payload.intent,
        summary,
        this.llmService
      );

      if (generatedOperationTitle) {
        result = {
          ...result,
          title: generatedOperationTitle,
        };
      }
    }

    // Persist final result to Firestore
    await repo.markCompleted(payload.operationId, result).catch((err: unknown) => {
      logger.warn('Failed to write completion to Firestore', {
        operationId: payload.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // Billing deduction: use centralized pipeline
    void executeBillingDeduction({
      db: billingDb,
      userId: payload.userId,
      operationId: payload.operationId,
      feature: UsageFeature.ACTIVITY_USAGE,
      environment: job.data.environment,
      iapHoldId: iapHoldId ?? undefined,
      metadata: { agent: payload.agent },
    });

    // Dispatch activity feed item + push notification (fire-and-forget)
    try {
      const activityDb = await this.getActivityFirestore(job);
      await logAgentTaskCompletion(activityDb, {
        userId: payload.userId,
        job: payload,
        result,
      });
    } catch (notifyErr) {
      logger.error('Failed to dispatch activity/notification', {
        operationId: payload.operationId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    // ─── Persist assistant response to MongoDB thread ─────────────────────
    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const threadId =
      typeof (contextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((contextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;

    // Track job completion in user's analytics record (fire-and-forget)
    getAgentAnalyticsGate().trackJobCompleted({
      userId: payload.userId,
      agentId: typeof payload.agent === 'string' ? payload.agent : 'unknown',
      operationId: payload.operationId,
      durationMs: Date.now() - startMs,
      threadId,
    });
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

        await this.chatService.addMessage({
          threadId,
          userId: payload.userId,
          role: 'assistant',
          content: summary,
          origin: payload.origin,
          agentId,
          operationId: payload.operationId,
          toolCalls,
          resultData:
            typeof result.data === 'object' && result.data !== null
              ? (result.data as Record<string, unknown>)
              : undefined,
        });
        logger.info('Agent response persisted to MongoDB thread', {
          threadId,
          operationId: payload.operationId,
        });

        const generatedTitle = generatedOperationTitle
          ? await this.chatService.applyGeneratedThreadTitle(
              threadId,
              payload.userId,
              payload.intent,
              generatedOperationTitle
            )
          : this.llmService
            ? await this.chatService.generateThreadTitle(
                threadId,
                payload.userId,
                payload.intent,
                summary,
                this.llmService
              )
            : null;

        if (generatedTitle) {
          logger.info('Agent thread title auto-generated from worker response', {
            threadId,
            operationId: payload.operationId,
            title: generatedTitle,
          });
        }
      } catch (chatErr) {
        // Chat persistence must never fail the job
        logger.warn('Failed to persist agent response to MongoDB', {
          threadId,
          operationId: payload.operationId,
          error: chatErr instanceof Error ? chatErr.message : String(chatErr),
        });
      }
    }

    return {
      result,
      plan: (result.data?.['plan'] as AgentQueueJobResult['plan']) ?? undefined,
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  }

  private resolveResultSummary(result: AgentOperationResult): string {
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
  private streamEventToSSE(event: StreamEvent): { event: string; data: unknown } | null {
    switch (event.type) {
      case 'card':
        return { event: 'card', data: event.cardData ?? {} };
      case 'delta':
        return { event: 'delta', data: { content: event.text ?? '' } };
      case 'step_active':
        return {
          event: 'step',
          data: { id: event.agentId ?? 'unknown', label: event.message ?? '', status: 'active' },
        };
      case 'step_done':
        return {
          event: 'step',
          data: { id: event.agentId ?? 'unknown', label: event.message ?? '', status: 'success' },
        };
      case 'step_error':
        return {
          event: 'step',
          data: { id: event.agentId ?? 'unknown', label: event.message ?? '', status: 'error' },
        };
      case 'tool_call':
        return {
          event: 'step',
          data: {
            id: event.toolName ?? 'tool',
            label: event.message ?? event.toolName ?? 'Running tool',
            status: 'active',
          },
        };
      case 'tool_result':
        return {
          event: 'step',
          data: {
            id: event.toolName ?? 'tool',
            label: event.message ?? event.toolName ?? 'Tool complete',
            status: event.toolSuccess ? 'success' : 'error',
          },
        };
      case 'done':
        return {
          event: 'done',
          data: {
            success: event.success ?? true,
            error: event.error,
            message: event.message,
          },
        };
      default:
        return null;
    }
  }

  // ─── Event Listeners ───────────────────────────────────────────────────

  private attachEventListeners(): void {
    this.worker.on('completed', (job) => {
      if (job) {
        const duration = job.returnvalue?.durationMs ?? 0;
        const operationId =
          'payload' in job.data ? job.data.payload.operationId : `summarize:${job.data.threadId}`;

        logger.info('Agent queue job completed', {
          jobId: job.id,
          operationId,
          durationMs: duration,
        });
      }
    });

    this.worker.on('failed', (job, err) => {
      const operationId =
        job && 'payload' in job.data
          ? job.data.payload.operationId
          : job?.data.kind === 'thread_summarization'
            ? `summarize:${job.data.threadId}`
            : undefined;

      logger.error('Agent queue job failed', {
        jobId: job?.id,
        operationId,
        error: err.message,
        stack: err.stack,
      });
    });

    this.worker.on('stalled', (jobId) => {
      logger.error('Agent job stalled (lock expired) — marking as failed in Firestore', {
        jobId,
      });
      // Mark both production and staging repos — we don't know which env the job belongs to
      const failMessage = 'Job stalled: processing exceeded lock duration and was abandoned.';
      void this.productionJobRepo.markFailed(jobId, failMessage).catch(() => {
        /* stall recovery */
      });
      void this.stagingJobRepo.markFailed(jobId, failMessage).catch(() => {
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
