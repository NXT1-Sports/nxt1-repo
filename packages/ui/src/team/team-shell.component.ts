/**
 * @fileoverview Team Shell Component - Shared Team Page
 * @module @nxt1/ui/team
 * @version 1.0.0
 *
 * Shared component for displaying team information.
 * Used by both web and mobile apps.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Team header with logo and info
 * - Team stats and record
 * - Roster display
 * - Recent games/highlights
 *
 * @example
 * ```html
 * <nxt1-team-shell
 *   [teamId]="teamId()"
 *   (backClick)="router.back()"
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
  signal,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon, IonSkeletonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  trophyOutline,
  locationOutline,
  peopleOutline,
  statsChartOutline,
  shareOutline,
} from 'ionicons/icons';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import { NxtStateViewComponent } from '../components/state-view';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtToastService } from '../services/toast/toast.service';
import { formatSportDisplayName } from '@nxt1/core';

// Register icons
/**
 * Team data structure
 */
export interface TeamData {
  id: string;
  slug: string;
  teamName: string;
  sport?: string;
  location?: string;
  logoUrl?: string;
  imageUrl?: string;
  record?: string;
  description?: string;
  foundedYear?: number;
  coachName?: string;
  homeVenue?: string;
  rosterCount?: number;
}

@Component({
  selector: 'nxt1-team-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonSkeletonText,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtStateViewComponent,
  ],
  template: `
    <!-- Top Navigation Header -->
    <nxt1-page-header
      [title]="team()?.teamName || 'Team'"
      [showBack]="true"
      [actions]="headerActions()"
      (backClick)="backClick.emit()"
      (actionClick)="onHeaderAction($event.id)"
    />

    <ion-content [fullscreen]="true" class="team-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="team-container">
        <!-- Loading State -->
        @if (isLoading()) {
          <div class="team-skeleton">
            <div class="team-header-skeleton">
              <ion-skeleton-text [animated]="true" class="skeleton-avatar"></ion-skeleton-text>
              <div class="skeleton-info">
                <ion-skeleton-text [animated]="true" class="skeleton-title"></ion-skeleton-text>
                <ion-skeleton-text [animated]="true" class="skeleton-subtitle"></ion-skeleton-text>
              </div>
            </div>
            <ion-skeleton-text [animated]="true" class="skeleton-stats"></ion-skeleton-text>
            <ion-skeleton-text [animated]="true" class="skeleton-content"></ion-skeleton-text>
          </div>
        }

        <!-- Error State -->
        @else if (error()) {
          <nxt1-state-view
            variant="error"
            title="Failed to load team"
            [message]="error()"
            actionLabel="Try Again"
            (action)="onRetry()"
          />
        }

        <!-- Team Content -->
        @else if (team(); as teamData) {
          <!-- Team Header -->
          <div class="team-header">
            @if (teamData.logoUrl || teamData.imageUrl) {
              <div class="team-logo">
                <img [src]="teamData.logoUrl || teamData.imageUrl" [alt]="teamData.teamName" />
              </div>
            }
            <div class="team-info">
              <h1 class="team-name">{{ teamData.teamName }}</h1>
              @if (teamData.sport) {
                <div class="team-sport">
                  <ion-icon name="trophy-outline"></ion-icon>
                  <span>{{ formatSportDisplayName(teamData.sport) }}</span>
                </div>
              }
              @if (teamData.location) {
                <div class="team-location">
                  <ion-icon name="location-outline"></ion-icon>
                  <span>{{ teamData.location }}</span>
                </div>
              }
              @if (teamData.record) {
                <div class="team-record">
                  <ion-icon name="stats-chart-outline"></ion-icon>
                  <span>Record: {{ teamData.record }}</span>
                </div>
              }
            </div>
          </div>

          <!-- Team Stats Bar -->
          <div class="team-stats">
            @if (teamData.rosterCount) {
              <div class="stat-item">
                <ion-icon name="people-outline"></ion-icon>
                <span class="stat-value">{{ teamData.rosterCount }}</span>
                <span class="stat-label">Athletes</span>
              </div>
            }
            @if (teamData.foundedYear) {
              <div class="stat-item">
                <span class="stat-value">{{ teamData.foundedYear }}</span>
                <span class="stat-label">Founded</span>
              </div>
            }
          </div>

          <!-- Team Description -->
          @if (teamData.description) {
            <div class="team-description">
              <h3>About</h3>
              <p>{{ teamData.description }}</p>
            </div>
          }

          <!-- Additional Info -->
          <div class="team-details">
            @if (teamData.coachName) {
              <div class="detail-item">
                <span class="detail-label">Head Coach</span>
                <span class="detail-value">{{ teamData.coachName }}</span>
              </div>
            }
            @if (teamData.homeVenue) {
              <div class="detail-item">
                <span class="detail-label">Home Venue</span>
                <span class="detail-value">{{ teamData.homeVenue }}</span>
              </div>
            }
          </div>

          <!-- Placeholder for future sections -->
          <div class="team-sections">
            <div class="section-placeholder">
              <p class="placeholder-text">Roster, schedule, and highlights coming soon...</p>
            </div>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .team-content {
        --background: var(--ion-background-color, #ffffff);
      }

      .team-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 16px;
      }

      /* Skeleton Loading */
      .team-skeleton {
        padding: 20px;
      }

      .team-header-skeleton {
        display: flex;
        gap: 16px;
        align-items: center;
        margin-bottom: 24px;
      }

      .skeleton-avatar {
        width: 80px;
        height: 80px;
        border-radius: 12px;
      }

      .skeleton-info {
        flex: 1;
      }

      .skeleton-title {
        width: 200px;
        height: 28px;
        margin-bottom: 8px;
      }

      .skeleton-subtitle {
        width: 150px;
        height: 20px;
      }

      .skeleton-stats {
        width: 100%;
        height: 80px;
        margin-bottom: 16px;
        border-radius: 8px;
      }

      .skeleton-content {
        width: 100%;
        height: 200px;
        border-radius: 8px;
      }

      /* Team Header */
      .team-header {
        display: flex;
        gap: 20px;
        padding: 20px;
        background: var(--ion-color-light, #f5f5f5);
        border-radius: 12px;
        margin-bottom: 24px;
      }

      .team-logo {
        flex-shrink: 0;
      }

      .team-logo img {
        width: 100px;
        height: 100px;
        object-fit: contain;
        border-radius: 12px;
        background: white;
        padding: 8px;
      }

      .team-info {
        flex: 1;
      }

      .team-name {
        font-size: 28px;
        font-weight: 700;
        margin: 0 0 12px 0;
        color: var(--ion-text-color);
      }

      .team-sport,
      .team-location,
      .team-record {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        color: var(--ion-color-medium);
      }

      .team-sport ion-icon,
      .team-location ion-icon,
      .team-record ion-icon {
        font-size: 18px;
      }

      /* Team Stats */
      .team-stats {
        display: flex;
        gap: 20px;
        padding: 20px;
        background: var(--ion-color-light, #f5f5f5);
        border-radius: 12px;
        margin-bottom: 24px;
      }

      .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
        gap: 4px;
      }

      .stat-item ion-icon {
        font-size: 24px;
        color: var(--ion-color-primary);
      }

      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: var(--ion-text-color);
      }

      .stat-label {
        font-size: 14px;
        color: var(--ion-color-medium);
      }

      /* Team Description */
      .team-description {
        padding: 20px;
        margin-bottom: 24px;
      }

      .team-description h3 {
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 12px 0;
        color: var(--ion-text-color);
      }

      .team-description p {
        font-size: 16px;
        line-height: 1.6;
        color: var(--ion-color-medium-shade);
        margin: 0;
      }

      /* Team Details */
      .team-details {
        padding: 20px;
        background: var(--ion-color-light, #f5f5f5);
        border-radius: 12px;
        margin-bottom: 24px;
      }

      .detail-item {
        display: flex;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
      }

      .detail-item:last-child {
        border-bottom: none;
      }

      .detail-label {
        font-weight: 600;
        color: var(--ion-text-color);
      }

      .detail-value {
        color: var(--ion-color-medium-shade);
      }

      /* Placeholder */
      .team-sections {
        padding: 40px 20px;
      }

      .section-placeholder {
        text-align: center;
      }

      .placeholder-text {
        font-size: 16px;
        color: var(--ion-color-medium);
      }

      /* Responsive */
      @media (max-width: 640px) {
        .team-header {
          flex-direction: column;
          align-items: center;
          text-align: center;
        }

        .team-name {
          font-size: 24px;
        }

        .team-stats {
          flex-wrap: wrap;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamShellComponent {
  private readonly logger = inject(NxtLoggingService).child('TeamShellComponent');
  private readonly toast = inject(NxtToastService);

  protected readonly formatSportDisplayName = formatSportDisplayName;

  // ============================================
  // INPUTS
  // ============================================

  /** Team ID from route parameter */
  readonly teamId = input.required<string>();

  /** Team data (can be passed from parent or loaded internally) */
  readonly teamData = input<TeamData | null>(null);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Back button clicked */
  readonly backClick = output<void>();

  /** Share button clicked */
  readonly shareClick = output<void>();

  /** Retry loading */
  readonly retryClick = output<void>();

  // ============================================
  // STATE
  // ============================================

  protected readonly isLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly team = computed(() => this.teamData());

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly headerActions = computed<PageHeaderAction[]>(() => {
    return [
      {
        id: 'share',
        icon: 'share-outline',
        ariaLabel: 'Share team',
      },
    ];
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    addIcons({
      trophyOutline,
      locationOutline,
      peopleOutline,
      statsChartOutline,
      shareOutline,
    });
    // Log component initialization
    effect(() => {
      this.logger.info('Team shell initialized', {
        teamId: this.teamId(),
        hasData: !!this.team(),
      });
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onHeaderAction(actionId: string): void {
    switch (actionId) {
      case 'share':
        this.shareClick.emit();
        break;
      default:
        this.logger.warn('Unknown header action', { actionId });
    }
  }

  protected handleRefresh(event: RefreshEvent): void {
    this.logger.info('Refresh triggered');
    this.retryClick.emit();
    // Complete will be called by parent after data reloads
    setTimeout(() => event.complete(), 500);
  }

  protected handleRefreshTimeout(): void {
    this.toast.show({
      message: 'Refresh timed out',
      type: 'warning',
      duration: 2000,
    });
  }

  protected onRetry(): void {
    this.error.set(null);
    this.retryClick.emit();
  }
}
