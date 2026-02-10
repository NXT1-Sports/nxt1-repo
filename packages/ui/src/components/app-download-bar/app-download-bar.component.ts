/**
 * @fileoverview NxtAppDownloadBarComponent - Sticky App Download Promotion Bar
 * @module @nxt1/ui/components/app-download-bar
 * @version 1.0.0
 *
 * A professional sticky bar that slides up from the bottom of the viewport
 * when the user scrolls down. Promotes the NXT1 mobile app with platform-aware
 * content: QR codes on desktop, direct store buttons on mobile.
 *
 * Design Philosophy:
 * - Follows the "smart banner" pattern used by Instagram, Twitter/X, TikTok
 * - 100% design token aware — adapts to dark/light/sport themes
 * - Unobtrusive: slides in smoothly, easy to dismiss
 * - Responsive: QR codes on desktop, store buttons on mobile
 * - SSR-safe with platform detection
 *
 * Features:
 * - Slide-up animation triggered by scroll threshold
 * - Desktop: Dual QR codes (App Store + Google Play)
 * - Mobile: Direct download buttons with store branding
 * - Dismiss button with localStorage persistence
 * - Backdrop blur glass effect for premium look
 * - Safe area handling for notched devices
 * - Full accessibility (ARIA labels, focus management)
 *
 * Usage:
 * ```html
 * <nxt1-app-download-bar (dismissed)="onDismiss()" />
 * ```
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { NxtLogoComponent } from '../logo';

/** App store URLs — single source of truth */
const APP_STORE_URL = 'https://apps.apple.com/us/app/nxt-1/id6446410344';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.nxt1sports.app.twa';

/** QR Code generation base URL */
const QR_BASE_URL = 'https://api.qrserver.com/v1/create-qr-code/';

@Component({
  selector: 'nxt1-app-download-bar',
  standalone: true,
  imports: [NxtLogoComponent],
  host: {
    '[class.visible]': 'visible()',
    '[style.bottom.px]': 'bottomOffset()',
  },
  template: `
    <div class="download-bar" role="complementary" aria-label="Download the NXT 1 app">
      <div class="download-bar__inner">
        <!-- Left: Logo + Text -->
        <div class="download-bar__info">
          <div class="download-bar__logo">
            <nxt1-logo size="sm" />
          </div>
          <div class="download-bar__text">
            <span class="download-bar__title">Download NXT1</span>
            <span class="download-bar__subtitle">The #1 Exposure & Marketing Platform</span>
          </div>
        </div>

        <!-- Desktop: QR Codes -->
        <div class="download-bar__qr desktop-only">
          <!-- App Store QR -->
          <a
            [href]="appStoreUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="download-bar__qr-item"
            aria-label="Scan QR code to download on the App Store"
          >
            <div class="download-bar__qr-code">
              <img
                [src]="appStoreQrUrl"
                alt="App Store QR Code"
                loading="lazy"
                width="56"
                height="56"
              />
            </div>
            <div class="download-bar__qr-label">
              <svg
                class="download-bar__store-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
                />
              </svg>
              <span>App Store</span>
            </div>
          </a>

          <!-- Google Play QR -->
          <a
            [href]="googlePlayUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="download-bar__qr-item"
            aria-label="Scan QR code to get it on Google Play"
          >
            <div class="download-bar__qr-code">
              <img
                [src]="googlePlayQrUrl"
                alt="Google Play QR Code"
                loading="lazy"
                width="56"
                height="56"
              />
            </div>
            <div class="download-bar__qr-label">
              <svg
                class="download-bar__store-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"
                />
              </svg>
              <span>Google Play</span>
            </div>
          </a>
        </div>

        <!-- Mobile: Store Buttons -->
        <div class="download-bar__buttons mobile-only">
          <!-- App Store Button -->
          <a
            [href]="appStoreUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="download-bar__store-btn download-bar__store-btn--ios"
            aria-label="Download on the App Store"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
              />
            </svg>
            <div class="download-bar__btn-text">
              <span class="download-bar__btn-label">Download on</span>
              <span class="download-bar__btn-store">App Store</span>
            </div>
          </a>

          <!-- Google Play Button -->
          <a
            [href]="googlePlayUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="download-bar__store-btn download-bar__store-btn--android"
            aria-label="Get it on Google Play"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"
              />
            </svg>
            <div class="download-bar__btn-text">
              <span class="download-bar__btn-label">Get it on</span>
              <span class="download-bar__btn-store">Google Play</span>
            </div>
          </a>
        </div>

        <!-- Close / Dismiss -->
        <button
          type="button"
          class="download-bar__close"
          (click)="onDismiss()"
          aria-label="Dismiss download banner"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
       * HOST — Floating pill positioned at bottom center
       * ============================================ */
      :host {
        display: flex;
        justify-content: center;
        position: fixed;
        bottom: 16px;
        left: var(--nxt1-spacing-4, 16px);
        right: var(--nxt1-spacing-4, 16px);
        z-index: 999;
        pointer-events: none;

        /* Smooth bidirectional slide — GPU-accelerated */
        transform: translateY(calc(100% + 48px));
        transition: transform 0.45s cubic-bezier(0.32, 0.72, 0, 1);
        will-change: transform;
      }

      :host(.visible) {
        transform: translateY(0);
      }

      /* Mobile: tighter side margins */
      @media (max-width: 767px) {
        :host {
          left: var(--nxt1-spacing-3, 12px);
          right: var(--nxt1-spacing-3, 12px);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        :host {
          transition: opacity 0.2s ease;
          transform: none;
          opacity: 0;
        }
        :host(.visible) {
          opacity: 1;
        }
      }

      /* ============================================
       * PILL CONTAINER
       * ============================================ */
      .download-bar {
        pointer-events: auto;
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-2xl, 20px);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        max-width: 680px;
        width: 100%;

        /* Floating shadow */
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.35),
          0 2px 8px rgba(0, 0, 0, 0.2);
      }

      .download-bar__inner {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-3) var(--nxt1-spacing-3)
          var(--nxt1-spacing-4);
        position: relative;
      }

      /* ============================================
       * CLOSE BUTTON — inline at the end
       * ============================================ */
      .download-bar__close {
        width: 28px;
        height: 28px;
        min-width: 28px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: none;
        background: var(--nxt1-color-surface-400);
        color: var(--nxt1-color-text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s ease;
        padding: 0;
        flex-shrink: 0;
        margin-left: var(--nxt1-spacing-1);

        svg {
          width: 14px;
          height: 14px;
        }

        &:hover {
          background: var(--nxt1-color-surface-500);
          color: var(--nxt1-color-text-primary);
          transform: scale(1.05);
        }

        &:active {
          transform: scale(0.95);
        }
      }

      /* ============================================
       * INFO SECTION (Logo + Text)
       * ============================================ */
      .download-bar__info {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-shrink: 1;
        min-width: 0;
        overflow: hidden;
      }

      .download-bar__logo {
        width: 38px;
        height: 38px;
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-300);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .download-bar__text {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }

      .download-bar__title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary);
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .download-bar__subtitle {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-tertiary);
        line-height: 1.3;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* ============================================
       * DESKTOP: QR CODES
       * ============================================ */
      .download-bar__qr {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        margin-left: auto;
      }

      .download-bar__qr-item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        text-decoration: none;
        padding: var(--nxt1-spacing-1);
        border-radius: var(--nxt1-radius-lg, 12px);
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-300);

          .download-bar__qr-code {
            border-color: var(--nxt1-color-primary);
            box-shadow: 0 0 0 2px var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
          }
        }
      }

      .download-bar__qr-code {
        width: 56px;
        height: 56px;
        padding: 3px;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;

        img {
          width: 48px;
          height: 48px;
          border-radius: 3px;
        }
      }

      .download-bar__qr-label {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;

        span {
          font-family: var(--nxt1-fontFamily-brand);
          font-size: 11px;
          font-weight: var(--nxt1-fontWeight-semibold, 600);
          color: var(--nxt1-color-text-secondary);
          white-space: nowrap;
        }
      }

      .download-bar__store-icon {
        width: 14px;
        height: 14px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
       * MOBILE: STORE BUTTONS
       * ============================================ */
      .download-bar__buttons {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        margin-left: auto;
        flex-shrink: 0;
      }

      .download-bar__store-btn {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-300);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-xl, 16px);
        text-decoration: none;
        transition: all 0.15s ease;
        -webkit-tap-highlight-color: transparent;

        svg {
          width: 20px;
          height: 20px;
          color: var(--nxt1-color-text-primary);
          flex-shrink: 0;
        }

        &:hover {
          background: var(--nxt1-color-surface-400);
          border-color: var(--nxt1-color-border-strong);
        }

        &:active {
          transform: scale(0.97);
        }
      }

      .download-bar__btn-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
      }

      .download-bar__btn-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-medium, 500);
        color: var(--nxt1-color-text-tertiary);
        line-height: 1.2;
        white-space: nowrap;
      }

      .download-bar__btn-store {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary);
        line-height: 1.2;
        white-space: nowrap;
      }

      /* ============================================
       * RESPONSIVE
       * ============================================ */
      .desktop-only {
        display: flex;
      }

      .mobile-only {
        display: none;
      }

      @media (max-width: 768px) {
        .desktop-only {
          display: none !important;
        }

        .mobile-only {
          display: flex;
        }

        .download-bar {
          border-radius: var(--nxt1-radius-xl, 16px);
        }

        .download-bar__inner {
          flex-wrap: wrap;
          padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-3);
          gap: var(--nxt1-spacing-2);
        }

        /* Top row: logo + title fills space */
        .download-bar__info {
          flex: 1 1 0%;
        }

        /* Close button: absolute top-right on mobile */
        .download-bar__close {
          position: absolute;
          top: var(--nxt1-spacing-2);
          right: var(--nxt1-spacing-2);
          width: 24px;
          height: 24px;
          min-width: 24px;
          margin-left: 0;

          svg {
            width: 12px;
            height: 12px;
          }
        }

        .download-bar__logo {
          width: 32px;
          height: 32px;
          border-radius: var(--nxt1-radius-md, 8px);
        }

        .download-bar__subtitle {
          display: none;
        }

        .download-bar__title {
          font-size: 13px;
        }

        /* Bottom row: buttons span full width, centered */
        .download-bar__buttons {
          flex: 1 0 100%;
          justify-content: center;
          margin-left: 0;
        }

        .download-bar__store-btn {
          flex: 1;
          justify-content: center;
          padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
          border-radius: var(--nxt1-radius-lg, 12px);

          svg {
            width: 18px;
            height: 18px;
          }
        }
      }

      /* Extra small: keep button text visible, just tighten padding */
      @media (max-width: 380px) {
        .download-bar__store-btn {
          padding: var(--nxt1-spacing-2);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAppDownloadBarComponent {
  /** Whether the bar is in the visible (slid-up) state — drives CSS transition */
  readonly visible = input(false);

  /** Bottom offset in px — dynamically adjusted for mobile footer */
  readonly bottomOffset = input(16);

  /** Emitted when the user dismisses the bar */
  readonly dismissed = output<void>();

  // ============================================
  // STORE URLS
  // ============================================

  /** App Store URL */
  readonly appStoreUrl = APP_STORE_URL;

  /** Google Play URL */
  readonly googlePlayUrl = GOOGLE_PLAY_URL;

  // ============================================
  // QR CODE URLS
  // ============================================

  /** QR Code URL for App Store (dark background for dark theme) */
  get appStoreQrUrl(): string {
    return `${QR_BASE_URL}?size=128x128&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=1a1a1a&color=ffffff&margin=1`;
  }

  /** QR Code URL for Google Play (dark background for dark theme) */
  get googlePlayQrUrl(): string {
    return `${QR_BASE_URL}?size=128x128&data=${encodeURIComponent(GOOGLE_PLAY_URL)}&bgcolor=1a1a1a&color=ffffff&margin=1`;
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  /** Handle dismiss button click */
  onDismiss(): void {
    this.dismissed.emit();
  }
}
