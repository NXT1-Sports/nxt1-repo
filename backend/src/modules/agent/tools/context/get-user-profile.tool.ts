/**
 * @fileoverview Get User Profile Tool — Lazy User Context
 * @module @nxt1/backend/modules/agent/tools/context
 *
 * On-demand fetch of the hydrated user context (role, sport, team,
 * organization, goals, current playbook summary, etc.). The Primary Agent
 * is allowed to call this only when it actually needs a profile field —
 * we never pre-load user context into every prompt.
 */

import { z } from 'zod';
import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import type { ContextBuilder } from '../../memory/context-builder.js';

const InputSchema = z.object({
  userId: z.string().trim().min(1).optional(),
});

export class GetUserProfileTool extends BaseTool {
  readonly name = 'get_user_profile';
  readonly description =
    'Fetch the current user’s hydrated profile — role, sport, team, organization, ' +
    'active goals, and current playbook summary. Use this only when you actually ' +
    'need profile data to answer or act; otherwise rely on the conversation context.';

  readonly parameters = InputSchema;
  readonly isMutation = false;
  readonly category = 'analytics' as const;
  readonly entityGroup = 'platform_tools' as const;

  override readonly allowedAgents = ['*'] as const;

  constructor(private readonly contextBuilder: ContextBuilder) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = parsed.data.userId ?? context?.userId;
    if (!userId) {
      return { success: false, error: 'userId is required (none in input or execution context)' };
    }

    const profile = await this.contextBuilder.buildContext(userId);

    const lines: string[] = ['## User Profile'];
    lines.push(`- userId: \`${profile.userId}\``);
    lines.push(`- role: ${profile.role}`);
    if (profile.displayName) lines.push(`- displayName: ${profile.displayName}`);
    if (profile.sport) lines.push(`- sport: ${profile.sport}`);
    if (profile.position) lines.push(`- position: ${profile.position}`);
    if (profile.teamId) lines.push(`- teamId: \`${profile.teamId}\``);
    if (profile.organizationId) lines.push(`- organizationId: \`${profile.organizationId}\``);
    if (profile.activeGoals && profile.activeGoals.length > 0) {
      lines.push(`- activeGoals: ${profile.activeGoals.length}`);
    }
    if (profile.currentPlaybookSummary) {
      const p = profile.currentPlaybookSummary;
      lines.push(`- playbook: ${p.completed}/${p.total} complete (${p.snoozed} snoozed)`);
    }

    return {
      success: true,
      data: profile,
      markdown: lines.join('\n'),
    };
  }
}
