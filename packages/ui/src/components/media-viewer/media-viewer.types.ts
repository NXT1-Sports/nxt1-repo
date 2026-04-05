/**
 * @fileoverview MediaViewer types — shared across service, component, and consumers.
 * @module @nxt1/ui/components/media-viewer
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

// ─── Media Item ───────────────────────────────────────────

/** A single media or document entry in the viewer. */
export interface MediaViewerItem {
  /** Absolute or relative URL of the media asset. */
  readonly url: string;

  /** Media type — determines which element is rendered. */
  readonly type: 'image' | 'video' | 'doc';

  /** Accessibility alt-text for images (required for a11y). */
  readonly alt?: string;

  /** Optional caption displayed below the media. */
  readonly caption?: string;

  /** Optional poster image for video thumbnails. */
  readonly poster?: string;

  /** File name — used for doc preview display and download attribute. */
  readonly name?: string;

  /** File size in bytes — displayed as metadata on doc slides. */
  readonly size?: number;
}

// ─── Configuration ────────────────────────────────────────

/** Configuration object passed to `NxtMediaViewerService.open()`. */
export interface MediaViewerConfig {
  /** Ordered array of media items to display. Must contain ≥ 1 item. */
  readonly items: readonly MediaViewerItem[];

  /** Zero-based index of the item to show first. Defaults to `0`. */
  readonly initialIndex?: number;

  /** Whether to show the share button in the top bar. Defaults to `true`. */
  readonly showShare?: boolean;

  /** Whether to show the counter indicator (e.g. "2 / 5"). Defaults to `true` when > 1 item. */
  readonly showCounter?: boolean;

  /** Analytics source identifier (e.g. 'feed', 'profile', 'chat'). */
  readonly source?: string;
}

// ─── Result ───────────────────────────────────────────────

/** Result returned when the media viewer is dismissed. */
export interface MediaViewerResult {
  /** How the modal was dismissed. */
  readonly role: 'dismiss' | 'share';

  /** The index of the item visible when the viewer was closed. */
  readonly lastIndex: number;

  /** The item that was visible when the viewer was closed. */
  readonly item: MediaViewerItem;
}
