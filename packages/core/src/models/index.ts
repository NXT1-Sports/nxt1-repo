/**
 * @fileoverview Models Barrel Export
 * @module @nxt1/core/models
 *
 * Central export point for all models.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// College model
export type {
  CollegeSportInfo,
  College,
  CollegeListItem,
  CollegeFilterCriteria,
  CollegeListResponse,
  ConferenceInfo,
  DivisionWithColleges,
} from './college.types';

// Network model
export { type ConnectionType, type NetworkStatus, type NetworkChangeEvent } from './network.model';

// Team code model (legacy Firebase)
export {
  ROLE,
  type TeamTypeApi,
  type TeamMember,
  type TeamAnalytics,
  type Code,
  type TeamCode,
  // API Input Types
  type CreateTeamCodeInput,
  type UpdateTeamCodeInput,
  type JoinTeamInput,
  type InviteMemberInput,
  type UpdateMemberRoleInput,
  type BulkUpdateMemberInput,
  type BulkUpdateResult,
} from './team-code.model';

// User model - Core types (use these)
export {
  USER_SCHEMA_VERSION,
  // Primary types
  type User,
  // Location & Contact
  type Location,
  type SocialLinks,
  type SocialLink as UserSocialLink,
  type ContactInfo,
  type ConnectedSource,
  // Connected email (metadata only — tokens in sub-collection)
  // EmailProvider is exported from campaigns section below
  type ConnectedEmail,
  type EmailTokenData,
  // Verification
  type VerificationStatus,
  // Sports architecture
  type SportProfile,
  type TeamInfo,
  type CoachContact,
  type SeasonRecord,
  // Recruiting (2026 unified architecture)
  type RecruitingActivity,
  type RecruitingCategory,
  // @deprecated — use RecruitingActivity instead
  type CollegeOffer,
  type CollegeInteraction,
  type Commitment,
  type RecruitingSummary,
  type AcademicInfo,
  type SportVerification,
  // Agnostic verification (2026+)
  type DataVerification,
  type VerificationScope,
  // 2026 Agentic Architecture (schema-driven, self-describing)
  type DataSource,
  type VerifiedMetric,
  type VerifiedStat,
  type ScheduleEvent,
  // @deprecated — use VerifiedMetric[] / VerifiedStat[] instead
  type AthleticMetrics,
  type SeasonStats,
  type GameStats,
  // Agent X & Scouting (source-of-truth types)
  // Note: Display-DTO versions with same names exist in profile.types.ts
  // Import from @nxt1/core/models when you need domain types
  type PlayerArchetype,
  type AgentXTrait,
  // History & Awards
  type TeamHistoryEntry,
  type UserAward,
  // Role-specific data
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
  type DirectorData,
  type ScoutData,
  type RecruitingServiceData,
  type MediaData,
  type ParentData,
  type FanData,
  // Preferences & Settings
  type NotificationPreferences,
  type UserPreferences,
  type UserCounters,
  // Utility types
  type UserSummary,
  // Type guards
  isAthlete,
  isCoach,
  isCollegeCoach,
  isOnboarded,
  isVerified,
  // Helper functions
  getPrimarySport,
  getActiveSport,
  getSportByName,
  playsSport,
  getTotalOffers,
  getAllAwards,
  isMultiSport,
  isCommitted,
  getDisplayName,
  getProfileImg,
  getBannerImg,
  getProfileImages,
  getGalleryImages,
  getSocialUrl,
  getClassOf,
  getConnectedSource,
} from './user.model';

// ====================================
// LEGACY TYPES - REMOVED
// All legacy types (StatData, SportInfo, PlayerTag, etc.) have been
// removed from public exports. They still exist in
// ./legacy/user-legacy.model.ts for reference/migration only.
// ====================================

// Media model (videos, profile cards, posts)
export {
  MEDIA_SCHEMA_VERSION,
  MEDIA_STATUSES,
  VIDEO_TYPES,
  type MediaStatus,
  type VideoType,
  type MediaItemBase,
  type ProfileCard,
  type VideoMedia,
  type UserMediaLibrary,
  type Post,
  type PostMention,
  type PostAttachment,
  type PostReactionRecord,
  type PostComment,
  isProfileCard,
  isVideoMedia,
  isMediaReady,
  isMediaProcessing,
  createDefaultMediaLibrary,
  createDefaultPost,
  STORAGE_LIMITS,
  getStorageLimit,
  formatStorageSize,
  type UploadVideoRequest,
  type UploadVideoResponse,
  type CreateProfileCardRequest,
  type CreatePostRequest,
  type FeedQuery,
  type FeedResponse,
} from './media.model';

// Campaigns model (email campaigns, templates)
export {
  CAMPAIGNS_SCHEMA_VERSION,
  CAMPAIGN_STATUSES,
  RECIPIENT_STATUSES,
  EMAIL_PROVIDERS,
  TEMPLATE_TYPES,
  type CampaignStatus,
  type RecipientStatus,
  type EmailProvider,
  type TemplateType,
  type EmailTemplate,
  type CampaignRecipient,
  type Campaign,
  type UserCampaigns,
  type ConnectedEmailAccount,
  isCampaignSent,
  isCampaignActive,
  isRecipientEngaged,
  hasConnectedEmail,
  createDefaultUserCampaigns,
  createDefaultCampaign,
  createDefaultTemplate,
  CAMPAIGN_LIMITS,
  getCampaignLimits,
  TEMPLATE_VARIABLES,
  type TemplateVariable,
  interpolateTemplate,
  type CreateCampaignRequest,
  type SendCampaignRequest,
  type CampaignAnalyticsResponse,
  type ConnectEmailRequest,
  type SaveTemplateRequest,
} from './campaigns.model';

// Payment model (subscriptions, transactions, entitlements)
export {
  PAYMENT_SCHEMA_VERSION,
  type PaymentMethod,
  type BillingAddress,
  type Subscription,
  type CreditAllocation,
  type Transaction,
  type TransactionItem,
  type UserEntitlements,
  type MediaEntitlement,
  type CollegeEntitlement,
  type FeatureEntitlement,
  type Invoice,
  type InvoiceLineItem,
  type Product,
  type PriceTier,
  type Coupon,
  type WebhookEvent,
  isSubscriptionActive,
  hasValidTeamCode,
  getEffectivePlan,
  hasAvailableCredits,
  isEntitlementValid,
  createDefaultSubscription,
  createDefaultCreditAllocation,
  createDefaultEntitlements,
  type CreateCheckoutSessionRequest,
  type CreateCheckoutSessionResponse,
  type CreateSubscriptionRequest,
  type UpdateSubscriptionRequest,
  type PurchaseCreditsRequest,
  type PurchaseMediaRequest,
  type OpenCollegesRequest,
  type RefundRequest,
  type PaymentMethodRequest,
} from './payment.model';

// User analytics model (profile views, engagement, etc.)
export * from './user-analytics.model';

// Notification model (push, email, SMS, in-app)
export {
  NOTIFICATION_SCHEMA_VERSION,
  type NotificationRecipient,
  type NotificationPayload,
  type Notification,
  type NotificationQueueItem,
  type UserNotificationSettings,
  isNotificationRead,
  isNotificationExpired,
  hasActor,
  createNotification,
  createDefaultNotificationSettings,
  type GetNotificationsQuery,
  type GetNotificationsResponse,
  type MarkNotificationsReadRequest,
  type RegisterPushTokenRequest,
  type UpdateNotificationSettingsRequest,
} from './notification.model';

// NOTE: App analytics (event tracking) moved to @nxt1/core/analytics
// Import from: import { APP_EVENTS, ... } from '@nxt1/core/analytics'

// Navigation model (footer, tabs, navigation)
export {
  // Mobile Footer Types
  type NavIconName,
  type FooterTabItem,
  type FooterVariant,
  type FooterIndicatorStyle,
  type FooterConfig,
  type FooterTabSelectEvent,
  type FooterScrollToTopEvent,
  // Mobile Footer Constants
  DEFAULT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  MAIN_PAGE_ROUTES,
  // Mobile Footer Helper functions
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
  isMainPageRoute,
  // Desktop Top Nav Types
  type TopNavIconName,
  type TopNavItem,
  type TopNavDropdownItem,
  type TopNavUserMenuItem,
  type TopNavUserData,
  type TopNavVariant,
  type TopNavConfig,
  type TopNavActionEvent,
  type TopNavSearchEvent,
  // Desktop Top Nav Constants
  DEFAULT_TOP_NAV_ITEMS,
  DEFAULT_USER_MENU_ITEMS,
  TOP_NAV_HEIGHTS,
  TOP_NAV_ANIMATION,
  // Desktop Top Nav Helper functions
  createTopNavConfig,
  findTopNavItemById,
  findTopNavItemByRoute,
  updateTopNavBadge,
  // Sidenav / Drawer Types
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
  // Sidenav Constants
  DEFAULT_SOCIAL_LINKS,
  DEFAULT_SIDENAV_ITEMS,
  SIDENAV_WIDTHS,
  SIDENAV_Z_INDEX,
  SIDENAV_ANIMATION,
  SIDENAV_GESTURE,
  // Sidenav Helper functions
  createSidenavConfig,
  findSidenavItemById,
  findSidenavItemByRoute,
  updateSidenavBadge,
  toggleSidenavSection,
  filterSidenavByRoles,
} from './navigation.model';
