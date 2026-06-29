import { createHash, randomUUID } from 'node:crypto';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { AgentXAttachment, TeamFilmReviewPlayTagValue } from '@nxt1/core';
import {
  type TeamFilmReviewAnnotation,
  type TeamFilmReviewDoc,
  type TeamFilmReviewPlaySegment,
  type TeamFilmReviewSourceVideo,
} from '@nxt1/core';
import {
  buildGrantedAccessKeys,
  canAccessByKeys,
  resolveFileAccessContext,
} from '../../../../../services/team/file-access-keys.service.js';
import { canManageTeamMutationForUser } from '../../../../../services/team/team-intel-permissions.js';
import { upsertTeamFileFromAttachment } from '../../../../../services/team/team-files-index.service.js';
import { upsertUniversalFileFromFilmReview } from '../../../../../services/team/universal-files-sync.service.js';
import { scheduleUniversalFileSemanticSync } from '../../../../../services/team/universal-file-semantic.service.js';
import {
  getFilmReviewSourceBreakdown,
  listUserScopedUniversalFilmReviews,
  loadUniversalFilmReview,
  summarizeFilmReview,
} from '../../../../../services/team/universal-film-reviews.service.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAMS_COLLECTION = 'Teams' as const;
const UNIVERSAL_FILES_COLLECTION = 'UniversalFiles' as const;

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

function normalizeReviewForResponse(review: TeamFilmReviewDoc): TeamFilmReviewDoc {
  return {
    ...review,
    teamId: normalizeOptionalString(review.teamId),
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
  input: z.infer<typeof ExtractFilmReviewClipsInputSchema>
): readonly TeamFilmReviewSourceVideo[] {
  const sources = review.sources ?? [];
  const selectedById = new Set((input.sourceIds ?? []).map((entry) => entry.trim()));
  const selectedTitles = new Set(
    (input.sourceTitles ?? []).map((entry) => entry.trim().toLowerCase())
  );
  return sources.filter(
    (source) =>
      selectedById.has(source.id) ||
      (!!source.title && selectedTitles.has(source.title.trim().toLowerCase()))
  );
}

async function stripFilmReviewFromUniversalFile(input: {
  readonly db: Firestore;
  readonly review: TeamFilmReviewDoc;
  readonly userId: string;
}): Promise<void> {
  const snapshot = await input.db.collection(UNIVERSAL_FILES_COLLECTION).doc(input.review.id).get();
  if (!snapshot.exists) {
    return;
  }

  const fileData = snapshot.data() ?? {};
  const type = typeof fileData['type'] === 'string' ? fileData['type'] : 'file';
  if (type === 'film_review') {
    await input.db.collection(UNIVERSAL_FILES_COLLECTION).doc(input.review.id).delete();
    return;
  }

  const payload =
    fileData['payload'] && typeof fileData['payload'] === 'object'
      ? { ...(fileData['payload'] as Record<string, unknown>) }
      : {};
  delete payload['filmReview'];

  const sourceRef =
    fileData['sourceRef'] && typeof fileData['sourceRef'] === 'object'
      ? { ...(fileData['sourceRef'] as Record<string, unknown>) }
      : {};
  delete sourceRef['legacyCollection'];
  delete sourceRef['legacyId'];

  const classification =
    fileData['classification'] && typeof fileData['classification'] === 'object'
      ? { ...(fileData['classification'] as Record<string, unknown>) }
      : {};
  const labels = Array.isArray(classification['labels'])
    ? (classification['labels'] as unknown[])
        .map((label) => String(label))
        .filter((label) => !['film_review', 'video_analysis'].includes(label))
    : undefined;
  const facets =
    classification['facets'] && typeof classification['facets'] === 'object'
      ? { ...(classification['facets'] as Record<string, unknown>) }
      : {};
  delete facets['sourceCollection'];
  delete facets['uploadMode'];
  delete facets['perspective'];
  delete facets['opponentName'];

  const now = new Date().toISOString();
  const nextClassification = {
    ...classification,
    ...(classification['primary'] === 'film_review' ? { primary: 'media' } : {}),
    ...(classification['route'] === 'film_review' ? { route: 'files' } : {}),
    ...(labels ? { labels } : {}),
    facets,
  };

  await input.db
    .collection(UNIVERSAL_FILES_COLLECTION)
    .doc(input.review.id)
    .set(
      {
        payload,
        sourceRef: Object.keys(sourceRef).length > 0 ? sourceRef : null,
        classification: nextClassification,
        semanticSync: { status: 'pending' },
        updatedByUserId: input.userId,
        updatedAt: now,
        lastSeenAt: now,
      },
      { merge: true }
    );
  scheduleUniversalFileSemanticSync({ db: input.db, fileId: input.review.id });
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

async function assertReviewAccess(
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

export class ListFilmReviewsTool extends BaseTool {
  readonly name = 'list_film_reviews';
  readonly description =
    "List the authenticated user's film review sessions backed by UniversalFiles film_review records.";

  readonly parameters = ListFilmReviewsInputSchema;
  override readonly allowedAgents = ['*'] as const;
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

    return {
      success: true,
      markdown: `Loaded film review **${review.title}**.`,
      data: {
        review: normalizeReviewForResponse(review),
        summary: summarizeFilmReview(review),
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

    return {
      success: true,
      markdown: `Loaded ${breakdown.timeline.length} breakdown row(s) for source **${breakdown.source.title}**.`,
      data: {
        filmReviewId: review.id,
        source: breakdown.source,
        timeline: breakdown.timeline,
        sportTagSchemaKey: breakdown.sportTagSchemaKey,
        sportTagSchema: breakdown.sportTagSchema,
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

    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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

    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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
    "Create or replace one source clip's breakdown rows inside a UniversalFiles-backed team film review.";

  readonly parameters = UpdateFilmReviewSourceBreakdownInputSchema;
  override readonly allowedAgents = ['*'] as const;
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

    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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

export class DeleteFilmReviewSourceBreakdownTool extends BaseTool {
  readonly name = 'delete_film_review_source_breakdown';
  readonly description =
    "Remove one source clip's breakdown rows from a UniversalFiles-backed team film review.";

  readonly parameters = DeleteFilmReviewSourceBreakdownInputSchema;
  override readonly allowedAgents = ['*'] as const;
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

    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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

    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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

    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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

    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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
    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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
    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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
    await upsertUniversalFileFromFilmReview({ db: this.db, review: updated });

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
    'Create new standalone film reviews from selected source clips inside a batch clip session, optionally routing them into a playlist folder.';

  readonly parameters = ExtractFilmReviewClipsInputSchema;
  override readonly allowedAgents = ['*'] as const;
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
    const parsed = ExtractFilmReviewClipsInputSchema.safeParse(input);
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

    const selectedSources = resolveSelectedSources(review, parsed.data);
    if (selectedSources.length === 0) {
      return { success: false, error: 'No matching source clips were found for extraction.' };
    }

    const outputMode = parsed.data.outputMode ?? 'separate_reviews';
    const createdReviews: TeamFilmReviewDoc[] = [];

    if (outputMode === 'combined_review') {
      const seedSource = selectedSources[0]!;
      const fileId = await upsertTeamFileFromAttachment({
        db: this.db,
        teamId: normalizeOptionalString(review.teamId),
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
          readyToStream: seedSource.readyToStream ?? true,
        } satisfies AgentXAttachment,
      });
      const created = await loadUniversalFilmReview(this.db, fileId);
      if (!created) {
        return { success: false, error: 'Combined clip review could not be created.' };
      }
      const selectedIds = new Set(selectedSources.map((source) => source.id));
      const combined = buildUpdatedSourceReview({
        existing: created,
        userId: context.userId,
        sources: selectedSources,
        timeline: (review.timeline ?? []).filter(
          (segment) => !!segment.sourceId && selectedIds.has(segment.sourceId)
        ),
        title: parsed.data.title ?? `${review.title} Clips`,
        ...(parsed.data.playlistId ? { playlistId: parsed.data.playlistId } : {}),
        ...(parsed.data.playlistName ? { playlistName: parsed.data.playlistName } : {}),
      });
      await upsertUniversalFileFromFilmReview({ db: this.db, review: combined });
      createdReviews.push(combined);
    } else {
      for (const source of selectedSources) {
        const fileId = await upsertTeamFileFromAttachment({
          db: this.db,
          teamId: normalizeOptionalString(review.teamId),
          userId: context.userId,
          origin: 'agent_chat_output',
          uploadTarget: 'film_review',
          sport: review.sport,
          attachment: {
            id: randomUUID(),
            url: source.videoUrl,
            name: source.title ?? parsed.data.title ?? `${review.title} Clip`,
            mimeType: 'video/mp4',
            type: 'video',
            sizeBytes: 1,
            readyToStream: source.readyToStream ?? true,
          } satisfies AgentXAttachment,
        });
        const created = await loadUniversalFilmReview(this.db, fileId);
        if (!created) {
          continue;
        }
        const extracted = buildUpdatedSourceReview({
          existing: created,
          userId: context.userId,
          sources: [source],
          timeline: buildSourceScopedTimeline(review, source.id),
          title: parsed.data.title ?? source.title ?? `${review.title} Clip`,
          ...(parsed.data.playlistId ? { playlistId: parsed.data.playlistId } : {}),
          ...(parsed.data.playlistName ? { playlistName: parsed.data.playlistName } : {}),
        });
        await upsertUniversalFileFromFilmReview({ db: this.db, review: extracted });
        createdReviews.push(extracted);
      }
    }

    return {
      success: true,
      markdown: `Created ${createdReviews.length} extracted film review(s) from **${review.title}**.`,
      data: {
        sourceCount: selectedSources.length,
        outputMode,
        reviews: createdReviews.map((entry) => summarizeFilmReview(entry)),
      },
    };
  }
}
