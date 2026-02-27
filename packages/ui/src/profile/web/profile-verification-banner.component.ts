/**
 * @fileoverview Profile Verification Banner Component - Web
 * @module @nxt1/ui/profile/web
 *
 * Extracted from ProfileShellWebComponent.
 * Per-tab verification banner showing data source provider info.
 */
import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';

@Component({
  selector: 'nxt1-profile-verification-banner',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showVerificationBanner()) {
      <div class="profile-verification-banner" role="status">
        @if (isProfileVerified()) {
          <span class="verified-by__label">Verified by</span>
          @if (verificationProviderUrl(); as providerUrl) {
            <a
              class="verified-by__chip"
              [href]="providerUrl"
              target="_blank"
              rel="noopener noreferrer"
              [attr.aria-label]="
                'Verified by ' +
                (verificationProvider() || 'verification provider') +
                ' (opens in new tab)'
              "
            >
              <ng-container *ngTemplateOutlet="verifiedChipContent"></ng-container>
            </a>
          } @else {
            <span
              class="verified-by__chip"
              [attr.aria-label]="
                'Verified by ' + (verificationProvider() || 'verification provider')
              "
            >
              <ng-container *ngTemplateOutlet="verifiedChipContent"></ng-container>
            </span>
          }
        } @else {
          <span class="verified-by__chip verified-by__chip--unverified">
            <nxt1-icon name="alertCircle" [size]="14" />
            <span class="verified-by__name">Not Verified</span>
          </span>
        }
      </div>
    }

    <!-- Reusable chip content (DRY — logo + name) -->
    <ng-template #verifiedChipContent>
      @if (verificationProviderLogoSrc(); as logoSrc) {
        <nxt1-image
          class="verified-by__logo"
          [src]="logoSrc"
          [alt]="(verificationProvider() || 'provider') + ' logo'"
          [width]="60"
          [height]="14"
          fit="contain"
          [showPlaceholder]="false"
        />
      }
      @if (verificationProvider(); as providerName) {
        <span class="verified-by__name">{{ providerName }}</span>
      }
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
      .verified-by__chip--unverified {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.6));
        border-color: var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.12));
        background: color-mix(
          in srgb,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04)) 75%,
          transparent
        );
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

  // ── Static provider config ──

  private static readonly VERIFICATION_PROVIDERS: Readonly<
    Record<
      string,
      {
        readonly displayName: string;
        readonly url: string;
        readonly logoSrc: string;
        readonly fallbackLogoSrc: string;
      }
    >
  > = {
    maxpreps: {
      displayName: 'MaxPreps',
      url: 'https://www.maxpreps.com',
      logoSrc: 'https://logo.clearbit.com/maxpreps.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=maxpreps.com&sz=64',
    },
    prepsports: {
      displayName: 'PrepSports',
      url: 'https://www.prepsports.com',
      logoSrc: 'https://logo.clearbit.com/prepsports.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=prepsports.com&sz=64',
    },
    rivals: {
      displayName: 'Rivals',
      url: 'https://www.rivals.com',
      logoSrc: 'https://logo.clearbit.com/rivals.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=rivals.com&sz=64',
    },
    twitter: {
      displayName: 'Twitter',
      url: 'https://x.com',
      logoSrc: 'https://logo.clearbit.com/x.com',
      fallbackLogoSrc: 'https://www.google.com/s2/favicons?domain=x.com&sz=64',
    },
    transcript: {
      displayName: 'Transcript',
      url: '',
      logoSrc: '',
      fallbackLogoSrc: '',
    },
  };

  private static readonly TAB_VERIFICATION_MAP: Readonly<
    Record<string, string | Readonly<Record<string, string>>>
  > = {
    overview: {
      'player-history': 'rivals',
      awards: 'maxpreps',
      academic: 'transcript',
      contact: 'twitter',
    },
    offers: {
      timeline: 'rivals',
      committed: 'rivals',
      'all-offers': 'rivals',
      interests: 'rivals',
      rankings: 'rivals',
    },
    metrics: 'prepsports',
    stats: 'maxpreps',
    schedule: 'maxpreps',
  };

  private readonly _activeProviderKey = computed<string | null>(() => {
    const tab = this.activeTab();
    const entry = ProfileVerificationBannerComponent.TAB_VERIFICATION_MAP[tab];
    if (!entry) return null;

    if (typeof entry === 'string') return entry;

    const sideTab = this.activeSideTab();
    return (entry as Readonly<Record<string, string>>)[sideTab] ?? null;
  });

  protected readonly showVerificationBanner = computed(() => {
    return this._activeProviderKey() !== null;
  });

  protected readonly verificationProvider = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileVerificationBannerComponent.VERIFICATION_PROVIDERS[key];
    if (provider?.displayName) return provider.displayName;
    return key.charAt(0).toUpperCase() + key.slice(1);
  });

  protected readonly isProfileVerified = computed(() => this._activeProviderKey() !== null);

  protected readonly verificationProviderUrl = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileVerificationBannerComponent.VERIFICATION_PROVIDERS[key];
    return provider?.url || null;
  });

  protected readonly verificationProviderLogoSrc = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileVerificationBannerComponent.VERIFICATION_PROVIDERS[key];
    return provider?.logoSrc || null;
  });

  protected readonly verificationProviderLogoFallbackSrc = computed<string | null>(() => {
    const key = this._activeProviderKey();
    if (!key) return null;
    const provider = ProfileVerificationBannerComponent.VERIFICATION_PROVIDERS[key];
    return provider?.fallbackLogoSrc || null;
  });
}
