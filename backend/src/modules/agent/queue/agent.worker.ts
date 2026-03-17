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
import type { AgentJobUpdate } from '@nxt1/core';
import type { AgentRouter } from '../agent.router.js';
import type { AgentQueueJobData, AgentQueueJobResult, AgentJobProgress } from './queue.types.js';
import {
  AGENT_QUEUE_NAME,
  AGENT_QUEUE_PREFIX,
  WORKER_CONCURRENCY,
  JOB_LOCK_DURATION_MS,
  JOB_TIMEOUT_MS,
} from './queue.types.js';
import { AgentQueueService } from './queue.service.js';
import { AgentJobRepository } from './job.repository.js';
import type { AgentChatService } from '../services/agent-chat.service.js';
import {
  logAgentTaskCompletion,
  logAgentTaskFailure,
} from '../../../services/agent-activity.service.js';
import { logger } from '../../../utils/logger.js';

// ─── Worker ─────────────────────────────────────────────────────────────────

export class AgentWorker {
  private readonly worker: Worker<AgentQueueJobData, AgentQueueJobResult>;

  constructor(
    private readonly router: AgentRouter,
    private readonly productionJobRepo: AgentJobRepository,
    private readonly stagingJobRepo: AgentJobRepository,
    private readonly chatService: AgentChatService,
    private readonly stagingFirestore?: FirebaseFirestore.Firestore,
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
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
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
    const { payload } = job.data;
    const startMs = Date.now();
    const repo = this.getJobRepo(job);

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

    // Execute the full agent pipeline (with overall timeout)
    let result;
    try {
      const userFirestore = this.getUserFirestore(job);
      const routerPromise = this.router.run(payload, onUpdate, userFirestore);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Agent job timed out after 5 minutes')), JOB_TIMEOUT_MS);
      });
      result = await Promise.race([routerPromise, timeoutPromise]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agent pipeline error';
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

      throw err;
    }

    // Mark 100% in BullMQ
    const completedProgress: AgentJobProgress = {
      status: 'completed',
      message: 'All tasks finished.',
      percent: 100,
      currentStep: totalSteps,
      totalSteps,
      updatedAt: new Date().toISOString(),
    };
    await job.updateProgress(completedProgress);

    // Treat max-iterations as a failure — the agent made no real progress
    if (result.data && (result.data as Record<string, unknown>)['maxIterationsReached'] === true) {
      logger.warn('Agent hit max iterations limit — marking as failed', {
        operationId: payload.operationId,
        userId: payload.userId,
      });
      await repo
        .markFailed(
          payload.operationId,
          'The agent reached its maximum iteration limit without completing the task.'
        )
        .catch((err: unknown) => {
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

    // Persist final result to Firestore
    await repo.markCompleted(payload.operationId, result).catch((err: unknown) => {
      logger.warn('Failed to write completion to Firestore', {
        operationId: payload.operationId,
        error: err instanceof Error ? err.message : String(err),
      });
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
    if (threadId && this.chatService) {
      try {
        // Extract summary with type-safe fallback chain
        let summary = 'Task completed.';
        if (typeof result.summary === 'string' && result.summary.length > 0) {
          summary = result.summary;
        } else if (typeof result.data === 'object' && result.data !== null) {
          const response = (result.data as Record<string, unknown>)['response'];
          if (typeof response === 'string' && response.length > 0) {
            summary = response;
          }
        }

        // Extract agentId with runtime type check
        const rawAgent =
          typeof result.data === 'object' && result.data !== null
            ? (result.data as Record<string, unknown>)['agent']
            : undefined;
        const agentId =
          typeof rawAgent === 'string'
            ? (rawAgent as import('@nxt1/core').AgentIdentifier)
            : undefined;

        await this.chatService.addMessage({
          threadId,
          userId: payload.userId,
          role: 'assistant',
          content: summary,
          origin: payload.origin,
          agentId,
          operationId: payload.operationId,
          resultData:
            typeof result.data === 'object' && result.data !== null
              ? (result.data as Record<string, unknown>)
              : undefined,
        });
        logger.info('Agent response persisted to MongoDB thread', {
          threadId,
          operationId: payload.operationId,
        });
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

  // ─── Event Listeners ───────────────────────────────────────────────────

  private attachEventListeners(): void {
    this.worker.on('completed', (job) => {
      if (job) {
        const duration = job.returnvalue?.durationMs ?? 0;
        logger.info('Agent job completed', {
          jobId: job.id,
          operationId: job.data.payload.operationId,
          durationMs: duration,
        });
      }
    });

    this.worker.on('failed', (job, err) => {
      logger.error('Agent job failed', {
        jobId: job?.id,
        operationId: job?.data.payload.operationId,
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
      void this.productionJobRepo.markFailed(jobId, failMessage).catch(() => {});
      void this.stagingJobRepo.markFailed(jobId, failMessage).catch(() => {});
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
