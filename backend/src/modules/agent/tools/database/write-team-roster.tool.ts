import { BaseTool, type ToolResult, type ToolExecutionContext } from '../base.tool.js';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export class WriteTeamRosterTool extends BaseTool {
  readonly name = 'write_team_roster';
  readonly isMutation = true;
  readonly category = 'database';

  readonly description =
    'Update the roster entries for a given team scraped from an external profiles site.';

  readonly parameters = {
    type: 'object',
    properties: {
      teamId: { type: 'string' },
      source: { type: 'string' },
      targetSport: { type: 'string' },
      roster: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            jerseyNumber: { type: 'string' },
            positions: { type: 'array', items: { type: 'string' } },
            classOf: { type: 'number' },
            height: { type: 'number' },
            weight: { type: 'number' },
          },
        },
      },
    },
    required: ['teamId', 'source', 'targetSport', 'roster'],
  };

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db || getFirestore();
  }

  async execute(params: Record<string, any>, context?: ToolExecutionContext): Promise<ToolResult> {
    const { teamId, source, targetSport, roster } = params;

    if (!teamId) {
      return { success: false, data: { error: 'teamId is required for write_team_roster tool.' } };
    }

    try {
      if (context?.onProgress) {
        context.onProgress('Updating team roster...');
      }

      const batch = this.db.batch();
      let writtenCount = 0;

      for (const player of roster || []) {
        writtenCount++;
        const ref = this.db.collection('Teams').doc(String(teamId)).collection('RosterTemp').doc();
        batch.set(ref, {
          ...player,
          source,
          sport: targetSport,
          createdAt: new Date().toISOString(),
        });
      }

      if (writtenCount > 0) {
        await batch.commit();
      }

      if (context?.onProgress) {
        context.onProgress(`Team roster synced (${writtenCount} players).`);
      }

      return {
        success: true,
        data: { message: `Roster sync completed for team ${teamId} with ${writtenCount} players.` },
      };
    } catch (err: any) {
      if (context?.onProgress) {
        context.onProgress(`Roster sync failed: ${err.message}`);
      }
      return { success: false, data: { error: err.message } };
    }
  }
}
