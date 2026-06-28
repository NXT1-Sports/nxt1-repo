/**
 * @fileoverview Tool Registry
 * @module @nxt1/backend/modules/agent/tools
 *
 * Central registry of all tools available to Agent X.
 *
 * Responsibilities:
 * - Holds a map of tool name → BaseTool instance.
 * - Converts tools into OpenAI/OpenRouter function-calling schema format.
 * - Filters tools by sub-agent permissions.
 * - Validates tool input before execution.
 *
 * New tools are registered here at startup. When you want Agent X to support
 * a new action, you create a tool class and register it — no other changes needed.
 *
 * @example
 * ```ts
 * const registry = new ToolRegistry();
 * registry.register(new FetchPlayerStatsTool(db));
 * registry.register(new SendEmailTool(emailService));
 *
 * // Get OpenRouter-compatible schemas for a specific agent:
 * const schemas = registry.getSchemasForAgent('performance_coordinator');
 *
 * // Execute a tool call from the LLM:
 * const result = await registry.execute('fetch_player_stats', { userId: '123' });
 * ```
 */

import {
  type AgentIdentifier,
  type AgentToolAccessContext,
  type AgentToolDefinition,
  type AgentToolEntityGroup,
} from '@nxt1/core';
import type { IntelGenerationService } from '../services/intel.service.js';
import { logger } from '../../../utils/logger.js';
import { runWithFirestoreEnvironment } from '../../../utils/firestore-environment-context.js';
import type { BaseTool, ToolResult, ToolExecutionContext } from './base.tool.js';
import { compactizeMarkdownUrls } from './favicon-registry.js';
import { sendSlackAlert } from '../../../services/platform/alert.service.js';
import { isDelegateToCoordinator } from '../exceptions/delegate-to-coordinator.exception.js';
import { isPlanAndExecute } from '../exceptions/plan-and-execute.exception.js';
import { isExecuteSavedPlan } from '../exceptions/execute-saved-plan.exception.js';
import {
  isStrictEntityToolGovernanceEnabled,
  isStrictZodToolSchemasEnabled,
  isToolDisabled,
} from '../config/agent-app-config.js';
import { getAgentMutationPolicyService } from './mutation-policy.service.js';
import { getFeatureFlagsService } from '../../../config/feature-flags/index.js';
import { getFirestore } from 'firebase-admin/firestore';
import { AgentEngineError } from '../exceptions/agent-engine.error.js';
import { z } from 'zod';

/** Canonical normalization for tool names — mirrors tool-policy.ts normalizeToolName(). */
function canonicalToolName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type AthleteIntelSectionId = Parameters<IntelGenerationService['updateAthleteIntelSection']>[1];
type TeamIntelSectionId = Parameters<IntelGenerationService['updateTeamIntelSection']>[1];

type IntelSyncPlan =
  | {
      readonly entityType: 'athlete';
      readonly entityId: string;
      readonly sectionIds: readonly AthleteIntelSectionId[];
    }
  | {
      readonly entityType: 'team';
      readonly entityId: string;
      readonly sectionIds: readonly TeamIntelSectionId[];
    };

const INTEL_SYNC_DISABLED_TOOLS = new Set(['write_intel', 'update_intel']);
const NARROWED_ALLOWLIST_BYPASS_TOOLS = new Set(['classify_media_url']);
const TOOL_FAILURE_ALERT_REPEAT_THRESHOLD = 2;
const TOOL_FAILURE_ALERT_WINDOW_MS = 10 * 60 * 1000;

interface ToolFailureAlertWindow {
  readonly failureTimestamps: readonly number[];
  readonly lastAlertedAt?: number;
}

const toolFailureAlertWindows = new Map<string, ToolFailureAlertWindow>();

export function resetToolFailureAlertStateForTests(): void {
  toolFailureAlertWindows.clear();
}

function normalizeToolFailureSignature(toolName: string, errorMessage: string): string {
  const normalizedError = errorMessage
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\bchat-[0-9a-f-]{8,}\b/g, '<operation>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/g, '<id>')
    .replace(/\b\d{2,}\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

  return `${canonicalToolName(toolName)}|${normalizedError}`;
}

function isControlFlowToolSignal(error: unknown): boolean {
  return isDelegateToCoordinator(error) || isPlanAndExecute(error) || isExecuteSavedPlan(error);
}

function buildScopedToolFailureKey(
  toolName: string,
  errorMessage: string,
  context?: ToolExecutionContext
): { readonly key: string; readonly scope: 'thread' | 'operation' } | null {
  if (typeof context?.threadId === 'string' && context.threadId.trim().length > 0) {
    return {
      key: `${context.environment ?? 'production'}:thread:${context.threadId}:${normalizeToolFailureSignature(toolName, errorMessage)}`,
      scope: 'thread',
    };
  }

  if (typeof context?.operationId === 'string' && context.operationId.trim().length > 0) {
    return {
      key: `${context.environment ?? 'production'}:operation:${context.operationId}:${normalizeToolFailureSignature(toolName, errorMessage)}`,
      scope: 'operation',
    };
  }

  return null;
}

function recordScopedToolFailure(
  toolName: string,
  errorMessage: string,
  context?: ToolExecutionContext
): {
  readonly shouldAlert: boolean;
  readonly repeatCount: number;
  readonly scope?: 'thread' | 'operation';
} {
  const scopedKey = buildScopedToolFailureKey(toolName, errorMessage, context);
  if (!scopedKey) {
    return { shouldAlert: true, repeatCount: 1 };
  }

  const now = Date.now();
  for (const [key, window] of toolFailureAlertWindows) {
    const retained = window.failureTimestamps.filter(
      (timestamp) => now - timestamp <= TOOL_FAILURE_ALERT_WINDOW_MS
    );
    const keepAlertMarker =
      window.lastAlertedAt && now - window.lastAlertedAt <= TOOL_FAILURE_ALERT_WINDOW_MS;

    if (retained.length === 0 && !keepAlertMarker) {
      toolFailureAlertWindows.delete(key);
      continue;
    }

    if (retained.length !== window.failureTimestamps.length) {
      toolFailureAlertWindows.set(key, {
        failureTimestamps: retained,
        ...(keepAlertMarker ? { lastAlertedAt: window.lastAlertedAt } : {}),
      });
    }
  }

  const current = toolFailureAlertWindows.get(scopedKey.key);
  const retained =
    current?.failureTimestamps.filter(
      (timestamp) => now - timestamp <= TOOL_FAILURE_ALERT_WINDOW_MS
    ) ?? [];
  const nextTimestamps = [...retained, now];
  const repeatCount = nextTimestamps.length;
  const shouldAlert =
    repeatCount >= TOOL_FAILURE_ALERT_REPEAT_THRESHOLD &&
    (!current?.lastAlertedAt || now - current.lastAlertedAt > TOOL_FAILURE_ALERT_WINDOW_MS);

  toolFailureAlertWindows.set(scopedKey.key, {
    failureTimestamps: nextTimestamps,
    ...(shouldAlert
      ? { lastAlertedAt: now }
      : current?.lastAlertedAt
        ? { lastAlertedAt: current.lastAlertedAt }
        : {}),
  });

  return { shouldAlert, repeatCount, scope: scopedKey.scope };
}

function normalizeToolResultForDisplay(result: ToolResult): ToolResult {
  if (!result.success || typeof result.markdown !== 'string' || result.markdown.length === 0) {
    return result;
  }

  return {
    ...result,
    markdown: compactizeMarkdownUrls(result.markdown),
  };
}

export interface MatchedToolDefinition extends AgentToolDefinition {
  readonly semanticScore: number;
}

const TOOL_ENTITY_GROUP_OVERRIDES: Readonly<Record<string, AgentToolEntityGroup>> = {
  // Team-scoped writes
  write_team_stats: 'team_tools',
  write_team_post: 'team_tools',
  update_team_post: 'team_tools',
  delete_team_post: 'team_tools',
  write_team_news: 'team_tools',
  write_roster_entries: 'team_tools',
  write_playbooks: 'team_tools',
  get_playbook: 'team_tools',
  list_playbooks: 'team_tools',
  update_playbook: 'team_tools',
  delete_playbook: 'team_tools',
  create_universal_team_document: 'user_tools',
  list_universal_team_documents: 'user_tools',
  get_universal_team_document: 'user_tools',
  update_universal_team_document: 'user_tools',
  delete_universal_team_document: 'user_tools',
  list_team_file_folders: 'user_tools',
  create_team_file_folder: 'user_tools',
  update_team_file_folder: 'user_tools',
  delete_team_file_folder: 'user_tools',
  move_universal_file_to_folder: 'user_tools',
  list_film_reviews: 'team_tools',
  list_film_review_sources: 'team_tools',
  get_film_review_source_breakdown: 'team_tools',
  update_film_review_source_breakdown: 'team_tools',
  delete_film_review_source_breakdown: 'team_tools',
  get_film_review: 'team_tools',
  save_film_review: 'team_tools',
  update_film_review: 'team_tools',
  delete_film_review: 'team_tools',
  add_film_review_source: 'team_tools',
  update_film_review_source: 'team_tools',
  delete_film_review_source: 'team_tools',
  extract_film_review_clips: 'team_tools',
  add_film_review_annotation: 'team_tools',
  delete_film_review_annotation: 'team_tools',
  refresh_film_review_ai: 'team_tools',
  write_schedule: 'user_tools',
  write_calendar_events: 'user_tools',

  // User/athlete scoped writes
  write_core_identity: 'user_tools',
  update_core_identity: 'user_tools',
  delete_core_identity: 'user_tools',
  write_awards: 'user_tools',
  write_combine_metrics: 'user_tools',
  write_rankings: 'user_tools',
  write_season_stats: 'user_tools',
  write_recruiting_activity: 'user_tools',
  write_athlete_videos: 'user_tools',
  update_athlete_videos: 'user_tools',
  delete_athlete_videos: 'user_tools',
  write_timeline_post: 'user_tools',
  update_timeline_post: 'user_tools',
  delete_timeline_post: 'user_tools',
  write_intel: 'user_tools',
  update_intel: 'user_tools',

  // Organization-scoped writes
  write_connected_source: 'organization_tools',
  update_connected_source: 'organization_tools',
  delete_connected_source: 'organization_tools',

  // Cross-cutting infrastructure
  delegate_task: 'system_tools',
  ask_user: 'system_tools',
  mutate_nxt1_data: 'platform_tools',
};

interface LegacyToolSchemaChecklistItem {
  readonly toolName: string;
  readonly migrationStatus: 'pending';
  readonly schemaType: 'raw_json_schema';
  readonly action: string;
}

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();
  private readonly legacySchemaWarnings = new Set<string>();

  private hasZodParameters(tool: BaseTool): boolean {
    return tool.parameters instanceof z.ZodType;
  }

  private buildLegacyToolSchemaChecklist(
    candidateTool?: BaseTool
  ): readonly LegacyToolSchemaChecklistItem[] {
    const pendingTools = new Map<string, BaseTool>();

    for (const registeredTool of this.tools.values()) {
      if (!this.hasZodParameters(registeredTool)) {
        pendingTools.set(registeredTool.name, registeredTool);
      }
    }

    if (candidateTool && !this.hasZodParameters(candidateTool)) {
      pendingTools.set(candidateTool.name, candidateTool);
    }

    return [...pendingTools.values()].map((tool) => ({
      toolName: tool.name,
      migrationStatus: 'pending',
      schemaType: 'raw_json_schema',
      action:
        'Replace parameters with a z.object(...) schema and rely on z.toJSONSchema conversion.',
    }));
  }

  private formatLegacyToolChecklist(checklist: readonly LegacyToolSchemaChecklistItem[]): string {
    if (checklist.length === 0) {
      return 'No pending legacy schema tools.';
    }

    return checklist
      .map((item, index) => `${index + 1}. ${item.toolName} -> ${item.action}`)
      .join('\n');
  }

  getLegacyToolSchemaChecklist(): readonly LegacyToolSchemaChecklistItem[] {
    return this.buildLegacyToolSchemaChecklist();
  }

  private toStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const clone = { ...schema } as Record<string, unknown>;

    const schemaType = clone['type'];
    const properties = clone['properties'];
    const items = clone['items'];

    if (schemaType === 'object') {
      if (!Object.prototype.hasOwnProperty.call(clone, 'additionalProperties')) {
        clone['additionalProperties'] = false;
      }

      if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
        const strictProperties: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
          strictProperties[key] =
            value && typeof value === 'object' && !Array.isArray(value)
              ? this.toStrictJsonSchema(value as Record<string, unknown>)
              : value;
        }
        clone['properties'] = strictProperties;
      }
    }

    if (items && typeof items === 'object' && !Array.isArray(items)) {
      clone['items'] = this.toStrictJsonSchema(items as Record<string, unknown>);
    }

    for (const combinator of ['allOf', 'anyOf', 'oneOf'] as const) {
      const section = clone[combinator];
      if (Array.isArray(section)) {
        clone[combinator] = section.map((item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? this.toStrictJsonSchema(item as Record<string, unknown>)
            : item
        );
      }
    }

    return clone;
  }

  private resolveParameters(tool: BaseTool): Record<string, unknown> {
    if (tool.parameters instanceof z.ZodType) {
      const jsonSchema = z.toJSONSchema(tool.parameters) as Record<string, unknown>;
      return this.toStrictJsonSchema(jsonSchema);
    }

    const strictZod = isStrictZodToolSchemasEnabled();
    if (strictZod) {
      const checklist = this.buildLegacyToolSchemaChecklist(tool);
      throw new AgentEngineError(
        'TOOL_SCHEMA_NOT_ZOD',
        `Strict Zod tool schema mode blocked "${tool.name}". Migration checklist:\n` +
          this.formatLegacyToolChecklist(checklist),
        {
          metadata: {
            toolName: tool.name,
            strictMode: true,
            checklist,
          },
        }
      );
    }

    if (!this.legacySchemaWarnings.has(tool.name)) {
      this.legacySchemaWarnings.add(tool.name);
      logger.warn('[ToolRegistry] Legacy raw JSON schema detected for tool parameters', {
        toolName: tool.name,
        migrationChecklist: this.buildLegacyToolSchemaChecklist(tool),
      });
    }

    return this.toStrictJsonSchema(tool.parameters as Record<string, unknown>);
  }

  private resolveEntityGroup(tool: BaseTool): AgentToolEntityGroup {
    const explicitEntityGroup = (tool as BaseTool & { readonly entityGroup?: AgentToolEntityGroup })
      .entityGroup;
    if (explicitEntityGroup) return explicitEntityGroup;

    const override = TOOL_ENTITY_GROUP_OVERRIDES[tool.name];
    if (override) return override;

    switch (tool.category) {
      case 'system':
        return 'system_tools';
      case 'media':
      case 'communication':
        return 'user_tools';
      default:
        return 'platform_tools';
    }
  }

  private isAllowedForAgent(tool: BaseTool, agentId?: AgentIdentifier): boolean {
    if (!agentId) return true;
    return tool.allowedAgents.includes('*') || tool.allowedAgents.includes(agentId);
  }

  private isAllowedForAccessContext(
    tool: BaseTool,
    accessContext?: AgentToolAccessContext
  ): boolean {
    if (!accessContext) return true;

    if (
      accessContext.blockedToolNames?.length &&
      accessContext.blockedToolNames.map(canonicalToolName).includes(canonicalToolName(tool.name))
    ) {
      return false;
    }

    const entityGroup = this.resolveEntityGroup(tool);
    if (entityGroup === 'system_tools') return true;

    if (!accessContext.allowedEntityGroups.includes(entityGroup)) {
      return false;
    }

    if (isStrictEntityToolGovernanceEnabled()) {
      if (entityGroup === 'team_tools' && !accessContext.teamId) return false;
      if (entityGroup === 'organization_tools' && !accessContext.organizationId) return false;
    }

    return true;
  }

  /**
   * Minimum cosine similarity score required for a tool to be selected.
   * Tune this up to make tool loading stricter, down to make it looser.
   */
  static readonly DEFAULT_TOOL_THRESHOLD = 0.35;

  /** Register a tool instance. Throws if a tool with the same name already exists. */
  register(tool: BaseTool): void {
    const canonicalName = canonicalToolName(tool.name);
    if (this.tools.has(canonicalName)) {
      throw new AgentEngineError(
        'TOOL_REGISTRY_DUPLICATE',
        `Tool "${canonicalName}" is already registered.`,
        { metadata: { toolName: canonicalName } }
      );
    }

    if (!(tool.parameters instanceof z.ZodType)) {
      const checklist = this.buildLegacyToolSchemaChecklist(tool);
      const message =
        `Tool "${tool.name}" uses non-Zod parameters. Migration checklist:\n` +
        this.formatLegacyToolChecklist(checklist);
      if (isStrictZodToolSchemasEnabled()) {
        throw new AgentEngineError('TOOL_SCHEMA_NOT_ZOD', message, {
          metadata: {
            toolName: tool.name,
            strictMode: true,
            checklist,
          },
        });
      }
      logger.warn('[ToolRegistry] Non-Zod tool parameters allowed in soft mode', {
        toolName: tool.name,
        migrationChecklist: checklist,
      });
    }

    const explicitEntityGroup = (tool as BaseTool & { readonly entityGroup?: AgentToolEntityGroup })
      .entityGroup;
    if (!explicitEntityGroup) {
      const derivedEntityGroup = this.resolveEntityGroup(tool);
      if (isStrictEntityToolGovernanceEnabled()) {
        throw new AgentEngineError(
          'TOOL_ENTITY_GROUP_MISSING',
          `Tool "${tool.name}" must declare an explicit entityGroup in strict governance mode.`,
          {
            metadata: { toolName: tool.name, derivedEntityGroup },
          }
        );
      }

      logger.warn('[ToolRegistry] Tool missing explicit entityGroup metadata', {
        toolName: tool.name,
        derivedEntityGroup,
      });
    }

    this.tools.set(canonicalName, tool);
  }

  /** Get a tool by name. */
  get(name: string): BaseTool | undefined {
    return this.tools.get(canonicalToolName(name));
  }

  /** Return all registered tool names. */
  listNames(): readonly string[] {
    return [...this.tools.keys()];
  }

  /**
   * Convert all tools (or a filtered subset) into the AgentToolDefinition
   * format that can be sent to OpenRouter as function-calling schemas.
   */
  getDefinitions(
    agentId?: AgentIdentifier,
    accessContext?: AgentToolAccessContext
  ): readonly AgentToolDefinition[] {
    const definitions: AgentToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      const allowed =
        this.isAllowedForAgent(tool, agentId) &&
        this.isAllowedForAccessContext(tool, accessContext);

      if (allowed && !isToolDisabled(tool.name)) {
        definitions.push({
          name: tool.name,
          description: tool.description,
          parameters: this.resolveParameters(tool),
          allowedAgents: tool.allowedAgents,
          isMutation: tool.isMutation,
          category: tool.category,
          entityGroup: this.resolveEntityGroup(tool),
        });
      }
    }

    return definitions;
  }

  /**
   * Evaluate which tools match the current user intent based on semantic similarity.
   * This prevents injecting irrelevant tools into the LLM context.
   */
  async match(
    intentVector: readonly number[],
    embedFn: (text: string) => Promise<readonly number[]>,
    agentId?: AgentIdentifier,
    accessContext?: AgentToolAccessContext,
    threshold: number = ToolRegistry.DEFAULT_TOOL_THRESHOLD
  ): Promise<readonly AgentToolDefinition[]> {
    const matched = await this.matchWithScores(
      intentVector,
      embedFn,
      agentId,
      accessContext,
      threshold
    );

    return matched.map(({ semanticScore: _semanticScore, ...definition }) => definition);
  }

  async matchWithScores(
    intentVector: readonly number[],
    embedFn: (text: string) => Promise<readonly number[]>,
    agentId?: AgentIdentifier,
    accessContext?: AgentToolAccessContext,
    threshold: number = ToolRegistry.DEFAULT_TOOL_THRESHOLD
  ): Promise<readonly MatchedToolDefinition[]> {
    // Filter first by permissions
    const allowedTools = Array.from(this.tools.values()).filter(
      (tool) =>
        this.isAllowedForAgent(tool, agentId) &&
        this.isAllowedForAccessContext(tool, accessContext) &&
        !isToolDisabled(tool.name)
    );

    // Compute cosine similarity for all allowed tools
    type ScoredTool = { tool: BaseTool; score: number };
    const scoredTools: ScoredTool[] = [];

    // Parallel embedding cache check & matching
    await Promise.all(
      allowedTools.map(async (tool) => {
        try {
          const score = await tool.matchIntent(intentVector, embedFn);
          if (score >= threshold) {
            scoredTools.push({ tool, score });
          }
        } catch (err) {
          // Log issue, but don't blow up the entire RAG pipeline.
          logger.warn('[ToolRegistry] Failed to match intent for tool', {
            toolName: tool.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
    );

    // Sort descending by relevance
    scoredTools.sort((a, b) => b.score - a.score);

    return scoredTools.map(({ tool, score }) => ({
      name: tool.name,
      description: tool.description,
      parameters: this.resolveParameters(tool),
      allowedAgents: tool.allowedAgents,
      isMutation: tool.isMutation,
      category: tool.category,
      entityGroup: this.resolveEntityGroup(tool),
      semanticScore: score,
    }));
  }

  /** Execute a tool by name with the given input and optional execution context. */
  async execute(
    name: string,
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    // Bail immediately if the operation was cancelled before tool execution starts
    if (context?.signal?.aborted) {
      return { success: false, error: 'Operation cancelled' };
    }

    const normalizedName = canonicalToolName(name);
    const tool = this.tools.get(normalizedName);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${normalizedName}` };
    }

    if (
      context?.allowedToolNames?.length &&
      !NARROWED_ALLOWLIST_BYPASS_TOOLS.has(normalizedName) &&
      !context.allowedToolNames.map(canonicalToolName).includes(normalizedName)
    ) {
      return {
        success: false,
        error: `Tool is not allowed in this execution context: ${normalizedName}`,
      };
    }

    if (context?.allowedEntityGroups?.length) {
      const toolEntityGroup = this.resolveEntityGroup(tool);
      if (
        toolEntityGroup !== 'system_tools' &&
        !context.allowedEntityGroups.includes(toolEntityGroup)
      ) {
        return {
          success: false,
          error: `Tool entity group is not allowed in this execution context: ${toolEntityGroup}`,
        };
      }
    }

    if (isToolDisabled(normalizedName)) {
      return { success: false, error: `Tool is currently disabled: ${normalizedName}` };
    }
    let result: ToolResult;
    try {
      result = normalizeToolResultForDisplay(
        await runWithFirestoreEnvironment(context?.environment, () => tool.execute(input, context))
      );
    } catch (error) {
      await this.postToolFailureAlert(normalizedName, error, context);
      throw error;
    }

    if (!result.success) {
      await this.postToolFailureAlert(
        normalizedName,
        result.error ?? 'Tool returned an unsuccessful result.',
        context
      );
    }

    if (result.success && tool.isMutation) {
      await getAgentMutationPolicyService()
        .apply({
          toolName: normalizedName,
          input,
          context,
        })
        .catch((error: unknown) => {
          logger.warn('[ToolRegistry] Post-mutation policy pipeline failed', {
            toolName: name,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    if (result.success && tool.isMutation && !INTEL_SYNC_DISABLED_TOOLS.has(normalizedName)) {
      await this.syncIntelAfterWrite(normalizedName, input, context).catch((error: unknown) => {
        logger.warn('[ToolRegistry] Post-write Intel sync failed', {
          toolName: name,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return result;
  }

  private async postToolFailureAlert(
    toolName: string,
    error: unknown,
    context?: ToolExecutionContext
  ): Promise<void> {
    if (isControlFlowToolSignal(error)) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const alertDecision = recordScopedToolFailure(toolName, errorMessage, context);

    if (!alertDecision.shouldAlert) {
      logger.info('[ToolRegistry] Suppressed non-repeated tool failure alert', {
        toolName,
        error: errorMessage,
        operationId: context?.operationId,
        threadId: context?.threadId,
        repeatCount: alertDecision.repeatCount,
        scope: alertDecision.scope ?? 'unscoped',
      });
      return;
    }

    try {
      await sendSlackAlert({
        target: 'agent',
        environment: context?.environment,
        severity: 'critical',
        title: 'Agent Tool Execution Failed',
        summary: 'An Agent X tool execution returned a failure result or threw an exception.',
        fields: [
          { label: 'Tool', value: toolName },
          { label: 'Error', value: errorMessage },
          ...(alertDecision.repeatCount > 1
            ? [{ label: 'Repeat Count', value: String(alertDecision.repeatCount) }]
            : []),
          ...(alertDecision.scope ? [{ label: 'Alert Scope', value: alertDecision.scope }] : []),
          ...(context?.operationId ? [{ label: 'Operation ID', value: context.operationId }] : []),
          ...(context?.threadId ? [{ label: 'Thread ID', value: context.threadId }] : []),
          ...(context?.userId ? [{ label: 'User ID', value: context.userId }] : []),
        ],
      });
    } catch (alertError) {
      logger.warn('[ToolRegistry] Failed to send Slack alert for tool failure', {
        toolName,
        error: errorMessage,
        alertError: alertError instanceof Error ? alertError.message : String(alertError),
      });
    }
  }

  private async syncIntelAfterWrite(
    toolName: string,
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<void> {
    const plans = await this.deriveIntelSyncPlans(toolName, input);
    if (plans.length === 0) return;

    const writeIntelTool = this.tools.get('write_intel');
    const updateIntelTool = this.tools.get('update_intel');

    if (!writeIntelTool || !updateIntelTool) {
      logger.warn('[ToolRegistry] Intel sync skipped because Intel tools are not registered', {
        toolName,
      });
      return;
    }

    for (const plan of plans) {
      const uniqueSections = [...new Set(plan.sectionIds)];
      let generatedFullReport = false;

      for (const sectionId of uniqueSections) {
        const updateResult = await updateIntelTool.execute(
          {
            entityType: plan.entityType,
            entityId: plan.entityId,
            sectionId,
          },
          context
        );

        if (updateResult.success) continue;

        const errorMessage = updateResult.error ?? 'Unknown Intel update failure';
        const missingReport = /No existing (team )?Intel report found/i.test(errorMessage);

        if (!missingReport) {
          throw new AgentEngineError('TOOL_INTEL_SYNC_FAILED', errorMessage, {
            metadata: {
              toolName,
              entityType: plan.entityType,
              entityId: plan.entityId,
              sectionId,
            },
          });
        }

        context?.emitStage?.('persisting_result', {
          source: 'tool_registry',
          phase: 'generate_intel_from_updates',
          entityType: plan.entityType,
          entityId: plan.entityId,
          icon: 'database',
        });

        const writeResult = await writeIntelTool.execute(
          {
            entityType: plan.entityType,
            entityId: plan.entityId,
          },
          context
        );

        if (!writeResult.success) {
          throw new AgentEngineError(
            'TOOL_INTEL_SYNC_FAILED',
            writeResult.error ?? 'Failed to generate Intel report',
            {
              metadata: {
                toolName,
                entityType: plan.entityType,
                entityId: plan.entityId,
              },
            }
          );
        }

        logger.info('[ToolRegistry] Generated Intel after write', {
          toolName,
          entityType: plan.entityType,
          entityId: plan.entityId,
        });
        generatedFullReport = true;
        break;
      }

      if (!generatedFullReport && uniqueSections.length > 0) {
        logger.info('[ToolRegistry] Updated Intel after write', {
          toolName,
          entityType: plan.entityType,
          entityId: plan.entityId,
          sections: uniqueSections,
        });
      }
    }
  }

  private async deriveIntelSyncPlans(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<readonly IntelSyncPlan[]> {
    const userId = this.readString(input, 'userId');
    const teamId = this.readString(input, 'teamId');
    const plans: IntelSyncPlan[] = [];

    switch (toolName) {
      case 'write_core_identity':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: [
              'agent_x_brief',
              'athletic_measurements',
              'academic_profile',
              'awards_honors',
            ],
          });
        }
        if (teamId) {
          plans.push({
            entityType: 'team',
            entityId: teamId,
            sectionIds: ['agent_overview', 'team'],
          });
        }
        break;
      case 'write_connected_source':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['agent_x_brief'],
          });
        }
        if (teamId) {
          plans.push({
            entityType: 'team',
            entityId: teamId,
            sectionIds: ['agent_overview', 'team'],
          });
        }
        break;
      case 'write_combine_metrics':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['athletic_measurements'],
          });
        }
        break;
      case 'write_rankings':
      case 'write_awards':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['awards_honors'],
          });
        }
        break;
      case 'write_season_stats':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['season_stats'],
          });
        }
        break;
      case 'write_recruiting_activity':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['recruiting_activity'],
          });
        }
        if (teamId) {
          plans.push({
            entityType: 'team',
            entityId: teamId,
            sectionIds: ['recruiting'],
          });
        }
        break;
      case 'write_calendar_events':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['agent_x_brief'],
          });
        }
        break;
      case 'write_schedule':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['agent_x_brief'],
          });
        }
        if (teamId) {
          plans.push({
            entityType: 'team',
            entityId: teamId,
            sectionIds: ['schedule'],
          });
        }
        break;
      case 'write_athlete_videos':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['agent_x_brief'],
          });
        }
        break;
      case 'write_timeline_post':
        if (userId) {
          plans.push({
            entityType: 'athlete',
            entityId: userId,
            sectionIds: ['agent_x_brief'],
          });
        }
        if (teamId) {
          plans.push({
            entityType: 'team',
            entityId: teamId,
            sectionIds: ['agent_overview'],
          });
        }
        break;
      case 'write_roster_entries':
        if (teamId) {
          plans.push({
            entityType: 'team',
            entityId: teamId,
            sectionIds: ['team'],
          });
        }
        break;
      case 'write_team_stats':
        if (teamId) {
          plans.push({
            entityType: 'team',
            entityId: teamId,
            sectionIds: ['stats'],
          });
        }
        break;
      case 'write_team_post':
      case 'write_team_news':
        if (teamId) {
          plans.push({
            entityType: 'team',
            entityId: teamId,
            sectionIds: ['agent_overview'],
          });
        }
        break;
      default:
        break;
    }

    const teamIntelEnabled =
      await getFeatureFlagsService(getFirestore()).isEnabled('team.intel.enabled');

    if (teamIntelEnabled) {
      return plans;
    }

    return plans.filter((plan) => plan.entityType !== 'team');
  }

  private readString(input: Record<string, unknown>, key: string): string | null {
    const value = input[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}
