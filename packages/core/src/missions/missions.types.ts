/**
 * @fileoverview Missions Type Definitions
 * @module @nxt1/core/missions
 * @version 1.0.0
 *
 * Pure TypeScript type definitions for Missions/Tasks feature.
 * 100% portable - works on web, mobile, and backend.
 *
 * This feature provides gamified task tracking for athletes and coaches
 * with points, levels, badges, and streaks to encourage engagement.
 */

// ============================================
// USER ROLE TYPES (for mission targeting)
// ============================================

/**
 * User roles that missions can target.
 * Determines which missions are shown to each user type.
 */
export type MissionUserRole = 'athlete' | 'coach' | 'all';

// ============================================
// MISSION CATEGORY TYPES
// ============================================

/**
 * Mission category identifiers for athletes.
 */
export type AthleteMissionCategory =
  | 'profile-building'
  | 'visibility-engagement'
  | 'recruiting-goals'
  | 'seasonal-tasks';

/**
 * Mission category identifiers for coaches.
 */
export type CoachMissionCategory =
  | 'team-setup'
  | 'supporting-athletes'
  | 'team-content'
  | 'recruiting-support'
  | 'professional-development';

/**
 * Combined mission category type.
 */
export type MissionCategory = AthleteMissionCategory | CoachMissionCategory;

/**
 * Configuration for a mission category.
 */
export interface MissionCategoryConfig {
  /** Unique category identifier */
  readonly id: MissionCategory;
  /** Display label */
  readonly label: string;
  /** Category description */
  readonly description: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Color for category (CSS variable) */
  readonly color: string;
  /** Target user role */
  readonly targetRole: MissionUserRole;
  /** Display order */
  readonly order: number;
}

// ============================================
// MISSION STATUS & PRIORITY
// ============================================

/**
 * Mission completion status.
 */
export type MissionStatus =
  | 'locked' // Not yet available
  | 'available' // Ready to complete
  | 'in-progress' // Started but not finished
  | 'completed' // Successfully completed
  | 'expired'; // Time limit passed

/**
 * Mission priority level.
 */
export type MissionPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Mission recurrence type.
 */
export type MissionRecurrence =
  | 'once' // One-time task
  | 'daily' // Resets daily
  | 'weekly' // Resets weekly
  | 'seasonal' // Resets each season
  | 'event'; // Event-based

// ============================================
// MISSION ITEM TYPES
// ============================================

/**
 * Quick action configuration for navigation.
 */
export interface MissionQuickAction {
  /** Action label */
  readonly label: string;
  /** Navigation route */
  readonly route: string;
  /** Query params (optional) */
  readonly queryParams?: Record<string, string>;
  /** Icon name (optional) */
  readonly icon?: string;
}

/**
 * Reward configuration for completing a mission.
 */
export interface MissionReward {
  /** Points earned */
  readonly points: number;
  /** Bonus points (streak, first-time, etc.) */
  readonly bonusPoints?: number;
  /** Badge earned (optional) */
  readonly badgeId?: string;
  /** Experience points for leveling */
  readonly xp: number;
}

/**
 * Single mission item.
 */
export interface Mission {
  /** Unique mission identifier */
  readonly id: string;
  /** Mission category */
  readonly category: MissionCategory;
  /** Target user role */
  readonly targetRole: MissionUserRole;
  /** Mission title */
  readonly title: string;
  /** Detailed description */
  readonly description: string;
  /** Short hint/tip */
  readonly hint?: string;
  /** Current status */
  readonly status: MissionStatus;
  /** Priority level */
  readonly priority: MissionPriority;
  /** Recurrence type */
  readonly recurrence: MissionRecurrence;
  /** Ionicons icon name */
  readonly icon: string;
  /** Reward configuration */
  readonly reward: MissionReward;
  /** Quick action for navigation */
  readonly quickAction?: MissionQuickAction;
  /** Estimated completion time (minutes) */
  readonly estimatedMinutes?: number;
  /** Social proof message (e.g., "85% of coaches complete this") */
  readonly socialProof?: string;
  /** Deadline/expiration timestamp */
  readonly expiresAt?: string;
  /** Whether this is a featured/recommended mission */
  readonly featured?: boolean;
  /** Order within category */
  readonly order: number;
  /** Completion progress (0-100 for multi-step) */
  readonly progress?: number;
  /** Required missions to unlock */
  readonly prerequisites?: readonly string[];
  /** Timestamp when completed */
  readonly completedAt?: string;
}

// ============================================
// LEVEL & XP SYSTEM
// ============================================

/**
 * User level identifiers.
 */
export type LevelId = 'rookie' | 'rising-star' | 'all-star' | 'elite' | 'legend';

/**
 * Level configuration.
 */
export interface LevelConfig {
  /** Unique level identifier */
  readonly id: LevelId;
  /** Display name */
  readonly name: string;
  /** Level number (1-5) */
  readonly tier: number;
  /** Minimum XP required */
  readonly minXp: number;
  /** Maximum XP for this level */
  readonly maxXp: number;
  /** Ionicons icon name */
  readonly icon: string;
  /** Level color (CSS variable) */
  readonly color: string;
  /** Description */
  readonly description: string;
}

// ============================================
// BADGE SYSTEM
// ============================================

/**
 * Badge type identifiers.
 */
export type BadgeId =
  // Profile badges
  | 'profile-pro'
  | 'media-master'
  | 'stat-tracker'
  | 'verified'
  // Team badges
  | 'team-builder'
  | 'roster-champion'
  // Engagement badges
  | 'social-butterfly'
  | 'content-creator'
  | 'community-star'
  // Recruiting badges
  | 'recruit-ready'
  | 'college-connector'
  // Coach badges
  | 'mentor'
  | 'athlete-advocate'
  | 'certified-coach'
  // Streak badges
  | 'streak-starter'
  | 'streak-champion'
  | 'streak-legend'
  // Special badges
  | 'early-adopter'
  | 'first-completion';

/**
 * Badge rarity levels.
 */
export type BadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * Badge configuration.
 */
export interface Badge {
  /** Unique badge identifier */
  readonly id: BadgeId;
  /** Display name */
  readonly name: string;
  /** Badge description */
  readonly description: string;
  /** How to earn this badge */
  readonly criteria: string;
  /** Ionicons icon name */
  readonly icon: string;
  /** Badge color (CSS variable) */
  readonly color: string;
  /** Rarity level */
  readonly rarity: BadgeRarity;
  /** Points awarded when earned */
  readonly points: number;
}

/**
 * Earned badge instance.
 */
export interface EarnedBadge extends Badge {
  /** When the badge was earned */
  readonly earnedAt: string;
  /** Whether the badge is new (unviewed) */
  readonly isNew?: boolean;
}

// ============================================
// STREAK SYSTEM
// ============================================

/**
 * Streak status.
 */
export type StreakStatus = 'active' | 'at-risk' | 'broken';

/**
 * User streak data.
 */
export interface Streak {
  /** Current streak count (days) */
  readonly current: number;
  /** Longest streak achieved */
  readonly longest: number;
  /** Last activity timestamp */
  readonly lastActivityAt: string;
  /** Current streak status */
  readonly status: StreakStatus;
  /** Hours until streak expires */
  readonly expiresInHours?: number;
  /** Bonus multiplier for streak */
  readonly bonusMultiplier: number;
}

// ============================================
// USER PROGRESS
// ============================================

/**
 * User's overall mission progress.
 */
export interface MissionProgress {
  /** User ID */
  readonly userId: string;
  /** User role */
  readonly role: MissionUserRole;
  /** Total points earned */
  readonly totalPoints: number;
  /** Current XP */
  readonly currentXp: number;
  /** XP needed for next level */
  readonly xpToNextLevel: number;
  /** Current level */
  readonly level: LevelConfig;
  /** Overall completion percentage (0-100) */
  readonly completionPercentage: number;
  /** Profile strength score (0-100) */
  readonly profileStrength: number;
  /** Total missions completed */
  readonly missionsCompleted: number;
  /** Total missions available */
  readonly totalMissions: number;
  /** Current streak */
  readonly streak: Streak;
  /** Earned badges */
  readonly badges: readonly EarnedBadge[];
  /** Completion per category */
  readonly categoryProgress: Record<MissionCategory, CategoryProgress>;
}

/**
 * Progress for a specific category.
 */
export interface CategoryProgress {
  /** Category identifier */
  readonly category: MissionCategory;
  /** Completed missions in category */
  readonly completed: number;
  /** Total missions in category */
  readonly total: number;
  /** Completion percentage (0-100) */
  readonly percentage: number;
  /** Points earned from this category */
  readonly pointsEarned: number;
}

// ============================================
// STATE & FILTER TYPES
// ============================================

/**
 * Filter options for missions.
 */
export interface MissionFilter {
  /** Filter by category */
  readonly category?: MissionCategory;
  /** Filter by status */
  readonly status?: MissionStatus | readonly MissionStatus[];
  /** Filter by priority */
  readonly priority?: MissionPriority;
  /** Filter by recurrence */
  readonly recurrence?: MissionRecurrence;
  /** Show featured only */
  readonly featured?: boolean;
  /** Text search */
  readonly search?: string;
}

/**
 * Sort options for missions.
 */
export type MissionSortBy =
  | 'priority'
  | 'points'
  | 'estimated-time'
  | 'expiration'
  | 'category'
  | 'status';

/**
 * Sort direction.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Complete missions state.
 */
export interface MissionsState {
  /** All missions for the user */
  readonly missions: readonly Mission[];
  /** User's progress */
  readonly progress: MissionProgress | null;
  /** Available categories */
  readonly categories: readonly MissionCategoryConfig[];
  /** Currently expanded category */
  readonly expandedCategory: MissionCategory | null;
  /** Active filter */
  readonly filter: MissionFilter;
  /** Sort configuration */
  readonly sortBy: MissionSortBy;
  /** Sort direction */
  readonly sortDirection: SortDirection;
  /** Loading state */
  readonly isLoading: boolean;
  /** Error message */
  readonly error: string | null;
}

// ============================================
// API RESPONSE TYPES
// ============================================

/**
 * Response for fetching missions.
 */
export interface MissionsResponse {
  /** Success indicator */
  readonly success: boolean;
  /** Mission items */
  readonly data?: {
    readonly missions: readonly Mission[];
    readonly progress: MissionProgress;
    readonly categories: readonly MissionCategoryConfig[];
  };
  /** Error message */
  readonly error?: string;
}

/**
 * Response for completing a mission.
 */
export interface MissionCompleteResponse {
  /** Success indicator */
  readonly success: boolean;
  /** Updated mission */
  readonly data?: {
    readonly mission: Mission;
    readonly rewards: MissionReward;
    readonly newBadges?: readonly Badge[];
    readonly levelUp?: LevelConfig;
    readonly newStreak?: Streak;
    readonly updatedProgress: MissionProgress;
  };
  /** Error message */
  readonly error?: string;
}

// ============================================
// CELEBRATION TYPES
// ============================================

/**
 * Celebration animation types.
 */
export type CelebrationType =
  | 'confetti' // Standard confetti
  | 'sparkles' // Subtle sparkles
  | 'fireworks' // Big achievement
  | 'level-up' // Level promotion
  | 'badge' // Badge earned
  | 'streak'; // Streak milestone

/**
 * Celebration configuration.
 */
export interface CelebrationConfig {
  /** Animation type */
  readonly type: CelebrationType;
  /** Duration in milliseconds */
  readonly duration: number;
  /** Primary color */
  readonly color?: string;
  /** Secondary color */
  readonly secondaryColor?: string;
  /** Whether to trigger haptic feedback */
  readonly haptic?: boolean;
  /** Sound effect ID (optional) */
  readonly sound?: string;
}
