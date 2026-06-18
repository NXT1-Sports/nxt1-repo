const INLINE_VIDEO_PREVIEW_TIME_FRAGMENT = 't=0.001';

/**
 * Matches the markdown inline-video fallback: request a tiny timestamp so
 * mobile browsers can paint a preview frame when no poster is available.
 */
export function buildInlineVideoPreviewSrc(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.includes('#') ? trimmed : `${trimmed}#${INLINE_VIDEO_PREVIEW_TIME_FRAGMENT}`;
}
