import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logger } from '../../../../../utils/logger.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const PLAYBOOKS_COLLECTION = 'TeamPlaybooks';
const TEAMS_COLLECTION = 'Teams';

const UpdatePlaybookInputSchema = z
  .object({
    playbookId: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    season: z.string().trim().min(1).optional(),
    source: z.string().trim().min(1).optional(),
    sourceUrl: z.string().url().optional(),
    verified: z.boolean().optional(),
    plays: z.array(z.record(z.string(), z.unknown())).optional(),
    archived: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 1, {
    message: 'At least one field besides playbookId is required.',
  });

type TeamPlaybookDoc = {
  readonly id: string;
  readonly teamId: string;
  readonly sport: string;
  readonly name: string;
  readonly plays?: readonly Record<string, unknown>[];
};

function collectStringIndex(
  plays: readonly Record<string, unknown>[],
  field: 'formation' | 'personnel' | 'category'
): string[] {
  const values = new Set<string>();
  for (const play of plays) {
    const value = play[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      values.add(value.trim());
    }
  }
  return [...values].sort();
}

function collectConceptTags(plays: readonly Record<string, unknown>[]): string[] {
  const tags = new Set<string>();
  for (const play of plays) {
    const value = play['conceptTags'];
    if (!Array.isArray(value)) continue;
    for (const tag of value) {
      if (typeof tag === 'string' && tag.trim().length > 0) tags.add(tag.trim());
    }
  }
  return [...tags].sort();
}

export class UpdatePlaybookTool extends BaseTool {
  readonly name = 'update_playbook';
  readonly description =
    'Update metadata or plays for an existing team playbook. Recalculates play indexes when plays are replaced.';

  readonly parameters = UpdatePlaybookInputSchema;
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
    const parsed = UpdatePlaybookInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { playbookId, ...updates } = parsed.data;
    const docRef = this.db.collection(PLAYBOOKS_COLLECTION).doc(playbookId);
    const doc = await docRef.get();
    if (!doc.exists) {
      return { success: false, error: `Playbook ${playbookId} not found.` };
    }

    const existing = doc.data() as TeamPlaybookDoc;
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
      return { success: false, error: 'Not authorized to update this playbook.' };
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      updatedAt: now,
      updatedBy: context.userId,
    };

    if (typeof updates.name === 'string') updateData['name'] = updates.name.trim();
    if (typeof updates.season === 'string') updateData['season'] = updates.season.trim();
    if (typeof updates.source === 'string') updateData['source'] = updates.source.trim();
    if (typeof updates.sourceUrl === 'string') updateData['sourceUrl'] = updates.sourceUrl;
    if (typeof updates.verified === 'boolean') updateData['verified'] = updates.verified;
    if (typeof updates.archived === 'boolean') updateData['archived'] = updates.archived;

    if (Array.isArray(updates.plays)) {
      const plays = updates.plays as Record<string, unknown>[];
      updateData['plays'] = plays;
      updateData['playCount'] = plays.length;
      updateData['conceptTagIndex'] = collectConceptTags(plays);
      updateData['formationIndex'] = collectStringIndex(plays, 'formation');
      updateData['personnelIndex'] = collectStringIndex(plays, 'personnel');
      updateData['categoryIndex'] = collectStringIndex(plays, 'category');
    }

    await docRef.update(updateData);

    try {
      const cache = getCacheService();
      await Promise.all([
        cache.del(`intel:team:${existing.teamId}`),
        cache.del(`team:playbooks:${existing.teamId}:${existing.sport}`),
        cache.del(`team:profile:${existing.teamId}`),
      ]);
    } catch {
      // Best effort.
    }

    logger.info('[UpdatePlaybookTool] Playbook updated', {
      playbookId,
      teamId: existing.teamId,
      updatedFields: Object.keys(updates),
      updatedBy: context.userId,
    });

    return {
      success: true,
      markdown: `Updated playbook **${existing.name}**.`,
      data: {
        playbook: {
          id: playbookId,
          teamId: existing.teamId,
          sport: existing.sport,
          name: (updates.name as string | undefined) ?? existing.name,
          updatedAt: now,
        },
        message: `Updated playbook ${playbookId} (${Object.keys(updates).length} field(s)).`,
      },
    };
  }
}
