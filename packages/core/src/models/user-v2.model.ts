/**
 * @fileoverview User V2 Model
 * @module @nxt1/core/models
 *
 * Clean, composable user type definitions for the v2 application.
 * Designed for maintainability, type safety, and performance.
 * 100% portable - no framework dependencies.
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

export const USER_SCHEMA_VERSION = 2;

// ============================================
// LOCATION
// ============================================

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

export interface SocialLinksV2 {
  twitter?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  hudl?: string | null;
  youtube?: string | null;
  maxPreps?: string | null;
  linkedin?: string | null;
}

export interface ContactInfoV2 {
  email: string;
  phone?: string | null;
}

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

export interface TeamInfo {
  name: string;
  type: TeamType;
  logo?: string | null;
  mascot?: string;
  colors?: string[];
  conference?: string;
  division?: string;
}

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

export type AthleticMetrics = Record<string, string | number | undefined>;

export interface SeasonStats {
  season: string;
  year: number;
  stats: Record<string, string | number>;
  gamesPlayed?: number;
}

export interface GameStats {
  date: Date | string;
  opponent: string;
  stats: Record<string, string | number>;
  result?: 'win' | 'loss' | 'tie';
  score?: string;
}

export interface SeasonRecordV2 {
  wins: number;
  losses: number;
  ties?: number;
  season?: string;
}

export interface CollegeOffer {
  collegeId: string;
  collegeName: string;
  logoUrl?: string;
  offeredAt?: Date | string;
  sport: string;
  scholarshipType?: ScholarshipType;
}

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

export interface Commitment {
  collegeId: string;
  collegeName: string;
  logoUrl?: string;
  committedAt: Date | string;
  sport: string;
  status: CommitmentStatus;
  announcedAt?: Date | string;
}

export interface SportProfile {
  sport: string;
  order: number;
  profileImg?: string | null;
  aboutMe?: string;
  positions: string[];
  side?: string[];
  metrics: AthleticMetrics;
  seasonStats: SeasonStats[];
  gameStats?: GameStats[];
  personalBests?: Array<{
    name: string;
    value: string | number;
    date?: Date | string;
  }>;
  team: TeamInfo;
  coach?: CoachContact;
  accountType: AccountType;
  recruiting?: {
    offers: CollegeOffer[];
    interactions: CollegeInteraction[];
    commitment?: Commitment;
    level?: string;
    tags?: string[];
  };
  schedule?: {
    url?: string;
    upcomingEvent?: string;
    eventLink?: string;
  };
  recentGames?: Array<{
    date: Date | string;
    opponent: string;
    result: string;
    highlights?: string;
  }>;
  seasonRecord?: SeasonRecordV2;
}

// ============================================
// MEDIA TYPES
// ============================================

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

export interface ProfileCard extends MediaItemBase {
  type: 'profile-card';
  pngUrl?: string;
  isLive?: boolean;
  sportIndex?: number;
}

export interface VideoMedia extends MediaItemBase {
  type: 'mixtape' | 'highlight' | 'game-film';
  duration?: number;
  hlsUrl?: string;
  format?: VideoFormat;
  qualities?: string[];
}

export interface UserMedia {
  profileCards: ProfileCard[];
  videos: VideoMedia[];
  pinnedVideoId?: string;
}

// ============================================
// SUBSCRIPTION & BILLING
// ============================================

export interface PaymentMethod {
  type: PaymentMethodType;
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
}

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

export interface NotificationPreferences {
  push: boolean;
  email: boolean;
  sms?: boolean;
  marketing?: boolean;
}

export interface UserPreferences {
  notifications: NotificationPreferences;
  activityTracking: boolean;
  dismissedPrompts: DismissablePrompt[];
  defaultSportIndex: number;
  theme?: Theme;
  language?: string;
}

// ============================================
// COUNTERS
// ============================================

export interface UserCountersV2 {
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

export interface CoachData {
  title: string;
  yearsExperience?: number;
  certifications?: string[];
  canManageMultipleTeams?: boolean;
  managedTeamCodes?: string[];
}

export interface CollegeCoachData extends CoachData {
  institution: string;
  department?: string;
  recruitingRegions?: string[];
}

export interface FanData {
  followedTeams?: string[];
  followedAthletes?: string[];
  favoriteColleges?: string[];
}

// ============================================
// POST TYPES
// ============================================

export interface UserPostV2 {
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
  views: number;
  shares: number;
  reactions: number;
  userReaction?: UserReaction;
  isRepost?: boolean;
  originalPostId?: string;
  reposterId?: string;
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
  _optimistic?: boolean;
  _deleting?: boolean;
}

// ============================================
// REFERRAL
// ============================================

export interface ReferralV2 {
  userId: string;
  referredAt: Date | string;
  status: ReferralStatus;
  rewardClaimed?: boolean;
}

// ============================================
// MAIN USER INTERFACE
// ============================================

export interface UserV2 {
  // Identity
  id: string;
  email: string;
  _schemaVersion: typeof USER_SCHEMA_VERSION;
  status: AccountStatus;
  role: UserRole;

  // Profile
  firstName: string;
  lastName: string;
  profileImg: string | null;
  aboutMe?: string;
  location: Location;
  qrCode?: string;

  // Onboarding
  onboardingCompleted: boolean;
  signupCompleted: boolean;

  // Contact & Social
  contact: ContactInfoV2;
  social: SocialLinksV2;
  connectedAccounts?: ConnectedAccounts;

  // Sports
  sports: SportProfile[];
  activeSportIndex: number;

  // Role-specific
  athlete?: AthleteData;
  coach?: CoachData;
  collegeCoach?: CollegeCoachData;
  fan?: FanData;

  // Media
  media: UserMedia;
  posts: UserPostV2[];

  // Subscription
  subscription: Subscription;

  // Preferences
  preferences: UserPreferences;

  // Counters
  _counters: UserCountersV2;

  // Referrals
  referrals: ReferralV2[];

  // Email campaigns
  emailTemplates?: Record<string, string>;
  completedQuestionnaires?: string[];
  completedCamps?: string[];
  campaignsSent?: string[];

  // Timestamps
  createdAt: Date | string;
  updatedAt: Date | string;
  lastLoginAt?: Date | string;

  // FCM
  fcmToken?: string | null;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isAthlete(user: UserV2): user is UserV2 & { athlete: AthleteData } {
  return user.role === 'athlete' && !!user.athlete;
}

export function isCoach(user: UserV2): user is UserV2 & { coach: CoachData } {
  return user.role === 'coach' && !!user.coach;
}

export function isCollegeCoach(user: UserV2): user is UserV2 & { collegeCoach: CollegeCoachData } {
  return user.role === 'college-coach' && !!user.collegeCoach;
}

export function isOnboarded(user: UserV2): boolean {
  return user.onboardingCompleted && user.signupCompleted;
}

// ============================================
// HELPER TYPES
// ============================================

export function getPrimarySport(user: UserV2): SportProfile | undefined {
  return user.sports[0];
}

export function getActiveSport(user: UserV2): SportProfile | undefined {
  return user.sports[user.activeSportIndex] ?? user.sports[0];
}

export type UserV2Update = Partial<Omit<UserV2, 'id' | 'email' | '_schemaVersion' | 'createdAt'>>;

export type UserV2Create = Omit<UserV2, 'id' | '_schemaVersion' | 'createdAt' | 'updatedAt'>;

export interface UserV2Summary {
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

export function toUserSummary(user: UserV2): UserV2Summary {
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
// DEFAULT VALUES FACTORY
// ============================================

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

export function createDefaultSubscription(): Subscription {
  return {
    plan: 'free',
    status: 'none',
    credits: 0,
  };
}

export function createDefaultCounters(): UserCountersV2 {
  return {
    profileViews: 0,
    videoViews: 0,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    sharesCount: 0,
  };
}

export function createDefaultMedia(): UserMedia {
  return {
    profileCards: [],
    videos: [],
  };
}

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
