/**
 * @fileoverview Shared Timeline Types
 * @module @nxt1/core/timeline
 *
 * Generic, reusable types for vertical timeline UIs.
 * Used by Offers, Events, Activity feeds, and any chronological display.
 *
 * ⭐ PURE TYPESCRIPT — Zero framework dependencies ⭐
 */

// ============================================
// VARIANT
// ============================================

/**
 * Visual variant that controls the color theme of a timeline entry.
 *
 * - `committed` — Success/green accent (e.g. committed offer, completed event)
 * - `primary`   — Brand accent color (e.g. active offer, upcoming event)
 * - `secondary` — Subdued/tertiary color (e.g. interest, past event)
 */
export type TimelineVariant = 'committed' | 'primary' | 'secondary';

// ============================================
// CARD LAYOUT
// ============================================

/**
 * Layout orientation for a timeline card.
 *
 * - `vertical`   — Image on top, body below (default, mobile-friendly)
 * - `horizontal` — Body on left, square graphic on right (desktop-optimized)
 */
export type TimelineCardLayout = 'vertical' | 'horizontal';

// ============================================
// TAG
// ============================================

/** A small label chip rendered inside the card body (e.g. "FBS", "Big 12"). */
export interface TimelineCardTag {
  readonly label: string;
  readonly variant: TimelineVariant;
}

// ============================================
// BADGE
// ============================================

/** Status badge shown inside the graphic area (top-left). */
export interface TimelineBadge {
  readonly icon: string;
  readonly label: string;
}

// ============================================
// TIMELINE ITEM
// ============================================

/**
 * A single item in a timeline display.
 * Completely generic — the consumer maps domain data into this shape.
 */
export interface TimelineItem<T = unknown> {
  /** Unique identifier (used as track key) */
  readonly id: string;

  /** Primary heading text */
  readonly title: string;

  /** Logo/avatar URL for the entity (college logo, event logo, etc.) */
  readonly logoUrl?: string;

  /** Full graphic/banner image URL (when present, logo moves to corner circle) */
  readonly graphicUrl?: string;

  /** Small tag chips (e.g. division, conference, event type) */
  readonly tags?: readonly TimelineCardTag[];

  /** Secondary line of text (e.g. coach name, location) */
  readonly subtitle?: string;

  /** Footer left text (e.g. sport name, event category) */
  readonly footerLeft?: string;

  /** Footer right text (e.g. formatted date) */
  readonly footerRight?: string;

  /** ISO date string — used for dot/date-label on timeline rail */
  readonly date: string;

  /** Visual variant controlling color theme */
  readonly variant: TimelineVariant;

  /** Status badge displayed in graphic area */
  readonly badge?: TimelineBadge;

  /** Original domain object for click handling (typed via generic) */
  readonly data?: T;
}

// ============================================
// DOT CONFIG
// ============================================

/** Configuration for the timeline dot icon on the rail. */
export interface TimelineDotConfig {
  readonly icon: string;
  readonly size: number;
}

// ============================================
// EMPTY STATE CONFIG
// ============================================

/** Configuration for the global empty state. */
export interface TimelineEmptyConfig {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly ownProfileDescription?: string;
}

// ============================================
// DOT FACTORY
// ============================================

/** Default mapping: variant → dot appearance. */
export const TIMELINE_DOT_DEFAULTS: Record<TimelineVariant, TimelineDotConfig> = {
  committed: { icon: 'checkmark-circle', size: 16 },
  primary: { icon: 'school', size: 14 },
  secondary: { icon: 'heart', size: 12 },
} as const;

// ============================================
// HELPERS
// ============================================

/** Get CSS modifier class for a variant. */
export function getTimelineVariantClass(variant: TimelineVariant): string {
  switch (variant) {
    case 'committed':
      return 'committed';
    case 'primary':
      return 'offer';
    case 'secondary':
      return 'interest';
    default:
      return 'offer';
  }
}
