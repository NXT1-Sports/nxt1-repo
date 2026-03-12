/**
 * @fileoverview Agent Worker — Background Job Processor
 * @module @nxt1/backend/workers
 *
 * Async worker that picks up Agent X operation jobs from the queue
 * and runs the full orchestration loop in the background.
 *
 * Architecture:
 * ┌──────────┐     ┌───────────┐     ┌──────────────┐     ┌────────────┐
 * │ API Route│ ──► │ Job Queue │ ──► │ Agent Worker  │ ──► │ Firestore  │
 * │ (HTTP)   │     │ (Redis)   │     │ (this file)   │     │ (realtime) │
 * └──────────┘     └───────────┘     └──────────────┘     └────────────┘
 *       ▲                                    │                    │
 *       │                                    │                    ▼
 *   User Request                        LLM + Tools          Frontend SSE
 *
 * Flow:
 * 1. API route receives a user command → creates an operation doc → pushes a job.
 * 2. This worker dequeues the job.
 * 3. The AgentRouter classifies intent → plans → runs ReAct loop per task.
 * 4. Each step update is written to Firestore (or emitted via SSE).
 * 5. The frontend's real-time listener renders progress as it happens.
 * 6. On completion, the final result is stored and the job is marked done.
 *
 * Designed to be deployed as a separate Cloud Run service or
 * run in-process during development.
 *
 * @example
 * ```ts
 * // Start the worker (production — separate process)
 * import { startAgentWorker } from './workers/agent.worker.js';
 * await startAgentWorker();
 *
 * // Or in dev, call processJob directly:
 * import { processAgentJob } from './workers/agent.worker.js';
 * await processAgentJob(jobPayload);
 * ```
 */

import type { AgentJobPayload, AgentJobUpdate, AgentOperationResult } from '@nxt1/core';
import { AGENT_JOB_CONFIG } from '@nxt1/core';
import { OpenRouterService } from '../modules/agent/llm/openrouter.service.js';
import { AgentRouter } from '../modules/agent/agent.router.js';
import { ToolRegistry } from '../modules/agent/tools/tool-registry.js';
import { ContextBuilder } from '../modules/agent/memory/context-builder.js';
import { logAgentTaskCompletion } from '../services/agent-activity.service.js';
import { logger } from '../utils/logger.js';

// Import coordinators
import { GeneralAgent } from '../modules/agent/agents/general.agent.js';
import { PerformanceCoordinatorAgent } from '../modules/agent/agents/performance-coordinator.agent.js';
import { RecruitingCoordinatorAgent } from '../modules/agent/agents/recruiting-coordinator.agent.js';
import { BrandMediaCoordinatorAgent } from '../modules/agent/agents/brand-media-coordinator.agent.js';
import { ComplianceCoordinatorAgent } from '../modules/agent/agents/compliance-coordinator.agent.js';

// ─── Shared Instances (initialized once, reused across jobs) ────────────────

let router: AgentRouter | undefined;

/**
 * Lazily initialize the agent infrastructure.
 * Called once on first job, then reused.
 */
function getRouter(): AgentRouter {
  if (router) return router;

  const llm = new OpenRouterService();
  const toolRegistry = new ToolRegistry();
  const contextBuilder = new ContextBuilder();

  router = new AgentRouter(llm, toolRegistry, contextBuilder);

  // Register all coordinators
  router.registerAgent(new GeneralAgent());
  router.registerAgent(new PerformanceCoordinatorAgent());
  router.registerAgent(new RecruitingCoordinatorAgent());
  router.registerAgent(new BrandMediaCoordinatorAgent());
  router.registerAgent(new ComplianceCoordinatorAgent());

  // Future: Register tools here as they're implemented
  // toolRegistry.register(new FetchPlayerStatsTool(db));
  // toolRegistry.register(new SendEmailTool(emailService));

  return router;
}

/**
 * Process a single agent job.
 * Called by the queue consumer for each dequeued job.
 *
 * On successful completion, writes an activity item and triggers
 * a push notification via the onNotificationCreated Cloud Function.
 */
export async function processAgentJob(
  payload: AgentJobPayload,
  onUpdate?: (update: AgentJobUpdate) => void
): Promise<AgentOperationResult> {
  const agentRouter = getRouter();
  const result = await agentRouter.run(payload, onUpdate);

  // Notify the user via activity feed + push notification
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    await logAgentTaskCompletion(getFirestore(), {
      userId: payload.userId,
      job: payload,
      result,
    });
  } catch (notifyErr) {
    // Notification failure must never fail the job itself
    logger.error('[AgentWorker] Failed to log activity/notification', { error: notifyErr });
  }

  return result;
}

/**
 * Start the worker loop (listens to the Redis queue indefinitely).
 * Called when this module runs as a standalone Cloud Run service.
 *
 * NOTE: BullMQ/Redis integration is Sprint 2 scope. For now,
 * jobs are processed synchronously via processAgentJob().
 * This function is a placeholder for the queue listener.
 */
export async function startAgentWorker(): Promise<void> {
  // Validate environment before starting
  const apiKey = process.env['OPENROUTER_API_KEY'];
  if (!apiKey) {
    throw new Error('Cannot start agent worker: OPENROUTER_API_KEY is not set.');
  }

  console.log(
    `[AgentWorker] Ready. Queue: ${AGENT_JOB_CONFIG.QUEUE_NAME}, ` +
      `Concurrency: ${AGENT_JOB_CONFIG.CONCURRENCY}`
  );

  // Future Sprint 2: BullMQ worker
  // const worker = new Worker(
  //   AGENT_JOB_CONFIG.QUEUE_NAME,
  //   async (job) => {
  //     await processAgentJob(job.data, (update) => {
  //       // Write update to Firestore for real-time frontend display
  //     });
  //   },
  //   {
  //     connection: redis,
  //     concurrency: AGENT_JOB_CONFIG.CONCURRENCY,
  //     limiter: { max: AGENT_JOB_CONFIG.CONCURRENCY, duration: 1000 },
  //   }
  // );
  //
  // process.on('SIGTERM', async () => { await worker.close(); });
  // process.on('SIGINT', async () => { await worker.close(); });
}
