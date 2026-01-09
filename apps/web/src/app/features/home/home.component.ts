import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthFlowService } from '../auth/services';

/**
 * Home Component - User Dashboard
 *
 * Protected page showing personalized content for logged-in users.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="home-container">
      <header class="home-header">
        <h1>Welcome back{{ userName() ? ', ' + userName() : '' }}!</h1>
        <p>Your personalized sports dashboard</p>
      </header>

      <div class="content-placeholder">
        <p>Dashboard content coming soon...</p>
        <p class="small">This is where your personalized feed will appear.</p>
      </div>

      <div class="actions">
        <a routerLink="/explore" class="btn btn-secondary"> Explore Feed </a>
        <a routerLink="/settings" class="btn btn-ghost"> Settings </a>
      </div>
    </div>
  `,
  styles: [
    `
      .home-container {
        min-height: 100vh;
        padding: var(--spacing-lg, 24px);
        background-color: var(--app-bg, #121212);
      }

      .home-header {
        text-align: center;
        padding: var(--spacing-xl, 32px) 0;

        h1 {
          font-size: 2rem;
          margin-bottom: var(--spacing-xs, 4px);
        }

        p {
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
        }
      }

      .content-placeholder {
        max-width: 600px;
        margin: 0 auto var(--spacing-lg, 24px);
        padding: var(--spacing-xl, 32px);
        background-color: var(--card-bg, #1e1e1e);
        border-radius: var(--radius-lg, 12px);
        text-align: center;

        p {
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
          margin: 0;
        }

        .small {
          font-size: 0.875rem;
          margin-top: var(--spacing-sm, 8px);
          color: var(--text-tertiary, rgba(255, 255, 255, 0.5));
        }
      }

      .actions {
        display: flex;
        justify-content: center;
        gap: var(--spacing-md, 16px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly authFlow = inject(AuthFlowService);

  userName = () => {
    const user = this.authFlow.user();
    return user?.displayName?.split(' ')[0] ?? null;
  };
}
