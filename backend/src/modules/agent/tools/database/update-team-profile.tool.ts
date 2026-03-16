import { getFirestore } from 'firebase-admin/firestore';
import { BaseTool, type ToolResult } from '../base.tool.js';
import { ROLE } from '@nxt1/core/models';

interface RosterMemberInput {
  firstName: string;
  lastName: string;
  jerseyNumber?: string;
  positions?: string[];
  classOf?: number;
  height?: string;
  weight?: string;
}

interface TeamDataInput {
  userId: string;
  teamId: string;
  source: string;
  profileUrl: string;
  faviconUrl?: string;
  targetSport: string;
  fields: {
    description?: string;
    mascot?: string;
    seasonRecord?: {
      wins: number;
      losses: number;
      ties?: number;
    };
    roster?: RosterMemberInput[];
    teamLogoImg?: string;
  };
}

export class UpdateTeamProfileTool extends BaseTool {
  readonly name = 'update_team_profile';

  readonly description =
    'Update a Team profile with extracted data from an external platform (e.g., MaxPreps, Hudl team page). ' +
    'Adds roster members, season record, and syncs connected source status.';

  override readonly allowedAgents = ['data_coordinator'] as const;

  readonly isMutation = true;
  readonly category = 'database' as const;

  readonly parameters = {
    type: 'object',
    properties: {
      userId: { type: 'string', description: 'User ID of the coach who owns the team' },
      teamId: { type: 'string', description: 'The ID of the Team Document to update' },
      source: { type: 'string', description: 'Platform name (e.g., hudl, maxpreps)' },
      profileUrl: { type: 'string', description: 'URL of the scraped page' },
      faviconUrl: {
        type: 'string',
        description:
          'The favicon URL of the scraped platform, extracted from the page <link rel="icon"> tag by the scrape_webpage tool.',
      },
      targetSport: { type: 'string', description: 'Sport context' },
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
                height: { type: 'string' },
                weight: { type: 'string' },
              },
            },
          },
        },
      },
    },
    required: ['userId', 'teamId', 'source', 'profileUrl', 'targetSport', 'fields'],
  } as const;

  async execute(input: Record<string, unknown>): Promise<ToolResult> {
    const parsed = input as unknown as TeamDataInput;
    try {
      const db = getFirestore();
      const teamRef = db.collection('Teams').doc(parsed.teamId);
      const teamDoc = await teamRef.get();

      if (!teamDoc.exists) {
        return { success: false, error: `Team ${parsed.teamId} not found.` };
      }

      const teamData = teamDoc.data()!;
      const updatePayload: Record<string, unknown> = {
        lastUpdatedStat: new Date().toISOString(),
      };

      if (parsed.fields.description) updatePayload['description'] = parsed.fields.description;
      if (parsed.fields.mascot) updatePayload['mascot'] = parsed.fields.mascot;
      if (parsed.fields.seasonRecord) {
        updatePayload['seasonRecord'] = parsed.fields.seasonRecord;
      }

      // Add roster as unverified members
      if (parsed.fields.roster && parsed.fields.roster.length > 0) {
        const existingMembers = (teamData['members'] as unknown[]) || [];
        const newMembers = parsed.fields.roster.map((r) => ({
          id: `unverified_${Math.random().toString(36).substring(2, 9)}`,
          firstName: r.firstName,
          lastName: r.lastName,
          name: `${r.firstName} ${r.lastName}`,
          role: ROLE.athlete,
          isVerify: false,
          joinTime: new Date().toISOString(),
          classOf: r.classOf || null,
          position: r.positions || [],
          jerseyNumber: r.jerseyNumber,
          height: r.height,
          weight: r.weight,
        }));
        updatePayload['members'] = [...existingMembers, ...newMembers];
      }

      // Update connectedSources if it matches profileUrl
      const existingConnected = (teamData['connectedSources'] as Record<string, unknown>[]) || [];
      const updatedConnected = [...existingConnected];
      const sourceIndex = updatedConnected.findIndex(
        (s: Record<string, unknown>) =>
          s['platform'] === parsed.source && s['profileUrl'] === parsed.profileUrl
      );
      if (sourceIndex >= 0) {
        updatedConnected[sourceIndex] = {
          ...updatedConnected[sourceIndex],
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          syncedFields: Object.keys(parsed.fields),
          ...(parsed.faviconUrl && { faviconUrl: parsed.faviconUrl }),
        };
      } else {
        updatedConnected.push({
          platform: parsed.source,
          profileUrl: parsed.profileUrl,
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
          syncedFields: Object.keys(parsed.fields),
          ...(parsed.faviconUrl && { faviconUrl: parsed.faviconUrl }),
        });
      }
      updatePayload['connectedSources'] = updatedConnected;

      await teamRef.update(updatePayload);

      return {
        success: true,
        data: { message: `Successfully updated team profile (ID: ${parsed.teamId})` },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
