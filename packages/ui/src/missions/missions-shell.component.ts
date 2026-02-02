/**
 * @fileoverview Missions Shell Component - Main Container
 * @module @nxt1/ui/missions
 * @version 1.0.0
 *
 * Main container component for the missions feature.
 * Orchestrates progress, categories, and mission lists.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Pull-to-refresh
 * - Level progress display
 * - Category list with expand/collapse
 * - Celebration overlay
 * - Badge achievements section
 * - Streak tracking
 *
 * @example
 * ```html
 * <nxt1-missions-shell
 *   [userRole]="'athlete'"
 * />
 * ```
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
import {
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonRippleEffect,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparkles,
  trophy,
  flame,
  chevronForward,
  checkmarkCircle,
  closeCircle,
} from 'ionicons/icons';

import type { Mission, MissionUserRole, MissionCategory, MissionQuickAction } from '@nxt1/core';
import { MissionsService } from './missions.service';
import { MissionsProgressComponent } from './missions-progress.component';
import { MissionsCategoryComponent } from './missions-category.component';
import { MissionsItemComponent } from './missions-item.component';
import { MissionsBadgeGridComponent } from './missions-badge.component';
import { MissionsSkeletonComponent } from './missions-skeleton.component';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';

// Register icons
addIcons({
  sparkles,
  trophy,
  flame,
  chevronForward,
  checkmarkCircle,
  closeCircle,
});

@Component({
  selector: 'nxt1-missions-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonIcon,
    IonRippleEffect,
    NxtPageHeaderComponent,
    MissionsProgressComponent,
    MissionsCategoryComponent,
    MissionsItemComponent,
    MissionsBadgeGridComponent,
    MissionsSkeletonComponent,
  ],
  template: `
    <!-- Professional Page Header (Twitter/X style) -->
    <nxt1-page-header
      title="Missions"
      [avatarSrc]="avatarSrc()"
      [avatarName]="avatarName()"
      [actions]="headerActions()"
      (avatarClick)="avatarClick.emit()"
      (actionClick)="onHeaderAction($event)"
    />

    <ion-content [fullscreen]="true" class="missions-content">
      <!-- Pull to Refresh -->
      <ion-refresher slot="fixed" (ionRefresh)="handleRefresh($event)">
        <ion-refresher-content
          pullingIcon="chevron-down"
          refreshingSpinner="circles"
        ></ion-refresher-content>
      </ion-refresher>

      <div class="missions-shell">
        <!-- Streak Badge (if active) -->
        @if (streakDays() > 0) {
          <div class="missions-streak-banner">
            <ion-icon name="flame"></ion-icon>
            <span>{{ streakDays() }} day streak!</span>
          </div>
        }

        @if (isLoading()) {
          <!-- Loading Skeleton -->
          <nxt1-missions-skeleton [showProgress]="true" />
        } @else {
          <!-- Progress Section -->
          <section class="missions-progress-section">
            <nxt1-missions-progress [progress]="progress()" size="large" />

            <!-- Quick Stats -->
            <div class="missions-quick-stats">
              <div class="stat-item">
                <span class="stat-value">{{ completedToday() }}</span>
                <span class="stat-label">Today</span>
              </div>
              <div class="stat-divider"></div>
              <div class="stat-item">
                <span class="stat-value">{{ totalCompleted() }}</span>
                <span class="stat-label">Completed</span>
              </div>
              <div class="stat-divider"></div>
              <div class="stat-item">
                <span class="stat-value">{{ totalAvailable() }}</span>
                <span class="stat-label">Available</span>
              </div>
            </div>
          </section>

          <!-- Featured Mission -->
          @if (featuredMission()) {
            <section class="featured-section">
              <h2 class="section-title">
                <ion-icon name="trophy"></ion-icon>
                Featured Mission
              </h2>
              <nxt1-missions-item
                [mission]="featuredMission()!"
                (complete)="handleComplete($event)"
                (quickAction)="handleQuickAction($event)"
              />
            </section>
          }

          <!-- Categories -->
          <section class="categories-section">
            <h2 class="section-title">Your Missions</h2>

            <div class="categories-list">
              @for (category of categories(); track category.id) {
                <nxt1-missions-category
                  [category]="category"
                  [isExpanded]="isExpanded(category.id)"
                  (toggle)="handleCategoryToggle(category.id)"
                >
                  @for (mission of getCategoryMissions(category.id); track mission.id) {
                    <nxt1-missions-item
                      [mission]="mission"
                      (complete)="handleComplete($event)"
                      (quickAction)="handleQuickAction($event)"
                    />
                  }
                </nxt1-missions-category>
              }
            </div>
          </section>

          <!-- Recent Badges -->
          @if (recentBadges().length > 0) {
            <section class="badges-section">
              <div class="section-header">
                <h2 class="section-title">Recent Badges</h2>
                <button class="view-all-btn" (click)="viewAllBadges()">
                  View All
                  <ion-icon name="chevron-forward"></ion-icon>
                </button>
              </div>
              <nxt1-missions-badge-grid
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
          >
            <div class="celebration-content" (click)="$event.stopPropagation()">
              <div class="celebration-icon">
                <ion-icon name="checkmark-circle"></ion-icon>
              </div>
              <h2 class="celebration-title">Mission Complete!</h2>
              <p class="celebration-message">Great job! Keep up the momentum.</p>
              <button class="celebration-dismiss" (click)="dismissCelebration()">
                <ion-ripple-effect></ion-ripple-effect>
                Awesome!
              </button>
            </div>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       MISSIONS SHELL
       Main container with full layout
       ============================================ */

      :host {
        display: block;
        height: 100%;
      }

      .missions-content {
        --background: var(--nxt1-color-bg-primary);
      }

      .missions-shell {
        min-height: 100%;
        padding: 16px;
        padding-bottom: calc(16px + env(safe-area-inset-bottom, 0));
      }

      /* ============================================
       STREAK BANNER
       ============================================ */

      .missions-streak-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 16px;
        margin-bottom: 16px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-warning),
          var(--nxt1-color-warningDark)
        );
        border-radius: var(--nxt1-ui-radius-lg, 12px);
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-onPrimary, #000000);
      }

      .missions-streak-banner ion-icon {
        font-size: 18px;
      }

      /* ============================================
       PROGRESS SECTION
       ============================================ */

      .missions-progress-section {
        margin-bottom: 24px;
      }

      .missions-quick-stats {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        margin-top: 16px;
        padding: 12px 16px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        border-radius: var(--nxt1-ui-radius-lg, 12px);
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
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .stat-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .stat-divider {
        width: 1px;
        height: 32px;
        background: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      /* ============================================
       SECTIONS
       ============================================ */

      .featured-section,
      .categories-section,
      .badges-section {
        margin-bottom: 24px;
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 12px 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .section-header .section-title {
        margin-bottom: 0;
      }

      .section-title ion-icon {
        font-size: 20px;
        color: var(--nxt1-color-secondary, #ffd700);
      }

      .view-all-btn {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        background: transparent;
        border: none;
        font-size: 13px;
        font-weight: 500;
        color: var(--nxt1-color-primary, #3b82f6);
        cursor: pointer;
        transition: color 0.2s ease;
      }

      .view-all-btn:hover {
        color: var(--nxt1-color-primary-light, #60a5fa);
      }

      .view-all-btn ion-icon {
        font-size: 16px;
      }

      /* ============================================
       CATEGORIES LIST
       ============================================ */

      .categories-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
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
        padding: 24px;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
      }

      .celebration-overlay--visible {
        opacity: 1;
        visibility: visible;
      }

      .celebration-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 32px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.05));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.1));
        border-radius: var(--nxt1-ui-radius-xl, 16px);
        text-align: center;
        animation: celebration-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        max-width: 320px;
        width: 100%;
      }

      @keyframes celebration-bounce {
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
          var(--nxt1-color-success),
          var(--nxt1-color-successLight)
        );
        border-radius: 50%;
        animation: icon-pulse 1s ease-in-out infinite;
      }

      @keyframes icon-pulse {
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

      .celebration-icon ion-icon {
        font-size: 40px;
        color: var(--nxt1-color-text-inverse);
      }

      .celebration-title {
        margin: 0;
        font-size: 24px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .celebration-message {
        margin: 0;
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        line-height: 1.5;
      }

      .celebration-points {
        padding: 8px 20px;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-secondary),
          var(--nxt1-color-secondaryLight)
        );
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        font-size: 20px;
        font-weight: 700;
        color: var(--nxt1-color-text-onPrimary);
        animation: points-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
      }

      @keyframes points-pop {
        0% {
          transform: scale(0);
        }
        100% {
          transform: scale(1);
        }
      }

      .celebration-badge {
        margin-top: 8px;
        animation: badge-float 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both;
      }

      @keyframes badge-float {
        0% {
          transform: translateY(20px);
          opacity: 0;
        }
        100% {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .celebration-dismiss {
        position: relative;
        width: 100%;
        padding: 14px 24px;
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        font-size: 16px;
        font-weight: 600;
        color: var(--nxt1-color-text-onPrimary);
        cursor: pointer;
        overflow: hidden;
        transition: background 0.2s ease;
      }

      .celebration-dismiss:hover {
        background: var(--nxt1-color-primaryLight);
      }

      .celebration-dismiss:active {
        transform: scale(0.98);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MissionsShellComponent {
  // ============================================
  // SERVICES
  // ============================================

  private readonly missionsService = inject(MissionsService);

  // ============================================
  // INPUTS
  // ============================================

  /** User role for mission type */
  readonly userRole = input<MissionUserRole>('athlete');

  /** Avatar source URL for page header */
  readonly avatarSrc = input<string | undefined>(undefined);

  /** Avatar display name for page header */
  readonly avatarName = input<string>('');

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when avatar is clicked (typically opens sidenav) */
  readonly avatarClick = output<void>();

  /** Emitted when a header action is clicked */
  readonly actionClick = output<PageHeaderAction>();

  // ============================================
  // SIGNALS FROM SERVICE
  // ============================================

  protected readonly isLoading = this.missionsService.isLoading;
  protected readonly progress = this.missionsService.progress;
  protected readonly categories = this.missionsService.categories;
  protected readonly expandedCategory = this.missionsService.expandedCategory;
  protected readonly celebration = this.missionsService.celebration;

  // ============================================
  // LOCAL STATE
  // ============================================

  // (removed unused signal)

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  protected readonly streakDays = computed(() => this.progress()?.streak.current ?? 0);

  /** Header actions for the page header */
  protected readonly headerActions = computed<PageHeaderAction[]>(() => {
    // No header actions for now - streak is shown in the banner
    return [];
  });

  protected readonly headerSubtitle = computed(() => {
    const role = this.userRole();
    return role === 'athlete'
      ? 'Complete missions to level up your recruiting profile'
      : 'Complete missions to better support your athletes';
  });

  protected readonly totalCompleted = computed(() => this.progress()?.missionsCompleted ?? 0);

  protected readonly totalAvailable = computed(() => this.progress()?.totalMissions ?? 0);

  protected readonly completedToday = computed(() => {
    // For now, return 0 - this would need to be tracked in the progress object
    return 0;
  });

  protected readonly featuredMission = computed(() => {
    const missions = this.missionsService.missions();
    return missions.find((m) => m.featured && m.status !== 'completed');
  });

  protected readonly recentBadges = computed(() => this.progress()?.badges.slice(0, 4) ?? []);

  // ============================================
  // INITIALIZATION
  // ============================================

  constructor() {
    // Load missions on role change
    effect(() => {
      const role = this.userRole();
      this.missionsService.loadMissions(role);
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle header action clicks */
  protected onHeaderAction(action: PageHeaderAction): void {
    this.actionClick.emit(action);
  }

  protected handleRefresh(event: CustomEvent): void {
    this.missionsService.loadMissions(this.userRole()).then(() => {
      (event.target as HTMLIonRefresherElement)?.complete();
    });
  }

  protected handleCategoryToggle(categoryId: string): void {
    this.missionsService.toggleCategory(categoryId as MissionCategory);
  }

  protected isExpanded(categoryId: string): boolean {
    return this.expandedCategory() === categoryId;
  }

  protected getCategoryMissions(categoryId: string): Mission[] {
    return this.missionsService.missions().filter((m) => m.category === categoryId);
  }

  protected handleComplete(missionId: string): void {
    this.missionsService.completeMission(missionId);
  }

  protected handleQuickAction(quickAction: MissionQuickAction | undefined): void {
    if (quickAction) {
      console.log('Quick action:', quickAction.route, quickAction.queryParams);
    }
  }

  protected handleBadgeClick(badge: unknown): void {
    console.log('Badge clicked:', badge);
  }

  protected viewAllBadges(): void {
    console.log('View all badges');
  }

  protected dismissCelebration(): void {
    this.missionsService.clearCelebration();
  }
}
