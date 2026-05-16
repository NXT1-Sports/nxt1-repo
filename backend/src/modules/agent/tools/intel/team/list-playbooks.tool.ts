import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const PLAYBOOKS_COLLECTION = 'TeamPlaybooks';
const TEAMS_COLLECTION = 'Teams';

const ListPlaybooksInputSchema = z.object({
  teamId: z.string().trim().min(1),
  sport: z.string().trim().min(1).optional(),
  nameContains: z.string().trim().min(1).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

type TeamPlaybookDoc = {
  readonly id?: string;
  readonly teamId: string;
  readonly sport: string;
  readonly name: string;
  readonly season?: string;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly playCount?: number;
  readonly plays?: readonly unknown[];
  readonly conceptTagIndex?: readonly string[];
  readonly formationIndex?: readonly string[];
  readonly updatedAt?: string;
  readonly createdAt?: string;
  readonly archived?: boolean;
};

function normalizeString(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toSummary(docId: string, item: TeamPlaybookDoc): Record<string, unknown> {
  return {
    id: docId,
    teamId: item.teamId,
    sport: item.sport,
    name: item.name,
    season: item.season,
    source: item.source,
    sourceUrl: item.sourceUrl,
    playCount: item.playCount ?? item.plays?.length ?? 0,
    conceptTagCount: item.conceptTagIndex?.length ?? 0,
    formationCount: item.formationIndex?.length ?? 0,
    updatedAt: item.updatedAt,
    createdAt: item.createdAt,
    archived: item.archived === true,
  };
}

export class ListPlaybooksTool extends BaseTool {
  readonly name = 'list_playbooks';
  readonly description =
    'List saved team playbooks. Use this before creating/updating a game plan so strategy can reuse existing play inventory.';

  readonly parameters = ListPlaybooksInputSchema;
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
    const parsed = ListPlaybooksInputSchema.safeParse(input);
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
      return { success: false, error: 'Not authorized to view playbooks for this team.' };
    }

    const limit = payload.limit ?? 25;
    const normalizedSport = normalizeString(payload.sport)?.toLowerCase();
    const normalizedName = normalizeString(payload.nameContains)?.toLowerCase();
    const includeArchived = payload.includeArchived === true;

    const snap = await this.db
      .collection(PLAYBOOKS_COLLECTION)
      .where('teamId', '==', payload.teamId)
      .limit(Math.max(limit * 3, 80))
      .get();

    const candidates = snap.docs.map((doc) => ({
      docId: doc.id,
      data: doc.data() as TeamPlaybookDoc,
    }));
    const filtered = candidates
      .filter((item) => (includeArchived ? true : item.data.archived !== true))
      .filter((item) =>
        normalizedSport ? item.data.sport.toLowerCase() === normalizedSport : true
      )
      .filter((item) => {
        if (!normalizedName) return true;
        return item.data.name.toLowerCase().includes(normalizedName);
      })
      .sort((a, b) => {
        const left = a.data.updatedAt ?? a.data.createdAt ?? '';
        const right = b.data.updatedAt ?? b.data.createdAt ?? '';
        return left > right ? -1 : 1;
      })
      .slice(0, limit);

    return {
      success: true,
      markdown:
        filtered.length === 0
          ? 'No playbooks matched your filters.'
          : `Found **${filtered.length}** playbook(s).`,
      data: {
        playbooks: filtered.map((item) => toSummary(item.docId, item.data)),
        count: filtered.length,
        filtersApplied: {
          teamId: payload.teamId,
          sport: normalizedSport,
          nameContains: normalizedName,
          includeArchived,
        },
      },
    };
  }
}
