/**
 * @fileoverview Derive thumbnail URLs from video URLs
 * @module @nxt1/backend/modules/agent/utils/derive-video-thumbnail
 *
 * When a video URL is provided without an explicit thumbnailUrl,
 * this utility attempts to find the matching thumbnail by:
 * 1. Checking if a .jpg exists at the same path (Firebase Storage pattern)
 * 2. Constructing a thumbnail URL based on naming conventions
 */

/**
 * Attempt to derive a thumbnail URL from a video URL
 * Assumes Firebase Storage naming pattern where:
 * - Video: path/video_hash.mp4?token=...
 * - Thumbnail: path/video_hash.jpg?token=...
 *
 * @param videoUrl - Video URL potentially with query params
 * @returns Derived thumbnail URL, or null if unable to derive
 */
export function deriveThumbnailFromVideoUrl(videoUrl: string): string | null {
  if (!videoUrl) return null;

  try {
    // Split URL into base and query parts
    const [baseUrl, ...queryParts] = videoUrl.split('?');
    const query = queryParts.length > 0 ? '?' + queryParts.join('?') : '';

    // Check if it looks like a video URL
    if (!baseUrl) return null;

    // Replace video extension with .jpg
    const thumbnailBase = baseUrl.replace(/\.(mp4|mov|webm|m4v|avi|mkv)$/i, '.jpg');

    // If the URL didn't have a video extension, can't derive thumbnail
    if (thumbnailBase === baseUrl) return null;

    // Construct the thumbnail URL with same query params
    return thumbnailBase + query;
  } catch {
    return null;
  }
}

/**
 * Enrich attachment data with derived thumbnail URLs
 * Modifies attachments in-place to add thumbnailUrl if missing
 */
export function enrichAttachmentsWithDerivedThumbnails<
  T extends { url?: string; type?: string; thumbnailUrl?: string },
>(attachments: T[]): T[] {
  return attachments.map((att) => {
    // Skip if already has thumbnail or not a video
    if (att.thumbnailUrl || att.type !== 'video') {
      return att;
    }

    // Try to derive thumbnail from video URL
    const derivedThumbnail = att.url ? deriveThumbnailFromVideoUrl(att.url) : null;

    if (derivedThumbnail) {
      return { ...att, thumbnailUrl: derivedThumbnail };
    }

    return att;
  });
}
