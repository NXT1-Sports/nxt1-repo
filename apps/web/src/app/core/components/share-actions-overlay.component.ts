/**
 * @fileoverview ShareActionsOverlayComponent — Centered web overlay for share/copy/QR actions
 * @module @nxt1/web/core/components
 *
 * Content component opened via NxtOverlayService on web (desktop + mobile web).
 * Emits `close` with the selected action label so the overlay service dismisses
 * automatically and the caller can route to the correct handler.
 *
 * ⭐ WEB ONLY — NxtOverlayService is web-only ⭐
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { NxtModalHeaderComponent } from '@nxt1/ui/components/overlay';
import { NxtIconComponent } from '@nxt1/ui/components/icon';

export interface ShareAction {
  readonly label: string;
  readonly icon: string;
  readonly destructive?: boolean;
}

@Component({
  selector: 'app-share-actions-overlay',
  standalone: true,
  imports: [NxtModalHeaderComponent, NxtIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="share-overlay">
      <nxt1-modal-header
        [title]="title()"
        closePosition="right"
        [showBorder]="true"
        (closeModal)="close.emit(null)"
      />

      <ul class="share-overlay__list" role="menu">
        @for (action of actions(); track action.label) {
          <li role="none">
            <button
              type="button"
              class="share-overlay__item"
              [class.share-overlay__item--destructive]="action.destructive"
              role="menuitem"
              (click)="close.emit({ action: action.label })"
            >
              <span class="share-overlay__item-icon">
                <nxt1-icon [name]="action.icon" [size]="20" />
              </span>
              <span class="share-overlay__item-label">{{ action.label }}</span>
            </button>
          </li>
        }
      </ul>
    </div>
  `,
  styles: [
    `
      .share-overlay {
        display: flex;
        flex-direction: column;
        background: var(--nxt1-ui-bg-elevated, #121212);
        border-radius: var(--nxt1-radius-xl, 16px);
        overflow: hidden;
      }

      .share-overlay__list {
        list-style: none;
        margin: 0;
        padding: var(--nxt1-spacing-2, 0.5rem);
      }

      .share-overlay__item {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 0.75rem);
        width: 100%;
        padding: var(--nxt1-spacing-3, 0.75rem) var(--nxt1-spacing-4, 1rem);
        background: transparent;
        border: none;
        border-radius: var(--nxt1-radius-lg, 10px);
        color: var(--nxt1-ui-text-primary, #fff);
        font-size: var(--nxt1-font-size-base, 0.9375rem);
        font-weight: 450;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .share-overlay__item:hover {
        background: var(--nxt1-ui-bg-hover, rgba(255, 255, 255, 0.06));
      }

      .share-overlay__item:active {
        background: var(--nxt1-ui-bg-active, rgba(255, 255, 255, 0.1));
      }

      .share-overlay__item--destructive {
        color: var(--nxt1-color-danger, #ff453a);
      }

      .share-overlay__item-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-md, 8px);
        background: var(--nxt1-ui-bg-elevated-2, rgba(255, 255, 255, 0.06));
        flex-shrink: 0;
      }

      .share-overlay__item--destructive .share-overlay__item-icon {
        background: rgba(255, 69, 58, 0.12);
      }

      .share-overlay__item-label {
        flex: 1;
      }
    `,
  ],
})
export class ShareActionsOverlayComponent {
  readonly title = input<string>('Options');
  readonly actions = input<ShareAction[]>([]);

  /** Emitting null = cancelled (header X). Emitting { action } = item selected. */
  readonly close = output<{ action: string } | null>();
}
