/**
 * @fileoverview Home Page Component - Mobile
 * @module @nxt1/mobile/features/home
 *
 * Main home page shown after successful authentication and onboarding completion.
 * Protected by onboardingCompleteGuard.
 *
 * Uses NxtPageHeaderComponent for professional contextual header.
 * Avatar click opens the sidenav (Twitter/X pattern).
 * ⭐ PULL-TO-REFRESH enabled using NxtRefresherComponent ⭐
 * ⭐ IDENTICAL STRUCTURE TO WEB ⭐
 */

import {
  Component,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
  HostBinding,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonAvatar,
  IonIcon,
} from '@ionic/angular/standalone';
import {
  NxtPageHeaderComponent,
  NxtSidenavService,
  NxtRefresherComponent,
  NxtToastService,
  NxtLoggingService,
  HapticsService,
  NxtOptionScrollerComponent,
  type PageHeaderAction,
  type RefreshEvent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '@nxt1/ui';
import { AuthFlowService } from '../auth/services/auth-flow.service';
import { AUTH_ROUTES } from '@nxt1/core/constants';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonAvatar,
    IonIcon,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
  ],
  template: `
    <!-- Professional Page Header with Logo (Twitter/X style) -->
    <nxt1-page-header
      [showLogo]="true"
      [avatarSrc]="user()?.photoURL"
      [avatarName]="displayName()"
      [actions]="headerActions()"
      (avatarClick)="onAvatarClick()"
      (actionClick)="onHeaderAction($event)"
    />

    <!-- Twitter/TikTok Style Feed Selector -->
    <nxt1-option-scroller
      [options]="feedOptions()"
      [selectedId]="selectedFeed()"
      [config]="{ scrollable: true, stretchToFill: false }"
      (selectionChange)="onFeedChange($event)"
    />

    <ion-content class="ion-padding">
      <!-- 🔄 Pull-to-Refresh (2026 Native-Style) -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="home-container">
        <!-- Welcome Card -->
        <ion-card>
          <ion-card-header>
            <div class="profile-section">
              @if (user()?.photoURL) {
                <ion-avatar>
                  <img [src]="user()?.photoURL" [alt]="displayName()" />
                </ion-avatar>
              } @else {
                <ion-avatar>
                  <ion-icon name="person-circle-outline" class="default-avatar"></ion-icon>
                </ion-avatar>
              }
              <ion-card-title>Welcome, {{ displayName() }}!</ion-card-title>
            </div>
          </ion-card-header>
          <ion-card-content>
            <p class="welcome-text">
              You're all set! Your profile is complete and you're ready to explore NXT1 Sports.
            </p>

            <div class="user-info">
              <div class="info-item">
                <span class="label">Email:</span>
                <span class="value">{{ user()?.email }}</span>
              </div>
              <div class="info-item">
                <span class="label">Role:</span>
                <span class="value">{{ user()?.role }}</span>
              </div>
              @if (user()?.isPremium) {
                <div class="info-item">
                  <span class="label">Status:</span>
                  <span class="value premium">⭐ Premium</span>
                </div>
              }
              <div class="info-item">
                <span class="label">Last Refresh:</span>
                <span class="value">{{ lastRefreshDisplay() }}</span>
              </div>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- Status Card -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>Status</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <div class="status-grid">
              <div class="status-item">
                <span class="status-label">Authentication</span>
                <span class="status-value success">✓ Authenticated</span>
              </div>
              <div class="status-item">
                <span class="status-label">Onboarding</span>
                <span class="status-value success">✓ Complete</span>
              </div>
              <div class="status-item">
                <span class="status-label">Email Verified</span>
                <span class="status-value" [class.success]="user()?.emailVerified">
                  {{ user()?.emailVerified ? '✓ Verified' : '⚠ Not Verified' }}
                </span>
              </div>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- Coming Soon -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>Coming Soon</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <p>More features are being developed:</p>
            <ul>
              <li>Feed & Posts</li>
              <li>Profile Management</li>
              <li>Team Dashboard</li>
              <li>Messaging</li>
              <li>Video Highlights</li>
            </ul>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .home-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 1rem 0;
        /* Add top padding to prevent refresher from touching content */
        padding-top: 1.5rem;
      }

      .profile-section {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.5rem;
      }

      ion-avatar {
        width: 64px;
        height: 64px;
      }

      .default-avatar {
        font-size: 64px;
        color: var(--ion-color-medium);
      }

      .welcome-text {
        color: var(--ion-color-medium);
        margin: 1rem 0;
      }

      .user-info {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-top: 1.5rem;
      }

      .info-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--ion-color-light);
      }

      .info-item:last-child {
        border-bottom: none;
      }

      .label {
        font-weight: 600;
        color: var(--ion-color-medium);
      }

      .value {
        color: var(--ion-color-dark);
      }

      .value.premium {
        color: var(--ion-color-warning);
        font-weight: 600;
      }

      .status-grid {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .status-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: var(--ion-color-light);
        border-radius: 8px;
      }

      .status-label {
        font-weight: 500;
        color: var(--ion-color-medium);
      }

      .status-value {
        font-weight: 600;
        color: var(--ion-color-medium);
      }

      .status-value.success {
        color: var(--ion-color-success);
      }

      ul {
        margin: 0.5rem 0;
        padding-left: 1.5rem;
      }

      li {
        margin: 0.5rem 0;
        color: var(--ion-color-medium);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);
  private readonly sidenavService = inject(NxtSidenavService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('HomeComponent');

  readonly user = this.authFlow.user;
  readonly displayName = computed(() => this.user()?.displayName ?? 'User');

  /** Loading state for skeleton UI (future enhancement) */
  readonly isLoading = signal(false);

  /** Track last refresh time for display */
  private readonly _lastRefreshTime = signal<Date | null>(null);
  readonly lastRefreshDisplay = computed(() => {
    const time = this._lastRefreshTime();
    return time ? time.toLocaleTimeString() : 'Never';
  });

  /** Feed navigation options (Twitter/TikTok style) */
  readonly feedOptions = signal<OptionScrollerItem[]>([
    { id: 'explore', label: 'Explore' },
    { id: 'following', label: 'Following' },
    { id: 'news', label: 'News' },
    { id: 'leaderboards', label: 'Leaderboards' },
    { id: 'scout-reports', label: 'Scout Reports' },
    { id: 'athletes', label: 'Athletes' },
    { id: 'teams', label: 'Teams' },
  ]);

  /** Currently selected feed */
  readonly selectedFeed = signal<string>('explore');

  /** Header action buttons - Create Post button using design token icon */
  readonly headerActions = signal<PageHeaderAction[]>([
    {
      id: 'create-post',
      icon: 'plus',
      label: 'Create Post',
    },
  ]);

  /** Required for Ionic page transitions - marks this as an ion-page */
  @HostBinding('class.ion-page') readonly ionPage = true;

  constructor() {
    // Icons registered globally in page-header.component.ts
    // No need to register duplicates here
  }

  /**
   * Handle pull-to-refresh
   * Called when user pulls down to refresh the page
   */
  async handleRefresh(event: RefreshEvent): Promise<void> {
    this.logger.debug('Refresh triggered', { timestamp: new Date(event.timestamp).toISOString() });
    this.isLoading.set(true);

    try {
      // Refresh data from API
      await this.refreshHomeData();

      // Update last refresh time
      this._lastRefreshTime.set(new Date());

      // Complete the refresh successfully
      event.complete();

      // Success feedback
      this.toast.success('Content refreshed');
    } catch (error) {
      this.logger.error('Refresh error', error);

      // Haptic error feedback
      await this.haptics.notification('error');

      // Show error toast
      this.toast.error('Failed to refresh. Try again.');

      // Cancel/fail the refresh
      event.cancel();
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Handle refresh timeout (default 30s)
   */
  async handleRefreshTimeout(): Promise<void> {
    this.logger.warn('Refresh timed out');
    this.isLoading.set(false);

    // Haptic warning feedback
    await this.haptics.notification('warning');

    // Show timeout toast
    this.toast.warning('Refresh timed out. Check your connection.');
  }

  /**
   * Simulate refreshing home data from API
   */
  private async refreshHomeData(): Promise<void> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // In a real app, you would:
    // - Reload user profile
    // - Fetch latest notifications
    // - Update feed/posts
    // - Refresh any cached data
    this.logger.debug('Data refreshed successfully');
  }

  /**
   * Handle avatar click - open sidenav (Twitter/X pattern)
   */
  onAvatarClick(): void {
    this.sidenavService.open();
  }

  /**
   * Handle feed tab change (For You / Following)
   */
  onFeedChange(event: OptionScrollerChangeEvent): void {
    this.selectedFeed.set(event.option.id);
    this.logger.debug('Feed changed', {
      feed: event.option.label,
      via: event.fromSwipe ? 'swipe' : 'tap',
    });

    // In production: trigger data reload for the selected feed
    // this.loadFeedData(event.option.id);
  }

  /**
   * Handle header action button clicks
   */
  async onHeaderAction(action: PageHeaderAction): Promise<void> {
    this.logger.debug('Action clicked', { actionId: action.id });

    switch (action.id) {
      case 'create-post':
        await this.onCreatePost();
        break;
    }
  }

  /**
   * Handle create post action
   * Opens the post creation flow
   */
  async onCreatePost(): Promise<void> {
    // Haptic feedback for premium action
    await this.haptics.impact('medium');

    this.logger.debug('Create post initiated');

    // TODO: Navigate to post creation page or open modal
    // await this.router.navigate(['/create-post']);
    // OR: await this.modalService.openPostComposer();

    this.toast.info('Post creation coming soon!');
  }

  async onSignOut(): Promise<void> {
    try {
      await this.authFlow.signOut();
      await this.router.navigate([AUTH_ROUTES.ROOT]);
    } catch (error) {
      this.logger.error('Sign out failed', error);
    }
  }
}
