/**
 * @fileoverview Brand Category Card Component
 * @module @nxt1/ui/brand
 * @version 1.0.0
 *
 * Displays a single brand category tile in the Brand Vault 2×2 grid.
 * Emits cardClick when tapped so the parent shell can open Agent X.
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import type { BrandCategory } from '@nxt1/core';
import { TEST_IDS } from '@nxt1/core/testing';

@Component({
  selector: 'nxt1-brand-category-card',
  standalone: true,
  imports: [IonIcon, IonRippleEffect],
  template: `
    <button
      class="brand-card ion-activatable"
      [attr.data-testid]="testIds.CARD"
      (click)="onClick()"
    >
      <ion-ripple-effect></ion-ripple-effect>
      <div class="brand-card__icon-wrap">
        <ion-icon [name]="category().icon" class="brand-card__icon" aria-hidden="true"></ion-icon>
      </div>
      <div class="brand-card__body">
        <span class="brand-card__label">{{ category().label }}</span>
        <span class="brand-card__desc">{{ category().description }}</span>
      </div>
    </button>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .brand-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
        width: 100%;
        padding: 16px;
        border-radius: 16px;
        background: var(--nxt1-color-surface-card, rgba(255, 255, 255, 0.07));
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        cursor: pointer;
        text-align: left;
        overflow: hidden;
        transition: opacity 0.15s ease;
      }

      .brand-card:active {
        opacity: 0.75;
      }

      .brand-card__icon-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: var(--nxt1-color-primary-subtle, rgba(99, 102, 241, 0.15));
      }

      .brand-card__icon {
        font-size: 20px;
        color: var(--nxt1-color-primary, #6366f1);
      }

      .brand-card__body {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .brand-card__label {
        font-size: 15px;
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.2;
      }

      .brand-card__desc {
        font-size: 12px;
        font-weight: 400;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.55));
        line-height: 1.4;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandCategoryCardComponent {
  /** Brand category data to display. */
  readonly category = input.required<BrandCategory>();

  /** Emitted when the card is tapped. */
  readonly cardClick = output<BrandCategory>();

  protected readonly testIds = TEST_IDS.BRAND;

  protected onClick(): void {
    this.cardClick.emit(this.category());
  }
}
