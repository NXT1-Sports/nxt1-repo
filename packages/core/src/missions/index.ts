/**
 * @fileoverview Missions Module - Barrel Export
 * @module @nxt1/core/missions
 * @version 1.0.0
 */

// Types
export type {
  // User & Role types
  MissionUserRole,
  // Category types
  AthleteMissionCategory,
  CoachMissionCategory,
  MissionCategory,
  MissionCategoryConfig,
  // Mission types
  MissionStatus,
  MissionPriority,
  MissionRecurrence,
  MissionQuickAction,
  MissionReward,
  Mission,
  // Level types
  LevelId,
  LevelConfig,
  // Badge types
  BadgeId,
  BadgeRarity,
  Badge,
  EarnedBadge,
  // Streak types
  StreakStatus,
  Streak,
  // Progress types
  MissionProgress,
  CategoryProgress,
  // State & Filter types
  MissionFilter,
  MissionSortBy,
  SortDirection,
  MissionsState,
  // API response types
  MissionsResponse,
  MissionCompleteResponse,
  // Celebration types
  CelebrationType,
  CelebrationConfig,
} from './missions.types';

// Constants
export {
  // Level system
  MISSION_LEVELS,
  getLevelById,
  getLevelByXp,
  calculateLevelProgress,
  // Categories
  ATHLETE_CATEGORIES,
  COACH_CATEGORIES,
  ALL_CATEGORIES,
  getCategoryById,
  // Badges
  MISSION_BADGES,
  getBadgeById,
  // Points configuration
  POINTS_CONFIG,
  // Celebrations
  CELEBRATION_CONFIGS,
  // UI configuration
  MISSIONS_UI_CONFIG,
  // API endpoints
  MISSIONS_API_ENDPOINTS,
  // Cache configuration
  MISSIONS_CACHE_KEYS,
  MISSIONS_CACHE_TTL,
} from './missions.constants';

// API
export { createMissionsApi, type MissionsApi } from './missions.api';
