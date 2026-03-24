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
    <section class="acad-section" aria-labelledby="academic-heading">
      <h2 id="academic-heading" class="sr-only">Academic Profile</h2>
      @if (!profile.user()?.gpa && !profile.user()?.sat && !profile.user()?.act) {
        <div class="madden-empty">
          <div class="madden-empty__icon" aria-hidden="true">
            <nxt1-icon name="school-outline" [size]="40" />
          </div>
          <h3>No Academic Info Yet</h3>
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
        <div class="acad-row-label">
          <nxt1-icon name="school-outline" [size]="14" class="acad-row-label__icon" />
          <span>Academic Info</span>
        </div>
        <div class="acad-stats">
          @if (profile.user()?.gpa) {
            <div class="acad-stat">
              <span class="acad-stat__value">{{ profile.user()?.gpa }}</span>
              <span class="acad-stat__label">GPA</span>
            </div>
          }
          @if (profile.user()?.sat) {
            <div class="acad-stat">
              <span class="acad-stat__value">{{ profile.user()?.sat }}</span>
              <span class="acad-stat__label">SAT</span>
            </div>
          }
          @if (profile.user()?.act) {
            <div class="acad-stat">
              <span class="acad-stat__value">{{ profile.user()?.act }}</span>
              <span class="acad-stat__label">ACT</span>
            </div>
          }
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
        padding: 48px 24px;
        text-align: center;
      }
      .madden-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 16px 0 8px;
      }
      .madden-empty__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 4px;
        color: var(--nxt1-color-text-tertiary);
      }
      .madden-empty p {
        font-size: 14px;
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        max-width: 280px;
      }
      .madden-cta-btn {
        margin-top: 12px;
        padding: 10px 24px;
        background: var(--nxt1-color-primary);
        border: none;
        border-radius: 9999px;
        color: #000;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .madden-cta-btn:hover {
        filter: brightness(1.1);
      }
      .madden-cta-btn:active {
        filter: brightness(0.95);
      }

      /* ── SECTION LABEL ROW ── */
      .acad-row-label {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 12px;
      }
      .acad-row-label__icon {
        color: var(--m-text-3);
        flex-shrink: 0;
      }
      .acad-row-label span {
        font-size: 11px;
        font-weight: 600;
        color: var(--m-text-3);
        text-transform: uppercase;
        letter-spacing: 0.09em;
      }

      /* ── STATS ROW — flex so cards never stretch ── */
      .acad-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .acad-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 110px;
        min-height: 80px;
        padding: 14px 8px;
        border-radius: 10px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        flex-shrink: 0;
      }
      .acad-stat__value {
        font-size: 24px;
        font-weight: 800;
        color: var(--m-text);
        line-height: 1;
        margin-bottom: 5px;
      }
      .acad-stat__label {
        font-size: 11px;
        font-weight: 600;
        color: var(--m-text-3);
        text-transform: uppercase;
        letter-spacing: 0.07em;
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
