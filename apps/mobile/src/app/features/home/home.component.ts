/**
 * @fileoverview Home Page Component - Mobile
 * @module @nxt1/mobile/features/home
 *
 * Main home page shown after successful authentication and onboarding completion.
 * Protected by onboardingCompleteGuard.
 *
 * Uses NxtPageHeaderComponent for professional contextual header.
 * ⭐ IDENTICAL STRUCTURE TO WEB ⭐
 */

import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
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
import { addIcons } from 'ionicons';
import {
  logOutOutline,
  personCircleOutline,
  notificationsOutline,
  searchOutline,
} from 'ionicons/icons';
import { NxtPageHeaderComponent, type PageHeaderAction } from '@nxt1/ui';
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
  ],
  template: `
    <!-- Professional Page Header with Avatar (Twitter/X style) -->
    <nxt1-page-header
      title="Home"
      [avatarSrc]="user()?.photoURL"
      [avatarName]="displayName()"
      [actions]="headerActions()"
      (avatarClick)="onAvatarClick()"
      (actionClick)="onHeaderAction($event)"
    />

    <ion-content class="ion-padding">
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

  readonly user = this.authFlow.user;
  readonly displayName = computed(() => this.user()?.displayName ?? 'User');

  /** Header action buttons */
  readonly headerActions = signal<PageHeaderAction[]>([
    {
      id: 'notifications',
      icon: 'notifications-outline',
      label: 'Notifications',
      badge: 0,
    },
    {
      id: 'signout',
      icon: 'log-out-outline',
      label: 'Sign Out',
      danger: true,
    },
  ]);

  constructor() {
    // Register icons
    addIcons({ logOutOutline, personCircleOutline, notificationsOutline, searchOutline });
  }

  /**
   * Handle avatar click - navigate to profile
   */
  onAvatarClick(): void {
    // TODO: Navigate to profile page
    console.log('Avatar clicked - navigate to profile');
    void this.router.navigate(['/tabs/profile']);
  }

  /**
   * Handle header action button clicks
   */
  onHeaderAction(action: PageHeaderAction): void {
    switch (action.id) {
      case 'notifications':
        console.log('Notifications clicked');
        break;
      case 'signout':
        this.onSignOut();
        break;
    }
  }

  async onSignOut(): Promise<void> {
    try {
      await this.authFlow.signOut();
      await this.router.navigate([AUTH_ROUTES.ROOT]);
    } catch (error) {
      console.error('[HomeComponent] Sign out error:', error);
    }
  }
}
