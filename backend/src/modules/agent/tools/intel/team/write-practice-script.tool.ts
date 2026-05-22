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

const WritePracticeScriptInputSchema = z.object({
  teamId: z.string().trim().min(1),
  playbookId: z.string().trim().min(1),
  sport: z.string().trim().min(1),
  title: z.string().trim().min(1),
  focus: z.string().trim().min(1),
  tempo: z.string().trim().min(1),
  scriptDate: z.string().trim().optional(),
  opponent: z.string().trim().optional(),
  objectives: z.array(z.string().trim().min(1)).max(10).optional(),
  periods: z.array(PracticeScriptPeriodSchema).min(1).max(48),
  notes: z.string().trim().optional(),
  source: z.string().trim().min(1).optional(),
});

export class WritePracticeScriptTool extends BaseTool {
  readonly name = 'write_practice_script';
  readonly description =
    'Create and persist a coach-ready practice script matrix for a team playbook.';

  readonly parameters = WritePracticeScriptInputSchema;
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
    const parsed = WritePracticeScriptInputSchema.safeParse(input);
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
      return { success: false, error: 'Not authorized to create practice scripts for this team.' };
    }

    const now = new Date().toISOString();
    const slug = `${payload.title}-${now}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    const scriptId = `${payload.playbookId}_${slug || 'practice-script'}`;

    const doc: Record<string, unknown> = {
      id: scriptId,
      teamId: payload.teamId,
      playbookId: payload.playbookId,
      sport: payload.sport.toLowerCase(),
      title: payload.title.trim(),
      focus: payload.focus.trim(),
      tempo: payload.tempo.trim(),
      scriptDate: normalizeOptionalText(payload.scriptDate),
      opponent: normalizeOptionalText(payload.opponent),
      objectives: normalizeObjectives(payload.objectives),
      periods: normalizePeriods(payload.periods),
      notes: normalizeOptionalText(payload.notes) ?? '',
      source: normalizeOptionalText(payload.source) ?? 'agent_x',
      archived: false,
      createdAt: now,
      createdBy: context.userId,
      updatedAt: now,
      updatedBy: context.userId,
    };

    await this.db.collection(TEAM_PRACTICE_SCRIPTS_COLLECTION).doc(scriptId).set(doc);

    return {
      success: true,
      markdown: `Saved practice script **${payload.title.trim()}**.`,
      data: {
        practiceScript: doc,
      },
    };
  }
}
