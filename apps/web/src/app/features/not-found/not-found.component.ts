import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/**
 * Not Found Component - 404 Page
 */
@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="not-found-container">
      <div class="not-found-card">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist or has been moved.</p>

        <a routerLink="/explore" class="btn btn-primary"> Go to Explore </a>
      </div>
    </div>
  `,
  styles: [
    `
      .not-found-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--spacing-lg, 24px);
        background-color: var(--app-bg, #121212);
      }

      .not-found-card {
        max-width: 400px;
        padding: var(--spacing-xl, 32px);
        background-color: var(--card-bg, #1e1e1e);
        border-radius: var(--radius-xl, 16px);
        text-align: center;

        h1 {
          font-size: 5rem;
          color: var(--primary, #ccff00);
          margin-bottom: 0;
          line-height: 1;
        }

        h2 {
          font-size: 1.5rem;
          margin-bottom: var(--spacing-sm, 8px);
        }

        p {
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
          margin-bottom: var(--spacing-lg, 24px);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundComponent {}
