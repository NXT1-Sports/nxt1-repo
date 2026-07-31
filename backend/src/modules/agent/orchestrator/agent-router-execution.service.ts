import type {
  AgentIdentifier,
  AgentJobUpdate,
  AgentOperationResult,
  AgentSessionContext,
  AgentTask,
  AgentTaskStatus,
  AgentToolDefinition,
  AgentToolAccessContext,
} from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import type { BaseAgent } from '../agents/base.agent.js';
import { isAgentDelegation } from '../exceptions/agent-delegation.exception.js';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';
import { AgentYieldException, isAgentYield } from '../exceptions/agent-yield.exception.js';
import type { OpenRouterService } from '../llm/openrouter.service.js';
import type { OnStreamEvent } from '../queue/event-writer.js';
import type { ApprovalGateService } from '../services/approval-gate.service.js';
import type { SkillRegistry } from '../skills/skill-registry.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { logger } from '../../../utils/logger.js';
import type { AgentRouterTelemetryService } from './agent-router-telemetry.service.js';
import { isToolAllowedByPatterns, getEffectiveAgentToolPolicy } from '../agents/tool-policy.js';
import { getOperationMemoryService } from '../services/operation-memory.service.js';

export type AgentExecutionMutableTask = Omit<
  AgentTask,
  'status' | 'assignedAgent' | 'description' | 'displayLabel' | 'structuredPayload' | 'statusNote'
> & {
  status: AgentTaskStatus;
  assignedAgent: Exclude<AgentIdentifier, 'router'>;
  displayLabel?: string;
  description: string;
  structuredPayload?: Record<string, unknown>;
  statusNote?: string;
  _lastError?: string;
};

export interface AgentExecutionLoopResult {
  readonly taskResults: Map<string, AgentOperationResult>;
  readonly mutableTasks: AgentExecutionMutableTask[];
  readonly executionDurationMs: number;
}

type TelemetryDeps = Pick<
  AgentRouterTelemetryService,
  'emitProgressOperation' | 'emitUpdate' | 'recordPhaseLatency'
>;

const routableCoordinatorSet = new Set<string>(COORDINATOR_AGENT_IDS);
const SEMANTIC_MATCH_THRESHOLD = 0.35;
const SAFETY_BUFFER_THRESHOLD = 0.2;
const MAX_COORDINATOR_HANDOFFS_PER_TASK = 3;
const COORDINATOR_HANDOFF_FAILED_NOTE =
  'Coordinator handoff failed. Router could not reassign this task.';
const INTERNAL_NXT1_POSTING_TOOLS = new Set([
  'write_timeline_post',
  'update_timeline_post',
  'delete_timeline_post',
  'write_team_post',
  'update_team_post',
  'delete_team_post',
]);
const BRAND_MEDIA_SUPPRESSED_PLATFORM_TOOLS = new Set(['query_nxt1_platform_data']);
const TOOL_COMPANION_MAP: Readonly<Record<string, readonly string[]>> = {
  scrape_and_index_profile: [
    'classify_media_url',
    'read_distilled_section',
    'dispatch_extraction',
    'scrape_twitter',
    'scrape_instagram',
    'search_apify_actors',
    'get_apify_actor_details',
    'call_apify_actor',
    'get_apify_actor_output',
    'write_core_identity',
    'write_awards',
    'write_combine_metrics',
    'write_rankings',
    'write_season_stats',
    'write_recruiting_activity',
    'write_calendar_events',
    'write_schedule',
    'write_team_stats',
    'write_team_post',
    'write_timeline_post',
    'write_roster_entries',
    'write_athlete_videos',
    'write_connected_source',
    'mutate_nxt1_data',
  ],
  dispatch_extraction: [
    'write_core_identity',
    'write_awards',
    'write_combine_metrics',
    'write_rankings',
    'write_season_stats',
    'write_recruiting_activity',
    'write_calendar_events',
    'write_schedule',
    'write_team_stats',
    'write_team_post',
    'write_timeline_post',
    'write_roster_entries',
    'write_athlete_videos',
    'write_connected_source',
    'mutate_nxt1_data',
  ],
  // mutate_nxt1_data always pulls in query/list so the agent can verify the
  // collection and document before writing — prevents hallucinated document IDs.
  // Bidirectional entries ensure mutate_nxt1_data is never stranded when it
  // IS semantically matched but its read companions are not, and vice versa.
  mutate_nxt1_data: ['query_nxt1_data', 'list_nxt1_data_views'],
  query_nxt1_data: ['mutate_nxt1_data', 'list_nxt1_data_views'],
  list_nxt1_data_views: ['query_nxt1_data', 'mutate_nxt1_data'],
  // Write tools pull in mutate_nxt1_data so data_coordinator always has it
  // when any data write task is semantically matched.
  write_core_identity: ['mutate_nxt1_data'],
  update_core_identity: ['mutate_nxt1_data'],
  write_team_stats: ['mutate_nxt1_data'],
  write_roster_entries: ['mutate_nxt1_data'],
  write_schedule: ['mutate_nxt1_data'],
  write_calendar_events: ['mutate_nxt1_data'],
  write_awards: ['mutate_nxt1_data'],
  write_rankings: ['mutate_nxt1_data'],
  write_season_stats: ['mutate_nxt1_data'],
  write_recruiting_activity: ['mutate_nxt1_data'],
  write_combine_metrics: ['mutate_nxt1_data'],
  extract_hudl_video: [
    'classify_media_url',
    'stage_media',
    'analyze_video',
    'get_video_details',
    'enable_download',
    'ffmpeg_trim_video',
    'ffmpeg_merge_videos',
    'ffmpeg_generate_thumbnail',
  ],
  extract_live_view_media: [
    'classify_media_url',
    'stage_media',
    'analyze_video',
    'get_video_details',
    'enable_download',
    'ffmpeg_trim_video',
    'ffmpeg_merge_videos',
    'ffmpeg_generate_thumbnail',
  ],
  // extract_live_view_playlist: [ // DISABLED: Not yet stable — use extract_live_view_media instead
  //   'stage_media',
  //   'analyze_video',
  //   'ffmpeg_trim_video',
  //   'ffmpeg_merge_videos',
  //   'ffmpeg_generate_thumbnail',
  // ],
  stage_media: [
    'classify_media_url',
    'analyze_video',
    'clip_video',
    'get_video_details',
    'enable_download',
    'ffmpeg_trim_video',
    'ffmpeg_merge_videos',
    'ffmpeg_generate_thumbnail',
  ],
  analyze_video: [
    'analyze_image',
    'classify_media_url',
    'clip_video',
    'get_video_details',
    'enable_download',
    'ffmpeg_trim_video',
    'ffmpeg_merge_videos',
    'ffmpeg_generate_thumbnail',
    'ffmpeg_burn_annotation',
    'ffmpeg_add_text_overlay',
    'ffmpeg_burn_subtitles',
  ],
  clip_video: ['get_video_details', 'enable_download', 'analyze_video'],
  ffmpeg_trim_video: ['ffmpeg_merge_videos', 'ffmpeg_generate_thumbnail'],
  runway_generate_video: ['runway_check_task'],
  runway_edit_video: ['runway_check_task'],
  runway_upscale_video: ['runway_check_task'],
  list_team_file_folders: [
    'create_team_file_folder',
    'update_team_file_folder',
    'move_universal_file_to_folder',
  ],
  create_team_file_folder: [
    'list_team_file_folders',
    'update_team_file_folder',
    'move_universal_file_to_folder',
  ],
  update_team_file_folder: ['list_team_file_folders', 'move_universal_file_to_folder'],
  move_universal_file_to_folder: ['list_team_file_folders', 'update_team_file_folder'],
  delete_team_file_folder: ['list_team_file_folders'],
};

export function computeForcedToolInclusions(taskIntent: string): readonly string[] {
  const normalizedIntent = taskIntent.toLowerCase();
  const forced = new Set<string>();

  const isDeleteIntent =
    normalizedIntent.includes(' delete ') ||
    normalizedIntent.includes(' remove ') ||
    normalizedIntent.includes(' take down ') ||
    normalizedIntent.includes(' erase ') ||
    normalizedIntent.startsWith('delete ') ||
    normalizedIntent.startsWith('remove ');

  if (isDeleteIntent) {
    // Timeline/post deletes can score low semantically when the intent mostly
    // contains IDs. Force these tools in to avoid false "not allowed" loops.
    if (
      normalizedIntent.includes('timeline') ||
      normalizedIntent.includes('profile post') ||
      normalizedIntent.includes('post')
    ) {
      forced.add('delete_timeline_post');
      forced.add('delete_team_post');
      forced.add('scan_timeline_posts');
      forced.add('query_nxt1_data');
    }
  }

  const mentionsScheduleWrite =
    /\b(schedule|calendar|event|events|tournament|camp|combine|showcase|nationals|aau)\b/i.test(
      normalizedIntent
    ) && /\b(add|save|write|create|log|sync|update|record)\b/i.test(normalizedIntent);

  if (mentionsScheduleWrite) {
    forced.add('write_calendar_events');
    forced.add('write_schedule');
  }

  const asksForSourceIngestion =
    /\b(sync|resync|re-sync|pull|import|scrape|extract|ingest|analyze|audit|review|reference|connected|linked|account|profile)\b/.test(
      normalizedIntent
    );
  const mentionsTwitterSource = /\b(twitter|x\/twitter|x\.com|twitter\.com)\b/.test(
    normalizedIntent
  );
  const mentionsInstagramSource = /\b(instagram|ig|instagram\.com)\b/.test(normalizedIntent);
  const mentionsApifySocialSource =
    /\b(tiktok|tik\s*tok|tiktok\.com|facebook|fb\.com|facebook\.com|linkedin|linkedin\.com|threads|threads\.net)\b/.test(
      normalizedIntent
    );

  if (asksForSourceIngestion && mentionsTwitterSource) {
    forced.add('classify_media_url');
    forced.add('scrape_twitter');
  }

  if (asksForSourceIngestion && mentionsInstagramSource) {
    forced.add('classify_media_url');
    forced.add('scrape_instagram');
  }

  if (asksForSourceIngestion && mentionsApifySocialSource) {
    forced.add('classify_media_url');
    forced.add('search_apify_actors');
    forced.add('get_apify_actor_details');
    forced.add('call_apify_actor');
    forced.add('get_apify_actor_output');
  }

  const mentionsFilesBackedArtifact =
    /\b(files?|team files?|playbook|our plays?|install sheet|callsheet|call sheet|call menu|game plan|scout report|opponent report|practice script|weekly plan|template|sample layout|saved strategy|document|pdf)\b/i.test(
      normalizedIntent
    );

  if (mentionsFilesBackedArtifact) {
    forced.add('list_universal_team_documents');
    forced.add('get_universal_team_document');
    forced.add('parse_document');
    forced.add('render_pdf_pages');
  }

  const asksToCreateStrategyArtifact =
    mentionsFilesBackedArtifact &&
    /\b(create|make|build|generate|produce|export|draft|write)\b/i.test(normalizedIntent);

  if (asksToCreateStrategyArtifact) {
    forced.add('create_universal_team_document');
    forced.add('dynamic_export');
  }

  const mentionsFilmReviewPointer =
    /\b(film review|selected film|selected clips?|selected plays?|source breakdown|breakdown rows|wide clip|odk|down\/?distance)\b/i.test(
      normalizedIntent
    ) || /\bfilmreviewid|sourceids?|selectedsourceids\b/i.test(normalizedIntent);

  if (mentionsFilmReviewPointer) {
    forced.add('get_film_review');
    forced.add('list_film_review_sources');
    forced.add('get_film_review_source_breakdown');
  }

  const asksForSelectedFilmPlayerStats =
    mentionsFilmReviewPointer &&
    /\b(player|players?|team|offensive|rushing|passing|receiving)\b/i.test(normalizedIntent) &&
    /\b(stats?|stat\s*sheet|stat\s*report|box\s*score)\b/i.test(normalizedIntent);

  if (asksForSelectedFilmPlayerStats) {
    forced.add('analyze_film_review_sources');
  }

  const asksForSelectedFilmBreakdownTagging =
    mentionsFilmReviewPointer &&
    /\b(update|write|save|persist|fill|set|apply|tag|label|mark|create|replace|append|add)\b/i.test(
      normalizedIntent
    ) &&
    /\b(breakdown|table|row|rows|schema|tags?|def\s*front|odk|down\/?distance|coverage|personnel|formation)\b/i.test(
      normalizedIntent
    );

  if (asksForSelectedFilmBreakdownTagging) {
    forced.add('patch_film_review_source_breakdowns');
  }

  const asksForVideoDerivedBreakdownTagging =
    asksForSelectedFilmBreakdownTagging &&
    /\b(watch|analy[sz]e|identify|detect|recognize|determine|inspect|review)\b/i.test(
      normalizedIntent
    );

  if (asksForVideoDerivedBreakdownTagging) {
    forced.add('analyze_film_review_source_breakdowns');
  }

  const mentionsVideoSource =
    /\b(attached video|video attachment|videoattachments?|cloudflarevideoid|hudl|youtube|instagram|twitter|x\.com|firebasestorage|storage\.googleapis|cloudflarestream)\b/.test(
      normalizedIntent
    ) || /\.(mp4|mov|m4v|webm|avi|mkv)(?:\b|[?#/])/.test(normalizedIntent);
  const asksForCreativeVideoOutput =
    /\b(create|make|generate|produce|build|cut|edit|clip|trim|assemble|merge)\b/.test(
      normalizedIntent
    ) && /\b(highlight|reel|video|promo|teaser|recap|best moments?)\b/.test(normalizedIntent);
  const asksForBrandVisualOutput =
    /\b(create|make|generate|produce|build|design|edit)\b/.test(normalizedIntent) &&
    /\b(highlight|reel|promo|teaser|recap|graphic|poster|thumbnail|title card|intro|brand(?:ed)?|creative)\b/.test(
      normalizedIntent
    );

  if (mentionsVideoSource && asksForCreativeVideoOutput) {
    forced.add('stage_media');
    forced.add('analyze_video');
    forced.add('get_video_details');
    forced.add('enable_download');
    forced.add('ffmpeg_trim_video');
    forced.add('ffmpeg_merge_videos');
    forced.add('ffmpeg_generate_thumbnail');
  }

  if (asksForBrandVisualOutput) {
    forced.add('query_nxt1_data');
  }

  return [...forced];
}

function isBrandCreativeMediaIntent(
  agentId: AgentIdentifier,
  taskIntent: string
): agentId is Extract<AgentIdentifier, 'brand_coordinator'> {
  if (agentId !== 'brand_coordinator') return false;
  const normalizedIntent = taskIntent.toLowerCase();
  return (
    /\b(create|make|generate|produce|build|design|cut|edit|assemble|merge)\b/.test(
      normalizedIntent
    ) &&
    /\b(highlight|reel|promo|teaser|recap|graphic|poster|thumbnail|title card|intro|brand(?:ed)?|creative|media)\b/.test(
      normalizedIntent
    )
  );
}

function removeBrandMediaSuppressedPlatformTools<T extends AgentToolDefinition>(
  toolDefs: readonly T[]
): T[] {
  return toolDefs.filter((tool) => !BRAND_MEDIA_SUPPRESSED_PLATFORM_TOOLS.has(tool.name));
}

function isExternalSocialPublishIntent(taskIntent: string): boolean {
  const normalizedIntent = taskIntent.toLowerCase();
  const hasPublishVerb =
    /\b(post|posts|posting|publish|publishes|published|publishing|share|shares|shared|sharing|upload|uploads|uploaded|uploading)\b/.test(
      normalizedIntent
    );
  if (!hasPublishVerb) return false;

  return mentionsExternalSocialPlatform(normalizedIntent);
}

function mentionsExternalSocialPlatform(normalizedIntent: string): boolean {
  return (
    /\b(instagram|ig|tiktok|tik\s*tok|facebook|fb|linkedin|linked\s*in|youtube|you\s*tube|threads|snapchat)\b/.test(
      normalizedIntent
    ) ||
    /\b(twitter|x\/twitter|x\.com|twitter\.com)\b/.test(normalizedIntent) ||
    /\b(?:on|to|for)\s+x\b/.test(normalizedIntent)
  );
}

function isExplicitNxt1PostIntent(taskIntent: string): boolean {
  const normalizedIntent = taskIntent.toLowerCase();

  return (
    /\bnxt1\b/.test(normalizedIntent) ||
    /\b(?:my|user|profile|personal)\s+(?:timeline|feed)\b/.test(normalizedIntent) ||
    /\bteam\s+(?:timeline|feed)\b/.test(normalizedIntent) ||
    /\binternal\s+(?:timeline|feed|post)\b/.test(normalizedIntent)
  );
}

function shouldSuppressInternalPostingTools(taskIntent: string): boolean {
  return isExternalSocialPublishIntent(taskIntent) && !isExplicitNxt1PostIntent(taskIntent);
}

function removeInternalPostingTools<T extends { readonly name: string }>(
  toolDefs: readonly T[]
): T[] {
  return toolDefs.filter((tool) => !INTERNAL_NXT1_POSTING_TOOLS.has(tool.name));
}

function isBlockedToolUnavailableResult(result: AgentOperationResult): boolean {
  const normalizedSummary = result.summary.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalizedSummary) return false;

  const namesMissingTool =
    /\b(required|needed)\b.*\b[a-z0-9_]+\s+tool\b.*\b(not available|unavailable|not exposed|missing)\b/.test(
      normalizedSummary
    ) ||
    /\btool\b.*\b(not available|unavailable|not exposed|missing)\b.*\bcurrent toolset\b/.test(
      normalizedSummary
    );

  if (!namesMissingTool) return false;

  return /\bblocked\b/.test(normalizedSummary) || /\bno action taken\b/.test(normalizedSummary);
}

function summarizeBlockedToolResult(result: AgentOperationResult): string {
  const summary = result.summary.replace(/\s+/g, ' ').trim();
  return summary.length > 280 ? `${summary.slice(0, 277)}...` : summary;
}

function isFalseExternalSocialPublishClaim(
  taskIntent: string,
  result: AgentOperationResult
): boolean {
  if (!isExternalSocialPublishIntent(taskIntent) || isExplicitNxt1PostIntent(taskIntent)) {
    return false;
  }

  const normalizedSummary = result.summary.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!mentionsExternalSocialPlatform(normalizedSummary)) return false;
  if (!/\b(posted|published|uploaded|shared)\b/.test(normalizedSummary)) return false;

  return !/\b(not|cannot|can't|cant|unable|unavailable|not available|not connected|manual|prepared|ready for|exported for)\b/.test(
    normalizedSummary
  );
}

function isRoutableCoordinatorAgent(
  agentId: string
): agentId is Exclude<AgentIdentifier, 'router'> {
  return routableCoordinatorSet.has(agentId);
}

function addCompanionTools(
  selected: readonly AgentToolDefinition[],
  allowed: readonly AgentToolDefinition[]
): readonly AgentToolDefinition[] {
  const finalTools = new Map(selected.map((tool) => [tool.name, tool]));

  for (const tool of selected) {
    const companions = TOOL_COMPANION_MAP[tool.name] ?? [];
    for (const companionName of companions) {
      if (finalTools.has(companionName)) {
        continue;
      }

      const companion = allowed.find((candidate) => candidate.name === companionName);
      if (companion) {
        finalTools.set(companion.name, companion);
      }
    }
  }

  return [...finalTools.values()];
}

export class AgentRouterExecutionService {
  constructor(
    private readonly llm: OpenRouterService,
    private readonly toolRegistry: ToolRegistry,
    private readonly telemetry: TelemetryDeps,
    private readonly skillRegistry?: SkillRegistry
  ) {}

  async executePlan(payload: {
    readonly operationId: string;
    readonly userId: string;
    readonly plan: { readonly tasks: readonly AgentTask[] };
    readonly enrichedIntent: string;
    readonly context: AgentSessionContext;
    readonly toolAccessContext: AgentToolAccessContext;
    readonly approvalGate?: ApprovalGateService;
    readonly taskMaxRetries: number;
    readonly agents: ReadonlyMap<AgentIdentifier, BaseAgent>;
    readonly onUpdate?: (update: AgentJobUpdate) => void;
    readonly onStreamEvent?: OnStreamEvent;
    readonly onPlanStateChange?: (
      mutableTasks: readonly AgentExecutionMutableTask[],
      taskResults: ReadonlyMap<string, AgentOperationResult>
    ) => Promise<void> | void;
    readonly signal?: AbortSignal;
    readonly buildTaskIntent: (
      task: AgentTask,
      upstreamResults: Map<string, AgentOperationResult>,
      enrichedContext?: string
    ) => string;
    readonly rerouteDelegatedTask: (
      forwardingIntent: string,
      sourceAgentId: Exclude<AgentIdentifier, 'router'>,
      context: AgentSessionContext,
      structuredPayload?: Record<string, unknown>
    ) => Promise<{
      readonly assignedAgent: Exclude<AgentIdentifier, 'router'>;
      readonly description: string;
      readonly structuredPayload?: Record<string, unknown>;
      readonly statusNote?: string;
    } | null>;
  }): Promise<AgentExecutionLoopResult> {
    const {
      operationId,
      userId,
      plan,
      enrichedIntent,
      context,
      toolAccessContext,
      approvalGate,
      taskMaxRetries,
      agents,
      onUpdate,
      onStreamEvent,
      onPlanStateChange,
      signal,
      buildTaskIntent,
      rerouteDelegatedTask,
    } = payload;

    const executionPhaseStartMs = Date.now();

    // ── Tier 5: Initialise operation memory for duplicate-detection ───────
    const operationMemory = getOperationMemoryService();
    operationMemory.init(operationId, enrichedIntent);

    try {
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: 'On it...',
        metadata: { eventType: 'progress_stage', phase: 'execution', phaseIndex: 3, phaseTotal: 5 },
      });

      const taskResults = new Map<string, AgentOperationResult>();
      const mutableTasks = plan.tasks.map((task) => ({
        ...task,
        displayLabel: task.displayLabel,
        _lastError: undefined as string | undefined,
      })) as AgentExecutionMutableTask[];
      this.normalizeTasksForDeterministicExecution(mutableTasks);

      await onPlanStateChange?.(mutableTasks, taskResults);

      while (this.hasPendingTasks(mutableTasks)) {
        const ready = mutableTasks.filter(
          (task) =>
            task.status === 'pending' &&
            task.dependsOn.every(
              (dep) =>
                mutableTasks.find((mutableTask) => mutableTask.id === dep)?.status === 'completed'
            )
        );

        if (ready.length === 0) {
          for (const task of mutableTasks) {
            if (task.status === 'pending') {
              task.status = 'blocked' as AgentTaskStatus;
              task._lastError =
                'Execution plan stalled because remaining tasks had unmet dependencies.';
            }
          }
          this.emitPlannerCard(onStreamEvent, mutableTasks);
          await onPlanStateChange?.(mutableTasks, taskResults);
          break;
        }

        // Serial execution: run exactly one task per loop iteration so the UI
        // shows one active step at a time. Parallelism within a task (the
        // coordinator's own tool execution) is unaffected by this change.
        const activeTask = ready[0]!;
        this.markTaskInProgress(activeTask.id, mutableTasks);
        this.telemetry.emitUpdate(
          onUpdate,
          operationId,
          'acting',
          `Running task ${activeTask.id}: ${activeTask.description}`,
          { eventType: 'task_started', taskId: activeTask.id },
          {
            agentId: activeTask.assignedAgent,
            stage: 'agent_thinking',
            metadata: { taskId: activeTask.id },
          }
        );
        this.emitActivePlannerCard(onStreamEvent, mutableTasks);
        await onPlanStateChange?.(mutableTasks, taskResults);

        const completedAtBatchStart = Object.fromEntries(
          [...taskResults.entries()].map(([key, value]) => [key, value])
        );

        const runTask = async (task: AgentExecutionMutableTask): Promise<void> => {
          let attempt = 0;
          let handoffCount = 0;

          while (attempt <= taskMaxRetries) {
            try {
              this.throwIfAborted(signal);

              const assignedAgentId = task.assignedAgent;
              if (!isRoutableCoordinatorAgent(assignedAgentId)) {
                throw new AgentEngineError(
                  'AGENT_NOT_REGISTERED',
                  `Task "${task.id}" assigned to non-routable agent "${assignedAgentId}". ` +
                    `Allowed coordinators: ${COORDINATOR_AGENT_IDS.join(', ')}.`,
                  {
                    metadata: {
                      taskId: task.id,
                      assignedAgentId,
                      allowedAgentIds: COORDINATOR_AGENT_IDS,
                    },
                  }
                );
              }

              const agent = agents.get(assignedAgentId);
              if (!agent) {
                throw new AgentEngineError(
                  'AGENT_NOT_REGISTERED',
                  `No agent registered for "${assignedAgentId}".`,
                  { metadata: { assignedAgentId, taskId: task.id } }
                );
              }

              let taskIntent = buildTaskIntent(task, taskResults, enrichedIntent);

              if (attempt > 0 && task._lastError) {
                taskIntent +=
                  `\n\n[System Intervention — Retry ${attempt}/${taskMaxRetries}]\n` +
                  `Your previous execution of this task failed with the following error:\n` +
                  `"${task._lastError}"\n` +
                  `Please formulate an alternative strategy to accomplish this task. ` +
                  `Use a different tool, adjust your parameters, or if the task is ` +
                  `truly impossible, explain why clearly.`;

                logger.warn('[AgentRouter] Self-correction retry', {
                  taskId: task.id,
                  agent: task.assignedAgent,
                  attempt,
                  previousError: task._lastError,
                });

                this.telemetry.emitUpdate(
                  onUpdate,
                  operationId,
                  'acting',
                  `Task ${task.id}: retrying (attempt ${attempt + 1}/${taskMaxRetries + 1})...`,
                  { eventType: 'task_retry', taskId: task.id, attempt },
                  {
                    agentId: task.assignedAgent,
                    stage: 'agent_thinking',
                    metadata: { taskId: task.id, attempt },
                  }
                );
              }

              const suppressInternalPostingTools = shouldSuppressInternalPostingTools(taskIntent);
              const suppressBrandMediaPlatformTools = isBrandCreativeMediaIntent(
                agent.id,
                taskIntent
              );
              let toolDefs = this.toolRegistry.getDefinitions(agent.id, toolAccessContext);
              if (suppressInternalPostingTools) {
                toolDefs = removeInternalPostingTools(toolDefs);
              }
              if (suppressBrandMediaPlatformTools) {
                toolDefs = removeBrandMediaSuppressedPlatformTools(toolDefs);
              }
              try {
                const intentEmbedding = await this.llm.embed(taskIntent);
                const rawMatchedToolDefs = await this.toolRegistry.matchWithScores(
                  intentEmbedding,
                  (text) => this.llm.embed(text),
                  agent.id,
                  toolAccessContext
                );
                const matchedToolDefs = suppressInternalPostingTools
                  ? removeInternalPostingTools(rawMatchedToolDefs)
                  : rawMatchedToolDefs;
                const brandSafeMatchedToolDefs = suppressBrandMediaPlatformTools
                  ? removeBrandMediaSuppressedPlatformTools(matchedToolDefs)
                  : matchedToolDefs;

                const semanticMatched = brandSafeMatchedToolDefs.filter(
                  (tool) => tool.semanticScore >= SEMANTIC_MATCH_THRESHOLD
                );

                // Use the coordinator's own effective policy to gate mutations in the safety
                // buffer. Using ROUTER_POLICY_PATTERNS here was the bug: coordinator-only
                // write tools (write_core_identity, write_season_stats, etc.) have
                // isMutation=true and are intentionally absent from the router's policy,
                // so pure-write tasks delegated to data_coordinator would silently receive
                // no write tools and stall.
                const agentPolicy = getEffectiveAgentToolPolicy(agent.id);
                const safetyBuffer = brandSafeMatchedToolDefs.filter((tool) => {
                  if (tool.semanticScore < SAFETY_BUFFER_THRESHOLD) return false;
                  if (tool.category === 'system') return true;
                  if (!tool.isMutation) return true;
                  return isToolAllowedByPatterns(tool.name, agentPolicy);
                });

                const finalTools = new Map<string, (typeof brandSafeMatchedToolDefs)[number]>();
                for (const tool of semanticMatched) finalTools.set(tool.name, tool);
                for (const tool of safetyBuffer) finalTools.set(tool.name, tool);

                for (const forcedToolName of computeForcedToolInclusions(taskIntent)) {
                  const matchedForcedTool = brandSafeMatchedToolDefs.find(
                    (tool) => tool.name === forcedToolName
                  );
                  if (matchedForcedTool) {
                    finalTools.set(matchedForcedTool.name, matchedForcedTool);
                    continue;
                  }

                  const fallbackForcedTool = toolDefs.find((tool) => tool.name === forcedToolName);
                  if (fallbackForcedTool) {
                    finalTools.set(fallbackForcedTool.name, {
                      ...fallbackForcedTool,
                      semanticScore: SAFETY_BUFFER_THRESHOLD,
                    });
                  }
                }

                const selectedScored = [...finalTools.values()];
                const selected = addCompanionTools(selectedScored, toolDefs);
                const matchedNonSystemToolCount = selected.filter(
                  (tool) => tool.category !== 'system'
                ).length;

                if (selected.length > 0 && matchedNonSystemToolCount > 0) {
                  toolDefs = selected.map((definition) => ({ ...definition }));

                  logger.info('[AgentRouter] Hybrid tool narrowing selected tools', {
                    operationId,
                    taskId: task.id,
                    agentId: agent.id,
                    selectedTools: selectedScored.map((tool) => ({
                      name: tool.name,
                      score: Number(tool.semanticScore.toFixed(3)),
                      reason:
                        tool.semanticScore >= SEMANTIC_MATCH_THRESHOLD
                          ? 'semantic_match'
                          : 'safety_buffer',
                    })),
                    companionTools: selected
                      .map((tool) => tool.name)
                      .filter((toolName) => !selectedScored.some((tool) => tool.name === toolName)),
                  });
                } else {
                  logger.warn(
                    '[AgentRouter] Hybrid tool narrowing was too sparse — using full allowed tool set',
                    {
                      operationId,
                      taskId: task.id,
                      agentId: agent.id,
                      matchedToolNames: matchedToolDefs.map((tool) => tool.name),
                      fallbackToolCount: toolDefs.length,
                    }
                  );
                }
              } catch {
                // Embedding unavailable — fall back to all permitted tools
              }

              const result = await agent.execute(
                taskIntent,
                context,
                toolDefs,
                this.llm,
                this.toolRegistry,
                this.skillRegistry,
                onStreamEvent,
                approvalGate
              );
              this.throwIfAborted(signal);

              if (isBlockedToolUnavailableResult(result)) {
                throw new AgentEngineError(
                  'AGENT_TOOL_UNAVAILABLE',
                  summarizeBlockedToolResult(result),
                  {
                    metadata: {
                      taskId: task.id,
                      assignedAgentId: task.assignedAgent,
                    },
                  }
                );
              }

              if (isFalseExternalSocialPublishClaim(taskIntent, result)) {
                throw new AgentEngineError(
                  'AGENT_TOOL_UNAVAILABLE',
                  'Direct external social publishing is not connected yet. Prepare the asset and caption for manual posting instead of claiming it was published.',
                  {
                    metadata: {
                      taskId: task.id,
                      assignedAgentId: task.assignedAgent,
                    },
                  }
                );
              }

              if (result.success === false) {
                throw new AgentEngineError(
                  'AGENT_SUB_AGENT_INVALID_OUTPUT',
                  result.errorMessage ?? result.summary ?? 'Coordinator task failed.',
                  {
                    metadata: {
                      taskId: task.id,
                      assignedAgentId: task.assignedAgent,
                    },
                  }
                );
              }

              taskResults.set(task.id, result);
              task.status = 'completed' as AgentTaskStatus;
              this.telemetry.emitUpdate(
                onUpdate,
                operationId,
                'acting',
                `Task ${task.id} completed: ${result.summary}`,
                undefined,
                {
                  agentId: task.assignedAgent,
                  stage: 'agent_thinking',
                  metadata: { taskId: task.id },
                }
              );

              this.emitPlannerCard(onStreamEvent, mutableTasks);
              await onPlanStateChange?.(mutableTasks, taskResults);
              return;
            } catch (err) {
              if (this.isAbortError(err)) throw err;

              if (isAgentYield(err)) {
                const yieldErr = err as AgentYieldException;
                task.status = 'awaiting_tool_approval' as AgentTaskStatus;
                task._lastError = 'Waiting for user approval to continue this task.';
                this.emitPlannerCard(onStreamEvent, mutableTasks);
                await onPlanStateChange?.(mutableTasks, taskResults);
                throw new AgentYieldException({
                  ...yieldErr.payload,
                  planContext: {
                    currentTaskId: task.id,
                    completedTaskResults: completedAtBatchStart,
                    enrichedIntent,
                  },
                });
              }

              if (isAgentDelegation(err)) {
                const delErr =
                  err as import('../exceptions/agent-delegation.exception.js').AgentDelegationException;
                const originalAgentId = task.assignedAgent as Exclude<AgentIdentifier, 'router'>;
                logger.warn('[AgentRouter] Agent delegated inside DAG — attempting reroute', {
                  operationId,
                  taskId: task.id,
                  sourceAgent: originalAgentId,
                  forwardingIntent: delErr.payload.forwardingIntent.slice(0, 100),
                });

                const reroute = await rerouteDelegatedTask(
                  delErr.payload.forwardingIntent,
                  originalAgentId,
                  context,
                  delErr.payload.structuredPayload
                );

                if (reroute) {
                  handoffCount += 1;
                  if (handoffCount > MAX_COORDINATOR_HANDOFFS_PER_TASK) {
                    task._lastError = COORDINATOR_HANDOFF_FAILED_NOTE;
                    task.status = 'failed' as AgentTaskStatus;
                    this.telemetry.emitUpdate(
                      onUpdate,
                      operationId,
                      'acting',
                      `Task ${task.id} exceeded coordinator handoff limit.`,
                      {
                        eventType: 'task_failed',
                        taskId: task.id,
                        assignedAgent: originalAgentId,
                        error: task._lastError,
                        internalError: `Coordinator handoff limit exceeded after ${handoffCount} handoffs. Last intent: ${delErr.payload.forwardingIntent}`,
                      },
                      {
                        agentId: 'router',
                        stage: 'routing_to_agent',
                        outcomeCode: 'routing_failed',
                        metadata: {
                          taskId: task.id,
                          delegatedAgentId: originalAgentId,
                          handoffCount,
                        },
                      }
                    );
                    this.cascadeFailure(task.id, mutableTasks);
                    this.emitPlannerCard(onStreamEvent, mutableTasks);
                    await onPlanStateChange?.(mutableTasks, taskResults);
                    return;
                  }

                  task.assignedAgent = reroute.assignedAgent;
                  task.description = reroute.description;
                  task.statusNote = reroute.statusNote;
                  // Preserve structured payload through reroute so the new
                  // coordinator receives all verbatim IDs and references.
                  if (reroute.structuredPayload !== undefined) {
                    task.structuredPayload = reroute.structuredPayload;
                  }
                  task._lastError = undefined;

                  this.telemetry.emitUpdate(
                    onUpdate,
                    operationId,
                    'acting',
                    `Task ${task.id} rerouted to ${reroute.assignedAgent}. Retrying...`,
                    {
                      eventType: 'task_retry',
                      taskId: task.id,
                      assignedAgent: reroute.assignedAgent,
                    },
                    {
                      agentId: 'router',
                      stage: 'routing_to_agent',
                      metadata: {
                        taskId: task.id,
                        delegatedFrom: originalAgentId,
                        reroutedTo: reroute.assignedAgent,
                      },
                    }
                  );
                  continue;
                }

                task._lastError = COORDINATOR_HANDOFF_FAILED_NOTE;
                task.status = 'failed' as AgentTaskStatus;
                this.telemetry.emitUpdate(
                  onUpdate,
                  operationId,
                  'acting',
                  `Task ${task.id} was misrouted — ${originalAgentId} could not handle it.`,
                  {
                    eventType: 'task_failed',
                    taskId: task.id,
                    assignedAgent: originalAgentId,
                    error: task._lastError,
                    internalError: `Delegated back to router: ${delErr.payload.forwardingIntent}`,
                  },
                  {
                    agentId: 'router',
                    stage: 'routing_to_agent',
                    outcomeCode: 'routing_failed',
                    metadata: {
                      taskId: task.id,
                      delegatedAgentId: originalAgentId,
                      forwardingIntent: delErr.payload.forwardingIntent.slice(0, 500),
                    },
                  }
                );
                this.cascadeFailure(task.id, mutableTasks);
                this.emitPlannerCard(onStreamEvent, mutableTasks);
                await onPlanStateChange?.(mutableTasks, taskResults);
                return;
              }

              const message = err instanceof Error ? err.message : 'Unknown error';
              task._lastError = message;

              if (attempt === taskMaxRetries) {
                task.status = 'failed' as AgentTaskStatus;
                logger.error('[AgentRouter] Task failed after retries exhausted', {
                  operationId,
                  taskId: task.id,
                  assignedAgent: task.assignedAgent,
                  attempts: taskMaxRetries + 1,
                  error: message,
                });
                this.telemetry.emitUpdate(
                  onUpdate,
                  operationId,
                  'acting',
                  `Task ${task.id} failed after ${taskMaxRetries + 1} attempts: ${message}`,
                  {
                    eventType: 'task_failed',
                    taskId: task.id,
                    assignedAgent: task.assignedAgent,
                    attempts: taskMaxRetries + 1,
                    error: message,
                  },
                  {
                    agentId: task.assignedAgent,
                    stage: 'agent_thinking',
                    outcomeCode: 'task_failed',
                    metadata: {
                      taskId: task.id,
                      attempts: taskMaxRetries + 1,
                    },
                  }
                );
                this.cascadeFailure(task.id, mutableTasks);
                this.emitPlannerCard(onStreamEvent, mutableTasks);
                await onPlanStateChange?.(mutableTasks, taskResults);
                return;
              }

              attempt += 1;
            }
          }
        };

        // Run the single active task — AbortError and AgentYieldException propagate naturally.
        await runTask(activeTask);
        this.throwIfAborted(signal);
      }

      const executionDurationMs = Date.now() - executionPhaseStartMs;
      this.telemetry.recordPhaseLatency('execution', executionDurationMs, {
        operationId,
        userId,
        taskCount: mutableTasks.length,
        completedTaskCount: taskResults.size,
      });
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: `Execution latency: ${executionDurationMs}ms`,
        metadata: {
          eventType: 'metric',
          metricName: 'phase_latency_ms',
          phase: 'execution',
          taskCount: mutableTasks.length,
          completedTaskCount: taskResults.size,
          value: executionDurationMs,
        },
      });
      this.telemetry.emitProgressOperation(onStreamEvent, {
        operationId,
        stage: 'agent_thinking',
        message: 'Putting your answer together...',
        metadata: {
          eventType: 'progress_subphase',
          phase: 'execution',
          status: 'done',
          taskCount: mutableTasks.length,
        },
      });

      return {
        taskResults,
        mutableTasks,
        executionDurationMs,
      };
    } finally {
      // ── Tier 5: Always flush operation memory on every exit path ─────────
      operationMemory.flush(operationId);
    }
  }

  private hasPendingTasks(tasks: readonly AgentExecutionMutableTask[]): boolean {
    return tasks.some((task) => task.status === 'pending');
  }

  private isAbortError(err: unknown): err is Error {
    return err instanceof Error && err.name === 'AbortError';
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }
  }

  private cascadeFailure(failedTaskId: string, tasks: AgentExecutionMutableTask[]): void {
    const queue = [failedTaskId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      for (const task of tasks) {
        if (task.status === 'pending' && task.dependsOn.includes(current)) {
          task.status = 'blocked' as AgentTaskStatus;
          task._lastError = `Blocked by failed dependency: ${current}`;
          queue.push(task.id);
        }
      }
    }
  }

  /**
   * Emits the planner card after a task completes. All items show their final
   * done/pending state; none are marked active.
   */
  private emitPlannerCard(
    onStreamEvent: OnStreamEvent | undefined,
    mutableTasks: readonly AgentExecutionMutableTask[]
  ): void {
    if (!onStreamEvent || mutableTasks.length < 1) return;

    onStreamEvent({
      type: 'card',
      cardData: {
        agentId: 'router',
        type: 'planner',
        title: 'Execution Plan',
        payload: {
          items: mutableTasks.map((task) => this.toPlannerItem(task)),
        },
      },
    });
  }

  /**
   * Emits the planner card when a task starts executing, marking exactly one
   * item as active so the UI can show an in-progress spinner.
   */
  private emitActivePlannerCard(
    onStreamEvent: OnStreamEvent | undefined,
    mutableTasks: readonly AgentExecutionMutableTask[]
  ): void {
    if (!onStreamEvent || mutableTasks.length < 1) return;

    onStreamEvent({
      type: 'card',
      cardData: {
        agentId: 'router',
        type: 'planner',
        title: 'Execution Plan',
        payload: {
          items: mutableTasks.map((task) => this.toPlannerItem(task)),
        },
      },
    });
  }

  private toPlannerItem(task: AgentExecutionMutableTask): {
    id: string;
    label: string;
    done: boolean;
    active: boolean;
    status: AgentTaskStatus;
    note?: string;
  } {
    return {
      id: task.id,
      label: task.displayLabel ?? task.description,
      done: task.status === ('completed' as AgentTaskStatus),
      active: task.status === ('in_progress' as AgentTaskStatus),
      status: task.status,
      ...((task._lastError ?? task.statusNote) ? { note: task._lastError ?? task.statusNote } : {}),
    };
  }

  private normalizeTasksForDeterministicExecution(tasks: AgentExecutionMutableTask[]): void {
    for (const task of tasks) {
      const isTerminal =
        task.status === ('completed' as AgentTaskStatus) ||
        task.status === ('failed' as AgentTaskStatus) ||
        task.status === ('blocked' as AgentTaskStatus);
      if (isTerminal) continue;

      // Resume and stale snapshots may carry legacy intermediate states
      // (in_progress/awaiting_tool_approval). Re-normalize so execution
      // deterministically owns one active task at a time.
      task.status = 'pending' as AgentTaskStatus;
    }
  }

  private markTaskInProgress(activeTaskId: string, tasks: AgentExecutionMutableTask[]): void {
    for (const task of tasks) {
      if (task.id === activeTaskId) {
        task.status = 'in_progress' as AgentTaskStatus;
        continue;
      }

      if (task.status === ('in_progress' as AgentTaskStatus)) {
        task.status = 'pending' as AgentTaskStatus;
      }
    }
  }
}
