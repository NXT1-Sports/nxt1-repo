/**
 * @fileoverview Brand Category Card — Shared Component
 * @module @nxt1/ui/brand
 * @version 1.0.0
 *
 * Individual category card for the Brand vault grid.
 * Displays icon, label, and short description in a compact card.
 * Uses design token SVG icons via NxtIconComponent.
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import type { BrandCategory } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { NxtIconComponent } from '../components/icon/icon.component';

@Component({
  selector: 'nxt1-brand-category-card',
  standalone: true,
  imports: [NxtIconComponent],
  template: `
    <button
      class="brand-card"
      [class.brand-card--wide]="wide()"
      [attr.data-testid]="testIds.CARD"
      [attr.data-category]="category().id"
      [disabled]="category().disabled"
      (click)="cardClick.emit(category())"
    >
      <div class="brand-card__icon-wrapper" [style.background]="category().accentColor + '1a'">
        <nxt1-icon [name]="category().icon" [size]="24" className="brand-card__icon" />
      </div>

      <div class="brand-card__text">
        <span class="brand-card__label">{{ category().label }}</span>
        <span class="brand-card__description">{{ category().description }}</span>
      </div>
    </button>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .brand-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        width: 100%;
        height: 100%;
        padding: 20px 12px 16px;
        background: var(--nxt1-color-bg-secondary, #141414);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.06));
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
        color: inherit;
        font-family: inherit;
        -webkit-tap-highlight-color: transparent;
        box-sizing: border-box;

        &:hover:not(:disabled) {
          background: var(--nxt1-color-bg-tertiary, #1a1a1a);
          border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.1));
          transform: translateY(-1px);
        }

        &:active:not(:disabled) {
          transform: scale(0.97);
        }

        &:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
      }

      /* Wide variant — horizontal layout for featured card */
      .brand-card--wide {
        flex-direction: row;
        text-align: left;
        padding: 16px 20px;
        gap: 14px;
      }

      .brand-card--wide .brand-card__text {
        align-items: flex-start;
      }

      .brand-card__icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        min-width: 48px;
        border-radius: 14px;
        transition: transform 0.2s ease;
      }

      .brand-card:hover .brand-card__icon-wrapper {
        transform: scale(1.05);
      }

      .brand-card__text {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .brand-card__label {
        font-size: 14px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.2;
      }

      .brand-card__description {
        font-size: 12px;
        font-weight: 400;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.5));
        line-height: 1.35;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandCategoryCardComponent {
  /** The category to display */
  readonly category = input.required<BrandCategory>();

  /** Full-width horizontal layout */
  readonly wide = input(false);

  /** Emitted when the card is clicked */
  readonly cardClick = output<BrandCategory>();

  protected readonly testIds = TEST_IDS.BRAND;
}
