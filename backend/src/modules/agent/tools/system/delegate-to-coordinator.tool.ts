/**
 * @fileoverview Delegate-to-Coordinator Tool — Primary → Specialist Bridge
 * @module @nxt1/backend/modules/agent/tools/system
 *
 * Used exclusively by the Primary Agent (`router`) to hand a sub-task to
 * one of the specialist coordinators (recruiting, brand, admin, data,
 * performance, strategy). Throws a {@link DelegateToCoordinatorException}
 * which the Primary's tool-execution wrapper intercepts to dispatch the
 * coordinator and feed its output back as the tool observation.
 *
 * Distinct from `delegate_task` — that tool is the universal "out of my
 * domain" escape hatch used by coordinators to re-plan via the Planner.
 * `delegate_to_coordinator` targets a specific specialist directly with
 * no re-planning round-trip.
 */

import { z } from 'zod';
import type { AgentToolCategory } from '@nxt1/core';
import { COORDINATOR_AGENT_IDS } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { DelegateToCoordinatorException } from '../../exceptions/delegate-to-coordinator.exception.js';

const InputSchema = z.object({
  coordinator: z.enum(COORDINATOR_AGENT_IDS as readonly [string, ...string[]]),
  goal: z.string().trim().min(1).max(2_000),
  /**
   * Optional structured key/value pairs forwarded verbatim to the coordinator.
   * Use this to pass IDs, codes, and references that must not be paraphrased
   * by the LLM (e.g. postId, teamCode, userId, itemCount).
   */
  structured_payload: z.record(z.string(), z.unknown()).optional(),
});

export class DelegateToCoordinatorTool extends BaseTool {
  readonly name = 'delegate_to_coordinator';

  readonly description =
    'Hand a focused sub-task to a specialist coordinator. ' +
    'Coordinator routing guide — always pick the correct specialist:\n' +
    '• data_coordinator — ANY write/save operation: create posts (team posts, timeline announcements, season recaps), write season stats, rankings, metrics, roster entries, schedule, recruiting activity, calendar events, connected sources, or ingest data from external URLs (MaxPreps, Hudl, 247Sports, etc.).\n' +
    '• brand_coordinator — Creative assets: generate graphics, images, thumbnails, video editing, Runway AI video, captions, watermarks, staged media.\n' +
    '• performance_coordinator — Film/video analysis, game breakdowns, performance metric interpretation, highlight clip generation.\n' +
    '• recruiting_coordinator — College search strategy, coach outreach emails, recruiting presentations, visit coordination, offer tracking.\n' +
    '• strategy_coordinator — Scheduling strategy, analytics dashboards, long-term planning, multi-game review, Microsoft 365 workflows.\n' +
    '• admin_coordinator — Compliance, platform administration, support tickets, user management, recurring task scheduling.\n' +
    'Do NOT delegate simple factual lookups the router can answer directly. For work spanning multiple coordinators in sequence, use `create_plan` so the user can review the plan before execution begins. `plan_and_execute` remains a legacy alias only.\n' +
    'IMPORTANT: When you have exact IDs, codes, or references the coordinator needs (e.g. postId, teamCode, userId), always include them in `structured_payload` — never rely on prose to carry them.';

  readonly parameters = InputSchema;
  readonly isMutation = false;
  readonly category: AgentToolCategory = 'system';
  readonly entityGroup = 'system_tools' as const;

  /** Restricted to the Primary Agent (id=`router`). */
  override readonly allowedAgents = ['router'] as const;

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    throw new DelegateToCoordinatorException({
      coordinatorId: parsed.data.coordinator as Exclude<
        import('@nxt1/core').AgentIdentifier,
        'router'
      >,
      goal: parsed.data.goal,
      ...(parsed.data.structured_payload ? { structuredPayload: parsed.data.structured_payload } : {}),
    });
  }
}
