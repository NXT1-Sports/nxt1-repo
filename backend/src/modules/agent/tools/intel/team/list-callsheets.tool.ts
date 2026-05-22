import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_CALLSHEETS_COLLECTION = 'TeamCallsheets';
const TEAMS_COLLECTION = 'Teams';

const ListCallsheetsInputSchema = z.object({
  teamId: z.string().trim().min(1),
  playbookId: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

type TeamCallsheetDoc = {
  readonly id?: string;
  readonly teamId: string;
  readonly playbookId: string;
  readonly sport: string;
  readonly title: string;
  readonly situation?: string;
  readonly plays?: readonly { readonly playName: string }[];
  readonly updatedAt?: string;
  readonly createdAt?: string;
  readonly archived?: boolean;
};

function normalizeText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export class ListCallsheetsTool extends BaseTool {
  readonly name = 'list_callsheets';
  readonly description =
    'List saved callsheets for a team and optionally filter by playbook or sport.';

  readonly parameters = ListCallsheetsInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator', 'data_coordinator'] as const;
  readonly isMutation = false;
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
    const parsed = ListCallsheetsInputSchema.safeParse(input);
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
      return { success: false, error: 'Not authorized to view callsheets for this team.' };
    }

    const limit = payload.limit ?? 30;
    const includeArchived = payload.includeArchived === true;
    const normalizedSport = normalizeText(payload.sport)?.toLowerCase();

    const snap = await this.db
      .collection(TEAM_CALLSHEETS_COLLECTION)
      .where('teamId', '==', payload.teamId)
      .limit(Math.max(limit * 3, 90))
      .get();

    const results = snap.docs
      .map((doc) => ({ docId: doc.id, data: doc.data() as TeamCallsheetDoc }))
      .filter((entry) => (includeArchived ? true : entry.data.archived !== true))
      .filter((entry) => (payload.playbookId ? entry.data.playbookId === payload.playbookId : true))
      .filter((entry) =>
        normalizedSport ? entry.data.sport.toLowerCase() === normalizedSport : true
      )
      .sort((a, b) => {
        const left = a.data.updatedAt ?? a.data.createdAt ?? '';
        const right = b.data.updatedAt ?? b.data.createdAt ?? '';
        return left > right ? -1 : 1;
      })
      .slice(0, limit)
      .map((entry) => ({
        id: entry.docId,
        teamId: entry.data.teamId,
        playbookId: entry.data.playbookId,
        sport: entry.data.sport,
        title: entry.data.title,
        situation: entry.data.situation ?? 'all situations',
        playCount: entry.data.plays?.length ?? 0,
        archived: entry.data.archived === true,
        updatedAt: entry.data.updatedAt,
        createdAt: entry.data.createdAt,
      }));

    return {
      success: true,
      markdown:
        results.length === 0
          ? 'No callsheets matched your filters.'
          : `Found **${results.length}** callsheet(s).`,
      data: {
        callsheets: results,
        count: results.length,
      },
    };
  }
}
