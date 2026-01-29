/**
 * @fileoverview Organisms - Complex UI components
 * @module @nxt1/ui/components/organisms
 * @version 1.0.0
 *
 * Organisms are relatively complex components composed of
 * molecules and atoms: headers, footers, navigation, modals.
 */

// Bottom Sheet (Native-style modal)
export {
  NxtBottomSheetComponent,
  NxtBottomSheetService,
  type BottomSheetAction,
  type BottomSheetConfig,
  type BottomSheetResult,
  type BottomSheetVariant,
} from '../bottom-sheet';

// Mobile Footer / Tab Bar
export {
  NxtMobileFooterComponent,
  type NavIconName,
  type FooterTabItem,
  type FooterConfig,
  type FooterVariant,
  type FooterIndicatorStyle,
  type FooterTabSelectEvent,
  type FooterTabSelectEventBase,
  DEFAULT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
} from '../footer';

// Page Header
export {
  NxtPageHeaderComponent,
  type PageHeaderVariant,
  type PageHeaderConfig,
  type PageHeaderAction,
} from '../page-header';

// Top Navigation Header
export {
  NxtHeaderComponent,
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  type TopNavSearchSubmitEvent,
} from '../top-nav';

// Sidenav / Drawer Navigation
export {
  NxtSidenavComponent,
  NxtSidenavService,
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
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SIDENAV_ITEMS,
  SIDENAV_WIDTHS,
  SIDENAV_Z_INDEX,
  SIDENAV_ANIMATION,
  SIDENAV_GESTURE,
  createSidenavConfig,
  findSidenavItemById,
  findSidenavItemByRoute,
  updateSidenavBadge,
  toggleSidenavSection,
  filterSidenavByRoles,
} from '../sidenav';

// Unified Picker System
export {
  NxtPickerService,
  type PickerType,
  type PickerBaseConfig,
  type SportPickerConfig,
  type SportItem,
  type SportPickerResult,
  type PositionGroup,
  type PositionPickerResult,
  type PickerResult,
  SPORT_PICKER_DEFAULTS,
  POSITION_PICKER_DEFAULTS,
  isSportPickerResult,
  isPositionPickerResult,
  NxtPickerShellComponent,
  NxtPickerComponent,
  NxtSportPickerContentComponent,
  NxtPositionPickerContentComponent,
} from '../picker';
