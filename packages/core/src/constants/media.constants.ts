/**
 * @fileoverview Media Constants
 * @module @nxt1/core/constants
 *
 * Constants for media library and storage.
 * Extracted from media.model.ts for proper separation of concerns.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// MEDIA STATUSES
// ============================================

export const MEDIA_STATUSES = {
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
  DELETED: 'deleted',
} as const;

export type MediaStatus = (typeof MEDIA_STATUSES)[keyof typeof MEDIA_STATUSES];

export const VIDEO_TYPES = {
  MIXTAPE: 'mixtape',
  HIGHLIGHT: 'highlight',
  GAME_FILM: 'game-film',
  RAW: 'raw',
} as const;

export type VideoType = (typeof VIDEO_TYPES)[keyof typeof VIDEO_TYPES];

// ============================================
// STORAGE LIMITS (by plan)
// ============================================

export const STORAGE_LIMITS = {
  free: 500 * 1024 * 1024, // 500 MB
  starter: 2 * 1024 * 1024 * 1024, // 2 GB
  pro: 10 * 1024 * 1024 * 1024, // 10 GB
  elite: 50 * 1024 * 1024 * 1024, // 50 GB
  team: 100 * 1024 * 1024 * 1024, // 100 GB
} as const;
