import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';
import type {
  TeamFileKind,
  TeamFileFolderDoc,
  UniversalBinaryFilePayload,
  UniversalClassificationFacetValue,
  UniversalFileClassification,
  UniversalFileDoc,
  UniversalFilmReviewPayload,
  UniversalNativeFilePayload,
  UniversalFileStatus,
} from '@nxt1/core';
import {
  getUniversalBinaryFilePayload,
  getUniversalFileClassification,
  getUniversalFilmReviewPayload,
  UNIVERSAL_FILES_COLLECTION,
} from '@nxt1/core';
import {
  buildGrantedAccessKeys,
  canAccessByKeys,
  createOwnerPrivateAccessLists,
  createOwnerScopedAccessLists,
  resolveFileAccessContext,
  toOrganizationAccessKey,
  toTeamAccessKey,
  toUserAccessKey,
} from '../../../../../services/team/file-access-keys.service.js';
import {
  scheduleUniversalFileSemanticSync,
  UniversalFileSemanticService,
} from '../../../../../services/team/universal-file-semantic.service.js';
import { getSignedUrlWithTimeout } from '../../../../../utils/gcs-signed-url.js';
import { BaseTool, type ToolExecutionContext, type ToolResult } from '../../base.tool.js';

const TEAM_FILE_FOLDERS_COLLECTION = 'TeamFileFolders' as const;
const UNIVERSAL_DOCUMENT_STATUSES = ['processing', 'ready', 'archived', 'draft', 'active'] as const;

type ClassificationInput =
  | string
  | {
      readonly primary?: string;
      readonly route?: string;
      readonly labels?: readonly string[];
      readonly facets?: Readonly<Record<string, unknown>>;
    };

const UniversalDocumentStatusSchema = z.enum(UNIVERSAL_DOCUMENT_STATUSES);
const ClassificationFacetScalarSchema = z.union([
  z.string().trim().min(1),
  z.number().finite(),
  z.boolean(),
]);
const ClassificationFacetValueSchema = z.union([
  ClassificationFacetScalarSchema,
  z.array(ClassificationFacetScalarSchema).min(1),
]);
const ClassificationObjectSchema = z.object({
  primary: z.string().trim().min(1).optional(),
  route: z.string().trim().min(1).optional(),
  labels: z.array(z.string().trim().min(1)).min(1).max(50).optional(),
  facets: z.record(z.string(), ClassificationFacetValueSchema).optional(),
});
const ClassificationInputSchema = z.union([z.string().trim().min(1), ClassificationObjectSchema]);
const UniversalMetadataSchema = z.record(z.string(), z.unknown());
const AccessKeyArraySchema = z.array(z.string().trim().min(1)).max(250);
const TeamFileKindSchema = z.enum(['image', 'video', 'pdf', 'csv', 'doc', 'app']);
const TeamFileOriginSchema = z.enum(['files_upload', 'agent_chat_input', 'agent_chat_output']);
const SourceFileInputSchema = z
  .object({
    storagePath: z.string().trim().min(1).max(1024).optional(),
    url: z.string().trim().url('url must be a valid URL').optional(),
    fileName: z.string().trim().min(1).max(256).optional(),
    mimeType: z.string().trim().min(1).max(128),
    kind: TeamFileKindSchema.optional(),
    origin: TeamFileOriginSchema.optional(),
    sizeBytes: z.number().int().min(0).optional(),
    thumbnailUrl: z.string().trim().url('thumbnailUrl must be a valid URL').optional(),
  })
  .refine((value) => Boolean(value.storagePath || value.url), {
    message: 'Either sourceFile.storagePath or sourceFile.url is required.',
    path: ['storagePath'],
  });

const CreateUniversalTeamDocumentInputSchema = z
  .object({
    documentId: z.string().trim().min(1).optional(),
    teamId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    content: z.string().trim().min(1).optional(),
    classification: ClassificationInputSchema.optional(),
    sport: z.string().trim().min(1).optional(),
    summary: z.string().trim().min(1).optional(),
    status: UniversalDocumentStatusSchema.optional(),
    tags: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
    folderId: z.union([z.string().trim().min(1), z.null()]).optional(),
    metadata: UniversalMetadataSchema.optional(),
    sourceFile: SourceFileInputSchema.optional(),
  })
  .refine((value) => Boolean(value.content || value.sourceFile), {
    message: 'Either content or sourceFile is required.',
    path: ['content'],
  });

const ListUniversalTeamDocumentsInputSchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  classification: z.string().trim().min(1).optional(),
  route: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  sport: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).optional(),
  semanticQuery: z.string().trim().min(1).optional(),
});

const GetUniversalTeamDocumentInputSchema = z.object({
  documentId: z.string().trim().min(1),
});

const UpdateUniversalTeamDocumentPatchSchema = z.object({
  title: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  classification: ClassificationInputSchema.nullable().optional(),
  sport: z.string().trim().min(1).nullable().optional(),
  summary: z.string().trim().min(1).nullable().optional(),
  status: UniversalDocumentStatusSchema.optional(),
  tags: z.array(z.string().trim().min(1)).min(1).max(100).nullable().optional(),
  folderId: z.union([z.string().trim().min(1), z.null()]).optional(),
  metadata: UniversalMetadataSchema.nullable().optional(),
  artifactClassification: ClassificationInputSchema.nullable().optional(),
  artifactSummary: z.string().trim().min(1).nullable().optional(),
  artifactNotes: z.string().trim().min(1).nullable().optional(),
  artifactTags: z.array(z.string().trim().min(1)).min(1).max(100).nullable().optional(),
  artifactGeneratedAt: z.string().trim().min(1).nullable().optional(),
  artifactStatus: z.string().trim().min(1).nullable().optional(),
  readAccessKeys: AccessKeyArraySchema.optional(),
  writeAccessKeys: AccessKeyArraySchema.optional(),
});

const UpdateUniversalTeamDocumentInputSchema = z.object({
  documentId: z.string().trim().min(1),
  patch: UpdateUniversalTeamDocumentPatchSchema,
});

const DeleteUniversalTeamDocumentInputSchema = z.object({
  documentId: z.string().trim().min(1),
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

function normalizeUniversalDocumentId(value: string): string {
  return value.replace(/^team-file:/i, '').trim();
}

function normalizeStringArray(value: unknown, lowercase = false): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry).trim()))
    .map((entry) => (lowercase ? entry.toLowerCase() : entry))
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? [...new Set(normalized)] : undefined;
}

function getAclAccessKeys(acl: unknown): readonly string[] | undefined {
  if (!acl || typeof acl !== 'object' || !Array.isArray((acl as { grants?: unknown }).grants)) {
    return undefined;
  }

  const accessKeys = (acl as { grants: unknown[] }).grants
    .flatMap((grant) => {
      if (!grant || typeof grant !== 'object') {
        return [];
      }

      const principalType = normalizeText((grant as Record<string, unknown>)['principalType']);
      const principalId = normalizeString((grant as Record<string, unknown>)['principalId']);
      if (!principalType || !principalId) {
        return [];
      }

      switch (principalType) {
        case 'user':
          return [toUserAccessKey(principalId)];
        case 'team':
          return [toTeamAccessKey(principalId)];
        case 'organization':
          return [toOrganizationAccessKey(principalId)];
        default:
          return [];
      }
    })
    .filter((value) => value.length > 0);

  return accessKeys.length > 0 ? [...new Set(accessKeys)] : undefined;
}

function getLegacyReadAccessKeys(data: Record<string, unknown>): readonly string[] | undefined {
  const ownerUserId =
    normalizeString(data['ownerUserId']) ?? normalizeString(data['createdByUserId']);
  const teamId = normalizeString(data['teamId']);
  const organizationId = normalizeString(data['organizationId']);

  if (ownerUserId) {
    return createOwnerScopedAccessLists({
      ownerUserId,
      teamId: teamId ?? null,
      organizationId: organizationId ?? null,
    }).readAccessKeys;
  }

  const fallbackKeys = [
    ...(teamId ? [toTeamAccessKey(teamId)] : []),
    ...(organizationId ? [toOrganizationAccessKey(organizationId)] : []),
  ];

  return fallbackKeys.length > 0 ? fallbackKeys : undefined;
}

function getLegacyWriteAccessKeys(data: Record<string, unknown>): readonly string[] | undefined {
  const ownerUserId =
    normalizeString(data['ownerUserId']) ?? normalizeString(data['createdByUserId']);
  const teamId = normalizeString(data['teamId']);
  const organizationId = normalizeString(data['organizationId']);

  if (!ownerUserId) {
    return undefined;
  }

  return createOwnerScopedAccessLists({
    ownerUserId,
    teamId: teamId ?? null,
    organizationId: organizationId ?? null,
  }).writeAccessKeys;
}

function toUniversalDocument(docId: string, data: Record<string, unknown>): UniversalFileDoc {
  const baseData = data as unknown as Partial<UniversalFileDoc>;
  const ownerUserId =
    normalizeString(data['ownerUserId']) ?? normalizeString(data['createdByUserId']);
  const explicitReadAccessKeys = normalizeStringArray(data['readAccessKeys']);
  const explicitWriteAccessKeys = normalizeStringArray(data['writeAccessKeys']);
  const readAccessKeys =
    explicitReadAccessKeys ?? getAclAccessKeys(data['acl']) ?? getLegacyReadAccessKeys(data);
  const writeAccessKeys = explicitWriteAccessKeys ?? getLegacyWriteAccessKeys(data);
  const accessLists = ownerUserId
    ? resolveDocumentAccessLists({ ownerUserId, readAccessKeys, writeAccessKeys })
    : { readAccessKeys, writeAccessKeys };

  return {
    ...baseData,
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    ...(ownerUserId ? { ownerUserId } : {}),
    ...(normalizeString(data['createdByUserId'])
      ? { createdByUserId: normalizeString(data['createdByUserId']) }
      : {}),
    ...(accessLists.readAccessKeys ? { readAccessKeys: accessLists.readAccessKeys } : {}),
    ...(accessLists.writeAccessKeys ? { writeAccessKeys: accessLists.writeAccessKeys } : {}),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['lastSeenAt'] ? { lastSeenAt: toPortableTimestamp(data['lastSeenAt']) } : {}),
  } as UniversalFileDoc;
}

function resolveDocumentAccessLists(input: {
  readonly ownerUserId: string;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
}): { readonly readAccessKeys: readonly string[]; readonly writeAccessKeys: readonly string[] } {
  const ownerKey = toUserAccessKey(input.ownerUserId);
  const writeAccessKeys = [...new Set([ownerKey, ...(input.writeAccessKeys ?? [])])];
  const readAccessKeys = [
    ...new Set([ownerKey, ...(input.readAccessKeys ?? []), ...writeAccessKeys]),
  ];

  return {
    readAccessKeys,
    writeAccessKeys,
  };
}

function resolveDocumentOwnerUserId(
  document: Pick<UniversalFileDoc, 'ownerUserId' | 'createdByUserId'>
): string | null {
  const ownerUserId = normalizeString(document.ownerUserId);
  if (ownerUserId) {
    return ownerUserId;
  }

  const createdByUserId = normalizeString(document.createdByUserId);
  return createdByUserId ?? null;
}

function isDocumentShareUpdateAllowed(input: {
  readonly userId: string;
  readonly ownerUserId: string;
}): boolean {
  return input.userId === input.ownerUserId;
}

function canAccessDocumentByGrantedKeys(
  document: Pick<
    UniversalFileDoc,
    'ownerUserId' | 'createdByUserId' | 'readAccessKeys' | 'writeAccessKeys'
  >,
  userId: string,
  grantedAccessKeys: readonly string[],
  mode: 'read' | 'write'
): boolean {
  const ownerUserId = resolveDocumentOwnerUserId(document);
  if (ownerUserId === userId) {
    return true;
  }

  const candidateKeys =
    mode === 'write' ? (document.writeAccessKeys ?? []) : (document.readAccessKeys ?? []);
  if (candidateKeys.length === 0) {
    return false;
  }

  return canAccessByKeys(candidateKeys, grantedAccessKeys);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasOwnPatch(patch: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function pruneUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => pruneUndefinedDeep(entry)) as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, pruneUndefinedDeep(entryValue)]);

    return Object.fromEntries(entries) as T;
  }

  return value;
}

function truncateText(value: string | undefined, maxLength = 240): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function normalizeFacetScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') {
    return normalizeString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

function normalizeFacetValue(value: unknown): UniversalClassificationFacetValue | undefined {
  const scalar = normalizeFacetScalar(value);
  if (scalar !== undefined) {
    return scalar;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => normalizeFacetScalar(entry))
      .filter((entry) => entry !== undefined);
    return normalized.length > 0 ? normalized : undefined;
  }

  return undefined;
}

function normalizeClassificationInput(
  value: ClassificationInput | null | undefined
): UniversalFileClassification | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'string') {
    const primary = normalizeText(value);
    return primary ? { primary, labels: [primary] } : undefined;
  }

  const primary = normalizeText(value.primary);
  const route = normalizeText(value.route);
  const labels = normalizeStringArray(
    [...(value.labels ?? []), ...(primary ? [primary] : [])],
    true
  );
  const facets = isRecord(value.facets)
    ? Object.fromEntries(
        Object.entries(value.facets)
          .map(([key, entryValue]) => [key, normalizeFacetValue(entryValue)] as const)
          .filter(([, entryValue]) => entryValue !== undefined)
      )
    : undefined;

  if (!primary && !route && !labels && (!facets || Object.keys(facets).length === 0)) {
    return undefined;
  }

  return {
    ...(primary ? { primary } : {}),
    ...(route ? { route } : {}),
    ...(labels ? { labels } : {}),
    ...(facets && Object.keys(facets).length > 0 ? { facets } : {}),
  };
}

function resolveUniversalDocumentStatus(value: unknown): UniversalFileStatus | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }

  return UNIVERSAL_DOCUMENT_STATUSES.includes(
    normalized as (typeof UNIVERSAL_DOCUMENT_STATUSES)[number]
  )
    ? (normalized as UniversalFileStatus)
    : undefined;
}

function getDocumentText(document: UniversalFileDoc): string | undefined {
  if (document.payloadKind !== 'native' || !isRecord(document.payload)) {
    return undefined;
  }

  const payload = document.payload as UniversalNativeFilePayload<string, object>;
  const content = payload.content;
  if (!isRecord(content)) {
    return undefined;
  }

  return typeof content['text'] === 'string' ? content['text'] : undefined;
}

function getNativeBinaryPayload(document: UniversalFileDoc): UniversalBinaryFilePayload | null {
  if (document.payloadKind !== 'native') {
    return null;
  }

  return getUniversalBinaryFilePayload(document.payload) ?? getUniversalBinaryFilePayload(document);
}

function getDocumentMetadata(document: UniversalFileDoc): Record<string, unknown> | undefined {
  if (document.payloadKind !== 'native' || !isRecord(document.payload)) {
    return undefined;
  }

  const payload = document.payload as UniversalNativeFilePayload<string, object>;
  const content = payload.content;
  if (!isRecord(content) || !isRecord(content['data'])) {
    return undefined;
  }

  return content['data'] as Record<string, unknown>;
}

function getFilmReviewPayload(document: UniversalFileDoc): UniversalFilmReviewPayload | null {
  if (document.payloadKind !== 'native') {
    return null;
  }

  return getUniversalFilmReviewPayload(document.payload);
}

function getFilmReviewSearchText(document: UniversalFileDoc): string | undefined {
  const review = getFilmReviewPayload(document);
  if (!review) {
    return undefined;
  }

  const sourceTitles = (review.sources ?? [])
    .map((source) => source.title)
    .filter(Boolean)
    .join(' ');
  const timelineLabels = (review.timeline ?? [])
    .map((segment) => {
      const values = [segment.label];
      if (segment.tags) {
        values.push(JSON.stringify(segment.tags));
      }
      return values.join(' ');
    })
    .join(' ');

  return [review.aiSummary, ...(review.keyInsights ?? []), sourceTitles, timelineLabels]
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .join(' ');
}

function getFilmReviewSummaryMetadata(
  document: UniversalFileDoc
): Record<string, unknown> | undefined {
  const review = getFilmReviewPayload(document);
  if (!review) {
    return undefined;
  }

  return {
    uploadMode: review.uploadMode ?? null,
    perspective: review.perspective ?? null,
    opponentName: review.opponentName ?? null,
    gameDate: review.gameDate ?? null,
    sourceCount: review.sources?.length ?? 0,
    clipCount: review.clips?.length ?? 0,
    timelineCount: review.timeline?.length ?? 0,
    timelineState: review.timelineState ?? null,
    readyToStream: review.readyToStream ?? null,
  };
}

function getPointerPreviewText(document: UniversalFileDoc): string | undefined {
  if (document.payloadKind !== 'pointer') {
    return undefined;
  }

  return normalizeString(document.payload.preview?.summary);
}

function getPointerSummaryMetadata(
  document: UniversalFileDoc
): Record<string, unknown> | undefined {
  if (document.payloadKind !== 'pointer') {
    return undefined;
  }

  return pruneUndefinedDeep({
    collectionName: normalizeString(document.payload.collectionName),
    documentId: normalizeString(document.payload.documentId),
    previewStatus: normalizeString(document.payload.preview?.status),
    previewSport: normalizeString(document.payload.preview?.sport),
    previewTags: normalizeStringArray(document.payload.preview?.tags, true),
    previewTitle: normalizeString(document.payload.preview?.title),
  });
}

function getArtifactMetadataSummary(
  document: UniversalFileDoc
): Record<string, unknown> | undefined {
  const record = document as unknown as Record<string, unknown>;
  const artifactClassification = hasOwnPatch(record, 'artifactClassification')
    ? record['artifactClassification']
    : undefined;
  const artifactSummary = normalizeString(record['artifactSummary']);
  const artifactNotes = normalizeString(record['artifactNotes']);
  const artifactTags = normalizeStringArray(record['artifactTags'], true);
  const artifactGeneratedAt = normalizeString(record['artifactGeneratedAt']);
  const artifactStatus = normalizeString(record['artifactStatus']);

  const metadata = pruneUndefinedDeep({
    ...(artifactClassification !== undefined ? { artifactClassification } : {}),
    ...(artifactSummary ? { artifactSummary } : {}),
    ...(artifactNotes ? { artifactNotes: truncateText(artifactNotes, 320) } : {}),
    ...(artifactTags ? { artifactTags } : {}),
    ...(artifactGeneratedAt ? { artifactGeneratedAt } : {}),
    ...(artifactStatus ? { artifactStatus } : {}),
  });

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function isPageByPageArtifactNotes(value: unknown): boolean {
  const notes = normalizeString(value);
  if (!notes) return false;

  return (
    /^# AI Notes:/i.test(notes) &&
    /## Page-by-page notes/i.test(notes) &&
    /### Page \d+/i.test(notes)
  );
}

function hasEnrichDocumentNotesClassification(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const record = value as Record<string, unknown>;
  return (
    normalizeString(record['kind']) === 'ai_page_notes' &&
    normalizeString(record['source']) === 'enrich_document_notes'
  );
}

function shouldPreserveExistingPageByPageArtifactNotes(params: {
  readonly existingRecord: Record<string, unknown>;
  readonly nextArtifactNotes: string | undefined;
  readonly patchTouchedArtifactNotes: boolean;
}): boolean {
  if (!params.patchTouchedArtifactNotes) return false;
  if (!params.nextArtifactNotes) return false;
  if (isPageByPageArtifactNotes(params.nextArtifactNotes)) return false;
  if (!isPageByPageArtifactNotes(params.existingRecord['artifactNotes'])) return false;

  return hasEnrichDocumentNotesClassification(params.existingRecord['artifactClassification']);
}

function isManagedUniversalDocument(document: UniversalFileDoc): boolean {
  return (
    document.type === 'file' && document.payloadKind === 'native' && !!getDocumentText(document)
  );
}

function isNativeUploadedFile(document: UniversalFileDoc): boolean {
  return (
    document.type === 'file' &&
    document.payloadKind === 'native' &&
    !!getNativeBinaryPayload(document)
  );
}

function isInspectableUniversalArtifact(document: UniversalFileDoc): boolean {
  return (
    isManagedUniversalDocument(document) ||
    isNativeUploadedFile(document) ||
    !!getFilmReviewPayload(document) ||
    (document.type === 'file' && document.payloadKind === 'pointer')
  );
}

function resolveInspectableArtifactKind(
  document: UniversalFileDoc
): 'managed_document' | 'uploaded_file' | 'film_review' | 'pointer_file' {
  if (isManagedUniversalDocument(document)) {
    return 'managed_document';
  }

  if (isNativeUploadedFile(document)) {
    return 'uploaded_file';
  }

  if (getFilmReviewPayload(document)) {
    return 'film_review';
  }

  return 'pointer_file';
}

function normalizeScopeTeamId(teamId: string | null | undefined): string {
  return typeof teamId === 'string' ? teamId.trim() : '';
}

function toTeamFileFolderDoc(docId: string, data: Record<string, unknown>): TeamFileFolderDoc {
  const parentId = typeof data['parentId'] === 'string' ? data['parentId'].trim() : '';
  const readAccessKeys = normalizeStringArray(data['readAccessKeys']);
  const writeAccessKeys = normalizeStringArray(data['writeAccessKeys']);

  return {
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    name: String(data['name'] ?? 'Untitled folder'),
    normalizedName: String(data['normalizedName'] ?? '')
      .trim()
      .toLowerCase(),
    ...(typeof data['organizationId'] === 'string'
      ? { organizationId: data['organizationId'] }
      : {}),
    ...(parentId ? { parentId } : {}),
    sortOrder: Number(data['sortOrder'] ?? 0),
    createdByUserId: String(data['createdByUserId'] ?? ''),
    ...(readAccessKeys ? { readAccessKeys } : {}),
    ...(writeAccessKeys ? { writeAccessKeys } : {}),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
  } satisfies TeamFileFolderDoc;
}

async function loadTeamFileFolder(
  db: Firestore,
  folderId: string
): Promise<TeamFileFolderDoc | null> {
  const snapshot = await db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId).get();
  if (!snapshot.exists) {
    return null;
  }

  return toTeamFileFolderDoc(snapshot.id, (snapshot.data() ?? {}) as Record<string, unknown>);
}

function canAccessFolderByGrantedKeys(
  folder: Pick<TeamFileFolderDoc, 'createdByUserId' | 'readAccessKeys' | 'writeAccessKeys'>,
  userId: string,
  grantedAccessKeys: readonly string[],
  mode: 'read' | 'write'
): boolean {
  if (folder.createdByUserId === userId) {
    return true;
  }

  const candidateKeys =
    mode === 'write' ? (folder.writeAccessKeys ?? []) : (folder.readAccessKeys ?? []);
  if (candidateKeys.length === 0) {
    return false;
  }

  return canAccessByKeys(candidateKeys, grantedAccessKeys);
}

function buildDocumentId(params: {
  readonly documentId?: string;
  readonly teamId?: string;
  readonly userId: string;
  readonly title: string;
  readonly classification?: UniversalFileClassification;
}): string {
  const explicitId = normalizeString(params.documentId);
  if (explicitId) {
    return explicitId;
  }

  const classificationSeed =
    params.classification?.primary ?? params.classification?.route ?? 'document';
  const scopeSeed = normalizeScopeTeamId(params.teamId) || `personal_${slugify(params.userId)}`;
  return `${scopeSeed}_${slugify(classificationSeed)}_${slugify(params.title)}_${Date.now()}`;
}

function isArchivedDocument(document: UniversalFileDoc): boolean {
  return document.status === 'archived';
}

function matchesDocumentFilters(
  document: UniversalFileDoc,
  filters: {
    readonly includeArchived: boolean;
    readonly normalizedSport?: string;
    readonly normalizedQuery?: string;
    readonly normalizedClassification?: string;
    readonly normalizedRoute?: string;
    readonly normalizedLabel?: string;
  }
): boolean {
  if (!isInspectableUniversalArtifact(document)) {
    return false;
  }

  if (!filters.includeArchived && isArchivedDocument(document)) {
    return false;
  }

  if (filters.normalizedSport && normalizeText(document.sport) !== filters.normalizedSport) {
    return false;
  }

  const classification = getUniversalFileClassification(document);
  const classificationPrimary = normalizeText(classification?.primary);
  const classificationRoute = normalizeText(classification?.route);

  if (
    filters.normalizedClassification &&
    classificationPrimary !== filters.normalizedClassification
  ) {
    return false;
  }

  if (filters.normalizedRoute && classificationRoute !== filters.normalizedRoute) {
    return false;
  }

  if (filters.normalizedLabel) {
    const labels = normalizeStringArray(classification?.labels, true);
    if (!labels?.includes(filters.normalizedLabel)) {
      return false;
    }
  }

  if (!filters.normalizedQuery) {
    return true;
  }

  const haystack = [
    document.title,
    document.summary,
    document.sport,
    classificationPrimary,
    classificationRoute,
    ...(classification?.labels ?? []),
    getDocumentText(document),
    getFilmReviewSearchText(document),
  ]
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .join(' ')
    .toLowerCase();

  return haystack.includes(filters.normalizedQuery);
}

function compareByUpdatedAtDesc(left: UniversalFileDoc, right: UniversalFileDoc): number {
  return (
    Date.parse(toPortableTimestamp(right.updatedAt)) -
    Date.parse(toPortableTimestamp(left.updatedAt))
  );
}

function buildSemanticDiscoveryQuery(entries: readonly (string | undefined)[]): string | undefined {
  const terms = entries.filter((entry): entry is string => !!entry);
  return terms.length > 0 ? terms.join(' ') : undefined;
}

async function listDocumentsForTeamWithFilters(params: {
  readonly db: Firestore;
  readonly userId: string;
  readonly teamId: string;
  readonly includeArchived: boolean;
  readonly normalizedSport?: string;
  readonly normalizedQuery?: string;
  readonly normalizedClassification?: string;
  readonly normalizedRoute?: string;
  readonly normalizedLabel?: string;
  readonly limit: number;
}): Promise<readonly UniversalFileDoc[]> {
  const {
    db,
    userId,
    teamId,
    includeArchived,
    normalizedSport,
    normalizedQuery,
    normalizedClassification,
    normalizedRoute,
    normalizedLabel,
    limit,
  } = params;
  const batchSize = Math.max(limit * 2, 50);
  const matches: UniversalFileDoc[] = [];
  let offset = 0;
  const isPersonalScope = teamId.length === 0;

  while (matches.length < limit) {
    const scopedQuery = isPersonalScope
      ? db.collection(UNIVERSAL_FILES_COLLECTION).where('ownerUserId', '==', userId)
      : db.collection(UNIVERSAL_FILES_COLLECTION).where('teamId', '==', teamId);
    const snapshot = await scopedQuery
      .orderBy('updatedAt', 'desc')
      .offset(offset)
      .limit(batchSize)
      .get();

    if (snapshot.empty) {
      break;
    }

    const documents = snapshot.docs.map((doc) => toUniversalDocument(doc.id, doc.data() ?? {}));
    const filtered = documents.filter((document) => {
      if (normalizeScopeTeamId(document.teamId) !== teamId) {
        return false;
      }

      return matchesDocumentFilters(document, {
        includeArchived,
        normalizedSport,
        normalizedQuery,
        normalizedClassification,
        normalizedRoute,
        normalizedLabel,
      });
    });

    matches.push(...filtered);
    offset += snapshot.size;

    if (snapshot.size < batchSize) {
      break;
    }
  }

  return matches.sort(compareByUpdatedAtDesc).slice(0, limit);
}

function summarizeUniversalDocument(document: UniversalFileDoc): Record<string, unknown> {
  const classification = getUniversalFileClassification(document);
  const metadata =
    getDocumentMetadata(document) ??
    getFilmReviewSummaryMetadata(document) ??
    getPointerSummaryMetadata(document);
  const artifactMetadata = getArtifactMetadataSummary(document);
  const binaryPayload = getNativeBinaryPayload(document);
  const content =
    getDocumentText(document) ??
    getFilmReviewPayload(document)?.aiSummary ??
    getPointerPreviewText(document);
  const artifactKind = resolveInspectableArtifactKind(document);
  const editableViaUniversalDocumentTool = artifactKind === 'managed_document';

  return {
    id: document.id,
    teamId: document.teamId,
    title: document.title,
    type: document.type,
    artifactKind,
    editableViaUniversalDocumentTool,
    classification: classification?.primary,
    route: classification?.route,
    labels: classification?.labels,
    sport: document.sport,
    status: document.status,
    payloadKind: document.payloadKind,
    updatedAt: document.updatedAt,
    createdAt: document.createdAt,
    summary: document.summary,
    tags: document.tags,
    folderId: document.folderId ?? null,
    ...(document.readAccessKeys ? { readAccessKeys: document.readAccessKeys } : {}),
    ...(document.writeAccessKeys ? { writeAccessKeys: document.writeAccessKeys } : {}),
    excerpt: truncateText(content, 320),
    ...(metadata ? { metadata } : {}),
    ...(binaryPayload
      ? {
          file: pruneUndefinedDeep({
            mimeType: binaryPayload.mimeType,
            kind: binaryPayload.kind,
            sizeBytes: binaryPayload.sizeBytes,
            storagePath: binaryPayload.storagePath,
            url: binaryPayload.url,
            thumbnailUrl: binaryPayload.thumbnailUrl,
          }),
        }
      : {}),
    ...(artifactMetadata ? artifactMetadata : {}),
  };
}

async function resolveInspectablePointerAsset(
  db: Firestore,
  document: UniversalFileDoc
): Promise<{
  readonly inspectionUrl: string;
  readonly mimeType?: string;
  readonly kind?: string;
  readonly sizeBytes?: number;
  readonly storagePath?: string;
  readonly documentRef: string;
  readonly parseDocumentInput: Record<string, unknown>;
  readonly renderPdfPagesInput?: Record<string, unknown>;
  readonly thumbnailUrl?: string;
  readonly collectionName: string;
  readonly sourceDocumentId: string;
} | null> {
  if (document.payloadKind !== 'pointer') {
    return null;
  }

  const collectionName = normalizeString(document.payload.collectionName);
  const sourceDocumentId = normalizeString(document.payload.documentId);
  if (!collectionName || !sourceDocumentId) {
    return null;
  }

  const snapshot = await db.collection(collectionName).doc(sourceDocumentId).get();
  if (!snapshot.exists) {
    return null;
  }

  const record = (snapshot.data() ?? {}) as Record<string, unknown>;
  const binaryPayload =
    getUniversalBinaryFilePayload(record['payload']) ?? getUniversalBinaryFilePayload(record);
  if (!binaryPayload) {
    return null;
  }

  const inspectionUrl = await resolveInspectableBinaryUrl(binaryPayload);
  if (!inspectionUrl) {
    return null;
  }

  return pruneUndefinedDeep({
    inspectionUrl,
    mimeType: normalizeString(binaryPayload.mimeType),
    kind: normalizeString(binaryPayload.kind),
    sizeBytes: typeof binaryPayload.sizeBytes === 'number' ? binaryPayload.sizeBytes : undefined,
    storagePath: normalizeString(binaryPayload.storagePath),
    documentRef: `team-file:${document.id}`,
    parseDocumentInput: {
      storagePath: `team-file:${document.id}`,
      url: inspectionUrl,
      fileName: document.title,
      mimeType: normalizeString(binaryPayload.mimeType),
    },
    renderPdfPagesInput:
      normalizeString(binaryPayload.mimeType) === 'application/pdf' ||
      /\.pdf$/i.test(document.title)
        ? {
            storagePath: `team-file:${document.id}`,
            url: inspectionUrl,
            fileName: document.title,
            mimeType: normalizeString(binaryPayload.mimeType) ?? 'application/pdf',
          }
        : undefined,
    thumbnailUrl: normalizeString(binaryPayload.thumbnailUrl),
    collectionName,
    sourceDocumentId,
  });
}

async function resolveInspectableNativeAsset(document: UniversalFileDoc): Promise<{
  readonly inspectionUrl: string;
  readonly mimeType?: string;
  readonly kind?: string;
  readonly sizeBytes?: number;
  readonly storagePath?: string;
  readonly documentRef: string;
  readonly parseDocumentInput: Record<string, unknown>;
  readonly renderPdfPagesInput?: Record<string, unknown>;
  readonly thumbnailUrl?: string;
} | null> {
  const binaryPayload = getNativeBinaryPayload(document);
  if (!binaryPayload) {
    return null;
  }

  const inspectionUrl = await resolveInspectableBinaryUrl(binaryPayload);
  if (!inspectionUrl) {
    return null;
  }

  const mimeType = normalizeString(binaryPayload.mimeType);

  return pruneUndefinedDeep({
    inspectionUrl,
    mimeType,
    kind: normalizeString(binaryPayload.kind),
    sizeBytes: typeof binaryPayload.sizeBytes === 'number' ? binaryPayload.sizeBytes : undefined,
    storagePath: normalizeString(binaryPayload.storagePath),
    documentRef: `team-file:${document.id}`,
    parseDocumentInput: {
      storagePath: `team-file:${document.id}`,
      url: inspectionUrl,
      fileName: document.title,
      mimeType,
    },
    renderPdfPagesInput:
      mimeType === 'application/pdf' || /\.pdf$/i.test(document.title)
        ? {
            storagePath: `team-file:${document.id}`,
            url: inspectionUrl,
            fileName: document.title,
            mimeType: mimeType ?? 'application/pdf',
          }
        : undefined,
    thumbnailUrl: normalizeString(binaryPayload.thumbnailUrl),
  });
}

async function resolveInspectableBinaryUrl(
  payload: UniversalBinaryFilePayload
): Promise<string | null> {
  const directUrl = normalizeString(payload.url);
  const storagePath = normalizeString(payload.storagePath);

  if (storagePath) {
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath) as unknown as {
      getMetadata?: () => Promise<
        [
          {
            metadata?: Record<string, string | undefined>;
          },
          unknown,
        ]
      >;
      getSignedUrl?: (options: {
        version: 'v4';
        action: 'read';
        expires: number;
      }) => Promise<[string]>;
    };

    if (typeof file.getMetadata === 'function') {
      try {
        const [metadata] = await file.getMetadata();
        const token = metadata?.metadata?.['firebaseStorageDownloadTokens'];

        if (typeof token === 'string' && token) {
          const firstToken = token.split(',')[0];
          return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${firstToken}`;
        }
      } catch {
        // Fall through to signed URL resolution for private objects without token metadata.
      }
    }

    if (typeof file.getSignedUrl === 'function') {
      try {
        const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
        const [signedUrl] = await getSignedUrlWithTimeout(
          () =>
            file.getSignedUrl?.({ version: 'v4', action: 'read', expires: expiresAt }) ??
            Promise.reject(new Error('Signed URL support unavailable'))
        );
        return signedUrl;
      } catch {
        // Fall back to the stored URL when signing is unavailable.
      }
    }
  }

  return directUrl ?? null;
}

async function resolveDocumentAccessState(
  db: Firestore,
  userId: string
): Promise<{
  readonly teamIds: readonly string[];
  readonly grantedAccessKeys: readonly string[];
}> {
  const accessContext = await resolveFileAccessContext(db, userId);
  return {
    teamIds: accessContext.teamIds,
    grantedAccessKeys: buildGrantedAccessKeys(accessContext),
  };
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

function buildManagedPayload(params: {
  readonly content?: string;
  readonly metadata?: Record<string, unknown>;
  readonly sourceFile?: z.infer<typeof SourceFileInputSchema>;
  readonly existingPayload?: unknown;
}): Record<string, unknown> {
  const basePayload = isRecord(params.existingPayload) ? { ...params.existingPayload } : {};
  const existingContent = isRecord(basePayload['content'])
    ? ({ ...basePayload['content'] } as Record<string, unknown>)
    : {};
  const content = normalizeString(params.content);
  const sourceFile = params.sourceFile;

  return pruneUndefinedDeep({
    ...basePayload,
    ...(sourceFile
      ? {
          asset: {
            mimeType: sourceFile.mimeType.trim().toLowerCase(),
            kind: sourceFile.kind ?? inferTeamFileKind(sourceFile.mimeType, sourceFile.fileName),
            origin: sourceFile.origin ?? 'agent_chat_input',
            sizeBytes: sourceFile.sizeBytes ?? 0,
            url: sourceFile.url ?? '',
            storagePath: sourceFile.storagePath,
            thumbnailUrl: sourceFile.thumbnailUrl,
          } satisfies UniversalBinaryFilePayload,
        }
      : {}),
    ...(content || params.metadata
      ? {
          content: {
            ...existingContent,
            ...(content ? { text: content, format: 'markdown' } : {}),
            ...(params.metadata ? { data: params.metadata } : {}),
          },
        }
      : {}),
  });
}

function inferTeamFileKind(mimeType: string, fileName?: string): TeamFileKind {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const normalizedFileName = fileName?.trim().toLowerCase() ?? '';

  if (normalizedMimeType.startsWith('image/')) return 'image';
  if (normalizedMimeType.startsWith('video/')) return 'video';
  if (normalizedMimeType === 'application/pdf' || normalizedFileName.endsWith('.pdf')) return 'pdf';
  if (normalizedMimeType.includes('csv') || normalizedFileName.endsWith('.csv')) return 'csv';
  if (
    normalizedMimeType.includes('word') ||
    normalizedMimeType.includes('document') ||
    normalizedMimeType.includes('rtf') ||
    /\.(docx?|rtf|txt|md)$/i.test(normalizedFileName)
  ) {
    return 'doc';
  }

  return 'app';
}

async function saveManagedUniversalDocument(
  db: Firestore,
  document: UniversalFileDoc
): Promise<void> {
  const universalDoc = pruneUndefinedDeep(document) as unknown as Record<string, unknown>;
  await db.collection(UNIVERSAL_FILES_COLLECTION).doc(document.id).set(universalDoc);
  scheduleUniversalFileSemanticSync({ db, document });
}

function toManagedUniversalDocument(input: {
  readonly documentId?: string;
  readonly teamId?: string;
  readonly title: string;
  readonly content?: string;
  readonly classification?: ClassificationInput;
  readonly sport?: string;
  readonly summary?: string;
  readonly status?: UniversalFileStatus;
  readonly tags?: readonly string[];
  readonly folderId?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly sourceFile?: z.infer<typeof SourceFileInputSchema>;
  readonly readAccessKeys: readonly string[];
  readonly writeAccessKeys: readonly string[];
  readonly userId: string;
  readonly now: string;
}): UniversalFileDoc<'file'> {
  const classification = normalizeClassificationInput(input.classification);
  const title = input.title.trim();
  const content = normalizeString(input.content);
  const sourceFile = input.sourceFile;
  const summary =
    normalizeString(input.summary) ??
    (content ? truncateText(content, 220) : `Uploaded ${sourceFile?.mimeType ?? 'file'} asset.`);
  const tags = normalizeStringArray(input.tags, true);
  const normalizedSport = normalizeString(input.sport)?.toLowerCase();

  return {
    id: buildDocumentId({
      documentId: input.documentId,
      teamId: input.teamId,
      userId: input.userId,
      title,
      classification,
    }),
    teamId: normalizeScopeTeamId(input.teamId),
    type: 'file',
    ...(classification ? { classification } : {}),
    title,
    normalizedTitle: title.toLowerCase(),
    status: input.status ?? 'ready',
    ...(normalizedSport ? { sport: normalizedSport } : {}),
    ...(summary ? { summary } : {}),
    ...(tags ? { tags } : {}),
    ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
    ownerUserId: input.userId,
    createdByUserId: input.userId,
    updatedByUserId: input.userId,
    readAccessKeys: input.readAccessKeys,
    writeAccessKeys: input.writeAccessKeys,
    semanticSync: { status: 'pending' },
    payloadKind: 'native',
    payload: buildManagedPayload({
      content,
      metadata: input.metadata,
      sourceFile,
    }),
    createdAt: input.now,
    updatedAt: input.now,
  } as UniversalFileDoc<'file'>;
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
    'Create a managed personal or team-scoped Files item with freeform text content, or save an uploaded source file via sourceFile so it can be inspected/enriched from the Files library.';

  readonly parameters = CreateUniversalTeamDocumentInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = CreateUniversalTeamDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const payload = parsed.data;
    const accessState = await resolveDocumentAccessState(this.db, userId);
    const requestedTeamId = normalizeScopeTeamId(payload.teamId);
    let effectiveTeamId = requestedTeamId;

    if (payload.folderId) {
      const targetFolder = await loadTeamFileFolder(this.db, payload.folderId);
      if (!targetFolder) {
        return { success: false, error: `Folder ${payload.folderId} not found.` };
      }
      if (
        !canAccessFolderByGrantedKeys(targetFolder, userId, accessState.grantedAccessKeys, 'write')
      ) {
        return {
          success: false,
          error: 'Not authorized to create a file inside the selected folder.',
        };
      }

      const folderTeamId = normalizeScopeTeamId(targetFolder.teamId);
      if (effectiveTeamId && effectiveTeamId !== folderTeamId) {
        return {
          success: false,
          error: 'Requested team scope does not match the selected folder scope.',
        };
      }

      effectiveTeamId = folderTeamId;
    } else if (effectiveTeamId && !accessState.teamIds.includes(effectiveTeamId)) {
      return {
        success: false,
        error: 'Not authorized to create a root document in that team scope.',
      };
    }

    const accessLists = effectiveTeamId
      ? createOwnerScopedAccessLists({ ownerUserId: userId, teamId: effectiveTeamId })
      : createOwnerPrivateAccessLists({ ownerUserId: userId });

    const now = new Date().toISOString();
    const document = toManagedUniversalDocument({
      ...payload,
      teamId: effectiveTeamId,
      readAccessKeys: accessLists.readAccessKeys,
      writeAccessKeys: accessLists.writeAccessKeys,
      userId,
      now,
    });

    await saveManagedUniversalDocument(this.db, document);
    const universalDocument = await loadUniversalDocument(this.db, document.id);

    return {
      success: true,
      markdown: `Created Files document **${document.title}**.`,
      data: {
        document: universalDocument ?? document,
        summary: summarizeUniversalDocument(universalDocument ?? document),
      },
    };
  }
}

export class ListUniversalTeamDocumentsTool extends BaseTool {
  readonly name = 'list_universal_team_documents';
  readonly description =
    'List or search inspectable personal or team-scoped artifacts from UniversalFiles. Search-style calls use semantic retrieval first, then fall back to standard filtering when needed. Results may include managed documents, pointer-backed uploads, and film reviews; check `editableViaUniversalDocumentTool` before planning edits.';

  readonly parameters = ListUniversalTeamDocumentsInputSchema;
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
    const parsed = ListUniversalTeamDocumentsInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const payload = parsed.data;
    const accessState = await resolveDocumentAccessState(this.db, context.userId);
    const teamId = normalizeScopeTeamId(payload.teamId);

    const limit = payload.limit ?? 25;
    const normalizedSport = normalizeText(payload.sport);
    const normalizedQuery = normalizeText(payload.query);
    const normalizedSemanticQuery = normalizeText(payload.semanticQuery);
    const normalizedClassification = normalizeText(payload.classification);
    const normalizedRoute = normalizeText(payload.route);
    const normalizedLabel = normalizeText(payload.label);
    const semanticSearchQuery =
      normalizedSemanticQuery ??
      normalizedQuery ??
      buildSemanticDiscoveryQuery([normalizedClassification, normalizedRoute, normalizedLabel]);
    const isMetadataOnlySemanticDiscovery =
      !!semanticSearchQuery && !normalizedSemanticQuery && !normalizedQuery;
    const normalizedKeywordFilter = normalizedSemanticQuery ? normalizedQuery : undefined;
    const semanticClassificationFilter = isMetadataOnlySemanticDiscovery
      ? undefined
      : normalizedClassification;
    const semanticRouteFilter = isMetadataOnlySemanticDiscovery ? undefined : normalizedRoute;
    const semanticLabelFilter = isMetadataOnlySemanticDiscovery ? undefined : normalizedLabel;
    const includeArchived = payload.includeArchived === true;

    if (semanticSearchQuery) {
      const semanticService = new UniversalFileSemanticService(this.db);
      const semanticResults = await semanticService.search(
        { teamId, userId: context.userId },
        semanticSearchQuery,
        {
          topK: limit,
          ...(semanticClassificationFilter ? { classification: semanticClassificationFilter } : {}),
          ...(semanticRouteFilter ? { route: semanticRouteFilter } : {}),
          ...(semanticLabelFilter ? { label: semanticLabelFilter } : {}),
          includeArchived,
        }
      );

      if (semanticResults.length === 0 && normalizedSemanticQuery) {
        return {
          success: true,
          markdown: 'No Files documents matched the semantic search query.',
          data: {
            documents: [],
            semanticResults,
          },
        };
      }

      if (semanticResults.length > 0) {
        const snapshot = await this.db.getAll(
          ...semanticResults.map((result) =>
            this.db.collection(UNIVERSAL_FILES_COLLECTION).doc(result.fileId)
          )
        );
        const byId = new Map(
          snapshot
            .filter((doc) => doc.exists)
            .map((doc) => toUniversalDocument(doc.id, doc.data() ?? {}))
            .map((document) => [document.id, document] as const)
        );

        const summaries = semanticResults
          .flatMap((result) => {
            const document = byId.get(result.fileId);
            if (!document) {
              return [];
            }

            if (normalizeScopeTeamId(document.teamId) !== teamId) {
              return [];
            }

            if (
              !canAccessDocumentByGrantedKeys(
                document,
                context.userId,
                accessState.grantedAccessKeys,
                'read'
              )
            ) {
              return [];
            }

            if (
              !matchesDocumentFilters(document, {
                includeArchived,
                normalizedSport,
                normalizedQuery: normalizedKeywordFilter,
                normalizedClassification: semanticClassificationFilter,
                normalizedRoute: semanticRouteFilter,
                normalizedLabel: semanticLabelFilter,
              })
            ) {
              return [];
            }

            return [
              {
                ...summarizeUniversalDocument(document),
                semanticScore: result.score,
                semanticExcerpt: result.excerpt,
              },
            ];
          })
          .slice(0, limit);

        if (summaries.length > 0 || normalizedSemanticQuery) {
          return {
            success: true,
            markdown:
              summaries.length === 0
                ? 'No Files documents matched the semantic search query.'
                : `Found ${summaries.length} Files document(s) by semantic search.`,
            data: {
              documents: summaries,
              semanticResults,
            },
          };
        }
      }

      // Query-based searches try semantic retrieval first, then fall back to
      // the original filter path so exact matches still surface when the
      // semantic index has no relevant hits.
    }

    const documents = await listDocumentsForTeamWithFilters({
      db: this.db,
      userId: context.userId,
      teamId,
      includeArchived,
      normalizedSport,
      normalizedQuery,
      normalizedClassification,
      normalizedRoute,
      normalizedLabel,
      limit,
    });

    const accessibleDocuments = documents.filter((document) =>
      canAccessDocumentByGrantedKeys(
        document,
        context.userId,
        accessState.grantedAccessKeys,
        'read'
      )
    );

    return {
      success: true,
      markdown:
        accessibleDocuments.length === 0
          ? 'No universal documents matched the requested filters.'
          : `Found ${accessibleDocuments.length} universal document(s).`,
      data: {
        documents: accessibleDocuments.map((document) => summarizeUniversalDocument(document)),
      },
    };
  }
}

export class GetUniversalTeamDocumentTool extends BaseTool {
  readonly name = 'get_universal_team_document';
  readonly description =
    'Load an inspectable saved Files item. ' +
    'The returned summary marks whether the artifact is editable through update_universal_team_document; pointer-backed uploads and film reviews are inspect-only on this surface.';

  readonly parameters = GetUniversalTeamDocumentInputSchema;
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
    const parsed = GetUniversalTeamDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    if (!context?.userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const documentId = normalizeUniversalDocumentId(parsed.data.documentId);
    const universalDocument = await loadUniversalDocument(this.db, documentId);
    if (!universalDocument) {
      return { success: false, error: `Universal document ${documentId} not found.` };
    }

    if (!isInspectableUniversalArtifact(universalDocument)) {
      return {
        success: false,
        error: `Universal document ${documentId} is not an inspectable universal artifact managed by this tool.`,
      };
    }

    const accessState = await resolveDocumentAccessState(this.db, context.userId);
    if (
      !canAccessDocumentByGrantedKeys(
        universalDocument,
        context.userId,
        accessState.grantedAccessKeys,
        'read'
      )
    ) {
      return {
        success: false,
        error: 'Not authorized to access this universal document.',
      };
    }

    const pointerInspection = await resolveInspectablePointerAsset(this.db, universalDocument);
    const nativeInspection = pointerInspection
      ? null
      : await resolveInspectableNativeAsset(universalDocument);
    const inspection = pointerInspection ?? nativeInspection;
    const summary = summarizeUniversalDocument(universalDocument);

    return {
      success: true,
      markdown: `Loaded Files item **${universalDocument.title}**.`,
      data: {
        document: universalDocument,
        summary: {
          ...summary,
          ...(inspection ? { inspection } : {}),
        },
        ...(inspection ? { inspection } : {}),
      },
    };
  }
}

export class UpdateUniversalTeamDocumentTool extends UniversalTeamDocumentMutationTool {
  readonly name = 'update_universal_team_document';
  readonly description =
    'Update a Team Files record through the universal-document surface. Managed documents support content edits; uploaded or pointer-backed Team Files artifacts support same-record artifact metadata updates such as summary, notes, and tags.';

  readonly parameters = UpdateUniversalTeamDocumentInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = UpdateUniversalTeamDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const { documentId, patch } = parsed.data;
    const existing = await loadUniversalDocument(this.db, documentId);
    if (!existing) {
      return { success: false, error: `Universal document ${documentId} not found.` };
    }

    if (!isInspectableUniversalArtifact(existing)) {
      return {
        success: false,
        error: `Universal document ${documentId} is not a raw universal document managed by this tool.`,
      };
    }

    const hasManagedDocumentPatch = [
      'title',
      'content',
      'classification',
      'sport',
      'summary',
      'status',
      'tags',
      'folderId',
      'metadata',
    ].some((key) => hasOwnPatch(patch, key));
    const hasArtifactMetadataPatch = [
      'artifactClassification',
      'artifactSummary',
      'artifactNotes',
      'artifactTags',
      'artifactGeneratedAt',
      'artifactStatus',
    ].some((key) => hasOwnPatch(patch, key));

    const hasAccessPatch =
      hasOwnPatch(patch, 'readAccessKeys') || hasOwnPatch(patch, 'writeAccessKeys');
    const ownerUserId = resolveDocumentOwnerUserId(existing);
    if (hasAccessPatch && !ownerUserId) {
      return {
        success: false,
        error: 'Cannot update direct file sharing because this file has no owner recorded.',
      };
    }
    const accessState = await resolveDocumentAccessState(this.db, userId);
    if (
      hasAccessPatch &&
      !isDocumentShareUpdateAllowed({
        userId,
        ownerUserId: ownerUserId as string,
      })
    ) {
      return {
        success: false,
        error: 'Only the file owner can update direct file sharing.',
      };
    }
    if (!canAccessDocumentByGrantedKeys(existing, userId, accessState.grantedAccessKeys, 'write')) {
      return {
        success: false,
        error: 'Not authorized to edit this file. Read-only access cannot make changes.',
      };
    }

    if (hasOwnPatch(patch, 'folderId') && typeof patch.folderId === 'string') {
      const targetFolder = await loadTeamFileFolder(this.db, patch.folderId);
      if (!targetFolder) {
        return { success: false, error: `Folder ${patch.folderId} not found.` };
      }
      if (
        !canAccessFolderByGrantedKeys(targetFolder, userId, accessState.grantedAccessKeys, 'write')
      ) {
        return {
          success: false,
          error: 'Not authorized to move this file into the selected folder.',
        };
      }

      if (normalizeScopeTeamId(targetFolder.teamId) !== normalizeScopeTeamId(existing.teamId)) {
        return {
          success: false,
          error: 'Folder scope does not match the file scope.',
        };
      }
    }

    if (!isManagedUniversalDocument(existing)) {
      if (hasManagedDocumentPatch) {
        return {
          success: false,
          error:
            'This Team Files artifact only supports same-record artifact metadata updates. Use artifactSummary, artifactNotes, artifactTags, artifactStatus, artifactGeneratedAt, or artifactClassification, or create a separate managed document for standalone content.',
        };
      }

      if (!hasArtifactMetadataPatch && !hasAccessPatch) {
        return {
          success: false,
          error:
            'No supported artifact metadata fields were provided for this Team Files artifact.',
        };
      }

      const nextAccess = hasAccessPatch
        ? resolveDocumentAccessLists({
            ownerUserId: ownerUserId as string,
            readAccessKeys: patch.readAccessKeys ??
              existing.readAccessKeys ?? [toUserAccessKey(ownerUserId as string)],
            writeAccessKeys: patch.writeAccessKeys ??
              existing.writeAccessKeys ?? [toUserAccessKey(ownerUserId as string)],
          })
        : {
            readAccessKeys: existing.readAccessKeys,
            writeAccessKeys: existing.writeAccessKeys,
          };

      const updatedArtifact = pruneUndefinedDeep({
        ...(shouldPreserveExistingPageByPageArtifactNotes({
          existingRecord: existing as unknown as Record<string, unknown>,
          nextArtifactNotes: normalizeString(patch.artifactNotes),
          patchTouchedArtifactNotes: hasOwnPatch(patch, 'artifactNotes'),
        })
          ? {
              artifactNotes: normalizeString(
                (existing as unknown as Record<string, unknown>)['artifactNotes']
              ),
            }
          : {}),
        ...existing,
        ...(hasOwnPatch(patch, 'artifactClassification')
          ? {
              artifactClassification: normalizeClassificationInput(
                patch.artifactClassification ?? undefined
              ),
            }
          : {}),
        ...(hasOwnPatch(patch, 'artifactSummary')
          ? { artifactSummary: normalizeString(patch.artifactSummary) }
          : {}),
        ...(hasOwnPatch(patch, 'artifactNotes')
          ? {
              artifactNotes: shouldPreserveExistingPageByPageArtifactNotes({
                existingRecord: existing as unknown as Record<string, unknown>,
                nextArtifactNotes: normalizeString(patch.artifactNotes),
                patchTouchedArtifactNotes: true,
              })
                ? normalizeString((existing as unknown as Record<string, unknown>)['artifactNotes'])
                : normalizeString(patch.artifactNotes),
            }
          : {}),
        ...(hasOwnPatch(patch, 'artifactTags')
          ? { artifactTags: normalizeStringArray(patch.artifactTags, true) }
          : {}),
        ...(hasOwnPatch(patch, 'artifactGeneratedAt')
          ? { artifactGeneratedAt: normalizeString(patch.artifactGeneratedAt) }
          : {}),
        ...(hasOwnPatch(patch, 'artifactStatus')
          ? { artifactStatus: normalizeString(patch.artifactStatus) }
          : {}),
        ...(nextAccess.readAccessKeys ? { readAccessKeys: nextAccess.readAccessKeys } : {}),
        ...(nextAccess.writeAccessKeys ? { writeAccessKeys: nextAccess.writeAccessKeys } : {}),
        updatedByUserId: userId,
        semanticSync: { status: 'pending' },
        updatedAt: new Date().toISOString(),
      }) as UniversalFileDoc;

      await saveManagedUniversalDocument(this.db, updatedArtifact);
      const universalDocument = await loadUniversalDocument(this.db, updatedArtifact.id);

      return {
        success: true,
        markdown: `Updated Files item metadata for **${updatedArtifact.title}**.`,
        data: {
          document: universalDocument ?? updatedArtifact,
          summary: summarizeUniversalDocument(universalDocument ?? updatedArtifact),
        },
      };
    }

    const existingMetadata = getDocumentMetadata(existing);
    const nextMetadata = hasOwnPatch(patch, 'metadata')
      ? patch.metadata === null
        ? undefined
        : patch.metadata
      : existingMetadata;
    const rawNextContent = hasOwnPatch(patch, 'content')
      ? (normalizeString(patch.content) ?? getDocumentText(existing) ?? '')
      : (getDocumentText(existing) ?? '');
    const nextContent = normalizeString(rawNextContent);

    if (!nextContent) {
      return {
        success: false,
        error: 'Universal documents require non-empty content.',
      };
    }

    const nextClassification = hasOwnPatch(patch, 'classification')
      ? normalizeClassificationInput(patch.classification ?? undefined)
      : existing.classification;
    const nextTitle = normalizeString(patch.title) ?? existing.title;
    const nextSport = hasOwnPatch(patch, 'sport')
      ? normalizeString(patch.sport)?.toLowerCase()
      : existing.sport;
    const nextSummary = hasOwnPatch(patch, 'summary')
      ? (normalizeString(patch.summary) ?? truncateText(nextContent, 220))
      : (existing.summary ?? truncateText(nextContent, 220));
    const nextTags = hasOwnPatch(patch, 'tags')
      ? normalizeStringArray(patch.tags, true)
      : existing.tags;
    const nextStatus = hasOwnPatch(patch, 'status')
      ? (resolveUniversalDocumentStatus(patch.status) ?? existing.status)
      : existing.status;
    const existingRecord = existing as unknown as Record<string, unknown>;
    const nextArtifactClassification = hasOwnPatch(patch, 'artifactClassification')
      ? normalizeClassificationInput(patch.artifactClassification ?? undefined)
      : existingRecord['artifactClassification'];
    const nextArtifactSummary = hasOwnPatch(patch, 'artifactSummary')
      ? normalizeString(patch.artifactSummary)
      : normalizeString(existingRecord['artifactSummary']);
    const requestedArtifactNotes = hasOwnPatch(patch, 'artifactNotes')
      ? normalizeString(patch.artifactNotes)
      : undefined;
    const nextArtifactNotes = shouldPreserveExistingPageByPageArtifactNotes({
      existingRecord,
      nextArtifactNotes: requestedArtifactNotes,
      patchTouchedArtifactNotes: hasOwnPatch(patch, 'artifactNotes'),
    })
      ? normalizeString(existingRecord['artifactNotes'])
      : hasOwnPatch(patch, 'artifactNotes')
        ? requestedArtifactNotes
        : normalizeString(existingRecord['artifactNotes']);
    const nextArtifactTags = hasOwnPatch(patch, 'artifactTags')
      ? normalizeStringArray(patch.artifactTags, true)
      : normalizeStringArray(existingRecord['artifactTags'], true);
    const nextArtifactGeneratedAt = hasOwnPatch(patch, 'artifactGeneratedAt')
      ? normalizeString(patch.artifactGeneratedAt)
      : normalizeString(existingRecord['artifactGeneratedAt']);
    const nextArtifactStatus = hasOwnPatch(patch, 'artifactStatus')
      ? normalizeString(patch.artifactStatus)
      : normalizeString(existingRecord['artifactStatus']);
    const nextFolderId = hasOwnPatch(patch, 'folderId') ? patch.folderId : existing.folderId;
    const nextAccess = hasAccessPatch
      ? resolveDocumentAccessLists({
          ownerUserId: ownerUserId as string,
          readAccessKeys: patch.readAccessKeys ??
            existing.readAccessKeys ?? [toUserAccessKey(ownerUserId as string)],
          writeAccessKeys: patch.writeAccessKeys ??
            existing.writeAccessKeys ?? [toUserAccessKey(ownerUserId as string)],
        })
      : {
          readAccessKeys: existing.readAccessKeys,
          writeAccessKeys: existing.writeAccessKeys,
        };
    const now = new Date().toISOString();

    const updated: UniversalFileDoc<'file'> = {
      ...existing,
      ...(nextClassification ? { classification: nextClassification } : {}),
      title: nextTitle,
      normalizedTitle: nextTitle.trim().toLowerCase(),
      status: nextStatus,
      ...(nextSport ? { sport: nextSport } : {}),
      ...(nextSummary ? { summary: nextSummary } : {}),
      ...(nextTags ? { tags: nextTags } : {}),
      ...(nextArtifactClassification !== undefined
        ? { artifactClassification: nextArtifactClassification }
        : {}),
      ...(nextArtifactSummary ? { artifactSummary: nextArtifactSummary } : {}),
      ...(nextArtifactNotes ? { artifactNotes: nextArtifactNotes } : {}),
      ...(nextArtifactTags ? { artifactTags: nextArtifactTags } : {}),
      ...(nextArtifactGeneratedAt ? { artifactGeneratedAt: nextArtifactGeneratedAt } : {}),
      ...(nextArtifactStatus ? { artifactStatus: nextArtifactStatus } : {}),
      folderId: nextFolderId,
      ...(nextAccess.readAccessKeys ? { readAccessKeys: nextAccess.readAccessKeys } : {}),
      ...(nextAccess.writeAccessKeys ? { writeAccessKeys: nextAccess.writeAccessKeys } : {}),
      updatedByUserId: userId,
      semanticSync: { status: 'pending' },
      payloadKind: 'native',
      payload: buildManagedPayload({
        content: nextContent,
        ...(nextMetadata ? { metadata: nextMetadata } : {}),
        existingPayload: existing.payload,
      }),
      updatedAt: now,
    } as UniversalFileDoc<'file'>;

    await saveManagedUniversalDocument(this.db, updated);
    const universalDocument = await loadUniversalDocument(this.db, updated.id);

    return {
      success: true,
      markdown: `Updated Files document **${updated.title}**.`,
      data: {
        document: universalDocument ?? updated,
        summary: summarizeUniversalDocument(universalDocument ?? updated),
      },
    };
  }
}

export class DeleteUniversalTeamDocumentTool extends UniversalTeamDocumentMutationTool {
  readonly name = 'delete_universal_team_document';
  readonly description =
    'Archive a managed Team Files document through the universal-document surface.';

  readonly parameters = DeleteUniversalTeamDocumentInputSchema;
  override readonly allowedAgents = ['*'] as const;
  readonly isMutation = true;
  readonly category = 'database' as const;
  readonly entityGroup = 'user_tools' as const;

  async execute(
    input: Record<string, unknown>,
    context?: ToolExecutionContext
  ): Promise<ToolResult> {
    const parsed = DeleteUniversalTeamDocumentInputSchema.safeParse(input);
    if (!parsed.success) {
      return this.zodError(parsed.error);
    }

    void parsed.data.reason;
    const userId = this.requireUserId(context);
    if (!userId) {
      return { success: false, error: 'Authenticated tool context is required.' };
    }

    const existing = await loadUniversalDocument(this.db, parsed.data.documentId);
    if (!existing) {
      return {
        success: false,
        error: `Universal document ${parsed.data.documentId} not found.`,
      };
    }

    if (!isManagedUniversalDocument(existing)) {
      return {
        success: false,
        error: `Universal document ${parsed.data.documentId} is not a raw universal document managed by this tool.`,
      };
    }

    const accessState = await resolveDocumentAccessState(this.db, userId);
    if (!canAccessDocumentByGrantedKeys(existing, userId, accessState.grantedAccessKeys, 'write')) {
      return {
        success: false,
        error: 'Not authorized to archive this file. Read-only access cannot make changes.',
      };
    }

    const archived: UniversalFileDoc<'file'> = {
      ...existing,
      status: 'archived',
      updatedByUserId: userId,
      semanticSync: { status: 'pending' },
      updatedAt: new Date().toISOString(),
    } as UniversalFileDoc<'file'>;

    await saveManagedUniversalDocument(this.db, archived);
    const universalDocument = await loadUniversalDocument(this.db, archived.id);

    return {
      success: true,
      markdown: `Archived universal team document **${archived.title}**.`,
      data: {
        archived: true,
        document: universalDocument ?? archived,
        summary: summarizeUniversalDocument(universalDocument ?? archived),
      },
    };
  }
}
