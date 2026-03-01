/**
 * @fileoverview Unified Content Card Types
 * @module @nxt1/core/content-card
 * @version 1.0.0
 *
 * Defines a single, universal data shape for ALL recruiting/event activity
 * content (offers, visits, camps, commitments, awards) so both feed cards
 * and timeline cards render from the same source of truth.
 *
 * Professional pattern: Instagram, LinkedIn, and Twitter all use a single
 * "content primitive" type for activity cards. The WRAPPER (feed shell vs
 * timeline rail) changes framing; the inner content comes from one shape.
 *
 * ⭐ PURE TYPESCRIPT — Zero framework dependencies ⭐
 */

// ============================================
// CONTENT CARD TYPE DISCRIMINATOR
// ============================================

/**
 * Every content-card variant the platform supports.
 * Maps 1:1 to the visual representation in both feed and timeline contexts.
 */
export type ContentCardType = 'offer' | 'commitment' | 'visit' | 'camp' | 'award';

// ============================================
// COLOR VARIANT (SEMANTIC)
// ============================================

/**
 * Semantic color variant that maps to design tokens.
 * Each maps to an existing `--nxt1-color-*` CSS custom property — NO hardcoded hex.
 *
 * | Variant   | CSS Token                        | Hex (dark)  | Used for             |
 * |-----------|----------------------------------|-------------|----------------------|
 * | success   | --nxt1-color-successLight         | #4ade80     | Offers, Scholarships |
 * | info      | --nxt1-color-info                 | #3b82f6     | Visits               |
 * | warning   | --nxt1-color-warning              | #f59e0b     | Camps, Combines      |
 * | primary   | --nxt1-color-primary              | #ccff00     | Commitments (brand)  |
 * | muted     | --nxt1-color-text-secondary       | (muted)     | Awards, Interest     |
 */
export type ContentCardColorVariant = 'success' | 'info' | 'warning' | 'primary' | 'muted';

// ============================================
// UNIFIED CONTENT CARD ITEM
// ============================================

/**
 * Universal content-card item — the single data shape consumed by ALL
 * content-card renderers (feed inline cards, timeline cards, profile cards).
 *
 * Components receive this and render it; they do NOT decide colors or labels.
 */
export interface ContentCardItem {
  /** Content-card category */
  readonly type: ContentCardType;

  /** Semantic color — drives icon-wrap tint, badge color, tag color */
  readonly colorVariant: ContentCardColorVariant;

  /** Icon name (from NXT1 icon set) for the content type */
  readonly icon: string;

  /** Primary heading (college name, camp name, award name) */
  readonly title: string;

  /** Type label chip text ("Official Visit", "Camp", "Full Scholarship") */
  readonly typeLabel: string;

  /** Logo/avatar URL (college logo, camp logo, org logo) */
  readonly logoUrl?: string;

  /** Full graphic banner URL (for rich timeline display) */
  readonly graphicUrl?: string;

  /** Location text */
  readonly location?: string;

  /** Result or secondary status ("MVP", "✍️ Signed", etc.) */
  readonly result?: string;

  /** Division text (e.g., "D1", "D2") */
  readonly division?: string;

  /** Conference text */
  readonly conference?: string;

  /** Sport name */
  readonly sport?: string;

  /** Relevant date (ISO string) */
  readonly date?: string;
}

// ============================================
// CONTENT CARD TYPE → COLOR MAPPING
// ============================================

/**
 * Default color mapping for each content-card type.
 * Used by mappers to avoid repeating color decisions everywhere.
 */
export const CONTENT_CARD_TYPE_COLORS: Record<ContentCardType, ContentCardColorVariant> = {
  offer: 'success',
  commitment: 'primary',
  visit: 'info',
  camp: 'warning',
  award: 'muted',
} as const;

// ============================================
// CONTENT CARD TYPE → ICON MAPPING
// ============================================

/**
 * Default icon for each content-card type.
 */
export const CONTENT_CARD_TYPE_ICONS: Record<ContentCardType, string> = {
  offer: 'school',
  commitment: 'checkmark-circle',
  visit: 'school',
  camp: 'flag',
  award: 'trophy',
} as const;

// ============================================
// OFFER TYPE LABELS (Shared across feed & timeline)
// ============================================

/**
 * Human-readable labels for scholarship/offer types.
 * Single source of truth — previously duplicated in FeedPostCardComponent.
 */
export const OFFER_TYPE_DISPLAY_LABELS: Record<string, string> = {
  scholarship: 'Full Scholarship',
  'preferred-walk-on': 'Preferred Walk-On',
  'walk-on': 'Walk-On',
  interest: 'Interest',
} as const;

// ============================================
// VISIT TYPE LABELS (Shared across feed & timeline)
// ============================================

/**
 * Human-readable labels for visit types.
 * Single source of truth — previously duplicated in FeedPostCardComponent.
 */
export const VISIT_TYPE_DISPLAY_LABELS: Record<string, string> = {
  official: 'Official Visit',
  unofficial: 'Unofficial Visit',
  'junior-day': 'Junior Day',
  'game-day': 'Game Day Visit',
} as const;

// ============================================
// CAMP TYPE LABELS (Shared across feed & timeline)
// ============================================

/**
 * Human-readable labels for camp/event types.
 * Single source of truth — previously duplicated in FeedPostCardComponent.
 */
export const CAMP_TYPE_DISPLAY_LABELS: Record<string, string> = {
  camp: 'Camp',
  combine: 'Combine',
  showcase: 'Showcase',
  invitational: 'Invitational',
} as const;
