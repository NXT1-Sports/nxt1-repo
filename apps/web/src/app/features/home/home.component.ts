/**
 * @fileoverview Home Page Component
 * @module @nxt1/web/features/home
 *
 * Main landing page after successful authentication.
 * Protected by auth guard - requires user to be logged in.
 *
 * Uses NxtPageHeaderComponent from @nxt1/ui for consistent header styling.
 */

import { Component, ChangeDetectionStrategy, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import {
  NxtPageHeaderComponent,
  NxtOptionScrollerComponent,
  NxtLoggingService,
  type PageHeaderAction,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '@nxt1/ui';
import { AuthFlowService } from '../auth/services';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtOptionScrollerComponent,
  ],
  template: `
    <!-- Page Header with Logo (Twitter/X style) -->
    <nxt1-page-header
      [showLogo]="true"
      [actions]="headerActions()"
      (actionClick)="onHeaderAction($event)"
    />

    <!-- Twitter/TikTok Style Feed Selector -->
    <nxt1-option-scroller
      [options]="feedOptions()"
      [selectedId]="selectedFeed()"
      [config]="{ scrollable: true, stretchToFill: false }"
      (selectionChange)="onFeedChange($event)"
    />

    <ion-content>
      <div class="home-page">
        <!-- Main Content -->
        <div class="home-content">
          <!-- Welcome Section -->
          <section class="welcome-section">
            <h1 class="welcome-title">Welcome to NXT1 Sports! 🎉</h1>
            <p class="welcome-subtitle">
              Your recruiting journey starts here. This is a placeholder home page.
            </p>
          </section>

          <!-- Feature Cards Grid -->
          <section class="feature-grid">
            <!-- Card 1: Profile -->
            <article class="feature-card">
              <div class="card-icon card-icon--blue">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <h3 class="card-title">Your Profile</h3>
              <p class="card-description">
                View and edit your athletic profile, stats, and achievements.
              </p>
            </article>

            <!-- Card 2: Explore -->
            <article class="feature-card">
              <div class="card-icon card-icon--green">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h3 class="card-title">Explore</h3>
              <p class="card-description">
                Discover colleges, coaches, and opportunities that match your goals.
              </p>
            </article>

            <!-- Card 3: Messages -->
            <article class="feature-card">
              <div class="card-icon card-icon--purple">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <h3 class="card-title">Messages</h3>
              <p class="card-description">
                Connect with coaches and teammates through secure messaging.
              </p>
            </article>

            <!-- Card 4: Stats -->
            <article class="feature-card">
              <div class="card-icon card-icon--orange">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 class="card-title">Performance</h3>
              <p class="card-description">
                Track your athletic performance and improvement over time.
              </p>
            </article>

            <!-- Card 5: Videos -->
            <article class="feature-card">
              <div class="card-icon card-icon--red">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 class="card-title">Highlight Reel</h3>
              <p class="card-description">
                Upload and share your best game highlights and skills videos.
              </p>
            </article>

            <!-- Card 6: Rankings -->
            <article class="feature-card">
              <div class="card-icon card-icon--yellow">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                  />
                </svg>
              </div>
              <h3 class="card-title">Rankings</h3>
              <p class="card-description">
                See where you stand among recruits in your class and position.
              </p>
            </article>
          </section>

          <!-- Auth Status Card (Development) -->
          <section class="auth-status">
            <h3 class="auth-status-title">Authentication Status</h3>
            <div class="auth-status-content">
              <p>✅ You are successfully signed in</p>
              <p>✅ Auth guard is working - protected route</p>
              <p>✅ Session persistence active</p>
              @if (user(); as currentUser) {
                <p>👤 User ID: {{ currentUser.uid }}</p>
                @if (currentUser.email) {
                  <p>📧 Email: {{ currentUser.email }}</p>
                }
              }
            </div>
          </section>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       HOME PAGE STYLES - Using Design Tokens
       ============================================ */

      :host {
        display: block;
        min-height: 100%;
      }

      .home-page {
        min-height: 100%;
        background: var(--nxt1-color-background-primary, #0a0a0a);
      }

      .home-content {
        max-width: 1280px;
        margin: 0 auto;
        padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-4, 16px);
      }

      @media (min-width: 640px) {
        .home-content {
          padding: var(--nxt1-spacing-8, 32px) var(--nxt1-spacing-6, 24px);
        }
      }

      @media (min-width: 1024px) {
        .home-content {
          padding: var(--nxt1-spacing-8, 32px);
        }
      }

      /* Welcome Section */
      .welcome-section {
        margin-bottom: var(--nxt1-spacing-8, 32px);
        padding: var(--nxt1-spacing-8, 32px);
        background: var(--nxt1-color-surface-100, #141414);
        border-radius: var(--nxt1-radius-2xl, 16px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      .welcome-title {
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        font-family: var(--nxt1-font-family-brand, 'Barlow', sans-serif);
        font-size: var(--nxt1-font-size-3xl, 30px);
        font-weight: var(--nxt1-font-weight-bold, 700);
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: var(--nxt1-line-height-tight, 1.25);
      }

      .welcome-subtitle {
        margin: 0;
        font-size: var(--nxt1-font-size-lg, 18px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        line-height: var(--nxt1-line-height-relaxed, 1.625);
      }

      /* Feature Cards Grid */
      .feature-grid {
        display: grid;
        gap: var(--nxt1-spacing-6, 24px);
        grid-template-columns: 1fr;
      }

      @media (min-width: 640px) {
        .feature-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (min-width: 1024px) {
        .feature-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      .feature-card {
        padding: var(--nxt1-spacing-6, 24px);
        background: var(--nxt1-color-surface-100, #141414);
        border-radius: var(--nxt1-radius-xl, 12px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        transition: all var(--nxt1-transition-normal, 200ms) ease;
      }

      .feature-card:hover {
        background: var(--nxt1-color-surface-200, #1a1a1a);
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
        transform: translateY(-2px);
      }

      .card-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        margin-bottom: var(--nxt1-spacing-4, 16px);
        border-radius: var(--nxt1-radius-lg, 8px);
      }

      .card-icon svg {
        width: 24px;
        height: 24px;
      }

      .card-icon--blue {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }

      .card-icon--green {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }

      .card-icon--purple {
        background: rgba(168, 85, 247, 0.15);
        color: #c084fc;
      }

      .card-icon--orange {
        background: rgba(249, 115, 22, 0.15);
        color: #fb923c;
      }

      .card-icon--red {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }

      .card-icon--yellow {
        background: rgba(234, 179, 8, 0.15);
        color: #facc15;
      }

      .card-title {
        margin: 0 0 var(--nxt1-spacing-2, 8px);
        font-family: var(--nxt1-font-family-brand, 'Barlow', sans-serif);
        font-size: var(--nxt1-font-size-xl, 20px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .card-description {
        margin: 0;
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        line-height: var(--nxt1-line-height-relaxed, 1.625);
      }

      /* Auth Status Section */
      .auth-status {
        margin-top: var(--nxt1-spacing-8, 32px);
        padding: var(--nxt1-spacing-6, 24px);
        background: rgba(var(--nxt1-color-primary-rgb, 163, 230, 53), 0.1);
        border-radius: var(--nxt1-radius-xl, 12px);
        border: 1px solid rgba(var(--nxt1-color-primary-rgb, 163, 230, 53), 0.2);
      }

      .auth-status-title {
        margin: 0 0 var(--nxt1-spacing-3, 12px);
        font-size: var(--nxt1-font-size-lg, 18px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        color: var(--nxt1-color-primary, #a3e635);
      }

      .auth-status-content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .auth-status-content p {
        margin: 0;
        font-size: var(--nxt1-font-size-sm, 14px);
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      /* Light theme overrides */
      :host-context([data-theme='light']) {
        .home-page {
          background: var(--nxt1-color-background-primary, #ffffff);
        }

        .welcome-section,
        .feature-card {
          background: var(--nxt1-color-surface-100, #f5f5f5);
          border-color: var(--nxt1-color-border-subtle, rgba(0, 0, 0, 0.06));
        }

        .feature-card:hover {
          background: var(--nxt1-color-surface-200, #ebebeb);
          border-color: var(--nxt1-color-border-default, rgba(0, 0, 0, 0.1));
        }

        .welcome-title,
        .card-title {
          color: var(--nxt1-color-text-primary, #212121);
        }

        .welcome-subtitle,
        .card-description,
        .auth-status-content p {
          color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.7));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly authFlow = inject(AuthFlowService);
  private readonly logger = inject(NxtLoggingService).child('HomeComponent');

  /** Current authenticated user */
  readonly user = computed(() => this.authFlow.user());

  /** Feed navigation options (Twitter/TikTok style) */
  readonly feedOptions = signal<OptionScrollerItem[]>([
    { id: 'explore', label: 'Explore' },
    { id: 'following', label: 'Following' },
    { id: 'news', label: 'News' },
    { id: 'scout-reports', label: 'Scout Reports' },
    { id: 'athletes', label: 'Athletes' },
    { id: 'teams', label: 'Teams' },
  ]);

  /** Currently selected feed */
  readonly selectedFeed = signal<string>('explore');

  /** Header action buttons */
  readonly headerActions = signal<PageHeaderAction[]>([
    {
      id: 'notifications',
      icon: 'notifications-outline',
      label: 'Notifications',
      badge: 0, // TODO: Connect to notification service
    },
    {
      id: 'search',
      icon: 'search-outline',
      label: 'Search',
    },
  ]);

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
  onHeaderAction(action: PageHeaderAction): void {
    switch (action.id) {
      case 'notifications':
        // TODO: Navigate to notifications or show notification panel
        this.logger.debug('Action clicked', { actionId: action.id });
        break;
      case 'search':
        // TODO: Navigate to search or show search modal
        this.logger.debug('Action clicked', { actionId: action.id });
        break;
    }
  }
}
