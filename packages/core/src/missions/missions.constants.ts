/**
 * @fileoverview Missions Constants
 * @module @nxt1/core/missions
 * @version 1.0.0
 *
 * Configuration constants for Missions/Tasks feature.
 * 100% portable - no platform dependencies.
 *
 * Includes:
 * - Level definitions with XP thresholds
 * - Badge configurations
 * - Category configurations for athletes and coaches
 * - Points and rewards configuration
 * - UI configuration constants
 */

import type {
  MissionCategoryConfig,
  LevelConfig,
  LevelId,
  Badge,
  BadgeId,
  MissionCategory,
  CelebrationType,
  CelebrationConfig,
} from './missions.types';

// ============================================
// LEVEL SYSTEM CONFIGURATION
// ============================================

/**
 * Level configurations with XP thresholds.
 * Progression: Rookie → Rising Star → All-Star → Elite → Legend
 */
export const MISSION_LEVELS: readonly LevelConfig[] = [
  {
    id: 'rookie',
    name: 'Rookie',
    tier: 1,
    minXp: 0,
    maxXp: 499,
    icon: 'star-outline',
    color: 'var(--nxt1-color-text-tertiary)',
    description: 'Just getting started on your recruiting journey',
  },
  {
    id: 'rising-star',
    name: 'Rising Star',
    tier: 2,
    minXp: 500,
    maxXp: 1499,
    icon: 'star-half-outline',
    color: 'var(--nxt1-color-info)',
    description: 'Building momentum and gaining visibility',
  },
  {
    id: 'all-star',
    name: 'All-Star',
    tier: 3,
    minXp: 1500,
    maxXp: 3499,
    icon: 'star',
    color: 'var(--nxt1-color-primary)',
    description: 'Standing out from the competition',
  },
  {
    id: 'elite',
    name: 'Elite',
    tier: 4,
    minXp: 3500,
    maxXp: 6999,
    icon: 'trophy-outline',
    color: 'var(--nxt1-color-warning)',
    description: 'Top-tier profile and engagement',
  },
  {
    id: 'legend',
    name: 'Legend',
    tier: 5,
    minXp: 7000,
    maxXp: Infinity,
    icon: 'trophy',
    color: 'var(--nxt1-color-secondary)',
    description: 'The pinnacle of recruiting excellence',
  },
] as const;

/**
 * Get level configuration by ID.
 */
export function getLevelById(id: LevelId): LevelConfig | undefined {
  return MISSION_LEVELS.find((level) => level.id === id);
}

/**
 * Get level configuration by XP amount.
 */
export function getLevelByXp(xp: number): LevelConfig {
  return (
    MISSION_LEVELS.find((level) => xp >= level.minXp && xp <= level.maxXp) ?? MISSION_LEVELS[0]
  );
}

/**
 * Calculate XP progress within current level (0-100).
 */
export function calculateLevelProgress(xp: number): number {
  const level = getLevelByXp(xp);
  if (level.maxXp === Infinity) return 100;
  const levelXp = xp - level.minXp;
  const levelRange = level.maxXp - level.minXp;
  return Math.round((levelXp / levelRange) * 100);
}

// ============================================
// ATHLETE CATEGORY CONFIGURATIONS
// ============================================

/**
 * Athlete mission categories.
 */
export const ATHLETE_CATEGORIES: readonly MissionCategoryConfig[] = [
  {
    id: 'profile-building',
    label: 'Profile Building',
    description: 'Build a complete, standout recruiting profile',
    icon: 'person-circle-outline',
    color: 'var(--nxt1-color-primary)',
    targetRole: 'athlete',
    order: 1,
  },
  {
    id: 'visibility-engagement',
    label: 'Visibility & Engagement',
    description: 'Get seen by coaches and stay active',
    icon: 'eye-outline',
    color: 'var(--nxt1-color-info)',
    targetRole: 'athlete',
    order: 2,
  },
  {
    id: 'recruiting-goals',
    label: 'Recruiting Goals',
    description: 'Take action on your recruiting journey',
    icon: 'flag-outline',
    color: 'var(--nxt1-color-success)',
    targetRole: 'athlete',
    order: 3,
  },
  {
    id: 'seasonal-tasks',
    label: 'Seasonal Tasks',
    description: 'Stay current with season-specific updates',
    icon: 'calendar-outline',
    color: 'var(--nxt1-color-warning)',
    targetRole: 'athlete',
    order: 4,
  },
] as const;

// ============================================
// COACH CATEGORY CONFIGURATIONS
// ============================================

/**
 * Coach mission categories.
 */
export const COACH_CATEGORIES: readonly MissionCategoryConfig[] = [
  {
    id: 'team-setup',
    label: 'Team Setup',
    description: 'Get your team page ready for recruiting',
    icon: 'people-outline',
    color: 'var(--nxt1-color-primary)',
    targetRole: 'coach',
    order: 1,
  },
  {
    id: 'supporting-athletes',
    label: 'Supporting Athletes',
    description: 'Help your athletes succeed in recruiting',
    icon: 'heart-outline',
    color: 'var(--nxt1-color-error)',
    targetRole: 'coach',
    order: 2,
  },
  {
    id: 'team-content',
    label: 'Team Content',
    description: 'Share updates and showcase your program',
    icon: 'images-outline',
    color: 'var(--nxt1-color-info)',
    targetRole: 'coach',
    order: 3,
  },
  {
    id: 'recruiting-support',
    label: 'Recruiting Support',
    description: 'Connect athletes with college opportunities',
    icon: 'school-outline',
    color: 'var(--nxt1-color-success)',
    targetRole: 'coach',
    order: 4,
  },
  {
    id: 'professional-development',
    label: 'Professional Development',
    description: 'Grow as a coach and mentor',
    icon: 'ribbon-outline',
    color: 'var(--nxt1-color-warning)',
    targetRole: 'coach',
    order: 5,
  },
] as const;

/**
 * All categories combined (for type-safe lookups).
 */
export const ALL_CATEGORIES: readonly MissionCategoryConfig[] = [
  ...ATHLETE_CATEGORIES,
  ...COACH_CATEGORIES,
] as const;

/**
 * Get category configuration by ID.
 */
export function getCategoryById(id: MissionCategory): MissionCategoryConfig | undefined {
  return ALL_CATEGORIES.find((cat) => cat.id === id);
}

// ============================================
// BADGE CONFIGURATIONS
// ============================================

/**
 * All badge definitions.
 */
export const MISSION_BADGES: Record<BadgeId, Badge> = {
  // Profile badges
  'profile-pro': {
    id: 'profile-pro',
    name: 'Profile Pro',
    description: 'Completed all profile building tasks',
    criteria: 'Complete 100% of Profile Building missions',
    icon: 'person-circle',
    color: 'var(--nxt1-color-primary)',
    rarity: 'uncommon',
    points: 100,
  },
  'media-master': {
    id: 'media-master',
    name: 'Media Master',
    description: 'Uploaded outstanding media content',
    criteria: 'Upload 5+ highlight videos and 10+ photos',
    icon: 'videocam',
    color: 'var(--nxt1-color-info)',
    rarity: 'rare',
    points: 150,
  },
  'stat-tracker': {
    id: 'stat-tracker',
    name: 'Stat Tracker',
    description: 'Comprehensive athletic statistics',
    criteria: 'Complete all athletic metrics and season stats',
    icon: 'stats-chart',
    color: 'var(--nxt1-color-success)',
    rarity: 'uncommon',
    points: 75,
  },
  verified: {
    id: 'verified',
    name: 'Verified',
    description: 'Identity and credentials verified',
    criteria: 'Complete verification process',
    icon: 'shield-checkmark',
    color: 'var(--nxt1-color-primary)',
    rarity: 'rare',
    points: 200,
  },

  // Team badges
  'team-builder': {
    id: 'team-builder',
    name: 'Team Builder',
    description: 'Built a complete team profile',
    criteria: 'Complete all Team Setup missions',
    icon: 'people',
    color: 'var(--nxt1-color-primary)',
    rarity: 'uncommon',
    points: 100,
  },
  'roster-champion': {
    id: 'roster-champion',
    name: 'Roster Champion',
    description: 'Managing a full active roster',
    criteria: 'Add 15+ athletes to your roster',
    icon: 'list',
    color: 'var(--nxt1-color-info)',
    rarity: 'rare',
    points: 150,
  },

  // Engagement badges
  'social-butterfly': {
    id: 'social-butterfly',
    name: 'Social Butterfly',
    description: 'Highly engaged community member',
    criteria: 'Like and comment on 50+ posts',
    icon: 'chatbubbles',
    color: 'var(--nxt1-color-info)',
    rarity: 'uncommon',
    points: 75,
  },
  'content-creator': {
    id: 'content-creator',
    name: 'Content Creator',
    description: 'Consistently sharing quality content',
    criteria: 'Post 20+ updates with photos or videos',
    icon: 'create',
    color: 'var(--nxt1-color-primary)',
    rarity: 'rare',
    points: 125,
  },
  'community-star': {
    id: 'community-star',
    name: 'Community Star',
    description: 'Valued community contributor',
    criteria: 'Receive 100+ likes on your posts',
    icon: 'star',
    color: 'var(--nxt1-color-warning)',
    rarity: 'rare',
    points: 150,
  },

  // Recruiting badges
  'recruit-ready': {
    id: 'recruit-ready',
    name: 'Recruit Ready',
    description: 'Fully prepared for recruiting',
    criteria: 'Complete NCAA eligibility checklist',
    icon: 'checkmark-circle',
    color: 'var(--nxt1-color-success)',
    rarity: 'uncommon',
    points: 100,
  },
  'college-connector': {
    id: 'college-connector',
    name: 'College Connector',
    description: 'Actively connecting with programs',
    criteria: 'Follow 20+ college programs',
    icon: 'school',
    color: 'var(--nxt1-color-info)',
    rarity: 'uncommon',
    points: 75,
  },

  // Coach badges
  mentor: {
    id: 'mentor',
    name: 'Mentor',
    description: 'Dedicated to athlete development',
    criteria: 'Write recommendations for 5+ athletes',
    icon: 'heart',
    color: 'var(--nxt1-color-error)',
    rarity: 'rare',
    points: 150,
  },
  'athlete-advocate': {
    id: 'athlete-advocate',
    name: 'Athlete Advocate',
    description: 'Champion of athlete success',
    criteria: 'Help 10+ athletes connect with colleges',
    icon: 'megaphone',
    color: 'var(--nxt1-color-primary)',
    rarity: 'epic',
    points: 200,
  },
  'certified-coach': {
    id: 'certified-coach',
    name: 'Certified Coach',
    description: 'NXT1 certified recruiting coach',
    criteria: 'Complete coach certification program',
    icon: 'ribbon',
    color: 'var(--nxt1-color-secondary)',
    rarity: 'epic',
    points: 250,
  },

  // Streak badges
  'streak-starter': {
    id: 'streak-starter',
    name: 'Streak Starter',
    description: 'Building consistency',
    criteria: 'Maintain a 7-day streak',
    icon: 'flame-outline',
    color: 'var(--nxt1-color-warning)',
    rarity: 'common',
    points: 50,
  },
  'streak-champion': {
    id: 'streak-champion',
    name: 'Streak Champion',
    description: 'Impressive dedication',
    criteria: 'Maintain a 30-day streak',
    icon: 'flame',
    color: 'var(--nxt1-color-warning)',
    rarity: 'rare',
    points: 150,
  },
  'streak-legend': {
    id: 'streak-legend',
    name: 'Streak Legend',
    description: 'Unstoppable commitment',
    criteria: 'Maintain a 100-day streak',
    icon: 'bonfire',
    color: 'var(--nxt1-color-error)',
    rarity: 'legendary',
    points: 500,
  },

  // Special badges
  'early-adopter': {
    id: 'early-adopter',
    name: 'Early Adopter',
    description: 'Among the first to embrace missions',
    criteria: 'Complete missions within first month of launch',
    icon: 'rocket',
    color: 'var(--nxt1-color-primary)',
    rarity: 'rare',
    points: 100,
  },
  'first-completion': {
    id: 'first-completion',
    name: 'First Steps',
    description: 'Completed your first mission',
    criteria: 'Complete any mission',
    icon: 'footsteps',
    color: 'var(--nxt1-color-success)',
    rarity: 'common',
    points: 25,
  },
} as const;

/**
 * Get badge by ID.
 */
export function getBadgeById(id: BadgeId): Badge | undefined {
  return MISSION_BADGES[id];
}

// ============================================
// POINTS & REWARDS CONFIGURATION
// ============================================

/**
 * Points configuration.
 */
export const POINTS_CONFIG = {
  /** Base points for task completion by priority */
  BASE_POINTS: {
    low: 10,
    normal: 25,
    high: 50,
    critical: 100,
  },
  /** Streak bonus configuration */
  STREAK_BONUS: {
    /** Days before streak bonus kicks in */
    minDays: 3,
    /** Points per day after minDays */
    pointsPerDay: 5,
    /** Maximum streak bonus */
    maxBonus: 50,
    /** Multiplier tiers */
    multipliers: {
      7: 1.1, // 10% bonus after 7 days
      14: 1.25, // 25% bonus after 14 days
      30: 1.5, // 50% bonus after 30 days
      60: 2.0, // 100% bonus after 60 days
    },
  },
  /** XP per point earned */
  XP_PER_POINT: 1,
  /** Bonus XP for first-time completion */
  FIRST_COMPLETION_BONUS: 50,
} as const;

// ============================================
// CELEBRATION CONFIGURATIONS
// ============================================

/**
 * Celebration configs by type.
 */
export const CELEBRATION_CONFIGS: Record<CelebrationType, CelebrationConfig> = {
  confetti: {
    type: 'confetti',
    duration: 3000,
    color: 'var(--nxt1-color-primary)',
    haptic: true,
  },
  sparkles: {
    type: 'sparkles',
    duration: 1500,
    color: 'var(--nxt1-color-primary)',
    haptic: true,
  },
  fireworks: {
    type: 'fireworks',
    duration: 4000,
    color: 'var(--nxt1-color-secondary)',
    haptic: true,
  },
  'level-up': {
    type: 'level-up',
    duration: 5000,
    color: 'var(--nxt1-color-warning)',
    secondaryColor: 'var(--nxt1-color-primary)',
    haptic: true,
  },
  badge: {
    type: 'badge',
    duration: 3000,
    color: 'var(--nxt1-color-primary)',
    haptic: true,
  },
  streak: {
    type: 'streak',
    duration: 2500,
    color: 'var(--nxt1-color-warning)',
    haptic: true,
  },
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

/**
 * UI configuration constants.
 */
export const MISSIONS_UI_CONFIG = {
  /** Animation durations (ms) */
  ANIMATION: {
    checkboxComplete: 400,
    progressRing: 600,
    cardExpand: 250,
    badgeReveal: 800,
    levelUp: 1200,
  },
  /** Empty state messages */
  EMPTY_STATES: {
    all: {
      icon: 'rocket-outline',
      title: "You're all caught up!",
      description: 'Check back soon for new missions to complete on your recruiting journey.',
    },
    completed: {
      icon: 'trophy-outline',
      title: 'Mission accomplished!',
      description: "You've completed all available missions. New challenges coming soon!",
    },
  },
  /** Default expanded category (first one) */
  DEFAULT_EXPANDED: null,
  /** Show social proof threshold (percentage) */
  SOCIAL_PROOF_THRESHOLD: 50,
  /** Progress ring sizes */
  PROGRESS_RING: {
    small: 60,
    medium: 100,
    large: 140,
  },
} as const;

// ============================================
// API ENDPOINTS
// ============================================

/**
 * API endpoints for missions.
 */
export const MISSIONS_API_ENDPOINTS = {
  /** Get all missions for user */
  MISSIONS: '/api/v1/missions',
  /** Get user progress */
  PROGRESS: '/api/v1/missions/progress',
  /** Complete a mission */
  COMPLETE: '/api/v1/missions/:id/complete',
  /** Get badges */
  BADGES: '/api/v1/missions/badges',
  /** Get leaderboard (optional) */
  LEADERBOARD: '/api/v1/missions/leaderboard',
} as const;

// ============================================
// CACHE CONFIGURATION
// ============================================

/**
 * Cache keys for missions data.
 */
export const MISSIONS_CACHE_KEYS = {
  MISSIONS: 'missions:list',
  PROGRESS: 'missions:progress',
  BADGES: 'missions:badges',
} as const;

/**
 * Cache TTL values (milliseconds).
 */
export const MISSIONS_CACHE_TTL = {
  /** Missions list - refresh frequently */
  MISSIONS: 5 * 60 * 1000, // 5 minutes
  /** Progress - moderate refresh */
  PROGRESS: 2 * 60 * 1000, // 2 minutes
  /** Badges - longer cache */
  BADGES: 30 * 60 * 1000, // 30 minutes
} as const;
