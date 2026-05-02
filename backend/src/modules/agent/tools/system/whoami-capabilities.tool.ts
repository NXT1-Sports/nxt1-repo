/**
 * @fileoverview Whoami Capabilities Tool — Self-Knowledge On Demand
 * @module @nxt1/backend/modules/agent/tools/system
 *
 * Lets the Primary Agent answer deep "what can you do?" / "what tools do you
 * have?" questions by returning the FULL detailed capability manifest. The
 * compact version is already in the Primary's system prompt every turn, so
 * call this tool only when the user asks for an exhaustive, structured list.
 */

import { z } from 'zod';
import type { AgentToolCategory } from '@nxt1/core';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { CapabilityRegistry } from '../../capabilities/capability-registry.js';

const InputSchema = z.object({
  detail: z.enum(['compact', 'detailed']).optional(),
});

export class WhoamiCapabilitiesTool extends BaseTool {
  readonly name = 'whoami_capabilities';

  readonly description =
    'Return the live manifest of every coordinator, tool, and skill currently ' +
    'available on this platform. Use this only when the user explicitly asks ' +
    'for a comprehensive list of your capabilities — your system prompt ' +
    'already contains a compact summary on every turn.';

  readonly parameters = InputSchema;
  readonly isMutation = false;
  readonly category: AgentToolCategory = 'system';
  readonly entityGroup = 'system_tools' as const;

  override readonly allowedAgents = ['router'] as const;

  constructor(private readonly capabilities: CapabilityRegistry) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const detail = parsed.data.detail ?? 'detailed';
    const card = this.capabilities.current();

    return {
      success: true,
      data: {
        versionHash: card.versionHash,
        builtAtMs: card.builtAtMs,
        coordinatorCount: card.detailed.coordinators.length,
        toolCount: card.detailed.tools.length,
        skillCount: card.detailed.skills.length,
      },
      markdown:
        detail === 'compact' ? card.rendered.compactMarkdown : card.rendered.detailedMarkdown,
    };
  }
}
