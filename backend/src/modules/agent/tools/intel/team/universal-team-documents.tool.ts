import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type {
  TeamCallsheetDoc,
  TeamGamePlanDoc,
  TeamPracticeScriptDoc,
  UniversalFileDoc,
} from '@nxt1/core';
import { UNIVERSAL_FILES_COLLECTION } from '@nxt1/core';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import {
  getUniversalCallsheetById,
  getUniversalGamePlanById,
  getUniversalPracticeScriptById,
  saveUniversalCallsheet,
  saveUniversalGamePlan,
  saveUniversalPracticeScript,
} from '../../../../../services/team/universal-native-team-documents.service.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAMS_COLLECTION = 'Teams' as const;
const SUPPORTED_DOCUMENT_TYPES = ['game_plan', 'callsheet', 'practice_script'] as const;

type SupportedDocumentType = (typeof SUPPORTED_DOCUMENT_TYPES)[number];

const SupportedDocumentTypeSchema = z.enum(SUPPORTED_DOCUMENT_TYPES);

const CreateUniversalTeamDocumentInputSchema = z.object({
  fileType: SupportedDocumentTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

const ListUniversalTeamDocumentsInputSchema = z.object({
  teamId: z.string().trim().min(1),
  fileType: SupportedDocumentTypeSchema.optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  sport: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
});

const GetUniversalTeamDocumentInputSchema = z.object({
  documentId: z.string().trim().min(1),
  fileType: SupportedDocumentTypeSchema.optional(),
});

const UpdateUniversalTeamDocumentInputSchema = z.object({
  documentId: z.string().trim().min(1),
  fileType: SupportedDocumentTypeSchema.optional(),
  patch: z.record(z.string(), z.unknown()),
});

const DeleteUniversalTeamDocumentInputSchema = z.object({
  documentId: z.string().trim().min(1),
  fileType: SupportedDocumentTypeSchema.optional(),
  reason: z.string().trim().min(1).optional(),
});

function toPortableTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date(0).toISOString();
}

function toUniversalDocument(docId: string, data: Record<string, unknown>): UniversalFileDoc {
  const baseData = data as unknown as Partial<UniversalFileDoc>;
  return {
    ...baseData,
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['lastSeenAt'] ? { lastSeenAt: toPortableTimestamp(data['lastSeenAt']) } : {}),
  } as UniversalFileDoc;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry).trim()))
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function buildGamePlanId(
  payload: Record<string, unknown>,
  teamId: string,
  sport: string,
  title: string
): string {
  const explicitId = normalizeString(payload['gamePlanId'] ?? payload['id']);
  if (explicitId) {
    return explicitId;
  }

  const phase = normalizeString(payload['phase']) ?? 'pregame';
  const scope = normalizeString(payload['gameDate'] ?? payload['season']) ?? 'open';
  const opponentSeed = normalizeString(payload['opponentName']) ?? title;
  return `${teamId}_${slugify(sport)}_${slugify(phase)}_${slugify(scope)}_${slugify(opponentSeed)}`;
}

function buildPlaybookDocumentId(
  payload: Record<string, unknown>,
  playbookId: string,
  title: string,
  fallback: string
): string {
  const explicitId = normalizeString(payload['id']);
  if (explicitId) {
    return explicitId;
  }

  const now = new Date().toISOString();
  const slugSeed = slugify(`${title}-${now}`);
  return `${playbookId}_${slugSeed || fallback}`;
}

function isArchivedDocument(document: UniversalFileDoc): boolean {
  if (document.status === 'archived') {
    return true;
  }

  if (document.payloadKind !== 'native') {
    return false;
  }

  if (document.type === 'callsheet' || document.type === 'practice_script') {
    return document.payload.archived === true;
  }

  return false;
}

function matchesQuery(document: UniversalFileDoc, normalizedQuery: string | undefined): boolean {
  if (!normalizedQuery) {
    return true;
  }

  const nativeNotes =
    document.payloadKind === 'native' && document.type === 'callsheet'
      ? document.payload.notes
      : document.payloadKind === 'native' && document.type === 'practice_script'
        ? document.payload.notes
        : undefined;

  const haystack = [
    document.title,
    document.summary,
    document.sport,
    document.type,
    document.payloadKind === 'native' && document.type === 'game_plan'
      ? document.payload.opponentName
      : undefined,
    document.payloadKind === 'native' && document.type === 'callsheet'
      ? document.payload.situation
      : undefined,
    document.payloadKind === 'native' && document.type === 'practice_script'
      ? document.payload.focus
      : undefined,
    nativeNotes,
  ]
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function compareByUpdatedAtDesc(left: UniversalFileDoc, right: UniversalFileDoc): number {
  return (
    Date.parse(toPortableTimestamp(right.updatedAt)) -
    Date.parse(toPortableTimestamp(left.updatedAt))
  );
}

function summarizeUniversalDocument(document: UniversalFileDoc): Record<string, unknown> {
  return {
    id: document.id,
    teamId: document.teamId,
    fileType: document.type,
    title: document.title,
    sport: document.sport,
    status: document.status,
    payloadKind: document.payloadKind,
    updatedAt: document.updatedAt,
    createdAt: document.createdAt,
    summary: document.summary,
    ...(document.payloadKind === 'native' && document.type === 'game_plan'
      ? {
          opponentName: document.payload.opponentName,
          phase: document.payload.phase,
          gameDate: document.payload.gameDate,
        }
      : {}),
    ...(document.payloadKind === 'native' && document.type === 'callsheet'
      ? {
          playbookId: document.payload.playbookId,
          situation: document.payload.situation,
          playCount: document.payload.playCount ?? document.payload.plays?.length ?? 0,
          groupCount: document.payload.groupCount ?? document.payload.groups?.length ?? 0,
          archived: document.payload.archived === true,
        }
      : {}),
    ...(document.payloadKind === 'native' && document.type === 'practice_script'
      ? {
          playbookId: document.payload.playbookId,
          focus: document.payload.focus,
          tempo: document.payload.tempo,
          scriptDate: document.payload.scriptDate,
          opponent: document.payload.opponent,
          periodCount: document.payload.periods?.length ?? 0,
          archived: document.payload.archived === true,
        }
      : {}),
  };
}

async function assertManagePermission(
  db: Firestore,
  teamId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const teamDoc = await db.collection(TEAMS_COLLECTION).doc(teamId).get();
  if (!teamDoc.exists) {
    return { ok: false, error: `Team ${teamId} not found.` };
  }

  const authorized = await canManageTeamMutationForUser(db, userId, teamId, teamDoc.data() ?? {});
  if (!authorized) {
    return { ok: false, error: 'Not authorized to access team documents for this team.' };
  }

  return { ok: true };
}

async function loadUniversalDocument(
  db: Firestore,
  documentId: string
): Promise<UniversalFileDoc | null> {
  const snapshot = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(documentId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toUniversalDocument(snapshot.id, snapshot.data() ?? {});
}

async function resolveSupportedDocumentType(
  db: Firestore,
  documentId: string,
  explicitType?: SupportedDocumentType
): Promise<{ ok: true; fileType: SupportedDocumentType } | { ok: false; error: string }> {
  if (explicitType) {
    return { ok: true, fileType: explicitType };
  }

  const universalDocument = await loadUniversalDocument(db, documentId);
  if (!universalDocument) {
    return {
      ok: false,
      error:
        'Document not found in UniversalFiles. Provide fileType explicitly or backfill legacy data first.',
    };
  }

  if (
    universalDocument.type !== 'game_plan' &&
    universalDocument.type !== 'callsheet' &&
    universalDocument.type !== 'practice_script'
  ) {
    return {
      ok: false,
      error: `Universal document ${documentId} is type ${universalDocument.type}, which is not supported by these universal tools.`,
    };
  }

  return { ok: true, fileType: universalDocument.type };
}

abstract class UniversalTeamDocumentMutationTool extends BaseTool {
  protected readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  protected requireUserId(context?: ToolExecutionContext): string | null {
    return context?.userId ?? null;
  }
}

export class CreateUniversalTeamDocumentTool extends UniversalTeamDocumentMutationTool {
  readonly name = 'create_universal_team_document';
  readonly description =
    'Create a team document through the universal document surface. Supported fileType values: game_plan, callsheet, practice_script.';

  readonly parameters = CreateUniversalTeamDocumentInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CreateUniversalTeamDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const { fileType, payload } = parsed.data;
    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const teamId = normalizeString(payload['teamId']);
    if (!teamId) {
      return { success: false, error: 'payload.teamId is required.' };
    }

    const permission = await assertManagePermission(this.db, teamId, userId);
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const now = new Date().toISOString();

    if (fileType === 'game_plan') {
      const sport = normalizeString(payload['sport'])?.toLowerCase();
      const title = normalizeString(payload['title']);
      if (!sport || !title) {
        return { success: false, error: 'Game plans require payload.sport and payload.title.' };
      }

      const gamePlan: TeamGamePlanDoc = {
        id: buildGamePlanId(payload, teamId, sport, title),
        teamId,
        sport,
        title,
        phase: (normalizeString(payload['phase']) ?? 'pregame') as TeamGamePlanDoc['phase'],
        status: (normalizeString(payload['status']) ?? 'draft') as TeamGamePlanDoc['status'],
        ...(normalizeString(payload['season'])
          ? { season: normalizeString(payload['season']) }
          : {}),
        ...(normalizeString(payload['division'])
          ? { division: normalizeString(payload['division']) }
          : {}),
        ...(normalizeString(payload['gameDate'])
          ? { gameDate: normalizeString(payload['gameDate']) }
          : {}),
        ...(normalizeString(payload['opponentId'])
          ? { opponentId: normalizeString(payload['opponentId']) }
          : {}),
        ...(normalizeString(payload['opponentName'])
          ? { opponentName: normalizeString(payload['opponentName']) }
          : {}),
        ...(normalizeString(payload['ownTeamColor'])
          ? { ownTeamColor: normalizeString(payload['ownTeamColor']) }
          : {}),
        ...(normalizeString(payload['opponentTeamColor'])
          ? { opponentTeamColor: normalizeString(payload['opponentTeamColor']) }
          : {}),
        ...(normalizeString(payload['perspectiveTeam'])
          ? {
              perspectiveTeam: normalizeString(
                payload['perspectiveTeam']
              ) as TeamGamePlanDoc['perspectiveTeam'],
            }
          : {}),
        ...(normalizeString(payload['identityFocus'])
          ? { identityFocus: normalizeString(payload['identityFocus']) }
          : {}),
        ...(normalizeString(payload['primaryAttackPlan'])
          ? { primaryAttackPlan: normalizeString(payload['primaryAttackPlan']) }
          : {}),
        ...(normalizeString(payload['defensivePriorities'])
          ? { defensivePriorities: normalizeString(payload['defensivePriorities']) }
          : {}),
        ...(normalizeString(payload['specialSituations'])
          ? { specialSituations: normalizeString(payload['specialSituations']) }
          : {}),
        ...(normalizeStringArray(payload['openingScript'])
          ? { openingScript: normalizeStringArray(payload['openingScript']) }
          : {}),
        ...(Array.isArray(payload['strengthsWeaknesses'])
          ? {
              strengthsWeaknesses: payload[
                'strengthsWeaknesses'
              ] as TeamGamePlanDoc['strengthsWeaknesses'],
            }
          : {}),
        ...(Array.isArray(payload['priorities'])
          ? { priorities: payload['priorities'] as TeamGamePlanDoc['priorities'] }
          : {}),
        ...(Array.isArray(payload['planBlocks'])
          ? { planBlocks: payload['planBlocks'] as TeamGamePlanDoc['planBlocks'] }
          : {}),
        ...(Array.isArray(payload['adjustmentTriggers'])
          ? {
              adjustmentTriggers: payload[
                'adjustmentTriggers'
              ] as TeamGamePlanDoc['adjustmentTriggers'],
            }
          : {}),
        ...(Array.isArray(payload['halftimePriorities'])
          ? {
              halftimePriorities: payload[
                'halftimePriorities'
              ] as TeamGamePlanDoc['halftimePriorities'],
            }
          : {}),
        ...(Array.isArray(payload['customSections'])
          ? { customSections: payload['customSections'] as TeamGamePlanDoc['customSections'] }
          : {}),
        ...(Array.isArray(payload['linkedPlays'])
          ? { linkedPlays: payload['linkedPlays'] as TeamGamePlanDoc['linkedPlays'] }
          : {}),
        ...(normalizeStringArray(payload['tags'])
          ? { tags: normalizeStringArray(payload['tags']) }
          : {}),
        ...(normalizeStringArray(payload['linkedPlaybookIds'])
          ? { linkedPlaybookIds: normalizeStringArray(payload['linkedPlaybookIds']) }
          : {}),
        ...(normalizeString(payload['scoutingReport'])
          ? { scoutingReport: normalizeString(payload['scoutingReport']) }
          : {}),
        source: normalizeString(payload['source']) ?? 'agent_x',
        ...(normalizeString(payload['sourceUrl'])
          ? { sourceUrl: normalizeString(payload['sourceUrl']) }
          : {}),
        schemaVersion:
          typeof payload['schemaVersion'] === 'number' && Number.isFinite(payload['schemaVersion'])
            ? payload['schemaVersion']
            : 2,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      await saveUniversalGamePlan(this.db, gamePlan);
      const universalDocument = await loadUniversalDocument(this.db, gamePlan.id);
      return {
        success: true,
        markdown: `Created universal team document **${gamePlan.title}** (game_plan).`,
        data: {
          gamePlan,
          universalDocument,
          summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
        },
      };
    }

    if (fileType === 'callsheet') {
      const playbookId = normalizeString(payload['playbookId']);
      const title = normalizeString(payload['title']);
      if (!playbookId || !title) {
        return {
          success: false,
          error: 'Callsheets require payload.playbookId and payload.title.',
        };
      }

      const callsheet: TeamCallsheetDoc = {
        id: buildPlaybookDocumentId(payload, playbookId, title, 'callsheet'),
        teamId,
        playbookId,
        ...(normalizeString(payload['sport']) ? { sport: normalizeString(payload['sport']) } : {}),
        title,
        ...(normalizeString(payload['situation'])
          ? { situation: normalizeString(payload['situation']) }
          : {}),
        ...(isRecord(payload['filters'])
          ? { filters: payload['filters'] as TeamCallsheetDoc['filters'] }
          : {}),
        ...(Array.isArray(payload['plays'])
          ? { plays: payload['plays'] as TeamCallsheetDoc['plays'] }
          : {}),
        ...(Array.isArray(payload['groups'])
          ? { groups: payload['groups'] as TeamCallsheetDoc['groups'] }
          : {}),
        ...(normalizeString(payload['notes']) ? { notes: normalizeString(payload['notes']) } : {}),
        source: normalizeString(payload['source']) ?? 'agent_x',
        archived: payload['archived'] === true,
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId,
      };

      await saveUniversalCallsheet(this.db, callsheet);
      const universalDocument = await loadUniversalDocument(this.db, callsheet.id);
      return {
        success: true,
        markdown: `Created universal team document **${callsheet.title}** (callsheet).`,
        data: {
          callsheet,
          universalDocument,
          summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
        },
      };
    }

    const playbookId = normalizeString(payload['playbookId']);
    const title = normalizeString(payload['title']);
    if (!playbookId || !title) {
      return {
        success: false,
        error: 'Practice scripts require payload.playbookId and payload.title.',
      };
    }

    const practiceScript: TeamPracticeScriptDoc = {
      id: buildPlaybookDocumentId(payload, playbookId, title, 'practice-script'),
      teamId,
      playbookId,
      ...(normalizeString(payload['sport']) ? { sport: normalizeString(payload['sport']) } : {}),
      title,
      ...(normalizeString(payload['focus']) ? { focus: normalizeString(payload['focus']) } : {}),
      ...(normalizeString(payload['tempo']) ? { tempo: normalizeString(payload['tempo']) } : {}),
      ...(normalizeString(payload['scriptDate'])
        ? { scriptDate: normalizeString(payload['scriptDate']) }
        : {}),
      ...(normalizeString(payload['opponent'])
        ? { opponent: normalizeString(payload['opponent']) }
        : {}),
      ...(normalizeStringArray(payload['objectives'])
        ? { objectives: normalizeStringArray(payload['objectives']) }
        : {}),
      ...(Array.isArray(payload['periods'])
        ? { periods: payload['periods'] as TeamPracticeScriptDoc['periods'] }
        : {}),
      ...(normalizeString(payload['notes']) ? { notes: normalizeString(payload['notes']) } : {}),
      source: normalizeString(payload['source']) ?? 'agent_x',
      ...(typeof payload['displayOrder'] === 'number' && Number.isFinite(payload['displayOrder'])
        ? { displayOrder: payload['displayOrder'] }
        : {}),
      archived: payload['archived'] === true,
      createdAt: now,
      createdBy: userId,
      updatedAt: now,
      updatedBy: userId,
    };

    await saveUniversalPracticeScript(this.db, practiceScript);
    const universalDocument = await loadUniversalDocument(this.db, practiceScript.id);
    return {
      success: true,
      markdown: `Created universal team document **${practiceScript.title}** (practice_script).`,
      data: {
        practiceScript,
        universalDocument,
        summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
      },
    };
  }
}

export class ListUniversalTeamDocumentsTool extends BaseTool {
  readonly name = 'list_universal_team_documents';
  readonly description =
    'List or search team documents from UniversalFiles. Supports game_plan, callsheet, and practice_script.';

  readonly parameters = ListUniversalTeamDocumentsInputSchema;
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
    const parsed = ListUniversalTeamDocumentsInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const payload = parsed.data;
    const permission = await assertManagePermission(this.db, payload.teamId, context.userId);
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const limit = payload.limit ?? 25;
    const normalizedSport = normalizeText(payload.sport);
    const normalizedQuery = normalizeText(payload.query);
    const includeArchived = payload.includeArchived === true;

    const snapshot = await this.db
      .collection(UNIVERSAL_FILES_COLLECTION)
      .where('teamId', '==', payload.teamId)
      .limit(Math.max(limit * 4, 80))
      .get();

    const documents = snapshot.docs
      .map((doc) => toUniversalDocument(doc.id, doc.data() ?? {}))
      .filter(
        (document) =>
          document.type === 'game_plan' ||
          document.type === 'callsheet' ||
          document.type === 'practice_script'
      )
      .filter((document) => (payload.fileType ? document.type === payload.fileType : true))
      .filter((document) => (includeArchived ? true : !isArchivedDocument(document)))
      .filter((document) =>
        normalizedSport ? normalizeText(document.sport) === normalizedSport : true
      )
      .filter((document) => matchesQuery(document, normalizedQuery))
      .sort(compareByUpdatedAtDesc)
      .slice(0, limit);

    const summaries = documents.map((document) => summarizeUniversalDocument(document));

    return {
      success: true,
      markdown:
        summaries.length === 0
          ? 'No universal team documents matched the requested filters.'
          : `Found ${summaries.length} universal team document(s).`,
      data: {
        documents: summaries,
      },
    };
  }
}

export class GetUniversalTeamDocumentTool extends BaseTool {
  readonly name = 'get_universal_team_document';
  readonly description =
    'Load a single team document from UniversalFiles. Supports game_plan, callsheet, and practice_script.';

  readonly parameters = GetUniversalTeamDocumentInputSchema;
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
    const parsed = GetUniversalTeamDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { documentId, fileType } = parsed.data;
    const universalDocument = await loadUniversalDocument(this.db, documentId);
    if (!universalDocument) {
      return { success: false, error: `Universal document ${documentId} not found.` };
    }

    if (fileType && universalDocument.type !== fileType) {
      return {
        success: false,
        error: `Universal document ${documentId} is type ${universalDocument.type}, not ${fileType}.`,
      };
    }

    if (
      universalDocument.type !== 'game_plan' &&
      universalDocument.type !== 'callsheet' &&
      universalDocument.type !== 'practice_script'
    ) {
      return {
        success: false,
        error: `Universal document ${documentId} is type ${universalDocument.type}, which is not supported by these universal tools.`,
      };
    }

    const permission = await assertManagePermission(
      this.db,
      universalDocument.teamId,
      context.userId
    );
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    return {
      success: true,
      markdown: `Loaded universal team document **${universalDocument.title}** (${universalDocument.type}).`,
      data: {
        document: universalDocument,
        summary: summarizeUniversalDocument(universalDocument),
      },
    };
  }
}

export class UpdateUniversalTeamDocumentTool extends UniversalTeamDocumentMutationTool {
  readonly name = 'update_universal_team_document';
  readonly description =
    'Update a team document through the universal document surface. Supports game_plan, callsheet, and practice_script.';

  readonly parameters = UpdateUniversalTeamDocumentInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateUniversalTeamDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const { documentId, fileType, patch } = parsed.data;
    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const resolvedType = await resolveSupportedDocumentType(this.db, documentId, fileType);
    if (!resolvedType.ok) {
      return { success: false, error: resolvedType.error };
    }

    if (resolvedType.fileType === 'game_plan') {
      const existing = await getUniversalGamePlanById(this.db, documentId);
      if (!existing) {
        return { success: false, error: `Game plan ${documentId} not found.` };
      }

      const permission = await assertManagePermission(this.db, existing.teamId, userId);
      if (!permission.ok) {
        return { success: false, error: permission.error };
      }

      const updated: TeamGamePlanDoc = {
        ...existing,
        ...(normalizeString(patch['title']) ? { title: normalizeString(patch['title']) } : {}),
        ...(normalizeString(patch['sport'])
          ? { sport: normalizeString(patch['sport'])!.toLowerCase() }
          : {}),
        ...(normalizeString(patch['phase'])
          ? { phase: normalizeString(patch['phase']) as TeamGamePlanDoc['phase'] }
          : {}),
        ...(normalizeString(patch['status'])
          ? { status: normalizeString(patch['status']) as TeamGamePlanDoc['status'] }
          : {}),
        ...(normalizeString(patch['season']) ? { season: normalizeString(patch['season']) } : {}),
        ...(normalizeString(patch['division'])
          ? { division: normalizeString(patch['division']) }
          : {}),
        ...(normalizeString(patch['gameDate'])
          ? { gameDate: normalizeString(patch['gameDate']) }
          : {}),
        ...(normalizeString(patch['opponentId'])
          ? { opponentId: normalizeString(patch['opponentId']) }
          : {}),
        ...(normalizeString(patch['opponentName'])
          ? { opponentName: normalizeString(patch['opponentName']) }
          : {}),
        ...(normalizeString(patch['ownTeamColor'])
          ? { ownTeamColor: normalizeString(patch['ownTeamColor']) }
          : {}),
        ...(normalizeString(patch['opponentTeamColor'])
          ? { opponentTeamColor: normalizeString(patch['opponentTeamColor']) }
          : {}),
        ...(normalizeString(patch['perspectiveTeam'])
          ? {
              perspectiveTeam: normalizeString(
                patch['perspectiveTeam']
              ) as TeamGamePlanDoc['perspectiveTeam'],
            }
          : {}),
        ...(normalizeString(patch['identityFocus'])
          ? { identityFocus: normalizeString(patch['identityFocus']) }
          : {}),
        ...(normalizeString(patch['primaryAttackPlan'])
          ? { primaryAttackPlan: normalizeString(patch['primaryAttackPlan']) }
          : {}),
        ...(normalizeString(patch['defensivePriorities'])
          ? { defensivePriorities: normalizeString(patch['defensivePriorities']) }
          : {}),
        ...(normalizeString(patch['specialSituations'])
          ? { specialSituations: normalizeString(patch['specialSituations']) }
          : {}),
        ...(normalizeStringArray(patch['openingScript'])
          ? { openingScript: normalizeStringArray(patch['openingScript']) }
          : {}),
        ...(Array.isArray(patch['strengthsWeaknesses'])
          ? {
              strengthsWeaknesses: patch[
                'strengthsWeaknesses'
              ] as TeamGamePlanDoc['strengthsWeaknesses'],
            }
          : {}),
        ...(Array.isArray(patch['priorities'])
          ? { priorities: patch['priorities'] as TeamGamePlanDoc['priorities'] }
          : {}),
        ...(Array.isArray(patch['planBlocks'])
          ? { planBlocks: patch['planBlocks'] as TeamGamePlanDoc['planBlocks'] }
          : {}),
        ...(Array.isArray(patch['adjustmentTriggers'])
          ? {
              adjustmentTriggers: patch[
                'adjustmentTriggers'
              ] as TeamGamePlanDoc['adjustmentTriggers'],
            }
          : {}),
        ...(Array.isArray(patch['halftimePriorities'])
          ? {
              halftimePriorities: patch[
                'halftimePriorities'
              ] as TeamGamePlanDoc['halftimePriorities'],
            }
          : {}),
        ...(Array.isArray(patch['customSections'])
          ? { customSections: patch['customSections'] as TeamGamePlanDoc['customSections'] }
          : {}),
        ...(Array.isArray(patch['linkedPlays'])
          ? { linkedPlays: patch['linkedPlays'] as TeamGamePlanDoc['linkedPlays'] }
          : {}),
        ...(normalizeStringArray(patch['tags'])
          ? { tags: normalizeStringArray(patch['tags']) }
          : {}),
        ...(normalizeStringArray(patch['linkedPlaybookIds'])
          ? { linkedPlaybookIds: normalizeStringArray(patch['linkedPlaybookIds']) }
          : {}),
        ...(normalizeString(patch['scoutingReport'])
          ? { scoutingReport: normalizeString(patch['scoutingReport']) }
          : {}),
        ...(normalizeString(patch['source']) ? { source: normalizeString(patch['source']) } : {}),
        ...(normalizeString(patch['sourceUrl'])
          ? { sourceUrl: normalizeString(patch['sourceUrl']) }
          : {}),
        ...(typeof patch['schemaVersion'] === 'number' && Number.isFinite(patch['schemaVersion'])
          ? { schemaVersion: patch['schemaVersion'] }
          : {}),
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await saveUniversalGamePlan(this.db, updated);
      const universalDocument = await loadUniversalDocument(this.db, updated.id);
      return {
        success: true,
        markdown: `Updated universal team document **${updated.title}** (game_plan).`,
        data: {
          gamePlan: updated,
          universalDocument,
          summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
        },
      };
    }

    if (resolvedType.fileType === 'callsheet') {
      const existing = await getUniversalCallsheetById(this.db, documentId);
      if (!existing) {
        return { success: false, error: `Callsheet ${documentId} not found.` };
      }

      const permission = await assertManagePermission(this.db, existing.teamId, userId);
      if (!permission.ok) {
        return { success: false, error: permission.error };
      }

      const updated: TeamCallsheetDoc = {
        ...existing,
        ...(normalizeString(patch['playbookId'])
          ? { playbookId: normalizeString(patch['playbookId']) }
          : {}),
        ...(normalizeString(patch['sport']) ? { sport: normalizeString(patch['sport']) } : {}),
        ...(normalizeString(patch['title']) ? { title: normalizeString(patch['title']) } : {}),
        ...(normalizeString(patch['situation'])
          ? { situation: normalizeString(patch['situation']) }
          : {}),
        ...(isRecord(patch['filters'])
          ? { filters: patch['filters'] as TeamCallsheetDoc['filters'] }
          : {}),
        ...(Array.isArray(patch['plays'])
          ? { plays: patch['plays'] as TeamCallsheetDoc['plays'] }
          : {}),
        ...(Array.isArray(patch['groups'])
          ? { groups: patch['groups'] as TeamCallsheetDoc['groups'] }
          : {}),
        ...(normalizeString(patch['notes']) ? { notes: normalizeString(patch['notes']) } : {}),
        ...(normalizeString(patch['source']) ? { source: normalizeString(patch['source']) } : {}),
        ...(typeof patch['archived'] === 'boolean' ? { archived: patch['archived'] } : {}),
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };

      await saveUniversalCallsheet(this.db, updated);
      const universalDocument = await loadUniversalDocument(this.db, updated.id);
      return {
        success: true,
        markdown: `Updated universal team document **${updated.title}** (callsheet).`,
        data: {
          callsheet: updated,
          universalDocument,
          summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
        },
      };
    }

    const existing = await getUniversalPracticeScriptById(this.db, documentId);
    if (!existing) {
      return { success: false, error: `Practice script ${documentId} not found.` };
    }

    const permission = await assertManagePermission(this.db, existing.teamId, userId);
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const updated: TeamPracticeScriptDoc = {
      ...existing,
      ...(normalizeString(patch['playbookId'])
        ? { playbookId: normalizeString(patch['playbookId']) }
        : {}),
      ...(normalizeString(patch['sport']) ? { sport: normalizeString(patch['sport']) } : {}),
      ...(normalizeString(patch['title']) ? { title: normalizeString(patch['title']) } : {}),
      ...(normalizeString(patch['focus']) ? { focus: normalizeString(patch['focus']) } : {}),
      ...(normalizeString(patch['tempo']) ? { tempo: normalizeString(patch['tempo']) } : {}),
      ...(normalizeString(patch['scriptDate'])
        ? { scriptDate: normalizeString(patch['scriptDate']) }
        : {}),
      ...(normalizeString(patch['opponent'])
        ? { opponent: normalizeString(patch['opponent']) }
        : {}),
      ...(normalizeStringArray(patch['objectives'])
        ? { objectives: normalizeStringArray(patch['objectives']) }
        : {}),
      ...(Array.isArray(patch['periods'])
        ? { periods: patch['periods'] as TeamPracticeScriptDoc['periods'] }
        : {}),
      ...(normalizeString(patch['notes']) ? { notes: normalizeString(patch['notes']) } : {}),
      ...(normalizeString(patch['source']) ? { source: normalizeString(patch['source']) } : {}),
      ...(typeof patch['displayOrder'] === 'number' && Number.isFinite(patch['displayOrder'])
        ? { displayOrder: patch['displayOrder'] }
        : {}),
      ...(typeof patch['archived'] === 'boolean' ? { archived: patch['archived'] } : {}),
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    };

    await saveUniversalPracticeScript(this.db, updated);
    const universalDocument = await loadUniversalDocument(this.db, updated.id);
    return {
      success: true,
      markdown: `Updated universal team document **${updated.title}** (practice_script).`,
      data: {
        practiceScript: updated,
        universalDocument,
        summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
      },
    };
  }
}

export class DeleteUniversalTeamDocumentTool extends UniversalTeamDocumentMutationTool {
  readonly name = 'delete_universal_team_document';
  readonly description =
    'Archive or delete a team document through the universal document surface. Supports game_plan, callsheet, and practice_script.';

  readonly parameters = DeleteUniversalTeamDocumentInputSchema;
  override readonly allowedAgents = ['router', 'strategy_coordinator'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteUniversalTeamDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const { documentId, fileType, reason } = parsed.data;
    void reason;
    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const resolvedType = await resolveSupportedDocumentType(this.db, documentId, fileType);
    if (!resolvedType.ok) {
      return { success: false, error: resolvedType.error };
    }

    if (resolvedType.fileType === 'game_plan') {
      const existing = await getUniversalGamePlanById(this.db, documentId);
      if (!existing) {
        return { success: false, error: `Game plan ${documentId} not found.` };
      }

      const permission = await assertManagePermission(this.db, existing.teamId, userId);
      if (!permission.ok) {
        return { success: false, error: permission.error };
      }

      const archived: TeamGamePlanDoc = {
        ...existing,
        status: 'archived',
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };
      await saveUniversalGamePlan(this.db, archived);
      const universalDocument = await loadUniversalDocument(this.db, archived.id);
      return {
        success: true,
        markdown: `Archived universal team document **${archived.title}** (game_plan).`,
        data: {
          archived: true,
          gamePlan: archived,
          universalDocument,
          summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
        },
      };
    }

    if (resolvedType.fileType === 'callsheet') {
      const existing = await getUniversalCallsheetById(this.db, documentId);
      if (!existing) {
        return { success: false, error: `Callsheet ${documentId} not found.` };
      }

      const permission = await assertManagePermission(this.db, existing.teamId, userId);
      if (!permission.ok) {
        return { success: false, error: permission.error };
      }

      const archived: TeamCallsheetDoc = {
        ...existing,
        archived: true,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };
      await saveUniversalCallsheet(this.db, archived);
      const universalDocument = await loadUniversalDocument(this.db, archived.id);
      return {
        success: true,
        markdown: `Archived universal team document **${archived.title}** (callsheet).`,
        data: {
          archived: true,
          callsheet: archived,
          universalDocument,
          summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
        },
      };
    }

    const existing = await getUniversalPracticeScriptById(this.db, documentId);
    if (!existing) {
      return { success: false, error: `Practice script ${documentId} not found.` };
    }

    const permission = await assertManagePermission(this.db, existing.teamId, userId);
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const archived: TeamPracticeScriptDoc = {
      ...existing,
      archived: true,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    };
    await saveUniversalPracticeScript(this.db, archived);
    const universalDocument = await loadUniversalDocument(this.db, archived.id);
    return {
      success: true,
      markdown: `Archived universal team document **${archived.title}** (practice_script).`,
      data: {
        archived: true,
        practiceScript: archived,
        universalDocument,
        summary: universalDocument ? summarizeUniversalDocument(universalDocument) : undefined,
      },
    };
  }
}
