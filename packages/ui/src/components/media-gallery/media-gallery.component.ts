/**
 * @fileoverview Media Gallery Component
 * @module @nxt1/ui/components/media-gallery
 * @version 1.0.0
 *
 * Horizontal-scrolling photo gallery with add/remove capability.
 * Used on edit-profile, create-post, and any screen that manages
 * a collection of user images.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NxtIconComponent } from '../icon';
import { HapticButtonDirective } from '../../services/haptics/haptic.directive';

@Component({
  selector: 'nxt1-media-gallery',
  standalone: true,
  imports: [NxtIconComponent, HapticButtonDirective],
  template: `
    <section class="nxt1-media-section">
      <div class="nxt1-media-row">
        @for (image of images(); track image; let i = $index) {
          <article class="nxt1-media-tile" [class.nxt1-media-tile--primary]="i === 0">
            <img [src]="image" [alt]="'Image ' + (i + 1)" class="nxt1-media-img" />
            @if (i === 0) {
              <span class="nxt1-media-primary-badge">Primary</span>
            }
            <button
              type="button"
              class="nxt1-media-remove"
              aria-label="Remove image"
              nxtHaptic="medium"
              (click)="remove.emit(i)"
            >
              <nxt1-icon name="trash" [size]="14" />
            </button>
          </article>
        }

        @if (images().length < maxImages()) {
          <button type="button" class="nxt1-media-add" (click)="add.emit()">
            <nxt1-icon name="image" [size]="16" />
            <span>{{ addLabel() }}</span>
          </button>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .nxt1-media-section {
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-3);
      }

      .nxt1-media-row {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: var(--nxt1-spacing-20);
        gap: var(--nxt1-spacing-2);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .nxt1-media-row::-webkit-scrollbar {
        display: none;
      }

      .nxt1-media-tile,
      .nxt1-media-add {
        position: relative;
        width: var(--nxt1-spacing-20);
        height: var(--nxt1-spacing-24);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
        /* overflow must NOT be hidden on tile — it clips the delete button */
      }

      .nxt1-media-tile--primary {
        border-color: var(--nxt1-color-border-primary);
      }

      .nxt1-media-img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
        border-radius: var(--nxt1-borderRadius-lg);
      }

      .nxt1-media-remove {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        position: absolute;
        top: var(--nxt1-spacing-1);
        right: var(--nxt1-spacing-1);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: var(--nxt1-borderRadius-full);
        background: rgba(220, 38, 38, 0.9);
        color: #fff;
        cursor: pointer;
        padding: 0;
        z-index: 2;
        -webkit-tap-highlight-color: transparent;
        opacity: 1;
        transition:
          opacity 150ms ease,
          transform 150ms ease,
          background 150ms ease;
      }

      /* Desktop (hover-capable): hide by default, show on tile hover */
      @media (hover: hover) {
        .nxt1-media-remove {
          opacity: 0;
        }

        .nxt1-media-tile:hover .nxt1-media-remove {
          opacity: 1;
        }
      }

      .nxt1-media-remove:hover {
        background: rgba(220, 38, 38, 1);
        transform: scale(1.1);
      }

      .nxt1-media-remove:active {
        transform: scale(0.92);
      }

      .nxt1-media-primary-badge {
        position: absolute;
        bottom: var(--nxt1-spacing-1-5);
        left: 50%;
        transform: translateX(-50%);
        z-index: 2;
        background: rgba(0, 0, 0, 0.65);
        color: #fff;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 9px;
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: var(--nxt1-borderRadius-full);
        white-space: nowrap;
        pointer-events: none;
      }

      .nxt1-media-add {
        appearance: none;
        -webkit-appearance: none;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-1-5);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        cursor: pointer;
        border-style: dashed;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
        transition: all var(--nxt1-duration-fast) var(--nxt1-easing-out);
      }

      .nxt1-media-add:hover {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-300);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMediaGalleryComponent {
  /** Array of image URLs to display. */
  readonly images = input.required<readonly string[]>();

  /** Maximum number of images allowed. */
  readonly maxImages = input(8);

  /** Label on the add-image button. */
  readonly addLabel = input('Add');

  /** Emitted when the add button is tapped. Parent handles file picking. */
  readonly add = output<void>();

  /** Emitted with the index of the image to remove. */
  readonly remove = output<number>();
}
