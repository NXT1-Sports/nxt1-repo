/**
 * @fileoverview Firecrawl Sign-In Modal — Interactive Browser Session
 * @module @nxt1/ui/components/connected-sources
 * @version 1.0.0
 *
 * Embeds the Firecrawl interactive live-view (remote browser) in a full-screen
 * overlay so the user can sign in to a third-party platform (Hudl, MaxPreps, X,
 * Instagram, etc.). The browser session is real — cookies, localStorage, and
 * IndexedDB state are captured by Firecrawl Persistent Profiles when the user
 * clicks "I'm Signed In".
 *
 * Rendered inside `NxtOverlayService.open()` — the `close` output is auto-wired
 * by the overlay service to dismiss and return the result.
 *
 * ⭐ WEB ONLY — Overlay-based component ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, signal, computed } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { NxtModalHeaderComponent } from '../overlay/modal-header.component';
import { NxtIconComponent } from '../icon/icon.component';

@Component({
  selector: 'nxt1-firecrawl-signin-modal',
  standalone: true,
  imports: [NxtModalHeaderComponent, NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nxt1-fc-signin">
      <nxt1-modal-header
        [title]="headerTitle()"
        closePosition="left"
        [showBorder]="true"
        (closeModal)="onCancel()"
      >
        <button
          modalHeaderAction
          type="button"
          class="nxt1-fc-done-btn"
          [class.nxt1-fc-done-btn--loading]="completing()"
          [disabled]="completing()"
          (click)="onComplete()"
        >
          @if (completing()) {
            Saving…
          } @else {
            I'm Signed In
          }
        </button>
      </nxt1-modal-header>

      <div class="nxt1-fc-body">
        @if (iframeLoading()) {
          <div class="nxt1-fc-loading">
            <div class="nxt1-fc-spinner"></div>
            <p class="nxt1-fc-loading-text">Launching secure browser for {{ platformLabel() }}…</p>
            <p class="nxt1-fc-loading-sub">This may take a few seconds</p>
          </div>
        }

        <iframe
          class="nxt1-fc-iframe"
          [class.nxt1-fc-iframe--visible]="!iframeLoading()"
          [src]="safeUrl()"
          allow="clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          title="Sign in to {{ platformLabel() }}"
          (load)="onIframeLoad()"
        ></iframe>
      </div>

      <div class="nxt1-fc-footer">
        <nxt1-icon name="shield-checkmark-outline" [size]="16" />
        <span>
          Secure session — your credentials are entered directly on
          {{ platformLabel() }}'s website. NXT1 never sees your password.
        </span>
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

      .nxt1-fc-signin {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .nxt1-fc-body {
        flex: 1;
        position: relative;
        overflow: hidden;
        min-height: 0;
      }

      /* ───── Loading State ───── */

      .nxt1-fc-loading {
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

      .nxt1-fc-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-top-color: var(--nxt1-color-primary, #ccff00);
        border-radius: 50%;
        animation: nxt1-fc-spin 0.8s linear infinite;
      }

      @keyframes nxt1-fc-spin {
        to {
          transform: rotate(360deg);
        }
      }

      .nxt1-fc-loading-text {
        font-size: 15px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #fff);
        text-align: center;
      }

      .nxt1-fc-loading-sub {
        font-size: 13px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.4));
        text-align: center;
      }

      /* ───── Iframe ───── */

      .nxt1-fc-iframe {
        width: 100%;
        height: 100%;
        border: none;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .nxt1-fc-iframe--visible {
        opacity: 1;
      }

      /* ───── Footer Security Notice ───── */

      .nxt1-fc-footer {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-top: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        font-size: 12px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.6));
        line-height: 1.4;
      }

      .nxt1-fc-footer nxt1-icon {
        flex-shrink: 0;
        color: var(--nxt1-color-success, #10b981);
      }

      /* ───── Done Button ───── */

      .nxt1-fc-done-btn {
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

      .nxt1-fc-done-btn:hover:not(:disabled) {
        opacity: 0.9;
      }

      .nxt1-fc-done-btn:active:not(:disabled) {
        transform: scale(0.97);
      }

      .nxt1-fc-done-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .nxt1-fc-done-btn:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 2px;
      }

      .nxt1-fc-done-btn--loading {
        min-width: 90px;
      }
    `,
  ],
})
export class FirecrawlSignInModalComponent {
  private readonly sanitizer = inject(DomSanitizer);

  // ─── Inputs (set by NxtOverlayService via setInput) ───────────────

  readonly platformLabel = input.required<string>();
  readonly interactiveLiveViewUrl = input.required<string>();

  // ─── Output (auto-wired by overlay service for dismissal) ──────────

  readonly close = output<{ completed: boolean }>();

  // ─── Internal State ───────────────────────────────────────────────

  protected readonly iframeLoading = signal(true);
  protected readonly completing = signal(false);

  // ─── Constants ──────────────────────────────────────────────────────

  /** Only allow URLs from Firecrawl's live view domain. */
  private static readonly ALLOWED_ORIGINS = ['https://liveview.firecrawl.dev'] as const;

  // ─── Derived ──────────────────────────────────────────────────────

  protected readonly headerTitle = computed(() => `Sign in to ${this.platformLabel()}`);

  protected readonly safeUrl = computed<SafeResourceUrl>(() => {
    const url = this.interactiveLiveViewUrl();

    // Security: Only trust URLs from Firecrawl's known domain
    const isAllowed = FirecrawlSignInModalComponent.ALLOWED_ORIGINS.some((origin) =>
      url.startsWith(origin)
    );
    if (!isAllowed) {
      return this.sanitizer.bypassSecurityTrustResourceUrl('about:blank');
    }

    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  // ─── Handlers ─────────────────────────────────────────────────────

  protected onIframeLoad(): void {
    this.iframeLoading.set(false);
  }

  protected onComplete(): void {
    this.completing.set(true);
    this.close.emit({ completed: true });
  }

  protected onCancel(): void {
    this.close.emit({ completed: false });
  }
}
