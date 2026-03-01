/**
 * @fileoverview Profile Academic Tab Component - Web
 * @module @nxt1/ui/profile/web
 *
 * Extracted from ProfileShellWebComponent.
 * Displays GPA, ACT, SAT, and school details.
 */
import { Component, ChangeDetectionStrategy, inject, output } from '@angular/core';
import { NxtIconComponent } from '../../components/icon';
import { ProfileService } from '../profile.service';

@Component({
  selector: 'nxt1-profile-academic-web',
  standalone: true,
  imports: [NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="madden-tab-section" aria-labelledby="academic-heading">
      <h2 id="academic-heading" class="sr-only">Academic Profile</h2>
      @if (
        !profile.user()?.gpa &&
        !profile.user()?.sat &&
        !profile.user()?.act &&
        !profile.user()?.school?.name
      ) {
        <div class="madden-empty">
          <nxt1-icon name="school" [size]="48" />
          <h3>No academic info yet</h3>
          <p>
            @if (profile.isOwnProfile()) {
              Add GPA, test scores, and school details to strengthen your profile.
            } @else {
              This athlete hasn't added academic information yet.
            }
          </p>
          @if (profile.isOwnProfile()) {
            <button type="button" class="madden-cta-btn" (click)="editProfileClick.emit()">
              Edit Profile
            </button>
          }
        </div>
      } @else {
        <div class="madden-stat-group">
          <div class="madden-stat-grid">
            @if (profile.user()?.gpa) {
              <div class="madden-stat-card">
                <span class="madden-stat-value">{{ profile.user()?.gpa }}</span>
                <span class="madden-stat-label">GPA</span>
              </div>
            }
            @if (profile.user()?.act) {
              <div class="madden-stat-card">
                <span class="madden-stat-value">{{ profile.user()?.act }}</span>
                <span class="madden-stat-label">ACT</span>
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .madden-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 48px 24px;
        color: var(--m-text-2, rgba(255, 255, 255, 0.6));
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--m-text);
        margin: 16px 0 8px;
      }
      .madden-empty p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
        max-width: 280px;
      }
      .madden-cta-btn {
        background: var(--m-accent);
        color: #000;
        border: none;
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: filter 0.15s;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }

      .madden-stat-group {
        margin-bottom: 24px;
      }
      .madden-stat-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 160px));
        gap: 10px;
      }
      .madden-stat-card {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px;
        border-radius: 8px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .madden-stat-value {
        font-size: 20px;
        font-weight: 800;
        color: var(--m-text);
      }
      .madden-stat-label {
        font-size: 12px;
        color: var(--m-text-2);
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class ProfileAcademicWebComponent {
  protected readonly profile = inject(ProfileService);
  readonly editProfileClick = output<void>();
}
