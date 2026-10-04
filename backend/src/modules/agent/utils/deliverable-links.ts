/**
 * Generated documents (PDF, DOCX, XLSX, PPTX, CSV, ...) reach the user as structured message
 * attachments and Files entries, so final replies must never append them as a trailing link
 * list. Media (images, video, audio) is still embedded/linked by the summary builders.
 */
const MEDIA_EXTENSION_RE =
  /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|mp4|mov|webm|m4v|mp3|m4a|wav|aac|ogg)$/i;
const DOCUMENT_EXTENSION_RE =
  /\.(?:pdf|docx?|xlsx?|xlsm|pptx?|csv|tsv|txt|md|json|html?|rtf|odt|ods|odp|zip)$/i;

function readUrlPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url.trim()).pathname);
  } catch {
    return url.trim().split(/[?#]/)[0] ?? '';
  }
}

function isDocumentMimeType(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    !normalized.startsWith('image/') &&
    !normalized.startsWith('video/') &&
    !normalized.startsWith('audio/')
  );
}

/** True when a URL (optionally with its declared MIME type) points at a generated document. */
export function isGeneratedDocumentLink(url: string, mimeType?: string): boolean {
  const path = readUrlPath(url);
  if (/\/media-proxy\/export\//i.test(path) || /\/exports\//i.test(path)) {
    // Signed export links carry their real type; exported images/videos stay media.
    const signedMime = (() => {
      try {
        return new URL(url.trim()).searchParams.get('mime') ?? '';
      } catch {
        return '';
      }
    })();
    const declared = mimeType?.trim() || signedMime;
    return declared ? isDocumentMimeType(declared) : !MEDIA_EXTENSION_RE.test(path);
  }

  if (mimeType && isDocumentMimeType(mimeType)) return true;
  return DOCUMENT_EXTENSION_RE.test(path);
}
