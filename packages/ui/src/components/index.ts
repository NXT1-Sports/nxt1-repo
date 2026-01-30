/**
 * @fileoverview Components Barrel Export
 * @module @nxt1/ui/components
 *
 * All reusable UI components for the NXT1 platform.
 * Flat structure with single entry point for tree-shaking optimization.
 *
 * @example
 * import { NxtLogoComponent, NxtAvatarComponent, NxtBottomSheetService } from '@nxt1/ui';
 */

// ============================================
// CORE PRIMITIVES
// ============================================
export { NxtLogoComponent, type LogoSize, type LogoVariant } from './logo';

export {
  NxtImageComponent,
  type ImageFit,
  type ImageLoading,
  type ImageVariant,
  type ImageState,
} from './image';

export { NxtIconComponent, type IconName, type UIIconName, type BrandIconName } from './icon';

// ============================================
// AVATAR
// ============================================
export {
  // Components
  NxtAvatarComponent,
  NxtAvatarGroupComponent,
  // Size types
  type AvatarSize,
  AVATAR_SIZES,
  AVATAR_FONT_SIZES,
  AVATAR_STATUS_SIZES,
  AVATAR_BADGE_SIZES,
  // Shape types
  type AvatarShape,
  // Status types
  type AvatarStatus,
  AVATAR_STATUS_COLORS,
  // Badge types
  type AvatarBadgeType,
  type AvatarBadgePosition,
  type AvatarBadgeConfig,
  // Config types
  type AvatarLoadState,
  type AvatarConfig,
  type AvatarClickEvent,
  // Group types
  type AvatarGroupUser,
  type AvatarGroupOverflowEvent,
  // Colors
  AVATAR_INITIALS_COLORS,
  // Utilities (pure functions - portable)
  extractInitials,
  getInitialsColor,
  getContrastingTextColor,
  formatBadgeCount,
  sanitizeImageUrl,
} from './avatar';

// ============================================
// FORM COMPONENTS
// ============================================
export { NxtChipComponent, type ChipSize, type ChipVariant } from './chip';

export { NxtValidationSummaryComponent, type ValidationSummaryVariant } from './validation-summary';

export { NxtFormFieldComponent } from './form-field';

export { NxtTeamLogoPickerComponent } from './team-logo-picker';

export { NxtColorPickerComponent } from './color-picker';

// ============================================
// LAYOUT / NAVIGATION COMPONENTS
// ============================================
export {
  NxtBottomSheetComponent,
  NxtBottomSheetService,
  type BottomSheetAction,
  type BottomSheetConfig,
  type BottomSheetResult,
  type BottomSheetVariant,
} from './bottom-sheet';

export {
  // Component
  NxtMobileFooterComponent,
  // Types (from @nxt1/core)
  type NavIconName,
  type FooterTabItem,
  type FooterConfig,
  type FooterVariant,
  type FooterIndicatorStyle,
  type FooterTabSelectEvent,
  type FooterTabSelectEventBase,
  // Constants (from @nxt1/core)
  DEFAULT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  // Helper functions (from @nxt1/core)
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
} from './footer';

export {
  NxtPageHeaderComponent,
  type PageHeaderVariant,
  type PageHeaderConfig,
  type PageHeaderAction,
} from './page-header';

export {
  // Component
  NxtHeaderComponent,
  // Angular-specific Types
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  type TopNavSearchSubmitEvent,
} from './top-nav';

// ============================================
// SIDENAV / DRAWER NAVIGATION
// ============================================
export {
  // Component
  NxtSidenavComponent,
  // Service
  NxtSidenavService,
  // Types (from @nxt1/core)
  type SidenavIconName,
  type SocialLink,
  type SidenavItem,
  type SidenavSection,
  type SidenavUserData,
  type SidenavVariant,
  type SidenavPosition,
  type SidenavMode,
  type SidenavConfig,
  type SidenavSelectEvent,
  type SidenavToggleEvent,
  type SidenavSectionToggleEvent,
  // Constants (from @nxt1/core)
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SIDENAV_ITEMS,
  SIDENAV_WIDTHS,
  SIDENAV_Z_INDEX,
  SIDENAV_ANIMATION,
  SIDENAV_GESTURE,
  // Helper functions (from @nxt1/core)
  createSidenavConfig,
  findSidenavItemById,
  findSidenavItemByRoute,
  updateSidenavBadge,
  toggleSidenavSection,
  filterSidenavByRoles,
} from './sidenav';

// ============================================
// UNIFIED PICKER SYSTEM
// ============================================
export {
  // Service (primary API)
  NxtPickerService,
  // Types
  type PickerType,
  type PickerBaseConfig,
  type SportPickerConfig,
  type SportItem,
  type SportPickerResult,
  type PositionGroup,
  type PositionPickerConfig,
  type PositionPickerResult,
  type PickerResult,
  // Defaults
  SPORT_PICKER_DEFAULTS,
  POSITION_PICKER_DEFAULTS,
  // Type guards
  isSportPickerResult,
  isPositionPickerResult,
  // Components (rarely needed directly)
  NxtPickerShellComponent,
  NxtPickerComponent,
  NxtSportPickerContentComponent,
  NxtPositionPickerContentComponent,
} from './picker';

// ============================================
// UTILITY COMPONENTS
// ============================================
export { NxtRefreshContainerComponent, type RefreshEvent } from './refresh-container';
