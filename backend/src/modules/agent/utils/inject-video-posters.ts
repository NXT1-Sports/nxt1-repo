/**
 * @fileoverview Post-processor to inject poster URLs into video markdown
 * @module @nxt1/backend/modules/agent/utils/inject-video-posters
 *
 * When AI generates markdown with video URLs, this utility enriches them
 * with poster fragments (#poster=url) if thumbnail data is available.
 *
 * Example:
 *   Input:  `[View Video](https://firebase.../video.mp4?token=...)`
 *   Output: `[View Video](https://firebase.../video.mp4?token=...#poster=https://firebase.../video.jpg?token=...)`
 */

export interface VideoAttachmentMetadata {
  url: string;
  thumbnailUrl?: string;
}

/**
 * Escape special characters in URL for safe insertion into URL fragments
 */
function escapeUrlFragment(url: string): string {
  return encodeURIComponent(url).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Extract video URL and thumbnail from attachment metadata
 * Returns map of video URL -> thumbnail URL for quick lookup
 */
export function buildVideoThumbnailMap(
  attachments: readonly VideoAttachmentMetadata[]
): Map<string, string> {
  const map = new Map<string, string>();

  for (const att of attachments) {
    if (!att.thumbnailUrl) continue;

    // Store both exact URL and normalized URL (without query/fragment)
    map.set(att.url, att.thumbnailUrl);

    // Also store URL without query params/fragments for matching
    const baseUrl = att.url.split('?')[0]?.split('#')[0] ?? att.url;
    if (baseUrl !== att.url) {
      map.set(baseUrl, att.thumbnailUrl);
    }
  }

  return map;
}

/**
 * Inject poster URLs into video markdown links
 *
 * Finds markdown video link patterns like `[text](video_url)` and enriches them
 * with poster fragments when thumbnail data is available.
 *
 * @param markdown - Raw markdown content from AI response
 * @param videoThumbnails - Map of video URL -> thumbnail URL
 * @returns Enriched markdown with poster fragments injected
 */
export function injectVideoPosters(markdown: string, videoThumbnails: Map<string, string>): string {
  if (videoThumbnails.size === 0) return markdown;

  // Pattern: [text](url) where url looks like a video URL
  // Matches both markdown links and bare video URLs
  const markdownLinkPattern =
    /\[([^\]]*)\]\((https?:\/\/[^)]*\.(?:mp4|mov|webm|m4v|avi|mkv)(?:[^)]*)?)\)/gi;

  return markdown.replace(markdownLinkPattern, (match, text, videoUrl) => {
    if (/#poster=/i.test(videoUrl)) {
      return match;
    }

    // Normalize URL for lookup (remove fragment if present)
    const urlWithoutFragment = videoUrl.split('#')[0] ?? videoUrl;

    // Try exact match first, then base URL match
    const thumbnailUrl = videoThumbnails.get(videoUrl) || videoThumbnails.get(urlWithoutFragment);

    if (thumbnailUrl) {
      // Check if URL already has a fragment
      if (videoUrl.includes('#')) {
        // Append poster fragment to existing fragment
        return `[${text}](${videoUrl}#poster=${escapeUrlFragment(thumbnailUrl)})`;
      } else {
        // Add new fragment
        return `[${text}](${videoUrl}#poster=${escapeUrlFragment(thumbnailUrl)})`;
      }
    }

    // No thumbnail found, return unchanged
    return match;
  });
}
