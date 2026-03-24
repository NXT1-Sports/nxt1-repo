/**
 * @fileoverview Avatar Component Types
 * @module @nxt1/ui/components/avatar
 * @version 1.0.0
 *
 * Type definitions for the NxtAvatarComponent following
 * patterns from Instagram, Discord, Slack, and LinkedIn.
 */

// ============================================
// SIZE TYPES
// ============================================

/**
 * Predefined avatar sizes matching common UI patterns
 *
 * - xs (20px): Inline mentions, dense lists
 * - sm (28px): Compact lists, comments
 * - md (40px): Standard lists, cards (DEFAULT)
 * - lg (56px): Profile headers, expanded cards
 * - xl (80px): Profile pages, hero sections
 * - 2xl (120px): Full profile view, edit screens
 */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/**
 * Size configuration in pixels
 */
export const AVATAR_SIZES: Record<AvatarSize, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 56,
  xl: 80,
  '2xl': 120,
} as const;

/**
 * Font sizes for initials based on avatar size
 */
export const AVATAR_FONT_SIZES: Record<AvatarSize, number> = {
  xs: 8,
  sm: 11,
  md: 14,
  lg: 20,
  xl: 28,
  '2xl': 42,
} as const;

/**
 * Status indicator sizes based on avatar size
 */
export const AVATAR_STATUS_SIZES: Record<AvatarSize, number> = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 24,
} as const;

/**
 * Badge sizes based on avatar size
 */
export const AVATAR_BADGE_SIZES: Record<AvatarSize, number> = {
  xs: 10,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
} as const;

// ============================================
// SHAPE TYPES
// ============================================

/**
 * Avatar shape variants
 *
 * - circle: Standard for user avatars (Instagram, Discord)
 * - rounded: Slightly rounded corners (Slack workspaces)
 * - square: Sharp corners (rarely used, for specific design systems)
 */
export type AvatarShape = 'circle' | 'rounded' | 'square';

// ============================================
// STATUS TYPES
// ============================================

/**
 * Online/presence status indicator
 *
 * Following Discord/Slack conventions:
 * - online: Green dot - actively available
 * - idle: Yellow/amber - away but auto-detected
 * - dnd: Red - do not disturb
 * - offline: Gray - not available
 * - none: No status shown
 */
export type AvatarStatus = 'online' | 'idle' | 'dnd' | 'offline' | 'none';

/**
 * Status colors using CSS custom properties
 */
export const AVATAR_STATUS_COLORS: Record<Exclude<AvatarStatus, 'none'>, string> = {
  online: 'var(--nxt-color-success, #22c55e)',
  idle: 'var(--nxt-color-warning, #f59e0b)',
  dnd: 'var(--nxt-color-error, #ef4444)',
  offline: 'var(--nxt-color-text-tertiary, #9ca3af)',
} as const;

// ============================================
// BADGE TYPES
// ============================================

/**
 * Badge types for special indicators
 *
 * - verified: Blue checkmark (Twitter/Instagram verified)
 * - premium: Gold/star badge (subscription tier)
 * - pro: Pro user badge
 * - coach: Coach role indicator
 * - athlete: Athlete role indicator
 * - team: Team account indicator
 * - count: Numeric count badge (notifications)
 * - custom: Custom icon/content
 * - none: No badge
 */
export type AvatarBadgeType =
  | 'verified'
  | 'premium'
  | 'pro'
  | 'coach'
  | 'athlete'
  | 'team'
  | 'count'
  | 'custom'
  | 'none';

/**
 * Badge position on the avatar
 */
export type AvatarBadgePosition = 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';

/**
 * Badge configuration
 */
export interface AvatarBadgeConfig {
  /** Badge type */
  type: AvatarBadgeType;
  /** Position on avatar */
  position?: AvatarBadgePosition;
  /** Count value (for type='count') */
  count?: number;
  /** Max count before showing "99+" */
  maxCount?: number;
  /** Custom icon name (for type='custom') */
  icon?: string;
  /** Custom color override */
  color?: string;
  /** Custom background color override */
  backgroundColor?: string;
  /** Accessible label for the badge */
  ariaLabel?: string;
}

// ============================================
// COMPONENT CONFIG
// ============================================

/**
 * Avatar loading state
 */
export type AvatarLoadState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Color palette for initials backgrounds
 * Uses a consistent hash to always show same color for same name.
 * Theme-aware via CSS custom properties — mapped to NXT1 design tokens.
 */
export const AVATAR_INITIALS_COLORS = [
  'var(--nxt1-color-primary, #ccff00)', // Brand Primary (Lime/Volt)
  'var(--nxt1-color-info, #1d9bf0)', // Info (Blue)
  'var(--nxt1-color-feedback-success, #22c55e)', // Success (Green)
  'var(--nxt1-color-feedback-warning, #f59e0b)', // Warning (Amber)
  'var(--nxt1-color-feedback-error, #ef4444)', // Error (Red)
  'var(--nxt1-color-accent, #56ff00)', // Accent (Green)
  'var(--nxt1-color-primary-dark, #a3cc00)', // Primary Dark
  'var(--nxt1-color-primary-light, #d4ff4d)', // Primary Light
] as const;

/**
 * Full avatar component configuration
 */
export interface AvatarConfig {
  /** Image source URL */
  src?: string | null;
  /** Alt text for image (also used for initials extraction if name not provided) */
  alt?: string;
  /** Full name (used to generate initials) */
  name?: string;
  /** Explicit initials override (max 2 characters) */
  initials?: string;
  /** Avatar size */
  size?: AvatarSize;
  /** Custom size in pixels (overrides size preset) */
  customSize?: number;
  /** Avatar shape */
  shape?: AvatarShape;
  /** Online status */
  status?: AvatarStatus;
  /** Badge configuration */
  badge?: AvatarBadgeConfig | AvatarBadgeType;
  /** Fallback image URL (shown if src fails) */
  fallbackSrc?: string;
  /** Whether avatar is clickable */
  clickable?: boolean;
  /** Whether to show loading skeleton */
  showSkeleton?: boolean;
  /** Border color (for stories-like ring) */
  borderColor?: string;
  /** Border width */
  borderWidth?: number;
  /** Custom CSS class */
  cssClass?: string;
}

/**
 * Avatar click event
 */
export interface AvatarClickEvent {
  /** Original DOM event */
  event: MouseEvent;
  /** Avatar configuration at time of click */
  config: AvatarConfig;
}
