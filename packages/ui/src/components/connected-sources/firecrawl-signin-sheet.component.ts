/**
 * @fileoverview Firecrawl Sign-In Sheet — Bottom Sheet for Mobile
 * @module @nxt1/ui/components/connected-sources
 * @version 1.0.0
 *
 * Bottom-sheet variant of the Firecrawl interactive sign-in flow.
 * Uses Ionic ModalController for dismissal (required by NxtBottomSheetService.openSheet()).
 *
 * Rendered inside `NxtBottomSheetService.openSheet()` with FULL preset so the
 * iframe has maximum space. Uses the same allowed-origin security check as the
 * overlay variant.
 *
 * ⭐ MOBILE / SMALL VIEWPORT ONLY ⭐
 */

import { Component, ChangeDetectionStrategy, Input, inject, signal, computed } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { ModalController } from '@ionic/angular/standalone';
import { NxtSheetHeaderComponent } from '../bottom-sheet/sheet-header.component';
import { NxtIconComponent } from '../icon/icon.component';

@Component({
  selector: 'nxt1-firecrawl-signin-sheet',
  standalone: true,
  imports: [NxtSheetHeaderComponent, NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nxt1-sheet-header
      [title]="headerTitle()"
      closePosition="left"
      [showBorder]="true"
      (closeSheet)="onCancel()"
    >
      <button
        sheetHeaderAction
        type="button"
        class="nxt1-fcs-done-btn"
        [class.nxt1-fcs-done-btn--loading]="completing()"
        [disabled]="completing()"
        (click)="onComplete()"
      >
        @if (completing()) {
          Saving…
        } @else {
          I'm Signed In
        }
      </button>
    </nxt1-sheet-header>

    <div class="nxt1-fcs-body">
      @if (iframeLoading()) {
        <div class="nxt1-fcs-loading">
          <div class="nxt1-fcs-spinner"></div>
          <p class="nxt1-fcs-loading-text">Launching secure browser for {{ _platformLabel }}…</p>
          <p class="nxt1-fcs-loading-sub">
            Sign in so Agent X can sync your latest stats, film, and achievements to go to work for
            you.
          </p>
        </div>
      }

      @if (safeUrl(); as trustedUrl) {
        <iframe
          class="nxt1-fcs-iframe"
          [class.nxt1-fcs-iframe--visible]="!iframeLoading()"
          [src]="trustedUrl"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          [title]="'Sign in to ' + _platformLabel"
          (load)="onIframeLoad()"
        ></iframe>
      }
    </div>

    <div class="nxt1-fcs-footer">
      <nxt1-icon name="shield-checkmark-outline" [size]="16" />
      <span>
        Secure session — your credentials are entered directly on
        {{ _platformLabel }}'s website. NXT1 never sees your password.
      </span>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      .nxt1-fcs-body {
        flex: 1;
        position: relative;
        overflow: hidden;
        min-height: 0;
      }

      /* ───── Loading State ───── */

      .nxt1-fcs-loading {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        z-index: 1;
        background: var(--nxt1-color-surface-100, #1a1a2e);
      }

      .nxt1-fcs-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-top-color: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        animation: nxt1-fcs-spin 0.8s linear infinite;
      }

      @keyframes nxt1-fcs-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .nxt1-fcs-loading-text {
        font-size: 15px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        text-align: center;
        margin: 0;
      }

      .nxt1-fcs-loading-sub {
        font-size: 13px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        text-align: center;
        margin: 0;
      }

      /* ───── Iframe ───── */

      .nxt1-fcs-iframe {
        width: 100%;
        height: 100%;
        border: none;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .nxt1-fcs-iframe--visible {
        opacity: 1;
      }

      /* ───── Footer Security Notice ───── */

      .nxt1-fcs-footer {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        line-height: 1.4;
      }

      .nxt1-fcs-footer nxt1-icon {
        flex-shrink: 0;
        color: var(--nxt1-color-success, #10b981);
      }

      /* ───── Done Button ───── */

      .nxt1-fcs-done-btn {
        appearance: none;
        -webkit-appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 32px;
        padding: 0 var(--nxt1-spacing-4, 16px);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-family: var(--nxt1-fontFamily-brand, system-ui, sans-serif);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        cursor: pointer;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0a0a0a);
        -webkit-tap-highlight-color: transparent;
        transition:
          opacity 0.15s ease,
          transform 0.15s ease;
        white-space: nowrap;
      }

      .nxt1-fcs-done-btn:active:not(:disabled) {
        transform: scale(0.97);
      }

      .nxt1-fcs-done-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .nxt1-fcs-done-btn--loading {
        min-width: 90px;
      }
    `,
  ],
})
export class FirecrawlSignInSheetComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly modalCtrl = inject(ModalController);

  // ─── Inputs (set via componentProps from NxtBottomSheetService.openSheet) ──

  /** Use @Input() (not signal inputs) — required by Ionic's componentProps binding. */
  @Input() _platformLabel = '';
  @Input() _interactiveLiveViewUrl = '';

  // ─── Internal State ───────────────────────────────────────────────

  protected readonly iframeLoading = signal(true);
  protected readonly completing = signal(false);

  /** Only allow URLs from Firecrawl's live view domain. */
  private static readonly ALLOWED_ORIGINS = ['https://liveview.firecrawl.dev'] as const;

  // ─── Derived ──────────────────────────────────────────────────────

  protected readonly headerTitle = computed(() => `Sign in to ${this._platformLabel}`);

  protected readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const url = this._interactiveLiveViewUrl;
    if (!url) return null;

    const isAllowed = FirecrawlSignInSheetComponent.ALLOWED_ORIGINS.some((origin) =>
      url.startsWith(origin)
    );
    if (!isAllowed) {
      return null;
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  // ─── Handlers ─────────────────────────────────────────────────────

  protected onIframeLoad(): void {
    this.iframeLoading.set(false);
  }

  protected onComplete(): void {
    this.completing.set(true);
    void this.modalCtrl.dismiss({ completed: true }, 'complete');
  }

  protected onCancel(): void {
    void this.modalCtrl.dismiss({ completed: false }, 'cancel');
  }
}
