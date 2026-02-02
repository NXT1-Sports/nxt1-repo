/**
 * @fileoverview Missions Service - Shared State Management
 * @module @nxt1/ui/missions
 * @version 1.0.0
 *
 * Signal-based state management for Missions feature.
 * Shared between web and mobile applications.
 *
 * Features:
 * - Reactive state with Angular signals
 * - Category-based mission grouping
 * - Progress tracking with XP/levels
 * - Badge and streak management
 * - Mission completion with celebrations
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class MissionsPageComponent {
 *   private readonly missions = inject(MissionsService);
 *
 *   readonly progress = this.missions.progress;
 *   readonly categories = this.missions.categories;
 *   readonly isLoading = this.missions.isLoading;
 *
 *   async onMissionComplete(id: string): Promise<void> {
 *     await this.missions.completeMission(id);
 *   }
 * }
 * ```
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  type Mission,
  type MissionProgress,
  type MissionCategoryConfig,
  type MissionCategory,
  type MissionUserRole,
  type MissionFilter,
  type CelebrationConfig,
  CELEBRATION_CONFIGS,
} from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
// ⚠️ TEMPORARY: Mock data for development (remove when backend is ready)
import { getMockMissions, getMockProgress, getMockCategories } from './missions.mock-data';

/**
 * Missions state management service.
 * Provides reactive state for the missions/tasks interface.
 */
@Injectable({ providedIn: 'root' })
export class MissionsService {
  // ⚠️ TEMPORARY: API service commented out - using mock data
  // private readonly api = inject(MissionsApiService);
  private readonly haptics = inject(HapticsService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('MissionsService');

  // ============================================
  // PRIVATE WRITEABLE SIGNALS
  // ============================================

  private readonly _missions = signal<Mission[]>([]);
  private readonly _progress = signal<MissionProgress | null>(null);
  private readonly _categories = signal<readonly MissionCategoryConfig[]>([]);
  private readonly _userRole = signal<MissionUserRole>('athlete');
  private readonly _expandedCategory = signal<MissionCategory | null>(null);
  private readonly _filter = signal<MissionFilter>({});
  private readonly _isLoading = signal(false);
  private readonly _isCompletingMission = signal<string | null>(null);
  private readonly _error = signal<string | null>(null);
  private readonly _celebration = signal<CelebrationConfig | null>(null);

  // ============================================
  // PUBLIC READONLY COMPUTED SIGNALS
  // ============================================

  /** All missions for the user */
  readonly missions = computed(() => this._missions());

  /** User's progress data */
  readonly progress = computed(() => this._progress());

  /** Available categories for user's role */
  readonly categories = computed(() => this._categories());

  /** Current user role */
  readonly userRole = computed(() => this._userRole());

  /** Currently expanded category */
  readonly expandedCategory = computed(() => this._expandedCategory());

  /** Active filter */
  readonly filter = computed(() => this._filter());

  /** Whether initial load is in progress */
  readonly isLoading = computed(() => this._isLoading());

  /** Mission ID currently being completed */
  readonly isCompletingMission = computed(() => this._isCompletingMission());

  /** Current error message */
  readonly error = computed(() => this._error());

  /** Active celebration config */
  readonly celebration = computed(() => this._celebration());

  /** Featured missions (recommended) */
  readonly featuredMissions = computed(() => {
    return this._missions().filter(
      (m) => m.featured && m.status !== 'completed' && m.status !== 'locked'
    );
  });

  /** Missions grouped by category */
  readonly missionsByCategory = computed(() => {
    const missions = this._missions();
    const categories = this._categories();

    return categories.map((category) => ({
      ...category,
      missions: missions.filter((m) => m.category === category.id),
      completedCount: missions.filter((m) => m.category === category.id && m.status === 'completed')
        .length,
      totalCount: missions.filter((m) => m.category === category.id).length,
    }));
  });

  /** Available (actionable) missions count */
  readonly availableMissionsCount = computed(() => {
    return this._missions().filter((m) => m.status === 'available' || m.status === 'in-progress')
      .length;
  });

  /** Completed missions count */
  readonly completedMissionsCount = computed(() => {
    return this._missions().filter((m) => m.status === 'completed').length;
  });

  /** Total points possible */
  readonly totalPointsPossible = computed(() => {
    return this._missions().reduce((sum, m) => sum + m.reward.points, 0);
  });

  /** Current level progress percentage */
  readonly levelProgress = computed(() => {
    const progress = this._progress();
    if (!progress) return 0;

    const level = progress.level;
    if (level.maxXp === Infinity) return 100;

    const levelXp = progress.currentXp - level.minXp;
    const levelRange = level.maxXp - level.minXp;
    return Math.round((levelXp / levelRange) * 100);
  });

  /** Whether streak is at risk */
  readonly isStreakAtRisk = computed(() => {
    const progress = this._progress();
    return progress?.streak.status === 'at-risk';
  });

  /** New badges count */
  readonly newBadgesCount = computed(() => {
    const progress = this._progress();
    if (!progress) return 0;
    return progress.badges.filter((b) => b.isNew).length;
  });

  // ============================================
  // PUBLIC METHODS
  // ============================================

  /**
   * Load missions for a user role.
   * @param role - User role (athlete or coach)
   */
  async loadMissions(role: MissionUserRole): Promise<void> {
    this._userRole.set(role);
    this._missions.set([]);
    this._progress.set(null);
    this._categories.set([]);
    this._error.set(null);
    this._isLoading.set(true);

    this.logger.debug('Loading missions', { role });

    // ⚠️ TEMPORARY: Using mock data instead of API call
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 400));

      const missions = getMockMissions(role);
      const progress = getMockProgress(role);
      const categories = getMockCategories(role);

      this._missions.set(missions);
      this._progress.set(progress);
      this._categories.set(categories);

      // Auto-expand first category if none expanded
      if (categories.length > 0 && !this._expandedCategory()) {
        this._expandedCategory.set(categories[0].id);
      }

      await this.haptics.impact('light');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load missions';
      this._error.set(message);
      this.logger.error('Failed to load missions', err, { role });
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Refresh missions data.
   */
  async refresh(): Promise<void> {
    const role = this._userRole();
    await this.loadMissions(role);
  }

  /**
   * Toggle category expansion.
   * @param category - Category to toggle
   */
  toggleCategory(category: MissionCategory): void {
    const current = this._expandedCategory();
    this._expandedCategory.set(current === category ? null : category);
    this.haptics.impact('light');
  }

  /**
   * Expand a specific category.
   * @param category - Category to expand
   */
  expandCategory(category: MissionCategory): void {
    this._expandedCategory.set(category);
  }

  /**
   * Collapse all categories.
   */
  collapseAllCategories(): void {
    this._expandedCategory.set(null);
  }

  /**
   * Complete a mission.
   * @param missionId - Mission ID to complete
   */
  async completeMission(missionId: string): Promise<boolean> {
    const mission = this._missions().find((m) => m.id === missionId);
    if (!mission || mission.status === 'completed' || mission.status === 'locked') {
      return false;
    }

    this._isCompletingMission.set(missionId);
    this._error.set(null);

    try {
      // ⚠️ TEMPORARY: Simulated completion
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Update mission status
      this._missions.update((missions) =>
        missions.map((m) =>
          m.id === missionId
            ? { ...m, status: 'completed' as const, completedAt: new Date().toISOString() }
            : m
        )
      );

      // Update progress
      const currentProgress = this._progress();
      if (currentProgress) {
        const newPoints = currentProgress.totalPoints + mission.reward.points;
        const newXp = currentProgress.currentXp + mission.reward.xp;
        const newCompleted = currentProgress.missionsCompleted + 1;

        this._progress.set({
          ...currentProgress,
          totalPoints: newPoints,
          currentXp: newXp,
          missionsCompleted: newCompleted,
          completionPercentage: Math.round((newCompleted / currentProgress.totalMissions) * 100),
        });
      }

      // Trigger celebration
      await this.triggerCelebration(mission);

      this.toast.success(`+${mission.reward.points} points earned!`);
      this.logger.info('Mission completed', { missionId, points: mission.reward.points });

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to complete mission';
      this._error.set(message);
      this.toast.error(message);
      this.logger.error('Failed to complete mission', err, { missionId });
      return false;
    } finally {
      this._isCompletingMission.set(null);
    }
  }

  /**
   * Set filter options.
   * @param filter - Filter configuration
   */
  setFilter(filter: MissionFilter): void {
    this._filter.set(filter);
  }

  /**
   * Clear all filters.
   */
  clearFilter(): void {
    this._filter.set({});
  }

  /**
   * Get missions for a specific category.
   * @param category - Category ID
   */
  getMissionsForCategory(category: MissionCategory): Mission[] {
    return this._missions().filter((m) => m.category === category);
  }

  /**
   * Get category progress.
   * @param category - Category ID
   */
  getCategoryProgress(category: MissionCategory): {
    completed: number;
    total: number;
    percentage: number;
  } {
    const missions = this.getMissionsForCategory(category);
    const completed = missions.filter((m) => m.status === 'completed').length;
    const total = missions.length;
    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  /**
   * Clear celebration.
   */
  clearCelebration(): void {
    this._celebration.set(null);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /**
   * Trigger celebration animation.
   */
  private async triggerCelebration(mission: Mission): Promise<void> {
    // Determine celebration type based on mission
    let celebrationType: keyof typeof CELEBRATION_CONFIGS = 'confetti';

    if (mission.reward.badgeId) {
      celebrationType = 'badge';
    } else if (mission.priority === 'critical') {
      celebrationType = 'fireworks';
    } else if (mission.priority === 'high') {
      celebrationType = 'confetti';
    } else {
      celebrationType = 'sparkles';
    }

    const config = CELEBRATION_CONFIGS[celebrationType];
    this._celebration.set(config);

    // Haptic feedback
    if (config.haptic) {
      await this.haptics.notification('success');
    }

    // Auto-clear celebration after duration
    setTimeout(() => {
      this.clearCelebration();
    }, config.duration);
  }
}
