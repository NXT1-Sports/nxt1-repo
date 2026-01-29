/**
 * @fileoverview Atoms - Basic building block components
 * @module @nxt1/ui/components/atoms
 * @version 1.0.0
 *
 * Atoms are the smallest, indivisible UI components that serve as
 * building blocks. They include: icons, logos, images, avatars, chips.
 */

// Logo
export { NxtLogoComponent, type LogoSize, type LogoVariant } from '../logo';

// Image
export {
  NxtImageComponent,
  type ImageFit,
  type ImageLoading,
  type ImageVariant,
  type ImageState,
} from '../image';

// Icon
export { NxtIconComponent, type IconName, type UIIconName, type BrandIconName } from '../icon';

// Avatar
export {
  NxtAvatarComponent,
  NxtAvatarGroupComponent,
  type AvatarSize,
  AVATAR_SIZES,
  AVATAR_FONT_SIZES,
  AVATAR_STATUS_SIZES,
  AVATAR_BADGE_SIZES,
  type AvatarShape,
  type AvatarStatus,
  AVATAR_STATUS_COLORS,
  type AvatarBadgeType,
  type AvatarBadgePosition,
  type AvatarBadgeConfig,
  type AvatarLoadState,
  type AvatarConfig,
  type AvatarClickEvent,
  type AvatarGroupUser,
  type AvatarGroupOverflowEvent,
  AVATAR_INITIALS_COLORS,
  extractInitials,
  getInitialsColor,
  getContrastingTextColor,
  formatBadgeCount,
  sanitizeImageUrl,
} from '../avatar';

// Chip
export { NxtChipComponent, type ChipSize, type ChipVariant } from '../chip';
