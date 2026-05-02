import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

export interface PauseResumeEvent {
  readonly operationId: string;
}

@Component({
  selector: 'nxt1-agent-x-paused-card',
  standalone: true,
  template: `
    <div class="paused-card" role="status" aria-live="polite">
      <div class="paused-card__header">
        <span class="paused-card__title">Operation Paused</span>
      </div>

      <p class="paused-card__message">{{ message() }}</p>

      <div class="paused-card__actions">
        <button type="button" class="paused-card__resume-btn" (click)="onResume()">Resume</button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        max-width: 100%;
      }

      .paused-card {
        border: 1px solid color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 55%, transparent);
        border-radius: 12px;
        overflow: hidden;
        margin-top: 8px;
        width: 100%;
        max-width: 100%;
        box-sizing: border-box;
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 8%, transparent);
      }

      .paused-card__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 12px;
        background: color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 12%, transparent);
        border-bottom: 1px solid
          color-mix(in srgb, var(--nxt1-color-primary, #ccff00) 45%, transparent);
      }

      .paused-card__title {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .paused-card__message {
        margin: 0;
        padding: 12px;
        font-size: 0.875rem;
        line-height: 1.55;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.78));
      }

      .paused-card__actions {
        display: flex;
        justify-content: flex-end;
        padding: 0 12px 12px;
      }

      .paused-card__resume-btn {
        border: 1px solid var(--nxt1-color-primary, #ccff00);
        border-radius: 999px;
        padding: 7px 14px;
        font-size: 0.8125rem;
        font-weight: 600;
        background: var(--nxt1-color-primary, #ccff00);
        color: var(--nxt1-color-text-onPrimary, #0b0b0b);
        cursor: pointer;
        transition:
          transform 0.12s ease,
          filter 0.12s ease;
      }

      .paused-card__resume-btn:hover {
        filter: brightness(1.05);
      }

      .paused-card__resume-btn:active {
        transform: translateY(1px);
      }

      :host-context(.light) .paused-card__message,
      :host-context([data-theme='light']) .paused-card__message,
      :host-context([data-base-theme='light']) .paused-card__message {
        color: var(--nxt1-color-text-secondary, rgba(0, 0, 0, 0.64));
      }

      :host-context(.light) .paused-card__title,
      :host-context([data-theme='light']) .paused-card__title,
      :host-context([data-base-theme='light']) .paused-card__title {
        color: var(--nxt1-color-text-primary, #121212);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXPausedCardComponent {
  readonly operationId = input.required<string>();
  readonly message = input('Operation paused. Resume whenever you are ready.');

  readonly resumeRequested = output<PauseResumeEvent>();

  protected onResume(): void {
    this.resumeRequested.emit({ operationId: this.operationId() });
  }
}
