/**
 * @fileoverview Unwraps agent export objects that were stored with multipart framing.
 *
 * Some exports are persisted as a multipart body (boundary line + part headers) around the real
 * file bytes. Serving the stored object verbatim yields a corrupt .docx/.xlsx, so every download
 * path must unwrap it first.
 */

function detectMultipartBoundary(buffer: Buffer): string | null {
  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex <= 2) return null;

  const firstLine = buffer.subarray(0, newlineIndex).toString('utf8').replace(/\r$/, '').trim();
  return firstLine.startsWith('--') ? firstLine : null;
}

export function tryExtractMultipartExportPayload(params: {
  readonly buffer: Buffer;
  readonly expectedMimeType: string;
}): Buffer | null {
  const boundaryLine = detectMultipartBoundary(params.buffer);
  if (!boundaryLine) return null;

  const expectedMimeType = params.expectedMimeType.trim().toLowerCase();
  if (!expectedMimeType) return null;

  const text = params.buffer.toString('latin1');
  const boundaryToken = boundaryLine.replace(/^--/, '');
  const parts = text.split(`--${boundaryToken}`);
  if (parts.length < 3) return null;

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r?\n/, '');
    if (!part || part === '--' || /^--\r?\n?$/.test(part)) continue;

    const separator = part.indexOf('\r\n\r\n');
    const hasCrlfSeparator = separator >= 0;
    const fallbackSeparator = hasCrlfSeparator ? separator : part.indexOf('\n\n');
    if (fallbackSeparator < 0) continue;

    const headerBlock = part.slice(0, fallbackSeparator);
    const mimeMatch = headerBlock.match(/content-type:\s*([^\r\n;]+)/i);
    const partMimeType = mimeMatch?.[1]?.trim().toLowerCase() ?? '';
    if (!partMimeType) continue;

    const isExpectedPart =
      partMimeType === expectedMimeType ||
      (expectedMimeType.includes('spreadsheetml.sheet') &&
        partMimeType === 'application/octet-stream');
    if (!isExpectedPart) continue;

    const contentStart = fallbackSeparator + (hasCrlfSeparator ? 4 : 2);
    let content = part.slice(contentStart);
    content = content.replace(/\r?\n--$/, '');
    content = content.replace(/\r?\n$/, '');

    return Buffer.from(content, 'latin1');
  }

  return null;
}

const MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'text/csv': '.csv',
};

/**
 * Returns the real MIME type for a file whose type was lost upstream (empty or generic
 * octet-stream), inferred from its extension; otherwise returns the given type unchanged.
 */
export function resolveFileMimeType(fileName: string, mimeType: string | undefined): string {
  const normalized = (mimeType ?? '').trim();
  if (normalized && normalized.toLowerCase() !== 'application/octet-stream') return normalized;
  const extension = /\.[A-Za-z0-9]{1,5}$/.exec(fileName.trim())?.[0]?.toLowerCase();
  const inferred = Object.entries(MIME_EXTENSIONS).find(([, ext]) => ext === extension)?.[0];
  return inferred ?? (normalized || 'application/octet-stream');
}

/** Appends the extension implied by the MIME type when the title has none (Google keys off it). */
export function ensureFileNameExtension(fileName: string, mimeType: string): string {
  const trimmed = fileName.trim();
  if (/\.[A-Za-z0-9]{1,5}$/.test(trimmed)) return trimmed;
  const extension = MIME_EXTENSIONS[mimeType.trim().toLowerCase()];
  return extension ? `${trimmed}${extension}` : trimmed;
}

const KNOWN_EXPORT_EXTENSION_RE =
  /\.(?:pdf|csv|tsv|xlsx|xls|pptx|ppt|docx|doc|html?|txt|md|json|png|jpe?g|webp|gif|svg)$/i;
const MAX_EXPORT_BASE_NAME_CHARS = 100;

/**
 * Builds a user-facing export file name: keeps Unicode letters (accents, CJK), strips path and
 * header-unsafe characters, drops any trailing document extension (so "Roster.pdf" exported as
 * xlsx is not "Roster.pdf.xlsx"), truncates the base only, then appends the real extension.
 */
export function buildExportFileName(raw: string, extension: string, fallbackBase: string): string {
  const base = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\\/:*?"<>|]/gu, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(KNOWN_EXPORT_EXTENSION_RE, '')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const truncated = Array.from(base).slice(0, MAX_EXPORT_BASE_NAME_CHARS).join('').trim();
  // A name with no letters or digits ("###") is not meaningful; use the fallback.
  const usable = /[\p{L}\p{N}]/u.test(truncated) ? truncated : '';
  return `${usable || fallbackBase}.${extension.replace(/^\./, '').toLowerCase()}`;
}

/** Builds a Content-Disposition value that is safe for non-ASCII and quote characters. */
export function buildAttachmentContentDisposition(
  fileName: string,
  mode: 'attachment' | 'inline' = 'attachment'
): string {
  const asciiFallback =
    fileName
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/["\\]/g, '_')
      .trim() || 'download';
  const encoded = encodeURIComponent(fileName).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${mode}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
