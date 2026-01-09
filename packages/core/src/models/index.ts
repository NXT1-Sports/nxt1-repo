/**
 * @fileoverview Models Barrel Export
 * @module @nxt1/core/models
 *
 * Central export point for all models.
 * NOTE: PLANS enum exists here AND in constants/user.constants
 * NOTE: PostType/UserReaction exist here AND in user.model
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// Common types - export most, but be careful of PLANS duplicate
export {
  type FirestoreTimestamp,
  // PLANS is also exported in user.constants - we export from here for models
  PLANS,
  type StatType,
  type CompetitionLevel,
  type PrimarySportStat,
  type GameStat,
  type SocialLinks,
  type ContactInfo,
  type TeamLinks,
  type TeamCustomLink,
  type RecentGame,
  type PersonalBest,
  type Session,
  type Award,
  type UserEvent,
  type SeasonRecord,
  type PaymentInfo,
  type Referral,
  type AiCopilotUsage,
  type TeamCodeTrial,
  type VideoParam,
  type GameClip,
  type GameClipsCollection,
  // Legacy aliases
  type primarySportStat,
  type recentGame,
  type personalBest,
} from './common.types';

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

// User model (v1 compatible) - exports PostType and UserReaction
export {
  type College,
  type CollegeVisit,
  type CollegeCamp,
  type CollegeVisits,
  type OwnTemplate,
  type OwnMixtape,
  type OwnProfile,
  // These are also in user.constants - model version preferred for model imports
  PostType,
  UserReaction,
  type MentionData,
  type AttachedProfileData,
  type VideoMetadata,
  type UserPost,
  type User,
  type Social,
  type SocialResponse,
  type GoogleAdditionalUserInfo,
  type GoogleProfile,
  type AuthCredential,
} from './user.model';

// User V2 model (clean architecture)
export {
  USER_SCHEMA_VERSION,
  type Location,
  type SocialLinksV2,
  type ContactInfoV2,
  type ConnectedAccounts,
  type AcademicInfo,
  type TeamInfo,
  type CoachContact,
  type AthleticMetrics,
  type SeasonStats,
  type GameStats,
  type SeasonRecordV2,
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
  type UserCountersV2,
  type AthleteData,
  type CoachData,
  type CollegeCoachData,
  type FanData,
  type UserPostV2,
  type ReferralV2,
  type UserV2,
  isAthlete,
  isCoach,
  isCollegeCoach,
  isOnboarded,
  getPrimarySport,
  getActiveSport,
  type UserV2Update,
  type UserV2Create,
  type UserV2Summary,
  toUserSummary,
  createDefaultPreferences,
  createDefaultSubscription,
  createDefaultCounters,
  createDefaultMedia,
  createEmptySportProfile,
} from './user-v2.model';

// Analytics V2 model
export * from './analytics-v2.model';
