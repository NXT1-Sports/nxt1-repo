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
} from './queue.types.js';
import {
  AGENT_QUEUE_NAME,
  AGENT_QUEUE_PREFIX,
  MAX_JOB_ATTEMPTS,
  RETRY_BACKOFF_MS,
  COMPLETED_JOB_TTL_S,
  FAILED_JOB_TTL_S,
} from './queue.types.js';

// ─── Service ────────────────────────────────────────────────────────────────

export class AgentQueueService {
  private readonly queue: Queue<AgentQueueJobData, AgentQueueJobResult>;
  private readonly redisUrl: string;

  constructor(redisUrl?: string) {
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
      userId: (job.data as AgentQueueJobData).payload.userId,
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
    const job = await this.queue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') return false;

    // For waiting/delayed jobs, just remove them from the queue.
    // For active jobs, BullMQ doesn't support mid-execution cancellation
    // natively — the worker checks for cancellation via progress polling.
    await job.remove();
    return true;
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
   * Expose the Redis URL so the AgentWorker can create its own connection.
   */
  getRedisUrl(): string {
    return this.redisUrl;
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
      attempts: MAX_JOB_ATTEMPTS,
      backoff: { type: 'exponential', delay: RETRY_BACKOFF_MS },
      removeOnComplete: { age: COMPLETED_JOB_TTL_S },
      removeOnFail: { age: FAILED_JOB_TTL_S },
    };
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
