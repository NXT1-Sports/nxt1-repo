/**
 * @fileoverview List Row Component
 * @module @nxt1/ui/components/list-row
 * @version 1.0.0
 *
 * Native iOS-style list row for settings/edit screens.
 * Presents label (with optional verified pill) on the left,
 * value text + chevron on the right. Emits tap for the parent to handle.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxtIconComponent } from '../icon';
import { NxtVerifiedPillComponent } from '../verified-pill';

@Component({
  selector: 'nxt1-list-row',
  standalone: true,
  imports: [NxtIconComponent, NxtVerifiedPillComponent],
  template: `
    <button type="button" class="nxt1-list-row" (click)="tap.emit()">
      <div class="nxt1-list-label-group">
        <span class="nxt1-list-label">{{ label() }}</span>
        @if (verified()) {
          <nxt1-verified-pill />
        }
      </div>
      <div class="nxt1-list-right">
        <ng-content />
        <nxt1-icon name="chevronForward" [size]="14" />
      </div>
    </button>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .nxt1-list-row {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        width: 100%;
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-1);
        font-family: var(--nxt1-fontFamily-brand);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        text-align: left;
      }

      :host:not(:last-child) .nxt1-list-row {
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .nxt1-list-label-group {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        flex-shrink: 0;
      }

      .nxt1-list-label {
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        color: var(--nxt1-color-text-primary);
        flex-shrink: 0;
      }

      .nxt1-list-right {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1-5);
        min-width: 0;
        justify-content: flex-end;
        flex: 1;
      }

      .nxt1-list-right nxt1-icon {
        flex-shrink: 0;
        color: var(--nxt1-color-text-tertiary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtListRowComponent {
  /** Row label displayed on the left side. */
  readonly label = input.required<string>();

  /** Whether to show a verified pill next to the label. */
  readonly verified = input(false);

  /** Emitted when the row is tapped. */
  readonly tap = output<void>();
}
