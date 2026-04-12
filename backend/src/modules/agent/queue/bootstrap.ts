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

import { Redis } from 'ioredis';
import { AgentQueueService } from './queue.service.js';
import { AgentWorker } from './agent.worker.js';
import { AgentJobRepository } from './job.repository.js';
import { AgentPubSubService } from './pubsub.service.js';
import { AgentRouter } from '../agent.router.js';
import { OpenRouterService } from '../llm/openrouter.service.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import {
  ScrapeWebpageTool,
  ScrapeAndIndexProfileTool,
  ReadDistilledSectionTool,
  ReadWebpageTool,
  InteractWithWebpageTool,
  OpenLiveViewTool,
  NavigateLiveViewTool,
  InteractWithLiveViewTool,
  ReadLiveViewTool,
  CloseLiveViewTool,
  LiveViewSessionService,
  ScraperService,
  FirecrawlService,
  DispatchExtractionTool,
} from '../tools/scraping/index.js';
import {
  WriteCoreIdentityTool,
  WriteCombineMetricsTool,
  WriteSeasonStatsTool,
  WriteRecruitingActivityTool,
  WriteCalendarEventsTool,
  WriteAthleteVideosTool,
  SearchMemoryTool,
  SearchCollegesTool,
  SearchCollegeCoachesTool,
  SaveMemoryTool,
  DeleteMemoryTool,
} from '../tools/database/index.js';
import { GenerateGraphicTool, AnalyzeVideoTool } from '../tools/media/index.js';
import { DynamicExportTool } from '../tools/data/index.js';
import { WebSearchTool } from '../tools/integrations/web-search.tool.js';
import { SendEmailTool } from '../tools/integrations/send-email.tool.js';
import { ScrapeTwitterTool } from '../tools/integrations/scrape-twitter.tool.js';
import { ScrapeInstagramTool } from '../tools/integrations/scrape-instagram.tool.js';
import { ApifyService } from '../tools/integrations/apify.service.js';
import { ScraperMediaService } from '../tools/integrations/scraper-media.service.js';
import { ApifyMcpBridgeService } from '../tools/integrations/apify-mcp-bridge.service.js';
import { SearchApifyActorsTool } from '../tools/integrations/search-apify-actors.tool.js';
import { GetApifyActorDetailsTool } from '../tools/integrations/get-apify-actor-details.tool.js';
import { CallApifyActorTool } from '../tools/integrations/call-apify-actor.tool.js';
import { GetApifyActorOutputTool } from '../tools/integrations/get-apify-actor-output.tool.js';
import { AskUserTool } from '../tools/comms/ask-user.tool.js';
import { WriteTimelinePostTool } from '../tools/comms/write-timeline-post.tool.js';
import { DelegateTaskTool } from '../tools/system/index.js';
import {
  ScheduleRecurringTaskTool,
  ListRecurringTasksTool,
  CancelRecurringTaskTool,
  EnqueueHeavyTaskTool,
} from '../tools/automation/index.js';
import { ContextBuilder } from '../memory/context-builder.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { KnowledgeRetrievalService } from '../memory/knowledge-retrieval.service.js';
import { AgentChatService } from '../services/agent-chat.service.js';
import { TelemetryService } from '../services/telemetry.service.js';
import {
  SkillRegistry,
  ScoutingRubricSkill,
  OutreachCopywritingSkill,
  ComplianceRulebookSkill,
  StaticGraphicStyleSkill,
  VideoHighlightStyleSkill,
  SocialCaptionStyleSkill,
  GlobalKnowledgeSkill,
} from '../skills/index.js';
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
import { addJobCost } from './job-cost-tracker.js';

/**
 * Quick probe: attempt a single TCP connect + PING to Redis.
 * Returns true if Redis responds, false if refused/timeout.
 * Uses a 2-second timeout so the dev server doesn't hang on startup.
 */
async function isRedisAvailable(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const db = parsed.pathname.replace('/', '');
  const client = new Redis({
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    db: db && /^\d+$/.test(db) ? parseInt(db, 10) : 0,
    lazyConnect: true,
    retryStrategy: () => null, // fail immediately, no retries
    enableOfflineQueue: false,
    connectTimeout: 2000,
  });
  // Suppress the ioredis 'error' event emitted on connection failure.
  // Without this listener Node.js would throw an unhandled error and crash.
  client.on('error', () => undefined);
  try {
    await client.connect();
    await client.quit();
    return true;
  } catch {
    client.disconnect();
    return false;
  }
}

/**
 * Initialize the entire Agent X background processing engine.
 *
 * @returns A shutdown function that gracefully closes all connections.
 */
export async function bootstrapAgentQueue(): Promise<() => Promise<void>> {
  // ── 0. Kill-switch: set AGENT_ENGINE_DISABLED=true in .env to skip entirely ──
  if (process.env['AGENT_ENGINE_DISABLED'] === 'true') {
    logger.warn('⚠️  AGENT_ENGINE_DISABLED=true — Agent Engine skipped.');
    return async () => {
      /* noop shutdown */
    };
  }

  // ── 0b. Redis availability check ─────────────────────────────────────
  const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  const redisOk = await isRedisAvailable(redisUrl);
  if (!redisOk) {
    if (process.env['NODE_ENV'] === 'production') {
      logger.error(
        `⚠️  Redis is unreachable at ${redisUrl}. ` +
          'Ensure the REDIS_URL secret is set in Firebase App Hosting (backend/apphosting.yaml) ' +
          'and the service account has roles/secretmanager.secretAccessor. ' +
          'Agent X features are unavailable until Redis is configured.'
      );
    } else {
      logger.warn(
        '⚠️  Redis unavailable — Agent Engine skipped. ' +
          'Start Redis locally (e.g. via WSL2/Docker: `docker run -p 6379:6379 redis`) ' +
          'or set AGENT_ENGINE_DISABLED=true to suppress this warning.'
      );
    }
    // Do NOT throw — let the server start so all other routes keep working.
    // Agent routes return 503 when queueService/jobRepository are null.
    return async () => {
      /* noop shutdown */
    };
  }
  // ── 1. Core services ─────────────────────────────────────────────────
  const telemetry = new TelemetryService();
  const llm = new OpenRouterService({
    onTelemetry: (record) => {
      // Accumulate cost per operationId so the worker can deduct billing
      // without querying the Helicone REST API (which requires a matching org key).
      logger.info('[onTelemetry] LLM call recorded', {
        operationId: record.operationId,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        costUsd: record.costUsd,
      });
      addJobCost(record.operationId, record.costUsd);
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
  toolRegistry.register(new DispatchExtractionTool(llm));
  if (firecrawl) {
    toolRegistry.register(new ReadWebpageTool(firecrawl));
    toolRegistry.register(new InteractWithWebpageTool(firecrawl));
    try {
      const liveViewService = new LiveViewSessionService();
      toolRegistry.register(new OpenLiveViewTool(liveViewService, stagingDb));
      toolRegistry.register(new NavigateLiveViewTool(liveViewService));
      toolRegistry.register(new InteractWithLiveViewTool(liveViewService));
      toolRegistry.register(new ReadLiveViewTool(liveViewService));
      toolRegistry.register(new CloseLiveViewTool(liveViewService));
      logger.info('Live view tools registered (open, navigate, interact, read, close)');
    } catch {
      logger.warn('LiveViewSessionService init failed — open_live_view tool disabled');
    }
  }

  toolRegistry.register(new WriteCoreIdentityTool(stagingDb));
  toolRegistry.register(new WriteCombineMetricsTool(stagingDb));
  toolRegistry.register(new WriteSeasonStatsTool(stagingDb));
  toolRegistry.register(new WriteRecruitingActivityTool(stagingDb));
  toolRegistry.register(new WriteCalendarEventsTool(stagingDb));
  toolRegistry.register(new WriteAthleteVideosTool(stagingDb));
  toolRegistry.register(new SearchCollegesTool());
  toolRegistry.register(new SearchCollegeCoachesTool());
  toolRegistry.register(new GenerateGraphicTool(llm));
  toolRegistry.register(new AnalyzeVideoTool(scraperService, llm));
  toolRegistry.register(new DynamicExportTool());

  // System tools (cross-cutting infrastructure — available to all agents)
  toolRegistry.register(new DelegateTaskTool());

  // ── 1a. Vector memory & knowledge tools ──────────────────────────────
  const vectorMemory = new VectorMemoryService(llm);
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new SearchMemoryTool(vectorMemory));
  toolRegistry.register(new SaveMemoryTool(vectorMemory));
  toolRegistry.register(new DeleteMemoryTool(vectorMemory));
  toolRegistry.register(new AskUserTool());
  toolRegistry.register(new WriteTimelinePostTool(stagingDb));
  toolRegistry.register(new SendEmailTool(stagingDb));

  // ── 1b. Twitter/X & Instagram scraping (Apify-hosted actors) ─────────
  try {
    const apifyService = new ApifyService();
    const scraperMedia = new ScraperMediaService();
    toolRegistry.register(new ScrapeTwitterTool(apifyService, scraperMedia));
    toolRegistry.register(new ScrapeInstagramTool(apifyService, scraperMedia));
    logger.info('Twitter/X & Instagram scraping tools registered (Apify + media persistence)');
  } catch {
    logger.warn(
      'APIFY_API_TOKEN not configured — scrape_twitter & scrape_instagram tools disabled'
    );
  }

  // ── 1c. MCP-bridged Apify tools (2026 architecture) ──────────────────
  try {
    const mcpBridge = new ApifyMcpBridgeService();
    const scraperMedia = new ScraperMediaService();
    toolRegistry.register(new SearchApifyActorsTool(mcpBridge));
    toolRegistry.register(new GetApifyActorDetailsTool(mcpBridge));
    toolRegistry.register(new CallApifyActorTool(mcpBridge, scraperMedia));
    toolRegistry.register(new GetApifyActorOutputTool(mcpBridge, scraperMedia));
    logger.info('MCP-bridged Apify tools registered (search, details, call, output)');
  } catch {
    logger.warn('APIFY_API_TOKEN not configured — MCP-bridged Apify tools disabled');
  }

  const contextBuilder = new ContextBuilder();

  // ── 1b. Skill Registry (dynamic domain knowledge injection) ─────────────────
  const skillRegistry = new SkillRegistry();
  skillRegistry.register(new ScoutingRubricSkill());
  skillRegistry.register(new OutreachCopywritingSkill());
  skillRegistry.register(new ComplianceRulebookSkill());
  skillRegistry.register(new StaticGraphicStyleSkill());
  skillRegistry.register(new VideoHighlightStyleSkill());
  skillRegistry.register(new SocialCaptionStyleSkill());

  // Global Knowledge Base — dynamic vector retrieval at runtime
  const knowledgeRetrieval = new KnowledgeRetrievalService(llm);
  skillRegistry.register(new GlobalKnowledgeSkill(knowledgeRetrieval));

  // ── 2. Wire the AgentRouter with all sub-agents ───────────────────
  const router = new AgentRouter(llm, toolRegistry, contextBuilder, skillRegistry);
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

  // ── 3a. Automation tools (require queueService + Firestore for durable metadata) ──
  toolRegistry.register(new ScheduleRecurringTaskTool(queueService, stagingDb));
  toolRegistry.register(new ListRecurringTasksTool(queueService, stagingDb));
  toolRegistry.register(new CancelRecurringTaskTool(queueService, stagingDb));
  toolRegistry.register(new EnqueueHeavyTaskTool(queueService));

  // ── 4. Create the Redis PubSub service (real-time SSE pipe) ───────────
  // Enables BullMQ workers to stream tokens/steps back to the Express SSE
  // connection holding the user's chat open. Same Redis as BullMQ.
  const pubsub = new AgentPubSubService(redisUrl);

  // ── 5. Start the background worker ────────────────────────────────────
  // The worker wraps the AgentRouter and additionally persists
  // progress events to Firestore for real-time frontend updates.
  const baseWorker = new AgentWorker(
    router,
    jobRepository,
    stagingJobRepository,
    agentChatService,
    pubsub,
    stagingDb
  );

  // ── 6. Inject dependencies into the REST routes ───────────────────────
  setAgentDependencies({
    queueService,
    jobRepository,
    chatService: agentChatService,
    contextBuilder,
    llmService: llm,
    toolRegistry,
    pubsub,
  });
  setWelcomeDependencies({ queueService, jobRepository, chatService: agentChatService });
  setScrapeDependencies({ queueService, jobRepository, chatService: agentChatService });

  logger.info('Agent X queue engine initialized');

  // ── 7. Return graceful shutdown handler ───────────────────────────────
  return async () => {
    await baseWorker.shutdown();
    await pubsub.shutdown();
    await queueService.shutdown();
    logger.info('Agent X queue engine shut down');
  };
}
