import { createHash, randomUUID } from 'node:crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { AgentXAttachment, TeamFileFolderDoc, TeamFilmReviewPlayTagValue } from '@nxt1/core';
import {
  TeamFilmReviewSourceBreakdownPatchError,
  getTeamFilmReviewSportTagDefinitions,
  getTeamFilmReviewRevision,
  isTeamFilmReviewSportTagValueValid,
  mergeTeamFilmReviewSourceBreakdownPatches,
  resolveTeamFilmReviewSportTagSchemaKey,
  resolveTeamFilmReviewRowOwnership,
  type TeamFilmReviewAnnotation,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlaySegment,
  type TeamFilmReviewRowOwnership,
  type TeamFilmReviewSourceBreakdownPatch,
  type TeamFilmReviewSourceVideo,
} from '@nxt1/core';
import {
  buildGrantedAccessKeys,
  canAccessByKeys,
  resolveFileAccessContext,
} from '../../../../../services/team/file-access-keys.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { upsertTeamFileFromAttachment } from '../../../../../services/team/team-files-index.service.js';
import {
  mutateUniversalFileDocumentAtomically,
  removeFilmReviewProjectionFromUniversalFileData,
  updateUniversalFileFilmReviewAtomically,
  upsertUniversalFileFromFilmReview,
} from '../../../../../services/team/universal-files-sync.service.js';
import { scheduleUniversalFileSemanticSync } from '../../../../../services/team/universal-file-semantic.service.js';
import {
  getFilmReviewSourceBreakdown,
  listUserScopedUniversalFilmReviews,
  loadUniversalFilmReview,
  summarizeFilmReview,
  toTeamFilmReviewDocFromUniversalFile,
  toUniversalFileDoc,
} from '../../../../../services/team/universal-film-reviews.service.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAMS_COLLECTION = 'Teams' as const;
const TEAM_FILE_FOLDERS_COLLECTION = 'TeamFileFolders' as const;

const ListFilmReviewsInputSchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const GetFilmReviewInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
});

const ListFilmReviewSourcesInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
});

const GetFilmReviewSourceBreakdownInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
});

const SearchFilmReviewBreakdownRowsInputSchema = z
  .object({
    filmReviewId: z.string().trim().min(1).describe('UniversalFiles film review ID to search.'),
    tagId: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('Schema tag ID to search, for example offForm or defFront.'),
    tagValue: z
      .union([z.string().trim().min(1), z.number().finite()])
      .optional()
      .describe(
        'Exact schema tag value as text or number. For 4-3 defense, pass the string "4-3".'
      ),
    searchText: z.string().trim().min(1).optional(),
    matchMode: z.enum(['exact', 'contains']).default('exact'),
    maxResults: z.number().int().min(1).max(200).default(50),
  })
  .refine((value) => value.tagValue !== undefined || value.searchText !== undefined, {
    message: 'tagValue or searchText must be provided',
    path: ['tagValue'],
  });

const TimelineRowSchema = z.record(z.string(), z.unknown());
const TimelineRowsInputSchema = z.union([z.string().trim().min(1), z.array(TimelineRowSchema)]);

const SaveFilmReviewInputSchema = z.object({
  filmReviewId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  videoUrl: z.string().trim().url().optional(),
  sourceUrl: z.string().trim().url().optional(),
  timeline: TimelineRowsInputSchema.optional(),
  aiSummary: z.string().trim().min(1).optional(),
  keyInsights: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)])
    .optional(),
  tags: z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]).optional(),
  uploadMode: z.enum(['single_video', 'batch_clips', 'full_footage']).optional(),
  status: z.enum(['draft', 'processing', 'ready', 'archived']).optional(),
});

const UpdateFilmReviewInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  timeline: TimelineRowsInputSchema.optional(),
  aiSummary: z.string().trim().min(1).nullable().optional(),
  keyInsights: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1), z.null()])
    .optional(),
  tags: z
    .union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1), z.null()])
    .optional(),
  uploadMode: z.enum(['single_video', 'batch_clips', 'full_footage']).optional(),
  status: z.enum(['draft', 'processing', 'ready', 'archived']).optional(),
});

const UpdateFilmReviewSourceBreakdownInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
  timeline: TimelineRowsInputSchema,
});

const SourceBreakdownPatchTagValueSchema = z.union([
  z.string().trim().min(1),
  z.number().finite(),
  z.boolean(),
]);

const SourceBreakdownPatchSchema = z
  .object({
    sourceId: z.string().trim().min(1),
    rowId: z.string().trim().min(1),
    tags: z.record(z.string().trim().min(1), SourceBreakdownPatchTagValueSchema).optional(),
    clearTagIds: z.array(z.string().trim().min(1)).max(32).optional(),
    tagProvenance: z
      .record(
        z.string().trim().min(1),
        z.object({
          origin: z.enum(['agent_x', 'manual', 'import']),
          confidence: z.number().finite().min(0).max(1).optional(),
          evidence: z.string().trim().min(1).max(800).optional(),
          operationId: z.string().trim().min(1).optional(),
          updatedAt: z.string().trim().min(1).optional(),
        })
      )
      .optional(),
    createIfMissing: z
      .object({
        number: z.number().int().min(1),
        label: z.string().trim().min(1).max(160),
        startSec: z.number().finite().nonnegative(),
        endSec: z.number().finite().positive(),
        confidence: z.number().finite().min(0).optional(),
      })
      .optional(),
  })
  .refine(
    (patch) => Object.keys(patch.tags ?? {}).length > 0 || (patch.clearTagIds?.length ?? 0) > 0,
    { message: 'Each patch must update tags or provide clearTagIds.' }
  );

const PatchFilmReviewSourceBreakdownsInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  expectedRevision: z.number().int().nonnegative().optional(),
  patches: z.array(SourceBreakdownPatchSchema).min(1).max(100),
});

const DeleteFilmReviewSourceBreakdownInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
});

const SourceVideoSchema = z.object({
  id: z.string().trim().min(1),
  order: z.number().int().min(0),
  fileId: z.string().trim().min(1).nullable().optional(),
  videoUrl: z.string().trim().url(),
  downloadUrl: z.string().trim().url().nullable().optional(),
  title: z.string().trim().min(1).nullable().optional(),
  storagePath: z.string().trim().min(1).nullable().optional(),
  cloudflareVideoId: z.string().trim().min(1).nullable().optional(),
  cloudflareStatus: z.string().trim().min(1).nullable().optional(),
  readyToStream: z.boolean().nullable().optional(),
  thumbnailUrl: z.string().trim().min(1).nullable().optional(),
  durationSec: z.number().nonnegative().nullable().optional(),
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
    videoUrl: z.string().trim().url().optional(),
    downloadUrl: z.string().trim().url().nullable().optional(),
    title: z.string().trim().min(1).nullable().optional(),
    storagePath: z.string().trim().min(1).nullable().optional(),
    cloudflareVideoId: z.string().trim().min(1).nullable().optional(),
    cloudflareStatus: z.string().trim().min(1).nullable().optional(),
    readyToStream: z.boolean().nullable().optional(),
    thumbnailUrl: z.string().trim().min(1).nullable().optional(),
    durationSec: z.number().nonnegative().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 2, {
    message: 'At least one source field besides filmReviewId and sourceId must be provided',
  });

const DeleteFilmReviewSourceInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
  sourceId: z.string().trim().min(1),
});

const DeleteFilmReviewInputSchema = z.object({
  filmReviewId: z.string().trim().min(1),
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

const ExtractFilmReviewClipSelectionInputSchema = z
  .object({
    filmReviewId: z.string().trim().min(1),
    sourceIds: z.array(z.string().trim().min(1)).min(1).max(50).optional(),
    sourceTitles: z.array(z.string().trim().min(1)).min(1).max(50).optional(),
  })
  .refine((value) => value.sourceIds !== undefined || value.sourceTitles !== undefined, {
    message: 'sourceIds or sourceTitles must be provided',
    path: ['sourceIds'],
  });

const ExtractFilmReviewClipsInputSchema = z
  .object({
    filmReviewId: z.string().trim().min(1).optional(),
    sourceIds: z.array(z.string().trim().min(1)).min(1).max(50).optional(),
    sourceTitles: z.array(z.string().trim().min(1)).min(1).max(50).optional(),
    reviewSelections: z.array(ExtractFilmReviewClipSelectionInputSchema).min(1).max(12).optional(),
    outputMode: z.enum(['separate_reviews', 'combined_review']).optional(),
    title: z.string().trim().min(1).optional(),
    playlistId: z.string().trim().min(1).optional(),
    playlistName: z.string().trim().min(1).optional(),
    folderId: z.string().trim().min(1).optional(),
    folderName: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) =>
      value.reviewSelections !== undefined ||
      (value.filmReviewId !== undefined &&
        (value.sourceIds !== undefined || value.sourceTitles !== undefined)),
    {
      message: 'Provide filmReviewId with sourceIds/sourceTitles or reviewSelections.',
      path: ['reviewSelections'],
    }
  )
  .refine((value) => !(value.reviewSelections && (value.sourceIds || value.sourceTitles)), {
    message:
      'Use reviewSelections instead of top-level sourceIds/sourceTitles for multi-review extraction.',
    path: ['reviewSelections'],
  });

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }
  return normalizeOptionalString(value);
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeSearchText(value: unknown): string | null {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value).toLowerCase() : null;
  }
  if (typeof value === 'boolean') {
    return String(value).toLowerCase();
  }
  return null;
}

function valuesMatchSearch(
  candidate: unknown,
  target: unknown,
  matchMode: 'exact' | 'contains'
): boolean {
  const candidateText = normalizeSearchText(candidate);
  const targetText = normalizeSearchText(target);
  if (!candidateText || !targetText) {
    return false;
  }
  return matchMode === 'contains'
    ? candidateText.includes(targetText)
    : candidateText === targetText;
}

function formatSearchTagValue(value: unknown): string {
  return typeof value === 'string' ? `"${value}"` : String(value);
}

function describeExpectedTagValue(definition: {
  readonly valueType: string;
  readonly options?: readonly string[];
}): string {
  if (definition.valueType === 'number') return 'a finite number';
  if (definition.valueType === 'boolean') return 'true or false';
  if (definition.valueType === 'enum' && definition.options?.length) {
    return `one of: ${definition.options.join(', ')}`;
  }
  return 'a non-empty string';
}

function toNonNegativeNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function normalizeStringList(value: unknown): readonly string[] | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? [normalized] : undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function parseTimelineRowsInput(
  value: z.infer<typeof TimelineRowsInputSchema>
): readonly Record<string, unknown>[] {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error('timeline must decode to an array of breakdown rows.');
    }

    return parsed.filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === 'object' && !Array.isArray(entry)
    );
  }

  return value;
}

function buildTimelineOwnership(
  review: TeamFilmReviewDoc,
  timeline: readonly TeamFilmReviewPlaySegment[] = review.timeline ?? []
): readonly TeamFilmReviewRowOwnership[] {
  return timeline.map((row) =>
    resolveTeamFilmReviewRowOwnership({
      sport: review.sport,
      perspective: review.perspective,
      row,
    })
  );
}

function summarizeTimelineOwnership(ownership: readonly TeamFilmReviewRowOwnership[]) {
  const rowKindCounts: Record<TeamFilmReviewRowOwnership['rowKind'], number> = {
    offense_defense: 0,
    possession: 0,
    at_bat: 0,
    special_teams: 0,
    neutral: 0,
    unknown: 0,
  };
  const confidenceCounts: Record<TeamFilmReviewRowOwnership['confidence'], number> = {
    verified: 0,
    inferred: 0,
    ambiguous: 0,
  };
  const offensiveTagTeamCounts: Record<
    TeamFilmReviewRowOwnership['offensiveTagsDescribe'],
    number
  > = {
    our: 0,
    opponent: 0,
    unknown: 0,
  };
  const defensiveTagTeamCounts: Record<
    TeamFilmReviewRowOwnership['defensiveTagsDescribe'],
    number
  > = {
    our: 0,
    opponent: 0,
    unknown: 0,
  };
  const requiredClarifications = new Set<string>();

  for (const rowOwnership of ownership) {
    rowKindCounts[rowOwnership.rowKind] += 1;
    confidenceCounts[rowOwnership.confidence] += 1;
    offensiveTagTeamCounts[rowOwnership.offensiveTagsDescribe] += 1;
    defensiveTagTeamCounts[rowOwnership.defensiveTagsDescribe] += 1;
    if (rowOwnership.requiredClarification) {
      requiredClarifications.add(rowOwnership.requiredClarification);
    }
  }

  return {
    rowCount: ownership.length,
    rowKindCounts,
    confidenceCounts,
    offensiveTagTeamCounts,
    defensiveTagTeamCounts,
    requiredClarifications: [...requiredClarifications],
  };
}

function buildOwnershipClarificationMarkdown(
  summary: ReturnType<typeof summarizeTimelineOwnership>
): string {
  if (summary.requiredClarifications.length === 0 && summary.confidenceCounts.ambiguous === 0) {
    return '';
  }

  const clarification = summary.requiredClarifications.length
    ? summary.requiredClarifications.join(' ')
    : 'Confirm which team the breakdown ownership fields are keyed to before mapping rows to our team or the scouting target.';

  return [
    '',
    '**STOP: ownership clarification required before scouting/report aggregation.**',
    `${summary.confidenceCounts.ambiguous} of ${summary.rowCount} row(s) have ambiguous team ownership.`,
    'Do not infer self-scout vs opponent scout from the film title, team profile, ODK, row order, or opponentName.',
    'Your next action must be: write the clarification question in prose, then call `ask_user` and wait.',
    `Ask the user: ${clarification}`,
  ].join('\n');
}

function normalizeReviewForResponse(review: TeamFilmReviewDoc) {
  const rowOwnership = buildTimelineOwnership(review);

  return {
    ...review,
    teamId: normalizeOptionalString(review.teamId),
    rowOwnership,
    ownershipSummary: summarizeTimelineOwnership(rowOwnership),
  };
}

function normalizeTimelineTagValue(value: unknown): TeamFilmReviewPlayTagValue | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'boolean' || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeTimelineTagValue(entry))
      .filter(
        (entry): entry is Exclude<TeamFilmReviewPlayTagValue, null> | null => entry !== undefined
      );
    if (normalized.length === 0) {
      return undefined;
    }
    return normalized.map((entry) => String(entry)).join(', ');
  }

  return undefined;
}

function buildTimelineSegmentId(
  sourceId: string | undefined,
  number: number,
  label: string,
  index: number
): string {
  const digest = createHash('sha1')
    .update(`${sourceId ?? 'film-review'}:${number}:${label}:${index}`)
    .digest('hex')
    .slice(0, 12);
  return `play-${digest}`;
}

function normalizeTimelineRows(input: {
  readonly rows: readonly Record<string, unknown>[];
  readonly sourceId?: string;
}): readonly TeamFilmReviewPlaySegment[] {
  const timeline: TeamFilmReviewPlaySegment[] = [];
  let cursorSec = 0;

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index] ?? {};
    const number = toPositiveInteger(row['number'] ?? row['playNumber'], index + 1);
    const startSec = toNonNegativeNumber(row['startSec']) ?? cursorSec;
    const endSec = toNonNegativeNumber(row['endSec']) ?? startSec + 1;
    const label =
      normalizeOptionalString(row['label']) ??
      normalizeOptionalString(row['title']) ??
      normalizeOptionalString(row['result']) ??
      `Play ${number}`;
    const confidence =
      toNonNegativeNumber(row['confidence']) ?? (row['startSec'] !== undefined ? 0.9 : 0.55);
    const tags: Record<string, TeamFilmReviewPlayTagValue> = {};

    for (const [key, rawValue] of Object.entries(row)) {
      if (
        key === 'id' ||
        key === 'number' ||
        key === 'playNumber' ||
        key === 'label' ||
        key === 'title' ||
        key === 'startSec' ||
        key === 'endSec' ||
        key === 'sourceId' ||
        key === 'confidence' ||
        key === 'annotation'
      ) {
        continue;
      }

      const normalizedValue = normalizeTimelineTagValue(rawValue);
      if (normalizedValue !== undefined) {
        tags[key] = normalizedValue;
      }
    }

    const normalizedEndSec = endSec > startSec ? endSec : startSec + 1;
    cursorSec = normalizedEndSec;
    timeline.push({
      id:
        normalizeOptionalString(row['id']) ??
        buildTimelineSegmentId(input.sourceId, number, label, index),
      number,
      label,
      startSec,
      endSec: normalizedEndSec,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(confidence >= 0 ? { confidence } : {}),
      ...(Object.keys(tags).length > 0 ? { tags } : {}),
    });
  }

  return timeline;
}

function sortTimeline(
  timeline: readonly TeamFilmReviewPlaySegment[]
): readonly TeamFilmReviewPlaySegment[] {
  return [...timeline].sort((left, right) => {
    if (left.startSec !== right.startSec) {
      return left.startSec - right.startSec;
    }
    return left.number - right.number;
  });
}

function applySourceScopedTimelineUpdate(input: {
  readonly review: TeamFilmReviewDoc;
  readonly sourceId: string;
  readonly sourceTimeline: readonly TeamFilmReviewPlaySegment[];
}): readonly TeamFilmReviewPlaySegment[] {
  const preserved = (input.review.timeline ?? []).filter(
    (segment) => segment.sourceId?.trim() !== input.sourceId
  );
  return sortTimeline([...preserved, ...input.sourceTimeline]);
}

function buildAttachmentName(title: string | undefined, mediaUrl: string): string {
  if (title) {
    return title;
  }

  try {
    const pathname = new URL(mediaUrl).pathname.split('/').filter(Boolean).pop();
    return pathname ? decodeURIComponent(pathname) : 'Film Review';
  } catch {
    return 'Film Review';
  }
}

function sortSources(
  sources: readonly TeamFilmReviewSourceVideo[]
): readonly TeamFilmReviewSourceVideo[] {
  return [...sources].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id)
  );
}

function normalizeSourceVideo(
  source: z.infer<typeof SourceVideoSchema>
): TeamFilmReviewSourceVideo {
  return {
    id: source.id.trim(),
    order: source.order,
    videoUrl: source.videoUrl.trim(),
    ...(normalizeNullableString(source.fileId) !== undefined
      ? { fileId: normalizeNullableString(source.fileId) }
      : {}),
    ...(normalizeNullableString(source.downloadUrl) !== undefined
      ? { downloadUrl: normalizeNullableString(source.downloadUrl) ?? undefined }
      : {}),
    ...(normalizeNullableString(source.title) !== undefined
      ? { title: normalizeNullableString(source.title) ?? undefined }
      : {}),
    ...(normalizeNullableString(source.storagePath) !== undefined
      ? { storagePath: normalizeNullableString(source.storagePath) ?? undefined }
      : {}),
    ...(normalizeNullableString(source.cloudflareVideoId) !== undefined
      ? { cloudflareVideoId: normalizeNullableString(source.cloudflareVideoId) ?? undefined }
      : {}),
    ...(normalizeNullableString(source.cloudflareStatus) !== undefined
      ? { cloudflareStatus: normalizeNullableString(source.cloudflareStatus) ?? undefined }
      : {}),
    ...(source.readyToStream !== undefined
      ? { readyToStream: source.readyToStream ?? undefined }
      : {}),
    ...(normalizeNullableString(source.thumbnailUrl) !== undefined
      ? { thumbnailUrl: normalizeNullableString(source.thumbnailUrl) ?? undefined }
      : {}),
    ...(source.durationSec !== undefined ? { durationSec: source.durationSec ?? undefined } : {}),
  };
}

function mergeFilmReviewSource(
  source: TeamFilmReviewSourceVideo,
  updates: z.infer<typeof UpdateFilmReviewSourceInputSchema>
): TeamFilmReviewSourceVideo {
  return {
    ...source,
    ...(updates.order !== undefined ? { order: updates.order } : {}),
    ...(updates.videoUrl !== undefined ? { videoUrl: updates.videoUrl.trim() } : {}),
    ...(updates.downloadUrl !== undefined
      ? { downloadUrl: normalizeNullableString(updates.downloadUrl) ?? undefined }
      : {}),
    ...(updates.title !== undefined
      ? { title: normalizeNullableString(updates.title) ?? undefined }
      : {}),
    ...(updates.storagePath !== undefined
      ? { storagePath: normalizeNullableString(updates.storagePath) ?? undefined }
      : {}),
    ...(updates.cloudflareVideoId !== undefined
      ? { cloudflareVideoId: normalizeNullableString(updates.cloudflareVideoId) ?? undefined }
      : {}),
    ...(updates.cloudflareStatus !== undefined
      ? { cloudflareStatus: normalizeNullableString(updates.cloudflareStatus) ?? undefined }
      : {}),
    ...(updates.readyToStream !== undefined
      ? { readyToStream: updates.readyToStream ?? undefined }
      : {}),
    ...(updates.thumbnailUrl !== undefined
      ? { thumbnailUrl: normalizeNullableString(updates.thumbnailUrl) ?? undefined }
      : {}),
    ...(updates.durationSec !== undefined ? { durationSec: updates.durationSec ?? undefined } : {}),
  };
}

function buildReviewMediaPatch(
  existing: TeamFilmReviewDoc,
  sources: readonly TeamFilmReviewSourceVideo[]
): Pick<
  TeamFilmReviewDoc,
  | 'sources'
  | 'uploadMode'
  | 'videoUrl'
  | 'storagePath'
  | 'cloudflareVideoId'
  | 'cloudflareStatus'
  | 'readyToStream'
  | 'thumbnailUrl'
  | 'durationSec'
> {
  const nextSources = sortSources(sources);
  const primary = nextSources[0];

  return {
    sources: nextSources,
    uploadMode: nextSources.length > 1 ? 'batch_clips' : 'single_video',
    videoUrl: primary?.videoUrl ?? existing.videoUrl,
    storagePath: primary?.storagePath ?? existing.storagePath,
    cloudflareVideoId: primary?.cloudflareVideoId ?? existing.cloudflareVideoId,
    cloudflareStatus: primary?.cloudflareStatus ?? existing.cloudflareStatus,
    readyToStream: primary?.readyToStream ?? existing.readyToStream,
    thumbnailUrl: primary?.thumbnailUrl ?? existing.thumbnailUrl,
    durationSec: primary?.durationSec ?? existing.durationSec,
  };
}

function buildUpdatedSourceReview(input: {
  readonly existing: TeamFilmReviewDoc;
  readonly userId: string;
  readonly sources: readonly TeamFilmReviewSourceVideo[];
  readonly timeline?: readonly TeamFilmReviewPlaySegment[];
  readonly title?: string;
  readonly playlistId?: string | null;
  readonly playlistName?: string | null;
}): TeamFilmReviewDoc {
  const now = new Date().toISOString();
  const media = buildReviewMediaPatch(input.existing, input.sources);
  const timeline = input.timeline ?? input.existing.timeline;

  return {
    ...input.existing,
    ...media,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.playlistId !== undefined ? { playlistId: input.playlistId } : {}),
    ...(input.playlistName !== undefined ? { playlistName: input.playlistName } : {}),
    ...(timeline !== undefined
      ? {
          timeline: sortTimeline(timeline),
          timelineState: timeline.length > 0 ? 'ready' : 'idle',
          timelineGeneratedAt: now,
          timelineError: null,
        }
      : {}),
    updatedBy: input.userId,
    updatedAt: now,
  };
}

function buildSourceScopedTimeline(
  review: TeamFilmReviewDoc,
  sourceId: string
): readonly TeamFilmReviewPlaySegment[] {
  return (review.timeline ?? []).filter((segment) => segment.sourceId?.trim() === sourceId);
}

function buildSyntheticFilmReviewAi(
  review: TeamFilmReviewDoc
): Pick<TeamFilmReviewDoc, 'aiSummary' | 'aiTags' | 'keyInsights'> {
  const duration = Math.max(review.durationSec ?? 0, 1);
  const quarter = Math.max(Math.floor(duration / 4), 10);
  const labels = [
    { label: 'Opening Sequence', category: 'execution' },
    { label: 'Transition Window', category: 'transition' },
    { label: 'Defensive Pressure', category: 'defense' },
    { label: 'Late-Game Decisions', category: 'decision' },
  ] as const;

  return {
    aiSummary:
      'Agent X identified core momentum swings, decision quality patterns, and defensive communication trends across this film session.',
    aiTags: labels.map((item, index) => {
      const startSec = index * quarter;
      const endSec = Math.min(startSec + quarter, duration);
      return {
        id: `tag_${index + 1}`,
        label: item.label,
        category: item.category,
        startSec,
        endSec,
        confidence: 0.8,
        notes: `Agent X auto-tagged this sequence for ${item.label.toLowerCase()}.`,
      };
    }),
    keyInsights: [
      'Momentum shifts were strongest in transition windows.',
      'Execution quality dropped under late-clock pressure.',
      'Defensive communication improved after halftime adjustments.',
    ],
  };
}

function resolveSelectedSources(
  review: TeamFilmReviewDoc,
  input: Pick<
    z.infer<typeof ExtractFilmReviewClipSelectionInputSchema>,
    'sourceIds' | 'sourceTitles'
  >
): readonly TeamFilmReviewSourceVideo[] {
  const sources = review.sources ?? [];
  const selectedById = new Set((input.sourceIds ?? []).map((entry) => entry.trim()));
  const selectedTitles = new Set(
    (input.sourceTitles ?? []).map((entry) => entry.trim().toLowerCase())
  );
  const fallbackThumbnailUrl = normalizeNullableString(review.thumbnailUrl) ?? undefined;

  return sources
    .filter(
      (source) =>
        selectedById.has(source.id) ||
        (!!source.title && selectedTitles.has(source.title.trim().toLowerCase()))
    )
    .map((source) =>
      source.thumbnailUrl || !fallbackThumbnailUrl
        ? source
        : { ...source, thumbnailUrl: fallbackThumbnailUrl }
    );
}

type ExtractFilmReviewClipSelection = {
  readonly review: TeamFilmReviewDoc;
  readonly selectedSources: readonly TeamFilmReviewSourceVideo[];
};

function resolveCombinedExtractionTeamId(
  selections: readonly ExtractFilmReviewClipSelection[]
):
  | { readonly ok: true; readonly teamId: string | undefined }
  | { readonly ok: false; readonly error: string } {
  const teamIds = [
    ...new Set(
      selections
        .map((selection) => normalizeScopeId(selection.review.teamId))
        .filter((teamId) => teamId.length > 0)
    ),
  ];

  if (teamIds.length > 1) {
    return {
      ok: false,
      error:
        'Multi-review extraction can combine personal clips with one team scope, but cannot combine clips from multiple different teams.',
    };
  }

  return { ok: true, teamId: teamIds[0] };
}

function buildMultiReviewCombinedExtractionPayload(
  selections: readonly ExtractFilmReviewClipSelection[]
): {
  readonly sources: readonly TeamFilmReviewSourceVideo[];
  readonly timeline: readonly TeamFilmReviewPlaySegment[];
} {
  const sources: TeamFilmReviewSourceVideo[] = [];
  const timeline: TeamFilmReviewPlaySegment[] = [];

  for (const selection of selections) {
    const reviewHash = createHash('sha1').update(selection.review.id).digest('hex').slice(0, 8);
    const remappedSourceIds = new Map<string, string>();

    for (const source of selection.selectedSources) {
      const nextSourceId = `${source.id}-${reviewHash}`;
      remappedSourceIds.set(source.id, nextSourceId);
      sources.push({
        ...source,
        id: nextSourceId,
        order: sources.length,
        title: `${selection.review.title} - ${source.title ?? source.id}`,
      });
    }

    for (const segment of selection.review.timeline ?? []) {
      const sourceId = segment.sourceId?.trim();
      if (!sourceId || !remappedSourceIds.has(sourceId)) {
        continue;
      }
      timeline.push({
        ...segment,
        id: `${segment.id}-${reviewHash}`,
        sourceId: remappedSourceIds.get(sourceId),
      });
    }
  }

  return { sources, timeline };
}

async function stripFilmReviewFromUniversalFile(input: {
  readonly db: Firestore;
  readonly review: TeamFilmReviewDoc;
  readonly userId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const expectedRevision = getTeamFilmReviewRevision(input.review);
  const nextData = await mutateUniversalFileDocumentAtomically({
    db: input.db,
    fileId: input.review.id,
    mutate: async (fileData) => {
      const currentReview = toTeamFilmReviewDocFromUniversalFile(
        toUniversalFileDoc(input.review.id, fileData)
      );
      if (!currentReview) {
        throw new Error(`Film review ${input.review.id} not found.`);
      }
      const currentPermission = await assertReviewAccess(
        input.db,
        currentReview,
        input.userId,
        'write'
      );
      if (!currentPermission.ok) {
        throw new TeamFilmReviewSourceBreakdownPatchError('ACCESS_DENIED', currentPermission.error);
      }
      const currentRevision = getTeamFilmReviewRevision(currentReview);
      if (currentRevision !== expectedRevision) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'REVISION_CONFLICT',
          `Film review revision conflict: expected ${expectedRevision}, found ${currentRevision}.`,
          currentRevision
        );
      }
      return removeFilmReviewProjectionFromUniversalFileData({
        fileData,
        userId: input.userId,
        now,
      });
    },
  });
  if (nextData) {
    scheduleUniversalFileSemanticSync({ db: input.db, fileId: input.review.id });
  }
}

async function resolveReviewForMutation(input: {
  readonly db: Firestore;
  readonly filmReviewId?: string;
  readonly contextUserId: string;
  readonly teamId?: string;
  readonly title?: string;
  readonly sport?: string;
  readonly videoUrl?: string;
  readonly sourceUrl?: string;
}): Promise<{ review: TeamFilmReviewDoc; teamId?: string } | { error: string }> {
  if (input.filmReviewId) {
    const review = await loadUniversalFilmReview(input.db, input.filmReviewId);
    if (!review) {
      return { error: `Film review ${input.filmReviewId} not found.` };
    }
    return { review, teamId: normalizeOptionalString(review.teamId) };
  }

  const teamId = normalizeOptionalString(input.teamId);
  const mediaUrl =
    normalizeOptionalString(input.videoUrl) ?? normalizeOptionalString(input.sourceUrl);
  if (!mediaUrl) {
    return {
      error:
        'Creating a film review requires a videoUrl or sourceUrl when filmReviewId is not provided.',
    };
  }

  const fileId = await upsertTeamFileFromAttachment({
    db: input.db,
    teamId,
    userId: input.contextUserId,
    origin: 'agent_chat_input',
    uploadTarget: 'film_review',
    sport: normalizeOptionalString(input.sport),
    attachment: {
      id: randomUUID(),
      url: mediaUrl,
      name: buildAttachmentName(normalizeOptionalString(input.title), mediaUrl),
      mimeType: 'video/mp4',
      type: 'video',
      sizeBytes: 1,
      readyToStream: true,
    } satisfies AgentXAttachment,
  });
  const review = await loadUniversalFilmReview(input.db, fileId);
  if (!review) {
    return { error: 'Film review could not be created from the supplied video URL.' };
  }

  return { review, teamId };
}

function buildUpdatedReview(input: {
  readonly existing: TeamFilmReviewDoc;
  readonly userId: string;
  readonly title?: string;
  readonly sport?: string;
  readonly timeline?: readonly TeamFilmReviewPlaySegment[];
  readonly aiSummary?: string | null;
  readonly keyInsights?: readonly string[] | null;
  readonly tags?: readonly string[] | null;
  readonly uploadMode?: TeamFilmReviewDoc['uploadMode'];
  readonly status?: TeamFilmReviewDoc['status'];
}): TeamFilmReviewDoc {
  const now = new Date().toISOString();
  const nextReview: TeamFilmReviewDoc = {
    ...input.existing,
    ...(input.title ? { title: input.title } : {}),
    ...(input.sport ? { sport: input.sport.toLowerCase() } : {}),
    ...(input.uploadMode ? { uploadMode: input.uploadMode } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.aiSummary !== undefined ? { aiSummary: input.aiSummary ?? undefined } : {}),
    ...(input.keyInsights !== undefined ? { keyInsights: input.keyInsights ?? undefined } : {}),
    ...(input.tags !== undefined ? { tags: input.tags ?? undefined } : {}),
    ...(input.timeline
      ? {
          timeline: sortTimeline(input.timeline),
          timelineState: 'ready',
          timelineGeneratedAt: now,
          timelineError: null,
        }
      : {}),
    updatedBy: input.userId,
    updatedAt: now,
  };

  return nextReview;
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
    return {
      ok: false,
      error: 'Not authorized to access team film reviews for this team.',
    };
  }

  return { ok: true };
}

export async function assertReviewAccess(
  db: Firestore,
  review: Pick<TeamFilmReviewDoc, 'teamId' | 'createdBy' | 'readAccessKeys' | 'writeAccessKeys'>,
  userId: string,
  mode: 'read' | 'write'
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (review.createdBy === userId) {
    return { ok: true };
  }

  const accessContext = await resolveFileAccessContext(db, userId);
  const grantedAccessKeys = buildGrantedAccessKeys(accessContext);
  const candidateKeys =
    mode === 'write'
      ? (review.writeAccessKeys ?? [])
      : (review.readAccessKeys ?? review.writeAccessKeys ?? []);

  if (candidateKeys.length > 0 && canAccessByKeys(candidateKeys, grantedAccessKeys)) {
    return { ok: true };
  }

  const teamId = normalizeOptionalString(review.teamId);
  if (teamId) {
    return assertManagePermission(db, teamId, userId);
  }

  return {
    ok: false,
    error:
      mode === 'write'
        ? 'Not authorized to update this film review.'
        : 'Not authorized to access this film review.',
  };
}

async function persistAuthorizedFilmReview(input: {
  readonly db: Firestore;
  readonly review: TeamFilmReviewDoc;
  readonly expectedRevision: number;
  readonly userId: string;
}): Promise<void> {
  await upsertUniversalFileFromFilmReview({
    db: input.db,
    review: input.review,
    expectedRevision: input.expectedRevision,
    authorize: async (currentReview) =>
      (await assertReviewAccess(input.db, currentReview, input.userId, 'write')).ok,
  });
}

type ExtractionTargetFolder = Pick<
  TeamFileFolderDoc,
  'id' | 'teamId' | 'name' | 'createdByUserId' | 'writeAccessKeys'
>;

function normalizeScopeId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toExtractionTargetFolder(
  id: string,
  data: Record<string, unknown>
): ExtractionTargetFolder {
  return {
    id,
    teamId: normalizeScopeId(data['teamId']),
    name: String(data['name'] ?? 'Untitled folder'),
    createdByUserId: String(data['createdByUserId'] ?? ''),
    writeAccessKeys: normalizeStringList(data['writeAccessKeys']) ?? [],
  };
}

async function canWriteExtractionTargetFolder(
  db: Firestore,
  folder: ExtractionTargetFolder,
  userId: string
): Promise<boolean> {
  if (folder.createdByUserId === userId) {
    return true;
  }

  const accessContext = await resolveFileAccessContext(db, userId);
  return canAccessByKeys(folder.writeAccessKeys ?? [], buildGrantedAccessKeys(accessContext));
}

async function listCandidateExtractionFolders(input: {
  readonly db: Firestore;
  readonly reviewTeamId: string;
  readonly userId: string;
}): Promise<readonly ExtractionTargetFolder[]> {
  const query = input.reviewTeamId
    ? input.db
        .collection(TEAM_FILE_FOLDERS_COLLECTION)
        .where('teamId', '==', input.reviewTeamId)
        .limit(250)
    : input.db
        .collection(TEAM_FILE_FOLDERS_COLLECTION)
        .where('createdByUserId', '==', input.userId)
        .limit(250);
  const snapshot = await query.get();

  return snapshot.docs
    .map((doc) => toExtractionTargetFolder(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((folder) => normalizeScopeId(folder.teamId) === input.reviewTeamId);
}

async function resolveExtractionTargetFolder(input: {
  readonly db: Firestore;
  readonly review: Pick<TeamFilmReviewDoc, 'teamId'>;
  readonly userId: string;
  readonly folderId?: string;
  readonly folderName?: string;
}): Promise<
  | { readonly ok: true; readonly folder: ExtractionTargetFolder | null }
  | { readonly ok: false; readonly error: string }
> {
  const requestedFolderId = input.folderId?.trim();
  const requestedFolderName = input.folderName?.trim();
  if (!requestedFolderId && !requestedFolderName) {
    return { ok: true, folder: null };
  }

  const reviewTeamId = normalizeScopeId(input.review.teamId);
  let folder: ExtractionTargetFolder | null = null;

  if (requestedFolderId) {
    const snapshot = await input.db
      .collection(TEAM_FILE_FOLDERS_COLLECTION)
      .doc(requestedFolderId)
      .get();
    if (!snapshot.exists) {
      return { ok: false, error: `Folder ${requestedFolderId} was not found in Files.` };
    }

    folder = toExtractionTargetFolder(
      snapshot.id,
      (snapshot.data() ?? {}) as Record<string, unknown>
    );
    if (
      requestedFolderName &&
      folder.name.trim().toLowerCase() !== requestedFolderName.toLowerCase()
    ) {
      return {
        ok: false,
        error:
          `Folder ID ${requestedFolderId} resolves to "${folder.name}", not ` +
          `"${requestedFolderName}".`,
      };
    }
  } else if (requestedFolderName) {
    const candidates = (
      await listCandidateExtractionFolders({
        db: input.db,
        reviewTeamId,
        userId: input.userId,
      })
    ).filter((entry) => entry.name.trim().toLowerCase() === requestedFolderName.toLowerCase());

    if (candidates.length === 0) {
      return { ok: false, error: `No folder named "${requestedFolderName}" was found in Files.` };
    }

    if (candidates.length > 1) {
      return {
        ok: false,
        error: `Multiple folders named "${requestedFolderName}" were found. Use folderId to choose one.`,
      };
    }

    folder = candidates[0] ?? null;
  }

  if (!folder) {
    return { ok: true, folder: null };
  }

  if (normalizeScopeId(folder.teamId) !== reviewTeamId) {
    return {
      ok: false,
      error: `Folder "${folder.name}" is not in the same Files scope as this film review.`,
    };
  }

  if (!(await canWriteExtractionTargetFolder(input.db, folder, input.userId))) {
    return { ok: false, error: `Not authorized to add files to folder "${folder.name}".` };
  }

  return { ok: true, folder };
}

export class ListFilmReviewsTool extends BaseTool {
  readonly name = 'list_film_reviews';
  readonly description =
    "List the authenticated user's film review sessions backed by UniversalFiles film_review records.";

  readonly parameters = ListFilmReviewsInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListFilmReviewsInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const reviews = await listUserScopedUniversalFilmReviews({
      db: this.db,
      userId: context.userId,
      limit: parsed.data.limit ?? 25,
    });

    return {
      success: true,
      markdown:
        reviews.length === 0
          ? 'No film reviews matched your workspace.'
          : `Found ${reviews.length} film review(s).`,
      data: {
        reviews: reviews.map((review) => summarizeFilmReview(review)),
      },
    };
  }
}

export class GetFilmReviewTool extends BaseTool {
  readonly name = 'get_film_review';
  readonly description = 'Load a team film review session from UniversalFiles.';

  readonly parameters = GetFilmReviewInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetFilmReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'read');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const normalizedReview = normalizeReviewForResponse(review);
    const ownershipSummary = normalizedReview.ownershipSummary;

    return {
      success: true,
      markdown: `Loaded film review **${review.title}**.${buildOwnershipClarificationMarkdown(
        ownershipSummary
      )}`,
      data: {
        review: normalizedReview,
        summary: summarizeFilmReview(review),
        rowOwnership: normalizedReview.rowOwnership,
        ownershipSummary,
      },
    };
  }
}

export class ListFilmReviewSourcesTool extends BaseTool {
  readonly name = 'list_film_review_sources';
  readonly description = 'List source clips/videos attached to a team film review.';

  readonly parameters = ListFilmReviewSourcesInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ListFilmReviewSourcesInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'read');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    return {
      success: true,
      markdown:
        review.sources && review.sources.length > 0
          ? `Loaded ${review.sources.length} film review source(s).`
          : 'This film review has no source clips attached.',
      data: {
        filmReviewId: review.id,
        sources: review.sources ?? [],
      },
    };
  }
}

export class GetFilmReviewSourceBreakdownTool extends BaseTool {
  readonly name = 'get_film_review_source_breakdown';
  readonly description = 'Load the timeline rows associated with one film review source clip.';

  readonly parameters = GetFilmReviewSourceBreakdownInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = GetFilmReviewSourceBreakdownInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'read');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const breakdown = getFilmReviewSourceBreakdown({
      review,
      sourceId: parsed.data.sourceId,
    });
    if (!breakdown.source) {
      return {
        success: false,
        error: `Film review source ${parsed.data.sourceId} was not found in ${review.id}.`,
      };
    }
    const rowOwnership = buildTimelineOwnership(review, breakdown.timeline);
    const ownershipSummary = summarizeTimelineOwnership(rowOwnership);

    return {
      success: true,
      markdown: `Loaded ${breakdown.timeline.length} breakdown row(s) for source **${breakdown.source.title}**.${buildOwnershipClarificationMarkdown(
        ownershipSummary
      )}`,
      data: {
        filmReviewId: review.id,
        source: breakdown.source,
        timeline: breakdown.timeline,
        rowOwnership,
        ownershipSummary,
        sportTagSchemaKey: breakdown.sportTagSchemaKey,
        sportTagSchema: breakdown.sportTagSchema,
      },
    };
  }
}

export class SearchFilmReviewBreakdownRowsTool extends BaseTool {
  readonly name = 'search_film_review_breakdown_rows';
  readonly description =
    'Search all timeline/breakdown rows in one film review by schema tag value and return matching source IDs for cutups. Use string values for fronts/formations: offForm = "IOWA BLACK", defFront = "4-3". Never pass boolean false for tagValue.';

  readonly parameters = SearchFilmReviewBreakdownRowsInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = false;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = SearchFilmReviewBreakdownRowsInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'read');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const target = parsed.data.tagValue ?? parsed.data.searchText;
    const sportTagSchemaKey = resolveTeamFilmReviewSportTagSchemaKey(review.sport);
    const sportTagSchema = getTeamFilmReviewSportTagDefinitions(review.sport);
    const requestedTagId = parsed.data.tagId?.trim();
    const tagDefinition = requestedTagId
      ? sportTagSchema.find(
          (definition) => definition.id.toLowerCase() === requestedTagId.toLowerCase()
        )
      : undefined;
    if (requestedTagId && !tagDefinition) {
      return {
        success: false,
        error: `Unknown breakdown tag "${requestedTagId}" for ${sportTagSchemaKey} film review rows.`,
        data: {
          code: 'INVALID_TAG_ID',
          tagId: requestedTagId,
          sportTagSchemaKey,
          allowedTagIds: sportTagSchema.map((definition) => definition.id),
          sportTagSchema,
        },
      };
    }
    if (
      tagDefinition &&
      parsed.data.tagValue !== undefined &&
      !isTeamFilmReviewSportTagValueValid(tagDefinition, parsed.data.tagValue)
    ) {
      return {
        success: false,
        error:
          `Invalid value ${formatSearchTagValue(parsed.data.tagValue)} for breakdown tag ` +
          `"${tagDefinition.id}". Expected ${describeExpectedTagValue(tagDefinition)}.`,
        data: {
          code: 'INVALID_TAG_VALUE',
          tagId: tagDefinition.id,
          tagValue: parsed.data.tagValue,
          expected: describeExpectedTagValue(tagDefinition),
          sportTagSchemaKey,
          sportTagSchema,
        },
      };
    }
    const tagId = tagDefinition?.id;
    const sourcesById = new Map((review.sources ?? []).map((source) => [source.id, source]));
    const matches: Array<{
      readonly sourceId: string | null;
      readonly sourceTitle: string | null;
      readonly row: TeamFilmReviewPlaySegment;
      readonly matchedTags: Array<{
        readonly tagId: string;
        readonly value: TeamFilmReviewPlayTagValue;
      }>;
    }> = [];

    for (const row of review.timeline ?? []) {
      const tagEntries = Object.entries(row.tags ?? {}).filter(([candidateTagId]) =>
        tagId ? candidateTagId === tagId : true
      );
      const matchedTags = tagEntries
        .filter(([, value]) => valuesMatchSearch(value, target, parsed.data.matchMode))
        .map(([candidateTagId, value]) => ({ candidateTagId, value }));

      if (matchedTags.length === 0) {
        continue;
      }

      const sourceId = row.sourceId?.trim() || null;
      const source = sourceId ? sourcesById.get(sourceId) : undefined;
      matches.push({
        sourceId,
        sourceTitle: source?.title ?? null,
        row,
        matchedTags: matchedTags.map((match) => ({
          tagId: match.candidateTagId,
          value: match.value,
        })),
      });

      if (matches.length >= parsed.data.maxResults) {
        break;
      }
    }

    const sourceIds = [
      ...new Set(
        matches.map((match) => match.sourceId).filter((sourceId): sourceId is string => !!sourceId)
      ),
    ];

    return {
      success: true,
      markdown:
        matches.length === 0
          ? `No breakdown rows matched in **${review.title}**.`
          : `Found ${matches.length} matching breakdown row(s) in **${review.title}**.`,
      data: {
        filmReviewId: review.id,
        title: review.title,
        matchCount: matches.length,
        sourceIds,
        matches,
        sportTagSchemaKey,
        sportTagSchema,
      },
    };
  }
}

export class SaveFilmReviewTool extends BaseTool {
  readonly name = 'save_film_review';
  readonly description =
    'Create or update a UniversalFiles-backed team film review, including normalized timeline rows.';

  readonly parameters = SaveFilmReviewInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = SaveFilmReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const resolved = await resolveReviewForMutation({
      db: this.db,
      filmReviewId: parsed.data.filmReviewId,
      contextUserId: context.userId,
      teamId: parsed.data.teamId,
      title: parsed.data.title,
      sport: parsed.data.sport,
      videoUrl: parsed.data.videoUrl,
      sourceUrl: parsed.data.sourceUrl,
    });
    if ('error' in resolved) {
      return { success: false, error: resolved.error };
    }

    const permission: { ok: true } | { ok: false; error: string } = parsed.data.filmReviewId
      ? await assertReviewAccess(this.db, resolved.review, context.userId, 'write')
      : resolved.teamId
        ? await assertManagePermission(this.db, resolved.teamId, context.userId)
        : { ok: true };
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    let normalizedTimeline: readonly TeamFilmReviewPlaySegment[] | undefined;
    if (parsed.data.timeline !== undefined) {
      try {
        normalizedTimeline = normalizeTimelineRows({
          rows: parseTimelineRowsInput(parsed.data.timeline),
          sourceId: resolved.review.sources?.[0]?.id,
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'timeline could not be parsed.',
        };
      }
    }

    const updated = buildUpdatedReview({
      existing: resolved.review,
      userId: context.userId,
      title: normalizeOptionalString(parsed.data.title),
      sport: normalizeOptionalString(parsed.data.sport),
      timeline: normalizedTimeline,
      aiSummary: parsed.data.aiSummary,
      keyInsights: normalizeStringList(parsed.data.keyInsights),
      tags: normalizeStringList(parsed.data.tags),
      uploadMode: parsed.data.uploadMode,
      status: parsed.data.status,
    });

    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(resolved.review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Saved film review **${updated.title}**.`,
      data: {
        review: normalizeReviewForResponse(updated),
        summary: summarizeFilmReview(updated),
      },
    };
  }
}

export class UpdateFilmReviewTool extends BaseTool {
  readonly name = 'update_film_review';
  readonly description =
    'Update an existing UniversalFiles-backed team film review, including whole-review timeline changes.';

  readonly parameters = UpdateFilmReviewInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateFilmReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    let normalizedTimeline: readonly TeamFilmReviewPlaySegment[] | undefined;
    if (parsed.data.timeline !== undefined) {
      try {
        normalizedTimeline = normalizeTimelineRows({
          rows: parseTimelineRowsInput(parsed.data.timeline),
          sourceId: review.sources?.[0]?.id,
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'timeline could not be parsed.',
        };
      }
    }

    const updated = buildUpdatedReview({
      existing: review,
      userId: context.userId,
      title: normalizeOptionalString(parsed.data.title),
      sport: normalizeOptionalString(parsed.data.sport),
      timeline: normalizedTimeline,
      aiSummary: parsed.data.aiSummary,
      keyInsights:
        parsed.data.keyInsights === null ? null : normalizeStringList(parsed.data.keyInsights),
      tags: parsed.data.tags === null ? null : normalizeStringList(parsed.data.tags),
      uploadMode: parsed.data.uploadMode,
      status: parsed.data.status,
    });

    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Updated film review **${updated.title}**.`,
      data: {
        review: normalizeReviewForResponse(updated),
        summary: summarizeFilmReview(updated),
      },
    };
  }
}

export class UpdateFilmReviewSourceBreakdownTool extends BaseTool {
  readonly name = 'update_film_review_source_breakdown';
  readonly description =
    "Fully replace one source clip's breakdown rows inside a UniversalFiles-backed team film review. This destructive source-scoped replacement removes all existing rows for that source and is intended for explicit rebuild or import workflows.";

  readonly parameters = UpdateFilmReviewSourceBreakdownInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateFilmReviewSourceBreakdownInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const source = review.sources?.find((entry) => entry.id === parsed.data.sourceId) ?? null;
    if (!source) {
      return {
        success: false,
        error: `Film review source ${parsed.data.sourceId} was not found in ${review.id}.`,
      };
    }

    let sourceTimeline: readonly TeamFilmReviewPlaySegment[];
    try {
      sourceTimeline = normalizeTimelineRows({
        rows: parseTimelineRowsInput(parsed.data.timeline),
        sourceId: parsed.data.sourceId,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'timeline could not be parsed.',
      };
    }

    const updated = buildUpdatedReview({
      existing: review,
      userId: context.userId,
      timeline: applySourceScopedTimelineUpdate({
        review,
        sourceId: parsed.data.sourceId,
        sourceTimeline,
      }),
    });

    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Updated ${sourceTimeline.length} breakdown row(s) for source **${source.title ?? source.id}**.`,
      data: {
        filmReviewId: updated.id,
        source,
        timeline: sourceTimeline,
        summary: summarizeFilmReview(updated),
      },
    };
  }
}

export class PatchFilmReviewSourceBreakdownsTool extends BaseTool {
  readonly name = 'patch_film_review_source_breakdowns';
  readonly description =
    'Losslessly patch schema-backed tag fields across one or more film-review source rows in one write. Omitted tags, row annotations, other sources, and review metadata are preserved; use clearTagIds for explicit removal and createIfMissing for new rows.';

  readonly parameters = PatchFilmReviewSourceBreakdownsInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = PatchFilmReviewSourceBreakdownsInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    let updated: TeamFilmReviewDoc;
    try {
      updated = await updateUniversalFileFilmReviewAtomically({
        db: this.db,
        reviewId: parsed.data.filmReviewId,
        update: async (currentReview) => {
          const currentPermission = await assertReviewAccess(
            this.db,
            currentReview,
            context.userId,
            'write'
          );
          if (!currentPermission.ok) {
            throw new TeamFilmReviewSourceBreakdownPatchError(
              'ACCESS_DENIED',
              currentPermission.error
            );
          }
          const merged = mergeTeamFilmReviewSourceBreakdownPatches({
            review: currentReview,
            patches: parsed.data.patches as readonly TeamFilmReviewSourceBreakdownPatch[],
            expectedRevision: parsed.data.expectedRevision,
          });
          return buildUpdatedReview({
            existing: merged,
            userId: context.userId,
            timeline: merged.timeline ?? [],
          });
        },
      });
    } catch (error) {
      if (error instanceof TeamFilmReviewSourceBreakdownPatchError) {
        return {
          success: false,
          error: error.message,
          data: {
            code: error.code,
            currentRevision: error.currentRevision ?? getTeamFilmReviewRevision(review),
          },
        };
      }
      throw error;
    }

    return {
      success: true,
      markdown: `Patched ${parsed.data.patches.length} breakdown row(s) across ${new Set(parsed.data.patches.map((patch) => patch.sourceId)).size} source(s).`,
      data: {
        filmReviewId: updated.id,
        reviewRevision: getTeamFilmReviewRevision(updated),
        patchedRows: parsed.data.patches.map((patch) => ({
          sourceId: patch.sourceId,
          rowId: patch.rowId,
        })),
        timeline: updated.timeline,
        summary: summarizeFilmReview(updated),
      },
    };
  }
}

export class DeleteFilmReviewSourceBreakdownTool extends BaseTool {
  readonly name = 'delete_film_review_source_breakdown';
  readonly description =
    "Remove one source clip's breakdown rows from a UniversalFiles-backed team film review.";

  readonly parameters = DeleteFilmReviewSourceBreakdownInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteFilmReviewSourceBreakdownInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }

    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const source = review.sources?.find((entry) => entry.id === parsed.data.sourceId) ?? null;
    if (!source) {
      return {
        success: false,
        error: `Film review source ${parsed.data.sourceId} was not found in ${review.id}.`,
      };
    }

    const remainingTimeline = (review.timeline ?? []).filter(
      (segment) => segment.sourceId?.trim() !== parsed.data.sourceId
    );
    const removedCount = (review.timeline ?? []).length - remainingTimeline.length;

    const updated = buildUpdatedReview({
      existing: review,
      userId: context.userId,
      timeline: remainingTimeline,
    });

    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Removed ${removedCount} breakdown row(s) for source **${source.title ?? source.id}**.`,
      data: {
        filmReviewId: updated.id,
        source,
        removedCount,
        summary: summarizeFilmReview(updated),
      },
    };
  }
}

export class AddFilmReviewSourceTool extends BaseTool {
  readonly name = 'add_film_review_source';
  readonly description =
    'Add a single source video into a UniversalFiles-backed film review and keep review media fields in sync.';

  readonly parameters = AddFilmReviewSourceInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = AddFilmReviewSourceInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }
    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const existingSources = review.sources ?? [];
    const source = normalizeSourceVideo(parsed.data.source);
    if (existingSources.some((entry) => entry.id === source.id)) {
      return {
        success: false,
        error: `Source video ${source.id} already exists in this film review.`,
      };
    }

    const updated = buildUpdatedSourceReview({
      existing: review,
      userId: context.userId,
      sources: [...existingSources, source],
    });

    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Added source video **${source.title ?? source.id}** to **${updated.title}**.`,
      data: {
        filmReviewId: updated.id,
        source,
        sources: updated.sources ?? [],
        summary: summarizeFilmReview(updated),
      },
    };
  }
}

export class UpdateFilmReviewSourceTool extends BaseTool {
  readonly name = 'update_film_review_source';
  readonly description =
    'Update one source video inside a UniversalFiles-backed film review, including order, title, URLs, and streaming metadata.';

  readonly parameters = UpdateFilmReviewSourceInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateFilmReviewSourceInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }
    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const existingSources = review.sources ?? [];
    const sourceIndex = existingSources.findIndex((entry) => entry.id === parsed.data.sourceId);
    if (sourceIndex < 0) {
      return {
        success: false,
        error: `Film review source ${parsed.data.sourceId} was not found in ${review.id}.`,
      };
    }

    const source = mergeFilmReviewSource(existingSources[sourceIndex]!, parsed.data);
    const nextSources = [...existingSources];
    nextSources[sourceIndex] = source;

    const updated = buildUpdatedSourceReview({
      existing: review,
      userId: context.userId,
      sources: nextSources,
    });

    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Updated source video **${source.title ?? source.id}** in **${updated.title}**.`,
      data: {
        filmReviewId: updated.id,
        source,
        sources: updated.sources ?? [],
        summary: summarizeFilmReview(updated),
      },
    };
  }
}

export class DeleteFilmReviewSourceTool extends BaseTool {
  readonly name = 'delete_film_review_source';
  readonly description =
    'Delete one source video from a UniversalFiles-backed film review and keep the remaining source-backed metadata valid.';

  readonly parameters = DeleteFilmReviewSourceInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteFilmReviewSourceInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }
    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const existingSources = review.sources ?? [];
    const source = existingSources.find((entry) => entry.id === parsed.data.sourceId) ?? null;
    if (!source) {
      return {
        success: false,
        error: `Film review source ${parsed.data.sourceId} was not found in ${review.id}.`,
      };
    }

    const nextSources = existingSources.filter((entry) => entry.id !== parsed.data.sourceId);
    const nextTimeline = (review.timeline ?? []).filter(
      (segment) => segment.sourceId?.trim() !== parsed.data.sourceId
    );
    const updated = buildUpdatedSourceReview({
      existing: review,
      userId: context.userId,
      sources: nextSources,
      timeline: nextTimeline,
    });

    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Deleted source video **${source.title ?? source.id}** from **${updated.title}**.`,
      data: {
        filmReviewId: updated.id,
        source,
        sources: updated.sources ?? [],
        timeline: buildSourceScopedTimeline(review, parsed.data.sourceId),
        summary: summarizeFilmReview(updated),
      },
    };
  }
}

export class DeleteFilmReviewTool extends BaseTool {
  readonly name = 'delete_film_review';
  readonly description =
    'Delete a UniversalFiles-backed film review projection while preserving its base file when applicable.';

  readonly parameters = DeleteFilmReviewInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteFilmReviewInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }
    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    await stripFilmReviewFromUniversalFile({ db: this.db, review, userId: context.userId });

    return {
      success: true,
      markdown: `Deleted film review **${review.title}**.`,
      data: {
        filmReviewId: review.id,
        teamId: normalizeOptionalString(review.teamId),
      },
    };
  }
}

export class AddFilmReviewAnnotationTool extends BaseTool {
  readonly name = 'add_film_review_annotation';
  readonly description =
    'Add a timestamped coach/player note to an existing UniversalFiles-backed team film review.';

  readonly parameters = AddFilmReviewAnnotationInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = AddFilmReviewAnnotationInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }
    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const annotation: TeamFilmReviewAnnotation = {
      id: `ann_${Date.now()}_${Math.round(Math.random() * 1000)}`,
      note: parsed.data.note,
      atSec: parsed.data.atSec,
      ...(parsed.data.color ? { color: parsed.data.color } : {}),
      createdBy: context.userId,
      createdAt: new Date().toISOString(),
    };

    const updated: TeamFilmReviewDoc = {
      ...review,
      annotations: [...(review.annotations ?? []), annotation].sort(
        (left, right) => left.atSec - right.atSec
      ),
      updatedBy: context.userId,
      updatedAt: new Date().toISOString(),
    };
    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Added annotation at ${parsed.data.atSec}s in **${review.title}**.`,
      data: {
        filmReviewId: updated.id,
        annotations: updated.annotations ?? [],
      },
    };
  }
}

export class DeleteFilmReviewAnnotationTool extends BaseTool {
  readonly name = 'delete_film_review_annotation';
  readonly description =
    'Delete a timestamped annotation from an existing UniversalFiles-backed team film review.';

  readonly parameters = DeleteFilmReviewAnnotationInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteFilmReviewAnnotationInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }
    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const annotations = (review.annotations ?? []).filter(
      (item) => item.id !== parsed.data.annotationId
    );
    const updated: TeamFilmReviewDoc = {
      ...review,
      annotations,
      updatedBy: context.userId,
      updatedAt: new Date().toISOString(),
    };
    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Deleted annotation **${parsed.data.annotationId}** from **${review.title}**.`,
      data: {
        filmReviewId: updated.id,
        annotations,
      },
    };
  }
}

export class RefreshFilmReviewAiTool extends BaseTool {
  readonly name = 'refresh_film_review_ai';
  readonly description =
    'Refresh Agent X AI summary, timeline tags, and coaching insights for an existing UniversalFiles-backed film review using its current metadata.';

  readonly parameters = RefreshFilmReviewAiInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = RefreshFilmReviewAiInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const review = await loadUniversalFilmReview(this.db, parsed.data.filmReviewId);
    if (!review) {
      return { success: false, error: `Film review ${parsed.data.filmReviewId} not found.` };
    }
    const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
    if (!permission.ok) {
      return { success: false, error: permission.error };
    }

    const ai = buildSyntheticFilmReviewAi(review);
    const updated: TeamFilmReviewDoc = {
      ...review,
      aiSummary: ai.aiSummary,
      aiTags: ai.aiTags,
      keyInsights: ai.keyInsights,
      updatedBy: context.userId,
      updatedAt: new Date().toISOString(),
      status: 'ready',
    };
    await persistAuthorizedFilmReview({
      db: this.db,
      review: updated,
      expectedRevision: getTeamFilmReviewRevision(review),
      userId: context.userId,
    });

    return {
      success: true,
      markdown: `Refreshed Agent X AI for **${review.title}**.`,
      data: ai,
    };
  }
}

export class ExtractFilmReviewClipsTool extends BaseTool {
  readonly name = 'extract_film_review_clips';
  readonly description =
    'Create new standalone film reviews from selected source clips inside one or more batch clip sessions. Use reviewSelections to create one combined_review cutup from multiple parent film reviews. When folderId or folderName is provided, place the created cutup directly in that visible Files folder; playlistId/playlistName only label playlist metadata and do not move folders.';

  readonly parameters = ExtractFilmReviewClipsInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getFirestore();
  }

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = ExtractFilmReviewClipsInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }
    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const requestedSelections = parsed.data.reviewSelections ?? [
      {
        filmReviewId: parsed.data.filmReviewId!,
        sourceIds: parsed.data.sourceIds,
        sourceTitles: parsed.data.sourceTitles,
      },
    ];
    const clipSelections: ExtractFilmReviewClipSelection[] = [];

    for (const selectionInput of requestedSelections) {
      const review = await loadUniversalFilmReview(this.db, selectionInput.filmReviewId);
      if (!review) {
        return { success: false, error: `Film review ${selectionInput.filmReviewId} not found.` };
      }
      const permission = await assertReviewAccess(this.db, review, context.userId, 'write');
      if (!permission.ok) {
        return { success: false, error: permission.error };
      }

      const selectedSources = resolveSelectedSources(review, selectionInput);
      if (selectedSources.length === 0) {
        return {
          success: false,
          error: `No matching source clips were found for extraction in ${review.title}.`,
        };
      }
      clipSelections.push({ review, selectedSources });
    }

    const review = clipSelections[0]!.review;
    const selectedSources = clipSelections.flatMap((selection) => selection.selectedSources);
    const outputScope = resolveCombinedExtractionTeamId(clipSelections);
    if (!outputScope.ok) {
      return { success: false, error: outputScope.error };
    }
    const outputReviewScope = { ...review, teamId: outputScope.teamId ?? '' };

    const targetFolder = await resolveExtractionTargetFolder({
      db: this.db,
      review: outputReviewScope,
      userId: context.userId,
      folderId: parsed.data.folderId,
      folderName: parsed.data.folderName,
    });
    if (!targetFolder.ok) {
      return { success: false, error: targetFolder.error };
    }
    const targetFolderId = targetFolder.folder?.id;

    const outputMode = parsed.data.outputMode ?? 'separate_reviews';
    const createdReviews: TeamFilmReviewDoc[] = [];

    if (outputMode === 'combined_review') {
      const multiReview = clipSelections.length > 1;
      const combinedPayload = multiReview
        ? buildMultiReviewCombinedExtractionPayload(clipSelections)
        : {
            sources: selectedSources,
            timeline: (() => {
              const selectedIds = new Set(selectedSources.map((source) => source.id));
              return (review.timeline ?? []).filter(
                (segment) => !!segment.sourceId && selectedIds.has(segment.sourceId)
              );
            })(),
          };
      const seedSource = combinedPayload.sources[0]!;
      const fileId = await upsertTeamFileFromAttachment({
        db: this.db,
        teamId: outputScope.teamId,
        userId: context.userId,
        origin: 'agent_chat_output',
        uploadTarget: 'film_review',
        sport: review.sport,
        attachment: {
          id: randomUUID(),
          url: seedSource.videoUrl,
          name: parsed.data.title ?? `${review.title} Clips`,
          mimeType: 'video/mp4',
          type: 'video',
          sizeBytes: 1,
          ...(seedSource.thumbnailUrl ? { thumbnailUrl: seedSource.thumbnailUrl } : {}),
          ...(seedSource.storagePath ? { storagePath: seedSource.storagePath } : {}),
          ...(seedSource.cloudflareVideoId
            ? { cloudflareVideoId: seedSource.cloudflareVideoId }
            : {}),
          ...(seedSource.cloudflareStatus ? { cloudflareStatus: seedSource.cloudflareStatus } : {}),
          readyToStream: seedSource.readyToStream ?? true,
        } satisfies AgentXAttachment,
        folderId: targetFolderId,
      });
      const created = await loadUniversalFilmReview(this.db, fileId);
      if (!created) {
        return { success: false, error: 'Combined clip review could not be created.' };
      }
      const combined = buildUpdatedSourceReview({
        existing: created,
        userId: context.userId,
        sources: combinedPayload.sources,
        timeline: combinedPayload.timeline,
        title: parsed.data.title ?? `${review.title} Clips`,
        ...(parsed.data.playlistId ? { playlistId: parsed.data.playlistId } : {}),
        ...(parsed.data.playlistName ? { playlistName: parsed.data.playlistName } : {}),
      });
      await persistAuthorizedFilmReview({
        db: this.db,
        review: combined,
        expectedRevision: getTeamFilmReviewRevision(created),
        userId: context.userId,
      });
      createdReviews.push(combined);
    } else {
      for (const selection of clipSelections) {
        for (const source of selection.selectedSources) {
          const fileId = await upsertTeamFileFromAttachment({
            db: this.db,
            teamId: normalizeOptionalString(selection.review.teamId),
            userId: context.userId,
            origin: 'agent_chat_output',
            uploadTarget: 'film_review',
            sport: selection.review.sport,
            attachment: {
              id: randomUUID(),
              url: source.videoUrl,
              name: source.title ?? parsed.data.title ?? `${selection.review.title} Clip`,
              mimeType: 'video/mp4',
              type: 'video',
              sizeBytes: 1,
              ...(source.thumbnailUrl ? { thumbnailUrl: source.thumbnailUrl } : {}),
              ...(source.storagePath ? { storagePath: source.storagePath } : {}),
              ...(source.cloudflareVideoId ? { cloudflareVideoId: source.cloudflareVideoId } : {}),
              ...(source.cloudflareStatus ? { cloudflareStatus: source.cloudflareStatus } : {}),
              readyToStream: source.readyToStream ?? true,
            } satisfies AgentXAttachment,
            folderId: targetFolderId,
          });
          const created = await loadUniversalFilmReview(this.db, fileId);
          if (!created) {
            continue;
          }
          const extracted = buildUpdatedSourceReview({
            existing: created,
            userId: context.userId,
            sources: [source],
            timeline: buildSourceScopedTimeline(selection.review, source.id),
            title: parsed.data.title ?? source.title ?? `${selection.review.title} Clip`,
            ...(parsed.data.playlistId ? { playlistId: parsed.data.playlistId } : {}),
            ...(parsed.data.playlistName ? { playlistName: parsed.data.playlistName } : {}),
          });
          await persistAuthorizedFilmReview({
            db: this.db,
            review: extracted,
            expectedRevision: getTeamFilmReviewRevision(created),
            userId: context.userId,
          });
          createdReviews.push(extracted);
        }
      }
    }

    return {
      success: true,
      markdown:
        clipSelections.length > 1
          ? `Created ${createdReviews.length} extracted film review(s) from ${clipSelections.length} source review(s).`
          : `Created ${createdReviews.length} extracted film review(s) from **${review.title}**.`,
      data: {
        sourceCount: selectedSources.length,
        sourceReviewCount: clipSelections.length,
        outputMode,
        folderId: targetFolder.folder?.id ?? null,
        folderName: targetFolder.folder?.name ?? null,
        reviews: createdReviews.map((entry) => summarizeFilmReview(entry)),
      },
    };
  }
}
