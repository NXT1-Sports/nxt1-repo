import {
  Component,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthFlowService } from '../auth/services';

/**
 * Settings Component
 *
 * User account and app settings.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="settings-container">
      <header class="settings-header">
        <h1>Settings</h1>
      </header>

      <div class="settings-card">
        <h2>Account</h2>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">Email</span>
            <span class="setting-value">{{ userEmail() }}</span>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-info">
            <span class="setting-label">Subscription</span>
            <span class="setting-value">{{ subscriptionStatus() }}</span>
          </div>
        </div>

        <hr />

        <button class="btn btn-ghost danger" (click)="onSignOut()">
          Sign Out
        </button>
      </div>

      <a routerLink="/home" class="back-link">
        ← Back to Home
      </a>
    </div>
  `,
  styles: [`
    .settings-container {
      min-height: 100vh;
      padding: var(--spacing-lg, 24px);
      background-color: var(--app-bg, #121212);
    }

    .settings-header {
      max-width: 600px;
      margin: 0 auto var(--spacing-lg, 24px);

      h1 {
        font-size: 2rem;
      }
    }

    .settings-card {
      max-width: 600px;
      margin: 0 auto;
      padding: var(--spacing-lg, 24px);
      background-color: var(--card-bg, #1e1e1e);
      border-radius: var(--radius-lg, 12px);

      h2 {
        font-size: 1.25rem;
        margin-bottom: var(--spacing-md, 16px);
        color: var(--text-secondary, rgba(255, 255, 255, 0.7));
      }

      hr {
        border: none;
        border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
        margin: var(--spacing-lg, 24px) 0;
      }
    }

    .setting-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-sm, 8px) 0;
    }

    .setting-info {
      display: flex;
      flex-direction: column;
      gap: 2px;

      .setting-label {
        font-size: 0.75rem;
        color: var(--text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .setting-value {
        color: var(--text-primary, #ffffff);
      }
    }

    .danger {
      color: var(--error, #f44336);

      &:hover {
        background-color: rgba(244, 67, 54, 0.1);
      }
    }

    .back-link {
      display: block;
      max-width: 600px;
      margin: var(--spacing-lg, 24px) auto 0;
      color: var(--primary, #ccff00);
      font-size: 0.875rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly authFlow = inject(AuthFlowService);

  userEmail = () => this.authFlow.user()?.email ?? 'Not signed in';
  subscriptionStatus = () =>
    this.authFlow.isPremium() ? 'Premium' : 'Free';

  async onSignOut(): Promise<void> {
    await this.authFlow.signOut();
  }
}
