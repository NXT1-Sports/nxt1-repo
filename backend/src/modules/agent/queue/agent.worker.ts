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

import { Worker, Job, UnrecoverableError } from 'bullmq';
import type {
  AgentIdentifier,
  AgentJobPayload,
  AgentJobUpdate,
  AgentOperationResult,
  AgentYieldState,
} from '@nxt1/core';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';
import { resolveAgentApprovalCopy, resolveAgentSuccessNotificationCopy } from '@nxt1/core';
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
import { PersistedAssistantStreamBuilder } from './persisted-stream-message.js';
import { AgentPubSubService } from './pubsub.service.js';
import type { AgentChatService } from '../services/agent-chat.service.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import { isAgentYield } from '../exceptions/agent-yield.exception.js';
import { getAgentEngineErrorCode } from '../exceptions/agent-engine.error.js';
import { notifyYield } from '../services/yield-notifier.service.js';
import { estimateChargeAmountSync } from '../../billing/pricing.service.js';
import {
  getBillingState,
  createWalletHold,
  releaseWalletHold,
} from '../../billing/budget.service.js';
import { executeBillingDeduction } from '../../billing/usage-deduction.service.js';
import { logAgentTaskCompletion, logAgentTaskFailure } from '../services/agent-activity.service.js';
import { processRecapForUser } from '../services/weekly-recap-email.service.js';
import { dispatchAgentPush } from '../services/agent-push-adapter.service.js';
import { logger } from '../../../utils/logger.js';
import { AgentGenerationService } from '../services/generation.service.js';
import crypto from 'node:crypto';

const AGENT_IDENTIFIER_SET = new Set<AgentIdentifier>([
  'router',
  'admin_coordinator',
  'brand_coordinator',
  'data_coordinator',
  'strategy_coordinator',
  'recruiting_coordinator',
  'performance_coordinator',
]);

function isAgentIdentifier(value: unknown): value is AgentIdentifier {
  return typeof value === 'string' && AGENT_IDENTIFIER_SET.has(value as AgentIdentifier);
}

const MAX_TIMEOUT_AUTO_CONTINUATIONS = 6;

function isJobTimeoutError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  return err.message.startsWith('Agent job timed out after ');
}

function normalizeTerminalMessageText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

const PAUSE_RESUME_TOOL_NAME = 'resume_paused_operation';

function isPauseYieldState(yieldState: AgentYieldState | null | undefined): boolean {
  return yieldState?.pendingToolCall?.toolName === PAUSE_RESUME_TOOL_NAME;
}

function isAbortError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'AbortError';
}

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
    redisUrl?: string,
    private readonly enqueueContinuationJob?: (
      payload: AgentJobPayload,
      environment: 'staging' | 'production'
    ) => Promise<string>,
    private readonly queueService?: AgentQueueService
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

  private getScheduledRunContext(
    job: Job<AgentQueueJobData, AgentQueueJobResult>,
    payload: import('@nxt1/core').AgentJobPayload
  ): { scheduleId: string; runId: string } | null {
    if (payload.origin !== 'system_cron') {
      return null;
    }

    const runId = job.id?.toString() ?? `${payload.operationId}-${job.timestamp}`;
    const repeatJobKey = (job as unknown as { repeatJobKey?: string }).repeatJobKey;
    const scheduleId = repeatJobKey && repeatJobKey.trim().length > 0 ? repeatJobKey : job.name;

    return { scheduleId, runId };
  }

  private async shouldSuppressTerminalCompletionForPause(
    repo: AgentJobRepository,
    operationId: string
  ): Promise<{ suppressed: boolean; persistedStatus?: string }> {
    try {
      const latest = await repo.getById(operationId);
      if (!latest) {
        return { suppressed: false };
      }

      const persistedStatus = latest.status;
      const explicitPaused = persistedStatus === 'paused';
      const inferredPaused =
        persistedStatus === 'awaiting_input' && isPauseYieldState(latest.yieldState ?? undefined);

      return {
        suppressed: explicitPaused || inferredPaused,
        persistedStatus,
      };
    } catch (err) {
      logger.warn('Failed to read latest job state before terminal completion guard', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { suppressed: false };
    }
  }

  private async continueTimedOutJob(
    job: Job<AgentQueueJobData, AgentQueueJobResult>,
    repo: AgentJobRepository,
    payload: AgentJobPayload,
    timeoutMessage: string,
    eventWriter: DebouncedEventWriter,
    startMs: number,
    billingDb: FirebaseFirestore.Firestore,
    iapHoldId: string | null
  ): Promise<AgentQueueJobResult | null> {
    if (!this.enqueueContinuationJob) {
      return null;
    }

    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const timeoutContinuationCountRaw = (contextObj as Record<string, unknown>)[
      'timeoutContinuationCount'
    ];
    const timeoutContinuationCount =
      typeof timeoutContinuationCountRaw === 'number'
        ? Math.max(0, Math.floor(timeoutContinuationCountRaw))
        : 0;

    if (timeoutContinuationCount >= MAX_TIMEOUT_AUTO_CONTINUATIONS) {
      return null;
    }

    const nextOperationId = crypto.randomUUID();
    const nextPayload: AgentJobPayload = {
      ...payload,
      operationId: nextOperationId,
      sessionId: crypto.randomUUID(),
      context: {
        ...(contextObj as Record<string, unknown>),
        resumedFrom: payload.operationId,
        timeoutContinuationCount: timeoutContinuationCount + 1,
        timeoutContinuedFrom: payload.operationId,
        timeoutContinuedAt: new Date().toISOString(),
      },
    };

    await repo.create(nextPayload);
    await this.enqueueContinuationJob(nextPayload, job.data.environment);

    const continuationMessage = `Operation slice timed out; automatically continuing as ${nextOperationId}.`;

    await job.updateProgress({
      status: 'completed',
      message: continuationMessage,
      agentId: 'router',
      outcomeCode: 'success_default',
      metadata: {
        continuationReason: 'timeout',
        continuedAs: nextOperationId,
      },
      percent: 100,
      currentStep: 1,
      totalSteps: 1,
      updatedAt: new Date().toISOString(),
    });

    eventWriter.emit({
      type: 'done',
      success: true,
      message: continuationMessage,
      agentId: 'router',
      metadata: {
        continuationReason: 'timeout',
        continuedAs: nextOperationId,
      },
    });
    await eventWriter.dispose();

    await repo.markCompleted(payload.operationId, {
      summary: continuationMessage,
      data: {
        resumedAs: nextOperationId,
        continuationReason: 'timeout',
        timeoutMessage,
      },
    });

    if (iapHoldId) {
      releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
        logger.warn('[billing] Failed to release IAP hold on timeout continuation', {
          holdId: iapHoldId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }

    logger.warn('Agent job auto-continued after timeout window', {
      operationId: payload.operationId,
      continuedAs: nextOperationId,
      timeoutContinuationCount: timeoutContinuationCount + 1,
      timeoutLimit: MAX_TIMEOUT_AUTO_CONTINUATIONS,
    });

    return {
      result: {
        summary: continuationMessage,
        data: {
          continuedAs: nextOperationId,
          continuationReason: 'timeout',
          timeoutContinuationCount: timeoutContinuationCount + 1,
        },
      },
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  }

  private async processThreadSummarizationJob(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<AgentQueueJobResult> {
    if (job.data.kind !== 'thread_summarization') {
      throw new AgentEngineError(
        'AGENT_JOB_PAYLOAD_INVALID',
        'Invalid thread summarization job payload',
        { metadata: { kind: (job.data as { kind?: unknown }).kind } }
      );
    }

    if (!this.llmService) {
      throw new AgentEngineError(
        'AGENT_SERVICE_UNAVAILABLE',
        'LLM service not initialized for thread summarization'
      );
    }

    const startMs = Date.now();
    await job.updateProgress({
      status: 'acting',
      message: 'Summarizing idle thread memory',
      agentId: 'router',
      stageType: 'router',
      stage: 'summarizing_memory',
      metadata: { threadId: job.data.threadId },
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
      agentId: 'router',
      stageType: 'router',
      stage: 'summarizing_memory',
      outcomeCode: 'success_default',
      metadata: { threadId: job.data.threadId, memoriesCreated },
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

  private async processPlaybookGenerationJob(
    job: Job<AgentQueueJobData, AgentQueueJobResult>
  ): Promise<AgentQueueJobResult> {
    if (job.data.kind !== 'playbook_generation') {
      throw new AgentEngineError(
        'AGENT_JOB_PAYLOAD_INVALID',
        'Invalid playbook generation job payload',
        { metadata: { kind: (job.data as { kind?: unknown }).kind } }
      );
    }

    const startMs = Date.now();
    const { operationId, userId } = job.data;
    const repo = this.getJobRepo(job);
    const billingDb = await this.getActivityFirestore(job);
    const generationService = new AgentGenerationService(this.llmService);

    const processingProgress: AgentJobProgress = {
      status: 'acting',
      message: 'Generating your weekly playbook',
      agentId: 'strategy_coordinator',
      stageType: 'router',
      stage: 'agent_thinking',
      percent: 20,
      currentStep: 1,
      totalSteps: 2,
      updatedAt: new Date().toISOString(),
    };

    await job.updateProgress(processingProgress);
    await repo.updateProgress(operationId, processingProgress).catch((err: unknown) => {
      logger.warn('Failed to write playbook progress to Firestore', {
        operationId,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    try {
      const playbook = await generationService.generatePlaybook(userId, billingDb, operationId);

      const completionSummary = `Playbook generated with ${playbook.items.length} items.`;
      const operationResult: AgentOperationResult = {
        summary: completionSummary,
        data: {
          generatedAt: playbook.generatedAt,
          itemCount: playbook.items.length,
          goalCount: playbook.goals.length,
          canRegenerate: playbook.canRegenerate,
          playbook,
        },
      };

      const completedProgress: AgentJobProgress = {
        status: 'completed',
        message: 'Playbook generation complete',
        agentId: 'strategy_coordinator',
        outcomeCode: 'success_default',
        percent: 100,
        currentStep: 2,
        totalSteps: 2,
        updatedAt: new Date().toISOString(),
      };

      await job.updateProgress(completedProgress);
      await repo.markCompleted(operationId, operationResult).catch((err: unknown) => {
        logger.warn('Failed to persist playbook completion to Firestore', {
          operationId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      void executeBillingDeduction({
        db: billingDb,
        userId,
        operationId,
        feature: 'playbook-generation',
        coordinatorId: 'strategy_coordinator',
        environment: job.data.environment,
      });

      return {
        result: operationResult,
        durationMs: Date.now() - startMs,
        completedAt: new Date().toISOString(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate playbook';

      const failedProgress: AgentJobProgress = {
        status: 'failed',
        message,
        agentId: 'strategy_coordinator',
        stageType: 'router',
        stage: 'routing_to_agent',
        outcomeCode: 'task_failed',
        metadata: { errorCode: 'PLAYBOOK_GENERATION_FAILED' },
        percent: 100,
        currentStep: 2,
        totalSteps: 2,
        updatedAt: new Date().toISOString(),
      };

      await job.updateProgress(failedProgress);
      await repo.markFailed(operationId, message).catch((fsErr: unknown) => {
        logger.warn('Failed to persist playbook failure to Firestore', {
          operationId,
          error: fsErr instanceof Error ? fsErr.message : String(fsErr),
        });
      });

      throw err;
    }
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

    if (job.data.kind === 'playbook_generation') {
      return this.processPlaybookGenerationJob(job);
    }

    if (job.data.kind !== 'agent') {
      throw new AgentEngineError(
        'AGENT_JOB_KIND_UNSUPPORTED',
        `Unsupported queue job kind: ${String((job.data as { kind?: unknown }).kind)}`,
        { metadata: { kind: (job.data as { kind?: unknown }).kind } }
      );
    }

    const { payload } = job.data;
    const payloadContext =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const payloadThreadId =
      typeof (payloadContext as Record<string, unknown>)['threadId'] === 'string'
        ? ((payloadContext as Record<string, unknown>)['threadId'] as string)
        : undefined;
    const scheduledRunContext = this.getScheduledRunContext(job, payload);
    const startMs = Date.now();
    const repo = this.getJobRepo(job);

    // Hoist billing db so it's available across the full job lifecycle
    const billingDb = await this.getActivityFirestore(job);
    const feature = typeof payload.agent === 'string' ? payload.agent : 'agent';

    // ── IAP hold: show "Processing" amount in usage overview ─────────────
    // For prepaid wallet users, create a hold at job start so the UI can display
    // the estimated in-flight cost under "Processing". Released or captured at end.
    let iapHoldId: string | null = null;
    const billingCtxForHold = await getBillingState(billingDb, payload.userId);
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
    const invokedTools: string[] = [];
    const successfulTools: string[] = [];

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
        agentId: update.agentId ?? update.step.agentId,
        stageType: update.stageType ?? update.step.stageType,
        stage: update.stage ?? update.step.stage,
        outcomeCode: update.outcomeCode ?? update.step.outcomeCode,
        metadata: update.metadata ?? update.step.metadata,
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
    const eventWriter = new DebouncedEventWriter(
      repo,
      payload.operationId,
      payload.userId,
      undefined,
      {
        /**
         * LIVE EVENT HOOK: Publishes each delta to SSE immediately (token-by-token)
         * This is the "real-time" path — deltas appear in the client stream instantly,
         * without waiting for the 300ms Firestore batch. Professional typing feel.
         */
        onLiveEvent: (event) => {
          // Only handle deltas here; other events go through onPersistedEvent
          if (event.type !== 'delta') return;

          const sseEvent = this.streamEventToSSE(event, payload.operationId, payloadThreadId);
          if (!sseEvent) return;

          // Fire-and-forget publish; no latency tracking needed for live events
          this.pubsub
            .publish(payload.operationId, sseEvent.event, sseEvent.data)
            .catch(() => undefined);
        },
        onPersistedEventMetrics: ({ type, durationMs, seq }) => {
          if (durationMs >= 1500) {
            logger.warn('Stream event persistence latency high', {
              operationId: payload.operationId,
              eventType: type,
              seq,
              durationMs,
            });
          }
        },
        /**
         * PERSISTED EVENT HOOK: Publishes non-delta events and persistence milestones
         * Called AFTER Firestore write with final seq number. For terminal events,
         * state transitions, etc. Deltas already published via onLiveEvent.
         */
        onPersistedEvent: (event) => {
          // Skip deltas here (already published via onLiveEvent for real-time)
          if (event.type === 'delta') return;

          const sseEvent = this.streamEventToSSE(event, payload.operationId, payloadThreadId);
          if (!sseEvent) return;
          const publishStartedAt = Date.now();
          this.pubsub
            .publish(payload.operationId, sseEvent.event, sseEvent.data)
            .then(() => {
              const publishDurationMs = Date.now() - publishStartedAt;
              if (publishDurationMs >= 300) {
                logger.warn('Stream event publish latency high', {
                  operationId: payload.operationId,
                  eventType: sseEvent.event,
                  durationMs: publishDurationMs,
                });
              }
            })
            .catch(() => undefined);
        },
      }
    );

    // Emit canonical lifecycle transition as soon as worker execution begins.
    eventWriter.emit({
      type: 'operation',
      operationId: payload.operationId,
      threadId: payloadThreadId,
      status: 'running',
      timestamp: new Date().toISOString(),
    });

    const persistedAssistantStream = new PersistedAssistantStreamBuilder();

    // ── Dual-write callback: Firestore (persistence) + Redis PubSub (real-time SSE pipe) ──
    // The Redis PubSub path enables Express to hold an SSE connection open and
    // forward tokens in real-time, giving the frontend the same streaming UX
    // regardless of whether the LLM loop runs inline or in BullMQ.
    const onStreamEvent = (event: StreamEvent): void => {
      if (event.toolName && (event.type === 'tool_call' || event.type === 'step_active')) {
        invokedTools.push(event.toolName);
      }
      if (event.toolName && event.type === 'tool_result' && event.toolSuccess !== false) {
        successfulTools.push(event.toolName);
      }

      persistedAssistantStream.process(event);

      // 1. Firestore (existing — persistence for reconnection/replay)
      eventWriter.emit(event);

      // 2. Redis PubSub is emitted by the event writer only after persistence.
    };

    // Execute the full agent pipeline (with overall timeout)
    let result: AgentOperationResult;

    // Create a job-scoped AbortController so the cancel endpoint can halt the
    // LLM router mid-execution. Registered in queueService; cleaned up in finally.
    const jobAbortController = new AbortController();
    this.queueService?.registerController(payload.operationId, jobAbortController);

    try {
      const userFirestore = this.getUserFirestore(job);
      const routerPromise = this.router.run(
        payload,
        onUpdate,
        userFirestore,
        onStreamEvent,
        job.data.environment,
        jobAbortController.signal
      );
      const timeoutMinutes = Math.round(JOB_TIMEOUT_MS / 60_000);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Agent job timed out after ${timeoutMinutes} minutes`)),
          JOB_TIMEOUT_MS
        );
      });
      result = await Promise.race([routerPromise, timeoutPromise]);
    } catch (err) {
      // Flush any buffered deltas before handling the error
      await eventWriter.flush().catch(() => undefined);

      let handledError: unknown = err;

      if (isAbortError(err)) {
        const latest = await repo.getById(payload.operationId).catch(() => null);
        const persistedStatus = latest?.status;
        const abortedAsPaused =
          persistedStatus === 'paused' ||
          (persistedStatus === 'awaiting_input' && isPauseYieldState(latest?.yieldState));
        const abortedAsCancelled = persistedStatus === 'cancelled';

        if (abortedAsPaused || abortedAsCancelled) {
          await eventWriter.dispose();

          const controlledStatus = abortedAsPaused ? 'paused' : 'cancelled';
          const controlledMessage =
            controlledStatus === 'paused'
              ? 'Operation paused by user'
              : 'Operation cancelled by user';

          await job.updateProgress({
            status: controlledStatus,
            message: controlledMessage,
            agentId: 'router',
            outcomeCode: controlledStatus === 'paused' ? 'input_required' : 'cancelled',
            metadata: {
              reason: abortedAsPaused ? 'paused_by_user' : 'cancelled_by_user',
              persistedStatus,
            },
            percent: Math.min(99, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
            currentStep: stepIndex,
            totalSteps,
            updatedAt: new Date().toISOString(),
          });

          if (iapHoldId) {
            releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
              logger.warn('[billing] Failed to release IAP hold after controlled abort', {
                holdId: iapHoldId,
                error: e instanceof Error ? e.message : String(e),
              });
            });
          }

          // Persist whatever partial response the agent streamed so far to MongoDB.
          // Without this, when the user returns to the session they see the yield
          // card but all streamed content (tool steps, partial text) is gone.
          // This applies to both pause and cancel — cancelled jobs also benefit from
          // having partial context visible in the thread.
          if (this.chatService) {
            const contextObj =
              typeof payload.context === 'object' && payload.context !== null
                ? payload.context
                : {};
            const threadId =
              typeof (contextObj as Record<string, unknown>)['threadId'] === 'string'
                ? ((contextObj as Record<string, unknown>)['threadId'] as string)
                : undefined;

            if (threadId) {
              const partialSnapshot = persistedAssistantStream.snapshot();
              const hasContent =
                partialSnapshot.content.length > 0 ||
                partialSnapshot.steps.length > 0 ||
                partialSnapshot.parts.length > 0;

              if (hasContent) {
                try {
                  await this.chatService.addMessage({
                    threadId,
                    userId: payload.userId,
                    role: 'assistant',
                    content: partialSnapshot.content || `[${controlledMessage}]`,
                    origin: payload.origin,
                    agentId: 'router',
                    operationId: payload.operationId,
                    ...(partialSnapshot.steps.length > 0 ? { steps: partialSnapshot.steps } : {}),
                    ...(partialSnapshot.parts.length > 0 ? { parts: partialSnapshot.parts } : {}),
                  });
                  logger.info('Persisted partial agent response on controlled abort', {
                    operationId: payload.operationId,
                    threadId,
                    controlledStatus,
                    contentLength: partialSnapshot.content.length,
                    stepCount: partialSnapshot.steps.length,
                  });
                } catch (chatErr) {
                  logger.warn('Failed to persist partial response on controlled abort', {
                    operationId: payload.operationId,
                    threadId,
                    error: chatErr instanceof Error ? chatErr.message : String(chatErr),
                  });
                }
              }
            }
          }

          logger.info('Agent job aborted after explicit lifecycle transition', {
            operationId: payload.operationId,
            userId: payload.userId,
            controlledStatus,
          });

          return {
            result: {
              summary:
                controlledStatus === 'paused'
                  ? 'Operation paused. Resume whenever you are ready.'
                  : 'Operation cancelled by user.',
              data: {
                aborted: true,
                controlledStatus,
                operationStatus: controlledStatus,
              },
            },
            durationMs: Date.now() - startMs,
            completedAt: new Date().toISOString(),
          };
        }

        // Abort without a controlled persisted state should fail once, never retry.
        handledError = new UnrecoverableError(err.message || 'Operation aborted');
      }

      if (isJobTimeoutError(handledError)) {
        try {
          const continuationResult = await this.continueTimedOutJob(
            job,
            repo,
            payload,
            handledError.message,
            eventWriter,
            startMs,
            billingDb,
            iapHoldId
          );
          if (continuationResult) {
            return continuationResult;
          }
        } catch (continuationErr) {
          logger.error('Failed to auto-continue timed out agent job', {
            operationId: payload.operationId,
            error:
              continuationErr instanceof Error ? continuationErr.message : String(continuationErr),
          });
        }
      }

      // ── Yield handling: agent needs user input or approval ─────────────
      if (isAgentYield(handledError)) {
        const yieldPayload = handledError.payload;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
        const yieldStatus =
          yieldPayload.reason === 'needs_approval' ? 'awaiting_approval' : 'awaiting_input';
        const yieldOutcomeCode =
          yieldPayload.reason === 'needs_approval' ? 'approval_required' : 'input_required';

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

        await job.updateProgress({
          status: yieldStatus,
          message: yieldPayload.promptToUser,
          agentId: yieldPayload.agentId,
          outcomeCode: yieldOutcomeCode,
          metadata: {
            reason: yieldPayload.reason,
            approvalId: yieldPayload.approvalId,
          },
          percent: Math.min(99, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
          currentStep: stepIndex,
          totalSteps,
          updatedAt: new Date().toISOString(),
        });

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

        eventWriter.emit({
          type: 'operation',
          operationId: payload.operationId,
          threadId,
          status: yieldStatus,
          yieldState,
          timestamp: new Date().toISOString(),
        });
        await eventWriter.dispose();

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
          const approvalCopy =
            yieldPayload.reason === 'needs_approval' && yieldPayload.pendingToolCall
              ? resolveAgentApprovalCopy({
                  toolName: yieldPayload.pendingToolCall.toolName,
                  toolInput: yieldPayload.pendingToolCall.toolInput,
                })
              : null;
          if (yieldPayload.reason === 'needs_approval' && approvalCopy) {
            await notifyYield(activityDb, {
              userId: payload.userId,
              reason: 'needs_approval',
              operationId: payload.operationId,
              threadId,
              approvalId: yieldPayload.approvalId,
              actionSummary: approvalCopy.actionSummary,
            });
          } else {
            await notifyYield(activityDb, {
              userId: payload.userId,
              reason: 'needs_input',
              operationId: payload.operationId,
              threadId,
              approvalId: yieldPayload.approvalId,
              promptToUser: yieldPayload.promptToUser,
            });
          }
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

      const message = handledError instanceof Error ? handledError.message : 'Agent pipeline error';
      const errorCode = getAgentEngineErrorCode(handledError) ?? 'AGENT_PIPELINE_FAILED';
      const failedAgentId = isAgentIdentifier(payload.agent)
        ? payload.agent
        : isAgentIdentifier((payload.context as Record<string, unknown> | undefined)?.['agentId'])
          ? ((payload.context as Record<string, unknown>)['agentId'] as AgentIdentifier)
          : undefined;

      await job.updateProgress({
        status: 'failed',
        message,
        agentId: failedAgentId,
        outcomeCode: 'task_failed',
        metadata: { errorCode },
        percent: Math.min(100, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
        currentStep: stepIndex,
        totalSteps,
        updatedAt: new Date().toISOString(),
      });

      // Write terminal 'done' event with error so frontend's Firestore listener knows to stop
      eventWriter.emit({
        type: 'operation',
        operationId: payload.operationId,
        threadId: payloadThreadId,
        status: 'failed',
        timestamp: new Date().toISOString(),
      });
      eventWriter.emit({
        type: 'done',
        success: false,
        error: message,
        errorCode,
        outcomeCode: 'task_failed',
        metadata: { errorCode },
        agentId: failedAgentId ?? 'router',
      });
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
        if (scheduledRunContext) {
          await dispatchAgentPush(activityDb, {
            kind: 'agent_scheduled_execution_failed',
            userId: payload.userId,
            operationId: payload.operationId,
            scheduleId: scheduledRunContext.scheduleId,
            runId: scheduledRunContext.runId,
            threadId: payloadThreadId,
            title: 'Scheduled Agent Task Failed',
            body: message,
            errorMessage: message,
          });
        } else {
          await logAgentTaskFailure(activityDb, {
            userId: payload.userId,
            job: payload,
            errorMessage: message,
          });
        }
      } catch (notifyErr) {
        logger.error('Failed to dispatch failure notification', {
          operationId: payload.operationId,
          error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
        });
      }

      // Release any IAP hold — job failed, funds should not stay locked
      if (iapHoldId) {
        releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
          logger.warn('[billing] Failed to release IAP hold on job failure', {
            holdId: iapHoldId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }

      throw handledError;
    } finally {
      // Always unregister the AbortController — the LLM router is no longer
      // running at this point regardless of success, failure, or yield.
      this.queueService?.unregisterController(payload.operationId);
    }

    const resultData =
      typeof result.data === 'object' && result.data !== null
        ? (result.data as Record<string, unknown>)
        : undefined;
    const pauseCompletionGuard = await this.shouldSuppressTerminalCompletionForPause(
      repo,
      payload.operationId
    );
    if (pauseCompletionGuard.suppressed) {
      await eventWriter.flush().catch(() => undefined);
      await eventWriter.dispose();

      await job.updateProgress({
        status: 'paused',
        message: 'Operation paused by user',
        agentId: 'router',
        outcomeCode: 'input_required',
        metadata: {
          reason: 'paused_by_user',
          persistedStatus: pauseCompletionGuard.persistedStatus,
        },
        percent: Math.min(99, Math.round((stepIndex / Math.max(totalSteps, 1)) * 100)),
        currentStep: stepIndex,
        totalSteps,
        updatedAt: new Date().toISOString(),
      });

      if (iapHoldId) {
        releaseWalletHold(billingDb, iapHoldId).catch((e: unknown) => {
          logger.warn('[billing] Failed to release IAP hold for paused operation', {
            holdId: iapHoldId,
            error: e instanceof Error ? e.message : String(e),
          });
        });
      }

      logger.info('Pause guard suppressed terminal completion and side effects', {
        operationId: payload.operationId,
        userId: payload.userId,
        persistedStatus: pauseCompletionGuard.persistedStatus,
      });

      return {
        result: {
          summary: 'Operation paused. Resume whenever you are ready.',
          data: {
            paused: true,
            suppressedTerminalCompletion: true,
            persistedStatus: pauseCompletionGuard.persistedStatus,
          },
        },
        durationMs: Date.now() - startMs,
        completedAt: new Date().toISOString(),
      };
    }

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
    const firstFailedAssignedAgent = (
      resultData?.['firstFailedTask'] as { assignedAgent?: unknown } | undefined
    )?.assignedAgent;
    const finalAgentId =
      maxIterationsReached || planFailed
        ? isAgentIdentifier(firstFailedAssignedAgent)
          ? firstFailedAssignedAgent
          : isAgentIdentifier(payload.agent)
            ? payload.agent
            : 'router'
        : isAgentIdentifier(payload.agent)
          ? payload.agent
          : 'router';
    const terminalOutcomeCode =
      maxIterationsReached || planFailed ? 'task_failed' : 'success_default';

    // ── Flush remaining deltas and write terminal events ─────────────────
    //
    // Thread titles are now generated at enqueue time via generateTitleFromPromptOnly
    // in the route handler. No LLM call or blocking needed here — the title_updated
    // SSE event is published by the route immediately after thread creation.
    const summary = this.resolveResultSummary(result);

    // Flush any pending data/delta events to subscribers, but DEFER the terminal
    // `operation` event until AFTER the Firestore write succeeds. This prevents
    // a race where the frontend receives `complete` over SSE before the
    // `AgentJobs/{operationId}` document is updated, leaving the UI in an
    // inconsistent state (SSE says done, Firestore snapshot still shows running).
    await eventWriter.flush().catch(() => undefined);
    const terminalStatus = maxIterationsReached || planFailed ? 'error' : 'complete';
    const terminalOperationStatus: 'failed' | 'complete' =
      terminalStatus === 'error' ? 'failed' : 'complete';

    const emitTerminalOperationEvent = async (
      status: 'failed' | 'complete' = terminalOperationStatus
    ): Promise<void> => {
      try {
        eventWriter.emit({
          type: 'operation',
          operationId: payload.operationId,
          threadId: payloadThreadId,
          status,
          timestamp: new Date().toISOString(),
        });
        await eventWriter.flush().catch(() => undefined);
      } catch (emitErr) {
        logger.warn('Failed to emit terminal operation SSE event', {
          operationId: payload.operationId,
          status,
          error: emitErr instanceof Error ? emitErr.message : String(emitErr),
        });
      }
    };

    const terminalProgress: AgentJobProgress = {
      status: maxIterationsReached || planFailed ? 'failed' : 'completed',
      message: maxIterationsReached || planFailed ? terminalMessage : 'All tasks finished.',
      agentId: finalAgentId,
      outcomeCode: terminalOutcomeCode,
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

      // Emit terminal SSE event AFTER persistence so the frontend's SSE-derived
      // state cannot get ahead of the Firestore document.
      await emitTerminalOperationEvent('failed');

      if (scheduledRunContext) {
        try {
          const activityDb = await this.getActivityFirestore(job);
          await dispatchAgentPush(activityDb, {
            kind: 'agent_scheduled_execution_failed',
            userId: payload.userId,
            operationId: payload.operationId,
            scheduleId: scheduledRunContext.scheduleId,
            runId: scheduledRunContext.runId,
            threadId: payloadThreadId,
            title: 'Scheduled Agent Task Failed',
            body: terminalMessage,
            errorMessage: terminalMessage,
          });
        } catch (notifyErr) {
          logger.error('Failed to dispatch scheduled max-iterations failure notification', {
            operationId: payload.operationId,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }

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

      // Emit terminal SSE event AFTER persistence so the frontend's SSE-derived
      // state cannot get ahead of the Firestore document.
      await emitTerminalOperationEvent('failed');

      if (scheduledRunContext) {
        try {
          const activityDb = await this.getActivityFirestore(job);
          await dispatchAgentPush(activityDb, {
            kind: 'agent_scheduled_execution_failed',
            userId: payload.userId,
            operationId: payload.operationId,
            scheduleId: scheduledRunContext.scheduleId,
            runId: scheduledRunContext.runId,
            threadId: payloadThreadId,
            title: 'Scheduled Agent Task Failed',
            body: terminalMessage,
            errorMessage: terminalMessage,
          });
        } catch (notifyErr) {
          logger.error('Failed to dispatch scheduled plan-failure notification', {
            operationId: payload.operationId,
            error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
          });
        }
      }

      return {
        result,
        durationMs: Date.now() - startMs,
        completedAt: new Date().toISOString(),
      };
    }

    // `summary` and `generatedOperationTitle` are already computed above in the
    // terminal-events section. Re-use them here so we avoid a redundant LLM call;
    // `result.title` was already set if a title was generated in time.

    // Persist final result to Firestore.
    // Fail closed: if completion state cannot be persisted, do not continue with
    // success side-effects while the durable job record is inconsistent.
    try {
      await repo.markCompleted(payload.operationId, result);
    } catch (err: unknown) {
      const persistError = err instanceof Error ? err.message : String(err);
      logger.error('Failed to write completion to Firestore', {
        operationId: payload.operationId,
        error: persistError,
      });

      await repo
        .markFailed(payload.operationId, `Completion persistence failed: ${persistError}`)
        .catch((markFailedErr: unknown) => {
          logger.error('Failed to persist fallback failed status after completion write error', {
            operationId: payload.operationId,
            error: markFailedErr instanceof Error ? markFailedErr.message : String(markFailedErr),
          });
        });

      // Notify clients that the operation failed even though it ran to completion
      // logically — the durable record is the source of truth.
      await emitTerminalOperationEvent('failed');

      throw new AgentEngineError(
        'AGENT_COMPLETION_PERSIST_FAILED',
        `Failed to persist completion state: ${persistError}`,
        { metadata: { operationId: payload.operationId } }
      );
    }

    // Firestore write succeeded — now safe to tell SSE subscribers we're done.
    // Frontend `onSnapshot` and SSE listeners will now agree on the terminal state.
    await emitTerminalOperationEvent('complete');

    // Billing deduction: use centralized pipeline
    void executeBillingDeduction({
      db: billingDb,
      userId: payload.userId,
      operationId: payload.operationId,
      coordinatorId: payload.agent,
      agentTools: invokedTools,
      successfulTools,
      environment: job.data.environment,
      iapHoldId: iapHoldId ?? undefined,
      metadata: { agent: payload.agent, agentTools: invokedTools, successfulTools },
    });

    // Dispatch activity feed item + push notification (fire-and-forget).
    // Skip push when the operation currently has an active live stream subscriber.
    // The user is already watching the completion in real time.
    try {
      const activityDb = await this.getActivityFirestore(job);

      if (scheduledRunContext) {
        const schedCopy = resolveAgentSuccessNotificationCopy({
          title: result.title?.trim() || undefined,
          summary: result.summary?.trim() || undefined,
        });
        await dispatchAgentPush(activityDb, {
          kind: 'agent_scheduled_execution_completed',
          userId: payload.userId,
          operationId: payload.operationId,
          scheduleId: scheduledRunContext.scheduleId,
          runId: scheduledRunContext.runId,
          threadId: payloadThreadId,
          title: schedCopy.title,
          body: schedCopy.body,
        });
      } else {
        const latestJobDoc =
          typeof (repo as { getById?: unknown }).getById === 'function'
            ? await repo.getById(payload.operationId)
            : null;
        const viewerLastSeenAtRaw = (latestJobDoc as Record<string, unknown> | null)?.[
          'viewerLastSeenAt'
        ];
        const viewerLastSeenAtMs =
          typeof viewerLastSeenAtRaw === 'string' ? Date.parse(viewerLastSeenAtRaw) : Number.NaN;
        const hasRecentViewerHeartbeat =
          Number.isFinite(viewerLastSeenAtMs) && Date.now() - viewerLastSeenAtMs <= 60_000;

        const activeSubscribers =
          typeof this.pubsub.subscriberCount === 'function'
            ? await this.pubsub.subscriberCount(payload.operationId)
            : 0;
        if (activeSubscribers > 0 && hasRecentViewerHeartbeat) {
          logger.info('Skipping completion push; active engaged viewer detected', {
            operationId: payload.operationId,
            subscriberCount: activeSubscribers,
            viewerLastSeenAt: viewerLastSeenAtRaw,
          });
        } else {
          await logAgentTaskCompletion(activityDb, {
            userId: payload.userId,
            job: payload,
            result,
          });
        }
      }
    } catch (notifyErr) {
      logger.error('Failed to dispatch activity/notification', {
        operationId: payload.operationId,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    // ─── Weekly recap email (fire-and-forget) ─────────────────────────────
    if (payload.triggerEvent?.type === 'weekly_recap') {
      const { getFirestore } = await import('firebase-admin/firestore');
      void processRecapForUser(payload.userId, summary, job.id?.toString(), getFirestore());
    }

    const persistedStreamSnapshot = persistedAssistantStream.snapshot();
    const persistedAssistantContentForDone =
      persistedStreamSnapshot.content.length > 0 ? persistedStreamSnapshot.content : summary;

    // ─── Persist assistant response to MongoDB thread ─────────────────────
    const contextObj =
      typeof payload.context === 'object' && payload.context !== null ? payload.context : {};
    const threadId =
      typeof (contextObj as Record<string, unknown>)['threadId'] === 'string'
        ? ((contextObj as Record<string, unknown>)['threadId'] as string)
        : undefined;
    let persistedAssistantMessageId: string | undefined;

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

        const persistedAssistantMessage = await this.chatService.addMessage({
          threadId,
          userId: payload.userId,
          role: 'assistant',
          content: persistedAssistantContentForDone,
          origin: payload.origin,
          agentId,
          operationId: payload.operationId,
          toolCalls,
          ...(persistedStreamSnapshot.steps.length > 0
            ? { steps: persistedStreamSnapshot.steps }
            : {}),
          ...(persistedStreamSnapshot.parts.length > 0
            ? { parts: persistedStreamSnapshot.parts }
            : {}),
          resultData:
            typeof result.data === 'object' && result.data !== null
              ? (result.data as Record<string, unknown>)
              : undefined,
        });
        persistedAssistantMessageId = persistedAssistantMessage.id;
        logger.info('Agent response persisted to MongoDB thread', {
          threadId,
          operationId: payload.operationId,
          messageId: persistedAssistantMessageId,
        });

        // Thread title is managed at enqueue time via generateTitleFromPromptOnly
        // in the route handler (chat.routes.ts). No LLM call is needed here.
        // If the upstream title gen failed, the thread title remains the raw
        // prompt prefix — still readable. applyGeneratedThreadTitle's guard
        // prevents any accidental overwrite if both paths ran.
      } catch (chatErr) {
        // Chat persistence must never fail the job
        logger.warn('Failed to persist agent response to MongoDB', {
          threadId,
          operationId: payload.operationId,
          error: chatErr instanceof Error ? chatErr.message : String(chatErr),
        });
      }
    }

    const shouldSuppressDoneMessage =
      !maxIterationsReached &&
      !planFailed &&
      normalizeTerminalMessageText(terminalMessage) ===
        normalizeTerminalMessageText(persistedAssistantContentForDone);
    const doneMessageForEvent = shouldSuppressDoneMessage ? undefined : terminalMessage;

    eventWriter.emit({
      type: 'done',
      success: !maxIterationsReached && !planFailed,
      message: doneMessageForEvent,
      outcomeCode: terminalOutcomeCode,
      agentId: finalAgentId,
      messageId: persistedAssistantMessageId,
    });
    await eventWriter.dispose();

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
  private streamEventToSSE(
    event: StreamEvent,
    operationId: string,
    threadId?: string
  ): { event: string; data: unknown } | null {
    const seqPayload = typeof event.seq === 'number' ? { seq: event.seq } : {};
    switch (event.type) {
      case 'card':
        return {
          event: 'card',
          data: {
            ...(event.cardData ?? {}),
            ...seqPayload,
          },
        };
      case 'title_updated':
        return {
          event: 'title_updated',
          data: {
            ...seqPayload,
            operationId,
            ...(event.threadId ? { threadId: event.threadId } : {}),
            title: event.title ?? '',
            timestamp: event.timestamp ?? new Date().toISOString(),
          },
        };
      case 'operation':
        return {
          event: 'operation',
          data: {
            ...seqPayload,
            operationId,
            ...(event.threadId ? { threadId: event.threadId } : {}),
            status: event.status ?? 'in-progress',
            ...(event.agentId ? { agentId: event.agentId } : {}),
            ...(event.stageType ? { stageType: event.stageType } : {}),
            ...(event.stage ? { stage: event.stage } : {}),
            ...(event.outcomeCode ? { outcomeCode: event.outcomeCode } : {}),
            ...(event.metadata ? { metadata: event.metadata } : {}),
            ...(event.message ? { message: event.message } : {}),
            ...(event.yieldState ? { yieldState: event.yieldState } : {}),
            timestamp: event.timestamp ?? new Date().toISOString(),
          },
        };
      case 'progress_stage':
      case 'progress_subphase':
      case 'metric':
        return {
          event: 'progress',
          data: {
            ...seqPayload,
            operationId,
            ...(event.threadId ? { threadId: event.threadId } : {}),
            type: event.type,
            ...(event.agentId ? { agentId: event.agentId } : {}),
            ...(event.stageType ? { stageType: event.stageType } : {}),
            ...(event.stage ? { stage: event.stage } : {}),
            ...(event.outcomeCode ? { outcomeCode: event.outcomeCode } : {}),
            ...(event.metadata ? { metadata: event.metadata } : {}),
            ...(event.message ? { message: event.message } : {}),
            timestamp: event.timestamp ?? new Date().toISOString(),
          },
        };
      case 'delta':
        return {
          event: 'delta',
          data: {
            ...seqPayload,
            content: event.text ?? '',
            emittedAt: new Date().toISOString(),
          },
        };
      case 'step_active':
        return {
          event: 'step',
          data: {
            ...seqPayload,
            id: event.stepId ?? event.agentId ?? 'unknown',
            label: event.message ?? '',
            agentId: event.agentId,
            stageType: event.stageType,
            stage: event.stage,
            status: 'active',
            icon: event.icon,
          },
        };
      case 'step_done':
        return {
          event: 'step',
          data: {
            ...seqPayload,
            id: event.stepId ?? event.agentId ?? 'unknown',
            label: event.message ?? '',
            agentId: event.agentId,
            stageType: event.stageType,
            stage: event.stage,
            status: 'success',
            icon: event.icon,
          },
        };
      case 'step_error':
        return {
          event: 'step',
          data: {
            ...seqPayload,
            id: event.stepId ?? event.agentId ?? 'unknown',
            label: event.message ?? '',
            agentId: event.agentId,
            stageType: event.stageType,
            stage: event.stage,
            status: 'error',
            icon: event.icon,
          },
        };
      case 'tool_call':
        // tool_call fires during LLM streaming and has no stepId yet.
        // step_active always follows immediately with the same stepId and a
        // richer label, so skip SSE step creation for tool_call to avoid
        // creating a duplicate active row that would never resolve.
        return null;
      case 'tool_result':
        return {
          event: 'step',
          data: {
            ...seqPayload,
            id: event.stepId ?? event.toolName ?? 'tool',
            label: event.message ?? '',
            agentId: event.agentId,
            stageType: event.stageType,
            stage: event.stage,
            status: event.toolSuccess ? 'success' : 'error',
            icon: event.icon,
          },
        };
      case 'done': {
        const doneStatus =
          event.status ?? (event.success === false ? 'error' : event.error ? 'error' : 'complete');
        return {
          event: 'done',
          data: {
            ...seqPayload,
            operationId,
            ...(threadId ? { threadId } : {}),
            status: doneStatus,
            success: event.success ?? true,
            error: event.error,
            message: event.message,
            messageId: event.messageId,
            timestamp: new Date().toISOString(),
          },
        };
      }
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
          job.data.kind === 'agent'
            ? job.data.payload.operationId
            : job.data.kind === 'thread_summarization'
              ? `summarize_${job.data.threadId}`
              : job.data.operationId;

        logger.info('Agent queue job completed', {
          jobId: job.id,
          operationId,
          durationMs: duration,
        });
      }
    });

    this.worker.on('failed', (job, err) => {
      const operationId =
        job?.data.kind === 'agent'
          ? job.data.payload.operationId
          : job?.data.kind === 'thread_summarization'
            ? `summarize_${job.data.threadId}`
            : job?.data.kind === 'playbook_generation'
              ? job.data.operationId
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
