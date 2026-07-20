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
import { logger } from '../../../../utils/logger.js';
import { z } from 'zod';

const FAILED_ANALYTICS_OUTCOME_VALUES = new Set([
  'failed',
  'error',
  'cancelled',
  'canceled',
  'aborted',
]);

function hasFailedAnalyticsOutcome(payload: Record<string, unknown>): boolean {
  const outcome = payload['outcome'];
  if (typeof outcome === 'string') {
    const normalizedOutcome = outcome.trim().toLowerCase();
    if (FAILED_ANALYTICS_OUTCOME_VALUES.has(normalizedOutcome)) {
      return true;
    }
  }

  if (payload['success'] === false) {
    return true;
  }

  const status = payload['status'];
  if (typeof status === 'string') {
    const normalizedStatus = status.trim().toLowerCase();
    if (FAILED_ANALYTICS_OUTCOME_VALUES.has(normalizedStatus)) {
      return true;
    }
  }

  return false;
}

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
  payload: z.record(z.string(), z.unknown()).default({}),
  source: z.enum(['agent', 'user', 'system']).optional(),
});

type CoercedPayloadResult =
  | { success: true; payload: Record<string, unknown>; coercedFromString?: boolean }
  | { success: false; error: string };

function validateAndCoercePayload(payload: unknown): CoercedPayloadResult {
  if (payload === undefined || payload === null) {
    return { success: true, payload: {} };
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return { success: true, payload: {} };

    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return {
          success: true,
          payload: parsed as Record<string, unknown>,
          coercedFromString: true,
        };
      }
      return {
        success: false,
        error: 'payload must be a JSON object when provided as a string.',
      };
    } catch {
      logger.debug(
        '[TrackAnalyticsEventTool] Failed to parse or validate payload string as JSON object',
        {
          payloadLength: trimmed.length,
        }
      );
      return {
        success: false,
        error: 'payload must be a JSON object or a valid JSON object string.',
      };
    }
  }

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return { success: true, payload: payload as Record<string, unknown> };
  }

  return {
    success: false,
    error: 'payload must be an object.',
  };
}

export class TrackAnalyticsEventTool extends BaseTool {
  readonly name = 'track_analytics_event';
  readonly description = [
    'Tracks a structured analytics event. Use after any successful user-visible mutation, published content, or completed workflow milestone.',
    'VALID domain → eventType combinations (use ONLY these values):',
    '  recruiting: activity_recorded | offer_recorded | visit_recorded | coach_contact_recorded | commitment_recorded',
    '  nil: deal_recorded | campaign_recorded | payment_recorded',
    '  performance: metric_recorded | workout_recorded | milestone_recorded | recovery_recorded',
    '  engagement: profile_viewed | content_viewed | content_created | content_shared | video_played | video_watched | search_appeared | link_clicked',
    '  communication: email_sent | email_delivered | email_opened | email_replied | link_clicked | message_sent | follow_up_scheduled',
    '  system: sync_completed',
    '  custom: requires a registered template (use register_analytics_template first)',
    'For team/post creation events use domain="engagement" eventType="content_created". Never invent event type names.',
  ].join('\n');

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
    const payloadResult = validateAndCoercePayload(input['payload']);
    if (!payloadResult.success) {
      logger.warn('[TrackAnalyticsEventTool] Invalid payload input', {
        toolName: this.name,
        operationId: context?.operationId ?? null,
        threadId: context?.threadId ?? null,
        userId: context?.userId ?? null,
        payloadType: typeof input['payload'],
        error: payloadResult.error,
      });
      return {
        success: false,
        error: `Invalid input: ${payloadResult.error}`,
      };
    }

    const parsed = TrackAnalyticsEventInputSchema.safeParse({
      ...input,
      payload: payloadResult.payload,
    });
    if (!parsed.success) {
      logger.warn('[TrackAnalyticsEventTool] Invalid tool input', {
        toolName: this.name,
        operationId: context?.operationId ?? null,
        threadId: context?.threadId ?? null,
        userId: context?.userId ?? null,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.length === 0 ? '(root)' : issue.path.join('.'),
          message: issue.message,
        })),
      });
      return {
        success: false,
        error: `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`,
      };
    }

    const { userId, domain, payload, templateId, templateKey } = parsed.data;

    if (hasFailedAnalyticsOutcome(payload)) {
      return {
        success: false,
        error:
          'Failed outcomes must not be recorded in analytics events. Use operational logs instead.',
      };
    }

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

    let trackResult: Awaited<ReturnType<AnalyticsLoggerService['track']>>;
    try {
      trackResult = await this.analytics.track({
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
          ...(payloadResult.coercedFromString && { payloadCoercedFrom: 'string' }),
          ...(context?.operationId && { operationId: context.operationId }),
        },
      });
    } catch (error) {
      logger.error('[TrackAnalyticsEventTool] Analytics tracking failed', {
        toolName: this.name,
        operationId: context?.operationId ?? null,
        threadId: context?.threadId ?? null,
        userId: context?.userId ?? null,
        analyticsUserId: userId,
        subjectId,
        subjectType,
        domain: resolvedDomain,
        eventType: resolvedEventType ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: `Failed to track analytics event: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    return {
      success: true,
      data: {
        ...trackResult,
        message: `Tracked ${trackResult.eventType} in ${trackResult.domain} for ${trackResult.subjectId}.`,
        templateId: resolvedTemplateId,
      },
    };
  }
}
