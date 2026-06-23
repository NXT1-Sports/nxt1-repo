import { createHash } from 'node:crypto';
import type { AgentXAttachment, TeamFileOrigin, TeamFileStatus } from '@nxt1/core';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

const TEAM_FILES_COLLECTION = 'TeamFiles' as const;

export interface UpsertTeamFileFromAttachmentParams {
  readonly db: Firestore;
  readonly teamId: string;
  readonly userId: string;
  readonly attachment: AgentXAttachment;
  readonly origin: TeamFileOrigin;
  readonly sport?: string;
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
  readonly sport?: string;
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
}

export async function upsertTeamFileFromAttachment(
  params: UpsertTeamFileFromAttachmentParams
): Promise<string> {
  const docId = buildTeamFileId(params.teamId, params.attachment);
  const docRef = params.db.collection(TEAM_FILES_COLLECTION).doc(docId);
  const existing = await docRef.get();

  const payload = buildTeamFilePayload({
    teamId: params.teamId,
    userId: params.userId,
    attachment: params.attachment,
    origin: params.origin,
    sport: params.sport,
    sourceThreadId: params.sourceThreadId,
    sourceMessageId: params.sourceMessageId,
    sourceOperationId: params.sourceOperationId,
    createdAt: existing.exists ? undefined : FieldValue.serverTimestamp(),
  });

  await docRef.set(payload, { merge: true });
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
        sport: params.sport,
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

function buildTeamFilePayload(params: {
  readonly teamId: string;
  readonly userId: string;
  readonly attachment: AgentXAttachment;
  readonly origin: TeamFileOrigin;
  readonly sport?: string;
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
  readonly createdAt?: FirebaseFirestore.FieldValue;
}): Record<string, unknown> {
  const normalizedName = params.attachment.name.trim();
  const status = resolveTeamFileStatus(params.attachment);

  return {
    teamId: params.teamId,
    ownerUserId: params.userId,
    name: normalizedName,
    normalizedName: normalizedName.toLowerCase(),
    mimeType: params.attachment.mimeType,
    kind: params.attachment.type,
    status,
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
    ...(params.attachment.thumbnailUrl ? { thumbnailUrl: params.attachment.thumbnailUrl } : {}),
    ...(params.attachment.platform ? { platform: params.attachment.platform } : {}),
    ...(params.attachment.profileUrl ? { profileUrl: params.attachment.profileUrl } : {}),
    ...(params.attachment.faviconUrl ? { faviconUrl: params.attachment.faviconUrl } : {}),
    ...(normalizeTrimmedString(params.sport) ? { sport: params.sport?.trim() } : {}),
    ...(normalizeTrimmedString(params.sourceThreadId)
      ? { sourceThreadId: params.sourceThreadId?.trim() }
      : {}),
    ...(normalizeTrimmedString(params.sourceMessageId)
      ? { sourceMessageId: params.sourceMessageId?.trim() }
      : {}),
    ...(normalizeTrimmedString(params.sourceOperationId)
      ? { sourceOperationId: params.sourceOperationId?.trim() }
      : {}),
    ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    updatedAt: FieldValue.serverTimestamp(),
    lastSeenAt: FieldValue.serverTimestamp(),
  };
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
