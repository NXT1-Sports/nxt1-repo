/**
 * @fileoverview Team Film Review Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * First-class Agent X tools for the `TeamFilmReviews` collection.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';
import {
  type TeamFilmReviewAnnotation,
  type TeamFilmReviewClip,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPerspective,
  type TeamFilmReviewPlayAnnotation,
  type TeamFilmReviewPlaySegment,
  type TeamFilmReviewPlayTagValue,
  type TeamFilmReviewStatus,
  type TeamFilmReviewTagCategory,
  type TeamFilmReviewTimelineState,
  type TeamFilmReviewTimelineTag,
} from '@nxt1/core';
import { logger } from '../../../../../utils/logger.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import {
  canManageTeamMutationForUser,
  canReadTeamIntelForUser,
} from '../../../../../services/team/team-intel-permissions.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { resolveCreatedAt } from '../doc-date-utils.js';

const TEAM_FILM_REVIEWS_COLLECTION = 'TeamFilmReviews';
const TEAMS_COLLECTION = 'Teams';
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const DEFAULT_SOURCE = 'agent_x';
const MAX_TAGS = 50;
const MAX_INSIGHTS = 50;
const MAX_AI_TAGS = 100;
const MAX_CLIPS = 100;
const MAX_TIMELINE_SEGMENTS = 500;
const MAX_ANNOTATIONS = 500;

const FilmReviewStatusSchema = z.enum(['draft', 'processing', 'ready', 'archived']);
const FilmReviewPerspectiveSchema = z.enum(['own_team', 'opponent', 'neutral']);
const FilmReviewTimelineStateSchema = z.enum(['idle', 'generating', 'ready', 'error']);
const FilmReviewTagCategorySchema = z.enum([
  'offense',
  'defense',
  'transition',
  'set_piece',
  'execution',
  'decision',
  'momentum',
  'custom',
]);

const StringArraySchema = z.array(z.string().trim().min(1));

const TimelineTagSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1),
    category: FilmReviewTagCategorySchema.optional(),
    startSec: z.number().finite().min(0),
    endSec: z.number().finite().min(0),
    confidence: z.number().finite().min(0).max(1).optional(),
    notes: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.endSec >= value.startSec, {
    message: 'endSec must be greater than or equal to startSec',
    path: ['endSec'],
  });

const ClipSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    startSec: z.number().finite().min(0),
    endSec: z.number().finite().min(0),
    summary: z.string().trim().min(1).optional(),
    score: z.number().finite().min(0).max(1).optional(),
  })
  .refine((value) => value.endSec >= value.startSec, {
    message: 'endSec must be greater than or equal to startSec',
    path: ['endSec'],
  });

const PointSchema = z.object({
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
});

const AnnotationBoundsSchema = z.object({
  minX: z.number().finite().min(0).max(1),
  minY: z.number().finite().min(0).max(1),
  maxX: z.number().finite().min(0).max(1),
  maxY: z.number().finite().min(0).max(1),
});

const PlayAnnotationSchema = z.object({
  kind: z.literal('freehand'),
  bounds: AnnotationBoundsSchema,
  strokeCount: z.number().int().min(1),
  points: z.array(PointSchema).max(1000).optional(),
  strokes: z.array(z.array(PointSchema).min(1)).max(100).optional(),
});

const TimelineTagValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const TimelineSegmentSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    number: z.number().int().min(1).optional(),
    label: z.string().trim().min(1),
    startSec: z.number().finite().min(0),
    endSec: z.number().finite().min(0),
    confidence: z.number().finite().min(0).max(1).optional(),
    annotation: PlayAnnotationSchema.nullable().optional(),
    tags: z.record(z.string(), TimelineTagValueSchema).optional(),
  })
  .refine((value) => value.endSec >= value.startSec, {
    message: 'endSec must be greater than or equal to startSec',
    path: ['endSec'],
  });

const ListFilmReviewsInputSchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  status: FilmReviewStatusSchema.optional(),
  opponentName: z.string().trim().min(1).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const GetFilmReviewInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
});

const SaveFilmReviewInputSchema = z.object({
  filmReviewId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1),
  sport: z.string().trim().min(1),
  title: z.string().trim().min(1),
  videoUrl: z.string().trim().min(1),
  storagePath: z.string().trim().min(1).optional(),
  cloudflareVideoId: z.string().trim().min(1).optional(),
  cloudflareStatus: z.string().trim().min(1).optional(),
  readyToStream: z.boolean().optional(),
  source: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
  thumbnailUrl: z.string().trim().min(1).optional(),
  opponentName: z.string().trim().min(1).optional(),
  gameDate: z.string().trim().min(1).optional(),
  playlistId: z.string().trim().min(1).nullable().optional(),
  playlistName: z.string().trim().min(1).nullable().optional(),
  perspective: FilmReviewPerspectiveSchema.optional(),
  status: FilmReviewStatusSchema.optional(),
  durationSec: z.number().finite().min(0).optional(),
  aiSummary: z.string().trim().min(1).optional(),
  aiTags: z.array(TimelineTagSchema).max(MAX_AI_TAGS).optional(),
  clips: z.array(ClipSchema).max(MAX_CLIPS).optional(),
  keyInsights: StringArraySchema.max(MAX_INSIGHTS).optional(),
  tags: StringArraySchema.max(MAX_TAGS).optional(),
  timeline: z.array(TimelineSegmentSchema).max(MAX_TIMELINE_SEGMENTS).optional(),
});

const UpdateFilmReviewInputSchema = SaveFilmReviewInputSchema.omit({
  filmReviewId: true,
  teamId: true,
})
  .partial()
  .extend({
    filmReviewId: z.string().trim().min(1),
    timelineState: FilmReviewTimelineStateSchema.optional(),
    timelineError: z.string().trim().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 1, {
    message: 'At least one field besides filmReviewId must be provided for update',
  });

const ArchiveFilmReviewInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
});

const AddFilmReviewAnnotationInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  note: z.string().trim().min(1),
  atSec: z.number().finite().min(0),
  color: z.string().trim().min(1).optional(),
});

const DeleteFilmReviewAnnotationInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  annotationId: z.string().trim().min(1),
});

const RefreshFilmReviewAiInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
});

type SaveFilmReviewInput = z.infer<typeof SaveFilmReviewInputSchema>;
type TimelineSegmentInput = z.infer<typeof TimelineSegmentSchema>;
type TimelineTagInput = z.infer<typeof TimelineTagSchema>;
type ClipInput = z.infer<typeof ClipSchema>;

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isToolResult(value: Record<string, unknown> | ToolResult): value is ToolResult {
  return typeof (value as ToolResult).success === 'boolean';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeStringArray(values?: readonly string[]): readonly string[] | undefined {
  if (!values || values.length === 0) return undefined;
  const normalized = Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))
  );
  return normalized.length > 0 ? normalized : undefined;
}

function buildDocId(input: SaveFilmReviewInput): string {
  if (input.filmReviewId) return input.filmReviewId.trim();
  const sport = slugify(input.sport) || 'film';
  const title = slugify(input.title) || 'review';
  return `${input.teamId}_${sport}_${title}_${Date.now()}`;
}

function buildTimelineTags(
  entries?: readonly TimelineTagInput[]
): readonly TeamFilmReviewTimelineTag[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((entry, index) => ({
    id: entry.id?.trim() || `tag_${index + 1}`,
    label: entry.label.trim(),
    category: (entry.category ?? 'custom') as TeamFilmReviewTagCategory,
    startSec: entry.startSec,
    endSec: entry.endSec,
    ...(entry.confidence !== undefined ? { confidence: entry.confidence } : {}),
    ...(entry.notes ? { notes: entry.notes.trim() } : {}),
  }));
}

function buildClips(entries?: readonly ClipInput[]): readonly TeamFilmReviewClip[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((entry, index) => ({
    id: entry.id?.trim() || `clip_${index + 1}`,
    title: entry.title.trim(),
    startSec: entry.startSec,
    endSec: entry.endSec,
    ...(entry.summary ? { summary: entry.summary.trim() } : {}),
    ...(entry.score !== undefined ? { score: entry.score } : {}),
  }));
}

function buildTimelineSegments(
  entries?: readonly TimelineSegmentInput[]
): readonly TeamFilmReviewPlaySegment[] | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.map((entry, index) => ({
    id: entry.id?.trim() || `play-${index + 1}`,
    number: entry.number ?? index + 1,
    label: entry.label.trim(),
    startSec: entry.startSec,
    endSec: entry.endSec,
    ...(entry.confidence !== undefined ? { confidence: entry.confidence } : {}),
    ...(entry.annotation !== undefined
      ? { annotation: entry.annotation as TeamFilmReviewPlayAnnotation | null }
      : {}),
    ...(entry.tags
      ? { tags: entry.tags as Readonly<Record<string, TeamFilmReviewPlayTagValue>> }
      : {}),
  }));
}

function buildSyntheticFilmReviewAi(
  review: Pick<TeamFilmReviewDoc, 'durationSec' | 'sport' | 'opponentName' | 'title'>
): Pick<TeamFilmReviewDoc, 'aiSummary' | 'aiTags' | 'keyInsights'> {
  const duration = Math.max(review.durationSec ?? 0, 1);
  const quarter = Math.max(Math.floor(duration / 4), 10);
  const opponentLabel = review.opponentName ? ` against ${review.opponentName}` : '';

  const labels: readonly {
    readonly label: string;
    readonly category: TeamFilmReviewTagCategory;
  }[] = [
    { label: 'Opening Sequence', category: 'execution' },
    { label: 'Transition Window', category: 'transition' },
    { label: 'Defensive Pressure', category: 'defense' },
    { label: 'Late-Game Decisions', category: 'decision' },
  ];

  return {
    aiSummary: `Agent X prepared a ${review.sport} film review for ${review.title}${opponentLabel}, focused on momentum swings, execution quality, and decision-making windows.`,
    aiTags: labels.map((item, index) => {
      const startSec = index * quarter;
      return {
        id: `tag_${index + 1}`,
        label: item.label,
        category: item.category,
        startSec,
        endSec: Math.min(startSec + quarter, duration),
        confidence: 0.8,
        notes: `Agent X marked this segment for ${item.label.toLowerCase()}.`,
      };
    }),
    keyInsights: [
      'Review transition windows for the clearest momentum shifts.',
      'Track execution quality under pressure and late-clock constraints.',
      'Pair corrections with timestamped clips so coaches can teach from evidence.',
    ],
  };
}

function toSummary(doc: TeamFilmReviewDoc): Record<string, unknown> {
  return {
    id: doc.id,
    teamId: doc.teamId,
    sport: doc.sport,
    title: doc.title,
    status: doc.status,
    perspective: doc.perspective,
    opponentName: doc.opponentName,
    gameDate: doc.gameDate,
    playlistId: doc.playlistId,
    playlistName: doc.playlistName,
    durationSec: doc.durationSec,
    timelineState: doc.timelineState,
    timelineCount: doc.timeline?.length ?? 0,
    annotationCount: doc.annotations?.length ?? 0,
    keyInsightCount: doc.keyInsights?.length ?? 0,
    tagCount: doc.tags?.length ?? 0,
    source: doc.source,
    sourceUrl: doc.sourceUrl,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
  };
}

async function invalidateFilmReviewCaches(
  teamId: string,
  sport: string,
  nextSport?: string
): Promise<void> {
  try {
    const cache = getCacheService();
    const keys = new Set<string>([
      `intel:team:${teamId}`,
      `team:film_reviews:${teamId}:${sport}`,
      `team:profile:${teamId}`,
    ]);
    if (nextSport && nextSport !== sport) {
      keys.add(`team:film_reviews:${teamId}:${nextSport}`);
    }
    await Promise.all([...keys].map((key) => cache.del(key)));
  } catch {
    // Best effort cache invalidation.
  }
}

abstract class FilmReviewToolBase extends BaseTool {
  readonly category = 'database' as const;
  readonly entityGroup = 'team_tools' as const;

  protected readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  protected requireUser(context?: ToolExecutionContext): string | ToolResult {
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }
    return context.userId;
  }

  protected async getTeamData(teamId: string): Promise<Record<string, unknown> | ToolResult> {
    const teamDoc = await this.db.collection(TEAMS_COLLECTION).doc(teamId).get();
    if (!teamDoc.exists) {
      return { success: false, error: `Team ${teamId} not found.` };
    }
    return teamDoc.data() ?? {};
  }

  protected async canReadReview(userId: string, review: TeamFilmReviewDoc): Promise<boolean> {
    const teamData = await this.getTeamData(review.teamId);
    if (isToolResult(teamData)) return false;
    const canRead = await canReadTeamIntelForUser(this.db, userId, review.teamId, teamData);
    const isOwner = review.createdBy === userId || review.updatedBy === userId;
    return canRead || isOwner;
  }

  protected async canManageReview(userId: string, review: TeamFilmReviewDoc): Promise<boolean> {
    const teamData = await this.getTeamData(review.teamId);
    if (isToolResult(teamData)) return false;
    return canManageTeamMutationForUser(this.db, userId, review.teamId, teamData);
  }
}

export class ListFilmReviewsTool extends FilmReviewToolBase {
  readonly name = 'list_film_reviews';
  readonly description =
    'List Agent X film review records for a team or the current user. Supports sport, status, opponent, archived, and limit filters.';
  readonly parameters = ListFilmReviewsInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListFilmReviewsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const payload = parsed.data;
    const limit = payload.limit ?? 25;
    const includeArchived = payload.includeArchived === true;
    const sport = normalizeText(payload.sport)?.toLowerCase();
    const opponent = normalizeText(payload.opponentName)?.toLowerCase();

    try {
      let candidates: TeamFilmReviewDoc[] = [];

      if (payload.teamId) {
        const teamData = await this.getTeamData(payload.teamId);
        if (isToolResult(teamData)) return teamData;

        const authorized = await canReadTeamIntelForUser(this.db, userId, payload.teamId, teamData);
        if (!authorized) {
          return { success: false, error: 'Not authorized to view film reviews for this team.' };
        }

        const snap = await this.db
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .where('teamId', '==', payload.teamId)
          .limit(Math.max(limit * 4, 80))
          .get();

        candidates = snap.docs.map((doc) => doc.data() as TeamFilmReviewDoc);
      } else {
        const [updatedBySnap, createdBySnap] = await Promise.all([
          this.db
            .collection(TEAM_FILM_REVIEWS_COLLECTION)
            .where('updatedBy', '==', userId)
            .limit(Math.max(limit * 3, 60))
            .get(),
          this.db
            .collection(TEAM_FILM_REVIEWS_COLLECTION)
            .where('createdBy', '==', userId)
            .limit(Math.max(limit * 3, 60))
            .get(),
        ]);

        const byId = new Map<string, TeamFilmReviewDoc>();
        for (const doc of [...updatedBySnap.docs, ...createdBySnap.docs]) {
          const value = doc.data() as TeamFilmReviewDoc;
          byId.set(value.id, value);
        }
        candidates = [...byId.values()];
      }

      const filtered = candidates
        .filter((item) => (includeArchived ? true : item.status !== 'archived'))
        .filter((item) => (payload.status ? item.status === payload.status : true))
        .filter((item) => (sport ? item.sport.toLowerCase() === sport : true))
        .filter((item) => {
          if (!opponent) return true;
          return (item.opponentName ?? '').toLowerCase().includes(opponent);
        })
        .sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : 1))
        .slice(0, limit);

      return {
        success: true,
        markdown:
          filtered.length === 0
            ? 'No film reviews matched your filters.'
            : `Found **${filtered.length}** film review(s).`,
        data: {
          filmReviews: filtered.map(toSummary),
          count: filtered.length,
          filtersApplied: {
            teamId: payload.teamId,
            sport,
            status: payload.status,
            opponentName: opponent,
            includeArchived,
          },
        },
      };
    } catch (error) {
      logger.error('[ListFilmReviewsTool] Failed to list film reviews', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list film reviews',
      };
    }
  }
}

export class GetFilmReviewTool extends FilmReviewToolBase {
  readonly name = 'get_film_review';
  readonly description =
    'Get a single Agent X film review by ID, including timeline rows, annotations, clips, AI tags, and insights.';
  readonly parameters = GetFilmReviewInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetFilmReviewInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    try {
      const doc = await this.db
        .collection(TEAM_FILM_REVIEWS_COLLECTION)
        .doc(parsed.data.filmReviewId)
        .get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
      }

      const filmReview = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canReadReview(userId, filmReview))) {
        return { success: false, error: 'Not authorized to view this film review.' };
      }

      return {
        success: true,
        markdown: `Loaded film review **${filmReview.title}** (${filmReview.sport}).`,
        data: { filmReview },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load film review',
      };
    }
  }
}

export class SaveFilmReviewTool extends FilmReviewToolBase {
  readonly name = 'save_film_review';
  readonly description =
    'Create or replace a team film review record. Use after Agent X has a video URL, uploaded media artifact, Hudl extraction result, or analyzed film notes.';
  readonly parameters = SaveFilmReviewInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = SaveFilmReviewInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const payload = parsed.data;

    try {
      const teamData = await this.getTeamData(payload.teamId);
      if (isToolResult(teamData)) return teamData;

      const authorized = await canManageTeamMutationForUser(
        this.db,
        userId,
        payload.teamId,
        teamData
      );
      if (!authorized) {
        return { success: false, error: 'Not authorized to save film reviews for this team.' };
      }

      const now = new Date().toISOString();
      const docId = buildDocId(payload);
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(docId);
      const existingDoc = await docRef.get();
      const existingData = existingDoc.data() as Partial<TeamFilmReviewDoc> | undefined;

      if (existingDoc.exists && existingData?.teamId && existingData.teamId !== payload.teamId) {
        return { success: false, error: 'Film review ID does not belong to the requested team.' };
      }

      const normalizedSport = payload.sport.trim().toLowerCase();
      const initialStatus =
        payload.status ??
        (payload.cloudflareVideoId && payload.readyToStream !== true ? 'processing' : 'ready');
      const aiSeed = buildSyntheticFilmReviewAi({
        sport: normalizedSport,
        title: payload.title,
        opponentName: payload.opponentName,
        durationSec: payload.durationSec,
      });
      const aiTags = buildTimelineTags(payload.aiTags) ?? aiSeed.aiTags;
      const clips = buildClips(payload.clips);
      const timeline = buildTimelineSegments(payload.timeline);
      const keyInsights = normalizeStringArray(payload.keyInsights) ?? aiSeed.keyInsights;
      const tags = normalizeStringArray(payload.tags);

      context?.emitStage?.('persisting_result', {
        icon: 'media',
        phase: 'save_film_review',
        filmReviewId: docId,
        title: payload.title,
      });

      const docData: TeamFilmReviewDoc = {
        id: docId,
        teamId: payload.teamId,
        sport: normalizedSport,
        title: payload.title.trim(),
        status: initialStatus as TeamFilmReviewStatus,
        videoUrl: payload.videoUrl.trim(),
        ...(payload.storagePath ? { storagePath: payload.storagePath.trim() } : {}),
        ...(payload.cloudflareVideoId
          ? { cloudflareVideoId: payload.cloudflareVideoId.trim() }
          : {}),
        ...(payload.cloudflareStatus ? { cloudflareStatus: payload.cloudflareStatus.trim() } : {}),
        ...(payload.readyToStream !== undefined ? { readyToStream: payload.readyToStream } : {}),
        ...(payload.thumbnailUrl ? { thumbnailUrl: payload.thumbnailUrl.trim() } : {}),
        ...(payload.opponentName ? { opponentName: payload.opponentName.trim() } : {}),
        ...(payload.gameDate ? { gameDate: payload.gameDate.trim() } : {}),
        ...(payload.playlistId !== undefined ? { playlistId: payload.playlistId } : {}),
        ...(payload.playlistName !== undefined ? { playlistName: payload.playlistName } : {}),
        ...(payload.perspective
          ? { perspective: payload.perspective as TeamFilmReviewPerspective }
          : {}),
        ...(payload.durationSec !== undefined ? { durationSec: payload.durationSec } : {}),
        aiSummary: payload.aiSummary?.trim() ?? aiSeed.aiSummary,
        aiTags,
        ...(clips ? { clips } : {}),
        keyInsights,
        ...(tags ? { tags } : {}),
        ...(timeline ? { timeline, timelineState: 'ready' as TeamFilmReviewTimelineState } : {}),
        annotations: existingData?.annotations ?? [],
        source: (payload.source ?? DEFAULT_SOURCE).trim(),
        ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl.trim() } : {}),
        schemaVersion: 1,
        createdBy: typeof existingData?.createdBy === 'string' ? existingData.createdBy : userId,
        updatedBy: userId,
        createdAt: resolveCreatedAt(existingData?.createdAt, payload.gameDate, now),
        updatedAt: now,
      };

      await docRef.set(docData);
      await invalidateFilmReviewCaches(payload.teamId, normalizedSport, existingData?.sport);

      logger.info('[SaveFilmReviewTool] Film review saved', {
        filmReviewId: docId,
        teamId: payload.teamId,
        sport: normalizedSport,
        title: docData.title,
        status: docData.status,
      });

      return {
        success: true,
        markdown:
          `Saved film review **${docData.title}** (${docData.sport}). ` +
          `Status: ${docData.status}. Timeline rows: ${docData.timeline?.length ?? 0}.`,
        data: {
          filmReview: toSummary(docData),
          message: `Saved film review "${docData.title}" (${docData.sport}).`,
        },
      };
    } catch (error) {
      logger.error('[SaveFilmReviewTool] Failed to save film review', {
        teamId: payload.teamId,
        title: payload.title,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save film review',
      };
    }
  }
}

export class UpdateFilmReviewTool extends FilmReviewToolBase {
  readonly name = 'update_film_review';
  readonly description =
    'Patch specific fields of an existing team film review, including title, status, metadata, AI summary, clips, tags, and timeline rows.';
  readonly parameters = UpdateFilmReviewInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateFilmReviewInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId, ...updates } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${filmReviewId} not found.` };
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canManageReview(userId, existing))) {
        return { success: false, error: 'Not authorized to update this film review.' };
      }

      const now = new Date().toISOString();
      const nextSport = normalizeText(updates.sport)?.toLowerCase();
      const updateData: Record<string, unknown> = {
        updatedBy: userId,
        updatedAt: now,
      };

      if (updates.title) updateData['title'] = updates.title.trim();
      if (nextSport) updateData['sport'] = nextSport;
      if (updates.status) updateData['status'] = updates.status;
      if (updates.videoUrl) updateData['videoUrl'] = updates.videoUrl.trim();
      if (updates.storagePath) updateData['storagePath'] = updates.storagePath.trim();
      if (updates.cloudflareVideoId)
        updateData['cloudflareVideoId'] = updates.cloudflareVideoId.trim();
      if (updates.cloudflareStatus)
        updateData['cloudflareStatus'] = updates.cloudflareStatus.trim();
      if (updates.readyToStream !== undefined) updateData['readyToStream'] = updates.readyToStream;
      if (updates.thumbnailUrl) updateData['thumbnailUrl'] = updates.thumbnailUrl.trim();
      if (updates.opponentName) updateData['opponentName'] = updates.opponentName.trim();
      if (updates.gameDate) updateData['gameDate'] = updates.gameDate.trim();
      if (Object.prototype.hasOwnProperty.call(updates, 'playlistId')) {
        updateData['playlistId'] = updates.playlistId ?? null;
        updateData['playlistName'] = updates.playlistId ? (updates.playlistName ?? null) : null;
      }
      if (updates.perspective) updateData['perspective'] = updates.perspective;
      if (updates.durationSec !== undefined) updateData['durationSec'] = updates.durationSec;
      if (updates.aiSummary) updateData['aiSummary'] = updates.aiSummary.trim();
      if (updates.aiTags) updateData['aiTags'] = buildTimelineTags(updates.aiTags);
      if (updates.clips) updateData['clips'] = buildClips(updates.clips);
      if (updates.keyInsights)
        updateData['keyInsights'] = normalizeStringArray(updates.keyInsights) ?? [];
      if (updates.tags) updateData['tags'] = normalizeStringArray(updates.tags) ?? [];
      if (updates.timeline) {
        updateData['timeline'] = buildTimelineSegments(updates.timeline) ?? [];
        updateData['timelineState'] = 'ready';
        updateData['timelineGeneratedAt'] = now;
        updateData['timelineError'] = null;
      }
      if (updates.timelineState) updateData['timelineState'] = updates.timelineState;
      if (Object.prototype.hasOwnProperty.call(updates, 'timelineError')) {
        updateData['timelineError'] = updates.timelineError ?? null;
      }
      if (updates.source) updateData['source'] = updates.source.trim();
      if (updates.sourceUrl) updateData['sourceUrl'] = updates.sourceUrl.trim();

      if (nextSport && nextSport !== existing.sport) {
        updateData['timeline'] = [];
        updateData['timelineState'] = 'idle';
        updateData['timelineGeneratedAt'] = null;
        updateData['timelineError'] = null;
      }

      context?.emitStage?.('persisting_result', {
        icon: 'media',
        phase: 'update_film_review',
        filmReviewId,
        fields: Object.keys(updateData).filter((key) => !['updatedBy', 'updatedAt'].includes(key)),
      });

      await docRef.update(updateData);
      await invalidateFilmReviewCaches(existing.teamId, existing.sport, nextSport);

      logger.info('[UpdateFilmReviewTool] Film review updated', {
        filmReviewId,
        teamId: existing.teamId,
        updatedBy: userId,
        updatedFields: Object.keys(updateData),
      });

      return {
        success: true,
        markdown: `Updated film review **${existing.title}**. Modified fields: ${Object.keys(updates).join(', ')}.`,
        data: {
          filmReview: {
            id: filmReviewId,
            teamId: existing.teamId,
            sport: nextSport ?? existing.sport,
            title: updates.title ?? existing.title,
            status: updates.status ?? existing.status,
            timelineState:
              updates.timelineState ?? (updates.timeline ? 'ready' : existing.timelineState),
          },
          message: `Updated film review "${existing.title}".`,
        },
      };
    } catch (error) {
      logger.error('[UpdateFilmReviewTool] Failed to update film review', {
        filmReviewId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update film review',
      };
    }
  }
}

export class DeleteFilmReviewTool extends FilmReviewToolBase {
  readonly name = 'delete_film_review';
  readonly description =
    'Hard-delete a team film review and remove linked media from Cloudflare Stream and Firebase Storage.';
  readonly parameters = ArchiveFilmReviewInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ArchiveFilmReviewInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId, reason } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${filmReviewId} not found.` };
      }

      const filmReview = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canManageReview(userId, filmReview))) {
        return { success: false, error: 'Not authorized to delete this film review.' };
      }

      const now = new Date().toISOString();

      const failures: string[] = [];
      const cloudflareVideoId = filmReview.cloudflareVideoId?.trim();
      const storagePath = filmReview.storagePath?.trim();

      if (cloudflareVideoId) {
        const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
        const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
        if (!accountId || !apiToken) {
          failures.push(
            'Cloudflare deletion is not configured (missing CLOUDFLARE_ACCOUNT_ID/API_TOKEN).'
          );
        } else {
          try {
            const response = await fetch(
              `${CLOUDFLARE_API_BASE_URL}/accounts/${accountId}/stream/${cloudflareVideoId}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${apiToken}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (!(response.ok || response.status === 404)) {
              let details = `HTTP ${response.status}`;
              try {
                const payload = (await response.json()) as {
                  errors?: Array<{ message?: string }>;
                  messages?: Array<{ message?: string }>;
                };
                const message = payload.errors?.[0]?.message ?? payload.messages?.[0]?.message;
                if (message) details = message;
              } catch {
                // keep fallback
              }
              failures.push(`Cloudflare deletion failed for ${cloudflareVideoId}: ${details}`);
            }
          } catch (error) {
            failures.push(
              error instanceof Error
                ? `Cloudflare deletion failed for ${cloudflareVideoId}: ${error.message}`
                : `Cloudflare deletion failed for ${cloudflareVideoId}`
            );
          }
        }
      }

      if (storagePath) {
        try {
          const file = getStorage().bucket().file(storagePath) as {
            delete: (options?: { ignoreNotFound?: boolean }) => Promise<unknown>;
          };
          await file.delete({ ignoreNotFound: true });
        } catch (error) {
          failures.push(
            error instanceof Error
              ? `Firebase deletion failed for ${storagePath}: ${error.message}`
              : `Firebase deletion failed for ${storagePath}`
          );
        }
      }

      if (failures.length > 0) {
        logger.error('[DeleteFilmReviewTool] Media cleanup failed', {
          filmReviewId,
          teamId: filmReview.teamId,
          userId,
          failures,
          ...(reason ? { reason: reason.trim() } : {}),
        });
        return {
          success: false,
          error:
            'Failed to fully delete film review media assets. Film review was not removed from the library.',
          data: {
            failures,
          },
        };
      }

      await docRef.delete();
      await invalidateFilmReviewCaches(filmReview.teamId, filmReview.sport);

      logger.info('[DeleteFilmReviewTool] Film review hard deleted', {
        filmReviewId,
        teamId: filmReview.teamId,
        userId,
        deletedAt: now,
        cloudflareDeleted: !!cloudflareVideoId,
        firebaseDeleted: !!storagePath,
        ...(reason ? { reason: reason.trim() } : {}),
      });

      return {
        success: true,
        markdown: `Deleted film review **${filmReview.title}** and linked media assets.`,
        data: {
          filmReview: {
            id: filmReviewId,
            teamId: filmReview.teamId,
            sport: filmReview.sport,
            title: filmReview.title,
            deleted: true,
          },
          message: `Deleted film review "${filmReview.title}".`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to archive film review',
      };
    }
  }
}

export class AddFilmReviewAnnotationTool extends FilmReviewToolBase {
  readonly name = 'add_film_review_annotation';
  readonly description = 'Add a timestamped coach/player note to an existing team film review.';
  readonly parameters = AddFilmReviewAnnotationInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = AddFilmReviewAnnotationInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId, note, atSec, color } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${filmReviewId} not found.` };
      }

      const filmReview = doc.data() as TeamFilmReviewDoc;
      const canManage = await this.canManageReview(userId, filmReview);
      const isOwner = filmReview.createdBy === userId || filmReview.updatedBy === userId;
      if (!canManage && !isOwner) {
        return { success: false, error: 'Not authorized to annotate this film review.' };
      }

      const now = new Date().toISOString();
      const annotation: TeamFilmReviewAnnotation = {
        id: `ann_${Date.now()}_${Math.round(Math.random() * 1000)}`,
        note: note.trim(),
        atSec,
        ...(color ? { color: color.trim() } : {}),
        createdBy: userId,
        createdAt: now,
      };

      const annotations = [...(filmReview.annotations ?? []), annotation]
        .slice(-MAX_ANNOTATIONS)
        .sort((a, b) => a.atSec - b.atSec);

      await docRef.update({ annotations, updatedBy: userId, updatedAt: now });
      await invalidateFilmReviewCaches(filmReview.teamId, filmReview.sport);

      return {
        success: true,
        markdown: `Added annotation at ${Math.round(atSec)}s to **${filmReview.title}**.`,
        data: { annotation, annotations },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add film review annotation',
      };
    }
  }
}

export class DeleteFilmReviewAnnotationTool extends FilmReviewToolBase {
  readonly name = 'delete_film_review_annotation';
  readonly description = 'Delete a timestamped annotation from an existing team film review.';
  readonly parameters = DeleteFilmReviewAnnotationInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteFilmReviewAnnotationInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId, annotationId } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${filmReviewId} not found.` };
      }

      const filmReview = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canManageReview(userId, filmReview))) {
        return { success: false, error: 'Not authorized to delete this film review annotation.' };
      }

      const annotations = (filmReview.annotations ?? []).filter((item) => item.id !== annotationId);
      await docRef.update({
        annotations,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      });
      await invalidateFilmReviewCaches(filmReview.teamId, filmReview.sport);

      return {
        success: true,
        markdown: `Deleted annotation from **${filmReview.title}**.`,
        data: { annotations },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete film review annotation',
      };
    }
  }
}

export class RefreshFilmReviewAiTool extends FilmReviewToolBase {
  readonly name = 'refresh_film_review_ai';
  readonly description =
    'Refresh Agent X AI summary, timeline tags, and coaching insights for an existing film review using its current metadata.';
  readonly parameters = RefreshFilmReviewAiInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RefreshFilmReviewAiInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${filmReviewId} not found.` };
      }

      const filmReview = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canManageReview(userId, filmReview))) {
        return { success: false, error: 'Not authorized to refresh AI for this film review.' };
      }

      const ai = buildSyntheticFilmReviewAi(filmReview);
      await docRef.update({
        aiSummary: ai.aiSummary,
        aiTags: ai.aiTags,
        keyInsights: ai.keyInsights,
        status: 'ready',
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      });
      await invalidateFilmReviewCaches(filmReview.teamId, filmReview.sport);

      return {
        success: true,
        markdown: `Refreshed AI film review notes for **${filmReview.title}**.`,
        data: ai,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refresh film review AI',
      };
    }
  }
}
