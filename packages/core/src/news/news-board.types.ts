/**
 * @fileoverview News Board Display Types
 * @module @nxt1/core/news
 * @version 1.0.0
 *
 * Shared display-adapter interface for the unified NewsBoardComponent.
 * Both `NewsArticle` and `TeamProfilePost` can be mapped to this shape
 * so a single presentational component renders news identically on
 * athlete profiles and team profiles.
 *
 * 100% portable — NO platform dependencies.
 */

// ============================================
// NEWS BOARD ITEM (Display Adapter)
// ============================================

/**
 * Normalised category used for section-level filtering inside the
 * news board (All News / Announcements / Media Mentions).
 */
export type NewsBoardCategory = 'news' | 'announcement' | 'media-mention';

/**
 * Flat display shape consumed by `NewsBoardComponent`.
 *
 * Shells map their domain data (`NewsArticle` or `TeamProfilePost`)
 * into this interface before passing it as an input.
 */
export interface NewsBoardItem {
  /** Unique identifier (article / post id). */
  readonly id: string;

  /** Headline / title. */
  readonly title: string;

  /** Short excerpt or body preview (2-3 sentences). */
  readonly excerpt: string;

  /** Hero / thumbnail image URL (omit for no-image card variant). */
  readonly imageUrl?: string;

  /** Source / author display name (shown in footer pill). */
  readonly sourceName?: string;

  /** Source favicon URL (shown in footer pill). */
  readonly faviconUrl?: string;

  /**
   * Normalised category for board-level filtering.
   *
   * - `'announcement'`  → editorial / ai-agent / team announcements
   * - `'media-mention'` → syndicated / external press
   * - `'news'`          → general news (default)
   */
  readonly category: NewsBoardCategory;

  /** Publication timestamp (ISO 8601 string). */
  readonly publishedAt: string;

  /** View count (shown in meta). */
  readonly viewCount?: number;

  /** Comment count (shown in meta). */
  readonly commentCount?: number;

  /** CTA button label (e.g. "Read Article"). Omit to hide. */
  readonly ctaLabel?: string;
}
