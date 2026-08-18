/**
 * @fileoverview System Release Notes Type Definitions
 * @module @nxt1/core/release-notes
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for AI-generated release notes & What's New modal.
 * 100% portable — works on web, mobile, and backend.
 */

/**
 * Categorized release update items synthesized by AI.
 */
export interface ReleaseNotesCategoryUpdates {
  /** High-impact capabilities, new workflows, new AI tools */
  readonly features: readonly string[];
  /** Speed improvements, UI snappiness, video/media processing enhancements */
  readonly enhancements: readonly string[];
  /** Bug resolutions, reliability fixes, sync stabilization */
  readonly fixes: readonly string[];
}

/**
 * Individual release note document.
 * Stored in Firestore under `SystemReleaseNotes/{id}` (e.g. `SystemReleaseNotes/v1.98.0`).
 */
export interface SystemReleaseNote {
  /** Document ID, e.g. "v1.98.0" */
  readonly id: string;
  /** Semantic version string without 'v' prefix, e.g. "1.98.0" */
  readonly version: string;
  /** Short headline title summarizing the theme of the release */
  readonly title: string;
  /** High-level 1-2 sentence executive summary */
  readonly summary: string;
  /** ISO 8601 release date */
  readonly releaseDate: string;
  /** Categorized bullets */
  readonly categories: ReleaseNotesCategoryUpdates;
  /** Optional badge tag displayed on header, e.g. "v1.98.0" or "Major Update" */
  readonly badgeTag?: string;
  /** Optional primary CTA button label, e.g. "Explore Agent X" or "Got It" */
  readonly ctaLabel?: string;
  /** Optional navigation target route when clicking the primary CTA */
  readonly ctaRoute?: string;
  /** Flag indicating if this release is published and visible to users */
  readonly isPublished: boolean;
  /** Creation timestamp (ISO string) */
  readonly createdAt?: string;
  /** Last updated timestamp (ISO string) */
  readonly updatedAt?: string;
}

/**
 * Query parameters for fetching paginated release notes history.
 */
export interface ReleaseNotesHistoryQuery {
  /** Max items to return per page (default: 10, max: 50) */
  readonly limit?: number;
  /** Pagination cursor for next page */
  readonly cursor?: string;
}

/**
 * Response for latest release note endpoint.
 */
export interface LatestReleaseNoteResponse {
  readonly success: boolean;
  readonly data: SystemReleaseNote | null;
  readonly error?: string;
}

/**
 * Response for release notes history list endpoint.
 */
export interface ReleaseNotesHistoryResponse {
  readonly success: boolean;
  readonly data: readonly SystemReleaseNote[];
  readonly nextCursor?: string | null;
  readonly hasMore?: boolean;
  readonly error?: string;
}
