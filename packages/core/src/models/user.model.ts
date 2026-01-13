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

import { Code } from './team-code.model';
import type {
  UserRole,
  AccountStatus,
  PlanTier,
  SubscriptionStatus,
  TeamType,
  PostType,
  UserReaction,
  VideoFormat,
  Theme,
  PaymentMethodType,
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
  /** Sport identifier (e.g., 'football', 'basketball') */
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

  /** Athletic measurements */
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

  /** Coach contact */
  coach?: CoachContact;

  /** Account type for this sport */
  accountType: AccountType;

  /** College recruiting */
  recruiting?: {
    offers: CollegeOffer[];
    interactions: CollegeInteraction[];
    commitment?: Commitment;
    level?: string;
    tags?: string[];
  };

  /** Schedule/events */
  schedule?: {
    url?: string;
    upcomingEvent?: string;
    eventLink?: string;
  };

  /** Recent games */
  recentGames?: Array<{
    date: Date | string;
    opponent: string;
    result: string;
    highlights?: string;
  }>;

  /** Season record */
  seasonRecord?: SeasonRecord;
}

// ============================================
// MEDIA TYPES
// ============================================

/** Media item base */
interface MediaItemBase {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  order?: number;
  shareCount?: number;
  isPinned?: boolean;
}

/** Profile card/graphic */
export interface ProfileCard extends MediaItemBase {
  type: 'profile-card';
  pngUrl?: string;
  isLive?: boolean;
  sportIndex?: number;
}

/** Video/mixtape */
export interface VideoMedia extends MediaItemBase {
  type: 'mixtape' | 'highlight' | 'game-film';
  duration?: number;
  hlsUrl?: string;
  format?: VideoFormat;
  qualities?: string[];
}

/** User media library */
export interface UserMedia {
  profileCards: ProfileCard[];
  videos: VideoMedia[];
  pinnedVideoId?: string;
}

// ============================================
// SUBSCRIPTION & BILLING
// ============================================

/** Payment method */
export interface PaymentMethod {
  type: PaymentMethodType;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
}

/** Subscription details */
export interface Subscription {
  plan: PlanTier;
  status: SubscriptionStatus;
  currentPeriodStart?: Date | string;
  currentPeriodEnd?: Date | string;
  cancelAtPeriodEnd?: boolean;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  paymentMethod?: PaymentMethod;
  credits: number;
  teamCode?: Code;
  teamCodeTrial?: {
    expiresAt: Date | string;
    features: string[];
  };
}

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
// POST TYPES
// ============================================

/** User post */
export interface UserPost {
  id: string;
  userId: string;
  type: PostType;
  title: string;
  description?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  hlsUrl?: string;
  videoFormat?: VideoFormat;
  videoDuration?: number;
  createdAt: Date | string;
  updatedAt?: Date | string;
  isPublic: boolean;
  isPinned?: boolean;
  sportIndex?: number;

  // Engagement
  views: number;
  shares: number;
  reactions: number;
  userReaction?: UserReaction;

  // Repost data
  isRepost?: boolean;
  originalPostId?: string;
  reposterId?: string;

  // Attached data
  attachedData?: Array<{
    type: string;
    label: string;
    value?: string | number;
  }>;

  tags?: string[];
  mentions?: Array<{
    id: string;
    type: 'user' | 'team' | 'college';
    display: string;
  }>;

  // Optimistic UI flags (client-only)
  _optimistic?: boolean;
  _deleting?: boolean;
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
 *
 * Design principles:
 * 1. Grouped by concern (identity, profile, sports, media, subscription)
 * 2. Sports as array - no primary/secondary duplication
 * 3. Role discriminator for type-safe role handling
 * 4. Single source for social/contact
 * 5. Preferences replace boolean flags
 */
export interface User {
  // =========== IDENTITY ===========
  /** Unique user ID (Firebase UID) */
  id: string;

  /** Primary email address */
  email: string;

  /** Schema version for migration tracking */
  _schemaVersion: typeof USER_SCHEMA_VERSION;

  /** Account status */
  status: AccountStatus;

  /** User role */
  role: UserRole;

  // =========== PROFILE ===========
  /** First name */
  firstName: string;

  /** Last name */
  lastName: string;

  /** Profile image URL */
  profileImg: string | null;

  /** Short bio/about me */
  aboutMe?: string;

  /** Location */
  location: Location;

  /** QR code for profile sharing */
  qrCode?: string;

  // =========== ONBOARDING ===========
  /** Onboarding completed */
  onboardingCompleted: boolean;

  /** Signup completed */
  signupCompleted: boolean;

  // =========== CONTACT & SOCIAL ===========
  /** Contact information */
  contact: ContactInfo;

  /** Social media links */
  social: SocialLinks;

  /** Connected email accounts */
  connectedAccounts?: ConnectedAccounts;

  // =========== SPORTS ===========
  /**
   * User's sports - ordered by preference
   * Index 0 is primary sport, supports unlimited sports
   */
  sports: SportProfile[];

  /** Currently active sport index for app display */
  activeSportIndex: number;

  // =========== ROLE-SPECIFIC DATA ===========
  /** Athlete-specific data (only if role === 'athlete') */
  athlete?: AthleteData;

  /** Coach-specific data (only if role === 'coach') */
  coach?: CoachData;

  /** College coach-specific data (only if role === 'college-coach') */
  collegeCoach?: CollegeCoachData;

  /** Fan-specific data (only if role === 'fan') */
  fan?: FanData;

  // =========== MEDIA ===========
  /** User's media library */
  media: UserMedia;

  /** User's posts */
  posts: UserPost[];

  // =========== SUBSCRIPTION ===========
  /** Subscription details */
  subscription: Subscription;

  // =========== PREFERENCES ===========
  /** User preferences */
  preferences: UserPreferences;

  // =========== COUNTERS ===========
  /**
   * Denormalized counters from analytics collection
   * For full analytics, query analytics/{userId}
   */
  _counters: UserCounters;

  // =========== REFERRALS ===========
  /** Referral history */
  referrals: Referral[];

  // =========== EMAIL CAMPAIGNS ===========
  /** Email templates */
  emailTemplates?: Record<string, string>;

  /** Completed questionnaires */
  completedQuestionnaires?: string[];

  /** Completed camps */
  completedCamps?: string[];

  /** Campaigns sent */
  campaignsSent?: string[];

  // =========== TIMESTAMPS ===========
  /** Account creation date */
  createdAt: Date | string;

  /** Last profile update */
  updatedAt: Date | string;

  /** Last login */
  lastLoginAt?: Date | string;

  // =========== FCM ===========
  /** Firebase Cloud Messaging token */
  fcmToken?: string | null;
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
  return user.onboardingCompleted && user.signupCompleted;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Get primary sport (first in array) */
export function getPrimarySport(user: User): SportProfile | undefined {
  return user.sports[0];
}

/** Get active sport */
export function getActiveSport(user: User): SportProfile | undefined {
  return user.sports[user.activeSportIndex] ?? user.sports[0];
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
    role: user.role,
    location: { city: user.location.city, state: user.location.state },
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

/** Create default subscription */
export function createDefaultSubscription(): Subscription {
  return {
    plan: 'free',
    status: 'none',
    credits: 0,
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

/** Create default media */
export function createDefaultMedia(): UserMedia {
  return {
    profileCards: [],
    videos: [],
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
