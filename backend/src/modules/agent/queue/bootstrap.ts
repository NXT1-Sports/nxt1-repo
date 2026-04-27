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
  ScrapeAndIndexProfileTool,
  ReadDistilledSectionTool,
  OpenLiveViewTool,
  NavigateLiveViewTool,
  InteractWithLiveViewTool,
  ReadLiveViewTool,
  CloseLiveViewTool,
  LiveViewSessionService,
  ScraperService,
  DispatchExtractionTool,
} from '../tools/scraping/index.js';
import {
  WriteCoreIdentityTool,
  WriteAwardsTool,
  WriteCombineMetricsTool,
  WriteRankingsTool,
  WriteSeasonStatsTool,
  WriteRecruitingActivityTool,
  WriteCalendarEventsTool,
  WriteAthleteVideosTool,
  WriteIntelTool,
  UpdateIntelTool,
  SearchNxt1PlatformTool,
  QueryNxt1PlatformDataTool,
  SearchMemoryTool,
  SearchCollegesTool,
  SearchCollegeCoachesTool,
  GetCollegeLogosTool,
  GetConferenceLogosTool,
  TrackAnalyticsEventTool,
  GetAnalyticsSummaryTool,
  SaveMemoryTool,
  DeleteMemoryTool,
  WriteConnectedSourceTool,
  WriteScheduleTool,
  WriteTeamStatsTool,
  WriteTeamNewsTool,
  WriteTeamPostTool,
  WriteRosterEntriesTool,
} from '../tools/database/index.js';
import {
  GenerateGraphicTool,
  AnalyzeVideoTool,
  RunwayGenerateVideoTool,
  RunwayEditVideoTool,
  RunwayUpscaleVideoTool,
  RunwayCheckTaskTool,
} from '../tools/media/index.js';
import { DynamicExportTool } from '../tools/data/index.js';
import { WebSearchTool } from '../tools/integrations/web/web-search.tool.js';
import { SendEmailTool } from '../tools/integrations/email/send-email.tool.js';
import { ScrapeTwitterTool } from '../tools/integrations/social/scrape-twitter.tool.js';
import { ScrapeInstagramTool } from '../tools/integrations/social/scrape-instagram.tool.js';
import { ApifyService } from '../tools/integrations/apify/apify.service.js';
import { ScraperMediaService } from '../tools/integrations/social/scraper-media.service.js';
import { ApifyMcpBridgeService } from '../tools/integrations/apify/apify-mcp-bridge.service.js';
import { db as appDb } from '../../../utils/firebase.js';
import { SearchApifyActorsTool } from '../tools/integrations/apify/search-apify-actors.tool.js';
import { GetApifyActorDetailsTool } from '../tools/integrations/apify/get-apify-actor-details.tool.js';
import { CallApifyActorTool } from '../tools/integrations/apify/call-apify-actor.tool.js';
import { GetApifyActorOutputTool } from '../tools/integrations/apify/get-apify-actor-output.tool.js';
import {
  FirecrawlMcpBridgeService,
  FirebaseMcpBridgeService,
  GoogleWorkspaceMcpSessionService,
  GoogleWorkspaceToolCatalogService,
  DynamicGoogleWorkspaceTool,
  ListGoogleWorkspaceToolsTool,
  RunGoogleWorkspaceToolTool,
  RunwayMcpBridgeService,
  FirecrawlScrapeTool,
  FirecrawlSearchTool,
  FirecrawlMapTool,
  FirecrawlExtractTool,
  FirecrawlAgentTool,
  ListNxt1DataViewsTool,
  QueryNxt1DataTool,
  CloudflareMcpBridgeService,
  ImportVideoTool,
  ClipVideoTool,
  GenerateThumbnailTool,
  GetVideoDetailsTool,
  GenerateCaptionsTool,
  CreateSignedUrlTool,
  EnableDownloadTool,
  ManageWatermarkTool,
  DeleteVideoTool,
} from '../tools/integrations/index.js';
import { AskUserTool } from '../tools/comms/ask-user.tool.js';
import { WriteTimelinePostTool } from '../tools/comms/write-timeline-post.tool.js';
import { ScanTimelinePostsTool } from '../tools/comms/scan-timeline-posts.tool.js';
import { DelegateTaskTool } from '../tools/system/index.js';
import {
  ScheduleRecurringTaskTool,
  ListRecurringTasksTool,
  CancelRecurringTaskTool,
} from '../tools/automation/index.js';
import { ContextBuilder } from '../memory/context-builder.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { SessionMemoryService } from '../memory/session.service.js';
import { KnowledgeRetrievalService } from '../memory/knowledge-retrieval.service.js';
import { AgentChatService } from '../services/agent-chat.service.js';
import { getCacheService } from '../../../services/core/cache.service.js';
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
  AdminCoordinatorAgent,
  BrandCoordinatorAgent,
  DataCoordinatorAgent,
  PerformanceCoordinatorAgent,
  RecruitingCoordinatorAgent,
  StrategyCoordinatorAgent,
} from '../agents/index.js';
import { setAgentDependencies } from '../../../routes/agent/shared.js';
import { setWelcomeDependencies } from '../services/agent-welcome.service.js';
import { setScrapeDependencies } from '../services/agent-scrape.service.js';
import { stagingDb } from '../../../utils/firebase-staging.js';
import { logger } from '../../../utils/logger.js';
import { addJobCost } from './job-cost-tracker.js';
import { getAgentRunConfig } from '../config/agent-app-config.js';

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
  const llm = new OpenRouterService({
    firestore: appDb,
    onTelemetry: (record) => {
      // Accumulate cost per operationId so the billing module can deduct
      // the correct amount at job completion. Helicone handles all usage
      // tracking and cost reporting — no separate telemetry store needed.
      addJobCost(record.operationId, record.costUsd);
    },
  });
  const toolRegistry = new ToolRegistry();
  // MCP bridge for Firecrawl — shared across ScraperService and standalone MCP tools.
  let firecrawlMcpBridge: FirecrawlMcpBridgeService | null = null;
  try {
    firecrawlMcpBridge = new FirecrawlMcpBridgeService();
    logger.info('Firecrawl MCP bridge initialized (shared by ScraperService + MCP tools)');
  } catch {
    logger.warn('FIRECRAWL_API_KEY not configured — Firecrawl MCP bridge disabled');
  }

  let firebaseMcpBridge: FirebaseMcpBridgeService | null = null;
  try {
    firebaseMcpBridge = new FirebaseMcpBridgeService();
    logger.info('Firebase MCP bridge initialized (user-scoped read-only views)');
  } catch (error) {
    logger.warn('Firebase MCP bridge failed to initialize', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let runwayMcpBridge: RunwayMcpBridgeService | null = null;
  try {
    runwayMcpBridge = new RunwayMcpBridgeService();
    logger.info('Runway MCP bridge initialized');
  } catch {
    logger.warn(
      'RUNWAYML_API_SECRET or RUNWAY_API_KEY not configured — Runway MCP bridge disabled'
    );
  }

  let googleWorkspaceMcpSessionService: GoogleWorkspaceMcpSessionService | null = null;
  try {
    googleWorkspaceMcpSessionService = new GoogleWorkspaceMcpSessionService();
    logger.info('Google Workspace MCP session service initialized');
  } catch (error) {
    logger.warn('Google Workspace MCP session service failed to initialize', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // The shared scraper preserves direct HTML extraction and uses the MCP bridge
  // for rendered markdown when available.
  const scraperService = new ScraperService(firecrawlMcpBridge);
  toolRegistry.register(new ScrapeAndIndexProfileTool(scraperService, llm));
  toolRegistry.register(new ReadDistilledSectionTool());
  toolRegistry.register(new DispatchExtractionTool(llm));
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

  toolRegistry.register(new WriteCoreIdentityTool(stagingDb));
  toolRegistry.register(new WriteAwardsTool(stagingDb));
  toolRegistry.register(new WriteCombineMetricsTool(stagingDb));
  toolRegistry.register(new WriteRankingsTool(stagingDb));
  toolRegistry.register(new WriteSeasonStatsTool(stagingDb));
  toolRegistry.register(new WriteRecruitingActivityTool(stagingDb));
  toolRegistry.register(new WriteCalendarEventsTool(stagingDb));
  toolRegistry.register(new WriteScheduleTool(stagingDb));
  toolRegistry.register(new WriteTeamStatsTool(stagingDb));
  toolRegistry.register(new WriteTeamNewsTool(stagingDb));
  toolRegistry.register(new WriteTeamPostTool(stagingDb));
  toolRegistry.register(new WriteRosterEntriesTool(stagingDb));
  toolRegistry.register(new WriteAthleteVideosTool(stagingDb));
  toolRegistry.register(new WriteIntelTool(stagingDb));
  toolRegistry.register(new UpdateIntelTool(stagingDb));
  toolRegistry.register(new SearchNxt1PlatformTool());
  toolRegistry.register(new QueryNxt1PlatformDataTool());
  toolRegistry.register(new TrackAnalyticsEventTool());
  toolRegistry.register(new GetAnalyticsSummaryTool());
  toolRegistry.register(new SearchCollegesTool());
  toolRegistry.register(new SearchCollegeCoachesTool());
  toolRegistry.register(new GetCollegeLogosTool());
  toolRegistry.register(new GetConferenceLogosTool());
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
  toolRegistry.register(new WriteConnectedSourceTool(stagingDb));
  toolRegistry.register(new AskUserTool());
  toolRegistry.register(new WriteTimelinePostTool(stagingDb));
  toolRegistry.register(new ScanTimelinePostsTool(stagingDb, llm, vectorMemory));
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

  // ── 1d. MCP-bridged Firecrawl tools (2026 architecture) ──────────────
  // Bridge instance was created earlier (shared with ScraperService).
  if (firecrawlMcpBridge) {
    toolRegistry.register(new FirecrawlScrapeTool(firecrawlMcpBridge));
    toolRegistry.register(new FirecrawlSearchTool(firecrawlMcpBridge));
    toolRegistry.register(new FirecrawlMapTool(firecrawlMcpBridge));
    toolRegistry.register(new FirecrawlExtractTool(firecrawlMcpBridge));
    toolRegistry.register(new FirecrawlAgentTool(firecrawlMcpBridge));
    logger.info(
      'MCP-bridged Firecrawl tools registered (scrape_webpage, firecrawl_search_web, map_website, extract_web_data, firecrawl_agent_research)'
    );
  }

  // ── 1d.1. MCP-bridged NXT1 data views (read-only) ────────────────────────
  if (firebaseMcpBridge) {
    toolRegistry.register(new ListNxt1DataViewsTool(firebaseMcpBridge));
    toolRegistry.register(new QueryNxt1DataTool(firebaseMcpBridge));
    logger.info('MCP-bridged NXT1 data tools registered (list_nxt1_data_views, query_nxt1_data)');
  }

  // ── 1d.2. Google Workspace MCP tools (user-scoped productivity actions) ───
  if (googleWorkspaceMcpSessionService) {
    // Schema discovery tool (kept for debugging and edge cases)
    toolRegistry.register(new ListGoogleWorkspaceToolsTool(googleWorkspaceMcpSessionService));
    // Generic fallback remains available even if discovery fails.
    toolRegistry.register(new RunGoogleWorkspaceToolTool(googleWorkspaceMcpSessionService));

    try {
      const googleWorkspaceCatalog = new GoogleWorkspaceToolCatalogService();
      const discoveredGoogleWorkspaceTools = await googleWorkspaceCatalog.listTools();

      for (const definition of discoveredGoogleWorkspaceTools) {
        toolRegistry.register(
          new DynamicGoogleWorkspaceTool(googleWorkspaceMcpSessionService, definition)
        );
      }

      logger.info('Google Workspace MCP tools registered from live discovery', {
        infrastructureTools: 2,
        discoveredCount: discoveredGoogleWorkspaceTools.length,
        discoveredToolNames: discoveredGoogleWorkspaceTools.map((tool) => tool.name),
      });
    } catch (error) {
      logger.warn(
        'Google Workspace dynamic tool discovery failed — generic MCP tools remain enabled',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  // ── 1e. MCP-bridged Cloudflare Stream tools (ephemeral video processing) ──
  try {
    const cfBridge = new CloudflareMcpBridgeService();
    toolRegistry.register(new ImportVideoTool(cfBridge));
    toolRegistry.register(new ClipVideoTool(cfBridge));
    toolRegistry.register(new GenerateThumbnailTool(cfBridge));
    toolRegistry.register(new GetVideoDetailsTool(cfBridge));
    toolRegistry.register(new GenerateCaptionsTool(cfBridge));
    toolRegistry.register(new CreateSignedUrlTool(cfBridge));
    toolRegistry.register(new EnableDownloadTool(cfBridge));
    toolRegistry.register(new ManageWatermarkTool(cfBridge));
    toolRegistry.register(new DeleteVideoTool(cfBridge));
    logger.info(
      'MCP-bridged Cloudflare Stream tools registered (import, clip, thumbnail, details, captions, signed-url, download, watermark, delete)'
    );
  } catch {
    logger.warn(
      'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not configured — Cloudflare Stream tools disabled'
    );
  }

  // ── 1f. MCP-bridged Runway ML tools (AI video generation) ──────────────
  if (runwayMcpBridge) {
    toolRegistry.register(new RunwayGenerateVideoTool(runwayMcpBridge));
    toolRegistry.register(new RunwayEditVideoTool(runwayMcpBridge));
    toolRegistry.register(new RunwayUpscaleVideoTool(runwayMcpBridge));
    toolRegistry.register(new RunwayCheckTaskTool(runwayMcpBridge));
    logger.info(
      'MCP-bridged Runway ML tools registered (generate_video, edit_video, upscale_video, check_task)'
    );
  }

  const contextBuilder = new ContextBuilder(vectorMemory);

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
  const sessionMemory = new SessionMemoryService(getCacheService(), contextBuilder);
  const router = new AgentRouter(llm, toolRegistry, contextBuilder, skillRegistry, sessionMemory);
  router.registerAgent(new DataCoordinatorAgent());
  router.registerAgent(new PerformanceCoordinatorAgent());
  router.registerAgent(new RecruitingCoordinatorAgent());
  router.registerAgent(new BrandCoordinatorAgent());
  router.registerAgent(new AdminCoordinatorAgent());
  router.registerAgent(new StrategyCoordinatorAgent());

  // ── 3. Queue infrastructure ──────────────────────────────────────────────────
  const { getFirestore } = await import('firebase-admin/firestore');
  const agentRunConfig = await getAgentRunConfig(getFirestore());
  const queueService = new AgentQueueService(undefined, {
    maxAttempts: agentRunConfig.maxJobAttempts,
    retryBackoffMs: agentRunConfig.retryBackoffMs,
  });
  const jobRepository = new AgentJobRepository(); // production Firestore
  const stagingJobRepository = new AgentJobRepository(stagingDb); // staging Firestore
  const agentChatService = new AgentChatService(queueService, sessionMemory);

  // ── 3a. Automation tools (require queueService + Firestore for durable metadata) ──
  toolRegistry.register(new ScheduleRecurringTaskTool(queueService, stagingDb));
  toolRegistry.register(new ListRecurringTasksTool(queueService, stagingDb));
  toolRegistry.register(new CancelRecurringTaskTool(queueService, stagingDb));

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
    stagingDb,
    llm,
    undefined,
    (payload, environment) => queueService.enqueue(payload, environment),
    queueService
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
    agentRouter: router,
  });
  setWelcomeDependencies({ queueService, jobRepository, chatService: agentChatService });
  setScrapeDependencies({ queueService, jobRepository, chatService: agentChatService });

  logger.info('Agent X queue engine initialized');

  // ── 7. Return graceful shutdown handler ───────────────────────────────
  return async () => {
    await baseWorker.shutdown();
    await pubsub.shutdown();
    await queueService.shutdown();
    await googleWorkspaceMcpSessionService?.shutdown();
    logger.info('Agent X queue engine shut down');
  };
}
