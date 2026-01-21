/**
 * @fileoverview User Model
 * @module @nxt1/core/models
 *
 * Clean, composable user type definitions for the NXT1 platform.
 * 100% portable - no framework dependencies.
 *
 * Design Principles:
 * - Grouped by concern (identity, profile, sports, media, subscription)
 * - Sports as array - supports unlimited sports, no duplication
 * - Role discriminator for type-safe role handling
 * - Single source for social/contact
 * - Types derived from constants (single source of truth)
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import type { PlanTier } from '../constants/payment.constants';
import type {
  UserRole,
  AccountStatus,
  TeamType,
  Theme,
  ParentRelationship,
  ScholarshipType,
  CommitmentStatus,
  VisitType,
  AccountType,
  DismissablePrompt,
  ReferralStatus,
} from '../constants/user.constants';

// ============================================
// SCHEMA VERSION
// ============================================

/** Current schema version for migration tracking */
export const USER_SCHEMA_VERSION = 2;

// ============================================
// LEGACY TYPES - For backward compatibility only
// These will be removed in a future version
// ============================================

/** @deprecated Use Record<string, string | number | boolean> instead */
export interface StatData {
  [key: string]: string | number | boolean;
}

/** @deprecated Use Record<string, string | number | boolean | null> instead */
export interface SportInfo {
  [key: string]: string | number | boolean | null;
}

/** Player tag for recruiting */
export interface PlayerTag {
  id: string;
  name: string;
  category?: string;
  value?: string | number;
}

/** @deprecated Use SeasonStats from SportProfile instead */
export interface primarySportStat {
  year?: string;
  data: StatData;
  title?: string | null;
  statType?: 'High School' | 'Club' | 'Middle School';
  competitionLevel?: 'Freshman' | 'JV' | 'Varsity';
  isRanked?: boolean;
}

/** @deprecated Use GameStats from SportProfile instead */
export interface GameStat {
  game: string;
  data: StatData;
  date?: string | Date;
  year?: string;
  statType?: 'High School' | 'Club' | 'Middle School';
  competitionLevel?: 'Freshman' | 'JV' | 'Varsity';
  isRanked?: boolean;
}

/** @deprecated Use CollegeOffer or CollegeInteraction instead */
export interface LegacyCollege {
  _id?: string | null;
  'IPEDS/NCES_ID'?: string | null;
  city?: string | null;
  logoUrl?: string | null;
  name?: string | null;
  state?: string | null;
  visitDate?: string | null;
  sportInfo?: SportInfo;
}

/** @deprecated */
export type College = LegacyCollege;
/** @deprecated */
export type CollegeVisits = LegacyCollege & {
  visitType?: string | null;
  visitDate?: string | null;
};
/** @deprecated */
export type CollegeCamp = LegacyCollege & { visitDate?: string | null };

/** @deprecated Use recentGames in SportProfile instead */
export interface recentGame {
  name?: string | null;
  date?: string | null;
  location?: string | null;
  time?: string | null;
  matchLocation?: string | null;
  gameLink?: string | null;
  matchType?: string | null;
  score1?: number | null;
  score2?: number | null;
  result?: string | null;
  opponentLogo?: string | null;
  year?: string | null;
}

/** Event */
export interface Event {
  date?: string | Date;
  eventLink?: string | null;
  eventType?: string | null;
  name?: string | null;
}

/** @deprecated Use awards[] in SportProfile instead */
export interface Award {
  award: string;
}

/** @deprecated Use personalBests[] in SportProfile instead */
export interface personalBest {
  personalBest?: string | null;
}

/** Session */
export interface Session {
  startTime?: Date | null;
  endTime?: Date | null;
}

/** Team custom link */
export interface TeamCustomLink {
  title: string;
  url: string;
}

/** Own template */
export interface OwnTemplate {
  id: string | null;
  name: string | null;
  url: string | null;
  pngUrl?: string | null;
  type?: string | null;
  downloadURL?: string | null;
  previewImage?: string | null;
  order?: number | null;
  pinnedToProfile?: boolean | null;
  pinnedToTeamPage?: boolean | null;
  selectionOrder?: number;
  shareCount?: number | null;
  createdBy?: 'user' | 'system' | null;
  ownerName?: string | null;
  ownerId?: string | null;
  ownerProfileImg?: string | null;
}

/** Own mixtape */
export interface OwnMixtape {
  id: string | null;
  name: string | null;
  url?: string | null;
  type?: string | null;
  downloadURL?: string | null;
  previewImage?: string | null;
  order?: number | null;
  pinnedToProfile?: boolean | null;
  pinnedToTeamPage?: boolean | null;
  selectionOrder?: number;
  shareCount?: number | null;
  createdBy?: 'user' | 'system' | null;
  ownerName?: string | null;
  ownerId?: string | null;
  ownerProfileImg?: string | null;
}

/** Own profile */
export interface OwnProfile {
  id: string | null;
  name: string | null;
  url?: string | null;
  profileUrl?: string | null;
  pngUrl?: string | null;
  thumbnailUrl?: string | null;
  type?: string | null;
  downloadURL?: string | null;
  previewImage?: string | null;
  secondarySportPreviewImage?: string | null;
  order?: number | null;
  isLive?: boolean;
  shareCount?: number | null;
}

/** User post */
export interface UserPost {
  id: string;
  userId?: string;
  title: string;
  description?: string;
  type: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  views: number;
  videoViews?: number;
  shares: number;
  reposts?: number;
  reactions?: number;
}

/** Game clips collection - reference to prospect model */
export interface GameClipsCollection {
  id: string;
  [key: string]: string | number | boolean | null | undefined;
}

/** Team code - reference */
export interface TeamCode {
  id: string;
  code: string;
  teamName: string;
  [key: string]: string | number | boolean | null | undefined;
}

// ============================================
// LOCATION
// ============================================

/** Geographic location data */
export interface Location {
  address?: string;
  city: string;
  state: string;
  zipCode?: string;
  country: string;
}

// ============================================
// SOCIAL & CONTACT
// ============================================

/** Social media links */
export interface SocialLinks {
  twitter?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  hudl?: string | null;
  youtube?: string | null;
  maxPreps?: string | null;
  linkedin?: string | null;
}

/** Contact information */
export interface ContactInfo {
  email: string;
  phone?: string | null;
}

/** Connected email accounts for campaigns */
export interface ConnectedAccounts {
  gmail?: {
    token: string;
    email: string;
    connectedAt: Date | string;
  };
  microsoft?: {
    token: string;
    email: string;
    connectedAt: Date | string;
  };
  yahoo?: {
    token: string;
    email: string;
    connectedAt: Date | string;
  };
}

// ============================================
// ACADEMIC INFO
// ============================================

/** Academic information for athletes */
export interface AcademicInfo {
  gpa?: number;
  weightedGpa?: number;
  satScore?: number;
  actScore?: number;
  classRank?: number;
  classSize?: number;
  ncaaEligibilityCenter?: string;
  intendedMajor?: string;
}

// ============================================
// TEAM INFO
// ============================================

/** Team information (school/club) */
export interface TeamInfo {
  name: string;
  type: TeamType;
  logo?: string | null;
  mascot?: string;
  colors?: string[];
  conference?: string;
  division?: string;
}

/** Coach contact for a sport */
export interface CoachContact {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  title?: string;
}

// ============================================
// SPORT PROFILE
// ============================================

/**
 * Athletic measurements and metrics
 * Dynamic record - fields vary by sport
 */
export type AthleticMetrics = Record<string, string | number | undefined>;

/** Season statistics */
export interface SeasonStats {
  season: string;
  year: number;
  stats: Record<string, string | number>;
  gamesPlayed?: number;
}

/** Game-by-game statistics */
export interface GameStats {
  date: Date | string;
  opponent: string;
  stats: Record<string, string | number>;
  result?: 'win' | 'loss' | 'tie';
  score?: string;
}

/** Season record */
export interface SeasonRecord {
  wins: number;
  losses: number;
  ties?: number;
  season?: string;
}

/** College offer */
export interface CollegeOffer {
  collegeId: string;
  collegeName: string;
  logoUrl?: string;
  offeredAt?: Date | string;
  sport: string;
  scholarshipType?: ScholarshipType;
}

/** College interest/visit/camp */
export interface CollegeInteraction {
  collegeId: string;
  collegeName: string;
  logoUrl?: string;
  city?: string;
  state?: string;
  type: 'interest' | 'visit' | 'camp' | 'contact';
  date?: Date | string;
  visitType?: VisitType;
  notes?: string;
}

/** Commitment information */
export interface Commitment {
  collegeId: string;
  collegeName: string;
  logoUrl?: string;
  committedAt: Date | string;
  sport: string;
  status: CommitmentStatus;
  announcedAt?: Date | string;
}

/**
 * Sport profile - contains all data for ONE sport
 * Array-based design supports unlimited sports
 */
export interface SportProfile {
  /** Sport identifier (e.g., 'football', 'basketball mens') */
  sport: string;

  /** Display order (0 = primary) */
  order: number;

  /** Profile image specific to this sport */
  profileImg?: string | null;

  /** Sport-specific bio */
  aboutMe?: string;

  /** Positions played */
  positions: string[];

  /** Side preference (e.g., 'left', 'right', 'both') */
  side?: string[];

  /** Athletic measurements (height, weight, 40-yard, etc.) */
  metrics: AthleticMetrics;

  /** Season statistics */
  seasonStats: SeasonStats[];

  /** Game-by-game stats */
  gameStats?: GameStats[];

  /** Personal bests/records */
  personalBests?: Array<{
    name: string;
    value: string | number;
    date?: Date | string;
  }>;

  /** Team information */
  team: TeamInfo;

  /** Club team (if different from high school) */
  clubTeam?: TeamInfo;

  /** Head coach contact */
  coach?: CoachContact;

  /** Account type for this sport (athlete, parent managing, coach) */
  accountType: AccountType;

  /** College recruiting data */
  recruiting?: {
    /** College offers received */
    offers: CollegeOffer[];
    /** College interactions (interests, visits, camps) */
    interactions: CollegeInteraction[];
    /** Commitment status */
    commitment?: Commitment;
    /** Target recruitment level (D1, D2, D3, NAIA, JUCO) */
    level?: string;
    /** Recruiting tags/notes */
    tags?: string[];
    /** Player rating (1-5) */
    rating?: number;
    /** Who rated the player */
    ratedBy?: string;
  };

  /** Schedule and events */
  schedule?: {
    /** Schedule page URL */
    url?: string;
    /** Upcoming event description */
    upcomingEvent?: string;
    /** Link to upcoming event */
    eventLink?: string;
  };

  /** Recent games/matches */
  recentGames?: Array<{
    date: Date | string;
    opponent: string;
    result: 'win' | 'loss' | 'tie';
    score?: string;
    highlights?: string;
    location?: string;
  }>;

  /** Season win/loss record */
  seasonRecord?: SeasonRecord;

  /** Awards and honors for this sport */
  awards?: string[];

  /** Primary highlight video */
  primaryVideo?: {
    url: string;
    thumbnailUrl?: string;
  };

  /** Created timestamp */
  createdAt?: Date | string;

  /** Updated timestamp */
  updatedAt?: Date | string;
}

// ============================================
// PLAN TIER
// ============================================

/**
 * User's current plan tier.
 * Full subscription/billing details are in the Subscriptions collection.
 * @see payment.model.ts for Subscription, Transaction, UserEntitlements
 */
export type { PlanTier } from '../constants/payment.constants';

// ============================================
// USER PREFERENCES
// ============================================

/** Notification preferences */
export interface NotificationPreferences {
  push: boolean;
  email: boolean;
  sms?: boolean;
  marketing?: boolean;
}

/** User preferences and settings */
export interface UserPreferences {
  notifications: NotificationPreferences;
  activityTracking: boolean;
  /** Dismissed dialogs/tooltips */
  dismissedPrompts: DismissablePrompt[];
  /** Default sport to display (index in sports array) */
  defaultSportIndex: number;
  theme?: Theme;
  language?: string;
}

// ============================================
// COUNTERS
// ============================================

/**
 * Denormalized counters synced from analytics collection
 * Updated periodically by background sync job
 */
export interface UserCounters {
  profileViews: number;
  videoViews: number;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  sharesCount: number;
  _lastSyncedAt?: Date | string;
}

// ============================================
// ROLE-SPECIFIC DATA
// ============================================

/** Athlete-specific data */
export interface AthleteData {
  classOf: number;
  academics?: AcademicInfo;
  parentInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    relationship?: ParentRelationship;
  };
}

/** Coach-specific data */
export interface CoachData {
  title: string;
  yearsExperience?: number;
  certifications?: string[];
  canManageMultipleTeams?: boolean;
  managedTeamCodes?: string[];
}

/** College coach-specific data */
export interface CollegeCoachData extends CoachData {
  institution: string;
  department?: string;
  recruitingRegions?: string[];
}

/** Fan-specific data */
export interface FanData {
  followedTeams?: string[];
  followedAthletes?: string[];
  favoriteColleges?: string[];
}

// ============================================
// REFERRAL
// ============================================

/** Referral record */
export interface Referral {
  userId: string;
  referredAt: Date | string;
  status: ReferralStatus;
  rewardClaimed?: boolean;
}

// ============================================
// MAIN USER INTERFACE
// ============================================

/**
 * User - Main user interface for NXT1 platform
 * Combines all fields from legacy system with new architecture
 * Design principles:
 * 1. Grouped by concern (identity, profile, sports, media, subscription)
 * 2. Sports as array - no primary/secondary duplication
 * 3. Role discriminator for type-safe role handling
 * 4. Single source for social/contact
 * 5. Preferences replace boolean flags
 */
export interface User {
  // ============================================
  // CORE IDENTITY (required)
  // ============================================
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImg: string | null;
  aboutMe: string;

  // ============================================
  // ROLE & STATUS
  // ============================================
  role?: UserRole;
  status?: AccountStatus;

  // ============================================
  // SPORTS (new architecture - use this)
  // ============================================
  /** Array of sport profiles - unlimited sports support */
  sports?: SportProfile[];
  /** Currently active sport index in sports array */
  activeSportIndex?: number;

  // ============================================
  // LOCATION & CONTACT (structured)
  // ============================================
  location?: Location;
  contact?: ContactInfo;
  social?: SocialLinks;

  // ============================================
  // ROLE-SPECIFIC DATA
  // ============================================
  /** Athlete-specific data (classOf, academics, parent info) */
  athlete?: AthleteData;
  /** Coach-specific data */
  coach?: CoachData;
  /** College coach-specific data */
  collegeCoach?: CollegeCoachData;
  /** Fan-specific data */
  fan?: FanData;

  // ============================================
  // ONBOARDING & FLAGS
  // ============================================
  onboardingCompleted?: boolean;
  signupCompleted?: boolean;
  canAddSport: boolean;

  // ============================================
  // PREFERENCES
  // ============================================
  preferences?: UserPreferences;

  // ============================================
  // SUBSCRIPTION & PAYMENT
  // ============================================
  planTier?: PlanTier;
  credits: number;
  lastActivatedPlan: string;

  // ============================================
  // CONNECTED ACCOUNTS
  // ============================================
  connectedAccounts?: ConnectedAccounts;

  // ============================================
  // ANALYTICS & COUNTERS
  // ============================================
  _counters?: UserCounters;

  // ============================================
  // TIMESTAMPS
  // ============================================
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastLoginAt?: Date | string;

  // ============================================
  // PUSH NOTIFICATIONS
  // ============================================
  fcmToken: string | null;

  // ============================================
  // SCHEMA VERSION
  // ============================================
  _schemaVersion?: typeof USER_SCHEMA_VERSION;

  // ============================================
  // LEGACY FIELDS (deprecated - for backward compatibility)
  // These will be removed in a future version.
  // Use sports[], location, contact, social instead.
  // ============================================

  /** @deprecated Use onboardingCompleted */
  completeSignUp: boolean;
  /** @deprecated Use onboardingCompleted */
  completeAddSport: boolean;

  /** @deprecated Use sports[activeSportIndex] */
  appSport: 'primary' | 'secondary' | null;
  /** @deprecated Use sports[0].sport */
  sport: string;
  /** @deprecated Use sports[0].sport */
  primarySport: string;
  /** @deprecated Use sports[0].positions */
  primarySportPositions: string[];
  /** @deprecated Use sports[1].sport */
  secondarySport: string;
  /** @deprecated Use sports[1].positions */
  secondarySportPositions: string[];
  /** @deprecated Use sports[0].positions[0] */
  position: string;
  /** @deprecated Use sports[0].side */
  side?: string[];

  /** @deprecated Use sports[0].team.name */
  highSchool: string;
  /** @deprecated Use sports[0].team.type */
  highSchoolSuffix: 'High School' | 'Club';
  /** @deprecated Use sports[1].team.name */
  secondaryHighSchool: string;
  /** @deprecated Use sports[1].team.type */
  secondaryHighSchoolSuffix: 'High School' | 'Club';
  /** @deprecated Use sports[0].clubTeam */
  club: string | null;
  /** @deprecated Use sports[1].clubTeam */
  secondaryClub: string | null;
  /** @deprecated Use athlete.classOf */
  classOf: number;

  /** @deprecated Use sports[1].profileImg */
  secondarySportProfileImg: string | null;
  /** @deprecated Use sports[0].team.logo */
  teamLogoImg: string | null;
  /** @deprecated Use sports[1].team.logo */
  secondarySportTeamLogoImg: string | null;
  /** @deprecated Use sports[0].primaryVideo */
  primaryVideoImage: { url: string; thumbnailUrl?: string } | string | null;
  /** @deprecated Use sports[1].primaryVideo */
  secondaryVideoImage: { url: string; thumbnailUrl?: string } | string | null;

  /** @deprecated Use contact.email */
  contactEmail: string;
  /** @deprecated Use contact.phone */
  phoneNumber: string;
  /** @deprecated Use location.address */
  address: string;
  /** @deprecated Use location.city */
  city: string;
  /** @deprecated Use location.state */
  state: string;
  /** @deprecated Use location.zipCode */
  zipCode: number;
  /** @deprecated Use location.country */
  country: string;

  /** @deprecated Use social.twitter */
  twitter: string | null;
  /** @deprecated Use social.instagram */
  instagram: string | null;
  /** @deprecated Use social.tiktok */
  tiktok: string | null;
  /** @deprecated Use social.hudl */
  hudlAccountLink: string;
  /** @deprecated Use social.youtube */
  youtubeAccountLink: string;
  /** @deprecated */
  sportsAccountLink: string;
  /** @deprecated Use social */
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    youtube?: string;
  };

  /** @deprecated Use role */
  athleteOrParentOrCoach: string;
  /** @deprecated Use sports[1].accountType */
  secondaryAthleteOrParentOrCoach: string;
  /** @deprecated Use role === 'athlete' */
  isRecruit?: boolean | null;
  /** @deprecated Use role === 'college-coach' */
  isCollegeCoach?: boolean | null;
  /** @deprecated Use role === 'fan' */
  isFan?: boolean | null;

  /** @deprecated Use sports[0].coach */
  coachCount: number;
  /** @deprecated Use sports[1].coach */
  secondarySportCoachCount: number;
  /** @deprecated Use sports[0].coach.title */
  coachTitle: string | null;
  /** @deprecated Use sports[0].coach.firstName */
  coachFirstName: string;
  /** @deprecated Use sports[1].coach.firstName */
  secondarySportCoachFirstName: string;
  /** @deprecated Use sports[0].coach.lastName */
  coachLastName: string;
  /** @deprecated Use sports[1].coach.lastName */
  secondarySportCoachLastName: string;
  /** @deprecated Use sports[0].coach.phone */
  coachPhoneNumber: string;
  /** @deprecated Use sports[1].coach.phone */
  secondarySportCoachPhoneNumber: string;
  /** @deprecated Use sports[0].coach.email */
  coachEmail: string;
  /** @deprecated Use sports[1].coach.email */
  secondarySportCoachEmail: string;
  /** @deprecated Use coach.canManageMultipleTeams */
  canManageMultipleTeams?: boolean | null;

  /** @deprecated */
  organization?: string | null;
  /** @deprecated */
  secondOrganization?: string | null;
  /** @deprecated */
  collegeTeamName?: string | null;
  /** @deprecated Use sports[0].team.conference */
  conference?: string | null;
  /** @deprecated Use sports[0].team.division */
  division?: string | null;
  /** @deprecated */
  title: string;
  /** @deprecated Use sports[0].team.mascot */
  mascot: string;
  /** @deprecated Use sports[0].team.name */
  teamName?: string;

  /** Team code reference */
  teamCode?: TeamCode | string | null;
  /** Team code trial info */
  teamCodeTrial?: {
    id: string;
    expireAt: Date | string;
    isActive: boolean;
    expiredAt?: Date | string;
  };
  /** @deprecated Use sports[0].team.colors */
  teamColors?: string[] | null;
  /** @deprecated Use sports[0].team.colors[0] */
  teamColor1?: string | null;
  /** @deprecated Use sports[0].team.colors[1] */
  teamColor2?: string | null;
  /** @deprecated Use sports[1].team.colors[0] */
  secondarySportTeamColor1?: string | null;
  /** @deprecated Use sports[1].team.colors[1] */
  secondarySportTeamColor2?: string | null;

  /** @deprecated Use sports[0].schedule.url */
  schedule?: string | null;
  /** @deprecated Use sports[0].schedule.upcomingEvent */
  upcomingPastEvent?: string | null;
  /** @deprecated Use sports[0].schedule.eventLink */
  upcomingGameLink?: string | null;
  /** @deprecated Use sports[1].schedule.url */
  secondarySportSchedule?: string | null;
  /** @deprecated Use sports[1].schedule.upcomingEvent */
  secondarySportUpcomingPastEvent?: string | null;
  /** @deprecated Use sports[1].schedule.eventLink */
  secondarySportUpcomingGameLink?: string | null;

  /** @deprecated */
  unicode?: string | null;
  /** @deprecated */
  secondarySportUnicode?: string | null;
  /** @deprecated Use sports[1].aboutMe */
  secondarySportAboutMe?: string | null;

  /** @deprecated Use athlete.academics */
  academicInfo: {
    [key: string]: string | number;
  };

  /** @deprecated Use sports[0].metrics */
  primarySportAthleticInfo: {
    [key: string]: string | number;
  };
  /** @deprecated Use sports[1].metrics */
  secondarySportAthleticInfo: {
    [key: string]: string | number;
  };
  /** @deprecated Use sports[0].seasonStats */
  primarySportStats: primarySportStat[];
  /** @deprecated Use sports[1].seasonStats */
  secondarySportStats: primarySportStat[];
  /** @deprecated Use sports[0].gameStats */
  primarySportGameStats?: GameStat[];
  /** @deprecated Use sports[1].gameStats */
  secondarySportGameStats?: GameStat[];

  /** @deprecated Use sports[0].seasonRecord */
  seasonRecord?: {
    wins: number;
    losses: number;
    ties?: number;
  };

  /** @deprecated Use sports[0].recruiting.level */
  level?: string;
  /** @deprecated */
  playerRole?: string;
  /** @deprecated Use sports[0].recruiting.tags */
  playerTags: PlayerTag[];
  /** @deprecated Use sports[0].recruiting.offers */
  offers: string | null;
  /** @deprecated Use sports[1].recruiting.offers */
  secondarySportOffers: string | null;
  /** @deprecated */
  offerLogos?: { [collegeName: string]: string };
  /** @deprecated */
  secondarySportOfferLogos?: { [collegeName: string]: string };
  /** @deprecated Use sports[0].recruiting.commitment.status */
  committmentStatus?: string;
  /** @deprecated Use sports[0].recruiting.commitment */
  committmentBy?: College;
  /** @deprecated Use sports[0].recruiting.interactions */
  collegeInterests?: College[] | null;
  /** @deprecated Use sports[0].recruiting.interactions */
  collegeVisits?: CollegeVisits[] | null;
  /** @deprecated Use sports[0].recruiting.interactions */
  collegeCamps?: CollegeCamp[] | null;
  /** @deprecated Use isCommitted(user) helper */
  isCommitted: boolean;
  /** @deprecated Use sports[0].recruiting.rating */
  rating?: number;
  /** @deprecated Use sports[0].recruiting.ratedBy */
  ratedBy?: string;

  /** @deprecated Use sports[0].recentGames */
  recentGames?: recentGame[];
  /** @deprecated */
  events?: Event[];
  /** @deprecated Use sports[0].awards */
  awards?: Award[];
  /** @deprecated Use sports[0].personalBests */
  personalBests?: personalBest[];

  /** @deprecated Use Posts collection via userId */
  posts: UserPost[] | null;
  /** @deprecated Use UserMedia collection */
  favoriteTemplate: string[] | null;
  /** @deprecated Use UserMedia collection */
  favoriteProfile: string[] | null;
  /** @deprecated Use UserMedia collection */
  availableTemplate: string[] | null;
  /** @deprecated Use UserMedia collection */
  availableProfiles: string[] | null;
  /** @deprecated Use UserMedia collection */
  availableMixtapes: string[] | null;
  /** @deprecated Use UserMedia collection */
  ownTemplates: OwnTemplate[] | null;
  /** @deprecated Use UserMedia collection */
  ownProfiles: OwnProfile[] | null;
  /** @deprecated Use UserMedia collection */
  ownMixtapes: OwnMixtape[] | null;
  /** @deprecated */
  pinnedProfileVideo?: string | null;
  /** @deprecated */
  gameClipsCollection?: GameClipsCollection | null;

  /** @deprecated Use UserCampaigns collection */
  ownEmailTemplate: {
    [key: string]: string;
  };
  /** @deprecated Use UserCampaigns collection */
  generalEmailTemplate: {
    [key: string]: string;
  };
  /** @deprecated Use UserCampaigns collection */
  personalEmailTemplate: {
    [key: string]: string;
  };
  /** @deprecated Use UserCampaigns collection */
  secondarySportOwnEmailTemplate: {
    [key: string]: string;
  };
  /** @deprecated Use UserCampaigns collection */
  secondarySportGeneralEmailTemplate: {
    [key: string]: string;
  };
  /** @deprecated Use UserCampaigns collection */
  secondarySportPersonalEmailTemplate: {
    [key: string]: string;
  };

  /** @deprecated Use Campaigns collection */
  campaignsSent: { id: string; name: string; sentAt: Date | string }[] | null;
  /** @deprecated */
  completeQuestionnaires: string[] | null;
  /** @deprecated */
  completeCamps: string[] | null;
  /** @deprecated */
  isFirstTimeAtCampaign: boolean;
  /** @deprecated */
  taggedColleges: [string | number];

  /** @deprecated Use connectedAccounts.gmail.token */
  connectedGmailToken?: string;
  /** @deprecated Use connectedAccounts.microsoft.token */
  connectedMicrosoftToken?: string;
  /** @deprecated Use connectedAccounts */
  connectedEmail?: string;

  /** @deprecated Use planTier and subscription in Subscriptions collection */
  payment: {
    expiresIn: Date | string | null;
    firstYearExpiresIn: Date | string | null;
  };
  /** @deprecated */
  lastActivePlan: string;
  /** @deprecated */
  showedTrialMessage?: boolean;

  /** @deprecated Use preferences.activityTracking */
  activityTracking: boolean | null;
  /** @deprecated Use preferences.notifications.push */
  pushNotifications: boolean;
  /** @deprecated */
  availableColleges: string[];
  /** @deprecated */
  showedHearAbout: boolean;

  /** @deprecated Use preferences.dismissedPrompts */
  isShowedHowCollegeCreditWorks: boolean | null;
  /** @deprecated Use preferences.dismissedPrompts */
  isShowedFirstOpenCampaigns: boolean | null;
  /** @deprecated Use preferences.dismissedPrompts */
  isShowedHowMediaCreditWorks?: boolean | null;
  /** @deprecated */
  isSavingMedia: boolean | null;
  /** @deprecated */
  isNeedCreateThumbnail?: boolean | null;
  /** @deprecated Use preferences.dismissedPrompts */
  hasSeenFeedbackModal?: boolean | null;
  /** @deprecated */
  feedbackModalSeenAt?: Date | string | null;

  /** @deprecated Use _counters.profileViews */
  profileViews?: number;
  /** @deprecated Use _counters.videoViews */
  videoViews: number;
  /** @deprecated Use _counters.followersCount */
  followersCount?: number;
  /** @deprecated Use _counters.followingCount */
  followingCount?: number;

  /** @deprecated */
  referrals: [{ userId: string; date: Date; status: string }];

  /** @deprecated Use athlete.parentInfo */
  parentInfo: {
    [key: string]: number;
  };

  /** @deprecated */
  order?: number | string;
  /** @deprecated */
  removedBgImages?: string | null;
  /** @deprecated */
  qrCode?: string | null;

  /** @deprecated Use contact and location instead */
  contactInfo?: {
    phoneNumber?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string | number;
    fieldLocation?: string;
  };

  /** Team links for coach pages */
  teamLinks?: {
    newsPageUrl?: string;
    schedulePageUrl?: string;
    registrationUrl?: string;
    customLinks?: TeamCustomLink[];
  };

  /** @deprecated */
  sessions?: Session[] | null;

  /** @deprecated Use lastLoginAt */
  lastLoginTime: Date | string | null;
  /** @deprecated Use updatedAt */
  lastUpdated?: Date | string | null;
}

// ============================================
// TYPE GUARDS
// ============================================

/** Check if user is an athlete */
export function isAthlete(user: User): user is User & { athlete: AthleteData } {
  return user.role === 'athlete' && !!user.athlete;
}

/** Check if user is a coach */
export function isCoach(user: User): user is User & { coach: CoachData } {
  return user.role === 'coach' && !!user.coach;
}

/** Check if user is a college coach */
export function isCollegeCoach(user: User): user is User & { collegeCoach: CollegeCoachData } {
  return user.role === 'college-coach' && !!user.collegeCoach;
}

/** Check if user has completed onboarding */
export function isOnboarded(user: User): boolean {
  return !!(user.onboardingCompleted && user.signupCompleted);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Get primary sport (first in array or legacy primarySport) */
export function getPrimarySport(user: User): SportProfile | undefined {
  // Prefer new sports array
  if (user.sports && user.sports.length > 0) {
    return user.sports.find((s) => s.order === 0) || user.sports[0];
  }
  return undefined;
}

/** Get active sport based on activeSportIndex */
export function getActiveSport(user: User): SportProfile | undefined {
  if (!user.sports || user.sports.length === 0) return undefined;
  const index = user.activeSportIndex ?? 0;
  return user.sports[index] ?? user.sports[0];
}

/** Get sport by name */
export function getSportByName(user: User, sportName: string): SportProfile | undefined {
  return user.sports?.find((s) => s.sport.toLowerCase() === sportName.toLowerCase());
}

/** Check if user plays a specific sport */
export function playsSport(user: User, sportName: string): boolean {
  // Check new architecture first
  if (user.sports?.some((s) => s.sport.toLowerCase() === sportName.toLowerCase())) {
    return true;
  }
  // Fallback to legacy fields
  return (
    user.primarySport?.toLowerCase() === sportName.toLowerCase() ||
    user.secondarySport?.toLowerCase() === sportName.toLowerCase()
  );
}

/** Get total number of college offers across all sports */
export function getTotalOffers(user: User): number {
  if (!user.sports) return 0;
  return user.sports.reduce((total, sport) => total + (sport.recruiting?.offers?.length || 0), 0);
}

/** Get all awards across all sports */
export function getAllAwards(user: User): string[] {
  if (!user.sports) return user.awards?.map((a) => a.award) || [];
  const sportAwards = user.sports.flatMap((s) => s.awards || []);
  const legacyAwards = user.awards?.map((a) => a.award) || [];
  return [...new Set([...sportAwards, ...legacyAwards])];
}

/** Check if user is multi-sport athlete */
export function isMultiSport(user: User): boolean {
  if (user.sports && user.sports.length > 1) return true;
  return !!(user.primarySport && user.secondarySport);
}

/** Check if user is committed for any sport */
export function isCommitted(user: User): boolean {
  // Check new architecture
  if (user.sports?.some((s) => s.recruiting?.commitment)) return true;
  // Fallback to legacy
  return user.isCommitted;
}

/** Add a new sport to user (returns new user object) */
export function addSport(user: User, sportProfile: SportProfile): User {
  const existingSports = user.sports || [];

  // Check if sport already exists
  if (existingSports.some((s) => s.sport === sportProfile.sport)) {
    return user;
  }

  // Set order to next available
  const maxOrder = existingSports.reduce((max, s) => Math.max(max, s.order), -1);
  const newProfile = { ...sportProfile, order: maxOrder + 1 };

  return {
    ...user,
    sports: [...existingSports, newProfile],
    canAddSport: existingSports.length + 1 < 5, // Limit to 5 sports
  };
}

/** Update a specific sport profile (returns new user object) */
export function updateSport(user: User, sportName: string, updates: Partial<SportProfile>): User {
  if (!user.sports) return user;

  const updatedSports = user.sports.map((s) =>
    s.sport === sportName ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
  );

  return { ...user, sports: updatedSports };
}

/** Remove a sport from user (returns new user object) */
export function removeSport(user: User, sportName: string): User {
  if (!user.sports) return user;

  const filtered = user.sports.filter((s) => s.sport !== sportName);

  // Reorder remaining sports
  const reordered = filtered.map((s, index) => ({ ...s, order: index }));

  return {
    ...user,
    sports: reordered,
    activeSportIndex: 0,
    canAddSport: true,
  };
}

/** Set primary sport (move to order 0) */
export function setPrimarySport(user: User, sportName: string): User {
  if (!user.sports) return user;

  const targetSport = user.sports.find((s) => s.sport === sportName);
  if (!targetSport) return user;

  const others = user.sports.filter((s) => s.sport !== sportName);
  const reordered = [
    { ...targetSport, order: 0 },
    ...others.map((s, i) => ({ ...s, order: i + 1 })),
  ];

  return { ...user, sports: reordered, activeSportIndex: 0 };
}

/** Set active sport by index */
export function setActiveSport(user: User, index: number): User {
  if (!user.sports || index < 0 || index >= user.sports.length) {
    return user;
  }
  return { ...user, activeSportIndex: index };
}

// ============================================
// UTILITY TYPES
// ============================================

/** Partial user for updates */
export type UserUpdate = Partial<Omit<User, 'id' | 'email' | '_schemaVersion' | 'createdAt'>>;

/** User creation payload */
export type UserCreate = Omit<User, 'id' | '_schemaVersion' | 'createdAt' | 'updatedAt'>;

/** Minimal user for lists/cards */
export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  profileImg: string | null;
  role: UserRole;
  location: Pick<Location, 'city' | 'state'>;
  primarySport?: string;
  primaryPosition?: string;
  classOf?: number;
}

/** Extract summary from full user */
export function toUserSummary(user: User): UserSummary {
  const primarySport = getPrimarySport(user);
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImg: user.profileImg,
    role: (user.role || 'athlete') as UserRole,
    location: {
      city: user.location?.city || user.city || '',
      state: user.location?.state || user.state || '',
    },
    primarySport: primarySport?.sport,
    primaryPosition: primarySport?.positions[0],
    classOf: user.athlete?.classOf,
  };
}

// ============================================
// DEFAULT VALUE FACTORIES
// ============================================

/** Create default user preferences */
export function createDefaultPreferences(): UserPreferences {
  return {
    notifications: {
      push: true,
      email: true,
      sms: false,
      marketing: false,
    },
    activityTracking: true,
    dismissedPrompts: [],
    defaultSportIndex: 0,
    theme: 'system',
  };
}

/** Create default counters */
export function createDefaultCounters(): UserCounters {
  return {
    profileViews: 0,
    videoViews: 0,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    sharesCount: 0,
  };
}

/** Create empty sport profile */
export function createEmptySportProfile(sport: string, order: number = 0): SportProfile {
  return {
    sport,
    order,
    positions: [],
    metrics: {},
    seasonStats: [],
    team: {
      name: '',
      type: 'high-school',
    },
    accountType: 'athlete',
  };
}
