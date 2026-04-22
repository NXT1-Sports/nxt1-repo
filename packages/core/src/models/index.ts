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
  CollegeContact,
  CollegeSportInfo,
  College,
  CollegeListItem,
  CollegeFilterCriteria,
  CollegeListResponse,
  ConferenceInfo,
  DivisionWithColleges,
} from './platform/college.types';

// Network model
export {
  type ConnectionType,
  type NetworkStatus,
  type NetworkChangeEvent,
} from './platform/network.model';

export type { PortableTimestamp } from './portable-timestamp.model';

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
} from './team/team-code.model';

// ============================================
// NEW ARCHITECTURE (v3.0) - Relational Models
// ============================================

// Organization model
export {
  OrganizationStatus,
  type OrgAdminRole,
  type Organization,
  type OrganizationBilling,
  type OrganizationAdmin,
  type OrganizationSource,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type AddOrganizationAdminInput,
} from './team/organization.model';

// Team model (v3.0 - refactored from TeamCode)
export {
  TeamStatus,
  type Team,
  type TeamSource,
  type CreateTeamInput,
  type UpdateTeamInput,
} from './team/team.model';

// Roster Entry model (Junction table: User <-> Team)
// UserRole is used directly on RosterEntry.role (no separate RosterRole enum)
export type { UserRole } from '../constants/user.constants';
export {
  RosterEntryStatus,
  type RosterEntry,
  type CreateRosterEntryInput,
  type UpdateRosterEntryInput,
  type ApproveRosterEntryInput,
  type GetUserTeamsQuery,
  type GetTeamRosterQuery,
  type GetOrganizationMembersQuery,
  type RosterEntryWithTeam,
  type RosterEntryWithUser,
} from './team/roster-entry.model';

// ============================================

// Team event model (Firestore: TeamEvents collection)
export {
  type TeamEventType,
  type TeamEventStatus,
  type TeamEventOutcome,
  type TeamEventResult,
  type TeamEventDoc,
  type TeamEvent,
} from './team/team-event.model';

// Team stats model (sport-agnostic, Schedule collection)
export { type TeamStatTrend, type TeamStatEntry, type TeamStatDoc } from './team/team-stats.model';

// User model - Core types (use these)
export {
  USER_SCHEMA_VERSION,
  // Primary types
  type User,
  // Location & Contact
  type Location,
  type UserContact,
  type SocialLink as UserSocialLink,
  type ConnectedSource,
  // Connected email (metadata only — tokens in sub-collection)
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
  type RecruitingSummary,
  type AcademicInfo,
  // Agnostic verification (2026+)
  type DataVerification,
  type VerificationScope,
  // 2026 Agentic Architecture (schema-driven, self-describing)
  type DataSource,
  type VerifiedMetric,
  type VerifiedStat,
  type ScheduleEvent,
} from './user';

// Schedule event — Firestore Schedule collection document type
export {
  type ScheduleEventType,
  type ScheduleEventOwnerType,
  type ScheduleEventStatus,
  type ScheduleEventOutcome,
  type ScheduleEventDoc,
} from './user/schedule-event.model';

export {
  // Agent X & Scouting (source-of-truth types)
  // Note: Display-DTO versions with same names exist in profile.types.ts
  // Import from @nxt1/core/models when you need domain types
  type PlayerArchetype,
  type AgentXTrait,
  // History & Awards
  type TeamHistoryEntry,
  type UserAward,
  // Role-specific data
  type CoachData,
  type DirectorData,
  // Preferences & Settings
  type NotificationPreferences,
  type UserPreferences,
  // Utility types
  type UserSummary,
  // Type guards
  isAthlete,
  isCoach,
  isDirector,
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
  getProfileImages,
  getSocialUrl,
  getClassOf,
  getConnectedSource,
  // ── Firestore Collection Models (top-level & private sub-collections) ──
  type FirestoreDoc,
  type UserFirestoreDoc,
  type SportFirestoreDoc,
  // Top-level collections
  type PostType,
  type PostVisibilityType,
  type PostDoc,
  type VideoDocType,
  type VideoDoc,
  type PlayerStatDoc,
  type GameStatDoc,
  type RankingCategory,
  type RankingEntryDoc,
  type OfferScholarshipType,
  type OfferDivision,
  type OfferDoc,
  type RecruitingInteractionCategory,
  type InteractionDoc,
  type ScoutReportGrade,
  type ScoutReportDoc,
  type UserSportDoc,
  // Private sub-collections
  type XpEntryDoc,
} from './user';

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
  type FeedQuery,
  type FeedResponse,
} from './content/media.model';

// EmailProvider re-exported for backward compat (defined in campaign.constants)
export type { EmailProvider } from '../constants/campaign.constants';

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
} from './platform/payment.model';

// User analytics model (profile views, engagement, etc.)
export * from './platform/user-analytics.model';

// Custom analytics model (flexible analytics event records)
export type { CustomAnalyticsEvent } from './platform/custom-analytics.model';

// Agent analytics event-sourcing ontology and rollups
export {
  ANALYTICS_DOMAINS,
  ANALYTICS_SUBJECT_TYPES,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_SUMMARY_TIMEFRAMES,
  getAnalyticsEventTypesForDomain,
  getDefaultAnalyticsEventType,
  isAnalyticsDomain,
  isAnalyticsSubjectType,
  isAnalyticsEventTypeForDomain,
  type AnalyticsDomain,
  type AnalyticsSubjectType,
  type AnalyticsEventType,
  type AnalyticsSummaryTimeframe,
  type AnalyticsEventRecord,
  type AnalyticsRollupRecord,
} from './platform/analytics-event.model';

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
  type DispatchNotificationInput,
} from './content/notification.model';

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
  DEFAULT_NAVIGATION_SURFACE_CONFIG,
  DEFAULT_FOOTER_TABS,
  CENTERED_CREATE_FOOTER_TABS,
  AGENT_X_CENTER_FOOTER_TABS,
  AGENT_X_LEFT_FOOTER_TABS,
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
  buildDynamicFooterTabs,
  type FooterTabContext,
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
  shouldShowUsage,
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
} from './platform/navigation.model';

// User Display Context — Single source of truth for user menus/sidebars/headers
export {
  type UserDisplayInput,
  type UserDisplayFallback,
  type UserDisplayContext,
  buildUserDisplayContext,
  deduplicateSportProfiles,
} from './user/user-display-context';
