import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { IntelGenerationService } from '../../../services/intel.service.js';
import { logger } from '../../../../../utils/logger.js';
import { z } from 'zod';

type IntelEntityType = 'athlete' | 'team';

const UpdateIntelInputSchema = z.object({
  entityType: z.string().trim().min(1),
  entityId: z.string().trim().min(1).optional(),
  sectionId: z.enum([
    'agent_x_brief',
    'athletic_measurements',
    'season_stats',
    'recruiting_activity',
    'academic_profile',
    'awards_honors',
    'agent_overview',
    'team',
    'stats',
    'recruiting',
    'schedule',
  ]),
});

export class UpdateIntelTool extends BaseTool {
  readonly name = 'update_intel';

  readonly description =
    'Updates a single section of an existing Agent X Intel report for an athlete or team. ' +
    'Use this when the user wants to refresh or regenerate one specific section rather than the full report. ' +
    'Call this once you have confirmed the entityType, entityId, and sectionId with the user. ' +
    'Valid athlete sectionIds: agent_x_brief, athletic_measurements, season_stats, recruiting_activity, academic_profile, awards_honors. ' +
    'Valid team sectionIds: agent_overview, team, stats, recruiting, schedule.';

  readonly parameters = UpdateIntelInputSchema;

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
    const parsed = UpdateIntelInputSchema.safeParse(input);
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
    const sectionId = parsed.data.sectionId;

    if (!entityTypeRaw || (entityTypeRaw !== 'athlete' && entityTypeRaw !== 'team')) {
      return {
        success: false,
        error: 'Parameter "entityType" is required and must be either "athlete" or "team".',
      };
    }
    if (!entityId) return this.paramError('entityId');
    const entityType = entityTypeRaw as IntelEntityType;
    const intelService = new IntelGenerationService();

    try {
      if (entityType === 'athlete') {
        context?.emitStage?.('submitting_job', {
          icon: 'document',
          entityType: 'athlete',
          sectionId,
          phase: 'update_intel_section',
        });
        logger.info('[UpdateIntelTool] Updating athlete Intel section', { entityId, sectionId });

        const report = await intelService.updateAthleteIntelSection(
          entityId,
          sectionId as Parameters<IntelGenerationService['updateAthleteIntelSection']>[1],
          this.db
        );
        const reportId = (report as Record<string, unknown>)['id'] as string;

        logger.info('[UpdateIntelTool] Athlete Intel section updated', {
          userId: entityId,
          sectionId,
          reportId,
        });

        return {
          success: true,
          data: {
            entityType,
            entityId,
            sectionId,
            reportId,
            updatedAt: new Date().toISOString(),
            message: `The "${sectionId}" section of the Intel report has been updated successfully.`,
          },
        };
      }

      // Team
      context?.emitStage?.('submitting_job', {
        icon: 'document',
        entityType: 'team',
        sectionId,
        phase: 'update_intel_section',
      });
      logger.info('[UpdateIntelTool] Updating team Intel section', { entityId, sectionId });

      const report = await intelService.updateTeamIntelSection(
        entityId,
        sectionId as Parameters<IntelGenerationService['updateTeamIntelSection']>[1],
        this.db
      );
      const reportId = (report as Record<string, unknown>)['id'] as string;

      logger.info('[UpdateIntelTool] Team Intel section updated', {
        teamId: entityId,
        sectionId,
        reportId,
      });

      return {
        success: true,
        data: {
          entityType,
          entityId,
          sectionId,
          reportId,
          updatedAt: new Date().toISOString(),
          message: `The "${sectionId}" section of the team Intel report has been updated successfully.`,
        },
      };
    } catch (error) {
      logger.error('[UpdateIntelTool] Intel section update failed', {
        entityType,
        entityId,
        sectionId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update Intel section.',
      };
    }
  }
}
