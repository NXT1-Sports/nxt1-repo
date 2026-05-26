import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import {
  PracticeScriptPeriodSchema,
  TEAMS_COLLECTION,
  TEAM_PRACTICE_SCRIPTS_COLLECTION,
  normalizeObjectives,
  normalizeOptionalText,
  normalizePeriods,
} from './practice-script.utils.js';

const UpdatePracticeScriptInputSchema = z
  .object({
    practiceScriptId: z.string().trim().min(1),
    title: z.string().trim().min(1).optional(),
    focus: z.string().trim().min(1).optional(),
    tempo: z.string().trim().min(1).optional(),
    scriptDate: z.string().trim().optional(),
    opponent: z.string().trim().optional(),
    objectives: z.array(z.string().trim().min(1)).max(10).optional(),
    periods: z.array(PracticeScriptPeriodSchema).min(1).max(48).optional(),
    notes: z.string().trim().optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (value) =>
      [
        value.title,
        value.focus,
        value.tempo,
        value.scriptDate,
        value.opponent,
        value.objectives,
        value.periods,
        value.notes,
        value.archived,
      ].some((entry) => entry !== undefined),
    {
      message: 'At least one field must be provided to update a practice script.',
      path: ['practiceScriptId'],
    }
  );

export class UpdatePracticeScriptTool extends BaseTool {
  readonly name = 'update_practice_script';
  readonly description =
    'Update a persisted practice script including title, focus, periods, objectives, or archive state.';

  readonly parameters = UpdatePracticeScriptInputSchema;
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
    const parsed = UpdatePracticeScriptInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const payload = parsed.data;
    const scriptRef = this.db
      .collection(TEAM_PRACTICE_SCRIPTS_COLLECTION)
      .doc(payload.practiceScriptId);
    const scriptDoc = await scriptRef.get();
    if (!scriptDoc.exists) {
      return { success: false, error: `Practice script ${payload.practiceScriptId} not found.` };
    }

    const current = scriptDoc.data() as Record<string, unknown>;
    const teamId = typeof current['teamId'] === 'string' ? current['teamId'] : '';
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
      return { success: false, error: 'Not authorized to update this practice script.' };
    }

    const patch: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: context.userId,
    };

    if (payload.title !== undefined) patch['title'] = payload.title.trim();
    if (payload.focus !== undefined) patch['focus'] = payload.focus.trim();
    if (payload.tempo !== undefined) patch['tempo'] = payload.tempo.trim();
    if (payload.scriptDate !== undefined)
      patch['scriptDate'] = normalizeOptionalText(payload.scriptDate) ?? null;
    if (payload.opponent !== undefined)
      patch['opponent'] = normalizeOptionalText(payload.opponent) ?? null;
    if (payload.objectives !== undefined)
      patch['objectives'] = normalizeObjectives(payload.objectives);
    if (payload.periods !== undefined) patch['periods'] = normalizePeriods(payload.periods);
    if (payload.notes !== undefined) patch['notes'] = normalizeOptionalText(payload.notes) ?? '';
    if (payload.archived !== undefined) patch['archived'] = payload.archived;

    await scriptRef.set(patch, { merge: true });

    const updated = await scriptRef.get();

    return {
      success: true,
      markdown: `Updated practice script **${String(updated.data()?.['title'] ?? payload.practiceScriptId)}**.`,
      data: {
        practiceScript: {
          id: updated.id,
          ...(updated.data() ?? {}),
        },
      },
    };
  }
}
