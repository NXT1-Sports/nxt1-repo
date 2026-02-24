/**
 * @fileoverview NxtAppStoreBadgesComponent — App Store & Google Play Download Badges
 * @module @nxt1/ui/components/app-store-badges
 * @version 1.0.0
 *
 * Reusable, inline pair of App Store + Google Play download buttons.
 * 100% design-token styling. SSR-safe (external links only, no browser APIs).
 *
 * Supports two layout variants:
 *  - `row`  (default) — side by side
 *  - `stack` — vertical stack for narrow containers
 *
 * @example
 * ```html
 * <!-- Default row layout -->
 * <nxt1-app-store-badges />
 *
 * <!-- Stacked layout -->
 * <nxt1-app-store-badges layout="stack" />
 *
 * <!-- Custom URLs -->
 * <nxt1-app-store-badges
 *   [appStoreUrl]="customAppleUrl"
 *   [googlePlayUrl]="customGoogleUrl"
 * />
 * ```
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Badge layout direction. */
export type AppStoreBadgeLayout = 'row' | 'stack';

/** Default store URLs for NXT1. */
const NXT1_APP_STORE_URL = 'https://apps.apple.com/us/app/nxt-1/id6446410344';
const NXT1_GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.nxt1sports.app.twa';

@Component({
  selector: 'nxt1-app-store-badges',
  standalone: true,
  template: `
    <div
      class="store-badges"
      [class.store-badges--stack]="layout() === 'stack'"
      role="group"
      aria-label="Download the NXT1 app"
    >
      <!-- Apple App Store -->
      <a
        [href]="appStoreUrl()"
        target="_blank"
        rel="noopener noreferrer"
        class="store-badges__btn"
        aria-label="Download on the App Store"
      >
        <svg class="store-badges__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
          />
        </svg>
        <div class="store-badges__text">
          <span class="store-badges__label">Download on</span>
          <span class="store-badges__name">App Store</span>
        </div>
      </a>

      <!-- Google Play Store -->
      <a
        [href]="googlePlayUrl()"
        target="_blank"
        rel="noopener noreferrer"
        class="store-badges__btn"
        aria-label="Get it on Google Play"
      >
        <svg class="store-badges__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"
          />
        </svg>
        <div class="store-badges__text">
          <span class="store-badges__label">Get it on</span>
          <span class="store-badges__name">Google Play</span>
        </div>
      </a>
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .store-badges {
        display: flex;
        gap: var(--nxt1-spacing-2_5, 10px);
      }

      .store-badges--stack {
        flex-direction: column;
      }

      .store-badges__btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2_5, 10px) var(--nxt1-spacing-5, 20px);
        min-width: var(--nxt1-spacing-40, 160px);
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg, 8px);
        text-decoration: none;
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        transition:
          background var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease-out),
          border-color var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease-out),
          transform var(--nxt1-motion-duration-fast, 150ms)
            var(--nxt1-motion-easing-standard, ease-out);
      }

      .store-badges__btn:hover {
        background: var(--nxt1-color-surface-300);
        border-color: var(--nxt1-color-border-subtle);
      }

      .store-badges__btn:active {
        transform: scale(0.97);
      }

      .store-badges__btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary);
        outline-offset: 2px;
      }

      .store-badges__icon {
        width: var(--nxt1-spacing-5, 20px);
        height: var(--nxt1-spacing-5, 20px);
        flex-shrink: 0;
      }

      .store-badges__text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .store-badges__label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs, 10px);
        font-weight: var(--nxt1-fontWeight-regular, 400);
        color: var(--nxt1-color-text-tertiary);
        line-height: var(--nxt1-lineHeight-tight, 1.25);
      }

      .store-badges__name {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-primary);
        line-height: var(--nxt1-lineHeight-tight, 1.25);
        white-space: nowrap;
      }

      @media (prefers-reduced-motion: reduce) {
        .store-badges__btn {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAppStoreBadgesComponent {
  /** Layout direction. Default: `'row'` (side by side). */
  readonly layout = input<AppStoreBadgeLayout>('row');

  /** Apple App Store URL. */
  readonly appStoreUrl = input<string>(NXT1_APP_STORE_URL);

  /** Google Play Store URL. */
  readonly googlePlayUrl = input<string>(NXT1_GOOGLE_PLAY_URL);
}
