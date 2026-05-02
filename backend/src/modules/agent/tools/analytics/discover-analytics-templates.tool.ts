/**
 * @fileoverview Discover Analytics Templates Tool
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Allows agents to search for existing custom analytics templates before
 * creating new ones, preventing duplicate category creation.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { getAnalyticsTemplateRegistry } from '../../services/analytics/analytics-template-registry.service.js';
import type { DiscoverAnalyticsTemplatesQuery } from '@nxt1/core/models';
import { z } from 'zod';

const DiscoverAnalyticsTemplatesInputSchema = z.object({
  baseDomain: z
    .enum(['recruiting', 'nil', 'performance', 'engagement', 'communication'])
    .optional(),
  keyword: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['active', 'deprecated', 'pending_review']).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export class DiscoverAnalyticsTemplatesTask extends BaseTool {
  readonly name = 'discover_analytics_templates';
  readonly description =
    'Search for existing custom analytics templates by domain or keyword. Use this before registering a new template to avoid creating duplicates. Returns existing templates ranked by relevance and usage.';

  readonly parameters = DiscoverAnalyticsTemplatesInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;

  async execute(
    input: Record<string, unknown>,
    _context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DiscoverAnalyticsTemplatesInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      };
    }

    const { baseDomain, keyword, status, limit } = parsed.data;
    const registry = getAnalyticsTemplateRegistry();

    const query: DiscoverAnalyticsTemplatesQuery = {
      baseDomain,
      keyword,
      status: status ?? 'active',
      limit: limit ?? 20,
    };

    const results = await registry.discover(query);

    return {
      success: true,
      data: {
        count: results.length,
        templates: results,
        message:
          results.length === 0
            ? `No templates found matching your query. You can register a new template using register_analytics_template.`
            : `Found ${results.length} template(s). Consider reusing one of these instead of creating a duplicate.`,
      },
    };
  }
}
