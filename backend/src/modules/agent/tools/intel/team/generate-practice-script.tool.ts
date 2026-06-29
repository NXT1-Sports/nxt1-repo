import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { UNIVERSAL_FILES_COLLECTION, getUniversalStructuredDocumentPayload } from '@nxt1/core';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import type { OpenRouterService } from '../../../llm/openrouter.service.js';
import {
  PracticeScriptPeriodSchema,
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

const GeneratePracticeScriptInputSchema = z
  .object({
    teamId: z.string().trim().min(1),
    playbookId: z.string().trim().min(1).optional(),
    sourceDocumentId: z.string().trim().min(1).optional(),
    sport: z.string().trim().min(1),
    focus: z.string().trim().min(1),
    tempo: z.string().trim().optional(),
    scriptDate: z.string().trim().optional(),
    opponent: z.string().trim().optional(),
  })
  .refine((value) => Boolean(value.sourceDocumentId ?? value.playbookId), {
    message: 'sourceDocumentId or playbookId is required',
    path: ['sourceDocumentId'],
  });

type PlaybookSourceDocument = {
  readonly id: string;
  readonly teamId: string;
  readonly title: string;
  readonly sport: string;
  readonly philosophy?: string;
  readonly plays: readonly Record<string, unknown>[];
};

function readPlaybookSourceDocument(
  documentId: string,
  data: Record<string, unknown>
): PlaybookSourceDocument | null {
  const teamId = typeof data['teamId'] === 'string' ? data['teamId'].trim() : '';
  if (!teamId) return null;

  const type = typeof data['type'] === 'string' ? data['type'].trim().toLowerCase() : '';
  const classificationPrimary =
    data['classification'] && typeof data['classification'] === 'object'
      ? typeof (data['classification'] as Record<string, unknown>)['primary'] === 'string'
        ? String((data['classification'] as Record<string, unknown>)['primary'])
            .trim()
            .toLowerCase()
        : ''
      : '';
  const classificationRoute =
    data['classification'] && typeof data['classification'] === 'object'
      ? typeof (data['classification'] as Record<string, unknown>)['route'] === 'string'
        ? String((data['classification'] as Record<string, unknown>)['route'])
            .trim()
            .toLowerCase()
        : ''
      : '';

  if (
    type !== 'playbook' &&
    !(
      type === 'file' &&
      (classificationPrimary === 'playbook' || classificationRoute === 'playbook')
    )
  ) {
    return null;
  }

  const structuredPayload = getUniversalStructuredDocumentPayload<'playbook'>(data['payload']);
  const payloadData = structuredPayload?.structuredData;
  const plays = Array.isArray(payloadData?.plays)
    ? (payloadData.plays as readonly Record<string, unknown>[])
    : [];
  const title =
    (typeof data['title'] === 'string' && data['title'].trim()) ||
    (typeof payloadData?.name === 'string' && payloadData.name.trim()) ||
    'Strategy Document';
  const sport =
    (typeof data['sport'] === 'string' && data['sport'].trim()) ||
    (typeof payloadData?.source === 'string' && payloadData.source.trim()) ||
    '';

  return {
    id: documentId,
    teamId,
    title,
    sport,
    ...(typeof (payloadData as { philosophy?: unknown } | undefined)?.philosophy === 'string' &&
    (payloadData as { philosophy: string }).philosophy.trim()
      ? { philosophy: (payloadData as { philosophy: string }).philosophy.trim() }
      : {}),
    plays,
  };
}

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
    const sourceDocumentId = payload.sourceDocumentId ?? payload.playbookId!;
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
      .collection(UNIVERSAL_FILES_COLLECTION)
      .doc(sourceDocumentId)
      .get();
    if (!playbookDoc.exists) {
      return { success: false, error: `Strategy document ${sourceDocumentId} not found.` };
    }

    const playbookData = readPlaybookSourceDocument(playbookDoc.id, playbookDoc.data() ?? {});
    if (!playbookData) {
      return {
        success: false,
        error: `Document ${sourceDocumentId} is not a supported strategy playbook file.`,
      };
    }

    if (playbookData.teamId !== payload.teamId) {
      return {
        success: false,
        error: `Strategy document ${sourceDocumentId} does not belong to team ${payload.teamId}.`,
      };
    }

    const fallback = buildFallbackPracticeScript(
      {
        name: playbookData.title,
        ...(playbookData.philosophy ? { philosophy: playbookData.philosophy } : {}),
        plays: playbookData.plays,
      },
      payload.focus
    );

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
        `Strategy file name: ${playbookData.title}`,
        `Strategy philosophy: ${playbookData.philosophy ?? 'Not provided'}`,
        `Play inventory: ${JSON.stringify(playbookData.plays, null, 2)}`,
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
          sourceDocumentId,
          playbookId: sourceDocumentId,
          sport: (playbookData.sport || payload.sport).toLowerCase(),
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
