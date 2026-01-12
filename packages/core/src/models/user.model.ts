/**
 * @fileoverview User Model
 * @module @nxt1/core/models
 *
 * Canonical user type definitions for the v2 application.
 * Single source of truth for all user-related types.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

import {
  Award,
  ContactInfo,
  GameClipsCollection,
  GameStat,
  PaymentInfo,
  PersonalBest,
  PLANS,
  PrimarySportStat,
  RecentGame,
  Referral,
  SeasonRecord,
  Session,
  SocialLinks,
  TeamCodeTrial,
  TeamLinks,
  UserEvent,
} from './common.types';
import { Code } from './team-code.model';

// ============================================
// COLLEGE TYPES
// ============================================

export interface College {
  _id?: string | null;
  'IPEDS/NCES_ID'?: string | null;
  city?: string | null;
  logoUrl?: string | null;
  name?: string | null;
  state?: string | null;
  visitDate?: string | null;
  sportInfo?: unknown;
}

export interface CollegeVisit extends College {
  visitType?: string | null;
  visitDate?: string | null;
}

export interface CollegeCamp extends College {
  visitDate?: string | null;
}

export type CollegeVisits = CollegeVisit;

// ============================================
// MEDIA OWNERSHIP TYPES
// ============================================

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
  selectionOrder?: number | null;
}

// ============================================
// POST TYPES
// ============================================

export type PostType =
  | 'metrics'
  | 'commit'
  | 'visit'
  | 'camp'
  | 'award'
  | 'news'
  | 'highlight'
  | 'graphic'
  | 'offer'
  | 'offers'
  | 'video'
  | 'stat'
  | 'stats'
  | 'metric'
  | 'schedule';

export type UserReaction = 'like' | 'love' | 'celebrate' | 'support' | 'insightful' | null;

export interface MentionData {
  id: string;
  type: 'user' | 'team' | 'college';
  display: string;
  userId?: string;
  teamCode?: string;
}

export interface AttachedProfileData {
  id: string;
  type:
    | 'offers'
    | 'stat'
    | 'stats'
    | 'metric'
    | 'metrics'
    | 'award'
    | 'commit'
    | 'schedule'
    | 'visit'
    | 'camps'
    | 'video-tag'
    | 'content-tag';
  label: string;
  description?: string;
  value?: string | number;
  date?: string;
  color?: string;
}

export interface VideoMetadata {
  width?: number;
  height?: number;
  bitrate?: number;
  processingTime?: number;
}

export interface UserPost {
  id: string;
  userId?: string;
  title: string;
  description?: string;
  type: PostType;
  mediaUrl?: string;
  thumbnailUrl?: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  views: number;
  videoViews?: number;
  shares: number;
  reposts?: number;
  reactions?: number;
  userReaction?: UserReaction;
  isRepost?: boolean;
  isReposted?: boolean;
  originalPostId?: string;
  reposterId?: string;
  reposterUsername?: string;
  reposterName?: string;
  reposterProfileImg?: string;
  repostedAt?: Date | string;
  userUnicode?: number | string;
  isPublic: boolean;
  isPinned?: boolean;
  userName?: string;
  firstName?: string;
  lastName?: string;
  profileImg?: string;
  sport?: string;
  primarySport?: string;
  secondarySport?: string;
  user?: User | null;
  classYear?: string;
  position?: string;
  state?: string;
  country?: string;
  hlsUrl?: string;
  videoFormat?: 'mp4' | 'hls';
  availableQualities?: string[];
  videoDuration?: number;
  videoMetadata?: VideoMetadata;
  attachedProfileData?: AttachedProfileData[];
  socialMediaLinks?: {
    instagram?: boolean;
    twitter?: boolean;
    facebook?: boolean;
    youtube?: boolean;
  };
  tags?: string[];
  mentions?: MentionData[];
  _optimistic?: boolean;
  _deleting?: boolean;
}

// ============================================
// USER INTERFACE (Main)
// ============================================

export interface User {
  id: string;
  completeSignUp: boolean;
  onboardingCompleted?: boolean;
  completeAddSport: boolean;
  appSport: 'primary' | 'secondary' | null;
  firstName: string;
  lastName: string;
  email: string;
  profileImg: string | null;
  secondarySportProfileImg: string | null;
  aboutMe: string;
  title: string;
  mascot: string;
  isRecruit?: boolean | null;
  isCoach?: boolean | null;
  isCollegeCoach?: boolean | null;
  isFan?: boolean | null;
  canManageMultipleTeams?: boolean | null;
  highSchool: string;
  highSchoolSuffix: 'High School' | 'Club' | 'Middle School' | 'JUCO' | null;
  classOf: number;
  club: string | null;
  secondaryClub: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: number;
  country: string;
  primarySport: string;
  primarySportPositions: string[];
  side?: string[];
  primarySportAthleticInfo: Record<string, string | number>;
  primarySportStats: PrimarySportStat[];
  primarySportGameStats?: GameStat[];
  secondarySport: string;
  secondarySportPositions: string[];
  secondarySportAthleticInfo: Record<string, string | number>;
  secondarySportStats: unknown[];
  secondarySportGameStats?: GameStat[];
  contactEmail: string;
  phoneNumber: string;
  twitter: string | null;
  instagram: string | null;
  tiktok: string | null;
  contactInfo?: ContactInfo;
  socialLinks?: SocialLinks;
  hudlAccountLink: string;
  youtubeAccountLink: string;
  sportsAccountLink: string;
  teamLinks?: TeamLinks;
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
  parentInfo: Record<string, number>;
  athleteOrParentOrCoach: string;
  secondaryAthleteOrParentOrCoach: string;
  academicInfo: Record<string, string | number>;
  teamLogoImg: string | null;
  secondarySportTeamLogoImg: string | null;
  teamColor1?: string | null;
  teamColor2?: string | null;
  secondarySportTeamColor1?: string | null;
  secondarySportTeamColor2?: string | null;
  unicode?: string | null;
  secondarySportUnicode?: string | null;
  teamName?: string;
  teamColors?: string[] | null;
  offers: string | null;
  secondarySportOffers: string | null;
  offerLogos?: Record<string, string>;
  secondarySportOfferLogos?: Record<string, string>;
  committmentStatus?: string;
  committmentBy?: College;
  collegeInterests?: College[] | null;
  collegeVisits?: CollegeVisit[] | null;
  collegeCamps?: CollegeCamp[] | null;
  isCommitted: boolean;
  taggedColleges: (string | number)[];
  availableColleges: string[];
  level?: string;
  playerRole?: string;
  playerTags: unknown[];
  seasonRecord?: SeasonRecord;
  conference?: string | null;
  division?: string | null;
  ownProfiles: OwnProfile[] | null;
  ownMixtapes: OwnMixtape[] | null;
  pinnedProfileVideo?: string | null;
  posts: UserPost[] | null;
  primaryVideoImage: unknown;
  secondaryVideoImage: unknown;
  gameClipsCollection?: GameClipsCollection | null;
  removedBgImages?: string | null;
  isSavingMedia: boolean | null;
  isNeedCreateThumbnail?: boolean | null;
  schedule?: string | null;
  secondarySportSchedule?: string | null;
  upcomingPastEvent?: string | null;
  secondarySportUpcomingPastEvent?: string | null;
  upcomingGameLink?: string | null;
  secondarySportUpcomingGameLink?: string | null;
  secondarySportAboutMe?: string | null;
  recentGames?: RecentGame[];
  events?: UserEvent[];
  awards?: Award[];
  personalBests?: PersonalBest[];
  ownEmailTemplate: Record<string, string>;
  connectedGmailToken?: string;
  connectedMicrosoftToken?: string;
  connectedEmail?: string;
  completeQuestionnaires: string[] | null;
  completeCamps: string[] | null;
  campaignsSent: unknown[] | null;
  isFirstTimeAtCampaign: boolean;
  payment: PaymentInfo;
  credits: number;
  lastActivatedPlan: PLANS;
  canAddSport: boolean;
  teamCode?: Code;
  teamCodeTrial?: TeamCodeTrial;
  isShowedHowCollegeCreditWorks: boolean | null;
  isShowedFirstOpenCampaigns: boolean | null;
  isShowedHowMediaCreditWorks?: boolean | null;
  showedWelcomeDialog?: boolean;
  welcomeDialogShownAt?: Date | string | null;
  showedHearAbout: boolean;
  hasSeenFeedbackModal?: boolean | null;
  feedbackModalSeenAt?: Date | string | null;
  organization?: string | null;
  collegeTeamName?: string | null;
  secondOrganization?: string | null;
  fcmToken: string | null;
  pushNotifications: boolean;
  profileViews?: number;
  videoViews: number;
  activityTracking: boolean | null;
  sessions?: Session[] | null;
  followersCount?: number;
  followingCount?: number;
  referrals: Referral[];
  qrCode?: string | null;
  rating?: number;
  ratedBy?: string;
  lastLoginTime: unknown;
  lastUpdated?: unknown;
  order?: number | string;
  [key: string]: unknown;
}

// ============================================
// SOCIAL AUTH TYPES
// ============================================

export interface Social {
  picture: string | null;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
}

export interface SocialResponse {
  additionalUserInfo?: GoogleAdditionalUserInfo | null;
  credential?: AuthCredential | null;
  operationType?: string | null;
  providerId?: string | null;
  _tokenResponse: null;
  user: unknown;
}

export interface GoogleAdditionalUserInfo {
  isNewUser: boolean;
  profile: GoogleProfile;
  providerId: string;
}

export interface GoogleProfile {
  email: string;
  family_name: string;
  given_name: string;
  granted_scopes: string;
  id: string;
  locale: string;
  name: string;
  picture: string;
  verified_email: string;
}

export interface AuthCredential {
  accessToken: string;
  idToken: string;
  pendingToken?: string | null;
  providerId: string;
  signInMethod: string;
}
