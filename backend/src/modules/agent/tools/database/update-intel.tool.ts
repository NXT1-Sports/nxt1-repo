import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { IntelGenerationService } from '../../services/intel.service.js';
import { logger } from '../../../../utils/logger.js';

type IntelEntityType = 'athlete' | 'team';

export class UpdateIntelTool extends BaseTool {
  readonly name = 'update_intel';

  readonly description =
    'Updates a single section of an existing Agent X Intel report for an athlete or team. ' +
    'Use this when the user wants to refresh or regenerate one specific section rather than the full report. ' +
    'Call this once you have confirmed the entityType, entityId, and sectionId with the user. ' +
    'Valid athlete sectionIds: agent_x_brief, athletic_measurements, season_stats, recruiting_activity, academic_profile, awards_honors. ' +
    'Valid team sectionIds: agent_overview, team, stats, recruiting, schedule.';

  readonly parameters = {
    type: 'object',
    properties: {
      entityType: {
        type: 'string',
        enum: ['athlete', 'team'],
        description: 'Whether the Intel is for an athlete profile or a team profile.',
      },
      entityId: {
        type: 'string',
        description:
          'The athlete userId or teamId whose Intel section should be updated. ' +
          'Omit this field when updating for the currently authenticated user — ' +
          'the system will resolve their ID automatically.',
      },
      sectionId: {
        type: 'string',
        enum: [
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
        ],
        description:
          'The specific section of the Intel report to regenerate. ' +
          'Athlete sections: agent_x_brief, athletic_measurements, season_stats, recruiting_activity, academic_profile, awards_honors. ' +
          'Team sections: agent_overview, team, stats, recruiting, schedule.',
      },
    },
    required: ['entityType', 'sectionId'],
  } as const;

  override readonly allowedAgents = [
    'data_coordinator',
    'performance_coordinator',
    'recruiting_coordinator',
    'general',
  ] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;

  constructor(private readonly db: Firestore = getFirestore()) {
    super();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const entityTypeRaw = this.str(input, 'entityType');
    // Prefer LLM-supplied entityId; fall back to the authenticated user's UID for athlete.
    const entityId =
      this.str(input, 'entityId') || (entityTypeRaw === 'athlete' ? (context?.userId ?? '') : '');
    const sectionId = this.str(input, 'sectionId');

    if (!entityTypeRaw || (entityTypeRaw !== 'athlete' && entityTypeRaw !== 'team')) {
      return {
        success: false,
        error: 'Parameter "entityType" is required and must be either "athlete" or "team".',
      };
    }
    if (!entityId) return this.paramError('entityId');
    if (!sectionId) return this.paramError('sectionId');

    const entityType = entityTypeRaw as IntelEntityType;
    const intelService = new IntelGenerationService();

    try {
      if (entityType === 'athlete') {
        context?.onProgress?.(`Updating ${sectionId} section of athlete Intel report…`);
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
      context?.onProgress?.(`Updating ${sectionId} section of team Intel report…`);
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
