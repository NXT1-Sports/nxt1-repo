import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { logger } from '../../../../../utils/logger.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import {
  buildPlayIndexes,
  createPlayKey,
  ensurePlayId,
  findPlayIndexById,
  PLAYBOOKS_COLLECTION,
  sanitizePlayBreakdown,
  TEAMS_COLLECTION,
} from './playbook-play.utils.js';
import { syncPlaybookDiagramAsset } from './playbook-diagram-asset.util.js';

const SharedStringFields = [
  'series',
  'category',
  'formation',
  'personnel',
  'downDistance',
  'objective',
  'playBreakdown',
  'installNotes',
  'diagramUrl',
  'videoUrl',
] as const;

const DiagramAssetIdSchema = z.string().trim().min(1);

const AddPlayToPlaybookInputSchema = z.object({
  playbookId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  series: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  formation: z.string().trim().min(1).optional(),
  personnel: z.string().trim().min(1).optional(),
  downDistance: z.string().trim().min(1).optional(),
  objective: z.string().trim().min(1).optional(),
  playBreakdown: z.string().trim().min(1).optional(),
  installNotes: z.string().trim().min(1).optional(),
  diagramUrl: z.string().trim().min(1).optional(),
  diagramAssetId: DiagramAssetIdSchema.optional(),
  videoUrl: z.string().trim().min(1).optional(),
  conceptTags: z.array(z.string().trim().min(1)).optional(),
  tags: z.array(z.string().trim().min(1)).optional(),
  installStage: z.enum(['install', 'rep', 'game-ready']).optional(),
  coachingPoints: z.array(z.string().trim().min(1)).optional(),
  commonBusts: z.array(z.string().trim().min(1)).optional(),
  correctionCues: z.array(z.string().trim().min(1)).optional(),
  drillProgression: z.array(z.string().trim().min(1)).optional(),
  situations: z.array(z.string().trim().min(1)).optional(),
  sourcePlayId: z.string().trim().min(1).optional(),
});

const UpdatePlayInPlaybookInputSchema = z
  .object({
    playbookId: z.string().trim().min(1),
    playId: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    series: z.string().trim().min(1).nullable().optional(),
    category: z.string().trim().min(1).nullable().optional(),
    formation: z.string().trim().min(1).nullable().optional(),
    personnel: z.string().trim().min(1).nullable().optional(),
    downDistance: z.string().trim().min(1).nullable().optional(),
    objective: z.string().trim().min(1).nullable().optional(),
    playBreakdown: z.string().trim().min(1).nullable().optional(),
    installNotes: z.string().trim().min(1).nullable().optional(),
    diagramUrl: z.string().trim().min(1).nullable().optional(),
    diagramAssetId: DiagramAssetIdSchema.nullable().optional(),
    videoUrl: z.string().trim().min(1).nullable().optional(),
    conceptTags: z.array(z.string().trim().min(1)).nullable().optional(),
    tags: z.array(z.string().trim().min(1)).nullable().optional(),
    installStage: z.enum(['install', 'rep', 'game-ready']).nullable().optional(),
    coachingPoints: z.array(z.string().trim().min(1)).nullable().optional(),
    commonBusts: z.array(z.string().trim().min(1)).nullable().optional(),
    correctionCues: z.array(z.string().trim().min(1)).nullable().optional(),
    drillProgression: z.array(z.string().trim().min(1)).nullable().optional(),
    situations: z.array(z.string().trim().min(1)).nullable().optional(),
    sourcePlayId: z.string().trim().min(1).nullable().optional(),
  })
  .refine((data) => Object.keys(data).some((key) => key !== 'playbookId' && key !== 'playId'), {
    message: 'At least one update field is required.',
  });

const DeletePlayFromPlaybookInputSchema = z.object({
  playbookId: z.string().trim().min(1),
  playId: z.string().trim().min(1),
});

type TeamPlaybookDoc = {
  readonly teamId: string;
  readonly sport: string;
  readonly name: string;
  readonly plays?: readonly Record<string, unknown>[];
};

function titleCase(value: string): string {
  return value.trim().replace(/\b\w/g, (char) => char.toUpperCase());
}

function sanitizeStringArray(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

function normalizePlayToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolvePlayIndex(
  plays: readonly Record<string, unknown>[],
  playIdOrName: string
): {
  readonly index: number;
  readonly matchedBy: 'playId' | 'name';
} {
  const byPlayId = findPlayIndexById(plays, playIdOrName);
  if (byPlayId >= 0) return { index: byPlayId, matchedBy: 'playId' };

  const normalized = normalizePlayToken(playIdOrName);
  if (!normalized) return { index: -1, matchedBy: 'playId' };

  const matchedIndexes: number[] = [];
  for (let i = 0; i < plays.length; i += 1) {
    const play = plays[i] as Record<string, unknown>;
    const name = normalizePlayToken(play['name']);
    if (!name) continue;
    if (name === normalized) matchedIndexes.push(i);
  }

  if (matchedIndexes.length === 1) {
    return { index: matchedIndexes[0]!, matchedBy: 'name' };
  }

  return { index: -1, matchedBy: 'playId' };
}

function summarizePlayCandidates(plays: readonly Record<string, unknown>[]): string[] {
  return plays.slice(0, 10).map((play) => {
    const playId = typeof play['playId'] === 'string' ? play['playId'] : 'unknown-play-id';
    const name = typeof play['name'] === 'string' ? play['name'] : 'Unnamed Play';
    return `${playId} (${name})`;
  });
}

async function loadPlaybookForMutation(
  db: Firestore,
  playbookId: string,
  userId: string
): Promise<
  | { ok: true; doc: TeamPlaybookDoc; docRef: FirebaseFirestore.DocumentReference }
  | { ok: false; error: string }
> {
  const docRef = db.collection(PLAYBOOKS_COLLECTION).doc(playbookId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return { ok: false, error: `Playbook ${playbookId} not found.` };

  const playbook = docSnap.data() as TeamPlaybookDoc;
  const teamDoc = await db.collection(TEAMS_COLLECTION).doc(playbook.teamId).get();
  if (!teamDoc.exists) return { ok: false, error: `Team ${playbook.teamId} not found.` };

  const authorized = await canManageTeamMutationForUser(
    db,
    userId,
    playbook.teamId,
    teamDoc.data() ?? {}
  );
  if (!authorized) return { ok: false, error: 'Not authorized to modify this playbook.' };

  return { ok: true, doc: playbook, docRef };
}

async function invalidatePlaybookCaches(teamId: string, sport: string): Promise<void> {
  try {
    const cache = getCacheService();
    await Promise.all([
      cache.del(`intel:team:${teamId}`),
      cache.del(`team:playbooks:${teamId}:${sport}`),
      cache.del(`team:profile:${teamId}`),
    ]);
  } catch {
    // best effort
  }
}

export class AddPlayToPlaybookTool extends BaseTool {
  readonly name = 'add_play_to_playbook';
  readonly description =
    'Add a single play to an existing team playbook with a stable playId for atomic follow-up edits.';
  readonly parameters = AddPlayToPlaybookInputSchema;
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
    const parsed = AddPlayToPlaybookInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const payload = parsed.data;
    const loaded = await loadPlaybookForMutation(this.db, payload.playbookId, context.userId);
    if (!loaded.ok) return { success: false, error: loaded.error };

    const now = new Date().toISOString();
    const plays = [...(loaded.doc.plays ?? [])] as Record<string, unknown>[];
    const play: Record<string, unknown> = {
      name: titleCase(payload.name),
      createdAt: now,
      updatedAt: now,
    };

    for (const field of SharedStringFields) {
      const value = payload[field];
      if (field === 'playBreakdown') {
        const breakdown = sanitizePlayBreakdown(value);
        if (breakdown) play[field] = breakdown;
        continue;
      }

      if (typeof value === 'string' && value.trim().length > 0) play[field] = value.trim();
    }
    if (payload.sourcePlayId) play['sourcePlayId'] = payload.sourcePlayId.trim();
    if (payload.conceptTags?.length) play['conceptTags'] = sanitizeStringArray(payload.conceptTags);
    if (payload.tags?.length) play['tags'] = sanitizeStringArray(payload.tags);
    if (payload.installStage) play['installStage'] = payload.installStage;
    if (payload.coachingPoints?.length)
      play['coachingPoints'] = sanitizeStringArray(payload.coachingPoints);
    if (payload.commonBusts?.length) play['commonBusts'] = sanitizeStringArray(payload.commonBusts);
    if (payload.correctionCues?.length)
      play['correctionCues'] = sanitizeStringArray(payload.correctionCues);
    if (payload.drillProgression?.length)
      play['drillProgression'] = sanitizeStringArray(payload.drillProgression);
    if (payload.situations?.length) play['situations'] = sanitizeStringArray(payload.situations);

    const syncedDiagram = await syncPlaybookDiagramAsset({
      db: this.db,
      userId: context.userId,
      sport: loaded.doc.sport,
      title: typeof play['name'] === 'string' ? play['name'] : payload.name,
      description:
        typeof play['playBreakdown'] === 'string'
          ? play['playBreakdown']
          : typeof play['installNotes'] === 'string'
            ? play['installNotes']
            : undefined,
      diagramUrl: typeof play['diagramUrl'] === 'string' ? play['diagramUrl'] : undefined,
      diagramAssetId: payload.diagramAssetId,
    });
    if (syncedDiagram.diagramUrl) play['diagramUrl'] = syncedDiagram.diagramUrl;
    if (syncedDiagram.diagramAssetId) play['diagramAssetId'] = syncedDiagram.diagramAssetId;

    const playId = ensurePlayId(play, `${payload.playbookId}:add:${now}:${createPlayKey(play)}`);
    plays.push(play);
    const indexes = buildPlayIndexes(plays);

    await loaded.docRef.update({
      plays,
      playCount: plays.length,
      ...indexes,
      updatedAt: now,
      updatedBy: context.userId,
    });
    await invalidatePlaybookCaches(loaded.doc.teamId, loaded.doc.sport);

    logger.info('[AddPlayToPlaybookTool] Added play', {
      playbookId: payload.playbookId,
      playId,
      teamId: loaded.doc.teamId,
    });

    return {
      success: true,
      markdown: `Added play **${play['name']}** to **${loaded.doc.name}**.`,
      data: { play, playbookId: payload.playbookId, playId, playCount: plays.length },
    };
  }
}

export class UpdatePlayInPlaybookTool extends BaseTool {
  readonly name = 'update_play_in_playbook';
  readonly description =
    'Update one play in a team playbook by stable playId. Supports explicit field clearing via null/empty arrays.';
  readonly parameters = UpdatePlayInPlaybookInputSchema;
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
    const parsed = UpdatePlayInPlaybookInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const payload = parsed.data;
    const loaded = await loadPlaybookForMutation(this.db, payload.playbookId, context.userId);
    if (!loaded.ok) return { success: false, error: loaded.error };

    const plays = [...(loaded.doc.plays ?? [])] as Record<string, unknown>[];
    for (let i = 0; i < plays.length; i += 1) {
      const play = plays[i] as Record<string, unknown>;
      ensurePlayId(play, `${payload.playbookId}:legacy:${i}:${createPlayKey(play)}`);
    }

    const resolved = resolvePlayIndex(plays, payload.playId);
    const index = resolved.index;
    if (index < 0) {
      const candidates = summarizePlayCandidates(plays);
      return {
        success: false,
        error: `Play ${payload.playId} not found in playbook ${payload.playbookId}. Use get_playbook first and pass an exact playId. Available plays: ${candidates.join(', ') || 'none'}.`,
      };
    }

    const now = new Date().toISOString();
    const updated = { ...plays[index] } as Record<string, unknown>;

    if (typeof payload.name === 'string' && payload.name.trim().length > 0) {
      updated['name'] = titleCase(payload.name);
    }

    for (const field of SharedStringFields) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
      const value = payload[field];
      if (value === null) {
        delete updated[field];
        continue;
      }

      if (field === 'playBreakdown') {
        const breakdown = sanitizePlayBreakdown(value);
        if (breakdown) updated[field] = breakdown;
        else delete updated[field];
        continue;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) updated[field] = trimmed;
        else delete updated[field];
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'diagramAssetId')) {
      if (payload.diagramAssetId === null) {
        delete updated['diagramAssetId'];
      } else if (typeof payload.diagramAssetId === 'string' && payload.diagramAssetId.trim()) {
        updated['diagramAssetId'] = payload.diagramAssetId.trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'sourcePlayId')) {
      if (payload.sourcePlayId === null) delete updated['sourcePlayId'];
      else if (typeof payload.sourcePlayId === 'string' && payload.sourcePlayId.trim().length > 0) {
        updated['sourcePlayId'] = payload.sourcePlayId.trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'conceptTags')) {
      if (payload.conceptTags === null) delete updated['conceptTags'];
      else updated['conceptTags'] = sanitizeStringArray(payload.conceptTags ?? []);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'tags')) {
      if (payload.tags === null) delete updated['tags'];
      else updated['tags'] = sanitizeStringArray(payload.tags ?? []);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'installStage')) {
      if (payload.installStage === null) delete updated['installStage'];
      else updated['installStage'] = payload.installStage;
    }

    for (const listField of [
      'coachingPoints',
      'commonBusts',
      'correctionCues',
      'drillProgression',
      'situations',
    ] as const) {
      if (!Object.prototype.hasOwnProperty.call(payload, listField)) continue;
      const value = payload[listField];
      if (value === null) {
        delete updated[listField];
      } else {
        updated[listField] = sanitizeStringArray(value ?? []);
      }
    }

    const syncedDiagram = await syncPlaybookDiagramAsset({
      db: this.db,
      userId: context.userId,
      sport: loaded.doc.sport,
      title:
        typeof updated['name'] === 'string' && updated['name'].trim().length > 0
          ? updated['name']
          : typeof plays[index]?.['name'] === 'string'
            ? String(plays[index]?.['name'])
            : payload.playId,
      description:
        typeof updated['playBreakdown'] === 'string'
          ? updated['playBreakdown']
          : typeof updated['installNotes'] === 'string'
            ? updated['installNotes']
            : undefined,
      diagramUrl: typeof updated['diagramUrl'] === 'string' ? updated['diagramUrl'] : undefined,
      diagramAssetId:
        typeof updated['diagramAssetId'] === 'string' ? updated['diagramAssetId'] : undefined,
    });
    if (syncedDiagram.diagramUrl) updated['diagramUrl'] = syncedDiagram.diagramUrl;
    if (syncedDiagram.diagramAssetId) updated['diagramAssetId'] = syncedDiagram.diagramAssetId;
    if (!updated['diagramUrl']) delete updated['diagramAssetId'];

    ensurePlayId(updated, `${payload.playbookId}:update:${index}:${createPlayKey(updated)}`);
    updated['updatedAt'] = now;
    plays[index] = updated;

    const indexes = buildPlayIndexes(plays);
    await loaded.docRef.update({
      plays,
      playCount: plays.length,
      ...indexes,
      updatedAt: now,
      updatedBy: context.userId,
    });
    await invalidatePlaybookCaches(loaded.doc.teamId, loaded.doc.sport);

    logger.info('[UpdatePlayInPlaybookTool] Updated play', {
      playbookId: payload.playbookId,
      playId: payload.playId,
      matchedBy: resolved.matchedBy,
      teamId: loaded.doc.teamId,
    });

    return {
      success: true,
      markdown: `Updated play **${updated['name'] ?? payload.playId}** in **${loaded.doc.name}**.`,
      data: {
        play: updated,
        playbookId: payload.playbookId,
        playId: typeof updated['playId'] === 'string' ? updated['playId'] : payload.playId,
        matchedBy: resolved.matchedBy,
      },
    };
  }
}

export class DeletePlayFromPlaybookTool extends BaseTool {
  readonly name = 'delete_play_from_playbook';
  readonly description = 'Delete one play from a team playbook by stable playId.';
  readonly parameters = DeletePlayFromPlaybookInputSchema;
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
    const parsed = DeletePlayFromPlaybookInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);
    if (!context?.userId)
      return { success: false, error: 'Authenticated tool context is required.' };

    const payload = parsed.data;
    const loaded = await loadPlaybookForMutation(this.db, payload.playbookId, context.userId);
    if (!loaded.ok) return { success: false, error: loaded.error };

    const plays = [...(loaded.doc.plays ?? [])] as Record<string, unknown>[];
    for (let i = 0; i < plays.length; i += 1) {
      const play = plays[i] as Record<string, unknown>;
      ensurePlayId(play, `${payload.playbookId}:legacy:${i}:${createPlayKey(play)}`);
    }

    const resolved = resolvePlayIndex(plays, payload.playId);
    const index = resolved.index;
    if (index < 0) {
      const candidates = summarizePlayCandidates(plays);
      return {
        success: false,
        error: `Play ${payload.playId} not found in playbook ${payload.playbookId}. Use get_playbook first and pass an exact playId. Available plays: ${candidates.join(', ') || 'none'}.`,
      };
    }

    const [removed] = plays.splice(index, 1);
    const now = new Date().toISOString();
    const indexes = buildPlayIndexes(plays);

    await loaded.docRef.update({
      plays,
      playCount: plays.length,
      ...indexes,
      updatedAt: now,
      updatedBy: context.userId,
    });
    await invalidatePlaybookCaches(loaded.doc.teamId, loaded.doc.sport);

    logger.info('[DeletePlayFromPlaybookTool] Deleted play', {
      playbookId: payload.playbookId,
      playId: payload.playId,
      matchedBy: resolved.matchedBy,
      teamId: loaded.doc.teamId,
    });

    return {
      success: true,
      markdown: `Deleted play **${removed?.['name'] ?? payload.playId}** from **${loaded.doc.name}**.`,
      data: {
        playbookId: payload.playbookId,
        playId: typeof removed?.['playId'] === 'string' ? removed['playId'] : payload.playId,
        matchedBy: resolved.matchedBy,
        playCount: plays.length,
      },
    };
  }
}
