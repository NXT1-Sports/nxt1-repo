import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'nxt1-agent-x-operation-chat-thinking',
  standalone: true,
  template: `
    <div class="thinking-block" [class.thinking-block--upload]="showUploadProgress">
      <div class="thinking-block__avatar">
        <svg class="thinking-block__spinner" viewBox="0 0 16 16" fill="none" width="16" height="16">
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            stroke-width="2"
            stroke-dasharray="28"
            stroke-dashoffset="8"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <div class="thinking-block__body">
        <div class="thinking-block__header">
          <span class="thinking-block__label">{{ displayLabel }}</span>
          @if (showUploadProgress && normalizedProgress > 0) {
            <span class="thinking-block__percent">{{ normalizedProgress }}%</span>
          }
        </div>

        @if (displayDetail; as detail) {
          <span class="thinking-block__detail">{{ detail }}</span>
        }

        @if (showUploadProgress) {
          <div
            class="thinking-block__progress"
            role="progressbar"
            aria-label="Video upload progress"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="normalizedProgress"
          >
            <span
              class="thinking-block__progress-fill"
              [style.transform]="'scaleX(' + progressScale + ')'"
              [style.transition]="progressTransition"
            ></span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        --thinking-upload-border: color-mix(in srgb, var(--op-primary) 18%, var(--op-border) 82%);
        --thinking-upload-surface-top: color-mix(
          in srgb,
          var(--op-primary-glow) 62%,
          var(--op-surface) 38%
        );
        --thinking-upload-surface-bottom: color-mix(
          in srgb,
          var(--op-surface) 76%,
          var(--op-glass-bg) 24%
        );
        --thinking-upload-pill-bg: color-mix(
          in srgb,
          var(--op-primary-glow) 78%,
          var(--op-surface) 22%
        );
        --thinking-upload-pill-text: var(--op-primary);
        --thinking-upload-track: color-mix(
          in srgb,
          var(--op-text-muted) 18%,
          var(--op-surface) 82%
        );
        --thinking-upload-fill-start: color-mix(in srgb, var(--op-primary) 54%, var(--op-text) 46%);
        --thinking-upload-fill-end: color-mix(in srgb, var(--op-primary) 82%, var(--op-text) 18%);
        --thinking-upload-sheen: color-mix(in srgb, var(--op-text) 26%, transparent);
      }

      .thinking-block {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 12px 16px;
        animation: fadeSlideIn 0.3s ease-out;
      }

      .thinking-block--upload {
        gap: 8px;
        width: min(100%, 296px);
        padding: 10px 12px;
        border: 1px solid var(--thinking-upload-border);
        border-radius: 16px;
        background: linear-gradient(
          180deg,
          var(--thinking-upload-surface-top),
          var(--thinking-upload-surface-bottom)
        );
        box-shadow: var(--nxt1-glass-shadow);
        backdrop-filter: blur(14px) saturate(150%);
        -webkit-backdrop-filter: blur(14px) saturate(150%);
      }

      .thinking-block__avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--op-primary);
        min-height: 16px;
      }

      .thinking-block__spinner {
        width: 14px;
        height: 14px;
        animation: thinkingSpin 1s linear infinite;
      }

      .thinking-block__body {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }

      .thinking-block__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
      }

      .thinking-block__label {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: -0.01em;
        min-width: 0;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--op-text-muted) 94%, transparent) 0%,
          color-mix(in srgb, var(--op-text) 96%, transparent) 50%,
          color-mix(in srgb, var(--op-text-muted) 94%, transparent) 100%
        );
        background-size: 200% auto;
        color: transparent;
        -webkit-background-clip: text;
        background-clip: text;
        animation: thinkingShimmer 2s linear infinite;
      }

      .thinking-block__percent {
        flex-shrink: 0;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--thinking-upload-pill-bg);
        color: var(--thinking-upload-pill-text);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.02em;
        transition:
          background-color 260ms ease,
          color 260ms ease,
          opacity 260ms ease;
      }

      .thinking-block__detail {
        color: var(--op-text-secondary);
        font-size: 10px;
        line-height: 1.35;
      }

      .thinking-block__progress {
        position: relative;
        overflow: hidden;
        width: 100%;
        height: 5px;
        border-radius: 999px;
        background: linear-gradient(
          90deg,
          var(--thinking-upload-track),
          color-mix(in srgb, var(--thinking-upload-track) 72%, var(--op-text-muted) 28%),
          var(--thinking-upload-track)
        );
      }

      .thinking-block__progress-fill {
        position: absolute;
        inset: 0;
        transform-origin: left center;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          var(--thinking-upload-fill-start) 0%,
          var(--op-primary) 45%,
          var(--thinking-upload-fill-end) 100%
        );
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--op-primary) 24%, transparent);
        transition: transform 520ms cubic-bezier(0.16, 1, 0.3, 1);
        will-change: transform;
      }

      .thinking-block__progress-fill::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--thinking-upload-sheen) 42%, transparent) 35%,
          color-mix(in srgb, var(--thinking-upload-sheen) 100%, transparent) 50%,
          color-mix(in srgb, var(--thinking-upload-sheen) 42%, transparent) 65%,
          transparent 100%
        );
        transform: translateX(-100%);
        animation: uploadProgressSheen 1.5s ease-in-out infinite;
      }

      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes thinkingSpin {
        to {
          transform: rotate(360deg);
        }
      }

      @keyframes thinkingShimmer {
        to {
          background-position: 200% center;
        }
      }

      @keyframes uploadProgressSheen {
        to {
          transform: translateX(100%);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .thinking-block__spinner {
          animation: none;
        }

        .thinking-block__label {
          animation: none;
          color: var(--op-text-secondary);
          background: none;
          -webkit-background-clip: unset;
          background-clip: unset;
        }

        .thinking-block__progress-fill,
        .thinking-block__progress-fill::after {
          animation: none;
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXOperationChatThinkingComponent {
  @Input() label: string | null = null;
  @Input() detail: string | null = null;

  private _progressPercent: number | null = null;
  private _normalizedProgress = 0;
  private _progressTransition = 'transform 520ms cubic-bezier(0.16, 1, 0.3, 1)';

  @Input()
  set progressPercent(value: number | null) {
    this._progressPercent = value;

    const nextProgress =
      value === null || Number.isNaN(value) ? 0 : Math.max(0, Math.min(100, Math.round(value)));
    const delta = Math.abs(nextProgress - this._normalizedProgress);
    const durationMs =
      delta >= 30 ? 760 : delta >= 18 ? 620 : delta >= 8 ? 500 : delta >= 3 ? 380 : 280;

    this._normalizedProgress = nextProgress;
    this._progressTransition = `transform ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  }

  get progressPercent(): number | null {
    return this._progressPercent;
  }

  protected get showUploadProgress(): boolean {
    return this.progressPercent !== null;
  }

  protected get normalizedProgress(): number {
    return this._normalizedProgress;
  }

  protected get progressScale(): string {
    return `${this.normalizedProgress / 100}`;
  }

  protected get progressTransition(): string {
    return this._progressTransition;
  }

  protected get displayDetail(): string | null {
    const value = this.detail?.trim();
    return value && value.length > 0 ? value : null;
  }

  protected get displayLabel(): string {
    const value = this.label?.trim();
    return value && value.length > 0 ? value : 'Agent X is thinking...';
  }
}
