import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_CALLSHEETS_COLLECTION = 'TeamCallsheets';
const TEAMS_COLLECTION = 'Teams';

const CallsheetPlaySchema = z.object({
  playName: z.string().trim().min(1),
  score: z.number().min(0).max(100),
  reasoning: z.string().trim().min(1),
});

const CallsheetGroupSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  playNames: z.array(z.string().trim().min(1)).max(100),
});

const UpdateCallsheetInputSchema = z
  .object({
    callsheetId: z.string().trim().min(1),
    title: z.string().trim().optional(),
    situation: z.string().trim().optional(),
    filters: z.record(z.string(), z.string()).optional(),
    plays: z.array(CallsheetPlaySchema).max(50).optional(),
    groups: z.array(CallsheetGroupSchema).max(24).optional(),
    notes: z.string().trim().optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: 'At least one field besides callsheetId is required.',
  });

type TeamCallsheetDoc = {
  readonly teamId: string;
  readonly title: string;
  readonly plays?: readonly { playName: string; score: number; reasoning: string }[];
  readonly groups?: readonly z.infer<typeof CallsheetGroupSchema>[];
};

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeGroups(
  groups: readonly z.infer<typeof CallsheetGroupSchema>[] | undefined,
  plays: readonly { playName: string; score: number; reasoning: string }[]
): Array<{ id: string; name: string; playNames: string[]; order: number }> {
  const allPlayNames = plays
    .map((play) => play.playName.trim())
    .filter((playName) => playName.length > 0);
  const validNames = new Set(allPlayNames);
  const normalizedGroups = (groups ?? [])
    .map((group, index) => ({
      id: group.id.trim() || `group_${index + 1}`,
      name: group.name.trim() || `Group ${index + 1}`,
      playNames: Array.from(
        new Set(group.playNames.map((name) => name.trim()).filter((name) => validNames.has(name)))
      ),
      order: index,
    }))
    .filter((group) => group.name.length > 0);

  if (normalizedGroups.length === 0) {
    if (allPlayNames.length === 0) return [];
    return [
      {
        id: 'group_1',
        name: 'Starter',
        playNames: allPlayNames,
        order: 0,
      },
    ];
  }

  const assignedNames = new Set<string>();
  for (const group of normalizedGroups) {
    for (const playName of group.playNames) assignedNames.add(playName);
  }

  const unassigned = allPlayNames.filter((playName) => !assignedNames.has(playName));
  if (unassigned.length > 0) {
    normalizedGroups.push({
      id: `group_${normalizedGroups.length + 1}`,
      name: 'Other Calls',
      playNames: unassigned,
      order: normalizedGroups.length,
    });
  }

  return normalizedGroups;
}

export class UpdateCallsheetTool extends BaseTool {
  readonly name = 'update_callsheet';
  readonly description = 'Update a saved callsheet metadata, filters, or ranked plays.';

  readonly parameters = UpdateCallsheetInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateCallsheetInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { callsheetId, ...updates } = parsed.data;

    const docRef = this.db.collection(TEAM_CALLSHEETS_COLLECTION).doc(callsheetId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return { success: false, error: `Callsheet ${callsheetId} not found.` };
    }

    const existing = doc.data() as TeamCallsheetDoc;
    const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(existing.teamId).get();
    if (!teamDoc.exists) {
      return { success: false, error: `Team ${existing.teamId} not found.` };
    }

    const authorized = await canManageTeamMutationForUser(
      this.db,
      context.userId,
      existing.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      return { success: false, error: 'Not authorized to update this callsheet.' };
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: context.userId,
    };

    if (typeof updates.title === 'string') updateData['title'] = updates.title.trim();
    if (typeof updates.situation === 'string') updateData['situation'] = updates.situation.trim();
    if (typeof updates.notes === 'string') updateData['notes'] = updates.notes.trim();
    if (typeof updates.archived === 'boolean') updateData['archived'] = updates.archived;
    if (updates.filters) updateData['filters'] = updates.filters;
    let effectivePlays: Array<{ playName: string; score: number; reasoning: string }> =
      Array.isArray(existing.plays)
        ? existing.plays.map((play) => ({
            playName: play.playName,
            score: Math.max(0, Math.min(100, Math.round(play.score))),
            reasoning: play.reasoning,
          }))
        : [];

    if (Array.isArray(updates.plays)) {
      effectivePlays = updates.plays.map((play) => ({
        playName: play.playName,
        score: Math.max(0, Math.min(100, Math.round(play.score))),
        reasoning: play.reasoning,
      }));
      updateData['plays'] = effectivePlays;
    }

    if (Array.isArray(updates.groups)) {
      updateData['groups'] = normalizeGroups(updates.groups, effectivePlays);
    } else if (Array.isArray(updates.plays)) {
      updateData['groups'] = normalizeGroups(existing.groups, effectivePlays);
    }

    await docRef.update(updateData);

    return {
      success: true,
      markdown: `Updated callsheet **${normalizeOptionalText(updates.title) ?? existing.title}**.`,
      data: {
        callsheet: {
          id: callsheetId,
          teamId: existing.teamId,
          ...updateData,
        },
      },
    };
  }
}
