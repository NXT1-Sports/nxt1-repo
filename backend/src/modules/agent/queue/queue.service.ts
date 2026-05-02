/**
 * @fileoverview Agent Queue Service
 * @module @nxt1/backend/modules/agent/queue
 *
 * Manages the BullMQ queue and IORedis connection for Agent X background jobs.
 *
 * Responsibilities:
 * - Owns the shared IORedis connection (reused by queue + worker).
 * - Enqueues new agent jobs with proper options (retries, backoff, TTLs).
 * - Provides pause, resume, cancel, and status query operations.
 * - Implements graceful shutdown for zero-data-loss deploys.
 *
 * Connection:
 * - Reads REDIS_URL from process.env (same variable as @nxt1/cache).
 * - BullMQ keys are namespaced under `nxt1:agent-jobs:*` so they
 *   don't collide with cache keys.
 *
 * @example
 * ```ts
 * const queueService = new AgentQueueService();
 * const jobId = await queueService.enqueue(jobPayload);
 * const status = await queueService.getJobStatus(jobId);
 * await queueService.pause(jobId);
 * ```
 */

import { Queue, type JobsOptions } from 'bullmq';
import type { AgentJobPayload } from '@nxt1/core';
import type {
  AgentQueueJobData,
  AgentQueueJobResult,
  AgentJobProgress,
  AgentJobStatusResponse,
  PlaybookGenerationQueueJobData,
  ThreadSummarizationQueueJobData,
} from './queue.types.js';
import {
  AGENT_QUEUE_NAME,
  AGENT_QUEUE_PREFIX,
  MAX_JOB_ATTEMPTS,
  RETRY_BACKOFF_MS,
  COMPLETED_JOB_TTL_S,
  FAILED_JOB_TTL_S,
  THREAD_SUMMARIZATION_DELAY_MS,
  THREAD_SUMMARIZATION_JOB_NAME,
} from './queue.types.js';

// ─── Service ────────────────────────────────────────────────────────────────

export class AgentQueueService {
  private readonly queue: Queue<AgentQueueJobData, AgentQueueJobResult>;
  private readonly redisUrl: string;
  private readonly jobRetryOverrides?: { maxAttempts?: number; retryBackoffMs?: number };

  /**
   * In-memory AbortController registry keyed by operationId.
   * Populated by AgentWorker at job-execution start; cleared at job end.
   * The cancel() method aborts the controller so the router's AbortSignal
   * fires immediately for in-flight LLM calls.
   */
  private readonly activeControllers = new Map<string, AbortController>();

  constructor(
    redisUrl?: string,
    jobRetryOverrides?: { maxAttempts?: number; retryBackoffMs?: number }
  ) {
    this.jobRetryOverrides = jobRetryOverrides;
    this.redisUrl = redisUrl ?? process.env['REDIS_URL'] ?? 'redis://localhost:6379';

    // Parse URL into RedisOptions for BullMQ compatibility (includes auth)
    const connection = AgentQueueService.parseRedisUrl(this.redisUrl);

    this.queue = new Queue(AGENT_QUEUE_NAME, {
      connection,
      prefix: AGENT_QUEUE_PREFIX,
      defaultJobOptions: this.defaultJobOptions(),
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────

  /**
   * Add a new agent job to the queue.
   * @param payload - The validated AgentJobPayload from the API layer.
   * @param environment - Which Firestore the job document lives in (staging vs production).
   * @returns The BullMQ job ID (same as operationId for easy lookup).
   */
  async enqueue(
    payload: AgentJobPayload,
    environment: 'staging' | 'production' = 'production'
  ): Promise<string> {
    const jobData: AgentQueueJobData = {
      kind: 'agent',
      payload,
      enqueuedAt: new Date().toISOString(),
      environment,
    };

    const job = await this.queue.add(payload.operationId, jobData, {
      jobId: payload.operationId,
    });

    return job.id ?? payload.operationId;
  }

  /**
   * Add a new asynchronous playbook generation job to the queue.
   * @param input - Minimal job identity payload used by the worker.
   * @param environment - Which Firestore the job document lives in (staging vs production).
   * @returns The BullMQ job ID (same as operationId for easy lookup).
   */
  async enqueuePlaybookGeneration(
    input: { operationId: string; userId: string },
    environment: 'staging' | 'production' = 'production'
  ): Promise<string> {
    const jobData: PlaybookGenerationQueueJobData = {
      kind: 'playbook_generation',
      operationId: input.operationId,
      userId: input.userId,
      enqueuedAt: new Date().toISOString(),
      environment,
    };

    const job = await this.queue.add(input.operationId, jobData, {
      jobId: input.operationId,
    });

    return job.id ?? input.operationId;
  }

  /**
   * Schedule summarization for an idle conversation thread.
   * Re-adding the same thread removes the prior delayed job first so the timer
   * always reflects the latest message activity.
   */
  async enqueueThreadSummarization(
    threadId: string,
    userId: string,
    delayMs: number = THREAD_SUMMARIZATION_DELAY_MS,
    environment: 'staging' | 'production' = 'production'
  ): Promise<string> {
    const jobId = `summarize_${threadId}`;
    const existingJob = await this.queue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();
      if (state !== 'active') {
        await existingJob.remove().catch(() => undefined);
      } else {
        return jobId;
      }
    }

    const jobData: ThreadSummarizationQueueJobData = {
      kind: 'thread_summarization',
      threadId,
      userId,
      delayMs,
      enqueuedAt: new Date().toISOString(),
      environment,
    };

    const job = await this.queue.add(THREAD_SUMMARIZATION_JOB_NAME, jobData, {
      jobId,
      delay: delayMs,
    });

    return job.id ?? jobId;
  }

  /**
   * Get the full status of a job (progress, result, errors).
   * Returns null if the job does not exist.
   */
  async getJobStatus(jobId: string): Promise<AgentJobStatusResponse | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = (job.progress as AgentJobProgress) ?? null;
    const returnValue = job.returnvalue ?? null;
    const failedReason = job.failedReason ?? null;

    return {
      jobId,
      userId: this.extractUserId(job.data as AgentQueueJobData),
      status: this.mapBullStateToOperationStatus(state, progress),
      progress,
      result: returnValue,
      error: failedReason,
      createdAt:
        (job.data as AgentQueueJobData).enqueuedAt ?? new Date(job.timestamp).toISOString(),
    };
  }

  /**
   * Cancel an active or waiting job.
   * If the job is actively being processed, it marks it for removal
   * so the worker can check and abort gracefully.
   */
  async cancel(jobId: string): Promise<boolean> {
    // Abort any in-flight LLM router call immediately via the signal.
    const controller = this.activeControllers.get(jobId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(jobId);
    }

    const job = await this.queue.getJob(jobId);
    if (!job) return controller !== undefined; // already aborted even if job gone

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') return false;

    await job.remove();
    return true;
  }

  /**
   * Register an AbortController for an actively executing job.
   * Called by AgentWorker immediately before invoking router.run().
   */
  registerController(operationId: string, controller: AbortController): void {
    this.activeControllers.set(operationId, controller);
  }

  /**
   * Remove a job's AbortController registration after the job ends.
   * Called by AgentWorker in its finally block.
   */
  unregisterController(operationId: string): void {
    this.activeControllers.delete(operationId);
  }

  /**
   * Pause the entire agent queue. No new jobs will be processed
   * until resume() is called. Already-active jobs finish naturally.
   */
  async pauseAll(): Promise<void> {
    await this.queue.pause();
  }

  /**
   * Resume the agent queue after a pause.
   */
  async resumeAll(): Promise<void> {
    await this.queue.resume();
  }

  /**
   * Check if the queue is currently paused.
   */
  async isPaused(): Promise<boolean> {
    return this.queue.isPaused();
  }

  /**
   * Get counts of jobs by state (useful for admin dashboard).
   */
  async getCounts(): Promise<Record<string, number>> {
    return this.queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
  }

  /**
   * Lightweight health probe for queue admission control.
   * Returns true only when the underlying Redis connection can respond to PING.
   */
  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.queue.client;
      const pong = await client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Expose the Redis URL so the AgentWorker can create its own connection.
   */
  getRedisUrl(): string {
    return this.redisUrl;
  }

  // ─── Recurring Jobs ─────────────────────────────────────────────────────

  /**
   * Add a repeating (cron-based) job to the queue.
   * Ownership metadata (userId, actionSummary) must be persisted by the
   * caller to a durable store (Firestore) — this method is a pure BullMQ
   * operation with no external side-effects.
   *
   * @param jobName - Unique name for this schedule (e.g. `recv:{userId}:{ts}`).
   * @param cronExpression - Standard 5-field cron pattern.
   * @param timezone - IANA timezone used to evaluate cron boundaries (e.g. `America/Chicago`).
   * @param payload - The AgentJobPayload executed on each fire.
   * @param environment - Which Firestore DB to use when the job runs.
   * @returns The BullMQ repeatable job key used for future cancellation.
   */
  async enqueueRecurring(
    jobName: string,
    cronExpression: string,
    timezone: string,
    payload: AgentJobPayload,
    environment: 'staging' | 'production' = 'production'
  ): Promise<string> {
    const jobData: AgentQueueJobData = {
      kind: 'agent',
      payload,
      enqueuedAt: new Date().toISOString(),
      environment,
    };

    // IMPORTANT: Do NOT set jobId on a repeatable job. BullMQ v5 auto-generates
    // per-execution IDs. A fixed jobId causes every subsequent execution to
    // collide with the previous one, resulting in skipped or stalled jobs.
    await this.queue.add(jobName, jobData, {
      repeat: { pattern: cronExpression, tz: timezone },
    });

    // BullMQ derives a deterministic key from queue prefix + name + pattern.
    // Retrieve it immediately after registration via the repeatables list.
    const repeatables = await this.queue.getRepeatableJobs();
    const match = repeatables.find((r) => r.name === jobName);
    return match?.key ?? jobName;
  }

  /**
   * Return all registered repeatable job definitions in this queue.
   * Callers must filter by userId using their own Firestore metadata store.
   */
  async getAllRepeatableJobs() {
    return this.queue.getRepeatableJobs();
  }

  /**
   * Remove a recurring schedule by its BullMQ repeatable key.
   * The caller is responsible for deleting the Firestore metadata document.
   * @returns true if found and removed, false if the key was not registered.
   */
  async removeRecurringJob(key: string): Promise<boolean> {
    const repeatables = await this.queue.getRepeatableJobs();
    if (!repeatables.find((r) => r.key === key)) return false;
    await this.queue.removeRepeatableByKey(key);
    return true;
  }

  /**
   * Graceful shutdown: close the queue.
   * Call this in your Express shutdown handler.
   */
  async shutdown(): Promise<void> {
    await this.queue.close();
  }

  /**
   * Parse a Redis URL into IORedis-compatible connection options.
   * Extracts host, port, password, username, and db number.
   */
  static parseRedisUrl(url: string): Record<string, unknown> {
    const parsed = new URL(url);
    const connection: Record<string, unknown> = {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      maxRetriesPerRequest: null,
    };
    if (parsed.password) connection['password'] = decodeURIComponent(parsed.password);
    if (parsed.username) connection['username'] = decodeURIComponent(parsed.username);
    // Redis URL path encodes the db number: redis://host:6379/2 → db 2
    const dbPath = parsed.pathname.replace('/', '');
    if (dbPath && /^\d+$/.test(dbPath)) connection['db'] = parseInt(dbPath, 10);
    return connection;
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private defaultJobOptions(): JobsOptions {
    return {
      attempts: this.jobRetryOverrides?.maxAttempts ?? MAX_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: this.jobRetryOverrides?.retryBackoffMs ?? RETRY_BACKOFF_MS,
      },
      removeOnComplete: { age: COMPLETED_JOB_TTL_S },
      removeOnFail: { age: FAILED_JOB_TTL_S },
    };
  }

  private extractUserId(jobData: AgentQueueJobData): string {
    return jobData.kind === 'agent' ? jobData.payload.userId : jobData.userId;
  }

  /**
   * Map BullMQ's internal job state string to our AgentOperationStatus.
   * If the job is active and has reported progress, use the progress status.
   */
  private mapBullStateToOperationStatus(
    state: string,
    progress: AgentJobProgress | null
  ): AgentJobStatusResponse['status'] {
    switch (state) {
      case 'waiting':
      case 'delayed':
      case 'paused':
        return 'queued';
      case 'active':
        return progress?.status ?? 'thinking';
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      default:
        return 'queued';
    }
  }
}
