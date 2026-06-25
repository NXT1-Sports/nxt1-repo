import { createHash } from 'node:crypto';
import {
  UNIVERSAL_FILES_COLLECTION,
  type AgentXAttachment,
  type TeamFileFolderDoc,
  type TeamFileOrigin,
  type TeamFileStatus,
  type UniversalFilmReviewPayload,
} from '@nxt1/core';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { createOwnerPrivateAccessLists } from './file-access-keys.service.js';

type TeamFileAcl = NonNullable<TeamFileFolderDoc['acl']>;

export interface UpsertTeamFileFromAttachmentParams {
  readonly db: Firestore;
  readonly teamId: string;
  readonly userId: string;
  readonly attachment: AgentXAttachment;
  readonly origin: TeamFileOrigin;
  readonly folderId?: string | null;
  readonly organizationId?: string | null;
  readonly acl?: TeamFileAcl;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly sport?: string;
  readonly uploadTarget?: 'file' | 'film_review';
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
}

export interface UpsertTeamFilesFromAttachmentsParams {
  readonly db: Firestore;
  readonly teamId: string;
  readonly userId: string;
  readonly attachments: readonly AgentXAttachment[];
  readonly origin: TeamFileOrigin;
  readonly folderId?: string | null;
  readonly organizationId?: string | null;
  readonly acl?: TeamFileAcl;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly sport?: string;
  readonly uploadTarget?: 'file' | 'film_review';
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
}

export async function upsertTeamFileFromAttachment(
  params: UpsertTeamFileFromAttachmentParams
): Promise<string> {
  const docId = buildTeamFileId(params.teamId, params.attachment);
  const universalDocRef = params.db.collection(UNIVERSAL_FILES_COLLECTION).doc(docId);
  const existing = await universalDocRef.get();

  const universalPayload = buildUniversalFilePayload({
    teamId: params.teamId,
    userId: params.userId,
    attachment: params.attachment,
    origin: params.origin,
    folderId: params.folderId,
    organizationId: params.organizationId,
    acl: params.acl,
    sport: params.sport,
    uploadTarget: params.uploadTarget,
    sourceThreadId: params.sourceThreadId,
    sourceMessageId: params.sourceMessageId,
    sourceOperationId: params.sourceOperationId,
    createdAt: existing.exists ? undefined : FieldValue.serverTimestamp(),
  });

  await universalDocRef.set(universalPayload, { merge: true });
  return docId;
}

export async function upsertTeamFilesFromAttachments(
  params: UpsertTeamFilesFromAttachmentsParams
): Promise<readonly string[]> {
  const uniqueAttachments = dedupeAttachments(params.attachments);
  const ids: string[] = [];

  for (const attachment of uniqueAttachments) {
    ids.push(
      await upsertTeamFileFromAttachment({
        db: params.db,
        teamId: params.teamId,
        userId: params.userId,
        attachment,
        origin: params.origin,
        folderId: params.folderId,
        organizationId: params.organizationId,
        acl: params.acl,
        readAccessKeys: params.readAccessKeys,
        writeAccessKeys: params.writeAccessKeys,
        sport: params.sport,
        uploadTarget: params.uploadTarget,
        sourceThreadId: params.sourceThreadId,
        sourceMessageId: params.sourceMessageId,
        sourceOperationId: params.sourceOperationId,
      })
    );
  }

  return ids;
}

function buildTeamFileId(teamId: string, attachment: AgentXAttachment): string {
  const canonicalKey =
    normalizeTrimmedString(attachment.storagePath) ??
    normalizeTrimmedString(attachment.cloudflareVideoId) ??
    normalizeTrimmedString(attachment.url) ??
    `${attachment.name}:${attachment.sizeBytes}:${attachment.mimeType}`;

  return createHash('sha1').update(`${teamId}:${canonicalKey}`).digest('hex');
}

function buildUniversalFilePayload(params: {
  readonly teamId: string;
  readonly userId: string;
  readonly attachment: AgentXAttachment;
  readonly origin: TeamFileOrigin;
  readonly folderId?: string | null;
  readonly organizationId?: string | null;
  readonly acl?: TeamFileAcl;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly sport?: string;
  readonly uploadTarget?: 'file' | 'film_review';
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
  readonly createdAt?: FirebaseFirestore.FieldValue;
}): Record<string, unknown> {
  const normalizedName = params.attachment.name.trim();
  const status = resolveTeamFileStatus(params.attachment);
  const thumbnailUrl =
    normalizeTrimmedString(params.attachment.thumbnailUrl) ??
    buildCloudflareThumbnailUrl(params.attachment.cloudflareVideoId);
  const sourceRef = {
    ...(normalizeTrimmedString(params.sourceThreadId)
      ? { sourceThreadId: params.sourceThreadId?.trim() }
      : {}),
    ...(normalizeTrimmedString(params.sourceMessageId)
      ? { sourceMessageId: params.sourceMessageId?.trim() }
      : {}),
    ...(normalizeTrimmedString(params.sourceOperationId)
      ? { sourceOperationId: params.sourceOperationId?.trim() }
      : {}),
  };
  const accessLists = createOwnerPrivateAccessLists({
    ownerUserId: params.userId,
  });
  const shouldAttachFilmReview =
    params.uploadTarget === 'film_review' && params.attachment.type === 'video';
  const filmReviewPayload = shouldAttachFilmReview
    ? buildNativeFilmReviewPayload(params.attachment)
    : null;

  return {
    teamId: params.teamId,
    type: 'file',
    payloadKind: 'native',
    title: normalizedName,
    normalizedTitle: normalizedName.toLowerCase(),
    status,
    ...(normalizeTrimmedString(params.folderId) ? { folderId: params.folderId?.trim() } : {}),
    ...(normalizeTrimmedString(params.organizationId)
      ? { organizationId: params.organizationId?.trim() }
      : {}),
    ...(normalizeTrimmedString(params.sport) ? { sport: params.sport?.trim() } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ownerUserId: params.userId,
    createdByUserId: params.userId,
    updatedByUserId: params.userId,
    ...(params.acl ? { acl: params.acl } : {}),
    readAccessKeys:
      params.readAccessKeys && params.readAccessKeys.length > 0
        ? params.readAccessKeys
        : accessLists.readAccessKeys,
    writeAccessKeys:
      params.writeAccessKeys && params.writeAccessKeys.length > 0
        ? params.writeAccessKeys
        : accessLists.writeAccessKeys,
    semanticSync: {
      status: 'pending',
      error: null,
    },
    ...(shouldAttachFilmReview
      ? {
          classification: {
            primary: 'film_review',
            route: 'film_review',
            labels: ['film_review', 'video_analysis', 'team_document'],
            facets: {
              uploadMode: filmReviewPayload?.uploadMode,
            },
          },
        }
      : {}),
    ...(Object.keys(sourceRef).length > 0 ? { sourceRef } : {}),
    payload: {
      mimeType: params.attachment.mimeType,
      kind: params.attachment.type,
      origin: params.origin,
      sizeBytes: params.attachment.sizeBytes,
      url: params.attachment.url,
      ...(params.attachment.storagePath ? { storagePath: params.attachment.storagePath } : {}),
      ...(params.attachment.cloudflareVideoId
        ? { cloudflareVideoId: params.attachment.cloudflareVideoId }
        : {}),
      ...(params.attachment.cloudflareStatus
        ? { cloudflareStatus: params.attachment.cloudflareStatus }
        : {}),
      ...(typeof params.attachment.readyToStream === 'boolean'
        ? { readyToStream: params.attachment.readyToStream }
        : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(params.attachment.platform ? { platform: params.attachment.platform } : {}),
      ...(params.attachment.profileUrl ? { profileUrl: params.attachment.profileUrl } : {}),
      ...(params.attachment.faviconUrl ? { faviconUrl: params.attachment.faviconUrl } : {}),
      ...(filmReviewPayload ? { filmReview: filmReviewPayload } : {}),
      asset: {
        mimeType: params.attachment.mimeType,
        kind: params.attachment.type,
        origin: params.origin,
        sizeBytes: params.attachment.sizeBytes,
        url: params.attachment.url,
        ...(params.attachment.storagePath ? { storagePath: params.attachment.storagePath } : {}),
        ...(params.attachment.cloudflareVideoId
          ? { cloudflareVideoId: params.attachment.cloudflareVideoId }
          : {}),
        ...(params.attachment.cloudflareStatus
          ? { cloudflareStatus: params.attachment.cloudflareStatus }
          : {}),
        ...(typeof params.attachment.readyToStream === 'boolean'
          ? { readyToStream: params.attachment.readyToStream }
          : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(params.attachment.platform ? { platform: params.attachment.platform } : {}),
        ...(params.attachment.profileUrl ? { profileUrl: params.attachment.profileUrl } : {}),
        ...(params.attachment.faviconUrl ? { faviconUrl: params.attachment.faviconUrl } : {}),
      },
    },
    ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
  };
}

function buildNativeFilmReviewPayload(attachment: AgentXAttachment): UniversalFilmReviewPayload {
  const thumbnailUrl =
    normalizeTrimmedString(attachment.thumbnailUrl) ??
    buildCloudflareThumbnailUrl(attachment.cloudflareVideoId);

  return {
    uploadMode: 'single_video',
    videoUrl: attachment.url,
    sources: [
      {
        id: attachment.id,
        order: 0,
        title: attachment.name.trim(),
        videoUrl: attachment.url,
        ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
        ...(attachment.cloudflareVideoId
          ? { cloudflareVideoId: attachment.cloudflareVideoId }
          : {}),
        ...(attachment.cloudflareStatus ? { cloudflareStatus: attachment.cloudflareStatus } : {}),
        ...(typeof attachment.readyToStream === 'boolean'
          ? { readyToStream: attachment.readyToStream }
          : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
      },
    ],
    ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
    ...(attachment.cloudflareVideoId ? { cloudflareVideoId: attachment.cloudflareVideoId } : {}),
    ...(attachment.cloudflareStatus ? { cloudflareStatus: attachment.cloudflareStatus } : {}),
    ...(typeof attachment.readyToStream === 'boolean'
      ? { readyToStream: attachment.readyToStream }
      : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    source: 'team_files',
    sourceUrl: attachment.url,
    schemaVersion: 2,
    timelineState: 'idle',
    timeline: [],
  };
}

function buildCloudflareThumbnailUrl(cloudflareVideoId?: string): string | null {
  const normalizedCloudflareVideoId = normalizeTrimmedString(cloudflareVideoId);
  if (!normalizedCloudflareVideoId) {
    return null;
  }

  return `https://videodelivery.net/${normalizedCloudflareVideoId}/thumbnails/thumbnail.jpg`;
}

function resolveTeamFileStatus(attachment: AgentXAttachment): TeamFileStatus {
  if (attachment.type !== 'video') {
    return 'ready';
  }

  return attachment.readyToStream === false ? 'processing' : 'ready';
}

function dedupeAttachments(attachments: readonly AgentXAttachment[]): readonly AgentXAttachment[] {
  const seen = new Set<string>();
  const result: AgentXAttachment[] = [];

  for (const attachment of attachments) {
    const key =
      normalizeTrimmedString(attachment.storagePath) ??
      normalizeTrimmedString(attachment.cloudflareVideoId) ??
      normalizeTrimmedString(attachment.url) ??
      attachment.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(attachment);
  }

  return result;
}

function normalizeTrimmedString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
