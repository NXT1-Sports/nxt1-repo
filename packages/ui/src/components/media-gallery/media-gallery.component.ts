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

@Component({
  selector: 'nxt1-media-gallery',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <section class="nxt1-media-section">
      <div class="nxt1-media-row">
        @for (image of images(); track image; let i = $index) {
          <article class="nxt1-media-tile" [class.nxt1-media-tile--primary]="i === 0">
            <img [src]="image" [alt]="'Image ' + (i + 1)" class="nxt1-media-img" />
            <button
              type="button"
              class="nxt1-media-remove"
              aria-label="Remove image"
              (click)="remove.emit(i)"
            >
              <nxt1-icon name="trash" [size]="12" />
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
        overflow: hidden;
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
      }

      .nxt1-media-tile--primary {
        border-color: var(--nxt1-color-border-primary);
      }

      .nxt1-media-img {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
      }

      .nxt1-media-remove {
        appearance: none;
        -webkit-appearance: none;
        border: none;
        position: absolute;
        top: var(--nxt1-spacing-1-5);
        right: var(--nxt1-spacing-1-5);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-5);
        height: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-bg-overlay);
        color: var(--nxt1-color-text-primary);
        cursor: pointer;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .nxt1-media-add {
        appearance: none;
        -webkit-appearance: none;
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
