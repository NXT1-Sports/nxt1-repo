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

import type { AgentIdentifier, AgentToolDefinition } from '@nxt1/core';
import type { IntelGenerationService } from '../services/intel.service.js';
import { logger } from '../../../utils/logger.js';
import type { BaseTool, ToolResult, ToolExecutionContext } from './base.tool.js';

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

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();

  /**
   * Minimum cosine similarity score required for a tool to be selected.
   * Tune this up to make tool loading stricter, down to make it looser.
   */
  static readonly DEFAULT_TOOL_THRESHOLD = 0.35;

  /** Register a tool instance. Throws if a tool with the same name already exists. */
  register(tool: BaseTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name. */
  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /** Return all registered tool names. */
  listNames(): readonly string[] {
    return [...this.tools.keys()];
  }

  /**
   * Convert all tools (or a filtered subset) into the AgentToolDefinition
   * format that can be sent to OpenRouter as function-calling schemas.
   */
  getDefinitions(agentId?: AgentIdentifier): readonly AgentToolDefinition[] {
    const definitions: AgentToolDefinition[] = [];

    for (const tool of this.tools.values()) {
      const allowed =
        !agentId || tool.allowedAgents.includes('*') || tool.allowedAgents.includes(agentId);

      if (allowed) {
        definitions.push({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          allowedAgents: tool.allowedAgents,
          isMutation: tool.isMutation,
          category: tool.category,
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
    threshold: number = ToolRegistry.DEFAULT_TOOL_THRESHOLD
  ): Promise<readonly AgentToolDefinition[]> {
    // Filter first by permissions
    const allowedTools = Array.from(this.tools.values()).filter(
      (tool) => !agentId || tool.allowedAgents.includes('*') || tool.allowedAgents.includes(agentId)
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
          // Log issue, but don't blow up the entire RAG pipeline
          // You can use proper logger if you inject it into ToolRegistry
          console.warn(`[ToolRegistry] Failed to match intent for tool \${tool.name}`, err);
        }
      })
    );

    // Sort descending by relevance
    scoredTools.sort((a, b) => b.score - a.score);

    return scoredTools.map(({ tool }) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      allowedAgents: tool.allowedAgents,
      isMutation: tool.isMutation,
      category: tool.category,
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

    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    const result = await tool.execute(input, context);

    if (result.success && tool.isMutation && !INTEL_SYNC_DISABLED_TOOLS.has(name)) {
      await this.syncIntelAfterWrite(name, input, context).catch((error: unknown) => {
        logger.warn('[ToolRegistry] Post-write Intel sync failed', {
          toolName: name,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    return result;
  }

  private async syncIntelAfterWrite(
    toolName: string,
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<void> {
    const plans = this.deriveIntelSyncPlans(toolName, input);
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
          throw new Error(errorMessage);
        }

        context?.onProgress?.(
          plan.entityType === 'athlete'
            ? 'Generating Intel from the latest profile updates…'
            : 'Generating Intel from the latest team updates…'
        );

        const writeResult = await writeIntelTool.execute(
          {
            entityType: plan.entityType,
            entityId: plan.entityId,
          },
          context
        );

        if (!writeResult.success) {
          throw new Error(writeResult.error ?? 'Failed to generate Intel report');
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

  private deriveIntelSyncPlans(
    toolName: string,
    input: Record<string, unknown>
  ): readonly IntelSyncPlan[] {
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

    return plans;
  }

  private readString(input: Record<string, unknown>, key: string): string | null {
    const value = input[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }
}
