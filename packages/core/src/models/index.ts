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

// Network model
export { type ConnectionType, type NetworkStatus, type NetworkChangeEvent } from './network.model';

// Team code model
export {
  ROLE,
  type TeamTypeApi,
  type TeamMember,
  type TeamAnalytics,
  type Code,
  type TeamCode,
} from './team-code.model';

// User model - Core types (use these)
export {
  USER_SCHEMA_VERSION,
  // Primary types
  type User,
  type UserUpdate,
  type UserCreate,
  type UserSummary,
  // Location & Contact
  type Location,
  type SocialLinks,
  type ContactInfo,
  type ConnectedAccounts,
  // Sports architecture
  type SportProfile,
  type TeamInfo,
  type CoachContact,
  type AthleticMetrics,
  type SeasonStats,
  type GameStats,
  type SeasonRecord,
  type CollegeOffer,
  type CollegeInteraction,
  type Commitment,
  type AcademicInfo,
  // Role-specific data
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
  type FanData,
  // Preferences & Settings
  type NotificationPreferences,
  type UserPreferences,
  type UserCounters,
  type Referral,
  // Type guards
  isAthlete,
  isCoach,
  isCollegeCoach,
  isOnboarded,
  isMultiSport,
  isCommitted,
  // Sport getters
  getPrimarySport,
  getActiveSport,
  getSportByName,
  playsSport,
  getTotalOffers,
  getAllAwards,
  // Sport management
  addSport,
  updateSport,
  removeSport,
  setPrimarySport,
  setActiveSport,
  // Factory functions
  toUserSummary,
  createDefaultPreferences,
  createDefaultCounters,
  createEmptySportProfile,
  // ====================================
  // LEGACY TYPES - @deprecated
  // Exported for backward compatibility only
  // Will be removed in future version
  // ====================================
  type StatData,
  type SportInfo,
  type PlayerTag,
  type primarySportStat,
  type GameStat,
  type LegacyCollege,
  type CollegeVisits,
  type CollegeCamp,
  type recentGame,
  type Event,
  type Award,
  type personalBest,
  type Session,
  type TeamCustomLink,
  type OwnTemplate,
  type OwnMixtape,
  type OwnProfile,
  type UserPost,
  type GameClipsCollection,
} from './user.model';

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
  // Mobile Footer Constants
  DEFAULT_FOOTER_TABS,
  FOOTER_HEIGHTS,
  FOOTER_ANIMATION,
  // Mobile Footer Helper functions
  findTabById,
  findTabByRoute,
  createFooterConfig,
  updateTabBadge,
  setTabDisabled,
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
