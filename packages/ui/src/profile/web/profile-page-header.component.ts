/**
 * @fileoverview Profile Page Header — Desktop
 * @module @nxt1/ui/profile/web
 * @version 3.0.0
 *
 * Desktop header for athlete profile pages.
 * Uses the shared `NxtEntityPageHeaderComponent` for structural layout
 * (row flex, back button, gap, padding) and projects profile-specific
 * content into the identity and trailing slots.
 *
 * Displays: Back arrow → [Name + Subtitle] → [Follow Button]
 *
 * Layout is pixel-aligned with `TeamPageHeaderComponent` because
 * both delegate their flex row to the same shared entity header shell.
 *
 * XP ring + badges are shown in the overview section (same as mobile),
 * NOT in the page header.
 *
 * ⭐ WEB ONLY — SSR-safe, design-token-based ⭐
 */
import { Component, ChangeDetectionStrategy, inject, input, output, computed } from '@angular/core';
import type { ProfileUser } from '@nxt1/core';
import { NxtEntityPageHeaderComponent } from '../../components/entity-page-header';
import { NxtIconComponent } from '../../components/icon';
import { ProfileService } from '../profile.service';

@Component({
  selector: 'nxt1-profile-page-header',
  standalone: true,
  imports: [NxtEntityPageHeaderComponent, NxtIconComponent],
  template: `
    <nxt1-entity-page-header backAriaLabel="Go back" (back)="back.emit()">
      <!-- ═══ IDENTITY: Name + subtitle ═══ -->
      <div headerIdentity>
        <div class="mdh-name-block">
          <div class="mdh-name-row">
            <span class="mdh-last">{{ fullName() }}</span>
          </div>
          @if (subtitleLine()) {
            <div class="mdh-subline">
              <span class="mdh-first">{{ subtitleLine() }}</span>
            </div>
          }
        </div>
      </div>

      <!-- ═══ TRAILING: Edit Profile (own) or Follow (other) ═══ -->
      <div headerTrailing class="mdh-trailing">
        @if (isOwnProfileView()) {
          <button
            type="button"
            class="mdh-edit-btn"
            (click)="editProfile.emit()"
            aria-label="Edit profile"
          >
            <nxt1-icon name="pencil" [size]="13" />
            Edit Profile
          </button>
        } @else {
          <button
            type="button"
            class="mdh-follow-btn"
            [class.mdh-follow-btn--following]="isFollowing()"
            (click)="follow.emit()"
            [attr.aria-label]="isFollowing() ? 'Unfollow athlete' : 'Follow athlete'"
          >
            <nxt1-icon [name]="isFollowing() ? 'checkmark' : 'plus'" [size]="13" />
            {{ isFollowing() ? 'Following' : 'Follow' }}
          </button>
        }
      </div>
    </nxt1-entity-page-header>
  `,
  styles: [
    `
      /* ============================================
         HOST — delegate layout to NxtEntityPageHeaderComponent
         ============================================ */
      :host {
        display: block;
      }

      /* ============================================
         TRAILING — pushed right in the entity header flex row
         ============================================ */
      .mdh-trailing {
        flex-shrink: 0;
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4, 16px);
      }

      /* ============================================
         EDIT PROFILE BUTTON — own profile view
         ============================================ */
      .mdh-edit-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex-shrink: 0;
        border: 1.5px solid var(--nxt1-color-border-secondary, rgba(255, 255, 255, 0.2));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary);
        border-radius: var(--nxt1-radius-md, 8px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 13px;
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: 0.01em;
        line-height: 1;
        padding: 7px 16px;
        cursor: pointer;
        transition:
          transform 0.1s ease,
          background 0.15s ease,
          border-color 0.15s ease;
      }
      .mdh-edit-btn:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
        border-color: var(--nxt1-color-border-primary, rgba(255, 255, 255, 0.35));
      }
      .mdh-edit-btn:active {
        transform: scale(0.97);
      }
      .mdh-edit-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      /* ============================================
         IDENTITY — name block
         ============================================ */
      .mdh-name-block {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .mdh-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        min-width: 0;
      }
      .mdh-subline {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        min-width: 0;
      }
      .mdh-last {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: var(--nxt1-spacing-0-5);
      }
      .mdh-first {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ============================================
         FOLLOW BUTTON — matches team header style
         ============================================ */
      .mdh-follow-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex-shrink: 0;
        border: 1.5px solid var(--nxt1-color-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 12%, transparent);
        color: var(--nxt1-color-primary);
        border-radius: var(--nxt1-radius-md, 8px);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 13px;
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: 0.01em;
        line-height: 1;
        padding: 7px 16px;
        cursor: pointer;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        transition:
          transform 0.1s ease,
          background 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
      }
      .mdh-follow-btn:hover {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-bg-primary);
        border-color: var(--nxt1-color-primary);
      }
      .mdh-follow-btn:active {
        transform: scale(0.97);
      }
      .mdh-follow-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }
      .mdh-follow-btn--following {
        background: transparent;
        border-color: var(--nxt1-color-border-secondary, rgba(255, 255, 255, 0.2));
        color: var(--nxt1-color-text-secondary);
      }
      .mdh-follow-btn--following:hover {
        border-color: var(--nxt1-color-danger, #ef4444);
        color: var(--nxt1-color-danger, #ef4444);
        background: color-mix(in srgb, var(--nxt1-color-danger, #ef4444) 10%, transparent);
      }

      /* ============================================
         RESPONSIVE
         ============================================ */
      @media (max-width: 900px) {
        .mdh-last {
          font-size: var(--nxt1-fontSize-xl);
        }
        .mdh-first {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfilePageHeaderComponent {
  private readonly profile = inject(ProfileService);

  /* ── Inputs / Outputs ── */
  readonly user = input<ProfileUser | null>(null);
  readonly playerCard = input<unknown | null>(null);
  readonly showFollowAction = input(false);
  readonly back = output<void>();
  readonly follow = output<void>();
  readonly editProfile = output<void>();

  /* ── Follow State ── */

  protected readonly isFollowing = computed(() => this.profile.followStats()?.isFollowing ?? false);
  protected readonly isOwnProfileView = computed(() => !this.showFollowAction());

  /* ── Name & Subtitle ── */

  protected readonly fullName = computed(() => {
    const u = this.user();
    if (!u) return '';
    if (u.displayName) return u.displayName.trim();
    const combined = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
    return combined || 'Profile';
  });

  protected readonly subtitleLine = computed(() => {
    // Use activeSport() instead of primarySport for sport-switching support
    const activeSport = this.profile.activeSport();
    const position = activeSport?.position?.trim();
    const jersey = activeSport?.jerseyNumber?.trim();
    if (position && jersey) return `${position} #${jersey}`;
    if (position) return position;
    if (jersey) return `#${jersey}`;
    return '';
  });
}
