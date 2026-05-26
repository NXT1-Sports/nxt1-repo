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
import { OpenRouterService } from '../llm/openrouter.service.js';
import { AgentRouter } from '../agent.router.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import {
  ScrapeAndIndexProfileTool,
  ReadDistilledSectionTool,
  OpenLiveViewTool,
  NavigateLiveViewTool,
  InteractWithLiveViewTool,
  ReadLiveViewTool,
  ExtractLiveViewMediaTool,
  // ExtractLiveViewPlaylistTool, // DISABLED: Playlist extraction not yet stable
  CloseLiveViewTool,
  LiveViewSessionService,
  ScraperService,
  DispatchExtractionTool,
} from '../tools/integrations/firecrawl/index.js';
import {
  // ── Write (create) ──────────────────────────────────────────────────
  WriteCoreIdentityTool,
  WriteAwardsTool,
  WriteCombineMetricsTool,
  WriteRankingsTool,
  WriteSeasonStatsTool,
  WriteRecruitingActivityTool,
  WriteCalendarEventsTool,
  WriteAthleteVideosTool,
  WriteIntelTool,
  WriteConnectedSourceTool,
  WriteScheduleTool,
  WriteTeamStatsTool,
  WritePlaybooksTool,
  WriteCallsheetTool,
  ListCallsheetsTool,
  GetCallsheetTool,
  UpdateCallsheetTool,
  DeleteCallsheetTool,
  ListPracticeScriptsTool,
  GetPracticeScriptTool,
  WritePracticeScriptTool,
  UpdatePracticeScriptTool,
  DeletePracticeScriptTool,
  GeneratePracticeScriptTool,
  GetPlaybookTool,
  ListPlaybooksTool,
  UpdatePlaybookTool,
  DeletePlaybookTool,
  AddPlayToPlaybookTool,
  UpdatePlayInPlaybookTool,
  DeletePlayFromPlaybookTool,
  GetGameplanTool,
  ListGameplansTool,
  SaveGameplanTool,
  UpdateGameplanTool,
  DeleteGameplanTool,
  ListFilmReviewsTool,
  GetFilmReviewTool,
  SaveFilmReviewTool,
  UpdateFilmReviewTool,
  DeleteFilmReviewTool,
  AddFilmReviewAnnotationTool,
  DeleteFilmReviewAnnotationTool,
  RefreshFilmReviewAiTool,
  WriteTeamNewsTool,
  WriteTeamPostTool,
  WriteRosterEntriesTool,
  WriteTimelinePostTool,
  // ── Update (patch) ──────────────────────────────────────────────────
  UpdateIntelTool,
  UpdateCoreIdentityTool,
  UpdateAthleteVideosTool,
  UpdateTimelinePostTool,
  UpdateTeamPostTool,
  UpdateConnectedSourceTool,
  // ── Delete ──────────────────────────────────────────────────────────
  DeleteCoreIdentityTool,
  DeleteAthleteVideosTool,
  DeleteTimelinePostTool,
  DeleteTeamPostTool,
  DeleteConnectedSourceTool,
} from '../tools/intel/index.js';
import {
  SearchNxt1PlatformTool,
  QueryNxt1PlatformDataTool,
  SearchCollegesTool,
  SearchCollegeCoachesTool,
  ScanTimelinePostsTool,
} from '../tools/platform/index.js';
import { GetCollegeLogosTool, GetConferenceLogosTool } from '../tools/assets/index.js';
import {
  TrackAnalyticsEventTool,
  GetAnalyticsSummaryTool,
  GetRecentSyncSummariesTool,
} from '../tools/analytics/index.js';
import { SearchMemoryTool, SaveMemoryTool, DeleteMemoryTool } from '../tools/memory/index.js';
import {
  GenerateGraphicTool,
  AnalyzeVideoTool,
  AnalyzeImageTool,
  StageMediaTool,
  ExtractHudlVideoTool,
  RecommendLearningVideosTool,
  LearningVideoRecommendationService,
} from '../tools/media/index.js';
import { GeminiFilesService } from '../llm/gemini-files.service.js';
import { ClassifyMediaUrlTool } from '../tools/media/classify-media-url.tool.js';
import { WriteAthleteImagesTool } from '../tools/intel/user/write-athlete-images.tool.js';
import {
  AskUserTool,
  CreatePlanTool,
  DelegateTaskTool,
  DelegateToCoordinatorTool,
  DynamicExportTool,
  ExecuteSavedPlanTool,
  PlanAndExecuteTool,
  WhoamiCapabilitiesTool,
} from '../tools/system/index.js';
import {
  GetUserProfileTool,
  GetActiveThreadsTool,
  GetOtherThreadHistoryTool,
  SearchMemoriesTool,
} from '../tools/context/index.js';
import { CapabilityRegistry } from '../capabilities/capability-registry.js';
import { PrimaryAgent } from '../agents/primary.agent.js';
import { AgentRouterPrimaryService } from '../orchestrator/agent-router-primary.service.js';
import { AgentPlanRepository } from './agent-plan.repository.js';
import { WebSearchTool } from '../tools/integrations/web/web-search.tool.js';
import { SendEmailTool } from '../tools/integrations/email/send-email.tool.js';
import { BatchSendEmailTool } from '../tools/integrations/email/batch-send-email.tool.js';
import { SendEmailViaNxt1Tool } from '../tools/integrations/email/send-email-via-nxt1.tool.js';
import { BatchSendEmailViaNxt1Tool } from '../tools/integrations/email/batch-send-email-via-nxt1.tool.js';
import { ScrapeTwitterTool } from '../tools/integrations/social/scrape-twitter.tool.js';
import { ScrapeInstagramTool } from '../tools/integrations/social/scrape-instagram.tool.js';
import { ApifyService } from '../tools/integrations/apify/apify.service.js';
import { ScraperMediaService } from '../tools/integrations/social/scraper-media.service.js';
import {
  ApifyMcpBridgeService,
  SearchApifyActorsTool,
  GetApifyActorDetailsTool,
  CallApifyActorTool,
  GetApifyActorOutputTool,
  FirecrawlMcpBridgeService,
  FirebaseMcpBridgeService,
  Microsoft365McpSessionService,
  ListMicrosoft365ToolsTool,
  RunMicrosoft365ToolTool,
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
  FirecrawlImagesTool,
  ListNxt1DataViewsTool,
  QueryNxt1DataTool,
  MutateNxt1DataTool,
  FfmpegMcpBridgeService,
  FfmpegTrimVideoTool,
  FfmpegMergeVideosTool,
  FfmpegResizeVideoTool,
  FfmpegAddTextOverlayTool,
  FfmpegBurnSubtitlesTool,
  FfmpegGenerateThumbnailTool,
  FfmpegConvertVideoTool,
  FfmpegCompressVideoTool,
  ChartMcpBridgeService,
  GenerateChartVisualizationTool,
  PlayDiagramService,
  CreatePlayDiagramTool,
  BoardDiagramService,
  CreateBoardDiagramTool,
  UpdateBoardDiagramTool,
  DeleteBoardDiagramTool,
  CloudflareMcpBridgeService,
  CreateSupportTicketTool,
  ImportVideoTool,
  ClipVideoTool,
  GenerateThumbnailTool,
  GetVideoDetailsTool,
  GenerateCaptionsTool,
  CreateSignedUrlTool,
  EnableDownloadTool,
  ManageWatermarkTool,
  DeleteVideoTool,
  RunwayGenerateVideoTool,
  RunwayEditVideoTool,
  RunwayUpscaleVideoTool,
  RunwayCheckTaskTool,
} from '../tools/integrations/index.js';
import {
  ScheduleRecurringTaskTool,
  UpdateRecurringTaskTool,
  ListRecurringTasksTool,
  CancelRecurringTaskTool,
  EnqueueHeavyTaskTool,
} from '../tools/automation/index.js';
import { ContextBuilder } from '../memory/context-builder.js';
import { VectorMemoryService } from '../memory/vector.service.js';
import { SessionMemoryService } from '../memory/session.service.js';
import { KnowledgeRetrievalService } from '../memory/knowledge-retrieval.service.js';
import { AgentChatService } from '../services/agent-chat.service.js';
import { getRuntimeEnvironment } from '../../../config/runtime-environment.js';
import { getCacheService } from '../../../services/core/cache.service.js';
import { db as appDb } from '../../../utils/firebase.js';
import { stagingDb } from '../../../utils/firebase-staging.js';
import { createEnvironmentScopedFirestore } from '../../../utils/firestore-environment-context.js';
import { logger } from '../../../utils/logger.js';
import {
  SkillRegistry,
  AthleteScoutingSkill,
  TeamScoutingSkill,
  VideoAnalysisSkill,
  ImageAnalysisSkill,
  FilmBreakdownTaxonomySkill,
  OpponentScoutingPacketSkill,
  PredictivePerformanceAnalysisSkill,
  OutreachCopywritingSkill,
  ComplianceRulebookSkill,
  NilAndBrandComplianceSkill,
  CommunicationApprovalAndSafetySkill,
  MediaCreativeIntentSkill,
  MediaPipelinePlaybooksSkill,
  StaticGraphicStyleSkill,
  VideoHighlightStyleSkill,
  SocialCaptionStyleSkill,
  StrategyGameplanFrameworkSkill,
  RecruitingFitScoringSkill,
  IntelReportQualitySkill,
  NilDealEvaluationSkill,
  SocialMediaGrowthStrategySkill,
  CollegeVisitPlanningSkill,
  CoachGamePlanAndAdjustmentsSkill,
  LineupRotationOptimizerSkill,
  PlayDesignSimulationSkill,
  DataNormalizationAndEntityResolutionSkill,
  ReportFormattingAndExportSkill,
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
import { addJobCost } from './job-cost-tracker.js';
import { getAgentRunConfig } from '../config/agent-app-config.js';
import { isFeatureEnabledSync } from '../../../config/feature-flags/index.js';

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
  // ── 0. Kill-switch ─────────────────────────────────────────────────
  if (!isFeatureEnabledSync('experimental.agent.engine.enabled')) {
    logger.warn('⚠️  experimental.agent.engine.enabled=false — Agent Engine skipped.');
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
          'Ensure the REDIS_URL secret is set in the backend runtime environment ' +
          'and the service account has roles/secretmanager.secretAccessor. ' +
          'Agent X features are unavailable until Redis is configured.'
      );
    } else {
      logger.warn(
        '⚠️  Redis unavailable — Agent Engine skipped. ' +
          'Start Redis locally (e.g. via WSL2/Docker: `docker run -p 6379:6379 redis`) ' +
          'or disable experimental.agent.engine.enabled to suppress this warning.'
      );
    }
    // Do NOT throw — let the server start so all other routes keep working.
    // Agent routes return 503 when queueService/jobRepository are null.
    return async () => {
      /* noop shutdown */
    };
  }
  // ── 1. Core services ─────────────────────────────────────────────────
  const runtimeEnvironment = getRuntimeEnvironment();
  const runtimeFirestore = runtimeEnvironment === 'production' ? appDb : stagingDb;
  const toolFirestore = createEnvironmentScopedFirestore(
    {
      production: appDb,
      staging: stagingDb,
    },
    runtimeEnvironment
  );

  const llm = new OpenRouterService({
    firestore: runtimeFirestore,
    onTelemetry: (record) => {
      // Accumulate cost per operationId so the billing module can deduct
      // the correct amount at job completion. Helicone handles all usage
      // tracking and cost reporting — no separate telemetry store needed.
      addJobCost(record.operationId, record.costUsd, record.feature);
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

  let microsoft365McpSessionService: Microsoft365McpSessionService | null = null;
  try {
    microsoft365McpSessionService = new Microsoft365McpSessionService();
    logger.info('Microsoft 365 MCP session service initialized');
  } catch (error) {
    logger.warn('Microsoft 365 MCP session service failed to initialize', {
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
    toolRegistry.register(new OpenLiveViewTool(liveViewService, toolFirestore));
    toolRegistry.register(new NavigateLiveViewTool(liveViewService));
    toolRegistry.register(new InteractWithLiveViewTool(liveViewService));
    toolRegistry.register(new ReadLiveViewTool(liveViewService));
    toolRegistry.register(new ExtractLiveViewMediaTool(liveViewService));
    // toolRegistry.register(new ExtractLiveViewPlaylistTool(liveViewService)); // DISABLED: Use extract_live_view_media instead
    toolRegistry.register(new CloseLiveViewTool(liveViewService));
    logger.info(
      'Live view tools registered (open, navigate, interact, read, extract media, close)'
    );
  } catch {
    logger.warn('LiveViewSessionService init failed — open_live_view tool disabled');
  }

  toolRegistry.register(new WriteCoreIdentityTool(toolFirestore));
  toolRegistry.register(new WriteAwardsTool(toolFirestore));
  toolRegistry.register(new WriteCombineMetricsTool(toolFirestore));
  toolRegistry.register(new WriteRankingsTool(toolFirestore));
  toolRegistry.register(new WriteSeasonStatsTool(toolFirestore));
  toolRegistry.register(new WriteRecruitingActivityTool(toolFirestore));
  toolRegistry.register(new WriteCalendarEventsTool(toolFirestore));
  toolRegistry.register(new WriteScheduleTool(toolFirestore));
  toolRegistry.register(new WriteTeamStatsTool(toolFirestore));
  toolRegistry.register(new WritePlaybooksTool(toolFirestore));
  toolRegistry.register(new WriteCallsheetTool(toolFirestore));
  toolRegistry.register(new ListCallsheetsTool(toolFirestore));
  toolRegistry.register(new GetCallsheetTool(toolFirestore));
  toolRegistry.register(new UpdateCallsheetTool(toolFirestore));
  toolRegistry.register(new DeleteCallsheetTool(toolFirestore));
  toolRegistry.register(new ListPracticeScriptsTool(toolFirestore));
  toolRegistry.register(new GetPracticeScriptTool(toolFirestore));
  toolRegistry.register(new WritePracticeScriptTool(toolFirestore));
  toolRegistry.register(new UpdatePracticeScriptTool(toolFirestore));
  toolRegistry.register(new DeletePracticeScriptTool(toolFirestore));
  toolRegistry.register(new GeneratePracticeScriptTool(llm, toolFirestore));
  toolRegistry.register(new GetPlaybookTool(toolFirestore));
  toolRegistry.register(new ListPlaybooksTool(toolFirestore));
  toolRegistry.register(new UpdatePlaybookTool(toolFirestore));
  toolRegistry.register(new DeletePlaybookTool(toolFirestore));
  toolRegistry.register(new AddPlayToPlaybookTool(toolFirestore));
  toolRegistry.register(new UpdatePlayInPlaybookTool(toolFirestore));
  toolRegistry.register(new DeletePlayFromPlaybookTool(toolFirestore));
  toolRegistry.register(new GetGameplanTool(toolFirestore));
  toolRegistry.register(new ListGameplansTool(toolFirestore));
  toolRegistry.register(new SaveGameplanTool(toolFirestore));
  toolRegistry.register(new UpdateGameplanTool(toolFirestore));
  toolRegistry.register(new DeleteGameplanTool(toolFirestore));
  toolRegistry.register(new ListFilmReviewsTool(toolFirestore));
  toolRegistry.register(new GetFilmReviewTool(toolFirestore));
  toolRegistry.register(new SaveFilmReviewTool(toolFirestore));
  toolRegistry.register(new UpdateFilmReviewTool(toolFirestore));
  toolRegistry.register(new DeleteFilmReviewTool(toolFirestore));
  toolRegistry.register(new AddFilmReviewAnnotationTool(toolFirestore));
  toolRegistry.register(new DeleteFilmReviewAnnotationTool(toolFirestore));
  toolRegistry.register(new RefreshFilmReviewAiTool(toolFirestore));
  toolRegistry.register(new WriteTeamNewsTool(toolFirestore));
  toolRegistry.register(new WriteTeamPostTool(toolFirestore));
  toolRegistry.register(new WriteRosterEntriesTool(toolFirestore));
  toolRegistry.register(new WriteAthleteVideosTool(toolFirestore));
  toolRegistry.register(new WriteAthleteImagesTool(toolFirestore));
  toolRegistry.register(new WriteIntelTool(toolFirestore));
  // ── Update (patch) tools ─────────────────────────────────────────────
  toolRegistry.register(new UpdateIntelTool(toolFirestore));
  toolRegistry.register(new UpdateCoreIdentityTool(toolFirestore));
  toolRegistry.register(new UpdateAthleteVideosTool(toolFirestore));
  toolRegistry.register(new UpdateTimelinePostTool(toolFirestore));
  toolRegistry.register(new UpdateTeamPostTool(toolFirestore));
  toolRegistry.register(new UpdateConnectedSourceTool(toolFirestore));
  // ── Delete tools ─────────────────────────────────────────────────────
  toolRegistry.register(new DeleteCoreIdentityTool(toolFirestore));
  toolRegistry.register(new DeleteAthleteVideosTool(toolFirestore));
  toolRegistry.register(new DeleteTimelinePostTool(toolFirestore));
  toolRegistry.register(new DeleteTeamPostTool(toolFirestore));
  toolRegistry.register(new DeleteConnectedSourceTool(toolFirestore));
  toolRegistry.register(
    new SearchNxt1PlatformTool({
      production: appDb,
      staging: stagingDb,
    })
  );
  toolRegistry.register(
    new QueryNxt1PlatformDataTool({
      production: appDb,
      staging: stagingDb,
    })
  );
  toolRegistry.register(new TrackAnalyticsEventTool());
  toolRegistry.register(new GetAnalyticsSummaryTool());
  toolRegistry.register(new SearchCollegesTool());
  toolRegistry.register(new SearchCollegeCoachesTool());
  toolRegistry.register(new GetCollegeLogosTool());
  toolRegistry.register(new GetConferenceLogosTool());
  toolRegistry.register(new GenerateGraphicTool(llm));
  toolRegistry.register(new StageMediaTool());
  toolRegistry.register(new ClassifyMediaUrlTool());
  toolRegistry.register(
    new RecommendLearningVideosTool(
      new LearningVideoRecommendationService({ scraper: scraperService })
    )
  );
  toolRegistry.register(new ExtractHudlVideoTool());
  toolRegistry.register(new DynamicExportTool());

  let apifyMcpBridge: ApifyMcpBridgeService | undefined;
  let cfBridge: CloudflareMcpBridgeService | undefined;
  let ffmpegBridge: FfmpegMcpBridgeService | undefined;
  let chartBridge: ChartMcpBridgeService | undefined;
  let geminiFiles: GeminiFilesService | undefined;

  // System tools (cross-cutting infrastructure — available to all agents)
  toolRegistry.register(new DelegateTaskTool());

  // Primary-only system tools (gated by allowedAgents=['router']).
  // The Primary Agent handles all conversational requests and dispatches
  // sub-tasks via these tools.
  toolRegistry.register(new DelegateToCoordinatorTool());
  toolRegistry.register(new CreatePlanTool());
  toolRegistry.register(new ExecuteSavedPlanTool());
  toolRegistry.register(new PlanAndExecuteTool());

  // ── 1a. Vector memory & knowledge tools ──────────────────────────────
  const vectorMemory = new VectorMemoryService(llm);
  toolRegistry.register(new WebSearchTool());
  toolRegistry.register(new SearchMemoryTool(vectorMemory));
  toolRegistry.register(new GetRecentSyncSummariesTool());
  toolRegistry.register(new SaveMemoryTool(vectorMemory));
  toolRegistry.register(new DeleteMemoryTool(vectorMemory));
  toolRegistry.register(new WriteConnectedSourceTool(toolFirestore));
  toolRegistry.register(new AskUserTool());
  toolRegistry.register(new WriteTimelinePostTool(toolFirestore));
  toolRegistry.register(new ScanTimelinePostsTool(toolFirestore, llm, vectorMemory));
  toolRegistry.register(new SendEmailTool(toolFirestore));
  toolRegistry.register(new BatchSendEmailTool(toolFirestore));
  toolRegistry.register(new SendEmailViaNxt1Tool(toolFirestore));
  toolRegistry.register(new BatchSendEmailViaNxt1Tool(toolFirestore));
  toolRegistry.register(new CreateSupportTicketTool());

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
    apifyMcpBridge = new ApifyMcpBridgeService();
    const scraperMedia = new ScraperMediaService();
    toolRegistry.register(new SearchApifyActorsTool(apifyMcpBridge));
    toolRegistry.register(new GetApifyActorDetailsTool(apifyMcpBridge));
    toolRegistry.register(new CallApifyActorTool(apifyMcpBridge, scraperMedia));
    toolRegistry.register(new GetApifyActorOutputTool(apifyMcpBridge, scraperMedia));
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
    toolRegistry.register(new FirecrawlImagesTool(firecrawlMcpBridge));
    logger.info(
      'MCP-bridged Firecrawl tools registered (scrape_webpage, firecrawl_search_web, map_website, extract_web_data, firecrawl_agent_research, extract_page_images)'
    );
  }

  // ── 1d.1. MCP-bridged NXT1 data views (read-only) ────────────────────────
  if (firebaseMcpBridge) {
    toolRegistry.register(new ListNxt1DataViewsTool(firebaseMcpBridge));
    toolRegistry.register(new QueryNxt1DataTool(firebaseMcpBridge));
    toolRegistry.register(new MutateNxt1DataTool(firebaseMcpBridge));
    logger.info(
      'MCP-bridged NXT1 data tools registered (list_nxt1_data_views, query_nxt1_data, mutate_nxt1_data)'
    );
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

  // ── 1d.3. Microsoft 365 MCP tools (user-scoped productivity actions) ────
  if (microsoft365McpSessionService) {
    toolRegistry.register(new ListMicrosoft365ToolsTool(microsoft365McpSessionService));
    toolRegistry.register(new RunMicrosoft365ToolTool(microsoft365McpSessionService));

    logger.info('Microsoft 365 MCP tools registered', {
      infrastructureTools: 2,
      toolNames: ['list_microsoft_365_tools', 'run_microsoft_365_tool'],
    });
  }

  // ── 1e. MCP-bridged Cloudflare Stream tools (ephemeral video processing) ──
  try {
    cfBridge = new CloudflareMcpBridgeService();
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

  // ── 1e.1. MCP-bridged FFmpeg tools (allowlisted video processing) ───────
  try {
    ffmpegBridge = new FfmpegMcpBridgeService();
    toolRegistry.register(new FfmpegTrimVideoTool(ffmpegBridge));
    toolRegistry.register(new FfmpegMergeVideosTool(ffmpegBridge));
    toolRegistry.register(new FfmpegResizeVideoTool(ffmpegBridge));
    toolRegistry.register(new FfmpegAddTextOverlayTool(ffmpegBridge));
    toolRegistry.register(new FfmpegBurnSubtitlesTool(ffmpegBridge));
    toolRegistry.register(new FfmpegGenerateThumbnailTool(ffmpegBridge));
    toolRegistry.register(new FfmpegConvertVideoTool(ffmpegBridge));
    toolRegistry.register(new FfmpegCompressVideoTool(ffmpegBridge));
    logger.info(
      'MCP-bridged FFmpeg tools registered (trim, merge, resize, text-overlay, burn-subtitles, thumbnail, convert, compress)'
    );
  } catch {
    logger.warn('FFMPEG_MCP_URL not configured — FFmpeg MCP tools disabled');
  }

  // ── Gemini Files API service (for direct video analysis) ──────────────────
  // Enables direct video upload to Gemini Files API, bypassing the OpenRouter
  // proxy for backend-downloadable video URLs that Gemini cannot fetch reliably.
  // Supports MOV (video/quicktime) natively — no FFmpeg conversion needed.
  if (GeminiFilesService.isConfigured()) {
    geminiFiles = new GeminiFilesService();
    logger.info('GeminiFilesService initialized — direct video analysis via Files API enabled');
  } else {
    logger.warn(
      'GEMINI_API_KEY not configured — GeminiFilesService disabled. Video analysis will use OpenRouter/FFmpeg fallback.'
    );
  }

  // ── 1e.2. MCP-bridged Chart tools (analytics + visualization) ─────────
  try {
    chartBridge = new ChartMcpBridgeService();
    toolRegistry.register(new GenerateChartVisualizationTool(chartBridge));
    logger.info('MCP-bridged Chart tools registered (generate_chart_visualization)');
  } catch {
    logger.warn('CHART_MCP_URL not configured — Chart MCP tools disabled');
  }

  // ── 1e.3. Play diagram tools (LLM → diagrams.net export → Firebase) ─
  const playDiagramService = new PlayDiagramService(llm);
  toolRegistry.register(new CreatePlayDiagramTool(playDiagramService));
  logger.info('Play diagram tools registered (create_play_diagram)');

  // ── 1e.4. Board diagram tools (platform: plays + drills, with Firestore persistence) ─
  const boardDiagramService = new BoardDiagramService(llm);
  toolRegistry.register(new CreateBoardDiagramTool(boardDiagramService));
  toolRegistry.register(new UpdateBoardDiagramTool(boardDiagramService));
  toolRegistry.register(new DeleteBoardDiagramTool(boardDiagramService));
  logger.info(
    'Board diagram tools registered (create_board_diagram, update_board_diagram, delete_board_diagram)'
  );

  toolRegistry.register(
    new AnalyzeVideoTool(scraperService, llm, apifyMcpBridge, ffmpegBridge, geminiFiles, cfBridge)
  );
  toolRegistry.register(new AnalyzeImageTool(llm));

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

  // ── 1g. Lazy context tools (Tier B — fetched on-demand by Primary Agent) ──
  toolRegistry.register(new GetUserProfileTool(contextBuilder));
  toolRegistry.register(new GetActiveThreadsTool(contextBuilder));
  toolRegistry.register(new GetOtherThreadHistoryTool(contextBuilder));
  toolRegistry.register(new SearchMemoriesTool(vectorMemory));

  // ── 1b. Skill Registry (dynamic domain knowledge injection) ─────────────────
  const skillRegistry = new SkillRegistry();
  skillRegistry.register(new AthleteScoutingSkill());
  skillRegistry.register(new TeamScoutingSkill());
  skillRegistry.register(new VideoAnalysisSkill());
  skillRegistry.register(new ImageAnalysisSkill());
  skillRegistry.register(new FilmBreakdownTaxonomySkill());
  skillRegistry.register(new OpponentScoutingPacketSkill());
  skillRegistry.register(new OutreachCopywritingSkill());
  skillRegistry.register(new ComplianceRulebookSkill());
  skillRegistry.register(new NilAndBrandComplianceSkill());
  skillRegistry.register(new CommunicationApprovalAndSafetySkill());
  skillRegistry.register(new MediaCreativeIntentSkill());
  skillRegistry.register(new MediaPipelinePlaybooksSkill());
  skillRegistry.register(new StaticGraphicStyleSkill());
  skillRegistry.register(new VideoHighlightStyleSkill());
  skillRegistry.register(new SocialCaptionStyleSkill());
  skillRegistry.register(new StrategyGameplanFrameworkSkill());
  skillRegistry.register(new RecruitingFitScoringSkill());
  skillRegistry.register(new IntelReportQualitySkill());
  skillRegistry.register(new NilDealEvaluationSkill());
  skillRegistry.register(new SocialMediaGrowthStrategySkill());
  skillRegistry.register(new CollegeVisitPlanningSkill());
  skillRegistry.register(new CoachGamePlanAndAdjustmentsSkill());
  skillRegistry.register(new LineupRotationOptimizerSkill());
  skillRegistry.register(new PlayDesignSimulationSkill());
  skillRegistry.register(new PredictivePerformanceAnalysisSkill());
  skillRegistry.register(new DataNormalizationAndEntityResolutionSkill());
  skillRegistry.register(new ReportFormattingAndExportSkill());

  // Global Knowledge Base — dynamic vector retrieval at runtime
  const knowledgeRetrieval = new KnowledgeRetrievalService(llm);
  skillRegistry.register(new GlobalKnowledgeSkill(knowledgeRetrieval));

  // ── 1h. Capability Registry (auto-generated capability card for Primary Agent) ──
  const capabilityRegistry = new CapabilityRegistry(toolRegistry, skillRegistry);
  capabilityRegistry.refresh();
  toolRegistry.register(new WhoamiCapabilitiesTool(capabilityRegistry));
  // Refresh the card now that whoami_capabilities itself is in the inventory.
  capabilityRegistry.refresh();
  // Start the auto-refresh timer (cadence: cfg.capabilityCard.refreshIntervalMs).
  // Picks up tool/skill registrations that happen later in bootstrap (e.g.
  // queue-dependent automation tools registered after AgentRouter is built).
  capabilityRegistry.startAutoRefresh();

  // ── 2. Wire the AgentRouter with all sub-agents ───────────────────
  const sessionMemory = new SessionMemoryService(getCacheService(), contextBuilder);
  const router = new AgentRouter(llm, toolRegistry, contextBuilder, skillRegistry, sessionMemory);
  router.registerAgent(new DataCoordinatorAgent());
  router.registerAgent(new PerformanceCoordinatorAgent());
  router.registerAgent(new RecruitingCoordinatorAgent());
  router.registerAgent(new BrandCoordinatorAgent());
  router.registerAgent(new AdminCoordinatorAgent());
  router.registerAgent(new StrategyCoordinatorAgent());

  // ── 2a. Primary Agent (single front-door agent) ──────────────────────────
  // The Primary owns the full conversational surface via a single
  // streaming ReAct loop. It dispatches sub-tasks to specialist
  // coordinators (delegate_to_coordinator) and multi-step plans
  // (plan_and_execute) through tool calls.
  const primaryService = new AgentRouterPrimaryService({
    ...router.getOrchestratorBundle(),
    agents: router.getRegisteredAgents(),
    planRepository: new AgentPlanRepository(appDb, stagingDb),
    resolveUserContext: async (uid: string) => contextBuilder.buildContext(uid, runtimeFirestore),
    resolveToolAccessContext: async (uid: string) => {
      const userCtx = await contextBuilder.buildContext(uid, runtimeFirestore);
      return router.getOrchestratorBundle().policyService.buildToolAccessContext(userCtx);
    },
  });
  const primaryAgent = new PrimaryAgent(capabilityRegistry, primaryService);
  router.setPrimary(primaryAgent, primaryService);

  // ── 3. Queue infrastructure ──────────────────────────────────────────────────
  const agentRunConfig = await getAgentRunConfig(runtimeFirestore);
  const queueService = new AgentQueueService(undefined, {
    maxAttempts: agentRunConfig.maxJobAttempts,
    retryBackoffMs: agentRunConfig.retryBackoffMs,
  });
  const jobRepository = new AgentJobRepository(); // production Firestore
  const stagingJobRepository = new AgentJobRepository(stagingDb); // staging Firestore
  const agentChatService = new AgentChatService(queueService, sessionMemory);

  // ── 3a. Automation tools (require queueService + Firestore for durable metadata) ──
  toolRegistry.register(new ScheduleRecurringTaskTool(queueService, toolFirestore));
  toolRegistry.register(new UpdateRecurringTaskTool(queueService, toolFirestore));
  toolRegistry.register(new ListRecurringTasksTool(queueService, toolFirestore));
  toolRegistry.register(new CancelRecurringTaskTool(queueService, toolFirestore));
  toolRegistry.register(new EnqueueHeavyTaskTool(queueService, toolFirestore));

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
  setScrapeDependencies({
    queueService,
    jobRepository,
    chatService: agentChatService,
    llmService: llm,
  });

  logger.info('Agent X queue engine initialized');

  // ── 7. Return graceful shutdown handler ───────────────────────────────
  return async () => {
    await baseWorker.shutdown();
    await pubsub.shutdown();
    await queueService.shutdown();
    await googleWorkspaceMcpSessionService?.shutdown();
    await microsoft365McpSessionService?.shutdown();
    logger.info('Agent X queue engine shut down');
  };
}
