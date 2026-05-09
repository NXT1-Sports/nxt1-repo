import { Component, ChangeDetectionStrategy, input, computed } from '@angular/core';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

/**
 * Rich card shown in the chat timeline while a background (enqueued) Agent X
 * job is running. Shows a spinner + real Agent X logo while running, and
 * transitions to a stopped state when the user cancels/pauses.
 */
@Component({
  selector: 'nxt1-agent-x-enqueue-waiting-card',
  standalone: true,
  template: `
    <div
      class="eq-card"
      [class.eq-card--stopped]="isStopped()"
      role="status"
      aria-live="polite"
      [attr.aria-label]="isStopped() ? 'Agent X task stopped' : 'Agent X running in background'"
    >
      <div class="eq-card__inner">
        <!-- Icon wrap: spinner ring (running) or stopped ring (stopped) -->
        <div class="eq-card__icon-wrap">
          @if (!isStopped()) {
            <!-- Animated spinner ring -->
            <svg class="eq-card__ring" viewBox="0 0 44 44" aria-hidden="true">
              <circle class="eq-card__ring-track" cx="22" cy="22" r="18" />
              <circle class="eq-card__ring-fill" cx="22" cy="22" r="18" />
            </svg>
          } @else {
            <!-- Static stopped ring -->
            <svg
              class="eq-card__ring eq-card__ring--stopped"
              viewBox="0 0 44 44"
              aria-hidden="true"
            >
              <circle class="eq-card__ring-track" cx="22" cy="22" r="18" />
            </svg>
          }
          <!-- Real Agent X logo mark -->
          <svg class="eq-card__logo" viewBox="0 0 612 792" aria-hidden="true">
            <path [attr.d]="logoPath" />
            <polygon [attr.points]="logoPolygon" />
          </svg>
        </div>

        <!-- Text block -->
        <div class="eq-card__text">
          <span class="eq-card__title">{{ computedTitle() }}</span>
          <span class="eq-card__subtitle">{{ computedSubtitle() }}</span>
        </div>
      </div>

      <!-- Shimmer progress bar (hidden when stopped) -->
      @if (!isStopped()) {
        <div class="eq-card__progress" aria-hidden="true">
          <div class="eq-card__progress-bar"></div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        max-width: 100%;
      }

      /* ── Card shell ── */
      .eq-card {
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 40%, transparent);
        border-radius: 14px;
        overflow: hidden;
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 6%, transparent);
        margin-top: 4px;
      }

      .eq-card__inner {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 14px 16px 12px;
      }

      /* ── Icon + spinner ── */
      .eq-card__icon-wrap {
        position: relative;
        width: 44px;
        height: 44px;
        flex-shrink: 0;
      }

      .eq-card__ring {
        position: absolute;
        inset: 0;
        width: 44px;
        height: 44px;
        animation: eq-spin 2s linear infinite;
        transform-origin: center;
      }

      .eq-card__ring--stopped {
        animation: none;
      }

      .eq-card__ring-track {
        fill: none;
        stroke: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 18%, transparent);
        stroke-width: 2.5;
      }

      .eq-card__ring-fill {
        fill: none;
        stroke: var(--nxt1-color-primary, #ccff00);
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-dasharray: 72 42;
        opacity: 0.9;
      }

      @keyframes eq-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      /* Real Agent X logo mark — same viewBox/path as action cards */
      .eq-card__logo {
        position: absolute;
        inset: 0;
        margin: auto;
        width: 20px;
        height: 20px;
        fill: var(--nxt1-color-primary, #ccff00);
      }

      /* Stopped state: mute colours */
      .eq-card--stopped {
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.3)) 30%,
          transparent
        );
        background: color-mix(
          in srgb,
          var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.05)) 5%,
          transparent
        );
      }

      .eq-card--stopped .eq-card__ring-track {
        stroke: color-mix(
          in srgb,
          var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.3)) 30%,
          transparent
        );
      }

      .eq-card--stopped .eq-card__logo {
        fill: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.45));
      }

      .eq-card--stopped .eq-card__title {
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.65));
      }

      /* ── Text ── */
      .eq-card__text {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
      }

      .eq-card__title {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .eq-card__subtitle {
        font-size: 0.8125rem;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.62));
        line-height: 1.4;
      }

      /* ── Shimmer progress bar ── */
      .eq-card__progress {
        height: 2px;
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 14%, transparent);
        overflow: hidden;
      }

      .eq-card__progress-bar {
        height: 100%;
        width: 45%;
        background: linear-gradient(
          90deg,
          transparent 0%,
          var(--nxt1-color-primary, #ccff00) 50%,
          transparent 100%
        );
        animation: eq-shimmer 1.8s ease-in-out infinite;
      }

      @keyframes eq-shimmer {
        0% {
          transform: translateX(-200%);
        }
        100% {
          transform: translateX(400%);
        }
      }

      /* ── Light theme overrides ── */
      :host-context(.light) .eq-card__title,
      :host-context([data-theme='light']) .eq-card__title,
      :host-context([data-base-theme='light']) .eq-card__title {
        color: var(--nxt1-color-text-primary, #121212);
      }

      :host-context(.light) .eq-card__subtitle,
      :host-context([data-theme='light']) .eq-card__subtitle,
      :host-context([data-base-theme='light']) .eq-card__subtitle {
        color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.58));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXEnqueueWaitingCardComponent {
  readonly isStopped = input(false);
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);

  protected readonly logoPath = AGENT_X_LOGO_PATH;
  protected readonly logoPolygon = AGENT_X_LOGO_POLYGON;

  protected readonly computedTitle = computed(
    () => this.title() ?? (this.isStopped() ? 'Task stopped' : 'Running in the background')
  );

  protected readonly computedSubtitle = computed(
    () =>
      this.subtitle() ??
      (this.isStopped()
        ? 'This task was stopped before it completed.'
        : 'Will let you know when complete.')
  );
}
