import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_CALLSHEETS_COLLECTION = 'TeamCallsheets';
const TEAMS_COLLECTION = 'Teams';

const GetCallsheetInputSchema = z.object({
  callsheetId: z.string().trim().min(1),
});

type TeamCallsheetDoc = {
  readonly teamId: string;
  readonly title: string;
  readonly sport: string;
  readonly playbookId: string;
};

export class GetCallsheetTool extends BaseTool {
  readonly name = 'get_callsheet';
  readonly description =
    'Get a saved callsheet by ID, including situation details and ranked plays.';

  readonly parameters = GetCallsheetInputSchema;
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
    const parsed = GetCallsheetInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { callsheetId } = parsed.data;
    const doc = await this.db.collection(TEAM_CALLSHEETS_COLLECTION).doc(callsheetId).get();
    if (!doc.exists) {
      return { success: false, error: `Callsheet ${callsheetId} not found.` };
    }

    const callsheet = doc.data() as TeamCallsheetDoc;
    const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(callsheet.teamId).get();
    if (!teamDoc.exists) {
      return { success: false, error: `Team ${callsheet.teamId} not found.` };
    }

    const authorized = await canManageTeamMutationForUser(
      this.db,
      context.userId,
      callsheet.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      return { success: false, error: 'Not authorized to view this callsheet.' };
    }

    return {
      success: true,
      markdown: `Loaded callsheet **${callsheet.title}** (${callsheet.sport}).`,
      data: {
        callsheet: { id: doc.id, ...callsheet },
      },
    };
  }
}
