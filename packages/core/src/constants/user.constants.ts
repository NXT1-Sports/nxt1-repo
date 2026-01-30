/**
 * @fileoverview User Constants for V2
 * @module @nxt1/core/constants
 *
 * Single source of truth for all user-related configuration.
 * Contains enums, lookup tables, and field definitions used across the app.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// USER ROLES
// ============================================

export const USER_ROLES = {
  ATHLETE: 'athlete',
  COACH: 'coach',
  COLLEGE_COACH: 'college-coach',
  DIRECTOR: 'director',
  RECRUITING_SERVICE: 'recruiting-service',
  SCOUT: 'scout',
  MEDIA: 'media',
  PARENT: 'parent',
  FAN: 'fan',
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export interface RoleConfig {
  id: UserRole;
  label: string;
  description: string;
  icon: string;
  /** Whether this role can manage athlete profiles */
  canManageAthletes?: boolean;
  /** Whether this role has recruiting capabilities */
  canRecruit?: boolean;
}

export const ROLE_CONFIGS: readonly RoleConfig[] = [
  {
    id: 'athlete',
    label: 'Athlete',
    description: 'Student athlete looking to get recruited',
    icon: '🏃',
  },
  {
    id: 'coach',
    label: 'Coach',
    description: 'High school or club coach',
    icon: '🏆',
    canManageAthletes: true,
  },
  {
    id: 'college-coach',
    label: 'College Coach',
    description: 'College coach recruiting athletes',
    icon: '🎓',
    canRecruit: true,
  },
  {
    id: 'director',
    label: 'Athletic Director',
    description: 'Athletic director or program administrator',
    icon: '📋',
    canManageAthletes: true,
  },
  {
    id: 'scout',
    label: 'Scout',
    description: 'Professional scout evaluating athletes',
    icon: '🔍',
    canRecruit: true,
  },
  {
    id: 'recruiting-service',
    label: 'Recruiting Service',
    description: 'Professional recruiting service helping athletes get recruited',
    icon: '🎯',
    canRecruit: true,
    canManageAthletes: true,
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Journalist, photographer, or content creator',
    icon: '📰',
  },
  {
    id: 'parent',
    label: 'Parent/Guardian',
    description: 'Parent managing athlete profile',
    icon: '👨‍👩‍👧',
    canManageAthletes: true,
  },
  {
    id: 'fan',
    label: 'Fan',
    description: 'Following athletes and teams',
    icon: '📣',
  },
] as const;

// ============================================
// PROFILE TEMPLATES
// ============================================

export const PROFILE_TEMPLATES = {
  GENERAL: 'general',
  PERSONAL: 'personal',
  SOCIAL: 'social',
  OWN: 'own',
  NO: 'no',
} as const;

export type ProfileTemplate = (typeof PROFILE_TEMPLATES)[keyof typeof PROFILE_TEMPLATES];

export enum TEMPLATES {
  GENERAL = 'general',
  PERSONAL = 'personal',
  SOCIAL = 'social',
  OWN = 'own',
  NO = 'no',
}

// ============================================
// ACCOUNT STATUS
// ============================================

export const ACCOUNT_STATUSES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
  PENDING: 'pending',
} as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[keyof typeof ACCOUNT_STATUSES];

// ============================================
// GENDER (inclusive per 2026 UX standards)
// ============================================

/**
 * Gender values for user profiles.
 */
export const GENDERS = {
  MALE: 'male',
  FEMALE: 'female',
  PREFER_NOT_TO_SAY: 'prefer-not-to-say',
} as const;

export type Gender = (typeof GENDERS)[keyof typeof GENDERS];

/** Gender display configuration */
export interface GenderConfig {
  id: Gender;
  label: string;
}

/** Gender options for UI display (ordered by convention) */
export const GENDER_CONFIGS: readonly GenderConfig[] = Object.freeze([
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'prefer-not-to-say', label: 'Prefer not to say' },
]);

// ============================================
// TEAM TYPES
// ============================================

export const TEAM_TYPES = {
  HIGH_SCHOOL: 'high-school',
  CLUB: 'club',
  COLLEGE: 'college',
  MIDDLE_SCHOOL: 'middle-school',
  JUCO: 'juco',
  ORGANIZATION: 'organization',
} as const;

export type TeamType = (typeof TEAM_TYPES)[keyof typeof TEAM_TYPES];

export interface TeamTypeConfig {
  id: TeamType;
  label: string;
  shortLabel: string;
}

export const TEAM_TYPE_CONFIGS: readonly TeamTypeConfig[] = [
  { id: 'high-school', label: 'High School', shortLabel: 'HS' },
  { id: 'club', label: 'Club', shortLabel: 'Club' },
  { id: 'college', label: 'College', shortLabel: 'College' },
  { id: 'middle-school', label: 'Middle School', shortLabel: 'MS' },
  { id: 'juco', label: 'Junior College', shortLabel: 'JUCO' },
  { id: 'organization', label: 'Organization', shortLabel: 'Org' },
] as const;

// ============================================
// ATHLETE LEVELS
// ============================================

export const ATHLETE_LEVELS = {
  FRESHMAN: 'Freshman',
  JUNIOR_VARSITY: 'Junior Varsity',
  VARSITY: 'Varsity',
} as const;

export type AthleteLevel = (typeof ATHLETE_LEVELS)[keyof typeof ATHLETE_LEVELS];

export interface LevelOption {
  label: string;
  value: AthleteLevel;
}

export const LEVEL_OPTIONS: readonly LevelOption[] = [
  { label: 'Freshman', value: 'Freshman' },
  { label: 'Junior Varsity', value: 'Junior Varsity' },
  { label: 'Varsity', value: 'Varsity' },
] as const;

// ============================================
// FOOTBALL SIDES
// ============================================

export const FOOTBALL_SIDES = {
  OFFENSE: 'Offense',
  DEFENSE: 'Defense',
  SPECIAL_TEAM: 'Special Team',
} as const;

export type FootballSide = (typeof FOOTBALL_SIDES)[keyof typeof FOOTBALL_SIDES];

export interface SideOption {
  label: string;
  value: FootballSide;
}

export const SIDE_OPTIONS: readonly SideOption[] = [
  { label: 'Offense', value: 'Offense' },
  { label: 'Defense', value: 'Defense' },
  { label: 'Special Team', value: 'Special Team' },
] as const;

// ============================================
// GRADUATION YEARS
// ============================================

export function generateGraduationYears(): number[] {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 2;
  const endYear = currentYear + 12;
  const years: number[] = [];
  for (let year = startYear; year <= endYear; year++) {
    years.push(year);
  }
  return years;
}

export const GRADUATION_YEARS: readonly number[] = generateGraduationYears();

// ============================================
// SCHOLARSHIP TYPES
// ============================================

export const SCHOLARSHIP_TYPES = {
  FULL: 'full',
  PARTIAL: 'partial',
  WALK_ON: 'walk-on',
  PREFERRED_WALK_ON: 'preferred-walk-on',
} as const;

export type ScholarshipType = (typeof SCHOLARSHIP_TYPES)[keyof typeof SCHOLARSHIP_TYPES];

export interface ScholarshipOption {
  id: ScholarshipType;
  label: string;
}

export const SCHOLARSHIP_OPTIONS: readonly ScholarshipOption[] = [
  { id: 'full', label: 'Full Scholarship' },
  { id: 'partial', label: 'Partial Scholarship' },
  { id: 'walk-on', label: 'Walk-On' },
  { id: 'preferred-walk-on', label: 'Preferred Walk-On' },
] as const;

// ============================================
// COMMITMENT STATUS
// ============================================

export const COMMITMENT_STATUSES = {
  VERBAL: 'verbal',
  SIGNED: 'signed',
  ENROLLED: 'enrolled',
} as const;

export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[keyof typeof COMMITMENT_STATUSES];

// ============================================
// VISIT TYPES
// ============================================

export const VISIT_TYPES = {
  OFFICIAL: 'official',
  UNOFFICIAL: 'unofficial',
} as const;

export type VisitType = (typeof VISIT_TYPES)[keyof typeof VISIT_TYPES];

// ============================================
// PARENT RELATIONSHIPS
// ============================================

export const PARENT_RELATIONSHIPS = {
  MOTHER: 'mother',
  FATHER: 'father',
  GUARDIAN: 'guardian',
} as const;

export type ParentRelationship = (typeof PARENT_RELATIONSHIPS)[keyof typeof PARENT_RELATIONSHIPS];

// NOTE: NOTIFICATION_CHANNELS moved to notification.constants.ts
// Import from: import { NOTIFICATION_CHANNELS } from '@nxt1/core/constants'

// ============================================
// THEME OPTIONS
// ============================================

export const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

export type Theme = (typeof THEMES)[keyof typeof THEMES];

// ============================================
// PAYMENT FREQUENCY
// ============================================

export const PAYMENT_FREQUENCIES = {
  ONE_TIME: '',
  MONTHLY: 'month',
  YEARLY: 'year',
} as const;

export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[keyof typeof PAYMENT_FREQUENCIES];

export interface PaymentFrequencyOption {
  id: PaymentFrequency;
  label: string;
}

export const PAYMENT_FREQUENCY_OPTIONS: readonly PaymentFrequencyOption[] = [
  { id: '', label: '1 time' },
  { id: 'month', label: 'per month' },
  { id: 'year', label: 'per year' },
] as const;

export const PAYMENT_TYPE = [
  { id: '', text: '1 time' },
  { id: 'month', text: 'per month' },
  { id: 'year', text: 'per year' },
] as const;

// ============================================
// POST TYPES
// ============================================

export const POST_TYPES = {
  METRICS: 'metrics',
  COMMIT: 'commit',
  VISIT: 'visit',
  CAMP: 'camp',
  AWARD: 'award',
  NEWS: 'news',
  HIGHLIGHT: 'highlight',
  GRAPHIC: 'graphic',
  OFFER: 'offer',
  OFFERS: 'offers',
  VIDEO: 'video',
  STAT: 'stat',
  STATS: 'stats',
  METRIC: 'metric',
  SCHEDULE: 'schedule',
  GAME: 'game',
  PLAYOFFS: 'playoffs',
} as const;

export type PostType = (typeof POST_TYPES)[keyof typeof POST_TYPES];

export interface PostTypeConfig {
  id: PostType | 'all';
  label: string;
  icon: string;
  color: string;
}

export const POST_TYPE_CONFIGS: readonly PostTypeConfig[] = [
  { id: 'all', label: 'All Posts', icon: '🔥', color: '#ccff00' },
  { id: 'video', label: 'Videos', icon: '🎬', color: '#002fffff' },
  { id: 'graphic', label: 'Graphics', icon: '🎨', color: '#FF6B6B' },
  { id: 'commit', label: 'Commitment', icon: '🎯', color: '#4ECDC4' },
  { id: 'offer', label: 'Offers', icon: '📩', color: '#ff0000ff' },
  { id: 'game', label: 'Game', icon: '🏟️', color: '#37ff00ff' },
  { id: 'playoffs', label: 'Playoffs', icon: '🏆', color: '#FFD700' },
  { id: 'stats', label: 'Stats', icon: '📊', color: '#A855F7' },
  { id: 'award', label: 'Awards', icon: '🥇', color: '#f5940bff' },
  { id: 'metrics', label: 'Metrics', icon: '📈', color: '#10B981' },
  { id: 'visit', label: 'College Visits', icon: '🏫', color: '#3B82F6' },
  { id: 'camp', label: 'Camps', icon: '⛺', color: '#F97316' },
  { id: 'news', label: 'News', icon: '📰', color: '#06B6D4' },
  { id: 'schedule', label: 'Schedule', icon: '📅', color: '#EF4444' },
] as const;

export const CREATE_POST_TYPE_CONFIGS = POST_TYPE_CONFIGS.filter((t) => t.id !== 'all');

// ============================================
// USER REACTIONS
// ============================================

export const USER_REACTIONS = {
  LIKE: 'like',
  LOVE: 'love',
  CELEBRATE: 'celebrate',
  SUPPORT: 'support',
  INSIGHTFUL: 'insightful',
} as const;

export type UserReaction = (typeof USER_REACTIONS)[keyof typeof USER_REACTIONS] | null;

export interface ReactionConfig {
  id: Exclude<UserReaction, null>;
  label: string;
  icon: string;
}

export const REACTION_CONFIGS: readonly ReactionConfig[] = [
  { id: 'like', label: 'Like', icon: '👍' },
  { id: 'love', label: 'Love', icon: '❤️' },
  { id: 'celebrate', label: 'Celebrate', icon: '🎉' },
  { id: 'support', label: 'Support', icon: '💪' },
  { id: 'insightful', label: 'Insightful', icon: '💡' },
] as const;

// ============================================
// MEDIA TYPES
// ============================================

export const MEDIA_TYPES = {
  PROFILE_CARD: 'profile-card',
  MIXTAPE: 'mixtape',
  HIGHLIGHT: 'highlight',
  GAME_FILM: 'game-film',
} as const;

export type MediaType = (typeof MEDIA_TYPES)[keyof typeof MEDIA_TYPES];

// ============================================
// VIDEO FORMATS
// ============================================

export const VIDEO_FORMATS = {
  MP4: 'mp4',
  HLS: 'hls',
} as const;

export type VideoFormat = (typeof VIDEO_FORMATS)[keyof typeof VIDEO_FORMATS];

// ============================================
// SOCIAL PLATFORMS
// ============================================

export const SOCIAL_PLATFORMS = {
  TWITTER: 'twitter',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
  HUDL: 'hudl',
  YOUTUBE: 'youtube',
  MAXPREPS: 'maxPreps',
  LINKEDIN: 'linkedin',
} as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[keyof typeof SOCIAL_PLATFORMS];

export interface SocialPlatformConfig {
  id: SocialPlatform;
  label: string;
  icon: string;
  urlPrefix: string;
  placeholder: string;
}

export const SOCIAL_PLATFORM_CONFIGS: readonly SocialPlatformConfig[] = [
  {
    id: 'twitter',
    label: 'Twitter/X',
    icon: '𝕏',
    urlPrefix: 'https://twitter.com/',
    placeholder: '@username',
  },
  {
    id: 'instagram',
    label: 'Instagram',
    icon: '📸',
    urlPrefix: 'https://instagram.com/',
    placeholder: '@username',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    icon: '🎵',
    urlPrefix: 'https://tiktok.com/@',
    placeholder: '@username',
  },
  {
    id: 'hudl',
    label: 'Hudl',
    icon: '🎥',
    urlPrefix: 'https://hudl.com/',
    placeholder: 'Profile URL',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    icon: '▶️',
    urlPrefix: 'https://youtube.com/',
    placeholder: 'Channel URL',
  },
  {
    id: 'maxPreps',
    label: 'MaxPreps',
    icon: '📊',
    urlPrefix: 'https://maxpreps.com/',
    placeholder: 'Profile URL',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    icon: '💼',
    urlPrefix: 'https://linkedin.com/in/',
    placeholder: 'Profile URL',
  },
] as const;

// ============================================
// EMAIL PROVIDERS
// ============================================

export const EMAIL_PROVIDERS = {
  GMAIL: 'gmail',
  MICROSOFT: 'microsoft',
  YAHOO: 'yahoo',
} as const;

export type EmailProvider = (typeof EMAIL_PROVIDERS)[keyof typeof EMAIL_PROVIDERS];

// ============================================
// REFERRAL STATUS
// ============================================

export const REFERRAL_STATUSES = {
  PENDING: 'pending',
  COMPLETED: 'completed',
} as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[keyof typeof REFERRAL_STATUSES];

// ============================================
// PROFILE SECTIONS
// ============================================

export interface ProfileSection {
  id: string;
  title: string;
  icon: string;
  order: number;
}

export const PROFILE_SECTIONS: readonly ProfileSection[] = [
  { id: 'about', title: 'About', icon: 'assets/images/profile/svg-icons/about.svg', order: 0 },
  {
    id: 'contact',
    title: 'Contact',
    icon: 'assets/images/profile/svg-icons/contact.svg',
    order: 1,
  },
  { id: 'coach', title: 'Coach', icon: 'assets/images/profile/svg-icons/coach.svg', order: 2 },
  {
    id: 'academic',
    title: 'Academic',
    icon: 'assets/images/profile/svg-icons/academic.svg',
    order: 3,
  },
  { id: 'size', title: 'Size', icon: 'assets/images/profile/svg-icons/size.svg', order: 4 },
  {
    id: 'athletic',
    title: 'Athletic',
    icon: 'assets/images/profile/svg-icons/athletic.svg',
    order: 5,
  },
  { id: 'stats', title: 'Stats', icon: 'assets/images/profile/svg-icons/stats.svg', order: 6 },
  { id: 'awards', title: 'Awards', icon: 'assets/images/profile/svg-icons/awards.svg', order: 7 },
  {
    id: 'college-offers',
    title: 'College Offers',
    icon: 'assets/images/profile/svg-icons/offers.svg',
    order: 8,
  },
  {
    id: 'college-interests',
    title: 'College Interests',
    icon: 'assets/images/profile/svg-icons/college-interests.svg',
    order: 9,
  },
  {
    id: 'college-visits',
    title: 'College Visits',
    icon: 'assets/images/profile/svg-icons/college-visits.svg',
    order: 10,
  },
  {
    id: 'college-camps',
    title: 'College Camps',
    icon: 'assets/images/profile/svg-icons/college-camps.svg',
    order: 11,
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: 'assets/images/profile/svg-icons/schedule.svg',
    order: 12,
  },
  { id: 'events', title: 'Events', icon: 'assets/images/profile/svg-icons/events.svg', order: 13 },
] as const;

// ============================================
// COLLEGE DETAILS TYPES
// ============================================

export const COLLEGE_DETAILS_TYPES = {
  CONTACTS: 'contacts',
  SOCIALS: 'socials',
  QUESTIONNAIRE: 'Questionnaire',
  CAMPS: 'camps',
  INFO: 'info',
} as const;

export type CollegeDetailsType = (typeof COLLEGE_DETAILS_TYPES)[keyof typeof COLLEGE_DETAILS_TYPES];

// ============================================
// DISMISSED PROMPT IDS
// ============================================

export const DISMISSABLE_PROMPTS = {
  WELCOME_DIALOG: 'welcome-dialog',
  HEAR_ABOUT: 'hear-about',
  COLLEGE_CREDIT_WORKS: 'college-credit-works',
  FIRST_OPEN_CAMPAIGNS: 'first-open-campaigns',
  MEDIA_CREDIT_WORKS: 'media-credit-works',
  FEEDBACK_MODAL: 'feedback-modal',
  FIRST_CAMPAIGN: 'first-campaign',
  ONBOARDING_COMPLETE: 'onboarding-complete',
  ADD_SPORT_PROMPT: 'add-sport-prompt',
  UPGRADE_PROMPT: 'upgrade-prompt',
} as const;

export type DismissablePrompt = (typeof DISMISSABLE_PROMPTS)[keyof typeof DISMISSABLE_PROMPTS];

// ============================================
// ACCOUNT TYPES (for sport profiles)
// ============================================

export const ACCOUNT_TYPES = {
  ATHLETE: 'athlete',
  PARENT: 'parent',
  COACH: 'coach',
} as const;

export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES];

export interface AccountTypeOption {
  id: AccountType;
  label: string;
  description: string;
}

export const ACCOUNT_TYPE_OPTIONS: readonly AccountTypeOption[] = [
  { id: 'athlete', label: 'Athlete', description: 'I am the athlete' },
  { id: 'parent', label: 'Parent', description: "I'm a parent managing this profile" },
  { id: 'coach', label: 'Coach', description: 'I coach this athlete' },
] as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getRoleConfig(role: UserRole): RoleConfig | undefined {
  return ROLE_CONFIGS.find((r) => r.id === role);
}

export function getPostTypeConfig(type: PostType | 'all'): PostTypeConfig | undefined {
  return POST_TYPE_CONFIGS.find((p) => p.id === type);
}

export function getSocialPlatformConfig(
  platform: SocialPlatform
): SocialPlatformConfig | undefined {
  return SOCIAL_PLATFORM_CONFIGS.find((p) => p.id === platform);
}

export function getTeamTypeConfig(type: TeamType): TeamTypeConfig | undefined {
  return TEAM_TYPE_CONFIGS.find((t) => t.id === type);
}

export function isPromptDismissed(
  dismissedPrompts: string[],
  promptId: DismissablePrompt
): boolean {
  return dismissedPrompts.includes(promptId);
}
