import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { TEAMS_COLLECTION, TEAM_PRACTICE_SCRIPTS_COLLECTION } from './practice-script.utils.js';

const DeletePracticeScriptInputSchema = z.object({
  practiceScriptId: z.string().trim().min(1),
});

export class DeletePracticeScriptTool extends BaseTool {
  readonly name = 'delete_practice_script';
  readonly description = 'Delete a persisted practice script from team intelligence storage.';

  readonly parameters = DeletePracticeScriptInputSchema;
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
    const parsed = DeletePracticeScriptInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { practiceScriptId } = parsed.data;
    const scriptRef = this.db.collection(TEAM_PRACTICE_SCRIPTS_COLLECTION).doc(practiceScriptId);
    const scriptDoc = await scriptRef.get();
    if (!scriptDoc.exists) {
      return { success: false, error: `Practice script ${practiceScriptId} not found.` };
    }

    const data = scriptDoc.data() ?? {};
    const teamId = typeof data['teamId'] === 'string' ? data['teamId'] : '';
    if (!teamId) {
      return { success: false, error: 'Practice script is missing team linkage.' };
    }

    const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
    if (!teamDoc.exists) {
      return { success: false, error: `Team ${teamId} not found.` };
    }

    const authorized = await canManageTeamMutationForUser(
      this.db,
      context.userId,
      teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      return { success: false, error: 'Not authorized to delete this practice script.' };
    }

    await scriptRef.delete();

    return {
      success: true,
      markdown: `Deleted practice script **${String(data['title'] ?? practiceScriptId)}**.`,
      data: {
        deletedPracticeScriptId: practiceScriptId,
      },
    };
  }
}
