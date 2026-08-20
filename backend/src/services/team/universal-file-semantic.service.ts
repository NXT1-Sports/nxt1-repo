import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import type { PipelineStage } from 'mongoose';
import type {
  TeamFilmReviewDoc,
  UniversalBinaryFilePayload,
  UniversalFileClassification,
  UniversalFileDoc,
  UniversalFileSemanticSync,
  UniversalNativeStructuredDocumentPayload,
  UniversalFileSourceReference,
} from '@nxt1/core';
import {
  getUniversalFileClassification,
  getUniversalPrimaryClassification,
  UNIVERSAL_FILES_COLLECTION,
  getUniversalBinaryFilePayload,
  getUniversalStructuredDocumentPayload,
} from '@nxt1/core';
import { OpenRouterService } from '../../modules/agent/llm/openrouter.service.js';
import {
  TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_NAME,
  TeamUniversalFileSemanticModel,
  type TeamUniversalFileSemanticChunkDocument,
} from '../../modules/agent/memory/team-universal-file-semantic.model.js';
import { ParseDocumentTool } from '../../modules/agent/tools/media/parse-document.tool.js';
import { getSignedUrlWithTimeout } from '../../utils/gcs-signed-url.js';
import { logger } from '../../utils/logger.js';

const DEFAULT_CHUNK_SIZE = 2_000;
const DEFAULT_CHUNK_OVERLAP = 250;
const DEFAULT_TOP_K = 8;
const DEFAULT_SCORE_THRESHOLD = 0.55;
const DEFAULT_NUM_CANDIDATES = 150;
const MAX_TOP_K = 20;
const MAX_SEMANTIC_TEXT_CHARS = 80_000;
const EMBEDDING_CONCURRENCY = 8;
const MAX_SEMANTIC_INSERT_RETRIES = 3;

type SemanticSourceKind = 'binary' | 'structured' | 'pointer' | 'metadata';

type UniversalFileSemanticSource = {
  readonly text: string;
  readonly sourceKind: SemanticSourceKind;
  readonly mimeType?: string;
};

type PersistedSemanticChunkSet = {
  readonly version: number;
  readonly chunkCount: number;
};

type ScoredSemanticChunk = TeamUniversalFileSemanticChunkDocument & { score: number };

export interface UniversalFileSemanticSearchOptions {
  readonly topK?: number;
  readonly classification?: string;
  readonly route?: string;
  readonly label?: string;
  readonly includeArchived?: boolean;
  readonly scoreThreshold?: number;
}

export interface UniversalFileSemanticSearchResult {
  readonly fileId: string;
  readonly title: string;
  readonly classification?: string;
  readonly route?: string;
  readonly labels?: readonly string[];
  readonly score: number;
  readonly excerpt: string;
  readonly isArchived: boolean;
}

export interface UniversalFileSemanticSearchScope {
  readonly teamId?: string | null;
  readonly userId?: string | null;
}

function isMongoDuplicateKeyError(error: unknown): error is Error & { code: number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function resolveExplicitClassificationFilter(
  options: UniversalFileSemanticSearchOptions
): string | undefined {
  return normalizeString(options.classification);
}

function matchesSearchFilters(
  entry: Pick<
    TeamUniversalFileSemanticChunkDocument,
    'classificationPrimary' | 'classificationLabels' | 'route'
  >,
  options: UniversalFileSemanticSearchOptions
): boolean {
  const classificationFilter = resolveExplicitClassificationFilter(options);
  if (classificationFilter) {
    const entryClassification = normalizeString(entry.classificationPrimary);
    if (entryClassification !== classificationFilter) {
      return false;
    }
  }

  const routeFilter = normalizeString(options.route);
  if (routeFilter) {
    const entryRoute = normalizeString(entry.route);
    if (entryRoute !== routeFilter) {
      return false;
    }
  }

  const labelFilter = normalizeString(options.label);
  if (labelFilter) {
    const labels = normalizeStringArray(entry.classificationLabels);
    if (!labels?.includes(labelFilter)) {
      return false;
    }
  }

  return true;
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
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim()))
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function hasOwnRecordValue(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function getArtifactMetadata(document: UniversalFileDoc): Record<string, unknown> | undefined {
  const record = document as unknown as Record<string, unknown>;
  const artifactClassification = hasOwnRecordValue(record, 'artifactClassification')
    ? record['artifactClassification']
    : undefined;
  const artifactSummary = normalizeString(record['artifactSummary']);
  const artifactNotes = normalizeString(record['artifactNotes']);
  const artifactTags = normalizeStringArray(record['artifactTags']);
  const artifactGeneratedAt = normalizeString(record['artifactGeneratedAt']);
  const artifactStatus = normalizeString(record['artifactStatus']);

  const metadata = Object.fromEntries(
    Object.entries({
      ...(artifactClassification !== undefined ? { artifactClassification } : {}),
      ...(artifactSummary ? { artifactSummary } : {}),
      ...(artifactNotes ? { artifactNotes } : {}),
      ...(artifactTags ? { artifactTags } : {}),
      ...(artifactGeneratedAt ? { artifactGeneratedAt } : {}),
      ...(artifactStatus ? { artifactStatus } : {}),
    }).filter(([, value]) => value !== undefined)
  );

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function appendArtifactMetadata(lines: string[], document: UniversalFileDoc): void {
  const artifactMetadata = getArtifactMetadata(document);
  if (artifactMetadata) {
    appendFlattenedValue(lines, 'Artifact Metadata', artifactMetadata);
  }
}

function appendPayloadSnapshot(lines: string[], payload: unknown): void {
  appendFlattenedValue(lines, 'Payload', payload);
}

function getPrimaryClassification(document: UniversalFileDoc): string | undefined {
  return normalizeString(getUniversalPrimaryClassification(document));
}

function getResolvedClassification(document: UniversalFileDoc): {
  readonly primary?: string;
  readonly labels?: readonly string[];
  readonly route?: string;
} | null {
  const primary = getPrimaryClassification(document);
  const classification = getUniversalFileClassification(
    document
  ) as UniversalFileClassification | null;
  const route = normalizeString(document.classification?.route);
  const labels = normalizeStringArray(classification?.labels);

  if (!primary && !labels && !route) {
    return null;
  }

  return {
    ...(primary ? { primary } : {}),
    ...(labels ? { labels } : {}),
    ...(route ? { route } : {}),
  };
}

function buildSemanticChunkMetadata(
  document: UniversalFileDoc,
  source: Pick<UniversalFileSemanticSource, 'sourceKind' | 'mimeType'>,
  updatedAt: string
): Record<string, unknown> {
  const sourceRef = formatSourceReference(document.sourceRef);
  const isArchived = isArchivedDocument(document);
  const classification = getResolvedClassification(document);

  return {
    ownerUserId: resolveSemanticOwnerUserId(document),
    title: document.title,
    normalizedTitle: document.normalizedTitle,
    ...(classification?.primary ? { classificationPrimary: classification.primary } : {}),
    ...(classification?.labels ? { classificationLabels: [...classification.labels] } : {}),
    ...(classification?.route ? { route: classification.route } : {}),
    payloadKind: document.payloadKind,
    sourceKind: source.sourceKind,
    isArchived,
    ...(source.mimeType ? { mimeType: source.mimeType } : {}),
    ...(document.sport ? { sport: document.sport } : {}),
    ...(document.tags ? { tags: [...document.tags] } : {}),
    ...(document.summary ? { summary: document.summary } : {}),
    ...(sourceRef ? { sourceRef } : {}),
    updatedAt,
  };
}

function buildSemanticChunkMetadataUpdate(
  document: UniversalFileDoc,
  source: Pick<UniversalFileSemanticSource, 'sourceKind' | 'mimeType'>,
  updatedAt: string
): Record<string, unknown> {
  const metadata = buildSemanticChunkMetadata(document, source, updatedAt);
  const optionalFields = [
    'classificationPrimary',
    'classificationLabels',
    'route',
    'mimeType',
    'sport',
    'tags',
    'summary',
    'sourceRef',
  ] as const;

  const unsetEntries = optionalFields
    .filter((field) => !(field in metadata))
    .map((field) => [field, 1] as const);

  return {
    $set: metadata,
    ...(unsetEntries.length > 0 ? { $unset: Object.fromEntries(unsetEntries) } : {}),
  };
}

function buildSearchFilterClauses(
  scope: UniversalFileSemanticSearchScope,
  options: UniversalFileSemanticSearchOptions
): Record<string, unknown>[] {
  const teamId = normalizeString(scope.teamId) ?? '';
  const userId = normalizeString(scope.userId);
  const clauses: Record<string, unknown>[] = teamId
    ? [{ teamId }]
    : userId
      ? [{ teamId: '' }, { ownerUserId: userId }]
      : [{ teamId: '' }];
  const classificationFilter = resolveExplicitClassificationFilter(options);

  if (classificationFilter) {
    clauses.push({ classificationPrimary: classificationFilter });
  }

  if (options.route) {
    clauses.push({ route: options.route });
  }
  if (options.label) {
    clauses.push({ classificationLabels: options.label });
  }
  if (options.includeArchived !== true) {
    clauses.push({ isArchived: false });
  }

  return clauses;
}

function resolveSemanticOwnerUserId(document: UniversalFileDoc): string {
  return (
    normalizeString(document.ownerUserId) ?? normalizeString(document.createdByUserId) ?? 'unknown'
  );
}

function getContentPayload<T extends object>(
  payload: unknown
): { readonly data?: T; readonly text?: string } | null {
  if (payload && typeof payload === 'object' && 'content' in payload) {
    const content = (payload as { content?: unknown }).content;
    if (content && typeof content === 'object') {
      const data =
        'data' in content &&
        (content as { data?: unknown }).data &&
        typeof (content as { data?: unknown }).data === 'object'
          ? ((content as { data: T }).data ?? undefined)
          : undefined;
      const text =
        typeof (content as { text?: unknown }).text === 'string'
          ? (content as { text: string }).text
          : undefined;

      if (data || text) {
        return {
          ...(data ? { data } : {}),
          ...(text ? { text } : {}),
        };
      }
    }
  }

  const structuredPayload = getUniversalStructuredDocumentPayload(payload);
  if (!structuredPayload?.structuredData && !structuredPayload?.textContent) {
    return null;
  }

  return {
    ...(structuredPayload.structuredData ? { data: structuredPayload.structuredData as T } : {}),
    ...(structuredPayload.textContent ? { text: structuredPayload.textContent } : {}),
  };
}

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

function truncateText(value: string, maxChars = MAX_SEMANTIC_TEXT_CHARS): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\0/g, '').trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return normalized.slice(0, maxChars).trim();
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function appendFlattenedValue(
  lines: string[],
  label: string,
  value: unknown,
  depth = 0,
  maxLines = 300
): void {
  if (lines.length >= maxLines || value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (normalized) {
      lines.push(`${label}: ${normalized}`);
    }
    return;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    lines.push(`${label}: ${String(value)}`);
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return;
    }

    const primitiveValues = value
      .filter(
        (entry): entry is string | number | boolean =>
          typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
      )
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);

    if (primitiveValues.length === value.length) {
      lines.push(`${label}: ${primitiveValues.join(', ')}`);
      return;
    }

    value.slice(0, 40).forEach((entry, index) => {
      appendFlattenedValue(lines, `${label} ${index + 1}`, entry, depth + 1, maxLines);
    });
    return;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    Object.entries(record)
      .slice(0, depth > 1 ? 20 : 60)
      .forEach(([key, entryValue]) => {
        appendFlattenedValue(
          lines,
          depth > 0 ? `${label} ${humanizeKey(key)}` : humanizeKey(key),
          entryValue,
          depth + 1,
          maxLines
        );
      });
  }
}

function isArchivedDocument(document: UniversalFileDoc): boolean {
  if (document.status === 'archived') {
    return true;
  }

  if (document.payloadKind !== 'pointer') {
    const contentData = getContentPayload<Record<string, unknown>>(document.payload)?.data as
      Record<string, unknown> | undefined;
    const structuredData = getUniversalStructuredDocumentPayload(document.payload)
      ?.structuredData as Record<string, unknown> | undefined;
    const resolvedData = contentData ?? structuredData;
    return resolvedData ? resolvedData['archived'] === true : false;
  }

  return false;
}

function formatSourceReference(
  sourceRef: UniversalFileSourceReference | undefined
): string | undefined {
  if (!sourceRef) {
    return undefined;
  }

  const entries = [
    sourceRef.legacyCollection,
    sourceRef.legacyId,
    sourceRef.sourceThreadId,
    sourceRef.sourceMessageId,
    sourceRef.sourceOperationId,
  ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);

  return entries.length > 0 ? entries.join(':') : undefined;
}

function buildMetadataFallbackText(document: UniversalFileDoc): string {
  const lines = [
    `Title: ${document.title}`,
    `Type: ${getPrimaryClassification(document) ?? document.type}`,
  ];

  if (document.sport) {
    lines.push(`Sport: ${document.sport}`);
  }
  if (document.summary) {
    lines.push(`Summary: ${document.summary}`);
  }
  if (document.tags && document.tags.length > 0) {
    lines.push(`Tags: ${document.tags.join(', ')}`);
  }

  appendArtifactMetadata(lines, document);
  appendPayloadSnapshot(lines, document.payload);

  return truncateText(lines.join('\n'));
}

function buildStructuredDocumentText(
  document: UniversalFileDoc,
  payload: UniversalNativeStructuredDocumentPayload
): string {
  const contentPayload = getContentPayload<Record<string, unknown>>(document.payload);
  const structuredData = contentPayload?.data ?? payload.structuredData;
  const textContent = contentPayload?.text ?? payload.textContent;
  const lines = [
    `Title: ${document.title}`,
    `Subtype: ${getPrimaryClassification(document) ?? document.type}`,
  ];

  if (document.sport) {
    lines.push(`Sport: ${document.sport}`);
  }
  if (document.summary) {
    lines.push(`Summary: ${document.summary}`);
  }
  if (document.tags && document.tags.length > 0) {
    lines.push(`Tags: ${document.tags.join(', ')}`);
  }
  appendArtifactMetadata(lines, document);
  if (textContent) {
    lines.push(`Text Content: ${textContent}`);
  }

  appendFlattenedValue(lines, 'Structured Data', structuredData);
  appendPayloadSnapshot(lines, document.payload);
  return truncateText(lines.join('\n'));
}

function buildBinaryMetadataText(
  document: UniversalFileDoc,
  payload: UniversalBinaryFilePayload
): string {
  const lines = [
    `Title: ${document.title}`,
    `Kind: ${payload.kind}`,
    `Mime Type: ${payload.mimeType}`,
    `Origin: ${payload.origin}`,
    `Size Bytes: ${payload.sizeBytes}`,
  ];

  if (document.sport) {
    lines.push(`Sport: ${document.sport}`);
  }
  if (document.summary) {
    lines.push(`Summary: ${document.summary}`);
  }
  if (document.tags && document.tags.length > 0) {
    lines.push(`Tags: ${document.tags.join(', ')}`);
  }
  if (payload.platform) {
    lines.push(`Platform: ${payload.platform}`);
  }
  if (payload.profileUrl) {
    lines.push(`Profile URL: ${payload.profileUrl}`);
  }

  appendArtifactMetadata(lines, document);
  appendPayloadSnapshot(lines, document.payload);

  return truncateText(lines.join('\n'));
}

export function buildFilmReviewSemanticText(review: TeamFilmReviewDoc): string {
  const lines = [`Title: ${review.title}`, 'Subtype: film_review'];

  if (review.sport) {
    lines.push(`Sport: ${review.sport}`);
  }
  if (review.opponentName) {
    lines.push(`Opponent: ${review.opponentName}`);
  }
  if (review.perspective) {
    lines.push(`Perspective: ${review.perspective}`);
  }
  if (review.aiSummary) {
    lines.push(`Summary: ${review.aiSummary}`);
  }

  const tags = normalizeStringArray(review.tags ?? review.aiTags);
  if (tags && tags.length > 0) {
    lines.push(`Tags: ${tags.join(', ')}`);
  }

  if (review.id?.trim()) {
    lines.push(`Film Review ID: ${review.id.trim()}`);
  }

  if (review.sources && review.sources.length > 0) {
    const sourceLines = review.sources.map((source, index) => {
      const parts = [`${index + 1}. ${source.title?.trim() || source.id}`];
      parts.push(`sourceId=${source.id}`);
      if (typeof source.durationSec === 'number' && Number.isFinite(source.durationSec)) {
        parts.push(`durationSec=${source.durationSec}`);
      }
      return parts.join(' | ');
    });
    lines.push(`Sources:\n${sourceLines.join('\n')}`);
    lines.push(
      'Media Access: use analyze_video with filmReviewId and sourceId to inspect a specific clip.'
    );
  }

  appendFlattenedValue(lines, 'Key Insights', review.keyInsights);
  appendFlattenedValue(lines, 'Clips', review.clips);
  appendFlattenedValue(lines, 'Annotations', review.annotations);
  appendFlattenedValue(lines, 'Timeline', review.timeline);

  return truncateText(lines.join('\n'));
}

function buildPointerPreviewText(document: UniversalFileDoc): string {
  const lines = [
    `Title: ${document.title}`,
    `Subtype: ${getPrimaryClassification(document) ?? document.type}`,
  ];

  if (document.sport) {
    lines.push(`Sport: ${document.sport}`);
  }
  if (document.summary) {
    lines.push(`Summary: ${document.summary}`);
  }
  if (document.tags && document.tags.length > 0) {
    lines.push(`Tags: ${document.tags.join(', ')}`);
  }

  appendArtifactMetadata(lines, document);

  if (document.payloadKind === 'pointer' && document.payload.preview) {
    appendFlattenedValue(lines, 'Preview', document.payload.preview);
  }

  appendPayloadSnapshot(lines, document.payload);

  return truncateText(lines.join('\n'));
}

function buildGenericPointerDocumentText(record: Record<string, unknown>, title: string): string {
  const lines = [`Title: ${title}`];
  appendFlattenedValue(lines, 'Pointer Document', record);
  return truncateText(lines.join('\n'));
}

function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
  const normalized = truncateText(text);
  if (!normalized) {
    return [] as string[];
  }

  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const next = normalized.slice(cursor, cursor + chunkSize).trim();
    if (next) {
      chunks.push(next);
    }
    if (cursor + chunkSize >= normalized.length) {
      break;
    }
    cursor += Math.max(chunkSize - overlap, 1);
  }
  return chunks;
}

async function runWithConcurrency<TInput, TOutput>(
  items: readonly TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await worker(items[current]!, current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
  return results;
}

function toUniversalFileDoc(fileId: string, data: Record<string, unknown>): UniversalFileDoc {
  const baseData = data as unknown as Partial<UniversalFileDoc>;
  const payload = data['payload'];
  const hasPointerPayload =
    !!payload &&
    typeof payload === 'object' &&
    typeof (payload as Record<string, unknown>)['documentId'] === 'string' &&
    typeof (payload as Record<string, unknown>)['collectionName'] === 'string';

  return {
    ...baseData,
    id: fileId,
    teamId: String(data['teamId'] ?? ''),
    payloadKind:
      data['payloadKind'] === 'pointer' || data['payloadKind'] === 'native'
        ? data['payloadKind']
        : hasPointerPayload
          ? 'pointer'
          : 'native',
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['lastSeenAt'] ? { lastSeenAt: toPortableTimestamp(data['lastSeenAt']) } : {}),
  } as UniversalFileDoc;
}

export class UniversalFileSemanticService {
  private readonly db: Firestore;
  private readonly llm?: OpenRouterService;
  private readonly parser: ParseDocumentTool;

  constructor(db: Firestore, llm?: OpenRouterService) {
    this.db = db;
    this.llm = llm ?? this.createLlm();
    this.parser = new ParseDocumentTool();
  }

  async syncByFileId(fileId: string, options?: { semanticText?: string }): Promise<void> {
    const snapshot = await this.db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId).get();
    if (!snapshot.exists) {
      await this.deleteByFileId(fileId);
      return;
    }

    const document = toUniversalFileDoc(snapshot.id, snapshot.data() ?? {});
    await this.syncDocument(document, options);
  }

  async syncDocument(
    document: UniversalFileDoc,
    options?: { semanticText?: string }
  ): Promise<void> {
    const syncRef = this.db.collection(UNIVERSAL_FILES_COLLECTION).doc(document.id);
    const lastAttemptAt = new Date().toISOString();
    await syncRef.set(
      {
        semanticSync: {
          ...(document.semanticSync ?? {}),
          status: 'pending',
          error: null,
          lastAttemptAt,
        } satisfies UniversalFileSemanticSync,
      },
      { merge: true }
    );

    if (!this.llm) {
      await this.markSyncState(document.id, {
        status: 'skipped',
        error: 'OPENROUTER_API_KEY is not configured for semantic indexing.',
        lastAttemptAt,
      });
      return;
    }

    try {
      const source = await this.buildSemanticSource(document, options?.semanticText);
      if (!source.text) {
        await this.deleteByFileId(document.id);
        await this.markSyncState(document.id, {
          status: 'skipped',
          error: null,
          lastAttemptAt,
          chunkCount: 0,
        });
        return;
      }

      const contentHash = createHash('sha256').update(source.text).digest('hex');
      const existingExact = await this.findExactChunkVersion(document.id, contentHash);

      if (existingExact) {
        const now = new Date().toISOString();
        await TeamUniversalFileSemanticModel.updateMany(
          { fileId: document.id, version: existingExact.version },
          buildSemanticChunkMetadataUpdate(document, source, now)
        );

        await this.markSyncState(document.id, {
          status: 'synced',
          documentId: document.id,
          contentHash,
          version: existingExact.version,
          chunkCount: existingExact.totalChunks,
          syncedAt: now,
          error: null,
          lastAttemptAt,
        });
        return;
      }

      const chunks = chunkText(source.text);
      const embeddings = await runWithConcurrency(chunks, EMBEDDING_CONCURRENCY, (chunk) =>
        this.llm!.embed(chunk)
      );
      const now = new Date().toISOString();
      const persisted = await this.persistChunksWithRetry({
        document,
        source,
        contentHash,
        chunks,
        embeddings,
        createdAt: now,
      });

      await this.markSyncState(document.id, {
        status: 'synced',
        documentId: document.id,
        contentHash,
        version: persisted.version,
        chunkCount: persisted.chunkCount,
        syncedAt: now,
        error: null,
        lastAttemptAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('[UniversalFileSemantic] Sync failed', {
        fileId: document.id,
        teamId: document.teamId,
        error: message,
      });
      await this.markSyncState(document.id, {
        status: 'failed',
        error: message,
        lastAttemptAt,
      });
    }
  }

  async deleteByFileId(fileId: string): Promise<void> {
    await TeamUniversalFileSemanticModel.deleteMany({ fileId });
  }

  private async findExactChunkVersion(fileId: string, contentHash: string) {
    return TeamUniversalFileSemanticModel.findOne({
      fileId,
      contentHash,
      chunkIndex: 0,
    })
      .sort({ version: -1 })
      .lean();
  }

  private async persistChunksWithRetry(params: {
    readonly document: UniversalFileDoc;
    readonly source: UniversalFileSemanticSource;
    readonly contentHash: string;
    readonly chunks: readonly string[];
    readonly embeddings: readonly (readonly number[])[];
    readonly createdAt: string;
  }): Promise<PersistedSemanticChunkSet> {
    const { document, source, contentHash, chunks, embeddings, createdAt } = params;

    for (let attempt = 0; attempt <= MAX_SEMANTIC_INSERT_RETRIES; attempt += 1) {
      const existingExact = await this.findExactChunkVersion(document.id, contentHash);
      if (existingExact) {
        return {
          version: existingExact.version,
          chunkCount: existingExact.totalChunks,
        };
      }

      const latestVersion = await TeamUniversalFileSemanticModel.findOne({ fileId: document.id })
        .sort({ version: -1 })
        .select('version')
        .lean();
      const version = typeof latestVersion?.version === 'number' ? latestVersion.version + 1 : 1;
      const chunkMetadata = buildSemanticChunkMetadata(document, source, createdAt);

      try {
        await TeamUniversalFileSemanticModel.insertMany(
          chunks.map((chunk, index) => ({
            teamId: document.teamId,
            ownerUserId: resolveSemanticOwnerUserId(document),
            fileId: document.id,
            title: document.title,
            normalizedTitle: document.normalizedTitle,
            content: chunk,
            embedding: Array.from(embeddings[index] ?? []),
            contentHash,
            version,
            chunkIndex: index,
            totalChunks: chunks.length,
            ...chunkMetadata,
            createdAt,
          }))
        );

        await TeamUniversalFileSemanticModel.deleteMany({
          fileId: document.id,
          version: { $lt: version },
        });

        return {
          version,
          chunkCount: chunks.length,
        };
      } catch (error) {
        if (isMongoDuplicateKeyError(error)) {
          logger.info('[UniversalFileSemantic] Detected concurrent semantic sync write, retrying', {
            fileId: document.id,
            teamId: document.teamId,
            attempt: attempt + 1,
          });
          continue;
        }

        throw error;
      }
    }

    const existingExact = await this.findExactChunkVersion(document.id, contentHash);
    if (existingExact) {
      return {
        version: existingExact.version,
        chunkCount: existingExact.totalChunks,
      };
    }

    throw new Error(
      `Semantic sync could not persist unique chunks for file ${document.id} after ${MAX_SEMANTIC_INSERT_RETRIES + 1} attempts.`
    );
  }

  async search(
    scope: UniversalFileSemanticSearchScope,
    query: string,
    options: UniversalFileSemanticSearchOptions = {}
  ): Promise<readonly UniversalFileSemanticSearchResult[]> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const topK = Math.min(Math.max(1, Math.round(options.topK ?? DEFAULT_TOP_K)), MAX_TOP_K);
    const scoreThreshold = options.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
    const expandedLimit = Math.min(Math.max(topK * 5, topK * 3), 120);

    if (!this.llm) {
      return this.textFallbackSearch(scope, normalizedQuery, options, topK);
    }

    try {
      const queryEmbedding = await this.llm.embed(normalizedQuery);
      const results = await this.runVectorSearch(scope, queryEmbedding, options, expandedLimit);

      const filtered = results.filter(
        (entry) => entry.score >= scoreThreshold && matchesSearchFilters(entry, options)
      );

      if (filtered.length === 0) {
        return this.textFallbackSearch(scope, normalizedQuery, options, topK);
      }

      return this.collapseResults(filtered, topK);
    } catch (error) {
      logger.warn('[UniversalFileSemantic] Vector search failed, falling back to text search', {
        teamId: normalizeString(scope.teamId) ?? '',
        ownerUserId: normalizeString(scope.userId) ?? '',
        error: error instanceof Error ? error.message : String(error),
      });
      return this.textFallbackSearch(scope, normalizedQuery, options, topK);
    }
  }

  private createLlm(): OpenRouterService | undefined {
    if (!process.env['OPENROUTER_API_KEY']) {
      return undefined;
    }

    return new OpenRouterService({ firestore: this.db });
  }

  private async runVectorSearch(
    scope: UniversalFileSemanticSearchScope,
    queryEmbedding: readonly number[],
    options: UniversalFileSemanticSearchOptions,
    expandedLimit: number
  ): Promise<readonly ScoredSemanticChunk[]> {
    const filterClauses = buildSearchFilterClauses(scope, options);
    const filter =
      filterClauses.length === 1
        ? filterClauses[0]
        : ({ $and: filterClauses } as Record<string, unknown>);

    return TeamUniversalFileSemanticModel.aggregate<ScoredSemanticChunk>([
      {
        $vectorSearch: {
          index: TEAM_UNIVERSAL_FILE_SEMANTIC_VECTOR_INDEX_NAME,
          path: 'embedding',
          queryVector: Array.from(queryEmbedding),
          numCandidates: Math.min(Math.max(DEFAULT_NUM_CANDIDATES, expandedLimit * 20), 600),
          limit: expandedLimit,
          filter,
        },
      },
      {
        $project: {
          _id: 1,
          teamId: 1,
          ownerUserId: 1,
          fileId: 1,
          title: 1,
          normalizedTitle: 1,
          classificationPrimary: 1,
          classificationLabels: 1,
          route: 1,
          content: 1,
          contentHash: 1,
          version: 1,
          chunkIndex: 1,
          totalChunks: 1,
          payloadKind: 1,
          sourceKind: 1,
          isArchived: 1,
          mimeType: 1,
          sport: 1,
          tags: 1,
          summary: 1,
          sourceRef: 1,
          createdAt: 1,
          updatedAt: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ]);
  }

  private async markSyncState(
    fileId: string,
    state: Partial<UniversalFileSemanticSync>
  ): Promise<void> {
    await this.db
      .collection(UNIVERSAL_FILES_COLLECTION)
      .doc(fileId)
      .set({ semanticSync: state }, { merge: true });
  }

  private async buildSemanticSource(
    document: UniversalFileDoc,
    semanticTextOverride?: string
  ): Promise<UniversalFileSemanticSource> {
    if (semanticTextOverride?.trim()) {
      return {
        text: truncateText(semanticTextOverride),
        sourceKind: document.payloadKind === 'pointer' ? 'pointer' : 'structured',
      };
    }

    if (document.type === 'file' && document.payloadKind !== 'pointer') {
      const structuredPayload = getUniversalStructuredDocumentPayload(document.payload);
      const binaryPayload = getUniversalBinaryFilePayload(document.payload);
      const segments: string[] = [];

      if (structuredPayload) {
        segments.push(buildStructuredDocumentText(document, structuredPayload));
      }

      if (binaryPayload) {
        segments.push(buildBinaryMetadataText(document, binaryPayload));
        const parsed = await this.tryParseBinaryFile(document, binaryPayload);
        if (parsed?.trim()) {
          segments.push(parsed);
        }
      }

      if (segments.length > 0) {
        return {
          text: truncateText(segments.filter((entry) => entry.trim().length > 0).join('\n\n')),
          sourceKind: structuredPayload ? 'structured' : binaryPayload ? 'binary' : 'metadata',
          mimeType: binaryPayload?.mimeType,
        };
      }
    }

    if (document.payloadKind === 'pointer') {
      const dereferencedText = await this.tryBuildPointerText(document);
      if (dereferencedText?.trim()) {
        return {
          text: truncateText(`${buildPointerPreviewText(document)}\n\n${dereferencedText}`),
          sourceKind: 'pointer',
        };
      }

      return {
        text: buildPointerPreviewText(document),
        sourceKind: 'pointer',
      };
    }

    return {
      text: buildMetadataFallbackText(document),
      sourceKind: 'metadata',
    };
  }

  private async tryBuildPointerText(document: UniversalFileDoc): Promise<string | null> {
    if (document.payloadKind !== 'pointer') {
      return null;
    }

    const collectionName = normalizeString(document.payload.collectionName);
    const documentId = normalizeString(document.payload.documentId);
    if (!collectionName || !documentId) {
      return null;
    }

    const snapshot = await this.db.collection(collectionName).doc(documentId).get();
    if (!snapshot.exists) {
      return null;
    }

    const record = snapshot.data() as Record<string, unknown>;
    if (collectionName === 'TeamFilmReviews') {
      return buildFilmReviewSemanticText({
        ...(record as unknown as Omit<TeamFilmReviewDoc, 'id' | 'teamId'>),
        id: documentId,
        teamId: document.teamId,
        title: normalizeString(record['title']) ?? document.title,
        sport: normalizeString(record['sport']) ?? document.sport,
        status: (normalizeString(record['status']) ??
          document.status) as TeamFilmReviewDoc['status'],
        createdAt: toPortableTimestamp(record['createdAt']),
        updatedAt: toPortableTimestamp(record['updatedAt']),
      } as TeamFilmReviewDoc);
    }

    return buildGenericPointerDocumentText(record, document.title);
  }

  private async tryParseBinaryFile(
    document: UniversalFileDoc,
    payload: UniversalBinaryFilePayload
  ): Promise<string | null> {
    if (!this.shouldParseBinaryMimeType(payload.mimeType)) {
      return null;
    }

    const parseUrl = await this.resolveBinaryParseUrl(payload);
    if (!parseUrl) {
      return null;
    }

    const parsed = await this.parser.execute({
      url: parseUrl,
      fileName: document.title,
      mimeType: payload.mimeType,
    });

    if (!parsed.success) {
      logger.warn('[UniversalFileSemantic] Binary parse failed', {
        fileId: document.id,
        mimeType: payload.mimeType,
        error: parsed.error,
      });
      return null;
    }

    const parsedData =
      parsed.data && typeof parsed.data === 'object'
        ? (parsed.data as Record<string, unknown>)
        : undefined;

    const markdown =
      typeof parsedData?.['markdown'] === 'string'
        ? parsedData['markdown']
        : typeof parsed.markdown === 'string'
          ? parsed.markdown
          : '';

    return markdown.trim().length > 0 ? truncateText(markdown) : null;
  }

  private async resolveBinaryParseUrl(payload: UniversalBinaryFilePayload): Promise<string | null> {
    if (payload.storagePath) {
      try {
        const bucket = getStorage().bucket();
        const [signedUrl] = await getSignedUrlWithTimeout(() =>
          bucket.file(payload.storagePath!).getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000,
          })
        );
        return signedUrl;
      } catch (error) {
        logger.warn('[UniversalFileSemantic] Failed to sign storage path for parsing', {
          storagePath: payload.storagePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return normalizeString(payload.url) ?? null;
  }

  private shouldParseBinaryMimeType(mimeType: string): boolean {
    const normalized = mimeType.trim().toLowerCase();
    return (
      normalized === 'application/pdf' ||
      normalized === 'text/csv' ||
      normalized === 'application/msword' ||
      normalized === 'application/vnd.ms-excel' ||
      normalized === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      normalized === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      normalized === 'application/vnd.oasis.opendocument.text' ||
      normalized === 'application/rtf' ||
      normalized === 'text/rtf' ||
      normalized === 'text/html' ||
      normalized === 'application/xhtml+xml' ||
      normalized.startsWith('text/')
    );
  }

  private async textFallbackSearch(
    scope: UniversalFileSemanticSearchScope,
    query: string,
    options: UniversalFileSemanticSearchOptions,
    topK: number
  ): Promise<readonly UniversalFileSemanticSearchResult[]> {
    const runTextSearch = async (): Promise<readonly ScoredSemanticChunk[]> => {
      const filterClauses = buildSearchFilterClauses(scope, options);
      const pipeline: PipelineStage[] = [
        {
          $match: {
            $and: filterClauses,
            $text: { $search: query },
          },
        },
        {
          $project: {
            _id: 1,
            teamId: 1,
            ownerUserId: 1,
            fileId: 1,
            title: 1,
            normalizedTitle: 1,
            classificationPrimary: 1,
            classificationLabels: 1,
            route: 1,
            content: 1,
            contentHash: 1,
            version: 1,
            chunkIndex: 1,
            totalChunks: 1,
            payloadKind: 1,
            sourceKind: 1,
            isArchived: 1,
            mimeType: 1,
            sport: 1,
            tags: 1,
            summary: 1,
            sourceRef: 1,
            createdAt: 1,
            updatedAt: 1,
            score: { $meta: 'textScore' },
          },
        },
        { $sort: { score: -1 } },
        { $limit: Math.min(Math.max(topK * 5, topK * 3), 120) },
      ];

      return TeamUniversalFileSemanticModel.aggregate<ScoredSemanticChunk>(pipeline);
    };

    const results = await runTextSearch();
    const filteredPrimary = results.filter((entry) => matchesSearchFilters(entry, options));

    if (filteredPrimary.length > 0 || !resolveExplicitClassificationFilter(options)) {
      return this.collapseResults(filteredPrimary, topK);
    }

    return [];
  }

  private collapseResults(
    results: readonly ScoredSemanticChunk[],
    topK: number
  ): readonly UniversalFileSemanticSearchResult[] {
    const byFileId = new Map<string, UniversalFileSemanticSearchResult>();

    for (const entry of results) {
      const existing = byFileId.get(entry.fileId);
      if (existing && existing.score >= entry.score) {
        continue;
      }

      byFileId.set(entry.fileId, {
        fileId: entry.fileId,
        title: entry.title,
        ...(entry.classificationPrimary ? { classification: entry.classificationPrimary } : {}),
        ...(entry.route ? { route: entry.route } : {}),
        ...(entry.classificationLabels ? { labels: [...entry.classificationLabels] } : {}),
        score: entry.score,
        excerpt: truncateText(entry.content, 320),
        isArchived: entry.isArchived,
      });
    }

    return [...byFileId.values()].sort((left, right) => right.score - left.score).slice(0, topK);
  }
}

export function scheduleUniversalFileSemanticSync(params: {
  readonly db: Firestore;
  readonly fileId?: string;
  readonly document?: UniversalFileDoc;
  readonly semanticText?: string;
}): void {
  setTimeout(() => {
    const service = new UniversalFileSemanticService(params.db);
    const promise = params.document
      ? service.syncDocument(params.document, { semanticText: params.semanticText })
      : params.fileId
        ? service.syncByFileId(params.fileId, { semanticText: params.semanticText })
        : Promise.resolve();

    void promise.catch((error) => {
      logger.warn('[UniversalFileSemantic] Scheduled sync failed', {
        fileId: params.document?.id ?? params.fileId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, 0);
}

export async function deleteUniversalFileSemanticIndex(
  db: Firestore,
  fileId: string
): Promise<void> {
  const service = new UniversalFileSemanticService(db);
  await service.deleteByFileId(fileId);
}
