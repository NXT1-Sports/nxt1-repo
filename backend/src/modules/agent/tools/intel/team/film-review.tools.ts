/**
 * @fileoverview Team Film Review Agent X Tools
 * @module @nxt1/backend/modules/agent/tools/database
 *
 * First-class Agent X tools for the `TeamFilmReviews` collection.
 */

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  getTeamFilmReviewSportTagDefinitions,
  resolveTeamFilmReviewSportTagSchemaKey,
  type TeamFilmReviewAnnotation,
  type TeamFilmReviewClip,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlaylistDoc,
  type TeamFilmReviewPerspective,
  type TeamFilmReviewPlayAnnotation,
  type TeamFilmReviewPlaySegment,
  type TeamFilmReviewSourceVideo,
  type TeamFilmReviewPlayTagValue,
  type TeamFilmReviewStatus,
  type TeamFilmReviewSportTagDefinition,
  type TeamFilmReviewTagCategory,
  type TeamFilmReviewTimelineState,
  type TeamFilmReviewTimelineTag,
  type TeamFilmReviewUploadMode,
} from '@nxt1/core';
import { logger } from '../../../../../utils/logger.js';
import { getCacheService } from '../../../../../services/core/cache.service.js';
import {
  canManageTeamMutationForUser,
  canReadTeamIntelForUser,
} from '../../../../../services/team/team-intel-permissions.js';
import { collectFilmReviewMediaAssetRefs } from '../../../../../services/team/film-review-media-assets.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';
import { resolveCreatedAt } from '../doc-date-utils.js';

const TEAM_FILM_REVIEWS_COLLECTION = 'TeamFilmReviews';
const TEAM_FILM_REVIEW_PLAYLISTS_COLLECTION = 'TeamFilmReviewPlaylists';
const TEAMS_COLLECTION = 'Teams';
const CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const DEFAULT_SOURCE = 'agent_x';
const MAX_TAGS = 50;
const MAX_INSIGHTS = 50;
const MAX_AI_TAGS = 100;
const MAX_CLIPS = 100;
const MAX_SOURCE_VIDEOS = 100;
const MAX_TIMELINE_SEGMENTS = 500;
const MAX_ANNOTATIONS = 500;

const FilmReviewStatusSchema = z.enum(['draft', 'processing', 'ready', 'archived']);
const FilmReviewPerspectiveSchema = z.enum(['own_team', 'opponent', 'neutral']);
const FilmReviewTimelineStateSchema = z.enum(['idle', 'generating', 'ready', 'error']);
const FilmReviewUploadModeSchema = z.enum(['single_video', 'batch_clips', 'full_footage']);
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
  kind: z.enum(['freehand', 'square', 'circle']),
  bounds: AnnotationBoundsSchema,
  strokeCount: z.number().int().min(1),
  points: z.array(PointSchema).max(1000).optional(),
  strokes: z.array(z.array(PointSchema).min(1)).max(100).optional(),
});

const TimelineTagValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const SourceVideoSchema = z.object({
  id: z.string().trim().min(1).optional(),
  order: z.number().int().min(0).optional(),
  videoUrl: z.string().trim().min(1),
  downloadUrl: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  storagePath: z.string().trim().min(1).optional(),
  cloudflareVideoId: z.string().trim().min(1).optional(),
  cloudflareStatus: z.string().trim().min(1).optional(),
  readyToStream: z.boolean().optional(),
  thumbnailUrl: z.string().trim().min(1).optional(),
  durationSec: z.number().finite().min(0).optional(),
});

const TimelineSegmentSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    number: z.number().int().min(1).optional(),
    label: z.string().trim().min(1),
    startSec: z.number().finite().min(0),
    endSec: z.number().finite().min(0),
    sourceId: z.string().trim().min(1).optional(),
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
  uploadMode: FilmReviewUploadModeSchema.optional(),
  opponentName: z.string().trim().min(1).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const GetFilmReviewInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
});

const SaveFilmReviewInputBaseSchema = z.object({
  filmReviewId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1),
  sport: z.string().trim().min(1),
  title: z.string().trim().min(1),
  videoUrl: z.string().trim().min(1).optional(),
  uploadMode: FilmReviewUploadModeSchema.optional(),
  sources: z.array(SourceVideoSchema).max(MAX_SOURCE_VIDEOS).optional(),
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

const SaveFilmReviewInputSchema = SaveFilmReviewInputBaseSchema.refine(
  (value) => Boolean(value.videoUrl?.trim()) || (value.sources?.length ?? 0) > 0,
  {
    message: 'videoUrl or at least one source video is required',
    path: ['videoUrl'],
  }
);

const UpdateFilmReviewInputSchema = SaveFilmReviewInputBaseSchema.omit({
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

const ListFilmReviewSourcesInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
});

const GetFilmReviewSourceBreakdownInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
});

const FilmReviewSourceBreakdownMergeModeSchema = z.enum(['replace', 'append']);

const UpdateFilmReviewSourceBreakdownInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  mergeMode: FilmReviewSourceBreakdownMergeModeSchema.optional(),
  timeline: z.array(TimelineSegmentSchema).min(1).max(MAX_TIMELINE_SEGMENTS),
});

const DeleteFilmReviewSourceBreakdownInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  rowIds: z.array(z.string().trim().min(1)).min(1).max(MAX_TIMELINE_SEGMENTS).optional(),
});

const AddFilmReviewSourceInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  source: SourceVideoSchema,
});

const UpdateFilmReviewSourceInputSchema = z
  .object({
    filmReviewId: z.string().trim().min(1),
    sourceId: z.string().trim().min(1),
    order: z.number().int().min(0).optional(),
    videoUrl: z.string().trim().min(1).optional(),
    downloadUrl: z.string().trim().min(1).nullable().optional(),
    title: z.string().trim().min(1).nullable().optional(),
    storagePath: z.string().trim().min(1).nullable().optional(),
    cloudflareVideoId: z.string().trim().min(1).nullable().optional(),
    cloudflareStatus: z.string().trim().min(1).nullable().optional(),
    readyToStream: z.boolean().nullable().optional(),
    thumbnailUrl: z.string().trim().min(1).nullable().optional(),
    durationSec: z.number().finite().min(0).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 2, {
    message: 'At least one source field besides filmReviewId and sourceId must be provided',
  });

const DeleteFilmReviewSourceInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
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

const ListFilmReviewPlaylistsInputSchema = z.object({
  teamId: z.string().trim().min(1),
});

const CreateFilmReviewPlaylistInputSchema = z.object({
  playlistId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  parentId: z.string().trim().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const UpdateFilmReviewPlaylistInputSchema = z
  .object({
    playlistId: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    parentId: z.string().trim().min(1).nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.parentId !== undefined || value.sortOrder !== undefined,
    {
      message: 'At least one playlist field besides playlistId must be provided for update',
    }
  );

const DeleteFilmReviewPlaylistInputSchema = z.object({
  playlistId: z.string().trim().min(1),
});

const MoveFilmReviewToPlaylistInputSchema = z
  .object({
    filmReviewId: z.string().trim().min(1),
    playlistId: z.string().trim().min(1).optional(),
    playlistName: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.playlistId !== undefined || value.playlistName !== undefined, {
    message: 'playlistId or playlistName must be provided',
    path: ['playlistId'],
  });

const ExtractFilmReviewClipsInputSchema = z
  .object({
    filmReviewId: z.string().trim().min(1),
    sourceIds: z.array(z.string().trim().min(1)).min(1).max(50).optional(),
    sourceTitles: z.array(z.string().trim().min(1)).min(1).max(50).optional(),
    outputMode: z.enum(['separate_reviews', 'combined_review']).optional(),
    title: z.string().trim().min(1).optional(),
    playlistId: z.string().trim().min(1).optional(),
    playlistName: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.sourceIds !== undefined || value.sourceTitles !== undefined, {
    message: 'sourceIds or sourceTitles must be provided',
    path: ['sourceIds'],
  });

const BatchFullVideoInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  sport: z.string().trim().min(1).optional(),
  windowDurationSec: z.number().int().min(60).max(3600).optional(),
  windowOverlapSec: z.number().int().min(0).max(60).optional(),
  analyzeWithAi: z.boolean().optional(),
});

type SaveFilmReviewInput = z.infer<typeof SaveFilmReviewInputSchema>;
type TimelineSegmentInput = z.infer<typeof TimelineSegmentSchema>;
type TimelineTagInput = z.infer<typeof TimelineTagSchema>;
type ClipInput = z.infer<typeof ClipSchema>;
type SourceVideoInput = z.infer<typeof SourceVideoSchema>;
type ExtractFilmReviewClipsInput = z.infer<typeof ExtractFilmReviewClipsInputSchema>;

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

function dedupeStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function buildDocId(input: SaveFilmReviewInput): string {
  if (input.filmReviewId) return input.filmReviewId.trim();
  const sport = slugify(input.sport) || 'film';
  const title = slugify(input.title) || 'review';
  return `${input.teamId}_${sport}_${title}_${Date.now()}`;
}

function buildExtractedFilmReviewId(
  teamId: string,
  sport: string,
  title: string,
  sourceId?: string
): string {
  const sportSlug = slugify(sport) || 'film';
  const titleSlug = slugify(title) || 'review';
  const sourceSlug = sourceId ? slugify(sourceId) : 'derived';
  return `${teamId}_${sportSlug}_${titleSlug}_${sourceSlug}_${randomUUID().slice(0, 8)}`;
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

function normalizeTimelineTagValueForDefinition(
  input: unknown,
  definition: TeamFilmReviewSportTagDefinition
): TeamFilmReviewPlayTagValue | undefined {
  if (input === null) return null;

  switch (definition.valueType) {
    case 'number': {
      if (typeof input === 'number' && Number.isFinite(input)) {
        return Math.round(input * 1000) / 1000;
      }

      if (typeof input === 'string') {
        const match = input.match(/-?\d+(?:\.\d+)?/);
        if (!match) return undefined;
        const parsed = Number(match[0]);
        return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : undefined;
      }

      return undefined;
    }
    case 'boolean': {
      if (typeof input === 'boolean') return input;
      if (typeof input !== 'string') return undefined;
      const normalized = input.trim().toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
      if (['false', 'no', 'n', '0'].includes(normalized)) return false;
      return undefined;
    }
    case 'enum': {
      if (typeof input !== 'string' && typeof input !== 'number' && typeof input !== 'boolean') {
        return undefined;
      }

      if (!definition.options?.length) return undefined;

      return definition.options.find(
        (option) => option.toLowerCase() === String(input).trim().toLowerCase()
      );
    }
    case 'string': {
      if (typeof input !== 'string' && typeof input !== 'number' && typeof input !== 'boolean') {
        return undefined;
      }

      const normalized = String(input).trim();
      return normalized.length > 0 ? normalized : undefined;
    }
    default:
      return undefined;
  }
}

function normalizeTimelineTagRecordForSport(
  tags: Record<string, unknown> | undefined,
  schema: readonly TeamFilmReviewSportTagDefinition[]
): Readonly<Record<string, TeamFilmReviewPlayTagValue>> | undefined {
  if (!schema.length) return undefined;

  const sourceTags = tags ?? {};
  const normalizedEntries = schema.map((definition) => {
    const normalizedValue = normalizeTimelineTagValueForDefinition(
      sourceTags[definition.id],
      definition
    );
    return [definition.id, normalizedValue ?? null] as const;
  });

  return Object.fromEntries(normalizedEntries) as Readonly<
    Record<string, TeamFilmReviewPlayTagValue>
  >;
}

function buildTimelineSegments(
  entries?: readonly TimelineSegmentInput[],
  sport?: string | null
): readonly TeamFilmReviewPlaySegment[] | undefined {
  if (!entries || entries.length === 0) return undefined;

  const tagSchema = getTeamFilmReviewSportTagDefinitions(sport);
  return entries.map((entry, index) => {
    const normalizedTags = normalizeTimelineTagRecordForSport(
      entry.tags as Record<string, unknown> | undefined,
      tagSchema
    );

    return {
      id: entry.id?.trim() || `play-${index + 1}`,
      number: entry.number ?? index + 1,
      label: entry.label.trim(),
      startSec: entry.startSec,
      endSec: entry.endSec,
      ...(entry.sourceId ? { sourceId: entry.sourceId.trim() } : {}),
      ...(entry.confidence !== undefined ? { confidence: entry.confidence } : {}),
      ...(entry.annotation !== undefined
        ? { annotation: entry.annotation as TeamFilmReviewPlayAnnotation | null }
        : {}),
      ...(normalizedTags ? { tags: normalizedTags } : {}),
    };
  });
}

function buildSourceVideos(
  entries?: readonly SourceVideoInput[] | readonly TeamFilmReviewSourceVideo[]
): readonly TeamFilmReviewSourceVideo[] | undefined {
  if (!entries || entries.length === 0) return undefined;

  return [...entries]
    .map((entry, index) => ({
      id: entry.id?.trim() || `source-${index + 1}`,
      order:
        typeof entry.order === 'number' && Number.isFinite(entry.order)
          ? Math.max(0, Math.floor(entry.order))
          : index,
      videoUrl: entry.videoUrl.trim(),
      ...(entry.downloadUrl ? { downloadUrl: entry.downloadUrl.trim() } : {}),
      ...(entry.title ? { title: entry.title.trim() } : {}),
      ...(entry.storagePath ? { storagePath: entry.storagePath.trim() } : {}),
      ...(entry.cloudflareVideoId ? { cloudflareVideoId: entry.cloudflareVideoId.trim() } : {}),
      ...(entry.cloudflareStatus ? { cloudflareStatus: entry.cloudflareStatus.trim() } : {}),
      ...(entry.readyToStream !== undefined ? { readyToStream: entry.readyToStream } : {}),
      ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl.trim() } : {}),
      ...(entry.durationSec !== undefined ? { durationSec: entry.durationSec } : {}),
    }))
    .sort((left, right) => left.order - right.order)
    .map((entry, index) => ({
      ...entry,
      order: index,
    }));
}

function deriveFilmReviewUploadMode(
  requestedUploadMode: TeamFilmReviewUploadMode | undefined,
  sources: readonly TeamFilmReviewSourceVideo[]
): TeamFilmReviewUploadMode {
  if (requestedUploadMode) return requestedUploadMode;
  if (sources.length > 1) return 'batch_clips';
  if (sources.length === 1) return 'full_footage';
  return 'single_video';
}

function validateFilmReviewUploadMode(
  uploadMode: TeamFilmReviewUploadMode,
  sources: readonly TeamFilmReviewSourceVideo[]
): string | null {
  if (sources.length === 0 && uploadMode === 'batch_clips') {
    return 'uploadMode "batch_clips" requires at least one source video.';
  }

  if (sources.length > 1 && uploadMode !== 'batch_clips') {
    return 'Multiple source videos require uploadMode "batch_clips".';
  }

  if (sources.length === 1 && uploadMode === 'batch_clips') {
    return 'A single source video cannot use uploadMode "batch_clips".';
  }

  return null;
}

function resolveFilmReviewMediaFields(params: {
  readonly requestedUploadMode?: TeamFilmReviewUploadMode;
  readonly sources?: readonly TeamFilmReviewSourceVideo[];
  readonly fallbackVideoUrl?: string;
  readonly fallbackStoragePath?: string;
  readonly fallbackCloudflareVideoId?: string;
  readonly fallbackCloudflareStatus?: string;
  readonly fallbackReadyToStream?: boolean;
  readonly fallbackThumbnailUrl?: string;
  readonly fallbackDurationSec?: number;
}):
  | { readonly error: string }
  | {
      readonly fields: {
        readonly uploadMode: TeamFilmReviewUploadMode;
        readonly sources?: readonly TeamFilmReviewSourceVideo[];
        readonly videoUrl: string;
        readonly storagePath?: string;
        readonly cloudflareVideoId?: string;
        readonly cloudflareStatus?: string;
        readonly readyToStream?: boolean;
        readonly thumbnailUrl?: string;
        readonly durationSec?: number;
        readonly schemaVersion: number;
      };
    } {
  const sources = params.sources ?? [];
  const uploadMode = deriveFilmReviewUploadMode(params.requestedUploadMode, sources);
  const uploadModeError = validateFilmReviewUploadMode(uploadMode, sources);
  if (uploadModeError) {
    return { error: uploadModeError };
  }

  const primarySource = sources[0];
  const videoUrl = primarySource?.videoUrl?.trim() || params.fallbackVideoUrl?.trim();
  if (!videoUrl) {
    return { error: 'videoUrl or at least one source video is required.' };
  }

  const durationSec =
    uploadMode === 'batch_clips'
      ? undefined
      : (primarySource?.durationSec ?? params.fallbackDurationSec);

  return {
    fields: {
      uploadMode,
      ...(sources.length > 0 ? { sources } : {}),
      videoUrl,
      ...(primarySource?.storagePath
        ? { storagePath: primarySource.storagePath }
        : params.fallbackStoragePath
          ? { storagePath: params.fallbackStoragePath }
          : {}),
      ...(primarySource?.cloudflareVideoId
        ? { cloudflareVideoId: primarySource.cloudflareVideoId }
        : params.fallbackCloudflareVideoId
          ? { cloudflareVideoId: params.fallbackCloudflareVideoId }
          : {}),
      ...(primarySource?.cloudflareStatus
        ? { cloudflareStatus: primarySource.cloudflareStatus }
        : params.fallbackCloudflareStatus
          ? { cloudflareStatus: params.fallbackCloudflareStatus }
          : {}),
      ...(primarySource?.readyToStream !== undefined
        ? { readyToStream: primarySource.readyToStream }
        : params.fallbackReadyToStream !== undefined
          ? { readyToStream: params.fallbackReadyToStream }
          : {}),
      ...(primarySource?.thumbnailUrl
        ? { thumbnailUrl: primarySource.thumbnailUrl }
        : params.fallbackThumbnailUrl
          ? { thumbnailUrl: params.fallbackThumbnailUrl }
          : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
      schemaVersion: sources.length > 0 ? 2 : 1,
    },
  };
}

function mergeFilmReviewSource(
  source: TeamFilmReviewSourceVideo,
  updates: z.infer<typeof UpdateFilmReviewSourceInputSchema>
): TeamFilmReviewSourceVideo {
  const nextSource: Record<string, unknown> = { ...source };

  if (updates.order !== undefined) nextSource['order'] = updates.order;
  if (updates.videoUrl !== undefined) nextSource['videoUrl'] = updates.videoUrl.trim();

  for (const field of [
    'downloadUrl',
    'title',
    'storagePath',
    'cloudflareVideoId',
    'cloudflareStatus',
    'thumbnailUrl',
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(updates, field)) continue;
    const value = updates[field];
    if (typeof value === 'string' && value.trim()) {
      nextSource[field] = value.trim();
    } else {
      delete nextSource[field];
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'readyToStream')) {
    if (typeof updates.readyToStream === 'boolean') {
      nextSource['readyToStream'] = updates.readyToStream;
    } else {
      delete nextSource['readyToStream'];
    }
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'durationSec')) {
    if (typeof updates.durationSec === 'number') {
      nextSource['durationSec'] = updates.durationSec;
    } else {
      delete nextSource['durationSec'];
    }
  }

  return nextSource as unknown as TeamFilmReviewSourceVideo;
}

function cloneTimelineSegmentsForSource(
  segments: readonly TeamFilmReviewPlaySegment[] | undefined,
  sourceId: string
): readonly TeamFilmReviewPlaySegment[] {
  const matching = (segments ?? []).filter((segment) => segment.sourceId?.trim() === sourceId);
  return matching.map((segment, index) => ({
    ...segment,
    number: index + 1,
  }));
}

function cloneTimelineSegmentsForSources(
  segments: readonly TeamFilmReviewPlaySegment[] | undefined,
  sourceIds: ReadonlySet<string>
): readonly TeamFilmReviewPlaySegment[] {
  const matching = (segments ?? []).filter((segment) => {
    const segmentSourceId = segment.sourceId?.trim();
    return segmentSourceId ? sourceIds.has(segmentSourceId) : false;
  });

  return matching.map((segment, index) => ({
    ...segment,
    number: index + 1,
  }));
}

function buildSeededSourceTimelineSegment(
  source: TeamFilmReviewSourceVideo,
  fallbackLabel: string,
  number: number
): TeamFilmReviewPlaySegment {
  return {
    id: `play-${source.id}`,
    number,
    label: source.title?.trim() || fallbackLabel,
    startSec: 0,
    endSec: Math.max(1, source.durationSec ?? 1),
    sourceId: source.id,
  };
}

function renumberTimelineSegments(
  segments: readonly TeamFilmReviewPlaySegment[]
): readonly TeamFilmReviewPlaySegment[] {
  return segments.map((segment, index) => ({
    ...segment,
    number: index + 1,
  }));
}

function buildTimelineForSourceSet(
  existingTimeline: readonly TeamFilmReviewPlaySegment[] | undefined,
  sources: readonly TeamFilmReviewSourceVideo[],
  uploadMode: TeamFilmReviewUploadMode,
  fallbackDurationSec?: number
): readonly TeamFilmReviewPlaySegment[] {
  if (sources.length === 0) {
    return [];
  }

  if (uploadMode === 'batch_clips') {
    const rebuilt: TeamFilmReviewPlaySegment[] = [];

    for (const source of sources) {
      const matching = cloneTimelineSegmentsForSource(existingTimeline, source.id);
      if (matching.length === 0) {
        rebuilt.push(
          buildSeededSourceTimelineSegment(
            source,
            source.title?.trim() || `Clip ${rebuilt.length + 1}`,
            rebuilt.length + 1
          )
        );
        continue;
      }

      rebuilt.push(...matching.map((segment) => ({ ...segment, sourceId: source.id })));
    }

    return renumberTimelineSegments(rebuilt);
  }

  const primarySource = sources[0] as TeamFilmReviewSourceVideo;
  const matching = cloneTimelineSegmentsForSource(existingTimeline, primarySource.id);
  if (matching.length > 0) {
    return renumberTimelineSegments(
      matching.map((segment) => ({ ...segment, sourceId: primarySource.id }))
    );
  }

  if ((existingTimeline?.length ?? 0) > 0) {
    return renumberTimelineSegments(
      (existingTimeline ?? []).map((segment) => ({ ...segment, sourceId: primarySource.id }))
    );
  }

  return [
    {
      ...buildSeededSourceTimelineSegment(
        primarySource,
        primarySource.title?.trim() || 'Full Footage',
        1
      ),
      endSec: Math.max(1, primarySource.durationSec ?? fallbackDurationSec ?? 1),
    },
  ];
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

function resolveFilmReviewSourceById(
  review: TeamFilmReviewDoc,
  sourceId: string
): TeamFilmReviewSourceVideo | null {
  return (buildSourceVideos(review.sources) ?? []).find((source) => source.id === sourceId) ?? null;
}

function getSourceScopedTimeline(
  review: TeamFilmReviewDoc,
  sourceId: string
): readonly TeamFilmReviewPlaySegment[] {
  const timeline = review.timeline ?? [];
  const directMatches = timeline.filter((segment) => segment.sourceId?.trim() === sourceId);
  if (directMatches.length > 0) {
    return renumberTimelineSegments(directMatches);
  }

  const reviewSources = review.sources ?? [];
  if (reviewSources.length <= 1) {
    return renumberTimelineSegments(timeline);
  }

  return [];
}

function buildSourceBreakdownSummary(
  source: TeamFilmReviewSourceVideo,
  review: TeamFilmReviewDoc
): Record<string, unknown> {
  const sourceTimeline = getSourceScopedTimeline(review, source.id);
  const playNumbers = sourceTimeline
    .map((segment) => segment.number)
    .filter((value): value is number => typeof value === 'number');
  const labelsPreview = sourceTimeline
    .map((segment) => segment.label.trim())
    .filter((label) => label.length > 0)
    .slice(0, 5);

  return {
    hasBreakdown: sourceTimeline.length > 0,
    playCount: sourceTimeline.length,
    firstPlayNumber: playNumbers[0] ?? null,
    lastPlayNumber: playNumbers.length > 0 ? playNumbers[playNumbers.length - 1] : null,
    startSec: sourceTimeline.length > 0 ? (sourceTimeline[0]?.startSec ?? null) : null,
    endSec:
      sourceTimeline.length > 0
        ? sourceTimeline.reduce((maxEndSec, segment) => Math.max(maxEndSec, segment.endSec), 0)
        : null,
    labelsPreview,
    timelineState: review.timelineState ?? null,
    breakdownImported: Boolean(review.breakdownSource),
    breakdownProvider: review.breakdownSource?.provider ?? null,
    sourceDurationSec: source.durationSec ?? null,
  };
}

function buildFilmReviewSportTagSchemaPayload(sport?: string | null): {
  readonly sportTagSchemaKey: string;
  readonly sportTagSchema: readonly Record<string, unknown>[];
} {
  const sportTagSchemaKey = resolveTeamFilmReviewSportTagSchemaKey(sport);
  const sportTagSchema = getTeamFilmReviewSportTagDefinitions(sport).map((definition) => ({
    id: definition.id,
    label: definition.label,
    valueType: definition.valueType,
    ...(definition.options ? { options: definition.options } : {}),
    ...(definition.width ? { width: definition.width } : {}),
    ...(definition.description ? { description: definition.description } : {}),
  }));

  return {
    sportTagSchemaKey,
    sportTagSchema,
  };
}

function normalizeSourceOwnedTimelineSegments(
  timeline: readonly TeamFilmReviewPlaySegment[] | undefined,
  sourceCount: number,
  sourceId: string
): readonly TeamFilmReviewPlaySegment[] {
  return (timeline ?? []).map((segment) => {
    if (segment.sourceId?.trim()) {
      return { ...segment, sourceId: segment.sourceId.trim() };
    }

    if (sourceCount <= 1) {
      return { ...segment, sourceId };
    }

    return { ...segment };
  });
}

function buildSourceBreakdownTimelineSegments(
  entries: readonly TimelineSegmentInput[],
  sourceId: string,
  sport?: string | null
): readonly TeamFilmReviewPlaySegment[] {
  return (buildTimelineSegments(entries, sport) ?? []).map((segment) => ({
    ...segment,
    sourceId,
  }));
}

function mergeFilmReviewSourceBreakdown(params: {
  readonly existingTimeline: readonly TeamFilmReviewPlaySegment[] | undefined;
  readonly sourceCount: number;
  readonly sourceId: string;
  readonly nextSourceTimeline: readonly TeamFilmReviewPlaySegment[];
  readonly mergeMode: z.infer<typeof FilmReviewSourceBreakdownMergeModeSchema>;
}): readonly TeamFilmReviewPlaySegment[] {
  const normalizedExisting = normalizeSourceOwnedTimelineSegments(
    params.existingTimeline,
    params.sourceCount,
    params.sourceId
  );

  if (params.mergeMode === 'append') {
    return renumberTimelineSegments([
      ...normalizedExisting,
      ...params.nextSourceTimeline.map((segment) => ({ ...segment, sourceId: params.sourceId })),
    ]);
  }

  const preserved = normalizedExisting.filter(
    (segment) => segment.sourceId?.trim() !== params.sourceId
  );

  return renumberTimelineSegments([
    ...preserved,
    ...params.nextSourceTimeline.map((segment) => ({ ...segment, sourceId: params.sourceId })),
  ]);
}

function deleteFilmReviewSourceBreakdownRows(params: {
  readonly existingTimeline: readonly TeamFilmReviewPlaySegment[] | undefined;
  readonly sourceCount: number;
  readonly sourceId: string;
  readonly rowIds?: readonly string[];
}): {
  readonly timeline: readonly TeamFilmReviewPlaySegment[];
  readonly deletedCount: number;
} {
  const normalizedExisting = normalizeSourceOwnedTimelineSegments(
    params.existingTimeline,
    params.sourceCount,
    params.sourceId
  );
  const targetRowIds = new Set((params.rowIds ?? []).map((id) => id.trim()));

  let deletedCount = 0;
  const remaining = normalizedExisting.filter((segment) => {
    const belongsToSource = segment.sourceId?.trim() === params.sourceId;
    if (!belongsToSource) {
      return true;
    }

    const shouldDelete = targetRowIds.size === 0 ? true : targetRowIds.has(segment.id);
    if (shouldDelete) {
      deletedCount += 1;
      return false;
    }

    return true;
  });

  return {
    timeline: renumberTimelineSegments(remaining),
    deletedCount,
  };
}

function toSummary(doc: TeamFilmReviewDoc): Record<string, unknown> {
  return {
    id: doc.id,
    teamId: doc.teamId,
    sport: doc.sport,
    title: doc.title,
    status: doc.status,
    uploadMode: doc.uploadMode,
    perspective: doc.perspective,
    opponentName: doc.opponentName,
    gameDate: doc.gameDate,
    playlistId: doc.playlistId,
    playlistName: doc.playlistName,
    durationSec: doc.durationSec,
    sourceCount: doc.sources?.length ?? 0,
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

function compareFilmReviewPlaylists(
  left: TeamFilmReviewPlaylistDoc,
  right: TeamFilmReviewPlaylistDoc
): number {
  const leftOrder = typeof left.sortOrder === 'number' ? left.sortOrder : Number.MAX_SAFE_INTEGER;
  const rightOrder =
    typeof right.sortOrder === 'number' ? right.sortOrder : Number.MAX_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

async function listTeamFilmReviewPlaylists(
  db: Firestore,
  teamId: string
): Promise<readonly TeamFilmReviewPlaylistDoc[]> {
  const snap = await db
    .collection(TEAM_FILM_REVIEW_PLAYLISTS_COLLECTION)
    .where('teamId', '==', teamId)
    .limit(250)
    .get();

  return snap.docs
    .map((doc) => doc.data() as TeamFilmReviewPlaylistDoc)
    .sort(compareFilmReviewPlaylists);
}

function resolveFilmReviewPlaylistTarget(
  playlists: readonly TeamFilmReviewPlaylistDoc[],
  options: {
    readonly playlistId?: string;
    readonly playlistName?: string;
  }
): { readonly playlist: TeamFilmReviewPlaylistDoc } | { readonly error: string } {
  const targetId = options.playlistId?.trim();
  const targetName = options.playlistName?.trim();

  if (targetId) {
    const playlist = playlists.find((entry) => entry.id === targetId);
    if (!playlist) {
      return { error: `Film review playlist ${targetId} was not found for this team.` };
    }

    if (targetName && playlist.name.trim().toLowerCase() !== targetName.toLowerCase()) {
      return {
        error:
          `Playlist ID ${targetId} resolves to "${playlist.name}", which does not match ` +
          `the requested playlist name "${targetName}".`,
      };
    }

    return { playlist };
  }

  if (!targetName) {
    return { error: 'playlistId or playlistName must be provided.' };
  }

  const matches = playlists.filter(
    (entry) => entry.name.trim().toLowerCase() === targetName.toLowerCase()
  );

  if (matches.length === 0) {
    return { error: `No film review playlist named "${targetName}" was found for this team.` };
  }

  if (matches.length > 1) {
    return {
      error:
        `Multiple film review playlists are named "${targetName}". ` +
        'Use playlistId so Agent X can target the correct folder.',
    };
  }

  return { playlist: matches[0] as TeamFilmReviewPlaylistDoc };
}

function resolveSelectedFilmReviewSources(
  review: TeamFilmReviewDoc,
  options: Pick<ExtractFilmReviewClipsInput, 'sourceIds' | 'sourceTitles'>
): { readonly sources: readonly TeamFilmReviewSourceVideo[] } | { readonly error: string } {
  const reviewSources = review.sources ?? [];
  if (reviewSources.length === 0) {
    return { error: 'This film review does not contain addressable source clips.' };
  }

  const resolved = new Map<string, TeamFilmReviewSourceVideo>();

  for (const sourceId of dedupeStrings(options.sourceIds ?? [])) {
    const match = reviewSources.find((source) => source.id.trim() === sourceId);
    if (!match) {
      return { error: `Source clip ${sourceId} was not found in this film review.` };
    }
    resolved.set(match.id, match);
  }

  for (const sourceTitle of dedupeStrings(options.sourceTitles ?? [])) {
    const matches = reviewSources.filter(
      (source) => (source.title?.trim().toLowerCase() ?? '') === sourceTitle.toLowerCase()
    );

    if (matches.length === 0) {
      return { error: `No source clip titled "${sourceTitle}" was found in this film review.` };
    }

    if (matches.length > 1) {
      return {
        error: `Multiple source clips are titled "${sourceTitle}". Use sourceIds so Agent X can target the correct clip.`,
      };
    }

    const match = matches[0] as TeamFilmReviewSourceVideo;
    resolved.set(match.id, match);
  }

  if (resolved.size === 0) {
    return { error: 'No source clips were resolved from the provided selection.' };
  }

  const sources = [...resolved.values()].sort((left, right) => left.order - right.order);
  return { sources };
}

function buildCombinedExtractedFilmReviewTitle(
  review: TeamFilmReviewDoc,
  sources: readonly TeamFilmReviewSourceVideo[],
  explicitTitle?: string
): string {
  if (explicitTitle?.trim()) {
    return explicitTitle.trim();
  }

  if (sources.length === 1) {
    return sources[0]?.title?.trim() || `${review.title} Clip 1`;
  }

  return `${review.title} - Selected Clips`;
}

function buildExtractedFilmReviewDoc(params: {
  readonly parent: TeamFilmReviewDoc;
  readonly title: string;
  readonly sources: readonly TeamFilmReviewSourceVideo[];
  readonly timeline: readonly TeamFilmReviewPlaySegment[];
  readonly userId: string;
  readonly now: string;
  readonly playlist?: TeamFilmReviewPlaylistDoc;
}): TeamFilmReviewDoc {
  const { parent, title, sources, timeline, userId, now, playlist } = params;
  const primarySource = sources[0] as TeamFilmReviewSourceVideo;
  const uploadMode = sources.length > 1 ? 'batch_clips' : 'full_footage';
  const derivedDurationSec =
    uploadMode === 'batch_clips'
      ? undefined
      : (primarySource.durationSec ??
        timeline.reduce((duration, segment) => Math.max(duration, segment.endSec), 0));
  const ai = buildSyntheticFilmReviewAi({
    durationSec: derivedDurationSec,
    sport: parent.sport,
    opponentName: parent.opponentName,
    title,
  });

  return {
    id: buildExtractedFilmReviewId(parent.teamId, parent.sport, title, primarySource.id),
    teamId: parent.teamId,
    sport: parent.sport,
    title,
    status: 'ready',
    uploadMode,
    ...(parent.perspective ? { perspective: parent.perspective } : {}),
    ...(parent.gameDate ? { gameDate: parent.gameDate } : {}),
    ...(parent.opponentName ? { opponentName: parent.opponentName } : {}),
    ...(playlist ? { playlistId: playlist.id, playlistName: playlist.name } : {}),
    videoUrl: primarySource.videoUrl,
    sources,
    ...(primarySource.storagePath ? { storagePath: primarySource.storagePath } : {}),
    ...(primarySource.cloudflareVideoId
      ? { cloudflareVideoId: primarySource.cloudflareVideoId }
      : {}),
    ...(primarySource.cloudflareStatus ? { cloudflareStatus: primarySource.cloudflareStatus } : {}),
    ...(primarySource.readyToStream !== undefined
      ? { readyToStream: primarySource.readyToStream }
      : {}),
    ...(primarySource.thumbnailUrl ? { thumbnailUrl: primarySource.thumbnailUrl } : {}),
    ...(derivedDurationSec !== undefined ? { durationSec: derivedDurationSec } : {}),
    aiSummary: ai.aiSummary,
    aiTags: ai.aiTags,
    keyInsights: ai.keyInsights,
    ...(parent.tags ? { tags: parent.tags } : {}),
    source: parent.source,
    ...(parent.sourceUrl ? { sourceUrl: parent.sourceUrl } : {}),
    schemaVersion: parent.schemaVersion,
    createdBy: userId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
    timelineState: 'ready',
    timeline,
    ...(parent.breakdownSource ? { breakdownSource: parent.breakdownSource } : {}),
    timelineGeneratedAt: now,
  };
}

function isFilmReviewPlaylistDescendant(
  playlistId: string,
  ancestorId: string,
  playlists: readonly TeamFilmReviewPlaylistDoc[]
): boolean {
  const parentById = new Map(
    playlists.map((playlist) => [playlist.id, playlist.parentId?.trim() || null] as const)
  );

  let current = parentById.get(playlistId) ?? null;
  while (current) {
    if (current === ancestorId) {
      return true;
    }
    current = parentById.get(current) ?? null;
  }

  return false;
}

async function syncFilmReviewPlaylistReviewNames(
  db: Firestore,
  teamId: string,
  playlistId: string,
  playlistName: string | null
): Promise<number> {
  const snap = await db
    .collection(TEAM_FILM_REVIEWS_COLLECTION)
    .where('teamId', '==', teamId)
    .where('playlistId', '==', playlistId)
    .limit(250)
    .get();

  if (snap.empty) {
    return 0;
  }

  await Promise.all(snap.docs.map((doc) => doc.ref.update({ playlistName })));
  return snap.docs.length;
}

async function clearFilmReviewPlaylistAssignments(
  db: Firestore,
  teamId: string,
  playlistId: string,
  updatedBy: string,
  updatedAt: string
): Promise<number> {
  const snap = await db
    .collection(TEAM_FILM_REVIEWS_COLLECTION)
    .where('teamId', '==', teamId)
    .where('playlistId', '==', playlistId)
    .limit(250)
    .get();

  if (snap.empty) {
    return 0;
  }

  await Promise.all(
    snap.docs.map((doc) =>
      doc.ref.update({
        playlistId: null,
        playlistName: null,
        updatedBy,
        updatedAt,
      })
    )
  );

  return snap.docs.length;
}

async function reparentFilmReviewPlaylistChildren(
  db: Firestore,
  teamId: string,
  playlistId: string,
  nextParentId: string | null,
  updatedBy: string,
  updatedAt: string
): Promise<number> {
  const snap = await db
    .collection(TEAM_FILM_REVIEW_PLAYLISTS_COLLECTION)
    .where('teamId', '==', teamId)
    .where('parentId', '==', playlistId)
    .limit(250)
    .get();

  if (snap.empty) {
    return 0;
  }

  await Promise.all(
    snap.docs.map((doc) =>
      doc.ref.update({
        parentId: nextParentId,
        updatedBy,
        updatedAt,
      })
    )
  );

  return snap.docs.length;
}

async function invalidateFilmReviewPlaylistCaches(teamId: string): Promise<void> {
  try {
    const cache = getCacheService();
    await Promise.all([
      cache.del(`intel:team:${teamId}`),
      cache.del(`team:profile:${teamId}`),
      cache.del(`team:film_review_playlists:${teamId}`),
    ]);
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
    'List Agent X film review records for a team or the current user. Supports sport, status, uploadMode, opponent, archived, and limit filters.';
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
    const uploadMode = payload.uploadMode as TeamFilmReviewUploadMode | undefined;
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
        .filter((item) => (uploadMode ? item.uploadMode === uploadMode : true))
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
            uploadMode,
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

export class ListFilmReviewSourcesTool extends FilmReviewToolBase {
  readonly name = 'list_film_review_sources';
  readonly description =
    "List the individual source videos inside a film review, including source-scoped breakdown summaries and the current sport's shared film-review tag schema so follow-up edits use the correct columns.";
  readonly parameters = ListFilmReviewSourcesInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListFilmReviewSourcesInputSchema.safeParse(input);
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

      const sources = buildSourceVideos(filmReview.sources) ?? [];
      const sportTagSchemaPayload = buildFilmReviewSportTagSchemaPayload(filmReview.sport);
      return {
        success: true,
        markdown:
          sources.length === 0
            ? `Film review **${filmReview.title}** has no persisted source videos.`
            : `Loaded **${sources.length}** source video(s) for **${filmReview.title}**.`,
        data: {
          filmReview: toSummary(filmReview),
          ...sportTagSchemaPayload,
          sources: sources.map((source) => ({
            ...source,
            breakdownSummary: buildSourceBreakdownSummary(source, filmReview),
          })),
          count: sources.length,
          ...(filmReview.breakdownSource ? { breakdownSource: filmReview.breakdownSource } : {}),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list film review sources',
      };
    }
  }
}

export class GetFilmReviewSourceBreakdownTool extends FilmReviewToolBase {
  readonly name = 'get_film_review_source_breakdown';
  readonly description =
    "Get one source video inside a film review together with its source-scoped breakdown rows, inherited breakdown provenance, and the current sport's shared film-review tag schema.";
  readonly parameters = GetFilmReviewSourceBreakdownInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetFilmReviewSourceBreakdownInputSchema.safeParse(input);
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

      const source = resolveFilmReviewSourceById(filmReview, parsed.data.sourceId);
      if (!source) {
        return {
          success: false,
          error: `Source video ${parsed.data.sourceId} was not found in this film review.`,
        };
      }

      const timeline = getSourceScopedTimeline(filmReview, source.id);
      const sportTagSchemaPayload = buildFilmReviewSportTagSchemaPayload(filmReview.sport);
      return {
        success: true,
        markdown:
          timeline.length === 0
            ? `Loaded source video **${source.title ?? source.id}**. No source-scoped breakdown rows were found yet.`
            : `Loaded source video **${source.title ?? source.id}** with **${timeline.length}** breakdown row(s).`,
        data: {
          filmReview: toSummary(filmReview),
          ...sportTagSchemaPayload,
          source,
          breakdownSummary: buildSourceBreakdownSummary(source, filmReview),
          timeline,
          playCount: timeline.length,
          ...(filmReview.breakdownSource ? { breakdownSource: filmReview.breakdownSource } : {}),
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to load film review source breakdown',
      };
    }
  }
}

export class UpdateFilmReviewSourceBreakdownTool extends FilmReviewToolBase {
  readonly name = 'update_film_review_source_breakdown';
  readonly description =
    "Create, replace, or append source-scoped breakdown rows for one source video inside a film review. Build each row's tags from the current sport's shared film-review tag schema; if no sport-specific schema resolves, use the generic schema.";
  readonly parameters = UpdateFilmReviewSourceBreakdownInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateFilmReviewSourceBreakdownInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(parsed.data.filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canManageReview(userId, existing))) {
        return { success: false, error: 'Not authorized to update this film review.' };
      }

      const sources = buildSourceVideos(existing.sources) ?? [];
      const source = sources.find((entry) => entry.id === parsed.data.sourceId) ?? null;
      if (!source) {
        return {
          success: false,
          error: `Source video ${parsed.data.sourceId} was not found in this film review.`,
        };
      }

      const nextSourceTimeline = buildSourceBreakdownTimelineSegments(
        parsed.data.timeline,
        parsed.data.sourceId,
        existing.sport
      );
      const nextTimeline = mergeFilmReviewSourceBreakdown({
        existingTimeline: existing.timeline,
        sourceCount: sources.length,
        sourceId: parsed.data.sourceId,
        nextSourceTimeline,
        mergeMode: parsed.data.mergeMode ?? 'replace',
      });
      const now = new Date().toISOString();

      await docRef.update({
        timeline: nextTimeline,
        timelineState: nextTimeline.length > 0 ? 'ready' : 'idle',
        timelineGeneratedAt: now,
        timelineError: null,
        updatedBy: userId,
        updatedAt: now,
      });
      await invalidateFilmReviewCaches(existing.teamId, existing.sport);

      const updatedReview = {
        ...existing,
        timeline: nextTimeline,
        timelineState: nextTimeline.length > 0 ? 'ready' : 'idle',
        timelineGeneratedAt: now,
        timelineError: null,
        updatedBy: userId,
        updatedAt: now,
      } as TeamFilmReviewDoc;
      const sportTagSchemaPayload = buildFilmReviewSportTagSchemaPayload(updatedReview.sport);

      return {
        success: true,
        markdown:
          parsed.data.mergeMode === 'append'
            ? `Appended **${nextSourceTimeline.length}** breakdown row(s) to source **${source.title ?? source.id}**.`
            : `Replaced source **${source.title ?? source.id}** breakdown with **${nextSourceTimeline.length}** row(s).`,
        data: {
          filmReview: toSummary(updatedReview),
          ...sportTagSchemaPayload,
          source,
          mergeMode: parsed.data.mergeMode ?? 'replace',
          timeline: getSourceScopedTimeline(updatedReview, source.id),
          playCount: getSourceScopedTimeline(updatedReview, source.id).length,
          breakdownSummary: buildSourceBreakdownSummary(source, updatedReview),
          ...(updatedReview.breakdownSource
            ? { breakdownSource: updatedReview.breakdownSource }
            : {}),
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to update film review source breakdown',
      };
    }
  }
}

export class DeleteFilmReviewSourceBreakdownTool extends FilmReviewToolBase {
  readonly name = 'delete_film_review_source_breakdown';
  readonly description =
    'Delete some or all source-scoped breakdown rows for one source video inside a film review.';
  readonly parameters = DeleteFilmReviewSourceBreakdownInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteFilmReviewSourceBreakdownInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(parsed.data.filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canManageReview(userId, existing))) {
        return { success: false, error: 'Not authorized to update this film review.' };
      }

      const sources = buildSourceVideos(existing.sources) ?? [];
      const source = sources.find((entry) => entry.id === parsed.data.sourceId) ?? null;
      if (!source) {
        return {
          success: false,
          error: `Source video ${parsed.data.sourceId} was not found in this film review.`,
        };
      }

      const deletion = deleteFilmReviewSourceBreakdownRows({
        existingTimeline: existing.timeline,
        sourceCount: sources.length,
        sourceId: parsed.data.sourceId,
        rowIds: parsed.data.rowIds,
      });
      if (deletion.deletedCount === 0) {
        return {
          success: false,
          error:
            parsed.data.rowIds && parsed.data.rowIds.length > 0
              ? 'None of the requested source breakdown row IDs were found.'
              : 'This source does not currently have any breakdown rows to delete.',
        };
      }

      const now = new Date().toISOString();
      await docRef.update({
        timeline: deletion.timeline,
        timelineState: deletion.timeline.length > 0 ? 'ready' : 'idle',
        timelineGeneratedAt: now,
        timelineError: null,
        updatedBy: userId,
        updatedAt: now,
      });
      await invalidateFilmReviewCaches(existing.teamId, existing.sport);

      const updatedReview = {
        ...existing,
        timeline: deletion.timeline,
        timelineState: deletion.timeline.length > 0 ? 'ready' : 'idle',
        timelineGeneratedAt: now,
        timelineError: null,
        updatedBy: userId,
        updatedAt: now,
      } as TeamFilmReviewDoc;

      return {
        success: true,
        markdown:
          parsed.data.rowIds && parsed.data.rowIds.length > 0
            ? `Deleted **${deletion.deletedCount}** source breakdown row(s) from **${source.title ?? source.id}**.`
            : `Cleared all source breakdown rows from **${source.title ?? source.id}**.`,
        data: {
          filmReview: toSummary(updatedReview),
          source,
          deletedCount: deletion.deletedCount,
          timeline: getSourceScopedTimeline(updatedReview, source.id),
          playCount: getSourceScopedTimeline(updatedReview, source.id).length,
          breakdownSummary: buildSourceBreakdownSummary(source, updatedReview),
          ...(updatedReview.breakdownSource
            ? { breakdownSource: updatedReview.breakdownSource }
            : {}),
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to delete film review source breakdown',
      };
    }
  }
}

export class AddFilmReviewSourceTool extends FilmReviewToolBase {
  readonly name = 'add_film_review_source';
  readonly description =
    'Add a single source video into a film review and keep the review media fields in sync.';
  readonly parameters = AddFilmReviewSourceInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = AddFilmReviewSourceInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId, source } = parsed.data;

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

      const existingSources = buildSourceVideos(existing.sources) ?? [];
      const nextSource = buildSourceVideos([source])?.[0];
      if (!nextSource) {
        return { success: false, error: 'A valid source video is required.' };
      }
      if (existingSources.some((entry) => entry.id === nextSource.id)) {
        return {
          success: false,
          error: `Source video ${nextSource.id} already exists in this film review.`,
        };
      }

      const nextSources = buildSourceVideos([...existingSources, nextSource]) ?? [];
      const resolvedMedia = resolveFilmReviewMediaFields({
        sources: nextSources,
        fallbackVideoUrl: existing.videoUrl,
        fallbackStoragePath: existing.storagePath,
        fallbackCloudflareVideoId: existing.cloudflareVideoId,
        fallbackCloudflareStatus: existing.cloudflareStatus,
        fallbackReadyToStream: existing.readyToStream,
        fallbackThumbnailUrl: existing.thumbnailUrl,
        fallbackDurationSec: existing.durationSec,
      });
      if ('error' in resolvedMedia) {
        return { success: false, error: resolvedMedia.error };
      }

      const now = new Date().toISOString();
      const timeline = buildTimelineForSourceSet(
        existing.timeline,
        nextSources,
        resolvedMedia.fields.uploadMode,
        resolvedMedia.fields.durationSec
      );
      const updateData: Record<string, unknown> = {
        sources: nextSources,
        uploadMode: resolvedMedia.fields.uploadMode,
        videoUrl: resolvedMedia.fields.videoUrl,
        schemaVersion: resolvedMedia.fields.schemaVersion,
        timeline,
        timelineState: timeline.length > 0 ? 'ready' : 'idle',
        timelineGeneratedAt: now,
        timelineError: null,
        updatedBy: userId,
        updatedAt: now,
      };

      if (resolvedMedia.fields.storagePath)
        updateData['storagePath'] = resolvedMedia.fields.storagePath;
      if (resolvedMedia.fields.cloudflareVideoId) {
        updateData['cloudflareVideoId'] = resolvedMedia.fields.cloudflareVideoId;
      }
      if (resolvedMedia.fields.cloudflareStatus) {
        updateData['cloudflareStatus'] = resolvedMedia.fields.cloudflareStatus;
      }
      if (resolvedMedia.fields.readyToStream !== undefined) {
        updateData['readyToStream'] = resolvedMedia.fields.readyToStream;
      }
      if (resolvedMedia.fields.thumbnailUrl)
        updateData['thumbnailUrl'] = resolvedMedia.fields.thumbnailUrl;
      if (resolvedMedia.fields.durationSec !== undefined)
        updateData['durationSec'] = resolvedMedia.fields.durationSec;

      await docRef.update(updateData);
      await invalidateFilmReviewCaches(existing.teamId, existing.sport);

      return {
        success: true,
        markdown: `Added source video **${nextSource.title ?? nextSource.id}** to **${existing.title}**.`,
        data: {
          filmReview: toSummary({ ...existing, ...updateData } as TeamFilmReviewDoc),
          source: nextSource,
          sourceCount: nextSources.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add film review source',
      };
    }
  }
}

export class UpdateFilmReviewSourceTool extends FilmReviewToolBase {
  readonly name = 'update_film_review_source';
  readonly description =
    'Update one source video inside a film review, including order, title, URLs, and streaming metadata.';
  readonly parameters = UpdateFilmReviewSourceInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateFilmReviewSourceInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId, sourceId } = parsed.data;

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

      const existingSources = buildSourceVideos(existing.sources) ?? [];
      if (!existingSources.some((entry) => entry.id === sourceId)) {
        return {
          success: false,
          error: `Source video ${sourceId} was not found in this film review.`,
        };
      }

      const nextSources =
        buildSourceVideos(
          existingSources.map((entry) =>
            entry.id === sourceId ? mergeFilmReviewSource(entry, parsed.data) : entry
          )
        ) ?? [];
      const updatedSource = nextSources.find(
        (entry) => entry.id === sourceId
      ) as TeamFilmReviewSourceVideo;
      const resolvedMedia = resolveFilmReviewMediaFields({
        sources: nextSources,
        fallbackVideoUrl: existing.videoUrl,
        fallbackStoragePath: existing.storagePath,
        fallbackCloudflareVideoId: existing.cloudflareVideoId,
        fallbackCloudflareStatus: existing.cloudflareStatus,
        fallbackReadyToStream: existing.readyToStream,
        fallbackThumbnailUrl: existing.thumbnailUrl,
        fallbackDurationSec: existing.durationSec,
      });
      if ('error' in resolvedMedia) {
        return { success: false, error: resolvedMedia.error };
      }

      const now = new Date().toISOString();
      const timeline = buildTimelineForSourceSet(
        existing.timeline,
        nextSources,
        resolvedMedia.fields.uploadMode,
        resolvedMedia.fields.durationSec
      );
      const updateData: Record<string, unknown> = {
        sources: nextSources,
        uploadMode: resolvedMedia.fields.uploadMode,
        videoUrl: resolvedMedia.fields.videoUrl,
        schemaVersion: resolvedMedia.fields.schemaVersion,
        timeline,
        timelineState: timeline.length > 0 ? 'ready' : 'idle',
        timelineGeneratedAt: now,
        timelineError: null,
        updatedBy: userId,
        updatedAt: now,
      };

      if (resolvedMedia.fields.storagePath)
        updateData['storagePath'] = resolvedMedia.fields.storagePath;
      if (resolvedMedia.fields.cloudflareVideoId) {
        updateData['cloudflareVideoId'] = resolvedMedia.fields.cloudflareVideoId;
      }
      if (resolvedMedia.fields.cloudflareStatus) {
        updateData['cloudflareStatus'] = resolvedMedia.fields.cloudflareStatus;
      }
      if (resolvedMedia.fields.readyToStream !== undefined) {
        updateData['readyToStream'] = resolvedMedia.fields.readyToStream;
      }
      if (resolvedMedia.fields.thumbnailUrl)
        updateData['thumbnailUrl'] = resolvedMedia.fields.thumbnailUrl;
      if (resolvedMedia.fields.durationSec !== undefined)
        updateData['durationSec'] = resolvedMedia.fields.durationSec;

      await docRef.update(updateData);
      await invalidateFilmReviewCaches(existing.teamId, existing.sport);

      return {
        success: true,
        markdown: `Updated source video **${updatedSource.title ?? updatedSource.id}** in **${existing.title}**.`,
        data: {
          filmReview: toSummary({ ...existing, ...updateData } as TeamFilmReviewDoc),
          source: updatedSource,
          sourceCount: nextSources.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update film review source',
      };
    }
  }
}

export class DeleteFilmReviewSourceTool extends FilmReviewToolBase {
  readonly name = 'delete_film_review_source';
  readonly description =
    'Delete one source video from a film review and keep the remaining source-backed metadata valid.';
  readonly parameters = DeleteFilmReviewSourceInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteFilmReviewSourceInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId, sourceId } = parsed.data;

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

      const existingSources = buildSourceVideos(existing.sources) ?? [];
      const deletedSource = existingSources.find((entry) => entry.id === sourceId);
      if (!deletedSource) {
        return {
          success: false,
          error: `Source video ${sourceId} was not found in this film review.`,
        };
      }

      const remainingSources =
        buildSourceVideos(existingSources.filter((entry) => entry.id !== sourceId)) ?? [];
      if (remainingSources.length === 0) {
        return {
          success: false,
          error:
            'Deleting the last source video would leave this review source-less. Replace the source or delete the full film review instead.',
        };
      }

      const resolvedMedia = resolveFilmReviewMediaFields({
        sources: remainingSources,
        fallbackVideoUrl: existing.videoUrl,
        fallbackStoragePath: existing.storagePath,
        fallbackCloudflareVideoId: existing.cloudflareVideoId,
        fallbackCloudflareStatus: existing.cloudflareStatus,
        fallbackReadyToStream: existing.readyToStream,
        fallbackThumbnailUrl: existing.thumbnailUrl,
        fallbackDurationSec: existing.durationSec,
      });
      if ('error' in resolvedMedia) {
        return { success: false, error: resolvedMedia.error };
      }

      const now = new Date().toISOString();
      const timeline = buildTimelineForSourceSet(
        existing.timeline,
        remainingSources,
        resolvedMedia.fields.uploadMode,
        resolvedMedia.fields.durationSec
      );
      const updateData: Record<string, unknown> = {
        sources: remainingSources,
        uploadMode: resolvedMedia.fields.uploadMode,
        videoUrl: resolvedMedia.fields.videoUrl,
        schemaVersion: resolvedMedia.fields.schemaVersion,
        timeline,
        timelineState: timeline.length > 0 ? 'ready' : 'idle',
        timelineGeneratedAt: now,
        timelineError: null,
        updatedBy: userId,
        updatedAt: now,
      };

      if (resolvedMedia.fields.storagePath)
        updateData['storagePath'] = resolvedMedia.fields.storagePath;
      if (resolvedMedia.fields.cloudflareVideoId) {
        updateData['cloudflareVideoId'] = resolvedMedia.fields.cloudflareVideoId;
      }
      if (resolvedMedia.fields.cloudflareStatus) {
        updateData['cloudflareStatus'] = resolvedMedia.fields.cloudflareStatus;
      }
      if (resolvedMedia.fields.readyToStream !== undefined) {
        updateData['readyToStream'] = resolvedMedia.fields.readyToStream;
      }
      if (resolvedMedia.fields.thumbnailUrl)
        updateData['thumbnailUrl'] = resolvedMedia.fields.thumbnailUrl;
      if (resolvedMedia.fields.durationSec !== undefined)
        updateData['durationSec'] = resolvedMedia.fields.durationSec;

      await docRef.update(updateData);
      await invalidateFilmReviewCaches(existing.teamId, existing.sport);

      return {
        success: true,
        markdown: `Deleted source video **${deletedSource.title ?? deletedSource.id}** from **${existing.title}**.`,
        data: {
          filmReview: toSummary({ ...existing, ...updateData } as TeamFilmReviewDoc),
          deletedSourceId: deletedSource.id,
          sourceCount: remainingSources.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete film review source',
      };
    }
  }
}

export class SaveFilmReviewTool extends FilmReviewToolBase {
  readonly name = 'save_film_review';
  readonly description =
    'Create or replace a team film review record. Supports single-video, full-footage, and batch-clip reviews with first-class uploadMode and source-video inputs.';
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
      const sources = buildSourceVideos(payload.sources);
      const resolvedMedia = resolveFilmReviewMediaFields({
        requestedUploadMode: payload.uploadMode,
        sources,
        fallbackVideoUrl: payload.videoUrl,
        fallbackStoragePath: payload.storagePath,
        fallbackCloudflareVideoId: payload.cloudflareVideoId,
        fallbackCloudflareStatus: payload.cloudflareStatus,
        fallbackReadyToStream: payload.readyToStream,
        fallbackThumbnailUrl: payload.thumbnailUrl,
        fallbackDurationSec: payload.durationSec,
      });
      if ('error' in resolvedMedia) {
        return { success: false, error: resolvedMedia.error };
      }

      const initialStatus =
        payload.status ??
        (resolvedMedia.fields.cloudflareVideoId && resolvedMedia.fields.readyToStream !== true
          ? 'processing'
          : 'ready');
      const aiSeed = buildSyntheticFilmReviewAi({
        sport: normalizedSport,
        title: payload.title,
        opponentName: payload.opponentName,
        durationSec: resolvedMedia.fields.durationSec,
      });
      const aiTags = buildTimelineTags(payload.aiTags) ?? aiSeed.aiTags;
      const clips = buildClips(payload.clips);
      const timeline =
        buildTimelineSegments(payload.timeline, normalizedSport) ??
        buildTimelineForSourceSet(
          undefined,
          resolvedMedia.fields.sources ?? [],
          resolvedMedia.fields.uploadMode,
          resolvedMedia.fields.durationSec
        );
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
        uploadMode: resolvedMedia.fields.uploadMode,
        videoUrl: resolvedMedia.fields.videoUrl,
        ...(resolvedMedia.fields.sources ? { sources: resolvedMedia.fields.sources } : {}),
        ...(resolvedMedia.fields.storagePath
          ? { storagePath: resolvedMedia.fields.storagePath }
          : {}),
        ...(resolvedMedia.fields.cloudflareVideoId
          ? { cloudflareVideoId: resolvedMedia.fields.cloudflareVideoId }
          : {}),
        ...(resolvedMedia.fields.cloudflareStatus
          ? { cloudflareStatus: resolvedMedia.fields.cloudflareStatus }
          : {}),
        ...(resolvedMedia.fields.readyToStream !== undefined
          ? { readyToStream: resolvedMedia.fields.readyToStream }
          : {}),
        ...(resolvedMedia.fields.thumbnailUrl
          ? { thumbnailUrl: resolvedMedia.fields.thumbnailUrl }
          : {}),
        ...(payload.opponentName ? { opponentName: payload.opponentName.trim() } : {}),
        ...(payload.gameDate ? { gameDate: payload.gameDate.trim() } : {}),
        ...(payload.playlistId !== undefined ? { playlistId: payload.playlistId } : {}),
        ...(payload.playlistName !== undefined ? { playlistName: payload.playlistName } : {}),
        ...(payload.perspective
          ? { perspective: payload.perspective as TeamFilmReviewPerspective }
          : {}),
        ...(resolvedMedia.fields.durationSec !== undefined
          ? { durationSec: resolvedMedia.fields.durationSec }
          : {}),
        aiSummary: payload.aiSummary?.trim() ?? aiSeed.aiSummary,
        aiTags,
        ...(clips ? { clips } : {}),
        keyInsights,
        ...(tags ? { tags } : {}),
        ...(timeline.length > 0
          ? { timeline, timelineState: 'ready' as TeamFilmReviewTimelineState }
          : {}),
        annotations: existingData?.annotations ?? [],
        source: (payload.source ?? DEFAULT_SOURCE).trim(),
        ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl.trim() } : {}),
        schemaVersion: resolvedMedia.fields.schemaVersion,
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
    'Patch specific fields of an existing team film review, including title, status, uploadMode, source videos, metadata, AI summary, clips, tags, and timeline rows. For moving a review into a playlist folder, use move_film_review_to_playlist instead.';
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
      const hasUploadModeUpdate = Object.prototype.hasOwnProperty.call(updates, 'uploadMode');
      const hasSourcesUpdate = Object.prototype.hasOwnProperty.call(updates, 'sources');
      const hasTimelineUpdate = Object.prototype.hasOwnProperty.call(updates, 'timeline');
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
      if (hasTimelineUpdate) {
        updateData['timeline'] =
          buildTimelineSegments(updates.timeline, nextSport ?? existing.sport) ?? [];
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

      if (hasUploadModeUpdate || hasSourcesUpdate) {
        const nextSources = hasSourcesUpdate
          ? buildSourceVideos(updates.sources)
          : buildSourceVideos(existing.sources);
        const resolvedMedia = resolveFilmReviewMediaFields({
          requestedUploadMode: hasUploadModeUpdate ? updates.uploadMode : existing.uploadMode,
          sources: nextSources,
          fallbackVideoUrl: updates.videoUrl ?? existing.videoUrl,
          fallbackStoragePath: updates.storagePath ?? existing.storagePath,
          fallbackCloudflareVideoId: updates.cloudflareVideoId ?? existing.cloudflareVideoId,
          fallbackCloudflareStatus: updates.cloudflareStatus ?? existing.cloudflareStatus,
          fallbackReadyToStream:
            updates.readyToStream !== undefined ? updates.readyToStream : existing.readyToStream,
          fallbackThumbnailUrl: updates.thumbnailUrl ?? existing.thumbnailUrl,
          fallbackDurationSec:
            updates.durationSec !== undefined ? updates.durationSec : existing.durationSec,
        });
        if ('error' in resolvedMedia) {
          return { success: false, error: resolvedMedia.error };
        }

        updateData['uploadMode'] = resolvedMedia.fields.uploadMode;
        updateData['videoUrl'] = resolvedMedia.fields.videoUrl;
        updateData['schemaVersion'] = resolvedMedia.fields.schemaVersion;
        updateData['sources'] = resolvedMedia.fields.sources ?? [];

        if (resolvedMedia.fields.storagePath) {
          updateData['storagePath'] = resolvedMedia.fields.storagePath;
        }
        if (resolvedMedia.fields.cloudflareVideoId) {
          updateData['cloudflareVideoId'] = resolvedMedia.fields.cloudflareVideoId;
        }
        if (resolvedMedia.fields.cloudflareStatus) {
          updateData['cloudflareStatus'] = resolvedMedia.fields.cloudflareStatus;
        }
        if (resolvedMedia.fields.readyToStream !== undefined) {
          updateData['readyToStream'] = resolvedMedia.fields.readyToStream;
        }
        if (resolvedMedia.fields.thumbnailUrl) {
          updateData['thumbnailUrl'] = resolvedMedia.fields.thumbnailUrl;
        }
        if (resolvedMedia.fields.durationSec !== undefined) {
          updateData['durationSec'] = resolvedMedia.fields.durationSec;
        }

        if (!hasTimelineUpdate) {
          const nextTimeline = buildTimelineForSourceSet(
            existing.timeline,
            resolvedMedia.fields.sources ?? [],
            resolvedMedia.fields.uploadMode,
            resolvedMedia.fields.durationSec
          );
          updateData['timeline'] = nextTimeline;
          updateData['timelineState'] = nextTimeline.length > 0 ? 'ready' : 'idle';
          updateData['timelineGeneratedAt'] = now;
          updateData['timelineError'] = null;
        }
      }

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

      const updatedReview = {
        ...existing,
        ...updateData,
      } as TeamFilmReviewDoc;

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
          filmReview: toSummary(updatedReview),
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
      const mediaAssetRefs = collectFilmReviewMediaAssetRefs(filmReview);

      for (const cloudflareVideoId of mediaAssetRefs.cloudflareVideoIds) {
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

      for (const storagePath of mediaAssetRefs.storagePaths) {
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
        cloudflareDeleted: mediaAssetRefs.cloudflareVideoIds.length > 0,
        firebaseDeleted: mediaAssetRefs.storagePaths.length > 0,
        deletedCloudflareAssetCount: mediaAssetRefs.cloudflareVideoIds.length,
        deletedFirebaseAssetCount: mediaAssetRefs.storagePaths.length,
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

export class ListFilmReviewPlaylistsTool extends FilmReviewToolBase {
  readonly name = 'list_film_review_playlists';
  readonly description =
    'List persisted film review playlists for a team, including nesting and sort order.';
  readonly parameters = ListFilmReviewPlaylistsInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListFilmReviewPlaylistsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const teamData = await this.getTeamData(parsed.data.teamId);
    if (isToolResult(teamData)) return teamData;

    const authorized = await canReadTeamIntelForUser(this.db, userId, parsed.data.teamId, teamData);
    if (!authorized) {
      return {
        success: false,
        error: 'Not authorized to view film review playlists for this team.',
      };
    }

    try {
      const playlists = await listTeamFilmReviewPlaylists(this.db, parsed.data.teamId);
      return {
        success: true,
        markdown:
          playlists.length === 0
            ? 'No persisted film review playlists were found for this team.'
            : `Found **${playlists.length}** film review playlist(s).`,
        data: {
          playlists,
          count: playlists.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list film review playlists',
      };
    }
  }
}

export class CreateFilmReviewPlaylistTool extends FilmReviewToolBase {
  readonly name = 'create_film_review_playlist';
  readonly description =
    'Create a persisted film review playlist folder for a team, with optional nesting and sort order.';
  readonly parameters = CreateFilmReviewPlaylistInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CreateFilmReviewPlaylistInputSchema.safeParse(input);
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
        return {
          success: false,
          error: 'Not authorized to create film review playlists for this team.',
        };
      }

      const playlists = await listTeamFilmReviewPlaylists(this.db, payload.teamId);
      const parentId = payload.parentId?.trim() || null;
      if (parentId && !playlists.some((playlist) => playlist.id === parentId)) {
        return { success: false, error: 'Parent playlist was not found for this team.' };
      }

      const siblingPlaylists = playlists.filter(
        (playlist) => (playlist.parentId?.trim() || null) === parentId
      );
      const nextSortOrder =
        payload.sortOrder ??
        siblingPlaylists.reduce(
          (maxOrder, playlist) => Math.max(maxOrder, playlist.sortOrder ?? 0),
          -1
        ) + 1;
      const now = new Date().toISOString();
      const playlistId = payload.playlistId?.trim() || `film_playlist_${randomUUID()}`;
      const docRef = this.db.collection(TEAM_FILM_REVIEW_PLAYLISTS_COLLECTION).doc(playlistId);
      const existingDoc = await docRef.get();
      if (existingDoc.exists) {
        return { success: false, error: `Film review playlist ${playlistId} already exists.` };
      }

      const playlist: TeamFilmReviewPlaylistDoc = {
        id: playlistId,
        teamId: payload.teamId,
        name: payload.name.trim(),
        ...(parentId ? { parentId } : {}),
        sortOrder: nextSortOrder,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      };

      await docRef.set(playlist);
      await invalidateFilmReviewPlaylistCaches(payload.teamId);

      return {
        success: true,
        markdown: `Created film review playlist **${playlist.name}**.`,
        data: { playlist },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create film review playlist',
      };
    }
  }
}

export class UpdateFilmReviewPlaylistTool extends FilmReviewToolBase {
  readonly name = 'update_film_review_playlist';
  readonly description =
    'Update a persisted film review playlist folder name, nesting, or sort order. Renames cascade to assigned review summaries.';
  readonly parameters = UpdateFilmReviewPlaylistInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateFilmReviewPlaylistInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { playlistId, ...updates } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEW_PLAYLISTS_COLLECTION).doc(playlistId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review playlist ${playlistId} not found.` };
      }

      const existing = doc.data() as TeamFilmReviewPlaylistDoc;
      const teamData = await this.getTeamData(existing.teamId);
      if (isToolResult(teamData)) return teamData;

      const authorized = await canManageTeamMutationForUser(
        this.db,
        userId,
        existing.teamId,
        teamData
      );
      if (!authorized) {
        return { success: false, error: 'Not authorized to update this film review playlist.' };
      }

      const playlists = await listTeamFilmReviewPlaylists(this.db, existing.teamId);
      const nextParentId =
        updates.parentId !== undefined
          ? updates.parentId?.trim() || null
          : (existing.parentId ?? null);

      if (nextParentId === playlistId) {
        return { success: false, error: 'A playlist cannot be its own parent.' };
      }
      if (nextParentId && !playlists.some((playlist) => playlist.id === nextParentId)) {
        return { success: false, error: 'Parent playlist was not found for this team.' };
      }
      if (nextParentId && isFilmReviewPlaylistDescendant(nextParentId, playlistId, playlists)) {
        return {
          success: false,
          error: 'A playlist cannot be moved into one of its descendants.',
        };
      }

      const now = new Date().toISOString();
      const updateData: Record<string, unknown> = {
        updatedBy: userId,
        updatedAt: now,
      };
      if (updates.name !== undefined) updateData['name'] = updates.name.trim();
      if (updates.parentId !== undefined) updateData['parentId'] = nextParentId;
      if (updates.sortOrder !== undefined) updateData['sortOrder'] = updates.sortOrder;

      await docRef.update(updateData);
      if (updates.name !== undefined && updates.name.trim() !== existing.name) {
        await syncFilmReviewPlaylistReviewNames(
          this.db,
          existing.teamId,
          playlistId,
          updates.name.trim()
        );
      }
      await invalidateFilmReviewPlaylistCaches(existing.teamId);

      const updated = (await docRef.get()).data() as TeamFilmReviewPlaylistDoc;
      return {
        success: true,
        markdown: `Updated film review playlist **${updated.name}**.`,
        data: { playlist: updated },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update film review playlist',
      };
    }
  }
}

export class DeleteFilmReviewPlaylistTool extends FilmReviewToolBase {
  readonly name = 'delete_film_review_playlist';
  readonly description =
    'Delete a persisted film review playlist folder, clear assigned reviews, and reparent child playlists.';
  readonly parameters = DeleteFilmReviewPlaylistInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteFilmReviewPlaylistInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { playlistId } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEW_PLAYLISTS_COLLECTION).doc(playlistId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review playlist ${playlistId} not found.` };
      }

      const playlist = doc.data() as TeamFilmReviewPlaylistDoc;
      const teamData = await this.getTeamData(playlist.teamId);
      if (isToolResult(teamData)) return teamData;

      const authorized = await canManageTeamMutationForUser(
        this.db,
        userId,
        playlist.teamId,
        teamData
      );
      if (!authorized) {
        return { success: false, error: 'Not authorized to delete this film review playlist.' };
      }

      const now = new Date().toISOString();
      const [unassignedReviewCount, reparentedChildCount] = await Promise.all([
        clearFilmReviewPlaylistAssignments(this.db, playlist.teamId, playlistId, userId, now),
        reparentFilmReviewPlaylistChildren(
          this.db,
          playlist.teamId,
          playlistId,
          playlist.parentId?.trim() || null,
          userId,
          now
        ),
      ]);

      await docRef.delete();
      await invalidateFilmReviewPlaylistCaches(playlist.teamId);

      return {
        success: true,
        markdown: `Deleted film review playlist **${playlist.name}**.`,
        data: {
          playlist: {
            id: playlist.id,
            teamId: playlist.teamId,
            name: playlist.name,
            deleted: true,
          },
          unassignedReviewCount,
          reparentedChildCount,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete film review playlist',
      };
    }
  }
}

export class MoveFilmReviewToPlaylistTool extends FilmReviewToolBase {
  readonly name = 'move_film_review_to_playlist';
  readonly description =
    'Move a film review into a specific persisted playlist folder. Resolve the playlist first and use this instead of generic update_film_review for playlist routing.';
  readonly parameters = MoveFilmReviewToPlaylistInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = MoveFilmReviewToPlaylistInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const { filmReviewId, playlistId, playlistName } = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${filmReviewId} not found.` };
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canManageReview(userId, existing))) {
        return { success: false, error: 'Not authorized to move this film review.' };
      }

      const playlists = await listTeamFilmReviewPlaylists(this.db, existing.teamId);
      const target = resolveFilmReviewPlaylistTarget(playlists, { playlistId, playlistName });
      if ('error' in target) {
        return { success: false, error: target.error };
      }

      const now = new Date().toISOString();
      await docRef.update({
        playlistId: target.playlist.id,
        playlistName: target.playlist.name,
        updatedBy: userId,
        updatedAt: now,
      });
      await invalidateFilmReviewCaches(existing.teamId, existing.sport);

      const updatedReview = {
        ...existing,
        playlistId: target.playlist.id,
        playlistName: target.playlist.name,
        updatedBy: userId,
        updatedAt: now,
      } as TeamFilmReviewDoc;

      return {
        success: true,
        markdown: `Moved film review **${existing.title}** into playlist **${target.playlist.name}**.`,
        data: {
          filmReview: toSummary(updatedReview),
          playlist: target.playlist,
          message: `Moved film review "${existing.title}" into playlist "${target.playlist.name}".`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to move film review to playlist',
      };
    }
  }
}

export class ExtractFilmReviewClipsTool extends FilmReviewToolBase {
  readonly name = 'extract_film_review_clips';
  readonly description =
    'Create new standalone film reviews from selected source clips inside a batch clip session, optionally routing the new review(s) into a playlist folder.';
  readonly parameters = ExtractFilmReviewClipsInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = true;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ExtractFilmReviewClipsInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const payload = parsed.data;

    try {
      const docRef = this.db.collection(TEAM_FILM_REVIEWS_COLLECTION).doc(payload.filmReviewId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return { success: false, error: `Film review ${payload.filmReviewId} not found.` };
      }

      const existing = doc.data() as TeamFilmReviewDoc;
      if (!(await this.canManageReview(userId, existing))) {
        return { success: false, error: 'Not authorized to extract clips from this film review.' };
      }

      const resolvedSources = resolveSelectedFilmReviewSources(existing, payload);
      if ('error' in resolvedSources) {
        return { success: false, error: resolvedSources.error };
      }

      const selectedSources = resolvedSources.sources;
      const playlists =
        payload.playlistId || payload.playlistName
          ? await listTeamFilmReviewPlaylists(this.db, existing.teamId)
          : [];
      const playlistTarget =
        payload.playlistId || payload.playlistName
          ? resolveFilmReviewPlaylistTarget(playlists, {
              playlistId: payload.playlistId,
              playlistName: payload.playlistName,
            })
          : null;
      if (playlistTarget && 'error' in playlistTarget) {
        return { success: false, error: playlistTarget.error };
      }

      const now = new Date().toISOString();
      const outputMode = payload.outputMode ?? 'separate_reviews';
      const selectedSourceIds = new Set(selectedSources.map((source) => source.id));
      const createdReviews: TeamFilmReviewDoc[] = [];

      if (outputMode === 'combined_review') {
        const title = buildCombinedExtractedFilmReviewTitle(
          existing,
          selectedSources,
          payload.title
        );
        const timeline = cloneTimelineSegmentsForSources(existing.timeline, selectedSourceIds);
        const seededTimeline =
          timeline.length > 0
            ? timeline
            : selectedSources.map((source, index) =>
                buildSeededSourceTimelineSegment(source, `Clip ${index + 1}`, index + 1)
              );
        const extractedReview = buildExtractedFilmReviewDoc({
          parent: existing,
          title,
          sources: selectedSources,
          timeline: seededTimeline,
          userId,
          now,
          ...(playlistTarget && 'playlist' in playlistTarget
            ? { playlist: playlistTarget.playlist }
            : {}),
        });

        await this.db
          .collection(TEAM_FILM_REVIEWS_COLLECTION)
          .doc(extractedReview.id)
          .set(extractedReview);
        createdReviews.push(extractedReview);
      } else {
        for (const [index, source] of selectedSources.entries()) {
          const title = source.title?.trim() || `Clip ${index + 1}`;
          const timeline = cloneTimelineSegmentsForSource(existing.timeline, source.id);
          const seededTimeline =
            timeline.length > 0 ? timeline : [buildSeededSourceTimelineSegment(source, title, 1)];
          const extractedReview = buildExtractedFilmReviewDoc({
            parent: existing,
            title,
            sources: [source],
            timeline: seededTimeline,
            userId,
            now,
            ...(playlistTarget && 'playlist' in playlistTarget
              ? { playlist: playlistTarget.playlist }
              : {}),
          });

          await this.db
            .collection(TEAM_FILM_REVIEWS_COLLECTION)
            .doc(extractedReview.id)
            .set(extractedReview);
          createdReviews.push(extractedReview);
        }
      }

      await invalidateFilmReviewCaches(existing.teamId, existing.sport);

      return {
        success: true,
        markdown:
          createdReviews.length === 1
            ? `Created extracted film review **${createdReviews[0]?.title ?? 'selected clips'}**.`
            : `Created **${createdReviews.length}** extracted film reviews from the selected clips.`,
        data: {
          createdFilmReviews: createdReviews.map((review) => toSummary(review)),
          count: createdReviews.length,
          sourceReview: toSummary(existing),
          ...(playlistTarget && 'playlist' in playlistTarget
            ? { playlist: playlistTarget.playlist }
            : {}),
          message:
            createdReviews.length === 1
              ? `Created extracted film review "${createdReviews[0]?.title ?? 'selected clips'}".`
              : `Created ${createdReviews.length} extracted film reviews from the selected clips.`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to extract selected film review clips',
      };
    }
  }
}

export class BatchFullVideoTool extends FilmReviewToolBase {
  readonly name = 'batch_full_video';
  readonly description =
    'Deterministically batch-process full-game footage by splitting into time windows (e.g., 15-min chunks with overlap). Returns window definitions for agent video analysis orchestration. Supports sport-specific breakdown schema enforcement and resumable batch checkpoints.';
  readonly parameters = BatchFullVideoInputSchema;
  override readonly allowedAgents = ['strategy_coordinator', 'performance_coordinator'] as const;
  readonly isMutation = false;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = BatchFullVideoInputSchema.safeParse(input);
    if (!parsed.success) return this.zodError(parsed.error);

    const userId = this.requireUser(context);
    if (typeof userId !== 'string') return userId;

    const payload = parsed.data;
    const windowDurationSec = payload.windowDurationSec ?? 5 * 60; // 5 min default
    const windowOverlapSec = payload.windowOverlapSec ?? 10; // 10 sec default

    try {
      // Load film review
      const reviewSnap = await this.db
        .collection(TEAM_FILM_REVIEWS_COLLECTION)
        .doc(payload.filmReviewId)
        .get();

      if (!reviewSnap.exists) {
        return { success: false, error: `Film review ${payload.filmReviewId} not found.` };
      }

      const review = reviewSnap.data() as TeamFilmReviewDoc;

      // Validate read permissions
      const canRead = await this.canReadReview(userId, review);
      if (!canRead) {
        return { success: false, error: 'Not authorized to access this film review.' };
      }

      // Resolve source video
      const sourceId = payload.sourceId.trim();
      const source = (review.sources ?? []).find((s) => s.id === sourceId);

      if (!source) {
        return {
          success: false,
          error: `Source ${sourceId} not found in film review.`,
        };
      }

      const durationSec = source.durationSec ?? 0;
      if (durationSec <= 0) {
        return {
          success: false,
          error: `Source video has unknown or zero duration; cannot batch. Ensure source has durationSec set.`,
        };
      }

      // Resolve sport (from input or film review)
      const sport = payload.sport?.trim() || review.sport;
      if (!sport) {
        return { success: false, error: 'Sport must be provided or inferred from review.' };
      }

      // Validate sport schema is available
      const sportSchema = getTeamFilmReviewSportTagDefinitions(sport);
      if (!sportSchema.length) {
        return {
          success: false,
          error: `No sport schema defined for sport: ${sport}. Cannot enforce breakdown schema.`,
        };
      }

      // Calculate windows with overlap
      const windows: Array<{
        windowIndex: number;
        startSec: number;
        endSec: number;
        durationSec: number;
        label: string;
      }> = [];

      let windowIndex = 0;
      let currentStart = 0;

      while (currentStart < durationSec) {
        const currentEnd = Math.min(currentStart + windowDurationSec, durationSec);
        const actualDuration = currentEnd - currentStart;

        windows.push({
          windowIndex,
          startSec: currentStart,
          endSec: currentEnd,
          durationSec: actualDuration,
          label: `Window ${windowIndex + 1} (${Math.floor(currentStart / 60)}:${String(Math.floor(currentStart % 60)).padStart(2, '0')} - ${Math.floor(currentEnd / 60)}:${String(Math.floor(currentEnd % 60)).padStart(2, '0')})`,
        });

        // Move start by window duration minus overlap
        const nextStart = currentStart + (windowDurationSec - windowOverlapSec);
        if (nextStart >= currentEnd) {
          // Last window reached
          break;
        }
        currentStart = nextStart;
        windowIndex += 1;
      }

      if (windows.length === 0) {
        return {
          success: false,
          error: `Failed to calculate windows. Duration: ${durationSec}s, window: ${windowDurationSec}s, overlap: ${windowOverlapSec}s.`,
        };
      }

      // Build checkpoint status
      const checkpoint = {
        batchId: `batch_${payload.filmReviewId}_${sourceId}_${Date.now()}`,
        filmReviewId: payload.filmReviewId,
        sourceId,
        sport,
        videoTitle: source.title || 'Untitled',
        totalDurationSec: durationSec,
        windowDurationSec,
        windowOverlapSec,
        windowCount: windows.length,
        createdAt: new Date().toISOString(),
        createdBy: userId,
        status: 'ready_for_analysis',
      };

      return {
        success: true,
        markdown: `Batch processing **${source.title || 'full video'}** into **${windows.length}** windows of ${windowDurationSec}s with ${windowOverlapSec}s overlap. Duration: ${Math.floor(durationSec / 60)}min. Sport schema: **${sport}**.\n\nNext steps:\n1. Call \`analyze_video\` for each window's startSec-endSec range\n2. Collect results with sport-specific tags\n3. Call \`update_film_review_source_breakdown\` with all windows (merge_mode: 'append')\n\nExample: analyze_video with windowStart=0, windowEnd=${windows[0]?.endSec || windowDurationSec} for window 1`,
        data: {
          checkpoint,
          windows: windows.map((w) => ({
            index: w.windowIndex,
            startSec: w.startSec,
            endSec: w.endSec,
            durationSec: w.durationSec,
            label: w.label,
          })),
          sportSchema: sportSchema.map((def) => ({
            id: def.id,
            label: def.label,
            valueType: def.valueType,
            options: def.options,
          })),
          instructions: {
            action: 'batch_analysis_orchestration',
            description: 'Agent should call analyze_video for each window, then aggregate results',
            nextToolAfterAnalysis: 'update_film_review_source_breakdown',
            mergeMode: 'append',
            enforceSchema: true,
            schemaKey: resolveTeamFilmReviewSportTagSchemaKey(sport),
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to batch full video',
      };
    }
  }
}
