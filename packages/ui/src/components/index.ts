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

export { NxtBackButtonComponent, type BackButtonSize, type BackButtonVariant } from './back-button';

export {
  NxtShareButtonComponent,
  type ShareButtonSize,
  type ShareButtonVariant,
} from './share-button';

// ============================================
// SEARCH BAR
// ============================================
export {
  NxtSearchBarComponent,
  type SearchBarVariant,
  type SearchBarSubmitEvent,
} from './search-bar';

export {
  NxtCoachAuthorityValidationComponent,
  type CoachAuthorityQuote,
} from './coach-authority-validation';
export {
  NxtInvisibleAthletePainPointComponent,
  type InvisibleAthleteSignal,
} from './invisible-athlete-pain-point';

export { NxtHeaderCardComponent } from './header-card';

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

export { NxtDesktopPageHeaderComponent } from './desktop-page-header';

export {
  // Component
  NxtHeaderComponent,
  // Angular-specific Types
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  type TopNavSearchSubmitEvent,
} from './top-nav';

// ============================================
// DESKTOP SIDEBAR (Fixed Navigation)
// ============================================
export {
  // Component
  NxtDesktopSidebarComponent,
  // Types
  type DesktopSidebarConfig,
  type DesktopSidebarSection,
  type DesktopSidebarItem,
  type DesktopSidebarUserData,
  type DesktopSidebarSelectEvent,
  // Constants
  DEFAULT_DESKTOP_SIDEBAR_CONFIG,
  DEFAULT_DESKTOP_SIDEBAR_SECTIONS,
  SIDEBAR_BREAKPOINTS,
  SIDEBAR_WIDTHS,
  // Factory
  createDesktopSidebarConfig,
} from './desktop-sidebar';

// ============================================
// MOBILE HEADER (YouTube-Style Mobile Top Nav Bar)
// ============================================
export {
  // Component
  NxtMobileHeaderComponent,
  // Types
  type MobileHeaderConfig,
  type MobileHeaderUserData,
  // Constants
  DEFAULT_MOBILE_HEADER_CONFIG,
  // Factory
  createMobileHeaderConfig,
} from './mobile-header';

// ============================================
// MOBILE SIDEBAR (YouTube-Style Slide-Out Drawer)
// ============================================
export {
  // Component
  NxtMobileSidebarComponent,
  // Types
  type MobileSidebarConfig,
  type MobileSidebarItem,
  type MobileSidebarSection,
  type MobileSidebarUserData,
  type MobileSidebarSelectEvent,
  // Constants
  DEFAULT_MOBILE_SIDEBAR_CONFIG,
  // Factory
  createMobileSidebarConfig,
} from './mobile-sidebar';

// ============================================
// SIDENAV / DRAWER NAVIGATION (Mobile/Hamburger)
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
// HERO / MARKETING COMPONENTS
// ============================================
export {
  NxtHeroHeaderComponent,
  type HeroAudienceCard,
  type HeroConfig,
  type HeroVariant,
  type HeroAudienceCardClickEvent,
} from './hero-header';

export { NxtEcosystemMapComponent, type EcosystemMapStep } from './ecosystem-map';

export {
  NxtKillerComparisonComponent,
  type KillerComparisonRow,
  KILLER_COMPARISON_DEFAULT_ROWS,
} from './nxt1-killer-comparison';
export { NxtValuePropComparisonComponent } from './value-prop-comparison';
export {
  NxtEducationalLibraryComponent,
  type EducationalLibraryItem,
  EDUCATIONAL_LIBRARY_DEFAULT_ITEMS,
} from './educational-library';
export {
  NxtUniversalSportsDirectoryComponent,
  type UniversalSportDirectoryLink,
} from './universal-sports-directory';
export { NxtSuccessStoriesComponent, type SuccessStoryItem } from './success-stories';
export { NxtSectionHeaderComponent, type SectionHeaderLevel } from './section-header';
export {
  NxtSuperProfileBreakdownComponent,
  type SuperProfileHotspot,
} from './super-profile-breakdown';
export {
  NxtMobileFirstDesignSectionComponent,
  type DevicePreview,
} from './mobile-first-design-section';
export { NxtSeoGoogleSearchSectionComponent } from './seo-google-search-section';

export { NxtAgentXWelcomeHeaderComponent } from './agent-x-welcome-header';
export {
  NxtAgentXMoneyballSectionComponent,
  type MoneyballAthleteProfile,
  type MoneyballProgressPoint,
} from './agent-x-moneyball-section';
export {
  NxtAgentXExecutionLayerSectionComponent,
  type ExecutionLayerTask,
} from './agent-x-execution-layer-section';
export { NxtAgentXHypeMachineSectionComponent } from './agent-x-hype-machine-section';
export { NxtImmersiveHeroComponent, type ImmersiveHeroShot } from './immersive-hero';
export { NxtD1DreamHeroComponent, type D1DreamHeadingLevel } from './d1-dream-hero';
export { NxtAppStoreBadgesComponent, type AppStoreBadgeLayout } from './app-store-badges';
export {
  NxtAgentXDemoComponent,
  type AgentXDemoChatMessage,
  type AgentXDemoGraphic,
} from './agent-x-demo';
export {
  NxtTeamBrandArchitectureSectionComponent,
  type BrandPipelineOutputCard,
  type BrandPipelineStep,
} from './team-brand-architecture-section';

// ============================================
// PARTNER MARQUEE (Infinite Logo Scroll)
// ============================================
export {
  NxtPartnerMarqueeComponent,
  type PartnerItem,
  type MarqueeDirection,
  type MarqueeVariant,
} from './partner-marquee';

export { NxtFaqSectionComponent, type FaqItem } from './faq-section';

// ============================================
// RECRUITMENT ENGINE (USA Map + Live Activity Pings)
// ============================================
export {
  NxtRecruitmentEngineComponent,
  type RecruitingActivity,
  type RecruitingActivityType,
} from './recruitment-engine';

export {
  NxtRecruitingRadarSectionComponent,
  type RecruitingRadarEvent,
} from './recruiting-radar-section';

export {
  NxtRecruitmentPillarsSectionComponent,
  type RecruitmentPillar,
} from './recruitment-pillars-section';

export { NxtXpLeaderboardSectionComponent } from './xp-leaderboard-section';

export { NxtNilMonetizationUpsideComponent } from './nil-monetization-upside';

// ============================================
// APP DOWNLOAD BAR
// ============================================
export {
  NxtAppDownloadBarComponent,
  NxtAppDownloadBarService,
  type AppDownloadBarConfig,
} from './app-download-bar';

// ============================================
// UTILITY COMPONENTS
// ============================================
export { NxtRefreshContainerComponent, type RefreshEvent } from './refresh-container';
