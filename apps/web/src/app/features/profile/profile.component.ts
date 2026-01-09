import {
  Component,
  ChangeDetectionStrategy,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/**
 * Profile Component - User Profile View
 *
 * Public view of a user's profile.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="profile-container">
      <div class="profile-card">
        <h1>Profile</h1>
        <p>Viewing: {{ unicode() }}</p>

        <div class="content-placeholder">
          <p>Profile content coming soon...</p>
        </div>

        <a routerLink="/explore" class="btn btn-secondary">
          ← Back to Explore
        </a>
      </div>
    </div>
  `,
  styles: [`
    .profile-container {
      min-height: 100vh;
      padding: var(--spacing-lg, 24px);
      background-color: var(--app-bg, #121212);
    }

    .profile-card {
      max-width: 600px;
      margin: 0 auto;
      padding: var(--spacing-xl, 32px);
      background-color: var(--card-bg, #1e1e1e);
      border-radius: var(--radius-lg, 12px);
      text-align: center;

      h1 {
        font-size: 2rem;
        margin-bottom: var(--spacing-sm, 8px);
      }

      p {
        color: var(--text-secondary, rgba(255, 255, 255, 0.7));
        margin-bottom: var(--spacing-lg, 24px);
      }
    }

    .content-placeholder {
      padding: var(--spacing-xl, 32px);
      background-color: var(--surface, #1a1a1a);
      border-radius: var(--radius-md, 8px);
      margin-bottom: var(--spacing-lg, 24px);

      p {
        margin: 0;
        color: var(--text-tertiary, rgba(255, 255, 255, 0.5));
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  // Route parameter using input binding
  readonly unicode = input.required<string>();
}
