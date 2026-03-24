/**
 * @fileoverview Agent Queue Bootstrap
 * @module @nxt1/backend/modules/agent/queue
 *
 * Initializes the full Agent X background engine at server startup:
 * 1. Creates the AgentQueueService (Redis + BullMQ queue).
 * 2. Creates the AgentJobRepository (Firestore persistence).
 * 3. Creates the AgentWorker (background processor).
 * 4. Wires the AgentRouter (planner + sub-agents) into the worker.
 * 5. Injects dependencies into the route controller.
 * 6. Returns a shutdown function for graceful server termination.
 *
 * Call this function once inside your Express server's init sequence,
 * AFTER Firebase Admin and Redis are initialized.
 *
 * @example
 * ```ts
 * import { bootstrapAgentQueue } from './modules/agent/queue/bootstrap.js';
 *
 * const shutdown = await bootstrapAgentQueue();
 * // On SIGTERM:
 * await shutdown();
 * ```
 */

import { AgentQueueService } from './queue.service.js';
import { AgentWorker } from './agent.worker.js';
import { AgentJobRepository } from './job.repository.js';
import { AgentRouter } from '../agent.router.js';
import { OpenRouterService } from '../llm/openrouter.service.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import {
  ScrapeWebpageTool,
  ScrapeAndIndexProfileTool,
  ReadDistilledSectionTool,
  ReadWebpageTool,
  InteractWithWebpageTool,
  ScraperService,
  FirecrawlService,
} from '../tools/scraping/index.js';
import {
  UpdateAthleteProfileTool,
  UpdateTeamProfileTool,
  WriteCoreIdentityTool,
  WriteCombineMetricsTool,
  WriteSeasonStatsTool,
  WriteRecruitingActivityTool,
  WriteCalendarEventsTool,
  WriteAthleteVideosTool,
  SearchKnowledgeBaseTool,
} from '../tools/database/index.js';
import {
  GenerateScoutReportTool,
  CompareAthletesTool,
  AnalyzeRosterGapsTool,
  BuildRecruitingBoardTool,
} from '../tools/analytics/index.js';
import { GenerateImageTool } from '../tools/media/index.js';
import { WebSearchTool } from '../tools/integrations/web-search.tool.js';
import { AskUserTool } from '../tools/comms/ask-user.tool.js';
import { ContextBuilder } from '../memory/context-builder.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { AgentChatService } from '../services/agent-chat.service.js';
import { TelemetryService } from '../services/telemetry.service.js';
import { GuardrailRunner } from '../guardrails/guardrail-runner.js';
import {
  NcaaComplianceGuardrail,
  AntiHallucinationGuardrail,
  ToneEnforcementGuardrail,
} from '../guardrails/index.js';
import {
  DataCoordinatorAgent,
  PerformanceCoordinatorAgent,
  RecruitingCoordinatorAgent,
  BrandMediaCoordinatorAgent,
  ComplianceCoordinatorAgent,
  GeneralAgent,
} from '../agents/index.js';
import { setAgentDependencies } from '../../../routes/agent-x.routes.js';
import { setWelcomeDependencies } from '../../../services/agent-welcome.service.js';
import { setScrapeDependencies } from '../../../services/agent-scrape.service.js';
import { stagingDb } from '../../../utils/firebase-staging.js';
import { logger } from '../../../utils/logger.js';

/**
 * Initialize the entire Agent X background processing engine.
 *
 * @returns A shutdown function that gracefully closes all connections.
 */
export async function bootstrapAgentQueue(): Promise<() => Promise<void>> {
  // ── 1. Core services ─────────────────────────────────────────────────
  const telemetry = new TelemetryService();
  const llm = new OpenRouterService({
    onTelemetry: (record) => {
      void telemetry.recordLLMCall({
        operationId: record.operationId,
        userId: record.userId,
        agentId: record.agentId,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        latencyMs: record.latencyMs,
        hadToolCall: record.hadToolCall,
      });
    },
  });
  const toolRegistry = new ToolRegistry();
  // Firecrawl-powered tools (shared service instance for connection pooling)
  let firecrawl: FirecrawlService | undefined;
  try {
    firecrawl = new FirecrawlService();
    logger.info('Firecrawl service initialized');
  } catch {
    logger.warn(
      'FIRECRAWL_API_KEY not configured — read_webpage and interact_with_webpage tools disabled'
    );
  }

  // All scraping tools share the same Firecrawl instance (single SDK client)
  const scraperService = new ScraperService(firecrawl ?? null);
  toolRegistry.register(new ScrapeWebpageTool(scraperService));
  toolRegistry.register(new ScrapeAndIndexProfileTool(undefined, llm));
  toolRegistry.register(new ReadDistilledSectionTool());
  if (firecrawl) {
    toolRegistry.register(new ReadWebpageTool(firecrawl));
    toolRegistry.register(new InteractWithWebpageTool(firecrawl));
  }

  toolRegistry.register(new UpdateAthleteProfileTool(stagingDb));
  toolRegistry.register(new UpdateTeamProfileTool());
  toolRegistry.register(new WriteCoreIdentityTool(stagingDb));
  toolRegistry.register(new WriteCombineMetricsTool(stagingDb));
  toolRegistry.register(new WriteSeasonStatsTool(stagingDb));
  toolRegistry.register(new WriteRecruitingActivityTool(stagingDb));
  toolRegistry.register(new WriteCalendarEventsTool(stagingDb));
  toolRegistry.register(new WriteAthleteVideosTool(stagingDb));
  toolRegistry.register(new GenerateImageTool(llm));

  // ── Analytics / high-intent tools ──────────────────────────────────────
  toolRegistry.register(new GenerateScoutReportTool(stagingDb));
  toolRegistry.register(new CompareAthletesTool(stagingDb));
  toolRegistry.register(new AnalyzeRosterGapsTool(stagingDb));
  toolRegistry.register(new BuildRecruitingBoardTool(stagingDb));

  // ── 1a. Vector memory & knowledge tools ──────────────────────────────
  const vectorMemory = new VectorMemoryService(llm);
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new SearchKnowledgeBaseTool(vectorMemory));
  toolRegistry.register(new AskUserTool());

  const contextBuilder = new ContextBuilder();

  // ── 1b. Guardrails (safety layer) ───────────────────────────────────
  const guardrailRunner = new GuardrailRunner([
    new NcaaComplianceGuardrail(),
    new AntiHallucinationGuardrail(),
    new ToneEnforcementGuardrail(),
  ]);

  // ── 2. Wire the AgentRouter with all sub-agents ───────────────────
  const router = new AgentRouter(llm, toolRegistry, contextBuilder, guardrailRunner);
  router.registerAgent(new DataCoordinatorAgent());
  router.registerAgent(new PerformanceCoordinatorAgent());
  router.registerAgent(new RecruitingCoordinatorAgent());
  router.registerAgent(new BrandMediaCoordinatorAgent());
  router.registerAgent(new ComplianceCoordinatorAgent());
  router.registerAgent(new GeneralAgent());

  // ── 3. Queue infrastructure ──────────────────────────────────────────────────
  const queueService = new AgentQueueService();
  const jobRepository = new AgentJobRepository(); // production Firestore
  const stagingJobRepository = new AgentJobRepository(stagingDb); // staging Firestore
  const agentChatService = new AgentChatService();

  // ── 4. Start the background worker ────────────────────────────────────
  // The worker wraps the AgentRouter and additionally persists
  // progress events to Firestore for real-time frontend updates.
  const baseWorker = new AgentWorker(
    router,
    jobRepository,
    stagingJobRepository,
    agentChatService,
    stagingDb
  );

  // ── 5. Inject dependencies into the REST routes ───────────────────────
  setAgentDependencies({
    queueService,
    jobRepository,
    chatService: agentChatService,
    contextBuilder,
    llmService: llm,
  });
  setWelcomeDependencies({ queueService, jobRepository, chatService: agentChatService });
  setScrapeDependencies({ queueService, jobRepository, chatService: agentChatService });

  logger.info('Agent X queue engine initialized');

  // ── 6. Return graceful shutdown handler ───────────────────────────────
  return async () => {
    await baseWorker.shutdown();
    await queueService.shutdown();
    logger.info('Agent X queue engine shut down');
  };
}
