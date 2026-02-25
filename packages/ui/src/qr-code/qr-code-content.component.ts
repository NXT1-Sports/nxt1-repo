/**
 * @fileoverview QR Code Content Component - Shared QR Code Display
 * @module @nxt1/ui/qr-code
 * @version 1.0.0
 *
 * The shared visual component that renders the QR code card with:
 * - User avatar + name
 * - Large scannable QR code
 * - Copy URL / Share / Download actions
 * - NXT1 branding
 *
 * This component is used inside both:
 * - Web centered modal (QrCodeWebModalService)
 * - Mobile bottom sheet (QrCodeBottomSheetService)
 *
 * Uses the `qrcode` npm package for canvas-based QR generation.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  Input,
  output,
  afterNextRender,
  ElementRef,
  viewChild,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NxtIconComponent } from '../components/icon/icon.component';
import { NxtAvatarComponent } from '../components/avatar/avatar.component';
import { NxtLogoComponent } from '../components/logo/logo.component';
import { NxtToastService } from '../services/toast';
import { NxtLoggingService } from '../services/logging';

@Component({
  selector: 'nxt1-qr-code-content',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtAvatarComponent, NxtLogoComponent],
  template: `
    <!-- ═══════════════════════════════════════════════════════════
         QR CODE CARD — Horizontal on desktop, vertical on mobile
         ═══════════════════════════════════════════════════════════ -->
    <div class="qr-code-container">
      <!-- ─── HEADER (mobile only — desktop has inline close) ─── -->
      <div class="qr-header qr-mobile-only">
        <button type="button" class="qr-close-btn" (click)="close.emit()" aria-label="Close">
          <nxt1-icon name="close" [size]="22" />
        </button>
        <span class="qr-header-title">QR Code</span>
        <div class="qr-header-spacer"></div>
      </div>

      <!-- ─── HORIZONTAL BODY (splits into left + right on desktop) ─── -->
      <div class="qr-body">
        <!-- ══ LEFT PANEL: Profile identity + actions ══ -->
        <div class="qr-left-panel">
          <div class="qr-identity">
            <nxt1-avatar [src]="profileImg" [name]="displayName" size="xl" shape="circle" />
            <h2 class="qr-display-name">{{ displayName }}</h2>
            @if (sport) {
              <span class="qr-sport-badge">{{ sport }}</span>
            }
          </div>

          <!-- URL display -->
          <div class="qr-url-display">
            <span class="qr-url-text">{{ truncatedUrl() }}</span>
          </div>

          <!-- Actions -->
          <div class="qr-actions">
            <button
              type="button"
              class="qr-action-btn qr-action-primary"
              (click)="onCopyUrl()"
              [attr.aria-label]="copied() ? 'Copied!' : 'Copy link'"
            >
              <nxt1-icon [name]="copied() ? 'checkmark' : 'link'" [size]="20" />
              <span>{{ copied() ? 'Copied!' : 'Copy Link' }}</span>
            </button>

            <button
              type="button"
              class="qr-action-btn"
              (click)="onShare()"
              aria-label="Share profile"
            >
              <nxt1-icon name="share" [size]="20" />
              <span>Share</span>
            </button>

            <button
              type="button"
              class="qr-action-btn"
              (click)="onDownload()"
              aria-label="Download QR code"
            >
              <nxt1-icon name="download" [size]="20" />
              <span>Save</span>
            </button>
          </div>

          <!-- Branding (desktop only — shown below actions) -->
          <div class="qr-footer qr-desktop-only">
            <nxt1-logo variant="footer" size="sm" />
          </div>
        </div>

        <!-- ══ RIGHT PANEL: QR code ══ -->
        <div class="qr-right-panel">
          <!-- Desktop close button (top-right corner) -->
          <button
            type="button"
            class="qr-close-btn qr-desktop-close qr-desktop-only"
            (click)="close.emit()"
            aria-label="Close"
          >
            <nxt1-icon name="close" [size]="20" />
          </button>

          <div class="qr-code-card">
            @if (loading()) {
              <div class="qr-skeleton">
                <div class="qr-skeleton-inner"></div>
              </div>
            } @else if (error()) {
              <div class="qr-error">
                <nxt1-icon name="alertCircle" [size]="32" />
                <p>Failed to generate QR code</p>
                <button type="button" class="qr-retry-btn" (click)="generateQrCode()">
                  Try Again
                </button>
              </div>
            } @else {
              <canvas
                #qrCanvas
                class="qr-canvas"
                [attr.aria-label]="'QR code for ' + displayName + ' profile'"
                role="img"
              ></canvas>
            }

            <!-- NXT1 Logo Watermark -->
            <div class="qr-logo-overlay">
              <nxt1-logo variant="default" size="xs" />
            </div>
          </div>

          <p class="qr-instruction">Scan to view profile</p>
        </div>
      </div>

      <!-- ─── BRANDING FOOTER (mobile only) ─── -->
      <div class="qr-footer qr-mobile-only">
        <nxt1-logo variant="footer" size="sm" />
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         QR CODE CONTENT — Responsive Layout
         Mobile: vertical stack
         Desktop (≥768px): horizontal split
         ============================================ */

      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      .qr-code-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-5, 1.25rem);
        padding-bottom: calc(var(--nxt1-spacing-6, 1.5rem) + env(safe-area-inset-bottom, 0px));
        min-height: 100%;
        gap: var(--nxt1-spacing-4, 1rem);
      }

      /* ─── RESPONSIVE VISIBILITY ─── */
      .qr-desktop-only {
        display: none;
      }
      .qr-mobile-only {
        display: flex;
      }

      @media (min-width: 768px) {
        .qr-desktop-only {
          display: flex;
        }
        .qr-mobile-only {
          display: none !important;
        }
      }

      /* ─── HEADER (mobile top bar) ─── */
      .qr-header {
        display: flex;
        align-items: center;
        width: 100%;
        padding-bottom: var(--nxt1-spacing-1, 0.25rem);
      }

      .qr-close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
        color: var(--nxt1-color-text-secondary, #6b7280);
        cursor: pointer;
        transition:
          background-color 0.15s ease,
          color 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .qr-close-btn:hover {
        background: var(--nxt1-color-surface-300, rgba(0, 0, 0, 0.1));
        color: var(--nxt1-color-text-primary, #111827);
      }

      .qr-close-btn:active {
        transform: scale(0.95);
      }

      .qr-header-title {
        flex: 1;
        text-align: center;
        font-size: var(--nxt1-fontSize-md, 1.125rem);
        font-weight: var(--nxt1-fontWeight-semibold, 600);
        color: var(--nxt1-color-text-primary, #111827);
        letter-spacing: -0.01em;
      }

      .qr-header-spacer {
        width: 36px;
      }

      /* ─── BODY: Vertical (mobile) / Horizontal (desktop) ─── */
      .qr-body {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-5, 1.25rem);
        width: 100%;
      }

      @media (min-width: 768px) {
        .qr-body {
          flex-direction: row;
          align-items: stretch;
          gap: var(--nxt1-spacing-8, 2rem);
        }
      }

      /* ─── LEFT PANEL: Identity + Actions ─── */
      .qr-left-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-4, 1rem);
      }

      @media (min-width: 768px) {
        .qr-left-panel {
          flex: 1;
          align-items: flex-start;
          justify-content: center;
          min-width: 0;
        }
      }

      /* ─── RIGHT PANEL: QR Code ─── */
      .qr-right-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        position: relative;
      }

      @media (min-width: 768px) {
        .qr-right-panel {
          flex-shrink: 0;
          padding-left: var(--nxt1-spacing-6, 1.5rem);
          border-left: 1px solid var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.06));
        }
      }

      /* Desktop close button — top right of QR panel */
      .qr-desktop-close {
        position: absolute;
        top: 0;
        right: 0;
        width: 32px;
        height: 32px;
        z-index: 2;
        background: var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.05));
      }

      /* ─── PROFILE IDENTITY ─── */
      .qr-identity {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
      }

      @media (min-width: 768px) {
        .qr-identity {
          align-items: flex-start;
        }
      }

      .qr-display-name {
        margin: 0;
        font-size: var(--nxt1-fontSize-lg, 1.25rem);
        font-weight: var(--nxt1-fontWeight-bold, 700);
        color: var(--nxt1-color-text-primary, #111827);
        letter-spacing: -0.02em;
        line-height: 1.3;
      }

      @media (min-width: 768px) {
        .qr-display-name {
          font-size: var(--nxt1-fontSize-xl, 1.5rem);
          text-align: left;
        }
      }

      .qr-sport-badge {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-3, 0.75rem);
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: var(--nxt1-color-primary-50, rgba(59, 130, 246, 0.08));
        color: var(--nxt1-color-primary-600, #2563eb);
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      /* ─── QR CODE CARD ─── */
      .qr-code-card {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 220px;
        height: 220px;
        padding: var(--nxt1-spacing-4, 1rem);
        border-radius: var(--nxt1-borderRadius-2xl, 1.5rem);
        background: #ffffff;
        box-shadow:
          0 1px 3px rgba(0, 0, 0, 0.06),
          0 4px 12px rgba(0, 0, 0, 0.04);
        border: 1px solid var(--nxt1-color-surface-200, rgba(0, 0, 0, 0.06));
      }

      @media (min-width: 768px) {
        .qr-code-card {
          width: 240px;
          height: 240px;
        }
      }

      @media (prefers-color-scheme: dark) {
        .qr-code-card {
          background: #ffffff;
          border-color: rgba(255, 255, 255, 0.1);
        }
      }

      .qr-canvas {
        width: 100% !important;
        height: 100% !important;
        border-radius: var(--nxt1-borderRadius-lg, 0.75rem);
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
      }

      .qr-logo-overlay {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border-radius: var(--nxt1-borderRadius-lg, 0.75rem);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
      }

      .qr-instruction {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, #9ca3af);
        font-weight: var(--nxt1-fontWeight-regular, 400);
      }

      /* ─── SKELETON / LOADING ─── */
      .qr-skeleton {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .qr-skeleton-inner {
        width: 75%;
        height: 75%;
        border-radius: var(--nxt1-borderRadius-md, 0.5rem);
        background: linear-gradient(
          110deg,
          var(--nxt1-color-surface-200, #f3f4f6) 30%,
          var(--nxt1-color-surface-100, #f9fafb) 50%,
          var(--nxt1-color-surface-200, #f3f4f6) 70%
        );
        background-size: 200% 100%;
        animation: qr-shimmer 1.5s ease-in-out infinite;
      }

      @keyframes qr-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* ─── ERROR STATE ─── */
      .qr-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        color: var(--nxt1-color-text-tertiary, #9ca3af);
        text-align: center;
      }

      .qr-error p {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
      }

      .qr-retry-btn {
        border: none;
        background: none;
        color: var(--nxt1-color-primary-600, #2563eb);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        cursor: pointer;
        padding: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-2, 0.5rem);
      }

      /* ─── URL DISPLAY ─── */
      .qr-url-display {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-2, 0.5rem) var(--nxt1-spacing-4, 1rem);
        border-radius: var(--nxt1-borderRadius-xl, 1rem);
        background: var(--nxt1-color-surface-100, rgba(0, 0, 0, 0.03));
        max-width: 100%;
      }

      .qr-url-text {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
        color: var(--nxt1-color-text-secondary, #6b7280);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 280px;
        user-select: all;
      }

      /* ─── ACTIONS ─── */
      .qr-actions {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        padding: var(--nxt1-spacing-2, 0.5rem) 0;
      }

      @media (min-width: 768px) {
        .qr-actions {
          justify-content: flex-start;
        }
      }

      .qr-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        padding: var(--nxt1-spacing-2-5, 0.625rem) var(--nxt1-spacing-4, 1rem);
        border: 1px solid var(--nxt1-color-surface-300, rgba(0, 0, 0, 0.1));
        border-radius: var(--nxt1-borderRadius-xl, 1rem);
        background: var(--nxt1-color-bg-primary, #ffffff);
        color: var(--nxt1-color-text-primary, #111827);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        cursor: pointer;
        transition: all 0.15s ease;
        -webkit-tap-highlight-color: transparent;
        white-space: nowrap;
        flex: 1;
        max-width: 140px;
      }

      @media (min-width: 768px) {
        .qr-action-btn {
          flex: 0 0 auto;
          max-width: none;
        }
      }

      .qr-action-btn:hover {
        background: var(--nxt1-color-surface-100, #f9fafb);
        border-color: var(--nxt1-color-surface-400, rgba(0, 0, 0, 0.15));
      }

      .qr-action-btn:active {
        transform: scale(0.97);
      }

      .qr-action-primary {
        background: var(--nxt1-color-primary-600, #2563eb);
        color: #ffffff;
        border-color: var(--nxt1-color-primary-600, #2563eb);
      }

      .qr-action-primary:hover {
        background: var(--nxt1-color-primary-700, #1d4ed8);
        border-color: var(--nxt1-color-primary-700, #1d4ed8);
      }

      /* ─── BRANDING FOOTER ─── */
      .qr-footer {
        display: flex;
        align-items: center;
        justify-content: center;
        padding-top: var(--nxt1-spacing-2, 0.5rem);
        opacity: 0.4;
      }

      @media (min-width: 768px) {
        .qr-footer {
          justify-content: flex-start;
          padding-top: var(--nxt1-spacing-4, 1rem);
        }
      }

      /* ─── ACCESSIBILITY ─── */
      @media (prefers-reduced-motion: reduce) {
        .qr-skeleton-inner {
          animation: none;
        }
        .qr-close-btn:active,
        .qr-action-btn:active {
          transform: none;
        }
      }

      @media (forced-colors: active) {
        .qr-code-card {
          border: 2px solid CanvasText;
        }
        .qr-action-btn {
          border: 1px solid ButtonText;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtQrCodeContentComponent {
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('QrCodeContent');
  private readonly platformId = inject(PLATFORM_ID);

  private readonly qrCanvas = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

  // ============================================
  // INPUTS
  // ============================================

  /** Full URL to encode in the QR code */
  @Input() url = '';

  /** Display name shown above the QR code */
  @Input() displayName = '';

  /** Profile image URL */
  @Input() profileImg = '';

  /** Primary sport */
  @Input() sport = '';

  // ============================================
  // OUTPUTS
  // ============================================

  /** Emitted when the user closes the modal */
  readonly close = output<void>();

  /** Emitted when a share action is taken */
  readonly action = output<'copy' | 'share' | 'download'>();

  // ============================================
  // INTERNAL STATE
  // ============================================

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly copied = signal(false);
  private copyTimeout: ReturnType<typeof setTimeout> | null = null;

  /** URL truncated for display */
  protected readonly truncatedUrl = computed(() => {
    const url = this.url;
    if (!url) return '';
    try {
      const parsed = new URL(url);
      const display = parsed.hostname + parsed.pathname;
      return display.length > 40 ? display.substring(0, 37) + '...' : display;
    } catch {
      return url.length > 40 ? url.substring(0, 37) + '...' : url;
    }
  });

  constructor() {
    afterNextRender(() => {
      this.generateQrCode();
    });
  }

  // ============================================
  // QR CODE GENERATION
  // ============================================

  async generateQrCode(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.url) {
      this.error.set(true);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(false);

    try {
      // Dynamically import qrcode to keep bundle size optimal
      const QRCode = await import('qrcode');

      // Wait for canvas to be available after loading state clears
      this.loading.set(false);

      // Use requestAnimationFrame to ensure the canvas element is rendered
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const canvasRef = this.qrCanvas();
      if (!canvasRef?.nativeElement) {
        this.logger.warn('QR canvas element not found');
        this.error.set(true);
        return;
      }

      const canvas = canvasRef.nativeElement;

      await QRCode.toCanvas(canvas, this.url, {
        width: 220,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: 'H', // High — allows logo overlay without breaking scan
      });

      this.logger.info('QR code generated', { url: this.url });
    } catch (err) {
      this.logger.error('Failed to generate QR code', err);
      this.error.set(true);
      this.loading.set(false);
    }
  }

  // ============================================
  // ACTIONS
  // ============================================

  async onCopyUrl(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    try {
      await navigator.clipboard.writeText(this.url);
      this.copied.set(true);
      this.toast.success('Link copied');
      this.action.emit('copy');

      if (this.copyTimeout) clearTimeout(this.copyTimeout);
      this.copyTimeout = setTimeout(() => this.copied.set(false), 2500);
    } catch {
      // Fallback for older browsers
      this.fallbackCopy(this.url);
    }
  }

  async onShare(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const shareData: ShareData = {
      title: `${this.displayName} — NXT1 Profile`,
      text: `Check out ${this.displayName}'s profile on NXT1`,
      url: this.url,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        this.action.emit('share');
      } else {
        // Fallback: copy URL
        await this.onCopyUrl();
      }
    } catch (err) {
      // User cancelled share — not an error
      if ((err as DOMException)?.name !== 'AbortError') {
        this.logger.warn('Share failed', { error: String(err) });
      }
    }
  }

  async onDownload(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const canvasRef = this.qrCanvas();
    if (!canvasRef?.nativeElement) return;

    try {
      const canvas = canvasRef.nativeElement;
      const dataUrl = canvas.toDataURL('image/png', 1.0);

      const link = document.createElement('a');
      link.download = `${this.displayName || 'nxt1'}-qr-code.png`;
      link.href = dataUrl;
      link.click();

      this.toast.success('QR code saved');
      this.action.emit('download');
    } catch (err) {
      this.logger.error('Failed to download QR code', err);
      this.toast.error('Failed to save QR code');
    }
  }

  private fallbackCopy(text: string): void {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      this.copied.set(true);
      this.toast.success('Link copied');
      this.action.emit('copy');

      if (this.copyTimeout) clearTimeout(this.copyTimeout);
      this.copyTimeout = setTimeout(() => this.copied.set(false), 2500);
    } catch {
      this.toast.error('Failed to copy link');
    }
  }
}
