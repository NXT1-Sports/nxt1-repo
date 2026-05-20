/**
 * @fileoverview Write Intel Tool — Triggers full Intel generation via IntelGenerationService
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Delegates entirely to IntelGenerationService which handles data gathering,
 * the real LLM call with proper prompt context, normalization into sections,
 * and Firestore persistence — producing the full report the Intel tab renders.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import {
  IntelGenerationService,
  type IntelTelemetryContext,
} from '../../../services/intel.service.js';
import { logger } from '../../../../../utils/logger.js';
import { getFeatureFlagsService } from '../../../../../config/feature-flags/index.js';
import { z } from 'zod';

type IntelEntityType = 'athlete' | 'team';

const WriteIntelInputSchema = z.object({
  entityType: z.string().trim().min(1),
  entityId: z.string().trim().min(1).optional(),
});

export class WriteIntelTool extends BaseTool {
  readonly name = 'write_intel';

  readonly description =
    'Generates and saves a full Agent X Intel report for an athlete or team. ' +
    'Handles all data gathering, narrative generation, and Firestore persistence automatically. ' +
    'Call this once you have confirmed the entityType and entityId with the user.';

  readonly parameters = WriteIntelInputSchema;

  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'system' as const;

  readonly entityGroup = 'platform_tools' as const;
  constructor(private readonly db: Firestore = getFirestore()) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = WriteIntelInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues
          .map((issue) =>
            issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
          )
          .join(', '),
      };
    }

    const entityTypeRaw = parsed.data.entityType;
    // Prefer LLM-supplied entityId; fall back to the authenticated user's UID for athlete.
    const entityId =
      parsed.data.entityId || (entityTypeRaw === 'athlete' ? (context?.userId ?? '') : '');

    if (!entityTypeRaw || (entityTypeRaw !== 'athlete' && entityTypeRaw !== 'team')) {
      return {
        success: false,
        error: 'Parameter "entityType" is required and must be either "athlete" or "team".',
      };
    }
    if (!entityId) return this.paramError('entityId');

    const entityType = entityTypeRaw as IntelEntityType;

    if (
      entityType === 'team' &&
      !(await getFeatureFlagsService(this.db).isEnabled('team.intel.enabled'))
    ) {
      return {
        success: false,
        error: 'Team Intel is currently disabled.',
      };
    }

    const intelService = new IntelGenerationService();

    // Telemetry context — threaded into IntelGenerationService so OpenRouter
    // cost/latency are attributed to the originating user + operation instead
    // of being recorded as orphan (`none`) billing rows.
    const telemetry: IntelTelemetryContext | undefined =
      context?.operationId && context?.userId
        ? {
            operationId: context.operationId,
            userId: context.userId,
            agentId: 'data_coordinator',
            feature: 'intel.full_generation',
          }
        : undefined;

    try {
      if (entityType === 'athlete') {
        context?.emitStage?.('submitting_job', {
          icon: 'document',
          targetType: 'athlete',
          phase: 'generate_intel',
        });
        logger.info('[WriteIntelTool] Delegating to IntelGenerationService for athlete', {
          entityId,
        });

        const report = await intelService.generateAthleteIntel(entityId, this.db, telemetry);
        const reportId = (report as Record<string, unknown>)['id'] as string;

        logger.info('[WriteIntelTool] Athlete Intel generated and saved', {
          userId: entityId,
          reportId,
        });

        return {
          success: true,
          data: {
            entityType,
            entityId,
            reportId,
            generatedAt: new Date().toISOString(),
            message: 'Intel report generated successfully and is now visible in the Intel tab.',
          },
        };
      }

      // Team
      context?.emitStage?.('submitting_job', {
        icon: 'document',
        targetType: 'team',
        phase: 'generate_intel',
      });
      logger.info('[WriteIntelTool] Delegating to IntelGenerationService for team', { entityId });

      const report = await intelService.generateTeamIntel(entityId, this.db, telemetry);
      const reportId = (report as Record<string, unknown>)['id'] as string;

      logger.info('[WriteIntelTool] Team Intel generated and saved', {
        teamId: entityId,
        reportId,
      });

      return {
        success: true,
        data: {
          entityType,
          entityId,
          reportId,
          generatedAt: new Date().toISOString(),
          message: 'Team Intel report generated successfully and is now visible in the Intel tab.',
        },
      };
    } catch (error) {
      logger.error('[WriteIntelTool] Intel generation failed', {
        entityType,
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate Intel report.',
      };
    }
  }
}
