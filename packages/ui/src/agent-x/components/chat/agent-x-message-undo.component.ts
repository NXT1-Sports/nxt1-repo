import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  input,
  output,
  signal,
  inject,
} from '@angular/core';
import { AGENT_X_MESSAGE_UNDO_TEST_IDS } from '@nxt1/core/testing';

@Component({
  selector: 'nxt1-agent-x-message-undo',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="undo-banner" [attr.data-testid]="testIds.BANNER">
        <span>Message deleted.</span>
        <button
          type="button"
          class="undo-banner__btn"
          [attr.data-testid]="testIds.BTN_UNDO"
          (click)="undo.emit()"
        >
          Undo
        </button>
        <span class="undo-banner__timer" [attr.data-testid]="testIds.TIMER"
          >{{ remainingSeconds() }}s</span
        >
      </div>
    }
  `,
  styles: [
    `
      .undo-banner {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        bottom: calc(100% + 8px);
        z-index: 35;
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid var(--op-border, rgba(255, 255, 255, 0.12));
        border-radius: 999px;
        background: var(--op-panel-bg, #121312);
        padding: 8px 12px;
        font-size: 12px;
      }

      .undo-banner__btn {
        border: 0;
        background: transparent;
        color: var(--op-primary, #ccff00);
        cursor: pointer;
        font-weight: 600;
      }

      .undo-banner__timer {
        color: var(--op-text-muted, rgba(255, 255, 255, 0.65));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXMessageUndoComponent {
  protected readonly testIds = AGENT_X_MESSAGE_UNDO_TEST_IDS;

  private readonly destroyRef = inject(DestroyRef);
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly visible = input(false);
  readonly triggerId = input(0);
  readonly durationSeconds = input(10);

  readonly undo = output<void>();
  readonly expired = output<void>();

  readonly remainingSeconds = signal(10);

  constructor() {
    effect(() => {
      const visible = this.visible();
      const triggerId = this.triggerId();
      const duration = this.durationSeconds();
      void triggerId;

      this.stopTimer();

      if (!visible) return;

      this.remainingSeconds.set(duration);
      this.timer = setInterval(() => {
        const next = this.remainingSeconds() - 1;
        this.remainingSeconds.set(next);
        if (next <= 0) {
          this.stopTimer();
          this.expired.emit();
        }
      }, 1000);
    });

    this.destroyRef.onDestroy(() => {
      this.stopTimer();
    });
  }

  private stopTimer(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}
