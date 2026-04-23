/**
 * @fileoverview Get Apify Actor Details Tool — Agent X Tool
 * @module @nxt1/backend/modules/agent/tools/integrations
 *
 * Fetches detailed information about a specific Apify actor, including
 * its description, input schema, pricing, and usage stats.
 *
 * The LLM uses this to understand an actor's exact input parameters
 * before calling it via `call_apify_actor`. This prevents wasted compute
 * from malformed inputs and gives the LLM an accurate picture of costs.
 *
 * This is a read-only, zero-cost operation.
 */

import { BaseTool, type ToolResult, type ToolExecutionContext } from '../../base.tool.js';
import type { ApifyMcpBridgeService } from './apify-mcp-bridge.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

/** Max length for actor ID to prevent abuse. */
const MAX_ACTOR_ID_LENGTH = 200;

const GetApifyActorDetailsInputSchema = z.object({
  actorId: z.string().trim().min(1).max(MAX_ACTOR_ID_LENGTH),
});

export class GetApifyActorDetailsTool extends BaseTool {
  readonly name = 'get_apify_actor_details';
  readonly description =
    'Get detailed information about a specific Apify actor, including its full description, ' +
    'input schema (exact parameters it accepts), pricing, and recent usage stats. ' +
    'Use this BEFORE calling call_apify_actor to understand what inputs the actor expects. ' +
    'Pass the actorId from search_apify_actors results. ' +
    'This is a free operation — no compute costs.';

  readonly parameters = GetApifyActorDetailsInputSchema;

  override readonly allowedAgents = [
    'data_coordinator',
    'recruiting_coordinator',
    'brand_coordinator',
    'strategy_coordinator',
  ] as const;

  readonly isMutation = false;
  readonly category = 'analytics' as const;

  readonly entityGroup = 'platform_tools' as const;
  private readonly bridge: ApifyMcpBridgeService;

  constructor(bridge: ApifyMcpBridgeService) {
    super();
    this.bridge = bridge;
  }

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetApifyActorDetailsInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { actorId } = parsed.data;

    try {
      logger.info('[GetApifyActorDetails] Fetching details', { actorId });
      const details = await this.bridge.getActorDetails(actorId);

      return {
        success: true,
        data: details,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch actor details';
      logger.error('[GetApifyActorDetails] Failed', { actorId, error: message });
      return { success: false, error: message };
    }
  }
}
