/**
 * @fileoverview Agent X Floating Action Button (FAB)
 * @module @nxt1/ui/agent-x/fab
 * @version 1.0.0
 *
 * Enterprise-grade FAB component for Agent X chat widget.
 * Positioned fixed at bottom-right of the viewport.
 *
 * Features:
 * - Smooth entrance/exit animations
 * - Unread badge indicator
 * - Pulse animation on first load (attention-grab)
 * - Tooltip on hover
 * - SSR-safe (renders nothing on server)
 * - Keyboard accessible (Enter/Space to toggle)
 * - Respects reduced-motion preferences
 * - Theme-aware (light/dark mode)
 *
 * ⭐ WEB ONLY — SSR-safe, Zero Ionic ⭐
 *
 * @example
 * ```html
 * <nxt1-agent-x-fab />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  computed,
  PLATFORM_ID,
  afterNextRender,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NxtIconComponent } from '../../components/icon/icon.component';
import { AgentXFabService } from './agent-x-fab.service';
import { AgentXFabChatPanelComponent } from './agent-x-fab-chat-panel.component';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

@Component({
  selector: 'nxt1-agent-x-fab',
  standalone: true,
  imports: [NxtIconComponent, AgentXFabChatPanelComponent],
  template: `
    @if (isBrowser) {
      <!-- Chat Panel (expandable) -->
      @if (!fabService.isClosed()) {
        <nxt1-agent-x-fab-chat-panel />
      }

      <!-- Minimized Bar -->
      @if (fabService.isMinimized()) {
        <button
          type="button"
          class="minimized-bar"
          (click)="fabService.restore()"
          aria-label="Restore Agent X chat"
        >
          <div class="minimized-bar-content">
            <div class="minimized-bar-icon">
              <svg
                class="agent-x-logo-sm"
                viewBox="0 0 612 792"
                width="22"
                height="22"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="10"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentLogoPath" />
                <polygon [attr.points]="agentLogoPolygon" />
              </svg>
            </div>
            <span class="minimized-bar-title">Agent X</span>
            @if (fabService.hasUnread()) {
              <span class="minimized-badge">{{ fabService.unreadCount() }}</span>
            }
          </div>
          <div class="minimized-bar-actions">
            <button
              type="button"
              class="minimized-action-btn"
              (click)="onCloseFromMinimized($event)"
              aria-label="Close Agent X"
            >
              <nxt1-icon name="close" [size]="14" />
            </button>
          </div>
        </button>
      }

      <!-- FAB Button -->
      @if (fabService.fabVisible()) {
        <button
          type="button"
          class="fab-button"
          [class.entrance]="showEntrance()"
          [class.attention]="showAttention()"
          (click)="onFabClick()"
          aria-label="Chat with Agent X"
          aria-haspopup="dialog"
          [attr.aria-expanded]="fabService.isOpen()"
        >
          <!-- Glow ring -->
          <div class="fab-glow"></div>

          <!-- Agent X Logo Icon -->
          <div class="fab-icon">
            <svg
              class="agent-x-logo"
              viewBox="0 0 612 792"
              width="38"
              height="38"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="10"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path [attr.d]="agentLogoPath" />
              <polygon [attr.points]="agentLogoPolygon" />
            </svg>
          </div>

          <!-- Unread badge -->
          @if (fabService.hasUnread()) {
            <span class="fab-badge" aria-live="polite">
              {{ displayBadge() }}
            </span>
          }

          <!-- Tooltip -->
          <span class="fab-tooltip" role="tooltip"> Chat with Agent X </span>
        </button>
      }
    }
  `,
  styles: [
    `
      /* ============================================
         AGENT X FAB — 2026 Enterprise Design
         Glass morphism, spring animations, theme-aware
         ============================================ */

      :host {
        /* Global host — no layout, just a container for fixed-position children */
        display: contents;

        /* Theme tokens */
        --fab-size: 56px;
        --fab-offset-bottom: var(--nxt1-spacing-6, 24px);
        --fab-offset-right: var(--nxt1-spacing-6, 24px);
        --fab-bg: var(--nxt1-color-primary, #ccff00);
        --fab-color: var(--nxt1-color-text-on-primary, #0a0a0a);
        --fab-shadow: 0 4px 24px rgba(204, 255, 0, 0.25), 0 2px 8px rgba(0, 0, 0, 0.15);
        --fab-shadow-hover: 0 8px 32px rgba(204, 255, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.2);
        --fab-glow-color: var(--nxt1-ui-primary-glow, rgba(204, 255, 0, 0.15));
        --fab-error: var(--nxt1-ui-error, #ef4444);
        --fab-badge-text: #ffffff; /* Fixed contrast on error background */
        --fab-z: 9990;

        --minimized-bg: var(--nxt1-glass-bg, rgba(18, 18, 18, 0.92));
        --minimized-border: var(--nxt1-glass-border, rgba(255, 255, 255, 0.1));
        --minimized-text: var(--nxt1-color-text-primary, #ffffff);
        --minimized-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
      }

      /* Light mode overrides */
      :host-context(.light),
      :host-context([data-theme='light']) {
        --fab-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
        --fab-shadow-hover: 0 8px 32px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.12);
        --fab-glow-color: var(--nxt1-ui-primary-glow, rgba(204, 255, 0, 0.2));
        --minimized-bg: var(--nxt1-glass-bg, rgba(255, 255, 255, 0.92));
        --minimized-border: var(--nxt1-glass-border, rgba(0, 0, 0, 0.1));
        --minimized-text: var(--nxt1-color-text-primary, #1a1a1a);
        --minimized-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
      }

      /* ── FAB Button ──────────────────────────── */

      .fab-button {
        position: fixed;
        bottom: var(--fab-offset-bottom);
        right: var(--fab-offset-right);
        z-index: var(--fab-z);
        width: var(--fab-size);
        height: var(--fab-size);
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        border: none;
        background: var(--fab-bg);
        color: var(--fab-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--fab-shadow);
        transition:
          transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
          box-shadow 0.25s ease;
        outline: none;
        -webkit-tap-highlight-color: transparent;
      }

      .fab-button:hover {
        transform: scale(1.08);
        box-shadow: var(--fab-shadow-hover);
      }

      .fab-button:active {
        transform: scale(0.95);
      }

      .fab-button:focus-visible {
        outline: 2px solid var(--nxt1-color-primary, #ccff00);
        outline-offset: 3px;
      }

      /* ── Entrance Animation ──────────────────── */

      .fab-button.entrance {
        animation: fabEntrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      @keyframes fabEntrance {
        0% {
          opacity: 0;
          transform: scale(0) translateY(20px);
        }
        50% {
          opacity: 1;
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      /* ── Attention Pulse (first visit) ──────── */

      .fab-button.attention .fab-glow {
        animation: fabPulse 2s ease-in-out 3;
      }

      @keyframes fabPulse {
        0%,
        100% {
          transform: scale(1);
          opacity: 0;
        }
        50% {
          transform: scale(1.6);
          opacity: 1;
        }
      }

      /* ── Glow Ring ───────────────────────────── */

      .fab-glow {
        position: absolute;
        inset: -4px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: var(--fab-glow-color);
        opacity: 0;
        pointer-events: none;
      }

      .fab-button:hover .fab-glow {
        opacity: 1;
        transition: opacity 0.3s ease;
      }

      /* ── Icon ─────────────────────────────────── */

      .fab-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        z-index: 1;
        transition: transform 0.2s ease;
      }

      .fab-button:hover .fab-icon {
        transform: rotate(-8deg);
      }

      /* ── Unread Badge ─────────────────────────── */

      .fab-badge {
        position: absolute;
        top: -2px;
        right: -2px;
        z-index: 2;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: var(--fab-error);
        color: var(--fab-badge-text);
        font-size: 11px;
        font-weight: 700;
        line-height: 20px;
        text-align: center;
        border: 2px solid var(--nxt1-color-bg-primary, #0a0a0a);
        animation: badgePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes badgePop {
        0% {
          transform: scale(0);
        }
        100% {
          transform: scale(1);
        }
      }

      /* ── Tooltip ──────────────────────────────── */

      .fab-tooltip {
        position: absolute;
        right: calc(100% + 12px);
        top: 50%;
        transform: translateY(-50%);
        white-space: nowrap;
        padding: 6px 12px;
        border-radius: var(--nxt1-ui-radius-default, 8px);
        background: var(--minimized-bg);
        color: var(--minimized-text);
        font-size: 13px;
        font-weight: 500;
        box-shadow: var(--minimized-shadow);
        border: 1px solid var(--minimized-border);
        backdrop-filter: saturate(180%) blur(20px);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        opacity: 0;
        pointer-events: none;
        transition:
          opacity 0.2s ease,
          transform 0.2s ease;
        transform: translateY(-50%) translateX(4px);
      }

      .fab-button:hover .fab-tooltip {
        opacity: 1;
        transform: translateY(-50%) translateX(0);
      }

      /* ── Minimized Bar ────────────────────────── */

      .minimized-bar {
        position: fixed;
        bottom: var(--fab-offset-bottom);
        right: var(--fab-offset-right);
        z-index: var(--fab-z);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2, 8px);
        padding: var(--nxt1-spacing-2, 8px) var(--nxt1-spacing-3, 12px);
        min-width: 200px;
        background: var(--minimized-bg);
        border: 1px solid var(--minimized-border);
        border-radius: var(--nxt1-ui-radius-xl, 16px);
        box-shadow: var(--minimized-shadow);
        backdrop-filter: saturate(180%) blur(20px);
        -webkit-backdrop-filter: saturate(180%) blur(20px);
        cursor: pointer;
        transition:
          background 0.2s ease,
          box-shadow 0.2s ease,
          transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        outline: none;
        animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      .minimized-bar:hover {
        transform: translateY(-2px);
        box-shadow: var(--nxt1-ui-shadow-xl, 0 6px 28px rgba(0, 0, 0, 0.35));
      }

      .minimized-bar:active {
        transform: scale(0.98);
      }

      @keyframes slideUp {
        0% {
          opacity: 0;
          transform: translateY(12px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .minimized-bar-content {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2, 8px);
      }

      .minimized-bar-icon {
        width: 28px;
        height: 28px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--fab-color);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .minimized-bar-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--minimized-text);
        letter-spacing: 0.01em;
      }

      .minimized-badge {
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        background: var(--fab-error);
        color: var(--fab-badge-text);
        font-size: 10px;
        font-weight: 700;
        line-height: 18px;
        text-align: center;
      }

      .minimized-bar-actions {
        display: flex;
        align-items: center;
      }

      .minimized-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: var(--nxt1-ui-radius-full, 9999px);
        border: none;
        background: transparent;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .minimized-action-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      /* ── Responsive ───────────────────────────── */

      @media (max-width: 480px) {
        :host {
          --fab-size: 52px;
          --fab-offset-bottom: var(--nxt1-spacing-4, 16px);
          --fab-offset-right: var(--nxt1-spacing-4, 16px);
        }

        .minimized-bar {
          bottom: var(--nxt1-spacing-4, 16px);
          right: var(--nxt1-spacing-4, 16px);
          min-width: 180px;
        }
      }

      /* ── Reduced Motion ───────────────────────── */

      @media (prefers-reduced-motion: reduce) {
        .fab-button,
        .fab-button.entrance,
        .minimized-bar {
          animation: none;
          transition: none;
        }

        .fab-button.attention .fab-glow {
          animation: none;
        }

        .fab-badge {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXFabComponent {
  protected readonly fabService = inject(AgentXFabService);
  private readonly platformId = inject(PLATFORM_ID);

  /** Whether we're in the browser (SSR guard) */
  protected readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Agent X logo SVG data */
  protected readonly agentLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentLogoPolygon = AGENT_X_LOGO_POLYGON;

  /** Show entrance animation on first render */
  protected readonly showEntrance = signal(false);

  /** Show attention pulse for first-time users */
  protected readonly showAttention = signal(false);

  /** Display badge text (caps at 9+) */
  protected readonly displayBadge = computed(() => {
    const count = this.fabService.unreadCount();
    return count > 9 ? '9+' : String(count);
  });

  constructor() {
    afterNextRender(() => {
      // Trigger entrance animation after a short delay
      setTimeout(() => {
        this.showEntrance.set(true);

        // If user hasn't interacted yet, show attention pulse
        if (!this.fabService.hasInteracted()) {
          this.showAttention.set(true);

          // Stop attention after animations complete
          setTimeout(() => {
            this.showAttention.set(false);
          }, 6500);
        }
      }, 800);
    });
  }

  /**
   * Handle FAB button click — open the chat panel.
   */
  protected onFabClick(): void {
    this.fabService.open();
    this.showAttention.set(false);
  }

  /**
   * Handle close from minimized bar (stop propagation to prevent restore).
   */
  protected onCloseFromMinimized(event: Event): void {
    event.stopPropagation();
    this.fabService.close();
  }
}
