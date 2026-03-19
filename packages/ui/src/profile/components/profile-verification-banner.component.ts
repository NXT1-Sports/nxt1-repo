/**
 * @fileoverview Profile Verification Banner Component
 * @module @nxt1/ui/profile/components
 *
 * Shared profile section component used by both web and mobile shells.
 * Data-driven verification banner — renders ONLY when the user's
 * `verifications[]` array contains entries matching the active tab's scope.
 * No mock data, no static mappings.
 */
import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NxtImageComponent } from '../../components/image';
import { getVerificationScopesForTab } from '@nxt1/core';
import type { DataVerification, ProfileUser } from '@nxt1/core';

@Component({
  selector: 'nxt1-profile-verification-banner',
  standalone: true,
  imports: [NgTemplateOutlet, NxtImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (activeVerifications().length > 0) {
      <div class="profile-verification-banner" role="status">
        <span class="verified-by__label">Verified by</span>
        @for (v of activeVerifications(); track v.scope) {
          @if (v.sourceUrl) {
            <a
              class="verified-by__chip"
              [href]="v.sourceUrl"
              target="_blank"
              rel="noopener noreferrer"
              [attr.aria-label]="'Verified by ' + v.verifiedBy + ' (opens in new tab)'"
            >
              <ng-container
                *ngTemplateOutlet="chipContent; context: { $implicit: v }"
              ></ng-container>
            </a>
          } @else {
            <span class="verified-by__chip" [attr.aria-label]="'Verified by ' + v.verifiedBy">
              <ng-container
                *ngTemplateOutlet="chipContent; context: { $implicit: v }"
              ></ng-container>
            </span>
          }
        }
      </div>
    }

    <ng-template #chipContent let-v>
      @if (v.sourceLogoUrl) {
        <nxt1-image
          class="verified-by__logo"
          [src]="v.sourceLogoUrl"
          [alt]="v.verifiedBy + ' logo'"
          [width]="60"
          [height]="14"
          fit="contain"
          [showPlaceholder]="false"
        />
      }
      <span class="verified-by__name">{{ v.verifiedBy }}</span>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .profile-verification-banner {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
        padding: var(--nxt1-spacing-3);
        margin: 0 0 var(--nxt1-spacing-5, 1.25rem);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-xl, 16px);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.03));
      }
      .verified-by__label {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.6));
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        white-space: nowrap;
      }
      .verified-by__chip {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5, 0.375rem);
        padding: 0.375rem 0.625rem;
        border-radius: var(--nxt1-radius-full, 999px);
        text-decoration: none;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.8));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04)) 75%,
          transparent
        );
        transition:
          border-color var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out),
          background var(--nxt1-duration-fast, 120ms) var(--nxt1-easing-out, ease-out);
      }
      .verified-by__chip:hover {
        border-color: var(--nxt1-color-primary, #d4ff00);
        background: color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 10%, transparent);
      }
      .verified-by__logo {
        width: 16px;
        height: 16px;
        object-fit: contain;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .verified-by__name {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        line-height: 1;
      }
      @media (max-width: 640px) {
        .profile-verification-banner {
          padding: var(--nxt1-spacing-2-5, 0.625rem);
          margin: 0 0 var(--nxt1-spacing-4, 1rem);
        }
        .verified-by__chip {
          padding: 0.3125rem 0.5625rem;
        }
      }
    `,
  ],
})
export class ProfileVerificationBannerComponent {
  /** Current active tab from parent */
  readonly activeTab = input.required<string>();

  /** Current active side tab from parent */
  readonly activeSideTab = input<string>('');

  /** The profile user object — source of truth for verifications */
  readonly profileUser = input<ProfileUser | null>(null);

  /**
   * Resolves the active DataVerification entries for the current tab.
   * Reads directly from `profileUser().verifications[]` — no legacy fields,
   * no static mappings. Returns empty array when nothing is verified,
   * which collapses the banner from the DOM.
   */
  protected readonly activeVerifications = computed<readonly DataVerification[]>(() => {
    const user = this.profileUser();
    const verifications = user?.verifications;
    if (!verifications?.length) return [];

    const scopes = getVerificationScopesForTab(this.activeTab(), this.activeSideTab());
    if (!scopes.length) return [];

    const scopeSet = new Set(scopes);
    return verifications.filter((v) => scopeSet.has(v.scope));
  });
}
