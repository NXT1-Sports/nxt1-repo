const INLINE_VIDEO_PREVIEW_TIME_FRAGMENT = 't=1.0';

/**
 * Matches the markdown inline-video fallback: request a tiny timestamp so
 * mobile browsers can paint a preview frame when no poster is available.
 * Uses t=1.0 instead of t=0.001 for better iOS Safari compatibility.
 */
export function buildInlineVideoPreviewSrc(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.includes('#') ? trimmed : `${trimmed}#${INLINE_VIDEO_PREVIEW_TIME_FRAGMENT}`;
}
