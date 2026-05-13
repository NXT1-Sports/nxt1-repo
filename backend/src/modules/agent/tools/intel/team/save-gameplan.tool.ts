/**
 * @fileoverview Save Game Plan Tool — Atomic writer for matchup-specific strategy documents
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * Writes structured, sport-agnostic game plans to the `TeamGamePlans` collection.
 * Unlike `write_playbooks`, which stores reusable play inventory, this tool stores
 * weekly/opponent/situational strategy artifacts such as opening scripts, adjustment
 * triggers, halftime priorities, and sport-specific custom sections.
 */

import {
  type TeamGamePlanAdjustmentTrigger,
  type TeamGamePlanDoc,
  type TeamGamePlanPerspective,
  type TeamGamePlanPhase,
  type TeamGamePlanPlayReference,
  type TeamGamePlanPriority,
  type TeamGamePlanPriorityKind,
  type TeamGamePlanSection,
  type TeamGamePlanStatus,
} from '@nxt1/core';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logger } from '../../../../../utils/logger.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { resolveCreatedAt } from '../doc-date-utils.js';

const TEAM_GAMEPLANS_COLLECTION = 'TeamGamePlans';
const TEAMS_COLLECTION = 'Teams';
const DEFAULT_SOURCE = 'agent_x';
const MAX_OPENING_SCRIPT_ITEMS = 25;
const MAX_ADJUSTMENT_TRIGGERS = 50;
const MAX_HALFTIME_PRIORITIES = 6;
const MAX_CUSTOM_SECTIONS = 12;
const MAX_LINKED_PLAYS = 50;
const MAX_TAGS = 20;

const AdjustmentTriggerSchema = z
  .object({
    trigger: z.string().trim().min(1),
    diagnosis: z.string().trim().min(1).optional(),
    adjustment: z.string().trim().min(1),
    validationWindow: z.string().trim().min(1).optional(),
    expectedOutcome: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)).max(MAX_TAGS).optional(),
  })
  .passthrough();

const PrioritySchema = z
  .object({
    kind: z
      .enum([
        'offense',
        'defense',
        'execution',
        'special_teams',
        'transition',
        'set_piece',
        'custom',
      ])
      .optional(),
    label: z.string().trim().min(1),
    content: z.string().trim().min(1),
  })
  .passthrough();

const SectionSchema = z
  .object({
    key: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    content: z.string().trim().min(1),
    order: z.number().int().min(0).optional(),
    tags: z.array(z.string().trim().min(1)).max(MAX_TAGS).optional(),
  })
  .passthrough();

const PlayReferenceSchema = z
  .object({
    playbookId: z.string().trim().min(1).optional(),
    playName: z.string().trim().min(1),
    diagramUrl: z.string().url().optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .passthrough();

const SaveGameplanInputSchema = z
  .object({
    gamePlanId: z.string().trim().min(1).optional(),
    teamId: z.string().trim().min(1),
    sport: z.string().trim().min(1),
    title: z.string().trim().min(1),
    phase: z.enum(['pregame', 'in-game', 'postgame', 'scouting']).optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
    season: z.string().trim().min(1).optional(),
    division: z.string().trim().min(1).optional(),
    gameDate: z.string().trim().min(1).optional(),
    opponentId: z.string().trim().min(1).optional(),
    opponentName: z.string().trim().min(1).optional(),
    ownTeamColor: z.string().trim().min(1).optional(),
    opponentTeamColor: z.string().trim().min(1).optional(),
    perspectiveTeam: z.enum(['own', 'opponent', 'neutral']).optional(),
    identityFocus: z.string().trim().min(1).optional(),
    primaryAttackPlan: z.string().trim().min(1).optional(),
    defensivePriorities: z.string().trim().min(1).optional(),
    specialSituations: z.string().trim().min(1).optional(),
    openingScript: z.array(z.string().trim().min(1)).max(MAX_OPENING_SCRIPT_ITEMS).optional(),
    adjustmentTriggers: z.array(AdjustmentTriggerSchema).max(MAX_ADJUSTMENT_TRIGGERS).optional(),
    halftimePriorities: z.array(PrioritySchema).max(MAX_HALFTIME_PRIORITIES).optional(),
    customSections: z.array(SectionSchema).max(MAX_CUSTOM_SECTIONS).optional(),
    linkedPlays: z.array(PlayReferenceSchema).max(MAX_LINKED_PLAYS).optional(),
    tags: z.array(z.string().trim().min(1)).max(MAX_TAGS).optional(),
    source: z.string().trim().min(1).optional(),
    sourceUrl: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    const hasContent = Boolean(
      value.identityFocus ||
      value.primaryAttackPlan ||
      value.defensivePriorities ||
      value.specialSituations ||
      (value.openingScript?.length ?? 0) > 0 ||
      (value.adjustmentTriggers?.length ?? 0) > 0 ||
      (value.halftimePriorities?.length ?? 0) > 0 ||
      (value.customSections?.length ?? 0) > 0
    );

    if (!hasContent) {
      ctx.addIssue({
        code: 'custom',
        message:
          'At least one strategic content field is required (identityFocus, primaryAttackPlan, defensivePriorities, specialSituations, openingScript, adjustmentTriggers, halftimePriorities, or customSections).',
        path: ['title'],
      });
    }
  });

type SaveGameplanInput = z.infer<typeof SaveGameplanInputSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStringArray(values?: readonly string[]): readonly string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const normalized = Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
  return normalized.length > 0 ? normalized : undefined;
}

function buildAdjustmentTriggers(
  entries?: readonly z.infer<typeof AdjustmentTriggerSchema>[]
): readonly TeamGamePlanAdjustmentTrigger[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((entry) => ({
    trigger: entry.trigger.trim(),
    ...(entry.diagnosis ? { diagnosis: entry.diagnosis.trim() } : {}),
    adjustment: entry.adjustment.trim(),
    ...(entry.validationWindow ? { validationWindow: entry.validationWindow.trim() } : {}),
    ...(entry.expectedOutcome ? { expectedOutcome: entry.expectedOutcome.trim() } : {}),
    ...(normalizeStringArray(entry.tags) ? { tags: normalizeStringArray(entry.tags) } : {}),
  }));
}

function buildHalftimePriorities(
  entries?: readonly z.infer<typeof PrioritySchema>[]
): readonly TeamGamePlanPriority[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((entry) => ({
    kind: (entry.kind ?? 'custom') as TeamGamePlanPriorityKind,
    label: entry.label.trim(),
    content: entry.content.trim(),
  }));
}

function buildCustomSections(
  entries?: readonly z.infer<typeof SectionSchema>[]
): readonly TeamGamePlanSection[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((entry, index) => ({
    key: entry.key?.trim() || slugify(entry.title),
    title: entry.title.trim(),
    content: entry.content.trim(),
    ...(typeof entry.order === 'number' ? { order: entry.order } : { order: index }),
    ...(normalizeStringArray(entry.tags) ? { tags: normalizeStringArray(entry.tags) } : {}),
  }));
}

function buildLinkedPlays(
  entries?: readonly z.infer<typeof PlayReferenceSchema>[]
): readonly TeamGamePlanPlayReference[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((entry) => ({
    ...(entry.playbookId ? { playbookId: entry.playbookId.trim() } : {}),
    playName: entry.playName.trim(),
    ...(entry.diagramUrl ? { diagramUrl: entry.diagramUrl } : {}),
    ...(entry.notes ? { notes: entry.notes.trim() } : {}),
  }));
}

function buildDocId(input: SaveGameplanInput): string {
  if (input.gamePlanId) return input.gamePlanId.trim();

  const normalizedSport = slugify(input.sport);
  const scope = slugify(input.gameDate ?? input.season ?? 'open');
  const opponent = slugify(input.opponentName ?? 'general');
  const phase = slugify(input.phase ?? 'pregame');
  const stableLabel = input.opponentName ? opponent : slugify(input.title);

  return `${input.teamId}_${normalizedSport}_${phase}_${scope}_${stableLabel}`;
}

export class SaveGameplanTool extends BaseTool {
  readonly name = 'save_gameplan';

  readonly description =
    'Saves a matchup-specific or situational game plan to the TeamGamePlans collection.\n\n' +
    'Use this for weekly opponent prep, pregame strategy, scouting plans, halftime priorities, and in-game adjustment trees.\n' +
    'Do NOT use this for reusable play inventory — that belongs in `write_playbooks`.\n\n' +
    'Sport-agnostic structure:\n' +
    '  • Football — opening script, pressure answers, red-zone calls, halftime reset\n' +
    '  • Basketball — tempo plan, matchups, ATO package, press-break counters\n' +
    '  • Soccer — set-piece plan, press triggers, rest-defense priorities\n' +
    '  • Baseball/softball — pitcher attack plan, defensive alignments, leverage situations\n\n' +
    'Required:\n' +
    '- teamId, sport, title\n' +
    '- at least one strategic content field\n\n' +
    'Recommended fields:\n' +
    '- opponentName, gameDate, phase, status\n' +
    '- identityFocus, primaryAttackPlan, defensivePriorities, specialSituations\n' +
    '- openingScript[] for scripted calls / emphasis points\n' +
    '- adjustmentTriggers[] for if/then game management\n' +
    '- halftimePriorities[] for concise locker-room corrections\n' +
    '- customSections[] for sport-specific refinements\n' +
    '- linkedPlays[] to reference reusable plays already stored in TeamPlaybooks.';

  readonly parameters = SaveGameplanInputSchema;

  override readonly allowedAgents = ['strategy_coordinator'] as const;
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
    const parsed = SaveGameplanInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const payload = parsed.data;

    try {
      const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(payload.teamId).get();
      if (!teamDoc.exists) {
        return { success: false, error: `Team ${payload.teamId} not found.` };
      }

      const teamData = teamDoc.data() ?? {};
      const isAuthorized = await canManageTeamMutationForUser(
        this.db,
        context.userId,
        payload.teamId,
        teamData
      );

      if (!isAuthorized) {
        return { success: false, error: 'Not authorized to save game plans for this team.' };
      }

      const now = new Date().toISOString();
      const docId = buildDocId(payload);
      const docRef = this.db.collection(TEAM_GAMEPLANS_COLLECTION).doc(docId);
      const existingDoc = await docRef.get();

      if (existingDoc.exists) {
        const existingTeamId =
          typeof existingDoc.data()?.['teamId'] === 'string'
            ? (existingDoc.data()?.['teamId'] as string)
            : undefined;

        if (existingTeamId && existingTeamId !== payload.teamId) {
          return {
            success: false,
            error: 'Game plan ID does not belong to the requested team.',
          };
        }
      }

      const normalizedSport = payload.sport.trim().toLowerCase();
      const phase = (payload.phase ?? 'pregame') as TeamGamePlanPhase;
      const status = (payload.status ?? 'draft') as TeamGamePlanStatus;
      const source = (payload.source ?? DEFAULT_SOURCE).trim();

      context.emitStage?.('persisting_result', {
        icon: 'document',
        phase: 'save_gameplan',
        sport: normalizedSport,
        title: payload.title,
      });

      const linkedPlays = buildLinkedPlays(payload.linkedPlays);
      const linkedPlaybookIds = normalizeStringArray(
        linkedPlays
          ?.map((entry) => entry.playbookId)
          .filter((value): value is string => typeof value === 'string')
      );

      const openingScript = normalizeStringArray(payload.openingScript);
      const adjustmentTriggers = buildAdjustmentTriggers(payload.adjustmentTriggers);
      const halftimePriorities = buildHalftimePriorities(payload.halftimePriorities);
      const customSections = buildCustomSections(payload.customSections);
      const tags = normalizeStringArray(payload.tags);

      const docData: TeamGamePlanDoc = {
        id: docId,
        teamId: payload.teamId,
        sport: normalizedSport,
        title: payload.title.trim(),
        phase,
        status,
        ...(payload.season ? { season: payload.season.trim() } : {}),
        ...(payload.division ? { division: payload.division.trim() } : {}),
        ...(payload.gameDate ? { gameDate: payload.gameDate.trim() } : {}),
        ...(payload.opponentId ? { opponentId: payload.opponentId.trim() } : {}),
        ...(payload.opponentName ? { opponentName: payload.opponentName.trim() } : {}),
        ...(payload.ownTeamColor ? { ownTeamColor: payload.ownTeamColor.trim() } : {}),
        ...(payload.opponentTeamColor
          ? { opponentTeamColor: payload.opponentTeamColor.trim() }
          : {}),
        ...(payload.perspectiveTeam
          ? { perspectiveTeam: payload.perspectiveTeam as TeamGamePlanPerspective }
          : {}),
        ...(payload.identityFocus ? { identityFocus: payload.identityFocus.trim() } : {}),
        ...(payload.primaryAttackPlan
          ? { primaryAttackPlan: payload.primaryAttackPlan.trim() }
          : {}),
        ...(payload.defensivePriorities
          ? { defensivePriorities: payload.defensivePriorities.trim() }
          : {}),
        ...(payload.specialSituations
          ? { specialSituations: payload.specialSituations.trim() }
          : {}),
        ...(openingScript ? { openingScript } : {}),
        ...(adjustmentTriggers ? { adjustmentTriggers } : {}),
        ...(halftimePriorities ? { halftimePriorities } : {}),
        ...(customSections ? { customSections } : {}),
        ...(linkedPlays ? { linkedPlays } : {}),
        ...(tags ? { tags } : {}),
        ...(linkedPlaybookIds ? { linkedPlaybookIds } : {}),
        source,
        ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
        schemaVersion: 1,
        createdBy:
          typeof existingDoc.data()?.['createdBy'] === 'string'
            ? (existingDoc.data()?.['createdBy'] as string)
            : context.userId,
        updatedBy: context.userId,
        createdAt: resolveCreatedAt(existingDoc.data()?.['createdAt'], undefined, now),
        updatedAt: now,
      };

      await docRef.set(docData);

      try {
        const cache = getCacheService();
        await Promise.all([
          cache.del(`intel:team:${payload.teamId}`),
          cache.del(`team:gameplans:${payload.teamId}:${normalizedSport}`),
          cache.del(`team:profile:${payload.teamId}`),
        ]);
      } catch {
        // Best effort only.
      }

      const adjustmentCount = docData.adjustmentTriggers?.length ?? 0;
      const halftimeCount = docData.halftimePriorities?.length ?? 0;
      const customSectionCount = docData.customSections?.length ?? 0;

      logger.info('[SaveGameplanTool] Game plan saved', {
        docId,
        teamId: payload.teamId,
        sport: normalizedSport,
        title: docData.title,
        phase,
        status,
        opponentName: docData.opponentName,
      });

      const opponentLabel = docData.opponentName ? ` vs. ${docData.opponentName}` : '';

      return {
        success: true,
        markdown:
          `Saved game plan **${docData.title}**${opponentLabel}. ` +
          `Phase: ${phase}. Status: ${status}. ` +
          `Included ${adjustmentCount} adjustment trigger(s), ${halftimeCount} halftime priority item(s), and ${customSectionCount} custom section(s).`,
        data: {
          gamePlan: {
            id: docId,
            title: docData.title,
            sport: docData.sport,
            phase: docData.phase,
            status: docData.status,
            opponentName: docData.opponentName,
            gameDate: docData.gameDate,
            adjustmentTriggerCount: adjustmentCount,
            halftimePriorityCount: halftimeCount,
            customSectionCount,
            linkedPlayCount: docData.linkedPlays?.length ?? 0,
          },
          message: `Saved game plan "${docData.title}"${opponentLabel} (${docData.sport}).`,
        },
      };
    } catch (error) {
      logger.error('[SaveGameplanTool] Failed to save game plan', {
        teamId: payload.teamId,
        sport: payload.sport,
        title: payload.title,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save game plan',
      };
    }
  }
}
