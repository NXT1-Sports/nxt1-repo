/**
 * @fileoverview Write Intel Tool — Triggers full Intel generation via IntelGenerationService
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Delegates entirely to IntelGenerationService which handles data gathering,
 * the real LLM call with proper prompt context, normalization into sections,
 * and Firestore persistence — producing the full report the Intel tab renders.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../base.tool.js';
import { IntelGenerationService } from '../../services/intel.service.js';
import { logger } from '../../../../utils/logger.js';

type IntelEntityType = 'athlete' | 'team';

export class WriteIntelTool extends BaseTool {
  readonly name = 'write_intel';

  readonly description =
    'Generates and saves a full Agent X Intel report for an athlete or team. ' +
    'Handles all data gathering, narrative generation, and Firestore persistence automatically. ' +
    'Call this once you have confirmed the entityType and entityId with the user.';

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
        description: 'The athlete userId or teamId to generate the Intel report for.',
      },
    },
    required: ['entityType', 'entityId'],
  } as const;

  override readonly allowedAgents = ['performance_coordinator', 'general'] as const;
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
    const entityId = this.str(input, 'entityId');

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
        context?.onProgress?.('Gathering athlete data and generating Intel…');
        logger.info('[WriteIntelTool] Delegating to IntelGenerationService for athlete', {
          entityId,
        });

        const report = await intelService.generateAthleteIntel(entityId, this.db);
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
      context?.onProgress?.('Gathering team data and generating Intel…');
      logger.info('[WriteIntelTool] Delegating to IntelGenerationService for team', { entityId });

      const report = await intelService.generateTeamIntel(entityId, this.db);
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
