import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_CALLSHEETS_COLLECTION = 'TeamCallsheets';
const TEAMS_COLLECTION = 'Teams';

const DeleteCallsheetInputSchema = z.object({
  callsheetId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

type TeamCallsheetDoc = {
  readonly teamId: string;
  readonly title: string;
};

export class DeleteCallsheetTool extends BaseTool {
  readonly name = 'delete_callsheet';
  readonly description =
    'Archive a team callsheet (soft delete) while preserving history and audit metadata.';

  readonly parameters = DeleteCallsheetInputSchema;
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
    const parsed = DeleteCallsheetInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { callsheetId, reason } = parsed.data;

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
      return { success: false, error: 'Not authorized to delete this callsheet.' };
    }

    const now = new Date().toISOString();
    await docRef.update({
      archived: true,
      archivedAt: now,
      archivedBy: context.userId,
      updatedAt: now,
      updatedBy: context.userId,
      ...(reason ? { archivedReason: reason.trim() } : {}),
    });

    return {
      success: true,
      markdown: `Archived callsheet **${existing.title}**.`,
      data: {
        callsheet: {
          id: callsheetId,
          teamId: existing.teamId,
          title: existing.title,
          archived: true,
        },
      },
    };
  }
}
