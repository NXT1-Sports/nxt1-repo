/**
 * @fileoverview Register Analytics Template Tool
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Allows agents to register new custom analytics templates in the shared registry.
 * Enforces deduplication via unique templateKey constraint and provides
 * race-safe concurrent creation semantics.
 */

import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { getAnalyticsTemplateRegistry } from '../../services/analytics/analytics-template-registry.service.js';
import type { RegisterAnalyticsTemplateRequest } from '@nxt1/core/models';
import { z } from 'zod';

const RegisterAnalyticsTemplateInputSchema = z.object({
  templateKey: z.string().trim().min(1).max(50),
  displayName: z.string().trim().min(1).max(100),
  description: z.string().trim().min(10).max(500),
  baseDomain: z.enum(['recruiting', 'nil', 'performance', 'engagement', 'communication']),
  canonicalEventType: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().min(1).max(50)).optional(),
  requiredPayloadFields: z.array(z.string().trim().min(1).max(50)).optional(),
  suggestedTags: z.array(z.string().trim().min(1).max(50)).optional(),
  payloadSchemaVersion: z.string().trim().default('1.0.0'),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class RegisterAnalyticsTemplateTask extends BaseTool {
  readonly name = 'register_analytics_template';
  readonly description =
    'Register a new custom analytics template in the shared registry. Prevents duplicate templates through normalized key uniqueness. Use after discovering templates to confirm no suitable existing template is available. If a concurrent request registers the same normalized key, returns the existing template instead of failing.';

  readonly parameters = RegisterAnalyticsTemplateInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly entityGroup = 'platform_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RegisterAnalyticsTemplateInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      };
    }

    const request: RegisterAnalyticsTemplateRequest = parsed.data;
    const registry = getAnalyticsTemplateRegistry();
    const createdByUserId = context?.userId ?? 'system';

    try {
      // First, check if template already exists by exact key or alias match
      const existing = await registry.getByKeyOrAlias(request.templateKey);
      if (existing) {
        return {
          success: true,
          data: {
            templateId: existing.id,
            template: existing,
            message: `Template with key "${request.templateKey}" already exists. Reusing existing template.`,
            isNewRegistration: false,
          },
        };
      }

      // Register new template (handles race conditions via unique constraint)
      const template = await registry.register(request, createdByUserId);

      return {
        success: true,
        data: {
          templateId: template.id,
          template,
          message: `Successfully registered new template "${request.templateKey}" for domain "${request.baseDomain}".`,
          isNewRegistration: true,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register analytics template';
      return {
        success: false,
        error: message,
      };
    }
  }
}
