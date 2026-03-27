/**
 * @fileoverview QR Code Mobile Component - Mobile Bottom Sheet Layout
 * @module @nxt1/ui/qr-code
 * @version 1.0.0
 *
 * A clean, focused mobile QR code sheet that shows:
 * - Shared sheet header (title left, close right)
 * - Centered QR code card
 * - "Scan to view profile" instruction
 * - Share + Save action buttons
 *
 * No profile image, name, sport, URL display, copy link, or branding logo.
 * Desktop/web uses NxtQrCodeContentComponent instead.
 *
 * ⭐ MOBILE ONLY ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  Input,
  output,
  afterNextRender,
  ElementRef,
  viewChild,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtIconComponent } from '../components/icon/icon.component';
import { NxtLogoComponent } from '../components/logo/logo.component';
import { NxtSheetHeaderComponent } from '../components/bottom-sheet/sheet-header.component';
import { NxtToastService } from '../services/toast';
import { NxtLoggingService } from '../services/logging';

@Component({
  selector: 'nxt1-qr-code-mobile',
  standalone: true,
  imports: [NxtIconComponent, NxtLogoComponent, NxtSheetHeaderComponent],
  template: `
    <div class="qr-sheet">
      <!-- ─── Standard sheet header: title left, close right ─── -->
      <nxt1-sheet-header
        title="QR Code"
        closePosition="right"
        [showBorder]="true"
        (closeSheet)="close.emit()"
      />

      <!-- ─── QR Code centered ─── -->
      <div class="qr-content">
        <div class="qr-card">
          @if (loading()) {
            <div class="qr-skeleton">
              <div class="qr-skeleton-pulse"></div>
            </div>
          } @else if (error()) {
            <div class="qr-error">
              <nxt1-icon name="alertCircle" [size]="32" />
              <p>Failed to generate QR code</p>
              <button type="button" class="qr-retry" (click)="generateQrCode()">Try Again</button>
            </div>
          } @else {
            <canvas
              #qrCanvas
              class="qr-canvas"
              [attr.aria-label]="'QR code for ' + displayName + ' profile'"
              role="img"
            ></canvas>
          }

          <!-- NXT1 watermark in center of QR -->
          <div class="qr-watermark">
            <nxt1-logo variant="default" size="xs" />
          </div>
        </div>

        <p class="qr-hint">Scan to view profile</p>
      </div>

      <!-- ─── Share + Save buttons ─── -->
      <div class="qr-actions">
        <button type="button" class="qr-btn" (click)="onShare()" aria-label="Share profile">
          <nxt1-icon name="share" [size]="20" />
          <span>Share</span>
        </button>

        <button type="button" class="qr-btn" (click)="onDownload()" aria-label="Save QR code">
          <nxt1-icon name="download" [size]="20" />
          <span>Save</span>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      .qr-sheet {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      /* ─── QR Code Area ─── */
      .qr-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-6, 1.5rem) var(--nxt1-spacing-5, 1.25rem);
      }

      .qr-card {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 240px;
        height: 240px;
        padding: var(--nxt1-spacing-4, 1rem);
        border-radius: var(--nxt1-borderRadius-2xl, 1.5rem);
        background: #ffffff;
        box-shadow:
          0 2px 8px rgba(0, 0, 0, 0.08),
          0 8px 24px rgba(0, 0, 0, 0.06);
      }

      .qr-canvas {
        width: 100% !important;
        height: 100% !important;
        border-radius: var(--nxt1-borderRadius-lg, 0.75rem);
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        image-rendering: crisp-edges;
      }

      .qr-watermark {
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

      .qr-hint {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        font-weight: var(--nxt1-fontWeight-regular, 400);
      }

      /* ─── Skeleton ─── */
      .qr-skeleton {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .qr-skeleton-pulse {
        width: 75%;
        height: 75%;
        border-radius: var(--nxt1-borderRadius-md, 0.5rem);
        background: linear-gradient(
          110deg,
          rgba(0, 0, 0, 0.04) 30%,
          rgba(0, 0, 0, 0.02) 50%,
          rgba(0, 0, 0, 0.04) 70%
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

      /* ─── Error ─── */
      .qr-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-align: center;
      }

      .qr-error p {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
      }

      .qr-retry {
        border: none;
        background: none;
        color: var(--nxt1-color-primary, #ccff00);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        cursor: pointer;
        padding: var(--nxt1-spacing-1, 0.25rem) var(--nxt1-spacing-2, 0.5rem);
      }

      /* ─── Action Buttons ─── */
      .qr-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        padding: var(--nxt1-spacing-4, 1rem) var(--nxt1-spacing-5, 1.25rem);
        padding-bottom: calc(var(--nxt1-spacing-5, 1.25rem) + env(safe-area-inset-bottom, 0px));
      }

      .qr-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2, 0.5rem);
        flex: 1;
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: var(--nxt1-borderRadius-xl, 1rem);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #fff);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: var(--nxt1-fontWeight-medium, 500);
        cursor: pointer;
        transition: all 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .qr-btn:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }

      .qr-btn:active {
        transform: scale(0.97);
      }

      /* ─── Accessibility ─── */
      @media (prefers-reduced-motion: reduce) {
        .qr-skeleton-pulse {
          animation: none;
        }
        .qr-btn:active {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtQrCodeMobileComponent {
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('QrCodeMobile');
  private readonly platformId = inject(PLATFORM_ID);

  private readonly qrCanvas = viewChild<ElementRef<HTMLCanvasElement>>('qrCanvas');

  @Input() url = '';
  @Input() displayName = '';
  @Input() entityType: 'profile' | 'team' = 'profile';

  readonly close = output<void>();
  readonly action = output<'share' | 'download'>();

  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  constructor() {
    afterNextRender(() => {
      this.generateQrCode();
    });
  }

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
      const QRCodeModule = await import('qrcode');
      const QRCode = QRCodeModule.default || QRCodeModule;

      this.loading.set(false);

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const canvasRef = this.qrCanvas();
      if (!canvasRef?.nativeElement) {
        this.logger.warn('QR canvas element not found');
        this.error.set(true);
        return;
      }

      const canvas = canvasRef.nativeElement;
      const options = {
        width: 240,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
        errorCorrectionLevel: 'H' as const,
      };

      const dataUrl = await QRCode.toDataURL(this.url, options);
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = 240;
          canvas.height = 240;
          ctx.drawImage(img, 0, 0, 240, 240);
          this.logger.info('QR code generated', { url: this.url });
        }
      };
      img.onerror = () => {
        this.logger.error('Failed to load QR code image');
        this.error.set(true);
      };
      img.src = dataUrl;
    } catch (err) {
      this.logger.error('Failed to generate QR code', err);
      this.error.set(true);
      this.loading.set(false);
    }
  }

  async onShare(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const entityLabel = this.entityType === 'team' ? 'team' : 'profile';
    const shareData: ShareData = {
      title: `${this.displayName} — NXT1 ${this.entityType === 'team' ? 'Team' : 'Profile'}`,
      text: `Check out ${this.displayName}'s ${entityLabel} on NXT1`,
      url: this.url,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        this.action.emit('share');
      } else {
        await this.fallbackCopy();
      }
    } catch (err) {
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

  private async fallbackCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url);
      this.toast.success('Link copied');
    } catch {
      this.logger.warn('Clipboard fallback failed');
    }
  }
}
