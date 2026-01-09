import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/**
 * Explore Component - Main Feed
 *
 * Public landing page showing content feed.
 */
@Component({
  selector: 'app-explore',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="explore-container">
      <header class="explore-header">
        <h1>Explore</h1>
        <p>Discover sports content from athletes worldwide</p>
      </header>

      <div class="content-placeholder">
        <p>Feed content coming soon...</p>
        <p class="small">This is where the main content feed will appear.</p>
      </div>
    </div>
  `,
  styles: [
    `
      .explore-container {
        min-height: 100vh;
        padding: var(--spacing-lg, 24px);
        background-color: var(--app-bg, #121212);
      }

      .explore-header {
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
        margin: 0 auto;
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreComponent {}
