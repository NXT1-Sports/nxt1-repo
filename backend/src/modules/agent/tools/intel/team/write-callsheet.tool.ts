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

const WriteCallsheetInputSchema = z.object({
  teamId: z.string().trim().min(1),
  playbookId: z.string().trim().min(1),
  sport: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  situation: z.string().trim().min(1).optional(),
  filters: z.record(z.string(), z.string()).optional(),
  plays: z.array(CallsheetPlaySchema).max(50).optional(),
  groups: z.array(CallsheetGroupSchema).max(24).optional(),
  notes: z.string().trim().optional(),
  source: z.string().trim().min(1).optional(),
});

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

export class WriteCallsheetTool extends BaseTool {
  readonly name = 'write_callsheet';
  readonly description =
    'Create and persist a team callsheet with situation context and ranked plays.';

  readonly parameters = WriteCallsheetInputSchema;
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
    const parsed = WriteCallsheetInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const payload = parsed.data;
    const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(payload.teamId).get();
    if (!teamDoc.exists) {
      return { success: false, error: `Team ${payload.teamId} not found.` };
    }

    const authorized = await canManageTeamMutationForUser(
      this.db,
      context.userId,
      payload.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      return { success: false, error: 'Not authorized to create callsheets for this team.' };
    }

    const now = new Date().toISOString();
    const title =
      normalizeOptionalText(payload.title) ??
      `Callsheet ${new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })}`;

    const slug = `${title}-${now}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    const callsheetId = `${payload.playbookId}_${slug || 'callsheet'}`;

    const normalizedPlays = (payload.plays ?? []).map((play) => ({
      playName: play.playName,
      score: Math.max(0, Math.min(100, Math.round(play.score))),
      reasoning: play.reasoning,
    }));

    const doc: Record<string, unknown> = {
      id: callsheetId,
      teamId: payload.teamId,
      playbookId: payload.playbookId,
      sport: payload.sport.toLowerCase(),
      title,
      situation: normalizeOptionalText(payload.situation) ?? 'all situations',
      filters: payload.filters ?? {},
      plays: normalizedPlays,
      groups: normalizeGroups(payload.groups, normalizedPlays),
      notes: normalizeOptionalText(payload.notes) ?? '',
      source: normalizeOptionalText(payload.source) ?? 'agent_x',
      archived: false,
      createdAt: now,
      createdBy: context.userId,
      updatedAt: now,
      updatedBy: context.userId,
    };

    await this.db.collection(TEAM_CALLSHEETS_COLLECTION).doc(callsheetId).set(doc);

    return {
      success: true,
      markdown: `Saved callsheet **${title}**.`,
      data: {
        callsheet: doc,
      },
    };
  }
}
