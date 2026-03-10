/**
 * @fileoverview Agent Queue Module — Entry Point
 * @module @nxt1/backend/modules/agent/queue
 *
 * BullMQ-backed background job processing for Agent X.
 */

export { AgentQueueService } from './queue.service.js';
export { AgentWorker } from './agent.worker.js';
export { AgentJobRepository } from './job.repository.js';
export { bootstrapAgentQueue } from './bootstrap.js';
export type {
  AgentQueueJobData,
  AgentQueueJobResult,
  AgentJobProgress,
  AgentJobStatusResponse,
} from './queue.types.js';
export { AGENT_QUEUE_NAME, AGENT_QUEUE_PREFIX, WORKER_CONCURRENCY } from './queue.types.js';
