/**
 * @fileoverview Avatar Module Barrel Export
 * @module @nxt1/ui/components/avatar
 * @version 1.0.0
 *
 * Single entry point for all avatar-related exports.
 */

// Component
export { NxtAvatarComponent } from './avatar.component';
export {
  NxtAvatarGroupComponent,
  type AvatarGroupUser,
  type AvatarGroupOverflowEvent,
} from './avatar-group.component';

// Types
export {
  // Size
  type AvatarSize,
  AVATAR_SIZES,
  AVATAR_FONT_SIZES,
  AVATAR_STATUS_SIZES,
  AVATAR_BADGE_SIZES,
  // Shape
  type AvatarShape,
  // Status
  type AvatarStatus,
  AVATAR_STATUS_COLORS,
  // Badge
  type AvatarBadgeType,
  type AvatarBadgePosition,
  type AvatarBadgeConfig,
  // Config
  type AvatarLoadState,
  type AvatarConfig,
  type AvatarClickEvent,
  // Colors
  AVATAR_INITIALS_COLORS,
} from './avatar.types';

// Utilities (pure functions - portable)
export {
  extractInitials,
  getInitialsColor,
  getContrastingTextColor,
  formatBadgeCount,
  sanitizeImageUrl,
} from './avatar.utils';
