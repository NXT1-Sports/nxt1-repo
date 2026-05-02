/**
 * @fileoverview Track Analytics Event Tool
 * @module @nxt1/backend/modules/agent/tools/database
 */

import {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUBJECT_TYPES,
  getDefaultAnalyticsEventType,
  isAnalyticsDomain,
} from '@nxt1/core/models';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import {
  AnalyticsLoggerService,
  getAnalyticsLoggerService,
} from '../../../../services/core/analytics-logger.service.js';
import {
  getAnalyticsTemplateRegistry,
  type AnalyticsTemplateRegistry,
} from '../../services/analytics/analytics-template-registry.service.js';
import { z } from 'zod';

const TrackAnalyticsEventInputSchema = z.object({
  userId: z.string().trim().min(1),
  subjectId: z.string().trim().min(1).optional(),
  subjectType: z.enum(ANALYTICS_SUBJECT_TYPES).optional(),
  domain: z.string().trim().min(1),
  eventType: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
  templateKey: z.string().trim().min(1).optional(),
  value: z.union([z.number(), z.string(), z.boolean(), z.null()]).optional(),
  tags: z.array(z.string()).optional(),
  payload: z.record(z.string(), z.unknown()),
  source: z.enum(['agent', 'user', 'system']).optional(),
});

export class TrackAnalyticsEventTool extends BaseTool {
  readonly name = 'track_analytics_event';
  readonly description =
    'Tracks a structured analytics event for recruiting, NIL, performance, engagement, communication, or custom user-defined metrics. Use this whenever the user explicitly asks to track something.';

  readonly parameters = TrackAnalyticsEventInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  constructor(
    private readonly analytics: AnalyticsLoggerService = getAnalyticsLoggerService(),
    private readonly templateRegistry: AnalyticsTemplateRegistry = getAnalyticsTemplateRegistry()
  ) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = TrackAnalyticsEventInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join(', '),
      };
    }

    const { userId, domain, payload, templateId, templateKey } = parsed.data;

    // Validate domain is a known analytics domain
    if (!isAnalyticsDomain(domain)) {
      return {
        success: false,
        error: `domain must be one of: ${ANALYTICS_DOMAINS.join(', ')}`,
      };
    }

    // Handle custom template if provided
    let resolvedDomain = domain;
    let resolvedEventType = parsed.data.eventType;
    let resolvedTemplateId: string | null = null;
    let resolvedTemplateKey: string | null = null;
    let resolvedTemplateBaseDomain: string | null = null;

    if (templateId || templateKey) {
      const lookup = templateId ?? templateKey;

      if (!lookup) {
        return {
          success: false,
          error: 'Either templateId or templateKey must be provided when using a template.',
        };
      }

      try {
        const template = templateId
          ? await this.templateRegistry.getById(templateId)
          : await this.templateRegistry.getByKeyOrAlias(templateKey!);

        if (!template) {
          return {
            success: false,
            error: `Custom analytics template not found: "${lookup}". Use discover_analytics_templates to find existing templates.`,
          };
        }

        // Validate required payload fields
        if (template.requiredPayloadFields.length > 0) {
          const missing = template.requiredPayloadFields.filter((field) => !(field in payload));
          if (missing.length > 0) {
            return {
              success: false,
              error: `Template "${template.templateKey}" requires payload fields: ${missing.join(', ')}`,
            };
          }
        }

        // Use canonical event type from template
        resolvedDomain = 'custom';
        resolvedEventType = template.canonicalEventType;
        resolvedTemplateId = template.id;
        resolvedTemplateKey = template.templateKey;
        resolvedTemplateBaseDomain = template.baseDomain;

        // Increment usage count (non-blocking)
        this.templateRegistry.incrementUsage(template.id).catch(() => {
          /* ignore */
        });

        // Add suggested tags if not already present
        const allTags = new Set(parsed.data.tags ?? []);
        template.suggestedTags.forEach((tag) => allTags.add(tag));
        parsed.data.tags = Array.from(allTags);
      } catch (err) {
        return {
          success: false,
          error: `Failed to resolve custom analytics template: ${err instanceof Error ? err.message : 'Unknown error'}`,
        };
      }
    } else {
      // No template: custom domain requires a template
      if (domain === 'custom') {
        return {
          success: false,
          error:
            'Custom domain events must use a registered template. Use register_analytics_template or discover_analytics_templates.',
        };
      }

      resolvedEventType = resolvedEventType ?? getDefaultAnalyticsEventType(domain);
    }

    const subjectId = parsed.data.subjectId ?? userId;
    const subjectType = parsed.data.subjectType ?? 'user';
    const source = parsed.data.source ?? 'agent';

    const result = await this.analytics.track({
      subjectId,
      subjectType,
      domain: resolvedDomain,
      eventType: resolvedEventType,
      source,
      actorUserId: context?.userId ?? userId,
      sessionId: context?.sessionId ?? null,
      threadId: context?.threadId ?? null,
      value: parsed.data.value,
      tags: parsed.data.tags ?? [],
      payload,
      metadata: {
        toolName: this.name,
        initiatedBy: 'agent-tool',
        ...(resolvedTemplateId && { templateId: resolvedTemplateId }),
        ...(resolvedTemplateKey && { templateKey: resolvedTemplateKey }),
        ...(resolvedTemplateBaseDomain && { templateBaseDomain: resolvedTemplateBaseDomain }),
      },
    });

    return {
      success: true,
      data: {
        ...result,
        message: `Tracked ${result.eventType} in ${result.domain} for ${result.subjectId}.`,
        templateId: resolvedTemplateId,
      },
    };
  }
}
