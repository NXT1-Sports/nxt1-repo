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

/** Video image metadata */
export interface VideoImage {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  format?: string;
}

/** Statistical data */
export interface StatData {
  [key: string]: string | number | boolean;
}

/** Sport information */
export interface SportInfo {
  [key: string]: string | number | boolean | null;
}

/** Player tag */
export interface PlayerTag {
  id: string;
  name: string;
  category?: string;
  value?: string | number;
}

/** Campaign */
export interface Campaign {
  id: string;
  name: string;
  sentAt: Date | string;
  status?: 'sent' | 'draft' | 'scheduled';
  recipientCount?: number;
}

/** Video clip */
export interface VideoClip {
  id: string;
  url: string;
  thumbnailUrl?: string;
  duration?: number;
  startTime?: number;
  endTime?: number;
  tags?: string[];
}

/** Primary sport stat */
export interface primarySportStat {
  year?: string;
  data: StatData;
  title?: string | null;
  statType?: 'High School' | 'Club' | 'Middle School';
  competitionLevel?: 'Freshman' | 'JV' | 'Varsity';
  isRanked?: boolean;
}

/** Game stat */
export interface GameStat {
  game: string;
  data: StatData;
  date?: string | Date;
  year?: string;
  statType?: 'High School' | 'Club' | 'Middle School';
  competitionLevel?: 'Freshman' | 'JV' | 'Varsity';
  isRanked?: boolean;
}

/** College */
export interface College {
  _id?: string | null;
  'IPEDS/NCES_ID'?: string | null;
  city?: string | null;
  logoUrl?: string | null;
  name?: string | null;
  state?: string | null;
  visitDate?: string | null;
  sportInfo: SportInfo;
}

/** College visit */
interface collegeVisit {
  visitType?: string | null;
  visitDate?: string | null;
}

/** College camp */
interface collegeCamp {
  visitDate?: string | null;
}

export type CollegeVisits = College & collegeVisit;
export type CollegeCamp = College & collegeCamp;

/** Recent game */
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

/** Award */
export interface Award {
  award: string;
}

/** Personal best */
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
  [key: string]: any;
}

/** Team code - reference */
export interface TeamCode {
  id: string;
  code: string;
  teamName: string;
  [key: string]: any;
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
  // =========== CORE IDENTITY ===========
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profileImg: string | null;
  aboutMe: string;

  // =========== ONBOARDING ===========
  completeSignUp: boolean;
  completeAddSport: boolean;
  onboardingCompleted?: boolean;
  signupCompleted?: boolean;

  // =========== SPORTS SETUP ===========
  appSport: 'primary' | 'secondary' | null;
  sport: string;
  primarySport: string;
  primarySportPositions: string[];
  secondarySport: string;
  secondarySportPositions: string[];
  position: string;
  side?: string[];

  // =========== HIGH SCHOOL / TEAM ===========
  highSchool: string;
  highSchoolSuffix: 'High School' | 'Club';
  secondaryHighSchool: string;
  secondaryHighSchoolSuffix: 'High School' | 'Club';
  club: string | null;
  secondaryClub: string | null;
  classOf: number;

  // =========== IMAGES ===========
  secondarySportProfileImg: string | null;
  teamLogoImg: string | null;
  secondarySportTeamLogoImg: string | null;
  primaryVideoImage: VideoImage | string | null;
  secondaryVideoImage: VideoImage | string | null;

  // =========== CONTACT INFO ===========
  contactEmail: string;
  phoneNumber: string;
  address: string;
  city: string;
  state: string;
  zipCode: number;
  country: string;
  contact?: ContactInfo;
  location?: Location;

  // =========== SOCIAL LINKS ===========
  twitter: string | null;
  instagram: string | null;
  tiktok: string | null;
  hudlAccountLink: string;
  youtubeAccountLink: string;
  sportsAccountLink: string;
  social?: SocialLinks;
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    youtube?: string;
  };

  // =========== ROLE & ACCOUNT TYPE ===========
  role?: UserRole;
  status?: AccountStatus;
  athleteOrParentOrCoach: string;
  secondaryAthleteOrParentOrCoach: string;
  isRecruit?: boolean | null;
  isCollegeCoach?: boolean | null;
  isFan?: boolean | null;

  // =========== COACH INFO ===========
  coachCount: number;
  secondarySportCoachCount: number;
  coachTitle: string | null;
  coachFirstName: string;
  secondarySportCoachFirstName: string;
  coachLastName: string;
  secondarySportCoachLastName: string;
  coachPhoneNumber: string;
  secondarySportCoachPhoneNumber: string;
  coachEmail: string;
  secondarySportCoachEmail: string;
  canManageMultipleTeams?: boolean | null;

  // =========== ORGANIZATION / COLLEGE ===========
  organization?: string | null;
  secondOrganization?: string | null;
  collegeTeamName?: string | null;
  conference?: string | null;
  division?: string | null;
  title: string;
  mascot: string;
  teamName?: string;

  // =========== TEAM SETTINGS ===========
  teamCode?: TeamCode | string | null;
  teamCodeTrial?: {
    id: string;
    expireAt: Date | string;
    isActive: boolean;
    expiredAt?: Date | string;
  };
  teamColors?: string[] | null;
  teamColor1?: string | null;
  teamColor2?: string | null;
  secondarySportTeamColor1?: string | null;
  secondarySportTeamColor2?: string | null;

  // =========== SCHEDULING ===========
  schedule?: string | null;
  upcomingPastEvent?: string | null;
  upcomingGameLink?: string | null;
  secondarySportSchedule?: string | null;
  secondarySportUpcomingPastEvent?: string | null;
  secondarySportUpcomingGameLink?: string | null;

  // =========== SPORT-SPECIFIC TEXT ===========
  unicode?: string | null;
  secondarySportUnicode?: string | null;
  secondarySportAboutMe?: string | null;

  // =========== ACADEMIC INFO ===========
  academicInfo: {
    [key: string]: string | number;
  };

  // =========== ATHLETIC INFO & STATS ===========
  primarySportAthleticInfo: {
    [key: string]: string | number;
  };
  secondarySportAthleticInfo: {
    [key: string]: string | number;
  };
  primarySportStats: primarySportStat[];
  secondarySportStats: primarySportStat[];
  primarySportGameStats?: GameStat[];
  secondarySportGameStats?: GameStat[];

  // =========== SEASON RECORD ===========
  seasonRecord?: {
    wins: number;
    losses: number;
    ties?: number;
  };

  // =========== RECRUITING ===========
  level?: string;
  playerRole?: string;
  playerTags: PlayerTag[];
  offers: string | null;
  secondarySportOffers: string | null;
  offerLogos?: { [collegeName: string]: string };
  secondarySportOfferLogos?: { [collegeName: string]: string };
  committmentStatus?: string;
  committmentBy?: College;
  collegeInterests?: College[] | null;
  collegeVisits?: CollegeVisits[] | null;
  collegeCamps?: CollegeCamp[] | null;
  isCommitted: boolean;
  rating?: number;
  ratedBy?: string;

  // =========== EVENTS & ACHIEVEMENTS ===========
  recentGames?: recentGame[];
  events?: Event[];
  awards?: Award[];
  personalBests?: personalBest[];

  // =========== MEDIA & CONTENT ===========
  posts: UserPost[] | null;
  favoriteTemplate: string[] | null;
  favoriteProfile: string[] | null;
  availableTemplate: string[] | null;
  availableProfiles: string[] | null;
  availableMixtapes: string[] | null;
  ownTemplates: OwnTemplate[] | null;
  ownProfiles: OwnProfile[] | null;
  ownMixtapes: OwnMixtape[] | null;
  pinnedProfileVideo?: string | null;
  gameClipsCollection?: GameClipsCollection | null;

  // =========== EMAIL TEMPLATES ===========
  ownEmailTemplate: {
    [key: string]: string;
  };
  generalEmailTemplate: {
    [key: string]: string;
  };
  personalEmailTemplate: {
    [key: string]: string;
  };
  secondarySportOwnEmailTemplate: {
    [key: string]: string;
  };
  secondarySportGeneralEmailTemplate: {
    [key: string]: string;
  };
  secondarySportPersonalEmailTemplate: {
    [key: string]: string;
  };

  // =========== CAMPAIGNS ===========
  campaignsSent: Campaign[] | null;
  completeQuestionnaires: string[] | null;
  completeCamps: string[] | null;
  isFirstTimeAtCampaign: boolean;
  taggedColleges: [string | number];

  // =========== CONNECTED ACCOUNTS ===========
  connectedGmailToken?: string;
  connectedMicrosoftToken?: string;
  connectedEmail?: string;
  connectedAccounts?: ConnectedAccounts;

  // =========== SUBSCRIPTION & PAYMENT ===========
  payment: {
    expiresIn: any;
    firstYearExpiresIn: any;
  };
  planTier?: PlanTier;
  credits: number;
  lastActivatedPlan: string;
  lastActivePlan: string;
  showedTrialMessage?: boolean;

  // =========== PREFERENCES & FLAGS ===========
  activityTracking: boolean | null;
  pushNotifications: boolean;
  preferences?: UserPreferences;
  canAddSport: boolean;
  availableColleges: string[];
  showedHearAbout: boolean;

  // =========== UI STATE FLAGS ===========
  isShowedHowCollegeCreditWorks: boolean | null;
  isShowedFirstOpenCampaigns: boolean | null;
  isShowedHowMediaCreditWorks?: boolean | null;
  isSavingMedia: boolean | null;
  isNeedCreateThumbnail?: boolean | null;
  hasSeenFeedbackModal?: boolean | null;
  feedbackModalSeenAt?: Date | string | null;

  // =========== ANALYTICS & COUNTERS ===========
  profileViews?: number;
  videoViews: number;
  followersCount?: number;
  followingCount?: number;
  _counters?: UserCounters;

  // =========== REFERRALS ===========
  referrals: [{ userId: string; date: Date; status: string }];

  // =========== PARENT INFO ===========
  parentInfo: {
    [key: string]: number;
  };

  // =========== MISC ===========
  order?: number | string;
  removedBgImages?: string | null;
  qrCode?: string | null;

  // =========== CONTACT INFO (structured) ===========
  contactInfo?: {
    phoneNumber?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string | number;
    fieldLocation?: string;
  };

  // =========== TEAM LINKS ===========
  teamLinks?: {
    newsPageUrl?: string;
    schedulePageUrl?: string;
    registrationUrl?: string;
    customLinks?: TeamCustomLink[];
  };

  // =========== SESSIONS & AI ===========
  sessions?: Session[] | null;
  aiCopilotUsage?: {
    dailyTaskCount: number;
    lastResetDate: string;
    totalTasksCompleted: number;
  };

  // =========== TIMESTAMPS ===========
  lastLoginTime: Date | string | any | null;
  lastUpdated?: Date | string | any | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastLoginAt?: Date | string;

  // =========== FCM ===========
  fcmToken: string | null;

  // =========== NEW ARCHITECTURE (optional for migration) ===========
  _schemaVersion?: typeof USER_SCHEMA_VERSION;
  sports?: SportProfile[];
  activeSportIndex?: number;
  athlete?: AthleteData;
  coach?: CoachData;
  collegeCoach?: CollegeCoachData;
  fan?: FanData;
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

/** Get primary sport (first in array) */
export function getPrimarySport(user: User): SportProfile | undefined {
  return user.sports?.[0];
}

/** Get active sport */
export function getActiveSport(user: User): SportProfile | undefined {
  if (!user.sports || !user.activeSportIndex) {
    return user.sports?.[0];
  }
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
