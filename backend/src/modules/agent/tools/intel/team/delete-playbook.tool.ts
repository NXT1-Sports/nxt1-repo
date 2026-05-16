import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logger } from '../../../../../utils/logger.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const PLAYBOOKS_COLLECTION = 'TeamPlaybooks';
const TEAMS_COLLECTION = 'Teams';

const DeletePlaybookInputSchema = z.object({
  playbookId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

type TeamPlaybookDoc = {
  readonly id: string;
  readonly teamId: string;
  readonly sport: string;
  readonly name: string;
};

export class DeletePlaybookTool extends BaseTool {
  readonly name = 'delete_playbook';
  readonly description =
    'Archive a team playbook (soft-delete). Preserves history and allows later restoration.';

  readonly parameters = DeletePlaybookInputSchema;
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
    const parsed = DeletePlaybookInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { playbookId, reason } = parsed.data;
    const docRef = this.db.collection(PLAYBOOKS_COLLECTION).doc(playbookId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return { success: false, error: `Playbook ${playbookId} not found.` };
    }

    const playbook = doc.data() as TeamPlaybookDoc;
    const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(playbook.teamId).get();
    if (!teamDoc.exists) {
      return { success: false, error: `Team ${playbook.teamId} not found.` };
    }

    const authorized = await canManageTeamMutationForUser(
      this.db,
      context.userId,
      playbook.teamId,
      teamDoc.data() ?? {}
    );
    if (!authorized) {
      return { success: false, error: 'Not authorized to delete this playbook.' };
    }

    const now = new Date().toISOString();
    await docRef.update({
      archived: true,
      updatedBy: context.userId,
      updatedAt: now,
      archivedAt: now,
      archivedBy: context.userId,
      ...(reason ? { archivedReason: reason.trim() } : {}),
    });

    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${playbook.teamId}`),
        cache.del(`team:playbooks:${playbook.teamId}:${playbook.sport}`),
        cache.del(`team:profile:${playbook.teamId}`),
      ]);
    } catch {
      // Best effort.
    }

    logger.info('[DeletePlaybookTool] Playbook archived', {
      playbookId,
      teamId: playbook.teamId,
      archivedBy: context.userId,
      reason: reason ?? 'unspecified',
    });

    return {
      success: true,
      markdown: `Archived playbook **${playbook.name}**.`,
      data: {
        playbook: {
          id: playbookId,
          teamId: playbook.teamId,
          sport: playbook.sport,
          name: playbook.name,
          archived: true,
        },
        message: `Archived playbook "${playbook.name}".`,
      },
    };
  }
}
