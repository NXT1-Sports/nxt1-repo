import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { z } from 'zod';
import type {
  AgentXAttachment,
  TeamFileFolderDoc,
  TeamFileOrigin,
  TeamFilmReviewAnnotation,
  TeamFilmReviewBreakdownSource,
  TeamFilmReviewDoc,
  TeamFilmReviewDownloadExport,
  TeamFilmReviewDownloadExportStatus,
  TeamFilmReviewPlaySegment,
  TeamFilmReviewSourceVideo,
  TeamFilmReviewTagCategory,
  TeamFilmReviewTimelineTag,
  TeamFilmReviewUploadMode,
  UniversalBinaryFilePayload,
  UniversalFileDoc,
  UniversalFilmReviewPayload,
  UniversalNativeFileDoc,
} from '@nxt1/core';
import {
  getTeamFilmReviewRevision,
  getUniversalFileClassification,
  getUniversalBinaryFilePayload,
  getUniversalFilmReviewPayload,
  getUniversalPrimaryClassification,
  isUniversalBinaryFilePayload,
  TeamFilmReviewSourceBreakdownPatchError,
  UNIVERSAL_FILES_COLLECTION,
} from '@nxt1/core';
import { appGuard } from '../../middleware/auth/auth.middleware.js';
import { uploadRateLimit } from '../../middleware/rate-limit/rate-limit.middleware.js';
import { logger } from '../../utils/logger.js';
import {
  buildAclTeamKey,
  buildAclTeamManagerKey,
  buildDefaultTeamScopedAcl,
  canManageTeamScopedResourceWithAcl,
  copyAgentFileAclFromFolder,
  resolveTeamScopedAccessContext,
} from '../../services/team/team-intel-permissions.js';
import { upsertTeamFileFromAttachment } from '../../services/team/team-files-index.service.js';
import { RosterEntryService } from '../../services/team/roster-entry.service.js';
import { getSignedUrlWithTimeout } from '../../utils/gcs-signed-url.js';
import { chatService, agentSingleFileUpload } from './shared.js';
import { AgentMediaLifecycleService } from '../../modules/agent/tools/media/agent-media-lifecycle.service.js';
import {
  buildGrantedAccessKeys,
  canAccessByKeys,
  createOwnerPrivateAccessLists,
  createOwnerScopedAccessLists,
  resolveFileAccessContext,
  toOrganizationAccessKey,
  toTeamAccessKey,
  toUserAccessKey,
} from '../../services/team/file-access-keys.service.js';
import {
  deleteUniversalFileSemanticIndex,
  scheduleUniversalFileSemanticSync,
  UniversalFileSemanticService,
} from '../../services/team/universal-file-semantic.service.js';
import {
  fetchCloudflareDownloadStatus,
  requestCloudflareVideoDownloadRender,
} from '../core/upload/shared.js';
import { refreshAttachmentUrl } from './threads.routes.js';
import { parseHudlBreakdownBuffer } from '../../services/team/hudl-breakdown-import.service.js';
import { notifyDirectFileShare } from '../../services/communications/file-share-notifications.js';
import { propagateInheritedFolderShareAccess } from '../../services/team/folder-share-propagation.service.js';
import {
  mutateUniversalFileDocumentAtomically,
  removeFilmReviewProjectionFromUniversalFileData,
  updateUniversalFileFilmReviewAtomically,
} from '../../services/team/universal-files-sync.service.js';

const router = Router();
const TEAM_FILE_FOLDERS_COLLECTION = 'TeamFileFolders' as const;
const ATHLETE_STARTER_FOLDERS = ['Film', 'Training', 'Highlights', 'Documents'] as const;
const COACH_DIRECTOR_STARTER_FOLDERS = ['Playbook', 'Film', 'Reports'] as const;
const FILM_REVIEW_DOWNLOAD_EXPORTS_PREFIX = 'agent-x/film-review-exports';
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;
const FILM_REVIEW_DOWNLOAD_EXPORT_STALE_MS = 15 * 60 * 1000;
const FILM_REVIEW_DOWNLOAD_EXPORT_PROGRESS_THROTTLE_MS = 1500;
const activeFilmReviewDownloadExportJobs = new Set<string>();

type SignedUrlBucket = {
  file(path: string): {
    getSignedUrl(options: {
      version: 'v4';
      action: 'read';
      expires: number;
      responseDisposition?: string;
      responseType?: string;
    }): Promise<[string]>;
    createWriteStream(options: {
      resumable: boolean;
      metadata: {
        contentType: string;
        cacheControl: string;
        metadata: Record<string, string>;
      };
    }): NodeJS.WritableStream;
    download(): Promise<[Buffer]>;
    save(
      data: Buffer,
      options: {
        resumable: boolean;
        validation?: boolean | 'md5' | 'crc32c';
        metadata: {
          contentType: string;
          cacheControl: string;
          metadata: Record<string, string>;
        };
      }
    ): Promise<void>;
  };
};

const TeamFileIndexBodySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  folderId: z.string().trim().min(1).nullable().optional(),
  uploadTarget: z.enum(['file', 'film_review']).optional(),
  attachment: z.object({
    id: z.string().trim().min(1),
    url: z.string().trim().min(1),
    storagePath: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
    type: z.enum(['image', 'video', 'pdf', 'csv', 'doc', 'app']),
    sizeBytes: z.number().nonnegative(),
    cloudflareVideoId: z.string().trim().min(1).optional(),
    cloudflareStatus: z.string().trim().min(1).optional(),
    readyToStream: z.boolean().optional(),
    thumbnailUrl: z.string().trim().min(1).optional(),
    platform: z.string().trim().min(1).optional(),
    profileUrl: z.string().trim().min(1).optional(),
    faviconUrl: z.string().trim().min(1).optional(),
  }),
});

const TeamFilmReviewSourceVideoSchema = z.object({
  id: z.string().trim().min(1),
  order: z.number().int().nonnegative(),
  fileId: z.string().trim().min(1).nullable().optional(),
  videoUrl: z.string().trim().min(1),
  cameraAngle: z.enum(['wide', 'tight', 'unknown']).optional(),
  angleGroupId: z.string().trim().min(1).max(120).optional(),
  angleDetectionSource: z.enum(['filename', 'manual', 'backend', 'unknown']).optional(),
  downloadUrl: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  storagePath: z.string().trim().min(1).optional(),
  cloudflareVideoId: z.string().trim().min(1).optional(),
  cloudflareStatus: z.string().trim().min(1).optional(),
  readyToStream: z.boolean().optional(),
  thumbnailUrl: z.string().trim().min(1).optional(),
  durationSec: z.number().nonnegative().optional(),
});

const TeamFilePromoteChatAttachmentBodySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  folderId: z.string().trim().min(1).nullable().optional(),
  messageId: z.string().trim().min(1),
  attachmentId: z.string().trim().min(1),
});

const TeamFileFolderCreateBodySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80),
  parentId: z.string().trim().min(1).nullable().optional(),
});

const TeamFileFolderUpdateBodySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

const TeamFileUpdateBodySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  folderId: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  summary: z.string().max(5000).optional(),
  classificationPrimary: z.string().max(120).optional(),
  textContent: z.string().max(200000).optional(),
  rawData: z.record(z.string(), z.unknown()).nullable().optional(),
});

const TeamFileShareBodySchema = z.object({
  action: z.enum(['add', 'remove']).default('add'),
  permission: z.enum(['read', 'write']).default('read'),
  principalType: z.enum(['user', 'team', 'organization']),
  principalId: z.string().trim().min(1),
});

const TeamFileFilmReviewCreateBodySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1),
  title: z.string().trim().min(1),
  videoUrl: z.string().trim().min(1),
  uploadMode: z.enum(['single_video', 'batch_clips', 'full_footage']).optional(),
  storagePath: z.string().trim().min(1).optional(),
  cloudflareVideoId: z.string().trim().min(1).optional(),
  cloudflareStatus: z.string().trim().min(1).optional(),
  readyToStream: z.boolean().optional(),
  thumbnailUrl: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().min(1).optional(),
  durationSec: z.number().nonnegative().optional(),
  sources: z
    .array(TeamFilmReviewSourceVideoSchema)
    .min(1)
    .superRefine(validateFilmReviewSourceAngleGroups)
    .optional(),
});

const TeamFilmReviewUploadCreateBodySchema = TeamFileFilmReviewCreateBodySchema.extend({
  attachment: TeamFileIndexBodySchema.shape.attachment,
  sources: z
    .array(TeamFilmReviewSourceVideoSchema)
    .min(1)
    .superRefine(validateFilmReviewSourceAngleGroups)
    .optional(),
});

function validateFilmReviewSourceAngleGroups(
  sources: readonly z.infer<typeof TeamFilmReviewSourceVideoSchema>[],
  context: z.RefinementCtx
): void {
  const seen = new Set<string>();
  sources.forEach((source, index) => {
    const angleGroupId = source.angleGroupId?.trim();
    const cameraAngle = source.cameraAngle;
    if (!angleGroupId || (cameraAngle !== 'wide' && cameraAngle !== 'tight')) return;

    const key = `${angleGroupId}:${cameraAngle}`;
    if (!seen.has(key)) {
      seen.add(key);
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [index, 'cameraAngle'],
      message: `Duplicate ${cameraAngle} camera angle in group ${angleGroupId}`,
    });
  });
}

const TeamFileFilmReviewUpdateBodySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  title: z.string().trim().min(1).optional(),
  sport: z.string().trim().min(1).optional(),
  playlistId: z.string().trim().min(1).nullable().optional(),
  playlistName: z.string().trim().min(1).nullable().optional(),
  timeline: z.array(z.record(z.string(), z.unknown())).optional(),
});

const TeamFileFilmReviewAnnotationCreateBodySchema = z.object({
  teamId: z.string().trim().min(1),
  expectedRevision: z.number().int().nonnegative().optional(),
  reviewId: z.string().trim().min(1).optional(),
  note: z.string().trim().min(1),
  atSec: z.number().finite().nonnegative(),
  color: z.string().trim().min(1).optional(),
});

const TeamFileSemanticSearchQuerySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1),
  classification: z.string().trim().min(1).optional(),
  route: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  includeArchived: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const TeamUniversalFilesListQuerySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  classification: z.string().trim().min(1).optional(),
  route: z.string().trim().min(1).optional(),
  label: z.string().trim().min(1).optional(),
});

const TeamUniversalFileQuerySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  disposition: z.enum(['attachment', 'inline']).optional(),
});

const TeamFileShareCandidatesQuerySchema = z.object({
  teamId: z.string().trim().min(1).optional(),
  organizationId: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

function getAuthUser(
  req: Request
): { uid: string; displayName?: string; photoURL?: string } | null {
  const user = (
    req as Request & { user?: { uid?: string; displayName?: string; photoURL?: string } }
  ).user;
  return user?.uid
    ? {
        uid: user.uid,
        ...(typeof user.displayName === 'string' ? { displayName: user.displayName } : {}),
        ...(typeof user.photoURL === 'string' ? { photoURL: user.photoURL } : {}),
      }
    : null;
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

function normalizeQueryString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

type AgentFileShareCandidateRecord = {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly email: string | null;
  readonly sourceScopes: readonly ('team' | 'organization')[];
  readonly teamIds: readonly string[];
  readonly organizationIds: readonly string[];
};

function toShareCandidateDisplayName(member: {
  readonly displayName?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly email?: string;
  readonly userId: string;
}): string {
  const cachedDisplayName = normalizeQueryString(member.displayName);
  if (cachedDisplayName) {
    return cachedDisplayName;
  }

  const joinedName = [member.firstName, member.lastName]
    .map((value) => normalizeQueryString(value) ?? '')
    .filter((value) => value.length > 0)
    .join(' ')
    .trim();
  if (joinedName.length > 0) {
    return joinedName;
  }

  return normalizeQueryString(member.email) ?? member.userId;
}

function matchesShareCandidateQuery(
  candidate: AgentFileShareCandidateRecord,
  query: string | undefined
): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = `${candidate.displayName} ${candidate.email ?? ''}`.toLowerCase();
  return haystack.includes(normalizedQuery);
}

function getFileFolderAcl(data: Record<string, unknown>): TeamFileFolderDoc['acl'] | null {
  const acl = data['acl'];
  return acl && typeof acl === 'object' ? (acl as TeamFileFolderDoc['acl']) : null;
}

function getUniversalFileAcl(data: Record<string, unknown>): UniversalFileDoc['acl'] | null {
  const acl = data['acl'];
  return acl && typeof acl === 'object' ? (acl as UniversalFileDoc['acl']) : null;
}

function getStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function getAclReadAccessKeys(
  acl: TeamFileFolderDoc['acl'] | UniversalFileDoc['acl'] | null | undefined
): readonly string[] {
  if (!acl) {
    return [];
  }

  const accessKeys = acl.grants.flatMap((grant) => {
    switch (grant.principalType) {
      case 'user':
        return [toUserAccessKey(grant.principalId)];
      case 'team':
        return [toTeamAccessKey(grant.principalId)];
      case 'organization':
        return [toOrganizationAccessKey(grant.principalId)];
      default:
        return [];
    }
  });

  return [...new Set(accessKeys)];
}

function getLegacyReadAccessKeys(data: Record<string, unknown>): readonly string[] {
  const ownerUserId =
    normalizeQueryString(data['ownerUserId']) ?? normalizeQueryString(data['createdByUserId']);
  const teamId = normalizeQueryString(data['teamId']);
  const organizationId = normalizeQueryString(data['organizationId']);

  if (ownerUserId) {
    return createOwnerScopedAccessLists({
      ownerUserId,
      teamId: teamId ?? null,
      organizationId: organizationId ?? null,
    }).readAccessKeys;
  }

  return [
    ...(teamId ? [toTeamAccessKey(teamId)] : []),
    ...(organizationId ? [toOrganizationAccessKey(organizationId)] : []),
  ];
}

function getLegacyWriteAccessKeys(data: Record<string, unknown>): readonly string[] {
  const ownerUserId =
    normalizeQueryString(data['ownerUserId']) ?? normalizeQueryString(data['createdByUserId']);
  const teamId = normalizeQueryString(data['teamId']);
  const organizationId = normalizeQueryString(data['organizationId']);

  if (!ownerUserId) {
    return [];
  }

  return createOwnerScopedAccessLists({
    ownerUserId,
    teamId: teamId ?? null,
    organizationId: organizationId ?? null,
  }).writeAccessKeys;
}

function canReadAccessControlledRecord(
  data: Record<string, unknown>,
  options: {
    readonly grantedAccessKeys: readonly string[];
    readonly acl: TeamFileFolderDoc['acl'] | UniversalFileDoc['acl'] | null | undefined;
  }
): boolean {
  const explicitAccessKeys = getStringArray(data['readAccessKeys']);
  if (explicitAccessKeys.length > 0) {
    return canAccessByKeys(explicitAccessKeys, options.grantedAccessKeys);
  }

  const aclAccessKeys = getAclReadAccessKeys(options.acl);
  if (aclAccessKeys.length > 0) {
    return canAccessByKeys(aclAccessKeys, options.grantedAccessKeys);
  }

  const legacyAccessKeys = getLegacyReadAccessKeys(data);
  if (legacyAccessKeys.length > 0) {
    return canAccessByKeys(legacyAccessKeys, options.grantedAccessKeys);
  }

  return false;
}

async function canWriteAccessControlledRecord(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly authUid: string;
  readonly teamId?: string | null;
  readonly data: Record<string, unknown>;
  readonly acl: TeamFileFolderDoc['acl'] | UniversalFileDoc['acl'] | null | undefined;
  readonly grantedAccessKeys: readonly string[];
}): Promise<boolean> {
  const explicitAccessKeys = getStringArray(params.data['writeAccessKeys']);
  if (explicitAccessKeys.length > 0) {
    return canAccessByKeys(explicitAccessKeys, params.grantedAccessKeys);
  }

  const legacyAccessKeys = getLegacyWriteAccessKeys(params.data);
  if (legacyAccessKeys.length > 0) {
    return canAccessByKeys(legacyAccessKeys, params.grantedAccessKeys);
  }

  const normalizedTeamId = normalizeOptionalString(params.teamId ?? params.data['teamId']);
  if (!normalizedTeamId) {
    return false;
  }

  const teamDoc = await params.db.collection('Teams').doc(normalizedTeamId).get();
  if (!teamDoc.exists) {
    return false;
  }

  const access = await resolveTeamScopedAccessContext(
    params.db,
    params.authUid,
    normalizedTeamId,
    teamDoc.data() ?? {}
  );
  if (params.acl) {
    return canManageTeamScopedResourceWithAcl(params.acl, access);
  }

  return access.manageKeys.includes(buildAclTeamManagerKey(normalizedTeamId));
}

async function resolveGrantedFileAccessKeys(
  db: NonNullable<Request['firebase']>['db'],
  authUid: string
): Promise<readonly string[]> {
  return buildGrantedAccessKeys(await resolveFileAccessContext(db, authUid));
}

function matchesUniversalFileClassificationFilters(
  file: UniversalFileDoc,
  filters: {
    readonly classification?: string | null;
    readonly route?: string | null;
    readonly label?: string | null;
  }
): boolean {
  const classificationFilter = normalizeQueryString(filters.classification);
  if (classificationFilter && getUniversalPrimaryClassification(file) !== classificationFilter) {
    return false;
  }

  const routeFilter = normalizeQueryString(filters.route);
  if (
    routeFilter &&
    normalizeQueryString(getUniversalFileClassification(file)?.route) !== routeFilter
  ) {
    return false;
  }

  const labelFilter = normalizeQueryString(filters.label);
  if (labelFilter) {
    const labels = getUniversalFileClassification(file)?.labels ?? [];
    if (!labels.includes(labelFilter)) {
      return false;
    }
  }

  return true;
}

async function refreshFileUrl(
  bucket: ReturnType<NonNullable<Request['firebase']>['storage']['bucket']>,
  file: Pick<UniversalBinaryFilePayload, 'storagePath' | 'kind' | 'mimeType'> & {
    readonly url?: string;
  },
  options?: {
    readonly allowVideoRefresh?: boolean;
    readonly disposition?: 'attachment' | 'inline';
    readonly fileName?: string;
  }
): Promise<string> {
  if (!file.storagePath || (file.kind === 'video' && !options?.allowVideoRefresh)) {
    return file.url ?? '';
  }

  const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
  const [signedUrl] = await getSignedUrlWithTimeout(() =>
    bucket.file(file.storagePath as string).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
      ...((options?.disposition === 'inline' && file.mimeType === 'application/pdf') ||
      options?.disposition === 'attachment'
        ? {
            responseDisposition:
              options.disposition === 'attachment'
                ? options.fileName
                  ? `attachment; filename="${options.fileName.replace(/"/g, '')}"`
                  : 'attachment'
                : 'inline',
            responseType: file.mimeType,
          }
        : {}),
    })
  );
  return signedUrl;
}

function withUpdatedUniversalNativePayload(
  file: UniversalFileDoc,
  update: (payload: Record<string, unknown>) => Record<string, unknown>
): UniversalFileDoc {
  if (file.type !== 'file' || file.payloadKind === 'pointer') {
    return file;
  }

  return {
    ...file,
    payload: update(file.payload as Record<string, unknown>),
  } as UniversalFileDoc;
}

/** Normalizes storage object paths so semantically identical paths compare equal. */
function normalizeComparableStoragePath(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  return normalized.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

function withRefreshedPrimaryAssetUrl(
  file: UniversalFileDoc,
  refreshedUrl: string
): UniversalFileDoc {
  if (file.type !== 'file' || file.payloadKind === 'pointer') {
    return file;
  }

  const filePayload = getUniversalBinaryFilePayload(file.payload);
  if (!filePayload) {
    return file;
  }

  return withUpdatedUniversalNativePayload(file, (payload) =>
    'asset' in payload
      ? {
          ...payload,
          asset: {
            ...filePayload,
            url: refreshedUrl,
          },
        }
      : {
          ...payload,
          url: refreshedUrl,
        }
  );
}

/** Applies refreshed playback URLs to the nested film review payload without mutating the original file. */
function withRefreshedFilmReviewPlaybackUrls(
  file: UniversalFileDoc,
  params: {
    readonly reviewVideoUrl?: string;
    readonly sourceVideoUrlsById?: ReadonlyMap<string, string>;
  }
): UniversalFileDoc {
  if (file.type !== 'file' || file.payloadKind === 'pointer') {
    return file;
  }

  const filmReviewPayload = getUniversalFilmReviewPayload(file.payload);
  if (!filmReviewPayload) {
    return file;
  }

  const nextReviewVideoUrl = normalizeOptionalString(params.reviewVideoUrl);
  const nextSourceUrlsById = params.sourceVideoUrlsById;
  if (!nextReviewVideoUrl && (!nextSourceUrlsById || nextSourceUrlsById.size === 0)) {
    return file;
  }

  return withUpdatedUniversalNativePayload(file, (payload) => ({
    ...payload,
    filmReview: {
      ...filmReviewPayload,
      ...(nextReviewVideoUrl ? { videoUrl: nextReviewVideoUrl } : {}),
      ...(Array.isArray(filmReviewPayload.sources)
        ? {
            sources: filmReviewPayload.sources.map((source) => {
              const refreshedSourceUrl = nextSourceUrlsById?.get(source.id);
              return refreshedSourceUrl ? { ...source, videoUrl: refreshedSourceUrl } : source;
            }),
          }
        : {}),
    },
  }));
}

function withRefreshedThumbnailUrl(
  file: UniversalFileDoc,
  refreshedThumbnailUrl: string
): UniversalFileDoc {
  if (file.type !== 'file' || file.payloadKind === 'pointer') {
    return file;
  }

  const filePayload = getUniversalBinaryFilePayload(file.payload);
  const filmReviewPayload = getUniversalFilmReviewPayload(file.payload);

  return {
    ...file,
    thumbnailUrl: refreshedThumbnailUrl,
    payload: {
      ...(file.payload as Record<string, unknown>),
      ...(filePayload ? { thumbnailUrl: refreshedThumbnailUrl } : {}),
      ...('asset' in (file.payload as Record<string, unknown>) && filePayload
        ? {
            asset: {
              ...filePayload,
              thumbnailUrl: refreshedThumbnailUrl,
            },
          }
        : {}),
      ...(filmReviewPayload
        ? {
            filmReview: {
              ...filmReviewPayload,
              thumbnailUrl: refreshedThumbnailUrl,
              ...(Array.isArray(filmReviewPayload.sources)
                ? {
                    sources: filmReviewPayload.sources.map((source, index) =>
                      index === 0
                        ? {
                            ...source,
                            thumbnailUrl: refreshedThumbnailUrl,
                          }
                        : source
                    ),
                  }
                : {}),
            },
          }
        : {}),
    },
  } as UniversalFileDoc;
}

async function refreshUniversalFileDisplayAssets(params: {
  readonly bucket: ReturnType<NonNullable<Request['firebase']>['storage']['bucket']>;
  readonly file: UniversalFileDoc;
  readonly db?: NonNullable<Request['firebase']>['db'];
  readonly disposition?: 'attachment' | 'inline';
  readonly fileName?: string;
  readonly logScope: 'listing' | 'single';
}): Promise<UniversalFileDoc> {
  let universalFile = params.file;
  let refreshedPrimaryAssetUrl: string | null = null;

  if (universalFile.type !== 'file' || universalFile.payloadKind === 'pointer') {
    return universalFile;
  }

  const filePayload = getUniversalBinaryFilePayload(universalFile.payload);
  const filmReviewPayload = getUniversalFilmReviewPayload(universalFile.payload);
  if (filePayload) {
    try {
      const refreshedUrl = await refreshFileUrl(
        params.bucket,
        {
          url: filePayload.url,
          storagePath: filePayload.storagePath,
          kind: filePayload.kind,
          mimeType: filePayload.mimeType,
        },
        {
          allowVideoRefresh: !!filmReviewPayload,
          disposition: params.disposition,
          fileName: params.fileName,
        }
      );

      refreshedPrimaryAssetUrl = normalizeOptionalString(refreshedUrl) ?? null;
      universalFile = withRefreshedPrimaryAssetUrl(universalFile, refreshedUrl);
    } catch (refreshError) {
      logger.warn(
        `Failed to refresh Universal File signed URL for ${params.logScope === 'listing' ? 'listing' : 'single file'}`,
        {
          teamId: universalFile.teamId,
          fileId: universalFile.id,
          storagePath: filePayload.storagePath,
          error: refreshError instanceof Error ? refreshError.message : String(refreshError),
        }
      );
    }

    if (
      typeof filePayload.thumbnailUrl === 'string' &&
      filePayload.thumbnailUrl.trim().length > 0
    ) {
      const thumbnailStoragePath = AgentMediaLifecycleService.extractStoragePathFromUrl(
        filePayload.thumbnailUrl
      );

      if (thumbnailStoragePath) {
        try {
          const refreshedThumbnailUrl = await refreshFileUrl(params.bucket, {
            url: filePayload.thumbnailUrl,
            storagePath: thumbnailStoragePath,
            kind: 'image',
            mimeType: 'image/jpeg',
          });

          universalFile = withRefreshedThumbnailUrl(universalFile, refreshedThumbnailUrl);
        } catch (refreshError) {
          logger.warn(
            `Failed to refresh Universal File thumbnail URL for ${params.logScope === 'listing' ? 'listing' : 'single file'}`,
            {
              teamId: universalFile.teamId,
              fileId: universalFile.id,
              storagePath: thumbnailStoragePath,
              error: refreshError instanceof Error ? refreshError.message : String(refreshError),
            }
          );
        }
      }
    }

    if (filmReviewPayload?.sources?.length) {
      const assetStoragePath = normalizeComparableStoragePath(filePayload.storagePath);
      const refreshedSourceUrlsById = new Map<string, string>();

      for (const source of filmReviewPayload.sources) {
        const sourceId = normalizeOptionalString(source.id);
        const sourceStoragePath = normalizeComparableStoragePath(
          normalizeOptionalString(source.storagePath) ??
            AgentMediaLifecycleService.extractStoragePathFromUrl(source.videoUrl)
        );

        if (!sourceId) {
          continue;
        }

        if (!sourceStoragePath) {
          logger.warn(
            `Skipped Universal File film review source URL refresh for ${params.logScope === 'listing' ? 'listing' : 'single file'} because no storage path could be resolved`,
            {
              teamId: universalFile.teamId,
              fileId: universalFile.id,
              sourceId,
              videoUrl: source.videoUrl,
            }
          );
          continue;
        }

        if (
          refreshedPrimaryAssetUrl &&
          assetStoragePath &&
          sourceStoragePath === assetStoragePath
        ) {
          // Reuse the primary asset URL when a source points at the same storage object.
          refreshedSourceUrlsById.set(sourceId, refreshedPrimaryAssetUrl);
          continue;
        }

        try {
          const refreshedSourceUrl = await refreshFileUrl(
            params.bucket,
            {
              url: source.videoUrl,
              storagePath: sourceStoragePath,
              kind: 'video',
              mimeType: filePayload.mimeType,
            },
            {
              allowVideoRefresh: true,
            }
          );

          const normalizedRefreshedSourceUrl = normalizeOptionalString(refreshedSourceUrl);
          if (normalizedRefreshedSourceUrl) {
            refreshedSourceUrlsById.set(sourceId, normalizedRefreshedSourceUrl);
          }
        } catch (refreshError) {
          logger.warn(
            `Failed to refresh Universal File film review source URL for ${params.logScope === 'listing' ? 'listing' : 'single file'}`,
            {
              teamId: universalFile.teamId,
              fileId: universalFile.id,
              sourceId,
              storagePath: sourceStoragePath,
              error: refreshError instanceof Error ? refreshError.message : String(refreshError),
            }
          );
        }
      }

      if (refreshedPrimaryAssetUrl || refreshedSourceUrlsById.size > 0) {
        universalFile = withRefreshedFilmReviewPlaybackUrls(universalFile, {
          ...(refreshedPrimaryAssetUrl ? { reviewVideoUrl: refreshedPrimaryAssetUrl } : {}),
          sourceVideoUrlsById: refreshedSourceUrlsById,
        });
      }
    }
  } else {
    universalFile = withInlineTextAssetForListing(universalFile);
  }

  return universalFile;
}

function compareTeamFilesByUpdatedAtDesc(
  left: Pick<UniversalFileDoc, 'updatedAt' | 'createdAt'>,
  right: Pick<UniversalFileDoc, 'updatedAt' | 'createdAt'>
): number {
  const leftTime = Date.parse(
    toPortableTimestamp(left.updatedAt || left.createdAt || new Date(0).toISOString())
  );
  const rightTime = Date.parse(
    toPortableTimestamp(right.updatedAt || right.createdAt || new Date(0).toISOString())
  );
  return rightTime - leftTime;
}

function resolveChatAttachmentOrigin(role: unknown): TeamFileOrigin {
  return role === 'assistant' ? 'agent_chat_output' : 'agent_chat_input';
}

async function promoteAttachmentForTeamFiles(params: {
  readonly bucket: { name: string; file: (path: string) => unknown };
  readonly userId: string;
  readonly attachment: AgentXAttachment;
}): Promise<AgentXAttachment> {
  const resolvedStoragePath =
    params.attachment.storagePath ??
    AgentMediaLifecycleService.extractStoragePathFromUrl(params.attachment.url);

  let nextUrl = params.attachment.url;
  let nextStoragePath = params.attachment.storagePath;
  let nextThumbnailUrl = params.attachment.thumbnailUrl;

  if (
    resolvedStoragePath &&
    AgentMediaLifecycleService.requiresDurablePromotion(resolvedStoragePath, params.userId)
  ) {
    const promoted = await AgentMediaLifecycleService.promoteOwnedObjectToDurableUploadPath({
      bucket: params.bucket,
      storagePath: resolvedStoragePath,
      userId: params.userId,
      mimeType: params.attachment.mimeType,
      fileName: params.attachment.name,
    });

    nextUrl = promoted.url;
    nextStoragePath = promoted.storagePath;
  }

  if (typeof nextThumbnailUrl === 'string' && nextThumbnailUrl.trim().length > 0) {
    const thumbnailStoragePath =
      AgentMediaLifecycleService.extractStoragePathFromUrl(nextThumbnailUrl);

    if (
      thumbnailStoragePath &&
      AgentMediaLifecycleService.requiresDurablePromotion(thumbnailStoragePath, params.userId)
    ) {
      const promotedThumbnail =
        await AgentMediaLifecycleService.promoteOwnedObjectToDurableUploadPath({
          bucket: params.bucket,
          storagePath: thumbnailStoragePath,
          userId: params.userId,
        });
      nextThumbnailUrl = promotedThumbnail.url;
    }
  }

  return {
    ...params.attachment,
    url: nextUrl,
    ...(nextStoragePath ? { storagePath: nextStoragePath } : {}),
    ...(nextThumbnailUrl ? { thumbnailUrl: nextThumbnailUrl } : {}),
  };
}

function toUniversalFileDoc(
  docId: string,
  teamId: string | null,
  data: Record<string, unknown>
): UniversalFileDoc {
  const baseData = data as unknown as Partial<UniversalFileDoc>;
  return {
    ...baseData,
    id: docId,
    teamId,
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
    ...(data['lastSeenAt'] ? { lastSeenAt: toPortableTimestamp(data['lastSeenAt']) } : {}),
  } as UniversalFileDoc;
}

async function resolveInheritedFolderAcl(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly teamId?: string | null;
  readonly parentId: string | null;
  readonly ownerUserId: string;
  readonly organizationId?: string | null;
}): Promise<{
  readonly acl: TeamFileFolderDoc['acl'];
  readonly organizationId: string | null;
  readonly readAccessKeys: readonly string[];
  readonly writeAccessKeys: readonly string[];
}> {
  const { db, parentId, ownerUserId } = params;
  const teamId = normalizeOptionalString(params.teamId) ?? null;
  const explicitOrganizationId = normalizeOptionalString(params.organizationId);
  const ownerScopedAccess = createOwnerPrivateAccessLists({ ownerUserId });

  if (!parentId) {
    const baseAcl =
      teamId !== null
        ? buildDefaultTeamScopedAcl({
            teamId,
            ownerUserId,
            organizationId: explicitOrganizationId,
          })
        : undefined;
    return {
      acl: baseAcl,
      organizationId: explicitOrganizationId ?? null,
      readAccessKeys: ownerScopedAccess.readAccessKeys,
      writeAccessKeys: ownerScopedAccess.writeAccessKeys,
    };
  }

  const parentDoc = await db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(parentId).get();
  const parentData = parentDoc.data() ?? {};
  const parentAcl = getFileFolderAcl(parentData);
  const organizationId =
    normalizeOptionalString(parentData['organizationId']) ?? explicitOrganizationId;
  const inheritedReadAccessKeys = getStringArray(parentData['readAccessKeys']);
  const inheritedWriteAccessKeys = getStringArray(parentData['writeAccessKeys']);
  const fallbackReadAccessKeys =
    inheritedReadAccessKeys.length > 0
      ? inheritedReadAccessKeys
      : parentAcl
        ? getAclReadAccessKeys(parentAcl)
        : getLegacyReadAccessKeys(parentData);
  const fallbackWriteAccessKeys =
    inheritedWriteAccessKeys.length > 0
      ? inheritedWriteAccessKeys
      : getLegacyWriteAccessKeys(parentData);

  return {
    acl: parentAcl
      ? copyAgentFileAclFromFolder(parentAcl, parentId)
      : teamId
        ? buildDefaultTeamScopedAcl({
            teamId,
            ownerUserId,
            organizationId,
            mode: 'copied_from_folder',
            sourceFolderId: parentId,
          })
        : undefined,
    organizationId: organizationId ?? null,
    readAccessKeys: [...new Set([...ownerScopedAccess.readAccessKeys, ...fallbackReadAccessKeys])],
    writeAccessKeys: [
      ...new Set([...ownerScopedAccess.writeAccessKeys, ...fallbackWriteAccessKeys]),
    ],
  };
}

function inferInlineTextFileOrigin(file: UniversalFileDoc): TeamFileOrigin {
  if (
    file.sourceRef?.sourceThreadId ||
    file.sourceRef?.sourceMessageId ||
    file.sourceRef?.sourceOperationId
  ) {
    return 'agent_chat_output';
  }

  return 'files_upload';
}

function withInlineTextAssetForListing(file: UniversalFileDoc): UniversalFileDoc {
  if (file.type !== 'file' || file.payloadKind === 'pointer') {
    return file;
  }

  const payloadRecord = file.payload as Record<string, unknown>;
  const contentRecord = payloadRecord['content'];
  const rawText =
    contentRecord && typeof contentRecord === 'object'
      ? (contentRecord as { text?: unknown }).text
      : undefined;

  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return file;
  }

  const asset: UniversalBinaryFilePayload = {
    mimeType: 'text/markdown',
    kind: 'doc',
    origin: inferInlineTextFileOrigin(file),
    sizeBytes: rawText.length,
    url: `data:text/markdown;charset=utf-8,${encodeURIComponent(rawText)}`,
  };

  return {
    ...file,
    payload: {
      ...payloadRecord,
      asset,
    },
  } as UniversalFileDoc;
}

function createNativeFilmReviewPayload(review: TeamFilmReviewDoc): UniversalFilmReviewPayload {
  const thumbnailUrl = normalizePersistableThumbnailUrl(review.thumbnailUrl);
  const sources = (review.sources ?? []).map((source) => {
    const sourceThumbnailUrl = normalizePersistableThumbnailUrl(source.thumbnailUrl);
    return {
      ...source,
      ...(sourceThumbnailUrl ? { thumbnailUrl: sourceThumbnailUrl } : {}),
    };
  });

  return {
    uploadMode: review.uploadMode,
    perspective: review.perspective,
    gameDate: review.gameDate,
    opponentName: review.opponentName,
    playlistId: review.playlistId,
    playlistName: review.playlistName,
    videoUrl: review.videoUrl,
    sources,
    storagePath: review.storagePath,
    cloudflareVideoId: review.cloudflareVideoId,
    cloudflareStatus: review.cloudflareStatus,
    readyToStream: review.readyToStream,
    thumbnailUrl: thumbnailUrl ?? undefined,
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

function normalizePersistableThumbnailUrl(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (!normalized || normalized.startsWith('data:')) {
    return undefined;
  }

  return normalized;
}

function toTeamFilmReviewDocFromUniversalFile(file: UniversalFileDoc): TeamFilmReviewDoc | null {
  if (file.type !== 'file' || file.payloadKind === 'pointer') {
    return null;
  }

  const payload = getUniversalFilmReviewPayload(file.payload);
  if (!payload) {
    return null;
  }

  const asset = getUniversalBinaryFilePayload(file.payload);
  const primarySource = payload.sources?.[0];
  const videoUrl =
    asset?.url?.trim() || payload.videoUrl?.trim() || primarySource?.videoUrl?.trim() || '';
  if (!videoUrl) {
    return null;
  }

  return {
    id: file.id,
    teamId: file.teamId,
    organizationId: file.organizationId ?? undefined,
    fileId: file.id,
    sport: file.sport ?? 'unknown',
    title: file.title,
    status: file.status as TeamFilmReviewDoc['status'],
    uploadMode: payload.uploadMode,
    perspective: payload.perspective,
    gameDate: payload.gameDate,
    opponentName: payload.opponentName,
    playlistId: payload.playlistId,
    playlistName: payload.playlistName,
    videoUrl,
    sources: payload.sources,
    storagePath: payload.storagePath ?? asset?.storagePath,
    cloudflareVideoId: payload.cloudflareVideoId ?? asset?.cloudflareVideoId,
    cloudflareStatus: payload.cloudflareStatus ?? asset?.cloudflareStatus,
    readyToStream: payload.readyToStream ?? asset?.readyToStream,
    thumbnailUrl: payload.thumbnailUrl ?? file.thumbnailUrl ?? asset?.thumbnailUrl,
    durationSec: payload.durationSec,
    aiSummary: payload.aiSummary,
    aiTags: payload.aiTags,
    clips: payload.clips,
    annotations: payload.annotations,
    keyInsights: payload.keyInsights,
    tags: file.tags,
    source: payload.source ?? 'team_files',
    sourceUrl: payload.sourceUrl,
    schemaVersion: payload.schemaVersion ?? 2,
    reviewRevision: payload.reviewRevision ?? 0,
    readAccessKeys: file.readAccessKeys,
    writeAccessKeys: file.writeAccessKeys,
    createdBy: file.createdByUserId ?? file.ownerUserId ?? file.updatedByUserId ?? '',
    updatedBy: file.updatedByUserId ?? file.createdByUserId ?? file.ownerUserId ?? '',
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    timelineState: payload.timelineState,
    timeline: payload.timeline,
    breakdownSource: payload.breakdownSource,
    timelineGeneratedAt: payload.timelineGeneratedAt,
    timelineError: payload.timelineError,
    timelineProgress: payload.timelineProgress,
    downloadPrewarm: payload.downloadPrewarm,
    downloadExport: payload.downloadExport,
  };
}

function attachNativeFilmReviewToBaseFile(
  file: UniversalNativeFileDoc<'file'>,
  review: TeamFilmReviewDoc
): UniversalNativeFileDoc<'file'> {
  const existingClassification = getUniversalFileClassification(file);
  const existingLabels = new Set(existingClassification?.labels ?? []);
  existingLabels.add('film_review');
  existingLabels.add('video_analysis');
  existingLabels.add('team_document');

  const sourceRef =
    file.sourceRef && typeof file.sourceRef === 'object'
      ? { ...(file.sourceRef as Record<string, unknown>) }
      : {};
  delete sourceRef['legacyCollection'];
  delete sourceRef['legacyId'];

  const facets =
    existingClassification?.facets && typeof existingClassification.facets === 'object'
      ? { ...(existingClassification.facets as Record<string, unknown>) }
      : {};
  delete facets['sourceCollection'];

  return {
    ...file,
    title: review.title,
    normalizedTitle: review.title.trim().toLowerCase(),
    status: review.status,
    sport: review.sport ?? file.sport,
    summary: review.aiSummary ?? file.summary,
    tags: review.tags?.length ? review.tags : file.tags,
    thumbnailUrl: review.thumbnailUrl ?? file.thumbnailUrl,
    updatedByUserId: review.updatedBy ?? file.updatedByUserId,
    sourceRef: Object.keys(sourceRef).length > 0 ? sourceRef : undefined,
    classification: {
      ...(existingClassification ?? {}),
      primary: 'film_review',
      route: 'film_review',
      labels: [...existingLabels],
      facets: {
        ...facets,
        uploadMode: review.uploadMode,
        perspective: review.perspective,
        opponentName: review.opponentName,
      },
    },
    semanticSync: { status: 'pending' },
    payload: {
      ...file.payload,
      filmReview: createNativeFilmReviewPayload(review),
    },
    updatedAt: review.updatedAt,
    lastSeenAt: review.updatedAt,
  };
}

function buildCloudflareThumbnailUrl(cloudflareVideoId?: string): string | undefined {
  const normalizedCloudflareVideoId = normalizeOptionalString(cloudflareVideoId);
  if (!normalizedCloudflareVideoId) {
    return undefined;
  }

  return `https://videodelivery.net/${normalizedCloudflareVideoId}/thumbnails/thumbnail.jpg`;
}

function buildFilmReviewSourceFromAttachment(params: {
  readonly fileId: string;
  readonly attachment: AgentXAttachment;
  readonly title: string;
  readonly durationSec?: number;
}): TeamFilmReviewSourceVideo {
  const thumbnailUrl =
    normalizeOptionalString(params.attachment.thumbnailUrl) ??
    buildCloudflareThumbnailUrl(params.attachment.cloudflareVideoId);

  return {
    id: params.fileId,
    order: 0,
    fileId: params.fileId,
    videoUrl: params.attachment.url,
    title: params.title,
    ...(params.attachment.storagePath ? { storagePath: params.attachment.storagePath } : {}),
    ...(params.attachment.cloudflareVideoId
      ? { cloudflareVideoId: params.attachment.cloudflareVideoId }
      : {}),
    ...(params.attachment.cloudflareStatus
      ? { cloudflareStatus: params.attachment.cloudflareStatus }
      : {}),
    ...(params.attachment.readyToStream !== undefined
      ? { readyToStream: params.attachment.readyToStream }
      : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(params.durationSec !== undefined ? { durationSec: params.durationSec } : {}),
  };
}

function buildFilmReviewDocumentFromCreateRequest(params: {
  readonly fileId: string;
  readonly userId: string;
  readonly body: z.infer<typeof TeamFilmReviewUploadCreateBodySchema>;
  readonly organizationId?: string | null;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
}): TeamFilmReviewDoc {
  const normalizedTitle = params.body.title.trim();
  const normalizedSport = params.body.sport.trim().toLowerCase();
  const uploadMode = isTeamFilmReviewUploadMode(params.body.uploadMode)
    ? params.body.uploadMode
    : 'single_video';
  const fallbackSource = buildFilmReviewSourceFromAttachment({
    fileId: params.fileId,
    attachment: params.body.attachment as AgentXAttachment,
    title: normalizedTitle,
    durationSec: params.body.durationSec,
  });
  const normalizedSources = (
    params.body.sources?.length ? params.body.sources : [fallbackSource]
  ).map((source, index) => ({
    ...source,
    id: source.id.trim() || `source-${index + 1}`,
    order: index,
    ...(index === 0 ? { fileId: source.fileId?.trim() || params.fileId } : {}),
    ...(source.cameraAngle ? { cameraAngle: source.cameraAngle } : {}),
    ...(source.angleGroupId?.trim() ? { angleGroupId: source.angleGroupId.trim() } : {}),
    ...(source.angleDetectionSource ? { angleDetectionSource: source.angleDetectionSource } : {}),
    ...(source.title?.trim() ? { title: source.title.trim() } : {}),
    ...(source.downloadUrl?.trim() ? { downloadUrl: source.downloadUrl.trim() } : {}),
    ...(source.storagePath?.trim() ? { storagePath: source.storagePath.trim() } : {}),
    ...(source.cloudflareVideoId?.trim()
      ? { cloudflareVideoId: source.cloudflareVideoId.trim() }
      : {}),
    ...(source.cloudflareStatus?.trim()
      ? { cloudflareStatus: source.cloudflareStatus.trim() }
      : {}),
    ...(source.thumbnailUrl?.trim() ? { thumbnailUrl: source.thumbnailUrl.trim() } : {}),
  }));
  const primarySource =
    (normalizedSources[0] as TeamFilmReviewSourceVideo | undefined) ?? fallbackSource;
  const primaryStoragePath =
    normalizeOptionalString(params.body.storagePath) ??
    normalizeOptionalString(primarySource.storagePath) ??
    normalizeOptionalString(fallbackSource.storagePath);
  const primaryCloudflareVideoId =
    normalizeOptionalString(params.body.cloudflareVideoId) ??
    normalizeOptionalString(primarySource.cloudflareVideoId) ??
    normalizeOptionalString(fallbackSource.cloudflareVideoId);
  const primaryCloudflareStatus =
    normalizeOptionalString(params.body.cloudflareStatus) ??
    normalizeOptionalString(primarySource.cloudflareStatus) ??
    normalizeOptionalString(fallbackSource.cloudflareStatus);
  const primaryReadyToStream =
    params.body.readyToStream ?? primarySource.readyToStream ?? fallbackSource.readyToStream;
  const primaryThumbnailUrl =
    normalizeOptionalString(params.body.thumbnailUrl) ??
    normalizeOptionalString(primarySource.thumbnailUrl) ??
    normalizeOptionalString(fallbackSource.thumbnailUrl) ??
    buildCloudflareThumbnailUrl(primaryCloudflareVideoId);
  const fallbackDurationSec =
    params.body.durationSec ?? primarySource.durationSec ?? fallbackSource.durationSec;
  const status: TeamFilmReviewDoc['status'] =
    primarySource.cloudflareVideoId && primarySource.readyToStream !== true
      ? 'processing'
      : 'ready';
  const now = new Date().toISOString();
  const timeline = buildSeededFilmReviewTimeline({
    uploadMode,
    sources: normalizedSources,
    ...(fallbackDurationSec !== undefined ? { fallbackDurationSec } : {}),
  });

  const draftReview = {
    id: params.fileId,
    ...(params.body.teamId ? { teamId: params.body.teamId } : {}),
    ...(params.organizationId ? { organizationId: params.organizationId } : {}),
    fileId: params.fileId,
    sport: normalizedSport,
    title: normalizedTitle,
    status,
    uploadMode,
    videoUrl: params.body.videoUrl.trim(),
    sources: normalizedSources,
    ...(primaryStoragePath ? { storagePath: primaryStoragePath } : {}),
    ...(primaryCloudflareVideoId ? { cloudflareVideoId: primaryCloudflareVideoId } : {}),
    ...(primaryCloudflareStatus ? { cloudflareStatus: primaryCloudflareStatus } : {}),
    ...(primaryReadyToStream !== undefined ? { readyToStream: primaryReadyToStream } : {}),
    ...(primaryThumbnailUrl ? { thumbnailUrl: primaryThumbnailUrl } : {}),
    ...(fallbackDurationSec !== undefined ? { durationSec: fallbackDurationSec } : {}),
    clips: [],
    annotations: [],
    ...(timeline.length > 0
      ? {
          timeline,
          timelineState: 'ready',
          timelineGeneratedAt: now,
        }
      : {
          timeline: [],
          timelineState: 'idle',
        }),
    tags: [],
    source: params.body.source?.trim() || 'manual_upload',
    ...(params.body.sourceUrl ? { sourceUrl: params.body.sourceUrl.trim() } : {}),
    schemaVersion: 2,
    ...(params.readAccessKeys?.length ? { readAccessKeys: params.readAccessKeys } : {}),
    ...(params.writeAccessKeys?.length ? { writeAccessKeys: params.writeAccessKeys } : {}),
    createdBy: params.userId,
    updatedBy: params.userId,
    createdAt: now,
    updatedAt: now,
  } as TeamFilmReviewDoc;

  return {
    ...draftReview,
    ...buildSyntheticFilmReviewAi(draftReview),
  };
}

async function resolveNativeFilmReviewForFileMutation(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly fileId: string;
  readonly teamId?: string | null;
}): Promise<
  | { ok: true; file: UniversalNativeFileDoc<'file'>; review: TeamFilmReviewDoc }
  | { ok: false; status: number; error: string }
> {
  const fileDoc = await params.db.collection(UNIVERSAL_FILES_COLLECTION).doc(params.fileId).get();
  if (!fileDoc.exists) {
    return { ok: false, status: 404, error: 'File not found' };
  }

  const fileData = fileDoc.data() as Record<string, unknown>;
  const fileTeamId = normalizeOptionalString(fileData['teamId']) ?? null;
  const requestedTeamId = normalizeOptionalString(params.teamId) ?? null;
  if (requestedTeamId !== null && fileTeamId !== requestedTeamId) {
    return { ok: false, status: 404, error: 'File not found' };
  }

  const universalFile = toUniversalFileDoc(fileDoc.id, fileTeamId, fileData);
  if (universalFile.type !== 'file' || universalFile.payloadKind === 'pointer') {
    return { ok: false, status: 400, error: 'Film review requires a native video file' };
  }

  const review = toTeamFilmReviewDocFromUniversalFile(universalFile);
  if (!review) {
    return { ok: false, status: 404, error: 'Film review not found' };
  }

  return { ok: true, file: universalFile as UniversalNativeFileDoc<'file'>, review };
}

async function mutateNativeFilmReviewAtomically(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly fileId: string;
  readonly teamId?: string | null;
  readonly userId: string;
  readonly expectedRevision: number;
  readonly mutate: (
    review: TeamFilmReviewDoc,
    file: UniversalNativeFileDoc<'file'>
  ) => TeamFilmReviewDoc | Promise<TeamFilmReviewDoc>;
}): Promise<TeamFilmReviewDoc> {
  return updateUniversalFileFilmReviewAtomically({
    db: params.db,
    reviewId: params.fileId,
    update: async (currentReview, fileData) => {
      const currentRevision = getTeamFilmReviewRevision(currentReview);
      if (currentRevision !== params.expectedRevision) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'REVISION_CONFLICT',
          `Film review revision conflict: expected ${params.expectedRevision}, found ${currentRevision}.`,
          currentRevision
        );
      }

      const fileTeamId = normalizeOptionalString(fileData['teamId']) ?? null;
      const requestedTeamId = normalizeOptionalString(params.teamId) ?? null;
      if (requestedTeamId !== null && requestedTeamId !== fileTeamId) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'ACCESS_DENIED',
          'Not authorized to update this film review.'
        );
      }

      const file = toUniversalFileDoc(params.fileId, fileTeamId, fileData);
      if (file.type !== 'file' || file.payloadKind === 'pointer') {
        throw new Error('Film review requires a native video file');
      }
      const grantedAccessKeys = await resolveGrantedFileAccessKeys(params.db, params.userId);
      const canWrite = await canWriteAccessControlledRecord({
        db: params.db,
        authUid: params.userId,
        teamId: requestedTeamId ?? fileTeamId ?? undefined,
        data: fileData,
        acl: file.acl,
        grantedAccessKeys,
      });
      if (!canWrite) {
        throw new TeamFilmReviewSourceBreakdownPatchError(
          'ACCESS_DENIED',
          'Not authorized to update this film review.'
        );
      }

      const updated = await params.mutate(currentReview, file as UniversalNativeFileDoc<'file'>);
      return { ...updated, reviewRevision: currentRevision + 1 };
    },
  });
}

function sendFilmReviewMutationError(res: Response, error: Error, fallbackMessage: string): void {
  if (error instanceof TeamFilmReviewSourceBreakdownPatchError) {
    const status =
      error.code === 'ACCESS_DENIED' ? 403 : error.code === 'REVISION_CONFLICT' ? 409 : 400;
    res.status(status).json({
      success: false,
      error: error.message,
      code: error.code,
      ...(error.currentRevision !== undefined ? { currentRevision: error.currentRevision } : {}),
    });
    return;
  }
  res.status(500).json({ success: false, error: fallbackMessage });
}

function buildFilmReviewDownloadExportFileStem(
  review: Pick<TeamFilmReviewDoc, 'title' | 'gameDate'>
): string {
  const stem = [review.title?.trim(), review.gameDate?.trim()]
    .filter((part): part is string => !!part)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return stem || 'film-review';
}

function buildFilmReviewDownloadExportFileName(
  review: Pick<TeamFilmReviewDoc, 'title' | 'gameDate'>
): string {
  return `${buildFilmReviewDownloadExportFileStem(review)}.mp4`;
}

function buildFilmReviewDownloadExportStoragePath(
  review: Pick<TeamFilmReviewDoc, 'teamId' | 'id' | 'title' | 'gameDate'>
): string {
  return `${FILM_REVIEW_DOWNLOAD_EXPORTS_PREFIX}/${review.teamId}/${review.id}/${buildFilmReviewDownloadExportFileName(review)}`;
}

function isFilmReviewDownloadExportPending(
  exportState: TeamFilmReviewDownloadExport | null | undefined
): boolean {
  return exportState?.status === 'queued' || exportState?.status === 'processing';
}

function isFilmReviewDownloadExportStale(
  exportState: TeamFilmReviewDownloadExport | null | undefined
): boolean {
  const lastCheckedAt = normalizeOptionalString(exportState?.lastCheckedAt);
  if (!lastCheckedAt) return true;

  const timestampMs = Date.parse(lastCheckedAt);
  if (!Number.isFinite(timestampMs)) return true;

  return Date.now() - timestampMs >= FILM_REVIEW_DOWNLOAD_EXPORT_STALE_MS;
}

function buildFilmReviewDownloadExportState(params: {
  readonly review: Pick<TeamFilmReviewDoc, 'teamId' | 'id' | 'title' | 'gameDate'>;
  readonly current?: TeamFilmReviewDownloadExport;
  readonly status: TeamFilmReviewDownloadExportStatus;
  readonly requestedAt?: TeamFilmReviewDownloadExport['requestedAt'];
  readonly startedAt?: TeamFilmReviewDownloadExport['startedAt'];
  readonly completedAt?: TeamFilmReviewDownloadExport['completedAt'];
  readonly lastCheckedAt: Exclude<TeamFilmReviewDownloadExport['lastCheckedAt'], undefined>;
  readonly percentComplete?: number;
  readonly contentType?: string;
  readonly byteSize?: number;
  readonly lastError?: string;
}): TeamFilmReviewDownloadExport {
  const fileName = params.current?.fileName ?? buildFilmReviewDownloadExportFileName(params.review);
  const storagePath =
    params.current?.storagePath ?? buildFilmReviewDownloadExportStoragePath(params.review);

  return {
    requestedAt: params.requestedAt ?? params.current?.requestedAt ?? params.lastCheckedAt,
    ...((params.startedAt ?? params.current?.startedAt)
      ? { startedAt: params.startedAt ?? params.current?.startedAt }
      : {}),
    ...(params.completedAt ? { completedAt: params.completedAt } : {}),
    lastCheckedAt: params.lastCheckedAt,
    status: params.status,
    ...(params.percentComplete !== undefined ? { percentComplete: params.percentComplete } : {}),
    format: 'mp4',
    fileName,
    storagePath,
    ...((params.contentType ?? params.current?.contentType)
      ? { contentType: params.contentType ?? params.current?.contentType }
      : {}),
    ...((params.byteSize ?? params.current?.byteSize)
      ? { byteSize: params.byteSize ?? params.current?.byteSize }
      : {}),
    ...(params.lastError ? { lastError: params.lastError } : {}),
  };
}

function getBinaryAssetDurationSec(asset: UniversalBinaryFilePayload): number | undefined {
  const durationSec = (asset as { durationSec?: unknown }).durationSec;
  return typeof durationSec === 'number' && Number.isFinite(durationSec) ? durationSec : undefined;
}

async function persistNativeFilmReviewDocument(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly fileId: string;
  readonly file: UniversalNativeFileDoc<'file'>;
  readonly review: TeamFilmReviewDoc;
  readonly authorizeUserId?: string;
}): Promise<UniversalNativeFileDoc<'file'>> {
  const existingReview = toTeamFilmReviewDocFromUniversalFile(params.file);
  if (existingReview) {
    const updatedReview = await updateUniversalFileFilmReviewAtomically({
      db: params.db,
      reviewId: params.fileId,
      update: async (currentReview, fileData) => {
        const currentRevision = getTeamFilmReviewRevision(currentReview);
        const expectedRevision = getTeamFilmReviewRevision(existingReview);
        if (currentRevision !== expectedRevision) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'REVISION_CONFLICT',
            `Film review revision conflict: expected ${expectedRevision}, found ${currentRevision}.`,
            currentRevision
          );
        }
        if (params.authorizeUserId) {
          const fileTeamId = normalizeOptionalString(fileData['teamId']) ?? null;
          const currentFile = toUniversalFileDoc(params.fileId, fileTeamId, fileData);
          const grantedAccessKeys = await resolveGrantedFileAccessKeys(
            params.db,
            params.authorizeUserId
          );
          const canWrite = await canWriteAccessControlledRecord({
            db: params.db,
            authUid: params.authorizeUserId,
            teamId: fileTeamId ?? undefined,
            data: fileData,
            acl: currentFile.acl,
            grantedAccessKeys,
          });
          if (!canWrite) {
            throw new TeamFilmReviewSourceBreakdownPatchError(
              'ACCESS_DENIED',
              'Not authorized to update this film review.'
            );
          }
        }
        return { ...params.review, reviewRevision: currentRevision + 1 };
      },
    });
    return attachNativeFilmReviewToBaseFile(params.file, updatedReview);
  }

  const updatedFile = attachNativeFilmReviewToBaseFile(params.file, params.review);
  const { id: _id, ...fileDocument } = updatedFile;
  await params.db.collection(UNIVERSAL_FILES_COLLECTION).doc(params.fileId).set(fileDocument, {
    merge: true,
  });
  return updatedFile;
}

function buildNativeFilmReviewFromIndexedFile(params: {
  readonly fileId: string;
  readonly file: UniversalNativeFileDoc<'file'>;
  readonly userId: string;
}): TeamFilmReviewDoc | null {
  const asset = getUniversalBinaryFilePayload(params.file.payload);
  if (!asset || asset.kind !== 'video') {
    return null;
  }

  const title = params.file.title?.trim();
  const videoUrl = asset.url?.trim();
  if (!title || !videoUrl) {
    return null;
  }

  const sport = params.file.sport?.trim().toLowerCase() || 'unknown';
  const assetDurationSec = getBinaryAssetDurationSec(asset);
  const source: TeamFilmReviewSourceVideo = {
    id: params.fileId,
    order: 0,
    fileId: params.fileId,
    videoUrl,
    title,
    ...(asset.storagePath ? { storagePath: asset.storagePath } : {}),
    ...(asset.cloudflareVideoId ? { cloudflareVideoId: asset.cloudflareVideoId } : {}),
    ...(asset.cloudflareStatus ? { cloudflareStatus: asset.cloudflareStatus } : {}),
    ...(asset.readyToStream !== undefined ? { readyToStream: asset.readyToStream } : {}),
    ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
    ...(assetDurationSec !== undefined ? { durationSec: assetDurationSec } : {}),
  };

  const status: TeamFilmReviewDoc['status'] =
    asset.cloudflareVideoId && asset.readyToStream !== true ? 'processing' : 'ready';
  const timeline = buildSeededFilmReviewTimeline({
    uploadMode: 'single_video',
    sources: [source],
    ...(assetDurationSec !== undefined ? { fallbackDurationSec: assetDurationSec } : {}),
  });
  const createdAt = params.file.createdAt || new Date().toISOString();
  const updatedAt = params.file.updatedAt || createdAt;

  const draftReview: TeamFilmReviewDoc = {
    id: params.fileId,
    teamId: params.file.teamId,
    organizationId: params.file.organizationId ?? undefined,
    fileId: params.fileId,
    sport,
    title,
    status,
    uploadMode: 'single_video',
    videoUrl,
    sources: [source],
    ...(asset.storagePath ? { storagePath: asset.storagePath } : {}),
    ...(asset.cloudflareVideoId ? { cloudflareVideoId: asset.cloudflareVideoId } : {}),
    ...(asset.cloudflareStatus ? { cloudflareStatus: asset.cloudflareStatus } : {}),
    ...(asset.readyToStream !== undefined ? { readyToStream: asset.readyToStream } : {}),
    ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
    ...(assetDurationSec !== undefined ? { durationSec: assetDurationSec } : {}),
    clips: [],
    annotations: [],
    ...(timeline.length > 0
      ? {
          timeline,
          timelineState: 'ready',
          timelineGeneratedAt: updatedAt,
        }
      : {}),
    tags: params.file.tags ?? [],
    source: 'team_files',
    schemaVersion: 2,
    readAccessKeys: params.file.readAccessKeys,
    writeAccessKeys: params.file.writeAccessKeys,
    createdBy:
      params.file.createdByUserId ??
      params.file.ownerUserId ??
      params.file.updatedByUserId ??
      params.userId,
    updatedBy:
      params.file.updatedByUserId ??
      params.file.createdByUserId ??
      params.file.ownerUserId ??
      params.userId,
    createdAt,
    updatedAt,
  };

  return {
    ...draftReview,
    ...buildSyntheticFilmReviewAi(draftReview),
  };
}

async function resolveFilmReviewSignedStorageUrl(
  storagePath: string | null | undefined,
  bucket: SignedUrlBucket
): Promise<string | null> {
  const normalizedStoragePath =
    AgentMediaLifecycleService.extractStoragePathFromUrl(storagePath ?? '') ??
    normalizeOptionalString(storagePath);
  if (!normalizedStoragePath) return null;

  try {
    const storageFile = bucket.file(normalizedStoragePath) as {
      getSignedUrl(options: { version: 'v4'; action: 'read'; expires: number }): Promise<[string]>;
    };
    const [signedUrl] = await storageFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
    });
    return signedUrl;
  } catch {
    return null;
  }
}

function resolveDirectFilmReviewDownloadUrl(urlInput: string | null | undefined): string | null {
  const videoUrl = normalizeOptionalString(urlInput);
  if (!videoUrl) return null;
  if (/\.m3u8([?#].*)?$/i.test(videoUrl) || /\.mpd([?#].*)?$/i.test(videoUrl)) return null;

  try {
    const parsed = new URL(videoUrl);
    if (
      parsed.hostname === 'watch.cloudflarestream.com' ||
      parsed.hostname === 'iframe.videodelivery.net' ||
      parsed.pathname.includes('/manifest/')
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return videoUrl;
}

async function resolveCloudflareDownloadUrl(
  videoId: string | null | undefined
): Promise<string | null> {
  const normalizedVideoId = normalizeOptionalString(videoId);
  if (!normalizedVideoId) return null;

  const accountId = process.env['CLOUDFLARE_ACCOUNT_ID'];
  const apiToken = process.env['CLOUDFLARE_API_TOKEN'];
  if (!accountId || !apiToken) return null;

  try {
    let cloudflareDownload = await fetchCloudflareDownloadStatus(
      normalizedVideoId,
      accountId,
      apiToken
    );

    if (!cloudflareDownload.url && cloudflareDownload.status !== 'ready') {
      cloudflareDownload = await requestCloudflareVideoDownloadRender(
        normalizedVideoId,
        accountId,
        apiToken
      );
    }

    return normalizeOptionalString(cloudflareDownload.url) ?? null;
  } catch {
    return null;
  }
}

async function resolveFilmReviewSourceDownloadUrls(
  source: TeamFilmReviewSourceVideo | null | undefined,
  bucket: SignedUrlBucket
): Promise<readonly string[]> {
  if (!source) return [];

  const storageCandidates = [source.storagePath, source.downloadUrl, source.videoUrl]
    .map((value) => AgentMediaLifecycleService.extractStoragePathFromUrl(value ?? ''))
    .filter((value): value is string => !!value);

  const signedStorageUrls = (
    await Promise.all(
      [...new Set(storageCandidates)].map((storagePath) =>
        resolveFilmReviewSignedStorageUrl(storagePath, bucket)
      )
    )
  ).filter((value): value is string => !!value);

  const candidates = [
    ...signedStorageUrls,
    await resolveCloudflareDownloadUrl(source.cloudflareVideoId),
    normalizeOptionalString(source.downloadUrl),
    resolveDirectFilmReviewDownloadUrl(source.videoUrl),
  ];

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    urls.push(candidate);
  }

  return urls;
}

async function resolveFilmReviewProxyDownloadUrls(
  review: TeamFilmReviewDoc,
  bucket: SignedUrlBucket
): Promise<readonly string[]> {
  const reviewStorageCandidates = [review.storagePath, review.videoUrl]
    .map((value) => AgentMediaLifecycleService.extractStoragePathFromUrl(value ?? ''))
    .filter((value): value is string => !!value);

  const signedReviewStorageUrls = (
    await Promise.all(
      [...new Set(reviewStorageCandidates)].map((storagePath) =>
        resolveFilmReviewSignedStorageUrl(storagePath, bucket)
      )
    )
  ).filter((value): value is string => !!value);

  const sourceUrls = (
    await Promise.all(
      (review.sources ?? []).map((source) => resolveFilmReviewSourceDownloadUrls(source, bucket))
    )
  ).flat();

  const candidates = [
    normalizeOptionalString(review.downloadPrewarm?.mp4Url),
    ...sourceUrls,
    ...signedReviewStorageUrls,
    await resolveCloudflareDownloadUrl(review.cloudflareVideoId),
    resolveDirectFilmReviewDownloadUrl(review.videoUrl),
  ];

  const seen = new Set<string>();
  const urls: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    urls.push(candidate);
  }

  return urls;
}

async function fetchFilmReviewDownloadResponse(
  upstreamUrls: readonly string[]
): Promise<globalThis.Response | null> {
  for (const upstreamUrl of upstreamUrls) {
    try {
      const upstreamResponse = await fetch(upstreamUrl, { redirect: 'follow' });
      if (upstreamResponse.ok && upstreamResponse.body) {
        return upstreamResponse;
      }
    } catch {
      // Try the next viable source URL.
    }
  }

  return null;
}

async function resolveFilmReviewDownloadExportUrl(
  review: TeamFilmReviewDoc,
  bucket: SignedUrlBucket
): Promise<string | null> {
  const exportState = review.downloadExport;
  const storagePath = normalizeOptionalString(exportState?.storagePath);
  if (exportState?.status !== 'ready' || !storagePath) {
    return null;
  }

  const fileName = exportState.fileName?.trim() || buildFilmReviewDownloadExportFileName(review);
  const storageFile = bucket.file(storagePath) as {
    getSignedUrl(options: {
      version: 'v4';
      action: 'read';
      expires: number;
      responseDisposition?: string;
      responseType?: string;
    }): Promise<[string]>;
  };
  const [signedUrl] = await getSignedUrlWithTimeout(() =>
    storageFile.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 60 * 60 * 1000,
      responseDisposition: `attachment; filename="${fileName}"`,
      responseType: exportState.contentType ?? 'video/mp4',
    })
  );
  return signedUrl;
}

async function runFilmReviewDownloadExportJob(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly fileId: string;
  readonly userId: string;
  readonly bucket: SignedUrlBucket;
}): Promise<void> {
  const { db, fileId, userId, bucket } = params;

  try {
    const docRef = db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId);
    const snap = await docRef.get();
    if (!snap.exists) return;

    const fileData = snap.data() as Record<string, unknown>;
    const teamId = String(fileData['teamId'] ?? '').trim();
    if (!teamId) return;

    const resolved = await resolveNativeFilmReviewForFileMutation({ db, fileId, teamId });
    if (!resolved.ok) return;

    let currentFile = resolved.file;
    let currentReview = resolved.review;
    const startedAt = new Date().toISOString();
    const requestedAt = currentReview.downloadExport?.requestedAt ?? startedAt;
    const processingState = buildFilmReviewDownloadExportState({
      review: currentReview,
      current: currentReview.downloadExport,
      status: 'processing',
      requestedAt,
      startedAt,
      lastCheckedAt: startedAt,
      percentComplete: 8,
      contentType: currentReview.downloadExport?.contentType ?? 'video/mp4',
    });

    currentReview = {
      ...currentReview,
      downloadExport: processingState,
      updatedBy: userId,
      updatedAt: startedAt,
    };
    currentFile = await persistNativeFilmReviewDocument({
      db,
      fileId,
      file: currentFile,
      review: currentReview,
      authorizeUserId: userId,
    });
    currentReview = toTeamFilmReviewDocFromUniversalFile(currentFile) ?? currentReview;

    const upstreamUrls = await resolveFilmReviewProxyDownloadUrls(currentReview, bucket);
    if (upstreamUrls.length === 0) {
      throw new Error('Film review download source is not ready yet');
    }

    const upstreamResponse = await fetchFilmReviewDownloadResponse(upstreamUrls);
    if (!upstreamResponse) {
      throw new Error('Upstream export fetch failed for every available download source');
    }

    const contentType =
      normalizeOptionalString(upstreamResponse.headers.get('content-type')) ?? 'video/mp4';
    const totalBytesHeader = normalizeOptionalString(
      upstreamResponse.headers.get('content-length')
    );
    const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : Number.NaN;
    const storagePath =
      processingState.storagePath ?? buildFilmReviewDownloadExportStoragePath(currentReview);
    const storageFile = bucket.file(storagePath);
    const writeStream = storageFile.createWriteStream({
      resumable: false,
      metadata: {
        contentType,
        cacheControl: 'private, max-age=3600',
        metadata: {
          exportKind: 'film_review_full_footage',
          exportedBy: 'agent_x',
          filmReviewId: currentReview.id,
          teamId: currentReview.teamId ?? '',
        },
      },
    });

    let bytesWritten = 0;
    let lastProgressUpdateAt = 0;
    const progressStream = new Transform({
      transform(chunk, _encoding, callback) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytesWritten += buffer.length;

        const nowMs = Date.now();
        if (nowMs - lastProgressUpdateAt >= FILM_REVIEW_DOWNLOAD_EXPORT_PROGRESS_THROTTLE_MS) {
          lastProgressUpdateAt = nowMs;
          const progressTimestamp = new Date(nowMs).toISOString();
          const percentComplete =
            Number.isFinite(totalBytes) && totalBytes > 0
              ? Math.min(95, Math.max(10, Math.round((bytesWritten / totalBytes) * 100)))
              : bytesWritten > 0
                ? 65
                : 20;

          const progressState = buildFilmReviewDownloadExportState({
            review: currentReview,
            current: currentReview.downloadExport,
            status: 'processing',
            requestedAt,
            startedAt,
            lastCheckedAt: progressTimestamp,
            percentComplete,
            contentType,
            ...(Number.isFinite(totalBytes) && totalBytes > 0 ? { byteSize: totalBytes } : {}),
          });

          const nextReview: TeamFilmReviewDoc = {
            ...currentReview,
            downloadExport: progressState,
            updatedBy: userId,
            updatedAt: progressTimestamp,
          };

          void persistNativeFilmReviewDocument({
            db,
            fileId,
            file: currentFile,
            review: nextReview,
            authorizeUserId: userId,
          })
            .then((updatedFile) => {
              currentFile = updatedFile;
              currentReview = toTeamFilmReviewDocFromUniversalFile(updatedFile) ?? nextReview;
            })
            .catch((updateError) => {
              logger.warn('Failed to update film review download export progress', {
                fileId,
                error: updateError instanceof Error ? updateError.message : String(updateError),
              });
            });
        }

        callback(null, buffer);
      },
    });

    await pipeline(
      Readable.fromWeb(upstreamResponse.body as NodeReadableStream),
      progressStream,
      writeStream
    );

    const completedAt = new Date().toISOString();
    const readyState = buildFilmReviewDownloadExportState({
      review: currentReview,
      current: currentReview.downloadExport,
      status: 'ready',
      requestedAt,
      startedAt,
      completedAt,
      lastCheckedAt: completedAt,
      percentComplete: 100,
      contentType,
      byteSize: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : bytesWritten,
    });

    currentReview = {
      ...currentReview,
      downloadExport: readyState,
      updatedBy: userId,
      updatedAt: completedAt,
    };
    await persistNativeFilmReviewDocument({
      db,
      fileId,
      file: currentFile,
      review: currentReview,
      authorizeUserId: userId,
    });
  } catch (err) {
    const failedAt = new Date().toISOString();
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to build film review download export', {
      fileId,
      error: error.message,
      stack: error.stack,
    });

    try {
      const snap = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId).get();
      if (!snap.exists) return;

      const fileData = snap.data() as Record<string, unknown>;
      const teamId = String(fileData['teamId'] ?? '').trim();
      if (!teamId) return;

      const resolved = await resolveNativeFilmReviewForFileMutation({ db, fileId, teamId });
      if (!resolved.ok) return;

      const nextReview: TeamFilmReviewDoc = {
        ...resolved.review,
        downloadExport: buildFilmReviewDownloadExportState({
          review: resolved.review,
          current: resolved.review.downloadExport,
          status: 'error',
          requestedAt: resolved.review.downloadExport?.requestedAt ?? failedAt,
          startedAt: resolved.review.downloadExport?.startedAt,
          lastCheckedAt: failedAt,
          percentComplete: resolved.review.downloadExport?.percentComplete,
          contentType: resolved.review.downloadExport?.contentType,
          byteSize: resolved.review.downloadExport?.byteSize,
          lastError: error.message,
        }),
        updatedBy: userId,
        updatedAt: failedAt,
      };

      await persistNativeFilmReviewDocument({
        db,
        fileId,
        file: resolved.file,
        review: nextReview,
        authorizeUserId: userId,
      });
    } catch (updateError) {
      logger.warn('Failed to persist film review download export error state', {
        fileId,
        error: updateError instanceof Error ? updateError.message : String(updateError),
      });
    }
  } finally {
    activeFilmReviewDownloadExportJobs.delete(fileId);
  }
}

function launchFilmReviewDownloadExportJob(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly fileId: string;
  readonly userId: string;
  readonly bucket: SignedUrlBucket;
}): void {
  if (activeFilmReviewDownloadExportJobs.has(params.fileId)) {
    return;
  }

  activeFilmReviewDownloadExportJobs.add(params.fileId);
  setTimeout(() => {
    void runFilmReviewDownloadExportJob(params);
  }, 0);
}

async function queueFilmReviewDownloadExport(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly fileId: string;
  readonly file: UniversalNativeFileDoc<'file'>;
  readonly review: TeamFilmReviewDoc;
  readonly userId: string;
  readonly bucket: SignedUrlBucket;
}): Promise<TeamFilmReviewDoc> {
  const currentExport = params.review.downloadExport;
  const isReady = currentExport?.status === 'ready' && !!currentExport.storagePath;
  const isPending = isFilmReviewDownloadExportPending(currentExport);

  if (isReady) {
    return params.review;
  }

  if (isPending && !isFilmReviewDownloadExportStale(currentExport)) {
    return params.review;
  }

  const queuedAt = new Date().toISOString();
  const queuedState = buildFilmReviewDownloadExportState({
    review: params.review,
    current: currentExport,
    status: 'queued',
    requestedAt: currentExport?.requestedAt ?? queuedAt,
    lastCheckedAt: queuedAt,
    percentComplete: 0,
    contentType: currentExport?.contentType ?? 'video/mp4',
  });

  const queuedReview: TeamFilmReviewDoc = {
    ...params.review,
    downloadExport: queuedState,
    updatedBy: params.userId,
    updatedAt: queuedAt,
  };

  const queuedFile = await persistNativeFilmReviewDocument({
    db: params.db,
    fileId: params.fileId,
    file: params.file,
    review: queuedReview,
    authorizeUserId: params.userId,
  });

  launchFilmReviewDownloadExportJob({
    db: params.db,
    fileId: params.fileId,
    userId: params.userId,
    bucket: params.bucket,
  });

  return toTeamFilmReviewDocFromUniversalFile(queuedFile) ?? queuedReview;
}

function compareTeamFileFolders(
  left: Pick<TeamFileFolderDoc, 'sortOrder' | 'name'>,
  right: Pick<TeamFileFolderDoc, 'sortOrder' | 'name'>
): number {
  return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isTeamFilmReviewUploadMode(value: unknown): value is TeamFilmReviewUploadMode {
  return value === 'single_video' || value === 'batch_clips' || value === 'full_footage';
}

function resolveFilmReviewBreakdownProvider(
  fileName: string,
  mimeType: string
): TeamFilmReviewBreakdownSource['provider'] {
  const normalizedName = fileName.trim().toLowerCase();
  if (normalizedName.endsWith('.xlsx')) return 'hudl';
  if (normalizedName.endsWith('.csv') || mimeType === 'text/csv') return 'csv';
  return 'manual_import';
}

function buildSeededFilmReviewTimeline(params: {
  readonly uploadMode: TeamFilmReviewUploadMode;
  readonly sources: readonly TeamFilmReviewSourceVideo[];
  readonly fallbackDurationSec?: number;
}): readonly TeamFilmReviewPlaySegment[] {
  if (params.sources.length === 0) return [];

  if (params.uploadMode === 'batch_clips') {
    return params.sources.map((source, index) => ({
      id: `play-${source.id}`,
      number: index + 1,
      label: `Clip ${index + 1}`,
      startSec: 0,
      endSec: Math.max(1, source.durationSec ?? 1),
      sourceId: source.id,
    }));
  }

  const primarySource = params.sources[0] as TeamFilmReviewSourceVideo;
  return [
    {
      id: `play-${primarySource.id}`,
      number: 1,
      label: primarySource.title?.trim() || 'Full Footage',
      startSec: 0,
      endSec: Math.max(1, primarySource.durationSec ?? params.fallbackDurationSec ?? 1),
      sourceId: primarySource.id,
    },
  ];
}

function normalizeImportedBreakdownTimeline(
  review: Pick<TeamFilmReviewDoc, 'uploadMode' | 'sources' | 'timeline'>,
  parsedTimeline: readonly TeamFilmReviewPlaySegment[],
  parsedWarnings: readonly string[]
): {
  readonly timeline: readonly TeamFilmReviewPlaySegment[];
  readonly warnings: readonly string[];
} {
  const sources = review.sources ?? [];
  if (review.uploadMode !== 'batch_clips' || sources.length <= 1) {
    return { timeline: parsedTimeline, warnings: parsedWarnings };
  }

  const warnings = [...parsedWarnings];
  if (parsedTimeline.length !== sources.length) {
    warnings.push(
      parsedTimeline.length > sources.length
        ? 'The breakdown file has more rows than uploaded clips. Extra rows were ignored so playback stays matched to each uploaded video.'
        : 'The breakdown file has fewer rows than uploaded clips. Unmatched clips kept their existing placeholders so playback stays matched to each uploaded video.'
    );
  }

  const existingBySourceId = new Map(
    (review.timeline ?? [])
      .filter((segment) => segment.sourceId?.trim())
      .map((segment) => [segment.sourceId!.trim(), segment] as const)
  );

  const timeline = sources.map((source, index) => {
    const imported = parsedTimeline[index] ?? null;
    if (!imported) {
      const existing = existingBySourceId.get(source.id.trim());
      return existing
        ? { ...existing, number: index + 1, sourceId: source.id }
        : {
            id: `play-${source.id}`,
            number: index + 1,
            label: source.title?.trim() || `Clip ${index + 1}`,
            startSec: 0,
            endSec: Math.max(1, source.durationSec ?? 1),
            sourceId: source.id,
          };
    }

    const importedDuration = Math.max(1, imported.endSec - imported.startSec);
    const sourceDuration =
      typeof source.durationSec === 'number' && Number.isFinite(source.durationSec)
        ? Math.max(1, source.durationSec)
        : null;

    return {
      ...imported,
      id: imported.id?.trim() || `play-${source.id}`,
      number: index + 1,
      label: imported.label.trim() || source.title?.trim() || `Clip ${index + 1}`,
      startSec: 0,
      endSec: sourceDuration ?? importedDuration,
      sourceId: source.id,
    };
  });

  return { timeline, warnings };
}

function buildSyntheticFilmReviewAi(
  review: TeamFilmReviewDoc
): Pick<TeamFilmReviewDoc, 'aiSummary' | 'aiTags' | 'keyInsights'> {
  const duration = Math.max(review.durationSec ?? 0, 1);
  const quarter = Math.max(Math.floor(duration / 4), 10);
  const labels: readonly {
    readonly label: string;
    readonly category: TeamFilmReviewTagCategory;
  }[] = [
    { label: 'Opening Sequence', category: 'execution' },
    { label: 'Transition Window', category: 'transition' },
    { label: 'Defensive Pressure', category: 'defense' },
    { label: 'Late-Game Decisions', category: 'decision' },
  ];

  const aiTags: TeamFilmReviewTimelineTag[] = labels.map((item, index) => {
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
  });

  return {
    aiSummary:
      'Agent X identified core momentum swings, decision quality patterns, and defensive communication trends across this film session.',
    aiTags,
    keyInsights: [
      'Momentum shifts were strongest in transition windows.',
      'Execution quality dropped under late-clock pressure.',
      'Defensive communication improved after halftime adjustments.',
    ],
  };
}

async function getAuthorizedTeam(
  req: Request,
  teamId: string,
  mode: 'read' | 'manage'
): Promise<
  | {
      ok: true;
      db: NonNullable<Request['firebase']>['db'];
      authUid: string;
      teamData: Record<string, unknown>;
      access: Awaited<ReturnType<typeof resolveTeamScopedAccessContext>>;
    }
  | { ok: false; status: number; error: string }
> {
  const auth = getAuthUser(req);
  if (!auth) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const db = req.firebase?.db;
  if (!db) {
    return { ok: false, status: 500, error: 'Firestore unavailable' };
  }

  const teamDoc = await db.collection('Teams').doc(teamId).get();
  if (!teamDoc.exists) {
    return { ok: false, status: 404, error: 'Team not found' };
  }

  const teamData = (teamDoc.data() ?? {}) as Record<string, unknown>;
  const access = await resolveTeamScopedAccessContext(db, auth.uid, teamId, teamData);
  const canManage = access.manageKeys.includes(buildAclTeamManagerKey(teamId));
  const canRead = canManage || access.readKeys.includes(buildAclTeamKey(teamId));

  const authorized = mode === 'read' ? canRead : canManage;

  if (!authorized) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, db, authUid: auth.uid, teamData, access };
}

function toTeamFileFolderDoc(docId: string, data: Record<string, unknown>): TeamFileFolderDoc {
  const readAccessKeys = getStringArray(data['readAccessKeys']);
  const writeAccessKeys = getStringArray(data['writeAccessKeys']);

  return {
    id: docId,
    teamId: String(data['teamId'] ?? ''),
    ...(typeof data['organizationId'] === 'string'
      ? { organizationId: data['organizationId'] }
      : {}),
    name: String(data['name'] ?? 'Untitled folder'),
    normalizedName: String(data['normalizedName'] ?? '')
      .trim()
      .toLowerCase(),
    ...(typeof data['parentId'] === 'string' ? { parentId: data['parentId'] } : {}),
    sortOrder: Number(data['sortOrder'] ?? 0),
    createdByUserId: String(data['createdByUserId'] ?? ''),
    ...(getFileFolderAcl(data) ? { acl: getFileFolderAcl(data) ?? undefined } : {}),
    ...(readAccessKeys.length > 0 ? { readAccessKeys } : {}),
    ...(writeAccessKeys.length > 0 ? { writeAccessKeys } : {}),
    createdAt: toPortableTimestamp(data['createdAt']),
    updatedAt: toPortableTimestamp(data['updatedAt']),
  } satisfies TeamFileFolderDoc;
}

function buildSharedPrincipalAccessKey(
  principalType: 'user' | 'team' | 'organization',
  principalId: string
): string {
  switch (principalType) {
    case 'user':
      return toUserAccessKey(principalId);
    case 'team':
      return toTeamAccessKey(principalId);
    case 'organization':
      return toOrganizationAccessKey(principalId);
  }
}

async function assertFolderParentIsValid(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly teamId: string;
  readonly folderId?: string;
  readonly parentId: string | null;
}): Promise<void> {
  const parentId = params.parentId?.trim() || null;
  if (!parentId) {
    return;
  }

  if (params.folderId && parentId === params.folderId) {
    throw new Error('Folder cannot be its own parent');
  }

  const parentDoc = await params.db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(parentId).get();
  if (!parentDoc.exists) {
    throw new Error('Parent folder not found');
  }

  const parentData = parentDoc.data() ?? {};
  if (String(parentData['teamId'] ?? '') !== params.teamId) {
    throw new Error('Parent folder does not belong to this team');
  }

  if (!params.folderId) {
    return;
  }

  let currentParentId = typeof parentData['parentId'] === 'string' ? parentData['parentId'] : null;
  while (currentParentId) {
    if (currentParentId === params.folderId) {
      throw new Error('Folder cannot be moved inside its own tree');
    }
    const currentParentDoc = await params.db
      .collection(TEAM_FILE_FOLDERS_COLLECTION)
      .doc(currentParentId)
      .get();
    if (!currentParentDoc.exists) {
      break;
    }
    const currentParentData = currentParentDoc.data() ?? {};
    currentParentId =
      typeof currentParentData['parentId'] === 'string' ? currentParentData['parentId'] : null;
  }
}

async function resolveNextFolderSortOrder(
  db: NonNullable<Request['firebase']>['db'],
  teamId: string | null,
  ownerUserId: string,
  parentId: string | null
): Promise<number> {
  const snapshot = teamId
    ? await db.collection(TEAM_FILE_FOLDERS_COLLECTION).where('teamId', '==', teamId).get()
    : await db
        .collection(TEAM_FILE_FOLDERS_COLLECTION)
        .where('createdByUserId', '==', ownerUserId)
        .get();

  const siblingSortOrders = snapshot.docs
    .map((doc) => doc.data())
    .filter((data) => {
      const value = typeof data['parentId'] === 'string' ? data['parentId'] : null;
      return value === (parentId?.trim() || null);
    })
    .map((data) => Number(data['sortOrder'] ?? 0))
    .filter((value) => Number.isFinite(value));

  return siblingSortOrders.length > 0 ? Math.max(...siblingSortOrders) + 1 : 0;
}

function toStableStarterFolderId(ownerUserId: string, folderName: string): string {
  const slug = folderName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `user-${ownerUserId}-starter-${slug || 'folder'}`;
}

async function ensurePersonalStarterFolders(params: {
  readonly db: NonNullable<Request['firebase']>['db'];
  readonly ownerUserId: string;
  readonly role?: string | null;
}): Promise<void> {
  const snapshot = await params.db
    .collection(TEAM_FILE_FOLDERS_COLLECTION)
    .where('createdByUserId', '==', params.ownerUserId)
    .limit(250)
    .get();

  const hasAnyPersonalFolder = snapshot.docs.some((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return !normalizeOptionalString(data['teamId']);
  });

  if (hasAnyPersonalFolder) {
    return;
  }

  const ownerAccess = createOwnerPrivateAccessLists({ ownerUserId: params.ownerUserId });
  const now = new Date().toISOString();
  const normalizedRole = typeof params.role === 'string' ? params.role.trim().toLowerCase() : '';
  const starterFolders =
    normalizedRole === 'coach' || normalizedRole === 'director'
      ? COACH_DIRECTOR_STARTER_FOLDERS
      : ATHLETE_STARTER_FOLDERS;

  await Promise.all(
    starterFolders.map((folderName, index) =>
      params.db
        .collection(TEAM_FILE_FOLDERS_COLLECTION)
        .doc(toStableStarterFolderId(params.ownerUserId, folderName))
        .set(
          {
            name: folderName,
            normalizedName: folderName.toLowerCase(),
            sortOrder: index,
            createdByUserId: params.ownerUserId,
            readAccessKeys: ownerAccess.readAccessKeys,
            writeAccessKeys: ownerAccess.writeAccessKeys,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        )
    )
  );
}

router.get('/files/universal', appGuard, async (req: Request, res: Response) => {
  try {
    const parsedQuery = TeamUniversalFilesListQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid universal files query',
        issues: parsedQuery.error.issues,
      });
      return;
    }

    const { teamId, classification, route, label } = parsedQuery.data;
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    if (teamId) {
      const authorizedTeam = await getAuthorizedTeam(req, teamId, 'read');
      if (!authorizedTeam.ok) {
        res.status(authorizedTeam.status).json({ success: false, error: authorizedTeam.error });
        return;
      }
    }

    const userProfileSnap = await db.collection('Users').doc(auth.uid).get();
    const userRole =
      typeof userProfileSnap.data()?.['role'] === 'string'
        ? String(userProfileSnap.data()?.['role'])
        : null;

    const grantedAccessKeys = buildGrantedAccessKeys(await resolveFileAccessContext(db, auth.uid));
    const bucket = req.firebase!.storage.bucket();

    if (!teamId) {
      await ensurePersonalStarterFolders({
        db,
        ownerUserId: auth.uid,
        role: userRole,
      });
    }

    const [universalFileSnapshot, folderSnapshot] = await Promise.all([
      db.collection(UNIVERSAL_FILES_COLLECTION).limit(250).get(),
      db.collection(TEAM_FILE_FOLDERS_COLLECTION).limit(250).get(),
    ]);

    const files = await Promise.all(
      universalFileSnapshot.docs.map(async (doc) => {
        const data = doc.data() as Record<string, unknown>;
        if (
          !canReadAccessControlledRecord(data, {
            grantedAccessKeys,
            acl: getUniversalFileAcl(data),
          })
        ) {
          return null;
        }

        const resolvedTeamId = normalizeOptionalString(data['teamId']) ?? null;
        if (teamId && resolvedTeamId !== teamId) {
          return null;
        }

        const universalFile = toUniversalFileDoc(doc.id, resolvedTeamId, data);
        if (universalFile.type !== 'file' || universalFile.payloadKind === 'pointer') {
          return universalFile;
        }

        if (!isUniversalBinaryFilePayload(universalFile.payload)) {
          return withInlineTextAssetForListing(universalFile);
        }

        return refreshUniversalFileDisplayAssets({
          bucket,
          db,
          file: universalFile,
          logScope: 'listing',
        });
      })
    );

    const allFiles = files
      .filter((file): file is UniversalFileDoc => file !== null)
      .filter((file) =>
        matchesUniversalFileClassificationFilters(file, {
          classification,
          route,
          label,
        })
      );

    allFiles.sort((left: UniversalFileDoc, right: UniversalFileDoc) =>
      compareTeamFilesByUpdatedAtDesc(left, right)
    );

    const folders = folderSnapshot.docs
      .filter((doc) =>
        canReadAccessControlledRecord(doc.data() as Record<string, unknown>, {
          grantedAccessKeys,
          acl: getFileFolderAcl(doc.data() as Record<string, unknown>),
        })
      )
      .map((doc) => toTeamFileFolderDoc(doc.id, doc.data() as Record<string, unknown>))
      .filter((folder) => {
        const folderTeamId = normalizeOptionalString(folder.teamId) ?? null;
        return !teamId || folderTeamId === teamId;
      })
      .sort(compareTeamFileFolders);

    res.json({ success: true, data: { files: allFiles, folders } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to list Universal Files', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to list universal files' });
  }
});

router.get('/files/universal/search', appGuard, async (req: Request, res: Response) => {
  try {
    const parsedQuery = TeamFileSemanticSearchQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid search query',
        issues: parsedQuery.error.issues,
      });
      return;
    }

    const { teamId, q, classification, route, label, includeArchived, limit } = parsedQuery.data;
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    if (teamId) {
      const authorizedTeam = await getAuthorizedTeam(req, teamId, 'read');
      if (!authorizedTeam.ok) {
        res.status(authorizedTeam.status).json({ success: false, error: authorizedTeam.error });
        return;
      }
    }

    const semanticService = new UniversalFileSemanticService(db);
    const results = await semanticService.search({ teamId, userId: auth.uid }, q, {
      topK: limit ?? 12,
      classification,
      route,
      label,
      includeArchived,
    });

    res.json({ success: true, data: { results } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to search Universal Files semantically', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to search universal files' });
  }
});

router.get('/files/:fileId', appGuard, async (req: Request, res: Response) => {
  try {
    const parsedQuery = TeamUniversalFileQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid file query',
        issues: parsedQuery.error.issues,
      });
      return;
    }

    const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }

    const { disposition } = parsedQuery.data;
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const grantedAccessKeys = buildGrantedAccessKeys(await resolveFileAccessContext(db, auth.uid));
    const bucket = req.firebase!.storage.bucket();
    const fileDoc = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId).get();
    if (!fileDoc.exists) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const fileData = fileDoc.data() as Record<string, unknown>;
    const resolvedTeamId = normalizeOptionalString(fileData['teamId']) ?? null;

    if (
      !canReadAccessControlledRecord(fileData, {
        grantedAccessKeys,
        acl: getUniversalFileAcl(fileData),
      })
    ) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    let universalFile = toUniversalFileDoc(fileDoc.id, resolvedTeamId, fileData);

    universalFile = await refreshUniversalFileDisplayAssets({
      bucket,
      db,
      file: universalFile,
      disposition,
      fileName: universalFile.title,
      logScope: 'single',
    });

    res.json({ success: true, data: { file: universalFile } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to fetch Universal File', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to fetch file' });
  }
});

router.post('/files/index', appGuard, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const parsedBody = TeamFileIndexBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        issues: parsedBody.error.issues,
      });
      return;
    }

    const body = parsedBody.data;
    if (body.uploadTarget === 'film_review' && body.attachment.type !== 'video') {
      res.status(400).json({
        success: false,
        error: 'Film Review uploads require a video file',
      });
      return;
    }

    const normalizedTeamId = null;

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, auth.uid);

    const folderId = body.folderId?.trim() || null;
    if (folderId) {
      const folderDoc = await db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId).get();
      const folderData = (folderDoc.data() ?? {}) as Record<string, unknown>;
      if (!folderDoc.exists) {
        res.status(404).json({ success: false, error: 'Folder not found' });
        return;
      }
      const folderTeamId = normalizeOptionalString(folderData['teamId']) ?? '';
      const canWriteFolder = await canWriteAccessControlledRecord({
        db,
        authUid: auth.uid,
        teamId: folderTeamId,
        data: folderData,
        acl: getFileFolderAcl(folderData),
        grantedAccessKeys,
      });
      if (!canWriteFolder) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
    }

    const inherited = await resolveInheritedFolderAcl({
      db,
      teamId: normalizedTeamId,
      parentId: folderId,
      ownerUserId: auth.uid,
      organizationId: undefined,
    });

    const fileId = await upsertTeamFileFromAttachment({
      db,
      teamId: null,
      userId: auth.uid,
      attachment: body.attachment as AgentXAttachment,
      origin: 'files_upload',
      folderId,
      organizationId: inherited.organizationId,
      acl: inherited.acl ?? undefined,
      readAccessKeys: inherited.readAccessKeys,
      writeAccessKeys: inherited.writeAccessKeys,
      sport: body.sport,
      uploadTarget: body.uploadTarget,
    });

    const indexedFileDoc = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId).get();
    if (indexedFileDoc.exists) {
      let indexedFile = toUniversalFileDoc(
        indexedFileDoc.id,
        normalizeOptionalString((indexedFileDoc.data() ?? {})['teamId']) ?? null,
        (indexedFileDoc.data() ?? {}) as Record<string, unknown>
      );

      if (body.uploadTarget === 'film_review' && body.attachment.type === 'video') {
        if (!toTeamFilmReviewDocFromUniversalFile(indexedFile)) {
          const nextReview = buildNativeFilmReviewFromIndexedFile({
            fileId,
            file: indexedFile as UniversalNativeFileDoc<'file'>,
            userId: auth.uid,
          });

          if (nextReview) {
            const updatedFile = await persistNativeFilmReviewDocument({
              db,
              fileId,
              file: indexedFile as UniversalNativeFileDoc<'file'>,
              review: nextReview,
            });
            indexedFile = updatedFile;
            scheduleUniversalFileSemanticSync({ db, document: updatedFile });
          }
        }
      }
    }

    res.json({ success: true, data: { fileId } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to index Team File', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: 'Failed to index file' });
  }
});

router.post('/files/promote-chat-attachment', appGuard, async (req, res) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    if (!chatService) {
      res.status(503).json({ success: false, error: 'Chat service unavailable' });
      return;
    }

    const parsedBody = TeamFilePromoteChatAttachmentBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request body',
        issues: parsedBody.error.issues,
      });
      return;
    }

    const body = parsedBody.data;
    const normalizedTeamId = body.teamId?.trim() || null;
    let teamData: Record<string, unknown> = {};
    if (normalizedTeamId) {
      const teamDoc = await db.collection('Teams').doc(normalizedTeamId).get();
      if (!teamDoc.exists) {
        res.status(404).json({ success: false, error: 'Team not found' });
        return;
      }
      teamData = (teamDoc.data() ?? {}) as Record<string, unknown>;
    }

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, auth.uid);

    const folderId = body.folderId?.trim() || null;
    await assertFolderParentIsValid({
      db,
      teamId: normalizedTeamId ?? '',
      parentId: folderId,
    });
    if (folderId) {
      const folderDoc = await db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId).get();
      const folderData = (folderDoc.data() ?? {}) as Record<string, unknown>;
      const folderTeamId = normalizeOptionalString(folderData['teamId']) ?? null;
      const canWriteFolder =
        folderDoc.exists &&
        folderTeamId === normalizedTeamId &&
        (await canWriteAccessControlledRecord({
          db,
          authUid: auth.uid,
          teamId: folderTeamId ?? '',
          data: folderData,
          acl: getFileFolderAcl(folderData),
          grantedAccessKeys,
        }));
      if (!canWriteFolder) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
    } else if (normalizedTeamId) {
      const access = await resolveTeamScopedAccessContext(db, auth.uid, normalizedTeamId, teamData);
      const canReadTeam =
        access.manageKeys.includes(buildAclTeamManagerKey(normalizedTeamId)) ||
        access.readKeys.includes(buildAclTeamKey(normalizedTeamId));
      if (!canReadTeam) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
    }

    const inherited = await resolveInheritedFolderAcl({
      db,
      teamId: normalizedTeamId,
      parentId: folderId,
      ownerUserId: auth.uid,
      organizationId: normalizeOptionalString(teamData['organizationId']) ?? undefined,
    });

    const message = await chatService.getMessageById(body.messageId, auth.uid);
    if (!message) {
      res.status(404).json({ success: false, error: 'Message not found' });
      return;
    }

    const attachment = message.attachments?.find((item) => item.id === body.attachmentId) ?? null;
    if (!attachment) {
      res.status(404).json({ success: false, error: 'Attachment not found on message' });
      return;
    }

    const storageInstance = req.firebase?.storage;
    const bucket = storageInstance?.bucket();
    const resolvedAttachment =
      bucket && storageInstance
        ? await refreshAttachmentUrl(attachment as AgentXAttachment, bucket.name, storageInstance)
        : (attachment as AgentXAttachment);
    const fileAttachment = bucket
      ? await promoteAttachmentForTeamFiles({
          bucket,
          userId: auth.uid,
          attachment: resolvedAttachment,
        })
      : resolvedAttachment;

    const fileId = await upsertTeamFileFromAttachment({
      db,
      teamId: normalizedTeamId,
      userId: auth.uid,
      attachment: fileAttachment,
      origin: resolveChatAttachmentOrigin(message.role),
      folderId,
      organizationId: inherited.organizationId,
      acl: inherited.acl ?? undefined,
      readAccessKeys: inherited.readAccessKeys,
      writeAccessKeys: inherited.writeAccessKeys,
      sport: body.sport,
      sourceThreadId: message.threadId,
      sourceMessageId: message.id,
      sourceOperationId: message.operationId,
    });

    res.json({ success: true, data: { fileId } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to promote chat attachment into files', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to add chat attachment to files' });
  }
});

router.post('/files/folders', appGuard, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const parsedBody = TeamFileFolderCreateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    let normalizedTeamId: string | null = null;

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, auth.uid);
    const parentId = body.parentId?.trim() || null;
    if (parentId) {
      const parentDoc = await db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(parentId).get();
      const parentData = (parentDoc.data() ?? {}) as Record<string, unknown>;
      if (!parentDoc.exists) {
        res.status(404).json({ success: false, error: 'Parent folder not found' });
        return;
      }
      const parentTeamId = normalizeOptionalString(parentData['teamId']) ?? '';
      normalizedTeamId = parentTeamId || null;
      const canWriteParent = await canWriteAccessControlledRecord({
        db,
        authUid: auth.uid,
        teamId: parentTeamId,
        data: parentData,
        acl: getFileFolderAcl(parentData),
        grantedAccessKeys,
      });
      if (!canWriteParent) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
    }

    const inherited = await resolveInheritedFolderAcl({
      db,
      teamId: normalizedTeamId,
      parentId,
      ownerUserId: auth.uid,
      organizationId: undefined,
    });

    const folderId = body.id?.trim() || randomUUID();
    const sortOrder = await resolveNextFolderSortOrder(
      db,
      normalizedTeamId ?? null,
      auth.uid,
      parentId
    );
    const now = new Date().toISOString();

    await db
      .collection(TEAM_FILE_FOLDERS_COLLECTION)
      .doc(folderId)
      .set({
        ...(normalizedTeamId ? { teamId: normalizedTeamId } : {}),
        ...(inherited.organizationId ? { organizationId: inherited.organizationId } : {}),
        name: body.name.trim(),
        normalizedName: body.name.trim().toLowerCase(),
        ...(parentId ? { parentId } : {}),
        sortOrder,
        createdByUserId: auth.uid,
        ...(inherited.acl ? { acl: inherited.acl } : {}),
        readAccessKeys: inherited.readAccessKeys,
        writeAccessKeys: inherited.writeAccessKeys,
        createdAt: now,
        updatedAt: now,
      });

    res.json({
      success: true,
      data: {
        folder: {
          id: folderId,
          ...(normalizedTeamId ? { teamId: normalizedTeamId } : {}),
          ...(inherited.organizationId ? { organizationId: inherited.organizationId } : {}),
          name: body.name.trim(),
          normalizedName: body.name.trim().toLowerCase(),
          ...(parentId ? { parentId } : {}),
          sortOrder,
          createdByUserId: auth.uid,
          ...(inherited.acl ? { acl: inherited.acl } : {}),
          readAccessKeys: inherited.readAccessKeys,
          writeAccessKeys: inherited.writeAccessKeys,
          createdAt: now,
          updatedAt: now,
        } as TeamFileFolderDoc,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create Team File folder', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to create folder' });
  }
});

router.patch('/files/folders/:folderId', appGuard, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const folderId =
      typeof req.params['folderId'] === 'string' ? req.params['folderId'].trim() : '';
    if (!folderId) {
      res.status(400).json({ success: false, error: 'folderId is required' });
      return;
    }

    const parsedBody = TeamFileFolderUpdateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, auth.uid);
    const folderRef = db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId);
    const folderDoc = await folderRef.get();
    if (!folderDoc.exists) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }

    const existingData = folderDoc.data() ?? {};
    const existingTeamId = normalizeOptionalString(existingData['teamId']);
    const existingAcl = getFileFolderAcl(existingData);
    const canWriteFolder = await canWriteAccessControlledRecord({
      db,
      authUid: auth.uid,
      teamId: existingTeamId ?? '',
      data: existingData as Record<string, unknown>,
      acl: existingAcl,
      grantedAccessKeys,
    });
    if (!canWriteFolder) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const nextParentId =
      body.parentId === undefined
        ? typeof existingData['parentId'] === 'string'
          ? existingData['parentId']
          : null
        : body.parentId?.trim() || null;
    if (
      nextParentId &&
      nextParentId !==
        (typeof existingData['parentId'] === 'string' ? existingData['parentId'] : null)
    ) {
      const parentDoc = await db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(nextParentId).get();
      const parentData = (parentDoc.data() ?? {}) as Record<string, unknown>;
      if (!parentDoc.exists) {
        res.status(404).json({ success: false, error: 'Parent folder not found' });
        return;
      }
      const parentTeamId = normalizeOptionalString(parentData['teamId']) ?? '';
      const canWriteParent = await canWriteAccessControlledRecord({
        db,
        authUid: auth.uid,
        teamId: parentTeamId,
        data: parentData,
        acl: getFileFolderAcl(parentData),
        grantedAccessKeys,
      });
      if (!canWriteParent) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
    }

    const nextName = body.name?.trim() || String(existingData['name'] ?? 'Untitled folder');
    const nextSortOrder = body.sortOrder ?? Number(existingData['sortOrder'] ?? 0);
    const now = new Date().toISOString();

    await folderRef.set(
      {
        name: nextName,
        normalizedName: nextName.toLowerCase(),
        parentId: nextParentId,
        sortOrder: nextSortOrder,
        updatedAt: now,
      },
      { merge: true }
    );

    res.json({
      success: true,
      data: {
        folder: {
          id: folderId,
          ...(existingTeamId ? { teamId: existingTeamId } : {}),
          ...(typeof existingData['organizationId'] === 'string'
            ? { organizationId: existingData['organizationId'] }
            : {}),
          name: nextName,
          normalizedName: nextName.toLowerCase(),
          ...(nextParentId ? { parentId: nextParentId } : {}),
          sortOrder: nextSortOrder,
          createdByUserId: String(existingData['createdByUserId'] ?? ''),
          ...(existingAcl ? { acl: existingAcl } : {}),
          ...(getStringArray(existingData['readAccessKeys']).length > 0
            ? { readAccessKeys: getStringArray(existingData['readAccessKeys']) }
            : {}),
          ...(getStringArray(existingData['writeAccessKeys']).length > 0
            ? { writeAccessKeys: getStringArray(existingData['writeAccessKeys']) }
            : {}),
          createdAt: toPortableTimestamp(existingData['createdAt']),
          updatedAt: now,
        } as TeamFileFolderDoc,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update Team File folder', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to update folder' });
  }
});

router.delete('/files/folders/:folderId', appGuard, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const folderId =
      typeof req.params['folderId'] === 'string' ? req.params['folderId'].trim() : '';
    if (!folderId) {
      res.status(400).json({ success: false, error: 'folderId is required' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, auth.uid);
    const folderRef = db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId);
    const folderDoc = await folderRef.get();
    if (!folderDoc.exists) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }

    const folderData = folderDoc.data() ?? {};
    const existingTeamId = normalizeOptionalString(folderData['teamId']);

    const folderAcl = getFileFolderAcl(folderData);
    const canWriteFolder = await canWriteAccessControlledRecord({
      db,
      authUid: auth.uid,
      teamId: existingTeamId ?? '',
      data: folderData as Record<string, unknown>,
      acl: folderAcl,
      grantedAccessKeys,
    });
    if (!canWriteFolder) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const now = new Date().toISOString();
    const [childFoldersSnapshot, filesSnapshot] = await Promise.all(
      existingTeamId
        ? [
            db
              .collection(TEAM_FILE_FOLDERS_COLLECTION)
              .where('teamId', '==', existingTeamId)
              .where('parentId', '==', folderId)
              .get(),
            db
              .collection(UNIVERSAL_FILES_COLLECTION)
              .where('teamId', '==', existingTeamId)
              .where('folderId', '==', folderId)
              .get(),
          ]
        : [
            db
              .collection(TEAM_FILE_FOLDERS_COLLECTION)
              .where('createdByUserId', '==', auth.uid)
              .where('parentId', '==', folderId)
              .get(),
            db
              .collection(UNIVERSAL_FILES_COLLECTION)
              .where('createdByUserId', '==', auth.uid)
              .where('folderId', '==', folderId)
              .get(),
          ]
    );

    const batch = db.batch();
    batch.delete(folderRef);

    for (const childDoc of childFoldersSnapshot.docs) {
      batch.set(childDoc.ref, { parentId: null, updatedAt: now }, { merge: true });
    }

    for (const fileDoc of filesSnapshot.docs) {
      batch.set(
        fileDoc.ref,
        { folderId: null, updatedByUserId: auth.uid, updatedAt: now },
        { merge: true }
      );
    }

    await batch.commit();

    res.json({
      success: true,
      data: {
        deletedFolderId: folderId,
        unassignedFileCount: filesSnapshot.size,
        reparentedFolderCount: childFoldersSnapshot.size,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to delete Team File folder', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to delete folder' });
  }
});

router.get('/files/universal/share-candidates', appGuard, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parsedQuery = TeamFileShareCandidatesQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid query params',
        issues: parsedQuery.error.issues,
      });
      return;
    }

    const { teamId, organizationId, q, limit } = parsedQuery.data;
    if (!teamId && !organizationId) {
      res.status(400).json({ success: false, error: 'teamId or organizationId is required' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const accessContext = await resolveFileAccessContext(db, auth.uid);
    if (teamId && !accessContext.teamIds.includes(teamId)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    if (organizationId && !accessContext.organizationIds.includes(organizationId)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const rosterService = new RosterEntryService(db);
    const candidates = new Map<string, AgentFileShareCandidateRecord>();

    const upsertCandidate = (
      member: {
        readonly userId: string;
        readonly displayName?: string;
        readonly firstName?: string;
        readonly lastName?: string;
        readonly email?: string;
        readonly profileImgs?: readonly string[];
        readonly teamId?: string;
        readonly organizationId?: string;
      },
      scope: 'team' | 'organization'
    ): void => {
      if (!member.userId || member.userId === auth.uid) {
        return;
      }

      const existing = candidates.get(member.userId);
      const nextScopes = new Set(existing?.sourceScopes ?? []);
      nextScopes.add(scope);
      const nextTeamIds = new Set(existing?.teamIds ?? []);
      if (member.teamId) {
        nextTeamIds.add(member.teamId);
      }
      const nextOrganizationIds = new Set(existing?.organizationIds ?? []);
      if (member.organizationId) {
        nextOrganizationIds.add(member.organizationId);
      }

      candidates.set(member.userId, {
        id: member.userId,
        displayName: existing?.displayName ?? toShareCandidateDisplayName(member),
        avatarUrl:
          existing?.avatarUrl ??
          (Array.isArray(member.profileImgs) && typeof member.profileImgs[0] === 'string'
            ? member.profileImgs[0]
            : null),
        email: existing?.email ?? normalizeQueryString(member.email) ?? null,
        sourceScopes: [...nextScopes],
        teamIds: [...nextTeamIds],
        organizationIds: [...nextOrganizationIds],
      });
    };

    if (teamId) {
      const teamMembers = await rosterService.getTeamRoster({ teamId });
      for (const member of teamMembers) {
        upsertCandidate(member, 'team');
      }
    }

    if (organizationId) {
      const organizationMembers = await rosterService.getOrganizationMembers({ organizationId });
      for (const member of organizationMembers) {
        upsertCandidate(member, 'organization');
      }
    }

    const results = [...candidates.values()]
      .filter((candidate) => matchesShareCandidateQuery(candidate, q))
      .sort((left, right) => {
        const leftTeamScoped = left.sourceScopes.includes('team') ? 0 : 1;
        const rightTeamScoped = right.sourceScopes.includes('team') ? 0 : 1;
        return (
          leftTeamScoped - rightTeamScoped || left.displayName.localeCompare(right.displayName)
        );
      })
      .slice(0, limit ?? 50);

    res.json({
      success: true,
      data: {
        candidates: results,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to load file share candidates', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to load share candidates' });
  }
});

router.post('/files/folders/:folderId/share', appGuard, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const folderId =
      typeof req.params['folderId'] === 'string' ? req.params['folderId'].trim() : '';
    if (!folderId) {
      res.status(400).json({ success: false, error: 'folderId is required' });
      return;
    }

    const parsedBody = TeamFileShareBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const folderRef = db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId);
    const folderDoc = await folderRef.get();
    if (!folderDoc.exists) {
      res.status(404).json({ success: false, error: 'Folder not found' });
      return;
    }

    const folderData = (folderDoc.data() ?? {}) as Record<string, unknown>;
    const ownerUserId = normalizeQueryString(folderData['createdByUserId']);
    if (!ownerUserId || ownerUserId !== auth.uid) {
      res.status(403).json({ success: false, error: 'Only the folder owner can update sharing' });
      return;
    }

    const body = parsedBody.data;
    const folderTeamId = normalizeQueryString(folderData['teamId']);
    const folderOrganizationId = normalizeQueryString(folderData['organizationId']);
    if (body.principalType === 'team' && body.principalId !== folderTeamId) {
      res.status(400).json({ success: false, error: 'Team share must match the folder team' });
      return;
    }

    if (body.principalType === 'organization') {
      if (!folderOrganizationId || body.principalId !== folderOrganizationId) {
        res.status(400).json({
          success: false,
          error: 'Organization share must match the folder organization',
        });
        return;
      }
    }

    const ownerAccess = createOwnerPrivateAccessLists({ ownerUserId });
    const folderAcl = getFileFolderAcl(folderData);
    const explicitReadAccessKeys = getStringArray(folderData['readAccessKeys']);
    const explicitWriteAccessKeys = getStringArray(folderData['writeAccessKeys']);
    const currentReadAccessKeys =
      explicitReadAccessKeys.length > 0
        ? explicitReadAccessKeys
        : (() => {
            const aclKeys = getAclReadAccessKeys(folderAcl);
            if (aclKeys.length > 0) {
              return [...new Set([...ownerAccess.readAccessKeys, ...aclKeys])];
            }

            const legacyKeys = getLegacyReadAccessKeys(folderData);
            return legacyKeys.length > 0
              ? [...new Set([...ownerAccess.readAccessKeys, ...legacyKeys])]
              : ownerAccess.readAccessKeys;
          })();
    const currentWriteAccessKeys =
      explicitWriteAccessKeys.length > 0
        ? explicitWriteAccessKeys
        : (() => {
            const legacyKeys = getLegacyWriteAccessKeys(folderData);
            return legacyKeys.length > 0
              ? [...new Set([...ownerAccess.writeAccessKeys, ...legacyKeys])]
              : ownerAccess.writeAccessKeys;
          })();

    const principalKey = buildSharedPrincipalAccessKey(body.principalType, body.principalId);
    const wasDirectlyReadable = currentReadAccessKeys.includes(principalKey);
    const nextReadAccessKeys =
      body.action === 'remove'
        ? [...new Set(currentReadAccessKeys.filter((key) => key !== principalKey))]
        : [...new Set([...currentReadAccessKeys, principalKey])];
    const nextWriteAccessKeys =
      body.action === 'remove'
        ? [...new Set(currentWriteAccessKeys.filter((key) => key !== principalKey))]
        : body.permission === 'write'
          ? [...new Set([...currentWriteAccessKeys, principalKey])]
          : [...new Set(currentWriteAccessKeys.filter((key) => key !== principalKey))];
    const ownerPinnedReadAccessKeys = [
      ...new Set([...ownerAccess.readAccessKeys, ...nextReadAccessKeys]),
    ];
    const ownerPinnedWriteAccessKeys = [
      ...new Set([...ownerAccess.writeAccessKeys, ...nextWriteAccessKeys]),
    ];
    const ownerPinnedCurrentReadAccessKeys = [
      ...new Set([...ownerAccess.readAccessKeys, ...currentReadAccessKeys]),
    ];
    const ownerPinnedCurrentWriteAccessKeys = [
      ...new Set([...ownerAccess.writeAccessKeys, ...currentWriteAccessKeys]),
    ];
    const updatedAt = new Date().toISOString();

    await folderRef.set(
      {
        readAccessKeys: ownerPinnedReadAccessKeys,
        writeAccessKeys: ownerPinnedWriteAccessKeys,
        updatedByUserId: auth.uid,
        updatedAt,
      },
      { merge: true }
    );

    await propagateInheritedFolderShareAccess({
      db,
      folderId,
      previousAccess: {
        readAccessKeys: ownerPinnedCurrentReadAccessKeys,
        writeAccessKeys: ownerPinnedCurrentWriteAccessKeys,
      },
      nextAccess: {
        readAccessKeys: ownerPinnedReadAccessKeys,
        writeAccessKeys: ownerPinnedWriteAccessKeys,
      },
      updatedByUserId: auth.uid,
      updatedAt,
    });

    if (
      body.action === 'add' &&
      body.principalType === 'user' &&
      body.principalId !== auth.uid &&
      !wasDirectlyReadable
    ) {
      void notifyDirectFileShare(db, {
        resourceType: 'folder',
        resourceId: folderId,
        resourceName: String(folderData['name'] ?? 'Untitled folder'),
        teamId: folderTeamId ?? undefined,
        organizationId: folderOrganizationId ?? undefined,
        recipientUserId: body.principalId,
        sharerUserId: auth.uid,
        sharerName: auth.displayName,
        sharerAvatarUrl: auth.photoURL,
        permission: body.permission,
      }).catch(() => undefined);
    }

    res.json({
      success: true,
      data: {
        folder: {
          id: folderId,
          teamId: folderTeamId ?? '',
          ...(folderOrganizationId ? { organizationId: folderOrganizationId } : {}),
          name: String(folderData['name'] ?? 'Untitled folder'),
          normalizedName: String(folderData['normalizedName'] ?? '')
            .trim()
            .toLowerCase(),
          ...(typeof folderData['parentId'] === 'string'
            ? { parentId: folderData['parentId'] }
            : {}),
          sortOrder: Number(folderData['sortOrder'] ?? 0),
          createdByUserId: ownerUserId,
          ...(folderAcl ? { acl: folderAcl } : {}),
          readAccessKeys: ownerPinnedReadAccessKeys,
          writeAccessKeys: ownerPinnedWriteAccessKeys,
          createdAt: toPortableTimestamp(folderData['createdAt']),
          updatedAt,
        } satisfies TeamFileFolderDoc,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update folder sharing', { error: error.message, stack: error.stack });
    res
      .status(500)
      .json({ success: false, error: error.message || 'Failed to update folder sharing' });
  }
});

router.delete('/files/:fileId', appGuard, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const grantedAccessKeys = buildGrantedAccessKeys(await resolveFileAccessContext(db, auth.uid));
    const fileRef = db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId);
    const fileDoc = await fileRef.get();
    if (!fileDoc.exists) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const fileData = fileDoc.data() ?? {};
    const existingTeamId = normalizeOptionalString(fileData['teamId']);

    const fileAcl = getUniversalFileAcl(fileData as Record<string, unknown>);
    const canWrite = await canWriteAccessControlledRecord({
      db,
      authUid: auth.uid,
      teamId: existingTeamId ?? '',
      data: fileData as Record<string, unknown>,
      acl: fileAcl,
      grantedAccessKeys,
    });
    if (!canWrite) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const universalFile = toUniversalFileDoc(
      fileId,
      existingTeamId ?? null,
      fileData as Record<string, unknown>
    );
    const binaryPayload = getUniversalBinaryFilePayload(universalFile.payload);
    const storagePath =
      universalFile.type === 'file' &&
      universalFile.payloadKind !== 'pointer' &&
      typeof binaryPayload?.storagePath === 'string'
        ? binaryPayload.storagePath.trim() || null
        : null;

    const bucket = req.firebase?.storage?.bucket();
    if (bucket && storagePath) {
      await bucket.file(storagePath).delete({ ignoreNotFound: true });
    }

    await fileRef.delete();
    void deleteUniversalFileSemanticIndex(db, fileId).catch(() => undefined);
    res.json({ success: true, data: { fileId } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to delete file', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to delete file' });
  }
});

router.patch('/files/:fileId', appGuard, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }

    const parsedBody = TeamFileUpdateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, auth.uid);
    const fileRef = db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId);
    const fileDoc = await fileRef.get();
    if (!fileDoc.exists) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const fileData = fileDoc.data() ?? {};
    const existingTeamId = normalizeOptionalString(fileData['teamId']);

    const fileAcl = getUniversalFileAcl(fileData as Record<string, unknown>);
    const canWrite = await canWriteAccessControlledRecord({
      db,
      authUid: auth.uid,
      teamId: existingTeamId ?? '',
      data: fileData as Record<string, unknown>,
      acl: fileAcl,
      grantedAccessKeys,
    });
    if (!canWrite) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const folderId = body.folderId?.trim() || null;
    if (folderId) {
      const folderDoc = await db.collection(TEAM_FILE_FOLDERS_COLLECTION).doc(folderId).get();
      const folderData = (folderDoc.data() ?? {}) as Record<string, unknown>;
      if (
        !folderDoc.exists ||
        (normalizeOptionalString(folderData['teamId']) ?? null) !== (existingTeamId ?? null)
      ) {
        res.status(404).json({ success: false, error: 'Folder not found' });
        return;
      }
      const canWriteFolder = await canWriteAccessControlledRecord({
        db,
        authUid: auth.uid,
        teamId: existingTeamId ?? '',
        data: folderData,
        acl: getFileFolderAcl(folderData),
        grantedAccessKeys,
      });
      if (!canWriteFolder) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
    }

    const nextName = body.name?.trim() || null;
    const nextSummary = body.summary?.trim() ?? undefined;
    const nextClassificationPrimary = body.classificationPrimary?.trim() ?? undefined;
    const nextTextContent = body.textContent ?? undefined;
    const updatedAt = new Date().toISOString();

    let payloadPatch: Record<string, unknown> | null = null;
    let supportsInlineTextPayload = false;
    if (typeof fileData['payload'] === 'object' && fileData['payload']) {
      payloadPatch = {};
      const currentPayload = fileData['payload'] as Record<string, unknown>;
      supportsInlineTextPayload = Boolean(
        currentPayload['content'] || currentPayload['structured']
      );
      if (body.rawData && currentPayload['content']) {
        payloadPatch['payload.content.data'] = body.rawData;
      }
      if (body.rawData && currentPayload['structured']) {
        payloadPatch['payload.structured.structuredData'] = body.rawData;
      }
      if (nextTextContent !== undefined && currentPayload['content']) {
        payloadPatch['payload.content.text'] = nextTextContent;
      }
      if (nextTextContent !== undefined && currentPayload['structured']) {
        payloadPatch['payload.structured.textContent'] = nextTextContent;
      }
      if (Object.keys(payloadPatch).length === 0) {
        payloadPatch = null;
      }
    }

    const shouldMirrorArtifactSummary = body.summary !== undefined && !supportsInlineTextPayload;
    const shouldMirrorArtifactNotes = nextTextContent !== undefined && !supportsInlineTextPayload;

    await fileRef.update({
      ...(body.folderId !== undefined ? { folderId } : {}),
      ...(nextName
        ? {
            title: nextName,
            normalizedTitle: nextName.toLowerCase(),
          }
        : {}),
      ...(body.summary !== undefined ? { summary: nextSummary ?? '' } : {}),
      ...(shouldMirrorArtifactSummary ? { artifactSummary: nextSummary ?? '' } : {}),
      ...(body.classificationPrimary !== undefined
        ? { 'classification.primary': nextClassificationPrimary ?? '' }
        : {}),
      ...(shouldMirrorArtifactNotes ? { artifactNotes: nextTextContent ?? '' } : {}),
      ...(payloadPatch ?? {}),
      updatedByUserId: auth.uid,
      updatedAt,
    });

    if (
      nextName ||
      body.summary !== undefined ||
      body.classificationPrimary !== undefined ||
      body.textContent !== undefined ||
      payloadPatch
    ) {
      const dbSnapshot = await fileRef.get();
      const updatedDocument = toUniversalFileDoc(
        fileId,
        existingTeamId ?? null,
        dbSnapshot.data() ?? { updatedAt }
      );
      scheduleUniversalFileSemanticSync({ db, document: updatedDocument });
    }
    res.json({ success: true, data: { fileId, folderId } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update file', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, error: error.message || 'Failed to move file' });
  }
});

router.post('/files/:fileId/share', appGuard, async (req: Request, res: Response) => {
  try {
    const auth = getAuthUser(req);
    if (!auth) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }

    const parsedBody = TeamFileShareBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const fileRef = db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId);
    const fileDoc = await fileRef.get();
    if (!fileDoc.exists) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const fileData = (fileDoc.data() ?? {}) as Record<string, unknown>;
    const ownerUserId =
      normalizeQueryString(fileData['ownerUserId']) ??
      normalizeQueryString(fileData['createdByUserId']);
    if (!ownerUserId || ownerUserId !== auth.uid) {
      res.status(403).json({ success: false, error: 'Only the file owner can update sharing' });
      return;
    }

    const body = parsedBody.data;
    const fileTeamId = normalizeQueryString(fileData['teamId']);
    const fileOrganizationId = normalizeQueryString(fileData['organizationId']);
    if (body.principalType === 'team' && body.principalId !== fileTeamId) {
      res.status(400).json({ success: false, error: 'Team share must match the file team' });
      return;
    }

    if (body.principalType === 'organization') {
      if (!fileOrganizationId || body.principalId !== fileOrganizationId) {
        res
          .status(400)
          .json({ success: false, error: 'Organization share must match the file organization' });
        return;
      }
    }

    const ownerAccess = createOwnerPrivateAccessLists({ ownerUserId });
    const fileAcl = getUniversalFileAcl(fileData);
    const explicitReadAccessKeys = getStringArray(fileData['readAccessKeys']);
    const explicitWriteAccessKeys = getStringArray(fileData['writeAccessKeys']);
    const currentReadAccessKeys =
      explicitReadAccessKeys.length > 0
        ? explicitReadAccessKeys
        : (() => {
            const aclKeys = getAclReadAccessKeys(fileAcl);
            if (aclKeys.length > 0) {
              return [...new Set([...ownerAccess.readAccessKeys, ...aclKeys])];
            }

            const legacyKeys = getLegacyReadAccessKeys(fileData);
            return legacyKeys.length > 0
              ? [...new Set([...ownerAccess.readAccessKeys, ...legacyKeys])]
              : ownerAccess.readAccessKeys;
          })();
    const currentWriteAccessKeys =
      explicitWriteAccessKeys.length > 0
        ? explicitWriteAccessKeys
        : (() => {
            const legacyKeys = getLegacyWriteAccessKeys(fileData);
            return legacyKeys.length > 0
              ? [...new Set([...ownerAccess.writeAccessKeys, ...legacyKeys])]
              : ownerAccess.writeAccessKeys;
          })();

    const principalKey =
      body.principalType === 'user'
        ? toUserAccessKey(body.principalId)
        : body.principalType === 'team'
          ? toTeamAccessKey(body.principalId)
          : toOrganizationAccessKey(body.principalId);
    const wasDirectlyReadable = currentReadAccessKeys.includes(principalKey);

    const nextReadAccessKeys =
      body.action === 'remove'
        ? [...new Set(currentReadAccessKeys.filter((key) => key !== principalKey))]
        : [...new Set([...currentReadAccessKeys, principalKey])];
    const nextWriteAccessKeys =
      body.action === 'remove'
        ? [...new Set(currentWriteAccessKeys.filter((key) => key !== principalKey))]
        : body.permission === 'write'
          ? [...new Set([...currentWriteAccessKeys, principalKey])]
          : [...new Set(currentWriteAccessKeys.filter((key) => key !== principalKey))];
    const ownerPinnedReadAccessKeys = [
      ...new Set([...ownerAccess.readAccessKeys, ...nextReadAccessKeys]),
    ];
    const ownerPinnedWriteAccessKeys = [
      ...new Set([...ownerAccess.writeAccessKeys, ...nextWriteAccessKeys]),
    ];
    const updatedAt = new Date().toISOString();

    await fileRef.set(
      {
        readAccessKeys: ownerPinnedReadAccessKeys,
        writeAccessKeys: ownerPinnedWriteAccessKeys,
        updatedByUserId: auth.uid,
        updatedAt,
      },
      { merge: true }
    );

    if (
      body.action === 'add' &&
      body.principalType === 'user' &&
      body.principalId !== auth.uid &&
      !wasDirectlyReadable
    ) {
      void notifyDirectFileShare(db, {
        resourceType: 'file',
        resourceId: fileId,
        resourceName: String(fileData['title'] ?? 'Untitled file'),
        teamId: fileTeamId ?? undefined,
        organizationId: fileOrganizationId ?? undefined,
        recipientUserId: body.principalId,
        sharerUserId: auth.uid,
        sharerName: auth.displayName,
        sharerAvatarUrl: auth.photoURL,
        permission: body.permission,
      }).catch(() => undefined);
    }

    res.json({
      success: true,
      data: {
        fileId,
        readAccessKeys: ownerPinnedReadAccessKeys,
        writeAccessKeys: ownerPinnedWriteAccessKeys,
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update file sharing', { error: error.message, stack: error.stack });
    res
      .status(500)
      .json({ success: false, error: error.message || 'Failed to update file sharing' });
  }
});

router.post('/files/:fileId/film-review', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }

    const parsedBody = TeamFileFilmReviewCreateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
    const fileDoc = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId).get();
    const fileData = fileDoc.data() as Record<string, unknown> | undefined;
    const fileTeamId = normalizeOptionalString(fileData?.['teamId']) ?? null;
    const requestedTeamId = normalizeOptionalString(body.teamId) ?? null;
    if (!fileDoc.exists || (requestedTeamId !== null && fileTeamId !== requestedTeamId)) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    if (!fileData) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const canWrite = await canWriteAccessControlledRecord({
      db,
      authUid: user.uid,
      teamId: requestedTeamId,
      data: fileData,
      acl: getUniversalFileAcl(fileData),
      grantedAccessKeys,
    });
    if (!canWrite) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const existingFile = toUniversalFileDoc(fileDoc.id, fileTeamId, fileData);
    const payload = existingFile.payload;
    const hasExistingFilmReviewPayload =
      !!payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      'filmReview' in payload;
    const existingReview = hasExistingFilmReviewPayload
      ? toTeamFilmReviewDocFromUniversalFile(existingFile)
      : null;
    if (existingReview) {
      res.status(201).json({ success: true, data: { filmReview: existingReview } });
      return;
    }
    if (existingFile.type !== 'file' || existingFile.payloadKind === 'pointer') {
      res.status(400).json({ success: false, error: 'Film review requires a native video file' });
      return;
    }

    const uploadMode = isTeamFilmReviewUploadMode(body.uploadMode)
      ? body.uploadMode
      : 'single_video';
    const sport = body.sport.trim().toLowerCase();
    const now = new Date().toISOString();
    const source: TeamFilmReviewSourceVideo = {
      id: fileId,
      order: 0,
      fileId,
      videoUrl: body.videoUrl,
      title: body.title.trim(),
      ...(body.storagePath ? { storagePath: body.storagePath } : {}),
      ...(body.cloudflareVideoId ? { cloudflareVideoId: body.cloudflareVideoId } : {}),
      ...(body.cloudflareStatus ? { cloudflareStatus: body.cloudflareStatus } : {}),
      ...(body.readyToStream !== undefined ? { readyToStream: body.readyToStream } : {}),
      ...(body.thumbnailUrl ? { thumbnailUrl: body.thumbnailUrl } : {}),
      ...(body.durationSec !== undefined ? { durationSec: body.durationSec } : {}),
    };
    const sources = body.sources?.length ? body.sources : [source];
    const status: TeamFilmReviewDoc['status'] =
      body.cloudflareVideoId && body.readyToStream !== true ? 'processing' : 'ready';
    const timeline = buildSeededFilmReviewTimeline({
      uploadMode,
      sources,
      ...(body.durationSec !== undefined ? { fallbackDurationSec: body.durationSec } : {}),
    });

    const aiSeed = buildSyntheticFilmReviewAi({
      id: fileId,
      teamId: fileTeamId ?? undefined,
      fileId,
      sport,
      title: body.title.trim(),
      status,
      uploadMode,
      videoUrl: body.videoUrl,
      sources,
      durationSec: body.durationSec ?? 0,
      source: body.source ?? 'team_files',
      schemaVersion: 2,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: now,
      updatedAt: now,
    } as TeamFilmReviewDoc);

    const filmReview: TeamFilmReviewDoc = {
      id: fileId,
      teamId: fileTeamId ?? undefined,
      organizationId: existingFile.organizationId ?? undefined,
      fileId,
      sport,
      title: body.title.trim(),
      status,
      uploadMode,
      videoUrl: body.videoUrl,
      sources,
      ...(body.storagePath ? { storagePath: body.storagePath } : {}),
      ...(body.cloudflareVideoId ? { cloudflareVideoId: body.cloudflareVideoId } : {}),
      ...(body.cloudflareStatus ? { cloudflareStatus: body.cloudflareStatus } : {}),
      ...(body.readyToStream !== undefined ? { readyToStream: body.readyToStream } : {}),
      ...(body.thumbnailUrl ? { thumbnailUrl: body.thumbnailUrl } : {}),
      ...(body.durationSec !== undefined ? { durationSec: body.durationSec } : {}),
      ...aiSeed,
      clips: [],
      annotations: [],
      ...(timeline.length > 0
        ? {
            timeline,
            timelineState: 'ready',
            timelineGeneratedAt: now,
          }
        : {}),
      tags: [],
      source: body.source ?? 'team_files',
      ...(body.sourceUrl ? { sourceUrl: body.sourceUrl } : {}),
      schemaVersion: 2,
      reviewRevision: 0,
      readAccessKeys: existingFile.readAccessKeys,
      writeAccessKeys: existingFile.writeAccessKeys,
      createdBy: user.uid,
      updatedBy: user.uid,
      createdAt: now,
      updatedAt: now,
    };

    const createdData = await mutateUniversalFileDocumentAtomically({
      db,
      fileId,
      mutate: async (currentData) => {
        const currentTeamId = normalizeOptionalString(currentData['teamId']) ?? null;
        if (requestedTeamId !== null && currentTeamId !== requestedTeamId) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'ACCESS_DENIED',
            'Not authorized to create this film review.'
          );
        }
        const currentFile = toUniversalFileDoc(fileId, currentTeamId, currentData);
        const currentPayload = currentData['payload'];
        const hasCurrentFilmReview =
          !!currentPayload &&
          typeof currentPayload === 'object' &&
          !Array.isArray(currentPayload) &&
          'filmReview' in currentPayload;
        const concurrentReview = hasCurrentFilmReview
          ? toTeamFilmReviewDocFromUniversalFile(currentFile)
          : null;
        if (concurrentReview) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'REVISION_CONFLICT',
            'A film review was created for this file by another operation.',
            getTeamFilmReviewRevision(concurrentReview)
          );
        }
        if (currentFile.type !== 'file' || currentFile.payloadKind === 'pointer') {
          throw new Error('Film review requires a native video file');
        }
        const currentGrantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
        const currentCanWrite = await canWriteAccessControlledRecord({
          db,
          authUid: user.uid,
          teamId: requestedTeamId ?? currentTeamId ?? undefined,
          data: currentData,
          acl: currentFile.acl,
          grantedAccessKeys: currentGrantedAccessKeys,
        });
        if (!currentCanWrite) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'ACCESS_DENIED',
            'Not authorized to create this film review.'
          );
        }
        const attached = attachNativeFilmReviewToBaseFile(
          currentFile as UniversalNativeFileDoc<'file'>,
          filmReview
        );
        const { id: _id, ...fileDocument } = attached;
        return fileDocument;
      },
    });
    const attachedFile = toUniversalFileDoc(
      fileId,
      fileTeamId,
      createdData ?? {}
    ) as UniversalNativeFileDoc<'file'>;
    scheduleUniversalFileSemanticSync({ db, document: attachedFile });
    res.status(201).json({ success: true, data: { filmReview } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create file-backed film review', {
      error: error.message,
      stack: error.stack,
    });
    sendFilmReviewMutationError(res, error, 'Failed to create film review');
  }
});

router.post('/film-reviews', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const parsedBody = TeamFilmReviewUploadCreateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    if (body.attachment.type !== 'video') {
      res.status(400).json({ success: false, error: 'Film review requires a video attachment' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const normalizedTeamId = normalizeOptionalString(body.teamId);
    const teamDoc = normalizedTeamId
      ? await db.collection('Teams').doc(normalizedTeamId).get()
      : null;
    if (normalizedTeamId && !teamDoc?.exists) {
      res.status(404).json({ success: false, error: 'Team not found' });
      return;
    }
    const teamData = (teamDoc?.data() ?? {}) as Record<string, unknown>;

    if (normalizedTeamId) {
      const access = await resolveTeamScopedAccessContext(db, user.uid, normalizedTeamId, teamData);
      const canReadTeam =
        access.manageKeys.includes(buildAclTeamManagerKey(normalizedTeamId)) ||
        access.readKeys.includes(buildAclTeamKey(normalizedTeamId));
      if (!canReadTeam) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
    }

    const inherited = await resolveInheritedFolderAcl({
      db,
      teamId: normalizedTeamId,
      parentId: null,
      ownerUserId: user.uid,
      organizationId: teamData['organizationId'] as string | undefined,
    });

    const fileId = await upsertTeamFileFromAttachment({
      db,
      teamId: normalizedTeamId,
      userId: user.uid,
      attachment: body.attachment as AgentXAttachment,
      origin: 'files_upload',
      organizationId: inherited.organizationId,
      acl: inherited.acl ?? undefined,
      readAccessKeys: inherited.readAccessKeys,
      writeAccessKeys: inherited.writeAccessKeys,
      sport: body.sport,
      uploadTarget: 'file',
    });

    const indexedFileDoc = await db.collection(UNIVERSAL_FILES_COLLECTION).doc(fileId).get();
    if (!indexedFileDoc.exists) {
      res.status(500).json({ success: false, error: 'Failed to create film review file' });
      return;
    }

    const indexedFile = toUniversalFileDoc(
      indexedFileDoc.id,
      normalizeOptionalString((indexedFileDoc.data() ?? {})['teamId']) ?? normalizedTeamId ?? null,
      (indexedFileDoc.data() ?? {}) as Record<string, unknown>
    );
    if (indexedFile.type !== 'file' || indexedFile.payloadKind === 'pointer') {
      res.status(400).json({ success: false, error: 'Film review requires a native video file' });
      return;
    }

    const filmReview = buildFilmReviewDocumentFromCreateRequest({
      fileId,
      userId: user.uid,
      body,
      organizationId: inherited.organizationId,
      readAccessKeys: inherited.readAccessKeys,
      writeAccessKeys: inherited.writeAccessKeys,
    });

    const updatedFile = await persistNativeFilmReviewDocument({
      db,
      fileId,
      file: indexedFile as UniversalNativeFileDoc<'file'>,
      review: filmReview,
    });
    scheduleUniversalFileSemanticSync({ db, document: updatedFile });

    res.status(201).json({ success: true, data: { filmReview } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to create uploaded film review', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ success: false, error: 'Failed to create film review' });
  }
});

router.patch('/files/:fileId/film-review', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }

    const parsedBody = TeamFileFilmReviewUpdateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      res
        .status(400)
        .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
      return;
    }

    const body = parsedBody.data;
    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
    const nativeReview = await resolveNativeFilmReviewForFileMutation({
      db,
      fileId,
      teamId: body.teamId,
    });
    if (!nativeReview.ok) {
      res.status(nativeReview.status).json({ success: false, error: nativeReview.error });
      return;
    }
    const canWrite = await canWriteAccessControlledRecord({
      db,
      authUid: user.uid,
      teamId: body.teamId,
      data: nativeReview.file as unknown as Record<string, unknown>,
      acl: nativeReview.file.acl,
      grantedAccessKeys,
    });
    if (!canWrite) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    const nextReview = await mutateNativeFilmReviewAtomically({
      db,
      fileId,
      teamId: body.teamId,
      userId: user.uid,
      expectedRevision: body.expectedRevision ?? getTeamFilmReviewRevision(nativeReview.review),
      mutate: (existing) => {
        const now = new Date().toISOString();
        const nextSport = body.sport?.trim().toLowerCase();
        const isSportChanging = !!nextSport && nextSport !== existing.sport;
        let updated: TeamFilmReviewDoc = {
          ...existing,
          title: body.title?.trim() || existing.title,
          sport: nextSport || existing.sport,
          updatedBy: user.uid,
          updatedAt: now,
        };

        if (Object.prototype.hasOwnProperty.call(body, 'playlistId')) {
          const playlistId = body.playlistId?.trim() || null;
          const playlistName = body.playlistName?.trim() || null;
          updated = {
            ...updated,
            playlistId,
            playlistName: playlistId && playlistName ? playlistName : null,
          };
        }
        if (body.timeline) {
          updated = {
            ...updated,
            timeline: body.timeline as unknown as readonly TeamFilmReviewPlaySegment[],
          };
        }
        return isSportChanging
          ? {
              ...updated,
              timeline: [],
              timelineState: 'idle',
              timelineGeneratedAt: undefined,
              timelineError: null,
            }
          : updated;
      },
    });

    res.json({ success: true, data: { filmReview: nextReview } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to update file-backed film review', {
      error: error.message,
      stack: error.stack,
    });
    sendFilmReviewMutationError(res, error, 'Failed to update film review');
  }
});

router.post(
  '/files/:fileId/film-review/breakdown-import',
  appGuard,
  uploadRateLimit,
  agentSingleFileUpload,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
      const teamId = typeof req.body?.['teamId'] === 'string' ? req.body['teamId'].trim() : '';
      const expectedRevisionRaw = req.body?.['expectedRevision'];
      const expectedRevision =
        typeof expectedRevisionRaw === 'string' && expectedRevisionRaw.trim().length > 0
          ? Number(expectedRevisionRaw)
          : undefined;
      if (!fileId) {
        res.status(400).json({ success: false, error: 'fileId is required' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: 'No breakdown file provided' });
        return;
      }

      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }

      const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
      const nativeReview = await resolveNativeFilmReviewForFileMutation({
        db,
        fileId,
        teamId: teamId || null,
      });
      if (!nativeReview.ok) {
        res.status(nativeReview.status).json({ success: false, error: nativeReview.error });
        return;
      }
      const canWrite = await canWriteAccessControlledRecord({
        db,
        authUid: user.uid,
        teamId: teamId || null,
        data: nativeReview.file as unknown as Record<string, unknown>,
        acl: nativeReview.file.acl,
        grantedAccessKeys,
      });
      if (!canWrite) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const existing = nativeReview.review;
      const parsed = await parseHudlBreakdownBuffer({
        buffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sport: existing.sport,
      });
      if (parsed.timeline.length === 0) {
        res.status(400).json({
          success: false,
          error: parsed.warnings[0] ?? 'No playable rows found in breakdown file',
        });
        return;
      }

      const bucket = req.firebase?.storage?.bucket();
      if (!bucket) {
        res.status(500).json({ success: false, error: 'Storage unavailable' });
        return;
      }

      const normalizedBreakdown = normalizeImportedBreakdownTimeline(
        existing,
        parsed.timeline,
        parsed.warnings
      );
      const now = new Date().toISOString();
      const storagePath = AgentMediaLifecycleService.buildStoragePath({
        userId: user.uid,
        mimeType: file.mimetype,
        fileName: file.originalname,
        zone: 'media',
      });

      await AgentMediaLifecycleService.saveBufferAndSignRead({
        bucket,
        storagePath,
        buffer: file.buffer,
        mimeType: file.mimetype,
      });

      const breakdownSource: TeamFilmReviewBreakdownSource = {
        provider: resolveFilmReviewBreakdownProvider(file.originalname, file.mimetype),
        fileName: file.originalname,
        mimeType: file.mimetype,
        storagePath,
        ...(parsed.sheetName ? { sheetName: parsed.sheetName } : {}),
        rowCount: parsed.rowCount,
        playCount: normalizedBreakdown.timeline.length,
        importedBy: user.uid,
        importedAt: now,
      };
      const updated = await mutateNativeFilmReviewAtomically({
        db,
        fileId,
        teamId,
        userId: user.uid,
        expectedRevision:
          typeof expectedRevision === 'number' &&
          Number.isInteger(expectedRevision) &&
          expectedRevision >= 0
            ? expectedRevision
            : getTeamFilmReviewRevision(existing),
        mutate: (current) => ({
          ...current,
          timeline: normalizedBreakdown.timeline,
          timelineState: 'ready',
          timelineGeneratedAt: now,
          timelineError: null,
          breakdownSource,
          durationSec: normalizedBreakdown.timeline.reduce(
            (max, play) => Math.max(max, play.endSec),
            current.durationSec ?? 0
          ),
          updatedBy: user.uid,
          updatedAt: now,
        }),
      });

      res.json({
        success: true,
        data: {
          filmReview: updated,
          playCount: normalizedBreakdown.timeline.length,
          rowCount: parsed.rowCount,
          ...(parsed.sheetName ? { sheetName: parsed.sheetName } : {}),
          warnings: normalizedBreakdown.warnings,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const isClientImportError =
        /breakdown imports support|export .* as \.xlsx|no rows|empty|invalid/i.test(error.message);
      logger.error('Failed to import file-backed film review breakdown', {
        error: error.message,
        stack: error.stack,
      });
      if (error instanceof TeamFilmReviewSourceBreakdownPatchError) {
        sendFilmReviewMutationError(res, error, 'Failed to import film review breakdown');
      } else {
        res.status(isClientImportError ? 400 : 500).json({ success: false, error: error.message });
      }
    }
  }
);

router.post(
  '/files/:fileId/film-review/ai-refresh',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
      const teamId = typeof req.body?.['teamId'] === 'string' ? req.body['teamId'].trim() : '';
      const expectedRevision =
        typeof req.body?.['expectedRevision'] === 'number' &&
        Number.isInteger(req.body['expectedRevision']) &&
        req.body['expectedRevision'] >= 0
          ? req.body['expectedRevision']
          : undefined;
      if (!fileId || !teamId) {
        res.status(400).json({ success: false, error: 'fileId and teamId are required' });
        return;
      }

      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }

      const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
      const nativeReview = await resolveNativeFilmReviewForFileMutation({
        db,
        fileId,
        teamId,
      });
      if (!nativeReview.ok) {
        res.status(nativeReview.status).json({ success: false, error: nativeReview.error });
        return;
      }
      const canWrite = await canWriteAccessControlledRecord({
        db,
        authUid: user.uid,
        teamId,
        data: nativeReview.file as unknown as Record<string, unknown>,
        acl: nativeReview.file.acl,
        grantedAccessKeys,
      });
      if (!canWrite) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const ai = buildSyntheticFilmReviewAi(nativeReview.review);
      const updated = await mutateNativeFilmReviewAtomically({
        db,
        fileId,
        teamId,
        userId: user.uid,
        expectedRevision: expectedRevision ?? getTeamFilmReviewRevision(nativeReview.review),
        mutate: (current) => ({
          ...current,
          aiSummary: ai.aiSummary,
          aiTags: ai.aiTags,
          keyInsights: ai.keyInsights,
          updatedBy: user.uid,
          updatedAt: new Date().toISOString(),
          status: 'ready',
        }),
      });

      res.json({
        success: true,
        data: {
          ...ai,
          reviewRevision: getTeamFilmReviewRevision(updated),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to refresh file-backed film review AI', {
        error: error.message,
        stack: error.stack,
      });
      sendFilmReviewMutationError(res, error, 'Failed to refresh film review AI');
    }
  }
);

router.post(
  '/files/:fileId/film-review/download-export',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
      const teamId = typeof req.body?.['teamId'] === 'string' ? req.body['teamId'].trim() : '';
      if (!fileId || !teamId) {
        res.status(400).json({ success: false, error: 'fileId and teamId are required' });
        return;
      }

      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }

      const bucket = req.firebase?.storage?.bucket();
      if (!bucket) {
        res.status(500).json({ success: false, error: 'Storage bucket is unavailable' });
        return;
      }

      const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
      const nativeReview = await resolveNativeFilmReviewForFileMutation({
        db,
        fileId,
        teamId,
      });
      if (!nativeReview.ok) {
        res.status(nativeReview.status).json({ success: false, error: nativeReview.error });
        return;
      }
      const canWrite = await canWriteAccessControlledRecord({
        db,
        authUid: user.uid,
        teamId,
        data: nativeReview.file as unknown as Record<string, unknown>,
        acl: nativeReview.file.acl,
        grantedAccessKeys,
      });
      if (!canWrite) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const exportReview = await queueFilmReviewDownloadExport({
        db,
        fileId,
        file: nativeReview.file,
        review: nativeReview.review,
        userId: user.uid,
        bucket,
      });
      const downloadUrl = await resolveFilmReviewDownloadExportUrl(exportReview, bucket);

      res.json({
        success: true,
        data: {
          exportState: exportReview.downloadExport,
          ...(downloadUrl ? { downloadUrl } : {}),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to prepare file-backed film review download export', {
        error: error.message,
        stack: error.stack,
      });
      res
        .status(500)
        .json({ success: false, error: 'Failed to prepare film review download export' });
    }
  }
);

router.delete('/files/:fileId/film-review', appGuard, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.uid) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
    const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : '';
    if (!fileId || !teamId) {
      res.status(400).json({ success: false, error: 'fileId and teamId are required' });
      return;
    }

    const db = req.firebase?.db;
    if (!db) {
      res.status(500).json({ success: false, error: 'Firestore unavailable' });
      return;
    }

    const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
    const nativeReview = await resolveNativeFilmReviewForFileMutation({
      db,
      fileId,
      teamId,
    });
    if (!nativeReview.ok) {
      res.status(nativeReview.status).json({ success: false, error: nativeReview.error });
      return;
    }
    const canWrite = await canWriteAccessControlledRecord({
      db,
      authUid: user.uid,
      teamId,
      data: nativeReview.file as unknown as Record<string, unknown>,
      acl: nativeReview.file.acl,
      grantedAccessKeys,
    });
    if (!canWrite) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }

    const now = new Date().toISOString();
    const expectedRevision = getTeamFilmReviewRevision(nativeReview.review);
    const nextData = await mutateUniversalFileDocumentAtomically({
      db,
      fileId,
      mutate: async (currentData) => {
        const currentTeamId = normalizeOptionalString(currentData['teamId']) ?? null;
        if (currentTeamId !== teamId) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'ACCESS_DENIED',
            'Not authorized to delete this film review.'
          );
        }
        const currentFile = toUniversalFileDoc(fileId, currentTeamId, currentData);
        const currentReview = toTeamFilmReviewDocFromUniversalFile(currentFile);
        if (!currentReview) {
          throw new Error('Film review not found');
        }
        const currentRevision = getTeamFilmReviewRevision(currentReview);
        if (currentRevision !== expectedRevision) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'REVISION_CONFLICT',
            `Film review revision conflict: expected ${expectedRevision}, found ${currentRevision}.`,
            currentRevision
          );
        }
        const currentGrantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
        const currentCanWrite = await canWriteAccessControlledRecord({
          db,
          authUid: user.uid,
          teamId,
          data: currentData,
          acl: currentFile.acl,
          grantedAccessKeys: currentGrantedAccessKeys,
        });
        if (!currentCanWrite) {
          throw new TeamFilmReviewSourceBreakdownPatchError(
            'ACCESS_DENIED',
            'Not authorized to delete this film review.'
          );
        }
        return removeFilmReviewProjectionFromUniversalFileData({
          fileData: currentData,
          userId: user.uid,
          now,
        });
      },
    });
    if (nextData) {
      scheduleUniversalFileSemanticSync({
        db,
        document: toUniversalFileDoc(fileId, teamId, nextData),
      });
    }

    res.json({ success: true, data: { fileId, reviewId: nativeReview.review.id } });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('Failed to delete file-backed film review', {
      error: error.message,
      stack: error.stack,
    });
    sendFilmReviewMutationError(res, error, 'Failed to delete film review');
  }
});

router.post(
  '/files/:fileId/film-review/annotations',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
      if (!fileId) {
        res.status(400).json({ success: false, error: 'fileId is required' });
        return;
      }

      const parsedBody = TeamFileFilmReviewAnnotationCreateBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        res
          .status(400)
          .json({ success: false, error: 'Invalid request body', issues: parsedBody.error.issues });
        return;
      }

      const body = parsedBody.data;
      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }

      const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
      const nativeReview = await resolveNativeFilmReviewForFileMutation({
        db,
        fileId,
        teamId: body.teamId,
      });
      if (!nativeReview.ok) {
        res.status(nativeReview.status).json({ success: false, error: nativeReview.error });
        return;
      }
      const canWrite = await canWriteAccessControlledRecord({
        db,
        authUid: user.uid,
        teamId: body.teamId,
        data: nativeReview.file as unknown as Record<string, unknown>,
        acl: nativeReview.file.acl,
        grantedAccessKeys,
      });
      if (!canWrite) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const annotation: TeamFilmReviewAnnotation = {
        id: `ann_${Date.now()}_${Math.round(Math.random() * 1000)}`,
        note: body.note,
        atSec: body.atSec,
        ...(body.color ? { color: body.color } : {}),
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
      };

      const updated = await mutateNativeFilmReviewAtomically({
        db,
        fileId,
        teamId: body.teamId,
        userId: user.uid,
        expectedRevision: body.expectedRevision ?? getTeamFilmReviewRevision(nativeReview.review),
        mutate: (current) => ({
          ...current,
          annotations: [...(current.annotations ?? []), annotation].sort(
            (left, right) => left.atSec - right.atSec
          ),
          updatedBy: user.uid,
          updatedAt: new Date().toISOString(),
        }),
      });
      const annotations = updated.annotations ?? [];

      res.json({
        success: true,
        data: {
          annotations,
          reviewRevision: getTeamFilmReviewRevision(updated),
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to add file-backed film review annotation', {
        error: error.message,
        stack: error.stack,
      });
      sendFilmReviewMutationError(res, error, 'Failed to add annotation');
    }
  }
);

router.delete(
  '/files/:fileId/film-review/annotations/:annotationId',
  appGuard,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      if (!user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const fileId = typeof req.params['fileId'] === 'string' ? req.params['fileId'].trim() : '';
      const annotationId =
        typeof req.params['annotationId'] === 'string' ? req.params['annotationId'].trim() : '';
      const teamId = typeof req.query['teamId'] === 'string' ? req.query['teamId'].trim() : '';
      if (!fileId || !annotationId || !teamId) {
        res
          .status(400)
          .json({ success: false, error: 'fileId, annotationId, and teamId are required' });
        return;
      }

      const db = req.firebase?.db;
      if (!db) {
        res.status(500).json({ success: false, error: 'Firestore unavailable' });
        return;
      }

      const grantedAccessKeys = await resolveGrantedFileAccessKeys(db, user.uid);
      const nativeReview = await resolveNativeFilmReviewForFileMutation({
        db,
        fileId,
        teamId,
      });
      if (!nativeReview.ok) {
        res.status(nativeReview.status).json({ success: false, error: nativeReview.error });
        return;
      }
      const canWrite = await canWriteAccessControlledRecord({
        db,
        authUid: user.uid,
        teamId,
        data: nativeReview.file as unknown as Record<string, unknown>,
        acl: nativeReview.file.acl,
        grantedAccessKeys,
      });
      if (!canWrite) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }

      const updated = await mutateNativeFilmReviewAtomically({
        db,
        fileId,
        teamId,
        userId: user.uid,
        expectedRevision: getTeamFilmReviewRevision(nativeReview.review),
        mutate: (current) => ({
          ...current,
          annotations: (current.annotations ?? []).filter((item) => item.id !== annotationId),
          updatedBy: user.uid,
          updatedAt: new Date().toISOString(),
        }),
      });
      const annotations = updated.annotations ?? [];

      res.json({ success: true, data: { annotations } });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Failed to delete file-backed film review annotation', {
        error: error.message,
        stack: error.stack,
      });
      sendFilmReviewMutationError(res, error, 'Failed to delete annotation');
    }
  }
);

export default router;
