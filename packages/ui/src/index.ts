/**
 * @fileoverview @nxt1/ui - Single Entry Point (2026 Angular Best Practices)
 * @module @nxt1/ui
 * @version 2.0.0
 *
 * Shared Angular/Ionic UI components, services, and infrastructure for NXT1 platform.
 * Cross-platform compatible with Web, iOS, and Android.
 *
 * This package consolidates ALL Angular-specific code using modern Angular Package Format (APF):
 * - Single entry point with tree-shaking (no secondary entry points)
 * - Strict encapsulation via package.json exports field
 * - Optimal bundle splitting handled by Angular compiler
 *
 * IMPORTANT: This package contains ANGULAR/IONIC dependencies.
 * For pure TypeScript utilities, use @nxt1/core instead.
 *
 * @example
 * ```typescript
 * // All imports from '@nxt1/ui' - tree-shaking handles optimization
 * import {
 *   // Auth Components
 *   AuthShellComponent,
 *   AuthEmailFormComponent,
 *   AuthSocialButtonsComponent,
 *
 *   // Shared Components
 *   NxtLogoComponent,
 *   NxtIconComponent,
 *
 *   // Services
 *   NxtPlatformService,
 *   NxtToastService,
 *   HapticsService,
 *
 *   // Infrastructure
 *   GlobalErrorHandler,
 *   httpErrorInterceptor,
 *
 *   // Onboarding
 *   OnboardingRoleSelectionComponent,
 *   OnboardingProgressBarComponent,
 * } from '@nxt1/ui';
 * ```
 */

// ============================================
// VERSION
// ============================================
export const NXT1_UI_VERSION = '2.0.0';

// ============================================
// AUTH COMPONENTS
// ============================================
export { AuthShellComponent, type AuthShellVariant } from './auth/auth-shell';
export { AuthTitleComponent, type AuthTitleSize } from './auth/auth-title';
export { AuthSubtitleComponent, type AuthSubtitleSize } from './auth/auth-subtitle';
export { AuthSocialButtonsComponent, type SocialProvidersConfig } from './auth/auth-social-buttons';
export { AuthActionButtonsComponent } from './auth/auth-action-buttons';
export { AuthDividerComponent } from './auth/auth-divider';
export { AuthAppDownloadComponent } from './auth/auth-app-download';
export { AuthModeSwitcherComponent, type AuthMode } from './auth/auth-mode-switcher';
export { AuthTermsDisclaimerComponent } from './auth/auth-terms-disclaimer';
export {
  AuthEmailFormComponent,
  type AuthEmailFormData,
  type AuthEmailFormMode,
} from './auth/auth-email-form';
export {
  AuthTeamCodeComponent,
  AuthTeamCodeBannerComponent,
  type TeamCodeValidationState,
  type ValidatedTeamInfo,
} from './auth/auth-team-code';
export { AuthBiometricPromptComponent } from './auth/auth-biometric-prompt';
export {
  AuthBiometricButtonComponent,
  type BiometryButtonType,
} from './auth/auth-biometric-button';

// Auth Modal (Popup Authentication)
export { AuthModalComponent } from './auth/auth-modal';
export {
  AuthModalService,
  type AuthModalConfig,
  type AuthModalResult,
  type AuthModalDismissReason,
} from './auth/auth-modal';

// Biometric Prompt Service (2026 Native-Style Modal)
export {
  BiometricPromptService,
  BiometricPromptContentComponent,
  type BiometryDisplayType,
  type BiometricPromptConfig,
  type BiometricPromptResult,
} from './auth/biometric-prompt';

// ============================================
// CORE UI COMPONENTS
// ============================================
export { NxtLogoComponent, type LogoSize, type LogoVariant } from './components/logo';
export { ScheduleBoardComponent } from './components/schedule-board';
export { StatsDashboardComponent } from './components/stats-dashboard';
export { NewsBoardComponent } from './components/news-board';
export { NotFoundComponent } from './components/not-found/not-found.component';
export {
  NxtImageComponent,
  type ImageFit,
  type ImageLoading,
  type ImageVariant,
  type ImageState,
} from './components/image';
export {
  NxtIconComponent,
  type IconName,
  type UIIconName,
  type BrandIconName,
} from './components/icon';
export {
  NxtBackButtonComponent,
  type BackButtonSize,
  type BackButtonVariant,
} from './components/back-button';
export {
  NxtShareButtonComponent,
  type ShareButtonSize,
  type ShareButtonVariant,
} from './components/share-button';

// ============================================
// SEARCH BAR (Shared Native HTML Search — No Shadow DOM)
// ============================================
export {
  NxtSearchBarComponent,
  type SearchBarVariant,
  type SearchBarSubmitEvent,
} from './components/search-bar';

// ============================================
// HERO / MARKETING COMPONENTS
// ============================================
export {
  NxtHeroHeaderComponent,
  type HeroAudienceCard,
  type HeroConfig,
  type HeroVariant,
  type HeroAudienceCardClickEvent,
} from './components/hero-header';
export { NxtEcosystemMapComponent, type EcosystemMapStep } from './components/ecosystem-map';
export { NxtSectionHeaderComponent, type SectionHeaderLevel } from './components/section-header';
export {
  NxtKillerComparisonComponent,
  type KillerComparisonRow,
  KILLER_COMPARISON_DEFAULT_ROWS,
} from './components/nxt1-killer-comparison';
export { NxtHeaderCardComponent } from './components/header-card';
export {
  NxtSuperProfileBreakdownComponent,
  type SuperProfileHotspot,
} from './components/super-profile-breakdown';
export {
  NxtMobileFirstDesignSectionComponent,
  type DevicePreview,
} from './components/mobile-first-design-section';
export { NxtSeoGoogleSearchSectionComponent } from './components/seo-google-search-section';

export { NxtAgentXWelcomeHeaderComponent } from './components/agent-x-welcome-header';
export {
  NxtAgentXIdentitySectionComponent,
  type IdentityTreeInput,
} from './components/agent-x-identity-section';
export {
  NxtAgentXExecutionLayerSectionComponent,
  type ExecutionLayerTask,
} from './components/agent-x-execution-layer-section';
export { NxtAgentXHypeMachineSectionComponent } from './components/agent-x-hype-machine-section';
export {
  NxtAgentXMoneyballSectionComponent,
  type MoneyballAthleteProfile,
  type MoneyballProgressPoint,
} from './components/agent-x-moneyball-section';
export {
  NxtSuccessSimulationSectionComponent,
  type SuccessSimulationScenario,
} from './components/success-simulation-section';
export {
  NxtCoverageGapPainPointComponent,
  type CoverageGapLayer,
} from './components/coverage-gap-pain-point';
export {
  NxtRecruitingEmailAssistantSectionComponent,
  type RecruitingEmailAssistantDraft,
} from './components/recruiting-email-assistant-section';
export { NxtNewsletterFeatureSectionComponent } from './components/newsletter-feature-section';
export { NxtRankingsEngineSectionComponent } from './components/rankings-engine-section';
export {
  NxtGetItDoneWorkflowSectionComponent,
  type GetItDoneWorkflow,
  type GetItDoneWorkflowStep,
} from './components/get-it-done-workflow-section';
export {
  NxtHighlightEngineActionSectionComponent,
  type HighlightEngineStep,
} from './components/highlight-engine-action-section';
export {
  NxtLimitlessBoxSectionComponent,
  type LimitlessBurstNode,
} from './components/limitless-box-section';
export {
  NxtTeamBrandArchitectureSectionComponent,
  type BrandPipelineOutputCard,
  type BrandPipelineStep,
} from './components/team-brand-architecture-section';
export { NxtOldVsNewContrastSectionComponent } from './components/old-vs-new-contrast-section';
export { NxtIntegrationPipelineSectionComponent } from './components/integration-pipeline-section';
export { NxtBrandKitIntegrationSectionComponent } from './components/brand-kit-integration-section';
export {
  NxtHighlightReelNetworkSectionComponent,
  type DistributionDestination,
} from './components/highlight-reel-network-section';
export { NxtImmersiveHeroComponent, type ImmersiveHeroShot } from './components/immersive-hero';
export { NxtD1DreamHeroComponent, type D1DreamHeadingLevel } from './components/d1-dream-hero';
export { NxtOpenDoorsHeroComponent } from './components/open-doors-hero';
export { NxtMediaEmpireHeroComponent } from './components/media-empire-hero';
export { NxtBreakingNewsHeroComponent } from './components/breaking-news-hero';
export { NxtScoutReportJournalismSectionComponent } from './components/scout-report-journalism-section';
export { NxtCoSignCollaborationSectionComponent } from './components/co-sign-collaboration-section';
export { NxtGraphicFactoryHeroComponent } from './components/graphic-factory-hero';
export { NxtInfiniteContentEngineSectionComponent } from './components/infinite-content-engine-section';
export {
  NxtAppStoreBadgesComponent,
  type AppStoreBadgeLayout,
} from './components/app-store-badges';
export { NxtUnfairAdvantageHeroComponent } from './components/unfair-advantage-hero';

// ============================================
// GENESIS MOMENT (Team Platform — Big Bang)
// ============================================
export { NxtGenesisMomentComponent } from './components/genesis-moment';

// ============================================
// PARTNER MARQUEE (Infinite Logo Scroll)
// ============================================
export {
  NxtPartnerMarqueeComponent,
  type PartnerItem,
  type MarqueeDirection,
  type MarqueeVariant,
} from './components/partner-marquee';

export {
  NxtLockerRoomTalkMarqueeComponent,
  type LockerRoomReviewItem,
} from './components/locker-room-talk-marquee';

export {
  NxtDraftClassTickerComponent,
  type DraftClassAthleteCard,
} from './components/draft-class-ticker';

export {
  NxtMovementSectionComponent,
  type MovementActivityItem,
} from './components/movement-section';

export { NxtFaqSectionComponent, type FaqItem } from './components/faq-section';

// ============================================
// RECRUITMENT ENGINE (USA Map + Live Activity Pings)
// ============================================
export {
  NxtRecruitmentEngineComponent,
  type RecruitingActivity,
  type RecruitingActivityType,
} from './components/recruitment-engine';
export { NxtCommunicationCenterSectionComponent } from './components/communication-center-section';
export { NxtRecruitingCommandCenterSectionComponent } from './components/recruiting-command-center-section';
export {
  NxtOpportunityRadarSectionComponent,
  type OpportunityRadarSchoolMatch,
} from './components/opportunity-radar-section';

// ============================================
// COACH ROLODEX (College Network Stats + Logo Marquee)
// ============================================
export { NxtCoachRolodexComponent, type CollegeLogo } from './components/coach-rolodex';

// ============================================
// AGENT X DEMO (AI Creative Director Showcase)
// ============================================
export {
  NxtAgentXDemoComponent,
  type AgentXDemoChatMessage,
  type AgentXDemoGraphic,
} from './components/agent-x-demo';
export { NxtNilMonetizationUpsideComponent } from './components/nil-monetization-upside';

export {
  NxtCoachAuthorityValidationComponent,
  type CoachAuthorityQuote,
} from './components/coach-authority-validation';
export {
  NxtCoachesNetworkAuthorityComponent,
  type CoachesNetworkLogo,
} from './components/coaches-network-authority';
export {
  NxtInvisibleAthletePainPointComponent,
  type InvisibleAthleteSignal,
} from './components/invisible-athlete-pain-point';

// ============================================
// REUSABLE LANDING / MARKETING SECTIONS
// ============================================
export { NxtStatsBarComponent, type StatsBarItem } from './components/stats-bar';
export {
  NxtFeatureShowcaseComponent,
  type FeatureShowcaseItem,
} from './components/feature-showcase';
export {
  NxtEducationalLibraryComponent,
  type EducationalLibraryItem,
  EDUCATIONAL_LIBRARY_DEFAULT_ITEMS,
} from './components/educational-library';
export { NxtAudienceSectionComponent, type AudienceSegment } from './components/audience-section';
export {
  NxtCtaBannerComponent,
  type CtaBannerVariant,
  type CtaAvatarImage,
} from './components/cta-banner';
export {
  NxtCtaButtonComponent,
  type CtaButtonVariant,
  type CtaButtonSize,
} from './components/cta-button';
export {
  NxtHeroSectionComponent,
  type HeroLayout,
  type HeadingLevel,
} from './components/hero-section';
export { NxtValuePropComparisonComponent } from './components/value-prop-comparison';
export {
  NxtUniversalSportsDirectoryComponent,
  type UniversalSportDirectoryLink,
} from './components/universal-sports-directory';
export { NxtSuccessStoriesComponent, type SuccessStoryItem } from './components/success-stories';
export {
  NxtSiteFooterComponent,
  type SiteFooterLink,
  type SiteFooterLinkGroup,
} from './components/site-footer';

// ============================================
// AVATAR COMPONENT (Professional Avatar with Status/Badges)
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
} from './components/avatar';
export { NxtChipComponent, type ChipSize, type ChipVariant } from './components/chip';
export {
  NxtValidationSummaryComponent,
  type ValidationSummaryVariant,
} from './components/validation-summary';
export { NxtFormFieldComponent } from './components/form-field';
export { NxtTeamLogoPickerComponent } from './components/team-logo-picker';
export { NxtColorPickerComponent } from './components/color-picker';

// ============================================
// BOTTOM SHEET (2026 Native-Style Modal)
// ============================================
export {
  NxtBottomSheetComponent,
  NxtBottomSheetService,
  type BottomSheetAction,
  type BottomSheetConfig,
  type BottomSheetResult,
  type BottomSheetVariant,
  // Content Sheet types (for full component injection)
  type ContentSheetConfig,
  type ContentSheetResult,
} from './components/bottom-sheet';

// ============================================
// MOBILE FOOTER / TAB BAR (2026 Native-Style Navigation)
// ============================================
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
  type FooterScrollToTopEvent,
  // Constants (from @nxt1/core)
  DEFAULT_FOOTER_TABS,
  CENTERED_CREATE_FOOTER_TABS,
  AGENT_X_CENTER_FOOTER_TABS,
  AGENT_X_LEFT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  MAIN_PAGE_ROUTES,
  // Helper functions (from @nxt1/core)
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
  isMainPageRoute,
} from './components/footer';

// ============================================
// PAGE HEADER (Professional Contextual Headers)
// ============================================
export {
  NxtPageHeaderComponent,
  type PageHeaderVariant,
  type PageHeaderConfig,
  type PageHeaderAction,
} from './components/page-header';
export { NxtDesktopPageHeaderComponent } from './components/desktop-page-header';

// ============================================
// OPTION SCROLLER (Twitter/TikTok Style Tab Selector)
// ============================================
export {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerVariant,
  type OptionScrollerIndicatorStyle,
  type OptionScrollerSize,
  type OptionScrollerConfig,
  type OptionScrollerChangeEvent,
  DEFAULT_OPTION_SCROLLER_CONFIG,
  OPTION_SCROLLER_SIZES,
} from './components/option-scroller';

// ============================================
// OPTION SCROLLER WEB (Zero Ionic, SSR-safe)
// ============================================
export { NxtOptionScrollerWebComponent } from './components/option-scroller-web';

// ============================================
// SECTION NAV WEB (Vertical Side-Nav for Two-Column Layouts)
// ============================================
export {
  NxtSectionNavWebComponent,
  type SectionNavItem,
  type SectionNavChangeEvent,
} from './components/section-nav-web';

// ============================================
// AGENT X (AI Assistant - Shared Web & Mobile)
// ============================================
export {
  // Service
  AgentXService,
  // Components
  AgentXShellComponent,
  AgentXWelcomeComponent,
  AgentXChatComponent,
  AgentXInputComponent,
  // Mode Content (shared web & mobile)
  AgentXModeContentComponent,
  AgentXDraftsComponent,
  AgentXTemplateGridComponent,
  AgentXBundlesComponent,
  AgentXTaskListComponent,
  // Types
  type AgentXUser,
  // Landing
  NxtAgentXLandingComponent,
  // FAB Chat Widget (Web-only, SSR-safe)
  AgentXFabComponent,
  AgentXFabChatPanelComponent,
  AgentXFabService,
  type FabPanelState,
} from './agent-x';

// ============================================
// AGENT X WEB (Zero Ionic, SSR-safe)
// ============================================
export { AgentXShellWebComponent, AgentXWelcomeWebComponent } from './agent-x/web';

// ============================================
// CREATE POST (Post Creation - Shared Web & Mobile)
// ============================================
export {
  // Components
  CreatePostSkeletonComponent,
  CreatePostXpIndicatorComponent,
  CreatePostPrivacySelectorComponent,
  CreatePostMediaPickerComponent,
  CreatePostEditorComponent,
  CreatePostToolbarComponent,
  CreatePostPreviewComponent,
  CreatePostProgressComponent,
  CreatePostShellComponent,
  // Services
  CreatePostService,
  CreatePostApiService,
  // Types
  type UploadingFile,
  type CreatePostServiceState,
  // Mock data (dev only)
  MOCK_CURRENT_USER,
  MOCK_TAGGABLE_USERS,
  MOCK_LOCATIONS,
  MOCK_MEDIA_ITEMS,
  MOCK_XP_PREVIEW,
} from './create-post';

// ============================================
// ACTIVITY (Notifications - Shared Web & Mobile)
// ============================================
export {
  // Service
  ActivityService,
  ActivityApiService,
  ACTIVITY_API_BASE_URL,
  // Components
  ActivityShellComponent,
  ActivityListComponent,
  ActivityItemComponent,
  ActivitySkeletonComponent,
  // Types
  type ActivityUser,
} from './activity';

// ============================================
// MESSAGES (Shared Web & Mobile)
// ============================================
export {
  // Service
  MessagesService,
  // Mobile (Ionic)
  MessagesShellComponent,
  // Web (SSR-safe, zero Ionic)
  MessagesShellWebComponent,
  // Shared Components
  MessagesListComponent,
  MessagesItemComponent,
  MessagesSkeletonComponent,
  // Types
  type MessagesUser,
  // Legacy (placeholder — kept for backward compatibility)
  MessagesPlaceholderComponent,
  // Conversation — Thread/chat view
  ConversationShellComponent,
  ConversationShellWebComponent,
  ConversationHeaderComponent,
  MessageBubbleComponent,
  MessageInputComponent,
  ConversationService,
} from './messages';

// ============================================
// EXPLORE (Search & Discovery)
// ============================================
export {
  // Service
  ExploreService,
  // Mobile (Ionic)
  ExploreShellComponent,
  ExploreListComponent,
  ExploreItemComponent,
  ExploreForYouComponent,
  // Web (Zero Ionic)
  ExploreShellWebComponent,
  ExploreListWebComponent,
  ExploreItemWebComponent,
  ExploreForYouWebComponent,
  // Shared
  ExploreSkeletonComponent,
  ExploreFilterModalComponent,
  ExploreFilterModalService,
  // Types
  type ExploreUser,
  type ExploreFilterModalConfig,
  type ExploreFilterModalResult,
} from './explore';

// ============================================
// PROFILE (User Profile)
// ============================================
export {
  // Service
  ProfileService,
  // Mappers
  userToProfilePageData,
  // Shell Components
  ProfileShellComponent,
  ProfileShellWebComponent,
  // Shared Section Components (used by both shells)
  ProfileOverviewComponent,
  ProfileMetricsComponent,
  ProfileContactComponent,
  ProfileAcademicComponent,
  ProfileScoutingComponent,
  ProfileMobileHeroComponent,
  ProfileVerificationBannerComponent,
  // Other Components
  ProfileHeaderComponent,
  ProfileTimelineComponent,
  ProfileOffersComponent,
  ProfileSkeletonComponent,
  RelatedAthletesComponent,
  // Types
  type ProfileShellUser,
  type ProfileSkeletonVariant,
  type RelatedAthlete,
  type RankingSource,
  // Mock Data (Development)
  MOCK_PROFILE_USER,
  MOCK_FOLLOW_STATS,
  MOCK_QUICK_STATS,
  MOCK_PINNED_VIDEO,
  MOCK_POSTS,
  MOCK_OFFERS,
  MOCK_ATHLETIC_STATS,
  MOCK_EVENTS,
  MOCK_PROFILE_PAGE_DATA,
} from './profile';

// ============================================
// SETTINGS (User Settings - Shared Web & Mobile)
// ============================================
export {
  // Service
  SettingsService,
  // Components
  SettingsShellComponent,
  SettingsSectionComponent,
  SettingsItemComponent,
  SettingsSkeletonComponent,
  // Types
  type SettingsUser,
  type SettingsSectionToggleEvent,
  type SettingsToggleEvent,
  type SettingsNavigateEvent,
  type SettingsActionEvent,
  type SettingsSelectEvent,
  type SettingsCopyEvent,
} from './settings';

// ============================================
// THEME SELECTOR (2026 Professional Theme Picker)
// ============================================
export {
  NxtThemeSelectorComponent,
  type ThemeSelectorVariant,
  type ThemeSelectEvent,
} from './components/theme-selector';

// ============================================
// RESPONSIVE HEADER NAVIGATION (2026 Native-Style)
// ============================================
export {
  // Component
  NxtHeaderComponent,
  // Angular-specific Types
  type TopNavSelectEvent,
  type TopNavUserMenuEvent,
  type TopNavSearchSubmitEvent,
} from './components/top-nav';

// Re-export core types for convenience
export {
  type TopNavIconName,
  type TopNavItem,
  type TopNavDropdownItem,
  type TopNavUserMenuItem,
  type TopNavUserData,
  type TopNavVariant,
  type TopNavConfig,
  type TopNavActionEvent,
  type TopNavSearchEvent,
  DEFAULT_TOP_NAV_ITEMS,
  DEFAULT_USER_MENU_ITEMS,
  TOP_NAV_HEIGHTS,
  TOP_NAV_ANIMATION,
  createTopNavConfig,
  findTopNavItemById,
  findTopNavItemByRoute,
  updateTopNavBadge,
} from '@nxt1/core';

// ============================================
// DESKTOP SIDEBAR (2026 YouTube/LinkedIn-Style Fixed Sidebar)
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
  type GetSidebarSectionsOptions,
  // Constants
  DEFAULT_DESKTOP_SIDEBAR_CONFIG,
  DEFAULT_DESKTOP_SIDEBAR_SECTIONS,
  LOGGED_IN_SIDEBAR_SECTIONS,
  LOGGED_OUT_SIDEBAR_SECTIONS,
  SIDEBAR_BREAKPOINTS,
  SIDEBAR_WIDTHS,
  // Factory
  createDesktopSidebarConfig,
  getSidebarSections,
} from './components/desktop-sidebar';

// ============================================
// MOBILE HEADER (2026 YouTube-Style Mobile Top Nav Bar)
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
} from './components/mobile-header';

// ============================================
// MOBILE SIDEBAR (2026 YouTube-Style Slide-Out Drawer)
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
} from './components/mobile-sidebar';

// ============================================
// SIDENAV / DRAWER NAVIGATION (2026 Twitter/X-Style)
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
  type SidenavSportProfile,
  type SidenavUserData,
  type SidenavVariant,
  type SidenavPosition,
  type SidenavMode,
  type SidenavConfig,
  type SidenavSelectEvent,
  type SidenavToggleEvent,
  type SidenavSectionToggleEvent,
  // Angular-specific types
  type SidenavItemSelectEvent,
  type SidenavToggleEventAngular,
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
} from './components/sidenav';

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
} from './components/picker';

// ============================================
// SERVICES
// ============================================
export {
  NxtPlatformService,
  type DeviceType,
  type OperatingSystem,
  type Orientation,
  type IonicMode,
  type PlatformCapabilities,
  type ViewportInfo,
  BREAKPOINTS,
} from './services/platform';

export {
  NxtToastService,
  type ToastType,
  type ToastPosition,
  type ToastAction,
  type ToastOptions,
} from './services/toast';

export {
  HapticsService,
  type HapticImpact,
  type HapticNotification,
  HapticButtonDirective,
  HapticSelectionDirective,
  type HapticFeedbackType,
} from './services/haptics';

// ============================================
// MODAL SERVICE (2026 Unified Native Modal System)
// ============================================
export {
  NxtModalService,
  type AlertConfig,
  type ConfirmConfig,
  type PromptConfig,
  type PromptResult,
  type ActionSheetConfig,
  type ActionSheetAction,
  type ActionSheetResult,
  type LoadingConfig,
  type ActiveModal,
  type ModalCapabilities,
  type ModalPreference,
} from './services/modal';

export { NxtLoggingService, LOGGING_CONFIG, type LoggingConfig } from './services/logging';

// Analytics adapter token (provided by apps)
export { ANALYTICS_ADAPTER } from './services/analytics/analytics-adapter.token';

// ============================================
// NOTIFICATION STATE SERVICE (Global State Management)
// ============================================
export { NxtNotificationStateService } from './services/notification-state';

// ============================================
// BROWSER SERVICE (Professional In-App Browser)
// ============================================
export {
  NxtBrowserService,
  type BrowserState,
  type BrowserOpenResult,
  type BrowserServiceConfig,
} from './services/browser';

// ============================================
// SCROLL SERVICE (Cross-Platform Scroll Management)
// ============================================
export {
  NxtScrollService,
  type ScrollBehavior,
  type ScrollTarget,
  type ScrollToTopOptions,
  DEFAULT_SCROLL_OPTIONS,
} from './services/scroll';

// ============================================
// GESTURE SERVICES (Native-feel touch handling)
// ============================================
export {
  // Generic swipe gesture handler (framework-agnostic)
  createSwipeGestureHandler,
  createGestureConfig,
  DEFAULT_GESTURE_CONFIG,
  // Sidenav-specific gesture service
  NxtSidenavGestureService,
  // Types
  type SwipeDirection,
  type GesturePhase,
  type SwipeGestureConfig,
  type GestureStartState,
  type GestureState,
  type GestureResult,
  type GestureCallbacks,
  type GestureHandler,
  type SidenavGestureConfig,
} from './services/gesture';

// ============================================
// BREADCRUMB TRACKING (Crashlytics Integration)
// ============================================
export {
  NxtBreadcrumbService,
  NxtTrackClickDirective,
  NxtTrackFormDirective,
  NxtTrackVisibleDirective,
} from './services/breadcrumb';

// ============================================
// INFRASTRUCTURE - Error Handling
// ============================================
export {
  GlobalErrorHandler,
  GLOBAL_ERROR_LOGGER,
  GLOBAL_CRASHLYTICS,
  type ErrorSeverity,
  ERROR_MESSAGES,
} from './infrastructure/error-handling';

// ============================================
// INFRASTRUCTURE - HTTP Interceptors
// ============================================
export {
  httpErrorInterceptor,
  type HttpErrorInterceptorOptions,
} from './infrastructure/interceptors';

// ============================================
// AUTH ERROR HANDLING (in services/)
// ============================================
export { AuthErrorHandler, type AuthError, type AuthRecoveryAction } from './services/auth-error';

// ============================================
// THEME SERVICE (2026 Professional Theme Management)
// ============================================
export {
  NxtThemeService,
  THEME_OPTIONS,
  SPORT_THEME_OPTIONS,
  type ThemePreference,
  type EffectiveTheme,
  type SportTheme,
  type ThemeChangeEvent,
  type ThemeOption,
  type SportThemeOption,
} from './services/theme';

// ============================================
// ONBOARDING COMPONENTS
// ============================================
export {
  OnboardingRoleSelectionComponent,
  ONBOARDING_ROLE_OPTIONS,
  type RoleOption,
} from './onboarding/onboarding-role-selection';

export { OnboardingProfileStepComponent } from './onboarding/onboarding-profile-step';

export {
  OnboardingTeamStepComponent,
  TEAM_TYPE_OPTIONS,
  type TeamTypeOption,
} from './onboarding/onboarding-team-step';

export { OnboardingSportStepComponent } from './onboarding/onboarding-sport-step';

export { OnboardingPositionStepComponent } from './onboarding/onboarding-position-step';

export { OnboardingContactStepComponent } from './onboarding/onboarding-contact-step';

export {
  OnboardingReferralStepComponent,
  REFERRAL_OPTIONS,
  type ReferralOption,
  type ReferralSourceType,
} from './onboarding/onboarding-referral-step';

export { OnboardingProgressBarComponent } from './onboarding/onboarding-progress-bar';

export { OnboardingNavigationButtonsComponent } from './onboarding/onboarding-navigation-buttons';

export { OnboardingButtonMobileComponent } from './onboarding/onboarding-button-mobile';

export { OnboardingProgressPillsComponent } from './onboarding/onboarding-progress-pills';

export {
  OnboardingStepCardComponent,
  type StepCardVariant,
  type AnimationDirection,
} from './onboarding/onboarding-step-card';

export { OnboardingCelebrationComponent } from './onboarding/onboarding-celebration';

export { OnboardingCompleteComponent } from './onboarding/onboarding-complete';

export { OnboardingWelcomeComponent } from './onboarding/onboarding-welcome';

// ============================================
// PULL-TO-REFRESH (2026 Native-Style)
// ============================================
export {
  // Components
  NxtRefresherComponent,
  NxtRefreshContainerComponent,
  // Types
  type RefreshEvent,
  type RefreshPullEvent,
  type RefresherSpinner,
  type RefreshContainerConfig,
  // Constants
  DEFAULT_REFRESH_CONFIG,
} from './components/refresh-container';

// ============================================
// ANALYTICS DASHBOARD (Shared Web & Mobile)
// ============================================
export {
  // Service
  AnalyticsDashboardService,
  // Components (Ionic — Mobile)
  AnalyticsDashboardShellComponent,
  // Components (Web — Zero Ionic)
  AnalyticsDashboardShellWebComponent,
  // Skeleton Loading
  AnalyticsDashboardSkeletonComponent,
  // Landing Page (Auth-aware marketing page)
  NxtAnalyticsLandingComponent,
  // Dashboard Preview (Interactive mockup)
  NxtAnalyticsDashboardPreviewComponent,
  // Types
  type AnalyticsUser,
  // Mock Data (Development Only)
  getMockAthleteReport,
  getMockCoachReport,
} from './analytics-dashboard';

// ============================================
// XP (Gamified Tasks - Shared Web & Mobile)
// ============================================
export {
  // Service
  XpService,
  // Components
  XpShellComponent,
  XpShellWebComponent,
  XpProgressComponent,
  XpCategoryComponent,
  XpItemComponent,
  XpBadgeComponent,
  XpBadgeGridComponent,
  XpSkeletonComponent,
  XpProgressSkeletonComponent,
  XpItemSkeletonComponent,
  // Landing Page (Public marketing)
  NxtXpLandingComponent,
  NxtXpDashboardPreviewComponent,
  // Mock Data (Development Only)
  MOCK_ATHLETE_XP_TASKS,
  MOCK_COACH_XP_TASKS,
  MOCK_ATHLETE_PROGRESS,
  MOCK_COACH_PROGRESS,
} from './xp';

// ============================================
// SCOUT REPORTS (Athlete Scouting - Shared Web & Mobile)
// ============================================
export {
  // Components
  ScoutReportsShellComponent,
  ScoutReportsContentComponent,
  ScoutReportListComponent,
  ScoutReportCardComponent,
  ScoutReportSkeletonComponent,
  ScoutReportDetailSkeletonComponent,
  ScoutReportEmptyStateComponent,
  ScoutReportCategoryTabsComponent,
  ScoutReportSearchBarComponent,
  ScoutReportSortSelectorComponent,
  ScoutReportFilterPanelComponent,
  ScoutReportRatingDisplayComponent,
  ScoutReportQuickStatsComponent,
  ScoutReportBookmarkButtonComponent,
  ScoutReportPremiumBadgeComponent,
  // Services
  ScoutReportsService,
  ScoutReportsApiService,
  // Types
  type QuickStatItem,
  type PremiumBadgeVariant,
  // Mock Data (Development Only)
  MOCK_SCOUT_REPORTS,
  MOCK_CATEGORY_BADGES,
  getMockReportsByCategory,
  getMockReportCount,
} from './scout-reports';

// ============================================
// ACTIVITY CARD (Shared Content Atom - Web & Mobile)
// ============================================
export { NxtActivityCardComponent } from './components/activity-card';

// ============================================
// FEED (Home Feed - Shared Web & Mobile)
// ============================================
export {
  // Components
  FeedPostCardComponent,
  FeedSkeletonComponent,
  FeedEmptyStateComponent,
  FeedListComponent,
  FeedShellComponent,
  // Services
  FeedService,
  // Types
  type FeedSkeletonVariant,
  // Mock Data (Development Only)
  MOCK_FEED_POSTS,
  getMockFeedPosts,
  getMockPost,
  mockToggleLike,
  mockToggleBookmark,
} from './feed';

// ============================================
// NEWS (Sports Recruiting News - Shared Web & Mobile)
// ============================================
export {
  // Components
  NewsShellComponent,
  NewsContentComponent,
  NewsListComponent,
  NewsArticleCardComponent,
  NewsArticleDetailComponent,
  NewsCategoryFilterComponent,
  NewsSkeletonComponent,
  NewsEmptyStateComponent,
  NewsBookmarkButtonComponent,
  NewsReadingProgressComponent,
  // Services
  NewsService,
  NewsApiService,
  NEWS_API_BASE_URL,
  // Mock Data (Development Only)
  MOCK_NEWS_ARTICLES,
  MOCK_READING_STATS,
  getMockArticlesByCategory,
  getMockArticleById,
  getMockTrendingArticles,
} from './news';

// ============================================
// HELP CENTER (Adaptive Design Architecture)
// - _shared/: Platform-agnostic services
// - mobile/: Ionic components for native mobile
// - web/: Tailwind components for SSR-optimized web
// ============================================
export {
  // Shared Service (all platforms)
  HelpCenterService,

  // Mobile Components (Ionic)
  HelpCenterShellMobileComponent,

  // Web Components (Tailwind SSR)
  HelpCenterShellWebComponent,
  HelpCategoryDetailWebComponent,
  HelpArticleDetailWebComponent,

  // Types
  type HelpNavigateEvent,

  // Legacy (deprecated - use platform-specific)
  HelpCenterShellComponent,
  HelpCategoryDetailComponent,
  HelpArticleDetailComponent,
} from './help-center';

// ============================================
// EDIT PROFILE (Profile Editing - Shared Web & Mobile)
// ============================================
export {
  // Components
  EditProfileShellComponent,
  EditProfileProgressComponent,
  EditProfileSectionComponent,
  EditProfileSkeletonComponent,
  // Services
  EditProfileService,
  EditProfileBottomSheetService,
  EditProfileModalComponent,
  // Mock Data (Development Only)
  MOCK_EDIT_PROFILE_FORM_DATA,
  MOCK_PROFILE_COMPLETION,
  MOCK_EDIT_PROFILE_SECTIONS,
  MOCK_PROFILE_ACHIEVEMENTS,
  MOCK_EMPTY_PROFILE_FORM_DATA,
  MOCK_EMPTY_COMPLETION,
} from './edit-profile';

// ============================================
// MANAGE TEAM (Team Management - Shared Web & Mobile)
// ============================================
export {
  // Shell Component (main container)
  ManageTeamShellComponent,
  type ManageTeamCloseEvent,
  // Services
  ManageTeamService,
  ManageTeamBottomSheetService,
  type ManageTeamSheetOptions,
  type ManageTeamSheetResult,
  // Skeleton
  ManageTeamSkeletonComponent,
  // Landing Page (Public Marketing)
  NxtManageTeamLandingComponent,
  NxtManageTeamDashboardPreviewComponent,
  // Section Components (for custom layouts)
  ManageTeamInfoSectionComponent,
  ManageTeamRosterSectionComponent,
  ManageTeamScheduleSectionComponent,
  ManageTeamStatsSectionComponent,
  ManageTeamStaffSectionComponent,
  ManageTeamSponsorsSectionComponent,
  ManageTeamIntegrationsSectionComponent,
  // Mock Data (Development Only)
  MOCK_MANAGE_TEAM_FORM_DATA,
} from './manage-team';

// ============================================
// USAGE (Usage Dashboard & Billing - Shared Web & Mobile)
// ============================================
export {
  // Shell Components
  UsageShellComponent, // Mobile (Ionic)
  UsageShellWebComponent, // Web SSR (zero Ionic)
  type UsageUser,
  // Skeleton
  UsageSkeletonComponent,
  // Landing Page (Public Marketing)
  NxtUsageLandingComponent,
  NxtUsageDashboardPreviewComponent,
  // Services
  UsageService,
  UsageBottomSheetService,
  type UsageBottomSheetResult,
  // Navigation
  type UsageSection,
  type UsageSectionNav,
  USAGE_SECTION_NAVS,
  // Section Components (for custom layouts)
  UsageOverviewComponent,
  UsageSubscriptionsComponent,
  UsageChartComponent,
  UsageBreakdownTableComponent,
  UsagePaymentHistoryComponent,
  UsagePaymentInfoComponent,
  UsageBudgetsComponent,
} from './usage';

// ============================================
// INVITE (Referral & Sharing - Shared Web & Mobile)
// ============================================
export {
  // Components
  InviteShellComponent,
  InviteStatsCardComponent,
  InviteChannelGridComponent,
  InviteQrCodeComponent,
  InviteAchievementsComponent,
  InviteCelebrationComponent,
  InviteSkeletonComponent,
  InviteModalComponent,
  // Services
  InviteService,
  InviteBottomSheetService,
  // Types
  type InviteUser,
  type InviteBottomSheetConfig,
  // Mock Data (Development Only)
  MOCK_INVITE_STATS,
  MOCK_INVITE_ACHIEVEMENTS,
  MOCK_INVITE_HISTORY,
  MOCK_INVITE_TEAMS,
  getMockInviteStats,
  getMockAchievements,
  getMockInviteHistory,
  getMockInviteLink,
  getMockTeams,
} from './invite';

// ============================================
// LEGAL (About, Terms, Privacy - Shared Web & Mobile)
// ============================================
export {
  AboutContentShellComponent,
  TermsContentShellComponent,
  PrivacyContentShellComponent,
} from './legal';

// ============================================
// TEAM (Team Pages - Shared Web & Mobile)
// ============================================
export { TeamShellComponent, type TeamData } from './team';

// ============================================
// APP DOWNLOAD BAR (Global Sticky Promotion)
// ============================================
export {
  NxtAppDownloadBarComponent,
  NxtAppDownloadBarService,
  type AppDownloadBarConfig,
} from './components/app-download-bar';

export { NxtXpLeaderboardSectionComponent } from './components/xp-leaderboard-section';

// ============================================
// ATHLETE PROFILES (Public Directory & Marketing)
// ============================================
export {
  NxtAthleteProfilesLandingComponent,
  NxtAthleteProfilesPreviewComponent,
} from './athlete-profiles';

export {
  NxtRecruitingRadarSectionComponent,
  type RecruitingRadarEvent,
} from './components/recruiting-radar-section';

export {
  NxtRecruitmentPillarsSectionComponent,
  type RecruitmentPillar,
} from './components/recruitment-pillars-section';

// ============================================
// PERSONA PAGES (Athletes, Coaches, Parents, Scouts)
// ============================================
export {
  NxtAiAthletesLandingComponent,
  NxtAthletesLandingComponent,
  NxtAthletesPreviewComponent,
  NxtCoachesLandingComponent,
  NxtCoachesPreviewComponent,
  NxtParentsLandingComponent,
  NxtParentsPreviewComponent,
  NxtRecruitingAthletesLandingComponent,
  NxtScoutsLandingComponent,
  NxtScoutsPreviewComponent,
} from './personas';

// ============================================
// SPORT LANDING PAGES (Football, Basketball, …)
// ============================================
export { NxtSportLandingComponent, NxtSportLandingPreviewComponent } from './sport-landing';
