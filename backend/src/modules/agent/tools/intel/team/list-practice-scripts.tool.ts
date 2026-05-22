import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import {
  PracticeScriptDoc,
  TEAMS_COLLECTION,
  TEAM_PRACTICE_SCRIPTS_COLLECTION,
  buildPracticeScriptSummary,
  normalizeOptionalText,
} from './practice-script.utils.js';

const ListPracticeScriptsInputSchema = z.object({
  teamId: z.string().trim().min(1),
  playbookId: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export class ListPracticeScriptsTool extends BaseTool {
  readonly name = 'list_practice_scripts';
  readonly description =
    'List saved practice scripts for a team, with optional playbook or sport filtering.';

  readonly parameters = ListPracticeScriptsInputSchema;
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
    const parsed = ListPracticeScriptsInputSchema.safeParse(input);
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
      return { success: false, error: 'Not authorized to view practice scripts for this team.' };
    }

    const limit = payload.limit ?? 30;
    const includeArchived = payload.includeArchived === true;
    const normalizedSport = normalizeOptionalText(payload.sport)?.toLowerCase();

    const snap = await this.db
      .collection(TEAM_PRACTICE_SCRIPTS_COLLECTION)
      .where('teamId', '==', payload.teamId)
      .limit(Math.max(limit * 3, 90))
      .get();

    const scripts = snap.docs
      .map((doc) => ({ docId: doc.id, data: doc.data() as PracticeScriptDoc }))
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
      .map((entry) => buildPracticeScriptSummary(entry.docId, entry.data));

    return {
      success: true,
      markdown:
        scripts.length === 0
          ? 'No practice scripts matched your filters.'
          : `Found **${scripts.length}** practice script(s).`,
      data: {
        scripts,
        count: scripts.length,
      },
    };
  }
}
