import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { OpenRouterService } from '../../../llm/openrouter.service.js';
import {
  PracticeScriptPeriodSchema,
  TEAM_PLAYBOOKS_COLLECTION,
  TEAMS_COLLECTION,
  buildFallbackPracticeScript,
  normalizeObjectives,
  normalizeOptionalText,
  normalizePeriods,
} from './practice-script.utils.js';

const PracticeScriptDraftSchema = z.object({
  title: z.string().trim().min(1),
  focus: z.string().trim().min(1),
  tempo: z.string().trim().min(1),
  objectives: z.array(z.string().trim().min(1)).max(12).default([]),
  periods: z.array(PracticeScriptPeriodSchema).min(1).max(48),
  notes: z.string().trim().optional(),
});

const GeneratePracticeScriptInputSchema = z.object({
  teamId: z.string().trim().min(1),
  playbookId: z.string().trim().min(1),
  sport: z.string().trim().min(1),
  focus: z.string().trim().min(1),
  tempo: z.string().trim().optional(),
  scriptDate: z.string().trim().optional(),
  opponent: z.string().trim().optional(),
});

export class GeneratePracticeScriptTool extends BaseTool {
  readonly name = 'generate_practice_script';
  readonly description =
    'Generate a coach-ready practice script draft from team playbook content and strategic focus.';

  readonly parameters = GeneratePracticeScriptInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
  readonly isMutation = false;
  readonly category = 'data' as const;
  readonly entityGroup = 'team_tools' as const;

  private readonly db: Firestore;

  constructor(
    private readonly llm: OpenRouterService,
    db?: Firestore
  ) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GeneratePracticeScriptInputSchema.safeParse(input);
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
      return {
        success: false,
        error: 'Not authorized to generate practice scripts for this team.',
      };
    }

    const playbookDoc = await this.db
      .collection(TEAM_PLAYBOOKS_COLLECTION)
      .doc(payload.playbookId)
      .get();
    if (!playbookDoc.exists) {
      return { success: false, error: `Playbook ${payload.playbookId} not found.` };
    }

    const playbookData = playbookDoc.data() ?? {};
    const fallback = buildFallbackPracticeScript(playbookData, payload.focus);

    let draft = fallback;
    try {
      const prompt = [
        'You are an elite football practice planner.',
        'Create a practice script matrix for one practice day.',
        'Return valid JSON matching schema exactly and keep periods coach-usable.',
        `Sport: ${payload.sport}`,
        `Focus: ${payload.focus}`,
        `Tempo preference: ${normalizeOptionalText(payload.tempo) ?? 'Game Tempo'}`,
        `Script date: ${normalizeOptionalText(payload.scriptDate) ?? 'Not provided'}`,
        `Opponent: ${normalizeOptionalText(payload.opponent) ?? 'Not provided'}`,
        `Playbook name: ${typeof playbookData['name'] === 'string' ? playbookData['name'] : 'Unknown'}`,
        `Playbook philosophy: ${typeof playbookData['philosophy'] === 'string' ? playbookData['philosophy'] : 'Not provided'}`,
        `Play inventory: ${JSON.stringify(Array.isArray(playbookData['plays']) ? playbookData['plays'] : [], null, 2)}`,
      ].join('\n');

      const llmResponse = await this.llm.prompt(
        'You are an elite football practice planner. Return only valid JSON that matches the provided schema.',
        prompt,
        {
          tier: 'extraction',
          outputSchema: {
            name: 'practice_script_draft',
            schema: PracticeScriptDraftSchema,
            strict: true,
          },
          temperature: 0.2,
          maxTokens: 2200,
        }
      );

      const parsedDraft = PracticeScriptDraftSchema.safeParse(llmResponse.content);
      if (parsedDraft.success) {
        draft = {
          title: parsedDraft.data.title,
          focus: parsedDraft.data.focus,
          tempo: parsedDraft.data.tempo,
          objectives: parsedDraft.data.objectives,
          periods: normalizePeriods(parsedDraft.data.periods),
          notes: normalizeOptionalText(parsedDraft.data.notes) ?? fallback.notes,
        };
      }
    } catch {
      // Fallback keeps generation resilient when provider limits or model errors occur.
    }

    return {
      success: true,
      markdown: `Generated practice script draft **${draft.title}** with **${draft.periods.length}** period(s).`,
      data: {
        practiceScriptDraft: {
          teamId: payload.teamId,
          playbookId: payload.playbookId,
          sport: payload.sport.toLowerCase(),
          title: draft.title,
          focus: draft.focus,
          tempo: normalizeOptionalText(payload.tempo) ?? draft.tempo,
          scriptDate: normalizeOptionalText(payload.scriptDate),
          opponent: normalizeOptionalText(payload.opponent),
          objectives: normalizeObjectives(draft.objectives),
          periods: draft.periods,
          notes: draft.notes,
        },
      },
    };
  }
}
