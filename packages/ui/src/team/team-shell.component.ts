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
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon, IonSkeletonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { peopleOutline, shareOutline } from 'ionicons/icons';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import { NxtStateViewComponent } from '../components/state-view';
import { NxtEntityHeroComponent, type EntityHeroMetaItem } from '../components/entity-hero';
import { ProfileTimelineComponent } from '../profile/profile-timeline.component';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtThemeService } from '../services/theme';
import { formatSportDisplayName } from '@nxt1/core';
import type { FeedItem } from '@nxt1/core';

// Register icons
/**
 * Team data structure
 */
export interface TeamData {
  id: string;
  slug: string;
  teamName: string;
  sport?: string;
  teamType?: string;
  location?: string;
  logoUrl?: string;
  record?: string;
  description?: string;
  coachName?: string;
  homeVenue?: string;
  rosterCount?: number;
  /** Primary brand color (hex, e.g. "#003087") — sourced from the Organisation doc */
  primaryColor?: string;
  /** Secondary brand color (hex) — sourced from the Organisation doc */
  secondaryColor?: string;
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
    NxtEntityHeroComponent,
    ProfileTimelineComponent,
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
          <!-- Team Header — shared entity hero card (same design as /profile) -->
          <div class="team-hero-wrap">
            <nxt1-entity-hero
              [name]="teamData.teamName"
              [subtitle]="heroSubtitle(teamData)"
              [logoSrc]="teamData.logoUrl ?? null"
              [metaItems]="teamMetaItems()"
              (actionClick)="shareClick.emit()"
            />
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

          <!-- Team Timeline — polymorphic post feed (same infrastructure as /profile) -->
          <div class="team-timeline-section">
            <nxt1-profile-timeline
              [polymorphicFeed]="timelinePosts()"
              [isLoading]="timelineLoading()"
              [isLoadingMore]="timelineLoadingMore()"
              [isEmpty]="timelinePosts().length === 0 && !timelineLoading() && !timelineError()"
              [error]="timelineError()"
              [hasMore]="timelineHasMore()"
              [showMenu]="false"
              emptyIcon="megaphone-outline"
              emptyTitle="No posts yet"
              emptyMessage="This team hasn't shared any posts, events, or highlights yet."
              (loadMore)="timelineLoadMore.emit()"
              (retry)="retryClick.emit()"
            />
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .team-content {
        --background: var(--nxt1-color-bg-primary, var(--ion-background-color, #0a0a0a));
        --m-accent: var(--nxt1-color-primary, #d4ff00);
        --m-accent-secondary: var(--nxt1-color-secondary, #ffffff);
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

      /* ── Entity hero wrapper ── */
      .team-hero-wrap {
        /* No horizontal padding — team-container already provides 16px sides */
        margin-top: 36px;
        margin-bottom: 0;
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

      /* Team Timeline */
      .team-timeline-section {
        margin-top: 8px;
      }

      /* Responsive */
      @media (max-width: 640px) {
        .team-stats {
          flex-wrap: wrap;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamShellComponent {
  private static readonly TEAM_THEME_SOURCE = 'team-shell';

  private readonly logger = inject(NxtLoggingService).child('TeamShellComponent');
  private readonly toast = inject(NxtToastService);
  private readonly theme = inject(NxtThemeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly formatSportDisplayName = formatSportDisplayName;

  // ============================================
  // INPUTS
  // ============================================

  /** Team ID from route parameter */
  readonly teamId = input.required<string>();

  /** Team data (can be passed from parent or loaded internally) */
  readonly teamData = input<TeamData | null>(null);

  // ── Timeline inputs ──

  /** Polymorphic post feed for the team timeline (FeedItem discriminated union) */
  readonly timelinePosts = input<readonly FeedItem[]>([]);
  /** Whether the timeline is performing an initial load */
  readonly timelineLoading = input(false);
  /** Whether an incremental "load more" fetch is in progress */
  readonly timelineLoadingMore = input(false);
  /** Error message from the timeline fetch (null = no error) */
  readonly timelineError = input<string | null>(null);
  /** Whether more timeline posts are available to load */
  readonly timelineHasMore = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  /** Back button clicked */
  readonly backClick = output<void>();

  /** Share button clicked */
  readonly shareClick = output<void>();

  /** Retry loading */
  readonly retryClick = output<void>();

  /** Emitted when the user scrolls to the bottom and requests more timeline posts */
  readonly timelineLoadMore = output<void>();

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

  /** Hero subtitle: "High School Football", "Club Basketball", etc. */
  protected heroSubtitle(t: TeamData): string {
    const typeLabel = t.teamType
      ? t.teamType
          .split('-')
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ')
      : '';
    const sportLabel = t.sport?.trim() ?? '';
    return `${typeLabel} ${sportLabel}`.trim();
  }

  /** Meta rows for the shared entity hero (Location, Record, Coach) */
  protected readonly teamMetaItems = computed<EntityHeroMetaItem[]>(() => {
    const t = this.team();
    if (!t) return [];
    const items: EntityHeroMetaItem[] = [];
    if (t.location) items.push({ key: 'Location', value: t.location });
    if (t.record) items.push({ key: 'Record', value: t.record });
    if (t.coachName) items.push({ key: 'Coach', value: t.coachName });
    return items;
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  constructor() {
    addIcons({
      peopleOutline,
      shareOutline,
    });

    // Log component initialization
    effect(() => {
      this.logger.info('Team shell initialized', {
        teamId: this.teamId(),
        hasData: !!this.team(),
      });
    });

    // Apply org brand colors via the design token system whenever team data resolves.
    // Sets --team-primary / --team-secondary on <html> so every component referencing
    // those tokens picks them up through the CSS cascade automatically.
    effect(() => {
      const t = this.team();
      if (t?.primaryColor) {
        this.theme.applyOrgTheme(t.primaryColor, t.secondaryColor);
        this.theme.activateTeamTheme(TeamShellComponent.TEAM_THEME_SOURCE);
      } else {
        this.theme.clearOrgTheme();
        this.theme.deactivateTeamTheme(TeamShellComponent.TEAM_THEME_SOURCE);
      }
    });

    // Clear org theme when navigating away so it doesn't bleed onto other pages.
    this.destroyRef.onDestroy(() => {
      this.theme.clearOrgTheme();
      this.theme.deactivateTeamTheme(TeamShellComponent.TEAM_THEME_SOURCE);
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
