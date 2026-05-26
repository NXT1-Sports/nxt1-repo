import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import {
  PracticeScriptDoc,
  TEAMS_COLLECTION,
  TEAM_PRACTICE_SCRIPTS_COLLECTION,
  buildPracticeScriptSummary,
} from './practice-script.utils.js';

const GetPracticeScriptInputSchema = z.object({
  practiceScriptId: z.string().trim().min(1),
});

export class GetPracticeScriptTool extends BaseTool {
  readonly name = 'get_practice_script';
  readonly description =
    'Get a saved practice script by ID, including script matrix periods and objectives.';

  readonly parameters = GetPracticeScriptInputSchema;
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
    const parsed = GetPracticeScriptInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { practiceScriptId } = parsed.data;
    const doc = await this.db
      .collection(TEAM_PRACTICE_SCRIPTS_COLLECTION)
      .doc(practiceScriptId)
      .get();
    if (!doc.exists) {
      return { success: false, error: `Practice script ${practiceScriptId} not found.` };
    }

    const practiceScript = doc.data() as PracticeScriptDoc;
    const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(practiceScript.teamId).get();
    if (!teamDoc.exists) {
      return { success: false, error: `Team ${practiceScript.teamId} not found.` };
    }

    const authorized = await canManageTeamMutationForUser(
      this.db,
      context.userId,
      practiceScript.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      return { success: false, error: 'Not authorized to view this practice script.' };
    }

    return {
      success: true,
      markdown: `Loaded practice script **${practiceScript.title}** (${practiceScript.sport}).`,
      data: {
        practiceScript: {
          ...buildPracticeScriptSummary(doc.id, practiceScript),
          ...practiceScript,
          id: doc.id,
        },
      },
    };
  }
}
