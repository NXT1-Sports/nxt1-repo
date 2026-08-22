/**
 * @fileoverview Single source of truth for the `[Attached ...]` context labels
 * that are appended to a user's intent before it is shown to the LLM.
 *
 * Centralizing this format prevents prompt drift across the three sites that
 * historically duplicated it (chat enqueue happy path, chat enqueue with
 * connected-source resolution, and pending-attachment reconciliation).
 *
 * The labels intentionally include an explicit "already visible to user —
 * do not re-embed" hint inside the bracket. Combined with the system prompt's
 * "Handling Media in Replies" section, this gives the model an unambiguous
 * negative case for user-uploaded media so it stops emitting `<video>` /
 * `<img>` / `![]()` tags that point at the user's own URLs.
 */

export interface PromptVideoAttachment {
  readonly name: string;
  readonly url: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly storagePath?: string;
  readonly thumbnailUrl?: string;
}

export interface PromptFileAttachment {
  readonly name: string;
  readonly url: string;
  readonly mimeType: string;
  readonly storagePath?: string;
  readonly artifactRole?: 'source' | 'primary_document' | 'export' | 'derived';
}

export interface PromptImageAttachment {
  readonly name: string;
  readonly url: string;
  readonly mimeType: string;
  readonly annotatedFrame?: boolean;
}

const DO_NOT_REEMBED_HINT = 'already visible to user — do not re-embed';

function buildMetadataSuffix(parts: ReadonlyArray<string | null | undefined>): string {
  const filtered = parts.filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  );
  return filtered.length > 0 ? ` | ${filtered.join(' | ')}` : '';
}

/**
 * Format a single user-uploaded video as a context label.
 *
 * Output: `[Attached video (already visible to user — do not re-embed): NAME — URL | cloudflareVideoId: X]`
 */
export function formatVideoAttachmentLabel(video: PromptVideoAttachment): string {
  const suffix = buildMetadataSuffix([
    video.storagePath ? `storagePath: ${video.storagePath}` : null,
    video.cloudflareVideoId ? `cloudflareVideoId: ${video.cloudflareVideoId}` : null,
    video.cloudflareStatus ? `cloudflareStatus: ${video.cloudflareStatus}` : null,
    typeof video.readyToStream === 'boolean'
      ? `readyToStream: ${String(video.readyToStream)}`
      : null,
    video.thumbnailUrl ? `thumbnailUrl: ${video.thumbnailUrl}` : null,
  ]);
  return `[Attached video (${DO_NOT_REEMBED_HINT}): ${video.name} — ${video.url}${suffix}]`;
}

/**
 * Format a single user-uploaded non-media file (PDF, CSV, etc.) as a context label.
 */
export function formatFileAttachmentLabel(file: PromptFileAttachment): string {
  return `[Attached file (${DO_NOT_REEMBED_HINT}): ${file.name} (${file.mimeType}) — ${file.url}]`;
}

/**
 * Format a single user-uploaded image as a context label (used in base agent
 * when building the multipart vision message).
 */
export function formatImageAttachmentLabel(image: PromptImageAttachment): string {
  const suffix = buildMetadataSuffix([
    `mimeType: ${image.mimeType}`,
    image.annotatedFrame ? 'annotatedFrame: true' : null,
  ]);
  return `[Attached image (${DO_NOT_REEMBED_HINT}): ${image.name} — ${image.url}${suffix}]`;
}

/**
 * Format a generic non-image, non-video attachment (e.g. PDF/document) for the
 * lightweight "doc reference" list that base agent appends to the intent.
 */
export function formatDocumentAttachmentLabel(file: PromptFileAttachment): string {
  const label =
    file.artifactRole === 'source' ? 'Attached editable source document' : 'Attached document';
  const suffix = buildMetadataSuffix([
    `name: ${file.name}`,
    `mimeType: ${file.mimeType}`,
    file.artifactRole ? `artifactRole: ${file.artifactRole}` : null,
    file.storagePath ? `storagePath: ${file.storagePath}` : null,
  ]);
  return `[${label} (${DO_NOT_REEMBED_HINT}): ${file.url}${suffix}]`;
}
