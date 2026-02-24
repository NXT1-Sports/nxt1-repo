/**
 * @fileoverview XP Shell Component — Web (Zero Ionic)
 * @module @nxt1/ui/xp/web
 * @version 2.0.0
 *
 * Web-optimized XP (gamified tasks) shell using design token CSS.
 * 100% SSR-safe with semantic HTML. Zero Ionic components at shell level —
 * pure Angular + design tokens.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS shell, SSR-optimized ⭐
 *
 * For mobile app, use XpShellComponent (Ionic variant) instead.
 *
 * Layout follows the established usage/explore/analytics pattern:
 * - `.xp-main` — background only, NO padding
 * - `.xp-dashboard` — padding container (matches `.usage-dashboard`)
 * - Desktop page header INSIDE `.xp-dashboard`
 *
 * Re-uses existing sub-components (XpProgressComponent, XpCategoryComponent,
 * XpItemComponent, XpBadgeGridComponent, XpSkeletonComponent) which are
 * already cross-platform safe.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Mission, MissionUserRole, MissionCategory, MissionQuickAction } from '@nxt1/core';
import { NxtPageHeaderComponent } from '../../components/page-header';
import { NxtDesktopPageHeaderComponent } from '../../components/desktop-page-header';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { HapticsService } from '../../services/haptics/haptics.service';
import { XpService } from '../xp.service';
import { XpProgressComponent } from '../xp-progress.component';
import { XpCategoryComponent } from '../xp-category.component';
import { XpItemComponent } from '../xp-item.component';
import { XpBadgeGridComponent } from '../xp-badge.component';
import { XpSkeletonComponent } from '../xp-skeleton.component';
import { NxtXpEconomyRewardsComponent } from '../xp-economy-rewards.component';
import { NxtXpArenaLeaderboardComponent } from '../xp-arena-leaderboard.component';

@Component({
  selector: 'nxt1-xp-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtPageHeaderComponent,
    NxtDesktopPageHeaderComponent,
    XpProgressComponent,
    XpCategoryComponent,
    XpItemComponent,
    XpBadgeGridComponent,
    XpSkeletonComponent,
    NxtXpEconomyRewardsComponent,
    NxtXpArenaLeaderboardComponent,
  ],
  template: `
    <!-- Page Header (hidden on desktop when sidebar provides navigation) -->
    @if (!hideHeader()) {
      <nxt1-page-header
        title="XP"
        [avatarSrc]="avatarSrc()"
        [avatarName]="avatarName()"
        [showBack]="showBack()"
        (avatarClick)="avatarClick.emit()"
        (backClick)="back.emit()"
      />
    }

    <!-- Main Content Area (semantic, SSR-safe) -->
    <main class="xp-main" role="main">
      <div class="xp-dashboard">
        <!-- Desktop Page Header (visible when sidebar provides navigation) -->
        @if (hideHeader()) {
          <nxt1-desktop-page-header [title]="'XP'" [subtitle]="headerSubtitle()" />
        }

        <!-- Streak Banner -->
        @if (streakDays() > 0) {
          <div class="xp-streak-banner" role="status">
            <!-- Flame SVG -->
            <svg class="streak-icon" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 23c-3.866 0-7-3.134-7-7 0-2.485 1.394-4.737 2.667-6.411C9.06 7.751 10.379 6.3 11.2 4.8c.2-.366.7-.366.9 0 .51.934 1.265 1.952 2.133 2.989C15.606 9.263 17 11.515 17 14c0 2.761-2.239 5-5 5zm0-2c1.657 0 3-1.343 3-3 0-1.302-.838-2.632-1.8-3.8-.338-.41-.677-.778-.95-1.08-.273.302-.612.67-.95 1.08C10.338 15.368 9.5 16.698 9.5 18c0 1.657 1.343 3 3 3z"
              />
            </svg>
            <span>{{ streakDays() }} day streak!</span>
          </div>
        }

        @if (isLoading()) {
          <!-- Loading Skeleton -->
          <nxt1-xp-skeleton [showProgress]="true" />
        } @else {
          <!-- Progress Section -->
          <section class="xp-progress-section" aria-label="XP progress">
            <nxt1-xp-progress [progress]="progress()" size="large" />

            <!-- Quick Stats -->
            <div class="xp-quick-stats">
              <div class="stat-item">
                <span class="stat-value">{{ completedToday() }}</span>
                <span class="stat-label">Today</span>
              </div>
              <div class="stat-divider" aria-hidden="true"></div>
              <div class="stat-item">
                <span class="stat-value">{{ totalCompleted() }}</span>
                <span class="stat-label">Completed</span>
              </div>
              <div class="stat-divider" aria-hidden="true"></div>
              <div class="stat-item">
                <span class="stat-value">{{ totalAvailable() }}</span>
                <span class="stat-label">Available</span>
              </div>
            </div>
          </section>

          <!-- Featured Task -->
          @if (featuredMission()) {
            <section class="featured-section" aria-label="Featured task">
              <h2 class="section-title">
                <!-- Trophy SVG -->
                <svg
                  class="section-title-icon section-title-icon--trophy"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    d="M7 4V2h10v2h3a1 1 0 011 1v3c0 2.21-1.79 4-4 4h-.535A6.003 6.003 0 0113 15.917V18h3v2H8v-2h3v-2.083A6.003 6.003 0 017.535 12H7c-2.21 0-4-1.79-4-4V5a1 1 0 011-1h3zm0 2H5v2c0 1.105.895 2 2 2h.341A6.024 6.024 0 017 8V6zm10 0v2c0 .706-.117 1.386-.341 2H17c1.105 0 2-.895 2-2V6h-2z"
                  />
                </svg>
                Featured Task
              </h2>
              <nxt1-xp-item
                [mission]="featuredMission()!"
                (complete)="handleComplete($event)"
                (quickAction)="handleQuickAction($event)"
              />
            </section>
          }

          <!-- Categories -->
          <section class="categories-section" aria-label="Task categories">
            <h2 class="section-title">Your Tasks</h2>

            <div class="categories-list">
              @for (category of categories(); track category.id) {
                <nxt1-xp-category
                  [category]="category"
                  [isExpanded]="isExpanded(category.id)"
                  (toggle)="handleCategoryToggle(category.id)"
                >
                  @for (mission of getCategoryMissions(category.id); track mission.id) {
                    <nxt1-xp-item
                      [mission]="mission"
                      (complete)="handleComplete($event)"
                      (quickAction)="handleQuickAction($event)"
                    />
                  }
                </nxt1-xp-category>
              }
            </div>
          </section>

          <section class="rewards-section" aria-label="XP economy rewards">
            <nxt1-xp-economy-rewards />
          </section>

          <section class="arena-section" aria-label="The Arena head-to-head leaderboards">
            <nxt1-xp-arena-leaderboard />
          </section>

          <!-- Recent Badges -->
          @if (recentBadges().length > 0) {
            <section class="badges-section" aria-label="Recent badges">
              <div class="section-header">
                <h2 class="section-title">Recent Badges</h2>
                <button class="view-all-btn" (click)="viewAllBadges()">
                  View All
                  <!-- Chevron SVG -->
                  <svg
                    class="view-all-chevron"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
              <nxt1-xp-badge-grid
                [badges]="recentBadges()"
                (badgeClick)="handleBadgeClick($event)"
              />
            </section>
          }
        }

        <!-- Celebration Overlay -->
        @if (celebration()) {
          <div
            class="celebration-overlay"
            [class.celebration-overlay--visible]="celebration()"
            (click)="dismissCelebration()"
            role="dialog"
            aria-label="Task completion celebration"
          >
            <div class="celebration-content" (click)="$event.stopPropagation()">
              <div class="celebration-icon">
                <!-- Checkmark Circle SVG -->
                <svg
                  class="celebration-svg"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 class="celebration-title">Task Complete!</h2>
              <p class="celebration-message">Great job! Keep up the momentum.</p>
              <button class="celebration-dismiss" (click)="dismissCelebration()">Awesome!</button>
            </div>
          </div>
        }
      </div>
    </main>
  `,
  styles: [
    `
      /* ============================================
         XP SHELL (WEB) — Design Token CSS
         Zero Ionic at shell level, SSR-safe
         Matches /usage, /explore, /analytics layout
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      /* Main container — background only, NO padding (matches .usage-main) */
      .xp-main {
        background: var(--nxt1-color-bg-primary);
        min-height: 100%;
      }

      /* Dashboard container — padding here (matches .usage-dashboard) */
      .xp-dashboard {
        padding: 0;
        padding-bottom: var(--nxt1-spacing-16);
      }

      /* ============================================
         STREAK BANNER
         ============================================ */

      .xp-streak-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: 10px var(--nxt1-spacing-4);
        margin-bottom: var(--nxt1-spacing-4);
        background: linear-gradient(
          135deg,
          var(--nxt1-color-feedback-warning),
          var(--nxt1-color-feedback-warningDark, #d97706)
        );
        border-radius: var(--nxt1-radius-lg);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: #000;
      }

      .streak-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }

      /* ============================================
         PROGRESS SECTION
         ============================================ */

      .xp-progress-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .xp-quick-stats {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        margin-top: var(--nxt1-spacing-4);
        padding: 12px var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-lg);
      }

      .stat-item {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .stat-value {
        font-size: 20px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .stat-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .stat-divider {
        width: 1px;
        height: 32px;
        background: var(--nxt1-color-border-subtle);
      }

      /* ============================================
         SECTIONS
         ============================================ */

      .featured-section,
      .categories-section,
      .badges-section,
      .rewards-section,
      .arena-section {
        margin-bottom: var(--nxt1-spacing-6);
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--nxt1-spacing-3);
      }

      .section-title {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin: 0 0 var(--nxt1-spacing-3) 0;
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .section-header .section-title {
        margin-bottom: 0;
      }

      .section-title-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      .section-title-icon--trophy {
        color: var(--nxt1-color-feedback-warning);
      }

      .view-all-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        background: transparent;
        border: none;
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        color: var(--nxt1-color-primary);
        cursor: pointer;
        transition: opacity 0.15s ease;

        &:hover {
          opacity: 0.8;
        }
      }

      .view-all-chevron {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }

      /* ============================================
         CATEGORIES LIST
         ============================================ */

      .categories-list {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
      }

      /* ============================================
         CELEBRATION OVERLAY
         ============================================ */

      .celebration-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-6);
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        opacity: 0;
        visibility: hidden;
        transition:
          opacity 0.3s ease,
          visibility 0.3s ease;
      }

      .celebration-overlay--visible {
        opacity: 1;
        visibility: visible;
      }

      .celebration-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        padding: var(--nxt1-spacing-8);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-radius-xl);
        text-align: center;
        animation: xp-celebration-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        max-width: 320px;
        width: 100%;
      }

      @keyframes xp-celebration-bounce {
        0% {
          transform: scale(0.5);
          opacity: 0;
        }
        50% {
          transform: scale(1.05);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      .celebration-icon {
        width: 80px;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-feedback-success),
          var(--nxt1-color-feedback-successLight, #4ade80)
        );
        border-radius: 50%;
        animation: xp-icon-pulse 1s ease-in-out infinite;
      }

      @keyframes xp-icon-pulse {
        0%,
        100% {
          transform: scale(1);
          box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 0 0 20px rgba(34, 197, 94, 0);
        }
      }

      .celebration-svg {
        width: 40px;
        height: 40px;
        color: #fff;
      }

      .celebration-title {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
      }

      .celebration-message {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: 1.5;
      }

      .celebration-dismiss {
        width: 100%;
        padding: 14px var(--nxt1-spacing-6);
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: var(--nxt1-radius-md);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 600;
        color: #000;
        cursor: pointer;
        transition:
          opacity 0.15s ease,
          transform 0.1s ease;

        &:hover {
          opacity: 0.9;
        }

        &:active {
          transform: scale(0.98);
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .celebration-content {
          animation: none;
        }

        .celebration-icon {
          animation: none;
        }

        .celebration-overlay {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XpShellWebComponent {
  private readonly xpService = inject(XpService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('XpShellWeb');

  // ============================================
  // INPUTS
  // ============================================

  /** User role for mission type */
  readonly userRole = input<MissionUserRole>('athlete');

  /** Avatar source URL for page header */
  readonly avatarSrc = input<string | undefined>(undefined);

  /** Avatar display name for page header */
  readonly avatarName = input<string>('');

  /** Hide page header (desktop sidebar provides navigation) */
  readonly hideHeader = input(false);

  /** Show back button instead of avatar */
  readonly showBack = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar is clicked (typically opens sidenav) */
  readonly avatarClick = output<void>();

  /** Emitted when back is clicked */
  readonly back = output<void>();

  // ============================================
  // SERVICE SIGNALS (exposed for template)
  // ============================================

  protected readonly isLoading = this.xpService.isLoading;
  protected readonly progress = this.xpService.progress;
  protected readonly categories = this.xpService.categories;
  protected readonly expandedCategory = this.xpService.expandedCategory;
  protected readonly celebration = this.xpService.celebration;

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  /** Subtitle for desktop page header based on user role */
  protected readonly headerSubtitle = computed(() =>
    this.userRole() === 'athlete'
      ? 'Complete missions to level up your recruiting profile'
      : 'Complete missions to better support your athletes'
  );

  /** Current streak day count */
  protected readonly streakDays = computed(() => this.progress()?.streak.current ?? 0);

  /** Total completed missions */
  protected readonly totalCompleted = computed(() => this.progress()?.missionsCompleted ?? 0);

  /** Total available missions */
  protected readonly totalAvailable = computed(() => this.progress()?.totalMissions ?? 0);

  /** Completed today count */
  protected readonly completedToday = computed(() => 0);

  /** Featured (uncompleted) mission */
  protected readonly featuredMission = computed(() =>
    this.xpService.missions().find((m) => m.featured && m.status !== 'completed')
  );

  /** Recent badges (max 4) */
  protected readonly recentBadges = computed(() => this.progress()?.badges.slice(0, 4) ?? []);

  // ============================================
  // INITIALIZATION
  // ============================================

  constructor() {
    // Load missions reactively on role change
    effect(() => {
      const role = this.userRole();
      this.xpService.loadMissions(role);
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle category expand/collapse toggle */
  protected handleCategoryToggle(categoryId: string): void {
    this.haptics.impact('light');
    this.xpService.toggleCategory(categoryId as MissionCategory);
  }

  /** Check if a category is currently expanded */
  protected isExpanded(categoryId: string): boolean {
    return this.expandedCategory() === categoryId;
  }

  /** Get missions filtered by category */
  protected getCategoryMissions(categoryId: string): Mission[] {
    return this.xpService.missions().filter((m) => m.category === categoryId);
  }

  /** Handle mission completion */
  protected handleComplete(missionId: string): void {
    this.haptics.notification('success');
    this.xpService.completeMission(missionId);
  }

  /** Handle quick action on a mission */
  protected handleQuickAction(quickAction: MissionQuickAction | undefined): void {
    if (quickAction) {
      this.logger.debug('Quick action triggered', { route: quickAction.route });
    }
  }

  /** Handle badge click */
  protected handleBadgeClick(badge: unknown): void {
    this.logger.debug('Badge clicked', { badge });
  }

  /** Navigate to all badges view */
  protected viewAllBadges(): void {
    this.logger.debug('View all badges');
  }

  /** Dismiss celebration overlay */
  protected dismissCelebration(): void {
    this.xpService.clearCelebration();
  }
}
