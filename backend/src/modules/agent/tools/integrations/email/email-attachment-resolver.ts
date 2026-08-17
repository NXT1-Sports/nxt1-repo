import { z } from 'zod';
import { storage as defaultStorage } from '../../../../../utils/firebase.js';
import { stagingStorage } from '../../../../../utils/firebase-staging.js';
import type { ProviderEmailAttachment } from '../../../../../services/communications/connected-mail.service.js';
import { AgentMediaLifecycleService } from '../../media/agent-media-lifecycle.service.js';

export const MAX_EMAIL_ATTACHMENTS = 5;
export const MAX_EMAIL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_EMAIL_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const BLOCKED_ATTACHMENT_EXTENSIONS = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.dmg',
  '.exe',
  '.html',
  '.js',
  '.msi',
  '.pkg',
  '.ps1',
  '.scr',
  '.sh',
  '.svg',
]);

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/msword',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'text/plain',
  'video/mp4',
]);

type EmailAttachmentStorageFile = {
  getMetadata(): Promise<[Record<string, unknown>]>;
  download(): Promise<[Buffer]>;
};

type EmailAttachmentStorage = {
  bucket(): {
    file(path: string): EmailAttachmentStorageFile;
  };
};

export const EmailAttachmentReferenceSchema = z
  .object({
    id: z.string().trim().min(1).max(200).optional(),
    name: z.string().trim().min(1).max(255).optional(),
    filename: z.string().trim().min(1).max(255).optional(),
    mimeType: z.string().trim().min(1).max(200).optional(),
    contentType: z.string().trim().min(1).max(200).optional(),
    sizeBytes: z.number().int().nonnegative().max(MAX_EMAIL_ATTACHMENT_BYTES).optional(),
    storagePath: z.string().trim().min(1).max(1500).optional(),
    url: z.string().trim().url().optional(),
  })
  .refine((attachment) => Boolean(attachment.storagePath || attachment.url), {
    message: 'Each email attachment must include a storagePath or Firebase Storage URL.',
  })
  .describe(
    'Files to attach to the email. Use only attachment refs already provided by Agent X context. ' +
      'Never invent URLs. Prefer storagePath when available. Max 5 attachments; max 8 MB each; max 15 MB total.'
  );

export type EmailAttachmentReference = z.infer<typeof EmailAttachmentReferenceSchema>;

function selectAttachmentStorage(environment: string | undefined): EmailAttachmentStorage {
  return (environment === 'staging'
    ? stagingStorage
    : defaultStorage) as unknown as EmailAttachmentStorage;
}

function normalizeContentType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.split(';', 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_ATTACHMENT_MIME_TYPES.has(contentType);
}

function resolveStoragePath(attachment: EmailAttachmentReference): string | null {
  const directPath = attachment.storagePath?.trim();
  if (directPath) return AgentMediaLifecycleService.extractStoragePathFromUrl(directPath);
  return attachment.url
    ? AgentMediaLifecycleService.extractStoragePathFromUrl(attachment.url)
    : null;
}

function assertUserOwnedStoragePath(userId: string, storagePath: string): void {
  const expectedPrefix = `Users/${userId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new Error('Email attachments must belong to the authenticated user.');
  }
}

function extensionOf(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';
}

function resolveFilename(attachment: EmailAttachmentReference, storagePath: string): string {
  const rawName =
    attachment.filename?.trim() ||
    attachment.name?.trim() ||
    storagePath.split('/').pop() ||
    'attachment';
  const sanitized = AgentMediaLifecycleService.sanitizeFileName(rawName);
  if (BLOCKED_ATTACHMENT_EXTENSIONS.has(extensionOf(sanitized))) {
    throw new Error(`Attachment type is not allowed for email: ${sanitized}`);
  }
  const filename = sanitized.slice(0, 180) || 'attachment';
  return filename;
}

function resolveMetadataSize(metadata: Record<string, unknown>, fallback?: number): number | null {
  const metadataSize = Number(metadata['size']);
  if (Number.isFinite(metadataSize) && metadataSize >= 0) return metadataSize;
  return typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : null;
}

export async function resolveProviderEmailAttachments(params: {
  readonly userId: string;
  readonly attachments: readonly EmailAttachmentReference[];
  readonly environment?: string;
  readonly storage?: EmailAttachmentStorage;
}): Promise<ProviderEmailAttachment[]> {
  if (params.attachments.length === 0) return [];
  if (params.attachments.length > MAX_EMAIL_ATTACHMENTS) {
    throw new Error(`Emails support up to ${MAX_EMAIL_ATTACHMENTS} attachments.`);
  }

  const storage = params.storage ?? selectAttachmentStorage(params.environment);
  const bucket = storage.bucket();
  const resolved: ProviderEmailAttachment[] = [];
  let totalBytes = 0;

  for (const attachment of params.attachments) {
    const storagePath = resolveStoragePath(attachment);
    if (!storagePath) {
      throw new Error('Email attachments must use Firebase Storage files.');
    }
    assertUserOwnedStoragePath(params.userId, storagePath);

    const filename = resolveFilename(attachment, storagePath);
    const file = bucket.file(storagePath);
    const [metadata] = await file.getMetadata();
    const contentType =
      normalizeContentType(metadata['contentType']) ??
      normalizeContentType(attachment.contentType) ??
      normalizeContentType(attachment.mimeType) ??
      'application/octet-stream';

    if (!isAllowedContentType(contentType)) {
      throw new Error(`Attachment content type is not allowed for email: ${contentType}`);
    }

    const metadataSize = resolveMetadataSize(metadata, attachment.sizeBytes);
    if (metadataSize !== null && metadataSize > MAX_EMAIL_ATTACHMENT_BYTES) {
      throw new Error(`Attachment ${filename} is larger than the 8 MB email limit.`);
    }

    const [contentBytes] = await file.download();
    if (contentBytes.byteLength > MAX_EMAIL_ATTACHMENT_BYTES) {
      throw new Error(`Attachment ${filename} is larger than the 8 MB email limit.`);
    }

    totalBytes += contentBytes.byteLength;
    if (totalBytes > MAX_EMAIL_TOTAL_ATTACHMENT_BYTES) {
      throw new Error('Email attachments exceed the 15 MB total limit.');
    }

    resolved.push({
      filename,
      contentType,
      contentBytes,
      sizeBytes: contentBytes.byteLength,
    });
  }

  return resolved;
}
