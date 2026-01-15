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

// User model
export {
  USER_SCHEMA_VERSION,
  type Location,
  type SocialLinks,
  type ContactInfo,
  type ConnectedAccounts,
  type AcademicInfo,
  type TeamInfo,
  type CoachContact,
  type AthleticMetrics,
  type SeasonStats,
  type GameStats,
  type SeasonRecord,
  type CollegeOffer,
  type CollegeInteraction,
  type Commitment,
  type SportProfile,
  type NotificationPreferences,
  type UserPreferences,
  type UserCounters,
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
  type FanData,
  type Referral,
  type User,
  isAthlete,
  isCoach,
  isCollegeCoach,
  isOnboarded,
  getPrimarySport,
  getActiveSport,
  type UserUpdate,
  type UserCreate,
  type UserSummary,
  toUserSummary,
  createDefaultPreferences,
  createDefaultCounters,
  createEmptySportProfile,
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
