import type { PortableTimestamp } from '../portable-timestamp.model';
import type { TeamFilmReviewDoc, TeamFilmReviewStatus } from './team-film-review.model';
import type { TeamGamePlanDoc, TeamGamePlanStatus } from './team-gameplan.model';

export type TeamFileKind = 'image' | 'video' | 'pdf' | 'csv' | 'pptx' | 'doc' | 'app';

export type TeamFileOrigin = 'files_upload' | 'agent_chat_input' | 'agent_chat_output';

export type TeamFileStatus = 'processing' | 'ready' | 'archived';

export type AgentFileAclPrincipalType = 'user' | 'team' | 'organization';
export type AgentFileAclGrantRole = 'viewer' | 'editor' | 'owner';

export interface AgentFileAclGrant {
  readonly principalType: AgentFileAclPrincipalType;
  readonly principalId: string;
  readonly role: AgentFileAclGrantRole;
  readonly grantedByUserId: string;
  readonly grantedAt: PortableTimestamp;
}

export interface AgentFileAcl {
  readonly version: 1;
  readonly mode: 'explicit' | 'copied_from_folder';
  readonly sourceFolderId?: string;
  readonly grants: readonly AgentFileAclGrant[];
  readonly readKeys: readonly string[];
  readonly manageKeys: readonly string[];
}

export interface TeamFileFolderDoc {
  readonly id: string;
  readonly teamId?: string;
  readonly organizationId?: string | null;
  readonly name: string;
  readonly normalizedName: string;
  readonly parentId?: string | null;
  readonly sortOrder: number;
  readonly createdByUserId: string;
  readonly acl?: AgentFileAcl;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
}

export const UNIVERSAL_FILES_COLLECTION = 'UniversalFiles' as const;

export type UniversalFileType =
  'file' | 'film_review' | 'game_plan' | 'playbook' | 'callsheet' | 'practice_script';

export type UniversalFileStatus = TeamFileStatus | TeamFilmReviewStatus | TeamGamePlanStatus;

export type UniversalFileSemanticSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped';
export type UniversalFilePayloadKind = 'native' | 'pointer';
export type UniversalPointerBackedFileType = never;
export type UniversalPointerCompatibleFileType = 'file';
export type UniversalNativeFileType = UniversalFileType;
export const UNIVERSAL_STRUCTURED_DOCUMENT_SUBTYPES = [
  'game_plan',
  'playbook',
  'callsheet',
  'practice_script',
] as const;
export type UniversalStructuredDocumentSubtype =
  (typeof UNIVERSAL_STRUCTURED_DOCUMENT_SUBTYPES)[number];

export interface UniversalFileSemanticSync {
  readonly status: UniversalFileSemanticSyncStatus;
  readonly documentId?: string;
  readonly contentHash?: string;
  readonly version?: number;
  readonly chunkCount?: number;
  readonly lastAttemptAt?: PortableTimestamp;
  readonly syncedAt?: PortableTimestamp;
  readonly error?: string | null;
}

export interface UniversalFileSourceReference {
  readonly legacyCollection?: string;
  readonly legacyId?: string;
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
}

export type UniversalFileArtifactRole = 'source' | 'primary_document' | 'export' | 'derived';

export interface UniversalFilePointerPreview {
  readonly title?: string;
  readonly summary?: string;
  readonly status?: UniversalFileStatus;
  readonly sport?: string;
  readonly tags?: readonly string[];
  readonly thumbnailUrl?: string;
}

export interface UniversalFilePointerPayload {
  readonly documentId: string;
  readonly collectionName: string;
  readonly preview?: UniversalFilePointerPreview;
}

export type UniversalClassificationFacetScalar = string | number | boolean;
export type UniversalClassificationFacetValue =
  UniversalClassificationFacetScalar | readonly UniversalClassificationFacetScalar[];

export interface UniversalFileClassification {
  readonly primary?: string;
  readonly labels?: readonly string[];
  readonly route?: string;
  readonly facets?: Readonly<Record<string, UniversalClassificationFacetValue | undefined>>;
}

export interface UniversalNativeFileAssetPayload {
  readonly mimeType: string;
  readonly kind: TeamFileKind;
  readonly origin: TeamFileOrigin;
  readonly sizeBytes: number;
  readonly url: string;
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly durationSec?: number;
  readonly thumbnailUrl?: string;
  readonly platform?: string;
  readonly ownerUserId?: string;
  readonly profileUrl?: string;
  readonly acl?: AgentFileAcl;
  readonly faviconUrl?: string;
}

export type UniversalBinaryFilePayload = UniversalNativeFileAssetPayload;

export type UniversalFilmReviewPayload = Omit<
  TeamFilmReviewDoc,
  | 'id'
  | 'teamId'
  | 'sport'
  | 'title'
  | 'status'
  | 'tags'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>;

export type UniversalGamePlanPayload = Omit<
  TeamGamePlanDoc,
  | 'id'
  | 'teamId'
  | 'sport'
  | 'title'
  | 'status'
  | 'tags'
  | 'createdBy'
  | 'updatedBy'
  | 'createdAt'
  | 'updatedAt'
>;

export interface UniversalPlaybookFilePlay {
  readonly id?: string;
  readonly name?: string;
  readonly title?: string;
  readonly series?: string;
  readonly category?: string;
  readonly playType?: string;
  readonly formation?: string;
  readonly personnel?: string;
  readonly downDistance?: string;
  readonly objective?: string;
  readonly playBreakdown?: string;
  readonly installNotes?: string;
  readonly tags?: readonly string[];
  readonly conceptTags?: readonly string[];
  readonly diagramUrl?: string;
  readonly diagramAssetId?: string;
  readonly videoUrl?: string;
  readonly installUrl?: string;
  readonly installStage?: 'install' | 'rep' | 'game-ready';
  readonly coachingPoints?: readonly string[];
  readonly commonBusts?: readonly string[];
  readonly correctionCues?: readonly string[];
  readonly drillProgression?: readonly string[];
  readonly situations?: readonly string[];
  readonly ownerUserId?: string;
  readonly successRate?: number;
  readonly typicalGain?: number;
  readonly strengths?: readonly string[];
}

export interface UniversalPlaybookFilePayload {
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly name?: string;
  readonly season?: string;
  readonly source?: string;
  readonly sourceUrl?: string;
  readonly playCount?: number;
  readonly archived?: boolean;
  readonly conceptTagIndex?: readonly string[];
  readonly formationIndex?: readonly string[];
  readonly personnelIndex?: readonly string[];
  readonly categoryIndex?: readonly string[];
  readonly createdBy?: string;
  readonly updatedBy?: string;
  readonly plays?: readonly UniversalPlaybookFilePlay[];
}

export interface UniversalCallsheetFilePayload {
  readonly sourceDocumentId?: string;
  readonly playbookId?: string;
  readonly situation?: string;
  readonly filters?: Readonly<Record<string, unknown>>;
  readonly playCount?: number;
  readonly groupCount?: number;
  readonly topPlayName?: string | null;
  readonly archived?: boolean;
  readonly notes?: string;
  readonly source?: string;
  readonly plays?: readonly TeamCallsheetPlay[];
  readonly groups?: readonly {
    readonly id: string;
    readonly name: string;
    readonly playNames: readonly string[];
    readonly order?: number;
  }[];
}

export interface UniversalPracticeScriptFilePayload {
  readonly sourceDocumentId?: string;
  readonly playbookId?: string;
  readonly focus?: string;
  readonly tempo?: string;
  readonly scriptDate?: string;
  readonly opponent?: string;
  readonly objectives?: readonly string[];
  readonly notes?: string;
  readonly source?: string;
  readonly displayOrder?: number;
  readonly archived?: boolean;
  readonly periods?: readonly {
    readonly id: string;
    readonly label: string;
    readonly clock: string;
    readonly reps: number;
    readonly callType: string;
    readonly playName: string;
    readonly coachingPoint?: string;
    readonly notes?: string;
  }[];
}

export interface UniversalStructuredDocumentPayloadMap {
  readonly game_plan: UniversalGamePlanPayload;
  readonly playbook: UniversalPlaybookFilePayload;
  readonly callsheet: UniversalCallsheetFilePayload;
  readonly practice_script: UniversalPracticeScriptFilePayload;
}

export type UniversalStructuredDocumentData<TSubtype extends string = string> =
  TSubtype extends keyof UniversalStructuredDocumentPayloadMap
    ? UniversalStructuredDocumentPayloadMap[TSubtype]
    : Readonly<Record<string, unknown>>;

export type UniversalTextContentFormat = 'plain' | 'markdown';

export interface UniversalFileContentPayload<
  TData extends object = UniversalStructuredDocumentData,
> {
  readonly text?: string;
  readonly format?: UniversalTextContentFormat;
  readonly data?: TData;
}

export interface UniversalNativeStructuredDocumentPayload<
  TSubtype extends string = string,
  TData extends object = UniversalStructuredDocumentData<TSubtype>,
> {
  readonly documentSubtype?: TSubtype;
  readonly structuredData?: TData;
  readonly textContent?: string;
  readonly textFormat?: UniversalTextContentFormat;
}

export interface UniversalNativeFilePayload<
  TSubtype extends string = string,
  TData extends object = UniversalStructuredDocumentData<TSubtype>,
> {
  readonly asset?: UniversalNativeFileAssetPayload;
  readonly filmReview?: UniversalFilmReviewPayload;
  readonly content?: UniversalFileContentPayload<TData>;
  readonly structured?: UniversalNativeStructuredDocumentPayload<TSubtype, TData>;
}

export type UniversalStructuredDocumentFilePayload<
  TSubtype extends string = string,
  TData extends object = UniversalStructuredDocumentData<TSubtype>,
> = UniversalNativeFilePayload<TSubtype, TData> & {
  readonly structured: UniversalNativeStructuredDocumentPayload<TSubtype, TData>;
};

export interface UniversalFilePayloadMap {
  readonly file: UniversalNativeFilePayload<string, object>;
  readonly film_review: UniversalFilmReviewPayload;
  readonly game_plan: UniversalGamePlanPayload;
  readonly playbook:
    UniversalPlaybookFilePayload | UniversalStructuredDocumentFilePayload<'playbook'>;
  readonly callsheet: UniversalCallsheetFilePayload;
  readonly practice_script: UniversalPracticeScriptFilePayload;
}

export interface TeamCallsheetPlay {
  readonly playName: string;
  readonly score: number;
  readonly reasoning: string;
}

export interface TeamCallsheetGroup {
  readonly id: string;
  readonly name: string;
  readonly playNames: readonly string[];
  readonly order?: number;
}

export interface TeamCallsheetDoc {
  readonly id: string;
  readonly teamId: string;
  readonly sourceDocumentId?: string;
  readonly playbookId: string;
  readonly sport?: string;
  readonly title: string;
  readonly situation?: string;
  readonly filters?: Readonly<Record<string, unknown>>;
  readonly plays?: readonly TeamCallsheetPlay[];
  readonly groups?: readonly TeamCallsheetGroup[];
  readonly notes?: string;
  readonly source?: string;
  readonly archived?: boolean;
  readonly createdAt: PortableTimestamp;
  readonly createdBy?: string;
  readonly updatedAt: PortableTimestamp;
  readonly updatedBy?: string;
}

export interface TeamPracticeScriptPeriod {
  readonly id: string;
  readonly label: string;
  readonly clock: string;
  readonly reps: number;
  readonly callType: string;
  readonly playName: string;
  readonly coachingPoint?: string;
  readonly notes?: string;
}

export interface TeamPracticeScriptDoc {
  readonly id: string;
  readonly teamId: string;
  readonly sourceDocumentId?: string;
  readonly playbookId: string;
  readonly sport?: string;
  readonly title: string;
  readonly focus?: string;
  readonly tempo?: string;
  readonly scriptDate?: string;
  readonly opponent?: string;
  readonly objectives?: readonly string[];
  readonly periods?: readonly TeamPracticeScriptPeriod[];
  readonly notes?: string;
  readonly source?: string;
  readonly displayOrder?: number;
  readonly archived?: boolean;
  readonly createdAt: PortableTimestamp;
  readonly createdBy?: string;
  readonly updatedAt: PortableTimestamp;
  readonly updatedBy?: string;
}

export interface UniversalFileDocBase<TType extends UniversalFileType = UniversalFileType> {
  readonly id: string;
  readonly teamId?: string;
  readonly organizationId?: string | null;
  readonly type: TType;
  readonly documentSubtype?: string;
  readonly classification?: UniversalFileClassification;
  readonly title: string;
  readonly normalizedTitle: string;
  readonly status: UniversalFileStatus;
  readonly sport?: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly folderId?: string | null;
  readonly thumbnailUrl?: string;
  readonly ownerUserId?: string;
  readonly createdByUserId?: string;
  readonly updatedByUserId?: string;
  readonly acl?: AgentFileAcl;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly semanticSync?: UniversalFileSemanticSync;
  readonly sourceRef?: UniversalFileSourceReference;
  readonly artifactRole?: UniversalFileArtifactRole;
  readonly relatedDocumentId?: string;
  readonly sourceDocumentIds?: readonly string[];
  readonly sourceAttachmentIds?: readonly string[];
  readonly artifactGroupId?: string;
  readonly createdAt: PortableTimestamp;
  readonly updatedAt: PortableTimestamp;
  readonly lastSeenAt?: PortableTimestamp;
}

export type UniversalNativeFileDoc<TType extends UniversalFileType = UniversalFileType> =
  UniversalFileDocBase<TType> & {
    readonly payloadKind: 'native';
    readonly payload: UniversalFilePayloadMap[TType];
  };

export type UniversalPointerFileDoc<
  TType extends UniversalPointerCompatibleFileType = UniversalPointerCompatibleFileType,
> = UniversalFileDocBase<TType> & {
  readonly payloadKind: 'pointer';
  readonly payload: UniversalFilePointerPayload;
};

export type UniversalFileDoc<TType extends UniversalFileType = UniversalFileType> =
  TType extends UniversalPointerCompatibleFileType
    ? UniversalNativeFileDoc<TType> | UniversalPointerFileDoc<TType>
    : UniversalNativeFileDoc<TType>;

export interface CreateUniversalPointerFileInput<
  TType extends UniversalPointerCompatibleFileType = UniversalPointerCompatibleFileType,
> extends UniversalFileDocBase<TType> {
  readonly payload: UniversalFilePointerPayload;
}

export function createUniversalPointerFile<
  TType extends UniversalPointerCompatibleFileType = UniversalPointerCompatibleFileType,
>(input: CreateUniversalPointerFileInput<TType>): UniversalPointerFileDoc<TType> {
  return {
    ...input,
    payloadKind: 'pointer',
  };
}

export function isUniversalBinaryFilePayload(
  payload: unknown
): payload is UniversalBinaryFilePayload {
  return getUniversalBinaryFilePayload(payload) !== null;
}

export function getUniversalBinaryFilePayload(payload: unknown): UniversalBinaryFilePayload | null {
  if (
    payload &&
    typeof payload === 'object' &&
    'asset' in payload &&
    isDirectUniversalBinaryFilePayload((payload as { asset?: unknown }).asset)
  ) {
    return (payload as { asset: UniversalBinaryFilePayload }).asset;
  }

  return isDirectUniversalBinaryFilePayload(payload) ? payload : null;
}

export function getUniversalFilmReviewPayload(payload: unknown): UniversalFilmReviewPayload | null {
  if (
    payload &&
    typeof payload === 'object' &&
    'filmReview' in payload &&
    isUniversalFilmReviewPayload((payload as { filmReview?: unknown }).filmReview)
  ) {
    return (payload as { filmReview: UniversalFilmReviewPayload }).filmReview;
  }

  return isUniversalFilmReviewPayload(payload) ? payload : null;
}

function isDirectUniversalBinaryFilePayload(
  payload: unknown
): payload is UniversalBinaryFilePayload {
  return (
    !!payload &&
    typeof payload === 'object' &&
    typeof (payload as { mimeType?: unknown }).mimeType === 'string' &&
    typeof (payload as { kind?: unknown }).kind === 'string' &&
    typeof (payload as { origin?: unknown }).origin === 'string' &&
    typeof (payload as { sizeBytes?: unknown }).sizeBytes === 'number' &&
    typeof (payload as { url?: unknown }).url === 'string'
  );
}

function isUniversalFilmReviewPayload(payload: unknown): payload is UniversalFilmReviewPayload {
  return (
    !!payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    (typeof (payload as { videoUrl?: unknown }).videoUrl === 'string' ||
      Array.isArray((payload as { sources?: unknown }).sources))
  );
}

export function isUniversalStructuredDocumentFilePayload(
  payload: unknown
): payload is UniversalStructuredDocumentFilePayload {
  return getUniversalStructuredDocumentPayload(payload) !== null;
}

export function getUniversalFileClassification(
  document:
    Pick<UniversalFileDocBase, 'classification' | 'documentSubtype' | 'type'> | null | undefined
): UniversalFileClassification | null {
  if (!document) {
    return null;
  }

  const primary =
    normalizeOptionalString(document.classification?.route) ??
    normalizeOptionalString(document.classification?.primary) ??
    (document.type !== 'file' ? document.type : undefined);
  const labels = uniqueNormalizedStrings([
    ...(document.classification?.labels ?? []),
    ...(primary ? [primary] : []),
  ]);
  const route = normalizeOptionalString(document.classification?.route) ?? primary;

  if (!primary && !labels && !route && !document.classification?.facets) {
    return null;
  }

  return {
    ...(primary ? { primary } : {}),
    ...(labels ? { labels } : {}),
    ...(route ? { route } : {}),
    ...(document.classification?.facets ? { facets: document.classification.facets } : {}),
  };
}

export function getUniversalPrimaryClassification(
  document:
    Pick<UniversalFileDocBase, 'classification' | 'documentSubtype' | 'type'> | null | undefined
): string | undefined {
  return getUniversalFileClassification(document)?.primary;
}

export function getUniversalContentPayload<TData extends object = UniversalStructuredDocumentData>(
  payload: unknown
): UniversalFileContentPayload<TData> | null {
  if (
    payload &&
    typeof payload === 'object' &&
    'content' in payload &&
    isDirectUniversalContentPayload((payload as { content?: unknown }).content)
  ) {
    return (payload as { content: UniversalFileContentPayload<TData> }).content;
  }

  if (isDirectUniversalContentPayload(payload)) {
    return payload as UniversalFileContentPayload<TData>;
  }

  if (
    payload &&
    typeof payload === 'object' &&
    'structured' in payload &&
    isDirectUniversalStructuredDocumentPayload((payload as { structured?: unknown }).structured)
  ) {
    const structured = (
      payload as {
        structured: UniversalNativeStructuredDocumentPayload<string, TData>;
      }
    ).structured;
    return {
      ...(structured.textContent ? { text: structured.textContent } : {}),
      ...(structured.textFormat ? { format: structured.textFormat } : {}),
      ...(structured.structuredData ? { data: structured.structuredData } : {}),
    };
  }

  if (isDirectUniversalStructuredDocumentPayload(payload)) {
    const structured = payload as UniversalNativeStructuredDocumentPayload<string, TData>;
    return {
      ...(structured.textContent ? { text: structured.textContent } : {}),
      ...(structured.textFormat ? { format: structured.textFormat } : {}),
      ...(structured.structuredData ? { data: structured.structuredData } : {}),
    };
  }

  return null;
}

export function getUniversalStructuredDocumentPayload<
  TSubtype extends string = string,
  TData extends UniversalStructuredDocumentData<TSubtype> =
    UniversalStructuredDocumentData<TSubtype>,
>(payload: unknown): UniversalNativeStructuredDocumentPayload<TSubtype, TData> | null {
  if (
    payload &&
    typeof payload === 'object' &&
    'structured' in payload &&
    isDirectUniversalStructuredDocumentPayload((payload as { structured?: unknown }).structured)
  ) {
    return (payload as { structured: UniversalNativeStructuredDocumentPayload<TSubtype, TData> })
      .structured;
  }

  if (isDirectUniversalStructuredDocumentPayload(payload)) {
    return payload as UniversalNativeStructuredDocumentPayload<TSubtype, TData>;
  }

  const content = getUniversalContentPayload<TData>(payload);
  if (!content) {
    return null;
  }

  return {
    ...(content.text ? { textContent: content.text } : {}),
    ...(content.format ? { textFormat: content.format } : {}),
    ...(content.data ? { structuredData: content.data } : {}),
  };
}

function isDirectUniversalStructuredDocumentPayload(
  payload: unknown
): payload is UniversalNativeStructuredDocumentPayload {
  return (
    !!payload &&
    typeof payload === 'object' &&
    ((typeof (payload as { documentSubtype?: unknown }).documentSubtype === 'string' &&
      (typeof (payload as { textContent?: unknown }).textContent === 'string' ||
        isStructuredDataRecord((payload as { structuredData?: unknown }).structuredData))) ||
      typeof (payload as { textContent?: unknown }).textContent === 'string' ||
      isStructuredDataRecord((payload as { structuredData?: unknown }).structuredData))
  );
}

function isDirectUniversalContentPayload(payload: unknown): payload is UniversalFileContentPayload {
  return (
    !!payload &&
    typeof payload === 'object' &&
    (typeof (payload as { text?: unknown }).text === 'string' ||
      isStructuredDataRecord((payload as { data?: unknown }).data))
  );
}

function isStructuredDataRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function uniqueNormalizedStrings(values: readonly string[]): readonly string[] | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeOptionalString(value);
    if (normalized) {
      seen.add(normalized);
    }
  }

  return seen.size > 0 ? [...seen] : undefined;
}

function createUniversalClassification(input: {
  readonly primary: string;
  readonly route?: string;
  readonly labels?: readonly string[];
  readonly facets?: Readonly<Record<string, UniversalClassificationFacetValue | undefined>>;
}): UniversalFileClassification {
  const primary = normalizeOptionalString(input.primary) ?? 'file';
  const route = normalizeOptionalString(input.route) ?? primary;
  const labels = uniqueNormalizedStrings([...(input.labels ?? []), primary]);

  return {
    primary,
    ...(route ? { route } : {}),
    ...(labels ? { labels } : {}),
    ...(input.facets ? { facets: input.facets } : {}),
  };
}

function createUniversalStructuredPayload<TSubtype extends string, TData extends object>(
  _subtype: TSubtype,
  structuredData: TData,
  textContent?: string
): UniversalNativeFilePayload<TSubtype, TData> {
  return {
    content: {
      ...(textContent ? { text: textContent } : {}),
      data: structuredData,
    },
    structured: {
      structuredData,
      ...(textContent ? { textContent } : {}),
    },
  };
}

export function createUniversalFilmReviewPayload(
  review: TeamFilmReviewDoc
): UniversalFilmReviewPayload {
  return {
    uploadMode: review.uploadMode,
    perspective: review.perspective,
    gameDate: review.gameDate,
    opponentName: review.opponentName,
    playlistId: review.playlistId,
    playlistName: review.playlistName,
    videoUrl: review.videoUrl,
    sources: review.sources,
    storagePath: review.storagePath,
    cloudflareVideoId: review.cloudflareVideoId,
    cloudflareStatus: review.cloudflareStatus,
    readyToStream: review.readyToStream,
    thumbnailUrl: review.thumbnailUrl,
    durationSec: review.durationSec,
    aiSummary: review.aiSummary,
    aiTags: review.aiTags,
    clips: review.clips,
    annotations: review.annotations,
    keyInsights: review.keyInsights,
    source: review.source,
    sourceUrl: review.sourceUrl,
    schemaVersion: review.schemaVersion,
    reviewRevision: review.reviewRevision,
    timelineState: review.timelineState,
    timeline: review.timeline,
    breakdownSource: review.breakdownSource,
    timelineGeneratedAt: review.timelineGeneratedAt,
    timelineError: review.timelineError,
    timelineProgress: review.timelineProgress,
    downloadPrewarm: review.downloadPrewarm,
    downloadExport: review.downloadExport,
  };
}

export function attachFilmReviewExtensionToUniversalFile(
  file: UniversalNativeFileDoc<'file'>,
  review: TeamFilmReviewDoc
): UniversalNativeFileDoc<'file'> {
  const existingClassification = getUniversalFileClassification(file);
  const labels = uniqueNormalizedStrings([
    ...(existingClassification?.labels ?? []),
    'film_review',
    'video_analysis',
    'team_document',
  ]);

  return {
    ...file,
    status: review.status,
    sport: review.sport ?? file.sport,
    summary: review.aiSummary ?? file.summary,
    tags: review.tags?.length ? review.tags : file.tags,
    ...(review.playlistId !== undefined ? { folderId: review.playlistId ?? null } : {}),
    thumbnailUrl: review.thumbnailUrl ?? file.thumbnailUrl,
    updatedByUserId: review.updatedBy ?? file.updatedByUserId,
    sourceRef: {
      ...file.sourceRef,
      legacyCollection: 'TeamFilmReviews',
      legacyId: review.id,
    },
    classification: {
      ...(existingClassification ?? {}),
      ...(labels ? { labels } : {}),
      primary: existingClassification?.primary ?? 'film_review',
      route: existingClassification?.route ?? 'film_review',
      facets: {
        ...(existingClassification?.facets ?? {}),
        sourceCollection: 'TeamFilmReviews',
        uploadMode: review.uploadMode,
        perspective: review.perspective,
        opponentName: review.opponentName,
      },
    },
    semanticSync: { status: 'pending' },
    payload: {
      ...file.payload,
      filmReview: createUniversalFilmReviewPayload(review),
    },
    updatedAt: review.updatedAt,
    lastSeenAt: review.updatedAt,
  };
}

export function toUniversalFileFromTeamFilmReview(
  review: TeamFilmReviewDoc
): UniversalNativeFileDoc<'film_review'> {
  return {
    id: review.id,
    teamId: review.teamId,
    type: 'film_review',
    classification: createUniversalClassification({
      primary: 'film_review',
      route: 'film_review',
      labels: ['video_analysis', 'team_document'],
      facets: {
        sourceCollection: 'TeamFilmReviews',
        uploadMode: review.uploadMode,
        perspective: review.perspective,
        opponentName: review.opponentName,
      },
    }),
    title: review.title,
    normalizedTitle: review.title.trim().toLowerCase(),
    status: review.status,
    sport: review.sport,
    summary: review.aiSummary,
    tags: review.tags,
    ...(review.playlistId !== undefined ? { folderId: review.playlistId ?? null } : {}),
    thumbnailUrl: review.thumbnailUrl,
    createdByUserId: review.createdBy,
    updatedByUserId: review.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamFilmReviews',
      legacyId: review.id,
    },
    payloadKind: 'native',
    payload: createUniversalFilmReviewPayload(review),
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

export function toUniversalFileFromTeamGamePlan(
  gamePlan: TeamGamePlanDoc
): UniversalNativeFileDoc<'file'> {
  const structuredData: UniversalGamePlanPayload = {
    phase: gamePlan.phase,
    season: gamePlan.season,
    division: gamePlan.division,
    gameDate: gamePlan.gameDate,
    opponentId: gamePlan.opponentId,
    opponentName: gamePlan.opponentName,
    ownTeamColor: gamePlan.ownTeamColor,
    opponentTeamColor: gamePlan.opponentTeamColor,
    perspectiveTeam: gamePlan.perspectiveTeam,
    identityFocus: gamePlan.identityFocus,
    primaryAttackPlan: gamePlan.primaryAttackPlan,
    defensivePriorities: gamePlan.defensivePriorities,
    specialSituations: gamePlan.specialSituations,
    openingScript: gamePlan.openingScript,
    strengthsWeaknesses: gamePlan.strengthsWeaknesses,
    priorities: gamePlan.priorities,
    planBlocks: gamePlan.planBlocks,
    adjustmentTriggers: gamePlan.adjustmentTriggers,
    halftimePriorities: gamePlan.halftimePriorities,
    customSections: gamePlan.customSections,
    linkedPlays: gamePlan.linkedPlays,
    sourceDocumentIds: gamePlan.sourceDocumentIds ?? gamePlan.linkedPlaybookIds,
    linkedPlaybookIds: gamePlan.linkedPlaybookIds,
    scoutingReport: gamePlan.scoutingReport,
    source: gamePlan.source,
    sourceUrl: gamePlan.sourceUrl,
    schemaVersion: gamePlan.schemaVersion,
  };
  const textContent = gamePlan.scoutingReport ?? gamePlan.primaryAttackPlan;

  return {
    id: gamePlan.id,
    teamId: gamePlan.teamId,
    type: 'file',
    classification: createUniversalClassification({
      primary: 'game_plan',
      route: 'game_plan',
      labels: ['strategy', 'team_document'],
      facets: {
        sourceCollection: 'TeamGamePlans',
        phase: gamePlan.phase,
        season: gamePlan.season,
        division: gamePlan.division,
        opponentName: gamePlan.opponentName,
        schemaVersion: gamePlan.schemaVersion,
      },
    }),
    title: gamePlan.title,
    normalizedTitle: gamePlan.title.trim().toLowerCase(),
    status: gamePlan.status,
    sport: gamePlan.sport,
    summary: gamePlan.scoutingReport ?? gamePlan.primaryAttackPlan,
    tags: gamePlan.tags,
    createdByUserId: gamePlan.createdBy,
    updatedByUserId: gamePlan.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamGamePlans',
      legacyId: gamePlan.id,
    },
    payloadKind: 'native',
    payload: createUniversalStructuredPayload('game_plan', structuredData, textContent),
    createdAt: gamePlan.createdAt,
    updatedAt: gamePlan.updatedAt,
  };
}

export function toUniversalFileFromTeamCallsheet(
  callsheet: TeamCallsheetDoc
): UniversalNativeFileDoc<'file'> {
  const sourceDocumentId = callsheet.sourceDocumentId ?? callsheet.playbookId;
  const structuredData: UniversalCallsheetFilePayload = {
    sourceDocumentId,
    playbookId: callsheet.playbookId,
    situation: callsheet.situation,
    filters: callsheet.filters,
    playCount: callsheet.plays?.length,
    groupCount: callsheet.groups?.length,
    topPlayName: callsheet.plays?.[0]?.playName ?? null,
    archived: callsheet.archived,
    notes: callsheet.notes,
    source: callsheet.source,
    plays: callsheet.plays,
    groups: callsheet.groups,
  };
  const textContent = callsheet.notes ?? callsheet.situation;

  return {
    id: callsheet.id,
    teamId: callsheet.teamId,
    type: 'file',
    classification: createUniversalClassification({
      primary: 'callsheet',
      route: 'callsheet',
      labels: ['play_calling', 'team_document'],
      facets: {
        sourceCollection: 'TeamCallsheets',
        sourceDocumentId,
        playbookId: callsheet.playbookId,
        archived: callsheet.archived === true,
        situation: callsheet.situation,
      },
    }),
    title: callsheet.title,
    normalizedTitle: callsheet.title.trim().toLowerCase(),
    status: callsheet.archived ? 'archived' : 'ready',
    sport: callsheet.sport,
    summary: callsheet.notes ?? callsheet.situation,
    createdByUserId: callsheet.createdBy,
    updatedByUserId: callsheet.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamCallsheets',
      legacyId: callsheet.id,
    },
    payloadKind: 'native',
    payload: createUniversalStructuredPayload('callsheet', structuredData, textContent),
    createdAt: callsheet.createdAt,
    updatedAt: callsheet.updatedAt,
  };
}

export function toUniversalFileFromTeamPracticeScript(
  script: TeamPracticeScriptDoc
): UniversalNativeFileDoc<'file'> {
  const sourceDocumentId = script.sourceDocumentId ?? script.playbookId;
  const structuredData: UniversalPracticeScriptFilePayload = {
    sourceDocumentId,
    playbookId: script.playbookId,
    focus: script.focus,
    tempo: script.tempo,
    scriptDate: script.scriptDate,
    opponent: script.opponent,
    objectives: script.objectives,
    notes: script.notes,
    source: script.source,
    displayOrder: script.displayOrder,
    archived: script.archived,
    periods: script.periods,
  };
  const textContent = script.notes ?? script.focus;

  return {
    id: script.id,
    teamId: script.teamId,
    type: 'file',
    classification: createUniversalClassification({
      primary: 'practice_script',
      route: 'practice_script',
      labels: ['practice', 'team_document'],
      facets: {
        sourceCollection: 'TeamPracticeScripts',
        sourceDocumentId,
        playbookId: script.playbookId,
        archived: script.archived === true,
        focus: script.focus,
        tempo: script.tempo,
      },
    }),
    title: script.title,
    normalizedTitle: script.title.trim().toLowerCase(),
    status: script.archived ? 'archived' : 'ready',
    sport: script.sport,
    summary: script.notes ?? script.focus,
    createdByUserId: script.createdBy,
    updatedByUserId: script.updatedBy,
    semanticSync: { status: 'pending' },
    sourceRef: {
      legacyCollection: 'TeamPracticeScripts',
      legacyId: script.id,
    },
    payloadKind: 'native',
    payload: createUniversalStructuredPayload('practice_script', structuredData, textContent),
    createdAt: script.createdAt,
    updatedAt: script.updatedAt,
  };
}
