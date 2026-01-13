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

// Team code model
export {
  ROLE,
  TEAM_TYPE,
  type TeamTypeApi,
  type TeamMember,
  type TeamAnalytics,
  type Analytic,
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
  type ProfileCard,
  type VideoMedia,
  type UserMedia,
  type PaymentMethod,
  type Subscription,
  type NotificationPreferences,
  type UserPreferences,
  type UserCounters,
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
  type FanData,
  type UserPost,
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
  createDefaultSubscription,
  createDefaultCounters,
  createDefaultMedia,
  createEmptySportProfile,
} from './user.model';

// User analytics model (profile views, engagement, etc.)
export * from './user-analytics.model';

// NOTE: App analytics (event tracking) moved to @nxt1/core/analytics
// Import from: import { APP_EVENTS, ... } from '@nxt1/core/analytics'
