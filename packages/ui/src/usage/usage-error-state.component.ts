import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../components/icon';

@Component({
  selector: 'nxt1-usage-error-state',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <section class="usage-error-state" aria-label="Error">
      <div class="usage-error-state__icon">
        <nxt1-icon name="alert-circle-outline" size="36" />
      </div>
      <h3 class="usage-error-state__title">Something went wrong</h3>
      <p class="usage-error-state__message">{{ message() }}</p>
      <button type="button" class="usage-error-state__action" (click)="retry.emit()">
        <nxt1-icon name="refresh-outline" size="18" />
        <span>Try Again</span>
      </button>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .usage-error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
      }

      .usage-error-state__icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--nxt1-color-errorBg, rgba(239, 68, 68, 0.1));
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 20px;
      }

      .usage-error-state__icon nxt1-icon {
        color: var(--nxt1-color-error, #ef4444);
      }

      .usage-error-state__title {
        font-size: 18px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        margin: 0 0 8px;
      }

      .usage-error-state__message {
        font-size: 14px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        margin: 0 0 20px;
        max-width: 280px;
      }

      .usage-error-state__action {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 24px;
        border-radius: 20px;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border: 1px solid var(--nxt1-color-border-primary, rgba(204, 255, 0, 0.3));
        color: var(--nxt1-color-text-primary, #ffffff);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.15s ease;
      }

      .usage-error-state__action:hover {
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1));
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsageErrorStateComponent {
  readonly message = input('Failed to load usage data');
  readonly retry = output<void>();
}
