import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';

export class WriteTeamIdentityTool extends BaseTool {
  readonly name = 'write_team_identity';
  readonly isMutation = true;
  readonly category = 'database';

  readonly description =
    'Write atomic team identity data (mascot, record, etc.) parsed from an external sports page.';

  readonly parameters = {
    type: 'object',
    properties: {
      teamId: { type: 'string' },
      source: { type: 'string' },
      targetSport: { type: 'string' },
      fields: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          mascot: { type: 'string' },
          seasonRecord: {
            type: 'object',
            properties: {
              wins: { type: 'number' },
              losses: { type: 'number' },
              ties: { type: 'number' },
            },
          },
        },
      },
    },
    required: ['teamId', 'source', 'targetSport', 'fields'],
  };

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db || getFirestore();
  }

  async execute(params: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult> {
    const { teamId, targetSport, fields } = params;

    if (!teamId) {
      return {
        success: false,
        data: { error: 'teamId is required for write_team_identity tool.' },
      };
    }

    try {
      if (context?.onProgress) {
        context.onProgress('Updating team identity...');
      }

      const teamRef = this.db.collection('Teams').doc(String(teamId));
      const updateData: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() };

      if (fields.description) updateData['bio'] = fields.description;
      if (fields.mascot) updateData['mascot'] = fields.mascot;

      if (fields.seasonRecord) {
        updateData[`sports.${targetSport}.seasonRecord`] = fields.seasonRecord;
      }

      await teamRef.set(updateData, { merge: true });

      if (context?.onProgress) {
        context.onProgress('Team identity updated.');
      }

      return {
        success: true,
        data: { message: `Successfully updated identity for team ${teamId}` },
      };
    } catch (err: any) {
      if (context?.onProgress) {
        context.onProgress(`Update failed: ${err.message}`);
      }
      return { success: false, data: { error: err.message } };
    }
  }
}
